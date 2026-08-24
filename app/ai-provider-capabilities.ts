import type { AiProviderId, ModelCallOptions, ModelTaskKind } from "./ai-client.ts";
import registry from "../shared/ai-provider-capabilities.json" with { type: "json" };

export type EndpointPolicy = "official" | "loopback";
export type StructuredOutput = "plain" | "json-object";
export type TokenizerMode = "provider-reported" | "estimated";

export type ProviderCapability = {
  endpointPolicy: EndpointPolicy;
  officialEndpoint?: string;
  maxContextChars: number;
  maxOutputTokens: number;
  supportsJsonObject: boolean;
  supportsJsonSchema: boolean;
  supportsStreaming: boolean;
  defaultConcurrency: number;
  highLatencyMs: number;
  circuitFailureThreshold: number;
  cooldownMs: number;
  retryableStatusCodes: number[];
  tokenizer: { mode: TokenizerMode; charsPerToken: number };
};

export type TaskCapability = {
  promptMaxChars: number;
  maxOutputTokens: number;
  structuredOutput: StructuredOutput;
  streaming: boolean;
};

export type TokenBudget = {
  tokens: number;
  accuracy: "estimated" | "provider-reported";
  source: "conservative-character-estimate" | "provider-usage";
};

type CapabilityRegistry = {
  providers: Record<string, ProviderCapability>;
  tasks: Record<string, TaskCapability>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function registrySource(): CapabilityRegistry {
  const value = registry as CapabilityRegistry | undefined;
  if (!value || typeof value !== "object" || !value.providers || !value.tasks) {
    throw new Error("provider-capability-registry-unavailable");
  }
  return value;
}

function providerId(value: unknown): AiProviderId {
  if (value === "deepseek" || value === "compatible") return value;
  throw new Error("provider-not-supported");
}

export function inferProviderId(config: { provider?: unknown; endpoint?: unknown }): AiProviderId {
  if (config.provider !== undefined) return providerId(config.provider);
  return /api\.deepseek\.com/i.test(String(config.endpoint ?? "")) ? "deepseek" : "compatible";
}

export const PROVIDER_CAPABILITIES: Record<AiProviderId, ProviderCapability> = {
  get deepseek() { return clone(registrySource().providers.deepseek); },
  get compatible() { return clone(registrySource().providers.compatible); },
};

export const TASK_CAPABILITIES: Record<ModelTaskKind, TaskCapability> = {
  get "connection-test"() { return clone(registrySource().tasks["connection-test"]); },
  get "intent-parser"() { return clone(registrySource().tasks["intent-parser"]); },
  get "situation-brief"() { return clone(registrySource().tasks["situation-brief"]); },
  get "npc-dialogue"() { return clone(registrySource().tasks["npc-dialogue"]); },
  get "council-reply"() { return clone(registrySource().tasks["council-reply"]); },
  get "council-summary"() { return clone(registrySource().tasks["council-summary"]); },
  get "decision-draft"() { return clone(registrySource().tasks["decision-draft"]); },
  get "ability-draft"() { return clone(registrySource().tasks["ability-draft"]); },
  get "ability-scene"() { return clone(registrySource().tasks["ability-scene"]); },
  get "participation-scene"() { return clone(registrySource().tasks["participation-scene"]); },
  get "autonomous-planning"() { return clone(registrySource().tasks["autonomous-planning"]); },
  get "world-adjudication"() { return clone(registrySource().tasks["world-adjudication"]); },
  get "world-repair"() { return clone(registrySource().tasks["world-repair"]); },
  get "literary-generation"() { return clone(registrySource().tasks["literary-generation"]); },
  get "dynamic-origin"() { return clone(registrySource().tasks["dynamic-origin"]); },
};

export function getProviderCapability(value: unknown): ProviderCapability {
  const provider = providerId(value);
  return clone(PROVIDER_CAPABILITIES[provider]);
}

export function getTaskCapability(value: unknown): TaskCapability {
  if (typeof value !== "string" || !(value in TASK_CAPABILITIES)) throw new Error("task-not-supported");
  return clone(TASK_CAPABILITIES[value as ModelTaskKind]);
}

function normalizedLoopbackEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(String(endpoint ?? ""));
  } catch {
    throw new Error("endpoint-not-allowed");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!localHosts.has(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("endpoint-not-allowed");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!/\/chat\/completions$/i.test(url.pathname)) {
    url.pathname = `${url.pathname}/chat/completions`.replace(/\/{2,}/g, "/");
  }
  return url.toString();
}

export function normalizeProviderEndpoint(config: { provider?: unknown; endpoint?: unknown }): { provider: AiProviderId; url: string } {
  const rawEndpoint = typeof config.endpoint === "string" ? config.endpoint.trim() : "";
  const provider = inferProviderId(config);
  const capability = PROVIDER_CAPABILITIES[provider];
  if (capability.endpointPolicy === "official") {
    return { provider, url: `${capability.officialEndpoint}/chat/completions` };
  }
  return { provider, url: normalizedLoopbackEndpoint(rawEndpoint) };
}

export function resolveInferenceCapability(config: { provider?: unknown; endpoint?: unknown }, task: unknown) {
  const normalized = normalizeProviderEndpoint(config);
  return {
    ...normalized,
    providerCapability: getProviderCapability(normalized.provider),
    taskCapability: getTaskCapability(task),
  };
}

export function assertTaskCapability(task: unknown, options: Pick<ModelCallOptions, "json" | "stream"> = {}): void {
  const capability = getTaskCapability(task);
  if (capability.structuredOutput === "json-object" && options.json !== true) throw new Error("task-capability-json-required");
  if (options.stream === true && capability.streaming !== true) throw new Error("task-capability-streaming-forbidden");
}

export function estimateTokenBudget(text: string, provider: unknown): TokenBudget {
  const capability = getProviderCapability(provider);
  const value = typeof text === "string" ? text : String(text ?? "");
  const charsPerToken = Math.max(1, capability.tokenizer.charsPerToken);
  return {
    tokens: Math.max(1, Math.ceil([...value].length / charsPerToken)),
    accuracy: "estimated",
    source: "conservative-character-estimate",
  };
}
