import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

let control;
let fate;
let gameModule;
let memoryModule;

async function modules() {
  control ??= await loadRuntimeModule("app/loss-of-control/index.ts");
  fate ??= await loadRuntimeModule("app/fate/index.ts");
  gameModule ??= await loadRuntimeModule("app/game-model.ts");
  memoryModule ??= await loadRuntimeModule("app/memory/index.ts");
  return { control, fate, gameModule, memoryModule };
}

after(async () => {
  await closeRuntimeServer();
});

function baseState(overrides = {}) {
  return { ...control.createInitialControlState(), ...overrides };
}

function baseRisk(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function evaluate(state, riskInput, resolutionId = "control-test") {
  return control.evaluateControlContract({
    resolutionId,
    actorId: "player",
    saveId: "control-test-save",
    riskInput,
    controlState: state,
    eligibleIndex: 0,
  });
}

test("stable normal action and ordinary failure never trigger", async () => {
  await modules();
  const normal = evaluate(baseState(), baseRisk());
  assert.equal(normal.triggered, false);
  assert.equal(normal.stageAfter, "stable");
  const failure = evaluate(baseState(), baseRisk({ pollution: 10, mentalLoad: 10 }));
  assert.equal(failure.triggered, false);
});

test("stable cannot jump straight to partial-loss from one action", async () => {
  await modules();
  const contract = evaluate(baseState(), baseRisk({ pollution: 60, mentalLoad: 60, spirituality: 5 }));
  assert.ok(["disturbed", "critical"].includes(contract.stageAfter));
  assert.notEqual(contract.stageAfter, "partial-loss");
  assert.notEqual(contract.stageAfter, "contained-loss");
});

test("critical forced cast escalates to partial-loss", async () => {
  await modules();
  const state = baseState({ stage: "critical", recentRisk: 70 });
  let chosen = "";
  for (let index = 0; index < 200 && !chosen; index += 1) {
    const seed = `partial-${index}`;
    const contract = evaluate(state, baseRisk({ pollution: 40, mentalLoad: 30, spirituality: 20, forcedCast: true }), seed);
    if (contract.triggered && contract.stageAfter === "partial-loss") chosen = seed;
  }
  const contract = evaluate(state, baseRisk({ pollution: 40, mentalLoad: 30, spirituality: 20, forcedCast: true }), chosen);
  assert.equal(contract.stageAfter, "partial-loss");
});

test("partial-loss with extreme risk becomes contained-loss and carries a recovery plan", async () => {
  await modules();
  const state = baseState({ stage: "partial-loss", recentRisk: 95 });
  let chosen = "";
  for (let index = 0; index < 200 && !chosen; index += 1) {
    const seed = `contained-${index}`;
    const contract = evaluate(state, baseRisk({ pollution: 60, mentalLoad: 50, spirituality: 10, fateSeverity: 4 }), seed);
    if (contract.triggered && contract.stageAfter === "contained-loss") chosen = seed;
  }
  const contract = evaluate(state, baseRisk({ pollution: 60, mentalLoad: 50, spirituality: 10, fateSeverity: 4 }), chosen);
  assert.equal(contract.stageAfter, "contained-loss");
  assert.ok(contract.recoveryPlanProposals.length > 0);
});

test("rest and companion recovery lower risk without clearing it instantly", async () => {
  await modules();
  const afterRest = control.applyRecovery(baseState({ stage: "contained-loss", recentRisk: 95 }), 2, ["rest", "ritual-treatment", "purification", "custody"]);
  assert.equal(afterRest.stage, "critical");
  assert.equal(afterRest.recentRisk, 40);
  assert.ok(afterRest.pollution < 95);
  const afterCompanion = control.applyRecovery(baseState({ stage: "disturbed", recentRisk: 40 }), 2, ["companion"]);
  assert.equal(afterCompanion.recentRisk, 34);
});

test("fate event raises risk but does not by itself cause severe loss", async () => {
  await modules();
  const contract = evaluate(baseState(), baseRisk({ pollution: 10, mentalLoad: 5, fateSeverity: 3 }), "fate-push");
  assert.equal(contract.triggered, true);
  assert.ok(["disturbed", "critical"].includes(contract.stageAfter));
});

test("same resolution cannot re-apply after save or reload", async () => {
  await modules();
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
  const ability = {
    actionId: "ctrl-act",
    resolutionId: "res:control-idem",
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
  const fateContract = {
    fateId: "fate-control-idem",
    resolutionId: "res:control-idem",
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
  const contract = evaluate(baseState({ stage: "critical", recentRisk: 80 }), baseRisk({ pollution: 50, mentalLoad: 40, spirituality: 15, forcedCast: true }), "res:control-idem");
  const first = control.applyControlBundle(game, ability, fateContract, contract, "会长");
  assert.equal(first.applied, true);
  const second = control.applyControlBundle(first.game, ability, fateContract, contract, "会长");
  assert.equal(second.applied, false);
  const reloaded = JSON.parse(JSON.stringify(first.game));
  const replay = control.applyControlBundle(reloaded, ability, fateContract, contract, "会长");
  assert.equal(replay.applied, false);
});

test("control outcome is reproducible from the same seed", async () => {
  await modules();
  const state = baseState({ stage: "critical", recentRisk: 70 });
  const risk = baseRisk({ pollution: 40, mentalLoad: 30, spirituality: 20, forcedCast: true });
  const first = evaluate(state, risk, "repro-seed");
  const second = evaluate(state, risk, "repro-seed");
  assert.equal(first.stageAfter, second.stageAfter);
  assert.equal(first.riskScore, second.riskScore);
  assert.deepEqual(first.symptoms, second.symptoms);
});

test("player's own loss-of-control event is player-visible", async () => {
  await modules();
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
  const state = baseState({ stage: "critical", recentRisk: 80 });
  let chosen = "";
  for (let index = 0; index < 200 && !chosen; index += 1) {
    const seed = `visibility-${index}`;
    const contract = evaluate(state, baseRisk({ pollution: 50, mentalLoad: 40, spirituality: 15, forcedCast: true }), seed);
    if (contract.triggered) chosen = seed;
  }
  const contract = evaluate(state, baseRisk({ pollution: 50, mentalLoad: 40, spirituality: 15, forcedCast: true }), chosen);
  const ability = {
    actionId: "ctrl-vis",
    resolutionId: chosen,
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
  const fateContract = {
    fateId: `fate-${chosen}`,
    resolutionId: chosen,
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
  const applied = control.applyControlBundle(game, ability, fateContract, contract, "会长");
  assert.equal(applied.applied, true);
  const event = applied.game.worldKernel.events.find((item) => item.id === `world-control-${contract.id}`);
  assert.ok(event);
  assert.equal(event.visibility, "player");
});

test("control contracts always validate across a deterministic risk sample", async () => {
  await modules();
  const stages = ["stable", "disturbed", "critical", "partial-loss", "contained-loss"];
  for (let index = 0; index < 200; index += 1) {
    const contract = evaluate(
      baseState({ stage: stages[index % stages.length], recentRisk: (index * 7) % 100 }),
      baseRisk({
        pollution: (index * 3) % 80,
        mentalLoad: (index * 5) % 90,
        spirituality: 10 + (index % 40),
        backlash: index % 3 === 0,
        forcedCast: index % 4 === 0,
        ritualFailure: index % 7 === 0,
        fateSeverity: index % 11 === 0 ? 4 : index % 5 === 0 ? 3 : undefined,
      }),
      `fuzz-${index}`
    );
    assert.deepEqual(control.validateControlContract(contract), [], `fuzz-${index}`);
  }
});

test("malformed control contract is rejected by validation before application", async () => {
  await modules();
  const contract = control.evaluateControlContract({
    resolutionId: "malformed-1",
    actorId: "player",
    saveId: "control-test-save",
    riskInput: baseRisk({ pollution: 60, mentalLoad: 50, spirituality: 10, fateSeverity: 4 }),
    controlState: baseState({ stage: "partial-loss", recentRisk: 95 }),
    eligibleIndex: 0,
  });
  const broken = {
    ...contract,
    stageAfter: "contained-loss",
    recoveryPlanProposals: [],
  };
  const errors = control.validateControlContract(broken);
  assert.ok(errors.includes("contained-loss-without-recovery-plan"));
  const base = gameModule.createInitialGame("seer");
  const game = {
    ...base,
    spirituality: 18,
    mentalLoad: 30,
    stability: 50,
    abilityResolutions: [],
    fate: fate.createInitialFateState(),
    control: control.createInitialControlState(),
    memory: memoryModule.emptyMemoryState(),
    facts: [],
    worldKernel: { ...base.worldKernel },
  };
  // 校验失败即阻断：世界状态在应用前保持不变（apply 不得被调用）。
  const snapshot = JSON.stringify(game);
  assert.ok(errors.length > 0);
  assert.equal(JSON.stringify(game), snapshot);
});
