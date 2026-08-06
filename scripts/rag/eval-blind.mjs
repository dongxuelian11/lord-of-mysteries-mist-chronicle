// 独立盲测：150 条自然玩家式查询 + 8 种范围/层级配置的指标矩阵。
import fs from "node:fs";
import path from "node:path";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever } from "./lib/search.mjs";
import { DOMAIN_ENTITIES } from "./lib/domain-aliases.mjs";
import { loadChunks } from "./lib/registry.mjs";
import { reportDir } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";

const BLIND_FILE = path.join("tests", "fixtures", "rag", "blind-set.json");

function entityNames(entity) {
  const entry = DOMAIN_ENTITIES.find((item) => item.canonical === entity);
  return [entity, ...(entry?.aliases ?? []), ...(entry?.englishNames ?? [])];
}

function chunkMentionsEntity(chunk, entity) {
  const names = entityNames(entity).map((name) => name.toLowerCase());
  const text = `${chunk.title ?? ""} ${chunk.content ?? ""}`.toLowerCase();
  return names.some((name) => name.length > 1 && text.includes(name));
}

function percentile(sorted, p) {
  const values = [...sorted].sort((a, b) => a - b);
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.floor((p / 100) * values.length))];
}

const AUTHORITATIVE = ["canon-primary", "canon", "official-reference", "canon-adaptation"];

function metricsFor(results, latencies) {
  const withExpectation = results.filter(
    (item) => item.required.length > 0 && !item.expectUnknown
  );
  const unknownCases = results.filter((item) => item.expectUnknown);
  const selectedTotal = results.reduce((sum, item) => sum + item.selected, 0);
  const aggregate = {
    recall5:
      withExpectation.length
        ? withExpectation.reduce((sum, item) => sum + item.recall5, 0) / withExpectation.length
        : 0,
    recall10:
      withExpectation.length
        ? withExpectation.reduce((sum, item) => sum + item.recall10, 0) / withExpectation.length
        : 0,
    mrr:
      withExpectation.length
        ? withExpectation.reduce((sum, item) => sum + item.mrr, 0) / withExpectation.length
        : 0,
    ndcg:
      withExpectation.length
        ? withExpectation.reduce((sum, item) => sum + item.ndcg, 0) / withExpectation.length
        : 0,
    citationCoverage:
      results.reduce((sum, item) => sum + item.citation, 0) / Math.max(1, results.length),
    duplicateRate:
      results.reduce((sum, item) => sum + item.duplicate, 0) / Math.max(1, results.length),
    sourceDiversity:
      results.reduce((sum, item) => sum + item.sourceDiversity, 0) / Math.max(1, results.length),
    canonPrecision:
      selectedTotal > 0
        ? results.reduce((sum, item) => sum + item.canonCount, 0) / selectedTotal
        : 1,
    conflictDetectionRate:
      results.reduce((sum, item) => sum + item.conflictDetected, 0) /
      Math.max(1, results.filter((item) => item.conflictCandidate).length),
    unknownAccuracy:
      unknownCases.length
        ? unknownCases.reduce((sum, item) => sum + item.unknownOk, 0) / unknownCases.length
        : 1,
    unauthorizedLeakage:
      selectedTotal > 0
        ? results.reduce((sum, item) => sum + item.forbiddenLeak, 0) / selectedTotal
        : 0,
    cosmicLeakage: results.reduce((sum, item) => sum + item.cosmicLeak, 0),
    futureLeakage: results.reduce((sum, item) => sum + item.futureLeak, 0),
    identityLeakage: results.reduce((sum, item) => sum + item.identityLeak, 0),
    avgContextSize: Math.round(
      results.reduce((sum, item) => sum + item.contextSize, 0) / Math.max(1, results.length)
    ),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
  };
  return aggregate;
}

