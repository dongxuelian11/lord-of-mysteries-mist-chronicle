import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentPlanningError,
  ACTIVE_AGENT_LIMIT,
  assertWorldAdjudicatorPayloadBudget,
  buildAgentPlanningProjection,
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
import { buildAutonomousMemoryProjection, deriveMemory, emptyMemoryState } from "../app/memory/index.ts";
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

test("agent planning projections include bounded private memory with explicit actor and faction audiences", () => {
  const kernel = createWorldKernel({
    week: 5,
    date: "1349年2月18日",
    actors: [
      { id: "reporter", name: "记者", locationId: "east", agenda: "核实名单" },
      { id: "clerk", name: "书记员", locationId: "east", agenda: "保住职位" },
    ],
    factions: [{ id: "press", name: "晚报消息网", plan: "保护消息源", progress: 20 }],
    locations: [{ id: "east", name: "东区", risk: 50 }],
    timeline: [],
  });
  const memory = deriveMemory(emptyMemoryState(), [
    { kind: "event", sourceEventId: "reporter-event", week: 4, type: "meeting", summary: "记者在雨夜接到名单", participantIds: ["reporter"], observerIds: [], organizationIds: [] },
    { kind: "event", sourceEventId: "press-event", week: 4, type: "briefing", summary: "消息网转移了一处联络点", participantIds: [], observerIds: [], organizationIds: ["press"] },
    { kind: "belief", characterId: "reporter", subjectId: "list", claimType: "source", claim: "记者私有判断：第二份名单更可信", confidence: 0.8, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "reporter-event" }, validFromWeek: 4, secrecy: "secret" },
    { kind: "belief", characterId: "clerk", subjectId: "list", claimType: "source", claim: "书记员秘密：名单来自警察厅", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "clerk-event" }, validFromWeek: 4, secrecy: "secret" },
    { kind: "belief", characterId: "faction:press", subjectId: "network", claimType: "risk", claim: "消息网判断旧联络点已经暴露", confidence: 0.75, truthStatus: "uncertain", learnedFrom: { type: "report", sourceId: "press-event" }, validFromWeek: 4, secrecy: "restricted" },
    { kind: "commitment", id: "reporter-promise", type: "promise", participantIds: ["reporter", "ally"], summary: "记者答应保护消息源", createdWeek: 3, status: "active", sourceEventId: "promise-event", secrecy: "secret" },
    { kind: "relationship", sourceEventId: "trust-event", fromCharacterId: "reporter", toCharacterId: "ally", dimension: "trust", delta: 12, summary: "共同核实名单建立了信任", createdWeek: 3 },
    { kind: "plan", id: "reporter-plan", ownerId: "reporter", participantIds: ["reporter"], title: "核实名单", objective: "找到第二来源", currentStep: "比较印章", createdWeek: 3, status: "active", secrecy: "secret" },
    { kind: "plan", id: "press-plan", ownerId: "press", participantIds: ["faction:press"], title: "转移联络点", objective: "保存消息网", currentStep: "分散档案", createdWeek: 3, status: "active", secrecy: "restricted" },
  ]).state;
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5);
  const reporter = buildAgentPlanningProjection(frames.find((frame) => frame.ref === "actor:reporter"), kernel, memory);
  const press = buildAgentPlanningProjection(frames.find((frame) => frame.ref === "faction:press"), kernel, memory);

  assert.deepEqual(reporter.memoryAudience, { kind: "actor", actorId: "reporter" });
  assert.ok(reporter.dynamicMemory.includes("记者私有判断"));
  assert.ok(reporter.dynamicMemory.includes("记者答应保护消息源"));
  assert.ok(reporter.dynamicMemory.includes("共同核实名单建立了信任"));
  assert.ok(reporter.dynamicMemory.includes("核实名单"));
  assert.ok(!reporter.dynamicMemory.includes("书记员秘密"));
  assert.ok(!reporter.dynamicMemory.includes("消息网判断"));
  assert.ok(reporter.memoryReferenceIds.length <= 12);
  assert.ok(reporter.dynamicMemory.length <= 2_800);

  assert.deepEqual(press.memoryAudience, { kind: "faction", factionId: "press" });
  assert.ok(press.dynamicMemory.includes("消息网转移了一处联络点"));
  assert.ok(press.dynamicMemory.includes("消息网判断旧联络点已经暴露"));
  assert.ok(press.dynamicMemory.includes("转移联络点"));
  assert.ok(!press.dynamicMemory.includes("记者私有判断"));
  assert.ok(!press.dynamicMemory.includes("书记员秘密"));
  assert.ok(press.memoryReferenceIds.length <= 12);

  const usedMemoryId = reporter.memoryReferenceIds[0];
  assert.ok(usedMemoryId);
  const accepted = validateAgentProposal(validProposal(reporter.agent, { usedMemoryIds: [usedMemoryId] }), reporter);
  assert.deepEqual(accepted.proposal?.usedMemoryIds, [usedMemoryId]);
  const forged = validateAgentProposal(validProposal(reporter.agent, { usedMemoryIds: [press.memoryReferenceIds[0]] }), reporter);
  assert.match(forged.issue, /记忆.*不可见|记忆.*未授权/);
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

