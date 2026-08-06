import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createRagIpc } = require("../electron/rag-ipc.cjs");

function fakeWorker() {
  const emitter = new EventEmitter();
  const sent = [];
  emitter.postMessage = (message) => {
    sent.push(message);
    emitter.emit("posted", message);
  };
  return { emitter, sent };
}

function wire(ipc, emitter) {
  emitter.on("message", (message) => ipc.handleResponse(message));
}

test("IPC：正常响应完成并清理 pending/timer", async () => {
  const { emitter, sent } = fakeWorker();
  const ipc = createRagIpc({ timeoutMs: 5000 });
  wire(ipc, emitter);
  const promise = ipc.request((message) => emitter.postMessage(message), "status", null);
  emitter.emit("message", { id: sent[0].id, ok: true, payload: { available: true } });
  assert.deepEqual(await promise, { available: true });
  assert.equal(ipc.pendingCount(), 0);
});

test("IPC：Worker 永不响应时超时，pending 归零", async () => {
  const { emitter } = fakeWorker();
  const ipc = createRagIpc({ timeoutMs: 30 });
  wire(ipc, emitter);
  await assert.rejects(
    ipc.request((message) => emitter.postMessage(message), "search", { query: "占卜" }),
    (error) => error.code === "RAG_IPC_TIMEOUT"
  );
  assert.equal(ipc.pendingCount(), 0);
});

test("IPC：超时后的迟到响应被安全忽略，不影响新请求", async () => {
  const { emitter, sent } = fakeWorker();
  const ipc = createRagIpc({ timeoutMs: 30 });
  wire(ipc, emitter);
  const first = ipc.request((message) => emitter.postMessage(message), "search", { query: "a" });
  await assert.rejects(first, (error) => error.code === "RAG_IPC_TIMEOUT");
  // 迟到响应：id 已不在 pending，返回 false 且不抛错
  assert.equal(ipc.handleResponse({ id: sent[0].id, ok: true, payload: {} }), false);
  // 下一个正常请求成功
  const second = ipc.request((message) => emitter.postMessage(message), "status", null);
  emitter.emit("message", { id: sent[1].id, ok: true, payload: { ok: true } });
  assert.deepEqual(await second, { ok: true });
  assert.equal(ipc.pendingCount(), 0);
});

test("IPC：Worker 退出时 abortAll 拒绝全部 pending 并清理 timer", async () => {
  const { emitter } = fakeWorker();
  const ipc = createRagIpc({ timeoutMs: 5000 });
  wire(ipc, emitter);
  const promise = ipc.request((message) => emitter.postMessage(message), "search", { query: "b" });
  const count = ipc.abortAll("rag worker exited");
  assert.equal(count, 1);
  await assert.rejects(promise, (error) => error.code === "RAG_IPC_ABORTED");
  assert.equal(ipc.pendingCount(), 0);
});

test("IPC：连续 100 次超时后 pending=0，随后正常请求成功", async () => {
  const { emitter, sent } = fakeWorker();
  const ipc = createRagIpc({ timeoutMs: 20 });
  wire(ipc, emitter);
  for (let i = 0; i < 100; i += 1) {
    await assert.rejects(
      ipc.request((message) => emitter.postMessage(message), "search", { query: `q${i}` }),
      (error) => error.code === "RAG_IPC_TIMEOUT"
    );
  }
  assert.equal(ipc.pendingCount(), 0);
  const ok = ipc.request((message) => emitter.postMessage(message), "status", null);
  emitter.emit("message", { id: sent[100].id, ok: true, payload: { available: true } });
  assert.deepEqual(await ok, { available: true });
  assert.equal(ipc.pendingCount(), 0);
});

test("IPC：业务错误响应拒绝并清理 pending", async () => {
  const { emitter, sent } = fakeWorker();
  const ipc = createRagIpc({ timeoutMs: 5000 });
  wire(ipc, emitter);
  const promise = ipc.request((message) => emitter.postMessage(message), "search", { query: "c" });
  emitter.emit("message", { id: sent[0].id, ok: false, payload: { error: "invalid-horizon" } });
  await assert.rejects(promise, /invalid-horizon/);
  assert.equal(ipc.pendingCount(), 0);
});
