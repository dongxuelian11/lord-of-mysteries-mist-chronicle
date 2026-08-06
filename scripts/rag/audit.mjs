// RAG 规模审计：索引/Bundle/构建/冷启动/检索延迟/内存/迁移触发条件。
import { spawnSync, spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { indexDir, readJson, root } from "./lib/paths.mjs";
import { loadRuntimeModule, closeRuntimeServer } from "./lib/load-runtime.mjs";

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function waitForServer(url, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          clearInterval(timer);
          resolve(Date.now() - startedAt);
        }
      });
      req.on("error", () => {});
      req.setTimeout(2000, () => req.destroy());
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve(-1);
      }
    }, 200);
  });
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // 已退出
  }
}

export async function runAudit({ queries = 1000 } = {}) {
  const meta = readJson(path.join(indexDir, "index.meta.json"));
  const chunks = readJson(path.join(indexDir, "chunks.json")) ?? [];
  const indexDirBytes = fs
    .readdirSync(indexDir)
    .filter((name) => name.endsWith(".json"))
    .reduce((sum, name) => sum + sizeOf(path.join(indexDir, name)), 0);

  // 索引解析时间与内存
  const parseStart = Date.now();
  const inverted = readJson(path.join(indexDir, "inverted.json")) ?? {};
  const parseMs = Date.now() - parseStart;
  const memoryBefore = process.memoryUsage().heapUsed;
  const { HybridRetriever } = await loadRuntimeModule(
    "app/rag/hybrid-retriever.ts"
  );
  const retriever = new HybridRetriever({ chunks, inverted });
  const indexMemoryDelta = Math.round(
    (process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024
  );

  // 检索延迟
  const samples = [];
  const queriesList = [];
  for (let i = 0; i < queries; i += 1) {
    const chunk = chunks[i % Math.max(1, chunks.length)];
    const title = (chunk?.title ?? "塔罗会").slice(0, 12);
    const alias = chunk?.aliases?.[0];
    queriesList.push(
      i % 3 === 0 && alias ? `${alias} 是什么` : `${title} 的背景`
    );
  }
  let contextTotal = 0;
  let candidatesTotal = 0;
  for (const query of queriesList) {
    const startedAt = Date.now();
    const result = retriever.searchSync({
      text: query,
      filters: {
        audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
        maxSpoilerScope: "all",
      },
      limit: 8,
      maxChars: 4000,
    });
    samples.push(Date.now() - startedAt);
    contextTotal += result.trace.contextSize;
    candidatesTotal += result.trace.lexicalCandidates;
  }
  samples.sort((a, b) => a - b);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  const maxLatency = samples[samples.length - 1] ?? 0;
  await closeRuntimeServer();

  // Bundle 尺寸
  const clientDir = path.join(root, "dist", "client", "assets");
  const bundleFiles = fs.existsSync(clientDir)
    ? fs.readdirSync(clientDir).filter((f) => f.endsWith(".js"))
    : [];
  const bundleBytes = bundleFiles.reduce(
    (sum, f) => sum + sizeOf(path.join(clientDir, f)),
    0
  );

  // 构建时间（spawn npm run build）
  const buildStart = Date.now();
  spawnSync(
    process.env.ComSpec || "cmd.exe",
    ["/d", "/s", "/c", "npm run build"],
    { cwd: root, stdio: "ignore", windowsHide: true, timeout: 600_000 }
  );
  const buildMs = Date.now() - buildStart;

  // 冷启动（生产服务器）
  const serverPort = 3240;
  const server = spawn(process.execPath, [path.join(root, "electron", "server.mjs")], {
    cwd: root,
    env: { ...process.env, GMZZ_PORT: String(serverPort), GMZZ_HOST: "127.0.0.1", GMZZ_OUT_DIR: path.join(root, "dist"), GMZZ_VINEXT_DIR: path.join(root, "node_modules", "vinext") },
    stdio: "ignore",
    windowsHide: true,
  });
  const serverReadyMs = await waitForServer(
    `http://127.0.0.1:${serverPort}`,
    60_000
  );
  killTree(server.pid);

  const triggers = [];
  if (bundleBytes > 5 * 1024 * 1024) triggers.push("renderer bundle > 5MB");
  if (meta?.chunks > 10_000 && p95 > 200) triggers.push("10k chunks lexical P95 > 200ms");
  const rendererBundlesIndex = bundleFiles.some((file) => {
    try {
      const source = fs.readFileSync(path.join(clientDir, file), "utf8");
      return (
        source.includes("Jaguar000212") ||
        source.includes("chunk-lotm") ||
        source.includes("chunk-ttrpg-wiki")
      );
    } catch {
      return false;
    }
  });
  if (rendererBundlesIndex) {
    triggers.push("渲染 Bundle 仍包含完整私有索引（sourceLocator 标记）");
  }

  return {
    index: {
      chunks: chunks.length,
      documents: meta?.documents ?? 0,
      terms: Object.keys(inverted).length,
      parseMs,
      indexMemoryDeltaMB: indexMemoryDelta,
    },
    indexFiles: {
      bytes: indexDirBytes,
      mb: Number((indexDirBytes / 1024 / 1024).toFixed(2)),
    },
    bundle: {
      jsBytes: bundleBytes,
      mb: Number((bundleBytes / 1024 / 1024).toFixed(2)),
      fileCount: bundleFiles.length,
    },
    buildMs,
    serverReadyMs,
    retrieval: {
      samples: samples.length,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      maxMs: maxLatency,
      avgContextSize: Math.round(contextTotal / Math.max(1, samples.length)),
      avgCandidates: Number((candidatesTotal / Math.max(1, samples.length)).toFixed(1)),
    },
    migrationTriggers: triggers,
    migrationRequired: triggers.length > 0,
    rendererBundlesIndex,
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const audit = await runAudit();
  console.log(JSON.stringify(audit, null, 2));
  process.exit(0);
}
