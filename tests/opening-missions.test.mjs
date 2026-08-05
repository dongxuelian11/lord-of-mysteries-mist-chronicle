import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, createOpeningMission, ORGANIZATION_KINDS } from "../app/game-model.ts";

test("opening missions differ by organization kind and stay identity-aware", () => {
  const titles = ORGANIZATION_KINDS.map((kind) => createOpeningMission({ organizationKind: kind.id, identityLabel: "私人调查事务所经营者" }).title);
  assert.equal(new Set(titles).size, ORGANIZATION_KINDS.length);
  for (const kind of ORGANIZATION_KINDS) {
    const mission = createOpeningMission({ organizationKind: kind.id, identityLabel: "社区医生" });
    assert.ok(mission.hints.length >= 3);
    assert.ok(mission.premise.includes("社区医生"));
    assert.equal(mission.state, "active");
    assert.ok(mission.deadline >= 2 && mission.deadline <= 4);
  }
});

test("new games carry gender, age and organization defaults", () => {
  const game = createInitialGame("seer");
  assert.equal(game.playerOrigin.gender, "");
  assert.equal(game.playerOrigin.age, "");
  assert.equal(game.playerOrigin.organizationKind, "detective");
  assert.equal(game.playerOrigin.organizationKindLabel, "侦探事务所");
  assert.equal(game.playerOrigin.organizationName, "鸦羽侦探事务所");
});

test("new games start with the kind-specific opening mission instead of first-knock", () => {
  const game = createInitialGame("seer");
  assert.equal(game.missions[0].id, "opening-detective");
  assert.ok(!game.missions.some((mission) => mission.id === "first-knock"));
});

test("non-detective new games contain no pendant storyline hardcode", () => {
  for (const kind of ORGANIZATION_KINDS) {
    if (kind.id === "detective") continue;
    const game = createInitialGame("seer", { organizationKind: kind.id, identityLabel: "社区医生" });
    const blob = JSON.stringify({ facts: game.facts, evidence: game.evidenceNodes, opportunities: game.opportunities, inventory: game.inventory, hidden: game.hiddenWorldFacts, missions: game.missions, cases: game.cases });
    assert.doesNotMatch(blob, /挂坠|敲门|信使|工人名单/);
    assert.equal(game.missions[0].id, `opening-${kind.id}`);
  }
});
