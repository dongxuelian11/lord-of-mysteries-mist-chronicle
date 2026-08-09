import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

async function memoryModule() {
  return loadRuntimeModule("app/memory/index.ts");
}

test("受众隔离：同周不同角色可分别 recalled，同角色同周不重复", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "event", sourceEventId: "e1", week: 1, type: "chat", summary: "共享事件", participantIds: ["a", "b"], observerIds: [], importance: 0.8 },
  ]);
  const eventId = state.events[0].id;
  const stateOf = (mem, actorId) =>
    mem.audienceStates.find((item) => item.memoryId === eventId && item.audienceKind === "actor" && item.actorId === actorId);
  const recalledA = memory.markMemoryRecalled(state, { actionId: "ra", modelCallId: "ra", stage: "confirmed", audience: memory.actorAudience("a", true), memoryIds: [eventId], week: 20 });
  const recalledB = memory.markMemoryRecalled(recalledA, { actionId: "rb", modelCallId: "rb", stage: "confirmed", audience: memory.actorAudience("b", true), memoryIds: [eventId], week: 20 });
  assert.equal(stateOf(recalledB, "a").recallCount, 1);
  assert.equal(stateOf(recalledB, "b").recallCount, 1);
  const dupA = memory.markMemoryRecalled(recalledB, { actionId: "ra-dup", modelCallId: "ra-dup", stage: "confirmed", audience: memory.actorAudience("a", true), memoryIds: [eventId], week: 20 });
  assert.equal(stateOf(dupA, "a").recallCount, 1);
  const nextWeek = memory.markMemoryRecalled(dupA, { actionId: "ra-21", modelCallId: "ra-21", stage: "confirmed", audience: memory.actorAudience("a", true), memoryIds: [eventId], week: 21 });
  assert.equal(stateOf(nextWeek, "a").recallCount, 2);
  assert.equal(stateOf(nextWeek, "b").recallCount, 1);
});

test("受众隔离：presented 只更新对应受众，narrator/world 无副作用", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "event", sourceEventId: "e1", week: 1, type: "chat", summary: "共享事件", participantIds: ["a", "b"], observerIds: [] },
  ]);
  const eventId = state.events[0].id;
  let current = memory.markMemoryPresented(state, { actionId: "pa", modelCallId: "pa", stage: "dialogue", audience: memory.actorAudience("a", true), memoryIds: [eventId], week: 10 });
  const aState = current.audienceStates.find((item) => item.memoryId === eventId && item.actorId === "a");
  assert.equal(aState.presentationCount, 1);
  assert.equal(aState.lastPresentedWeek, 10);
  assert.ok(!current.audienceStates.some((item) => item.actorId === "b"));
  const before = JSON.stringify(current.audienceStates);
  current = memory.submitMemoryDelivery(current, { actionId: "n1", modelCallId: "n1", stage: "director", audience: memory.narratorAudience(), memoryIds: [eventId], week: 10 });
  current = memory.submitMemoryDelivery(current, { actionId: "w1", modelCallId: "w1", stage: "world", audience: memory.worldSystemAudience(), memoryIds: [eventId], week: 10 });
  assert.equal(JSON.stringify(current.audienceStates), before);
});

test("faction memory receipts use an explicit audience and remain idempotent", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "event", sourceEventId: "faction-event", week: 4, type: "briefing", summary: "消息网转移联络点", participantIds: [], observerIds: [], organizationIds: ["press"] },
  ]);
  const eventId = state.events[0].id;
  const descriptor = {
    actionId: "autonomous-agent:5:faction:press",
    modelCallId: "autonomous-agent:5:faction:press",
    stage: "autonomous-agent",
    audience: memory.factionAudience("press", true),
    memoryIds: [eventId],
    week: 5,
  };
  const delivered = memory.submitMemoryDelivery(state, descriptor);
  const presented = memory.markMemoryPresented(delivered, descriptor);
  const repeated = memory.markMemoryPresented(memory.submitMemoryDelivery(presented, descriptor), descriptor);
  const factionState = repeated.audienceStates.find(
    (item) => item.memoryId === eventId && item.audienceKind === "faction" && item.factionId === "press",
  );
  assert.equal(repeated.receipts.filter((receipt) => receipt.actionId === descriptor.actionId).length, 2);
  assert.equal(factionState.presentationCount, 1);
  assert.equal(factionState.lastPresentedWeek, 5);
  assert.ok(!repeated.audienceStates.some((item) => item.audienceKind === "actor"));
});

test("旧档迁移：legacy 字段只迁移给该角色，幂等且不串线", async () => {
  const memory = await memoryModule();
  const legacy = {
    ...memory.emptyMemoryState(),
    beliefs: [{
      id: "mem:belief:old:1",
      characterId: "mara",
      subjectId: "s",
      claimType: "c",
      claim: "旧",
      confidence: 0.8,
      truthStatus: "true",
      learnedFrom: { type: "observed", sourceId: "e1" },
      validFromWeek: 1,
      secrecy: "restricted",
      active: true,
      contradictedBy: [],
      importance: 0.5,
      emotionalWeight: 0.4,
      lastPresentedWeek: 5,
      lastRecalledWeek: 7,
      recallCount: 3,
    }],
  };
  const migrated = memory.ensureAudienceStates(legacy);
  const state = migrated.audienceStates.find((item) => item.memoryId === "mem:belief:old:1" && item.actorId === "mara");
  assert.equal(state.recallCount, 3);
  assert.equal(state.lastRecalledWeek, 7);
  assert.equal(state.lastPresentedWeek, 5);
  assert.equal(migrated.audienceStates.length, 1);
  const again = memory.ensureAudienceStates(migrated);
  assert.equal(again.audienceStates.length, 1);
});
