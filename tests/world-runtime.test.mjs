import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentPlanningError,
  ACTIVE_AGENT_LIMIT,
  assertWorldAdjudicatorPayloadBudget,
  buildAdjudicatorProjection,
  fitWorldAdjudicatorPayload,
  planActiveAgentsIndependently,
  validateAgentProposal,
  WORLD_RUNTIME_LIMITS,
} from "../app/world-runtime.ts";
import {
  buildAutonomousDecisionFrames,
  createAutonomousWorldState,
  ensureAutonomousWorldState,
} from "../app/autonomous-agents.ts";
import { applyWorldTurn, createWorldKernel } from "../app/world-kernel.ts";

function crowdedKernel() {
  return createWorldKernel({
    week: 5,
    date: "1349年7月28日",
    actors: Array.from({ length: 30 }, (_, index) => ({ id: `actor-${index}`, name: `人物${index}`, locationId: `place-${index % 5}`, agenda: `目标${index}` })),
    factions: Array.from({ length: 6 }, (_, index) => ({ id: `faction-${index}`, name: `势力${index}`, plan: `计划${index}`, progress: index })),
    locations: Array.from({ length: 20 }, (_, index) => ({ id: `place-${index}`, name: `地点${index}`, risk: 30 + index })),
    timeline: [],
  });
}

function validProposal(frame, overrides = {}) {
  return {
    planningWeek: frame.planningWeek,
    agentRef: frame.ref,
    disposition: "wait",
    intent: "保持观察，不在局势不明时制造新的暴露。",
    rationale: "当前没有足以改变既定计划的新认知。",
    targetRefs: [],
    requiredKnowledgeIds: [],
    ...overrides,
  };
}

test("autonomous world keeps every profile but plans only the 24-agent active set", () => {
  const kernel = crowdedKernel();
  const state = createAutonomousWorldState(kernel);
  assert.equal(state.profiles.length, 36);
  assert.equal(state.activeAgentRefs.length, ACTIVE_AGENT_LIMIT);
  assert.equal(state.coldAgentRefs.length, 12);
  assert.equal(buildAutonomousDecisionFrames(state, kernel, 5).length, ACTIVE_AGENT_LIMIT);
  assert.equal(new Set([...state.activeAgentRefs, ...state.coldAgentRefs]).size, state.profiles.length);
});

test("a cold agent returns to the active set when a new event makes it relevant", () => {
  const kernel = crowdedKernel();
  const state = createAutonomousWorldState(kernel);
  const coldRef = state.coldAgentRefs.find((ref) => ref.startsWith("actor:"));
  assert.ok(coldRef);
  const actorId = coldRef.slice("actor:".length);
  const after = applyWorldTurn(kernel, {
    week: 5,
    playerIssuedNoOrders: true,
    actorUpdates: [], projectUpdates: [], locationUpdates: [], observations: [],
    events: [{ id: "reactivation", title: "重新卷入", detail: "旧人物重新进入本周局面。", actorIds: [actorId], factionIds: [], causeIds: [], visibility: "world" }],
  });
  const refreshed = ensureAutonomousWorldState(state, after);
  assert.ok(refreshed.activeAgentRefs.includes(coldRef));
  assert.equal(refreshed.activeAgentRefs.length, ACTIVE_AGENT_LIMIT);
});

test("independent planning retries only the failed agent and caches successful proposals", async () => {
  const kernel = crowdedKernel();
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5).slice(0, 3);
  const calls = new Map();
  const proposals = await planActiveAgentsIndependently(frames, kernel, async ({ agent }) => {
    calls.set(agent.ref, (calls.get(agent.ref) ?? 0) + 1);
    if (agent.ref === frames[1].ref && calls.get(agent.ref) === 1) return { broken: true };
    return validProposal(agent);
  }, { concurrency: 3 });
  assert.equal(proposals.length, 3);
  assert.equal(calls.get(frames[0].ref), 1);
  assert.equal(calls.get(frames[1].ref), 2);
  assert.equal(calls.get(frames[2].ref), 1);
  assert.ok(proposals.every((proposal) => proposal.disposition === "wait"));
});