test("materiality signatures skip unchanged model calls and reopen planning after an objective change", async () => {
  const kernel = crowdedKernel();
  const initial = createAutonomousWorldState(kernel);
  const firstFrames = buildAutonomousDecisionFrames(initial, kernel, 5).slice(0, 2);
  assert.ok(firstFrames.every((frame) => typeof frame.planningSignature === "string"));
  initial.profiles = initial.profiles.map((profile) => {
    const frame = firstFrames.find((candidate) => candidate.ref === profile.ref);
    return frame ? {
      ...profile,
      reflection: { ...profile.reflection, createdWeek: profile.reflection.createdWeek + 1 },
      lastPlanningSignature: frame.planningSignature,
    } : profile;
  });
  const unchangedFrames = buildAutonomousDecisionFrames(initial, kernel, 5).filter((frame) => firstFrames.some((candidate) => candidate.ref === frame.ref));
  let calls = 0;
  const skipped = await planActiveAgentsIndependently(unchangedFrames, kernel, async ({ agent }) => {
    calls += 1;
    return validProposal(agent);
  }, { materialityGate: true });
  assert.equal(calls, 0);
  assert.ok(skipped.every((proposal) => proposal.planningSource === "materiality-skip"));

  const changedRef = unchangedFrames[0].ref;
  initial.profiles = initial.profiles.map((profile) => profile.ref === changedRef ? { ...profile, currentObjective: `${profile.currentObjective}，立即核对新名单` } : profile);
  const changedFrames = buildAutonomousDecisionFrames(initial, kernel, 5).filter((frame) => firstFrames.some((candidate) => candidate.ref === frame.ref));
  calls = 0;
  await planActiveAgentsIndependently(changedFrames, kernel, async ({ agent }) => {
    calls += 1;
    return validProposal(agent);
  }, { materialityGate: true });
  assert.equal(calls, 1);
});

test("a failed agent can degrade to a private wait proposal without discarding successful peers", async () => {
  const kernel = crowdedKernel();
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5).slice(0, 2);
  const proposals = await planActiveAgentsIndependently(frames, kernel, async ({ agent }) => {
    return agent.ref === frames[0].ref ? validProposal(agent) : { broken: true };
  }, { maxAttempts: 1, failurePolicy: "fallback-wait" });
  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].planningSource, "model");
  assert.equal(proposals[1].planningSource, "deterministic-fallback");
  assert.equal(proposals[1].disposition, "wait");
  assert.match(proposals[1].planningIssue, /agentRef|对象|主体/);
});

test("urgent commitments, blocked plans and objective-relevant beliefs survive old high-importance event pressure", () => {
  const actorId = "reporter";
  const seeds = [
    ...Array.from({ length: 20 }, (_, index) => ({ kind: "event", sourceEventId: `old-event-${index}`, week: 1, type: "incident", summary: `很久以前的重大事件${index}`, participantIds: [actorId], observerIds: [], importance: 1, emotionalWeight: 1 })),
    { kind: "belief", characterId: actorId, subjectId: "list", claimType: "source", claim: "核实名单需要比较第二来源的印章", confidence: 0.7, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "list-source" }, validFromWeek: 8, importance: 0.25 },
    { kind: "commitment", id: "urgent-source-promise", type: "promise", participantIds: [actorId], summary: "本周必须保护名单的第二来源", createdWeek: 2, dueWeek: 10, sourceEventId: "promise-source", importance: 0.2 },
    { kind: "plan", id: "blocked-list-plan", ownerId: actorId, participantIds: [actorId], title: "核实名单", objective: "找到第二来源", currentStep: "解决印章样本缺失", createdWeek: 3, dueWeek: 11, status: "blocked", blockerIds: ["missing-seal"], importance: 0.2 },
  ];
  const memory = deriveMemory(emptyMemoryState(), seeds).state;
  const projection = buildAutonomousMemoryProjection(memory, { kind: "actor", actorId }, 10, {
    objective: "核实名单并找到第二来源",
    nextAction: "比较两份名单的印章",
    relationshipRefs: [],
  });

  assert.ok(projection.referenceIds.includes("urgent-source-promise"));
  assert.ok(projection.referenceIds.includes("blocked-list-plan"));
  assert.ok(projection.referenceIds.some((id) => id.startsWith("mem:belief:reporter")));
  assert.ok(projection.referenceIds.length <= 12);
  assert.ok(projection.text.length <= 2_800);
});

