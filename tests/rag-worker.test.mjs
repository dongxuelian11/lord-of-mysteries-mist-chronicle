import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { root } from "../scripts/rag/lib/paths.mjs";

function startWorker(indexDir) {
  const child = spawn(
    process.execPath,
    [path.join(root, "electron", "rag-worker.mjs")],
    {
      env: { ...process.env, RAG_INDEX_DIR: indexDir, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    }
  );
  const pending = new Map();
  let seq = 0;
  child.on("message", (message) => {
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  return {
    request(type, payload = null) {
      const id = `t-${seq++}`;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        child.send({ type, id, payload });
      });
    },
    kill() {
      child.kill();
    },
  };
}

test("RAG Worker：索引缺失/损坏时安全返回不可用，不崩溃", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-worker-"));
  const worker = startWorker(tmp);
  try {
    const status = await worker.request("status");
    assert.equal(status.payload.available, false);
    const search = await worker.request("search", {
      query: "占卜家",
      audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
    });
    assert.equal(search.payload.error, "rag-unavailable");
    const ids = await worker.request("listChunkIds");
    assert.deepEqual(ids.payload, []);
  } finally {
    worker.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("RAG Worker：损坏的 meta（版本不匹配）同样安全回退", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-worker-"));
  fs.mkdirSync(path.join(tmp, "index"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "index", "index.meta.json"),
    JSON.stringify({ version: 99, chunks: 1 })
  );
  const worker = startWorker(path.join(tmp, "index"));
  try {
    const status = await worker.request("status");
    assert.equal(status.payload.available, false);
    assert.equal(status.payload.reason, "index-version-mismatch");
  } finally {
    worker.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("RAG Worker：有效索引可检索且只返回允许的切片", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-worker-"));
  const chunks = [
    {
      id: "c1", documentId: "d1", title: "占卜家途径", content: "序列9是占卜家。",
      sourceId: "s1", sourceType: "structured", sourceRepo: "r", sourceCommit: "c",
      sourcePath: "p", sourceLocator: "p#1", language: "zh-CN", canonLayer: "canon",
      sourceGrade: "C", visibility: "public", spoilerScope: "volume1", topics: ["pathways"],
      entities: [], aliases: ["愚者途径"], relations: [], contentHash: "h1", updatedAt: "t",
    },
    {
      id: "c2", documentId: "d2", title: "宇宙级秘密", content: "源质来自最初造物主。",
      sourceId: "s2", sourceType: "structured", sourceRepo: "r", sourceCommit: "c",
      sourcePath: "p2", sourceLocator: "p2#1", language: "zh-CN", canonLayer: "canon",
      sourceGrade: "C", visibility: "cosmic", spoilerScope: "all", topics: ["cosmology"],
      entities: [], aliases: [], relations: [], contentHash: "h2", updatedAt: "t",
    },
  ];
  const { buildInverted } = await import("../scripts/rag/lib/index-builder.mjs");
  const { buildAliasMap } = await import("../scripts/rag/lib/index-builder.mjs");
  fs.mkdirSync(path.join(tmp, "index"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "index", "index.meta.json"), JSON.stringify({ version: 2, chunks: 2, documents: 2 }));
  fs.writeFileSync(path.join(tmp, "index", "chunks.json"), JSON.stringify(chunks));
  fs.writeFileSync(path.join(tmp, "index", "inverted.json"), JSON.stringify(buildInverted(chunks)));
  fs.writeFileSync(path.join(tmp, "index", "alias-map.json"), JSON.stringify(buildAliasMap(chunks)));
  const worker = startWorker(path.join(tmp, "index"));
  try {
    const search = await worker.request("search", {
      query: "愚者途径的序列9",
      audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
      limit: 4,
      maxChars: 2000,
    });
    assert.equal(search.payload.available, true);
    const titles = search.payload.records.map((record) => record.title);
    assert.ok(titles.includes("占卜家途径"));
    assert.ok(!titles.includes("宇宙级秘密"), "cosmic 不得返回给 player");
    const ids = await worker.request("listChunkIds");
    assert.deepEqual(new Set(ids.payload), new Set(["c1", "c2"]));
  } finally {
    worker.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
