"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { stablePersistenceOriginId } = require("./persistence-origin.cjs");

const RECORD_SCHEMA_VERSION = 1;
const RECORD_KIND = "key-value";
const DEFAULT_MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;
const WORLD_INFERENCE_MANIFEST_MAX_BYTES = 1024 * 1024;
const WORLD_INFERENCE_REQUEST_MAX_BYTES = 256 * 1024;
const MAX_RETAINED_WORLD_TRANSACTIONS = 256;

function checksumPayload(payload) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function stableSerialize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
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

function isRecoveryCheckpoint(value) {
  return Boolean(recordOf(value) && recordOf(value.game) && recordOf(value.game.worldKernel));
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
  if (!parsed.every(isRecoveryCheckpoint)) {
    throw new Error("persistence-recovery-corrupt");
  }
  return parsed;
}

function payloadFromRow(row) {
  if (!row) return null;
  if (row.kind !== RECORD_KIND || row.schema_version !== RECORD_SCHEMA_VERSION || checksumPayload(row.payload) !== row.checksum) {
    throw new Error("persistence-record-corrupt");
  }
  return row.payload;
}

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function requiredText(value, error) {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw new Error(error);
  return value.trim();
}

function turnJournalFromPayload(payload) {
  let game;
  try { game = JSON.parse(payload); }
  catch { throw new Error("durable-turn-payload-invalid"); }
  const root = recordOf(game);
  const kernel = recordOf(root?.worldKernel);
  const ledger = recordOf(root?.worldLedger);
  if (!root || !kernel || !ledger) return null;
  const saveId = requiredText(root.saveId, "durable-turn-save-origin-missing");
  const branchId = requiredText(ledger.branchId, "durable-turn-branch-origin-missing");
  const transactions = Array.isArray(kernel.committedTransactions) ? kernel.committedTransactions.map(recordOf).filter(Boolean) : [];
  const normalizedTransactions = transactions.map((transaction) => ({
    turnId: requiredText(transaction.turnId, "durable-turn-id-missing"),
    resolvingWeek: Number(transaction.resolvingWeek),
    baseRevision: Number(transaction.baseRevision),
    inputHash: requiredText(transaction.inputHash, "durable-turn-input-hash-missing"),
  }));
  if (normalizedTransactions.some((transaction) => !Number.isInteger(transaction.resolvingWeek) || transaction.resolvingWeek < 0 || !Number.isInteger(transaction.baseRevision) || transaction.baseRevision < 0)) {
    throw new Error("durable-turn-transaction-invalid");
  }
  return {
    originId: stablePersistenceOriginId(saveId, branchId),
    stateRevision: Number.isInteger(kernel.revision) && kernel.revision >= 0 ? kernel.revision : normalizedTransactions.length,
    transactions: normalizedTransactions,
    events: Array.isArray(kernel.events) ? kernel.events.map(recordOf).filter(Boolean) : [],
    retrievalReceipts: Array.isArray(kernel.retrievalReceipts) ? kernel.retrievalReceipts.map(recordOf).filter(Boolean) : [],
    mutationClaims: Array.isArray(kernel.mutationClaims) ? kernel.mutationClaims.map(recordOf).filter(Boolean) : [],
  };
}

