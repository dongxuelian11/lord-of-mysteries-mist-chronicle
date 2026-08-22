import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { stableJsonChecksum } from "../app/persistence-integrity.ts";
import { createSaveEnvelope, migrateStoredGame, parseSaveEnvelope } from "../app/save-system.ts";

test("save import rejects an unknown envelope schema before migration", () => {
  const game = createInitialGame("seer");
  game.prologueComplete = true;
  const envelope = createSaveEnvelope(game);
  envelope.schemaVersion = 14;

  assert.throws(() => parseSaveEnvelope(JSON.stringify(envelope)), /不是可迁移/);
});

test("save import rejects a truncated envelope before applying state", () => {
  const game = createInitialGame("seer");
  game.prologueComplete = true;
  const raw = JSON.stringify(createSaveEnvelope(game));

  assert.throws(() => parseSaveEnvelope(raw.slice(0, -11)));
});

test("v20 envelope migration is deterministic and does not mutate the source", () => {
  const game = { ...createInitialGame("seer"), prologueComplete: true, version: 20 };
  delete game.memory;
  const envelope = {
    ...createSaveEnvelope(game),
    schemaVersion: 20,
    game,
    checksum: stableJsonChecksum(game),
  };
  const raw = JSON.stringify(envelope);
  const sourceBefore = JSON.stringify(envelope);

  const first = parseSaveEnvelope(raw);
  const second = parseSaveEnvelope(raw);

  assert.equal(JSON.stringify(envelope), sourceBefore);
  assert.equal(first.schemaVersion, 21);
  assert.equal(first.game.version, 21);
  assert.equal(first.checksum, stableJsonChecksum(first.game));
  assert.doesNotThrow(() => parseSaveEnvelope(JSON.stringify(first)));
  assert.deepEqual(first.game, second.game);

  const sourceGameBeforeMigration = JSON.stringify(game);
  const migrated = migrateStoredGame(game);
  assert.ok(migrated);
  assert.equal(JSON.stringify(game), sourceGameBeforeMigration);
});
