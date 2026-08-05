// 公开占位版世界知识库。
// 《诡秘之主》原著设定资料（完整版 generated-lore-compendium.ts）不随开源仓库分发，
// 本地维护者通过 scripts/prepare-lore.mjs 从 private/ 恢复完整版。
// 公共构建使用此空壳：游戏仍可运行，但推演上下文不包含原著专属知识。
import type { LoreRecord } from "./lore-knowledge";

export const LORE_COMPENDIUM_META = {
  version: "public-placeholder",
  scope: "empty",
  recordCount: 0,
} as const;

export const LOTM_SOURCES: unknown[] = [];
export const LOTM_PATHWAYS: unknown[] = [];
export const LOTM_GLOSSARY: unknown[] = [];
export const LORE_RECORDS: LoreRecord[] = [];
