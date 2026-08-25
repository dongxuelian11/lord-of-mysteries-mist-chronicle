import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  classifyAuthorityProvenance,
  summarizeProvenance,
} from "../electron/persistence-provenance.cjs";
import { createSqlitePersistenceStore } from "../electron/persistence-sqlite.cjs";

const runtimeRoot = process.env.GMZZ_STORAGE_ROOT ?? path.join(process.cwd(), ".runtime");
fs.mkdirSync(runtimeRoot, { recursive: true });

function withStore(callback) {
  const directory = fs.mkdtempSync(path.join(runtimeRoot, "provenance-test-"));
  const store = createSqlitePersistenceStore(path.join(directory, "provenance.sqlite"), { clock: () => "2026-08-24T00:00:00.000Z" });
  try {
    return callback(store, directory);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function payload({ saveId, branchId = "main", revision, transactions, receipts = [], claims = [] }) {
  return JSON.stringify({
    version: 21,
    saveId,
    worldLedger: { branchId },
    worldKernel: { revision, committedTransactions: transactions, events: [], retrievalReceipts: receipts, mutationClaims: claims },
  });
}

test("provenance read API distinguishes retained durable authority from legacy import", () => {
  withStore((store) => {
    const transactions = [
      { turnId: "world:1", resolvingWeek: 1, baseRevision: 0, inputHash: "first" },
      { turnId: "world:2", resolvingWeek: 2, baseRevision: 1, inputHash: "second" },
    ];
    store.commitTurn("mist-chronicle-complete-v21", payload({
      saveId: "provenance-retained",
      revision: 2,
      transactions,
      receipts: [{ turnId: "world:1", requestId: "receipt:1" }],
      claims: [{ turnId: "world:2", proposalId: "claim:2", effectKind: "event", subjectRef: "event:2" }],
    }));
    const before = store.readProvenance("mist-chronicle-complete-v21");
    assert.equal(before.provenanceStatus, "durable-turn");
    assert.equal(before.oldestReplayableWeek, 1);
    assert.equal(before.oldestDurablyOwnedWeek, 1);
    assert.deepEqual(before.authority.map((entry) => entry.provenanceStatus), ["durable-turn", "durable-turn"]);

    store.commitTurn("mist-chronicle-complete-v21", payload({
      saveId: "provenance-import",
      revision: 2,
      transactions,
      receipts: [{ requestId: "legacy:receipt" }],
      claims: [{ proposalId: "legacy:claim", effectKind: "event", subjectRef: "event:legacy" }],
    }));
    const imported = store.readProvenance("mist-chronicle-complete-v21");
    assert.equal(imported.provenanceStatus, "legacy-import");
    assert.deepEqual(imported.authority.map((entry) => entry.provenanceStatus), ["legacy-import", "legacy-import"]);
  });
});

test("aged-out explicit owners stay unproven while durable replay ranges remain readable", () => {
  withStore((store) => {
    const first = [{ turnId: "world:1", resolvingWeek: 1, baseRevision: 0, inputHash: "input-1" }];
    store.commitTurn("mist-chronicle-complete-v21", payload({ saveId: "provenance-aged", revision: 1, transactions: first }));
    const transactions = Array.from({ length: 256 }, (_, index) => ({
      turnId: `world:${index + 2}`,
      resolvingWeek: index + 2,
      baseRevision: index + 1,
      inputHash: `input-${index + 2}`,
    }));
    store.commitTurn("mist-chronicle-complete-v21", payload({
      saveId: "provenance-aged",
      revision: 257,
      transactions,
      receipts: [{ turnId: "world:9999", requestId: "receipt:unproven" }],
      claims: [{ turnId: "world:9999", proposalId: "claim:unproven", effectKind: "event", subjectRef: "event:unproven" }],
    }));
    const result = store.readProvenance("mist-chronicle-complete-v21");
    assert.equal(result.provenanceStatus, "unproven-import");
    assert.equal(result.oldestReplayableWeek, 1);
    assert.equal(result.oldestDurablyOwnedWeek, null);
    assert.equal(result.replayability.status, "replayable");
    assert.ok(result.replayability.reason === null);
    assert.deepEqual(result.authority.map((entry) => entry.provenanceStatus), ["unproven-import", "unproven-import"]);
  });
});

test("current-turn is a distinct pre-durable status and readable summary never mutates input", () => {
  const receipt = { turnId: "world:9", requestId: "receipt:current" };
  assert.equal(classifyAuthorityProvenance(receipt, { currentTurnId: "world:9", durableTurnIds: new Set(), retainedTurnIds: new Set() }), "current-turn");
  const summary = summarizeProvenance({
    originId: "origin:test",
    transactions: [{ turnId: "world:9", resolvingWeek: 9 }],
    durableTurns: [],
    receipts: [receipt],
    currentTurnId: "world:9",
  });
  assert.equal(summary.provenanceStatus, "current-turn");
  assert.equal(summary.authority[0].provenanceStatus, "current-turn");
  assert.equal(receipt.turnId, "world:9");
});
