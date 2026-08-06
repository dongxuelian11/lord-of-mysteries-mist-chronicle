// 内置知识库 seed 部署专项场景（A–F）：隔离临时目录 + 真实 Worker 验证。
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { indexDir } from "./lib/paths.mjs";
import { buildPack, installPack } from "./pack.mjs";

const require = createRequire(import.meta.url);
const { validateSeed, deploymentDecision, deploySeed } = require("../../electron/knowledge-seed.cjs");

function request(worker, type, payload, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const id = `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = setTimeout(() => reject(new Error("ipc-timeout")), timeoutMs);
    const onMessage = (message) => {
      if (!message || message.id !== id) return;
      clearTimeout(timer);
      worker.off("message", onMessage);
      if (message.ok) resolve(message.payload);
      else reject(new Error(message.payload?.error ?? "ipc-error"));
    };
    worker.on("message", onMessage);
    worker.send({ type, id, payload });
  });
}

async function withWorker(indexPath, fn) {
  const child = fork("electron/rag-worker.mjs", [], {
    env: { ...process.env, RAG_INDEX_DIR: indexPath },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  try {
    return await fn(child);
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once("exit", resolve);
    });
  }
}

async function workerSearchOk(indexPath) {
  return withWorker(indexPath, async (worker) => {
    const status = await request(worker, "status");
    if (!status.available) return { available: false, chunks: 0 };
    const search = await request(worker, "search", {
      query: "克莱恩 占卜家",
      audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
      limit: 5,
      maxChars: 2000,
    });
    return {
      available: true,
      chunks: status.chunks,
      zhHit: (search.records ?? []).some((record) => record.sourceId === "zh-lotm-txt"),
    };
  });
}

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const full = path.join(source, name);
    if (fs.statSync(full).isFile()) fs.copyFileSync(full, path.join(target, name));
  }
}

export async function runSeedScenarios() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seed-scenarios-"));
  const seedDir = path.join(root, "seed");
  copyDir(indexDir, seedDir);
  const seedValidation = validateSeed(seedDir);
  const results = { A: null, B: null, C: null, D: null, E: {}, F: null };

  // A：首次安装（空目录）
  {
    const target = path.join(root, "a-first");
    const deploy = deploySeed(seedDir, target);
    const worker = await workerSearchOk(target);
    results.A = { seedValid: seedValidation.ok, deployed: deploy.deployed, worker };
  }

  // B：已有相同版本（不重复复制）
  {
    const target = path.join(root, "b-same");
    deploySeed(seedDir, target);
    const mtimeBefore = fs.statSync(path.join(target, "chunks.json")).mtimeMs;
    const decision = deploymentDecision(seedDir, target);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const mtimeAfter = fs.statSync(path.join(target, "chunks.json")).mtimeMs;
    results.B = { action: decision.action, reason: decision.reason, noRewrite: mtimeBefore === mtimeAfter };
  }

  // C：用户索引/知识包比 seed 新（不得覆盖）
  {
    const target = path.join(root, "c-newer-user");
    const pack = await buildPack();
    await installPack(pack.file, [target]);
    fs.writeFileSync(
      path.join(target, "pack-manifest.json"),
      JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(target, "pack-manifest.json"), "utf8")), corpusVersion: "2099-01-01T00:00:00.000Z", buildId: "2099|newer" })
    );
    const mtimeBefore = fs.statSync(path.join(target, "chunks.json")).mtimeMs;
    const decision = deploymentDecision(seedDir, target);
    const deploy = deploySeed(seedDir, target);
    const mtimeAfter = fs.statSync(path.join(target, "chunks.json")).mtimeMs;
    results.C = { decision: decision.action, deploy: deploy.deployed, preserved: mtimeBefore === mtimeAfter };
  }

  // D：seed 比用户索引新（安全升级 + 回滚保留）
  {
    const target = path.join(root, "d-old-index");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "index.meta.json"), JSON.stringify({ version: 2, chunks: 1, builtAt: "2000-01-01T00:00:00.000Z" }));
    fs.writeFileSync(path.join(target, "chunks.json"), "[]");
    const decision = deploymentDecision(seedDir, target);
    const deploy = deploySeed(seedDir, target);
    const worker = await workerSearchOk(target);
    const backupGone = !fs.existsSync(`${target}.seed-backup`);
    results.D = { decision: decision.action, deployed: deploy.deployed, worker, backupGone };
  }

  // E：损坏 seed 拒绝且不破坏已有索引
  {
    const intactTarget = path.join(root, "e-intact");
    deploySeed(seedDir, intactTarget);
    const corruptKinds = [
      "manifest-missing",
      "hash-mismatch",
      "schema-incompatible",
      "truncated",
      "missing-key-file",
      "illegal-path",
      "unknown-executable",
    ];
    for (const kind of corruptKinds) {
      const badSeed = path.join(root, `e-bad-${kind}`);
      copyDir(seedDir, badSeed);
      if (kind === "manifest-missing") {
        fs.rmSync(path.join(badSeed, "seed-manifest.json"));
      } else if (kind === "hash-mismatch") {
        const chunks = path.join(badSeed, "chunks.json");
        fs.writeFileSync(chunks, fs.readFileSync(chunks, "utf8") + " ");
      } else if (kind === "schema-incompatible") {
        const manifestPath = path.join(badSeed, "seed-manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest.indexSchemaVersion = 99;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      } else if (kind === "truncated") {
        const chunks = path.join(badSeed, "chunks.json");
        const buffer = fs.readFileSync(chunks);
        fs.writeFileSync(chunks, buffer.subarray(0, Math.floor(buffer.length / 2)));
      } else if (kind === "missing-key-file") {
        fs.rmSync(path.join(badSeed, "inverted.json"));
      } else if (kind === "illegal-path") {
        const manifestPath = path.join(badSeed, "seed-manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest.files["../evil.json"] = { bytes: 4, sha256: "x" };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      } else if (kind === "unknown-executable") {
        fs.writeFileSync(path.join(badSeed, "evil.exe"), "MZ");
      }
      const validation = validateSeed(badSeed);
      const deploy = deploySeed(badSeed, intactTarget);
      const worker = await workerSearchOk(intactTarget);
      results.E[kind] = {
        rejected: !validation.ok,
        deploySkipped: !deploy.deployed,
        oldIntact: worker.available && worker.chunks > 0,
      };
    }
    // 无已有索引时损坏 seed：安全回退不崩溃
    const emptyTarget = path.join(root, "e-empty");
    const deploy = deploySeed(path.join(root, "e-bad-hash-mismatch"), emptyTarget);
    results.E.noExistingFallback = { deployed: deploy.deployed, reason: deploy.decision.reason };
  }

  // F：seed 安装后再装较新 .mcrag，重启后保持较新版本
  {
    const target = path.join(root, "f-upgrade");
    deploySeed(seedDir, target);
    const pack = await buildPack();
    await installPack(pack.file, [target]);
    const manifestPath = path.join(target, "pack-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.corpusVersion = "2099-06-01T00:00:00.000Z";
    manifest.buildId = "2099|f";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const decision = deploymentDecision(seedDir, target);
    const worker1 = await workerSearchOk(target);
    const worker2 = await workerSearchOk(target);
    results.F = {
      decision: decision.action,
      restartKeeps: worker1.available && worker2.available && worker2.chunks > 0,
      packManifestKept: fs.existsSync(manifestPath),
    };
  }

  fs.rmSync(root, { recursive: true, force: true });
  return results;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const results = await runSeedScenarios();
  console.log("[rag:seed:scenarios]");
  console.log(`  A 首次安装: ${JSON.stringify(results.A)}`);
  console.log(`  B 相同版本: ${JSON.stringify(results.B)}`);
  console.log(`  C 用户更新: ${JSON.stringify(results.C)}`);
  console.log(`  D seed升级: ${JSON.stringify(results.D)}`);
  for (const [kind, value] of Object.entries(results.E)) {
    if (kind === "noExistingFallback") continue;
    console.log(`  E ${kind}: ${JSON.stringify(value)}`);
  }
  console.log(`  E 无索引回退: ${JSON.stringify(results.E.noExistingFallback)}`);
  console.log(`  F 知识包升级: ${JSON.stringify(results.F)}`);
  const pass =
    results.A.seedValid &&
    results.A.deployed &&
    results.A.worker.available &&
    results.A.worker.zhHit &&
    results.B.action === "skip" &&
    results.B.noRewrite &&
    results.C.decision === "keep" &&
    results.C.preserved &&
    results.D.deployed &&
    results.D.worker.available &&
    results.D.backupGone &&
    Object.values(results.E).filter((value) => typeof value === "object" && "rejected" in value)
      .every((value) => value.rejected && value.deploySkipped && value.oldIntact) &&
    results.E.noExistingFallback.deployed === false &&
    results.F.decision === "keep" &&
    results.F.restartKeeps;
  console.log(`[rag:seed:scenarios] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
