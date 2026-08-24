import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("provider-aware scheduler reads per-provider concurrency from capability registry", () => {
  const { createInferenceScheduler } = require("../electron/inference-scheduler.cjs");
  const scheduler = createInferenceScheduler({ sleep: async () => undefined, jitter: () => 0 });
  assert.equal(scheduler.getStatus("deepseek").limit, 8);
  assert.equal(scheduler.getStatus("compatible").limit, 8);
  assert.throws(() => scheduler.getStatus("unknown"), /provider-not-supported/);
});

test("same idempotency key shares one queued model call while providers remain isolated", async () => {
  const { createInferenceScheduler } = require("../electron/inference-scheduler.cjs");
  const scheduler = createInferenceScheduler({ capabilities: { deepseek: { defaultConcurrency: 1 }, compatible: { defaultConcurrency: 1 } }, sleep: async () => undefined, jitter: () => 0 });
  let calls = 0;
  let release;
  const blocker = scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "blocker" }, () => new Promise((resolve) => { release = resolve; }));
  const first = scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "same" }, async () => { calls += 1; return "done"; });
  const second = scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "same" }, async () => { calls += 1; return "wrong"; });
  const otherProvider = scheduler.run({ provider: "compatible", task: "connection-test", idempotencyKey: "other" }, async () => "compatible-done");
  assert.equal(await otherProvider, "compatible-done");
  release("released");
  await blocker;
  assert.equal(await first, "done");
  assert.equal(await second, "done");
  assert.equal(calls, 1);
});

test("only connection, timeout, 429 and explicit 5xx failures retry", async () => {
  const { createInferenceScheduler, classifyRetryableError } = require("../electron/inference-scheduler.cjs");
  assert.equal(classifyRetryableError(new Error("MODEL_RATE_LIMITED")).retryable, true);
  assert.equal(classifyRetryableError(new Error("MODEL_HTTP_503")).retryable, true);
  assert.equal(classifyRetryableError(new Error("MODEL_TIMEOUT")).retryable, true);
  assert.equal(classifyRetryableError(new Error("WORLD_INFERENCE_MANIFEST_FAILED")).retryable, false);
  assert.equal(classifyRetryableError(new Error("MODEL_RESPONSE_INVALID")).retryable, false);
  const delays = [];
  const scheduler = createInferenceScheduler({ sleep: async (ms) => delays.push(ms), jitter: () => 0 });
  let attempts = 0;
  const value = await scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "retry" }, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("MODEL_HTTP_503");
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(attempts, 2);
  assert.equal(delays.length, 1);
  let authorityAttempts = 0;
  await assert.rejects(scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "authority" }, async () => {
    authorityAttempts += 1;
    throw new Error("WORLD_INFERENCE_MANIFEST_FAILED");
  }), /WORLD_INFERENCE_MANIFEST_FAILED/);
  assert.equal(authorityAttempts, 1);
});

test("429/high latency reduce concurrency, successes recover slowly, and circuit state is observable", async () => {
  const traces = [];
  const { createInferenceScheduler } = require("../electron/inference-scheduler.cjs");
  const scheduler = createInferenceScheduler({
    sleep: async () => undefined,
    jitter: () => 0,
    capabilities: { deepseek: { defaultConcurrency: 4, highLatencyMs: 10, circuitFailureThreshold: 2, cooldownMs: 1 } },
    now: (() => { let value = 0; return () => value += 20; })(),
    onTrace: (trace) => traces.push(trace),
  });
  await assert.rejects(scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "fail-1" }, async () => { throw new Error("MODEL_RATE_LIMITED"); }), /MODEL_RATE_LIMITED/);
  await assert.rejects(scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "fail-2" }, async () => { throw new Error("MODEL_RATE_LIMITED"); }), /MODEL_RATE_LIMITED/);
  assert.ok(scheduler.getStatus("deepseek").limit < 4);
  assert.ok(traces.some((trace) => trace.event === "circuit-open" || trace.event === "concurrency-reduced"));
  await new Promise((resolve) => setTimeout(resolve, 2));
  const result = await scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "recover" }, async () => "ok");
  assert.equal(result, "ok");
  assert.ok(scheduler.getStatus("deepseek").limit >= 1);
  assert.ok(traces.some((trace) => trace.event === "success"));
});
