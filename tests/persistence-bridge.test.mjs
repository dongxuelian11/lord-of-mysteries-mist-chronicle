import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import { loadGameSession, persistActiveGame, persistActiveGameAsync } from "../app/game-session-controller.ts";
import { createRecoveryCheckpointAsync, readRecoveryCheckpointsAsync } from "../app/save-system.ts";

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

test("an empty SQLite store migrates an existing browser save on first launch", async () => {
  const local = storage({ "mist-chronicle-complete-v21": JSON.stringify(gameAtWeek(5)) });
  const writes = [];
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async set(key, payload) { writes.push([key, JSON.parse(payload).week]); return { available: true, saved: true }; },
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

test("a corrupt current SQLite record is cleared without falling back to a legacy record", async () => {
  const local = storage({ "mist-chronicle-complete-v21": JSON.stringify(gameAtWeek(3)) });
  const removed = [];
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get(key) {
        if (key === "mist-chronicle-complete-v21") return { available: true, value: null, error: "persistence-record-corrupt" };
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
  assert.deepEqual(removed, ["mist-chronicle-complete-v21"]);
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
      async set(key, payload) {
        writes.push([key, JSON.parse(payload).week]);
        return { available: true, saved: true };
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
  globalThis.window = {
    localStorage: local,
    sessionStorage: storage(),
    mistPersistence: {
      async get() { return { available: true, value: null }; },
      async set() { return { available: true, saved: false, fatal: true, error: "sqlite-write-failed" }; },
      async remove() { return { available: true, removed: true }; },
      async appendRecovery() { return { available: true, saved: true }; },
    },
  };

  await assert.rejects(persistActiveGameAsync(gameAtWeek(8)), /sqlite-write-failed/);
  assert.equal(local.getItem("mist-chronicle-complete-v21"), null);
});

test("async recovery keeps malformed current records fail-closed and writes through the bridge", async () => {
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

  assert.deepEqual(await readRecoveryCheckpointsAsync(), []);
  await createRecoveryCheckpointAsync(gameAtWeek(4), "week");
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "mist-chronicle-recovery-v21");
  assert.equal(writes[0][2], 3);
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
