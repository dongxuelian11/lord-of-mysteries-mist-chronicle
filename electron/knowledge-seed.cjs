// 内置知识库 seed 部署：manifest 校验、版本优先级、原子替换与回滚。
// 纯 Node 模块（不依赖 Electron），供主进程与测试共同使用。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SEED_FILES = [
  "index.meta.json",
  "chunks.json",
  "documents.json",
  "inverted.json",
  "alias-map.json",
  "seed-manifest.json",
];

const SEED_MANIFEST_FORMAT = "mist-chronicle-seed";
const SEED_MANIFEST_VERSION = 1;
const INDEX_SCHEMA_VERSION = 2;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function buildSeedManifest(indexDir, extra = {}) {
  const meta = readJson(path.join(indexDir, "index.meta.json"));
  if (!meta || !meta.chunks) throw new Error("索引 meta 缺失，无法生成 seed manifest");
  const files = {};
  for (const name of SEED_FILES) {
    const file = path.join(indexDir, name);
    if (!fs.existsSync(file)) continue;
    const buffer = fs.readFileSync(file);
    files[name] = { bytes: buffer.length, sha256: sha256(buffer) };
  }
  const createdAt = new Date().toISOString();
  const corpusVersion = meta.builtAt ?? createdAt;
  const buildId = `${corpusVersion}|${(files["chunks.json"]?.sha256 ?? "").slice(0, 12)}`;
  const sourceManifestPath = path.join(path.dirname(indexDir), "sources.manifest.json");
  return {
    format: SEED_MANIFEST_FORMAT,
    seedManifestVersion: SEED_MANIFEST_VERSION,
    indexSchemaVersion: meta.version ?? INDEX_SCHEMA_VERSION,
    corpusVersion,
    buildId,
    createdAt,
    sourceManifestDigest: fs.existsSync(sourceManifestPath)
      ? sha256(fs.readFileSync(sourceManifestPath))
      : "missing",
    seedVersion: corpusVersion,
    minAppVersion: "0.1.0",
    files,
    ...extra,
  };
}

function validateSeed(seedDir) {
  const manifest = readJson(path.join(seedDir, "seed-manifest.json"));
  if (!manifest) return { ok: false, error: "seed-manifest-missing" };
  if (
    manifest.format !== SEED_MANIFEST_FORMAT ||
    manifest.seedManifestVersion !== SEED_MANIFEST_VERSION
  ) {
    return { ok: false, error: "seed-manifest-format-version-mismatch" };
  }
  if ((manifest.indexSchemaVersion ?? 0) !== INDEX_SCHEMA_VERSION) {
    return { ok: false, error: "seed-schema-incompatible" };
  }
  if (!manifest.corpusVersion || !manifest.buildId) {
    return { ok: false, error: "seed-manifest-incomplete" };
  }
  for (const name of ["index.meta.json", "chunks.json", "inverted.json"]) {
    if (!manifest.files?.[name]) return { ok: false, error: `seed-missing-file:${name}` };
  }
  for (const [name, entry] of Object.entries(manifest.files ?? {})) {
    if (name === "seed-manifest.json") continue;
    if (path.isAbsolute(name) || name.includes("..")) {
      return { ok: false, error: `seed-illegal-path:${name}` };
    }
    const file = path.join(seedDir, name);
    if (!fs.existsSync(file)) return { ok: false, error: `seed-file-not-found:${name}` };
    const buffer = fs.readFileSync(file);
    if (buffer.length !== entry.bytes || sha256(buffer) !== entry.sha256) {
      return { ok: false, error: `seed-hash-mismatch:${name}` };
    }
  }
  // 额外文件校验：只允许运行所需文件，未知可执行/额外文件直接拒绝
  const allowed = new Set([
    ...SEED_FILES,
    "vectors.json",
    "embedding-meta.json",
    "entities.json",
    "relations.json",
    "chapter-alignments.json",
    "aliases.json",
  ]);
  const extraFiles = [];
  for (const entry of fs.readdirSync(seedDir, { withFileTypes: true })) {
    if (entry.isDirectory()) return { ok: false, error: `seed-unknown-directory:${entry.name}` };
    if (!allowed.has(entry.name)) extraFiles.push(entry.name);
  }
  if (extraFiles.length) {
    return { ok: false, error: `seed-unknown-file:${extraFiles.join(",")}` };
  }
  return { ok: true, manifest };
}

