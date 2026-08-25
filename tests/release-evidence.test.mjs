import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

import { validateEvidenceManifest } from "../scripts/release/verify-evidence.mjs";
import { createRequire } from "node:module";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { buildSeedManifest } = require("../electron/knowledge-seed.cjs");

function baseManifest(claims) {
  return {
    schemaVersion: 1,
    application: "lord-of-mysteries-mist-chronicle",
    generatedAt: new Date().toISOString(),
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
      branch: "codex/gate0-pr1-turn-guard",
      worktreeStatus: "dirty",
    },
    claims,
  };
}

test("PR5 evidence contract accepts a hashed local artifact and command receipt", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmzz-pr5-evidence-"));
  const artifact = path.join(directory, "artifact.txt");
  fs.writeFileSync(artifact, "evidence\n", "utf8");
  const digest = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  try {
    const manifest = baseManifest([{
      id: "pr5.evidence-contract",
      status: "PASS",
      evidenceLevel: "local",
      summary: "Evidence contract validator passed.",
      observedAt: new Date().toISOString(),
      evidence: [
        { type: "command", value: "node scripts/release/verify-evidence.mjs" },
        { type: "artifact", path: "artifact.txt", sha256: digest, bytes: 9 },
      ],
    }]);
    const result = validateEvidenceManifest(manifest, { root: directory });
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.summary.statuses, { PASS: 1 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PR5 evidence contract fails closed for unsupported status, missing reason, and absent PASS evidence", () => {
  const manifest = baseManifest([
    {
      id: "pr5.blocked-claim",
      status: "BLOCKED",
      evidenceLevel: "packaged",
      summary: "Installer evidence is blocked.",
      observedAt: new Date().toISOString(),
    },
    {
      id: "pr5.missing-pass-proof",
      status: "PASS",
      evidenceLevel: "local",
      summary: "No receipt supplied.",
      observedAt: new Date().toISOString(),
      evidence: [],
    },
    {
      id: "pr5.unknown",
      status: "MAYBE",
      evidenceLevel: "local",
      summary: "Invalid state.",
      observedAt: new Date().toISOString(),
      evidence: [{ type: "command", value: "never" }],
    },
  ]);
  const result = validateEvidenceManifest(manifest, { root: repositoryRoot });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /claims\[0\]\.reason/);
  assert.match(result.errors.join("\n"), /claims\[1\]\.evidence/);
  assert.match(result.errors.join("\n"), /claims\[2\]\.status/);
});

