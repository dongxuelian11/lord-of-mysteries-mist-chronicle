// RAG 规模压测：1k / 5k / 10k 合成语料 + 当前完整真实语料。
// 测量：索引文件大小、构建时间、加载时间、P50/P95/P99、最大延迟、
// 候选/上下文、内存、连续 1000 次查询后的内存变化。
import path from "node:path";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever } from "./lib/search.mjs";
import { sha1, stableId } from "./lib/text.mjs";
import { indexDir, readJson } from "./lib/paths.mjs";

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function syntheticChunks(count, seed = 42) {
  const rand = seeded(seed);
  const subjects = ["占卜", "灰雾", "塔罗", "封印", "教团", "蒸汽", "河流", "钟楼", "码头", "议会", "仪式", "魔药", "序列", "日记", "剧院", "档案馆", "俱乐部", "医院", "孤儿院", "银行"];
  const verbs = ["调查", "追踪", "封印", "解读", "隐藏", "交换", "晋升", "记录", "观察", "收容"];
  const chunks = [];
  for (let i = 0; i < count; i += 1) {
    const subject = subjects[i % subjects.length];
    const verb = verbs[i % verbs.length];
    const paragraphs = [];
    const paragraphCount = 1 + Math.floor(rand() * 3);
    for (let p = 0; p < paragraphCount; p += 1) {
      paragraphs.push(
        `第${i + 1}号档案记录：${subject}相关的${verb}行动发生在贝克兰德第${(i % 9) + 1}区。` +
          `行动者按规程只记录公开信息，不接触未知对象；现场遗留的${subject}痕迹被编号归档。` +
          `本周报告强调事实与推断分离，任何未经核验的说法都标注为不确定项。`
      );
    }
    const content = paragraphs.join("\n\n");
    chunks.push({
      id: stableId(`bench-${count}`, `${subject}|${i}`, i),
      documentId: `doc-${count}-${i % 200}`,
      title: `${subject}第${i + 1}号档案`,
      content,
      summary: undefined,
      sourceId: `bench-${count}`,
      sourceType: "reference",
      sourceRepo: "synthetic",
      sourceCommit: "benchmark",
      sourcePath: `bench/${count}/${i}.txt`,
      sourceLocator: `#${i}`,
      language: "zh-CN",
      canonLayer: "game-original",
      sourceGrade: "C",
      visibility: "public",
      spoilerScope: "volume1",
      timeline: { volume: 1, week: 1 + (i % 52) },
      topics: [subject],
      entities: [],
      aliases: [subject],
      relations: [],
      previousChunkId: i > 0 ? undefined : undefined,
      nextChunkId: undefined,
      contentHash: sha1(`${count}|${i}|${content}`),
      updatedAt: "2026-08-06T00:00:00.000Z",
    });
  }
  for (let i = 0; i < chunks.length; i += 1) {
    if (i > 0) chunks[i].previousChunkId = chunks[i - 1].id;
    if (i < chunks.length - 1) chunks[i].nextChunkId = chunks[i + 1].id;
  }
  return chunks;
}

function measure(chunks, label) {
  const before = process.memoryUsage().heapUsed;
  const buildStart = Date.now();
  const inverted = buildInverted(chunks);
  const buildMs = Date.now() - buildStart;
  const indexBytes = Buffer.byteLength(JSON.stringify(inverted));
  const loadStart = Date.now();
  const retriever = new JsHybridRetriever({ chunks, inverted });
  const loadMs = Date.now() - loadStart;
  const after = process.memoryUsage().heapUsed;
  const samples = [];
  let candidatesTotal = 0;
  let contextTotal = 0;
  const queryCount = Math.min(2000, Math.max(200, chunks.length));
  for (let i = 0; i < queryCount; i += 1) {
    const chunk = chunks[i % chunks.length];
    const query = `${chunk.aliases?.[0] ?? chunk.title} ${chunk.topics?.[0] ?? ""}`;
    const startedAt = Date.now();
    const result = retriever.searchSync({
      text: query,
      filters: {
        audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
        maxSpoilerScope: "volume1",
        week: 52,
      },
      limit: 8,
      maxChars: 4000,
    });
    samples.push(Date.now() - startedAt);
    candidatesTotal += result.trace.lexicalCandidates;
    contextTotal += result.trace.contextSize;
  }
  samples.sort((a, b) => a - b);
  const memoryBeforeQuery = process.memoryUsage().heapUsed;
  for (let i = 0; i < 1000; i += 1) {
    const chunk = chunks[i % chunks.length];
    retriever.searchSync({
      text: `${chunk.title} 调查`,
      filters: {
        audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
        maxSpoilerScope: "volume1",
        week: 52,
      },
      limit: 8,
      maxChars: 4000,
    });
  }
  const memoryAfterQuery = process.memoryUsage().heapUsed;
  return {
    label,
    chunks: chunks.length,
    indexBytes,
    indexMB: Number((indexBytes / 1024 / 1024).toFixed(2)),
    buildMs,
    loadMs,
    memoryDeltaMB: Number(((after - before) / 1024 / 1024).toFixed(1)),
    query1000MemoryDeltaMB: Number(((memoryAfterQuery - memoryBeforeQuery) / 1024 / 1024).toFixed(1)),
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    p99Ms: percentile(samples, 99),
    maxMs: samples[samples.length - 1] ?? 0,
    avgCandidates: Number((candidatesTotal / Math.max(1, samples.length)).toFixed(1)),
    avgContextSize: Math.round(contextTotal / Math.max(1, samples.length)),
  };
}

export function runBenchmark() {
  const rows = [];
  for (const count of [1000, 5000, 10000]) {
    rows.push(measure(syntheticChunks(count), `${count.toLocaleString()} 合成切片`));
  }
  const realChunks = readJson(path.join(indexDir, "chunks.json")) ?? [];
  if (realChunks.length) {
    rows.push(measure(realChunks, `真实语料（${realChunks.length} 切片）`));
  } else {
    rows.push({ label: "真实语料", chunks: 0, note: "未构建索引" });
  }
  return rows;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const rows = runBenchmark();
  console.log("[rag:benchmark]");
  console.log(
    "规模 | 索引MB | 构建ms | 加载ms | 内存MB | P50/P95/P99/max(ms) | 候选 | 上下文 | 1000次查询内存MB"
  );
  for (const row of rows) {
    if (row.note) {
      console.log(`${row.label}: ${row.note}`);
      continue;
    }
    console.log(
      `${row.label}: ${row.indexMB} | ${row.buildMs} | ${row.loadMs} | ${row.memoryDeltaMB} | ${row.p50Ms}/${row.p95Ms}/${row.p99Ms}/${row.maxMs} | ${row.avgCandidates} | ${row.avgContextSize} | ${row.query1000MemoryDeltaMB}`
    );
  }
  process.exit(0);
}
