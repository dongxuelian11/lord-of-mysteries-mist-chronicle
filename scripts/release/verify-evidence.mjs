import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));

export const EVIDENCE_STATUSES = new Set([
  "PASS",
  "NOT_RUN",
  "NOT_AVAILABLE",
  "PENDING",
  "BLOCKED",
  "DEFERRED",
]);

export const EVIDENCE_LEVELS = new Set([
  "local",
  "local-electron",
  "packaged",
  "clean-machine",
  "production",
  "human",
]);

const EVIDENCE_TYPES = new Set(["command", "artifact", "provenance", "observation"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !path.isAbsolute(value)
    && value !== "."
    && value !== ".."
    && !value.split(/[\\/]/).includes("..")
    && !value.includes("\0");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function error(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function validateEvidenceItem(item, location, root, errors) {
  if (!isRecord(item)) {
    error(errors, location, "must be an object");
    return;
  }
  if (!EVIDENCE_TYPES.has(item.type)) error(errors, `${location}.type`, "unsupported evidence type");
  if (item.type === "artifact") {
    if (!safeRelativePath(item.path)) {
      error(errors, `${location}.path`, "must be a safe repository-relative path");
      return;
    }
    if (!SHA256_PATTERN.test(String(item.sha256 ?? ""))) {
      error(errors, `${location}.sha256`, "must be a 64-character SHA-256 digest");
      return;
    }
    const absolute = path.resolve(root, item.path);
    const relative = path.relative(root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      error(errors, `${location}.path`, "resolves outside the evidence root");
      return;
    }
    if (!fs.existsSync(absolute)) {
      error(errors, `${location}.path`, "artifact file is missing");
      return;
    }
    const artifactStat = fs.lstatSync(absolute);
    if (artifactStat.isSymbolicLink()) {
      error(errors, `${location}.path`, "symbolic-link artifacts are not accepted");
      return;
    }
    if (!artifactStat.isFile()) {
      error(errors, `${location}.path`, "artifact path is not a regular file");
      return;
    }
    const actual = sha256(absolute);
    if (actual.toLowerCase() !== String(item.sha256).toLowerCase()) {
      error(errors, `${location}.sha256`, `digest mismatch (actual ${actual})`);
    }
    if (item.bytes !== undefined && (!Number.isInteger(item.bytes) || item.bytes !== artifactStat.size)) {
      error(errors, `${location}.bytes`, "does not match artifact size");
    }
    return;
  }
  if (typeof item.value !== "string" || !item.value.trim()) {
    error(errors, `${location}.value`, "must be a non-empty string");
  }
  if (item.type === "provenance") {
    if (!SHA256_PATTERN.test(String(item.artifactSha256 ?? ""))) error(errors, `${location}.artifactSha256`, "must bind a 64-character artifact SHA-256");
    if (!/^[0-9a-f]{40,64}$/i.test(String(item.sourceCommit ?? ""))) error(errors, `${location}.sourceCommit`, "must bind a full source commit");
  }
}

function validatePassEvidenceLevel(claim, location, source, errors) {
  if (claim.status !== "PASS") return;
  const items = Array.isArray(claim.evidence) ? claim.evidence.filter(isRecord) : [];
  const types = new Set(items.map((item) => item.type));
  const artifacts = new Set(items.filter((item) => item.type === "artifact").map((item) => String(item.sha256).toLowerCase()));
  const provenancedArtifacts = new Set(items.filter((item) => item.type === "provenance").map((item) => String(item.artifactSha256).toLowerCase()));
  if (["packaged", "clean-machine", "production", "human"].includes(claim.evidenceLevel)) {
    if (!types.has("artifact") || !types.has("provenance")) error(errors, `${location}.evidence`, `${claim.evidenceLevel} PASS requires artifact and provenance evidence`);
    if (source?.worktreeStatus !== "clean") error(errors, "source.worktreeStatus", `${claim.evidenceLevel} PASS requires a clean source tree`);
    if (!/^[0-9a-f]{40,64}$/i.test(String(source?.commit ?? ""))) error(errors, "source.commit", `${claim.evidenceLevel} PASS requires a full source commit`);
    for (const provenance of items.filter((item) => item.type === "provenance")) {
      if (String(provenance.sourceCommit ?? "").toLowerCase() !== String(source?.commit ?? "").toLowerCase()) error(errors, `${location}.evidence`, "provenance sourceCommit must equal manifest source.commit");
      if (!artifacts.has(String(provenance.artifactSha256 ?? "").toLowerCase())) error(errors, `${location}.evidence`, "provenance artifactSha256 must match a verified artifact");
    }
  }
  if (["clean-machine", "production", "human"].includes(claim.evidenceLevel)) {
    const environment = claim.environment;
    if (!isRecord(environment)) error(errors, `${location}.environment`, `${claim.evidenceLevel} PASS requires an environment record`);
    else {
      if (typeof source?.machineId !== "string" || !source.machineId.trim()) error(errors, "source.machineId", `${claim.evidenceLevel} PASS requires the source machine identity`);
      if (typeof environment.machineId !== "string" || !environment.machineId.trim() || environment.machineId === source?.machineId) error(errors, `${location}.environment.machineId`, "must identify a distinct execution machine");
      if (environment.sourceCheckout !== "ABSENT") error(errors, `${location}.environment.sourceCheckout`, "must be ABSENT");
      if (environment.dependencyInstall !== "NOT_RUN") error(errors, `${location}.environment.dependencyInstall`, "must be NOT_RUN");
      if (environment.artifactTransferVerified !== true) error(errors, `${location}.environment.artifactTransferVerified`, "must be true");
    }
  }
  if (claim.evidenceLevel === "production") {
    if (!isRecord(claim.deployment) || typeof claim.deployment.url !== "string" || !claim.deployment.url.startsWith("https://") || !SHA256_PATTERN.test(String(claim.deployment.artifactSha256 ?? ""))) {
      error(errors, `${location}.deployment`, "production PASS requires an HTTPS deployment bound to an artifact SHA-256");
    } else {
      const deployedArtifact = String(claim.deployment.artifactSha256).toLowerCase();
      if (!artifacts.has(deployedArtifact) || !provenancedArtifacts.has(deployedArtifact)) {
        error(errors, `${location}.deployment`, "deployment artifactSha256 must match a verified artifact and its provenance");
      }
    }
  }
  if (claim.evidenceLevel === "human") {
    if (!types.has("observation") || !Number.isFinite(claim.sessionDurationMinutes) || claim.sessionDurationMinutes <= 0) error(errors, location, "human PASS requires an observation and positive sessionDurationMinutes");
  }
}

export function validateEvidenceManifest(manifest, options = {}) {
  const root = path.resolve(options.root ?? repositoryRoot);
  const errors = [];
  if (!isRecord(manifest)) {
    return { ok: false, errors: ["manifest: must be an object"] };
  }
  if (manifest.schemaVersion !== 1) error(errors, "schemaVersion", "must equal 1");
  if (manifest.application !== packageJson.name) error(errors, "application", `must equal ${packageJson.name}`);
  if (!isIsoDate(manifest.generatedAt)) error(errors, "generatedAt", "must be an ISO timestamp");

  const source = manifest.source;
  if (!isRecord(source)) {
    error(errors, "source", "must be an object");
  } else {
    if (!COMMIT_PATTERN.test(String(source.commit ?? ""))) error(errors, "source.commit", "must be a Git commit SHA");
    if (typeof source.branch !== "string" || !source.branch.trim()) error(errors, "source.branch", "must be a non-empty string");
    if (!["clean", "dirty", "unknown"].includes(source.worktreeStatus)) error(errors, "source.worktreeStatus", "must be clean, dirty, or unknown");
    if (options.matchHead) {
      try {
        const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
        if (head.toLowerCase() !== String(source.commit).toLowerCase()) error(errors, "source.commit", `does not match current HEAD ${head}`);
      } catch (cause) {
        error(errors, "source.commit", `cannot resolve current HEAD: ${cause?.message ?? cause}`);
      }
    }
  }

  if (!Array.isArray(manifest.claims) || manifest.claims.length === 0) {
    error(errors, "claims", "must be a non-empty array");
  } else {
    const ids = new Set();
    manifest.claims.forEach((claim, index) => {
      const location = `claims[${index}]`;
      if (!isRecord(claim)) {
        error(errors, location, "must be an object");
        return;
      }
      if (typeof claim.id !== "string" || !/^[a-z0-9][a-z0-9._-]+$/.test(claim.id)) error(errors, `${location}.id`, "must be a stable lowercase identifier");
      else if (ids.has(claim.id)) error(errors, `${location}.id`, "must be unique");
      else ids.add(claim.id);
      if (!EVIDENCE_STATUSES.has(claim.status)) error(errors, `${location}.status`, "unsupported evidence status");
      if (!EVIDENCE_LEVELS.has(claim.evidenceLevel)) error(errors, `${location}.evidenceLevel`, "unsupported evidence level");
      if (typeof claim.summary !== "string" || !claim.summary.trim()) error(errors, `${location}.summary`, "must be non-empty");
      if (!isIsoDate(claim.observedAt)) error(errors, `${location}.observedAt`, "must be an ISO timestamp");
      if (claim.status === "PASS") {
        if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) error(errors, `${location}.evidence`, "PASS requires at least one evidence item");
      } else if (typeof claim.reason !== "string" || !claim.reason.trim()) {
        error(errors, `${location}.reason`, `${claim.status} requires a non-empty reason`);
      }
      if (claim.evidence !== undefined) {
        if (!Array.isArray(claim.evidence)) error(errors, `${location}.evidence`, "must be an array");
        else claim.evidence.forEach((item, itemIndex) => validateEvidenceItem(item, `${location}.evidence[${itemIndex}]`, root, errors));
      }
      validatePassEvidenceLevel(claim, location, source, errors);
    });
  }

  const statuses = {};
  for (const claim of Array.isArray(manifest.claims) ? manifest.claims : []) {
    if (isRecord(claim) && typeof claim.status === "string") statuses[claim.status] = (statuses[claim.status] ?? 0) + 1;
  }
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      application: manifest.application,
      schemaVersion: manifest.schemaVersion,
      sourceCommit: manifest.source?.commit ?? null,
      claimCount: Array.isArray(manifest.claims) ? manifest.claims.length : 0,
      statuses,
    },
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || manifestPath.startsWith("--")) throw new Error("usage: node scripts/release/verify-evidence.mjs <manifest.json> [--root <repo>] [--match-head]");
  const root = path.resolve(option("--root") ?? repositoryRoot);
  const absolute = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const result = validateEvidenceManifest(manifest, { root, matchHead: process.argv.includes("--match-head") });
  if (!result.ok) {
    for (const item of result.errors) console.error(`[release:evidence] ${item}`);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ ok: true, manifest: absolute, checkedAt: new Date().toISOString(), ...result.summary }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((cause) => {
    console.error(`[release:evidence] ${cause?.message ?? cause}`);
    process.exitCode = 1;
  });
}
