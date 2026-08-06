import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

function makeChunk(overrides = {}) {
  return {
    id: "chunk-1",
    documentId: "doc-1",
    title: "测试条目",
    content: "测试内容",
    sourceId: "test",
    sourceType: "structured",
    sourceRepo: "test",
    sourceCommit: "test",
    sourcePath: "test.md",
    sourceLocator: "test.md#1",
    language: "zh-CN",
    canonLayer: "canon",
    sourceGrade: "C",
    visibility: "public",
    spoilerScope: "all",
    topics: [],
    entities: [],
    aliases: [],
    relations: [],
    contentHash: "hash-1",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

test("权限：cosmic 对 player 默认不可见，rejected 不含内容", async () => {
  const { filterChunk } = await loadRuntimeModule("app/rag/permissions.ts");
  const cosmic = makeChunk({ id: "cosmic-1", title: "宇宙级秘密", visibility: "cosmic" });
  const decision = filterChunk(
    cosmic,
    {
      audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
    },
    new Set()
  );
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /cosmic/);
});

test("权限：knownLoreIds 可按标题/定位符授权 secret", async () => {
  const { filterChunk } = await loadRuntimeModule("app/rag/permissions.ts");
  const secret = makeChunk({
    id: "secret-1",
    title: "秘密条目",
    sourceLocator: "secret#1",
    visibility: "secret",
  });
  const granted = filterChunk(
    secret,
    {
      audience: { kind: "actor", knownLoreIds: ["秘密条目"], topicGrants: [] },
      maxSpoilerScope: "all",
    },
    new Set(["秘密条目"])
  );
  assert.equal(granted.ok, true);
  const denied = filterChunk(
    secret,
    {
      audience: { kind: "actor", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "all",
    },
    new Set()
  );
  assert.equal(denied.ok, false);
});

test("权限：未来周目与第二部剧透被时间/剧透过滤拦截", async () => {
  const { filterChunk } = await loadRuntimeModule("app/rag/permissions.ts");
  const future = makeChunk({
    id: "future-1",
    title: "未来事件",
    timeline: { volume: 2, week: 999 },
    spoilerScope: "volume2",
    visibility: "public",
  });
  const blockedByWeek = filterChunk(
    future,
    {
      audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: "volume1",
      week: 1,
      allowedVolumes: [1],
    },
    new Set()
  );
  assert.equal(blockedByWeek.ok, false);
  assert.ok(["spoiler", "volume", "future-week"].some((key) => blockedByWeek.reason?.includes(key)));
});

test("向量检索：embedding 不可用时静默降级为空候选", async () => {
  const { VectorRetriever } = await loadRuntimeModule("app/rag/vector-retriever.ts");
  const retriever = new VectorRetriever({
    vectors: {},
    provider: {
      embed: async () => {
        throw new Error("embedding service unavailable");
      },
    },
  });
  assert.equal(retriever.available, false);
  const result = await retriever.search("测试", [makeChunk()], new Set([0]), 5);
  assert.deepEqual(result, []);
});
