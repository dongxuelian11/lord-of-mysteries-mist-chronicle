import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { REQUIRED_SOURCE_FILES } from "./verify-code-coverage.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.resolve(repositoryRoot, ".runtime/coverage/coverage-final.json");
const manifestPath = path.resolve(repositoryRoot, ".runtime/coverage/coverage-manifest.json");
const baselinePath = path.resolve(repositoryRoot, "tests/coverage-baseline.json");

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function counterValues(value) {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(counterValues);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(counterValues);
}

function metric(value, label) {
  const values = counterValues(value);
  if (!values.length) throw new Error(`${label}: no executable counters`);
  if (values.some((counter) => !Number.isFinite(counter) || !Number.isInteger(counter) || counter < 0)) {
    throw new Error(`${label}: invalid counter`);
  }
  const covered = values.filter((counter) => counter > 0).length;
  return { total: values.length, covered, pct: (covered / values.length) * 100 };
}

function relativeSourcePath(value) {
  const raw = String(value ?? "").replaceAll("\\", "/").replace(/^file:\/\//i, "");
  const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repositoryRoot, raw);
  return path.relative(repositoryRoot, absolute).replaceAll("\\", "/");
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function parseArguments(argv) {
  const options = { writeBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--report" || argument === "--manifest" || argument === "--baseline") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = path.resolve(repositoryRoot, value);
      index += 1;
    } else if (argument === "--write-baseline") {
      options.writeBaseline = true;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

export function writeCoverageArtifacts({
  report = reportPath,
  manifest = manifestPath,
  baseline = baselinePath,
  writeBaseline = false,
  commit = gitHead(),
} = {}) {
  if (!fs.existsSync(report)) throw new Error(`coverage report missing: ${report}`);
  const parsed = JSON.parse(fs.readFileSync(report, "utf8"));
  if (!isRecord(parsed)) throw new Error("coverage report root must be an object");
  const entries = Object.entries(parsed).flatMap(([key, value]) => {
    if (!isRecord(value) || (!isRecord(value.s) && !isRecord(value.f) && !isRecord(value.b))) return [];
    const sourcePath = relativeSourcePath(value.path || key);
    return [{
      path: sourcePath,
      statements: metric(value.s, `${sourcePath}.s`),
      functions: metric(value.f, `${sourcePath}.f`),
      branches: metric(value.b, `${sourcePath}.b`),
    }];
  });
  const missing = REQUIRED_SOURCE_FILES.filter((required) => !entries.some((entry) => entry.path.toLowerCase() === required.toLowerCase()));
  if (missing.length) throw new Error(`coverage report missing required sources: ${missing.join(", ")}`);
  const reportSha256 = crypto.createHash("sha256").update(fs.readFileSync(report)).digest("hex");
  const sourceFiles = Object.fromEntries(entries.map((entry) => [entry.path, {
    statements: entry.statements,
    functions: entry.functions,
    branches: entry.branches,
  }]));
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, `${JSON.stringify({
    schemaVersion: 1,
    commit,
    reportSha256,
    sourceFileCount: entries.length,
    reportPath: path.relative(repositoryRoot, report).replaceAll("\\", "/"),
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  if (writeBaseline) {
    fs.mkdirSync(path.dirname(baseline), { recursive: true });
    fs.writeFileSync(baseline, `${JSON.stringify({
      schemaVersion: 1,
      baselineCommit: commit,
      generatedAt: new Date().toISOString(),
      sourceFiles,
    }, null, 2)}\n`);
  }
  return { report, manifest, baseline: writeBaseline ? baseline : undefined, commit, sourceFileCount: entries.length, reportSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/write-code-coverage-manifest.mjs [--report path] [--manifest path] [--baseline path] [--write-baseline]");
    } else {
      console.log(JSON.stringify(writeCoverageArtifacts(options)));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
