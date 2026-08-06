// 检索追踪：内存环形缓冲 + 开发模式 NDJSON 落盘（绝不写入被拒内容本身）。
import type { RagTrace } from "./types";

const MAX_TRACES = 64;
const ring: RagTrace[] = [];

export function recordTrace(trace: RagTrace): void {
  ring.push(trace);
  if (ring.length > MAX_TRACES) ring.shift();
}

export function recentTraces(): RagTrace[] {
  return [...ring];
}

export function traceSummary(trace: RagTrace): Record<string, unknown> {
  return {
    query: trace.query,
    normalizedQuery: trace.normalizedQuery,
    entities: trace.detectedEntities,
    filters: trace.filters,
    lexicalCandidates: trace.lexicalCandidates,
    vectorCandidates: trace.vectorCandidates,
    selected: trace.selectedChunks.length,
    sources: trace.sourceIds.length,
    latencyMs: trace.latencyMs,
    contextSize: trace.contextSize,
    fallbackMode: trace.fallbackMode,
    rejectedCount: trace.rejectedCandidates.length,
  };
}
