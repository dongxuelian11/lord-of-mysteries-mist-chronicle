import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  LEGACY_RECOVERY_KEYS,
  RECOVERY_KEY,
  readRecoveryCheckpoints,
} from "../app/save-system.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function checkpoint(id) {
  return {
    id,
    reason: "week",
    createdAt: "2026-08-22T00:00:00.000Z",
    game: { worldKernel: {} },
  };
}

const originalWindow = globalThis.window;
after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test("recovery checkpoints keep the current key's newest three valid records", () => {
  globalThis.window = {
    localStorage: memoryStorage({
      [RECOVERY_KEY]: JSON.stringify([
        checkpoint("current-1"),
        checkpoint("current-2"),
        { id: "invalid", game: {} },
        checkpoint("current-3"),
        checkpoint("current-4"),
      ]),
    }),
  };

  assert.deepEqual(readRecoveryCheckpoints().map((item) => item.id), [
    "current-1",
    "current-2",
    "current-3",
  ]);
});

test("recovery checkpoints fall back to the first available legacy key", () => {
  globalThis.window = {
    localStorage: memoryStorage({
      [LEGACY_RECOVERY_KEYS[1]]: JSON.stringify([checkpoint("legacy-2")]),
      [LEGACY_RECOVERY_KEYS[0]]: JSON.stringify([checkpoint("legacy-1")]),
    }),
  };

  assert.deepEqual(readRecoveryCheckpoints().map((item) => item.id), ["legacy-1"]);
});

test("a malformed current recovery record fails closed instead of falling back", () => {
  globalThis.window = {
    localStorage: memoryStorage({
      [RECOVERY_KEY]: "not-json",
      [LEGACY_RECOVERY_KEYS[0]]: JSON.stringify([checkpoint("legacy")]),
    }),
  };

  assert.deepEqual(readRecoveryCheckpoints(), []);
});
