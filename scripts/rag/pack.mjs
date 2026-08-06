// 私有知识包：把完整索引打包为 .mcrag（zip + 完整性 manifest），
// 安装时校验后原子写入用户数据目录。包不进入 Git / Renderer / 公共安装包。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import { indexDir, privateDir, ensureDirs, readJson } from "./lib/paths.mjs";
import { userDataRagDirs } from "./export-runtime.mjs";

const PACK_FORMAT = "mist-chronicle-lore-pack";
const PACK_VERSION = 1;
const INDEX_SCHEMA_VERSION = 2;
const ALLOWED_FILES = new Set([
  "index.meta.json",
  "chunks.json",
  "documents.json",
  "inverted.json",
  "alias-map.json",
  "vectors.json",
  "embedding-meta.json",
]);

export function packsDir() {
  return path.join(privateDir, "rag", "packs");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function indexFileSha256s() {
  const files = {};
  for (const name of ALLOWED_FILES) {
    const file = path.join(indexDir, name);
    if (!fs.existsSync(file)) continue;
    const buffer = fs.readFileSync(file);
    files[name] = { bytes: buffer.length, sha256: sha256(buffer) };
  }
  return files;
}

function sourceManifestDigest() {
  const manifest = path.join(privateDir, "rag", "sources.manifest.json");
  if (!fs.existsSync(manifest)) return "missing";
  return sha256(fs.readFileSync(manifest));
}

export function buildPack() {
  const meta = readJson(path.join(indexDir, "index.meta.json"));
  if (!meta || !meta.chunks) throw new Error("索引不存在或为空，无法打包");
  const files = indexFileSha256s();
  if (!files["chunks.json"] || !files["inverted.json"]) {
    throw new Error("索引缺少 chunks.json/inverted.json，无法打包");
  }
  const manifest = {
    format: PACK_FORMAT,
    packVersion: PACK_VERSION,
    indexSchemaVersion: meta.version ?? INDEX_SCHEMA_VERSION,
    corpusVersion: meta.builtAt ?? new Date().toISOString(),
    sourceManifestDigest: sourceManifestDigest(),
    builtAt: new Date().toISOString(),
    files,
  };
  const zip = new JSZip();
  for (const name of Object.keys(files)) {
    zip.file(name, fs.readFileSync(path.join(indexDir, name)));
  }
  zip.file("pack-manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }).then((buffer) => {
    const date = new Date(manifest.corpusVersion);
    const stamp = Number.isNaN(date.getTime())
      ? "unknown"
      : `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
    const packName = `mist-chronicle-lore-pack-${stamp}.mcrag`;
    ensureDirs();
    fs.mkdirSync(packsDir(), { recursive: true });
    const target = path.join(packsDir(), packName);
    fs.writeFileSync(target, buffer);
    const digest = sha256(buffer);
    fs.writeFileSync(`${target}.sha256`, digest);
    return { file: target, bytes: buffer.length, sha256: digest, manifest, files: Object.keys(files).length };
  });
}

export async function verifyPack(packPath) {
  const absolute = path.resolve(packPath);
  const buffer = fs.readFileSync(absolute);
  const digest = sha256(buffer);
  const sidecar = `${absolute}.sha256`;
  let sidecarOk = true;
  if (fs.existsSync(sidecar)) {
    sidecarOk = fs.readFileSync(sidecar, "utf8").trim() === digest;
  }
  const zip = await JSZip.loadAsync(buffer);
  const entryNames = Object.keys(zip.files);
  const traversal = entryNames.filter(
    (name) =>
      name.includes("..") ||
      path.isAbsolute(name) ||
      !ALLOWED_FILES.has(name) && name !== "pack-manifest.json"
  );
  if (traversal.length) {
    return { ok: false, error: `path-traversal-or-unknown-entry: ${traversal.join(",")}` };
  }
  const manifestRaw = await zip.file("pack-manifest.json")?.async("string");
  if (!manifestRaw) return { ok: false, error: "manifest-missing" };
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return { ok: false, error: "manifest-invalid-json" };
  }
  if (manifest.format !== PACK_FORMAT || manifest.packVersion !== PACK_VERSION) {
    return { ok: false, error: "format-version-mismatch" };
  }
  if ((manifest.indexSchemaVersion ?? 0) !== INDEX_SCHEMA_VERSION) {
    return { ok: false, error: "schema-incompatible" };
  }
  for (const [name, info] of Object.entries(manifest.files ?? {})) {
    const entry = zip.file(name);
    if (!entry) return { ok: false, error: `missing-entry:${name}` };
    const content = await entry.async("nodebuffer");
    if (sha256(content) !== info.sha256) return { ok: false, error: `hash-mismatch:${name}` };
  }
  return {
    ok: true,
    digest,
    sidecarOk,
    manifest: {
      indexSchemaVersion: manifest.indexSchemaVersion,
      corpusVersion: manifest.corpusVersion,
      sourceManifestDigest: manifest.sourceManifestDigest,
      files: Object.keys(manifest.files ?? {}).length,
    },
  };
}

function atomicSwap(staging, target) {
  const backup = `${target}.old`;
  fs.rmSync(backup, { recursive: true, force: true });
  let movedOld = false;
  if (fs.existsSync(target)) {
    fs.renameSync(target, backup);
    movedOld = true;
  }
  try {
    fs.renameSync(staging, target);
  } catch (error) {
    if (movedOld && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
  if (movedOld) {
    fs.rmSync(backup, { recursive: true, force: true });
  }
}

export async function installPack(packPath, targetDirs = userDataRagDirs()) {
  const verification = await verifyPack(packPath);
  if (!verification.ok) throw new Error(verification.error);
  const buffer = fs.readFileSync(packPath);
  const zip = await JSZip.loadAsync(buffer);
  const installed = [];
  for (const targetDir of targetDirs) {
    const staging = `${targetDir}.new`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    try {
      for (const name of [...ALLOWED_FILES]) {
        const entry = zip.file(name);
        if (entry) {
          fs.writeFileSync(path.join(staging, name), await entry.async("nodebuffer"));
        }
      }
      const manifestRaw = await zip.file("pack-manifest.json")?.async("string");
      if (manifestRaw) {
        fs.writeFileSync(path.join(staging, "pack-manifest.json"), manifestRaw);
      }
      atomicSwap(staging, targetDir);
      installed.push(targetDir);
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw new Error(`安装失败且已保留旧索引: ${String(error?.message ?? error)}`);
    }
  }
  return { installed, verification };
}

export function packStatus() {
  const dirs = userDataRagDirs();
  const report = [];
  for (const dir of dirs) {
    const meta = readJson(path.join(dir, "index.meta.json"));
    const manifest = readJson(path.join(dir, "pack-manifest.json"));
    const chunks = readJson(path.join(dir, "chunks.json"));
    report.push({
      dir,
      indexAvailable: Boolean(meta && meta.chunks),
      chunks: meta?.chunks ?? chunks?.length ?? 0,
      packManifest: manifest
        ? {
            corpusVersion: manifest.corpusVersion,
            sourceManifestDigest: manifest.sourceManifestDigest,
            files: Object.keys(manifest.files ?? {}).length,
          }
        : null,
    });
  }
  return report;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const command = process.argv[2] ?? "build";
  const argPath = process.argv.find((value) => value.startsWith("--")) ? null : process.argv[3];
  if (command === "build") {
    const result = await buildPack();
    console.log(
      `[rag:pack] ${result.file} bytes=${result.bytes} files=${result.files} sha256=${result.sha256.slice(0, 16)}…`
    );
  } else if (command === "verify") {
    const target = argPath ?? latestPack();
    const result = await verifyPack(target);
    console.log(
      `[rag:pack:verify] ${target} ok=${result.ok}${result.error ? ` error=${result.error}` : ""} sha256=${(result.digest ?? "").slice(0, 16)}… sidecar=${result.sidecarOk}`
    );
    process.exit(result.ok && result.sidecarOk ? 0 : 1);
  } else if (command === "install") {
    const target = argPath ?? latestPack();
    const result = await installPack(target);
    console.log(`[rag:pack:install] ${target} -> ${result.installed.join(", ")}`);
  } else if (command === "status") {
    for (const item of packStatus()) {
      console.log(
        `[rag:pack:status] ${item.dir} available=${item.indexAvailable} chunks=${item.chunks} pack=${item.packManifest ? `v${item.packManifest.corpusVersion?.slice(0, 19) ?? "?"}` : "none"}`
      );
    }
  } else {
    console.error(`未知命令: ${command}`);
    process.exit(1);
  }
}

function latestPack() {
  const dir = packsDir();
  if (!fs.existsSync(dir)) throw new Error("没有已构建的知识包");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".mcrag"));
  if (!files.length) throw new Error("没有已构建的知识包");
  files.sort();
  return path.join(dir, files[files.length - 1]);
}