test("proposal validation rejects knowledge the agent cannot see", () => {
  const kernel = crowdedKernel();
  const frame = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5)[0];
  const checked = validateAgentProposal(validProposal(frame, { requiredKnowledgeIds: ["someone-elses-secret"] }), frame);
  assert.match(checked.issue, /不可见/);
});

test("a visible knowledge id misplaced in targetRefs is deterministically normalized", () => {
  const kernel = crowdedKernel();
  const frame = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5)[0];
  frame.knownKnowledgeIds = ["known-private-node"];
  const knowledgeId = frame.knownKnowledgeIds[0];
  const checked = validateAgentProposal(validProposal(frame, { targetRefs: [knowledgeId], requiredKnowledgeIds: [] }), frame);
  assert.ok(checked.proposal);
  assert.deepEqual(checked.proposal.targetRefs, []);
  assert.deepEqual(checked.proposal.requiredKnowledgeIds, [knowledgeId]);
});

test("failed agent planning leaves the turn uncommitted and reports cached peers", async () => {
  const kernel = crowdedKernel();
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5).slice(0, 2);
  await assert.rejects(
    () => planActiveAgentsIndependently(frames, kernel, async ({ agent }) => agent.ref === frames[0].ref ? validProposal(agent) : { agentRef: agent.ref }, { maxAttempts: 2 }),
    (error) => {
      assert.ok(error instanceof AgentPlanningError);
      assert.deepEqual(error.failedRefs, [frames[1].ref]);
      assert.deepEqual(error.cachedProposalRefs, [frames[0].ref]);
      return true;
    },
  );
  assert.equal(kernel.lastResolvedWeek, 4);
});

test("an uncommitted retry reuses valid cached peers and calls only the failed agent", async () => {
  const kernel = crowdedKernel();
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5).slice(0, 2);
  const proposalCache = new Map();
  await assert.rejects(() => planActiveAgentsIndependently(frames, kernel, async ({ agent }) => agent.ref === frames[0].ref ? validProposal(agent) : { broken: true }, { maxAttempts: 1, proposalCache }), AgentPlanningError);
  assert.equal(proposalCache.size, 1);
  const calls = [];
  const proposals = await planActiveAgentsIndependently(frames, kernel, async ({ agent }) => {
    calls.push(agent.ref);
    return validProposal(agent);
  }, { proposalCache });
  assert.deepEqual(calls, [frames[1].ref]);
  assert.equal(proposals.length, 2);
});

test("adjudicator projection stays bounded as persistent storage grows", () => {
  const kernel = crowdedKernel();
  for (let index = 0; index < 120; index += 1) {
    kernel.projects.push({ id: `extra-project-${index}`, ownerId: `actor-${index % 30}`, title: `长期计划${index}`, stage: "推进", progress: index % 100, momentum: 1, secrecy: 50, nextMilestone: "继续", blockers: [], status: "active", updatedWeek: index % 6 });
    kernel.events.push({ id: `extra-event-${index}`, week: index % 6, title: `事件${index}`, detail: "持续世界事实", locationId: `place-${index % 20}`, actorIds: [`actor-${index % 30}`], factionIds: [], causeIds: [], visibility: "world" });
  }
  const frame = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5)[0];
  const checked = validateAgentProposal(validProposal(frame, { disposition: "act", locationId: "place-0", targetRefs: ["location:place-0"] }), frame);
  assert.ok(checked.proposal);
  const projection = buildAdjudicatorProjection(kernel, [checked.proposal]);
  assert.ok(projection.actors.length <= WORLD_RUNTIME_LIMITS.adjudicatorActors);
  assert.ok(projection.factions.length <= WORLD_RUNTIME_LIMITS.adjudicatorFactions);
  assert.ok(projection.projects.length <= WORLD_RUNTIME_LIMITS.adjudicatorProjects);
  assert.ok(projection.locations.length <= WORLD_RUNTIME_LIMITS.adjudicatorLocations);
  assert.ok(projection.recentEvents.length <= WORLD_RUNTIME_LIMITS.adjudicatorRecentEvents);
});

