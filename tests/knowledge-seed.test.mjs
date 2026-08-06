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

// 自包含小型夹具：不依赖本机 private/rag/index（CI 公开空壳环境可用）
function makeFixture() {
  const parent = tempDir();
  const dir = path.join(parent, "index");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.meta.json"),
    JSON.stringify({ version: 2, chunks: 2, builtAt: "2026-01-01T00:00:00.000Z" })
  );
  fs.writeFileSync(path.join(dir, "chunks.json"), JSON.stringify([{ id: "c1", title: "fixture" }]));
  fs.writeFileSync(path.join(dir, "documents.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(dir, "inverted.json"), JSON.stringify({}));
  fs.writeFileSync(path.join(dir, "alias-map.json"), JSON.stringify({}));
  fs.writeFileSync(
    path.join(parent, "sources.manifest.json"),
    JSON.stringify({ sources: [{ id: "fixture" }] })
  );
  fs.writeFileSync(path.join(dir, "seed-manifest.json"), JSON.stringify(buildSeedManifest(dir)));
  return { dir, parent };
}

function copyFixture(fixture, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(fixture)) {
    const full = path.join(fixture, name);
    if (fs.statSync(full).isFile()) fs.copyFileSync(full, path.join(target, name));
  }
}

test("seed manifest：包含 schema、版本、来源摘要与逐文件哈希", () => {
  const fixture = makeFixture();
  const manifest = buildSeedManifest(fixture.dir);
  assert.equal(manifest.format, "mist-chronicle-seed");
  assert.equal(manifest.indexSchemaVersion, 2);
  assert.ok(manifest.corpusVersion);
  assert.ok(manifest.buildId);
  assert.ok(manifest.sourceManifestDigest);
  for (const name of ["index.meta.json", "chunks.json", "documents.json", "inverted.json", "alias-map.json"]) {
    assert.ok(manifest.files[name], `manifest 缺少 ${name}`);
    assert.ok(manifest.files[name].sha256);
  }
  fs.rmSync(fixture.parent, { recursive: true, force: true });
});

test("validateSeed：有效 seed 通过，损坏 seed 拒绝且不执行", () => {
  const fixture = makeFixture();
  assert.equal(validateSeed(fixture.dir).ok, true);

  const bad = tempDir();
  copyFixture(fixture.dir, bad);
  fs.writeFileSync(path.join(bad, "evil.exe"), "MZ");
  const result = validateSeed(bad);
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown-file/);
  fs.rmSync(fixture.parent, { recursive: true, force: true });
  fs.rmSync(bad, { recursive: true, force: true });
});

test("deploySeed：版本优先级（用户更新 > seed > 旧索引）与原子替换", () => {
  const fixture = makeFixture();
  const target = path.join(tempDir(), "index");

  // 首次部署
  const first = deploySeed(fixture.dir, target);
  assert.equal(first.deployed, true);

  // 相同版本：跳过
  assert.equal(deploymentDecision(fixture.dir, target).action, "skip");
  assert.equal(deploySeed(fixture.dir, target).deployed, false);

  // 用户知识包更新：保留
  fs.writeFileSync(
    path.join(target, "pack-manifest.json"),
    JSON.stringify({ corpusVersion: "2099-01-01T00:00:00.000Z", buildId: "2099|new" })
  );
  assert.equal(deploymentDecision(fixture.dir, target).action, "keep");
  assert.equal(deploySeed(fixture.dir, target).deployed, false);

  // 旧索引 + 新 seed：升级
  const oldTarget = path.join(tempDir(), "old");
  fs.mkdirSync(oldTarget, { recursive: true });
  fs.writeFileSync(path.join(oldTarget, "index.meta.json"), JSON.stringify({ version: 2, chunks: 1, builtAt: "2000-01-01T00:00:00.000Z" }));
  fs.writeFileSync(path.join(oldTarget, "chunks.json"), "[]");
  const upgrade = deploySeed(fixture.dir, oldTarget);
  assert.equal(upgrade.deployed, true);
  assert.ok(fs.existsSync(path.join(oldTarget, "inverted.json")));
  fs.rmSync(fixture.parent, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(oldTarget, { recursive: true, force: true });
});
