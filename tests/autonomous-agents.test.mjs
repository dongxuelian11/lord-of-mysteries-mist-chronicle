import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceAutonomousWorldState,
  buildAutonomousDecisionFrames,
  createAutonomousWorldState,
  ensureAutonomousWorldState,
} from "../app/autonomous-agents.ts";
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
    observations: [],
    knowledge: [{ id: "shared-knowledge", subject: "名单", statement: "两份名单印章不同", truth: "confirmed", visibility: "actors", holderIds: [], holderRefs: ["actor:reporter", "faction:press"], sourceEventId: "shared-event" }],
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
