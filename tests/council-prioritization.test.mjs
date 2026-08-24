import assert from "node:assert/strict";
import test from "node:test";

import { buildCouncilMatters } from "../app/council-focus.ts";
import { createInitialGame } from "../app/game-model.ts";

function mission(id, urgency) {
  return {
    id,
    title: `压力 ${id}`,
    premise: `压力 ${id} 已经形成可见征兆。`,
    deadline: 2,
    urgency,
    progress: 35,
    consequence: `若不处理，${id} 会继续扩大。`,
    hints: ["核验第一条线索"],
    state: "active",
  };
}

test("a normal council reserves one seat for strategy and admits at most two pressures", () => {
  const game = createInitialGame("seer");
  game.playerIntents = [{ id: "strategy-1", text: "建立覆盖东区的可靠情报网络", pinned: true, state: "active" }];
  game.missions = [mission("a", 92), mission("b", 80), mission("c", 70)];
  game.organizationIssues = [{
    id: "issue-1",
    weekCreated: game.week,
    category: "资源",
    sourceId: "resources",
    title: "一条资源异常",
    summary: "采购渠道正在收紧。",
    urgency: 88,
    deadline: game.week + 1,
    signals: ["继续拖延会失去渠道"],
    state: "待裁决",
  }];

  const matters = buildCouncilMatters(game);
  assert.equal(matters.length, 3);
  assert.equal(matters[0].kind, "strategy");
  assert.equal(matters.filter((matter) => matter.kind === "world-pressure" || matter.kind === "organization-exception").length, 2);
  assert.match(matters[0].title, /情报网络/);
});

test("ordinary department reports stay below the leadership attention boundary", () => {
  const game = createInitialGame("seer");
  game.missions = [];
  game.organizationIssues = [];
  game.departmentReports = [{ id: "routine", week: game.week, departmentId: "records", headline: "档案已整理", detail: "日常工作完成。", consequence: "继续自动运行。", requiresDecision: false }];

  const matters = buildCouncilMatters(game);
  assert.equal(matters.length, 1);
  assert.equal(matters[0].kind, "strategy");
  assert.ok(matters.every((matter) => matter.sourceRef !== "department-report:routine"));
});

test("survival crises may occupy all three seats and name the interrupted strategy", () => {
  const game = createInitialGame("seer");
  game.playerIntents = [{ id: "strategy-1", text: "稳固北区的长期盟友网络", pinned: true, state: "active" }];
  game.missions = [mission("a", 99), mission("b", 97), mission("c", 95), mission("d", 90)];
  game.ending = { ...game.ending, phase: "major-event" };

  const matters = buildCouncilMatters(game);
  assert.equal(matters.length, 3);
  assert.ok(matters.every((matter) => matter.kind !== "strategy"));
  assert.ok(matters.every((matter) => matter.strategyImpact === "interrupted"));
  assert.ok(matters.every((matter) => /中断了长期方向“稳固北区的长期盟友网络”/.test(matter.strategyNote)));
});

test("authorization exceptions become a player-facing ruling with visible causal names only", () => {
  const game = createInitialGame("seer");
  game.playerIntents = [{ id: "strategy-intent-secret", text: "稳固东区情报网", pinned: true, state: "active" }];
  game.chronicle = [{
    results: [{ id: "directive-origin-secret", title: "追查失踪者的共同活动地点", contract: { id: "directive-origin-secret" } }],
  }];
  game.worldKernel.events.push(
    { id: "event-visible-secret", week: game.week, title: "码头出现重复的失踪者签名", detail: "玩家已经获知。", actorIds: [], factionIds: [], causeIds: [], visibility: "player" },
    { id: "event-hidden-secret", week: game.week, title: "幕后人物的真实安排", detail: "玩家不可知。", actorIds: [], factionIds: [], causeIds: [], visibility: "world" },
  );
  game.worldKernel.observations.push({
    id: "observation-visible-secret",
    week: game.week,
    eventId: "event-visible-secret",
    channel: "码头出现重复的失踪者签名",
    text: "玩家已经从可靠回报中获知码头出现重复的失踪者签名。",
    visibility: "player",
    holderIds: ["player"],
    holderRefs: ["player"],
    perceivedRefs: [],
    acquisitionKind: "communication",
  });
  game.worldLedger.events.push(
    { id: "ledger-visible-secret", summary: "可靠成员确认了第二处交会点", witnessRefs: [], audience: { visibility: "actors", holderRefs: ["player"] } },
    { id: "ledger-hidden-secret", summary: "敌对势力的隐秘裁定", witnessRefs: [], audience: { visibility: "world", holderRefs: [] } },
  );
  game.missions = [];
  game.organizationIssues = [{
    id: "issue-authorization",
    weekCreated: game.week,
    category: "成员",
    sourceId: "operations",
    title: "追查行动需要追加授权",
    summary: "后台原始裁定不应直接显示。",
    urgency: 90,
    deadline: game.week + 1,
    signals: ["执行时段发生内部冲突"],
    state: "待裁决",
    originActionId: "directive-origin-secret",
    strategyIntentId: "strategy-intent-secret",
    causeEventIds: ["event-visible-secret", "event-hidden-secret", "ledger-visible-secret", "ledger-hidden-secret"],
    directiveState: "awaiting-authorization",
  }];

  const matter = buildCouncilMatters(game).find((item) => item.id === "issue-authorization");
  assert.equal(matter.attentionState, "needs-ruling");
  assert.equal(matter.strategyImpact, "interrupted");
  assert.equal(matter.whatHappened, "负责人按你的边界停下了，没有擅自执行。");
  assert.match(matter.causalNote, /追查失踪者的共同活动地点/);
  assert.match(matter.causalNote, /稳固东区情报网/);
  assert.match(matter.causalNote, /码头出现重复的失踪者签名/);
  assert.match(matter.causalNote, /可靠成员确认了第二处交会点/);
  assert.doesNotMatch(matter.causalNote, /event-visible-secret|event-hidden-secret|ledger-visible-secret|ledger-hidden-secret|幕后人物|敌对势力/);
  assert.doesNotMatch(`${matter.whatHappened}${matter.whyNow}${matter.neglectOutcome}`, /执行时段|第\s*\d+\s*日|改期/);
});

