// 实体注册表构建：从切片实体/标题/别名 + 领域基线表合并，输出 entities/aliases/relations。
import { readJson, writeJson, indexDir, root } from "./paths.mjs";
import { DOMAIN_ENTITIES } from "./domain-aliases.mjs";
import path from "node:path";

export const ENTITY_TYPES = [
  "character",
  "pathway",
  "sequence",
  "organization",
  "location",
  "item",
  "sealed-artifact",
  "event",
  "ritual",
  "deity",
  "era",
  "concept",
];

const MATCHER = DOMAIN_ENTITIES.flatMap((entity) =>
  [entity.canonical, ...(entity.aliases ?? []), ...(entity.englishNames ?? [])].map((name) => ({
    name,
    canonical: entity.canonical,
    type: entity.type,
  }))
).sort((a, b) => b.name.length - a.name.length);

export function buildRegistry(chunks) {
  const entities = new Map();
  const aliases = new Map();
  const relations = [];

  const addAlias = (alias, entityId, type, sourceId) => {
    const key = String(alias ?? "").trim().toLowerCase();
    if (!key || key.length < 2) return;
    const existing = aliases.get(key);
    if (existing && existing.entityId !== entityId) {
      existing.conflicts.push({
        entityId,
        sourceId,
        existingEntityId: existing.entityId,
      });
      return;
    }
    if (!existing) {
      aliases.set(key, { alias, entityId, type, sourceIds: new Set([sourceId]), conflicts: [] });
    } else {
      existing.sourceIds.add(sourceId);
    }
  };

  const upsert = (name, type, sourceId, extra = {}) => {
    const key = String(name ?? "").trim();
    if (!key) return null;
    const existing = entities.get(key) ?? {
      entityId: `entity-${key}`,
      canonicalName: key,
      entityType: type,
      aliases: [],
      englishNames: [],
      titles: [],
      identities: [],
      relatedEntities: [],
      pathway: undefined,
      sequence: undefined,
      organizations: [],
      timelineScope: undefined,
      spoilerScope: undefined,
      sourceIds: new Set(),
      confidence: 0.4,
      ...extra,
    };
    existing.sourceIds.add(sourceId);
    entities.set(key, existing);
    return existing;
  };

  for (const entry of DOMAIN_ENTITIES) {
    const entity = upsert(entry.canonical, entry.type, "domain-baseline", {
      aliases: entry.aliases ?? [],
      relatedEntities: entry.related ?? [],
      confidence: 0.7,
    });
    for (const alias of entry.aliases ?? []) addAlias(alias, entity.entityId, entity.entityType, "domain-baseline");
    for (const related of entry.related ?? []) {
      relations.push({ subject: entity.canonicalName, predicate: "related", object: related, layer: "domain-baseline", sourceIds: ["domain-baseline"] });
    }
  }

  for (const chunk of chunks) {
    const sourceId = chunk.sourceId;
    // 确定性实体抽取：扫描正文与标题中的已知别名/标准名
    const text = `${chunk.title ?? ""} ${(chunk.content ?? "").slice(0, 4000)}`.toLowerCase();
    for (const matcher of MATCHER) {
      if (text.includes(matcher.name.toLowerCase())) {
        const entry = upsert(matcher.canonical, matcher.type, sourceId, {
          confidence: Math.max(entryConfidence(chunk), matcher.type === "character" ? 0.6 : 0.5),
          spoilerScope: chunk.spoilerScope,
        });
        addAlias(matcher.name, entry.entityId, entry.entityType, sourceId);
      }
    }
    for (const entity of chunk.entities ?? []) {
      const entry = upsert(entity.name, entity.type, sourceId, {
        aliases: entity.aliases ?? [],
        spoilerScope: chunk.spoilerScope,
        timelineScope: chunk.timeline ? { volume: chunk.timeline.volume, week: chunk.timeline.week } : undefined,
        confidence: Math.max(entryConfidence(chunk), 0.5),
      });
      for (const alias of entity.aliases ?? []) addAlias(alias, entry.entityId, entry.entityType, sourceId);
      addAlias(entity.name, entry.entityId, entry.entityType, sourceId);
    }
    for (const alias of chunk.aliases ?? []) {
      const entry = upsert(chunk.title, "concept", sourceId);
      addAlias(alias, entry.entityId, entry.entityType, sourceId);
    }
    for (const relation of chunk.relations ?? []) {
      relations.push({
        subject: relation.subject,
        predicate: relation.predicate,
        object: relation.object,
        layer: relation.layer ?? chunk.canonLayer,
        sourceIds: [sourceId],
      });
    }
  }

  // 克莱恩多身份：把身份别名登记为 identity 关系（不默认公开）
  const klein = entities.get("克莱恩·莫雷蒂");
  if (klein) {
    const identities = ["周明瑞", "夏洛克·莫里亚蒂", "格尔曼·斯帕罗", "道恩·唐泰斯", "梅林·赫尔墨斯", "愚者"];
    for (const identity of identities) {
      if (!klein.identities.includes(identity)) klein.identities.push(identity);
      relations.push({
        subject: "克莱恩·莫雷蒂",
        predicate: "identity",
        object: identity,
        layer: "canon-primary",
        sourceIds: ["domain-baseline", ...(chunks.find((chunk) => chunk.title.includes(identity)) ? [chunks.find((chunk) => chunk.title.includes(identity)).sourceId] : [])],
        identityMeta: {
          validFrom: "第一卷",
          validUntil: undefined,
          knownBy: [],
          visibility: "secret",
          spoilerScope: "volume1",
          sourceEvidence: "domain-baseline",
        },
      });
    }
  }

  return { entities, aliases, relations };
}

function entryConfidence(chunk) {
  if (chunk.canonLayer === "canon-primary") return 0.95;
  if (chunk.canonLayer === "official-reference") return 0.85;
  if (chunk.canonLayer === "canon" || chunk.canonLayer === "canon-adaptation") return 0.8;
  if (chunk.canonLayer === "community-reference" || chunk.canonLayer === "community") return 0.6;
  return 0.4;
}

export function saveRegistry(registry) {
  const entities = [...registry.entities.values()].map((entity) => ({
    ...entity,
    sourceIds: [...entity.sourceIds],
  }));
  const aliases = [...registry.aliases.values()].map((entry) => ({
    ...entry,
    sourceIds: [...entry.sourceIds],
  }));
  writeJson(path.join(indexDir, "entities.json"), entities);
  writeJson(path.join(indexDir, "aliases.json"), aliases);
  writeJson(path.join(indexDir, "relations.json"), registry.relations);
  return { entities: entities.length, aliases: aliases.length, relations: registry.relations.length };
}

export function loadChunks() {
  return readJson(path.join(indexDir, "chunks.json")) ?? [];
}

export function reportDir() {
  const dir = path.join(root, "private", "rag", "reports");
  return dir;
}
