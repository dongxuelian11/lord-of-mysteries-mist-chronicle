import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { validateEvidenceManifest } from "../scripts/release/verify-evidence.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

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
