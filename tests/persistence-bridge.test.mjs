import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { branchRecoveredGame, loadGameSession, loadPersistentRuntimeTraces, persistActiveGame, persistActiveGameAsync, replaceActiveGameWithRecoveryAsync, saveAiSessionSettings } from "../app/game-session-controller.ts";
import { createRecoveryCheckpointAsync, readRecoveryCheckpointsAsync } from "../app/save-system.ts";
import { stablePersistenceOriginId } from "../app/persistence-origin.ts";
import { clearRuntimeTraces, recentRuntimeTraces, recordRuntimeTrace } from "../app/runtime-trace.ts";

const originalWindow = globalThis.window;

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

function gameAtWeek(week) {
  const game = createInitialGame("seer");
  game.prologueComplete = true;
  game.week = week;
  return game;
}

after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test("Electron persistence is the active authority when the bridge is available", async () => {
  const local = storage({ "mist-chronicle-complete-v21": JSON.stringify(gameAtWeek(3)) });
  const persistent = JSON.stringify(gameAtWeek(7));
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get(key) {
        return key === "mist-chronicle-complete-v21" ? { available: true, value: persistent } : { available: true, value: null };
      },
      async set() { return { available: true, saved: true }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };

  const loaded = await loadGameSession();
  assert.equal(loaded.hasSave, true);
  assert.equal(loaded.game?.week, 7);
});

test("Electron credentials are migrated into Main and never returned to renderer storage", async () => {
  const local = storage({
    "mist-chronicle-save-v3-ai": JSON.stringify({
      provider: "deepseek",
      endpoint: "https://api.deepseek.com",
      apiKey: "legacy-secret-key",
      model: "deepseek-v4-flash",
      rememberKey: true,
    }),
  });
  const session = storage({ "mist-chronicle-session-ai-key": "stale-session-key" });
  const received = [];
  globalThis.window = {
    localStorage: local,
    sessionStorage: session,
    mistInference: { async request() { throw new Error("not-used"); } },
    mistCredentials: {
      async status() { return { available: true, configured: false, persistent: false }; },
      async set(key, persist) { received.push([key, persist]); return { available: true, configured: true, persistent: persist }; },
      async clear() { return { available: true, configured: false, persistent: false }; },
    },
  };

  const loaded = await loadGameSession();
  assert.deepEqual(received, [["legacy-secret-key", true]]);
  assert.equal(loaded.aiConfig?.apiKey, "");
  assert.equal(loaded.credentialConfigured, true);
  assert.equal(session.getItem("mist-chronicle-session-ai-key"), null);
  assert.equal(JSON.parse(local.getItem("mist-chronicle-save-v3-ai")).apiKey, "");

  const saved = await saveAiSessionSettings({
    provider: "deepseek",
    endpoint: "https://api.deepseek.com",
    apiKey: "new-main-only-key",
    model: "deepseek-v4-flash",
  }, false, true);
  assert.equal(saved.credentialConfigured, true);
  assert.deepEqual(received.at(-1), ["new-main-only-key", false]);
  assert.equal(session.getItem("mist-chronicle-session-ai-key"), null);
  assert.equal(JSON.parse(local.getItem("mist-chronicle-save-v3-ai")).apiKey, "");
});

test("an empty SQLite store migrates an existing browser save on first launch", async () => {
  const local = storage({ "mist-chronicle-complete-v21": JSON.stringify(gameAtWeek(5)) });
  const writes = [];
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async commitTurn(key, payload) { writes.push([key, JSON.parse(payload).week]); return { available: true, saved: true, durable: true }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };

  const loaded = await loadGameSession();
  assert.equal(loaded.game?.week, 5);
  persistActiveGame(loaded.game);
  await persistActiveGameAsync(loaded.game);
  assert.deepEqual(writes.at(-1), ["mist-chronicle-complete-v21", 5]);
});

test("a corrupt current SQLite record is quarantined and never cleared or treated as missing", async () => {
  const local = storage({ "mist-chronicle-complete-v21": JSON.stringify(gameAtWeek(3)) });
  const removed = [];
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get(key) {
        if (key === "mist-chronicle-complete-v21") return { available: true, value: null, corrupt: true, quarantineId: "quarantine:active", error: "persistence-record-corrupt" };
        return { available: true, value: JSON.stringify(gameAtWeek(9)) };
      },
      async set() { return { available: true, saved: true }; },
      async remove(key) { removed.push(key); return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };

  const loaded = await loadGameSession();
  assert.equal(loaded.game, undefined);
  assert.equal(loaded.hasSave, false);
  assert.match(loaded.persistenceError ?? "", /persistence-record-corrupt/);
  assert.deepEqual(removed, []);
});