function versionOf(targetDir) {
  // 优先级：用户 .mcrag 安装清单 > 用户索引 meta > 无
  const packManifest = readJson(path.join(targetDir, "pack-manifest.json"));
  if (packManifest?.corpusVersion || packManifest?.buildId) {
    return {
      kind: "pack",
      corpusVersion: packManifest.corpusVersion ?? "",
      buildId: packManifest.buildId ?? "",
      valid: true,
    };
  }
  const meta = readJson(path.join(targetDir, "index.meta.json"));
  if (meta?.chunks && fs.existsSync(path.join(targetDir, "chunks.json"))) {
    return {
      kind: "index",
      corpusVersion: meta.builtAt ?? "",
      buildId: meta.builtAt ?? "",
      valid: true,
    };
  }
  return { kind: "none", corpusVersion: "", buildId: "", valid: false };
}

// 显式版本比较：buildId（含 corpus 时间与内容指纹）字典序；相等视为同一版本。
function compareVersions(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function deploymentDecision(seedDir, targetDir) {
  const seedValidation = validateSeed(seedDir);
  if (!seedValidation.ok) return { action: "skip", reason: seedValidation.error };
  const seed = seedValidation.manifest;
  const current = versionOf(targetDir);
  if (!current.valid) {
    return { action: "deploy", reason: "no-existing-index", seedVersion: seed.seedVersion ?? seed.corpusVersion };
  }
  const currentVersion = current.corpusVersion || current.buildId;
  const seedVersion = seed.corpusVersion || seed.buildId;
  const order = compareVersions(currentVersion, seedVersion);
  if (order > 0) {
    return { action: "keep", reason: "user-index-newer", currentVersion, seedVersion };
  }
  if (order === 0) {
    return { action: "skip", reason: "same-version", currentVersion, seedVersion };
  }
  return { action: "upgrade", reason: "seed-newer", currentVersion, seedVersion };
}

function deploySeed(seedDir, targetDir) {
  const decision = deploymentDecision(seedDir, targetDir);
  if (decision.action === "skip" || decision.action === "keep") {
    return { deployed: false, decision };
  }
  const validation = validateSeed(seedDir);
  if (!validation.ok) {
    return { deployed: false, decision: { action: "skip", reason: validation.error } };
  }
  const staging = `${targetDir}.seed-staging`;
  const backup = `${targetDir}.seed-backup`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(backup, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    for (const name of SEED_FILES) {
      const source = path.join(seedDir, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(staging, name));
    }
    // 复制后完整验证
    const stagedValidation = validateSeed(staging);
    if (!stagedValidation.ok) {
      throw new Error(stagedValidation.error);
    }
    let movedOld = false;
    if (fs.existsSync(targetDir)) {
      fs.renameSync(targetDir, backup);
      movedOld = true;
    }
    try {
      fs.renameSync(staging, targetDir);
    } catch (error) {
      if (movedOld && fs.existsSync(backup) && !fs.existsSync(targetDir)) {
        fs.renameSync(backup, targetDir);
      }
      throw error;
    }
    if (movedOld) fs.rmSync(backup, { recursive: true, force: true });
    return {
      deployed: true,
      decision,
      seedVersion: validation.manifest.seedVersion ?? validation.manifest.corpusVersion,
    };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(backup) && !fs.existsSync(targetDir)) {
      try {
        fs.renameSync(backup, targetDir);
      } catch {
        // 回滚失败时保留 backup 目录
      }
    }
    return {
      deployed: false,
      decision: { action: "failed", reason: String(error?.message ?? error) },
    };
  }
}

module.exports = {
  SEED_FILES,
  SEED_MANIFEST_FORMAT,
  SEED_MANIFEST_VERSION,
  INDEX_SCHEMA_VERSION,
  buildSeedManifest,
  validateSeed,
  versionOf,
  deploymentDecision,
  deploySeed,
};
