// 卷章级防剧透评测：冻结 spoiler-set + 30 条盲测抽样，校验泄漏硬指标与 Trace 有界性。
import fs from "node:fs";
import path from "node:path";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever } from "./lib/search.mjs";
import { loadChunks } from "./lib/registry.mjs";

const SPOILER_SET = JSON.parse(
  fs.readFileSync(path.join("tests", "fixtures", "rag", "spoiler-set.json"), "utf8")
);
const BLIND = JSON.parse(
  fs.readFileSync(path.join("tests", "fixtures", "rag", "blind-set.json"), "utf8")
);

function horizonViolations(chunk, horizon, kind) {
  const violations = [];
  if (chunk.work && horizon.work && chunk.work !== horizon.work) {
    violations.push("cross-work");
  }
  if (kind !== "world-simulation-internal") {
    if (
      horizon.maxVolume != null &&
      chunk.volumeNumber !== undefined &&
      chunk.volumeNumber > horizon.maxVolume
    ) {
      violations.push("cross-volume");
    }
    if (
      horizon.maxAbsoluteChapter != null &&
      chunk.absoluteChapter !== undefined &&
      chunk.absoluteChapter > horizon.maxAbsoluteChapter
    ) {
      violations.push("future-chapter");
    }
    if (
      Array.isArray(chunk.identityIds) &&
      chunk.identityIds.length &&
      !chunk.identityIds.every((identity) =>
        (horizon.revealedIdentityIds ?? []).includes(identity)
      )
    ) {
      violations.push("identity");
    }
  }
  return violations;
}

function traceShapeValid(trace) {
  if (!trace || !Array.isArray(trace.rejectedCandidates)) return false;
  return trace.rejectedCandidates.every(
    (item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.reason === "string" &&
      !("content" in item) &&
      !("title" in item)
  );
}

export function runSpoilerEval() {
  const chunks = loadChunks();
  const inverted = buildInverted(chunks);
  const retriever = new JsHybridRetriever({ chunks, inverted });
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const leaks = {
    unauthorized: 0,
    futureChapter: 0,
    crossVolume: 0,
    crossWork: 0,
    forbiddenIdentity: 0,
    rejectedTitle: 0,
    traceShapeBad: 0,
  };
  const sampled = [];

  const runCase = (caseItem) => {
    const horizon = caseItem.horizon;
    const result = retriever.searchSync({
      text: caseItem.query,
      filters: {
        audience: { kind: caseItem.kind, knownLoreIds: [], topicGrants: [] },
        maxSpoilerScope: "all",
        horizon,
      },
      limit: 10,
      maxChars: 12000,
    });
    if (!traceShapeValid(result.trace)) leaks.traceShapeBad += 1;
    for (const chunk of result.chunks) {
      const violations = horizonViolations(chunk, horizon, caseItem.kind);
      if (violations.includes("cross-volume")) leaks.crossVolume += 1;
      if (violations.includes("future-chapter")) leaks.futureChapter += 1;
      if (violations.includes("cross-work")) leaks.crossWork += 1;
      if (violations.includes("identity")) leaks.forbiddenIdentity += 1;
      if (
        (caseItem.forbiddenContent ?? []).some((term) =>
          String(chunk.content ?? "").includes(term)
        )
      ) {
        leaks.unauthorized += 1;
      }
      if (
        (caseItem.forbiddenTitles ?? []).some((title) =>
          String(chunk.title ?? "").includes(title)
        )
      ) {
        leaks.rejectedTitle += 1;
      }
      sampled.push({
        id: caseItem.id,
        kind: caseItem.kind,
        horizon: JSON.stringify(horizon),
        returned: `${chunk.work ?? ""}:${chunk.volumeNumber ?? ""}:${chunk.absoluteChapter ?? ""}`,
        title: chunk.title,
      });
    }
    return result;
  };

  for (const caseItem of SPOILER_SET) runCase(caseItem);

  // 30 条冻结盲测抽样：统一第一卷边界，检查实际返回上下文
  const sampledBlind = BLIND.slice(0, 30);
  for (const caseItem of sampledBlind) {
    runCase({
      id: `blind-${caseItem.id}`,
      query: caseItem.query,
      kind: "player-known",
      horizon: {
        work: "LOTM",
        maxVolume: 1,
        maxAbsoluteChapter: 195,
        allowedEventIds: [],
        revealedIdentityIds: [],
        worldlineMode: "canon-aligned",
      },
      forbiddenContent: [],
      forbiddenTitles: [],
    });
  }

  const totalLeaks =
    leaks.unauthorized +
    leaks.futureChapter +
    leaks.crossVolume +
    leaks.crossWork +
    leaks.forbiddenIdentity +
    leaks.rejectedTitle +
    leaks.traceShapeBad;
  const pass = totalLeaks === 0 && sampled.length >= 50;
  return { caseCount: SPOILER_SET.length + sampledBlind.length, sampledContexts: sampled.length, leaks, pass };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = runSpoilerEval();
  console.log("[rag:spoiler:eval]");
  console.log(
    `  用例=${result.caseCount} 实际返回上下文抽查=${result.sampledContexts}`
  );
  console.log(
    `  泄漏: unauthorized=${result.leaks.unauthorized} futureChapter=${result.leaks.futureChapter} crossVolume=${result.leaks.crossVolume} crossWork=${result.leaks.crossWork} identity=${result.leaks.forbiddenIdentity} rejectedTitle=${result.leaks.rejectedTitle} traceShape=${result.leaks.traceShapeBad}`
  );
  console.log(`[rag:spoiler:eval] RESULT=${result.pass ? "PASS" : "FAIL"}`);
  process.exit(result.pass ? 0 : 1);
}
