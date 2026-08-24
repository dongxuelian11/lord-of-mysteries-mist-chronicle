import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createRequire } from "node:module";

import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";
import { buildAutonomousDecisionFrames, createAutonomousWorldState } from "../app/autonomous-agents.ts";
import { buildAgentPlanningProjection } from "../app/world-runtime.ts";

import {
  applyWorldTurn,
  createWorldKernel,
  createWorldTurnTransaction,
  projectWorldForAudience,
} from "../app/world-kernel.ts";

after(() => closeRuntimeServer());

const require = createRequire(import.meta.url);

function withKnowledgeAuthority(delta) {
  if (!Array.isArray(delta.knowledge) || delta.knowledge.length === 0) return delta;
  const fallbackProposalId = "test:knowledge";
  const executableProposalIds = Array.isArray(delta.executableProposalIds) ? delta.executableProposalIds : [fallbackProposalId];
  const events = (delta.events ?? []).map((event) => ({
    ...event,
    sourceProposalIds: Array.isArray(event.sourceProposalIds) ? event.sourceProposalIds : [fallbackProposalId],
  }));
  const mutationClaims = [...(delta.mutationClaims ?? [])];
  for (const node of delta.knowledge) {
    if (mutationClaims.some((claim) => claim.effectKind === "knowledge" && claim.subjectRef === `knowledge:${node.id}`)) continue;
    const sourceEvent = events.find((event) => event.id === node.sourceEventId);
    const proposalId = sourceEvent?.sourceProposalIds?.find((id) => executableProposalIds.includes(id));
    if (proposalId) mutationClaims.push({ proposalId, effectKind: "knowledge", subjectRef: `knowledge:${node.id}`, targetRefs: [], sourceEventId: node.sourceEventId });
  }
  return { ...delta, executableProposalIds, events, mutationClaims };
}

function commit(kernel, delta, turnId = `privacy:${delta.week}`) {
  const prepared = withKnowledgeAuthority(delta);
  return applyWorldTurn(kernel, {
    ...prepared,
    transaction: createWorldTurnTransaction(kernel, prepared, turnId),
  });
}

test("canonical holderRefs override ambiguous legacy holderIds in audience projection", () => {
  const kernel = createWorldKernel({
    week: 1,
    date: "1349年1月1日",
    actors: [{ id: "shared", name: "同名角色", locationId: "dock", agenda: "核验" }],
    factions: [{ id: "faction-seed", name: "同名势力", plan: "保密", progress: 1 }],
    locations: [{ id: "dock", name: "码头", risk: 20 }],
    timeline: [],
  });
  kernel.factions = kernel.factions.map((faction) => ({ ...faction, id: "shared" }));
  kernel.knowledge = [{
    id: "faction-only",
    subject: "势力秘密",
    statement: "只应由同名势力持有。",
    truth: "confirmed",
    visibility: "actors",
    holderIds: ["shared"],
    holderRefs: ["faction:shared"],
    loreRecordIds: [],
    acquiredWeek: 1,
  }];

  assert.equal(projectWorldForAudience(kernel, { kind: "actor", holderId: "shared" }).knowledge.length, 0);
  assert.equal(projectWorldForAudience(kernel, { kind: "faction", holderId: "shared" }).knowledge.length, 1);
});

test("Main CJS audience projection stays byte-equivalent to the renderer projection", () => {
  const kernel = createWorldKernel({
    week: 2,
    date: "1349年1月8日",
    actors: [{ id: "observer", name: "观察者", locationId: "dock", agenda: "观察" }],
    factions: [],
    locations: [{ id: "dock", name: "码头", risk: 35, stability: 70, publicMood: "平静", conditions: ["雾"] }],
    timeline: [],
  });
  kernel.events = [{
    id: "event:public",
    week: 2,
    title: "公开潮汐",
    detail: "码头出现异常雾气",
    locationId: "dock",
    actorIds: [],
    factionIds: [],
    causeIds: [],
    visibility: "public",
  }];
  const audience = { kind: "actor", holderId: "observer" };
  const rendererProjection = projectWorldForAudience(kernel, audience);
  const mainProjection = require("../shared/audience-projection.cjs").projectWorldForAudience(kernel, audience);
  assert.deepEqual(mainProjection, rendererProjection);
});

