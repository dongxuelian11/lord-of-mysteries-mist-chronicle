// RAG Worker（Electron utilityProcess 子进程）
// 本地离线检索：只从 RAG_INDEX_DIR 读取索引，向主进程返回最终选中切片。
import fs from "node:fs";
import path from "node:path";
import { JsHybridRetriever } from "../scripts/rag/lib/search.mjs";

const indexDir = process.env.RAG_INDEX_DIR || "";
const port = process.parentPort ?? null;

let retriever = null;
let status = { available: false, chunks: 0, reason: "no-index" };
let activeRequests = 0;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function loadIndex() {
  retriever = null;
  status = { available: false, chunks: 0, reason: "no-index" };
  if (!indexDir) {
    status.reason = "RAG_INDEX_DIR-not-set";
    return;
  }
  const meta = readJson(path.join(indexDir, "index.meta.json"));
  if (!meta || meta.version !== 2) {
    status.reason = meta ? "index-version-mismatch" : "index-meta-missing";
    return;
  }
  const chunks = readJson(path.join(indexDir, "chunks.json")) ?? [];
  const inverted = readJson(path.join(indexDir, "inverted.json")) ?? {};
  const aliasMap = readJson(path.join(indexDir, "alias-map.json")) ?? {};
  const vectors = readJson(path.join(indexDir, "vectors.json")) ?? undefined;
  retriever = new JsHybridRetriever({ chunks, inverted, aliasMap, vectors });
  status = { available: true, chunks: chunks.length };
}

loadIndex();

const AUDIENCE_KINDS = new Set([
  "world",
  "player",
  "actor",
  "world-simulation-internal",
  "player-facing-narrator",
  "player-known",
  "actor-private",
]);

function isValidHorizon(horizon) {
  if (!horizon || typeof horizon !== "object") return false;
  if (!["LOTM", "COI"].includes(horizon.work)) return false;
  if (
    horizon.maxVolume !== null &&
    horizon.maxVolume !== undefined &&
    (typeof horizon.maxVolume !== "number" || horizon.maxVolume < 1 || horizon.maxVolume > 7)
  ) {
    return false;
  }
  if (
    horizon.maxAbsoluteChapter !== null &&
    horizon.maxAbsoluteChapter !== undefined &&
    (typeof horizon.maxAbsoluteChapter !== "number" || horizon.maxAbsoluteChapter < 0)
  ) {
    return false;
  }
  if (!Array.isArray(horizon.allowedEventIds)) return false;
  if (!Array.isArray(horizon.revealedIdentityIds)) return false;
  if (
    !["canon-aligned", "canon-diverged", "post-canon", "custom"].includes(
      horizon.worldlineMode
    )
  ) {
    return false;
  }
  return true;
}

function validateSearchPayload(payload) {
  if (!payload || typeof payload !== "object") return { error: "invalid-payload" };
  if (typeof payload.query !== "string" || !payload.query.trim()) {
    return { error: "invalid-query" };
  }
  const audience = payload.audience;
  if (
    !audience ||
    typeof audience !== "object" ||
    !AUDIENCE_KINDS.has(audience.kind) ||
    !Array.isArray(audience.knownLoreIds) ||
    !Array.isArray(audience.topicGrants)
  ) {
    return { error: "invalid-audience" };
  }
  if (
    payload.limit !== undefined &&
    (typeof payload.limit !== "number" || payload.limit < 1 || payload.limit > 32)
  ) {
    return { error: "invalid-limit" };
  }
  if (
    payload.maxChars !== undefined &&
    (typeof payload.maxChars !== "number" ||
      payload.maxChars < 240 ||
      payload.maxChars > 24000)
  ) {
    return { error: "invalid-maxChars" };
  }
  if (payload.horizon !== undefined && !isValidHorizon(payload.horizon)) {
    return { error: "invalid-horizon" };
  }
  return { ok: true };
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers ?? 0,
    chunks: retriever ? retriever.chunks.length : 0,
    aliasEntries: retriever ? retriever.aliasIndex.size : 0,
    traceCount: 0,
    cacheCount: 0,
    activeRequests,
  };
}

function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  const { type, id } = message;
  const send = (payload) => {
    const response = { id, ...payload };
    if (port) port.postMessage(response);
    else if (typeof process.send === "function") process.send(response);
  };
  try {
    if (type === "search") {
      const validation = validateSearchPayload(message.payload);
      if (validation.error || !retriever) {
        send({ ok: false, payload: { error: validation.error ?? "rag-unavailable" } });
        return;
      }
      activeRequests += 1;
      let result;
      try {
        result = retriever.searchSync({
          text: message.payload.query,
          filters: {
            audience: message.payload.audience,
            week: message.payload.week,
            gameDate: message.payload.gameDate,
            maxSpoilerScope: message.payload.maxSpoilerScope ?? "all",
            allowedVolumes: message.payload.allowedVolumes,
            horizon: message.payload.horizon,
          },
          limit: message.payload.limit,
          maxChars: message.payload.maxChars,
        });
      } finally {
        activeRequests -= 1;
      }
      send({
        ok: true,
        payload: {
          available: true,
          records: result.chunks.map((chunk) => ({
            id: chunk.id,
            documentId: chunk.documentId,
            title: chunk.title,
            content: chunk.content,
            visibility: chunk.visibility,
            topics: chunk.topics,
            sourceId: chunk.sourceId,
            sourceGrade: chunk.sourceGrade,
            canonLayer: chunk.canonLayer,
            sourceLocator: chunk.sourceLocator,
            work: chunk.work,
            volumeNumber: chunk.volumeNumber,
            absoluteChapter: chunk.absoluteChapter,
            spoilerScope: chunk.spoilerScope,
            identityIds: chunk.identityIds,
            eventId: chunk.eventId,
          })),
          context: result.context,
        },
      });
      return;
    }
    if (type === "listChunkIds") {
      send({ ok: true, payload: retriever ? retriever.allChunkIds() : [] });
      return;
    }
    if (type === "status") {
      send({ ok: true, payload: status });
      return;
    }
    if (type === "reload") {
      loadIndex();
      send({ ok: true, payload: status });
      return;
    }
    if (type === "mem") {
      send({ ok: true, payload: memorySnapshot() });
      return;
    }
    if (type === "gc") {
      if (typeof global.gc === "function") global.gc();
      send({ ok: true, payload: memorySnapshot() });
      return;
    }
    send({ ok: false, payload: { error: "unknown-type" } });
  } catch (error) {
    send({ ok: false, payload: { error: String(error?.message ?? error) } });
  }
}

if (port) {
  port.on("message", (event) => handleMessage(event.data));
} else if (typeof process.on === "function") {
  process.on("message", handleMessage);
}

console.log(
  `[rag-worker] started indexDir=${indexDir || "(none)"} available=${status.available} chunks=${status.chunks}`
);
