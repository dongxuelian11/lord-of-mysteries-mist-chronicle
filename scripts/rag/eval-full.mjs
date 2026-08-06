// 完整评测集（100+ 用例）：权限/剧透/冲突/对抗泄漏 + 硬指标 + 误排序分析。
import fs from "node:fs";
import path from "node:path";
import { loadFixtureDocs } from "./eval.mjs";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever, filterChunk } from "./lib/search.mjs";
import { closeRuntimeServer } from "./lib/load-runtime.mjs";
import { root } from "./lib/paths.mjs";

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export async function runEvalFull({ fixtureDir } = {}) {
  const base = fixtureDir ?? path.join(root, "tests", "fixtures", "rag");
  const chunks = await loadFixtureDocs(base);
  const inverted = buildInverted(chunks);
  const retriever = new JsHybridRetriever({ chunks, inverted });
  const cases = JSON.parse(fs.readFileSync(path.join(base, "eval-cases-full.json"), "utf8"));
  const results = [];
  const latencies = [];

  for (const caseItem of cases) {
    const startedAt = Date.now();
    const audience = {
      kind: caseItem.requestScope,
      knownLoreIds: caseItem.knownLoreIds ?? [],
      topicGrants: caseItem.topicGrants ?? [],
    };
    const result = retriever.searchSync({
      text: caseItem.query,
      filters: {
        audience,
        maxSpoilerScope: caseItem.spoilerBoundary ?? "all",
        week: caseItem.week,
        allowedVolumes: caseItem.allowedVolumes,
      },
      limit: 10,
      maxChars: 4000,
    });
    latencies.push(Date.now() - startedAt);
    const titles = result.chunks.map((chunk) => chunk.title);
    const top5 = titles.slice(0, 5);
    const top10 = titles.slice(0, 10);
    const expect = caseItem.expectedTitles ?? [];
    const forbiddenLayers = new Set(caseItem.forbiddenLayers ?? []);
    const disallowed = new Set(caseItem.disallowedTitles ?? []);
    let unauthorized = 0;
    let cosmic = 0;
    let future = 0;
    let forbiddenTitle = 0;
    const leakedTitles = [];
    for (const chunk of result.chunks) {
      const decision = filterChunk(chunk, {
        audience,
        maxSpoilerScope: caseItem.spoilerBoundary ?? "all",
        week: caseItem.week,
        allowedVolumes: caseItem.allowedVolumes,
      }, new Set(audience.knownLoreIds));
      if (!decision.ok) unauthorized += 1;
      const isWorldScope =
        caseItem.requestScope === "world-simulation-internal" ||
        caseItem.requestScope === "world";
      if (chunk.visibility === "cosmic" && !isWorldScope) cosmic += 1;
      if (!decision.ok || forbiddenLayers.has(chunk.canonLayer)) {
        unauthorized += 1;
      }
      if (
        caseItem.week !== undefined &&
        chunk.timeline?.week !== undefined &&
        chunk.timeline.week > caseItem.week
      ) {
        future += 1;
      }
      if (
        caseItem.allowedVolumes?.length &&
        chunk.timeline?.volume !== undefined &&
        !caseItem.allowedVolumes.includes(chunk.timeline.volume)
      ) {
        future += 1;
      }
      if (disallowed.has(chunk.title)) {
        forbiddenTitle += 1;
        leakedTitles.push(chunk.title);
      }
    }
    const noLeak = forbiddenTitle === 0 && unauthorized === 0 && cosmic === 0 && future === 0;
    const recall5 = expect.length
      ? expect.filter((t) => top5.includes(t)).length / expect.length
      : caseItem.expectUnknown
        ? noLeak
          ? 1
          : 0
        : top5.length === 0
          ? 1
          : 0;
    const recall10 = expect.length
      ? expect.filter((t) => top10.includes(t)).length / expect.length
      : caseItem.expectUnknown
        ? noLeak
          ? 1
          : 0
        : top10.length === 0
          ? 1
          : 0;
    let mrr = 0;
    for (let i = 0; i < top10.length; i += 1) {
      if (expect.includes(top10[i])) {
        mrr = 1 / (i + 1);
        break;
      }
    }
    const sources = new Set(result.chunks.map((chunk) => chunk.sourceId));
    const sourceHit = (caseItem.expectedSourceIds ?? []).length
      ? (caseItem.expectedSourceIds ?? []).every((id) => sources.has(id))
        ? 1
        : 0
      : 1;
    const citationCoverage = result.chunks.length
      ? result.chunks.filter(
          (chunk) => chunk.sourceId && chunk.sourceGrade
        ).length / result.chunks.length
      : 1;
    const locatorCoverage = result.chunks.length
      ? result.chunks.filter(
          (chunk) => chunk.sourcePath || chunk.sourceLocator
        ).length / result.chunks.length
      : 1;
    const seenHash = new Set();
    let duplicates = 0;
    for (const chunk of result.chunks) {
      if (seenHash.has(chunk.contentHash)) duplicates += 1;
      seenHash.add(chunk.contentHash);
    }
    const duplicateRate = result.chunks.length ? duplicates / result.chunks.length : 0;
    const minRankViolations = expect
      .map((title) => {
        const rank = top10.indexOf(title) + 1;
        return rank === 0 || rank > (caseItem.minRank ?? 5)
          ? { title, rank }
          : null;
      })
      .filter(Boolean);
    results.push({
      id: caseItem.id ?? caseItem.query,
      category: caseItem.category,
      query: caseItem.query,
      scope: caseItem.requestScope,
      expectedTitles: expect,
      recall5,
      recall10,
      mrr,
      sourceHit,
      citationCoverage,
      locatorCoverage,
      duplicateRate,
      unauthorized,
      cosmic,
      future,
      forbiddenTitle,
      selected: result.chunks.length,
      minRankViolations,
      expectUnknown: caseItem.expectUnknown ?? false,
      selectedTitles: titles,
      leakedTitles,
    });
  }

  const mrrCases = results.filter((item) => item.mrr > 0 || item.selected > 0);
  const agg = {
    recall5: results.reduce((s, r) => s + r.recall5, 0) / results.length,
    recall10: results.reduce((s, r) => s + r.recall10, 0) / results.length,
    mrr: mrrCases.length ? mrrCases.reduce((s, r) => s + r.mrr, 0) / mrrCases.length : 0,
    sourceHit: results.reduce((s, r) => s + r.sourceHit, 0) / results.length,
    citationCoverage: results.reduce((s, r) => s + r.citationCoverage, 0) / results.length,
    duplicateRate: results.reduce((s, r) => s + r.duplicateRate, 0) / results.length,
    unauthorizedTotal: results.reduce((s, r) => s + r.unauthorized, 0),
    cosmicTotal: results.reduce((s, r) => s + r.cosmic, 0),
    futureTotal: results.reduce((s, r) => s + r.future, 0),
    forbiddenTitleTotal: results.reduce((s, r) => s + r.forbiddenTitle, 0),
    selectedTotal: results.reduce((s, r) => s + r.selected, 0),
    p50Ms: percentile(latencies.sort((a, b) => a - b), 50),
    p95Ms: percentile(latencies.sort((a, b) => a - b), 95),
    avgContextSize: Math.round(
      results.reduce((s, r) => s + r.selected * 120, 0) / Math.max(1, results.length)
    ),
  };
  agg.leakageRate = agg.selectedTotal ? agg.unauthorizedTotal / agg.selectedTotal : 0;

  const categorySummary = {};
  for (const item of results) {
    categorySummary[item.category] = categorySummary[item.category] ?? { count: 0, recall10: 0, mrrSum: 0, mrrCount: 0, leaks: 0 };
    const entry = categorySummary[item.category];
    entry.count += 1;
    entry.recall10 += item.recall10;
    entry.mrrSum += item.mrr;
    if (item.mrr > 0 || item.selected > 0) entry.mrrCount += 1;
    entry.leaks += item.unauthorized + item.cosmic + item.future + item.forbiddenTitle;
  }

  if (process.env.RAG_EVAL_DEBUG === "1") {
    for (const item of results) {
      if (item.unauthorized || item.cosmic || item.future || item.forbiddenTitle) {
        console.log(
          `[debug] ${item.id} leaks(u=${item.unauthorized},c=${item.cosmic},f=${item.future},t=${item.forbiddenTitle}) titles=${item.selectedTitles.join("|").slice(0, 160)} leakedTitles=${item.leakedTitles.join("|")}`
        );
      }
    }
    for (const item of results) {
      if (
        (item.expectedTitles?.length ?? 0) > 0 &&
        item.recall10 < 1
      ) {
        console.log(
          `[debug-recall] ${item.id} recall10=${item.recall10} expect=${JSON.stringify(item.expectedTitles)} selected=${item.selectedTitles.join("|").slice(0, 160)}`
        );
      }
    }
  }

  const misrankings = results
    .filter((item) => item.minRankViolations.length)
    .sort((a, b) => a.mrr - b.mrr)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      mrr: item.mrr,
      violations: item.minRankViolations,
      competitors: item.selectedTitles.slice(0, 6),
    }));

  const pass =
    agg.leakageRate === 0 &&
    agg.cosmicTotal === 0 &&
    agg.futureTotal === 0 &&
    agg.forbiddenTitleTotal === 0 &&
    agg.citationCoverage >= 0.9 &&
    agg.duplicateRate <= 0.03 &&
    agg.recall10 >= 0.9;
  await closeRuntimeServer();
  return { cases: results, aggregate: agg, categorySummary, misrankings, pass, mrrTargetMet: agg.mrr >= 0.65 };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runEvalFull();
  console.log(`[rag:eval:full] 用例数=${result.cases.length}`);
  console.log(
    `[rag:eval:full] Recall@5=${result.aggregate.recall5.toFixed(3)} Recall@10=${result.aggregate.recall10.toFixed(3)} MRR@10=${result.aggregate.mrr.toFixed(3)}`
  );
  console.log(
    `[rag:eval:full] sourceHit=${result.aggregate.sourceHit.toFixed(3)} citation=${result.aggregate.citationCoverage.toFixed(3)} dup=${result.aggregate.duplicateRate.toFixed(3)}`
  );
  console.log(
    `[rag:eval:full] leakageRate=${result.aggregate.leakageRate} cosmic=${result.aggregate.cosmicTotal} future=${result.aggregate.futureTotal} forbiddenTitle=${result.aggregate.forbiddenTitleTotal}`
  );
  console.log(`[rag:eval:full] P50=${result.aggregate.p50Ms}ms P95=${result.aggregate.p95Ms}ms`);
  console.log("[rag:eval:full] 分类汇总：");
  for (const [category, entry] of Object.entries(result.categorySummary)) {
    console.log(
      `  ${category}: n=${entry.count} recall10=${(entry.recall10 / entry.count).toFixed(3)} mrr=${(entry.mrrSum / Math.max(1, entry.mrrCount)).toFixed(3)} leaks=${entry.leaks}`
    );
  }
  if (!result.mrrTargetMet) {
    console.log(`[rag:eval:full] MRR=${result.aggregate.mrr.toFixed(3)} 未达 0.65 目标，前三类误排序：`);
    for (const item of result.misrankings) {
      console.log(
        `  ${item.id} (mrr=${item.mrr.toFixed(3)}): ${item.violations.map((v) => `${v.title}@rank${v.rank}`).join(", ")} 竞争片段=${item.competitors.join("|").slice(0, 120)}`
      );
    }
  }
  console.log(`[rag:eval:full] RESULT=${result.pass ? "PASS" : "FAIL"} mrrTarget=${result.mrrTargetMet ? "MET" : "NOT_MET"}`);
  process.exit(result.pass ? 0 : 1);
}
