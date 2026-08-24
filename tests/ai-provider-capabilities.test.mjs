import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

const require = createRequire(import.meta.url);

after(() => closeRuntimeServer());

test("provider capability registry is the single typed owner and matches packaged shared data", async () => {
  const capabilities = await loadRuntimeModule("app/ai-provider-capabilities.ts");
  const shared = JSON.parse(await readFile(new URL("../shared/ai-provider-capabilities.json", import.meta.url), "utf8"));
  assert.deepEqual(capabilities.PROVIDER_CAPABILITIES, shared.providers);
  assert.deepEqual(capabilities.TASK_CAPABILITIES, shared.tasks);
  assert.equal(capabilities.getProviderCapability("deepseek").endpointPolicy, "official");
  assert.equal(capabilities.getProviderCapability("compatible").endpointPolicy, "loopback");
});

test("provider endpoint policy fixes DeepSeek and rejects remote compatible endpoints", async () => {
  const { normalizeProviderEndpoint } = await loadRuntimeModule("app/ai-provider-capabilities.ts");
  assert.deepEqual(normalizeProviderEndpoint({ provider: "deepseek", endpoint: "https://attacker.invalid/steal" }), {
    provider: "deepseek",
    url: "https://api.deepseek.com/chat/completions",
  });
  assert.deepEqual(normalizeProviderEndpoint({ provider: "compatible", endpoint: "http://127.0.0.1:8080/v1" }), {
    provider: "compatible",
    url: "http://127.0.0.1:8080/v1/chat/completions",
  });
  assert.throws(() => normalizeProviderEndpoint({ provider: "compatible", endpoint: "https://remote.invalid/v1" }), /endpoint-not-allowed/);
  assert.throws(() => normalizeProviderEndpoint({ provider: "unknown", endpoint: "http://127.0.0.1:8080" }), /provider-not-supported/);
});

test("world and autonomous tasks are structured non-streaming capabilities", async () => {
  const { getTaskCapability, assertTaskCapability } = await loadRuntimeModule("app/ai-provider-capabilities.ts");
  for (const task of ["world-adjudication", "autonomous-planning"]) {
    const capability = getTaskCapability(task);
    assert.equal(capability.structuredOutput, "json-object");
    assert.equal(capability.streaming, false);
    assert.doesNotThrow(() => assertTaskCapability(task, { json: true, stream: false }));
    assert.throws(() => assertTaskCapability(task, { json: false, stream: true }), /task-capability/);
  }
  assert.equal(getTaskCapability("literary-generation").promptMaxChars, 160_000);
});

test("unknown providers and tasks fail closed instead of falling back to compatible", async () => {
  const { getProviderCapability, getTaskCapability, resolveInferenceCapability } = await loadRuntimeModule("app/ai-provider-capabilities.ts");
  assert.throws(() => getProviderCapability("made-up"), /provider-not-supported/);
  assert.throws(() => getTaskCapability("made-up"), /task-not-supported/);
  assert.throws(() => resolveInferenceCapability({ provider: "made-up", endpoint: "http://127.0.0.1" }, "connection-test"), /provider-not-supported/);
});

test("token accounting exposes estimated accuracy when provider usage is unavailable", async () => {
  const { estimateTokenBudget } = await loadRuntimeModule("app/ai-provider-capabilities.ts");
  const estimate = estimateTokenBudget("雾都东区的钟声在清晨改变了调查方向。", "compatible");
  assert.ok(estimate.tokens > 0);
  assert.equal(estimate.accuracy, "estimated");
  assert.equal(estimate.source, "conservative-character-estimate");
  assert.notEqual(estimate.accuracy, "provider-reported");
});

test("default concurrency comes from provider capability, not a queue-local literal", async () => {
  const { getProviderCapability } = await loadRuntimeModule("app/ai-provider-capabilities.ts");
  assert.equal(getProviderCapability("deepseek").defaultConcurrency, 8);
  assert.equal(getProviderCapability("compatible").defaultConcurrency, 8);
  const gatewaySource = require("../electron/inference-gateway.cjs");
  assert.equal(gatewaySource.getProviderCapabilities().deepseek.defaultConcurrency, 8);
});

test("Main gateway consumes capability task bounds for world inference", () => {
  const { normalizeTask, validateStructuredOutput } = require("../electron/inference-gateway.cjs");
  const normalized = normalizeTask({
    task: "world-adjudication",
    config: { provider: "deepseek", endpoint: "ignored", model: "world-model" },
    system: "system",
    user: "user",
    options: { json: true, maxTokens: 999_999 },
  }, { allowWorldAdjudication: true });
  assert.equal(normalized.streaming, false);
  assert.equal(normalized.structuredOutput, "json-object");
  assert.equal(normalized.maxTokens, 12_000);
  assert.equal(normalized.promptMaxChars, 160_000);
  assert.doesNotThrow(() => validateStructuredOutput(normalized, "{\"kernelDelta\":{}}"));
  assert.throws(() => validateStructuredOutput(normalized, "not-json"), /MODEL_RESPONSE_INVALID/);
  assert.throws(() => validateStructuredOutput(normalized, "[]"), /MODEL_RESPONSE_INVALID/);
  assert.throws(() => normalizeTask({
    task: "world-adjudication",
    config: { provider: "deepseek", endpoint: "ignored", model: "world-model" },
    system: "system",
    user: "user",
    options: { json: true, stream: true },
  }, { allowWorldAdjudication: true }), /task-capability-streaming-forbidden/);
});

test("renderer rejects streaming world output before browser transport", async () => {
  const { callModel } = await loadRuntimeModule("app/ai-client.ts");
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }),
  });
  try {
    await assert.rejects(callModel(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "key", model: "model" },
      "system",
      "user",
      { task: "world-adjudication", json: true, stream: true },
    ), /task-capability-streaming-forbidden/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("browser fallback marks conservative token estimates instead of null or exact usage", async () => {
  const { callModel } = await loadRuntimeModule("app/ai-client.ts");
  const { recentRuntimeTraces, clearRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "READY" } }] }),
  });
  clearRuntimeTraces();
  try {
    await callModel(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "key", model: "model" },
      "system prompt",
      "user prompt",
      { task: "connection-test", trace: { traceId: "trace:estimate" } },
    );
    const trace = recentRuntimeTraces().at(-1);
    assert.ok((trace?.inputTokens ?? 0) > 0);
    assert.ok((trace?.outputTokens ?? 0) > 0);
    assert.equal(trace?.inputTokenAccuracy, "estimated");
    assert.equal(trace?.outputTokenAccuracy, "estimated");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("Main usage is recorded as provider-reported token accounting", async () => {
  const { callModel } = await loadRuntimeModule("app/ai-client.ts");
  const { recentRuntimeTraces, clearRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const originalWindow = globalThis.window;
  globalThis.window = {
    mistInference: {
      request: async () => ({ ok: true, content: "READY", usage: { inputTokens: 11, outputTokens: 5 } }),
    },
  };
  clearRuntimeTraces();
  try {
    await callModel(
      { provider: "deepseek", endpoint: "ignored", apiKey: "renderer-secret", model: "deepseek-test" },
      "system",
      "user",
      { task: "connection-test", trace: { traceId: "trace:provider" } },
    );
    const trace = recentRuntimeTraces().at(-1);
    assert.equal(trace?.inputTokens, 11);
    assert.equal(trace?.outputTokens, 5);
    assert.equal(trace?.inputTokenAccuracy, "provider-reported");
    assert.equal(trace?.outputTokenAccuracy, "provider-reported");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
