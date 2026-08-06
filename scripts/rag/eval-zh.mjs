// 中文正文检索评测：英文旧索引 / 中文索引 / 中英混合 + 中文命中率、英文回退率、中英重复占位率。
import fs from "node:fs";
import path from "node:path";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever } from "./lib/search.mjs";
import { loadChunks } from "./lib/registry.mjs";
import { readJson } from "./lib/paths.mjs";
import { DOMAIN_ENTITIES } from "./lib/domain-aliases.mjs";

function entityNames(entity) {
  const entry = DOMAIN_ENTITIES.find((item) => item.canonical === entity);
  return [entity, ...(entry?.aliases ?? []), ...(entry?.englishNames ?? [])];
}

function chunkMatchesEntity(chunk, entity) {
  const names = entityNames(entity).map((name) => name.toLowerCase());
  const text = `${chunk.title ?? ""} ${chunk.content ?? ""}`.toLowerCase();
  return names.some((name) => name.length > 1 && text.includes(name));
}

const BLIND = JSON.parse(
  fs.readFileSync(path.join("tests", "fixtures", "rag", "blind-set.json"), "utf8")
);
const ALIGNMENTS = readJson("private/rag/index/chapter-alignments.json")?.alignments ?? [];
const alignByZhDoc = new Map();
for (const item of ALIGNMENTS) {
  if (item.zhDocumentId) alignByZhDoc.set(item.zhDocumentId, item.enDocumentId);
}
const enToZh = new Map();
for (const [zhDoc, enDoc] of alignByZhDoc) {
  if (enDoc) enToZh.set(enDoc, zhDoc);
}

function retrieverFor(chunks) {
  const inverted = buildInverted(chunks);
  return new JsHybridRetriever({ chunks, inverted });
}

function runConfig(retriever, cases, options = {}) {
  const results = [];
  const latencies = [];
  for (const caseItem of cases) {
    const scope = options.scope ?? caseItem.requestScope;
    const audience = {
      kind: scope,
      knownLoreIds: caseItem.actorKnowledge ?? [],
      topicGrants: caseItem.topicGrants ?? [],
    };
    const startedAt = Date.now();
    const result = retriever.searchSync({
      text: caseItem.query,
      filters: {
        audience,
        // 与冻结盲测一致：检索质量口径，剧透门由 rag:spoiler:eval 覆盖
        maxSpoilerScope: "all",
        week: caseItem.week ?? 10,
        allowedVolumes: undefined,
        includeFanDerived: options.fan ? true : undefined,
        sources: options.sources,
      },
      limit: 10,
      maxChars: 12000,
    });
    latencies.push(Date.now() - startedAt);
    const zhChunks = result.chunks.filter((chunk) => chunk.sourceId === "zh-lotm-txt");
    const enChunks = result.chunks.filter((chunk) => chunk.sourceId === "lotm-reader");
    let dupOccupancy = 0;
    const zhDocIds = new Set(zhChunks.map((chunk) => chunk.documentId));
    for (const chunk of enChunks) {
      if (zhDocIds.has(enToZh.get(chunk.documentId))) dupOccupancy += 1;
    }
    const required = caseItem.requiredEntities ?? [];
    const top5 = result.chunks.slice(0, 5);
    const top10 = result.chunks.slice(0, 10);
    const recall5 = required.length
      ? required.filter((entity) => top5.some((chunk) => chunkMatchesEntity(chunk, entity))).length /
        required.length
      : 0;
    const recall10 = required.length
      ? required.filter((entity) => top10.some((chunk) => chunkMatchesEntity(chunk, entity))).length /
        required.length
      : 0;
    let mrr = 0;
    for (let i = 0; i < top10.length; i += 1) {
      if (required.some((entity) => chunkMatchesEntity(top10[i], entity))) {
        mrr = 1 / (i + 1);
        break;
      }
    }
    const canonCount = result.chunks.filter((chunk) =>
      ["canon-primary", "canon", "official-reference", "canon-adaptation"].includes(chunk.canonLayer)
    ).length;
    const forbidden = caseItem.forbiddenEvidence ?? [];
    const strictForbidden =
      caseItem.expectUnknown === true || caseItem.spoilerBoundary === "none";
    const forbiddenLeak = result.chunks.filter((chunk) => {
      const title = chunk.title ?? "";
      const isIdentityTitle = /真实身份|秘密/.test(title);
      if (!(isIdentityTitle || (strictForbidden && caseItem.spoilerBoundary === "none"))) {
        return false;
      }
      return forbidden.some((entity) => title.includes(entity));
    }).length;
    const futureLeak = result.chunks.filter(
      (chunk) =>
        caseItem.week !== undefined &&
        chunk.timeline?.week !== undefined &&
        chunk.timeline.week > caseItem.week
    ).length;
    results.push({
      requiredCount: required.length,
      expectUnknown: caseItem.expectUnknown ?? false,
      recall5,
      recall10,
      mrr,
      selected: result.chunks.length,
      zhCount: zhChunks.length,
      enCount: enChunks.length,
      zhHit: zhChunks.length > 0 ? 1 : 0,
      enFallback: zhChunks.length === 0 && enChunks.length > 0 ? 1 : 0,
      dupOccupancy: result.chunks.length ? dupOccupancy / result.chunks.length : 0,
      canonPrecision: result.chunks.length ? canonCount / result.chunks.length : 1,
      forbiddenLeak,
      futureLeak,
      unknownOk:
        caseItem.expectUnknown
          ? result.chunks.length === 0 || forbiddenLeak === 0
            ? 1
            : 0
          : null,
    });
  }
  const n = results.length;
  const expected = results.filter(
    (item) => item.requiredCount > 0 && item.expectUnknown !== true
  );
  const agg = {
    expectedCount: expected.length,
    recall5: expected.length
      ? expected.reduce((sum, item) => sum + item.recall5, 0) / expected.length
      : 0,
    recall10: expected.length
      ? expected.reduce((sum, item) => sum + item.recall10, 0) / expected.length
      : 0,
    mrr: expected.length
      ? expected.reduce((sum, item) => sum + item.mrr, 0) / expected.length
      : 0,
    zhHitRate: results.reduce((sum, item) => sum + item.zhHit, 0) / n,
    enFallbackRate: results.reduce((sum, item) => sum + item.enFallback, 0) / n,
    dupOccupancy: results.reduce((sum, item) => sum + item.dupOccupancy, 0) / n,
    canonPrecision: results.reduce((sum, item) => sum + item.canonPrecision, 0) / n,
    zhShare: results.reduce((sum, item) => sum + item.zhCount, 0) / Math.max(1, results.reduce((sum, item) => sum + item.selected, 0)),
    enShare: results.reduce((sum, item) => sum + item.enCount, 0) / Math.max(1, results.reduce((sum, item) => sum + item.selected, 0)),
    unknownAccuracy:
      results.filter((item) => item.unknownOk !== null).reduce((sum, item) => sum + item.unknownOk, 0) /
      Math.max(1, results.filter((item) => item.unknownOk !== null).length),
    forbiddenLeak: results.reduce((sum, item) => sum + item.forbiddenLeak, 0),
    futureLeak: results.reduce((sum, item) => sum + item.futureLeak, 0),
    p50Ms: latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)] ?? 0,
    p95Ms: latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] ?? 0,
  };
  return agg;
}

