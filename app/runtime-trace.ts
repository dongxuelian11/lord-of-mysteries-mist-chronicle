import { sha256Hex } from "./sha256.ts";

/**
 * Bounded, privacy-safe runtime observability.
 *
 * Traces intentionally contain identifiers, counters and outcome codes only.
 * Prompts, model payloads, retrieved text, save data and API credentials must
 * never be placed in this envelope. Unknown provider metrics remain `null` so
 * a local estimate cannot be mistaken for tokenizer-backed evidence.
 */

export const RUNTIME_TRACE_SCHEMA_VERSION = 1 as const;
export const RUNTIME_TRACE_LIMIT = 128;

export type RuntimeTraceOperation = "model" | "retrieval" | "turn";
export type RuntimeTraceOutcome = "PASS" | "FAILED" | "NOT_RUN" | "PENDING" | "BLOCKED";
export type RuntimeCommitStatus =
  | "NOT_APPLICABLE"
  | "PENDING"
  | "COMMITTED"
  | "REPLAYED"
  | "REJECTED"
  | "FAILED";

export type RuntimeTraceContext = {
  traceId?: string;
  requestId?: string;
  turnId?: string;
  retrievalId?: string;
  modelTraceId?: string;
  promptVersion?: string;
  responseSchemaVersion?: string;
  modelQuantization?: string;
  repairCount?: number;
};

export type RuntimeTrace = {
  schemaVersion: typeof RUNTIME_TRACE_SCHEMA_VERSION;
  traceInstanceId: string;
  recordedAt: string;
  traceId: string;
  operation: RuntimeTraceOperation;
  requestId: string | null;
  turnId: string | null;
  retrievalId: string | null;
  modelTraceId: string | null;
  modelId: string | null;
  modelQuantization: string | null;
  promptVersion: string | null;
  responseSchemaVersion: string | null;
  retrievalMode: "bridge" | "legacy" | null;
  retrievalSelectedCount: number | null;
  retrievalRejectedCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  firstTokenLatencyMs: number | null;
  latencyMs: number | null;
  repairCount: number;
  rejectionReasons: string[];
  outcome: RuntimeTraceOutcome;
  commitStatus: RuntimeCommitStatus;
};

export type RuntimeTraceInput = {
  traceInstanceId?: string;
  recordedAt?: string;
  traceId: string;
  operation: RuntimeTraceOperation;
  requestId?: string | null;
  turnId?: string | null;
  retrievalId?: string | null;
  modelTraceId?: string | null;
  modelId?: string | null;
  modelQuantization?: string | null;
  promptVersion?: string | null;
  responseSchemaVersion?: string | null;
  retrievalMode?: "bridge" | "legacy" | null;
  retrievalSelectedCount?: number | null;
  retrievalRejectedCount?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  firstTokenLatencyMs?: number | null;
  latencyMs?: number | null;
  repairCount?: number;
  rejectionReasons?: string[];
  outcome?: RuntimeTraceOutcome;
  commitStatus?: RuntimeCommitStatus;
};

const ring: RuntimeTrace[] = [];
const OPERATIONS = new Set<RuntimeTraceOperation>(["model", "retrieval", "turn"]);
const OUTCOMES = new Set<RuntimeTraceOutcome>(["PASS", "FAILED", "NOT_RUN", "PENDING", "BLOCKED"]);
const COMMIT_STATUSES = new Set<RuntimeCommitStatus>(["NOT_APPLICABLE", "PENDING", "COMMITTED", "REPLAYED", "REJECTED", "FAILED"]);
const RETRIEVAL_MODES = new Set(["bridge", "legacy"]);

function identifier(value: string | null | undefined, label: string): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 160) throw new Error(`${label} exceeds runtime trace bound`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${label} contains control characters`);
  return normalized;
}

function metric(value: number | null | undefined, label: string, integer = false): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite number`);
  return integer ? Math.round(value) : Math.round(value * 100) / 100;
}

function reasons(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, 8)
    .map((value) => {
      if (value.length > 120) throw new Error("runtime trace rejection reason exceeds bound");
      if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error("runtime trace rejection reason contains control characters");
      return value;
    });
}

