import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  actionAdjudicationLedgerEvents,
  adjudicateWorldActionProposals,
  proposalFromAgentProposal,
  proposalFromScheduledAction,
} from "../app/world-actions.ts";

const boundedAuthorization = {
  scope: "bounded",
  redLines: ["不得伤害无关者"],
  mustEscalateWhen: ["出现未知非凡力量"],
  retreatCondition: "身份暴露时撤退",
};

function proposal(overrides = {}) {
  return {
    id: "proposal:directive",
    week: 4,
    proposer: { kind: "player", id: "player" },
    actionType: "investigate",
    intent: "核对货运清单",
    method: "从公开记录开始交叉验证",
    target: { kind: "district", id: "east" },
    participantIds: ["alice"],
    participantRefs: ["actor:alice"],
    targetRefs: ["location:east"],
    requiredKnowledgeIds: [],
    commitments: { money: 10, manpower: 1, extraordinaryMaterials: 0, spirituality: 0 },
    timeWindow: { startDay: 1, days: 2 },
    priority: 10,
    authorization: boundedAuthorization,
    causeEventIds: ["event:manifest"],
    redLines: boundedAuthorization.redLines,
    retreatCondition: boundedAuthorization.retreatCondition,
    visibility: "actors",
    holderRefs: ["actor:alice"],
    ...overrides,
  };
}

function context() {
  return {
    week: 4,
    moneyAvailable: 100,
    debtFloor: 0,
    manpowerAvailable: 5,
    extraordinaryMaterialsAvailable: 2,
    actorIds: new Set(["alice", "bob"]),
    factionIds: new Set(["press"]),
    districtIds: new Set(["east"]),
    locationIds: new Set(["east"]),
    projectIds: new Set(["project:watch"]),
    unavailableActorIds: new Set(),
    actorKnowledge: new Map([["alice", new Set(["knowledge:manifest"])], ["bob", new Set()]]),
    knowledgeByRef: new Map([["actor:alice", new Set(["knowledge:manifest"])], ["actor:bob", new Set()]]),
  };
}

test("scheduled leader directives map every resource, authorization, knowledge, and cause field", () => {
  const action = {
    id: "action:4:1:test",
    rawIntent: "让爱丽丝核对货运清单",
    title: "核对清单",
    kind: "调查",
    target: "货运清单",
    desiredOutcome: "确认清单是否被篡改",
    approach: "从公开记录开始交叉验证",
    leaderId: "alice",
    memberIds: ["alice"],
    executionMode: "delegated",
    districtId: "east",
    abilityIds: [],
    days: 4,
    startDay: 1,
    budget: 40,
    resourceCommitment: { posture: "substantial", money: 55, manpower: 4, extraordinaryMaterials: 2 },
    authorization: boundedAuthorization,
    requiredKnowledgeIds: ["knowledge:manifest"],
    sourceIssueId: "issue:manifest",
    strategyIntentId: "strategy:control-docks",
    causeEventIds: ["event:manifest"],
    risk: "中",
    knownFacts: "存在两份清单",
    hypothesis: "其中一份被改写",
    unknowns: "改写者未知",
    redLines: "不得伤害无关者",
    retreat: "身份暴露时撤退",
    focus: true,
    status: "planned",
    execution: {
      originWeek: 3,
      attemptOrdinal: 1,
      status: "partially-completed",
      progress: 25,
      consumed: { money: 15, manpower: 1, extraordinaryMaterials: 1, spirituality: 0 },
      nextEligibleWeek: 4,
      consequenceEventIds: ["event:prior-attempt"],
    },
  };

  const mapped = proposalFromScheduledAction(action, 4);
  assert.deepEqual(mapped.commitments, { money: 40, manpower: 4, extraordinaryMaterials: 1, spirituality: 0 });
  assert.deepEqual(mapped.timeWindow, { startDay: 1, days: 3 });
  assert.equal(mapped.attemptId, "attempt:action:4:1:test:2");
  assert.equal(mapped.progressBefore, 25);
  assert.deepEqual(mapped.participantRefs, ["actor:alice"]);
  assert.deepEqual(mapped.targetRefs, ["location:east"]);
  assert.deepEqual(mapped.requiredKnowledgeIds, ["knowledge:manifest"]);
  assert.deepEqual(mapped.authorization, boundedAuthorization);
  assert.deepEqual(mapped.causeEventIds, ["event:manifest"]);
  assert.equal(mapped.sourceIssueId, "issue:manifest");
  assert.equal(mapped.strategyIntentId, "strategy:control-docks");
});

