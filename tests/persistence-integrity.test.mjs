import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { matchesJsonChecksum, stableJsonChecksum } from "../app/persistence-integrity.ts";
import { createSaveEnvelope, parseSaveEnvelope } from "../app/save-system.ts";
import { sha256Hex } from "../app/sha256.ts";
import { stableEntityId } from "../app/stable-id.ts";

test("JSON checksum is deterministic and rejects a changed payload", () => {
  const payload = {
    schemaVersion: 21,
    game: { week: 3, organizationName: "灰雾纪事" },
  };
  const checksum = stableJsonChecksum(payload);

  assert.equal(stableJsonChecksum(structuredClone(payload)), checksum);
  assert.equal(matchesJsonChecksum(payload, checksum), true);
  assert.equal(matchesJsonChecksum({ ...payload, schemaVersion: 20 }, checksum), false);
  assert.match(checksum, /^[0-9a-f]{64}$/);
});

test("persisted identities use SHA-256 rather than the former 32-bit FNV space", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(stableEntityId("entity", "same-input"), /^entity:[0-9a-f]{64}$/);
});

test("save import rejects oversized and structurally excessive JSON before migration", () => {
  assert.throws(() => parseSaveEnvelope("x".repeat(24 * 1024 * 1024 + 1)), /过大/);
  const game = createInitialGame("seer");
  game.prologueComplete = true;
  let nested = {};
  for (let index = 0; index < 80; index += 1) nested = { nested };
  const envelope = createSaveEnvelope(game);
  envelope.game = { ...envelope.game, excessive: nested };
  envelope.checksum = stableJsonChecksum(envelope.game);
  assert.throws(() => parseSaveEnvelope(JSON.stringify(envelope)), /结构/);
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
