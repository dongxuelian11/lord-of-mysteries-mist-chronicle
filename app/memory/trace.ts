// 有界 MemoryTrace：只记录 ID/分数/原因，不保存正文与完整 Prompt。
import { TRACE_LIMIT } from "./config.ts";
import type { MemoryTrace } from "./types.ts";

const ring: MemoryTrace[] = [];

export function recordMemoryTrace(trace: MemoryTrace): void {
  ring.push(trace);
  if (ring.length > TRACE_LIMIT) ring.shift();
}

export function recentMemoryTraces(): MemoryTrace[] {
  return [...ring];
}

export function memoryTraceCount(): number {
  return ring.length;
}
