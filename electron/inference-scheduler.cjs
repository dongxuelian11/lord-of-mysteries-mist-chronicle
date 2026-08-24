"use strict";

const sharedCapabilities = require("../shared/ai-provider-capabilities.json");

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function providerCapability(provider, overrides) {
  if (provider !== "deepseek" && provider !== "compatible") throw new Error("provider-not-supported");
  const base = sharedCapabilities.providers[provider];
  return {
    ...base,
    highLatencyMs: 5_000,
    circuitFailureThreshold: 3,
    cooldownMs: 30_000,
    ...(recordOf(overrides?.[provider]) ?? {}),
  };
}

function classifyRetryableError(error, provider = "deepseek") {
  const code = String(error?.code ?? error?.message ?? error ?? "MODEL_REQUEST_FAILED");
  const status = Number(code.match(/^MODEL_HTTP_(\d{3})$/)?.[1]);
  const statuses = sharedCapabilities.providers[provider]?.retryableStatusCodes ?? [];
  if (code === "MODEL_RATE_LIMITED" || code === "MODEL_TIMEOUT" || code === "MODEL_REQUEST_FAILED" || (Number.isInteger(status) && statuses.includes(status))) {
    return { retryable: true, reason: code };
  }
  return { retryable: false, reason: code };
}

