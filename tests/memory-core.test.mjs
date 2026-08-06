import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

async function memoryModule() {
  return loadRuntimeModule("app/memory/index.ts");
}

test("记忆派生：去重、替代与原子性", async () => {
  const memory = await memoryModule();
  const registry = { characterIds: new Set(["player", "mara"]), organizationIds: new Set() };
  const seeds = [
    { kind: "event", sourceEventId: "e1", week: 1, type: "rescue", summary: "救助", participantIds: ["player", "mara"], observerIds: [] },
    { kind: "event", sourceEventId: "e1", week: 1, type: "rescue", summary: "重复", participantIds: ["player", "mara"], observerIds: [] },
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", claim: "旧说法", confidence: 0.6, truthStatus: "false", learnedFrom: { type: "rumor", sourceId: "e1" }, validFromWeek: 1 },
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", claim: "新说法", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e2" }, validFromWeek: 2 },
  ];
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), seeds, registry);
  assert.equal(state.events.length, 1);
  assert.equal(state.beliefs.length, 2);
  const oldBelief = state.beliefs.find((belief) => belief.truthStatus === "false");
  const newBelief = state.beliefs.find((belief) => belief.truthStatus === "true");
  assert.equal(oldBelief.active, false);
  assert.equal(oldBelief.supersededBy, newBelief.id);
  assert.equal(newBelief.active, true);
  // 重放不重复
  const replay = memory.deriveMemory(state, seeds, registry);
  assert.equal(replay.state.events.length, 1);
  assert.equal(replay.state.beliefs.length, 2);
});

test("记忆派生：非法种子被拒绝", async () => {
  const memory = await memoryModule();
  const registry = { characterIds: new Set(["player"]), organizationIds: new Set() };
  const { state, changes } = memory.deriveMemory(
    memory.emptyMemoryState(),
    [
      { kind: "event", sourceEventId: "bad", week: 1, type: "chat", summary: "未知角色", participantIds: ["ghost"], observerIds: [] },
      { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", claim: "x", confidence: 2, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e" }, validFromWeek: 1 },
    ],
    registry
  );
  assert.equal(state.events.length, 0);
  assert.equal(state.beliefs.length, 0);
  assert.ok(changes.every((change) => change.kind === "rejected"));
});

test("权限：actor 只能看到自己的信念与参与的事件", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(
    memory.emptyMemoryState(),
    [
      { kind: "event", sourceEventId: "e1", week: 1, type: "chat", summary: "a 与 b", participantIds: ["a"], observerIds: ["b"] },
      { kind: "belief", characterId: "a", subjectId: "s", claimType: "c", claim: "a 的秘密", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1, secrecy: "secret" },
      { kind: "belief", characterId: "b", subjectId: "s2", claimType: "c", claim: "b 的私念", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1, secrecy: "secret" },
    ]
  );
  const aBeliefs = memory.visibleBeliefs(state, "a", "actor");
  assert.equal(aBeliefs.length, 1);
  assert.equal(aBeliefs[0].characterId, "a");
  const aEvents = memory.visibleEvents(state, "a", "actor");
  assert.equal(aEvents.length, 1);
  const worldBeliefs = memory.visibleBeliefs(state, undefined, "world");
  assert.equal(worldBeliefs.length, 2);
});

test("场景上下文：预算有界、确定性、包含关键承诺与计划", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(
    memory.emptyMemoryState(),
    [
      { kind: "commitment", id: "c1", type: "promise", participantIds: ["player", "mara"], summary: "保护证人", createdWeek: 1, dueWeek: 20, sourceEventId: "e1", importance: 0.9 },
      { kind: "plan", id: "p1", ownerId: "player", participantIds: ["player"], title: "长期计划", objective: "目标", currentStep: "步骤", createdWeek: 2, status: "active", importance: 0.8 },
      { kind: "event", sourceEventId: "e1", week: 1, type: "chat", summary: "普通事件", participantIds: ["player"], importance: 0.2 },
    ]
  );
  const indexes = memory.buildMemoryIndexes(state);
  const context = memory.buildSceneMemory({ sceneType: "council", state, indexes, currentWeek: 10, actorId: "player" });
  assert.ok(context.commitments.some((ref) => ref.id === "c1"));
  assert.ok(context.activePlans.some((ref) => ref.id === "p1"));
  assert.ok(context.totalCharacters <= 3600);
  const again = memory.buildSceneMemory({ sceneType: "council", state, indexes, currentWeek: 10, actorId: "player" });
  assert.deepEqual(context.commitments.map((ref) => ref.id), again.commitments.map((ref) => ref.id));
});

test("衰减：普通记忆 dormant、重大事件不衰减、rehearse 更新计数", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(
    memory.emptyMemoryState(),
    [
      { kind: "event", sourceEventId: "chat", week: 1, type: "chat", summary: "闲聊", participantIds: ["a"], importance: 0.2, emotionalWeight: 0.1 },
      { kind: "event", sourceEventId: "rescue", week: 1, type: "rescue", summary: "救命", participantIds: ["a"], importance: 0.95, emotionalWeight: 0.9 },
      { kind: "belief", characterId: "a", subjectId: "s", claimType: "c", claim: "x", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "chat" }, validFromWeek: 1 },
    ]
  );
  const chat = state.events.find((event) => event.sourceEventId === "chat");
  const rescue = state.events.find((event) => event.sourceEventId === "rescue");
  assert.ok(memory.eventActivation(chat, 50) < 0.35);
  assert.ok(memory.eventActivation(rescue, 50) >= 0.55);
  const belief = state.beliefs[0];
  const rehearsed = memory.rehearseBelief(state, belief.id, 50);
  const audienceState = rehearsed.audienceStates.find(
    (item) => item.memoryId === belief.id && item.audienceKind === "actor" && item.actorId === "a"
  );
  assert.equal(audienceState.recallCount, 1);
  assert.equal(audienceState.lastRecalledWeek, 50);
});
