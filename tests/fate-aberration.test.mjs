import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

let fate;
let abilities;
let gameModule;
let memoryModule;

async function modules() {
  fate ??= await loadRuntimeModule("app/fate/index.ts");
  abilities ??= await loadRuntimeModule("app/abilities/index.ts");
  gameModule ??= await loadRuntimeModule("app/game-model.ts");
  memoryModule ??= await loadRuntimeModule("app/memory/index.ts");
  return { fate, abilities, gameModule, memoryModule };
}

after(async () => {
  await closeRuntimeServer();
});

function baseActor(overrides = {}) {
  return {
    ...abilities.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
    ...overrides,
  };
}

function baseIntent(overrides = {}) {
  return {
    actionId: "test-act",
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
  };
}

async function resolveContract(definitionId, options = {}) {
  const actor = options.actorState ?? baseActor();
  const definition = abilities.abilityDefinitions().find((item) => item.id === definitionId);
  return abilities.resolveAbility({
    definition,
    actorState: actor,
    targetStates: options.targetStates ?? [{ id: "t", ...actor, resistances: { ...actor.resistances, spiritual: 0 } }],
    intent: options.intent ?? baseIntent(),
    seed: options.seed ?? "fate-test-seed",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
}

async function resolveFate(abilityContract, options = {}) {
  const actor = options.actorState ?? baseActor();
  return fate.resolveFateAberration({
    definition: abilities.abilityDefinitions().find((item) => item.id === abilityContract.abilityId),
    actorState: actor,
    targetStates: options.targetStates ?? [{ id: "t", ...actor, resistances: { ...actor.resistances, spiritual: 0 } }],
    intent: options.intent ?? baseIntent(),
    abilityContract,
    game: options.game ?? { week: 1, saveId: "test-save", worldKernel: {}, fate: undefined },
    force: options.force,
  });
}

function minimalGame() {
  const base = gameModule.createInitialGame("seer");
  return {
    ...base,
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
    worldKernel: { ...base.worldKernel },
  };
}

test("four crossing combinations produce correct twists", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const failure = await resolveContract("spirit-vision", {
    targetStates: [{ id: "t", ...baseActor(), resistances: { ...baseActor().resistances, spiritual: 20 } }],
  });
  const successBoon = await resolveFate(success, { force: { polarity: "boon", templateId: "fate-boon-bigger-secret" } });
  const successDisaster = await resolveFate(success, { force: { polarity: "disaster", templateId: "fate-curse-seen-back" } });
  const failureBoon = await resolveFate(failure, { force: { polarity: "boon", templateId: "fate-luck-traced-mole" } });
  const failureDisaster = await resolveFate(failure, { force: { polarity: "disaster", templateId: "fate-disaster-self-registered" } });
  assert.equal(successBoon.twist, "pure");
  assert.equal(successDisaster.twist, "cursed-boon");
  assert.equal(failureBoon.twist, "fortunate-disaster");
  assert.equal(failureDisaster.twist, "full-disaster");
});

test("hard gate blocks original effect but fate can still detonate beside it", async () => {
  await modules();
  const paper = abilities.abilityDefinitions().find((item) => item.id === "paper-substitute");
  const gate = abilities.resolveAbility({
    definition: paper,
    actorState: baseActor(),
    targetStates: [{ id: "t", ...baseActor() }],
    intent: baseIntent({ preparationRefs: [] }),
    seed: "gate-test",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  assert.ok(gate.legality.reasons.includes("MISSING_MEDIUM"));
  const fateContract = await resolveFate(gate, { force: { polarity: "disaster" } });
  assert.equal(fateContract.triggered, true);
  assert.equal(fateContract.twist, "full-disaster");
  const game = minimalGame();
  const bundle = fate.applyFateBundle(game, gate, fateContract, "纸人替身");
  assert.equal(bundle.applied, true);
  assert.equal(bundle.game.memory.events.some((event) => event.type === "fate-aberration"), true);
});

test("not-a-real-attempt is ineligible and never triggers", async () => {
  await modules();
  const notOwned = abilities.resolveAbility({
    definition: abilities.abilityDefinitions().find((item) => item.id === "spirit-vision"),
    actorState: baseActor({ pathwayId: "spectator" }),
    targetStates: [{ id: "t", ...baseActor() }],
    intent: baseIntent(),
    seed: "not-owned-test",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  const fateContract = await resolveFate(notOwned);
  assert.equal(fateContract.eligible, false);
  assert.equal(fateContract.triggered, false);
});

test("same resolution never re-rolls after apply, save, or reload", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const fateContract = await resolveFate(success, { force: { polarity: "boon", templateId: "fate-boon-bigger-secret" } });
  const game = minimalGame();
  const first = fate.applyFateBundle(game, success, fateContract, "灵视");
  assert.equal(first.applied, true);
  assert.equal(first.game.fate.totalTriggers, 1);
  const second = fate.applyFateBundle(first.game, success, fateContract, "灵视");
  assert.equal(second.applied, false);
  const reloaded = JSON.parse(JSON.stringify(first.game));
  const replay = fate.applyFateBundle(reloaded, success, fateContract, "灵视");
  assert.equal(replay.applied, false);
});

test("pressure at 100 forces the next eligible action to trigger", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const fateContract = await resolveFate(success, {
    game: { week: 1, saveId: "forced-test", worldKernel: {}, fate: { ...fate.createInitialFateState(), pressure: 100 } },
  });
  assert.equal(fateContract.triggered, true);
  assert.ok(fateContract.pressureAfter >= 0 && fateContract.pressureAfter <= 100);
});

test("severity 4 requires high risk and respects cooldown", async () => {
  await modules();
  const failure = await resolveContract("spirit-vision", {
    targetStates: [{ id: "t", ...baseActor(), resistances: { ...baseActor().resistances, spiritual: 20 } }],
  });
  const cooled = await resolveFate(failure, {
    game: { week: 1, saveId: "cooled-test", worldKernel: {}, fate: { ...fate.createInitialFateState(), severity4CooldownUntilWeek: 5 } },
    force: { polarity: "disaster", severity: 4 },
  });
  assert.notEqual(cooled.severity, 4);
  const normal = fate.selectSeverity({ severityRoll: 99, severity4Allowed: false, highPressure: false, worldlineDiverged: false });
  assert.notEqual(normal, 4);
  const boosted = fate.selectSeverity({ severityRoll: 99, severity4Allowed: true, highPressure: true, worldlineDiverged: false });
  assert.equal(boosted, 4);
});

test("recent template suppression avoids immediate repeats", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const context = {
    definition: abilities.abilityDefinitions().find((item) => item.id === "spirit-vision"),
    contract: success,
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
    seed: "suppress-test",
  };
  const first = fate.selectFateTemplate(fate.fateTemplates(), context, 123);
  const second = fate.selectFateTemplate(fate.fateTemplates(), { ...context, recentTemplateIds: [first.id] }, 123);
  assert.notEqual(second.id, first.id);
});

test("fate events write high-importance memory and audience isolation holds", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const cursed = await resolveFate(success, { force: { polarity: "disaster", templateId: "fate-curse-seen-back" } });
  const game = minimalGame();
  const applied = fate.applyFateBundle(game, success, cursed, "灵视");
  const event = applied.game.memory.events.find((item) => item.type === "fate-aberration");
  assert.ok(event && event.importance >= 0.9);
  const belief = applied.game.memory.beliefs.find((item) => item.characterId === "target");
  assert.ok(belief);
  const holderView = memoryModule.visibleBeliefs(applied.game.memory, "target", "actor");
  const strangerView = memoryModule.visibleBeliefs(applied.game.memory, "unrelated-npc", "actor");
  assert.ok(holderView.some((item) => item.id === belief.id));
  assert.ok(!strangerView.some((item) => item.id === belief.id));
});

test("template failure falls back to a fixed safe template without re-rolling", async () => {
  await modules();
  const failure = await resolveContract("spirit-vision", {
    targetStates: [{ id: "t", ...baseActor(), resistances: { ...baseActor().resistances, spiritual: 20 } }],
  });
  const contract = await resolveFate(failure, { force: { polarity: "disaster", templateId: "no-such-template" } });
  assert.ok(contract.templateId?.startsWith("fate-safe-fallback-"));
  const again = await resolveFate(failure, { force: { polarity: "disaster", templateId: "no-such-template" } });
  assert.equal(again.templateId, contract.templateId);
  assert.equal(again.fateId, contract.fateId);
});

test("delayed effects persist and fire on the due week", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const contract = await resolveFate(success, { force: { polarity: "boon", templateId: "fate-boon-godmother-letter" } });
  assert.ok(contract.delayedEffects.length > 0);
  const game = minimalGame();
  const applied = fate.applyFateBundle(game, success, contract, "灵视");
  assert.ok(applied.game.fate.pendingDelayedEffects.length > 0);
  const later = fate.advanceFateWeek({ ...applied.game, week: applied.game.week + 4 });
  assert.ok(later.worldKernel.events.some((event) => event.id.startsWith("world-fate-delay-")));
  assert.equal(later.fate.pendingDelayedEffects.length, 0);
});

test("fate seed is independent from the ability seed and bound to resolution", async () => {
  await modules();
  const success = await resolveContract("spirit-vision");
  const contract = await resolveFate(success);
  assert.match(contract.fateId, /^fate:[0-9a-f]{64}$/);
  assert.notEqual(contract.deterministicSeed, success.deterministicSeed);
  assert.ok(contract.deterministicSeed.includes(success.resolutionId));
  assert.ok(contract.deterministicSeed.includes("fate-aberration-v1"));
});
