import assert from "node:assert/strict";
import test from "node:test";

import { createFinaleCampaign } from "../app/finale-system.ts";
import { createInitialGame } from "../app/game-model.ts";
import { createSaveEnvelope, parseSaveEnvelope, savePreview } from "../app/save-system.ts";
import { buildSpatialIntelligence, estimateRoute } from "../app/spatial-intelligence.ts";

test("the map computes bounded travel ranges and keeps player hypotheses epistemically separate", () => {
  const game = createInitialGame("apprentice");
  game.routeHypotheses = [{ id: "h1", createdWeek: 1, fromDistrictId: "cherwood", toDistrictId: "dock", statement: "货物可能经桥区转运", status: "玩家假设" }];
  const estimate = estimateRoute(game, "cherwood", "dock");
  assert.ok(estimate.districtIds.includes("bridge"));
  assert.ok(estimate.minutes[1] > estimate.minutes[0]);
  const intelligence = buildSpatialIntelligence(game, 1);
  assert.equal(intelligence.routes.find((item) => item.id.includes("hypothesis"))?.status, "玩家假设");
});

test("a save export validates checksum and contains no AI credentials", () => {
  const game = createInitialGame("seer");
  game.prologueComplete = true;
  const envelope = createSaveEnvelope(game);
  const parsed = parseSaveEnvelope(JSON.stringify(envelope));
  assert.equal(parsed.game.version, 15);
  assert.equal(savePreview(parsed).week, game.week);
  assert.doesNotMatch(JSON.stringify(envelope), /apiKey|session-ai-key/);
  envelope.game.organizationName = "被修改";
  assert.throws(() => parseSaveEnvelope(JSON.stringify(envelope)), /校验失败/);
});

test("the finale grows fronts from persistent world state instead of a fixed stage table", () => {
  const game = createInitialGame("spectator");
  game.worldKernel.locations = game.worldKernel.locations.map((location, index) => ({ ...location, risk: 55 + index, conditions: [`第${index + 1}项区域压力`] }));
  const campaign = createFinaleCampaign(game);
  assert.ok(campaign.crises.length >= 2 && campaign.crises.length <= 4);
  assert.ok(campaign.crises.every((crisis) => crisis.sourceFactIds?.length));
  assert.equal(campaign.reports.length, 0);
});
