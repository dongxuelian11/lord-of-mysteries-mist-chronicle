// 命运失控机制行为评测：四种交叉、硬门槛旁路、幂等、记忆、受众、兜底。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runFateEval() {
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const definitions = abilities.abilityDefinitions();
  const byId = (id) => definitions.find((item) => item.id === id);
  const baseActor = {
    ...abilities.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
  };
  const intent = (overrides = {}) => ({
    actionId: "eval-act",
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
  const resolveContract = (definitionId, options = {}) => abilities.resolveAbility({
    definition: byId(definitionId),
    actorState: options.actorState ?? baseActor,
    targetStates: options.targetStates ?? [{ id: "t", ...baseActor, resistances: { ...baseActor.resistances, spiritual: 0 } }],
    intent: options.intent ?? intent(),
    seed: options.seed ?? "fate-eval-seed",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  const resolveFate = (abilityContract, options = {}) => fate.resolveFateAberration({
    definition: byId(abilityContract.abilityId),
    actorState: options.actorState ?? baseActor,
    targetStates: options.targetStates ?? [{ id: "t", ...baseActor, resistances: { ...baseActor.resistances, spiritual: 0 } }],
    intent: options.intent ?? intent(),
    abilityContract,
    game: options.game ?? { week: 1, saveId: "eval-save", worldKernel: {}, fate: undefined },
    force: options.force,
  });

  // 1-4 四种交叉结果
  const successContract = resolveContract("spirit-vision");
  check(["critical-success", "success"].includes(successContract.result), "setup:success-contract");
  const failureContract = resolveContract("spirit-vision", {
    targetStates: [{ id: "t", ...baseActor, resistances: { ...baseActor.resistances, spiritual: 20 } }],
  });
  check(["failure", "fail-with-progress"].includes(failureContract.result), "setup:failure-contract");
  const successBoon = resolveFate(successContract, { force: { polarity: "boon", templateId: "fate-boon-bigger-secret" } });
  const successDisaster = resolveFate(successContract, { force: { polarity: "disaster", templateId: "fate-curse-seen-back" } });
  const failureBoon = resolveFate(failureContract, { force: { polarity: "boon" } });
  const failureDisaster = resolveFate(failureContract, { force: { polarity: "disaster" } });
  check(successBoon.triggered && successBoon.twist === "pure", "cross:success-boon");
  check(successDisaster.triggered && successDisaster.twist === "cursed-boon", "cross:success-disaster");
  check(failureBoon.triggered && failureBoon.twist === "fortunate-disaster", "cross:failure-boon");
  check(failureDisaster.triggered && failureDisaster.twist === "full-disaster", "cross:failure-disaster");

  // 5 硬门槛失败但旁路事故
  const paper = byId("paper-substitute");
  const gateContract = abilities.resolveAbility({
    definition: paper,
    actorState: baseActor,
    targetStates: [{ id: "t", ...baseActor }],
    intent: intent({ preparationRefs: [] }),
    seed: "gate-eval",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  check(gateContract.legality.reasons.includes("MISSING_MEDIUM"), "setup:missing-medium");
  const gateFate = resolveFate(gateContract, { force: { polarity: "disaster" } });
  check(gateFate.triggered && gateFate.twist === "full-disaster", "gate:bypass-accident");

  // 6 非法预览不触发：完全未拥有且无尝试痕迹
  const notOwned = abilities.resolveAbility({
    definition: byId("spirit-vision"),
    actorState: { ...baseActor, pathwayId: "spectator" },
    targetStates: [{ id: "t", ...baseActor }],
    intent: intent(),
    seed: "not-owned",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  const previewFate = resolveFate(notOwned);
  check(previewFate.eligible === false && previewFate.triggered === false, "preview:not-triggered");

  // 7-9 幂等与重放
  const baseGame = gameModule.createInitialGame("seer");
  const game = {
    ...baseGame,
    prologueComplete: true,
    playerName: "会长",
    playerAddress: "会长阁下",
    spirituality: 18,
    mentalLoad: 0,
    stability: 71,
    abilityResolutions: [],
    fate: fate.createInitialFateState(),
    memory: memoryModule.emptyMemoryState(),
    facts: [],
    abilityJournal: [],
    actingMarks: [],
    hiddenWorldFacts: [],
    worldKernel: { ...baseGame.worldKernel },
  };
  const first = fate.applyFateBundle(game, successContract, successBoon, "灵视");
  check(first.applied === true, "apply:first");
  check(first.game.fate.totalTriggers === 1, "apply:fate-count");
  check(first.game.memory.events.some((event) => event.type === "fate-aberration" && event.importance >= 0.9), "apply:memory-high-importance");
  check(first.game.memory.plans.some((item) => item.sourceEventIds?.includes(first.fateEventId)), "memory:recovery-plan-entered");
  const second = fate.applyFateBundle(first.game, successContract, successBoon, "灵视");
  check(second.applied === false, "idempotent:same-resolution");
  const roundtrip = JSON.parse(JSON.stringify(first.game));
  const replay = fate.applyFateBundle(roundtrip, successContract, successBoon, "灵视");
  check(replay.applied === false, "reload:no-reroll");
  const narrativeViolation = fate.validateFateNarrative(successContract, successDisaster, "行动大获成功，完美无缺。");
  check(narrativeViolation.violations.length > 0, "narrative:cursed-boon-as-pure");
  const rewritten = fate.deterministicFateNarrative(successDisaster, "灵视");
  check(typeof rewritten === "string" && rewritten.length > 0, "narrative:deterministic-rewrite");

  // 10 模板近期重复抑制
  const context = {
    definition: byId("spirit-vision"),
    contract: successContract,
    polarity: "boon",
    twist: "pure",
    severity: 2,
    severity4Allowed: false,
    recentTemplateIds: [],
    pressure: 50,
    worldlineDiverged: false,
    actorCorruption: 0,
    actorStability: 100,
    rankGap: 0,
    largeRitual: false,
    overPrepared: false,
    rareCoincidence: false,
    seed: "suppress-seed",
  };
  const firstPick = fate.selectFateTemplate(fate.fateTemplates(), context, 123);
  const secondPick = fate.selectFateTemplate(fate.fateTemplates(), { ...context, recentTemplateIds: [firstPick.id] }, 123);
  check(secondPick.id !== firstPick.id, "template:recent-suppression");

  // 11-12 四级前置与冷却
  const noRisk = fate.selectSeverity({ severityRoll: 99, severity4Allowed: false, highPressure: false, worldlineDiverged: false });
  check(noRisk !== 4, "severity4:prerequisite");
  const highRisk = fate.selectSeverity({ severityRoll: 99, severity4Allowed: true, highPressure: true, worldlineDiverged: false });
  check(highRisk === 4, "severity4:allowed-with-risk");
  const cooledGame = { week: 1, saveId: "cooled", worldKernel: {}, fate: { ...fate.createInitialFateState(), severity4CooldownUntilWeek: 5 } };
  const cooled = resolveFate(failureContract, { game: cooledGame, force: { polarity: "disaster", severity: 4 } });
  check(cooled.severity !== 4, "severity4:cooldown");

  // 13 压力强制触发
  const forcedGame = { week: 1, saveId: "forced", worldKernel: {}, fate: { ...fate.createInitialFateState(), pressure: 100 } };
  const forced = resolveFate(successContract, { game: forcedGame });
  check(forced.triggered === true, "pressure:force-trigger");
  check(forced.pressureAfter <= 100 && forced.pressureAfter >= 0, "pressure:after-in-range");

  // 14 污染偏向灾难（确定性大样本）
  let disasterNormal = 0;
  let disasterExtreme = 0;
  const sample = 20000;
  for (let index = 0; index < sample; index += 1) {
    const normalDecision = fate.rollFateDecision({ seed: `bias-${index}`, riskClass: "normal", pressure: 40, forceTrigger: false });
    const extremeDecision = fate.rollFateDecision({ seed: `bias-${index}`, riskClass: "extreme", pressure: 40, forceTrigger: false });
    if (normalDecision.triggered && normalDecision.polarity === "disaster") disasterNormal += 1;
    if (extremeDecision.triggered && extremeDecision.polarity === "disaster") disasterExtreme += 1;
  }
  check(disasterExtreme / sample > disasterNormal / sample, "corruption:disaster-bias");

  // 15 正确准备不完全消除整蛊
  const prepped = resolveFate(successContract, {
    intent: intent({ preparationRefs: ["knowledge:confirmed", "knowledge:true-name", "prep:declared", "sight-confirmed"] }),
  });
  check(prepped.eligible === true, "prep:still-eligible");

  // 16-19 动态记忆与受众
  const disasterGame = {
    ...game,
    memory: memoryModule.emptyMemoryState(),
    worldKernel: { ...game.worldKernel },
  };
  const disasterApplied = fate.applyFateBundle(disasterGame, successContract, successDisaster, "灵视");
  const targetBelief = disasterApplied.game.memory.beliefs.find((item) => item.characterId === "target");
  check(Boolean(targetBelief), "audience:belief-created");
  if (targetBelief) {
    const holderView = memoryModule.visibleBeliefs(disasterApplied.game.memory, "target", "actor");
    const strangerView = memoryModule.visibleBeliefs(disasterApplied.game.memory, "unrelated-npc", "actor");
    check(holderView.some((item) => item.id === targetBelief.id), "audience:holder-sees");
    check(!strangerView.some((item) => item.id === targetBelief.id), "audience:stranger-blocked");
  }
  check(!JSON.stringify(successBoon).includes("selectionReason") && !successBoon.deterministicSeed.includes("观察目标"), "leak:no-background-reason");

  // 20 模板应用失败使用固定安全回退，不重新抽取
  const emptyPick = fate.selectFateTemplate([], context, 7);
  check(emptyPick.id === "fate-safe-fallback-pure", "fallback:stable-id");
  const forcedFallback = resolveFate(failureContract, { force: { polarity: "disaster", templateId: "no-such-template" } });
  check(forcedFallback.templateId?.startsWith("fate-safe-fallback-") === true, "fallback:no-reroll");

  return { failures, templates: definitions.length };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runFateEval();
  console.log("[fate:eval]");
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项：${result.failures.slice(0, 16).join("; ")}`);
  } else {
    console.log("  四种交叉、硬门槛旁路、幂等、重放、模板抑制、四级约束、压力强制、污染偏置、记忆与受众、安全兜底全部通过");
  }
  const pass = result.failures.length === 0;
  console.log(`[fate:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
