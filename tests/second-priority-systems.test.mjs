import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { abilitiesFor } from "../app/pathway-abilities.ts";
import { actingPrinciplesFor, advanceAdvancementStage, createAdvancementProcess } from "../app/progression-system.ts";
import { advanceOrganizationCausality } from "../app/organization-causality.ts";

test("five pathways expose cumulative independent sequence 9-5 ability rules", () => {
  for (const pathway of ["seer", "spectator", "apprentice", "hunter", "mystery"]) {
    const start = abilitiesFor(pathway, 9);
    const mid = abilitiesFor(pathway, 5);
    assert.equal(start.length, 3, `${pathway} should begin with three concrete rules`);
    assert.equal(mid.length, 15, `${pathway} should accumulate fifteen concrete rules by sequence 5`);
    assert.ok(mid.every((ability) => ability.unlockRank >= 5 && ability.contexts.length && ability.constraints.length));
    assert.equal(new Set(mid.map((ability) => ability.id)).size, mid.length);
  }
});

test("advancement preserves a four-stage dossier instead of jumping one click", () => {
  const game = { ...createInitialGame("seer"), digestion: 100 };
  const process = createAdvancementProcess(game);
  assert.equal(process.stage, "配方核验");
  const verified = advanceAdvancementStage({ ...game, advancementProcess: process });
  assert.equal(verified.advancementProcess.stage, "魔药调制");
  assert.ok(verified.advancementProcess.formulaIntegrity >= 90);
  assert.ok(verified.advancementProcess.log.length >= 2);
  assert.throws(() => advanceAdvancementStage(verified), /材料尚未齐备/);
  assert.equal(verified.advancementProcess.stage, "魔药调制");
});

test("acting principles are pathway-specific and visible", () => {
  const seer = actingPrinciplesFor(createInitialGame("seer"));
  const hunter = actingPrinciplesFor(createInitialGame("hunter"));
  assert.equal(seer.length, 3);
  assert.equal(hunter.length, 3);
  assert.notDeepEqual(seer, hunter);
});

test("departments and recruits form cross-week governance pressure before irreversible outcomes", () => {
  const game = createInitialGame("spectator");
  game.departments[0].backlog = 69;
  game.recruitPool[0].relationshipMomentum = -24;
  const next = advanceOrganizationCausality(game, [], 2);
  assert.ok(next.departmentReports.some((report) => report.requiresDecision));
  assert.ok(next.organizationIssues.some((issue) => issue.category === "部门" && issue.state === "待裁决"));
  assert.ok(next.organizationIssues.some((issue) => issue.category === "招募" && issue.state === "待裁决"));
  assert.equal(next.recruitPool[0].relationshipStage, "接触");
  assert.ok(next.recruitPool[0].relationshipMomentum < -24);
});

