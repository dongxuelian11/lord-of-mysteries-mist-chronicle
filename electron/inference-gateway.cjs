"use strict";

const TASKS = new Set([
  "connection-test",
  "intent-parser",
  "situation-brief",
  "npc-dialogue",
  "council-reply",
  "council-summary",
  "decision-draft",
  "ability-draft",
  "ability-scene",
  "participation-scene",
  "world-repair",
  "literary-generation",
  "dynamic-origin",
]);

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizedEndpoint(config) {
  const provider = config.provider === "deepseek" ? "deepseek" : "compatible";
  if (provider === "deepseek") return { provider, url: "https://api.deepseek.com/chat/completions" };
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
  const maximumPrompt = task.task === "world-adjudication" || task.task === "literary-generation" ? 160_000 : 80_000;
  if (!config || !system.trim() || !user.trim() || system.length + user.length > maximumPrompt) throw new Error("invalid-model-task");
  const model = typeof config.model === "string" ? config.model.trim() : "";
  if (!model || model.length > 160) throw new Error("invalid-model-task");
  const endpoint = normalizedEndpoint(config);
  return {
    task: task.task,
    provider: endpoint.provider,
    url: endpoint.url,
    model,
    system,
    user,
    json: options.json === true,
    maxTokens: Math.max(1, Math.min(12_000, Math.round(Number(options.maxTokens) || (options.json ? 4_200 : 1_800)))),
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
  MAX_RESPONSE_BYTES,
  TASKS,
  boundedResponseText,
  normalizeTask,
  requestInference,
};
