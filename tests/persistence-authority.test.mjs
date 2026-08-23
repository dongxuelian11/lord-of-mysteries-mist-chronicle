import assert from "node:assert/strict";
import test from "node:test";

import { createActiveSaveAuthority } from "../app/persistence-authority.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("active save authority prefers the current key and exposes a storage-neutral record", () => {
  const storage = memoryStorage({
    "mist-chronicle-complete-v20": "legacy-save",
    "mist-chronicle-complete-v21": "current-save",
  });
  const authority = createActiveSaveAuthority(storage, "mist-chronicle-complete-v21", ["mist-chronicle-complete-v20"]);

  assert.deepEqual(authority.read(), {
    key: "mist-chronicle-complete-v21",
    raw: "current-save",
    legacy: false,
  });
});

test("active save authority falls back to the first available legacy key", () => {
  const storage = memoryStorage({
    "mist-chronicle-complete-v19": "older-save",
    "mist-chronicle-complete-v20": "legacy-save",
  });
  const authority = createActiveSaveAuthority(storage, "mist-chronicle-complete-v21", [
    "mist-chronicle-complete-v20",
    "mist-chronicle-complete-v19",
  ]);

  assert.deepEqual(authority.read(), {
    key: "mist-chronicle-complete-v20",
    raw: "legacy-save",
    legacy: true,
  });
});

test("active save authority writes and clears only the current key", () => {
  const storage = memoryStorage({
    "mist-chronicle-complete-v20": "legacy-save",
  });
  const authority = createActiveSaveAuthority(storage, "mist-chronicle-complete-v21", [
    "mist-chronicle-complete-v20",
  ]);

  authority.write("new-save");
  assert.deepEqual(authority.read(), {
    key: "mist-chronicle-complete-v21",
    raw: "new-save",
    legacy: false,
  });

  authority.clear();
  assert.deepEqual(authority.read(), {
    key: "mist-chronicle-complete-v20",
    raw: "legacy-save",
    legacy: true,
  });
});

test("active save authority treats empty storage values as absent", () => {
  const storage = memoryStorage({
    "mist-chronicle-complete-v21": "",
    "mist-chronicle-complete-v20": "legacy-save",
  });
  const authority = createActiveSaveAuthority(storage, "mist-chronicle-complete-v21", [
    "mist-chronicle-complete-v20",
  ]);

  assert.deepEqual(authority.read(), {
    key: "mist-chronicle-complete-v20",
    raw: "legacy-save",
    legacy: true,
  });
});
