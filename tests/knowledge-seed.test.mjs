import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildSeedManifest,
  validateSeed,
  deploymentDecision,
  deploySeed,
} = require("../electron/knowledge-seed.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "seed-test-"));
}

function copyIndex(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const full = path.join(source, name);
    if (fs.statSync(full).isFile()) fs.copyFileSync(full, path.join(target, name));
  }
}

test("seed manifest：包含 schema、版本、来源摘要与逐文件哈希", () => {
  const manifest = buildSeedManifest(path.join("private", "rag", "index"));
  assert.equal(manifest.format, "mist-chronicle-seed");
  assert.equal(manifest.indexSchemaVersion, 2);
  assert.ok(manifest.corpusVersion);
  assert.ok(manifest.buildId);
  assert.ok(manifest.sourceManifestDigest);
  for (const name of ["index.meta.json", "chunks.json", "documents.json", "inverted.json", "alias-map.json"]) {
    assert.ok(manifest.files[name], `manifest 缺少 ${name}`);
    assert.ok(manifest.files[name].sha256);
  }
});

test("validateSeed：有效 seed 通过，损坏 seed 拒绝且不执行", () => {
  const seedDir = tempDir();
  copyIndex(path.join("private", "rag", "index"), seedDir);
  assert.equal(validateSeed(seedDir).ok, true);

  const bad = tempDir();
  copyIndex(path.join("private", "rag", "index"), bad);
  fs.writeFileSync(path.join(bad, "evil.exe"), "MZ");
  const result = validateSeed(bad);
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown-file/);
  fs.rmSync(seedDir, { recursive: true, force: true });
  fs.rmSync(bad, { recursive: true, force: true });
});

test("deploySeed：版本优先级（用户更新 > seed > 旧索引）与原子替换", () => {
  const seedDir = tempDir();
  copyIndex(path.join("private", "rag", "index"), seedDir);
  const target = path.join(tempDir(), "index");

  // 首次部署
  const first = deploySeed(seedDir, target);
  assert.equal(first.deployed, true);

  // 相同版本：跳过
  assert.equal(deploymentDecision(seedDir, target).action, "skip");
  assert.equal(deploySeed(seedDir, target).deployed, false);

  // 用户知识包更新：保留
  fs.writeFileSync(
    path.join(target, "pack-manifest.json"),
    JSON.stringify({ corpusVersion: "2099-01-01T00:00:00.000Z", buildId: "2099|new" })
  );
  assert.equal(deploymentDecision(seedDir, target).action, "keep");
  assert.equal(deploySeed(seedDir, target).deployed, false);

  // 旧索引 + 新 seed：升级
  const oldTarget = path.join(tempDir(), "old");
  fs.mkdirSync(oldTarget, { recursive: true });
  fs.writeFileSync(path.join(oldTarget, "index.meta.json"), JSON.stringify({ version: 2, chunks: 1, builtAt: "2000-01-01T00:00:00.000Z" }));
  fs.writeFileSync(path.join(oldTarget, "chunks.json"), "[]");
  const upgrade = deploySeed(seedDir, oldTarget);
  assert.equal(upgrade.deployed, true);
  assert.ok(fs.existsSync(path.join(oldTarget, "inverted.json")));
  fs.rmSync(seedDir, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(oldTarget, { recursive: true, force: true });
});
