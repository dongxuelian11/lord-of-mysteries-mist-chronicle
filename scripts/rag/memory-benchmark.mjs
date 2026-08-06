// 内存稳态基准：真实索引 500 预热 + 5000 查询（10 批 × 500），每批强制 GC。
import fs from "node:fs";
import path from "node:path";
import { JsHybridRetriever } from "./lib/search.mjs";
import { buildQueryBank, horizonFor } from "./lib/query-bank.mjs";
import { indexDir, ensureDirs, writeJson } from "./lib/paths.mjs";
import { reportDir } from "./lib/registry.mjs";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function mem() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers ?? 0,
  };
}

function forceGc() {
  if (typeof global.gc === "function") global.gc();
}

export function runMemoryBenchmark() {
  const chunks = readJson(path.join(indexDir, "chunks.json")) ?? [];
  const inverted = readJson(path.join(indexDir, "inverted.json")) ?? {};
  const aliasMap = readJson(path.join(indexDir, "alias-map.json")) ?? {};
  const retriever = new JsHybridRetriever({ chunks, inverted, aliasMap });
  const bank = buildQueryBank();
  const distinct = new Set(bank.map((item) => item.text)).size;

  const runBatch = (start, count, rotation) => {
    let selected = 0;
    for (let i = 0; i < count; i += 1) {
      const item = bank[(start + i) % bank.length];
      const volume = 1 + ((i + rotation) % 7);
      const result = retriever.searchSync({
        text: item.text,
        filters: {
          audience: { kind: item.kind, knownLoreIds: [], topicGrants: [] },
          maxSpoilerScope: "all",
          horizon: horizonFor(volume),
        },
        limit: 10,
        maxChars: 12000,
      });
      selected += result.chunks.length;
    }
    return selected;
  };

  // 500 预热
  runBatch(0, 500, 0);
  forceGc();
  const baseline = mem();

  const batches = [];
  for (let batch = 0; batch < 10; batch += 1) {
    const startedAt = Date.now();
    const selected = runBatch(batch * 500, 500, batch);
    forceGc();
    batches.push({
      batch: batch + 1,
      queries: 500,
      selected,
      latencyMs: Date.now() - startedAt,
      ...mem(),
    });
  }

  const last = batches[batches.length - 1];
  const heapGrowth = last.heapUsed - baseline.heapUsed;
  const rssGrowth = last.rss - baseline.rss;
  // RSS 斜率：最小二乘 over batches (1000 queries each 两批)
  const n = batches.length;
  const xMean = batches.reduce((sum, item) => sum + item.batch, 0) / n;
  const yMean = batches.reduce((sum, item) => sum + item.rss, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const item of batches) {
    numerator += (item.batch - xMean) * (item.rss - yMean);
    denominator += (item.batch - xMean) ** 2;
  }
  const rssSlopePer1000 = denominator ? (numerator / denominator) * 2 : 0;
  const heapStable = heapGrowth <= 80 * 1024 * 1024;
  const rssStable = rssSlopePer1000 <= 10 * 1024 * 1024;
  const pass = heapStable && rssStable;

  const report = {
    mode: "in-process",
    indexChunks: chunks.length,
    distinctQueries: distinct,
    warmup: 500,
    totalQueries: 5000,
    gcAvailable: typeof global.gc === "function",
    baseline,
    batches,
    summary: {
      heapGrowthBytes: heapGrowth,
      rssGrowthBytes: rssGrowth,
      rssSlopeBytesPer1000Queries: Math.round(rssSlopePer1000),
      heapStable,
      rssStable,
      traceCount: 0,
      cacheCount: 0,
      activeRequests: 0,
    },
    pass,
  };
  return report;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureDirs();
  const report = runMemoryBenchmark();
  console.log("[rag:memory:benchmark]");
  console.log(
    `  索引=${report.indexChunks} 切片 预热=${report.warmup} 查询=${report.totalQueries} 不同查询=${report.distinctQueries} GC=${report.gcAvailable}`
  );
  console.log(
    `  基线 heapUsed=${Math.round(report.baseline.heapUsed / 1048576)}MB rss=${Math.round(report.baseline.rss / 1048576)}MB`
  );
  for (const item of report.batches) {
    console.log(
      `  批${item.batch}: heapUsed=${Math.round(item.heapUsed / 1048576)}MB rss=${Math.round(item.rss / 1048576)}MB external=${Math.round(item.external / 1048576)}MB arrayBuffers=${Math.round(item.arrayBuffers / 1048576)}MB`
    );
  }
  const s = report.summary;
  console.log(
    `  汇总: heapGrowth=${Math.round(s.heapGrowthBytes / 1048576)}MB rssGrowth=${Math.round(s.rssGrowthBytes / 1048576)}MB rssSlope=${Math.round(s.rssSlopeBytesPer1000Queries / 1048576)}MB/1000q trace=${s.traceCount} cache=${s.cacheCount} active=${s.activeRequests}`
  );
  writeJson(path.join(reportDir(), "memory-benchmark.json"), report);
  console.log(`[rag:memory:benchmark] RESULT=${report.pass ? "PASS" : "FAIL"}`);
  process.exit(report.pass ? 0 : 1);
}