test("long-cold agents rotate back in and urgent memory deterministically wakes its owner", () => {
  const kernel = crowdedKernel();
  kernel.currentWeek = 20;
  const state = createAutonomousWorldState(kernel);
  const coldRef = state.coldAgentRefs.find((ref) => ref.startsWith("actor:"));
  assert.ok(coldRef);
  const actorId = coldRef.slice("actor:".length);
  state.profiles = state.profiles.map((profile) => ({
    ...profile,
    lastActiveWeek: state.activeAgentRefs.includes(profile.ref) ? 19 : 2,
  }));
  const memory = deriveMemory(emptyMemoryState(), [{
    kind: "commitment",
    id: "cold-agent-deadline",
    type: "promise",
    participantIds: [actorId],
    summary: "今天必须完成旧约定",
    createdWeek: 2,
    dueWeek: 20,
    sourceEventId: "old-promise",
    importance: 0.4,
  }]).state;

  const refreshed = ensureAutonomousWorldState(state, kernel, memory);
  assert.ok(refreshed.activeAgentRefs.includes(coldRef));
  assert.equal(refreshed.activeAgentRefs.length, ACTIVE_AGENT_LIMIT);
});

test("proposal validation rejects structured entities and locations outside the agent projection", () => {
  const kernel = crowdedKernel();
  const frame = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 5)[0];
  const hiddenActorRef = "actor:actor-29";
  assert.ok(!frame.allowedTargetRefs.includes(hiddenActorRef));

  const hiddenTarget = validateAgentProposal(validProposal(frame, { targetRefs: [hiddenActorRef] }), frame);
  assert.match(hiddenTarget.issue, /不可见|未授权/);

  const missingLocation = validateAgentProposal(validProposal(frame, { locationId: "place-does-not-exist" }), frame);
  assert.match(missingLocation.issue, /地点.*不可见|地点.*未授权/);

  assert.throws(
    () => buildAdjudicatorProjection(kernel, [validProposal(frame, { targetRefs: [hiddenActorRef] })], [frame]),
    /未通过主体授权校验/,
  );
});

test("visible participants, owned projects and known locations form explicit proposal allowlists", () => {
  const initial = createWorldKernel({
    week: 5,
    date: "1349年2月18日",
    actors: [
      { id: "reporter", name: "记者", locationId: "east", agenda: "核实名单" },
      { id: "clerk", name: "书记员", locationId: "north", agenda: "保住职位" },
      { id: "hidden", name: "暗线", locationId: "vault", agenda: "保持隐蔽" },
    ],
    factions: [{ id: "press", name: "晚报消息网", plan: "保护消息源", progress: 20 }],
    locations: [
      { id: "east", name: "东区", risk: 50 },
      { id: "north", name: "北区", risk: 30 },
      { id: "vault", name: "地下档案室", risk: 80 },
    ],
    timeline: [],
  });
  const kernel = applyWorldTurn(initial, {
    week: 5,
    playerIssuedNoOrders: true,
    actorUpdates: [], projectUpdates: [], locationUpdates: [],
    observations: [{
      id: "public-briefing-observation",
      eventId: "public-briefing",
      channel: "public briefing",
      text: "记者辨认出书记员与晚报消息网代表。",
      visibility: "public",
      holderIds: [],
      holderRefs: [],
      perceivedRefs: ["actor:clerk", "faction:press"],
      acquisitionKind: "propagation",
    }],
    events: [{ id: "public-briefing", title: "公开核对", detail: "记者与书记员核对名单。", locationId: "east", actorIds: ["reporter", "clerk"], factionIds: ["press"], causeIds: [], visibility: "public" }],
  });
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 6);
  const reporter = frames.find((frame) => frame.ref === "actor:reporter");
  const press = frames.find((frame) => frame.ref === "faction:press");

  assert.ok(reporter.allowedTargetRefs.includes("actor:reporter"));
  assert.ok(reporter.allowedTargetRefs.includes("actor:clerk"));
  assert.ok(reporter.allowedTargetRefs.includes("faction:press"));
  assert.ok(reporter.allowedTargetRefs.includes("location:east"));
  assert.ok(!reporter.allowedTargetRefs.includes("actor:hidden"));
  assert.ok(reporter.allowedLocationIds.includes("east"));
  assert.ok(press.allowedTargetRefs.includes("project:faction:press"));

  const checked = validateAgentProposal(validProposal(reporter, {
    disposition: "act",
    locationId: "east",
    targetRefs: ["actor:clerk", "faction:press", "location:east"],
  }), reporter);
  assert.ok(checked.proposal);
});