test("PR5 evidence contract rejects path traversal and a mismatched artifact digest", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmzz-pr5-evidence-path-"));
  fs.writeFileSync(path.join(directory, "artifact.txt"), "actual\n", "utf8");
  try {
    const manifest = baseManifest([{
      id: "pr5.bad-artifact",
      status: "PASS",
      evidenceLevel: "local",
      summary: "Invalid artifact evidence.",
      observedAt: new Date().toISOString(),
      evidence: [
        { type: "artifact", path: "artifact.txt", sha256: "0".repeat(64) },
        { type: "artifact", path: "../outside.txt", sha256: "1".repeat(64) },
      ],
    }]);
    const result = validateEvidenceManifest(manifest, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /digest mismatch/);
    assert.match(result.errors.join("\n"), /safe repository-relative path/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PR5 optional head matching rejects stale source commit", () => {
  const manifest = baseManifest([{
    id: "pr5.head-match",
    status: "NOT_RUN",
    evidenceLevel: "local",
    summary: "Head matching negative case.",
    reason: "fixture only",
    observedAt: new Date().toISOString(),
  }]);
  manifest.source.commit = "0".repeat(40);
  const result = validateEvidenceManifest(manifest, { root: repositoryRoot, matchHead: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /does not match current HEAD/);
});

test("head matching can use a Git checkout separate from the transferred evidence root", () => {
  const manifest = baseManifest([{
    id: "pr5.separate-git-root",
    status: "NOT_RUN",
    evidenceLevel: "local",
    summary: "Evidence and source checkout are intentionally stored in separate roots.",
    reason: "fixture only",
    observedAt: new Date().toISOString(),
  }]);
  const result = validateEvidenceManifest(manifest, {
    root: path.parse(repositoryRoot).root,
    gitRoot: repositoryRoot,
    matchHead: true,
  });
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("release workflow qualifies the transferred installer on a checkout-free clean machine", () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", "release.yml"), "utf8");
  const cleanMachineStart = workflow.indexOf("\n  clean-machine:");
  const evidenceVerifyStart = workflow.indexOf("\n  evidence-verify:");
  assert.notEqual(cleanMachineStart, -1, "release workflow must define a clean-machine job");
  assert.notEqual(evidenceVerifyStart, -1, "release workflow must independently verify the clean-machine manifest");
  const cleanMachineJob = workflow.slice(cleanMachineStart, evidenceVerifyStart);
  const dDrivePreflights = workflow.match(/name: Enforce D-drive runner roots/g) ?? [];
  assert.equal(dDrivePreflights.length, 4, "every Windows release job must preflight its write roots");
  assert.match(cleanMachineJob, /needs:\s*installer/);
  assert.match(cleanMachineJob, /actions\/download-artifact@v4/);
  assert.match(cleanMachineJob, /artifact-ids:\s*\$\{\{ needs\.installer\.outputs\.artifact-id \}\}/);
  assert.match(cleanMachineJob, /CLEAN_MACHINE_SOURCE_CHECKOUT:\s*ABSENT/);
  assert.match(cleanMachineJob, /CLEAN_MACHINE_DEPENDENCY_INSTALL:\s*NOT_RUN/);
  assert.doesNotMatch(cleanMachineJob, /actions\/checkout|actions\/setup-node|npm (?:ci|install)/);
  assert.ok(
    cleanMachineJob.indexOf("name: Enforce D-drive runner roots") < cleanMachineJob.indexOf("actions/download-artifact@v4"),
    "clean-machine must reject a non-D runner before downloading the artifact"
  );
  assert.doesNotMatch(workflow, /materialize-lore-from-seed/);
});

test("installer smoke binds the packaged app to its isolated D-drive storage root", () => {
  const smoke = fs.readFileSync(path.join(repositoryRoot, "scripts", "release", "smoke-installer.ps1"), "utf8");
  assert.match(smoke, /\$env:GMZZ_STORAGE_ROOT\s*=\s*\$smokeRoot/);
  assert.match(smoke, /\$env:GMZZ_REQUIRE_D_DRIVE\s*=\s*"1"/);
  assert.match(smoke, /smoke storage root must be on D:/i);
});

test("clean-machine identity cannot become distinct merely because the job name changed", () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", "release.yml"), "utf8");
  const qualification = fs.readFileSync(
    path.join(repositoryRoot, "scripts", "release", "clean-machine-qualification.ps1"),
    "utf8"
  );
  assert.doesNotMatch(workflow, /build-machine-id=.*GITHUB_JOB/);
  assert.doesNotMatch(qualification, /executionMachineId\s*=.*GITHUB_JOB/);
});

test("high evidence levels cannot be upgraded from a local command or same-machine run", () => {
  const manifest = baseManifest([{
    id: "release.false-clean-machine",
    status: "PASS",
    evidenceLevel: "clean-machine",
    summary: "This must not pass.",
    observedAt: new Date().toISOString(),
    evidence: [{ type: "command", value: "npm test" }],
    environment: { machineId: "same-machine", sourceCheckout: "PRESENT", dependencyInstall: "RUN", artifactTransferVerified: false },
  }]);
  manifest.source.machineId = "same-machine";
  const result = validateEvidenceManifest(manifest, { root: repositoryRoot });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /requires artifact and provenance|distinct execution machine|sourceCheckout|dependencyInstall/);
});

test("production deployment must use a verified artifact with matching provenance", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmzz-production-evidence-"));
  const artifact = path.join(directory, "installer.exe");
  fs.writeFileSync(artifact, "packaged-candidate\n", "utf8");
  const verifiedDigest = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  const unrelatedDigest = crypto.createHash("sha256").update("different-production-binary").digest("hex");
  try {
    const manifest = baseManifest([{
      id: "release.production-artifact-binding",
      status: "PASS",
      evidenceLevel: "production",
      summary: "Production must run the verified candidate.",
      observedAt: new Date().toISOString(),
      evidence: [
        { type: "artifact", path: "installer.exe", sha256: verifiedDigest },
        { type: "provenance", value: "build provenance", artifactSha256: verifiedDigest, sourceCommit: "a".repeat(40) },
      ],
      environment: { machineId: "production-host", sourceCheckout: "ABSENT", dependencyInstall: "NOT_RUN", artifactTransferVerified: true },
      deployment: { url: "https://game.example.invalid", artifactSha256: unrelatedDigest },
    }]);
    manifest.source = { ...manifest.source, commit: "a".repeat(40), worktreeStatus: "clean", machineId: "build-host" };

    const result = validateEvidenceManifest(manifest, { root: directory });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /deployment artifactSha256 must match a verified artifact and its provenance/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact provenance command fails closed with a diagnosable seed gate when release inputs are absent", () => {
  const missingSeed = path.join("D:\\gmzz\\.runtime", `release-seed-missing-${crypto.randomUUID()}`);
  assert.equal(fs.existsSync(missingSeed), false);
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/release/verify-release.mjs"), "artifact"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
      KNOWLEDGE_SEED_DIR: missingSeed,
      TEMP: "D:\\gmzz\\.runtime\\tmp",
      TMP: "D:\\gmzz\\.runtime\\tmp",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /seed-source-path-missing/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ENOENT.*scandir/);
});

