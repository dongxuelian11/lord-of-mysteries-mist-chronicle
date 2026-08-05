import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { abilitiesFor, freeTravelAbility } from "../app/pathway-abilities.ts";
import { actingPrinciplesFor, advanceAdvancementStage, createAdvancementProcess, evaluateImmediateActing } from "../app/progression-system.ts";
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

test("five pathways expose authored sequence 4-0 authority rules with explicit costs and consequences", () => {
  for (const pathway of ["seer", "spectator", "apprentice", "hunter", "mystery"]) {
    const complete = abilitiesFor(pathway, 0);
    assert.equal(complete.length, 30, `${pathway} should expose three concrete abilities at every sequence`);
    for (const rank of [4, 3, 2, 1, 0]) {
      const unlockedAtRank = complete.filter((ability) => ability.unlockRank === rank);
      assert.equal(unlockedAtRank.length, 3, `${pathway} sequence ${rank} needs three authored rules`);
      assert.ok(unlockedAtRank.every((ability) => ability.authorityTier && ability.requirements?.length && ability.consequences?.length));
      assert.ok(unlockedAtRank.every((ability) => ability.contexts?.length && ability.constraints?.length && ability.scope && ability.duration));
    }
  }
});

test("high-sequence acting remains pathway-specific instead of falling back to one line", () => {
  for (const pathway of ["seer", "spectator", "apprentice", "hunter", "mystery"]) {
    const mid = actingPrinciplesFor({ ...createInitialGame(pathway), currentSequence: 5 });
    for (const rank of [4, 3, 2, 1, 0]) {
      const principles = actingPrinciplesFor({ ...createInitialGame(pathway), currentSequence: rank });
      assert.equal(principles.length, 3, `${pathway} sequence ${rank} should have three acting anchors`);
      assert.equal(new Set(principles).size, 3);
      assert.notDeepEqual(principles, mid, `${pathway} sequence ${rank} cannot reuse sequence 5 acting`);
    }
  }
});

test("free dream and spirit entry resolves to the actual unlocked ability", () => {
  const dream = freeTravelAbility("spectator", 5, "dream");
  const spirit = freeTravelAbility("apprentice", 5, "spirit");
  assert.equal(dream.id, "dream-entry");
  assert.equal(spirit.id, "spirit-travel");
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

test("a valid immediate ability use records acting insight and digestion", () => {
  const game = createInitialGame("spectator");
  const ability = abilitiesFor("spectator", 9).find((item) => item.name === "行为观察");
  assert.ok(ability);
  const record = { id: "ability-use-test", week: game.week, abilityId: ability.id, abilityName: ability.name, context: { kind: "council", label: "每周密议室" }, intent: "", observation: "目标提到名单时小指颤动。", interpretation: "这是可验证的行为矛盾，不是幕后参与的事实。", confidence: "中等", unknown: "动机未知", detection: "未察觉", cost: 1, mentalLoad: 1 };
  const mark = evaluateImmediateActing(game, ability, "只观察对方谈到名单时的细微反应，把事实、推断与情绪分开，不施加暗示。", record);
  assert.ok(mark);
  assert.ok(mark.gain >= 2);
  assert.match(mark.evidence, /行为观察/);
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
