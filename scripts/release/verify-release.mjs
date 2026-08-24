import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolveRuntimePaths } from "../lib/runtime-paths.mjs";

const require = createRequire(import.meta.url);
const { SEED_FILES, validateSeed } = require("../../electron/knowledge-seed.cjs");
const root = path.resolve(import.meta.dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const mode = process.argv[2] ?? "source";

function fail(message) {
  console.error(`[release:${mode}] ${message}`);
  process.exit(1);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verifyVersion() {
  if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
    fail(`package.json/package-lock.json version mismatch (${pkg.version})`);
  }
  const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
  if (tag && tag !== `v${pkg.version}`) {
    fail(`tag ${tag} does not match package version v${pkg.version}`);
  }
}

function requireDDrive() {
  return process.platform === "win32" && String(process.env.GMZZ_REQUIRE_D_DRIVE ?? "1").trim() !== "0";
}

function isDDrivePath(candidate) {
  return process.platform !== "win32" || path.win32.parse(candidate).root.toUpperCase() === "D:\\";
}

function resolveSeedSource() {
  const configured = Object.prototype.hasOwnProperty.call(process.env, "KNOWLEDGE_SEED_DIR");
  const raw = configured ? String(process.env.KNOWLEDGE_SEED_DIR ?? "").trim() : path.join(root, "private", "rag", "index");
  if (!raw || !path.isAbsolute(raw)) fail("seed-source-path-invalid: KNOWLEDGE_SEED_DIR must be an absolute path");

  const resolved = path.resolve(raw);
  if (requireDDrive() && !isDDrivePath(resolved)) {
    fail(`seed-source-path-invalid: seed source must be on D: (${resolved})`);
  }

  if (!fs.existsSync(resolved)) {
    if (configured) fail(`seed-source-path-missing: ${resolved}`);
    return resolved;
  }
  let realPath;
  try {
    realPath = fs.realpathSync(resolved);
  } catch (error) {
    fail(`seed-source-path-invalid: cannot resolve ${resolved} (${error?.message ?? error})`);
  }
  if (requireDDrive() && !isDDrivePath(realPath)) {
    fail(`seed-source-path-invalid: resolved seed source must be on D: (${realPath})`);
  }
  if (!fs.statSync(realPath).isDirectory()) fail(`seed-source-path-invalid: not a directory (${resolved})`);
  return realPath;
}

function resolveReleaseSeedDir() {
  try {
    const env = {
      ...process.env,
      GMZZ_REQUIRE_D_DRIVE: requireDDrive() ? "1" : "0",
    };
    return path.join(resolveRuntimePaths({ repoRoot: root, env }).root, "release-seed");
  } catch (error) {
    fail(`release-storage-path-invalid: ${error?.message ?? error}`);
  }
}

function samePath(left, right) {
  const normalize = (value) => path.normalize(path.resolve(value)).replace(/[\\/]+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function stageAndReadSeed() {
  const sourceDir = resolveSeedSource();
  const seedDir = resolveReleaseSeedDir();
  const sourceResult = validateSeed(sourceDir);
  if (!sourceResult.ok) fail(`authorized knowledge seed is invalid: ${sourceResult.error}`);

  if (!samePath(sourceDir, seedDir)) {
    fs.rmSync(seedDir, { recursive: true, force: true });
    fs.mkdirSync(seedDir, { recursive: true });
    const filesToStage = new Set([
      ...SEED_FILES,
      ...Object.keys(sourceResult.manifest.files ?? {}),
    ]);
    for (const name of filesToStage) {
      if (path.basename(name) !== name) fail(`authorized knowledge seed is invalid: seed-illegal-path:${name}`);
      const source = path.join(sourceDir, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(seedDir, name));
    }
  }
  const result = validateSeed(seedDir);
  if (!result.ok) fail(`authorized knowledge seed is invalid: ${result.error}`);
  return { seedDir, manifest: result.manifest };
}

verifyVersion();

if (mode === "source") {
  console.log(`[release:source] version=${pkg.version} tag=${process.env.RELEASE_TAG || "local"}`);
} else if (mode === "seed") {
  const { manifest } = stageAndReadSeed();
  console.log(`[release:seed] buildId=${manifest.buildId} seedVersion=${manifest.seedVersion}`);
} else if (mode === "artifact") {
  const { manifest } = stageAndReadSeed();
  const releaseDir = path.join(root, "release");
  if (!fs.existsSync(releaseDir)) fail("release-directory-missing");
  const installers = fs.readdirSync(releaseDir).filter((name) => name.endsWith(`-Setup-${pkg.version}.exe`));
  if (installers.length !== 1) fail(`expected exactly one .exe, found ${installers.length}`);
  const installerPath = path.join(releaseDir, installers[0]);
  const sourceCommit = process.env.SOURCE_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const provenance = {
    schemaVersion: 1,
    application: pkg.name,
    version: pkg.version,
    tag: process.env.RELEASE_TAG || `v${pkg.version}`,
    sourceCommit,
    installer: {
      file: installers[0],
      bytes: fs.statSync(installerPath).size,
      sha256: sha256(installerPath),
    },
    knowledgeSeed: {
      buildId: manifest.buildId,
      seedVersion: manifest.seedVersion,
      sourceManifestDigest: manifest.sourceManifestDigest,
    },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(releaseDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`[release:artifact] ${provenance.installer.file} sha256=${provenance.installer.sha256}`);
} else {
  fail(`unknown mode: ${mode}`);
}
