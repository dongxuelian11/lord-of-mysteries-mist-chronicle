import {
  deriveRuntimeTraceId,
  tryRecordRuntimeTrace,
  type RuntimeTraceContext,
} from "./runtime-trace.ts";
import type { RetrievalReceipt } from "./world-authority-closure.ts";

export type AiProviderId = "deepseek" | "compatible";
export type AiQuality = "balanced" | "literary";
export type ModelTaskKind =
  | "connection-test"
  | "intent-parser"
  | "situation-brief"
  | "npc-dialogue"
  | "council-reply"
  | "council-summary"
  | "decision-draft"
  | "ability-draft"
  | "ability-scene"
  | "participation-scene"
  | "autonomous-planning"
  | "world-adjudication"
  | "world-repair"
  | "literary-generation"
  | "dynamic-origin";

export type AiConfig = {
  provider?: AiProviderId;
  endpoint: string;
  apiKey: string;
  model: string;
  worldModel?: string;
  worldBible?: string;
  quality?: AiQuality;
  timeoutMs?: number;
};

export type ModelCallOptions = {
  task: ModelTaskKind;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onToken?: (text: string) => void;
  trace?: RuntimeTraceContext;
  worldRequest?: { ticket: string; attempt: number };
  onRetrieval?: (value: { receipt: RetrievalReceipt; selectedCount: number; rejectedCount: number; authority: { turnId: string; baseRevision: number; week?: number; gameDate?: string; payloadHash?: string } }) => void;
};

export const WORLD_LORE_CONTEXT_MARKER = "__MIST_MAIN_WORLD_LORE_CONTEXT__";
export const WORLD_LORE_IDS_MARKER = "__MIST_MAIN_WORLD_LORE_IDS__";

export const DEEPSEEK_FLASH_PRESET: AiConfig = {
  provider: "deepseek",
  endpoint: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  quality: "balanced",
  timeoutMs: 90_000,
};

export function isLoopbackInferenceEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint.trim());
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
      && ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function normalizeEndpoint(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}

function safeErrorMessage(status: number, payload: unknown) {
  const object = payload && typeof payload === "object" ? payload as Record<string, unknown> : undefined;
  const nested = object?.error && typeof object.error === "object" ? object.error as Record<string, unknown> : undefined;
  const detail = typeof nested?.message === "string" ? nested.message : typeof object?.message === "string" ? object.message : "";
  if (status === 401 || status === 403) return "API Key 无效或没有该模型权限";
  if (status === 404) return "接口地址或模型名称不存在";
  if (status === 429) return "接口请求过于频繁或账户额度不足";
  return detail ? `模型接口返回 ${status}：${detail.slice(0, 180)}` : `模型接口返回 ${status}`;
}

function delay(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

async function readStreamedContent(response: Response, onToken?: (text: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let raw = "";
  let buffer = "";
  let content = "";
  let sseMode: boolean | null = null;
  const finishSseLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const data = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as { choices?: { delta?: { content?: unknown } }[] };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        content += delta;
        onToken?.(delta);
      }
    } catch {
      // 忽略心跳行或不完整数据行
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (sseMode === null) {
      const first = (raw + chunk).trimStart();
      const contentType = response.headers?.get?.("content-type") ?? "";
      sseMode = /text\/event-stream/i.test(contentType) || first.startsWith("data:") || first.startsWith(":") || first.startsWith("event:");
    }
    if (sseMode) {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        finishSseLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    } else {
      raw += chunk;
    }
  }
  if (sseMode && buffer.trim()) finishSseLine(buffer);
  if (sseMode === false) {
    // 兼容不返回 SSE 的服务端（直接返回 JSON）
    const payload = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] };
    const value = payload.choices?.[0]?.message?.content;
    return typeof value === "string" ? value : "";
  }
  return content;
}

