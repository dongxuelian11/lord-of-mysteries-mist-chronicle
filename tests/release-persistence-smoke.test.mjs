import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSqlitePersistenceStore } from "../electron/persistence-sqlite.cjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const verifierPath = path.join(repositoryRoot, "scripts/release/verify-persistence-db.mjs");
const installerSmokePath = path.join(repositoryRoot, "scripts/release/smoke-installer.ps1");

function runVerifier(databasePath) {
  return spawnSync(process.execPath, [verifierPath, databasePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("release persistence verifier accepts a WAL schema in read-only mode", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmzz-pr3-release-"));
  const databasePath = path.join(directory, "mist-chronicle.sqlite");
  const store = createSqlitePersistenceStore(databasePath);
  store.setItem("mist-chronicle-complete-v21", "{\"version\":21}");
  store.close();

  try {
    const result = runVerifier(databasePath);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.journalMode, "wal");
    assert.equal(report.persistenceRecordsTable, true);
    assert.equal(report.readOnlyProbe, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("release persistence verifier fails closed for a missing database", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmzz-pr3-release-missing-"));
  try {
    const result = runVerifier(path.join(directory, "missing.sqlite"));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /database-file-missing/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("installer smoke owns the packaged persistence startup qualification", () => {
  const source = fs.readFileSync(installerSmokePath, "utf8");
  assert.match(source, /GMZZ_READY/);
  assert.match(source, /GMZZ_USER_DATA/);
  assert.match(source, /mist-chronicle\.sqlite/);
  assert.match(source, /verify-persistence-db\.mjs/);
  assert.match(source, /SQLite persistence database was not created/);
});