function runCases(retriever, cases, scopeConfig) {
  const results = [];
  const latencies = [];
  for (const caseItem of cases) {
    const scope = scopeConfig.scope ?? caseItem.requestScope;
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
        // 冻结盲测衡量检索质量：不做卷章剧透过滤（剧透门由 rag:spoiler:eval 覆盖）
        maxSpoilerScope: "all",
        week: caseItem.week ?? 10,
        allowedVolumes: undefined,
        ...(scopeConfig.layers ? { canonLayers: scopeConfig.layers } : {}),
      },
      limit: 10,
      maxChars: 12000,
    });
    latencies.push(Date.now() - startedAt);
    const required = caseItem.requiredEntities ?? [];
    const hits = [];
    for (const chunk of result.chunks) {
      if (required.some((entity) => chunkMentionsEntity(chunk, entity))) {
        hits.push(chunk);
      }
    }
    const top5 = result.chunks.slice(0, 5);
    const top10 = result.chunks.slice(0, 10);
    const entitiesMatchedTop5 = required.filter((entity) =>
      top5.some((chunk) => chunkMentionsEntity(chunk, entity))
    ).length;
    const entitiesMatchedTop10 = required.filter((entity) =>
      top10.some((chunk) => chunkMentionsEntity(chunk, entity))
    ).length;
    const recall5 = required.length ? entitiesMatchedTop5 / required.length : 0;
    const recall10 = required.length ? entitiesMatchedTop10 / required.length : 0;
    let mrr = 0;
    for (let i = 0; i < result.chunks.length; i += 1) {
      if (required.some((entity) => chunkMentionsEntity(result.chunks[i], entity))) {
        mrr = 1 / (i + 1);
        break;
      }
    }
    let dcg = 0;
    let matchedCount = 0;
    for (let i = 0; i < result.chunks.length; i += 1) {
      const relevant = required.some((entity) => chunkMentionsEntity(result.chunks[i], entity));
      if (!relevant) continue;
      if (matchedCount >= required.length) break;
      matchedCount += 1;
      const rel = 1;
      dcg += rel / Math.log2(i + 2);
    }
    const idealDcg = required.length
      ? Array.from({ length: Math.min(required.length, matchedCount) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0)
      : 0;
    const ndcg = idealDcg > 0 ? dcg / idealDcg : result.chunks.length === 0 ? 1 : 0;
    const forbidden = caseItem.forbiddenEvidence ?? [];
    let forbiddenLeak = 0;
    let cosmicLeak = 0;
    let futureLeak = 0;
    let identityLeak = 0;
    let canonCount = 0;
    const sources = new Set();
    const seenHash = new Set();
    let duplicate = 0;
    let conflictDetected = 0;
    const buckets = new Set();
    for (const chunk of result.chunks) {
      if (seenHash.has(chunk.contentHash)) duplicate += 1;
      seenHash.add(chunk.contentHash);
      sources.add(chunk.sourceId);
      if (AUTHORITATIVE.includes(chunk.canonLayer)) canonCount += 1;
      const title = chunk.title ?? "";
      const strictForbidden =
        caseItem.expectUnknown === true || caseItem.spoilerBoundary === "none";
      const isIdentityTitle = /真实身份/.test(title);
      const isWorldScope =
        scope === "world-simulation-internal" || scope === "world";
      const leakScope = !isWorldScope;
      if (
        leakScope &&
        (isIdentityTitle || (strictForbidden && caseItem.spoilerBoundary === "none")) &&
        forbidden.some((entity) =>
          entityNames(entity).some((name) =>
            title.toLowerCase().includes(name.toLowerCase())
          )
        )
      ) {
        forbiddenLeak += 1;
      }
      if (chunk.visibility === "cosmic" && !isWorldScope) cosmicLeak += 1;
      if (caseItem.week !== undefined && chunk.timeline?.week !== undefined && chunk.timeline.week > caseItem.week) futureLeak += 1;
      if (
        leakScope &&
        caseItem.category === "spoil-attack" &&
        (isIdentityTitle ||
          (strictForbidden && caseItem.spoilerBoundary === "none")) &&
        (title.includes("格尔曼") || title.includes("帕列斯") || /Gehrman|Pallez/i.test(title)) &&
        !(caseItem.actorKnowledge ?? []).some((entity) => entity === "格尔曼·斯帕罗" || entity === "帕列斯·索罗亚斯德")
      ) {
        identityLeak += 1;
      }
      const bucket =
        chunk.canonLayer === "canon-primary" || chunk.canonLayer === "canon"
          ? 0
          : chunk.canonLayer === "community-reference" || chunk.canonLayer === "community"
            ? 1
            : chunk.canonLayer === "fan-derived" || chunk.canonLayer === "game-original"
              ? 2
              : 3;
      buckets.add(bucket);
    }
    conflictDetected = buckets.size > 1 && required.length >= 2 ? 1 : 0;
    const citation = result.chunks.length
      ? result.chunks.filter(
          (chunk) => chunk.sourceId && chunk.sourceGrade && (chunk.sourcePath || chunk.sourceLocator)
        ).length / result.chunks.length
      : 1;
    results.push({
      id: caseItem.id,
      category: caseItem.category,
      scope,
      required,
      expectUnknown: caseItem.expectUnknown ?? false,
      recall5,
      recall10,
      mrr,
      ndcg,
      citation,
      duplicate: result.chunks.length ? duplicate / result.chunks.length : 0,
      sourceDiversity: result.chunks.length ? sources.size / result.chunks.length : 1,
      canonCount,
      selected: result.chunks.length,
      conflictDetected,
      conflictCandidate: required.length >= 2 ? 1 : 0,
      unknownOk:
        caseItem.expectUnknown
          ? result.chunks.length === 0 || forbiddenLeak === 0
            ? 1
            : 0
          : null,
      forbiddenLeak,
      cosmicLeak,
      futureLeak,
      identityLeak,
      contextSize: result.trace.contextSize,
      selectedTitles: result.chunks.slice(0, 6).map((chunk) => chunk.title),
    });
  }
  if (process.env.RAG_BLIND_DEBUG === "1") {
    for (const item of results) {
      if (item.required.length && !item.expectUnknown && item.recall10 < 1) {
        console.log(
          `[blind-debug] ${item.id} recall10=${item.recall10} query=${JSON.stringify(cases.find((c) => c.id === item.id)?.query)} titles=${item.selectedTitles.join("|").slice(0, 200)}`
        );
      }
    }
  }
  return { results, latencies, aggregate: metricsFor(results, latencies) };
}

