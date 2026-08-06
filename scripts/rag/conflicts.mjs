// 冲突与跨来源重复检测：同实体多层证据、同正文多来源聚类、冲突版本与偏好。
import { loadChunks } from "./lib/registry.mjs";
import { buildRegistry } from "./lib/registry.mjs";
import { reportDir } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";
import path from "node:path";

const LAYER_ORDER = [
  "canon-primary",
  "official-reference",
  "canon",
  "canon-adaptation",
  "community-reference",
  "community",
  "fan-derived",
  "game-original",
  "disputed",
  "unknown",
];

export function runConflicts() {
  const chunks = loadChunks();
  const registry = buildRegistry(chunks);
  const conflicts = [];
  for (const entity of registry.entities.values()) {
    const sources = [...entity.sourceIds].filter((sourceId) => sourceId !== "domain-baseline");
    if (sources.length < 2) continue;
    const buckets = new Set();
    const layerBySource = {};
    for (const sourceId of sources) {
      const chunk = chunks.find((item) => item.sourceId === sourceId);
      if (!chunk) continue;
      layerBySource[sourceId] = chunk.canonLayer;
      buckets.add(authorityBucket(chunk.canonLayer));
    }
    if (buckets.size > 1) {
      const versions = Object.entries(layerBySource).map(([sourceId, layer]) => {
        const chunk = chunks.find((item) => item.sourceId === sourceId);
        return {
          sourceId,
          layer,
          grade: chunk?.sourceGrade,
          locator: chunk?.sourceLocator ?? chunk?.sourcePath,
          text: chunk?.content.slice(0, 120) ?? "",
        };
      });
      const layers = new Set(versions.map((version) => version.layer));
      const preferred = LAYER_ORDER.find((layer) => layers.has(layer)) ?? "unknown";
      conflicts.push({
        conflictId: `conflict-${entity.canonicalName}`,
        subjectEntity: entity.canonicalName,
        claimType: entity.entityType,
        versions,
        sourceGrades: [...new Set(versions.map((version) => version.grade))],
        preferredVersion: preferred,
        reason:
          preferred === "fan-derived" || preferred === "game-original"
            ? "仅同人/游戏资料支持，原著查询中按低优先级处理"
            : `按权威层级 ${LAYER_ORDER.indexOf(preferred) + 1}/${LAYER_ORDER.length} 采用 ${preferred}`,
      });
    }
  }

  // 跨来源精确重复聚类
  const normalized = new Map();
  for (const chunk of chunks) {
    const key = chunk.content.replace(/\s+/g, "").slice(0, 200);
    const cluster = normalized.get(key) ?? [];
    cluster.push({ sourceId: chunk.sourceId, layer: chunk.canonLayer, grade: chunk.sourceGrade, id: chunk.id });
    normalized.set(key, cluster);
  }
  const duplicateClusters = [...normalized.values()]
    .filter((cluster) => cluster.length > 1 && new Set(cluster.map((item) => item.sourceId)).size > 1)
    .slice(0, 50)
    .map((cluster) => ({
      sources: [...new Set(cluster.map((item) => item.sourceId))],
      layers: [...new Set(cluster.map((item) => item.layer))],
      grades: [...new Set(cluster.map((item) => item.grade))],
      count: cluster.length,
    }));

  const result = {
    conflictCount: conflicts.length,
    conflicts,
    crossSourceDuplicateClusters: duplicateClusters.length,
    duplicateClusters,
  };
  writeJson(path.join(reportDir(), "conflicts.json"), result);
  return result;
}

function authorityBucket(layer) {
  const buckets = [
    ["canon-primary", "canon", "official-reference", "canon-adaptation"],
    ["community-reference", "community"],
    ["fan-derived", "game-original"],
    ["disputed"],
  ];
  const index = buckets.findIndex((bucket) => bucket.includes(layer));
  return index >= 0 ? index : buckets.length;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureDirs();
  const result = runConflicts();
  console.log(`[rag:conflicts] 冲突条目=${result.conflictCount}`);
  for (const conflict of result.conflicts.slice(0, 20)) {
    console.log(
      `  ${conflict.subjectEntity} [${conflict.claimType}] 层级=${conflict.versions.map((v) => v.layer).join("/")} 采用=${conflict.preferredVersion} 原因=${conflict.reason}`
    );
  }
  console.log(`[rag:conflicts] 跨来源重复聚类=${result.crossSourceDuplicateClusters}`);
  console.log("  报告 private/rag/reports/conflicts.json");
  process.exit(0);
}