function createInferenceScheduler(options = {}) {
  const overrideCapabilities = recordOf(options.capabilities) ?? {};
  const sleep = typeof options.sleep === "function" ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const jitter = typeof options.jitter === "function" ? options.jitter : (ms) => Math.floor(Math.random() * Math.max(1, ms));
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const onTrace = typeof options.onTrace === "function" ? options.onTrace : () => undefined;
  const states = new Map();
  const completed = new Map();
  const inflight = new Map();

  function cacheKey(provider, idempotencyKey) {
    return `${provider}:${idempotencyKey}`;
  }

  function stateFor(provider) {
    const capability = providerCapability(provider, overrideCapabilities);
    let state = states.get(provider);
    if (!state) {
      const configuredLimit = Math.max(1, Math.min(64, Math.round(Number(capability.defaultConcurrency) || 1)));
      state = {
        provider,
        capability,
        configuredLimit,
        limit: configuredLimit,
        active: 0,
        queue: [],
        circuitOpenUntil: 0,
        failures: 0,
        successes: 0,
      };
      states.set(provider, state);
    }
    return state;
  }

  function trace(state, event, extra = {}) {
    try {
      onTrace({
        operation: "inference-scheduler",
        provider: state.provider,
        event,
        limit: state.limit,
        active: state.active,
        queued: state.queue.length,
        ...extra,
      });
    } catch {
      // Diagnostics cannot block model authority.
    }
  }

  function closeExpiredCircuit(state) {
    if (state.circuitOpenUntil > 0 && now() >= state.circuitOpenUntil) {
      state.circuitOpenUntil = 0;
      state.failures = 0;
      trace(state, "circuit-half-open");
    }
  }

  function rejectQueued(state) {
    if (!state.circuitOpenUntil || now() >= state.circuitOpenUntil) return;
    while (state.queue.length) {
      const job = state.queue.shift();
      job.reject(new Error("MODEL_CIRCUIT_OPEN"));
      inflight.delete(cacheKey(state.provider, job.idempotencyKey));
    }
  }

  function reduceConcurrency(state, reason) {
    const next = Math.max(1, Math.floor(state.limit / 2));
    if (next !== state.limit) {
      state.limit = next;
      trace(state, "concurrency-reduced", { reason });
    }
  }

  function recoverConcurrency(state) {
    state.successes += 1;
    state.failures = 0;
    if (state.successes >= 2 && state.limit < state.configuredLimit) {
      state.limit += 1;
      state.successes = 0;
      trace(state, "concurrency-recovered");
    }
    if (state.circuitOpenUntil) {
      state.circuitOpenUntil = 0;
      trace(state, "circuit-closed");
    }
    trace(state, "success");
  }

  function registerFailure(state, error, latencyMs) {
    const classified = classifyRetryableError(error, state.provider);
    const highLatency = Number.isFinite(latencyMs) && latencyMs >= Number(state.capability.highLatencyMs ?? 5_000);
    if (!classified.retryable && !highLatency) return classified;
    state.failures += 1;
    state.successes = 0;
    if (classified.reason === "MODEL_RATE_LIMITED" || highLatency) reduceConcurrency(state, classified.reason === "MODEL_RATE_LIMITED" ? "429" : "high-latency");
    const threshold = Math.max(1, Math.round(Number(state.capability.circuitFailureThreshold) || 3));
    if (state.failures >= threshold && !state.circuitOpenUntil) {
      state.circuitOpenUntil = now() + Math.max(1, Math.round(Number(state.capability.cooldownMs) || 30_000));
      trace(state, "circuit-open", { reason: classified.reason, cooldownMs: state.capability.cooldownMs });
    }
    return classified;
  }

  async function execute(state, job) {
    const maxAttempts = Math.max(1, Math.min(2, Math.round(Number(job.maxAttempts) || 2)));
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const started = now();
      try {
        const result = await job.handler({ attempt, provider: state.provider, task: job.task, idempotencyKey: job.idempotencyKey });
        const latencyMs = Math.max(0, now() - started);
        if (latencyMs >= Number(state.capability.highLatencyMs ?? 5_000)) reduceConcurrency(state, "high-latency");
        recoverConcurrency(state);
        if (completed.size >= 512) completed.delete(completed.keys().next().value);
        completed.set(cacheKey(state.provider, job.idempotencyKey), result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const latencyMs = Math.max(0, now() - started);
        const classified = registerFailure(state, lastError, latencyMs);
        if (!classified.retryable || attempt + 1 >= maxAttempts) throw lastError;
        const baseDelay = 250 * (2 ** attempt);
        const delayMs = baseDelay + Math.max(0, Number(jitter(baseDelay)) || 0);
        trace(state, "retry", { attempt: attempt + 1, reason: classified.reason, delayMs });
        await sleep(delayMs);
      }
    }
    throw lastError ?? new Error("MODEL_REQUEST_FAILED");
  }

  function drain(state) {
    closeExpiredCircuit(state);
    rejectQueued(state);
    while (state.active < state.limit && state.queue.length) {
      closeExpiredCircuit(state);
      if (state.circuitOpenUntil && now() < state.circuitOpenUntil) {
        rejectQueued(state);
        return;
      }
      const job = state.queue.shift();
      state.active += 1;
      execute(state, job).then(job.resolve, job.reject).finally(() => {
        state.active -= 1;
        inflight.delete(cacheKey(state.provider, job.idempotencyKey));
        drain(state);
      });
    }
  }

  function run(request, handler) {
    const input = recordOf(request);
    if (!input || typeof handler !== "function") return Promise.reject(new Error("scheduler-request-invalid"));
    const provider = input.provider;
    const state = stateFor(provider);
    if (typeof input.task !== "string" || !sharedCapabilities.tasks[input.task]) return Promise.reject(new Error("task-not-supported"));
    const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!idempotencyKey || idempotencyKey.length > 240) return Promise.reject(new Error("scheduler-idempotency-key-invalid"));
    closeExpiredCircuit(state);
    const key = cacheKey(provider, idempotencyKey);
    if (completed.has(key)) return Promise.resolve(completed.get(key));
    if (inflight.has(key)) return inflight.get(key);
    if (state.circuitOpenUntil && now() < state.circuitOpenUntil) return Promise.reject(new Error("MODEL_CIRCUIT_OPEN"));
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    inflight.set(key, promise);
    state.queue.push({ task: input.task, idempotencyKey, maxAttempts: input.maxAttempts, handler, resolve, reject });
    drain(state);
    return promise;
  }

  function getStatus(provider) {
    const state = stateFor(provider);
    closeExpiredCircuit(state);
    return {
      provider: state.provider,
      limit: state.limit,
      configuredLimit: state.configuredLimit,
      active: state.active,
      queued: state.queue.length,
      circuitOpen: Boolean(state.circuitOpenUntil && now() < state.circuitOpenUntil),
      circuitOpenUntil: state.circuitOpenUntil || null,
    };
  }

  return { run, getStatus, classifyRetryableError };
}

module.exports = {
  classifyRetryableError,
  createInferenceScheduler,
};