function authorityTurnId(record, journal, latest, kind, durableTurnExists = () => false) {
  const explicit = typeof record?.turnId === "string" && record.turnId.trim() ? record.turnId.trim() : null;
  if (explicit) {
    const retained = journal.transactions.some((transaction) => transaction.turnId === explicit);
    if (retained || durableTurnExists(explicit)) return explicit;
    const mayHaveAgedOut = journal.transactions.length >= MAX_RETAINED_WORLD_TRANSACTIONS && journal.stateRevision > journal.transactions.length;
    if (!retained && !mayHaveAgedOut) throw new Error(`durable-${kind}-turn-missing`);
    return "state-import";
  }
  return journal.transactions.length === 1 ? latest.turnId : "state-import";
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
      CREATE TABLE IF NOT EXISTS persistence_quarantine (
        quarantine_id TEXT PRIMARY KEY NOT NULL,
        original_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        stored_checksum TEXT NOT NULL,
        calculated_checksum TEXT NOT NULL,
        error TEXT NOT NULL,
        quarantined_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS persistence_quarantine_key_time_idx
        ON persistence_quarantine(original_key, quarantined_at DESC);
      CREATE TABLE IF NOT EXISTS world_turns (
        origin_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        resolving_week INTEGER NOT NULL,
        base_revision INTEGER NOT NULL,
        input_hash TEXT NOT NULL,
        state_revision INTEGER NOT NULL,
        save_checksum TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY(origin_id, turn_id),
        UNIQUE(origin_id, resolving_week)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS world_events (
        origin_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        resolving_week INTEGER NOT NULL,
        turn_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY(origin_id, event_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS retrieval_receipts (
        origin_id TEXT NOT NULL,
        receipt_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY(origin_id, receipt_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS mutation_claims (
        origin_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY(origin_id, claim_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS runtime_traces (
        origin_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        turn_id TEXT,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY(origin_id, trace_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS runtime_traces_origin_time_idx ON runtime_traces(origin_id, recorded_at DESC);
      CREATE TABLE IF NOT EXISTS world_inference_locks (
        origin_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        snapshot_checksum TEXT NOT NULL,
        resolution TEXT,
        resolution_checksum TEXT,
        manifest TEXT,
        manifest_checksum TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(origin_id, turn_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS world_inference_requests (
        ticket TEXT PRIMARY KEY NOT NULL,
        origin_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        active_save_checksum TEXT NOT NULL,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_consumed_at TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS world_inference_requests_origin_turn_idx
        ON world_inference_requests(origin_id, turn_id);
    `);
    const worldLockColumns = new Set(this.db.prepare("PRAGMA table_info(world_inference_locks)").all().map((column) => column.name));
    if (!worldLockColumns.has("resolution")) this.db.exec("ALTER TABLE world_inference_locks ADD COLUMN resolution TEXT");
    if (!worldLockColumns.has("resolution_checksum")) this.db.exec("ALTER TABLE world_inference_locks ADD COLUMN resolution_checksum TEXT");
    this.select = this.db.prepare("SELECT key, kind, schema_version, payload, checksum, updated_at FROM persistence_records WHERE key = ?");
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
    this.insertQuarantine = this.db.prepare(`
      INSERT INTO persistence_quarantine(quarantine_id, original_key, kind, schema_version, payload, stored_checksum, calculated_checksum, error, quarantined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.selectQuarantine = this.db.prepare(`
      SELECT quarantine_id, original_key, error, quarantined_at, stored_checksum, calculated_checksum
      FROM persistence_quarantine WHERE original_key = ? ORDER BY quarantined_at DESC, quarantine_id DESC LIMIT 32
    `);
    this.insertTurn = this.db.prepare(`
      INSERT OR IGNORE INTO world_turns(origin_id, turn_id, resolving_week, base_revision, input_hash, state_revision, save_checksum, committed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.selectTurn = this.db.prepare("SELECT resolving_week, base_revision, input_hash FROM world_turns WHERE origin_id = ? AND turn_id = ?");
    this.selectTurnWeek = this.db.prepare("SELECT turn_id, base_revision, input_hash FROM world_turns WHERE origin_id = ? AND resolving_week = ?");
    this.insertEvent = this.db.prepare("INSERT OR IGNORE INTO world_events(origin_id, event_id, resolving_week, turn_id, payload, checksum, committed_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    this.selectEvent = this.db.prepare("SELECT checksum FROM world_events WHERE origin_id = ? AND event_id = ?");
    this.insertReceipt = this.db.prepare("INSERT OR IGNORE INTO retrieval_receipts(origin_id, receipt_id, turn_id, payload, checksum, committed_at) VALUES (?, ?, ?, ?, ?, ?)");
    this.selectReceipt = this.db.prepare("SELECT turn_id, checksum FROM retrieval_receipts WHERE origin_id = ? AND receipt_id = ?");
    this.insertClaim = this.db.prepare("INSERT OR IGNORE INTO mutation_claims(origin_id, claim_id, turn_id, payload, checksum, committed_at) VALUES (?, ?, ?, ?, ?, ?)");
    this.selectClaim = this.db.prepare("SELECT turn_id, checksum FROM mutation_claims WHERE origin_id = ? AND claim_id = ?");
    this.selectClaimPayload = this.db.prepare("SELECT turn_id, checksum FROM mutation_claims WHERE origin_id = ? AND payload = ? LIMIT 1");
    this.insertTrace = this.db.prepare("INSERT OR IGNORE INTO runtime_traces(origin_id, trace_id, operation, turn_id, payload, checksum, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    this.selectTrace = this.db.prepare("SELECT checksum FROM runtime_traces WHERE origin_id = ? AND trace_id = ?");
    this.listTraces = this.db.prepare("SELECT trace_id, payload, checksum FROM runtime_traces WHERE origin_id = ? ORDER BY recorded_at DESC, trace_id DESC LIMIT ?");
    this.insertWorldInferenceLock = this.db.prepare("INSERT INTO world_inference_locks(origin_id, turn_id, base_revision, snapshot, snapshot_checksum, manifest, manifest_checksum, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)");
    this.selectWorldInferenceLock = this.db.prepare("SELECT origin_id, turn_id, base_revision, snapshot, snapshot_checksum, resolution, resolution_checksum, manifest, manifest_checksum FROM world_inference_locks WHERE origin_id = ? AND turn_id = ?");
    this.updateWorldInferenceResolution = this.db.prepare("UPDATE world_inference_locks SET resolution = ?, resolution_checksum = ? WHERE origin_id = ? AND turn_id = ? AND resolution IS NULL");
    this.updateWorldInferenceManifest = this.db.prepare("UPDATE world_inference_locks SET manifest = ?, manifest_checksum = ? WHERE origin_id = ? AND turn_id = ? AND manifest IS NULL");
    this.deleteWorldInferenceLock = this.db.prepare("DELETE FROM world_inference_locks WHERE origin_id = ? AND turn_id = ?");
    this.deleteWorldInferenceForTurn = this.db.prepare("DELETE FROM world_inference_requests WHERE origin_id = ? AND turn_id = ?");
    this.insertWorldInference = this.db.prepare("INSERT INTO world_inference_requests(ticket, origin_id, turn_id, base_revision, active_save_checksum, payload, checksum, attempt_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)");
    this.selectWorldInference = this.db.prepare("SELECT ticket, origin_id, turn_id, base_revision, active_save_checksum, payload, checksum, attempt_count FROM world_inference_requests WHERE ticket = ?");
    this.selectWorldInferenceForTurn = this.db.prepare("SELECT ticket, origin_id, turn_id, base_revision, active_save_checksum, payload, checksum, attempt_count FROM world_inference_requests WHERE origin_id = ? AND turn_id = ?");
    this.advanceWorldInference = this.db.prepare("UPDATE world_inference_requests SET attempt_count = attempt_count + 1, last_consumed_at = ? WHERE ticket = ? AND attempt_count = ?");
    this.deleteWorldInferenceTicket = this.db.prepare("DELETE FROM world_inference_requests WHERE ticket = ?");
  }

  getItem(key) {
    assertKey(key);
    return payloadFromRow(this.select.get(key));
  }

  readItem(key) {
    assertKey(key);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const row = this.select.get(key);
      if (!row) {
        this.db.exec("COMMIT");
        return { value: null };
      }
      try {
        const value = payloadFromRow(row);
        if (key.includes("-recovery-")) readRecoveryPayload(value);
        if (key.includes("-complete-")) {
          const parsed = JSON.parse(value);
          if (!recordOf(parsed)) throw new Error("persistence-active-save-corrupt");
        }
        this.db.exec("COMMIT");
        return { value };
      } catch (error) {
        const calculated = checksumPayload(row.payload);
        const quarantineId = `quarantine:${crypto.randomUUID()}`;
        const message = String(error?.message ?? error);
        this.insertQuarantine.run(quarantineId, key, String(row.kind), Number(row.schema_version), String(row.payload), String(row.checksum), calculated, message, this.clock());
        this.remove.run(key);
        this.db.exec("COMMIT");
        return { value: null, corrupt: true, quarantineId, error: message };
      }
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  quarantineItem(key, reason = "persistence-record-invalid") {
    assertKey(key);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const row = this.select.get(key);
      if (!row) {
        this.db.exec("COMMIT");
        return { quarantined: false, quarantineId: null };
      }
      const quarantineId = `quarantine:${crypto.randomUUID()}`;
      this.insertQuarantine.run(quarantineId, key, String(row.kind), Number(row.schema_version), String(row.payload), String(row.checksum), checksumPayload(row.payload), String(reason).slice(0, 512), this.clock());
      this.remove.run(key);
      this.db.exec("COMMIT");
      return { quarantined: true, quarantineId };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  listQuarantine(key) {
    assertKey(key);
    return this.selectQuarantine.all(key).map((row) => ({
      quarantineId: row.quarantine_id,
      originalKey: row.original_key,
      error: row.error,
      quarantinedAt: row.quarantined_at,
      storedChecksum: row.stored_checksum,
      calculatedChecksum: row.calculated_checksum,
    }));
  }

  writeRuntimeTraces(originId, traces, options = {}) {
    for (const trace of traces.slice(-128)) {
      if (!trace || typeof trace !== "object" || Array.isArray(trace)) throw new Error("runtime-trace-invalid");
      requiredText(trace.traceId, "runtime-trace-id-missing");
      const traceInstanceId = requiredText(trace.traceInstanceId, "runtime-trace-instance-id-missing");
      if (trace.schemaVersion !== 1 || !["model", "retrieval", "turn"].includes(trace.operation)) throw new Error("runtime-trace-invalid");
      if (trace.operation === "turn" && ["COMMITTED", "REPLAYED"].includes(trace.commitStatus) && options.allowFinalTurnStatuses !== true) {
        throw new Error("runtime-trace-final-status-main-owned");
      }
      const allowed = ["schemaVersion","traceInstanceId","recordedAt","traceId","operation","requestId","turnId","retrievalId","modelTraceId","modelId","modelQuantization","promptVersion","responseSchemaVersion","retrievalMode","retrievalSelectedCount","retrievalRejectedCount","inputTokens","outputTokens","firstTokenLatencyMs","latencyMs","repairCount","rejectionReasons","outcome","commitStatus"];
      const sanitized = Object.fromEntries(allowed.map((field) => [field, trace[field]]));
      const raw = JSON.stringify(sanitized);
      if (Buffer.byteLength(raw, "utf8") > 16 * 1024) throw new Error("runtime-trace-too-large");
      const traceChecksum = checksumPayload(raw);
      const existingTrace = this.selectTrace.get(originId, traceInstanceId);
      if (existingTrace && existingTrace.checksum !== traceChecksum) throw new Error("runtime-trace-identity-conflict");
      this.insertTrace.run(originId, traceInstanceId, trace.operation, typeof trace.turnId === "string" ? trace.turnId : null, raw, traceChecksum, this.clock());
    }
  }

  writeTurnJournal(journal, payload, saveChecksum, key, traces = []) {
    const latest = journal.transactions.at(-1);
    const latestExisting = latest ? this.selectTurn.get(journal.originId, latest.turnId) : null;
    const existingTurns = new Map();
    for (const transaction of journal.transactions) {
      const byId = this.selectTurn.get(journal.originId, transaction.turnId);
      existingTurns.set(transaction.turnId, Boolean(byId));
      const byWeek = this.selectTurnWeek.get(journal.originId, transaction.resolvingWeek);
      if (byId && (byId.resolving_week !== transaction.resolvingWeek || byId.base_revision !== transaction.baseRevision || byId.input_hash !== transaction.inputHash)) throw new Error("durable-turn-identity-conflict");
      if (byWeek && (byWeek.turn_id !== transaction.turnId || byWeek.base_revision !== transaction.baseRevision || byWeek.input_hash !== transaction.inputHash)) throw new Error("durable-turn-week-conflict");
      this.insertTurn.run(journal.originId, transaction.turnId, transaction.resolvingWeek, transaction.baseRevision, transaction.inputHash, journal.stateRevision, saveChecksum, this.clock());
    }
    const turnForWeek = new Map(journal.transactions.map((transaction) => [transaction.resolvingWeek, transaction.turnId]));
    for (const event of journal.events) {
      const eventId = requiredText(event.id, "durable-event-id-missing");
      const week = Number.isInteger(event.week) ? event.week : latest.resolvingWeek;
      const raw = JSON.stringify(event);
      const eventChecksum = checksumPayload(raw);
      const existingEvent = this.selectEvent.get(journal.originId, eventId);
      if (existingEvent && existingEvent.checksum !== eventChecksum) throw new Error("durable-event-identity-conflict");
      if (existingEvent && !latestExisting && week === latest?.resolvingWeek) throw new Error("durable-event-identity-reused");
      this.insertEvent.run(journal.originId, eventId, week, turnForWeek.get(week) ?? latest?.turnId ?? "state-import", raw, eventChecksum, this.clock());
    }
    for (const receipt of journal.retrievalReceipts) {
      const raw = JSON.stringify(receipt);
      const receiptId = typeof receipt.requestId === "string" && receipt.requestId.trim() ? receipt.requestId.trim() : checksumPayload(raw);
      const receiptChecksum = checksumPayload(raw);
      const existingReceipt = this.selectReceipt.get(journal.originId, receiptId);
      const receiptHasExplicitTurn = typeof receipt.turnId === "string" && Boolean(receipt.turnId.trim());
      const receiptTurnId = !receiptHasExplicitTurn && existingReceipt
        ? existingReceipt.turn_id
        : authorityTurnId(receipt, journal, latest, "receipt", (turnId) => Boolean(this.selectTurn.get(journal.originId, turnId)));
      if (existingReceipt && existingReceipt.checksum !== receiptChecksum) throw new Error("durable-receipt-identity-conflict");
      if (existingReceipt && existingReceipt.turn_id !== receiptTurnId) throw new Error("durable-receipt-turn-conflict");
      this.insertReceipt.run(journal.originId, receiptId, receiptTurnId, raw, receiptChecksum, this.clock());
    }
    for (const claim of journal.mutationClaims) {
      const raw = JSON.stringify(claim);
      const claimChecksum = checksumPayload(raw);
      const claimHasExplicitTurn = typeof claim.turnId === "string" && Boolean(claim.turnId.trim());
      const existingLegacyClaim = claimHasExplicitTurn ? null : this.selectClaimPayload.get(journal.originId, raw);
      if (existingLegacyClaim) {
        if (existingLegacyClaim.checksum !== claimChecksum) throw new Error("durable-claim-payload-corrupt");
        continue;
      }
      const claimTurnId = authorityTurnId(claim, journal, latest, "claim", (turnId) => Boolean(this.selectTurn.get(journal.originId, turnId)));
      const claimId = checksumPayload(`${claimTurnId}|${raw}`);
      const existingClaim = this.selectClaim.get(journal.originId, claimId);
      if (existingClaim && (existingClaim.turn_id !== claimTurnId || existingClaim.checksum !== claimChecksum)) throw new Error("durable-claim-identity-conflict");
      this.insertClaim.run(journal.originId, claimId, claimTurnId, raw, claimChecksum, this.clock());
    }
    const journalTurnIds = new Set(journal.transactions.map((transaction) => transaction.turnId));
    const finalizedTraces = traces.flatMap((trace) => {
      if (trace?.operation !== "turn") return [trace];
      if (["COMMITTED", "REPLAYED"].includes(trace.commitStatus)) throw new Error("runtime-trace-final-status-main-owned");
      if (trace.commitStatus !== "PENDING") return [trace];
      if (!journalTurnIds.has(trace.turnId)) return [];
      return [{ ...trace, commitStatus: existingTurns.get(trace.turnId) ? "REPLAYED" : "COMMITTED" }];
    });
    this.writeRuntimeTraces(journal.originId, finalizedTraces, { allowFinalTurnStatuses: true });
    this.upsert.run(key, RECORD_KIND, RECORD_SCHEMA_VERSION, payload, saveChecksum, this.clock());
    if (latest) {
      this.deleteWorldInferenceForTurn.run(journal.originId, latest.turnId);
      this.deleteWorldInferenceLock.run(journal.originId, latest.turnId);
    }
    return { latest, replayed: Boolean(latestExisting) };
  }

  commitTurn(key, payload, traces = [], options = {}) {
    assertKey(key);
    assertPayload(payload, this.maxPayloadBytes);
    const journal = turnJournalFromPayload(payload);
    if (!journal) {
      this.setItem(key, payload);
      return { durable: true, originId: null, turnId: null, stateRevision: 0, checksum: checksumPayload(payload), replayed: false };
    }
    const saveChecksum = checksumPayload(payload);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const written = this.writeTurnJournal(journal, payload, saveChecksum, key, Array.isArray(traces) ? traces : []);
      if (options.failAfter) throw new Error("injected-persistence-failure");
      this.db.exec("COMMIT");
      return { durable: true, originId: journal.originId, turnId: written.latest?.turnId ?? null, stateRevision: journal.stateRevision, checksum: saveChecksum, replayed: written.replayed };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  readRuntimeTraces(originId, limit = 128) {
    requiredText(originId, "runtime-trace-origin-missing");
    if (!Number.isInteger(limit) || limit < 1 || limit > 128) throw new Error("runtime-trace-limit-invalid");
    return this.listTraces.all(originId, limit).map((row) => {
      if (checksumPayload(row.payload) !== row.checksum) throw new Error("runtime-trace-corrupt");
      let parsed;
      try { parsed = JSON.parse(row.payload); }
      catch { throw new Error("runtime-trace-corrupt"); }
      if (!recordOf(parsed) || parsed.traceInstanceId !== row.trace_id) throw new Error("runtime-trace-corrupt");
      return parsed;
    }).reverse();
  }

  appendRuntimeTraces(activeKey, traces) {
    assertKey(activeKey);
    if (!Array.isArray(traces) || traces.length < 1 || traces.length > 128) throw new Error("runtime-trace-batch-invalid");
    const payload = this.getItem(activeKey);
    if (!payload) throw new Error("runtime-trace-active-save-missing");
    const journal = turnJournalFromPayload(payload);
    if (!journal) throw new Error("runtime-trace-origin-missing");
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      this.writeRuntimeTraces(journal.originId, traces);
      this.db.exec("COMMIT");
      return { saved: true, originId: journal.originId, count: traces.length };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  lockWorldInference(activeKey, turnId, baseRevision) {
    assertKey(activeKey);
    const normalizedTurnId = requiredText(turnId, "world-inference-turn-id-missing");
    if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new Error("world-inference-base-revision-invalid");
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const activePayload = payloadFromRow(this.select.get(activeKey));
      if (!activePayload) throw new Error("world-inference-active-save-missing");
      const journal = turnJournalFromPayload(activePayload);
      const activeGame = recordOf(JSON.parse(activePayload));
      const kernelWeek = Number(activeGame?.worldKernel?.currentWeek);
      const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(activeGame?.week);
      const durableRevision = Number(activeGame?.worldKernel?.revision);
      if (!journal || !Number.isInteger(durableWeek) || normalizedTurnId !== `world:${durableWeek}`) throw new Error("world-inference-turn-mismatch");
      if (!Number.isInteger(durableRevision) || durableRevision !== baseRevision) throw new Error("world-inference-base-revision-mismatch");
      const existing = this.selectWorldInferenceLock.get(journal.originId, normalizedTurnId);
      if (existing) {
        if (existing.base_revision !== baseRevision || checksumPayload(existing.snapshot) !== existing.snapshot_checksum) throw new Error("world-inference-lock-corrupt");
        this.db.exec("COMMIT");
        return { originId: journal.originId, turnId: normalizedTurnId, baseRevision, snapshotHash: existing.snapshot_checksum, replayed: true };
      }
      const snapshotChecksum = checksumPayload(activePayload);
      this.insertWorldInferenceLock.run(journal.originId, normalizedTurnId, baseRevision, activePayload, snapshotChecksum, this.clock());
      this.db.exec("COMMIT");
      return { originId: journal.originId, turnId: normalizedTurnId, baseRevision, snapshotHash: snapshotChecksum, replayed: false };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  stageWorldInference(activeKey, turnId, baseRevision, resolution) {
    assertKey(activeKey);
    const normalizedTurnId = requiredText(turnId, "world-inference-turn-id-missing");
    if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new Error("world-inference-base-revision-invalid");
    const resolutionPayload = typeof resolution === "string" ? resolution : JSON.stringify(resolution);
    assertPayload(resolutionPayload, this.maxPayloadBytes);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const activePayload = payloadFromRow(this.select.get(activeKey));
      if (!activePayload) throw new Error("world-inference-active-save-missing");
      const journal = turnJournalFromPayload(activePayload);
      const activeGame = recordOf(JSON.parse(activePayload));
      const kernelWeek = Number(activeGame?.worldKernel?.currentWeek);
      const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(activeGame?.week);
      const durableRevision = Number(activeGame?.worldKernel?.revision);
      if (!journal || normalizedTurnId !== `world:${durableWeek}`) throw new Error("world-inference-turn-mismatch");
      if (durableRevision !== baseRevision) throw new Error("world-inference-base-revision-mismatch");
      let authorityLock = this.selectWorldInferenceLock.get(journal.originId, normalizedTurnId);
      if (!authorityLock || authorityLock.base_revision !== baseRevision) throw new Error("world-inference-lock-missing");
      if (checksumPayload(authorityLock.snapshot) !== authorityLock.snapshot_checksum) throw new Error("world-inference-lock-corrupt");
      const resolutionChecksum = checksumPayload(resolutionPayload);
      const replayed = authorityLock.resolution !== null;
      if (authorityLock.resolution === null) {
        if (checksumPayload(activePayload) !== authorityLock.snapshot_checksum) throw new Error("world-inference-source-changed-before-resolution");
        const updated = this.updateWorldInferenceResolution.run(resolutionPayload, resolutionChecksum, journal.originId, normalizedTurnId);
        if (updated.changes !== 1) throw new Error("world-inference-resolution-raced");
        authorityLock = this.selectWorldInferenceLock.get(journal.originId, normalizedTurnId);
      }
      if (checksumPayload(authorityLock.resolution) !== authorityLock.resolution_checksum) throw new Error("world-inference-resolution-corrupt");
      if (stableSerialize(JSON.parse(authorityLock.resolution)) !== stableSerialize(JSON.parse(resolutionPayload))) throw new Error("world-inference-resolution-conflict");
      this.db.exec("COMMIT");
      return { originId: journal.originId, turnId: normalizedTurnId, baseRevision, resolutionHash: authorityLock.resolution_checksum, replayed };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  finalizeWorldInference(activeKey, turnId, baseRevision, manifest) {
    assertKey(activeKey);
    const normalizedTurnId = requiredText(turnId, "world-inference-turn-id-missing");
    if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new Error("world-inference-base-revision-invalid");
    const manifestPayload = typeof manifest === "string" ? manifest : JSON.stringify(manifest);
    // The frozen manifest also owns renderer-only autonomous proposal state.
    // It is bounded independently and stripped before creating a model ticket.
    assertPayload(manifestPayload, WORLD_INFERENCE_MANIFEST_MAX_BYTES);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const activePayload = payloadFromRow(this.select.get(activeKey));
      if (!activePayload) throw new Error("world-inference-active-save-missing");
      const journal = turnJournalFromPayload(activePayload);
      const activeGame = recordOf(JSON.parse(activePayload));
      const kernelWeek = Number(activeGame?.worldKernel?.currentWeek);
      const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(activeGame?.week);
      const durableRevision = Number(activeGame?.worldKernel?.revision);
      if (!journal || normalizedTurnId !== `world:${durableWeek}`) throw new Error("world-inference-turn-mismatch");
      if (durableRevision !== baseRevision) throw new Error("world-inference-base-revision-mismatch");
      let authorityLock = this.selectWorldInferenceLock.get(journal.originId, normalizedTurnId);
      if (!authorityLock) throw new Error("world-inference-lock-missing");
      if (checksumPayload(authorityLock.snapshot) !== authorityLock.snapshot_checksum) throw new Error("world-inference-lock-corrupt");
      if (typeof authorityLock.resolution !== "string" || checksumPayload(authorityLock.resolution) !== authorityLock.resolution_checksum) throw new Error("world-inference-resolution-missing");
      const activeChecksum = checksumPayload(activePayload);
      const activeStable = stableSerialize(activeGame);
      if (activeChecksum !== authorityLock.snapshot_checksum && activeChecksum !== authorityLock.resolution_checksum
        && activeStable !== stableSerialize(JSON.parse(authorityLock.snapshot))
        && activeStable !== stableSerialize(JSON.parse(authorityLock.resolution))) {
        const resolutionGame = recordOf(JSON.parse(authorityLock.resolution));
        const activeWithoutParticipation = { ...activeGame, activeParticipationScene: resolutionGame?.activeParticipationScene ?? null };
        if (stableSerialize(activeWithoutParticipation) !== stableSerialize(resolutionGame)) throw new Error("world-inference-active-save-changed-after-resolution");
      }
      const manifestChecksum = checksumPayload(manifestPayload);
      if (authorityLock.manifest === null) {
        const updated = this.updateWorldInferenceManifest.run(manifestPayload, manifestChecksum, journal.originId, normalizedTurnId);
        if (updated.changes !== 1) throw new Error("world-inference-manifest-raced");
        authorityLock = this.selectWorldInferenceLock.get(journal.originId, normalizedTurnId);
      }
      if (checksumPayload(authorityLock.manifest) !== authorityLock.manifest_checksum) throw new Error("world-inference-manifest-corrupt");
      this.db.exec("COMMIT");
      return {
        originId: journal.originId,
        turnId: normalizedTurnId,
        baseRevision,
        manifestHash: authorityLock.manifest_checksum,
        manifest: JSON.parse(authorityLock.manifest),
        replayed: authorityLock.manifest !== manifestPayload,
      };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  prepareWorldInference(activeKey, payload, turnId, baseRevision) {
    assertKey(activeKey);
    assertPayload(payload, WORLD_INFERENCE_REQUEST_MAX_BYTES);
    const normalizedTurnId = requiredText(turnId, "world-inference-turn-id-missing");
    if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new Error("world-inference-base-revision-invalid");
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const activePayload = payloadFromRow(this.select.get(activeKey));
      if (!activePayload) throw new Error("world-inference-active-save-missing");
      const journal = turnJournalFromPayload(activePayload);
      const activeGame = recordOf(JSON.parse(activePayload));
      const kernelWeek = Number(activeGame?.worldKernel?.currentWeek);
      const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(activeGame?.week);
      const durableRevision = Number(activeGame?.worldKernel?.revision);
      if (!journal || !Number.isInteger(durableWeek) || normalizedTurnId !== `world:${durableWeek}`) throw new Error("world-inference-turn-mismatch");
      if (!Number.isInteger(durableRevision) || durableRevision !== baseRevision) throw new Error("world-inference-base-revision-mismatch");
      const authorityLock = this.selectWorldInferenceLock.get(journal.originId, normalizedTurnId);
      if (!authorityLock || authorityLock.base_revision !== baseRevision) throw new Error("world-inference-lock-missing");
      if (checksumPayload(authorityLock.snapshot) !== authorityLock.snapshot_checksum) throw new Error("world-inference-lock-corrupt");
      if (typeof authorityLock.manifest !== "string" || checksumPayload(authorityLock.manifest) !== authorityLock.manifest_checksum) throw new Error("world-inference-manifest-missing");
      const preparedPayload = JSON.parse(payload);
      const frozenManifest = JSON.parse(authorityLock.manifest);
      const { runtimeAutonomousProposals: _runtimeAutonomousProposals, ...inferenceManifest } = frozenManifest;
      const lockedPayload = JSON.stringify({ payload: inferenceManifest, maxChars: preparedPayload?.maxChars });
      assertPayload(lockedPayload, WORLD_INFERENCE_REQUEST_MAX_BYTES);
      const ticket = `world-request:${crypto.randomUUID()}`;
      const checksum = checksumPayload(lockedPayload);
      const activeSaveChecksum = checksumPayload(activePayload);
      const existing = this.selectWorldInferenceForTurn.get(journal.originId, normalizedTurnId);
      if (existing) {
        if (existing.base_revision !== baseRevision || existing.active_save_checksum !== activeSaveChecksum || existing.checksum !== checksum || existing.payload !== lockedPayload) {
          throw new Error("world-inference-request-conflict");
        }
        if (existing.attempt_count >= 2) {
          this.deleteWorldInferenceTicket.run(existing.ticket);
          this.insertWorldInference.run(ticket, journal.originId, normalizedTurnId, baseRevision, activeSaveChecksum, lockedPayload, checksum, this.clock());
          this.db.exec("COMMIT");
          return { ticket, payloadHash: checksum, originId: journal.originId, turnId: normalizedTurnId, baseRevision, attempt: 0, retryEpoch: true };
        }
        this.db.exec("COMMIT");
        return { ticket: existing.ticket, payloadHash: existing.checksum, originId: journal.originId, turnId: normalizedTurnId, baseRevision, attempt: existing.attempt_count };
      }
      this.insertWorldInference.run(ticket, journal.originId, normalizedTurnId, baseRevision, activeSaveChecksum, lockedPayload, checksum, this.clock());
      this.db.exec("COMMIT");
      return { ticket, payloadHash: checksum, originId: journal.originId, turnId: normalizedTurnId, baseRevision, attempt: 0 };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  worldInferenceStatus(activeKey, ticket) {
    assertKey(activeKey);
    const normalizedTicket = requiredText(ticket, "world-inference-ticket-missing");
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const row = this.selectWorldInference.get(normalizedTicket);
      if (!row || !Number.isInteger(row.attempt_count) || row.attempt_count < 0 || row.attempt_count > 2) throw new Error("world-inference-ticket-invalid");
      if (checksumPayload(row.payload) !== row.checksum) throw new Error("world-inference-request-corrupt");
      const activePayload = payloadFromRow(this.select.get(activeKey));
      if (!activePayload) throw new Error("world-inference-active-save-missing");
      const journal = turnJournalFromPayload(activePayload);
      const activeGame = recordOf(JSON.parse(activePayload));
      const kernelWeek = Number(activeGame?.worldKernel?.currentWeek);
      const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(activeGame?.week);
      const durableRevision = Number(activeGame?.worldKernel?.revision);
      const authorityLock = journal ? this.selectWorldInferenceLock.get(journal.originId, row.turn_id) : null;
      if (!journal || journal.originId !== row.origin_id || row.turn_id !== `world:${durableWeek}` || row.base_revision !== durableRevision || row.active_save_checksum !== checksumPayload(activePayload) || !authorityLock || authorityLock.base_revision !== row.base_revision) {
        throw new Error("world-inference-authority-changed");
      }
      if (checksumPayload(authorityLock.snapshot) !== authorityLock.snapshot_checksum) throw new Error("world-inference-lock-corrupt");
      if (typeof authorityLock.resolution !== "string" || checksumPayload(authorityLock.resolution) !== authorityLock.resolution_checksum) throw new Error("world-inference-resolution-corrupt");
      if (typeof authorityLock.manifest !== "string" || checksumPayload(authorityLock.manifest) !== authorityLock.manifest_checksum) throw new Error("world-inference-manifest-corrupt");
      this.db.exec("COMMIT");
      return {
        ticket: row.ticket,
        payloadHash: row.checksum,
        originId: row.origin_id,
        turnId: row.turn_id,
        baseRevision: row.base_revision,
        attempt: row.attempt_count,
        exhausted: row.attempt_count >= 2,
      };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  consumeWorldInference(activeKey, ticket, attempt) {
    assertKey(activeKey);
    const normalizedTicket = requiredText(ticket, "world-inference-ticket-missing");
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > 1) throw new Error("world-inference-attempt-invalid");
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const row = this.selectWorldInference.get(normalizedTicket);
      if (!row || row.attempt_count !== attempt || row.attempt_count >= 2) throw new Error("world-inference-ticket-invalid");
      if (checksumPayload(row.payload) !== row.checksum) throw new Error("world-inference-request-corrupt");
      const activePayload = payloadFromRow(this.select.get(activeKey));
      if (!activePayload) throw new Error("world-inference-active-save-missing");
      const journal = turnJournalFromPayload(activePayload);
      const activeGame = recordOf(JSON.parse(activePayload));
      const kernelWeek = Number(activeGame?.worldKernel?.currentWeek);
      const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(activeGame?.week);
      const durableRevision = Number(activeGame?.worldKernel?.revision);
      const authorityLock = journal ? this.selectWorldInferenceLock.get(journal.originId, row.turn_id) : null;
      if (!journal || journal.originId !== row.origin_id || row.turn_id !== `world:${durableWeek}` || row.base_revision !== durableRevision || row.active_save_checksum !== checksumPayload(activePayload) || !authorityLock || authorityLock.base_revision !== row.base_revision) {
        throw new Error("world-inference-authority-changed");
      }
      if (checksumPayload(authorityLock.snapshot) !== authorityLock.snapshot_checksum) throw new Error("world-inference-lock-corrupt");
      if (typeof authorityLock.resolution !== "string" || checksumPayload(authorityLock.resolution) !== authorityLock.resolution_checksum) throw new Error("world-inference-resolution-corrupt");
      if (typeof authorityLock.manifest !== "string" || checksumPayload(authorityLock.manifest) !== authorityLock.manifest_checksum) throw new Error("world-inference-manifest-corrupt");
      this.db.exec("COMMIT");
      return {
        payload: JSON.parse(row.payload),
        payloadHash: row.checksum,
        originId: row.origin_id,
        turnId: row.turn_id,
        baseRevision: row.base_revision,
        authorityPayload: JSON.parse(authorityLock.snapshot),
        authoritySnapshotHash: authorityLock.snapshot_checksum,
        authorityManifest: JSON.parse(authorityLock.manifest),
        authorityManifestHash: authorityLock.manifest_checksum,
        authorityResolution: JSON.parse(authorityLock.resolution),
        authorityResolutionHash: authorityLock.resolution_checksum,
      };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
  }

  beginWorldInferenceAttempt(ticket, attempt) {
    const normalizedTicket = requiredText(ticket, "world-inference-ticket-missing");
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > 1) throw new Error("world-inference-attempt-invalid");
    const updated = this.advanceWorldInference.run(this.clock(), normalizedTicket, attempt);
    if (updated.changes !== 1) throw new Error("world-inference-ticket-raced");
    return { started: true, attempt };
  }

  replaceWithRecovery(activeKey, activePayload, recoveryKey, checkpoint, maxEntries = 3, options = {}) {
    assertKey(activeKey);
    assertKey(recoveryKey);
    assertPayload(activePayload, this.maxPayloadBytes);
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 32 || !isRecoveryCheckpoint(checkpoint)) throw new Error("invalid-recovery-replacement");
    const journal = turnJournalFromPayload(activePayload);
    const saveChecksum = checksumPayload(activePayload);
    let inTransaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const recoveryRow = this.select.get(recoveryKey);
      let current = [];
      if (recoveryRow) {
        try {
          current = readRecoveryPayload(payloadFromRow(recoveryRow));
        } catch (error) {
          this.insertQuarantine.run(
            `quarantine:${crypto.randomUUID()}`,
            recoveryKey,
            String(recoveryRow.kind),
            Number(recoveryRow.schema_version),
            String(recoveryRow.payload),
            String(recoveryRow.checksum),
            checksumPayload(String(recoveryRow.payload)),
            String(error?.message ?? error),
            this.clock(),
          );
        }
      }
      const recoveryPayload = JSON.stringify([checkpoint, ...current].slice(0, maxEntries));
      assertPayload(recoveryPayload, this.maxPayloadBytes);
      this.upsert.run(recoveryKey, RECORD_KIND, RECORD_SCHEMA_VERSION, recoveryPayload, checksumPayload(recoveryPayload), this.clock());
      const written = journal
        ? this.writeTurnJournal(journal, activePayload, saveChecksum, activeKey)
        : (this.upsert.run(activeKey, RECORD_KIND, RECORD_SCHEMA_VERSION, activePayload, saveChecksum, this.clock()), { latest: null, replayed: false });
      if (options.failAfter) throw new Error("injected-persistence-failure");
      this.db.exec("COMMIT");
      return {
        durable: true,
        originId: journal?.originId ?? null,
        turnId: written.latest?.turnId ?? null,
        stateRevision: journal?.stateRevision ?? 0,
        checksum: saveChecksum,
        replayed: written.replayed,
        recoverySaved: true,
      };
    } catch (error) {
      if (inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      }
      throw error;
    }
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
    if (!isRecoveryCheckpoint(checkpoint)) throw new Error("invalid-recovery-checkpoint");
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
  isRecoveryCheckpoint,
};
