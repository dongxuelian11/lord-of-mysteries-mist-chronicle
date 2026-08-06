import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("records 与 context 一致性：二次过滤剔除禁止记录后 context 不得残留", async () => {
  const { reFilter } = await loadRuntimeModule("app/rag/client.ts");
  const { buildEvidenceContext } = await loadRuntimeModule("app/rag/context-builder.ts");
  const horizon = {
    work: "LOTM",
    maxVolume: 1,
    maxAbsoluteChapter: 195,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned",
  };
  const records = [
    {
      id: "ok-1",
      title: "绯红",
      content: "第一卷正文内容。",
      visibility: "public",
      topics: [],
      sourceId: "zh-lotm-txt",
      sourceGrade: "A",
      canonLayer: "canon-primary",
      sourceLocator: "vol1-ch1",
      work: "LOTM",
      volumeNumber: 1,
      absoluteChapter: 1,
      identityIds: [],
    },
    {
      id: "bad-volume",
      title: "新的旅程",
      content: "第七卷未来正文，禁止泄露。",
      visibility: "public",
      topics: [],
      sourceId: "zh-lotm-txt",
      sourceGrade: "A",
      canonLayer: "canon-primary",
      sourceLocator: "vol7-ch41",
      work: "LOTM",
      volumeNumber: 7,
      absoluteChapter: 1258,
      identityIds: [],
    },
    {
      id: "bad-identity",
      title: "格尔曼的身份",
      content: "格尔曼·斯帕罗的秘密身份正文。",
      visibility: "secret",
      topics: [],
      sourceId: "zh-lotm-txt",
      sourceGrade: "A",
      canonLayer: "canon-primary",
      sourceLocator: "vol3-ch1",
      work: "LOTM",
      volumeNumber: 3,
      absoluteChapter: 448,
      identityIds: ["格尔曼·斯帕罗"],
    },
  ];
  const request = {
    query: "测试",
    audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
    maxSpoilerScope: "all",
    horizon,
    maxChars: 4000,
  };
  const filtered = reFilter(records, request);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "ok-1");
  const context = buildEvidenceContext(filtered, request.maxChars);
  assert.ok(!context.includes("新的旅程"));
  assert.ok(!context.includes("第七卷未来正文"));
  assert.ok(!context.includes("格尔曼"));
  assert.ok(!context.includes("秘密身份正文"));
  assert.ok(context.includes("绯红"));
});

test("records 与 context 一致性：禁止内容不得出现在 citations/别名/错误信息", async () => {
  const { reFilter, toLegacy } = await loadRuntimeModule("app/rag/client.ts");
  const { buildEvidenceContext } = await loadRuntimeModule("app/rag/context-builder.ts");
  const horizon = {
    work: "LOTM",
    maxVolume: 2,
    maxAbsoluteChapter: 446,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned",
  };
  const records = [
    {
      id: "bad-cross-work",
      title: "奥萝尔·李",
      content: "COI 正文内容。",
      visibility: "public",
      topics: [],
      sourceId: "lotm-reader",
      sourceGrade: "A",
      canonLayer: "canon-primary",
      sourceLocator: "coi/1",
      work: "COI",
    },
    {
      id: "ok",
      title: "希望之地",
      content: "第二卷正文内容。",
      visibility: "public",
      topics: [],
      sourceId: "zh-lotm-txt",
      sourceGrade: "A",
      canonLayer: "canon-primary",
      sourceLocator: "vol2-ch1",
      work: "LOTM",
      volumeNumber: 2,
      absoluteChapter: 196,
      identityIds: [],
    },
  ];
  const request = {
    query: "测试",
    audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
    maxSpoilerScope: "all",
    horizon,
    maxChars: 4000,
  };
  const filtered = reFilter(records, request);
  const legacy = toLegacy(filtered);
  const context = buildEvidenceContext(filtered, request.maxChars);
  assert.equal(filtered.length, 1);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].id, "ok");
  assert.ok(!context.includes("奥萝尔"));
  assert.ok(!context.includes("COI 正文"));
  assert.ok(context.includes("希望之地"));
});
