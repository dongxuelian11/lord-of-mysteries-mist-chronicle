import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const lifecyclePath = path.join(repositoryRoot, "scripts/release/persistence-lifecycle.mjs");
const runnerPath = path.join(repositoryRoot, "scripts/release/electron-persistence-lifecycle-runner.cjs");
const electronExe = process.env.ELECTRON_EXE || path.join(
  repositoryRoot,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);

test("PR4 lifecycle harness uses the real Electron renderer bridge and two process phases", () => {
  const source = fs.readFileSync(lifecyclePath, "utf8");
  const runner = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /electron-persistence-lifecycle-runner\.cjs/);
  assert.match(source, /runPhase\(electron, "write"/);
  assert.match(source, /runPhase\(electron, "read"/);
  assert.match(source, /verify-persistence-db\.mjs/);
  assert.match(runner, /registerPersistenceIpc/);
  assert.match(runner, /window\.mistPersistence/);
  assert.match(runner, /executeJavaScript/);
  assert.match(runner, /mist-chronicle-complete-v21/);
});

test("PR4 local Electron lifecycle survives a real process restart", { skip: !fs.existsSync(electronExe) }, () => {
  const result = spawnSync(process.execPath, [lifecyclePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const line = result.stdout.split(/\r?\n/).find((item) => item.startsWith("[pr4] "));
  assert.ok(line, result.stdout);
  const report = JSON.parse(line.slice("[pr4] ".length));
  assert.equal(report.status, "PASS");
  assert.equal(report.evidenceLevel, "local-electron");
  assert.equal(report.phases.read.markerMatch, true);
  assert.equal(report.phases.read.recoveryMatch, true);
  assert.equal(report.persistence.journalMode, "wal");
});
