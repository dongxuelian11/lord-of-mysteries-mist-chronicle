import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("上下文包：证据、冲突、未知项与预算齐全", async () => {
  const { buildContextPackage, renderContextPackage } = await loadRuntimeModule(
    "app/rag/context-builder.ts"
  );
  const chunk = {
    id: "c1", documentId: "d1", title: "塔罗会", content: "成员在灰雾之上聚会。",
    sourceId: "s1", sourceType: "wiki", sourceRepo: "r", sourceCommit: "c",
    sourcePath: "wiki/tarot.md", sourceLocator: "tarot#1", language: "zh-CN",
    canonLayer: "canon", sourceGrade: "A", visibility: "public", spoilerScope: "all",
    topics: ["organizations"], entities: [{ type: "organization", name: "塔罗会" }],
    aliases: [], relations: [], contentHash: "h", updatedAt: "t",
  };
  const pkg = buildContextPackage(
    {
      chunks: [chunk],
      context: "[s1·A·canon] 塔罗会：成员在灰雾之上聚会。",
      trace: {
        query: "塔罗会",
        normalizedQuery: "塔罗会",
        detectedEntities: [],
        filters: {},
        lexicalCandidates: 1,
        vectorCandidates: 0,
        fusedScores: [],
        rejectedCandidates: [],
        selectedChunks: ["c1"],
        sourceIds: ["s1"],
        latencyMs: 1,
        contextSize: 30,
        fallbackMode: "lexical-only",
      },
      fallback: false,
    },
    {
      text: "塔罗会",
      filters: { audience: { kind: "player", knownLoreIds: [], topicGrants: [] } },
    }
  );
  assert.equal(pkg.evidence.length, 1);
  assert.equal(pkg.evidence[0].locator, "wiki/tarot.md#tarot#1");
  assert.ok(pkg.forbiddenInference.length >= 3);
  const rendered = renderContextPackage(pkg, "玩家");
  assert.match(rendered, /证据切片/);
  assert.match(rendered, /禁止推断项/);

  const emptyPkg = buildContextPackage(
    {
      chunks: [],
      context: "",
      trace: {
        query: "无答案问题",
        normalizedQuery: "无答案问题",
        detectedEntities: [],
        filters: {},
        lexicalCandidates: 0,
        vectorCandidates: 0,
        fusedScores: [],
        rejectedCandidates: [],
        selectedChunks: [],
        sourceIds: [],
        latencyMs: 1,
        contextSize: 0,
        fallbackMode: "lexical-only",
      },
      fallback: false,
    },
    { text: "无答案问题", filters: { audience: { kind: "player", knownLoreIds: [], topicGrants: [] } } }
  );
  assert.equal(emptyPkg.insufficient, true);
  assert.match(emptyPkg.unknowns[0], /资料不足/);
});
