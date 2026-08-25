// RAG Worker 内存浸泡：真实索引 500 预热 + 5000 IPC 查询 + 生命周期压力。
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildQueryBank, horizonFor } from "./lib/query-bank.mjs";
import { indexDir, ensureDirs, writeJson } from "./lib/paths.mjs";
import { reportDir } from "./lib/registry.mjs";
import { resolveRuntimePaths } from "../lib/runtime-paths.mjs";

const WORKER = path.join("electron", "rag-worker.mjs");

function request(worker, type, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = setTimeout(() => {
      worker.off("message", onMessage);
      reject(new Error("ipc-timeout"));
    }, timeoutMs);
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

function waitExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", () => resolve());
  });
}

function startWorker(indexPath, runtimeEnv = process.env, extraEnv = {}) {
  const child = fork(WORKER, [], {
    env: { ...runtimeEnv, RAG_INDEX_DIR: indexPath, ...extraEnv },
    execArgv: ["--expose-gc"],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  let stderrText = "";
  child.stderr?.on("data", (buffer) => {
    stderrText += buffer.toString();
  });
  child.stdout?.on("data", () => {});
  return { child, stderr: () => stderrText };
}

async function waitAvailable(worker, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const status = await request(worker, "status", null, 5000);
      if (status?.available) return status;
    } catch {
      // 继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("worker not available");
}

export async function runMemorySoak() {
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
  const bank = buildQueryBank();
  const distinct = new Set(bank.map((item) => item.text)).size;
  const soak = {};

  // 主浸泡：500 预热 + 10×500 查询，每批 worker 内强制 GC
  const workerHandle = startWorker(indexDir, runtimeEnv);
  const worker = workerHandle.child;
  try {
    await waitAvailable(worker);
    const runBatch = async (start, count, rotation) => {
      for (let i = 0; i < count; i += 1) {
        const item = bank[(start + i) % bank.length];
        const volume = 1 + ((i + rotation) % 7);
        await request(worker, "search", {
          query: item.text,
          audience: { kind: item.kind, knownLoreIds: [], topicGrants: [] },
          maxSpoilerScope: "all",
          horizon: horizonFor(volume),
          limit: 10,
          maxChars: 12000,
        }, 30000);
      }
    };
    await runBatch(0, 500, 0);
    const baseline = await request(worker, "gc", null, 10000);
    soak.baseline = baseline;
    soak.batches = [];
    for (let batch = 0; batch < 10; batch += 1) {
      const startedAt = Date.now();
      await runBatch(batch * 500, 500, batch);
      const snap = await request(worker, "gc", null, 10000);
      soak.batches.push({
        batch: batch + 1,
        queries: 500,
        latencyMs: Date.now() - startedAt,
        rss: snap.rss,
        heapUsed: snap.heapUsed,
        heapTotal: snap.heapTotal,
        external: snap.external,
        arrayBuffers: snap.arrayBuffers,
        traceCount: snap.traceCount,
        cacheCount: snap.cacheCount,
        activeRequests: snap.activeRequests,
      });
    }
  } finally {
    worker.kill();
    await waitExit(worker);
  }

  const listenerWarnings = workerHandle.stderr().includes("MaxListenersExceededWarning");

  // 生命周期：100 次启动/关闭
  const lifecycle = { starts: 0, reloads: 0, corruptFallbacks: 0, ipcErrors: 0, exits: 0 };
  for (let i = 0; i < 100; i += 1) {
    const h = startWorker(indexDir, runtimeEnv);
    try {
      await waitAvailable(h.child, 30000);
      lifecycle.starts += 1;
      await request(h.child, "status", null, 5000);
    } finally {
      h.child.kill();
      await waitExit(h.child);
      lifecycle.exits += 1;
    }
  }

  // 20 次 reload
  {
    const h = startWorker(indexDir, runtimeEnv);
    try {
      await waitAvailable(h.child, 30000);
      for (let i = 0; i < 20; i += 1) {
        const status = await request(h.child, "reload", null, 30000);
        if (status?.available) lifecycle.reloads += 1;
      }
    } finally {
      h.child.kill();
      await waitExit(h.child);
    }
  }

  // 20 次损坏索引回退
  const tmp = fs.mkdtempSync(path.join(runtimePaths.tempRoot, "rag-corrupt-"));
  const badMeta = path.join(tmp, "bad-meta");
  const missingMeta = path.join(tmp, "missing-meta");
  fs.mkdirSync(badMeta, { recursive: true });
  fs.mkdirSync(missingMeta, { recursive: true });
  fs.writeFileSync(path.join(badMeta, "index.meta.json"), JSON.stringify({ version: 99 }));
  fs.writeFileSync(path.join(badMeta, "chunks.json"), "[]");
  for (let i = 0; i < 20; i += 1) {
    const dir = i % 2 === 0 ? badMeta : missingMeta;
    const h = startWorker(dir, runtimeEnv);
    try {
      const status = await request(h.child, "status", null, 10000);
      if (!status?.available) lifecycle.corruptFallbacks += 1;
    } finally {
      h.child.kill();
      await waitExit(h.child);
    }
  }

  // 20 次非法 IPC / 超时类异常
  {
    const h = startWorker(indexDir, runtimeEnv);
    try {
      await waitAvailable(h.child, 30000);
      for (let i = 0; i < 10; i += 1) {
        try {
          await request(h.child, "search", {
            query: "",
            audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
          }, 5000);
        } catch {
          lifecycle.ipcErrors += 1;
        }
      }
      for (let i = 0; i < 10; i += 1) {
        try {
          await request(h.child, "not-a-type", null, 5000);
        } catch {
          lifecycle.ipcErrors += 1;
        }
      }
    } finally {
      h.child.kill();
      await waitExit(h.child);
    }
  }

  // 20 次退出终止
  for (let i = 0; i < 20; i += 1) {
    const h = startWorker(indexDir, runtimeEnv);
    try {
      await waitAvailable(h.child, 30000);
    } finally {
      h.child.kill();
      await waitExit(h.child);
      lifecycle.exits += 1;
    }
  }

  const last = soak.batches[soak.batches.length - 1];
  const baseline = soak.baseline;
  const heapGrowth = last.heapUsed - baseline.heapUsed;
  const rssGrowth = last.rss - baseline.rss;
  const n = soak.batches.length;
  const xMean = soak.batches.reduce((sum, item) => sum + item.batch, 0) / n;
  const yMean = soak.batches.reduce((sum, item) => sum + item.rss, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const item of soak.batches) {
    numerator += (item.batch - xMean) * (item.rss - yMean);
    denominator += (item.batch - xMean) ** 2;
  }
  const rssSlopePer1000 = denominator ? (numerator / denominator) * 2 : 0;
  const pass =
    heapGrowth <= 80 * 1024 * 1024 &&
    rssSlopePer1000 <= 10 * 1024 * 1024 &&
    !listenerWarnings &&
    lifecycle.starts === 100 &&
    lifecycle.reloads === 20 &&
    lifecycle.corruptFallbacks === 20 &&
    lifecycle.ipcErrors >= 20 &&
    lifecycle.exits >= 120;

  const report = {
    mode: "worker-ipc",
    indexChunks: soak.baseline.chunks ?? 0,
    distinctQueries: distinct,
    warmup: 500,
    totalQueries: 5000,
    baseline,
    batches: soak.batches,
    lifecycle,
    listenerWarnings,
    summary: {
      heapGrowthBytes: heapGrowth,
      rssGrowthBytes: rssGrowth,
      rssSlopeBytesPer1000Queries: Math.round(rssSlopePer1000),
      traceCount: last.traceCount,
      cacheCount: last.cacheCount,
      activeRequests: last.activeRequests,
    },
    pass,
  };
  fs.rmSync(tmp, { recursive: true, force: true });
  return report;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureDirs();
  const report = await runMemorySoak();
  console.log("[rag:memory:soak]");
  console.log(
    `  索引=${report.indexChunks} 预热=${report.warmup} 查询=${report.totalQueries} 不同查询=${report.distinctQueries}`
  );
  for (const item of report.batches) {
    console.log(
      `  批${item.batch}: heapUsed=${Math.round(item.heapUsed / 1048576)}MB rss=${Math.round(item.rss / 1048576)}MB trace=${item.traceCount} cache=${item.cacheCount} active=${item.activeRequests}`
    );
  }
  const s = report.summary;
  console.log(
    `  汇总: heapGrowth=${Math.round(s.heapGrowthBytes / 1048576)}MB rssGrowth=${Math.round(s.rssGrowthBytes / 1048576)}MB rssSlope=${Math.round(s.rssSlopeBytesPer1000Queries / 1048576)}MB/1000q`
  );
  console.log(
    `  生命周期: starts=${report.lifecycle.starts}/100 reloads=${report.lifecycle.reloads}/20 corruptFallback=${report.lifecycle.corruptFallbacks}/20 ipcErrors=${report.lifecycle.ipcErrors}/20 exits=${report.lifecycle.exits}/120 listenerWarnings=${report.listenerWarnings}`
  );
  writeJson(path.join(reportDir(), "memory-soak.json"), report);
  console.log(`[rag:memory:soak] RESULT=${report.pass ? "PASS" : "FAIL"}`);
  process.exit(report.pass ? 0 : 1);
}
