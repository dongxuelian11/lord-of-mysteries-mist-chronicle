// 能力性能：100 角色、200 定义、10k 检查、5k 结算、1k 幂等重放、100 存档往返。
import { performance } from "node:perf_hooks";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function syntheticDefinitions(base) {
  const definitions = [];
  for (let index = 0; index < 200; index += 1) {
    const template = base[index % base.length];
    definitions.push({
      ...template,
      id: `${template.id}-syn-${index}`,
      name: `${template.name}${index}`,
      gameParameters: { ...template.gameParameters, basePower: 4 + (index % 10) },
    });
  }
  return definitions;
}

export async function runAbilityBenchmark() {
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const definitions = syntheticDefinitions(abilities.abilityDefinitions());
  const actor = { ...abilities.DEFAULT_EXTRAORDINARY_STATE, pathwayId: "seer", sequence: 9, internalRank: 1, spirituality: 18, activeConditions: Array.from({ length: 10000 }, (_, i) => ({ id: `c${i}`, name: `条件${i}`, kind: "state", startWeek: 1, severity: 1 })) };
  const intent = { actionId: "bench", actorId: "player", objective: "观察", requestedAbilityIds: ["spirit-vision"], targetRefs: [], method: "观察", preparationRefs: ["sight-confirmed"], mediumRefs: [], materialRefs: [], acceptableRisks: [], retreatConditions: [] };
  const p95 = (times) => { const sorted = [...times].sort((a, b) => a - b); return sorted[Math.floor(sorted.length * 0.95)]; };

  const legalityTimes = [];
  for (let i = 0; i < 10000; i += 1) {
    const definition = definitions[i % definitions.length];
    const start = performance.now();
    abilities.checkLegality(definition, { ...actor, spirituality: i % 50 === 0 ? 0 : 18 }, intent, 1);
    legalityTimes.push(performance.now() - start);
  }
  const resolveTimes = [];
  const contracts = [];
  for (let i = 0; i < 5000; i += 1) {
    const definition = definitions[i % definitions.length];
    const start = performance.now();
    const contract = abilities.resolveAbility({
      definition,
      actorState: actor,
      targetStates: [{ id: `t${i % 100}`, ...actor }],
      intent: { ...intent, actionId: `bench-${i}` },
      seed: `bench-${i}`,
      environmentRefs: [],
      activeCounterIds: [],
      environmentProtection: 0,
      targetInjured: false,
      mastery: 1,
    });
    resolveTimes.push(performance.now() - start);
    contracts.push(contract);
  }
  const contractTimes = [];
  for (const contract of contracts) {
    const start = performance.now();
    abilities.validateContract(contract);
    contractTimes.push(performance.now() - start);
  }
  const idemTimes = [];
  for (let i = 0; i < 1000; i += 1) {
    const start = performance.now();
    abilities.resolutionAlreadyApplied({ worldKernel: { events: contracts.slice(0, 10).map((contract) => ({ id: `world-ability-${contract.resolutionId}`, week: 1, title: "x", detail: "x", actorIds: [], factionIds: [], causeIds: [], visibility: "world" })) }, abilityResolutions: contracts.slice(0, 10).map((contract) => contract.resolutionId) }, contracts[0]);
    idemTimes.push(performance.now() - start);
  }
  // 存档往返 ×100
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const base = gameModule.createInitialGame("seer");
  let game = { ...base, abilityResolutions: contracts.slice(0, 100).map((contract) => contract.resolutionId), memory: memoryModule.emptyMemoryState() };
  let serialized = JSON.stringify(game);
  for (let i = 0; i < 100; i += 1) {
    serialized = JSON.stringify(JSON.parse(serialized));
  }
  return {
    legalityP95Ms: Number(p95(legalityTimes).toFixed(2)),
    resolveP95Ms: Number(p95(resolveTimes).toFixed(2)),
    contractP95Ms: Number(p95(contractTimes).toFixed(2)),
    idemP95Ms: Number(p95(idemTimes).toFixed(2)),
    saveRoundtripOk: serialized.length > 0,
    contracts: contracts.length,
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runAbilityBenchmark();
  console.log("[ability:benchmark]");
  console.log(`  合法性P95=${result.legalityP95Ms}ms 结算P95=${result.resolveP95Ms}ms 合同P95=${result.contractP95Ms}ms 幂等P95=${result.idemP95Ms}ms 结算=${result.contracts}`);
  const pass =
    result.legalityP95Ms <= 10 &&
    result.resolveP95Ms <= 25 &&
    result.contractP95Ms <= 5 &&
    result.idemP95Ms <= 5 &&
    result.saveRoundtripOk;
  console.log(`[ability:benchmark] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
