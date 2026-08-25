import assert from "node:assert/strict";
import test, { after, afterEach } from "node:test";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

afterEach(async () => {
  const { clearRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  clearRuntimeTraces();
  delete globalThis.window;
});

test("runtime trace contract is bounded, redacted and preserves unknown metrics", async () => {
  const { createRuntimeTrace, recentRuntimeTraces, recordRuntimeTrace, runtimeTraceSummary, RUNTIME_TRACE_LIMIT } = await loadRuntimeModule("app/runtime-trace.ts");
  const trace = createRuntimeTrace({
    traceId: "trace:contract",
    operation: "model",
    requestId: "request:1",
    modelId: "model:test",
    inputTokens: null,
    outputTokens: null,
    firstTokenLatencyMs: null,
    latencyMs: 12.34,
    rejectionReasons: ["MODEL_TIMEOUT", "MODEL_TIMEOUT"],
    outcome: "PENDING",
    commitStatus: "NOT_APPLICABLE",
  });
  assert.equal(trace.inputTokens, null);
  assert.equal(trace.outputTokens, null);
  assert.equal(trace.firstTokenLatencyMs, null);
  assert.deepEqual(trace.rejectionReasons, ["MODEL_TIMEOUT"]);
  const summary = runtimeTraceSummary(trace);
  assert.equal("prompt" in summary, false);
  assert.equal("context" in summary, false);

  for (let index = 0; index < RUNTIME_TRACE_LIMIT + 4; index += 1) {
    recordRuntimeTrace({ traceId: `trace:${index}`, operation: "turn" });
  }
  const recent = recentRuntimeTraces();
  assert.equal(recent.length, RUNTIME_TRACE_LIMIT);
  assert.equal(recent[0].traceId, "trace:4");
  assert.notStrictEqual(recent[0].rejectionReasons, recentRuntimeTraces()[0].rejectionReasons);
});

test("runtime traces use unique instances and forward a redacted record to durable desktop storage", async () => {
  const { recordRuntimeTrace, recentRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const forwarded = [];
  globalThis.window = { mistRuntimeTrace: { async record(trace) { forwarded.push(trace); return { available: true, saved: true }; } } };
  recordRuntimeTrace({ traceId: "same-correlation", operation: "model", rejectionReasons: ["MODEL_TIMEOUT"] });
  recordRuntimeTrace({ traceId: "same-correlation", operation: "model", rejectionReasons: ["MODEL_RETRY"] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const traces = recentRuntimeTraces();
  assert.notEqual(traces[0].traceInstanceId, traces[1].traceInstanceId);
  assert.equal(forwarded.length, 2);
  assert.equal("prompt" in forwarded[0], false);
});

test("only a durable acknowledgement can promote a pending turn trace to REPLAYED", async () => {
  const { acknowledgeDurableTurnTrace, recordRuntimeTrace, recentRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const forwarded = [];
  globalThis.window = { mistRuntimeTrace: { async record(trace) { forwarded.push(trace); return { available: true, saved: true }; } } };
  recordRuntimeTrace({ traceInstanceId: "trace-instance:retry", traceId: "turn:world:1", operation: "turn", turnId: "world:1", outcome: "PASS", commitStatus: "PENDING" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(recentRuntimeTraces().at(-1)?.commitStatus, "PENDING");
  assert.equal(forwarded.length, 0);
  assert.equal(acknowledgeDurableTurnTrace("world:1", true), 1);
  assert.equal(recentRuntimeTraces().at(-1)?.commitStatus, "REPLAYED");
  assert.equal(forwarded.length, 0);
});

test("model calls emit correlation and outcome traces with explicit estimated token accuracy", async () => {
  const { recentRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const { callModel } = await loadRuntimeModule("app/ai-client.ts");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }),
  });
  try {
    const result = await callModel(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "model-test" },
      "private system prompt should never enter trace",
      "private user prompt should never enter trace",
      {
        task: "world-adjudication",
        json: true,
        trace: {
          traceId: "turn:1:model",
          requestId: "request:1",
          turnId: "turn:1",
          retrievalId: "rag:1",
          promptVersion: "prompt:v1",
          responseSchemaVersion: "world-envelope:v1",
        },
      },
    );
    assert.equal(result, "{\"ok\":true}");
    const trace = recentRuntimeTraces().at(-1);
    assert.equal(trace?.operation, "model");
    assert.equal(trace?.traceId, "turn:1:model");
    assert.equal(trace?.turnId, "turn:1");
    assert.equal(trace?.retrievalId, "rag:1");
    assert.equal(trace?.outcome, "PASS");
    assert.equal(trace?.commitStatus, "NOT_APPLICABLE");
    assert.ok((trace?.inputTokens ?? 0) > 0);
    assert.ok((trace?.outputTokens ?? 0) > 0);
    assert.equal(trace?.inputTokenAccuracy, "estimated");
    assert.equal(trace?.outputTokenAccuracy, "estimated");
    assert.doesNotMatch(JSON.stringify(trace), /private system prompt|private user prompt/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("desktop model calls send typed requests without renderer credentials", async () => {
  const { callModel } = await loadRuntimeModule("app/ai-client.ts");
  let captured;
  globalThis.window = {
    mistInference: {
      async request(request) {
        captured = request;
        return { ok: true, content: "READY", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  };
  const result = await callModel(
    { provider: "deepseek", endpoint: "https://attacker.invalid", apiKey: "renderer-secret", model: "deepseek-test" },
    "system",
    "user",
    { task: "connection-test", maxTokens: 16 },
  );
  assert.equal(result, "READY");
  assert.equal(captured.task, "connection-test");
  assert.equal(captured.config.endpoint, "https://attacker.invalid");
  assert.equal("apiKey" in captured.config, false);
  assert.equal(JSON.stringify(captured).includes("renderer-secret"), false);
});

test("retrieval and world commit traces share request/turn identifiers", async () => {
  const { recentRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const { retrieveLoreContextAsync } = await loadRuntimeModule("app/rag/client.ts");
  const { createWorldKernel, createWorldTurnTransaction, applyWorldTurn } = await loadRuntimeModule("app/world-kernel.ts");
  const retrieval = await retrieveLoreContextAsync(
    [{ id: "lore-1", title: "一张报纸", content: "东区的雾在清晨散去。", visibility: "public", topics: ["weather"], sourceIds: ["source-1"], sourceGrade: "C", canon: "canon" }],
    {
      query: "东区的雾",
      audience: { kind: "world", knownLoreIds: [], topicGrants: [] },
      trace: { traceId: "turn:1:retrieval", requestId: "request:1", turnId: "turn:1" },
    },
  );
  const kernel = createWorldKernel({
    week: 1,
    date: "1349年6月30日",
    factions: [],
    actors: [],
    locations: [{ id: "east", name: "东区", risk: 20 }],
    timeline: [],
  });
  const delta = {
    week: 1,
    playerIssuedNoOrders: true,
    executableProposalIds: [],
    retrievalReceipt: retrieval.receipt,
    actorUpdates: [],
    factionUpdates: [],
    projectUpdates: [],
    locationUpdates: [],
    events: [],
    observations: [],
  };
  applyWorldTurn(kernel, { ...delta, transaction: createWorldTurnTransaction(kernel, delta, "turn:1") });
  const traces = recentRuntimeTraces();
  const retrievalTrace = traces.find((trace) => trace.operation === "retrieval");
  const turnTrace = traces.find((trace) => trace.operation === "turn");
  assert.equal(retrievalTrace?.requestId, "request:1");
  assert.equal(retrievalTrace?.retrievalId, retrieval.receipt.requestId);
  assert.equal(retrievalTrace?.turnId, "turn:1");
  assert.equal(turnTrace?.requestId, retrieval.receipt.requestId);
  assert.equal(turnTrace?.turnId, "turn:1");
  assert.equal(turnTrace?.commitStatus, "PENDING");
  assert.throws(() => applyWorldTurn(kernel, delta), /事务/);
  const rejectedTrace = recentRuntimeTraces().at(-1);
  assert.equal(rejectedTrace?.operation, "turn");
  assert.equal(rejectedTrace?.outcome, "FAILED");
  assert.equal(rejectedTrace?.commitStatus, "REJECTED");
  assert.deepEqual(rejectedTrace?.rejectionReasons, ["TURN_TRANSACTION_REJECTED"]);
});
