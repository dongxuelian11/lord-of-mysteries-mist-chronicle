import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { recalculateBacklundControl } from "../app/organization-management.ts";
import {
  createFactionStrategyState,
  projectFactionInfluenceForPlayer,
  resolveFactionStrategyRound,
  reviewFactionStrategicOrder,
} from "../app/faction-strategy.ts";

test("Backlund strategic factions receive one persistent profile and one reviewed order per round", () => {
  const game = createInitialGame("spectator");
  const state = createFactionStrategyState(game.management, game.worldKernel);
  const result = resolveFactionStrategyRound(state, game.management.map, game.management.factionHostility, game.worldKernel, 1);
  assert.deepEqual(state.profiles.map((profile) => profile.factionId).sort(), ["aurora-order", "black-market", "night-church", "police", "press", "royal-project", "steam-church", "witch-sect"]);
  assert.equal(result.orders.length, state.profiles.length);
  assert.equal(result.reviews.length, result.orders.length);
  assert.equal(result.outcomes.length, result.orders.length);
  assert.ok(result.reviews.every((review) => review.status !== "rejected"));
  assert.equal(result.state.lastResolvedWeek, 1);
});

test("secretary review rejects impossible targets and limits excessive sabotage strength", () => {
  const game = createInitialGame("seer");
  const base = game.factionStrategy;
  const point = game.management.map.districts[0].blocks[0].strategicPoints[0];
  const invalid = reviewFactionStrategicOrder({ id: "invalid", week: 1, factionId: "aurora-order", action: "contest", districtId: "missing", blockId: "missing", pointId: "missing", strength: 8, resourceCost: 4, rationale: "test" }, base, game.management.map);
  assert.equal(invalid.status, "rejected");
  const validLocation = game.management.map.districts.flatMap((district) => district.blocks.map((block) => ({ district, block }))).find(({ block }) => block.strategicPoints.some((candidate) => candidate.id === point.id));
  const limited = reviewFactionStrategicOrder({ id: "limited", week: 1, factionId: "aurora-order", action: "sabotage", districtId: validLocation.district.id, blockId: validLocation.block.id, pointId: point.id, strength: 20, resourceCost: 8, rationale: "test" }, base, game.management.map);
  assert.equal(limited.status, "limited");
  assert.equal(limited.approvedStrength, 14);
});

test("simultaneous strategic resolution changes contested influence and creates diplomacy pressure", () => {
  const game = createInitialGame("seer");
  const district = game.management.map.districts[0];
  const block = district.blocks[0];
  const target = block.strategicPoints[0];
  target.influenceByFaction = { player: 72, "night-church": 12, press: 8, police: 8 };
  const map = recalculateBacklundControl(game.management.map, 1);
  const beforePlayer = map.districts[0].blocks[0].strategicPoints[0].influenceByFaction.player;
  const hostile = game.management.factionHostility.map((entry) => ({ ...entry, hostility: 90, grievance: 90, perceivedThreat: 90 }));
  const state = createFactionStrategyState({ ...game.management, map }, game.worldKernel);
  const result = resolveFactionStrategyRound(state, map, hostile, game.worldKernel, 1);
  const afterTarget = result.map.districts[0].blocks[0].strategicPoints[0];
  assert.ok(result.orders.some((order) => order.action === "contest" || order.action === "sabotage"));
  assert.ok(result.outcomes.some((outcome) => outcome.playerInfluenceAfter < outcome.playerInfluenceBefore));
  assert.ok(afterTarget.influenceByFaction.player <= beforePlayer || result.outcomes.some((outcome) => outcome.pointId !== target.id));
  assert.ok(result.state.diplomacy.some((edge) => edge.targetFactionId === "player" && edge.pressure > 0));
  assert.deepEqual(result.hostilities.map((relation) => relation.factionId).sort(), state.profiles.map((profile) => profile.factionId).sort());
  assert.ok(result.signals.length > 0);
});

test("a faction strategy round is idempotent for the same week", () => {
  const game = createInitialGame("apprentice");
  const first = resolveFactionStrategyRound(game.factionStrategy, game.management.map, game.management.factionHostility, game.worldKernel, 1);
  const replay = resolveFactionStrategyRound(first.state, first.map, game.management.factionHostility, game.worldKernel, 1);
  assert.equal(replay.orders.length, 0);
  assert.equal(replay.outcomes.length, 0);
  assert.deepEqual(replay.map, first.map);
});

test("player intelligence controls faction identification without hiding strategic activity", () => {
  const game = createInitialGame("seer");
  const hidden = resolveFactionStrategyRound(game.factionStrategy, game.management.map, game.management.factionHostility, game.worldKernel, 1, 0);
  assert.ok(hidden.signals.every((signal) => signal.visibility === "trace" && signal.factionId === undefined));
  const hiddenTarget = hidden.orders[0].pointId;
  const hiddenPoint = hidden.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints)).find((point) => point.id === hiddenTarget);
  const hiddenProjection = projectFactionInfluenceForPlayer(hiddenPoint, hidden.state, hidden.map.playerFactionId);
  assert.ok(hiddenProjection.some((entry) => entry.key === "unknown"));
  assert.ok(hiddenPoint.intelligenceIds.some((id) => id.startsWith("strategy-signal:")));

  const informed = resolveFactionStrategyRound(game.factionStrategy, game.management.map, game.management.factionHostility, game.worldKernel, 1, 100);
  assert.ok(informed.signals.every((signal) => signal.visibility === "confirmed" && signal.factionId));
  const informedTarget = informed.orders[0].pointId;
  const informedPoint = informed.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints)).find((point) => point.id === informedTarget);
  const informedProjection = projectFactionInfluenceForPlayer(informedPoint, informed.state, informed.map.playerFactionId);
  assert.ok(informedProjection.some((entry) => entry.factionId === informed.orders[0].factionId));
});
