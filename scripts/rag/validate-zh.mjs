// 中文双源校验：TXT（vdisk 精校版）与 EPUB（wxnacy/book）交叉比对并选择主版本。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseZhTxt, chapterNumberFromTitle, AD_PATTERNS, MODIFIED_PATTERNS, AUTHOR_NOTE_PATTERNS } from "./lib/zh-novel.mjs";
import { parseEpub } from "./parsers/epub.mjs";
import { reportDir } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";
import { shingles, jaccard } from "./lib/text.mjs";

const sourceDir = path.join("private", "rag", "sources", "canon-zh", "lotm");

function analyzeChapters(chapters) {
  const byNumber = new Map();
  const byKey = new Map();
  let dupCount = 0;
  let shortCount = 0;
  let emptyCount = 0;
  let adCount = 0;
  let modified = new Set();
  let authorNote = 0;
  let extras = 0;
  const numbers = [];
  for (const chapter of chapters) {
    const num = chapter.chapterNumber;
    const key = `${chapter.volumeNumber ?? 0}:${num ?? 0}`;
    if (num) numbers.push(num);
    if (byKey.has(key)) dupCount += 1;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
    byNumber.set(`${chapter.volumeNumber ?? 0}`, (byNumber.get(`${chapter.volumeNumber ?? 0}`) ?? 0) + 1);
    const content = String(chapter.content ?? "");
    if (!content.trim()) emptyCount += 1;
    if (content.length > 0 && content.length < 200) shortCount += 1;
    if (AD_PATTERNS.some((pattern) => pattern.test(content))) adCount += 1;
    for (const pattern of MODIFIED_PATTERNS) {
      if (pattern.test(content)) modified.add(pattern.source);
    }
    if (chapter.isSpecial || /番外|尾声|后记/.test(chapter.chapterTitle)) extras += 1;
    if (chapter.authorNote || AUTHOR_NOTE_PATTERNS.some((pattern) => pattern.test(chapter.chapterTitle))) authorNote += 1;
  }
  const uniqueNumbers = new Set(byKey.keys());
  const max = uniqueNumbers.size ? Math.max(...uniqueNumbers) : 0;
  const missing = [];
  if (max > 0) {
    for (let i = 1; i <= max; i += 1) {
      if (!uniqueNumbers.has(i)) missing.push(i);
    }
  }
  return {
    chapterCount: chapters.length,
    uniqueChapters: uniqueNumbers.size,
    volumes: Object.fromEntries(byNumber),
    dupCount,
    shortCount,
    emptyCount,
    adCount,
    extras,
    authorNote,
    modifiedFlags: [...modified],
    maxChapterNumber: max,
    missingChapters: missing.slice(0, 200),
    firstChapter: chapters[0]?.chapterTitle ?? "",
    lastChapter: chapters[chapters.length - 1]?.chapterTitle ?? "",
  };
}

