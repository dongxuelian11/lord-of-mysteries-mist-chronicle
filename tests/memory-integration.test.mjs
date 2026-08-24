import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

async function memoryModule() {
  return loadRuntimeModule("app/memory/index.ts");
}

test("检索只读：100 次构建不改变记忆状态", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "event", sourceEventId: "e1", week: 1, type: "chat", summary: "事件", participantIds: ["player", "mara"], observerIds: [] },
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "信念", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
  ]);
  const before = JSON.stringify(state);
  const indexes = memory.buildMemoryIndexes(state);
  for (let i = 0; i < 100; i += 1) {
    memory.buildSceneMemory({ sceneType: "dialogue", state, indexes, currentWeek: 10, actorId: "mara" });
    memory.memoryPromptBlock(state, "council", "mara", 10);
  }
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.beliefs[0].recallCount, 0);
  assert.equal(state.beliefs[0].lastRecalledWeek, undefined);
});

test("presented/recalled 幂等，按 actionId 去重", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "信念", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
  ]);
  const ids = [state.beliefs[0].id];
  const descriptor = { actionId: "call-1", modelCallId: "m1", stage: "dialogue", audience: memory.actorAudience("mara", true), memoryIds: ids, week: 5 };
  const once = memory.markMemoryPresented(state, descriptor);
  const twice = memory.markMemoryPresented(once, descriptor);
  assert.equal(twice.receipts.filter((receipt) => receipt.actionId === "call-1" && receipt.kind === "presented").length, 1);
  const presentedState = twice.audienceStates.find((item) => item.memoryId === ids[0] && item.audienceKind === "actor");
  assert.equal(presentedState.lastPresentedWeek, 5);
  assert.equal(presentedState.presentationCount, 1);
  const recalled = memory.markMemoryRecalled(twice, { ...descriptor, actionId: "call-2" });
  const recalledAgain = memory.markMemoryRecalled(recalled, { ...descriptor, actionId: "call-2" });
  const recalledState = recalledAgain.audienceStates.find((item) => item.memoryId === ids[0] && item.audienceKind === "actor");
  assert.equal(recalledState.recallCount, 1);
  assert.equal(recalledState.lastRecalledWeek, 5);
  const otherCall = memory.markMemoryRecalled(recalledAgain, { ...descriptor, actionId: "call-3", week: 6 });
  assert.equal(otherCall.audienceStates.find((item) => item.memoryId === ids[0]).recallCount, 2);
});

test("delivered 审计与 narrator/world 不改变角色激活度", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "信念", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
  ]);
  const ids = [state.beliefs[0].id];
  const delivered = memory.submitMemoryDelivery(state, {
    actionId: "lit:1",
    modelCallId: "lit:1:director",
    stage: "director",
    audience: memory.narratorAudience(),
    memoryIds: ids,
    week: 1,
  });
  assert.ok(delivered.receipts.some((receipt) => receipt.kind === "delivered" && receipt.stage === "director"));
  assert.equal(delivered.audienceStates.length, 0);
  const worldDelivered = memory.submitMemoryDelivery(delivered, {
    actionId: "world:1",
    modelCallId: "world:1",
    stage: "world",
    audience: memory.worldSystemAudience(),
    memoryIds: ids,
    week: 1,
  });
  assert.equal(worldDelivered.audienceStates.length, 0);
});

test("propositionKey：不同命题互不覆盖，同命题新版本替代旧版本", async () => {
  const memory = await memoryModule();
  const base = [
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "identity", propositionKey: "character:klein:identity:audrey", claim: "身份怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "e1" }, validFromWeek: 1 },
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "organization", propositionKey: "character:klein:organization:tarot", claim: "组织怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "e2" }, validFromWeek: 1 },
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "item", propositionKey: "item:001:holder:klein", claim: "物品怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "e3" }, validFromWeek: 1 },
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "intent", propositionKey: "character:klein:intent:betray-audrey", claim: "动机怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "e4" }, validFromWeek: 1 },
  ];
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), base);
  assert.equal(state.beliefs.length, 4);
  const { state: updated } = memory.deriveMemory(state, [
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "identity", propositionKey: "character:klein:identity:audrey", claim: "身份已确认", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e5" }, validFromWeek: 2 },
  ]);
  const identity = updated.beliefs.filter((belief) => belief.propositionKey === "character:klein:identity:audrey");
  assert.equal(identity.length, 2);
  assert.equal(identity.find((belief) => belief.active)?.claim, "身份已确认");
  assert.equal(updated.beliefs.filter((belief) => belief.propositionKey === "character:klein:organization:tarot" && belief.active).length, 1);
});

