// RAG IPC 请求生命周期：每个请求有明确超时，超时/退出/关闭时清理 pending，
// 迟到响应安全忽略。纯 Node 模块，主进程与测试共用。
"use strict";

const DEFAULT_TIMEOUT_MS = 15000;

function createRagIpc(options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const pending = new Map();
  let sequence = 0;

  function request(send, type, payload) {
    const id = `rag-${now()}-${sequence++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(
          Object.assign(new Error("rag-ipc-timeout"), { code: "RAG_IPC_TIMEOUT", type })
        );
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        send({ type, id, payload });
      } catch (error) {
        clearTimer(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  function handleResponse(message) {
    if (!message || typeof message !== "object" || message.id === undefined) return false;
    const entry = pending.get(message.id);
    if (!entry) return false; // 迟到响应/未知 id：安全忽略
    pending.delete(message.id);
    clearTimer(entry.timer);
    if (message.ok) entry.resolve(message.payload);
    else entry.reject(new Error(message.payload?.error ?? "rag worker error"));
    return true;
  }

  function abortAll(reason = "rag worker exited") {
    const entries = [...pending.values()];
    pending.clear();
    for (const entry of entries) {
      clearTimer(entry.timer);
      entry.reject(Object.assign(new Error(reason), { code: "RAG_IPC_ABORTED" }));
    }
    return entries.length;
  }

  function pendingCount() {
    return pending.size;
  }

  return { request, handleResponse, abortAll, pendingCount, timeoutMs };
}

module.exports = { createRagIpc, DEFAULT_TIMEOUT_MS };
