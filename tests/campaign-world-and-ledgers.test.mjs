import assert from "node:assert/strict";
import test from "node:test";

import { LORE_RECORDS } from "../app/generated-lore-compendium.ts";
import { createInitialGame, PATHWAYS } from "../app/game-model.ts";
import { abilitiesFor } from "../app/pathway-abilities.ts";
import { PATHWAY_SEQUENCE_LEDGER, validatePathwaySequenceLedger } from "../app/pathway-sequence-ledger.ts";
import {
  claimHighSequenceCharacteristic,
  claimPathwaySefirot,
  claimPathwayUniqueness,
  createHighSequenceLedger,
  highSequenceAdvancementRequirement,
  projectHighSequenceLedgerForSimulation,
  validateHighSequenceLedger,
} from "../app/high-sequence-ledger.ts";
import { advanceCampaignWorld, applyCampaignActionResults, createCampaignWorldState, projectCampaignWorldForSimulation } from "../app/campaign-world.ts";
import { createSaveEnvelope, parseSaveEnvelope } from "../app/save-system.ts";

test("all 22 pathways expose 220 knowledge-grounded sequence records and playable ability ranks", () => {
  const validation = validatePathwaySequenceLedger();
  assert.equal(validation.ok, true, validation.issues.join("\n"));
  assert.equal(validation.pathwayCount, 22);
  assert.equal(validation.sequenceCount, 220);
  const loreIds = new Set(LORE_RECORDS.map((record) => record.id));
  const hasPrivateLore = loreIds.size > 0;
  for (const [pathwayId, dossier] of Object.entries(PATHWAY_SEQUENCE_LEDGER)) {
    assert.equal(dossier.sequences.length, 10, pathwayId);
    assert.deepEqual(dossier.sequences.map((entry) => entry.sequence), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    for (const entry of dossier.sequences) {
      assert.ok(entry.operationalEnvelope.length >= 3);
      assert.ok(entry.organizationEffect.length > 20);
      assert.ok(entry.lossOfControlRisk.length > 15);
      if (hasPrivateLore) assert.ok(entry.loreEvidenceIds.every((id) => loreIds.has(id)), `${entry.id}: ${entry.loreEvidenceIds.join(",")}`);
      else assert.ok(entry.loreEvidenceIds.length > 0, `${entry.id}: public source build must retain evidence references`);
    }
    const ranks = new Set(abilitiesFor(pathwayId, 0).map((ability) => ability.unlockRank));
    for (let rank = 9; rank >= 0; rank -= 1) assert.ok(ranks.has(rank), `${pathwayId} missing ability rank ${rank}`);
    assert.ok(PATHWAYS[pathwayId].sequences.every((entry) => !entry.capabilities.some((line) => /进入游戏后|逐步揭示|待扩展/.test(line))), pathwayId);
  }
});

test("the high sequence ledger contains exactly 22 uniquenesses and 9 sefirot and enforces sequence-one conservation", () => {
  let ledger = createHighSequenceLedger();
  assert.equal(ledger.uniquenesses.length, 22);
  assert.equal(ledger.sefirot.length, 9);
  assert.equal(validateHighSequenceLedger(ledger).ok, true);
  ledger = claimPathwayUniqueness(ledger, "seer", "player", 30, "event:uniqueness");
  ledger = claimPathwaySefirot(ledger, "seer", "player", 31, "event:sefirot");
  for (let index = 1; index <= 3; index += 1) ledger = claimHighSequenceCharacteristic(ledger, { pathwayId: "seer", sequence: 1, holderRef: "player", week: 31 + index, sourceEventId: `event:seq1:${index}` });
  assert.equal(highSequenceAdvancementRequirement(ledger, "seer", 0).satisfied, true);
  assert.throws(() => claimHighSequenceCharacteristic(ledger, { pathwayId: "seer", sequence: 1, holderRef: "player", week: 40, sourceEventId: "event:seq1:4" }), /第四份/);
  assert.throws(() => claimPathwayUniqueness(ledger, "seer", "actor:rival", 40, "event:steal"), /必须先通过世界行动/);
  assert.equal(validateHighSequenceLedger(ledger).ok, true);
});

test("world simulation receives only relevant or already-located high assets", () => {
  const ledger = createHighSequenceLedger();
  const projection = projectHighSequenceLedgerForSimulation(ledger, "seer");
  assert.equal(projection.uniquenesses.length, 1);
  assert.equal(projection.sefirot.length, 1);
  assert.equal(projection.omittedUnlocatedAssets.uniquenesses, 21);
  assert.equal(projection.omittedUnlocatedAssets.sefirot, 8);
});

test("other cities can receive dynamic branches, counter-pressure, and historical stage progression", () => {
  let world = createCampaignWorldState();
  assert.equal(world.cities.length, 7);
  assert.equal(world.historicalEpochs.length, 5);
  world = applyCampaignActionResults(world, [{ id: "trier-branch", outcome: "成功", text: "向特里尔派遣人员建立分部并调查地下特里尔" }], 24);
  const trier = world.cities.find((city) => city.id === "trier");
  assert.equal(trier.status, "branch");
  assert.ok(trier.committedManpower >= 6);
  const before = trier.playerControl;
  world = advanceCampaignWorld(world, { week: 25, currentSequence: 5, pathwayId: "seer", smogResolved: true });
  assert.equal(world.currentStageId, "intercity-network");
  assert.notEqual(world.cities.find((city) => city.id === "trier").playerControl, before, "control must continue changing after a branch is built");
});

test("the v0.4 world prompt activates Backlund and keeps other cities in cold storage", () => {
  const world = createCampaignWorldState();
  const projection = projectCampaignWorldForSimulation(world, "backlund");
  assert.equal(projection.city.id, "backlund");
  assert.equal(projection.coldCityCount, world.cities.length - 1);
  assert.equal("cities" in projection, false);
  assert.ok(projection.stages.every((stage) => stage.status === "active" || stage.id === "great-smog"));
});

test("sequence zero activates continuing post-deity governance instead of ending the world", () => {
  let world = createCampaignWorldState();
  world = advanceCampaignWorld(world, { week: 70, currentSequence: 0, pathwayId: "spectator", smogResolved: true });
  assert.equal(world.currentStageId, "divine-era");
  assert.equal(world.postDeity.active, true);
  assert.equal(world.postDeity.weeksSinceDeification, 0);
  world = advanceCampaignWorld(world, { week: 71, currentSequence: 0, pathwayId: "spectator", smogResolved: true });
  assert.equal(world.currentStageId, "post-deity-world");
  assert.equal(world.postDeity.weeksSinceDeification, 1);
  assert.ok(world.postDeity.prayerBacklog > 0);
});

test("v20 saves migrate to v21 with both new ledgers", () => {
  const game = createInitialGame();
  const envelope = createSaveEnvelope(game);
  const legacyGame = structuredClone(game);
  legacyGame.prologueComplete = true;
  delete legacyGame.highSequenceLedger;
  delete legacyGame.campaignWorld;
  legacyGame.version = 20;
  const raw = JSON.stringify({ ...envelope, schemaVersion: 20, game: legacyGame, checksum: (() => {
    let hash = 2166136261;
    const text = JSON.stringify(legacyGame);
    for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  })() });
  const migrated = parseSaveEnvelope(raw);
  assert.equal(migrated.schemaVersion, 21);
  assert.equal(migrated.game.version, 21);
  assert.equal(migrated.game.highSequenceLedger.uniquenesses.length, 22);
  assert.equal(migrated.game.campaignWorld.cities.length, 7);
});