test("ActivePlan 引用正式计划，completed 不再召回", async () => {
  const memory = await memoryModule();
  const { state } = memory.deriveMemory(memory.emptyMemoryState(), [
    { kind: "plan", id: "p1", sourcePlanId: "proj-1", ownerId: "player", participantIds: ["player"], title: "计划", objective: "目标", currentStep: "步骤", createdWeek: 1, status: "completed" },
  ]);
  const context = memory.buildSceneMemory({ sceneType: "world", state, indexes: memory.buildMemoryIndexes(state), currentWeek: 10 });
  assert.equal(state.plans[0].sourcePlanId, "proj-1");
  assert.equal(context.activePlans.length, 0);
});

test("世界状态为 faction 观察者派生规范 belief、event 和 plan 记忆", async () => {
  const memory = await memoryModule();
  const state = memory.deriveMemoryFromWorldState(memory.emptyMemoryState(), {
    events: [{ id: "faction-observed-event", week: 4, title: "联络点异动", detail: "旧联络点附近出现陌生巡逻。", locationId: "east", actorIds: [], factionIds: [], visibility: "actors" }],
    observations: [{ id: "press-observation", week: 4, eventId: "faction-observed-event", channel: "通信", text: "旧联络点附近出现陌生巡逻。", holderIds: [], holderRefs: ["faction:press"], visibility: "actors", perceivedRefs: [], acquisitionKind: "communication" }],
    knowledge: [{ id: "faction-private-knowledge", subject: "network", statement: "旧联络点已经暴露", truth: "likely", visibility: "actors", holderIds: [], holderRefs: ["faction:press"], sourceEventId: "faction-observed-event", acquiredWeek: 4 }],
    knowledgeGrants: [{ knowledgeId: "faction-private-knowledge", holderRef: "faction:press", kind: "communication", sourceObservationId: "press-observation" }],
    projects: [{ id: "press-relocation", ownerId: "press", title: "转移联络点", stage: "分散档案", progress: 30, secrecy: 80, nextMilestone: "启用备用信箱", blockers: [], status: "active", updatedWeek: 4 }],
    factions: [{ id: "press" }],
  }, 4);

  assert.ok(state.events.some((event) => event.sourceEventId === "faction-observed-event" && event.observerIds.length === 0));
  assert.ok(state.beliefs.some((belief) => belief.characterId === "faction:press" && belief.claim === "旧联络点附近出现陌生巡逻。" && belief.learnedFrom.sourceId === "press-observation"));
  assert.ok(state.beliefs.some((belief) => belief.characterId === "faction:press" && belief.claim === "旧联络点已经暴露"));
  assert.ok(state.plans.some((plan) => plan.sourcePlanId === "press-relocation" && plan.ownerId === "faction:press" && plan.participantIds.includes("faction:press")));
  const projection = memory.buildAutonomousMemoryProjection(state, { kind: "faction", factionId: "press" }, 4);
  assert.ok(projection.text.includes("旧联络点已经暴露"));
  assert.ok(projection.text.includes("转移联络点"));

  const withFactionRelations = memory.deriveMemory(state, [
    { kind: "commitment", id: "press-source-promise", type: "agreement", participantIds: ["faction:press", "reporter"], summary: "消息网答应保护记者的来源", createdWeek: 4, sourceEventId: "faction-observed-event" },
    { kind: "relationship", sourceEventId: "faction-observed-event", fromCharacterId: "faction:press", toCharacterId: "reporter", dimension: "trust", delta: 6, summary: "共同保护来源建立了信任", createdWeek: 4 },
  ], { characterIds: new Set(["reporter"]), organizationIds: new Set(["press"]) });
  assert.ok(withFactionRelations.state.commitments.some((commitment) => commitment.id === "press-source-promise"));
  assert.ok(withFactionRelations.state.relationshipCauses.some((cause) => cause.fromCharacterId === "faction:press"));
  assert.ok(!withFactionRelations.changes.some((change) => change.kind === "rejected"));
});

test("旧信念无 propositionKey 时可用兼容键读取与替代", async () => {
  const memory = await memoryModule();
  const legacy = {
    id: "mem:belief:legacy:1",
    characterId: "ines",
    subjectId: "old",
    claimType: "claim",
    claim: "旧说法",
    confidence: 0.5,
    truthStatus: "uncertain",
    learnedFrom: { type: "report", sourceId: "r1" },
    validFromWeek: 1,
    secrecy: "restricted",
    active: true,
    contradictedBy: [],
    importance: 0.4,
    emotionalWeight: 0.3,
    recallCount: 0,
  };
  const state = { ...memory.emptyMemoryState(), beliefs: [legacy] };
  assert.ok(memory.beliefPropositionKey(legacy).startsWith("legacy:"));
  const { state: updated } = memory.deriveMemory(state, [
    { kind: "belief", characterId: "ines", subjectId: "old", claimType: "claim", claim: "新说法", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "r2" }, validFromWeek: 2 },
  ]);
  assert.ok(updated.beliefs.some((belief) => belief.id === legacy.id && !belief.active));
  assert.ok(updated.beliefs.some((belief) => belief.active && belief.claim === "新说法"));
});
