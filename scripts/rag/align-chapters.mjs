// 中英章节对齐：中文《诡秘之主》（zh-lotm-txt）↔ 英文 LOTM（lotm-reader）。
import { loadChunks } from "./lib/registry.mjs";
import { ensureDirs, writeJson, indexDir } from "./lib/paths.mjs";
import path from "node:path";

export function runAlignChapters() {
  const chunks = loadChunks();
  const zhChunks = chunks.filter((chunk) => chunk.sourceId === "zh-lotm-txt");
  const enChunks = chunks.filter(
    (chunk) =>
      chunk.sourceId === "lotm-reader" &&
      /\/chapters\/lotm\//i.test(String(chunk.sourcePath ?? "").replace(/\\/g, "/"))
  );

  // 英文章节：由标题 Chapter N 解析绝对章号
  const enByNumber = new Map();
  const enDocByNumber = new Map();
  for (const chunk of enChunks) {
    const match = String(chunk.title ?? "").match(/^Chapter\s+(\d+)/i);
    if (!match) continue;
    const number = Number(match[1]);
    if (!enByNumber.has(number)) {
      enByNumber.set(number, { documentId: chunk.documentId, title: chunk.title });
    }
    const docs = enDocByNumber.get(number) ?? new Set();
    docs.add(chunk.documentId);
    enDocByNumber.set(number, docs);
  }
  const enMax = Math.max(0, ...[...enByNumber.keys()]);

  // 中文章节：按卷排序，计算跨卷绝对序号
  const zhChapters = new Map();
  for (const chunk of zhChunks) {
    const key = `${chunk.volumeNumber ?? 0}:${chunk.chapterNumber ?? 0}`;
    if (!zhChapters.has(key)) {
      zhChapters.set(key, {
        volumeNumber: chunk.volumeNumber ?? 0,
        chapterNumber: chunk.chapterNumber ?? 0,
        documentId: chunk.documentId,
        title: chunk.title,
        isSpecial: chunk.isSpecial,
      });
    }
  }
  const zhList = [...zhChapters.values()].sort(
    (a, b) => a.volumeNumber - b.volumeNumber || a.chapterNumber - b.chapterNumber
  );
  const offset = new Map();
  let cumulative = 0;
  let lastVolume = -1;
  for (const chapter of zhList) {
    if (chapter.volumeNumber !== lastVolume) {
      offset.set(chapter.volumeNumber, cumulative);
      lastVolume = chapter.volumeNumber;
    }
    cumulative += 1;
  }
  const zhAbsolute = new Map();
  for (const chapter of zhList) {
    zhAbsolute.set(chapter.documentId, {
      abs: (offset.get(chapter.volumeNumber) ?? 0) + chapter.chapterNumber,
      chapter,
    });
  }

  // 偏移搜索：在 -5..5 中找最佳偏移
  let bestOffset = 0;
  let bestMatches = -1;
  for (let delta = -5; delta <= 5; delta += 1) {
    let matches = 0;
    for (const item of zhAbsolute.values()) {
      if (enByNumber.has(item.abs + delta)) matches += 1;
    }
    if (matches > bestMatches) {
      bestMatches = matches;
      bestOffset = delta;
    }
  }

  const alignments = [];
  const statusCounts = {};
  let zhMatched = 0;
  let enMatched = 0;
  const usedEn = new Set();
  const usedZh = new Set();
  for (const item of zhAbsolute.values()) {
    const enNumber = item.abs + bestOffset;
    const en = enByNumber.get(enNumber);
    let status;
    let confidence;
    if (!en) {
      status = "unmatched-zh";
      confidence = 0;
    } else if (bestOffset === 0) {
      status = "exact-number";
      confidence = 0.95;
      zhMatched += 1;
      enMatched += 1;
      usedEn.add(enNumber);
      usedZh.add(item.chapter.documentId);
    } else {
      status = "offset-corrected";
      confidence = 0.8;
      zhMatched += 1;
      enMatched += 1;
      usedEn.add(enNumber);
      usedZh.add(item.chapter.documentId);
    }
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    alignments.push({
      work: "诡秘之主",
      volumeNumber: item.chapter.volumeNumber,
      chapterNumber: item.chapter.chapterNumber,
      zhDocumentId: item.chapter.documentId,
      enDocumentId: en?.documentId ?? null,
      zhTitle: item.chapter.title,
      enTitle: en?.title ?? null,
      alignmentMethod: status === "title-assisted" ? "title-assisted" : status === "offset-corrected" ? "offset-corrected" : "exact-number",
      confidence,
      status,
    });
  }
  const unmatchedEn = [...enByNumber.keys()].filter((number) => !usedEn.has(number)).length;
  const ambiguous = [...enDocByNumber.values()].filter((set) => set.size > 1).length;

  const result = {
    work: "诡秘之主",
    zhChapterCount: zhList.length,
    enChapterCount: enMax,
    bestOffset,
    zhMatched,
    enMatched,
    unmatchedZh: statusCounts["unmatched-zh"] ?? 0,
    unmatchedEn,
    ambiguous,
    statusCounts,
    avgConfidence: Number(
      (alignments.reduce((sum, item) => sum + item.confidence, 0) /
        Math.max(1, alignments.length)).toFixed(3)
    ),
    volumeAlignmentRate: {},
    alignments: alignments.slice(0, 20000),
  };
  for (const volume of [...new Set(zhList.map((chapter) => chapter.volumeNumber))]) {
    const total = zhList.filter((chapter) => chapter.volumeNumber === volume).length;
    const matched = alignments.filter(
      (item) => item.volumeNumber === volume && item.status !== "unmatched-zh"
    ).length;
    result.volumeAlignmentRate[volume] = Number((matched / Math.max(1, total)).toFixed(3));
  }
  ensureDirs();
  writeJson(path.join(indexDir, "chapter-alignments.json"), result);
  return result;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = runAlignChapters();
  console.log("[rag:align:chapters]");
  console.log(
    `  中文章节=${result.zhChapterCount} 英文章节=${result.enChapterCount} 最佳偏移=${result.bestOffset}`
  );
  console.log(
    `  已对齐 zh=${result.zhMatched} en=${result.enMatched} 未对齐 zh=${result.unmatchedZh} en=${result.unmatchedEn} 多候选=${result.ambiguous}`
  );
  console.log(`  平均置信度=${result.avgConfidence}`);
  console.log(`  状态分布=${JSON.stringify(result.statusCounts)}`);
  console.log(`  各卷对齐率=${JSON.stringify(result.volumeAlignmentRate)}`);
  console.log("  报告 private/rag/index/chapter-alignments.json");
  process.exit(0);
}
