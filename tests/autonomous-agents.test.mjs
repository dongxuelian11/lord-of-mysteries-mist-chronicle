import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAutonomousWorldState,
  buildAutonomousDecisionFrames,
  createAutonomousWorldState,
  ensureAutonomousWorldState,
} from "../app/autonomous-agents.ts";
import { deriveMemory, emptyMemoryState } from "../app/memory/index.ts";
import { applyWorldTurn, createWorldKernel } from "../app/world-kernel.ts";

function baseKernel() {
  return createWorldKernel({
    week: 3,
    date: "1349-01-15",
    factions: [{ id: "press", name: "晚报消息网", plan: "核验失踪名单", progress: 10 }],
    actors: [
      { id: "reporter", name: "记者", locationId: "east", agenda: "查明名单来源" },
      { id: "clerk", name: "书记员", locationId: "east", agenda: "保住职位" },
    ],
    locations: [{ id: "east", name: "东区", risk: 60 }],
    timeline: [],
  });
}

test("every persistent actor and faction receives a stable autonomous profile", () => {
  const kernel = baseKernel();
  const state = createAutonomousWorldState(kernel);
  assert.equal(state.profiles.length, kernel.actors.length + kernel.factions.length);
  assert.ok(state.profiles.some((profile) => profile.ref === "actor:reporter" && profile.currentObjective === kernel.actors[0].shortTermGoal));
  assert.deepEqual(ensureAutonomousWorldState(state, kernel), state);
});

test("decision frames contain only knowledge visible to their own actor or faction", () => {
  const kernel = baseKernel();
  kernel.knowledge.push(
    { id: "reporter-only", subject: "名单", statement: "名单被改过", truth: "confirmed", visibility: "actors", holderIds: [], holderRefs: ["actor:reporter"], loreRecordIds: [], acquiredWeek: 3 },
    { id: "press-only", subject: "印刷厂", statement: "印刷厂正在转移", truth: "likely", visibility: "actors", holderIds: [], holderRefs: ["faction:press"], loreRecordIds: [], acquiredWeek: 3 },
  );
  const frames = buildAutonomousDecisionFrames(createAutonomousWorldState(kernel), kernel, 3);
  const reporter = frames.find((frame) => frame.ref === "actor:reporter");
  const clerk = frames.find((frame) => frame.ref === "actor:clerk");
  const press = frames.find((frame) => frame.ref === "faction:press");
  assert.deepEqual(reporter.knownKnowledgeIds, ["reporter-only"]);
  assert.deepEqual(clerk.knownKnowledgeIds, []);
  assert.deepEqual(press.knownKnowledgeIds, ["press-only"]);
  assert.equal(reporter.freeActionAllowed, true);
  assert.ok(reporter.candidateActions.length > 0);
});

