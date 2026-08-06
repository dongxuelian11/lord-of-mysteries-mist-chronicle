// 卷章级防剧透元数据审计：检查中英文小说切片的 work/卷/章/剧透边界覆盖。
import { loadChunks } from "./lib/registry.mjs";

export function runSpoilerAudit() {
  const chunks = loadChunks();
  const zh = chunks.filter((chunk) => chunk.sourceId === "zh-lotm-txt");
  const en = chunks.filter((chunk) => chunk.sourceId === "lotm-reader");
  const enLOTM = en.filter((chunk) => chunk.work === "LOTM");
  const enCOI = en.filter((chunk) => chunk.work === "COI");

  const zhByVolume = {};
  const zhScope = {};
  for (const chunk of zh) {
    zhByVolume[chunk.volumeNumber ?? "?"] = (zhByVolume[chunk.volumeNumber ?? "?"] ?? 0) + 1;
    zhScope[chunk.spoilerScope ?? "?"] = (zhScope[chunk.spoilerScope ?? "?"] ?? 0) + 1;
  }
  const lotmScope = {};
  for (const chunk of enLOTM) {
    lotmScope[chunk.spoilerScope ?? "?"] = (lotmScope[chunk.spoilerScope ?? "?"] ?? 0) + 1;
  }
  const coiAll = enCOI.filter((chunk) => chunk.spoilerScope === "all").length;
  const lotmAligned = enLOTM.filter((chunk) => chunk.volumeNumber !== undefined).length;
  const nonNovel = en.filter((chunk) => !chunk.work);
  const identityTagged = zh.filter((chunk) => (chunk.identityIds ?? []).length).length;

  const audit = {
    zh: {
      chunks: zh.length,
      byVolume: zhByVolume,
      missingWork: zh.filter((chunk) => !chunk.work).length,
      missingAbsoluteChapter: zh.filter((chunk) => chunk.absoluteChapter === undefined).length,
      missingChapterTitle: zh.filter((chunk) => !chunk.chapterTitle).length,
      spoilerScope: zhScope,
      identityTaggedChunks: identityTagged,
      timelineStageCoverage: zh.filter((chunk) => chunk.timelineStage).length / zh.length,
    },
    en: {
      chunks: en.length,
      lotm: enLOTM.length,
      coi: enCOI.length,
      nonNovel: nonNovel.length,
      nonNovelConservative:
        nonNovel.filter((chunk) => chunk.spoilerScope === "all").length,
      lotmAligned: lotmAligned,
      lotmUnalignedConservative:
        enLOTM.filter((chunk) => chunk.volumeNumber === undefined && chunk.spoilerScope === "all").length,
      lotmScope: lotmScope,
      coiConservative: `${coiAll}/${enCOI.length}`,
    },
  };
  return audit;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const audit = runSpoilerAudit();
  const zh = audit.zh;
  const en = audit.en;
  console.log("[rag:spoiler:audit]");
  console.log(
    `  中文：${zh.chunks} 切片 | 缺work=${zh.missingWork} 缺绝对章号=${zh.missingAbsoluteChapter} 缺章名=${zh.missingChapterTitle} 身份标记=${zh.identityTaggedChunks} 时间阶段覆盖=${(zh.timelineStageCoverage * 100).toFixed(1)}%`
  );
  console.log(`  中文分卷：${JSON.stringify(zh.byVolume)}`);
  console.log(`  中文剧透边界：${JSON.stringify(zh.spoilerScope)}`);
  console.log(
    `  英文：LOTM=${en.lotm} COI=${en.coi} 非小说=${en.nonNovel}（保守=${en.nonNovelConservative}）`
  );
  console.log(
    `  LOTM对齐=${en.lotmAligned} 未对齐保守=${en.lotmUnalignedConservative} COI保守=${en.coiConservative}`
  );
  console.log(`  LOTM分卷边界：${JSON.stringify(en.lotmScope)}`);
  const ok =
    zh.missingWork === 0 &&
    zh.missingAbsoluteChapter === 0 &&
    zh.missingChapterTitle === 0 &&
    en.coiConservative === `${en.coi}/${en.coi}` &&
    en.nonNovelConservative === en.nonNovel;
  console.log(`[rag:spoiler:audit] RESULT=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
