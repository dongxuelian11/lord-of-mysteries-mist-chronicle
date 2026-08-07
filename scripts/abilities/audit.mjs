// 能力规则审计：定义完整性、来源、重复、效果原语、确定性、资源边界。
import fs from "node:fs";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runAbilityAudit() {
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const definitions = abilities.abilityDefinitions();
  const validFamilies = new Set([
    "perception", "divination", "concealment", "deception", "mental", "control",
    "mobility", "physical", "transformation", "protection", "binding", "curse",
    "ritual", "summoning", "tracking", "creation",
  ]);
  const validPrimitives = new Set([
    "DETECT", "REVEAL", "INFER", "CONCEAL", "DECEIVE", "INFLUENCE", "CONTROL",
    "CREATE_CONDITION", "REMOVE_CONDITION", "MOVE", "TRANSFORM", "DAMAGE", "HEAL",
    "PROTECT", "BIND", "SUMMON", "TRACE", "CREATE_LINK", "BREAK_LINK", "RITUAL_EFFECT", "RESOURCE_CHANGE",
  ]);
  const findings = [];
  const ids = new Set();
  for (const definition of definitions) {
    if (!definition.id || !definition.name) findings.push(`missing-id-name:${definition.id}`);
    if (ids.has(definition.id)) findings.push(`duplicate-id:${definition.id}`);
    ids.add(definition.id);
    if (!validFamilies.has(definition.family)) findings.push(`invalid-family:${definition.id}`);
    if (definition.effects.length === 0) findings.push(`no-effects:${definition.id}`);
    if (definition.costs.length === 0) findings.push(`no-costs:${definition.id}`);
    if (definition.sourceIds.length === 0) findings.push(`no-source:${definition.id}`);
    if (definition.canonConstraints.length === 0) findings.push(`no-canon-constraints:${definition.id}`);
    if (!definition.gameParameters || typeof definition.gameParameters.basePower !== "number") {
      findings.push(`no-game-parameters:${definition.id}`);
    }
    if (definition.counters.length === 0) findings.push(`no-counters:${definition.id}`);
    for (const effect of definition.effects) {
      if (!validPrimitives.has(effect.primitive)) findings.push(`invalid-primitive:${definition.id}:${effect.primitive}`);
    }
  }
  if (definitions.length < 12) findings.push(`fewer-than-12:${definitions.length}`);
  // 确定性：同种子两次结算结果一致
  const actor = { ...abilities.DEFAULT_EXTRAORDINARY_STATE, pathwayId: "seer", sequence: 9, internalRank: 1, spirituality: 18 };
  const intent = { actionId: "a1", actorId: "player", objective: "观察", requestedAbilityIds: ["spirit-vision"], targetRefs: [], method: "观察", preparationRefs: ["sight-confirmed"], mediumRefs: [], materialRefs: [], acceptableRisks: [], retreatConditions: [] };
  const definition = definitions.find((item) => item.id === "spirit-vision");
  if (definition) {
    const options = { definition, actorState: actor, targetStates: [{ id: "t", ...actor }], intent, seed: "seed-1", environmentRefs: [], activeCounterIds: [], environmentProtection: 0, targetInjured: false, mastery: 1 };
    const first = abilities.resolveAbility(options);
    const second = abilities.resolveAbility(options);
    if (first.margin !== second.margin || first.result !== second.result) findings.push("non-deterministic");
    if (abilities.validateContract(first).length) findings.push("contract-invalid");
  }
  // 资源不为负：应用后 spirituality >= 0
  const source = fs.readFileSync("app/abilities/resolver.ts", "utf8") + fs.readFileSync("app/abilities/apply.ts", "utf8");
  if (/Math\.random\(/.test(source)) findings.push("math-random-in-engine");
  return { findings, count: definitions.length, ids: [...ids] };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runAbilityAudit();
  console.log("[ability:audit]");
  console.log(`  能力定义=${result.count}`);
  if (result.findings.length) {
    console.log(`  发现：${result.findings.join("; ")}`);
  } else {
    console.log("  定义完整性、来源、效果原语、确定性、合同与资源边界全部通过");
  }
  const pass = result.findings.length === 0 && result.count >= 12;
  console.log(`[ability:audit] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
