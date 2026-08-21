import assert from "node:assert/strict";
import test, { after } from "node:test";

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

function commit(kernel, delta, turnId = `privacy:${delta.week}`) {
  return applyWorldTurn(kernel, {
    ...delta,
    transaction: createWorldTurnTransaction(kernel, delta, turnId),
  });
}

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

  const location = projectWorldForAudience(next, { kind: "actor", holderId: "owner" }).locations[0];
  assert.ok(location);
  assert.equal("actorIds" in location, false);
  assert.equal("factionIds" in location, false);
  assert.equal("conditions" in location, false);
  assert.deepEqual(location.knownActorIds, ["owner"]);
  assert.deepEqual(location.knownFactionIds, []);
  assert.deepEqual(location.knownConditions, []);
  assert.equal(location.perceivedRisk, 77);
  assert.equal(location.publicMood, "日常秩序仍在维持");
  assert.equal(JSON.stringify(location).includes("hidden"), false);
  assert.equal(JSON.stringify(location).includes("secret-condition"), false);
  const ownerFrame = buildAutonomousDecisionFrames(createAutonomousWorldState(next), next, 1).find((frame) => frame.ref === "actor:owner");
  assert.ok(ownerFrame);
  const planningProjection = buildAgentPlanningProjection(ownerFrame, next);
  assert.equal("actorIds" in (planningProjection.currentLocation ?? {}), false);
  assert.equal(JSON.stringify(planningProjection.currentLocation).includes("secret-condition"), false);

  const firstProjection = projectWorldForAudience(next, { kind: "actor", holderId: "owner" });
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
  const game = { ...gameBase, memory: state };
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
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
