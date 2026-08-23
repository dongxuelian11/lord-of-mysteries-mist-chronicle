"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const RECORD_SCHEMA_VERSION = 1;
const RECORD_KIND = "key-value";
const DEFAULT_MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;

function checksumPayload(payload) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function assertKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.length > 256) {
    throw new Error("invalid-persistence-key");
  }
}

function assertPayload(payload, maxPayloadBytes) {
  if (typeof payload !== "string") throw new Error("invalid-persistence-payload");
  if (Buffer.byteLength(payload, "utf8") > maxPayloadBytes) throw new Error("persistence-payload-too-large");
}

function readRecoveryPayload(raw) {
  if (raw === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("persistence-recovery-corrupt");
  }
  if (!Array.isArray(parsed)) throw new Error("persistence-recovery-corrupt");
  return parsed.filter((item) => item && item.game && item.game.worldKernel);
}

function payloadFromRow(row) {
  if (!row) return null;
  if (row.kind !== RECORD_KIND || row.schema_version !== RECORD_SCHEMA_VERSION || checksumPayload(row.payload) !== row.checksum) {
    throw new Error("persistence-record-corrupt");
  }
  return row.payload;
}

class SqlitePersistenceStore {
  constructor(dbPath, options = {}) {
    if (typeof dbPath !== "string" || !dbPath) throw new Error("invalid-persistence-db-path");
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.dbPath = dbPath;
    this.maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persistence_records (
        key TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS persistence_records_updated_at_idx
        ON persistence_records(updated_at);
    `);
    this.select = this.db.prepare("SELECT kind, schema_version, payload, checksum FROM persistence_records WHERE key = ?");
    this.upsert = this.db.prepare(`
      INSERT INTO persistence_records(key, kind, schema_version, payload, checksum, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        kind = excluded.kind,
        schema_version = excluded.schema_version,
        payload = excluded.payload,
        checksum = excluded.checksum,
        updated_at = excluded.updated_at
    `);
    this.remove = this.db.prepare("DELETE FROM persistence_records WHERE key = ?");
  }

  getItem(key) {
    assertKey(key);
    return payloadFromRow(this.select.get(key));
  }

  setItem(key, payload) {
    this.writeBatch([{ key, payload }]);
  }

  removeItem(key) {
    assertKey(key);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      this.remove.run(key);
      this.db.exec("COMMIT");
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  writeBatch(entries, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error("empty-persistence-batch");
    const normalized = entries.map((entry) => {
      assertKey(entry?.key);
      assertPayload(entry?.payload, this.maxPayloadBytes);
      return { key: entry.key, payload: entry.payload };
    });
    const failAfter = Number.isInteger(options.failAfter) ? options.failAfter : null;
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      normalized.forEach((entry, index) => {
        this.upsert.run(
          entry.key,
          RECORD_KIND,
          RECORD_SCHEMA_VERSION,
          entry.payload,
          checksumPayload(entry.payload),
          this.clock(),
        );
        if (failAfter !== null && index + 1 >= failAfter) throw new Error("injected-persistence-failure");
      });
      this.db.exec("COMMIT");
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  appendRecoveryCheckpoint(key, checkpoint, maxEntries = 3, options = {}) {
    assertKey(key);
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 32) throw new Error("invalid-recovery-limit");
    const rawCheckpoint = JSON.stringify(checkpoint);
    assertPayload(rawCheckpoint, this.maxPayloadBytes);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const current = readRecoveryPayload(payloadFromRow(this.select.get(key)));
      const payload = JSON.stringify([checkpoint, ...current].slice(0, maxEntries));
      assertPayload(payload, this.maxPayloadBytes);
      this.upsert.run(key, RECORD_KIND, RECORD_SCHEMA_VERSION, payload, checksumPayload(payload), this.clock());
      if (options.failAfter) throw new Error("injected-persistence-failure");
      this.db.exec("COMMIT");
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

function createSqlitePersistenceStore(dbPath, options) {
  return new SqlitePersistenceStore(dbPath, options);
}

module.exports = {
  DEFAULT_MAX_PAYLOAD_BYTES,
  RECORD_KIND,
  RECORD_SCHEMA_VERSION,
  SqlitePersistenceStore,
  checksumPayload,
  createSqlitePersistenceStore,
};
