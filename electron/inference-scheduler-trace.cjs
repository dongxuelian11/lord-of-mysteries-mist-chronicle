"use strict";

function createSchedulerRuntimeTrace(event, sequence = 1, now = Date.now()) {
  const provider = typeof event?.provider === "string" ? event.provider : "unknown";
  const name = typeof event?.event === "string" ? event.event : "unknown";
  return {
    schemaVersion: 1,
    traceInstanceId: `scheduler-trace:${now}:${sequence}`,
    recordedAt: new Date(now).toISOString(),
    traceId: `scheduler:${provider}:${name}`,
    operation: "model",
    requestId: null,
    turnId: null,
    retrievalId: null,
    modelTraceId: null,
    modelId: `scheduler:${name}`,
    modelQuantization: null,
    promptVersion: null,
    responseSchemaVersion: null,
    retrievalMode: null,
    retrievalSelectedCount: null,
    retrievalRejectedCount: null,
    inputTokens: null,
    outputTokens: null,
    inputTokenAccuracy: null,
    outputTokenAccuracy: null,
    firstTokenLatencyMs: null,
    latencyMs: null,
    repairCount: 0,
    rejectionReasons: event?.reason ? [String(event.reason).slice(0, 120)] : [],
    outcome: name === "success" || name === "concurrency-recovered" || name === "circuit-closed" || name.startsWith("materiality-") ? "PASS" : "FAILED",
    commitStatus: "NOT_APPLICABLE",
  };
}

module.exports = { createSchedulerRuntimeTrace };