test("a world turn updates private memory, reflection, plans, and social ties without cross-agent leakage", () => {
  const before = baseKernel();
  const state = createAutonomousWorldState(before);
  const after = applyWorldTurn(before, {
    week: 3,
    playerIssuedNoOrders: true,
    actorUpdates: [{ actorId: "reporter", shortTermGoal: "找到第二份名单", lastAction: "记录了印章差异" }],
    factionUpdates: [{ factionId: "press", posture: "保护消息源", lastAction: "转移联络点" }],
    projectUpdates: [],
    locationUpdates: [],
    events: [{ id: "shared-event", title: "交换名单", detail: "记者与消息网交换了两份名单。", locationId: "east", actorIds: ["reporter"], factionIds: ["press"], causeIds: [], visibility: "actors", witnessRefs: ["actor:reporter", "faction:press"] }],
    observations: [{ id: "shared-observation", eventId: "shared-event", channel: "exchange", text: "记者与消息网交换并核对名单。", visibility: "actors", holderIds: ["reporter"], holderRefs: ["actor:reporter", "faction:press"] }],
    knowledge: [{ id: "shared-knowledge", subject: "名单", statement: "两份名单印章不同", truth: "confirmed", visibility: "actors", holderIds: [], holderRefs: ["actor:reporter", "faction:press"], sourceEventId: "shared-event" }],
    knowledgeGrants: [
      { id: "grant-shared-reporter", knowledgeId: "shared-knowledge", holderRef: "actor:reporter", kind: "communication", sourceEventId: "shared-event", sourceObservationId: "shared-observation" },
      { id: "grant-shared-press", knowledgeId: "shared-knowledge", holderRef: "faction:press", kind: "communication", sourceEventId: "shared-event", sourceObservationId: "shared-observation" },
    ],
  });
  const advanced = advanceAutonomousWorldState(state, before, after, 3);
  const reporter = advanced.profiles.find((profile) => profile.ref === "actor:reporter");
  const clerk = advanced.profiles.find((profile) => profile.ref === "actor:clerk");
  assert.equal(reporter.currentObjective, "找到第二份名单");
  assert.ok(reporter.privateMemoryIds.includes("shared-knowledge"));
  assert.ok(reporter.privateMemoryIds.includes("shared-event"));
  assert.equal(clerk.privateMemoryIds.includes("shared-knowledge"), false);
  assert.ok(advanced.socialTies.some((tie) => tie.sourceRef === "actor:reporter" && tie.targetRef === "faction:press" && tie.familiarity > 0));
  const nextFrame = buildAutonomousDecisionFrames(advanced, after, 4).find((frame) => frame.ref === "actor:reporter");
  assert.ok(nextFrame.candidateActions.some((candidate) => candidate.id.includes(":relationship:")));
  assert.equal(advanced.lastPlannedWeek, 3);
});

