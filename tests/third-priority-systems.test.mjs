import assert from "node:assert/strict";
import test from "node:test";

import { autoDeployFinale, chooseFinaleDoctrine, createFinaleCampaign, refreshFinaleFronts, resolveFinalePhase } from "../app/finale-system.ts";
import { createInitialGame } from "../app/game-model.ts";
import { continueAsSuccessor } from "../app/succession-system.ts";
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
  assert.equal(parsed.game.version, 21);
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

test("a resolved finale stage exposes concrete action contracts to the AI world simulator", () => {
  const base = createInitialGame("spectator");
  const finale = { ...base, ending: { ...base.ending, phase: "finale", campaign: createFinaleCampaign(base) } };
  const deployed = autoDeployFinale(chooseFinaleDoctrine(finale, "改变"));
  const resolved = resolveFinalePhase(deployed);
  const chapter = resolved.chronicle[0];
  assert.equal(chapter.results.length, deployed.ending.campaign.crises.length);
  assert.ok(chapter.results.every((result) => result.contract.rawIntent.includes("改变")));
  assert.ok(chapter.results.every((result) => result.contract.redLines.includes("死亡")));
  const refreshed = refreshFinaleFronts(resolved);
  if (refreshed.ending.phase === "finale") assert.ok(refreshed.ending.campaign.crises.every((crisis) => crisis.sourceFactIds?.length));
});

test("the Great Smog resolves as a major stage and returns to the living world", () => {
  const base = createInitialGame("spectator");
  let state = { ...base, ending: { ...base.ending, phase: "major-event", campaign: createFinaleCampaign(base) } };
  state = chooseFinaleDoctrine(state, "改变");
  for (let index = 0; index < 8 && state.ending.phase === "major-event"; index += 1) {
    state = resolveFinalePhase(autoDeployFinale(state));
  }
  assert.equal(state.ending.phase, "running");
  assert.equal(state.ending.campaign, undefined);
  assert.ok(state.timeline.find((event) => event.id === "tl-great-smog").status !== "upcoming");
  assert.ok(state.facts.some((fact) => fact.subject === "贝克兰德大雾霾" && fact.statement.includes("世界在余波中继续推演")));
});

test("player death offers a named Beyonder successor without resetting the world", () => {
  const base = createInitialGame("seer");
  const successor = base.members.find((member) => member.pathway);
  const dead = { ...base, week: 19, deviation: 17, playerCondition: { ...base.playerCondition, alive: false, health: 0 }, ending: { phase: "ended", title: "负责人死亡", sandboxUnlocked: false } };
  const resumed = continueAsSuccessor(dead, successor.id);
  assert.equal(resumed.ending.phase, "running");
  assert.equal(resumed.playerName, successor.name);
  assert.equal(resumed.week, 19);
  assert.equal(resumed.deviation, 17);
  assert.ok(!resumed.members.some((member) => member.id === successor.id));
  assert.ok(resumed.facts.some((fact) => fact.subject === "组织继任"));
});
