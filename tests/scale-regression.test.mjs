import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCouncilMatters } from "../app/council-focus.ts";
import { createInitialGame } from "../app/game-model.ts";
import { advanceAttentionSimulation } from "../app/attention-simulation.ts";
import { advanceOrganizationCausality } from "../app/organization-causality.ts";
import { normalizeStoredGame } from "../app/save-system.ts";
import { commitWorldLedgerWeek, ledgerChecksum, replayWorldLedger, verifyWorldLedger } from "../app/world-ledger.ts";

function runWeeks(total) {
  let game = createInitialGame();
  const checkpoints = new Map();
  for (let index = 0; index < total; index += 1) {
    const nextWeek = game.week + 1;
    const causality = advanceOrganizationCausality(game, [], nextWeek);
    const nextState = {
      ...game,
      week: nextWeek,
      departments: causality.departments,
      departmentReports: causality.departmentReports,
      organizationIssues: causality.organizationIssues,
      members: causality.members,
      recruitPool: causality.recruitPool,
      attentionSimulation: advanceAttentionSimulation(game.attentionSimulation, { week: nextWeek, organizationIssues: causality.organizationIssues }),
      chronicle: [{ id: `scale:${nextWeek}`, week: nextWeek, date: game.date, title: "规模测试", source: "local", sections: [], results: [], summary: "常规流程按既有边界继续运行。" }, ...game.chronicle],
    };
    game = { ...nextState, worldLedger: commitWorldLedgerWeek(game.worldLedger, nextState) };
    assert.ok(buildCouncilMatters(game).length <= 3, `第${game.week}周超过三件大事`);
    if ([10, 30, 100].includes(game.week)) checkpoints.set(game.week, game);
  }
  return { game, checkpoints };
}

test("10/30/100周长跑保持三件大事纪律，并可从保存状态继续", () => {
  const { game, checkpoints } = runWeeks(100);
  assert.equal(game.week, 101);
  assert.deepEqual([...checkpoints.keys()], [10, 30, 100]);
  for (const [week, checkpoint] of checkpoints) {
    const restored = normalizeStoredGame(JSON.parse(JSON.stringify(checkpoint)));
    assert.equal(restored.week, week);
    assert.equal(buildCouncilMatters(restored).length <= 3, true);
    assert.equal(verifyWorldLedger(restored.worldLedger).ok, true);
    assert.deepEqual(replayWorldLedger(restored.worldLedger), replayWorldLedger(checkpoint.worldLedger));
  }
});

test("长跑结果是确定的，保存读取不会改写账本或历史章节", () => {
  const first = runWeeks(100).game;
  const second = runWeeks(100).game;
  assert.equal(first.week, second.week);
  assert.equal(ledgerChecksum(first.worldLedger), ledgerChecksum(second.worldLedger));
  assert.deepEqual(first.chronicle, second.chronicle);
  assert.deepEqual(first.organizationIssues, second.organizationIssues);
  const restored = normalizeStoredGame(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(restored.chronicle, first.chronicle);
  assert.equal(ledgerChecksum(restored.worldLedger), ledgerChecksum(first.worldLedger));
});

test("组织规模增长只扩大后台状态，不线性扩大默认操作面", async () => {
  const [councilSource, ledgerSource] = await Promise.all([
    readFile(new URL("../app/weekly-council.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/organization-management-console.tsx", import.meta.url), "utf8"),
  ]);
  const game = createInitialGame();
  const expanded = {
    ...game,
    organizationIssues: Array.from({ length: 120 }, (_, index) => ({
      id: `issue-${index}`,
      weekCreated: 1,
      category: "部门",
      sourceId: "field",
      title: `长期压力${index}`,
      summary: "仍待判断的压力",
      urgency: 60,
      deadline: 4,
      signals: [],
      state: "待裁决",
    })),
    members: Array.from({ length: 100 }, (_, index) => ({ ...game.members[0], id: `member-${index}`, name: `成员${index}` })),
  };
  assert.ok(buildCouncilMatters(expanded).length <= 3);
  assert.match(councilSource, /slice\(0, 3\)/);
  assert.match(ledgerSource, /attentionProjection\.items\.slice\(0, 4\)/);
  assert.match(ledgerSource, /activeBranches\.slice\(0, 3\)/);
  assert.doesNotMatch(councilSource, /第\$\{.*\}天|action\.days|action\.startDay/);
});