test("release seed verifier accepts an explicit D-drive seed directory and stages manifest-listed files", () => {
  const runtimeRoot = path.join(repositoryRoot, ".runtime");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const fixtureParent = fs.mkdtempSync(path.join(runtimeRoot, "release-seed-input-"));
  const fixtureDir = path.join(fixtureParent, "index");
  const stagedDir = path.join(runtimeRoot, "release-seed");
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, "index.meta.json"),
    JSON.stringify({ version: 2, chunks: 1, builtAt: "2026-01-01T00:00:00.000Z" }),
    "utf8"
  );
  fs.writeFileSync(path.join(fixtureDir, "chunks.json"), JSON.stringify([{ id: "fixture" }]), "utf8");
  fs.writeFileSync(path.join(fixtureDir, "documents.json"), "[]", "utf8");
  fs.writeFileSync(path.join(fixtureDir, "inverted.json"), "{}", "utf8");
  fs.writeFileSync(path.join(fixtureDir, "alias-map.json"), "{}", "utf8");
  fs.writeFileSync(path.join(fixtureDir, "vectors.json"), JSON.stringify({ vectors: [] }), "utf8");
  fs.writeFileSync(
    path.join(fixtureParent, "sources.manifest.json"),
    JSON.stringify({ sources: [{ id: "authorized-fixture" }] }),
    "utf8"
  );
  const manifest = buildSeedManifest(fixtureDir);
  const vectors = fs.readFileSync(path.join(fixtureDir, "vectors.json"));
  manifest.files["vectors.json"] = {
    bytes: vectors.length,
    sha256: crypto.createHash("sha256").update(vectors).digest("hex"),
  };
  fs.writeFileSync(path.join(fixtureDir, "seed-manifest.json"), JSON.stringify(manifest), "utf8");

  try {
    const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/release/verify-release.mjs"), "seed"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GMZZ_STORAGE_ROOT: runtimeRoot,
        GMZZ_REQUIRE_D_DRIVE: "1",
        KNOWLEDGE_SEED_DIR: fixtureDir,
        TEMP: path.join(runtimeRoot, "tmp"),
        TMP: path.join(runtimeRoot, "tmp"),
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /\[release:seed\].*buildId=/);
    assert.equal(fs.existsSync(path.join(stagedDir, "vectors.json")), true);
  } finally {
    fs.rmSync(fixtureParent, { recursive: true, force: true });
    fs.rmSync(stagedDir, { recursive: true, force: true });
  }
});

test("release seed verifier rejects an explicit non-D seed path before reading repository fallback", () => {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/release/verify-release.mjs"), "seed"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
      GMZZ_REQUIRE_D_DRIVE: "1",
      KNOWLEDGE_SEED_DIR: "C:\\authorized-seed",
      TEMP: "D:\\gmzz\\.runtime\\tmp",
      TMP: "D:\\gmzz\\.runtime\\tmp",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /seed-source-path-invalid/);
});