export function runBlindEval() {
  const cases = JSON.parse(fs.readFileSync(BLIND_FILE, "utf8"));
  const chunks = loadChunks();
  const inverted = buildInverted(chunks);
  const retriever = new JsHybridRetriever({ chunks, inverted });
  const defaultResult = runCases(retriever, cases, {});
  const scopes = [
    { id: "canon-only", layers: ["canon-primary", "canon"] },
    { id: "canon+official", layers: ["canon-primary", "canon", "official-reference", "canon-adaptation"] },
    { id: "canon+community", layers: ["canon-primary", "canon", "official-reference", "canon-adaptation", "community-reference", "community"] },
    { id: "all-layers", layers: undefined },
    { id: "player-known", scope: "player-known" },
    { id: "actor-private", scope: "actor-private" },
    { id: "player-facing-narrator", scope: "player-facing-narrator" },
    { id: "world-simulation-internal", scope: "world-simulation-internal" },
  ];
  const scopeResults = {};
  for (const config of scopes) {
    const run = runCases(retriever, cases, config);
    scopeResults[config.id] = run.aggregate;
  }
  ensureDirs();
  writeJson(path.join(reportDir(), "blind-eval.json"), {
    caseCount: cases.length,
    default: defaultResult.aggregate,
    scopes: scopeResults,
  });
  return { caseCount: cases.length, default: defaultResult.aggregate, scopes: scopeResults };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = runBlindEval();
  console.log(`[rag:eval:blind] 盲测查询=${result.caseCount}`);
  const printAgg = (label, agg) => {
    console.log(
      `  ${label}: R@5=${agg.recall5.toFixed(3)} R@10=${agg.recall10.toFixed(3)} MRR=${agg.mrr.toFixed(3)} nDCG=${agg.ndcg.toFixed(3)} citation=${agg.citationCoverage.toFixed(3)} dup=${agg.duplicateRate.toFixed(3)} canonP=${agg.canonPrecision.toFixed(3)} conflict=${agg.conflictDetectionRate.toFixed(3)} unknownAcc=${agg.unknownAccuracy.toFixed(3)} leak=${agg.unauthorizedLeakage} cosmic=${agg.cosmicLeakage} future=${agg.futureLeakage} identity=${agg.identityLeakage} ctx=${agg.avgContextSize} P50/P95=${agg.p50Ms}/${agg.p95Ms}ms`
    );
  };
  printAgg("默认(player-known)", result.default);
  for (const [id, agg] of Object.entries(result.scopes)) {
    printAgg(id, agg);
  }
  const gatesOk =
    result.default.unauthorizedLeakage === 0 &&
    result.default.cosmicLeakage === 0 &&
    result.default.futureLeakage === 0 &&
    result.default.identityLeakage === 0 &&
    result.default.citationCoverage >= 0.95 &&
    result.default.duplicateRate <= 0.03 &&
    result.default.recall10 >= 0.9 &&
    result.scopes["canon-only"].canonPrecision >= 0.9;
  console.log(`[rag:eval:blind] RESULT=${gatesOk ? "PASS" : "FAIL"}`);
  process.exit(gatesOk ? 0 : 1);
}
