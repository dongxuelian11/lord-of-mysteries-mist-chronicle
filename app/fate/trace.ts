// 命运 Trace：有界环，只保存最小元数据。
import { FATE_ALGORITHM_VERSION } from "./config.ts";
import type { FateSeverity, FateTrace } from "./types.ts";

const TRACE_LIMIT = 64;
const ring: FateTrace[] = [];

export function recordFateTrace(trace: FateTrace): void {
  ring.push(trace);
  if (ring.length > TRACE_LIMIT) ring.shift();
}

export function recentFateTraces(): FateTrace[] {
  return [...ring];
}

export function fateTraceCount(): number {
  return ring.length;
}

export function recordFateTraceFromContract(contract: {
  fateId: string;
  resolutionId: string;
  eligible: boolean;
  triggered: boolean;
  pressureBefore: number;
  pressureAfter: number;
  templateId?: string;
  severity?: FateSeverity;
}, latencyMs: number): void {
  recordFateTrace({
    fateId: contract.fateId,
    resolutionId: contract.resolutionId,
    eligible: contract.eligible,
    triggered: contract.triggered,
    pressureBefore: contract.pressureBefore,
    pressureAfter: contract.pressureAfter,
    templateId: contract.templateId,
    severity: contract.severity,
    latencyMs,
  });
}

export { FATE_ALGORITHM_VERSION };