test("co-location does not authorize a hidden target until an explicit perception identifies it", () => {
  const initial = createWorldKernel({
    week: 5,
    date: "1349-week-5",
    actors: [
      { id: "observer", name: "Observer", locationId: "east", agenda: "watch the street" },
      { id: "hidden", name: "Hidden", locationId: "east", agenda: "remain concealed" },
    ],
    factions: [],
    locations: [{ id: "east", name: "East", risk: 50 }],
    timeline: [],
  });
  const initialFrame = buildAutonomousDecisionFrames(createAutonomousWorldState(initial), initial, 5)
    .find((frame) => frame.ref === "actor:observer");
  assert.ok(initialFrame);
  assert.ok(!initialFrame.allowedTargetRefs.includes("actor:hidden"));

  const perceived = applyWorldTurn(initial, {
    week: 5,
    playerIssuedNoOrders: true,
    actorUpdates: [], projectUpdates: [], locationUpdates: [], knowledge: [],
    events: [{ id: "glimpse", title: "A glimpse", detail: "A concealed figure crossed the alley.", locationId: "east", actorIds: ["hidden"], factionIds: [], causeIds: [], visibility: "world" }],
    observations: [{ id: "observer-glimpse", eventId: "glimpse", channel: "eyewitness", text: "The observer identified the concealed figure.", visibility: "actors", holderIds: ["observer"], holderRefs: ["actor:observer"], perceivedRefs: ["actor:hidden"] }],
  });
  const perceivedFrame = buildAutonomousDecisionFrames(createAutonomousWorldState(perceived), perceived, 6)
    .find((frame) => frame.ref === "actor:observer");
  assert.ok(perceivedFrame?.allowedTargetRefs.includes("actor:hidden"));
});

test("materiality signatures include condition, local risk, memory content and synchronized faction risk", () => {
  const kernel = createWorldKernel({
    week: 5,
    date: "1349-week-5",
    actors: [{ id: "observer", name: "Observer", locationId: "east", agenda: "watch" }],
    factions: [{ id: "press", name: "Press", plan: "protect sources", progress: 20, suspicion: 10 }],
    locations: [{ id: "east", name: "East", risk: 40 }],
    timeline: [],
  });
  const memoryA = deriveMemory(emptyMemoryState(), [{ kind: "belief", characterId: "observer", subjectId: "street", claimType: "risk", claim: "The street is quiet", confidence: 0.6, truthStatus: "uncertain", learnedFrom: { type: "observed", sourceId: "street-report" }, validFromWeek: 4, secrecy: "restricted" }]).state;
  const memoryB = { ...memoryA, beliefs: memoryA.beliefs.map((belief) => ({ ...belief, claim: "The street is now dangerous", confidence: 0.9 })) };
  const state = createAutonomousWorldState(kernel);
  const signature = (world, memory, ref) => buildAutonomousDecisionFrames(ensureAutonomousWorldState(state, world, memory), world, 5, memory).find((frame) => frame.ref === ref);
  const actorBase = signature(kernel, memoryA, "actor:observer");
  assert.ok(actorBase);
  const conditionChanged = structuredClone(kernel);
  conditionChanged.actors[0].condition = "injured";
  assert.notEqual(signature(conditionChanged, memoryA, "actor:observer")?.planningSignature, actorBase.planningSignature);
  const riskChanged = structuredClone(kernel);
  riskChanged.locations[0].risk += 15;
  assert.notEqual(signature(riskChanged, memoryA, "actor:observer")?.planningSignature, actorBase.planningSignature);
  assert.notEqual(signature(kernel, memoryB, "actor:observer")?.planningSignature, actorBase.planningSignature);

  const factionBase = signature(kernel, memoryA, "faction:press");
  const suspicionChanged = structuredClone(kernel);
  suspicionChanged.factions[0].suspicion = 70;
  const factionChanged = signature(suspicionChanged, memoryA, "faction:press");
  assert.ok(factionBase && factionChanged);
  assert.notEqual(factionChanged.riskTolerance, factionBase.riskTolerance);
  assert.notEqual(factionChanged.planningSignature, factionBase.planningSignature);
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