test("角色地点投影只暴露受众已知的边界字段", () => {
  const kernel = createWorldKernel({
    week: 1,
    date: "1349年1月1日",
    actors: [
      { id: "owner", name: "持有者", locationId: "vault", agenda: "观察" },
      { id: "hidden", name: "隐藏人物", locationId: "vault", agenda: "隐藏" },
    ],
    factions: [{ id: "hidden-faction", name: "隐藏势力", plan: "隐藏", progress: 10 }],
    locations: [{ id: "vault", name: "封闭地点", risk: 77 }],
    timeline: [],
  });
  const next = commit(kernel, {
    week: 1,
    playerIssuedNoOrders: true,
    actorUpdates: [],
    factionUpdates: [],
    projectUpdates: [],
    locationUpdates: [{ locationId: "vault", condition: "secret-condition", sourceProposalIds: [] }],
    events: [{
      id: "public-sighting",
      title: "公开目击",
      detail: "有人在封闭地点看见目标。",
      locationId: "vault",
      actorIds: ["owner"],
      factionIds: [],
      causeIds: [],
      visibility: "public",
    }],
    observations: [],
  });

  const firstProjection = projectWorldForAudience(next, { kind: "actor", holderId: "owner" });
  const location = firstProjection.locations[0];
  assert.ok(location);
  assert.equal("actorIds" in location, false);
  assert.equal("factionIds" in location, false);
  assert.equal("conditions" in location, false);
  assert.deepEqual(location.knownActorIds, ["owner"]);
  assert.deepEqual(location.knownFactionIds, []);
  assert.deepEqual(location.knownConditions, []);
  assert.equal(location.perceivedRisk, null);
  assert.equal(location.publicMood, null);
  assert.equal(location.stability, null);
  assert.equal(JSON.stringify(location).includes("hidden"), false);
  assert.equal(JSON.stringify(location).includes("secret-condition"), false);
  assert.equal("actorIds" in firstProjection.events[0], false);
  assert.equal("factionIds" in firstProjection.events[0], false);
  assert.deepEqual(firstProjection.events[0].knownActorIds, ["owner"]);
  assert.deepEqual(firstProjection.events[0].knownFactionIds, []);
  const ownerFrame = buildAutonomousDecisionFrames(createAutonomousWorldState(next), next, 1).find((frame) => frame.ref === "actor:owner");
  assert.ok(ownerFrame);
  const planningProjection = buildAgentPlanningProjection(ownerFrame, next);
  assert.equal("actorIds" in (planningProjection.currentLocation ?? {}), false);
  assert.equal(JSON.stringify(planningProjection.currentLocation).includes("secret-condition"), false);

  const replayProjection = projectWorldForAudience(next, { kind: "actor", holderId: "owner" });
  assert.equal(typeof firstProjection.projectionHash, "string");
  assert.equal("revision" in firstProjection, false);
  assert.equal("committedTransactions" in firstProjection, false);
  assert.equal("retrievalReceipts" in firstProjection, false);
  assert.equal("mutationClaims" in firstProjection, false);
  assert.equal(firstProjection.events.some((event) => "sourceProposalIds" in event || "causeIds" in event || "witnessRefs" in event), false);
  assert.equal(firstProjection.projectionHash, replayProjection.projectionHash);
  const hiddenOnlyChange = structuredClone(next);
  hiddenOnlyChange.locations[0].actorIds.push("hidden-2");
  assert.equal(projectWorldForAudience(hiddenOnlyChange, { kind: "actor", holderId: "owner" }).projectionHash, firstProjection.projectionHash);
  const visibleChange = structuredClone(next);
  visibleChange.events[0].detail = "公开目击发生了变化。";
  assert.notEqual(projectWorldForAudience(visibleChange, { kind: "actor", holderId: "owner" }).projectionHash, firstProjection.projectionHash);
});