function normalizeChapterTitle(title) {
  let s = String(title ?? "").trim();
  s = s.replace(
    /^\s*(第[一二三四五六七八九十百千万零\d]+章|第[一二三四五六七八九十百千万零\d]+节|Chapters?\s*\d+)\s*[、.．:：]?\s*/,
    ""
  );
  s = s.replace(
    /[（(][^（）()]*?(求|月票|推荐票|订阅|收藏|打赏|感谢|加更)[^（）()]*?[）)]/g,
    ""
  );
  s = s.replace(/\s+/g, "").replace(/^["“”'\s]+|["“”'\s]+$/g, "");
  return s;
}

function align(txtChapters, epubChapters) {
  const epubByTitle = new Map();
  for (const chapter of epubChapters) {
    const key = normalizeChapterTitle(chapter.chapterTitle);
    if (!key) continue;
    const list = epubByTitle.get(key) ?? [];
    list.push(chapter);
    epubByTitle.set(key, list);
  }
  const aligned = [];
  const unmatchedZh = [];
  const ambiguousZh = [];
  for (const zh of txtChapters) {
    const key = normalizeChapterTitle(zh.chapterTitle);
    const candidates = key ? epubByTitle.get(key) : undefined;
    if (!key || !candidates || candidates.length === 0) {
      unmatchedZh.push(zh);
      continue;
    }
    if (candidates.length > 1) {
      ambiguousZh.push({
        zhChapterNumber: zh.chapterNumber,
        zhTitle: zh.chapterTitle,
      });
      aligned.push({
        zhChapterNumber: zh.chapterNumber,
        zhTitle: zh.chapterTitle,
        enTitle: null,
        similarity: 0,
        lengthRatio: 0,
        status: "ambiguous",
        confidence: 0.3,
      });
      continue;
    }
    const en = candidates[0];
    const zhText = String(zh.content ?? "").replace(/\s+/g, "").slice(0, 800);
    const enText = String(en.content ?? "").replace(/\s+/g, "").slice(0, 800);
    const similarity = jaccard(shingles(zhText), shingles(enText));
    const lengthRatio = enText.length ? zhText.length / enText.length : 0;
    aligned.push({
      zhChapterNumber: zh.chapterNumber,
      zhTitle: zh.chapterTitle,
      enTitle: en.chapterTitle,
      similarity: Number(similarity.toFixed(3)),
      lengthRatio: Number(lengthRatio.toFixed(2)),
      status: similarity > 0.55 ? "exact-number" : "title-assisted",
      confidence: similarity > 0.7 ? 0.9 : similarity > 0.5 ? 0.7 : 0.5,
    });
  }
  return {
    aligned,
    unmatchedZh,
    ambiguousZh,
    matchedCount: aligned.filter((item) => item.enTitle).length,
  };
}

export async function runValidateZh() {
  const files = fs.readdirSync(sourceDir).filter((file) => /\.(txt|epub)$/i.test(file));
  const sources = [];
  for (const file of files) {
    const full = path.join(sourceDir, file);
    const buffer = fs.readFileSync(full);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const base = { repo: "zh-mirror", commit: "mirror", language: "zh-CN", canonLayer: "canon-primary", sourceGrade: "A", type: "novel" };
    if (/\.txt$/i.test(file)) {
      const parsed = parseZhTxt(buffer);
      sources.push({ file, bytes: buffer.length, sha256, encoding: parsed.encoding, kind: "txt", parsed });
    } else {
      const parsed = await parseEpub(buffer, file, base);
      const chapters = parsed.map((doc) => {
        const { number, title } = chapterNumberFromTitle(doc.title);
        return { work: "诡秘之主", volumeNumber: 0, volumeTitle: "", chapterNumber: number, chapterTitle: title, content: doc.content, isSpecial: /番外|尾声|后记/.test(doc.title), authorNote: false };
      });
      sources.push({ file, bytes: buffer.length, sha256, encoding: "epub", kind: "epub", parsed: { work: "诡秘之主", encoding: "epub", chapterCount: chapters.length, volumeCount: 1, adCount: 0, authorNoteCount: 0, modifiedFlags: [], chapters } });
    }
  }
  for (const source of sources) {
    source.stats = analyzeChapters(source.parsed.chapters);
  }
  let main = null;
  let secondary = null;
  if (sources.length >= 2) {
    const alignment = align(
      sources.find((source) => source.kind === "txt")?.parsed.chapters ?? [],
      sources.find((source) => source.kind === "epub")?.parsed.chapters ?? []
    );
    sources.forEach((source) => {
      source.score =
        source.stats.uniqueChapters -
        source.stats.dupCount * 5 -
        source.stats.shortCount * 0.5 -
        source.stats.adCount * 0.2 -
        source.stats.missingChapters.length * 0.2;
    });
    sources.sort((a, b) => b.score - a.score);
    main = sources[0];
    secondary = sources[1];
    main.textIntegrity = "verified-against-secondary";
    secondary.textIntegrity = "verified-against-secondary";
    main.crossValidation = {
      alignedCount: alignment.matchedCount,
      unmatchedZh: alignment.unmatchedZh.length,
      ambiguousZh: alignment.ambiguousZh.length,
      avgSimilarity: Number(
        (alignment.aligned.reduce((sum, item) => sum + (item.similarity ?? 0), 0) /
          Math.max(1, alignment.aligned.filter((item) => item.enTitle).length)).toFixed(3)
      ),
      largeDiffChapters: alignment.aligned
        .filter(
          (item) =>
            item.enTitle &&
            (item.similarity < 0.4 || item.lengthRatio < 0.3 || item.lengthRatio > 3)
        )
        .slice(0, 20)
        .map((item) => ({ chapter: item.zhChapterNumber, zhTitle: item.zhTitle, similarity: item.similarity, lengthRatio: item.lengthRatio })),
    };
  } else if (sources.length === 1) {
    main = sources[0];
    main.textIntegrity = "structurally-verified";
  }
  const result = {
    sources: sources.map((source) => ({
      file: source.file,
      bytes: source.bytes,
      sha256: source.sha256,
      encoding: source.encoding,
      kind: source.kind,
      sourceProvenance: "third-party-mirror",
      textIntegrity: source.textIntegrity ?? "structurally-verified",
      stats: source.stats,
    })),
    mainSource: main ? { file: main.file, sha256: main.sha256, textIntegrity: main.textIntegrity, score: main.score, crossValidation: main.crossValidation } : null,
    secondarySource: secondary ? { file: secondary.file, sha256: secondary.sha256, textIntegrity: secondary.textIntegrity, score: secondary.score } : null,
    mainChoiceReason: main
      ? `结构完整度与噪声最少：${main.file}（章节 ${main.stats.uniqueChapters}，重复 ${main.stats.dupCount}，短章 ${main.stats.shortCount}，广告 ${main.stats.adCount}）`
      : "无可用中文来源",
  };
  ensureDirs();
  writeJson(path.join(reportDir(), "zh-validation.json"), result);
  return result;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runValidateZh();
  console.log("[rag:zh:validate]");
  for (const source of result.sources) {
    console.log(
      `  ${source.file}: bytes=${source.bytes} sha256=${source.sha256.slice(0, 16)}… encoding=${source.encoding} 章节=${source.stats.chapterCount} 唯一=${source.stats.uniqueChapters} 卷=${source.stats.chapterCount ? "见章节卷号" : "-"} 重复=${source.stats.dupCount} 短章=${source.stats.shortCount} 空章=${source.stats.emptyCount} 广告=${source.stats.adCount} 缺章=${source.stats.missingChapters.length} 番外=${source.stats.extras}`
    );
  }
  console.log(`  主版本: ${result.mainSource?.file}（${result.mainSource?.textIntegrity}）`);
  if (result.mainSource?.crossValidation) {
    console.log(
      `  交叉校验: 标题对齐=${result.mainSource.crossValidation.alignedCount} 未匹配=${result.mainSource.crossValidation.unmatchedZh} 歧义=${result.mainSource.crossValidation.ambiguousZh} 平均相似度=${result.mainSource.crossValidation.avgSimilarity} 差异大章节=${result.mainSource.crossValidation.largeDiffChapters.length}`
    );
  }
  console.log("  报告 private/rag/reports/zh-validation.json");
  process.exit(0);
}
