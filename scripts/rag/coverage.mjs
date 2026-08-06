// 知识覆盖矩阵：人物/途径/组织/地点/物品/历史/规则 各领域的实体与证据统计。
import { buildRegistry, loadChunks } from "./lib/registry.mjs";
import { ensureDirs, writeJson, indexDir } from "./lib/paths.mjs";
import path from "node:path";

const CANON_LAYERS = [
  "canon-primary",
  "canon",
  "official-reference",
  "canon-adaptation",
  "community-reference",
  "community",
  "fan-derived",
  "game-original",
  "disputed",
  "unknown",
];

const AUTHORITY_BUCKETS = [
  ["canon-primary", "canon", "official-reference", "canon-adaptation"],
  ["community-reference", "community"],
  ["fan-derived", "game-original"],
  ["disputed"],
  ["unknown"],
];

function authorityBucket(layer) {
  const index = AUTHORITY_BUCKETS.findIndex((bucket) => bucket.includes(layer));
  return index >= 0 ? index : AUTHORITY_BUCKETS.length - 1;
}

function layerOf(chunk) {
  return CANON_LAYERS.includes(chunk.canonLayer) ? chunk.canonLayer : "unknown";
}

export function runCoverage() {
  const chunks = loadChunks();
  const registry = buildRegistry(chunks);
  const domains = {
    characters: { types: ["character"], name: "人物" },
    pathways: { types: ["pathway", "sequence"], name: "途径与序列" },
    organizations: { types: ["organization"], name: "组织" },
    locations: { types: ["location"], name: "地点" },
    artifacts: { types: ["item", "sealed-artifact"], name: "物品与封印物" },
    history: { types: ["event", "era"], name: "历史与事件" },
    mysticism: { types: ["ritual", "deity", "concept"], name: "神秘学规则" },
  };
  const coverage = {};
  for (const [key, domain] of Object.entries(domains)) {
    const entities = [...registry.entities.values()].filter((entity) => domain.types.includes(entity.entityType));
    const withCanon = entities.filter((entity) =>
      [...entity.sourceIds].some((sourceId) =>
        chunks.some((chunk) => chunk.sourceId === sourceId && ["canon-primary", "canon", "official-reference", "canon-adaptation"].includes(chunk.canonLayer))
      )
    ).length;
    const noSource = entities.filter((entity) => entity.sourceIds.size === 0).length;
    const communityOnly = entities.filter(
      (entity) =>
        !entitiesWithCanon(chunks, entity) &&
        entitiesWithAny(chunks, entity, ["community", "community-reference"])
    ).length;
    const fanOnly = entities.filter(
      (entity) =>
        !entitiesWithCanon(chunks, entity) &&
        !entitiesWithAny(chunks, entity, ["community", "community-reference"]) &&
        entitiesWithAny(chunks, entity, ["fan-derived", "game-original"])
    ).length;
    const conflicts = entities.filter((entity) => {
      const buckets = new Set();
      for (const sourceId of entity.sourceIds) {
        for (const chunk of chunks) {
          if (chunk.sourceId === sourceId) buckets.add(authorityBucket(chunk.canonLayer));
        }
      }
      return buckets.size > 1;
    }).length;
    const avgSources = entities.length
      ? Number((entities.reduce((sum, entity) => sum + entity.sourceIds.size, 0) / entities.length).toFixed(2))
      : 0;
    coverage[key] = {
      label: domain.name,
      entityCount: entities.length,
      withCanonEvidence: withCanon,
      withCommunityOnly: communityOnly,
      withFanOnly: fanOnly,
      noSource: noSource,
      conflicts: conflicts,
      avgSourceCount: avgSources,
      unknown: noSource > 0 ? "部分实体无来源，需 UNKNOWN 标记" : "无",
    };
  }

  // 小说卷章覆盖（LOTM / COI）
  const novelChunks = chunks.filter((chunk) => chunk.sourceId === "lotm-reader");
  const coiChunks = novelChunks.filter((chunk) =>
    String(chunk.sourcePath ?? "").replace(/\\/g, "/").includes("/coi/")
  );
  const lotmChunks = novelChunks.filter((chunk) =>
    String(chunk.sourcePath ?? "").replace(/\\/g, "/").includes("/lotm/")
  );
  const chapterTitles = novelChunks.map((chunk) => chunk.title);
  const lotmChapterFiles = new Set(lotmChunks.map((chunk) => chunk.sourcePath)).size;
  const coiChapterFiles = new Set(coiChunks.map((chunk) => chunk.sourcePath)).size;
  const novelCoverage = {
    lotmChapterFiles,
    coiChapterFiles,
    novelChunkCount: novelChunks.length,
    chapterTitleCount: chapterTitles.filter(
      (title) => /第.{1,4}章/.test(title) || /^Chapter\s+\d+/i.test(title)
    ).length,
  };

  const layerDistribution = {};
  for (const chunk of chunks) {
    const layer = layerOf(chunk);
    layerDistribution[layer] = (layerDistribution[layer] ?? 0) + 1;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    chunks: chunks.length,
    domains: coverage,
    novelCoverage,
    layerDistribution,
    knownEntities: registry.entities.size,
  };
  const dir = path.join(indexDir, "..", "reports");
  writeJson(path.join(dir, "knowledge-coverage.json"), result);
  return result;
}

function entitiesWithCanon(chunks, entity) {
  return entitiesWithAny(chunks, entity, ["canon-primary", "canon", "official-reference", "canon-adaptation"]);
}

function entitiesWithAny(chunks, entity, layers) {
  return [...entity.sourceIds].some((sourceId) =>
    chunks.some(
      (chunk) =>
        chunk.sourceId === sourceId && layers.includes(chunk.canonLayer)
    )
  );
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureDirs();
  const result = runCoverage();
  console.log("[rag:coverage]");
  for (const [key, domain] of Object.entries(result.domains)) {
    console.log(
      `  ${key}: 实体=${domain.entityCount} canon证据=${domain.withCanonEvidence} 仅社区=${domain.withCommunityOnly} 仅同人=${domain.withFanOnly} 无来源=${domain.noSource} 冲突=${domain.conflicts} 平均来源=${domain.avgSourceCount}`
    );
  }
  console.log(`  小说章节：LOTM=${result.novelCoverage.lotmChapterFiles} COI=${result.novelCoverage.coiChapterFiles} 正文切片=${result.novelCoverage.novelChunkCount} 章节标题=${result.novelCoverage.chapterTitleCount}`);
  console.log(`  层级分布 ${JSON.stringify(result.layerDistribution)}`);
  console.log("  报告 private/rag/reports/knowledge-coverage.json");
  process.exit(0);
}
