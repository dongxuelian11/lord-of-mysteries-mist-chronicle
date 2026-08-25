import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT_PATH = ".runtime/coverage/coverage-final.json";
const DEFAULT_MANIFEST_PATH = ".runtime/coverage/coverage-manifest.json";

export const REQUIRED_SOURCE_FILES = Object.freeze([
  "app/game-engine.ts",
  "app/game-engine/action-contracts.ts",
  "app/game-engine/dialogue-orchestration.ts",
  "app/game-engine/week-resolution.ts",
  "app/game-engine/world-turn-orchestrator.ts",
  "app/ai-provider-capabilities.ts",
  "app/world-kernel.ts",
  "app/world-authority-closure.ts",
  "app/world-output-adapter.ts",
  "electron/autonomous-inference.cjs",
  "electron/world-prompt.cjs",
  "electron/inference-scheduler.cjs",
  "electron/persistence-provenance.cjs",
]);

const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^file:\/\//i, "")
    .toLowerCase();
}

function pathMatches(actual, expected) {
  const normalizedActual = normalizePath(actual);
  const normalizedExpected = normalizePath(expected);
  return normalizedActual === normalizedExpected || normalizedActual.endsWith(`/${normalizedExpected}`);
}

function readJson(filePath, errors, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label}: missing file ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function counterValues(value) {
  if (typeof value === "number" || typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => counterValues(entry));
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((entry) => counterValues(entry));
}

function summarizeMetric(values, location, errors) {
  if (values.length === 0) return { total: 0, covered: 0, pct: 100 };
  for (const value of values) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      errors.push(`${location}: coverage counter must be a finite non-negative integer`);
    }
  }
  const total = values.length;
  const covered = values.filter((value) => Number.isFinite(value) && value > 0).length;
  const pct = total === 0 ? 100 : (covered / total) * 100;
  if (!Number.isFinite(pct)) errors.push(`${location}: derived percentage is not finite`);
  return { total, covered, pct };
}

function normalizeCoverageEntries(report, errors) {
  if (!isRecord(report)) {
    errors.push("coverage report: root must be an object");
    return [];
  }
  return Object.entries(report)
    .filter(([, value]) => isRecord(value) && (isRecord(value.s) || isRecord(value.f) || isRecord(value.b)))
    .map(([key, value], index) => {
      const sourcePath = typeof value.path === "string" && value.path ? value.path : key;
      const location = `coverage[${index}](${sourcePath})`;
      const statements = summarizeMetric(counterValues(value.s), `${location}.s`, errors);
      const functions = summarizeMetric(counterValues(value.f), `${location}.f`, errors);
      const branches = summarizeMetric(counterValues(value.b), `${location}.b`, errors);
      return { path: sourcePath, statements, functions, branches };
    });
}

function validateBaseline(baseline, baselinePath, entries, errors) {
  if (!isRecord(baseline)) {
    errors.push("coverage baseline: root must be an object");
    return;
  }
  const sourceFiles = isRecord(baseline.sourceFiles) ? baseline.sourceFiles : null;
  if (!sourceFiles || Object.keys(sourceFiles).length === 0) {
    errors.push("coverage baseline.sourceFiles: missing or empty");
    return;
  }
  for (const [sourcePath, expected] of Object.entries(sourceFiles)) {
    if (!isRecord(expected)) {
      errors.push(`coverage baseline[${sourcePath}]: entry must be an object`);
      continue;
    }
    const current = entries.find((entry) => pathMatches(entry.path, sourcePath));
    if (!current) {
      errors.push(`COVERAGE_BASELINE_SOURCE_MISSING: ${sourcePath}`);
      continue;
    }
    for (const metric of ["statements", "functions", "branches"]) {
      const baselineMetric = expected[metric];
      const currentMetric = current[metric];
      if (!isRecord(baselineMetric) || !Number.isInteger(baselineMetric.total) || !Number.isFinite(baselineMetric.pct)) {
        errors.push(`coverage baseline[${sourcePath}].${metric}: invalid metric`);
        continue;
      }
      if (currentMetric.total < baselineMetric.total) {
        errors.push(`COVERAGE_BASELINE_COUNTERS_REGRESSED: ${sourcePath}.${metric} total ${currentMetric.total} < ${baselineMetric.total}`);
      }
      if (currentMetric.pct + 1e-9 < baselineMetric.pct) {
        errors.push(`COVERAGE_BASELINE_PERCENTAGE_REGRESSED: ${sourcePath}.${metric} ${currentMetric.pct.toFixed(4)} < ${baselineMetric.pct.toFixed(4)}`);
      }
    }
  }
  if (baselinePath === "") errors.push("coverage baseline: invalid path");
}

