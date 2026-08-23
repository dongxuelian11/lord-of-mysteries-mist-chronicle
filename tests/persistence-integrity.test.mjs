import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { matchesJsonChecksum, stableJsonChecksum } from "../app/persistence-integrity.ts";
import { createSaveEnvelope, parseSaveEnvelope } from "../app/save-system.ts";

test("JSON checksum is deterministic and rejects a changed payload", () => {
  const payload = {
    schemaVersion: 21,
    game: { week: 3, organizationName: "灰雾纪事" },
  };
  const checksum = stableJsonChecksum(payload);

  assert.equal(stableJsonChecksum(structuredClone(payload)), checksum);
  assert.equal(matchesJsonChecksum(payload, checksum), true);
  assert.equal(matchesJsonChecksum({ ...payload, schemaVersion: 20 }, checksum), false);
});

test("save envelope integrity uses the shared checksum boundary", () => {
  const game = createInitialGame("seer");
  game.prologueComplete = true;
  const envelope = createSaveEnvelope(game);

  assert.equal(envelope.checksum, stableJsonChecksum(envelope.game));
  assert.equal(parseSaveEnvelope(JSON.stringify(envelope)).schemaVersion, 21);
  envelope.game.organizationName = "tampered";
  assert.throws(() => parseSaveEnvelope(JSON.stringify(envelope)), /校验失败/);
});

test("checksum matching fails closed for a non-JSON value", () => {
  assert.throws(() => stableJsonChecksum(undefined), /not-json-serializable/);
  assert.equal(matchesJsonChecksum(undefined, "00000000"), false);
});
