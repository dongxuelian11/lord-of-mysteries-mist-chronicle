// 真实语料质量审计：乱码/空切片/重复/无标题/无定位/超长过短/跨章拼接/噪声/层级缺失 + 分层抽样。
import { loadChunks, reportDir } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";
import path from "node:path";

function sample(chunks, count, seed) {
  let value = seed >>> 0;
  const rand = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const picked = [];
  const used = new Set();
  while (picked.length < count && picked.length < chunks.length) {
    const index = Math.floor(rand() * chunks.length);
    if (!used.has(index)) {
      used.add(index);
      picked.push(chunks[index]);
    }
  }
  return picked;
}

export function runCorpusAudit() {
  const chunks = loadChunks();
  const total = chunks.length;
  const stats = {
    garbled: 0,
    empty: 0,
    duplicate: 0,
    noTitle: 0,
    noLocator: 0,
    overlong: 0,
    tooShort: 0,
    crossChapter: 0,
    noise: 0,
    noCanonLayer: 0,
    noSpoiler: 0,
    volMismatch: 0,
  };
  const seenHash = new Set();
  const noisePatterns = [/^目录$/m, /导航/, /下一页/, /上一页/, /下载说明/, /本章未完/, /^返回目录$/m];
  const chapterPattern = /第[一二三四五六七八九十百千0-9]+[卷部章回][^第]*第[一二三四五六七八九十百千0-9]+[卷部章回]/;
  for (const chunk of chunks) {
    const content = chunk.content ?? "";
    if (/\uFFFD/.test(content)) stats.garbled += 1;
    if (!content.trim()) stats.empty += 1;
    if (seenHash.has(chunk.contentHash)) stats.duplicate += 1;
    seenHash.add(chunk.contentHash);
    if (!chunk.title) stats.noTitle += 1;
    if (!chunk.sourceLocator && !chunk.sourcePath) stats.noLocator += 1;
    if (content.length > 3000) stats.overlong += 1;
    if (content.length < 50) stats.tooShort += 1;
    if (chapterPattern.test(content)) stats.crossChapter += 1;
    if (noisePatterns.some((pattern) => pattern.test(content))) stats.noise += 1;
    if (!chunk.canonLayer) stats.noCanonLayer += 1;
    if (!chunk.spoilerScope) stats.noSpoiler += 1;
    const inCoi = (chunk.sourcePath ?? "").includes("/coi/");
    const inLotm = (chunk.sourcePath ?? "").includes("/lotm/");
    if ((inCoi && chunk.timeline?.volume === 1) || (inLotm && chunk.timeline?.volume === 2)) {
      stats.volMismatch += 1;
    }
  }

  const pick = (filter, count, seed) => sample(chunks.filter(filter), count, seed);
  const novel = pick((chunk) => chunk.sourceType === "novel", 50, 11);
  const wiki = pick((chunk) => chunk.sourceType === "wiki", 30, 23);
  const subtitle = pick((chunk) => chunk.sourceType === "subtitle", 20, 37);
  const game = pick(
    (chunk) => chunk.canonLayer === "fan-derived" || chunk.canonLayer === "game-original",
    20,
    53
  );
  const sampleReport = {
    novel: novel.map((chunk) => ({ title: chunk.title, source: chunk.sourcePath, chars: chunk.content.length, locator: chunk.sourceLocator ?? "" })),
    wiki: wiki.map((chunk) => ({ title: chunk.title, source: chunk.sourcePath, chars: chunk.content.length })),
    subtitle: subtitle.map((chunk) => ({ title: chunk.title, source: chunk.sourcePath, chars: chunk.content.length })),
    game: game.map((chunk) => ({ title: chunk.title, source: chunk.sourcePath, chars: chunk.content.length })),
  };
  const result = {
    total,
    rates: Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [key, Number((value / Math.max(1, total)).toFixed(4))])
    ),
    counts: stats,
    sampleCounts: { novel: novel.length, wiki: wiki.length, subtitle: subtitle.length, game: game.length },
    sampleReport,
  };
  writeJson(path.join(reportDir(), "corpus-audit.json"), result);
  return result;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureDirs();
  const result = runCorpusAudit();
  console.log("[rag:corpus:audit]");
  console.log(`  切片总数 ${result.total}`);
  console.log(`  乱码率=${result.rates.garbled} 空切片率=${result.rates.empty} 重复率=${result.rates.duplicate}`);
  console.log(`  无标题率=${result.rates.noTitle} 无定位率=${result.rates.noLocator}`);
  console.log(`  超长率=${result.rates.overlong} 过短率=${result.rates.tooShort} 跨章拼接率=${result.rates.crossChapter}`);
  console.log(`  噪声率=${result.rates.noise} canon缺失=${result.rates.noCanonLayer} spoiler缺失=${result.rates.noSpoiler}`);
  console.log(`  第一部/第二部混入=${result.rates.volMismatch}`);
  console.log(`  抽样：正文${result.sampleCounts.novel} Wiki${result.sampleCounts.wiki} 字幕${result.sampleCounts.subtitle} 游戏/同人${result.sampleCounts.game}`);
  console.log("  抽样明细已写入 private/rag/reports/corpus-audit.json（便于人工阅读，不在此复制正文）");
  process.exit(0);
}
