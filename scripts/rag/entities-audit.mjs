// 实体与别名标准化审计：构建 entities/aliases/relations 注册表并输出统计。
import { buildRegistry, loadChunks, reportDir, saveRegistry } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";
import path from "node:path";

export function runEntitiesAudit() {
  const chunks = loadChunks();
  const registry = buildRegistry(chunks);
  const saved = saveRegistry(registry);
  const byType = {};
  let withSource = 0;
  let noSource = 0;
  let aliasConflicts = 0;
  for (const entity of registry.entities.values()) {
    byType[entity.entityType] = (byType[entity.entityType] ?? 0) + 1;
    if (entity.sourceIds.size > 0) withSource += 1;
    else noSource += 1;
  }
  for (const entry of registry.aliases.values()) {
    aliasConflicts += entry.conflicts.length;
  }
  const identities = registry.relations.filter((relation) => relation.predicate === "identity");
  const klein = registry.entities.get("克莱恩·莫雷蒂");
  const result = {
    entities: saved.entities,
    aliases: saved.aliases,
    relations: saved.relations,
    byType,
    entitiesWithSource: withSource,
    entitiesWithoutSource: noSource,
    aliasConflicts,
    identityRelations: identities.length,
    kleinIdentities: klein?.identities ?? [],
    kleinIdentitiesSecretByDefault: identities.every((relation) => relation.identityMeta?.visibility === "secret"),
    registryFiles: ["entities.json", "aliases.json", "relations.json"],
  };
  writeJson(path.join(reportDir(), "entities-audit.json"), result);
  return result;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  ensureDirs();
  const result = runEntitiesAudit();
  console.log("[rag:entities:audit]");
  console.log(`  实体 ${result.entities} / 别名 ${result.aliases} / 关系 ${result.relations}`);
  console.log(`  类型分布 ${JSON.stringify(result.byType)}`);
  console.log(`  有来源实体 ${result.entitiesWithSource} / 无来源实体 ${result.entitiesWithoutSource}`);
  console.log(`  别名冲突 ${result.aliasConflicts}`);
  console.log(`  身份关系 ${result.identityRelations}（克莱恩身份=${result.kleinIdentities.join("、")}，默认 secret=${result.kleinIdentitiesSecretByDefault}）`);
  console.log(`  报告 private/rag/reports/entities-audit.json`);
  process.exit(0);
}
