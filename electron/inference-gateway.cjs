"use strict";

const CAPABILITIES = require("../shared/ai-provider-capabilities.json");
const PROVIDERS = CAPABILITIES.providers;
const TASK_CAPABILITIES = CAPABILITIES.tasks;
const TASKS = new Set(Object.keys(TASK_CAPABILITIES).filter((task) => task !== "world-adjudication" && task !== "autonomous-planning"));

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function providerForConfig(config) {
  const raw = config?.provider;
  if (raw === undefined) return /api\.deepseek\.com/i.test(String(config?.endpoint ?? "")) ? "deepseek" : "compatible";
  if (raw !== "deepseek" && raw !== "compatible") throw new Error("provider-not-supported");
  return raw;
}

function normalizedEndpoint(config) {
  const provider = providerForConfig(config);
  const capability = PROVIDERS[provider];
  if (capability.endpointPolicy === "official") return { provider, url: `${capability.officialEndpoint}/chat/completions` };
  let url;
  try { url = new URL(String(config.endpoint ?? "")); }
  catch { throw new Error("endpoint-not-allowed"); }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!localHosts.has(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("endpoint-not-allowed");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!/\/chat\/completions$/i.test(url.pathname)) url.pathname = `${url.pathname}/chat/completions`.replace(/\/{2,}/g, "/");
  return { provider, url: url.toString() };
}

function normalizeTask(input, policy = {}) {
  const task = recordOf(input);
  const internalTask = policy.allowWorldAdjudication === true && task?.task === "world-adjudication"
    || policy.allowAutonomousPlanning === true && task?.task === "autonomous-planning";
  if (!task || !TASKS.has(task.task) && !internalTask) throw new Error("invalid-model-task");
  const config = recordOf(task.config);
  const options = recordOf(task.options) ?? {};
  const system = typeof task.system === "string" ? task.system : "";
  const user = typeof task.user === "string" ? task.user : "";
  if (!config || !system.trim() || !user.trim()) throw new Error("invalid-model-task");
  const model = typeof config.model === "string" ? config.model.trim() : "";
  if (!model || model.length > 160) throw new Error("invalid-model-task");
  const endpoint = normalizedEndpoint(config);
  const capability = TASK_CAPABILITIES[task.task];
  if (!capability) throw new Error("invalid-model-task");
  if (system.length + user.length > capability.promptMaxChars) throw new Error("invalid-model-task");
  const json = options.json === true;
  if (capability.structuredOutput === "json-object" && !json) throw new Error("task-capability-json-required");
  const requestedStreaming = options.stream === true;
  if (requestedStreaming && capability.streaming !== true) throw new Error("task-capability-streaming-forbidden");
  const providerCapability = PROVIDERS[endpoint.provider];
  const requestedTokens = Math.round(Number(options.maxTokens));
  const maxTokens = Math.max(1, Math.min(
    capability.maxOutputTokens,
    providerCapability.maxOutputTokens,
    requestedTokens > 0 ? requestedTokens : (json ? 4_200 : 1_800),
  ));
  return {
    task: task.task,
    provider: endpoint.provider,
    url: endpoint.url,
    model,
    system,
    user,
    json,
    structuredOutput: capability.structuredOutput,
    streaming: capability.streaming === true && requestedStreaming,
    promptMaxChars: capability.promptMaxChars,
    maxTokens,
    temperature: typeof options.temperature === "number" && Number.isFinite(options.temperature)
      ? Math.max(0, Math.min(2, options.temperature))
      : undefined,
    timeoutMs: Math.max(15_000, Math.min(180_000, Math.round(Number(config.timeoutMs) || 90_000))),
  };
}

async function boundedResponseText(response, maximumBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("model-response-too-large");
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maximumBytes) throw new Error("model-response-too-large");
    return text;
  }
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("model-response-too-large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function validateStructuredOutput(task, content) {
  if (task?.structuredOutput !== "json-object") return;
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("MODEL_RESPONSE_INVALID"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("MODEL_RESPONSE_INVALID");
}

function safeStatusError(status) {
  if (status === 401 || status === 403) return "MODEL_AUTH_REJECTED";
  if (status === 404) return "MODEL_ENDPOINT_REJECTED";
  if (status === 429) return "MODEL_RATE_LIMITED";
  return `MODEL_HTTP_${status}`;
}

async function requestInference(input, dependencies = {}) {
  const task = normalizeTask(input, {
    allowWorldAdjudication: dependencies.allowWorldAdjudication === true,
    allowAutonomousPlanning: dependencies.allowAutonomousPlanning === true,
  });
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const getCredential = dependencies.getCredential ?? (async () => "");
  if (typeof fetchImpl !== "function") throw new Error("model-fetch-unavailable");
  const credential = task.provider === "deepseek" ? await getCredential() : "";
  if (task.provider === "deepseek" && (typeof credential !== "string" || credential.length < 8)) throw new Error("MODEL_CREDENTIAL_UNAVAILABLE");
  const body = {
    model: task.model,
    messages: [{ role: "system", content: task.system }, { role: "user", content: task.json && !/json/i.test(`${task.system} ${task.user}`) ? `${task.user}\n\n只返回严格 JSON 对象。` : task.user }],
    stream: false,
    max_tokens: task.maxTokens,
    ...(task.provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
    ...(task.json ? { response_format: { type: "json_object" } } : {}),
    ...(task.temperature === undefined ? {} : { temperature: task.temperature }),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), task.timeoutMs);
  let response;
  try {
    response = await fetchImpl(task.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("MODEL_TIMEOUT");
    throw new Error("MODEL_REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
  }
  const raw = await boundedResponseText(response);
  if (!response.ok) throw new Error(safeStatusError(response.status));
  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error("MODEL_RESPONSE_INVALID"); }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("MODEL_EMPTY_RESPONSE");
  validateStructuredOutput(task, content.trim());
  const usage = recordOf(payload.usage);
  return {
    content: content.trim(),
    usage: usage ? {
      inputTokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
      outputTokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
    } : { inputTokens: null, outputTokens: null },
  };
}

module.exports = {
  getProviderCapabilities: () => structuredClone(PROVIDERS),
  MAX_RESPONSE_BYTES,
  TASKS,
  boundedResponseText,
  validateStructuredOutput,
  normalizeTask,
  requestInference,
};
