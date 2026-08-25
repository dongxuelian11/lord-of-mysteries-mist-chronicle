import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { REQUIRED_SOURCE_FILES, verifyCodeCoverage } from "../scripts/verify-code-coverage.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testParent = process.env.GMZZ_STORAGE_ROOT ?? path.join(repositoryRoot, ".runtime");
fs.mkdirSync(testParent, { recursive: true });
const testRoot = fs.mkdtempSync(path.join(testParent, "coverage-verifier-suite-"));

function writeFixture({ report = {}, manifest = {}, commit = "a".repeat(40) } = {}) {
  const root = fs.mkdtempSync(path.join(testRoot, "case-"));
  const reportPath = path.join(root, "coverage-final.json");
  const manifestPath = path.join(root, "coverage-manifest.json");
  fs.writeFileSync(reportPath, JSON.stringify(report));
  const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex");
  fs.writeFileSync(manifestPath, JSON.stringify({
    commit,
    reportSha256,
    sourceFileCount: Object.keys(report).length,
    reportPath: path.relative(repositoryRoot, reportPath),
    ...manifest,
  }));
  return { root, reportPath, manifestPath, commit };
}

function writeBaseline(root, report) {
  const sourceFiles = Object.fromEntries(Object.entries(report).map(([sourcePath, value]) => [sourcePath, {
    statements: { total: Object.keys(value.s).length, covered: Object.values(value.s).filter((counter) => counter > 0).length, pct: 100 },
    functions: { total: Object.keys(value.f).length, covered: Object.values(value.f).filter((counter) => counter > 0).length, pct: 100 },
    branches: { total: Object.values(value.b).flat().length, covered: Object.values(value.b).flat().filter((counter) => counter > 0).length, pct: 100 },
  }]));
  const baselinePath = path.join(root, "coverage-baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify({ schemaVersion: 1, sourceFiles }));
  return baselinePath;
}

function validReport() {
  return Object.fromEntries(REQUIRED_SOURCE_FILES.map((sourcePath) => [sourcePath, {
    path: sourcePath,
    statementMap: { "1": { start: { line: 1 }, end: { line: 1 } } },
    fnMap: { "1": { name: "fixture" } },
    branchMap: { "1": { line: 1, type: "if" } },
    s: { "1": 1 },
    f: { "1": 1 },
    b: { "1": [1] },
  }]));
}

test.after(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

test("coverage verifier accepts a non-empty source-aware report bound to its manifest", () => {
  const fixture = writeFixture({ report: validReport() });
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    expectedCommit: fixture.commit,
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.sourceFileCount, REQUIRED_SOURCE_FILES.length);
  assert.equal(result.totalCounters, REQUIRED_SOURCE_FILES.length * 3);
});

test("coverage verifier rejects an empty report instead of returning a false green", () => {
  const fixture = writeFixture({ report: {} });
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    expectedCommit: fixture.commit,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /COVERAGE_SOURCE_FILE_COUNT_GT_0/);
  assert.match(result.errors.join("\n"), /COVERAGE_COUNTERS_GT_0/);
});

test("coverage verifier requires game-engine and the other authority sources", () => {
  const report = validReport();
  delete report["app/game-engine.ts"];
  const fixture = writeFixture({ report });
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    expectedCommit: fixture.commit,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /REQUIRED_SOURCE_FILE_MISSING: app\/game-engine\.ts/);
});

test("coverage verifier rejects non-finite or malformed counters", () => {
  const report = validReport();
  report["app/game-engine.ts"].s["1"] = "NaN";
  const fixture = writeFixture({ report });
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    expectedCommit: fixture.commit,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /coverage\[0\].*coverage counter/);
});

test("coverage verifier rejects a report generated from a different commit or digest", () => {
  const fixture = writeFixture({
    report: validReport(),
    manifest: { reportSha256: "0".repeat(64) },
  });
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    expectedCommit: "b".repeat(40),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /coverage manifest\.commit/);
  assert.match(result.errors.join("\n"), /coverage manifest\.reportSha256/);
});

test("coverage verifier rejects a missing manifest even when source counters exist", () => {
  const fixture = writeFixture({ report: validReport() });
  fs.rmSync(fixture.manifestPath);
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    expectedCommit: fixture.commit,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /coverage manifest: missing file/);
});

test("coverage verifier accepts a non-regressing baseline", () => {
  const report = validReport();
  const fixture = writeFixture({ report });
  const baselinePath = writeBaseline(fixture.root, report);
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    baselinePath,
    expectedCommit: fixture.commit,
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("coverage verifier rejects a percentage regression against the baseline", () => {
  const report = validReport();
  const fixture = writeFixture({ report });
  const baselinePath = writeBaseline(fixture.root, report);
  report["app/game-engine.ts"].s["1"] = 0;
  fs.writeFileSync(fixture.reportPath, JSON.stringify(report));
  const result = verifyCodeCoverage({
    reportPath: fixture.reportPath,
    manifestPath: fixture.manifestPath,
    baselinePath,
    expectedCommit: fixture.commit,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /COVERAGE_BASELINE_PERCENTAGE_REGRESSED/);
});