test("unfinished directives use player language without exposing the internal runner", () => {
  const expected = new Map([
    ["deferred", ["deferred", /条件不足以安全展开/]],
    ["partially-completed", ["partially-completed", /一部分真实变化/]],
    ["interrupted", ["interrupted", /触及你设定的红线或停止条件/]],
  ]);

  for (const [directiveState, [attentionState, copy]] of expected) {
    const game = createInitialGame("seer");
    game.missions = [];
    game.organizationIssues = [{
      id: `issue-${directiveState}`,
      weekCreated: game.week,
      category: "成员",
      sourceId: "operations",
      title: "尚未结束的行动",
      summary: "内部执行记录",
      urgency: 80,
      deadline: game.week + 1,
      signals: ["第 3 日再次执行"],
      state: "待裁决",
      directiveState,
    }];

    const matter = buildCouncilMatters(game).find((item) => item.id === `issue-${directiveState}`);
    assert.equal(matter.attentionState, attentionState);
    assert.match(matter.whatHappened, copy);
    assert.doesNotMatch(`${matter.whatHappened}${matter.whyNow}${matter.neglectOutcome}`, /第\s*\d+\s*日|改期|内部执行记录/);
  }
});

test("every surfaced matter carries the decision brief needed by the player", () => {
  const game = createInitialGame("seer");
  game.missions = [mission("a", 85)];

  for (const matter of buildCouncilMatters(game)) {
    for (const key of ["whatHappened", "whyNow", "pastDecision", "attentionState", "causalNote", "recommendation", "alternative", "delegationRisk", "interventionRisk", "neglectOutcome", "discussionSeed", "decisionSeed"]) {
      assert.ok(matter[key]?.trim(), `${matter.id} is missing ${key}`);
    }
  }
});

test("each surfaced matter carries distinct, bounded advisor proposals", () => {
  const game = createInitialGame("seer");
  game.playerIntents = [{ id: "strategy-1", text: "建立东区的可靠情报网络", pinned: true, state: "active" }];
  game.missions = [mission("a", 90)];
  const scheduleBefore = game.schedule.map((action) => action.id);
  const matter = buildCouncilMatters(game)[0];

  assert.equal(matter.proposals.length, 3);
  assert.equal(new Set(matter.proposals.map((proposal) => proposal.text)).size, 3);
  assert.equal(matter.proposals.filter((proposal) => proposal.kind === "recommended").length, 1);
  assert.equal(matter.proposals.filter((proposal) => proposal.kind === "alternative").length, 2);
  for (const proposal of matter.proposals) {
    assert.ok(proposal.advisorName);
    assert.ok(proposal.stance);
    assert.ok(proposal.basis);
    assert.ok(proposal.resourceLabel);
    assert.ok(proposal.risk);
    assert.ok(proposal.consultWhen);
    assert.doesNotMatch(proposal.basis, /秘密|secret|隐藏事实/);
  }
  assert.deepEqual(game.schedule.map((action) => action.id), scheduleBefore);
});