export function runEvalZh() {
  const chunks = loadChunks();
  const zhChunks = chunks.filter((chunk) => chunk.sourceId === "zh-lotm-txt");
  const enChunks = chunks.filter((chunk) => chunk.sourceId === "lotm-reader");
  const mixedRetriever = retrieverFor(chunks);
  const configs = {
    "en-old": { retriever: mixedRetriever, scope: "player-known", sources: ["lotm-reader"] },
    "zh-only": { retriever: mixedRetriever, scope: "player-known", sources: ["zh-lotm-txt"] },
    "mixed": { retriever: mixedRetriever, scope: "player-known" },
    "canon-only": { retriever: mixedRetriever, scope: "player-known" },
    "player-known": { retriever: mixedRetriever, scope: "player-known" },
    "player-facing-narrator": { retriever: mixedRetriever, scope: "player-facing-narrator" },
    "actor-private": { retriever: mixedRetriever, scope: "actor-private" },
    "fan-enabled": { retriever: mixedRetriever, scope: "player-known", fan: true },
  };
  const results = {};
  for (const [id, config] of Object.entries(configs)) {
    results[id] = runConfig(config.retriever, BLIND, {
      scope: config.scope,
      fan: config.fan,
      sources: config.sources,
    });
  }
  return { caseCount: BLIND.length, zhChunks: zhChunks.length, enChunks: enChunks.length, results };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = runEvalZh();
  const expectedCount = result.results.mixed.expectedCount ?? 0;
  console.log(`[rag:eval:zh] 盲测=${result.caseCount} 预期=${expectedCount} 中文章节切片=${result.zhChunks} 英文章节切片=${result.enChunks}`);
  for (const [id, agg] of Object.entries(result.results)) {
    console.log(
      `  ${id}: R@5=${agg.recall5.toFixed(3)} R@10=${agg.recall10.toFixed(3)} MRR=${agg.mrr.toFixed(3)} canonP=${agg.canonPrecision.toFixed(3)} zhHit=${agg.zhHitRate.toFixed(3)} enFallback=${agg.enFallbackRate.toFixed(3)} dupOccupancy=${agg.dupOccupancy.toFixed(3)} zhShare=${agg.zhShare.toFixed(3)} enShare=${agg.enShare.toFixed(3)} unknownAcc=${agg.unknownAccuracy.toFixed(3)} leak=${agg.forbiddenLeak} future=${agg.futureLeak} P50/P95=${agg.p50Ms}/${agg.p95Ms}ms`
    );
  }
  const mixed = result.results.mixed;
  const pass =
    mixed.recall10 >= 0.9 &&
    mixed.canonPrecision >= 0.9 &&
    mixed.forbiddenLeak === 0 &&
    mixed.futureLeak === 0 &&
    mixed.dupOccupancy <= 0.1;
  console.log(`[rag:eval:zh] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
