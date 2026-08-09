import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";
import { LORE_RECORDS } from "../app/generated-lore-compendium.ts";

after(() => closeRuntimeServer());

function contractArgs(game, intent = "核对公开报纸与失踪登记，只做来源比对。") {
  return { intent, game, leaderId: "organization", districtId: "cherwood", abilityIds: [] };
}

test("scheduled action identity is independent of wall clock and uses a persisted weekly ordinal", async () => {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const originalNow = Date.now;
  try {
    const game = model.createInitialGame("seer");
    Date.now = () => 1_000;
    const firstReplay = engine.scheduleContract(game, engine.localContract(contractArgs(game)));
    Date.now = () => 9_999_999;
    const secondReplay = engine.scheduleContract(game, engine.localContract(contractArgs(game)));

    assert.equal(firstReplay.id, secondReplay.id);
    assert.equal(firstReplay.actionOrdinal, 1);
    assert.match(firstReplay.id, /^action:1:1:/);

    const occupied = { ...game, schedule: [firstReplay] };
    const duplicate = engine.scheduleContract(occupied, engine.localContract(contractArgs(occupied)));
    assert.equal(duplicate.actionOrdinal, 2);
    assert.notEqual(duplicate.id, firstReplay.id);
    assert.match(duplicate.id, /^action:1:2:/);
  } finally {
    Date.now = originalNow;
  }
});

test("local week chapters are deterministic across an uncommitted retry", async () => {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const originalNow = Date.now;
  try {
    const game = model.createInitialGame("seer");
    Date.now = () => 100;
    const first = engine.resolveWeek(game).chapter;
    Date.now = () => 200;
    const retried = engine.resolveWeek(game).chapter;
    assert.equal(first.id, retried.id);
    assert.equal(first.id, `chapter:${game.week}:rules`);
  } finally {
    Date.now = originalNow;
  }
});

test("persisted council reply identities are independent of wall clock", async () => {
  const council = await loadRuntimeModule("app/council-system.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  const topic = "请情报与行动负责人核对公开报纸和失踪登记";
  const originalNow = Date.now;
  try {
    Date.now = () => 100;
    const first = council.createLocalCouncilReplies(game, topic, "council-topic:1:1:test");
    Date.now = () => 999_999;
    const replay = council.createLocalCouncilReplies(game, topic, "council-topic:1:1:test");
    assert.deepEqual(replay.map((reply) => reply.id), first.map((reply) => reply.id));
    assert.ok(first.every((reply) => reply.id.startsWith("council-message:")));
  } finally {
    Date.now = originalNow;
  }
});

test("dynamic origin identity is derived from validated content rather than creation time", { skip: LORE_RECORDS.length ? false : "公共空壳知识库不能完成动态出身授权校验" }, async () => {
  const origins = await loadRuntimeModule("app/pathway-origins.ts");
  const base = origins.getPathwayOrigins("seer")[0];
  const candidate = {
    title: base.title,
    summary: base.summary,
    startingSequence: base.startingSequence,
    source: base.source,
    contact: base.contact,
    enemy: base.enemy,
    firstCrisis: base.firstCrisis,
    districtId: base.startingLocation.districtId,
    blockNumber: 1,
    locationLabel: base.startingLocation.label,
    resources: base.resources,
    exposure: base.exposure,
    reputation: base.reputation,
    hostileFactionId: base.hostility[0].factionId,
    hostilityDelta: base.hostility[0].delta,
    hostilityCause: base.hostility[0].cause,
    advantageName: base.traits.find((trait) => trait.kind === "advantage")?.name ?? "稳定优势",
    advantage: base.traits.find((trait) => trait.kind === "advantage")?.description ?? "具有可复核的开局优势。",
    burdenName: base.traits.find((trait) => trait.kind === "burden")?.name ?? "明确负担",
    burden: base.traits.find((trait) => trait.kind === "burden")?.description ?? "必须持续处理的开局负担。",
    specialBurden: base.startingSequence === 7 ? "高序列开局必须持续承担可观测且不可忽略的特殊负担。" : undefined,
    loreEvidenceIds: base.loreEvidenceIds,
  };
  const originalNow = Date.now;
  try {
    Date.now = () => 1;
    const first = origins.validateDynamicPathwayOrigin(candidate, "seer");
    Date.now = () => 2;
    const second = origins.validateDynamicPathwayOrigin(candidate, "seer");
    assert.equal(first.id, second.id);
    assert.match(first.id, /^seer-dynamic-[a-z0-9]+$/);
  } finally {
    Date.now = originalNow;
  }
});
