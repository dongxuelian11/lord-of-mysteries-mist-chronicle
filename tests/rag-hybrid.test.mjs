import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

function makeChunks() {
  return [
    {
      id: "c1", documentId: "d1", title: "占卜家途径", content: "序列9是占卜家，序列8是小丑。",
      sourceId: "s1", sourceType: "structured", sourceRepo: "r", sourceCommit: "c",
      sourcePath: "p1", sourceLocator: "p1#1", language: "zh-CN", canonLayer: "canon",
      sourceGrade: "C", visibility: "public", spoilerScope: "all", topics: ["pathways"],
      entities: [], aliases: ["愚者途径"], relations: [],
      contentHash: "h1", updatedAt: "t",
    },
    {
      id: "c2", documentId: "d2", title: "宇宙级秘密", content: "源质来自最初造物主。",
      sourceId: "s2", sourceType: "structured", sourceRepo: "r", sourceCommit: "c",
      sourcePath: "p2", sourceLocator: "p2#1", language: "zh-CN", canonLayer: "canon",
      sourceGrade: "C", visibility: "cosmic", spoilerScope: "all", topics: ["cosmology"],
      entities: [], aliases: [], relations: [],
      contentHash: "h2", updatedAt: "t",
    },
  ];
}

test("混合检索：别名展开召回 + 权限过滤 + 确定性", async () => {
  const { HybridRetriever } = await loadRuntimeModule("app/rag/hybrid-retriever.ts");
  const { buildInvertedFromChunks } = await loadRuntimeModule("app/rag/lexical-retriever.ts");
  const chunks = makeChunks();
  const retriever = new HybridRetriever({
    chunks,
    inverted: buildInvertedFromChunks(chunks),
  });
  const first = retriever.searchSync({
    text: "愚者途径的序列9",
    filters: {
      audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
    },
    limit: 4,
    maxChars: 2000,
  });
  assert.ok(first.chunks.some((chunk) => chunk.id === "c1"));
  assert.ok(!first.chunks.some((chunk) => chunk.id === "c2"), "cosmic 不得进入玩家上下文");
  const second = retriever.searchSync({
    text: "愚者途径的序列9",
    filters: {
      audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
    },
    limit: 4,
    maxChars: 2000,
  });
  assert.deepEqual(
    { ...first.trace, latencyMs: 0 },
    { ...second.trace, latencyMs: 0 }
  );
});