test("bounded authorization produces a real limited execution plan with reduced resources and a new time window", () => {
  const highPriority = proposal({
    id: "proposal:high",
    priority: 30,
    commitments: { money: 80, manpower: 4, extraordinaryMaterials: 1, spirituality: 0 },
  });
  const adaptable = proposal({
    id: "proposal:adaptable",
    priority: 20,
    commitments: { money: 50, manpower: 4, extraordinaryMaterials: 3, spirituality: 0 },
  });

  const [accepted, limited] = adjudicateWorldActionProposals([adaptable, highPriority], context());
  assert.equal(accepted.review.status, "accepted");
  assert.equal(limited.review.status, "limited");
  assert.equal(limited.executionPlan.executable, true);
  assert.deepEqual(limited.executionPlan.commitments, {
    money: 20,
    manpower: 1,
    extraordinaryMaterials: 1,
    spirituality: 0,
  });
  assert.deepEqual(limited.executionPlan.timeWindow, { startDay: 3, days: 2 });
  assert.notDeepEqual(limited.executionPlan.commitments, limited.proposal.commitments);
  assert.notDeepEqual(limited.executionPlan.timeWindow, limited.proposal.timeWindow);
  assert.match(limited.review.enforcedLimits.join(" "), /缩减/);
  assert.match(limited.review.enforcedLimits.join(" "), /改为第3日/);
});

test("strict authorization escalates instead of silently changing a conflicting directive", () => {
  const highPriority = proposal({ id: "proposal:high", priority: 30 });
  const strict = proposal({
    id: "proposal:strict",
    priority: 20,
    authorization: { ...boundedAuthorization, scope: "strict" },
  });
  const [, escalated] = adjudicateWorldActionProposals([strict, highPriority], context());
  assert.equal(escalated.review.status, "escalation-required");
  assert.equal(escalated.executionPlan.executable, false);
  assert.deepEqual(escalated.executionPlan.timeWindow, strict.timeWindow);
  assert.equal(escalated.executionPlan.disposition, "awaiting-authorization");
});

function lockedPlan(overrides = {}) {
  return {
    proposalId: "proposal:locked",
    attemptId: "attempt:locked:1",
    executable: true,
    participantIds: ["alice"],
    participantRefs: ["actor:alice"],
    targetRefs: ["location:east"],
    commitments: { money: 999, manpower: 99, extraordinaryMaterials: 99, spirituality: 0 },
    timeWindow: { startDay: 1, days: 7 },
    authorization: boundedAuthorization,
    visibility: "actors",
    holderRefs: ["actor:alice"],
    causeEventIds: [],
    adjustments: [],
    disposition: "executed",
    progressDelta: 100,
    remainingDays: 0,
    nextEligibleWeek: null,
    ...overrides,
  };
}

test("locked plans reserve people and facilities without consuming organization resources twice", () => {
  const candidate = proposal({
    id: "proposal:resource-after-lock",
    participantIds: ["bob"],
    participantRefs: ["actor:bob"],
    holderRefs: ["actor:bob"],
    commitments: { money: 100, manpower: 5, extraordinaryMaterials: 2, spirituality: 0 },
  });
  const [result] = adjudicateWorldActionProposals([candidate], context(), { lockedPlans: [lockedPlan()] });
  assert.equal(result.review.status, "accepted");
  assert.deepEqual(result.executionPlan.commitments, candidate.commitments);
});

