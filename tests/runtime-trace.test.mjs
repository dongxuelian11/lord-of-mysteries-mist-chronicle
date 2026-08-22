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

test("model calls emit correlation and outcome traces without retaining prompt text", async () => {
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
    assert.equal(trace?.inputTokens, null);
    assert.equal(trace?.outputTokens, null);
    assert.doesNotMatch(JSON.stringify(trace), /private system prompt|private user prompt/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
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
  assert.equal(turnTrace?.commitStatus, "COMMITTED");
  assert.throws(() => applyWorldTurn(kernel, delta), /事务/);
  const rejectedTrace = recentRuntimeTraces().at(-1);
  assert.equal(rejectedTrace?.operation, "turn");
  assert.equal(rejectedTrace?.outcome, "FAILED");
  assert.equal(rejectedTrace?.commitStatus, "REJECTED");
  assert.deepEqual(rejectedTrace?.rejectionReasons, ["TURN_TRANSACTION_REJECTED"]);
});