test("受众世界投影不携带知识与观察的权威内部字段", () => {
  const kernel = createWorldKernel({
    week: 1,
    date: "1349年1月1日",
    actors: [{ id: "owner", name: "持有者", locationId: "vault", agenda: "观察" }],
    factions: [],
    locations: [{ id: "vault", name: "封闭地点", risk: 30 }],
    timeline: [],
  });
  const next = commit(kernel, {
    week: 1,
    playerIssuedNoOrders: true,
    actorUpdates: [],
    factionUpdates: [],
    projectUpdates: [],
    locationUpdates: [],
    events: [{ id: "visible-event", title: "公开核验", detail: "核验完成。", locationId: "vault", actorIds: ["owner"], factionIds: [], causeIds: [], visibility: "public" }],
    observations: [{ id: "visible-observation", eventId: "visible-event", channel: "调查", text: "持有者看见了核验结果。", visibility: "public", holderIds: ["owner"], holderRefs: ["actor:owner"] }],
    knowledge: [{ id: "visible-knowledge", subject: "核验", statement: "核验已经完成。", truth: "confirmed", visibility: "public", holderIds: [], holderRefs: [], loreRecordIds: ["lore-internal"], sourceEventId: "visible-event" }],
    knowledgeGrants: [{ id: "visible-grant", knowledgeId: "visible-knowledge", holderRef: "actor:owner", kind: "witness", sourceEventId: "visible-event", sourceObservationId: "visible-observation" }],
  });
  const projection = projectWorldForAudience(next, { kind: "actor", holderId: "owner" });
  assert.equal("sourceProposalIds" in projection.events[0], false);
  assert.equal("causeIds" in projection.events[0], false);
  assert.equal("witnessRefs" in projection.events[0], false);
  assert.equal("holderIds" in projection.observations[0], false);
  assert.equal("holderRefs" in projection.observations[0], false);
  assert.equal("sourceEventId" in projection.knowledge[0], false);
  assert.equal("loreRecordIds" in projection.knowledge[0], false);
  assert.equal("holderRefs" in projection.knowledge[0], false);
  assert.deepEqual(projection.knowledgeGrants, [{ knowledgeId: "visible-knowledge", kind: "witness" }]);
  assert.equal("truth" in projection.knowledge[0], false);
  assert.equal(projection.knowledge[0].epistemicStatus, "witnessed");
});

test("同处一地和事件权威参与者不等于受众辨认了隐藏主体", () => {
  const kernel = createWorldKernel({
    week: 1,
    date: "1349年1月1日",
    actors: [
      { id: "observer", name: "观察者", locationId: "dock", agenda: "观察" },
      { id: "hidden", name: "隐藏者", locationId: "dock", agenda: "潜伏" },
    ],
    factions: [{ id: "hidden-faction", name: "隐藏势力", plan: "潜伏", progress: 20 }],
    locations: [{ id: "dock", name: "码头", risk: 88 }],
    timeline: [],
  });
  const next = commit(kernel, {
    week: 1,
    playerIssuedNoOrders: true,
    actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    events: [{ id: "dock-event", title: "码头异响", detail: "雾里传来一次碰撞声。", locationId: "dock", actorIds: ["observer", "hidden"], factionIds: ["hidden-faction"], causeIds: [], visibility: "world" }],
    observations: [{ id: "observer-heard", eventId: "dock-event", channel: "目击", text: "观察者只听见碰撞，没有辨认出其他人。", visibility: "actors", holderIds: ["observer"], holderRefs: ["actor:observer"], perceivedRefs: ["actor:observer"], acquisitionKind: "witness" }],
  });
  const projection = projectWorldForAudience(next, { kind: "actor", holderId: "observer" });
  assert.deepEqual(projection.events[0].knownActorIds, ["observer"]);
  assert.deepEqual(projection.events[0].knownFactionIds, []);
  assert.equal(projection.events[0].locationId, undefined);
  assert.deepEqual(projection.locations[0].knownActorIds, ["observer"]);
  assert.deepEqual(projection.locations[0].knownFactionIds, []);
  assert.equal(JSON.stringify(projection).includes("hidden-faction"), false);
  assert.equal(JSON.stringify(projection).includes('"hidden"'), false);
});

