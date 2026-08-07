// 能力 Trace：有界环形，只保存最小元数据。
import { TRACE_LIMIT } from "./config.ts";
import type { AbilityTrace } from "./types.ts";

const ring: AbilityTrace[] = [];

export function recordAbilityTrace(trace: AbilityTrace): void {
  ring.push(trace);
  if (ring.length > TRACE_LIMIT) ring.shift();
}

export function recentAbilityTraces(): AbilityTrace[] {
  return [...ring];
}

export function abilityTraceCount(): number {
  return ring.length;
}
