export type AiProviderId = "deepseek" | "compatible";
export type AiQuality = "balanced" | "literary";

export type AiConfig = {
  provider?: AiProviderId;
  endpoint: string;
  apiKey: string;
  model: string;
  worldModel?: string;
  worldBible?: string;
  thinking?: boolean;
  reasoningEffort?: "high" | "max";
  quality?: AiQuality;
  timeoutMs?: number;
};

export type ModelCallOptions = {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export const DEEPSEEK_FLASH_PRESET: AiConfig = {
  provider: "deepseek",
  endpoint: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  thinking: false,
  reasoningEffort: "high",
  quality: "balanced",
  timeoutMs: 90_000,
};

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

export async function callModel(config: AiConfig, system: string, user: string, options: ModelCallOptions = {}) {
  const provider = config.provider ?? (config.endpoint.includes("api.deepseek.com") ? "deepseek" : "compatible");
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    stream: false,
    max_tokens: options.maxTokens ?? (options.json ? 4200 : 1800),
  };
  if (options.json) body.response_format = { type: "json_object" };
  if (typeof options.temperature === "number" && !config.thinking) body.temperature = options.temperature;
  if (provider === "deepseek") {
    body.thinking = { type: config.thinking ? "enabled" : "disabled" };
    if (config.thinking) body.reasoning_effort = config.reasoningEffort ?? "high";
  }
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
      const raw = await response.text();
      let payload: Record<string, unknown> = {};
      try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { payload = { message: raw }; }
      if (!response.ok) {
        const error = new Error(safeErrorMessage(response.status, payload));
        if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt === 0) { lastError = error; await delay(700); continue; }
        throw error;
      }
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

export async function testModelConnection(config: AiConfig) {
  const started = performance.now();
  const content = await callModel(config, "你是连接测试器，只回复 READY。", "回复 READY。", { maxTokens: 16, temperature: 0 });
  return { latencyMs: Math.round(performance.now() - started), reply: content.slice(0, 48) };
}
