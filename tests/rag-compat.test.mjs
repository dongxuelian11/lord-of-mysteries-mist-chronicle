import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("兼容门面：retrieveLoreContext 保持同步签名与旧返回形状", async () => {
  const rag = await loadRuntimeModule("app/rag/index.ts");
  const sampleRecords = [
    {
      id: "legacy-1",
      title: "占卜家途径",
      content: "序列9是占卜家。",
      visibility: "public",
      topics: ["pathways"],
      sourceIds: ["S01"],
      sourceGrade: "A",
    },
  ];
  const result = rag.retrieveLoreContext(sampleRecords, {
    query: "占卜家途径的序列9",
    audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
    limit: 4,
    maxChars: 2000,
  });
  assert.equal(typeof result.context, "string");
  assert.ok(Array.isArray(result.records));
  for (const record of result.records) {
    assert.equal(typeof record.id, "string");
    assert.equal(typeof record.title, "string");
    assert.equal(typeof record.content, "string");
  }

  const info = rag.ragEngineInfo();
  const emptyResult = rag.retrieveLoreContext([], {
    query: "不存在的内容",
    audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
    limit: 4,
    maxChars: 2000,
  });
  if (info.mode === "legacy") {
    assert.equal(emptyResult.context, "");
    assert.equal(emptyResult.records.length, 0);
  } else {
    assert.ok(info.chunks > 0);
    assert.equal(emptyResult.context.length > 0, true);
  }
});

test("Electron 桥接失败时 fail closed，不允许回退渲染端旧版检索", async () => {
  const { retrieveLoreContextAsync } = await loadRuntimeModule("app/rag/client.ts");
  const originalWindow = globalThis.window;
  globalThis.window = {
    mistRag: {
      search: async () => {
        throw new Error("rag worker down");
      },
      status: async () => ({ available: false, chunks: 0 }),
    },
  };
  try {
    const records = [
      {
        id: "legacy-1",
        title: "占卜家途径",
        content: "序列9是占卜家。",
        visibility: "public",
        topics: ["pathways"],
        sourceIds: ["S01"],
        sourceGrade: "A",
      },
    ];
    await assert.rejects(retrieveLoreContextAsync(records, {
      query: "占卜家途径的序列9",
      audience: { kind: "player-known", principalRef: "player", purpose: "player-ability", knownLoreIds: [], topicGrants: [] },
      limit: 4,
      maxChars: 2000,
    }), /RAG_GATEWAY_UNAVAILABLE/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
  await closeRuntimeServer();
});
