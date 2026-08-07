// 轻量失控行为评测：触发、阶段、恢复、幂等与边界。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runControlEval() {
  const control = await loadRuntimeModule("app/loss-of-control/index.ts");
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const baseState = control.createInitialControlState();
  const baseRisk = {
    pollution: 3,
    mentalLoad: 0,
    spirituality: 50,
    consecutiveBacklashes: 0,
    forcedCast: false,
    overreach: false,
    ritualFailure: false,
    backlash: false,
    fateSeverity: undefined,
    restRelief: 0,
    companionRelief: 0,
    protectionRelief: 0,
  };
  const evaluate = (state, riskInput, resolutionId = "eval-control") =>
    control.evaluateControlContract({
      resolutionId,
      actorId: "player",
      saveId: "control-eval-save",
      riskInput,
      controlState: state,
      eligibleIndex: 0,
    });

  // 1. stable 正常行动不触发
  const normal = evaluate(baseState, baseRisk);
  check(normal.triggered === false && normal.stageAfter === "stable", "stable-normal-no-trigger");

  // 2. 普通 failure 不自动触发
  const failureRisk = { ...baseRisk, pollution: 10, mentalLoad: 10 };
  const ordinaryFailure = evaluate(baseState, failureRisk);
  check(ordinaryFailure.triggered === false, "ordinary-failure-no-auto");

  // 3. stable + 明显污染源 → disturbed（不会跳过到严重阶段）
  const disturbedRisk = { ...baseRisk, pollution: 30, mentalLoad: 15, backlash: true };
  const disturbed = evaluate(baseState, disturbedRisk, "disturbed-case");
  check(disturbed.triggered === true && disturbed.stageAfter === "disturbed", `disturbed-stage:${disturbed.stageAfter}`);

  // 4. critical 后继续强行施展 → partial-loss（用确定性种子保证 roll < 风险值）
  const criticalState = { ...baseState, stage: "critical", recentRisk: 70 };
  let partialSeed = "";
  for (let index = 0; index < 200 && !partialSeed; index += 1) {
    const seed = `critical-forced-${index}`;
    const contract = evaluate(criticalState, { ...baseRisk, pollution: 40, mentalLoad: 30, spirituality: 20, forcedCast: true }, seed);
    if (contract.triggered && contract.stageAfter === "partial-loss") partialSeed = seed;
  }
  const partial = evaluate(criticalState, { ...baseRisk, pollution: 40, mentalLoad: 30, spirituality: 20, forcedCast: true }, partialSeed);
  check(partial.stageAfter === "partial-loss", `partial-loss:${partial.stageAfter}`);

  // 5. partial-loss + 极高风险 → contained-loss 且必须有恢复计划
  const partialState = { ...baseState, stage: "partial-loss", recentRisk: 95 };
  let containedSeed = "";
  for (let index = 0; index < 200 && !containedSeed; index += 1) {
    const seed = `contained-${index}`;
    const contract = evaluate(partialState, { ...baseRisk, pollution: 60, mentalLoad: 50, spirituality: 10, fateSeverity: 4 }, seed);
    if (contract.triggered && contract.stageAfter === "contained-loss") containedSeed = seed;
  }
  const contained = evaluate(partialState, { ...baseRisk, pollution: 60, mentalLoad: 50, spirituality: 10, fateSeverity: 4 }, containedSeed);
  check(contained.stageAfter === "contained-loss" && contained.recoveryPlanProposals.length > 0, "contained-loss-with-plan");

  // 6. 休整恢复：不能一键清空，但可以降级
  const afterRest = control.applyRecovery(
    { ...baseState, stage: "contained-loss", recentRisk: 95 },
    2,
    ["rest", "ritual-treatment", "purification", "custody"]
  );
  check(afterRest.stage === "critical" && afterRest.recentRisk === 40, "rest-recovery");

  // 7. 队友干预降低风险
  const afterCompanion = control.applyRecovery({ ...baseState, stage: "disturbed", recentRisk: 40 }, 2, ["companion"]);
  check(afterCompanion.recentRisk === 34, "companion-relief");

  // 8. 读档不重骰
  const base = gameModule.createInitialGame("seer");
  const game = {
    ...base,
    prologueComplete: true,
    playerName: "会长",
    playerAddress: "会长阁下",
    spirituality: 18,
    mentalLoad: 30,
    stability: 50,
    abilityResolutions: [],
    fate: fate.createInitialFateState(),
    control: control.createInitialControlState(),
    memory: memoryModule.emptyMemoryState(),
    facts: [],
    abilityJournal: [],
    actingMarks: [],
    hiddenWorldFacts: [],
    worldKernel: { ...base.worldKernel },
  };
  const fakeAbility = {
    actionId: "ctrl-act",
    resolutionId: "res:control-test",
    abilityId: "deep-hypnosis",
    actorId: "player",
    targetIds: ["t"],
    deterministicSeed: "seed",
    legality: { allowed: true, reasons: [] },
    powerBreakdown: { base: 11, mastery: 0, information: 0, preparation: 0, environment: 0, rank: 0, penalties: 0 },
    defenseBreakdown: { resistance: 5, passiveCounters: 2, activeCounters: 0, rankProtection: 0, environment: 0 },
    margin: 3,
    result: "success",
    reservedCosts: [{ kind: "activation", resource: "spirituality", amount: 1 }],
    committedCosts: [{ kind: "activation", resource: "spirituality", amount: 1 }],
    refundedCosts: [],
    appliedEffects: [],
    blockedEffects: [],
    createdConditions: [],
    removedConditionIds: [],
    worldEventProposals: [],
    beliefProposals: [],
    relationshipChangeProposals: [],
    commitmentProposals: [],
    tracesLeft: [],
    sideEffects: [],
    narrativeConstraints: [],
  };
  const fakeFate = {
    fateId: "fate-control-test",
    resolutionId: "res:control-test",
    algorithmVersion: "fate-aberration-v1",
    deterministicSeed: "seed",
    eligible: true,
    eligibilityReasons: [],
    pressureBefore: 0,
    pressureAfter: 0,
    fateRoll: 1,
    triggered: false,
    normalAbilityResult: "success",
    immediateEffects: [],
    delayedEffects: [],
    worldEventProposals: [],
    beliefProposals: [],
    relationshipProposals: [],
    commitmentProposals: [],
    planProposals: [],
    recoveryHooks: [],
    narrativeConstraints: [],
    invariants: [],
  };
  const controlContract = evaluate({ ...baseState, stage: "critical", recentRisk: 80 }, { ...baseRisk, pollution: 50, mentalLoad: 40, spirituality: 15, forcedCast: true }, "res:control-test");
  const first = control.applyControlBundle(game, fakeAbility, fakeFate, controlContract, "会长");
  check(first.applied === true, "control-apply-first");
  const second = control.applyControlBundle(first.game, fakeAbility, fakeFate, controlContract, "会长");
  check(second.applied === false, "control-idempotent");
  const reloaded = JSON.parse(JSON.stringify(first.game));
  const replay = control.applyControlBundle(reloaded, fakeAbility, fakeFate, controlContract, "会长");
  check(replay.applied === false, "control-reload-no-reroll");

  // 9. 命运事件增加风险但不自动严重失控
  const fateRisk = { ...baseRisk, pollution: 10, mentalLoad: 5, fateSeverity: 3 };
  const fatePush = evaluate(baseState, fateRisk, "fate-push");
  check(fatePush.triggered === true && ["disturbed", "critical"].includes(fatePush.stageAfter), `fate-not-auto-loss:${fatePush.stageAfter}`);

  // 10. stable 不能因一次普通行动直接 partial-loss
  const hardGate = evaluate(baseState, { ...baseRisk, pollution: 60, mentalLoad: 60, spirituality: 5 }, "hard-gate");
  check(hardGate.stageAfter !== "partial-loss" && hardGate.stageAfter !== "contained-loss", `stable-hard-gate:${hardGate.stageAfter}`);

  return { failures };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runControlEval();
  console.log("[control:eval]");
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项：${result.failures.slice(0, 16).join("; ")}`);
  } else {
    console.log("  stable/普通失败/污染源/强行施展/partial-loss/contained-loss/恢复/队友干预/读档不重骰/命运事件边界全部通过");
  }
  const pass = result.failures.length === 0;
  console.log(`[control:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
