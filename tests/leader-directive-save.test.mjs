import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { normalizeStoredGame } from "../app/save-system.ts";

function legacyContract(overrides = {}) {
  return {
    id: "legacy-directive",
    rawIntent: "让格雷核对码头货单，不要接触教会；一旦被跟踪就撤回。",
    title: "核对码头货单",
    kind: "调查",
    target: "码头货单",
    desiredOutcome: "确认货物流向",
    approach: "只核对公开记录",
    leaderId: "member-grey",
    memberIds: ["member-grey"],
    districtId: "dock",
    abilityIds: [],
    days: 2,
    budget: 37,
    risk: "中",
    knownFacts: "货单编号重复",
    hypothesis: "有人替换了其中一页",
    unknowns: "替换者身份未知",
    redLines: "不得接触教会，不得惊动货主",
    retreat: "发现被跟踪时立即撤回",
    focus: false,
    legacyMarker: "must-survive",
    ...overrides,
  };
}

function gameWithContracts(scheduleContract, resultContract, scheduleOverrides = {}) {
  const game = createInitialGame("seer");
  return {
    ...game,
    schedule: [{ ...scheduleContract, status: "planned", startDay: 2, ...scheduleOverrides }],
    chronicle: [{
      id: "chapter-legacy-directive",
      week: 1,
      date: game.date,
      title: "旧周报",
      source: "local",
      sections: [{ heading: "结果", paragraphs: ["货单已经核对。"] }],
      results: [{
        id: "result-legacy-directive",
        title: "核对码头货单",
        outcome: "部分成功",
        contract: resultContract,
        findings: ["编号确有重复"],
        consequence: "货主开始收紧档案权限",
        abilityEffects: [],
        digestionGain: 0,
        missionProgress: 0,
        resourceChanges: { money: -37, secrecy: 0, stability: 0, influence: 0 },
        legacyResultMarker: "keep-result-fields",
      }],
      summary: "组织确认货单存在异常。",
    }],
  };
}

test("legacy leader directives are additively normalized without mutating the input", () => {
  const input = gameWithContracts(legacyContract(), legacyContract({ id: "legacy-result-contract", budget: 19 }));
  const before = structuredClone(input);

  const normalized = normalizeStoredGame(input);

  assert.deepEqual(input, before);
  assert.deepEqual(normalized.schedule[0].resourceCommitment, {
    posture: "balanced",
    money: 37,
    manpower: 0,
    extraordinaryMaterials: 0,
  });
  assert.deepEqual(normalized.schedule[0].authorization, {
    scope: "bounded",
    redLines: ["不得接触教会，不得惊动货主"],
    mustEscalateWhen: [],
    retreatCondition: "发现被跟踪时立即撤回",
  });
  assert.deepEqual(normalized.schedule[0].requiredKnowledgeIds, []);
  assert.deepEqual(normalized.schedule[0].causeEventIds, []);
  assert.equal(normalized.schedule[0].legacyMarker, "must-survive");
  assert.equal(normalized.schedule[0].status, "planned");
  assert.equal(normalized.schedule[0].startDay, 2);
  assert.deepEqual(normalized.schedule[0].execution, {
    originWeek: input.week,
    attemptOrdinal: 0,
    status: "planned",
    progress: 0,
    consumed: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
    nextEligibleWeek: input.week,
    consequenceEventIds: [],
  });

  const result = normalized.chronicle[0].results[0];
  assert.equal(result.executionStatus, "executed");
  assert.equal(result.executionPlan, undefined);
  assert.equal(result.contract.resourceCommitment.money, 19);
  assert.deepEqual(result.contract.authorization.redLines, ["不得接触教会，不得惊动货主"]);
  assert.deepEqual(result.contract.requiredKnowledgeIds, []);
  assert.deepEqual(result.contract.causeEventIds, []);
  assert.equal(result.contract.legacyMarker, "must-survive");
  assert.equal(result.legacyResultMarker, "keep-result-fields");
});

test("current leader directive fields survive normalization unchanged", () => {
  const current = legacyContract({
    id: "current-directive",
    resourceCommitment: { posture: "substantial", money: 81, manpower: 6, extraordinaryMaterials: 2 },
    authorization: {
      scope: "strict",
      redLines: ["不得伤害平民"],
      mustEscalateWhen: ["发现高序列者"],
      retreatCondition: "封印物失稳时撤退",
    },
    requiredKnowledgeIds: ["knowledge:manifest"],
    causeEventIds: ["event:missing-cargo"],
  });
  const input = gameWithContracts(current, structuredClone(current));

  const normalized = normalizeStoredGame(input);

  for (const contract of [normalized.schedule[0], normalized.chronicle[0].results[0].contract]) {
    assert.deepEqual(contract.resourceCommitment, current.resourceCommitment);
    assert.deepEqual(contract.authorization, current.authorization);
    assert.deepEqual(contract.requiredKnowledgeIds, current.requiredKnowledgeIds);
    assert.deepEqual(contract.causeEventIds, current.causeEventIds);
    assert.equal(contract.legacyMarker, "must-survive");
  }
});

test("resolved legacy directives never re-enter the active schedule", () => {
  const input = gameWithContracts(legacyContract(), legacyContract(), { status: "resolved" });
  const before = structuredClone(input);

  const normalized = normalizeStoredGame(input);

  assert.deepEqual(input, before);
  assert.deepEqual(normalized.schedule, []);
  assert.equal(normalized.chronicle[0].results[0].executionStatus, "executed");
  assert.equal(normalized.chronicle[0].results[0].contract.id, "legacy-directive");
});

