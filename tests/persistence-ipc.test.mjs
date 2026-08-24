import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedPersistenceKey, registerPersistenceIpc } from "../electron/persistence-ipc.cjs";

function harness(store, isTrustedSender = () => true) {
  const handlers = new Map();
  const ipcMain = { handle(name, handler) { handlers.set(name, handler); } };
  registerPersistenceIpc({ ipcMain, store, isTrustedSender });
  return handlers;
}

test("persistence IPC accepts only bounded active/recovery keys", () => {
  assert.equal(isAllowedPersistenceKey("mist-chronicle-complete-v21"), true);
  assert.equal(isAllowedPersistenceKey("mist-chronicle-recovery-v16"), true);
  assert.equal(isAllowedPersistenceKey("arbitrary-file"), false);
  assert.equal(isAllowedPersistenceKey("mist-chronicle-complete-v22"), false);
  assert.equal(isAllowedPersistenceKey("mist-chronicle-complete-v4"), false);
});

test("generic persistence mutation cannot overwrite or remove the active authority save", async () => {
  let writes = 0;
  let removals = 0;
  const handlers = harness({
    setItem() { writes += 1; },
    removeItem() { removals += 1; },
  });
  const event = { senderFrame: { url: "http://127.0.0.1:43123/" } };

  assert.deepEqual(await handlers.get("persistence:set")(event, "mist-chronicle-complete-v21", "attacker-state"), {
    available: false,
    error: "invalid-request",
  });
  assert.deepEqual(await handlers.get("persistence:remove")(event, "mist-chronicle-complete-v21"), {
    available: false,
    error: "invalid-request",
  });
  assert.equal(writes, 0);
  assert.equal(removals, 0);
});

test("persistence IPC exposes bounded save, durable turn, quarantine, and recovery operations", async () => {
  const values = new Map();
  const store = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    appendRecoveryCheckpoint(key, checkpoint) {
      const current = values.has(key) ? JSON.parse(values.get(key)) : [];
      values.set(key, JSON.stringify([checkpoint, ...current].slice(0, 3)));
    },
    readItem(key) { return { value: values.get(key) ?? null }; },
    commitTurn(key, value) { values.set(key, value); return { durable: true, originId: "save-1:main", turnId: "world:1", stateRevision: 1, checksum: "abc", replayed: false }; },
    listQuarantine() { return []; },
    quarantineItem() { return { quarantined: true, quarantineId: "quarantine:1" }; },
    replaceWithRecovery() { return { durable: true, recoverySaved: true }; },
    readRuntimeTraces() { return [{ traceInstanceId: "instance-1" }]; },
    appendRuntimeTraces() { return { saved: true, originId: "save-1:main", count: 1 }; },
  };
  const handlers = harness(store);
  const event = { senderFrame: { url: "http://127.0.0.1:43123/" } };

  assert.deepEqual(await handlers.get("persistence:get")(event, "mist-chronicle-complete-v21"), {
    available: true,
    value: null,
  });
  assert.deepEqual(await handlers.get("persistence:set")(event, "mist-chronicle-complete-v21", "payload"), { available: false, error: "invalid-request" });
  assert.equal((await handlers.get("persistence:commit-turn")(event, "mist-chronicle-complete-v21", "payload")).durable, true);
  assert.deepEqual(await handlers.get("persistence:list-quarantine")(event, "mist-chronicle-complete-v21"), { available: true, records: [] });
  assert.equal((await handlers.get("persistence:quarantine")(event, "mist-chronicle-complete-v21", "invalid-save")).quarantined, true);
  assert.equal((await handlers.get("persistence:replace-with-recovery")(event, "mist-chronicle-complete-v21", "payload", "mist-chronicle-recovery-v21", { id: "r2" })).durable, true);
  assert.equal((await handlers.get("persistence:runtime-traces")(event, "save-1:main", 10)).traces[0].traceInstanceId, "instance-1");
  assert.equal((await handlers.get("persistence:append-runtime-traces")(event, "mist-chronicle-complete-v21", [{ traceInstanceId: "instance-1" }])).saved, true);
  assert.deepEqual(await handlers.get("persistence:get")(event, "mist-chronicle-complete-v21"), {
    available: true,
    value: "payload",
  });
  assert.equal((await handlers.get("persistence:append-recovery")(event, "mist-chronicle-recovery-v21", { id: "r1", game: { worldKernel: {} } })).saved, true);
  assert.deepEqual(await handlers.get("persistence:remove")(event, "mist-chronicle-complete-v21"), { available: false, error: "invalid-request" });
  assert.deepEqual(await handlers.get("persistence:get")(event, "arbitrary-file"), {
    available: false,
    error: "invalid-request",
  });
});

test("persistence IPC preserves corrupt status instead of converting it to a missing value", async () => {
  const handlers = harness({
    readItem() { return { value: null, corrupt: true, quarantineId: "quarantine:1", error: "persistence-record-corrupt" }; },
    getItem() { throw new Error("not-used"); },
  });
  assert.deepEqual(await handlers.get("persistence:get")({}, "mist-chronicle-complete-v21"), {
    available: true,
    value: null,
    corrupt: true,
    quarantineId: "quarantine:1",
    error: "persistence-record-corrupt",
  });
});

test("persistence IPC rejects an untrusted renderer without touching the store", async () => {
  let writes = 0;
  const handlers = harness({
    getItem() { return null; },
    setItem() { writes += 1; },
    removeItem() {},
    appendRecoveryCheckpoint() {},
  }, () => false);
  const result = await handlers.get("persistence:set")({ senderFrame: { url: "file:///unexpected" } }, "mist-chronicle-recovery-v21", "payload");
  assert.equal(result.available, true);
  assert.equal(result.saved, false);
  assert.equal(result.error, "untrusted-renderer");
  assert.equal(writes, 0);
});

test("persistence IPC preserves a fatal database initialization error instead of advertising a normal fallback", async () => {
  const handlers = new Map();
  registerPersistenceIpc({
    ipcMain: { handle(name, handler) { handlers.set(name, handler); } },
    store: null,
    isTrustedSender: () => true,
    unavailableResult: () => ({ available: false, fatal: true, error: "persistence-initialization-failed" }),
  });

  assert.deepEqual(await handlers.get("persistence:get")({ senderFrame: { url: "http://127.0.0.1:43121/" } }, "mist-chronicle-complete-v21"), {
    available: false,
    fatal: true,
    error: "persistence-initialization-failed",
  });
});
