import assert from "node:assert/strict";
import test from "node:test";

import { buildLoreModuleFromSeedChunks } from "../scripts/release/materialize-lore-from-seed.mjs";

function pathwayChunk(index) {
  const locator = `lotm-04-${String(index + 2).padStart(3, "0")}`;
  const rows = Array.from({ length: 10 }, (_, offset) => `| ${9 - offset} | 序列${9 - offset}名称 |`).join("\n");
  return {
    sourceId: "legacy-compendium",
    sourceLocator: locator,
    title: `22条标准途径完整速查 · ${index + 1}. 测试${index + 1}途径（序列9：序列9名称）`,
    content: `• 源质组： 测试源质 → 测试旧日\n• 核心主题： 测试、约束\n• 代表人物： 测试人物\n\n| 序列 | 名称 |\n|---:|---|\n${rows}`,
    visibility: "restricted",
    topics: ["pathways"],
    sourceGrade: "C",
  };
}

test("release lore materialization reconstructs cited records and all 22 pathways from the authorized seed", () => {
  const chunks = [
    ...Array.from({ length: 22 }, (_, index) => pathwayChunk(index)),
    ...Array.from({ length: 38 }, (_, index) => ({
      sourceId: "legacy-compendium",
      sourceLocator: `lotm-08-${String(index + 100).padStart(3, "0")}`,
      title: `测试记录${index}`,
      content: "知识内容 [S01]",
      visibility: index % 2 ? "public" : "restricted",
      topics: ["test"],
      sourceGrade: "A",
    })),
    {
      sourceId: "legacy-compendium",
      sourceLocator: "lotm-16-001",
      title: "来源分级表",
      content: "| 编号 | 等级 | 类型 | 标题 | 用途 |\n|---|---|---|---|---|\n| S01 | A | 官方小说页面 | 正版作品页 | 正典核验 |",
      visibility: "restricted",
      topics: ["sources"],
      sourceGrade: "A",
    },
  ];
  const source = buildLoreModuleFromSeedChunks(chunks);
  assert.match(source, /"recordCount": 61/);
  assert.equal((source.match(/"sequence_9_to_0"/g) ?? []).length, 22);
  assert.match(source, /"id": "S01"/);
  assert.match(source, /export const LORE_RECORDS: LoreRecord\[\]/);
});