test("cross-week execution progress, cumulative consumption, and eligibility survive normalization", () => {
  const current = legacyContract({
    id: "continued-directive",
    resourceCommitment: { posture: "substantial", money: 120, manpower: 6, extraordinaryMaterials: 3 },
    authorization: {
      scope: "bounded",
      redLines: ["不得伤害平民"],
      mustEscalateWhen: ["需要扩大资源时"],
      retreatCondition: "身份暴露时撤退",
    },
    requiredKnowledgeIds: ["knowledge:manifest"],
    causeEventIds: ["event:missing-cargo"],
  });
  const execution = {
    originWeek: 3,
    attemptOrdinal: 2,
    status: "partially-completed",
    progress: 45,
    consumed: { money: 51, manpower: 5, extraordinaryMaterials: 1, spirituality: 2 },
    nextEligibleWeek: 8,
    lastAttemptId: "attempt:continued-directive:2",
    lastReason: "暴雨使码头封闭",
    consequenceEventIds: ["event:manifest-copied"],
  };
  const executionPlan = {
    proposalId: "proposal:7:continued-directive",
    attemptId: "attempt:continued-directive:2",
    executable: true,
    participantIds: ["member-grey"],
    participantRefs: ["actor:member-grey"],
    targetRefs: ["location:dock"],
    commitments: { money: 21, manpower: 3, extraordinaryMaterials: 1, spirituality: 2 },
    timeWindow: { startDay: 2, days: 1 },
    authorization: current.authorization,
    visibility: "actors",
    holderRefs: ["actor:member-grey"],
    causeEventIds: ["event:missing-cargo"],
    adjustments: ["只完成货单抄录"],
    disposition: "partially-completed",
    progressDelta: 20,
    remainingDays: 1,
    nextEligibleWeek: 8,
    interruptionReason: "暴雨封港",
  };
  const input = gameWithContracts(current, structuredClone(current), {
    status: "partially-completed",
    execution,
  });
  input.week = 7;
  input.chronicle[0].results[0].executionStatus = "partially-completed";
  input.chronicle[0].results[0].executionPlan = executionPlan;
  const before = structuredClone(input);

  const normalized = normalizeStoredGame(input);

  assert.deepEqual(input, before);
  assert.deepEqual(normalized.schedule[0].execution, execution);
  assert.equal(normalized.schedule[0].status, "partially-completed");
  assert.deepEqual(normalized.chronicle[0].results[0].executionPlan, executionPlan);
  assert.equal(normalized.chronicle[0].results[0].executionStatus, "partially-completed");
});

test("malformed execution counters are bounded without changing the save schema", () => {
  const input = gameWithContracts(legacyContract(), legacyContract(), {
    status: "deferred",
    execution: {
      originWeek: 999,
      attemptOrdinal: -4,
      status: "deferred",
      progress: 140,
      consumed: { money: -20, manpower: -1, extraordinaryMaterials: -2, spirituality: -3 },
      nextEligibleWeek: -8,
      consequenceEventIds: ["event:valid", 42],
    },
  });
  const schemaVersion = input.version;

  const normalized = normalizeStoredGame(input);

  assert.equal(normalized.version, schemaVersion);
  assert.equal(normalized.schedule[0].execution.originWeek, input.week);
  assert.equal(normalized.schedule[0].execution.attemptOrdinal, 0);
  assert.equal(normalized.schedule[0].execution.progress, 100);
  assert.deepEqual(normalized.schedule[0].execution.consumed, { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 });
  assert.equal(normalized.schedule[0].execution.nextEligibleWeek, 1);
  assert.deepEqual(normalized.schedule[0].execution.consequenceEventIds, ["event:valid"]);
});

test("six causal receipt groups survive save normalization without exposing malformed entries", () => {
  const input = gameWithContracts(legacyContract(), legacyContract());
  input.chronicle[0].results[0].causalReceipts = {
    people: [{ id: "person:1", summary: "格雷完成了可确认的撤离。", entityRefs: ["actor:member-grey"], sourceEventIds: ["event:withdrawal"] }],
    resources: [{ id: "resource:1", summary: "实际消耗资金12。", entityRefs: ["organization"], sourceEventIds: [] }],
    locations: [{ id: "location:1", summary: "码头联络点更换了门锁。", entityRefs: ["location:dock"], sourceEventIds: ["event:withdrawal"] }],
    knowledge: [{ id: "knowledge:1", summary: "组织确认货单编号重复。", entityRefs: ["knowledge:manifest"], sourceEventIds: ["event:withdrawal"] }],
    relationships: [{ id: "relationship:1", summary: "货主与组织的关系转为戒备。", entityRefs: [], sourceEventIds: ["event:withdrawal"] }],
    futureCauses: [{ id: "future:1", summary: "更换门锁会影响下一次核验。", entityRefs: ["location:dock"], sourceEventIds: ["event:withdrawal"] }, { id: "bad", summary: "", entityRefs: [], sourceEventIds: [] }],
  };
  const normalized = normalizeStoredGame(input);
  const receipts = normalized.chronicle[0].results[0].causalReceipts;
  assert.deepEqual(Object.keys(receipts).sort(), ["futureCauses", "knowledge", "locations", "people", "relationships", "resources"]);
  assert.equal(receipts.futureCauses.length, 1);
  assert.equal(receipts.people[0].summary, "格雷完成了可确认的撤离。");
});