export function createRuntimeTrace(input: RuntimeTraceInput): RuntimeTrace {
  const traceId = identifier(input.traceId, "traceId");
  if (!traceId) throw new Error("runtime trace requires traceId");
  if (!OPERATIONS.has(input.operation)) throw new Error("runtime trace operation is not registered");
  if (!OUTCOMES.has(input.outcome ?? "PASS")) throw new Error("runtime trace outcome is not registered");
  if (!COMMIT_STATUSES.has(input.commitStatus ?? "NOT_APPLICABLE")) throw new Error("runtime trace commitStatus is not registered");
  if (input.retrievalMode !== undefined && input.retrievalMode !== null && !RETRIEVAL_MODES.has(input.retrievalMode)) throw new Error("runtime trace retrievalMode is not registered");
  const repairCount = metric(input.repairCount ?? 0, "repairCount", true) ?? 0;
  const recordedAt = typeof input.recordedAt === "string" && Number.isFinite(Date.parse(input.recordedAt)) ? new Date(input.recordedAt).toISOString() : new Date().toISOString();
  const traceInstanceId = identifier(input.traceInstanceId, "traceInstanceId")
    ?? `trace-instance:${globalThis.crypto?.randomUUID?.() ?? sha256Hex(`${traceId}|${recordedAt}|${Math.random()}`)}`;
  return {
    schemaVersion: RUNTIME_TRACE_SCHEMA_VERSION,
    traceInstanceId,
    recordedAt,
    traceId,
    operation: input.operation,
    requestId: identifier(input.requestId, "requestId"),
    turnId: identifier(input.turnId, "turnId"),
    retrievalId: identifier(input.retrievalId, "retrievalId"),
    modelTraceId: identifier(input.modelTraceId, "modelTraceId"),
    modelId: identifier(input.modelId, "modelId"),
    modelQuantization: identifier(input.modelQuantization, "modelQuantization"),
    promptVersion: identifier(input.promptVersion, "promptVersion"),
    responseSchemaVersion: identifier(input.responseSchemaVersion, "responseSchemaVersion"),
    retrievalMode: input.retrievalMode ?? null,
    retrievalSelectedCount: metric(input.retrievalSelectedCount, "retrievalSelectedCount", true),
    retrievalRejectedCount: metric(input.retrievalRejectedCount, "retrievalRejectedCount", true),
    inputTokens: metric(input.inputTokens, "inputTokens", true),
    outputTokens: metric(input.outputTokens, "outputTokens", true),
    firstTokenLatencyMs: metric(input.firstTokenLatencyMs, "firstTokenLatencyMs"),
    latencyMs: metric(input.latencyMs, "latencyMs"),
    repairCount,
    rejectionReasons: reasons(input.rejectionReasons),
    outcome: input.outcome ?? "PASS",
    commitStatus: input.commitStatus ?? "NOT_APPLICABLE",
  };
}

export function recordRuntimeTrace(input: RuntimeTraceInput | RuntimeTrace): void {
  const trace = createRuntimeTrace(input);
  ring.push(trace);
  if (ring.length > RUNTIME_TRACE_LIMIT) ring.shift();
  const awaitsDurableTurnAck = trace.operation === "turn"
    && ["PENDING", "COMMITTED", "REPLAYED"].includes(trace.commitStatus);
  if (awaitsDurableTurnAck) return;
  try {
    void window.mistRuntimeTrace?.record(trace as unknown as Record<string, unknown>).catch(() => undefined);
  } catch {
    // Browser preview and early startup have no durable trace bridge.
  }
}

/** Instrumentation must never change model, retrieval or commit semantics. */
export function tryRecordRuntimeTrace(input: RuntimeTraceInput | RuntimeTrace): void {
  try {
    recordRuntimeTrace(input);
  } catch {
    // Drop malformed diagnostic data rather than failing the authoritative path.
  }
}

export function recentRuntimeTraces(): RuntimeTrace[] {
  return ring.map((trace) => ({ ...trace, rejectionReasons: [...trace.rejectionReasons] }));
}

export function runtimeTracesForDurableCommit(): RuntimeTrace[] {
  return recentRuntimeTraces().filter((trace) => trace.operation !== "turn"
    || !["COMMITTED", "REPLAYED"].includes(trace.commitStatus));
}

/**
 * Promote only Main-acknowledged turn candidates. This deliberately performs
 * no IPC write: Main already persisted the final status inside commitTurn.
 */
export function acknowledgeDurableTurnTrace(turnId: string, replayed: boolean): number {
  const normalized = identifier(turnId, "turnId");
  if (!normalized) return 0;
  let updated = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const trace = ring[index];
    if (trace.operation !== "turn" || trace.turnId !== normalized || trace.commitStatus !== "PENDING") continue;
    ring[index] = { ...trace, commitStatus: replayed ? "REPLAYED" : "COMMITTED" };
    updated += 1;
  }
  return updated;
}

export function runtimeTraceCount(): number {
  return ring.length;
}

export function clearRuntimeTraces(): void {
  ring.length = 0;
}

/** Return an explicitly redacted view suitable for diagnostics or UI status. */
export function runtimeTraceSummary(trace: RuntimeTrace): Record<string, unknown> {
  return {
    schemaVersion: trace.schemaVersion,
    traceInstanceId: trace.traceInstanceId,
    recordedAt: trace.recordedAt,
    traceId: trace.traceId,
    operation: trace.operation,
    requestId: trace.requestId,
    turnId: trace.turnId,
    retrievalId: trace.retrievalId,
    modelTraceId: trace.modelTraceId,
    modelId: trace.modelId,
    retrievalMode: trace.retrievalMode,
    retrievalSelectedCount: trace.retrievalSelectedCount,
    retrievalRejectedCount: trace.retrievalRejectedCount,
    latencyMs: trace.latencyMs,
    firstTokenLatencyMs: trace.firstTokenLatencyMs,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    repairCount: trace.repairCount,
    rejectionCount: trace.rejectionReasons.length,
    outcome: trace.outcome,
    commitStatus: trace.commitStatus,
  };
}

/** Deterministic, non-reversible correlation id for calls without a caller id. */
export function deriveRuntimeTraceId(prefix: string, value: string): string {
  const safePrefix = prefix.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 32) || "runtime";
  return `${safePrefix}:${sha256Hex(value)}`;
}
