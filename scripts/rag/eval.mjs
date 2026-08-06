// RAG 评测：固定夹具 + 旧基线对比，输出 Recall/MRR/泄漏/延迟等指标。
import fs from "node:fs";
import path from "node:path";
import { chunkDoc } from "./chunkers/index.mjs";
import { buildInverted } from "./lib/index-builder.mjs";
import { loadRuntimeModule, closeRuntimeServer } from "./lib/load-runtime.mjs";
import { root } from "./lib/paths.mjs";
import { tokenize } from "./lib/text.mjs";
import { deduplicateDocs, docId, normalizeDoc } from "./normalize/index.mjs";
import { parseFile } from "./parsers/index.mjs";

const DEFAULT_FIXTURE = path.join(root, "tests", "fixtures", "rag");

export async function loadFixtureDocs(fixtureDir) {
  const sourcesDir = path.join(fixtureDir, "sources");
  const files = fs.readdirSync(sourcesDir).sort();
  const docs = [];
  for (const file of files) {
    const full = path.join(sourcesDir, file);
    const sourceId = path.basename(file, path.extname(file));
    const parsed = await parseFile(full, {
      repo: "fixtures",
      commit: "test",
      language: "zh-CN",
      canonLayer: "canon",
      sourceGrade: "C",
      type: path.extname(file) === ".md" ? "wiki" : "structured",
      sourceId,
    });
    if (!Array.isArray(parsed) || parsed.some((doc) => doc?.error)) continue;
    parsed.forEach((doc, index) => {
      docs.push(
        normalizeDoc({ ...doc, id: docId(sourceId, doc, index) }, index)
      );
    });
  }
  const unique = deduplicateDocs(docs);
  const chunks = [];
  for (const doc of unique) {
    const sourceId = path.basename(doc.path, path.extname(doc.path));
    for (const chunk of chunkDoc(doc, sourceId)) chunks.push(chunk);
  }
  return chunks;
}

function legacyVisibilityAllowed(chunk, audience) {
  if (audience.kind === "world") return true;
  const known = new Set(audience.knownLoreIds);
  if (chunk.visibility === "public") return true;
  if (known.has(chunk.id) || known.has(chunk.title)) return true;
  if (chunk.visibility === "restricted") {
    return chunk.topics.some((topic) => audience.topicGrants.includes(topic));
  }
  return false;
}

function legacyRetrieve(chunks, query, audience, limit) {
  const tokens = tokenize(query);
  const scored = chunks
    .filter((chunk) => legacyVisibilityAllowed(chunk, audience))
    .map((chunk) => {
      const title = chunk.title.toLowerCase();
      const content = chunk.content.toLowerCase();
      const topics = (chunk.topics ?? []).join(" ").toLowerCase();
      const score = tokens.reduce(
        (sum, token) =>
          sum +
          (title.includes(token) ? 8 : 0) +
          (topics.includes(token) ? 4 : 0) +
          (content.includes(token) ? 1 : 0),
        0
      );
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id)
    )
    .slice(0, limit)
    .map((item) => item.chunk);
  return scored;
}

function titlesOf(chunks) {
  return chunks.map((chunk) => chunk.title);
}

