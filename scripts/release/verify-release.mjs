import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

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

function stageAndReadSeed() {
  const sourceDir = path.join(root, "private", "rag", "index");
  const seedDir = path.join(root, ".runtime", "release-seed");
  fs.rmSync(seedDir, { recursive: true, force: true });
  fs.mkdirSync(seedDir, { recursive: true });
  for (const name of SEED_FILES) {
    const source = path.join(sourceDir, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(seedDir, name));
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
  const releaseDir = path.join(root, "release");
  const installers = fs.readdirSync(releaseDir).filter((name) => name.endsWith(`-Setup-${pkg.version}.exe`));
  if (installers.length !== 1) fail(`expected exactly one .exe, found ${installers.length}`);
  const installerPath = path.join(releaseDir, installers[0]);
  const seedDir = path.join(root, ".runtime", "release-seed");
  const result = validateSeed(seedDir);
  if (!result.ok) fail(`staged knowledge seed is invalid: ${result.error}; run npm run release:verify:seed first`);
  const manifest = result.manifest;
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
