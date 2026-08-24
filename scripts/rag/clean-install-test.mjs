// 干净环境知识库部署验证：隔离临时 userData 目录，覆盖 A/B/C/D 四场景。
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { buildPack, installPack } from "./pack.mjs";
import { resolveRuntimePaths } from "../lib/runtime-paths.mjs";

const WORKER = path.join("electron", "rag-worker.mjs");

function request(worker, type, payload, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const id = `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function startWorker(indexPath, runtimeEnv = process.env) {
  const child = fork(WORKER, [], {
    env: { ...runtimeEnv, RAG_INDEX_DIR: indexPath },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  return child;
}

async function withWorker(indexPath, fn, runtimeEnv = process.env) {
  const child = startWorker(indexPath, runtimeEnv);
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

async function buildTamperedPack(kind, validBuffer) {
  const zip = await JSZip.loadAsync(validBuffer);
  if (kind === "hash-mismatch") {
    const chunks = await zip.file("chunks.json").async("string");
    zip.file("chunks.json", chunks.slice(0, Math.max(1, chunks.length - 1)) + " ");
  } else if (kind === "manifest-missing") {
    zip.remove("pack-manifest.json");
  } else if (kind === "schema-mismatch") {
    const manifest = JSON.parse(await zip.file("pack-manifest.json").async("string"));
    manifest.indexSchemaVersion = 99;
    zip.file("pack-manifest.json", JSON.stringify(manifest));
  } else if (kind === "path-traversal") {
    zip.file("../evil.txt", "boom");
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function runCleanInstallTest() {
  const baseEnv = {
    ...process.env,
    GMZZ_REQUIRE_D_DRIVE: process.env.GMZZ_REQUIRE_D_DRIVE ?? "1",
  };
  const runtimePaths = resolveRuntimePaths({ env: baseEnv });
  const runtimeEnv = {
    ...baseEnv,
    GMZZ_STORAGE_ROOT: runtimePaths.root,
    GMZZ_USER_DATA: runtimePaths.userDataRoot,
    TEMP: runtimePaths.tempRoot,
    TMP: runtimePaths.tempRoot,
    npm_config_cache: runtimePaths.npmCacheRoot,
    ELECTRON_CACHE: runtimePaths.electronCacheRoot,
    ELECTRON_BUILDER_CACHE: runtimePaths.electronCacheRoot,
    PLAYWRIGHT_BROWSERS_PATH: runtimePaths.playwrightRoot,
  };
  fs.mkdirSync(runtimePaths.tempRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(runtimePaths.tempRoot, "rag-clean-install-"));
  const validPack = await buildPack();
  const validBuffer = fs.readFileSync(validPack.file);
  const results = { A: null, B: null, C: {}, D: null };

  // 场景 A：无知识包 / 无索引
  const emptyDir = path.join(root, "a-empty");
  fs.mkdirSync(emptyDir, { recursive: true });
  results.A = await withWorker(emptyDir, async (worker) => {
    const status = await request(worker, "status");
    const search = await request(worker, "search", {
      query: "克莱恩",
      audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
      limit: 5,
      maxChars: 2000,
    }).catch((error) => ({ error: error.message }));
    return {
      status,
      searchError: search.error ?? null,
      noCrash: true,
    };
  }, runtimeEnv);

  // 场景 B：有效知识包
  const bDir = path.join(root, "b-valid");
  fs.mkdirSync(bDir, { recursive: true });
  const bInstall = await installPack(validPack.file, [bDir]);
  results.B = await withWorker(bDir, async (worker) => {
    const status = await request(worker, "status");
    const search = await request(worker, "search", {
      query: "克莱恩 占卜家",
      audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
      limit: 5,
      maxChars: 2000,
    });
    return {
      installed: bInstall.installed.length,
      available: status.available,
      chunks: status.chunks,
      recordCount: search.records?.length ?? 0,
      zhHit: (search.records ?? []).some((record) => record.sourceId === "zh-lotm-txt"),
    };
  }, runtimeEnv);

  // 场景 C：损坏知识包拒绝且不破坏现有索引
  const cDir = path.join(root, "c-corrupt");
  fs.mkdirSync(cDir, { recursive: true });
  await installPack(validPack.file, [cDir]);
  const corruptKinds = ["hash-mismatch", "manifest-missing", "schema-mismatch", "path-traversal", "truncated"];
  for (const kind of corruptKinds) {
    let buffer;
    if (kind === "truncated") {
      buffer = validBuffer.subarray(0, Math.floor(validBuffer.length / 2));
    } else {
      buffer = await buildTamperedPack(kind, validBuffer);
    }
    const corruptFile = path.join(root, `${kind}.mcrag`);
    fs.writeFileSync(corruptFile, buffer);
    let rejected = false;
    let error = "";
    try {
      await installPack(corruptFile, [cDir]);
    } catch (caught) {
      rejected = true;
      error = String(caught?.message ?? caught);
    }
    const intact = await withWorker(cDir, async (worker) => {
      const status = await request(worker, "status");
      return status.available && status.chunks > 0;
    }, runtimeEnv);
    results.C[kind] = { rejected, error: error.slice(0, 80), oldIndexIntact: intact };
  }

  // 场景 D：知识包升级（同包重装 + 失败回滚）
  const dDir = path.join(root, "d-upgrade");
  fs.mkdirSync(dDir, { recursive: true });
  const first = await installPack(validPack.file, [dDir]);
  const before = await withWorker(dDir, async (worker) => {
    const status = await request(worker, "status");
    return status.available;
  }, runtimeEnv);
  const upgrade = await installPack(validPack.file, [dDir]);
  const after = await withWorker(dDir, async (worker) => {
    const status = await request(worker, "status");
    const search = await request(worker, "search", {
      query: "占卜家途径",
      audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
      limit: 3,
      maxChars: 1000,
    });
    return { available: status.available, recordCount: search.records?.length ?? 0 };
  }, runtimeEnv);
  // 升级失败回滚：损坏包安装必须保留可用索引
  const rollbackFile = path.join(root, "rollback-bad.mcrag");
  fs.writeFileSync(rollbackFile, await buildTamperedPack("hash-mismatch", validBuffer));
  let rollbackRejected = false;
  try {
    await installPack(rollbackFile, [dDir]);
  } catch {
    rollbackRejected = true;
  }
  const rollback = await withWorker(dDir, async (worker) => {
    const status = await request(worker, "status");
    return status.available;
  }, runtimeEnv);
  results.D = {
    firstInstall: first.installed.length,
    before,
    upgradeInstalled: upgrade.installed.length,
    after,
    rollbackRejected,
    rollbackIntact: rollback,
  };

  fs.rmSync(root, { recursive: true, force: true });
  return results;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const results = await runCleanInstallTest();
  console.log("[rag:clean:install]");
  console.log(`  A 无索引: status=${JSON.stringify(results.A.status)} searchError=${results.A.searchError} noCrash=${results.A.noCrash}`);
  console.log(`  B 有效包: ${JSON.stringify(results.B)}`);
  for (const [kind, value] of Object.entries(results.C)) {
    console.log(`  C ${kind}: rejected=${value.rejected} oldIntact=${value.oldIndexIntact} error=${value.error}`);
  }
  console.log(`  D 升级: ${JSON.stringify(results.D)}`);
  const pass =
    !results.A.status.available &&
    results.A.noCrash &&
    results.B.available &&
    results.B.zhHit &&
    Object.values(results.C).every((value) => value.rejected && value.oldIndexIntact) &&
    results.D.before &&
    results.D.after.available &&
    results.D.rollbackRejected &&
    results.D.rollbackIntact;
  console.log(`[rag:clean:install] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
