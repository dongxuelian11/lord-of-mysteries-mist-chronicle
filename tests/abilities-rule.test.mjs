import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

let abilities;
let gameModule;
let memoryModule;

async function modules() {
  abilities ??= await loadRuntimeModule("app/abilities/index.ts");
  gameModule ??= await loadRuntimeModule("app/game-model.ts");
  memoryModule ??= await loadRuntimeModule("app/memory/index.ts");
  return { abilities, gameModule, memoryModule };
}

after(async () => {
  await closeRuntimeServer();
});

function baseIntent(overrides = {}) {
  return {
    actionId: "act-rule",
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

async function resolve(definitionId, options = {}) {
  const { abilities: module } = await modules();
  const definitions = module.abilityDefinitions();
  const definition = definitions.find((item) => item.id === definitionId);
  assert.ok(definition, `definition ${definitionId} exists`);
  const actor = options.actorState ?? {
    ...module.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
  };
  return module.resolveAbility({
    definition,
    actorState: actor,
    targetStates: options.targetStates ?? [{ id: "t", ...actor }],
    intent: options.intent ?? baseIntent(),
    seed: options.seed ?? "seed-1",
    environmentRefs: options.environmentRefs ?? [],
    activeCounterIds: options.activeCounterIds ?? [],
    environmentProtection: options.environmentProtection ?? 0,
    targetInjured: options.targetInjured ?? false,
    mastery: options.mastery ?? 1,
  });
}

test("legality matrix: hard gates block effects", async () => {
  const actor = {
    ...(await modules()).abilities.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
  };
  const cases = [
    { name: "not-owned", actorState: { ...actor, pathwayId: "spectator" } },
    { name: "no-spirit", actorState: { ...actor, spirituality: 0 } },
    { name: "no-concentration", actorState: { ...actor, concentrationSlots: 0 } },
    { name: "invalid-target-count", targetStates: [] },
    { name: "incapacitated", actorState: { ...actor, physicalCondition: 0 } },
  ];
  for (const item of cases) {
    const contract = await resolve("spirit-vision", item);
    assert.equal(contract.legality.allowed, false, item.name);
    assert.equal(contract.appliedEffects.length, 0, `no-effects:${item.name}`);
    assert.equal(contract.result, "failure", `illegal-result:${item.name}`);
  }
});

test("all six result levels are reachable deterministically", async () => {
  const { abilities: module } = await modules();
  const actor = {
    ...module.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
  };
  const levels = ["critical-success", "success", "partial-success", "fail-with-progress", "failure", "backlash"];
  for (const level of levels) {
    let found = false;
    for (let resistance = -10; resistance <= 32 && !found; resistance += 1) {
      const target = {
        ...actor,
        resistances: Object.fromEntries(
          Object.keys(actor.resistances).map((key) => [key, resistance])
        ),
      };
      const contract = await resolve(level === "backlash" ? "marionette-touch" : "spirit-vision", {
        actorState: level === "backlash" ? { ...actor, sequence: 5, internalRank: 5 } : actor,
        targetStates: [{ id: "t", ...target, internalRank: 1 }],
        intent:
          level === "backlash"
            ? baseIntent({ preparationRefs: ["knowledge:confirmed", "sight-confirmed"] })
            : baseIntent(),
      });
      if (contract.result === level) found = true;
    }
    assert.equal(found, true, `result:${level}`);
  }
});

test("rank gate blocks huge gap without leverage and opens with leverage", async () => {
  const actor = {
    ...(await modules()).abilities.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
  };
  const blocked = await resolve("spirit-vision", {
    actorState: actor,
    targetStates: [
      {
        id: "t",
        ...actor,
        internalRank: 7,
        resistances: { ...actor.resistances, spiritual: 0 },
      },
    ],
    intent: baseIntent({ preparationRefs: ["sight-confirmed"] }),
  });
  assert.equal(blocked.result, "failure");
  assert.ok(blocked.blockedEffects.length > 0);
  const opened = await resolve("spirit-vision", {
    actorState: actor,
    targetStates: [
      {
        id: "t",
        ...actor,
        internalRank: 7,
        resistances: { ...actor.resistances, spiritual: 0 },
      },
    ],
    intent: baseIntent({ preparationRefs: ["knowledge:true-name"] }),
  });
  assert.ok(opened.appliedEffects.length > 0, "leverage opens rank gate");
});

test("active counters raise defense", async () => {
  const without = await resolve("divination");
  const withCounter = await resolve("divination", {
    activeCounterIds: ["counter-divination-resistance"],
  });
  assert.ok(
    withCounter.defenseBreakdown.activeCounters > without.defenseBreakdown.activeCounters
  );
});

test("information and preparation bonuses are deduped and capped", async () => {
  const info = await resolve("divination", {
    intent: baseIntent({ preparationRefs: ["knowledge:confirmed", "knowledge:true-name"] }),
  });
  const noInfo = await resolve("divination", {
    intent: baseIntent({ preparationRefs: ["sight-confirmed"] }),
  });
  assert.ok(info.powerBreakdown.information > noInfo.powerBreakdown.information);
  const dup = await resolve("divination", {
    intent: baseIntent({ preparationRefs: ["knowledge:confirmed", "knowledge:confirmed", "knowledge:confirmed"] }),
  });
  assert.equal(dup.powerBreakdown.preparation, 0.2);
});

test("same seed and inputs produce identical contracts", async () => {
  const first = await resolve("spirit-vision");
  const second = await resolve("spirit-vision");
  assert.equal(first.margin, second.margin);
  assert.equal(first.result, second.result);
  assert.deepEqual(first.appliedEffects, second.appliedEffects);
});

test("apply is idempotent and resources never go negative", async () => {
  const { abilities: module, gameModule: game, memoryModule: memory } = await modules();
  const base = game.createInitialGame("seer");
  const state = {
    ...base,
    prologueComplete: true,
    playerName: "会长",
    playerAddress: "会长阁下",
    spirituality: 18,
    mentalLoad: 0,
    stability: 71,
    abilityResolutions: [],
    memory: memory.emptyMemoryState(),
    facts: [],
    abilityJournal: [],
    actingMarks: [],
    hiddenWorldFacts: [],
    worldKernel: { ...base.worldKernel },
  };
  const contract = await resolve("spirit-vision");
  const first = module.applyAbilityResolution(state, contract, "灵视");
  const second = module.applyAbilityResolution(first.game, contract, "灵视");
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.ok(first.game.spirituality >= 0);
  assert.ok(first.game.stability >= 0);
  assert.ok(first.game.memory.events.some((event) => event.sourceEventId === first.worldEventId));
  const roundtrip = JSON.parse(JSON.stringify(first.game));
  assert.ok(roundtrip.abilityResolutions.includes(contract.resolutionId));
  const replay = module.applyAbilityResolution(roundtrip, contract, "灵视");
  assert.equal(replay.applied, false);
});

test("narrative consistency rejects failure written as success", async () => {
  const { abilities: module } = await modules();
  const contract = await resolve("spirit-vision");
  const violation = module.validateNarrative(
    { ...contract, result: "failure" },
    "行动成功了，目标被完全控制。"
  );
  assert.ok(violation.violations.length > 0);
  const good = module.validateNarrative({ ...contract, result: "failure" }, "行动没有产生主要效果。");
  assert.equal(good.violations.length, 0);
  assert.equal(typeof module.deterministicNarrative(contract, "灵视"), "string");
});

test("natural language equivalents parse to the same ability", async () => {
  const { abilities: module } = await modules();
  const definitions = module.abilityDefinitions();
  const a = module.parseAbilityIntent("用占卜看看失踪者在哪里", definitions, "player");
  const b = module.parseAbilityIntent("借他的随身物品追查位置", definitions, "player");
  const c = module.parseAbilityIntent("尝试通过神秘学联系找他", definitions, "player");
  assert.ok(a.requestedAbilityIds.includes("divination"));
  assert.ok(b.requestedAbilityIds.includes("divination"));
  assert.ok(c.requestedAbilityIds.includes("divination"));
  assert.equal(module.abilityIntentNeedsClarification({ ...a, requestedAbilityIds: [] }), true);
});