async function requestModel(config: AiConfig, system: string, user: string, options: ModelCallOptions) {
  if (typeof window !== "undefined" && window.mistInference) {
    if (!options.task) throw new Error("MODEL_TASK_REQUIRED");
    const requestBase = {
      config: {
        provider: config.provider,
        endpoint: config.endpoint,
        model: config.model,
        timeoutMs: config.timeoutMs,
      },
      options: {
        json: options.json,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    };
    let response;
    try {
      response = await (options.task === "world-adjudication"
        ? (() => {
          if (!options.worldRequest || typeof window.mistInference?.requestWorld !== "function") throw new Error("WORLD_INFERENCE_CONTRACT_REQUIRED");
          return window.mistInference.requestWorld({ ...requestBase, task: "world-adjudication", worldRequest: options.worldRequest });
        })()
        : window.mistInference.request({ ...requestBase, task: options.task, system, user }));
    } catch (error) {
      if (!options.worldRequest) throw error;
      const marked = (error instanceof Error ? error : new Error(String(error))) as Error & { worldAttemptStatusUnknown?: boolean };
      marked.worldAttemptStatusUnknown = true;
      throw marked;
    }
    if (!response.ok || typeof response.content !== "string" || !response.content.trim()) {
      const error = new Error(response.error ?? "MODEL_REQUEST_FAILED") as Error & { worldAttemptStarted?: boolean };
      if (options.worldRequest && response.attemptStarted === true) error.worldAttemptStarted = true;
      throw error;
    }
    const content = response.content.trim();
    if (options.worldRequest) {
      if (!response.retrieval) {
        const error = new Error("WORLD_RAG_RECEIPT_UNAVAILABLE") as Error & { worldAttemptStarted: boolean };
        error.worldAttemptStarted = true;
        throw error;
      }
      try {
        options.onRetrieval?.(response.retrieval);
      } catch (error) {
        const marked = (error instanceof Error ? error : new Error(String(error))) as Error & { worldAttemptStarted?: boolean };
        marked.worldAttemptStarted = true;
        throw marked;
      }
    }
    if (options.stream) options.onToken?.(content);
    return content;
  }
  const provider = config.provider ?? (config.endpoint.includes("api.deepseek.com") ? "deepseek" : "compatible");
  const stream = Boolean(options.stream);
  const userPrompt = options.json && !/json/i.test(`${system} ${user}`) ? `${user}\n\n只返回严格 JSON 对象。` : user;
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
    stream,
    max_tokens: options.maxTokens ?? (options.json ? 4200 : 1800),
  };
  if (provider === "deepseek" || /api\.deepseek\.com/i.test(config.endpoint)) {
    // DeepSeek V4 系列默认会输出 reasoning_content 并挤占正文额度；
    // 显式关闭思考，保证 content 正常返回。
    body.thinking = { type: "disabled" };
  }
  if (options.json) body.response_format = { type: "json_object" };
  if (typeof options.temperature === "number") body.temperature = options.temperature;
  const url = provider === "deepseek" ? "/api/ai/deepseek" : normalizeEndpoint(config.endpoint);
  if (!url || !config.apiKey.trim() || !config.model.trim()) throw new Error("模型配置尚未填写完整");
  const requestBody = provider === "deepseek" ? { apiKey: config.apiKey.trim(), payload: body } : body;
  const timeoutMs = Math.max(15_000, Math.min(180_000, config.timeoutMs ?? 90_000));
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        method: "POST",
        headers: provider === "deepseek" ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey.trim()}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timer));
      if (!response.ok) {
        const raw = await response.text();
        let payload: Record<string, unknown> = {};
        try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { payload = { message: raw }; }
        const error = new Error(safeErrorMessage(response.status, payload));
        if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt === 0) { lastError = error; await delay(700); continue; }
        throw error;
      }
      if (stream && response.body) {
        const content = (await readStreamedContent(response, options.onToken)).trim();
        if (!content) {
          const error = new Error("模型返回了空内容");
          if (attempt === 0) { lastError = error; await delay(500); continue; }
          throw error;
        }
        return content;
      }
      const raw = await response.text();
      let payload: Record<string, unknown> = {};
      try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { payload = { message: raw }; }
      const choices = Array.isArray(payload.choices) ? payload.choices as { message?: { content?: string } }[] : [];
      const content = choices[0]?.message?.content?.trim();
      if (!content) {
        const error = new Error("模型返回了空内容");
        if (attempt === 0) { lastError = error; await delay(500); continue; }
        throw error;
      }
      return content;
    } catch (error) {
      const value = error instanceof Error ? error : new Error("模型请求失败");
      if (value.name === "AbortError") throw new Error(`模型在 ${Math.round(timeoutMs / 1000)} 秒内没有回应`);
      if (value instanceof TypeError) throw new Error(provider === "deepseek" ? "无法连接 DeepSeek，请检查网络后重试" : "浏览器无法访问该兼容端点；请确认它允许跨域请求");
      lastError = value;
      if (attempt === 0 && /空内容/.test(value.message)) continue;
      throw value;
    }
  }
  throw lastError ?? new Error("模型请求失败");
}

function modelFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/配置尚未填写完整/.test(message)) return "MODEL_CONFIG_INCOMPLETE";
  if (/没有回应|超时/.test(message)) return "MODEL_TIMEOUT";
  if (/API Key|权限/.test(message)) return "MODEL_AUTH_REJECTED";
  if (/接口地址|模型名称/.test(message)) return "MODEL_ENDPOINT_REJECTED";
  if (/过于频繁|额度不足/.test(message)) return "MODEL_RATE_LIMITED";
  if (/空内容/.test(message)) return "MODEL_EMPTY_RESPONSE";
  return "MODEL_REQUEST_FAILED";
}

/**
 * Model calls keep their existing transport semantics while emitting one
 * bounded trace. Provider usage fields are null until the provider supplies
 * tokenizer-backed usage; this is deliberate and not an estimate.
 */
export async function callModel(config: AiConfig, system: string, user: string, options: ModelCallOptions) {
  const startedAt = Date.now();
  const traceId = options.trace?.traceId ?? deriveRuntimeTraceId("model", `${config.model}\n${system}\n${user}`);
  let outcome: "PASS" | "FAILED" = "FAILED";
  let rejectionReasons: string[] = [];
  try {
    const content = await requestModel(config, system, user, options);
    outcome = "PASS";
    return content;
  } catch (error) {
    rejectionReasons = [modelFailureCode(error)];
    throw error;
  } finally {
    tryRecordRuntimeTrace({
      traceId,
      operation: "model",
      requestId: options.trace?.requestId,
      turnId: options.trace?.turnId,
      retrievalId: options.trace?.retrievalId,
      modelTraceId: options.trace?.modelTraceId ?? traceId,
      modelId: config.model,
      modelQuantization: options.trace?.modelQuantization,
      promptVersion: options.trace?.promptVersion,
      responseSchemaVersion: options.trace?.responseSchemaVersion ?? (options.json ? "json-object" : undefined),
      inputTokens: null,
      outputTokens: null,
      firstTokenLatencyMs: null,
      latencyMs: Date.now() - startedAt,
      repairCount: options.trace?.repairCount,
      rejectionReasons,
      outcome,
      commitStatus: "NOT_APPLICABLE",
    });
  }
}

export async function testModelConnection(config: AiConfig) {
  const started = performance.now();
  const content = await callModel(config, "你是连接测试器，只回复 READY。", "回复 READY。", { task: "connection-test", maxTokens: 16, temperature: 0 });
  return { latencyMs: Math.round(performance.now() - started), reply: content.slice(0, 48) };
}