function metricsFor(chunks, context, caseItem) {
  const titles = titlesOf(chunks);
  const top5 = titles.slice(0, 5);
  const top10 = titles.slice(0, 10);
  const expect = caseItem.expectTitles ?? [];
  const hit5 = expect.filter((title) => top5.includes(title)).length;
  const hit10 = expect.filter((title) => top10.includes(title)).length;
  const recall5 = expect.length ? hit5 / expect.length : top5.length === 0 ? 1 : 0;
  const recall10 = expect.length ? hit10 / expect.length : top10.length === 0 ? 1 : 0;
  let mrr = 0;
  for (let i = 0; i < top10.length; i += 1) {
    if (expect.includes(top10[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }
  const sources = new Set(chunks.map((chunk) => chunk.sourceId));
  const expectSources = caseItem.expectSources ?? [];
  const sourceHit = expectSources.length
    ? expectSources.every((source) => sources.has(source))
      ? 1
      : 0
    : 1;
  const lines = context.split("\n").filter(Boolean);
  const citedLines = lines.filter((line) => /^\[[^\]]+\]/.test(line));
  const citationCoverage = lines.length ? citedLines.length / lines.length : 1;
  const seenHash = new Set();
  let duplicatePairs = 0;
  for (const chunk of chunks) {
    if (seenHash.has(chunk.contentHash)) duplicatePairs += 1;
    seenHash.add(chunk.contentHash);
  }
  const duplicateRate = chunks.length ? duplicatePairs / chunks.length : 0;
  const disallowed = caseItem.disallowedTitles ?? [];
  let leaked = 0;
  for (const title of disallowed) {
    if (titles.includes(title)) leaked += 1;
    if (context.includes(title)) leaked += 1;
  }
  const insufficient = caseItem.expectInsufficient
    ? chunks.length === 0
      ? 1
      : 0
    : null;
  return {
    recall5,
    recall10,
    mrr,
    sourceHit,
    citationCoverage,
    duplicateRate,
    leaked,
    selected: chunks.length,
    insufficient,
    titles,
  };
}

export async function runEval({ fixtureDir = DEFAULT_FIXTURE } = {}) {
  const chunks = await loadFixtureDocs(fixtureDir);
  const inverted = buildInverted(chunks);
  const cases = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, "eval-cases.json"), "utf8")
  );
  const { HybridRetriever } = await loadRuntimeModule(
    "app/rag/hybrid-retriever.ts"
  );
  const retriever = new HybridRetriever({ chunks, inverted });
  const results = [];
  let aggregate = {
    recall5: 0,
    recall10: 0,
    mrr: 0,
    sourceHit: 0,
    citationCoverage: 0,
    duplicateRate: 0,
    leakedTotal: 0,
    selectedTotal: 0,
    latencyTotal: 0,
    contextTotal: 0,
  };
  let oldAggregate = { ...aggregate };

  for (const caseItem of cases) {
    const query = {
      text: caseItem.query,
      filters: {
        audience: caseItem.audience,
        maxSpoilerScope: caseItem.filters?.maxSpoilerScope ?? "all",
        week: caseItem.filters?.week,
        allowedVolumes: caseItem.filters?.allowedVolumes,
      },
      limit: caseItem.limit ?? 8,
      maxChars: caseItem.maxChars ?? 4000,
    };
    const result = retriever.searchSync(query);
    const newMetrics = metricsFor(result.chunks, result.context, caseItem);
    const oldChunks = legacyRetrieve(
      chunks,
      caseItem.query,
      caseItem.audience,
      caseItem.limit ?? 8
    );
    const oldContext = oldChunks
      .map(
        (chunk) =>
          `[${chunk.sourceId}·${chunk.sourceGrade}] ${chunk.title}：${chunk.content}`
      )
      .join("\n");
    const oldMetrics = metricsFor(oldChunks, oldContext, caseItem);
    results.push({
      id: caseItem.id,
      query: caseItem.query,
      new: {
        ...newMetrics,
        latencyMs: result.trace.latencyMs,
        contextSize: result.trace.contextSize,
        fallbackMode: result.trace.fallbackMode,
        insufficient: newMetrics.insufficient,
      },
      old: {
        ...oldMetrics,
        contextSize: oldContext.length,
        insufficient: oldMetrics.insufficient,
      },
    });
    const keys = [
      "recall5",
      "recall10",
      "mrr",
      "sourceHit",
      "citationCoverage",
      "duplicateRate",
    ];
    for (const key of keys) {
      aggregate[key] += newMetrics[key];
      oldAggregate[key] += oldMetrics[key];
    }
    aggregate.leakedTotal += newMetrics.leaked;
    aggregate.selectedTotal += newMetrics.selected;
    aggregate.latencyTotal += result.trace.latencyMs;
    aggregate.contextTotal += result.trace.contextSize;
    oldAggregate.leakedTotal += oldMetrics.leaked;
    oldAggregate.selectedTotal += oldMetrics.selected;
    oldAggregate.contextTotal += oldContext.length;
  }

  const count = cases.length;
  const finalize = (value) => ({
    recall5: Number((value.recall5 / count).toFixed(3)),
    recall10: Number((value.recall10 / count).toFixed(3)),
    mrr: Number((value.mrr / count).toFixed(3)),
    sourceHit: Number((value.sourceHit / count).toFixed(3)),
    citationCoverage: Number((value.citationCoverage / count).toFixed(3)),
    duplicateRate: Number((value.duplicateRate / count).toFixed(3)),
    leakageRate: Number(
      (
        value.leakedTotal /
        Math.max(1, value.selectedTotal)
      ).toFixed(3)
    ),
    avgLatencyMs: Number((value.latencyTotal / count).toFixed(1)),
    avgContextSize: Math.round(value.contextTotal / count),
  });
  await closeRuntimeServer();
  return { cases: results, new: finalize(aggregate), old: finalize(oldAggregate), caseCount: count };
}

function printComparison(evalResult) {
  console.log("\n[rag:eval] 逐用例（新检索）：");
  for (const item of evalResult.cases) {
    console.log(
      `  ${item.id}: recall@5=${item.new.recall5} mrr=${item.new.mrr} leaked=${item.new.leaked} selected=${item.new.selected}${item.new.insufficient !== null ? ` insufficient=${item.new.insufficient}` : ""} fallback=${item.new.fallbackMode} titles=${item.new.titles.join("|").slice(0, 120)}`
    );
  }
  console.log("\n[rag:eval] 汇总对比：");
  console.log("  指标            新 RAG V2    旧检索基线");
  const rows = [
    ["Recall@5", "recall5"],
    ["Recall@10", "recall10"],
    ["MRR@10", "mrr"],
    ["Expected-source hit", "sourceHit"],
    ["Citation coverage", "citationCoverage"],
    ["Duplicate rate", "duplicateRate"],
    ["Unauthorized leakage", "leakageRate"],
    ["Avg context size", "avgContextSize"],
    ["Avg latency(ms)", "avgLatencyMs"],
  ];
  for (const [label, key] of rows) {
    console.log(
      `  ${label.padEnd(22)} ${String(evalResult.new[key]).padEnd(14)} ${String(evalResult.old[key])}`
    );
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runEval();
  printComparison(result);
  const pass = result.new.leakageRate === 0;
  console.log(
    `\n[rag:eval] RESULT=${pass ? "PASS" : "FAIL"}（unauthorized leakage=${result.new.leakageRate}，硬性要求=0）`
  );
  process.exit(pass ? 0 : 1);
}
