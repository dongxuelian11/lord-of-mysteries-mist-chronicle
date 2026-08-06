import { sha1, stableId } from "./text.mjs";

export function convertLegacyRecords(records, sourceId, baseMeta) {
  const chunks = [];
  records.forEach((record, index) => {
    const content = String(record.content ?? "").trim();
    if (!content) return;
    const title = String(record.title ?? "");
    let visibility = record.visibility ?? "public";
    let spoilerScope = "volume1";
    if (/真实身份|秘密：/.test(`${title}${content}`) || /格尔曼|帕列斯/.test(title)) {
      visibility = "secret";
      spoilerScope = "volume1";
    }
    if (/宇宙级/.test(title)) {
      visibility = "cosmic";
      spoilerScope = "all";
    }
    const id = stableId(`chunk-${sourceId}`, `${record.id}|${content}`, index);
    chunks.push({
      id,
      documentId: `doc-${record.id}`,
      title: record.title,
      content,
      summary: record.summary,
      sourceId: sourceId,
      sourceType: "structured",
      sourceRepo: baseMeta.repo ?? "local",
      sourceCommit: baseMeta.commit ?? "generated",
      sourcePath: baseMeta.path ?? "generated-lore-compendium.ts",
      sourceLocator: record.id,
      language: baseMeta.language ?? "zh-CN",
      canonLayer: baseMeta.canonLayer ?? record.canon ?? "canon",
      sourceGrade: baseMeta.sourceGrade ?? record.sourceGrade ?? "C",
      visibility,
      spoilerScope,
      timeline: baseMeta.timeline,
      topics: record.topics ?? [],
      entities: [],
      aliases: [record.title],
      relations: [],
      previousChunkId: undefined,
      nextChunkId: undefined,
      contentHash: sha1(`${record.id}|${content}`),
      updatedAt: baseMeta.updatedAt ?? new Date().toISOString(),
    });
  });
  return chunks;
}