test("a bounded directive executes the largest continuous fragment, then defers when no slot exists", () => {
  const partialLock = lockedPlan({ timeWindow: { startDay: 2, days: 6 } });
  const [partial] = adjudicateWorldActionProposals([proposal()], context(), { lockedPlans: [partialLock] });
  assert.equal(partial.review.status, "limited");
  assert.equal(partial.executionPlan.executable, true);
  assert.equal(partial.executionPlan.disposition, "partially-completed");
  assert.deepEqual(partial.executionPlan.timeWindow, { startDay: 1, days: 1 });
  assert.equal(partial.executionPlan.remainingDays, 1);
  assert.equal(partial.executionPlan.nextEligibleWeek, 5);
  assert.deepEqual(partial.executionPlan.commitments, { money: 5, manpower: 1, extraordinaryMaterials: 0, spirituality: 0 });

  const [deferred] = adjudicateWorldActionProposals([proposal()], context(), { lockedPlans: [lockedPlan()] });
  assert.equal(deferred.review.status, "limited");
  assert.equal(deferred.executionPlan.executable, false);
  assert.equal(deferred.executionPlan.disposition, "deferred");
  assert.equal(deferred.executionPlan.progressDelta, 0);
  assert.equal(deferred.executionPlan.nextEligibleWeek, 5);
});

test("agent proposals adapt deterministically and wait behind locked leader plans without escalation", () => {
  const raw = {
    version: 1,
    planningWeek: 4,
    agentRef: "actor:alice",
    disposition: "act",
    intent: "核对仓库出入记录",
    rationale: "货单出现了可验证的矛盾",
    locationId: "east",
    targetRefs: ["location:east"],
    requiredKnowledgeIds: ["knowledge:manifest"],
    usedMemoryIds: ["memory:alice:1"],
    planningSource: "model",
  };
  const projection = {
    week: 4,
    agent: { kind: "actor", riskTolerance: 45 },
    visibleKnowledge: [{ id: "knowledge:manifest", sourceEventId: "event:manifest" }],
  };
  const before = structuredClone(raw);
  const first = proposalFromAgentProposal(raw, projection);
  const second = proposalFromAgentProposal(raw, projection);
  assert.deepEqual(raw, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.commitments, { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 });
  assert.deepEqual(first.participantRefs, ["actor:alice"]);
  assert.deepEqual(first.targetRefs, ["location:east"]);
  assert.deepEqual(first.causeEventIds, ["event:manifest"]);

  const [waiting] = adjudicateWorldActionProposals([first], context(), { lockedPlans: [lockedPlan()] });
  assert.equal(waiting.review.status, "limited");
  assert.equal(waiting.executionPlan.disposition, "deferred");
  assert.equal(waiting.executionPlan.executable, false);
  assert.notEqual(waiting.review.status, "escalation-required");
});

test("invalid references remain rejected and ledger reviews carry execution plans and cause ids", () => {
  const invalid = proposal({
    id: "proposal:invalid",
    target: { kind: "actor", id: "unknown" },
    sourceContractId: "action:invalid",
  });
  const [adjudication] = adjudicateWorldActionProposals([invalid], context());
  assert.equal(adjudication.review.status, "rejected");
  assert.equal(adjudication.executionPlan.executable, false);

  const events = actionAdjudicationLedgerEvents([adjudication]);
  assert.deepEqual(events[0].causeEventIds, ["event:manifest"]);
  assert.deepEqual(events[0].payload.causeEventIds, ["event:manifest"]);
  assert.deepEqual(events[1].payload.causeEventIds, ["event:manifest"]);
  assert.deepEqual(events[1].payload.executionPlan, adjudication.executionPlan);
  assert.equal(events[1].payload.actionId, "action:invalid");
});

test("weekly resolution is wired to the executable plan and surfaces authorization escalations", () => {
  const source = readFileSync(new URL("../app/game-engine.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!adjudication \|\| !executionPlan\?\.executable\)/);
  assert.match(source, /money: -grantedCommitments\.money/);
  assert.match(source, /executionPlan\.timeWindow\.days/);
  assert.match(source, /extraordinaryMaterialsSpent = adjudications/);
  assert.match(source, /review\.status === "escalation-required"/);
  assert.match(source, /需要追加授权/);
  assert.match(source, /advanceOrganizationCausality\([^\n]+, executedResults, nextWeek\)/);
  assert.match(source, /dangerousPlayerResult = executedResults\.find/);
  assert.match(source, /playerActions: worldActionResults\.map/);
  assert.match(source, /playerIssuedNoOrders: worldActionResults\.length === 0/);
  assert.match(source, /actionId: result\.id/);
  const ledgerSource = readFileSync(new URL("../app/world-ledger.ts", import.meta.url), "utf8");
  assert.match(ledgerSource, /event\.payload\.status === "escalation-required" \? "escalation-required"/);
});
