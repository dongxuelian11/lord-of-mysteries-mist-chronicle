// 能力规则评测：合法性矩阵、六级结果、位阶、反制、信息/准备、幂等、叙事、记忆接入。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runAbilityEval() {
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const definitions = abilities.abilityDefinitions();
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const actor = { ...abilities.DEFAULT_EXTRAORDINARY_STATE, pathwayId: "seer", sequence: 9, internalRank: 1, spirituality: 18 };
  const baseIntent = (overrides = {}) => ({
    actionId: "act-1",
    actorId: "player",
    objective: "观察目标",
    requestedAbilityIds: ["spirit-vision"],
    targetRefs: [],
    method: "观察",
    preparationRefs: ["sight-confirmed"],
    mediumRefs: [],
    materialRefs: [],
    acceptableRisks: [],
    retreatConditions: [],
    ...overrides,
  });
  const resolve = (definitionId, options = {}) => {
    const definition = definitions.find((item) => item.id === definitionId);
    return abilities.resolveAbility({
      definition,
      actorState: options.actorState ?? actor,
      targetStates: options.targetStates ?? [{ id: "t", ...actor }],
      intent: options.intent ?? baseIntent(),
      seed: options.seed ?? "seed-1",
      environmentRefs: options.environmentRefs ?? [],
      activeCounterIds: options.activeCounterIds ?? [],
      environmentProtection: options.environmentProtection ?? 0,
      targetInjured: options.targetInjured ?? false,
      mastery: options.mastery ?? 1,
    });
  };

  // 1. 合法性矩阵
  const legalityCases = [
    { name: "normal", options: {}, allowed: true },
    { name: "not-owned", options: { actorState: { ...actor, pathwayId: "spectator" } }, allowed: false },
    { name: "no-spirit", options: { actorState: { ...actor, spirituality: 0 } }, allowed: false },
    { name: "no-concentration", options: { actorState: { ...actor, concentrationSlots: 0 } }, allowed: false },
    { name: "invalid-target-count", options: { intent: baseIntent(), targetStates: [] }, allowed: false },
    { name: "missing-medium", options: { definitionId: "paper-substitute", intent: baseIntent({ preparationRefs: [] }) }, allowed: false },
    { name: "incapacitated", options: { actorState: { ...actor, physicalCondition: 0 } }, allowed: false },
  ];
  for (const item of legalityCases) {
    const contract = resolve(item.options.definitionId ?? "spirit-vision", item.options);
    check(contract.legality.allowed === item.allowed, `legality:${item.name}`);
    if (!item.allowed) {
      check(contract.appliedEffects.length === 0, `legality-no-effects:${item.name}`);
    }
  }

  // 2. 六级结果（搜索抗性值构造每种结果，确定性）
  const levels = ["critical-success", "success", "partial-success", "fail-with-progress", "failure", "backlash"];
  for (const level of levels) {
    let found = false;
    for (let resistance = -10; resistance <= 32 && !found; resistance += 1) {
      // 全部抗性键同步扫描：marionette-touch 等能力族映射到 mental/control 键，
      // 只改 spiritual 无法覆盖其防御来源。
      const target = {
        ...actor,
        resistances: Object.fromEntries(
          Object.keys(actor.resistances).map((key) => [key, resistance])
        ),
      };
      const actorState =
        level === "backlash" ? { ...actor, sequence: 5, internalRank: 5 } : actor;
      const contract = resolve(level === "backlash" ? "marionette-touch" : "spirit-vision", {
        actorState,
        targetStates: [{ id: "t", ...target, internalRank: 1 }],
        intent:
          level === "backlash"
            ? baseIntent({ preparationRefs: ["knowledge:confirmed", "sight-confirmed"] })
            : baseIntent(),
      });
      if (contract.result === level) found = true;
    }
    check(found, `result:${level}`);
  }

  // 3. 位阶矩阵
  const rankCases = [
    { name: "same-rank", actorRank: 1, targetRank: 1, leverage: false, expectNotBlocked: true },
    { name: "adjacent", actorRank: 1, targetRank: 2, leverage: false, expectNotBlocked: true },
    { name: "low-two", actorRank: 1, targetRank: 3, leverage: false, expectNotBlocked: true },
    { name: "huge-no-leverage", actorRank: 1, targetRank: 7, leverage: false, expectBlocked: true },
    { name: "huge-with-leverage", actorRank: 1, targetRank: 7, leverage: true, expectNotBlocked: true },
  ];
  for (const item of rankCases) {
    const target = { ...actor, internalRank: item.targetRank, resistances: { ...actor.resistances, spiritual: 0 } };
    const contract = resolve("spirit-vision", {
      targetStates: [{ id: "t", ...target }],
      actorState: { ...actor, internalRank: item.actorRank },
      intent: baseIntent({ preparationRefs: item.leverage ? ["knowledge:true-name"] : ["sight-confirmed"] }),
    });
    if (item.expectBlocked) check(contract.result === "failure" && contract.blockedEffects.length > 0, `rank:${item.name}:blocked`);
    else check(contract.blockedEffects.length === 0 || contract.appliedEffects.length > 0, `rank:${item.name}:allowed`);
  }

  // 4. 反制：主动反制提高防御
  const withoutCounter = resolve("divination", { targetStates: [{ id: "t", ...actor }] });
  const withCounter = resolve("divination", {
    targetStates: [{ id: "t", ...actor }],
    activeCounterIds: ["counter-divination-resistance"],
  });
  check(withCounter.defenseBreakdown.activeCounters > withoutCounter.defenseBreakdown.activeCounters, "counter-active");

  // 5. 信息与准备：正确信息 > 无信息；准备去重
  const infoContract = resolve("divination", { intent: baseIntent({ preparationRefs: ["knowledge:confirmed", "knowledge:true-name"] }) });
  const noInfoContract = resolve("divination", { intent: baseIntent({ preparationRefs: ["sight-confirmed"] }) });
  check(infoContract.powerBreakdown.information > noInfoContract.powerBreakdown.information, "information-bonus");
  const dupPrep = resolve("divination", { intent: baseIntent({ preparationRefs: ["knowledge:confirmed", "knowledge:confirmed", "knowledge:confirmed"] }) });
  check(dupPrep.powerBreakdown.preparation === 0.2, "preparation-dedupe");

  // 6. 幂等：同一 resolutionId 应用两次只生效一次
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  let game = { ...gameModule.createInitialGame("seer"), prologueComplete: true, playerName: "会长", playerAddress: "会长阁下", spirituality: 18, mentalLoad: 0, stability: 71, abilityResolutions: [], memory: memoryModule.emptyMemoryState(), facts: [], abilityJournal: [], actingMarks: [], hiddenWorldFacts: [], worldKernel: { ...gameModule.createInitialGame("seer").worldKernel } };
  const contract = resolve("spirit-vision");
  const first = abilities.applyAbilityResolution(game, contract, "灵视");
  const second = abilities.applyAbilityResolution(first.game, contract, "灵视");
  check(first.applied === true && second.applied === false, "idempotent-apply");
  check(first.game.spirituality >= 0, "resource-non-negative");
  check(first.game.memory.events.some((event) => event.sourceEventId === first.worldEventId), "memory-event-derived");
  // 存档往返
  const roundtrip = JSON.parse(JSON.stringify(first.game));
  check(roundtrip.abilityResolutions.includes(contract.resolutionId), "save-roundtrip-ledger");
  const replay = abilities.applyAbilityResolution(roundtrip, contract, "灵视");
  check(replay.applied === false, "save-replay-idempotent");

  // 7. 叙事一致性
  const narrativeModule = abilities;
  const violations = narrativeModule.validateNarrative({ ...contract, result: "failure" }, "行动成功了，目标被完全控制。");
  check(violations.violations.length > 0, "narrative-failure-written-as-success");
  const good = narrativeModule.validateNarrative({ ...contract, result: "failure" }, "行动没有产生主要效果。");
  check(good.violations.length === 0, "narrative-ok");
  check(typeof narrativeModule.deterministicNarrative(contract, "灵视") === "string", "narrative-fallback");

  // 8. 自然语言等价
  const intentModule = abilities;
  const a = intentModule.parseAbilityIntent("用占卜看看失踪者在哪里", definitions, "player");
  const b = intentModule.parseAbilityIntent("借他的随身物品追查位置", definitions, "player");
  const c = intentModule.parseAbilityIntent("尝试通过神秘学联系寻找他", definitions, "player");
  check(a.requestedAbilityIds.includes("divination"), "nl-a-divination");
  check(b.requestedAbilityIds.includes("divination"), "nl-b-divination");
  check(c.requestedAbilityIds.includes("divination"), "nl-c-divination");
  check(intentModule.abilityIntentNeedsClarification({ ...a, requestedAbilityIds: [] }) === true, "nl-clarify-when-ambiguous");

  return { failures, definitions: definitions.length };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runAbilityEval();
  console.log("[ability:eval]");
  console.log(`  能力定义=${result.definitions}`);
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项：${result.failures.slice(0, 16).join("; ")}`);
  } else {
    console.log("  合法性、六级结果、位阶、反制、信息/准备、幂等、叙事、自然语言等价全部通过");
  }
  const pass = result.failures.length === 0;
  console.log(`[ability:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
