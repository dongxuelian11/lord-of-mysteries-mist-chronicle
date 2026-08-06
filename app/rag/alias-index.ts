// 别名与实体索引：把领域基线表、运行索引里的 aliasMap 和切片实体合并成查询用索引。
import { DOMAIN_ENTITIES } from "./alias-data";
import type { EntityType, LoreChunk, RuntimeIndex } from "./types";

export type AliasEntry = {
  canonical: string;
  type: EntityType;
  englishNames: string[];
  related: string[];
};

export type AliasIndex = {
  byAlias: Map<string, AliasEntry>;
  canonicalSet: Set<string>;
};

export function buildAliasIndex(
  runtimeIndex?: RuntimeIndex | null,
  chunks: LoreChunk[] = []
): AliasIndex {
  const byAlias = new Map<string, AliasEntry>();
  const add = (alias: string, entry: AliasEntry) => {
    const key = alias.trim().toLowerCase();
    if (!key || key.length < 2) return;
    const existing = byAlias.get(key);
    if (!existing) byAlias.set(key, entry);
  };
  for (const entity of DOMAIN_ENTITIES) {
    const entry: AliasEntry = {
      canonical: entity.canonical,
      type: entity.type,
      englishNames: entity.englishNames ?? [],
      related: entity.related ?? [],
    };
    add(entity.canonical, entry);
    for (const alias of entity.aliases) add(alias, entry);
  }
  if (runtimeIndex?.aliasMap) {
    for (const [alias, value] of Object.entries(runtimeIndex.aliasMap)) {
      add(alias, {
        canonical: value.canonical,
        type: value.type,
        englishNames: [],
        related: [],
      });
    }
  }
  for (const chunk of chunks) {
    for (const alias of chunk.aliases ?? []) {
      add(alias, {
        canonical: chunk.title,
        type: "concept",
        englishNames: [],
        related: [],
      });
    }
    for (const entity of chunk.entities ?? []) {
      add(entity.name, {
        canonical: entity.name,
        type: entity.type,
        englishNames: entity.aliases ?? [],
        related: entity.aliases ?? [],
      });
      for (const alias of entity.aliases ?? []) {
        add(alias, {
          canonical: entity.name,
          type: entity.type,
          englishNames: [],
          related: [],
        });
      }
    }
  }
  return { byAlias, canonicalSet: new Set(byAlias.values().map((entry) => entry.canonical.toLowerCase())) };
}

export function lookupAlias(index: AliasIndex, text: string): AliasEntry | undefined {
  return index.byAlias.get(text.trim().toLowerCase());
}
