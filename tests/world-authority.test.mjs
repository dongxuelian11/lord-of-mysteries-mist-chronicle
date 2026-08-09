import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("world adjudicator input exposes one entity authority and omits legacy actor/faction state", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { buildWorldAdjudicatorInput } = await loadRuntimeModule("app/world-authority.ts");
  const game = createInitialGame("seer");
  const input = buildWorldAdjudicatorInput({
    game,
    resolvingWeek: 1,
    playerActions: [],
    adjudicatorWorld: { proposals: [], actors: [], factions: [], projects: [], locations: [], recentEvents: [] },
    autonomousResidency: { activeCount: 2, coldCount: 3, limit: 24 },
    dynamicMemory: "bounded memory",
    authorizedLore: "authorized lore",
    loreRecordIds: ["lore-1"],
    designerSupplement: "x".repeat(13_000),
  });
  assert.deepEqual(input.worldAuthority, {
    entityState: "adjudicatorWorld",
    stateMutation: "kernelDelta",
    compatibilityOutputs: ["factionMoves", "canonMoves"],
  });
  assert.equal(Object.hasOwn(input, "factions"), false);
  assert.equal(Object.hasOwn(input, "canonActors"), false);
  assert.equal(input.playerIssuedNoOrders, true);
  assert.equal(input.designerSupplement.length, 12_000);
  assert.deepEqual(input.adjudicatorWorld.proposals, []);
});

test("legacy UI state is a read-only projection of WorldKernel after adjudication", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { projectLegacyWorldCompatibility } = await loadRuntimeModule("app/world-authority.ts");
  const game = createInitialGame("seer");
  const before = JSON.stringify({ factions: game.factions, canonActors: game.canonActors });
  const worldKernel = structuredClone(game.worldKernel);
  const faction = worldKernel.factions.find((item) => item.id === game.factions[0].id);
  faction.posture = "内核权威姿态";
  faction.suspicion = 77;
  faction.lastAction = "内核权威行动";
  const actor = worldKernel.actors.find((item) => item.id === game.canonActors[0].id);
  actor.locationId = "east";
  actor.agenda = "内核长期目标";
  actor.condition = "内核处境";
  actor.lastAction = "内核人物行动";

  const projected = projectLegacyWorldCompatibility(game, worldKernel, [{
    actorId: game.canonActors[0].id,
    awareness: "注意",
    lastMove: "兼容输出不得覆盖内核行动",
  }]);
  assert.equal(projected.factions[0].currentPlan, "内核权威姿态");
  assert.equal(projected.factions[0].suspicion, 77);
  assert.equal(projected.factions[0].lastMove, "内核权威行动");
  assert.equal(projected.canonActors[0].location, "东区");
  assert.equal(projected.canonActors[0].agenda, "内核长期目标");
  assert.equal(projected.canonActors[0].state, "内核处境");
  assert.equal(projected.canonActors[0].lastMove, "内核人物行动");
  assert.equal(projected.canonActors[0].awareness, "注意");
  assert.equal(JSON.stringify({ factions: game.factions, canonActors: game.canonActors }), before);
});
