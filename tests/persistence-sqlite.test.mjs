import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSqlitePersistenceStore } from "../electron/persistence-sqlite.cjs";

function withTempStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmzz-pr2-"));
  const dbPath = path.join(directory, "persistence.sqlite");
  const store = createSqlitePersistenceStore(dbPath, { clock: () => "2026-08-22T00:00:00.000Z" });
  try {
    return run(store, dbPath);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("SQLite persistence store uses WAL and records checksummed metadata", () => {
  withTempStore((store, dbPath) => {
    store.setItem("mist-chronicle-complete-v21", "{\"version\":21}");

    const db = new DatabaseSync(dbPath);
    const journalMode = db.prepare("PRAGMA journal_mode").get().journal_mode;
    const row = db.prepare("SELECT kind, schema_version, checksum, updated_at FROM persistence_records WHERE key = ?").get("mist-chronicle-complete-v21");
    db.close();

    assert.equal(journalMode, "wal");
    assert.equal(row.kind, "key-value");
    assert.equal(row.schema_version, 1);
    assert.match(row.checksum, /^[0-9a-f]{64}$/);
    assert.equal(row.updated_at, "2026-08-22T00:00:00.000Z");
    assert.equal(store.getItem("mist-chronicle-complete-v21"), "{\"version\":21}");
  });
});

test("SQLite batch writes roll back completely when a write is interrupted", () => {
  withTempStore((store) => {
    store.setItem("mist-chronicle-complete-v21", "old");

    assert.throws(
      () => store.writeBatch([
        { key: "mist-chronicle-complete-v21", payload: "new" },
        { key: "mist-chronicle-recovery-v21", payload: "checkpoint" },
      ], { failAfter: 1 }),
      /injected-persistence-failure/,
    );

    assert.equal(store.getItem("mist-chronicle-complete-v21"), "old");
    assert.equal(store.getItem("mist-chronicle-recovery-v21"), null);
  });
});

test("SQLite persistence rejects a tampered payload before returning it", () => {
  withTempStore((_store, dbPath) => {
    const store = createSqlitePersistenceStore(dbPath);
    store.setItem("mist-chronicle-complete-v21", "original");
    store.close();

    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE persistence_records SET payload = ? WHERE key = ?").run("tampered", "mist-chronicle-complete-v21");
    db.close();

    const reopened = createSqlitePersistenceStore(dbPath);
    try {
      assert.throws(() => reopened.getItem("mist-chronicle-complete-v21"), /persistence-record-corrupt/);
    } finally {
      reopened.close();
    }
  });
});

test("SQLite recovery append is atomic and keeps the newest three valid checkpoints", () => {
  withTempStore((store) => {
    for (let index = 1; index <= 4; index += 1) {
      store.appendRecoveryCheckpoint("mist-chronicle-recovery-v21", {
        id: `checkpoint-${index}`,
        game: { worldKernel: { revision: index } },
      });
    }

    assert.deepEqual(JSON.parse(store.getItem("mist-chronicle-recovery-v21")).map((item) => item.id), [
      "checkpoint-4",
      "checkpoint-3",
      "checkpoint-2",
    ]);
  });
});

test("SQLite recovery append rolls back when interrupted before commit", () => {
  withTempStore((store) => {
    store.appendRecoveryCheckpoint("mist-chronicle-recovery-v21", {
      id: "checkpoint-before",
      game: { worldKernel: { revision: 1 } },
    });

    assert.throws(
      () => store.appendRecoveryCheckpoint("mist-chronicle-recovery-v21", {
        id: "checkpoint-after",
        game: { worldKernel: { revision: 2 } },
      }, 3, { failAfter: 1 }),
      /injected-persistence-failure/,
    );

    assert.deepEqual(JSON.parse(store.getItem("mist-chronicle-recovery-v21")).map((item) => item.id), ["checkpoint-before"]);
  });
});