test("an invalid legacy SQLite save is quarantined and reported instead of silently disappearing", async () => {
  const quarantined = [];
  globalThis.window = {
    localStorage: storage(),
    sessionStorage: storage(),
    mistPersistence: {
      async get(key) {
        if (key === "mist-chronicle-complete-v20") return { available: true, value: "{truncated" };
        return { available: true, value: null };
      },
      async quarantine(key, reason) { quarantined.push([key, reason]); return { available: true, quarantined: true }; },
    },
  };

  const loaded = await loadGameSession();
  assert.equal(loaded.game, undefined);
  assert.equal(loaded.hasSave, false);
  assert.equal(loaded.persistenceError, undefined);
  assert.equal(loaded.persistenceWarning, "active-save-migration-rejected");
  assert.deepEqual(quarantined, [["mist-chronicle-complete-v20", "active-save-migration-rejected"]]);
});

test("an invalid legacy browser save is quarantined locally and reports the migration failure", async () => {
  const local = storage({ "mist-chronicle-complete-v20": "{truncated" });
  globalThis.window = { localStorage: local, sessionStorage: storage() };

  const loaded = await loadGameSession();
  assert.equal(loaded.game, undefined);
  assert.equal(loaded.hasSave, false);
  assert.equal(loaded.persistenceError, undefined);
  assert.equal(loaded.persistenceWarning, "active-save-migration-rejected");
  assert.equal(local.getItem("mist-chronicle-complete-v20"), null);
  assert.equal(local.getItem("mist-chronicle-quarantine:mist-chronicle-complete-v20"), "{truncated");
  assert.equal(local.getItem("mist-chronicle-quarantine:mist-chronicle-complete-v20:reason"), "active-save-migration-rejected");
});

test("an invalid current browser save is quarantined locally before the active key is removed", async () => {
  const local = storage({ "mist-chronicle-complete-v21": "{truncated" });
  globalThis.window = { localStorage: local, sessionStorage: storage() };

  const loaded = await loadGameSession();
  assert.equal(loaded.game, undefined);
  assert.equal(loaded.hasSave, false);
  assert.equal(loaded.persistenceError, undefined);
  assert.equal(loaded.persistenceWarning, "active-save-migration-rejected");
  assert.equal(local.getItem("mist-chronicle-complete-v21"), null);
  assert.equal(local.getItem("mist-chronicle-quarantine:mist-chronicle-complete-v21"), "{truncated");
  assert.equal(local.getItem("mist-chronicle-quarantine:mist-chronicle-complete-v21:reason"), "active-save-migration-rejected");
});

test("a legacy browser save remains in place when local quarantine cannot be written", async () => {
  const local = storage({ "mist-chronicle-complete-v20": "{truncated" });
  const write = local.setItem;
  local.setItem = (key, value) => {
    if (key.startsWith("mist-chronicle-quarantine:")) throw new Error("quota-exceeded");
    write(key, value);
  };
  globalThis.window = { localStorage: local, sessionStorage: storage() };

  const loaded = await loadGameSession();
  assert.equal(loaded.game, undefined);
  assert.equal(loaded.hasSave, false);
  assert.match(loaded.persistenceError ?? "", /active-save-quarantine-failed/);
  assert.equal(loaded.persistenceWarning, undefined);
  assert.equal(local.getItem("mist-chronicle-complete-v20"), "{truncated");
});

test("world-state persistence waits for the durable turn acknowledgement", async () => {
  const calls = [];
  globalThis.window = {
    localStorage: storage(), sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async set() { throw new Error("plain-set-must-not-own-a-world-turn"); },
      async commitTurn(key, payload) {
        const game = JSON.parse(payload);
        calls.push([key, game.saveId, game.worldLedger.branchId]);
        return { available: true, saved: true, durable: true, originId: `${game.saveId}:${game.worldLedger.branchId}`, turnId: "world:1", stateRevision: 1, checksum: "abc" };
      },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };
  const game = gameAtWeek(2);
  game.saveId = "save-ack";
  game.worldKernel.revision = 1;
  game.worldKernel.committedTransactions = [{ turnId: "world:1", resolvingWeek: 1, baseRevision: 0, inputHash: "input" }];
  await persistActiveGameAsync(game);
  assert.deepEqual(calls, [["mist-chronicle-complete-v21", "save-ack", "main"]]);
});