test("议会模型调用按成员隔离私有上下文", async () => {
  const council = await loadRuntimeModule("app/council-ai.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const memory = await loadRuntimeModule("app/memory/index.ts");
  const councilSystem = await loadRuntimeModule("app/council-system.ts");
  const gameBase = model.createInitialGame("seer");
  const topic = "情报与档案、行动与调查、神秘事务";
  const members = councilSystem.relevantCouncilMembers(gameBase, topic, 3);
  assert.equal(members.length, 3);
  const privateTokens = Object.fromEntries(members.map((member) => [member.id, `PRIVATE_${member.id.toUpperCase()}`]));
  const privateOrderTokens = Object.fromEntries(members.map((member) => [member.id, `PRIVATE_ORDER_${member.id.toUpperCase()}`]));
  const { state } = memory.deriveMemory(gameBase.memory, members.map((member) => ({
    kind: "belief",
    characterId: member.id,
    subjectId: `private-${member.id}`,
    claimType: "private-channel",
    claim: privateTokens[member.id],
    confidence: 0.9,
    truthStatus: "true",
    learnedFrom: { type: "observed", sourceId: `private-event-${member.id}` },
    validFromWeek: gameBase.week,
    secrecy: "secret",
  })));
  const game = {
    ...gameBase,
    memory: state,
    facts: [...gameBase.facts, { id: "player-only", subject: "玩家密档", statement: "PLAYER_ONLY_GLOBAL_SECRET", certainty: "确认", source: "玩家私人笔记", week: gameBase.week }],
    schedule: members.map((member) => ({ title: privateOrderTokens[member.id], rawIntent: privateOrderTokens[member.id], risk: "低", leaderId: member.id, memberIds: [member.id] })),
  };
  const requests = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const prompt = body.messages?.[1]?.content ?? "";
    const speakerId = members.find((member) => prompt.includes(member.id))?.id ?? members[0].id;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ replies: [{ speakerId, text: `${speakerId} 的公开判断。`, stance: "保留" }] }) } }] }),
    };
  };
  try {
    const replies = await council.generateCouncilReplies(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      game,
      topic,
      "privacy-topic",
    );
    assert.equal(replies.length, members.length);
    assert.equal(requests.length, members.length);
    for (const request of requests) {
      const prompt = request.messages?.[1]?.content ?? "";
      const visibleTokens = members.filter((member) => prompt.includes(privateTokens[member.id]));
      assert.equal(visibleTokens.length, 1);
      const visibleOrderTokens = members.filter((member) => prompt.includes(privateOrderTokens[member.id]));
      assert.equal(visibleOrderTokens.length, 1);
      assert.equal(prompt.includes("PLAYER_ONLY_GLOBAL_SECRET"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("world-only knowledge cannot authorize player or actor proposals", async () => {
  const model = await loadRuntimeModule("app/game-model.ts");
  const actions = await loadRuntimeModule("app/world-actions.ts");
  const game = model.createInitialGame("seer");
  const memberId = game.members[0].id;
  game.worldKernel = {
    ...game.worldKernel,
    knowledge: [...game.worldKernel.knowledge, {
      id: "world-only-authority-secret",
      subject: "幕后身份",
      statement: "只有世界规则层掌握。",
      truth: "confirmed",
      visibility: "world",
      holderIds: [],
      holderRefs: [],
      loreRecordIds: [],
      acquiredWeek: game.week,
    }],
  };
  const context = actions.createActionRuleContext(game);
  assert.equal(context.knowledgeByRef.get("player")?.has("world-only-authority-secret"), false);
  assert.equal(context.knowledgeByRef.get(`actor:${memberId}`)?.has("world-only-authority-secret"), false);
});