function resolveExpectedCommit(expectedCommit) {
  if (expectedCommit !== undefined) return String(expectedCommit);
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function validateManifest(manifest, manifestPath, reportPath, expectedCommit, reportDigest, sourceFileCount, errors) {
  if (!isRecord(manifest)) {
    errors.push("coverage manifest: root must be an object");
    return;
  }
  const actualCommit = String(manifest.commit ?? manifest.meta?.commit ?? "");
  if (!COMMIT_PATTERN.test(actualCommit)) {
    errors.push("coverage manifest.commit: missing or invalid commit SHA");
  } else if (expectedCommit && actualCommit.toLowerCase() !== expectedCommit.toLowerCase()) {
    errors.push(`coverage manifest.commit: expected ${expectedCommit}, got ${actualCommit}`);
  }
  const manifestDigest = String(manifest.reportSha256 ?? "");
  if (!SHA256_PATTERN.test(manifestDigest)) {
    errors.push("coverage manifest.reportSha256: missing or invalid SHA-256 digest");
  } else if (manifestDigest.toLowerCase() !== reportDigest.toLowerCase()) {
    errors.push("coverage manifest.reportSha256: report digest mismatch");
  }
  if (manifest.sourceFileCount !== undefined && manifest.sourceFileCount !== sourceFileCount) {
    errors.push(`coverage manifest.sourceFileCount: expected ${sourceFileCount}, got ${manifest.sourceFileCount}`);
  }
  if (manifest.reportPath !== undefined && normalizePath(manifest.reportPath) !== normalizePath(path.relative(repositoryRoot, reportPath))) {
    errors.push("coverage manifest.reportPath: does not identify the verified report");
  }
  if (manifestPath === reportPath) errors.push("coverage manifest: must be separate from coverage report");
}

export function verifyCodeCoverage({
  reportPath = path.join(repositoryRoot, DEFAULT_REPORT_PATH),
  manifestPath = path.join(repositoryRoot, DEFAULT_MANIFEST_PATH),
  baselinePath,
  expectedCommit = resolveExpectedCommit(),
  requiredFiles = REQUIRED_SOURCE_FILES,
} = {}) {
  const errors = [];
  const absoluteReportPath = path.resolve(repositoryRoot, reportPath);
  const absoluteManifestPath = path.resolve(repositoryRoot, manifestPath);
  const report = readJson(absoluteReportPath, errors, "coverage report");
  const entries = report ? normalizeCoverageEntries(report, errors) : [];
  if (entries.length === 0) errors.push("COVERAGE_SOURCE_FILE_COUNT_GT_0: no instrumented source files found");

  const totalCounters = entries.reduce(
    (sum, entry) => sum + entry.statements.total + entry.functions.total + entry.branches.total,
    0,
  );
  if (totalCounters === 0) errors.push("COVERAGE_COUNTERS_GT_0: report contains no executable counters");

  for (const requiredFile of requiredFiles) {
    if (!entries.some((entry) => pathMatches(entry.path, requiredFile))) {
      errors.push(`REQUIRED_SOURCE_FILE_MISSING: ${requiredFile}`);
    }
  }

  const reportDigest = fs.existsSync(absoluteReportPath) ? sha256(absoluteReportPath) : "";
  const manifest = readJson(absoluteManifestPath, errors, "coverage manifest");
  if (manifest) validateManifest(
    manifest,
    absoluteManifestPath,
    absoluteReportPath,
    expectedCommit,
    reportDigest,
    entries.length,
    errors,
  );
  if (baselinePath !== undefined) {
    const absoluteBaselinePath = path.resolve(repositoryRoot, baselinePath);
    const baseline = readJson(absoluteBaselinePath, errors, "coverage baseline");
    if (baseline) validateBaseline(baseline, path.relative(repositoryRoot, absoluteBaselinePath), entries, errors);
  }

  return {
    ok: errors.length === 0,
    reportPath: absoluteReportPath,
    manifestPath: absoluteManifestPath,
    baselinePath: baselinePath === undefined ? undefined : path.resolve(repositoryRoot, baselinePath),
    expectedCommit,
    sourceFileCount: entries.length,
    totalCounters,
    errors,
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--report" || argument === "--manifest" || argument === "--commit") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2) === "report" ? "reportPath" : argument.slice(2) === "manifest" ? "manifestPath" : "expectedCommit"] = value;
      index += 1;
    } else if (argument === "--baseline") {
      const value = argv[index + 1];
      if (!value) throw new Error("--baseline requires a value");
      options.baselinePath = value;
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/verify-code-coverage.mjs [--report path] [--manifest path] [--baseline path] [--commit sha]");
    } else {
      const result = verifyCodeCoverage(options);
      console.log(JSON.stringify(result));
      if (!result.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
