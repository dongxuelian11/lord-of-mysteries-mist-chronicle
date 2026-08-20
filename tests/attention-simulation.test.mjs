import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import {
  advanceAttentionSimulation,
  attentionAutomationCandidates,
  confirmAttentionAutomation,
  focusAttention,
  projectAttentionForPlayer,
  reopenAttention,
} from "../app/attention-simulation.ts";
import { buildCouncilMatters } from "../app/council-focus.ts";
import { normalizeStoredGame } from "../app/save-system.ts";

function stableGame() {
  const game = createInitialGame();
  return {
    ...game,
    departments: game.departments.map((department) => ({
      ...department,
      lastReport: `${department.name}按常设命令完成了本周核验。`,
      capacity: 60,
      cohesion: 72,
      exposure: 8,
      backlog: 18,
    })),
  };
}

test("确认后的成熟流程只在原边界内自动运行，并留下可重新展开入口", () => {
  const game = stableGame();
  const candidate = attentionAutomationCandidates(game).find((item) => item.id === "department:field");
  assert.ok(candidate?.ready);
  const confirmed = confirmAttentionAutomation(game.attentionSimulation, candidate, 2);
  const before = JSON.stringify({ money: game.money, management: game.management, kernel: game.worldKernel });
  const advanced = advanceAttentionSimulation(confirmed, { week: 3, organizationIssues: [] });
  assert.equal(advanced.approvals[0].status, "confirmed");
  assert.equal(advanced.approvals[0].lastRunWeek, 3);
  assert.equal(advanced.approvals[0].runCount, 1);
  assert.match(advanced.backgroundSummaries[0], /继续按已确认的边界/);
  assert.equal(JSON.stringify({ money: game.money, management: game.management, kernel: game.worldKernel }), before);
  const focused = focusAttention(advanced, candidate.id);
  const projection = projectAttentionForPlayer({ ...game, attentionSimulation: focused });
  assert.equal(projection.items[0].focused, true);
  assert.equal(projection.items[0].reopenable, true);
  assert.match(projection.items[0].detail, /负责人、相关地点与情报/);
  assert.match(projection.notice, /不提供数值加成/);
});

test("未确认或有异常的流程不会自行扩大授权", () => {
  const game = stableGame();
  const candidate = attentionAutomationCandidates(game).find((item) => item.id === "department:field");
  assert.ok(candidate?.ready);
  const confirmed = confirmAttentionAutomation(game.attentionSimulation, candidate, 2);
  const reviewed = advanceAttentionSimulation(confirmed, {
    week: 3,
    organizationIssues: [{ sourceId: "field", category: "部门", state: "待裁决", urgency: 86 }],
  });
  assert.equal(reviewed.approvals[0].status, "needs-review");
  assert.equal(reviewed.approvals[0].lastRunWeek, 0);
  assert.match(projectAttentionForPlayer({ ...game, attentionSimulation: reviewed }).items[0].detail, /停下等待判断/);
  const resumed = confirmAttentionAutomation(reviewed, candidate, 4);
  assert.equal(resumed.approvals[0].status, "confirmed");

  const unstable = {
    ...game,
    departments: game.departments.map((department) => department.id === "field" ? { ...department, backlog: 90 } : department),
  };
  const notReady = attentionAutomationCandidates(unstable).find((item) => item.id === "department:field");
  assert.equal(notReady?.ready, false);
  assert.throws(() => confirmAttentionAutomation(unstable.attentionSimulation, notReady, 2), /稳定/);
});

test("早期区块仍可被重新展开，注意力状态不删除地图事实，议会仍保持三件大事纪律", () => {
  const game = stableGame();
  const candidate = attentionAutomationCandidates(game).find((item) => item.id === "department:field");
  const confirmed = confirmAttentionAutomation(game.attentionSimulation, candidate, 2);
  const focused = focusAttention(confirmed, candidate.id);
  const reopenedEarlyDistrict = reopenAttention(focused, "district:east");
  assert.equal(game.management.map.districts.length > 0, true);
  assert.equal(reopenedEarlyDistrict.reopenedRefs.includes(candidate.id), true);
  assert.equal(reopenedEarlyDistrict.reopenedRefs.includes("district:east"), true);
  assert.equal(game.management.map.districts.some((district) => district.id === "east"), true);
  assert.ok(buildCouncilMatters({ ...game, attentionSimulation: focused }).length <= 3);
});

test("旧存档缺少注意力字段时安全补默认，坏引用不会进入玩家投影", () => {
  const game = stableGame();
  const restored = normalizeStoredGame({ ...game, attentionSimulation: { approvals: [{ id: "department:field", label: "外勤", status: "confirmed", sourceRefs: ["department:field"] }], focusRefs: ["secret:hidden"], reopenedRefs: ["district:east"], backgroundSummaries: ["稳定流程继续运行"] } });
  assert.equal(restored.attentionSimulation?.approvals.length, 1);
  assert.deepEqual(restored.attentionSimulation?.focusRefs, ["secret:hidden"]);
  assert.deepEqual(restored.attentionSimulation?.reopenedRefs, ["district:east"]);
  assert.equal(projectAttentionForPlayer(restored).items[0].focused, false);
});