test("structured reflection cites only visible experience and changes the next decision frame", () => {
  const before = baseKernel();
  const memory = deriveMemory(emptyMemoryState(), [
    { kind: "belief", characterId: "reporter", subjectId: "list", claimType: "source", claim: "第二份名单的印章更可信", confidence: 0.78, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "old-list-event" }, validFromWeek: 2, secrecy: "secret" },
    { kind: "belief", characterId: "clerk", subjectId: "list", claimType: "source", claim: "书记员知道名单由警察厅伪造", confidence: 0.95, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "clerk-secret-event" }, validFromWeek: 2, secrecy: "secret" },
    { kind: "commitment", id: "protect-source", type: "promise", participantIds: ["reporter", "ally"], summary: "保护提供名单的消息源", createdWeek: 2, status: "active", sourceEventId: "promise-event", secrecy: "secret" },
    { kind: "relationship", sourceEventId: "trust-event", fromCharacterId: "reporter", toCharacterId: "ally", dimension: "trust", delta: 15, summary: "共同避开跟踪建立了信任", createdWeek: 2 },
    { kind: "plan", id: "verify-list-plan", ownerId: "reporter", participantIds: ["reporter"], title: "核实名单", objective: "找到独立的第二来源", currentStep: "比较两枚印章", createdWeek: 2, status: "active", secrecy: "secret" },
  ]).state;
  const reporterBeliefId = memory.beliefs.find((belief) => belief.characterId === "reporter").id;
  const clerkBeliefId = memory.beliefs.find((belief) => belief.characterId === "clerk").id;
  const after = applyWorldTurn(before, {
    week: 3,
    playerIssuedNoOrders: true,
    actorUpdates: [{ actorId: "reporter", lastAction: "比较了两枚印章" }],
    factionUpdates: [], projectUpdates: [], locationUpdates: [], observations: [{ id: "followup-observation", eventId: "visible-followup", channel: "witness", text: "记者辨认了两枚印章的批次差异。", visibility: "actors", holderIds: ["reporter"], holderRefs: ["actor:reporter"] }],
    events: [{ id: "visible-followup", title: "印章差异", detail: "记者确认两枚印章来自不同批次。", locationId: "east", actorIds: ["reporter"], factionIds: [], causeIds: [], visibility: "actors", witnessRefs: ["actor:reporter"] }],
    knowledge: [{ id: "reporter-knowledge", subject: "印章", statement: "第二枚印章比第一枚晚三个月", truth: "confirmed", visibility: "actors", holderIds: [], holderRefs: ["actor:reporter"], sourceEventId: "visible-followup" }],
    knowledgeGrants: [{ id: "grant-reporter-knowledge", knowledgeId: "reporter-knowledge", holderRef: "actor:reporter", kind: "investigation", sourceEventId: "visible-followup", sourceObservationId: "followup-observation" }],
  });
  const advanced = advanceAutonomousWorldState(createAutonomousWorldState(before), before, after, 3, memory);
  const reporter = advanced.profiles.find((profile) => profile.ref === "actor:reporter");
  assert.equal(reporter.reflection.version, 1);
  assert.equal(reporter.reflection.provenance, "deterministic-visible-state");
  assert.equal(reporter.reflection.audienceRef, "actor:reporter");
  assert.ok(reporter.reflection.sourceRefs.includes("visible-followup"));
  assert.ok(reporter.reflection.sourceRefs.includes("reporter-knowledge"));
  assert.ok(reporter.reflection.sourceRefs.includes(reporterBeliefId));
  assert.ok(reporter.reflection.sourceRefs.includes("protect-source"));
  assert.ok(reporter.reflection.sourceRefs.includes("verify-list-plan"));
  assert.ok(!reporter.reflection.sourceRefs.includes(clerkBeliefId));
  assert.ok(!reporter.reflection.summary.includes("警察厅伪造"));
  assert.equal(reporter.reflection.recommendedObjective, "找到独立的第二来源");
  assert.equal(reporter.reflection.recommendedIntent, "比较两枚印章");
  const knowledgeConclusion = reporter.reflection.conclusions.find((conclusion) => conclusion.sourceRefs.includes("reporter-knowledge"));
  assert.ok(knowledgeConclusion);
  assert.deepEqual(knowledgeConclusion.sourceRefs, ["reporter-knowledge"]);
  assert.deepEqual(knowledgeConclusion.sourceEventIds, ["visible-followup"]);
  const planConclusion = reporter.reflection.conclusions.find((conclusion) => conclusion.sourceRefs.includes("verify-list-plan"));
  assert.deepEqual(planConclusion.sourceRefs, ["verify-list-plan"]);
  assert.deepEqual(reporter.reflection.recommendationSourceRefs, ["verify-list-plan"]);
  assert.deepEqual(reporter.reflection.recommendationSourceEventIds, []);

  const nextFrame = buildAutonomousDecisionFrames(advanced, after, 4).find((frame) => frame.ref === "actor:reporter");
  assert.deepEqual(nextFrame.reflection, reporter.reflection);
  assert.ok(nextFrame.drives.includes("找到独立的第二来源"));
  const reflectionCandidate = nextFrame.candidateActions.find((candidate) => candidate.id.includes(":reflection:"));
  assert.equal(reflectionCandidate.intent, "比较两枚印章");
  assert.ok(reflectionCandidate.reason.includes("核实名单"));
  assert.deepEqual(reflectionCandidate.requiredKnowledgeIds, ["reporter-knowledge"]);
});

test("legacy string reflection migrates deterministically without losing its text", () => {
  const kernel = baseKernel();
  const legacy = createAutonomousWorldState(kernel);
  legacy.profiles[0].reflection = "旧存档反思：继续核实名单来源。";
  const migrated = ensureAutonomousWorldState(legacy, kernel);
  assert.equal(migrated.profiles[0].reflection.version, 1);
  assert.match(migrated.profiles[0].reflection.summary, /旧存档反思/);
  assert.equal(migrated.profiles[0].reflection.provenance, "migration");
  assert.deepEqual(migrated.profiles[0].reflection.sourceRefs, []);
});