test("world adjudication refuses an oversized payload instead of sending an unbounded prompt", () => {
  assert.equal(assertWorldAdjudicatorPayloadBudget({ compact: "ok" }, 100), 16);
  assert.throws(() => assertWorldAdjudicatorPayloadBudget({ runaway: "x".repeat(200) }, 100), /禁止发送无界 Prompt/);
});

test("optional world history is relevance-compacted before the hard prompt budget", () => {
  const payload = {
    resolvingWeek: 6,
    adjudicatorWorld: { proposals: [{ intent: "必须保留的主体提案" }], recentEvents: Array.from({ length: 80 }, (_, index) => ({ id: index, detail: "事件".repeat(500) })), projects: [], locations: [] },
    recentWorld: Array.from({ length: 20 }, (_, index) => ({ index, text: "历史".repeat(500) })),
    recentSignals: Array.from({ length: 30 }, (_, index) => ({ index, text: "消息".repeat(300) })),
    knownEvidence: [], pivots: [], timeline: [], factions: [], canonActors: [],
    dynamicMemory: "记忆".repeat(10_000),
    authorizedLore: "知识".repeat(10_000),
    designerSupplement: "补充".repeat(5_000),
  };
  const fitted = fitWorldAdjudicatorPayload(payload);
  assert.ok(assertWorldAdjudicatorPayloadBudget(fitted) <= 72_000);
  assert.equal(fitted.adjudicatorWorld.proposals[0].intent, "必须保留的主体提案");
  assert.ok(fitted.adjudicatorWorld.recentEvents.length <= 28);
});

test("late-campaign compaction preserves current contracts and every adjudicator proposal", () => {
  const chapter = [{ actionId: "current-order", contract: "只核对现有公开材料", redLines: "不接触任何人", findings: ["规则结算"] }];
  const proposals = Array.from({ length: 12 }, (_, index) => ({ agentRef: `actor:${index}`, intent: `第${index}号主体本周意图`, rationale: "私有依据".repeat(40), targetRefs: [] }));
  const payload = {
    resolvingWeek: 80,
    chapter,
    adjudicatorWorld: {
      proposals,
      actors: Array.from({ length: 30 }, (_, index) => ({ id: index, biography: "人物历史".repeat(300) })),
      factions: Array.from({ length: 20 }, (_, index) => ({ id: index, posture: "势力状态".repeat(300) })),
      recentEvents: Array.from({ length: 80 }, (_, index) => ({ id: index, detail: "事件".repeat(500) })),
      projects: Array.from({ length: 50 }, (_, index) => ({ id: index, detail: "计划".repeat(400) })),
      locations: Array.from({ length: 30 }, (_, index) => ({ id: index, detail: "地点".repeat(300) })),
    },
    campaignWorld: { stages: Array.from({ length: 12 }, (_, index) => ({ id: index, text: "阶段".repeat(300) })), recentEvents: Array.from({ length: 50 }, (_, index) => ({ id: index, text: "城际事件".repeat(300) })) },
    highSequenceLedger: { characteristics: Array.from({ length: 80 }, (_, index) => ({ id: index, text: "特性".repeat(300) })), uniquenesses: [], sefirot: [], recentEvents: Array.from({ length: 50 }, (_, index) => ({ id: index, text: "高位事件".repeat(300) })) },
    factionStrategy: { profiles: Array.from({ length: 30 }, (_, index) => ({ id: index, text: "战略".repeat(300) })), diplomacy: [], latestOutcomes: [] },
    organizationState: { offices: [], formulas: [], branches: [], departments: [], members: [], recruits: [], unresolvedIssues: [] },
    recentWorld: [], recentSignals: [], knownEvidence: [], pivots: [], timeline: [], factions: [], canonActors: [],
    dynamicMemory: "记忆".repeat(10_000), authorizedLore: "知识".repeat(10_000), designerSupplement: "补充".repeat(5_000),
  };
  const fitted = fitWorldAdjudicatorPayload(payload);
  assert.ok(assertWorldAdjudicatorPayloadBudget(fitted) <= 72_000);
  assert.deepEqual(fitted.chapter, chapter);
  assert.deepEqual(fitted.adjudicatorWorld.proposals, proposals);
});