test("turn traces become COMMITTED only after the durable acknowledgement", async () => {
  clearRuntimeTraces();
  const game = gameAtWeek(2);
  game.saveId = "save-trace-ack";
  game.worldKernel.revision = 1;
  game.worldKernel.committedTransactions = [{ turnId: "world:1", resolvingWeek: 1, baseRevision: 0, inputHash: "input" }];
  recordRuntimeTrace({ traceInstanceId: "trace-instance:pending", traceId: "turn:world:1", operation: "turn", turnId: "world:1", outcome: "PASS", commitStatus: "PENDING" });

  let captured = [];
  let acknowledge;
  let commitStarted;
  const started = new Promise((resolve) => { commitStarted = resolve; });
  globalThis.window = {
    localStorage: storage(), sessionStorage: storage(),
    mistPersistence: {
      async commitTurn(_key, _payload, traces) {
        captured = structuredClone(traces);
        commitStarted();
        return new Promise((resolve) => {
          acknowledge = () => resolve({
            available: true, saved: true, durable: true, replayed: false,
            originId: stablePersistenceOriginId(game.saveId, game.worldLedger.branchId),
            turnId: "world:1", stateRevision: 1, checksum: "abc",
          });
        });
      },
    },
  };

  const persistence = persistActiveGameAsync(game);
  await started;
  assert.equal(captured.find((trace) => trace.turnId === "world:1")?.commitStatus, "PENDING");
  assert.equal(recentRuntimeTraces().find((trace) => trace.turnId === "world:1")?.commitStatus, "PENDING");
  acknowledge();
  await persistence;
  assert.equal(recentRuntimeTraces().find((trace) => trace.turnId === "world:1")?.commitStatus, "COMMITTED");
});

test("save import replacement uses one durable bridge transaction before returning", async () => {
  const calls = [];
  globalThis.window = {
    localStorage: storage(), sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async set() { return { available: true, saved: true }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
      async replaceWithRecovery(activeKey, payload, recoveryKey, checkpoint, limit) {
        calls.push([activeKey, JSON.parse(payload).week, recoveryKey, checkpoint.game.week, limit]);
        return { available: true, saved: true, durable: true };
      },
    },
  };
  await replaceActiveGameWithRecoveryAsync(gameAtWeek(2), gameAtWeek(9), "import");
  assert.deepEqual(calls, [["mist-chronicle-complete-v21", 9, "mist-chronicle-recovery-v21", 2, 3]]);
});

test("restoring a historical checkpoint creates a fresh durable ledger origin", () => {
  const checkpoint = gameAtWeek(2);
  const first = branchRecoveredGame(checkpoint, "checkpoint-2", "restore-a");
  const second = branchRecoveredGame(checkpoint, "checkpoint-2", "restore-b");
  assert.equal(first.saveId, checkpoint.saveId);
  assert.equal(first.worldLedger.parentBranchId, checkpoint.worldLedger.branchId);
  assert.equal(first.worldLedger.forkedAtSequence, checkpoint.worldLedger.nextSequence - 1);
  assert.notEqual(first.worldLedger.branchId, checkpoint.worldLedger.branchId);
  assert.notEqual(first.worldLedger.branchId, second.worldLedger.branchId);
  assert.notEqual(stablePersistenceOriginId(first.saveId, first.worldLedger.branchId), stablePersistenceOriginId(checkpoint.saveId, checkpoint.worldLedger.branchId));
});

test("persisted runtime traces are read back by the stable save and branch origin", async () => {
  const origins = [];
  globalThis.window = {
    localStorage: storage(), sessionStorage: storage(),
    mistPersistence: {
      async runtimeTraces(originId, limit) {
        origins.push([originId, limit]);
        return { available: true, traces: [{ schemaVersion: 1, traceInstanceId: "instance-1", traceId: "turn:1", operation: "turn" }] };
      },
    },
  };
  const game = gameAtWeek(2);
  game.saveId = "trace-save";
  const traces = await loadPersistentRuntimeTraces(game);
  assert.equal(traces[0].traceInstanceId, "instance-1");
  assert.deepEqual(origins, [[stablePersistenceOriginId("trace-save", "main"), 128]]);
});

test("active-save read failures fail closed without loading a browser fallback", async () => {
  for (const get of [
    async () => { throw new Error("bridge-disconnected"); },
    async () => ({ available: false, error: "unexpected-bridge-state" }),
  ]) {
    const local = storage({ "mist-chronicle-complete-v21": JSON.stringify(gameAtWeek(3)) });
    globalThis.window = {
      localStorage: local,
      sessionStorage: storage(),
      mistPersistence: {
        get,
        async set() { return { available: true, saved: true }; },
        async remove() { return { available: true, removed: true }; },
        async appendRecovery() { return { available: true, saved: true }; },
      },
    };

    const loaded = await loadGameSession();
    assert.equal(loaded.game, undefined);
    assert.equal(loaded.hasSave, false);
    assert.match(loaded.persistenceError ?? "", /bridge-disconnected|unexpected-bridge-state/);
    assert.notEqual(local.getItem("mist-chronicle-complete-v21"), null);
  }
});

test("active save writes are serialized through the Electron bridge", async () => {
  const local = storage();
  const writes = [];
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async commitTurn(key, payload) {
        writes.push([key, JSON.parse(payload).week]);
        return { available: true, saved: true, durable: true };
      },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };

  persistActiveGame(gameAtWeek(1));
  await persistActiveGameAsync(gameAtWeek(2));
  assert.deepEqual(writes.map(([, week]) => week), [1, 2]);
  assert.equal(local.getItem("mist-chronicle-complete-v21"), null);
});

test("SQLite active-save write failures fail closed without a browser fallback", async () => {
  const local = storage();
  clearRuntimeTraces();
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async commitTurn() { return { available: true, saved: false, durable: false, fatal: true, error: "sqlite-write-failed" }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };

  const game = gameAtWeek(8);
  game.saveId = "save-failed-trace";
  game.worldKernel.revision = 1;
  game.worldKernel.committedTransactions = [{ turnId: "world:1", resolvingWeek: 1, baseRevision: 0, inputHash: "input" }];
  recordRuntimeTrace({ traceInstanceId: "trace-instance:failed-ack", traceId: "turn:world:1", operation: "turn", turnId: "world:1", outcome: "PASS", commitStatus: "PENDING" });
  await assert.rejects(persistActiveGameAsync(game), /sqlite-write-failed/);
  assert.equal(local.getItem("mist-chronicle-complete-v21"), null);
  assert.equal(recentRuntimeTraces().find((trace) => trace.traceInstanceId === "trace-instance:failed-ack")?.commitStatus, "PENDING");
});

test("async recovery reports malformed current records instead of treating them as an empty list", async () => {
  const checkpoint = { id: "legacy", game: { worldKernel: {} } };
  const writes = [];
  globalThis.window = {
    localStorage: storage(),
    sessionStorage: storage(),
    mistPersistence: {
      async get(key) {
        if (key === "mist-chronicle-recovery-v21") return { available: true, value: "not-json" };
        return { available: true, value: JSON.stringify([checkpoint]) };
      },
      async set() { return { available: true, saved: true }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery(key, value, limit) { writes.push([key, value, limit]); return { available: true, saved: true }; },
    },
  };

  await assert.rejects(readRecoveryCheckpointsAsync(), /persistence-recovery-corrupt/);
  await createRecoveryCheckpointAsync(gameAtWeek(4), "week");
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "mist-chronicle-recovery-v21");
  assert.equal(writes[0][2], 3);
});

test("async recovery rejects a partially malformed checkpoint array instead of filtering it", async () => {
  const valid = { id: "valid", game: { worldKernel: { revision: 1 } } };
  globalThis.window = {
    localStorage: storage(),
    sessionStorage: storage(),
    mistPersistence: {
      async get(key) {
        return key === "mist-chronicle-recovery-v21"
          ? { available: true, value: JSON.stringify([valid, { id: "malformed" }]) }
          : { available: true, value: null };
      },
    },
  };

  await assert.rejects(readRecoveryCheckpointsAsync(), /persistence-recovery-corrupt/);
});

test("fatal SQLite recovery status never falls back to browser storage", async () => {
  let localWrites = 0;
  const local = storage({ "mist-chronicle-recovery-v21": JSON.stringify([{ id: "stale", game: { worldKernel: {} } }]) });
  const fatal = { available: false, fatal: true, error: "persistence-initialization-failed" };
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { return fatal; },
      async set() { return { available: true, saved: true }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { localWrites += 1; return fatal; },
    },
  };

  await assert.rejects(readRecoveryCheckpointsAsync(), /persistence-initialization-failed/);
  await assert.rejects(createRecoveryCheckpointAsync(gameAtWeek(4), "week"), /persistence-initialization-failed/);
  assert.equal(local.getItem("mist-chronicle-recovery-v21").includes("stale"), true);
  assert.equal(localWrites, 1);
});

test("recovery bridge transport failures fail closed without a browser fallback", async () => {
  const local = storage({ "mist-chronicle-recovery-v21": JSON.stringify([{ id: "stale", game: { worldKernel: {} } }]) });
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { throw new Error("bridge-disconnected"); },
      async set() { return { available: true, saved: true }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { throw new Error("bridge-disconnected"); },
    },
  };

  await assert.rejects(readRecoveryCheckpointsAsync(), /bridge-disconnected/);
  await assert.rejects(createRecoveryCheckpointAsync(gameAtWeek(4), "week"), /bridge-disconnected/);
  assert.equal(local.getItem("mist-chronicle-recovery-v21").includes("stale"), true);
});
