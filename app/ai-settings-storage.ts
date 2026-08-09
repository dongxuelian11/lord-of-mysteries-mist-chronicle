import { DEEPSEEK_FLASH_PRESET, type AiConfig, type AiProviderId, type AiQuality } from "./ai-client.ts";

export const AI_SETTINGS_STORAGE_KEY = "mist-chronicle-save-v3-ai";
export const AI_SESSION_KEY = "mist-chronicle-session-ai-key";

export type StoredAiSettings = Partial<AiConfig> & { rememberKey: boolean };

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseStoredAiSettings(raw: string): StoredAiSettings {
  const input = recordOf(JSON.parse(raw));
  if (!input) throw new Error("invalid-ai-settings");
  const provider = ["deepseek", "compatible"].includes(String(input.provider))
    ? input.provider as AiProviderId
    : undefined;
  const quality = ["balanced", "literary"].includes(String(input.quality))
    ? input.quality as AiQuality
    : undefined;
  return {
    ...(provider ? { provider } : {}),
    ...(typeof input.endpoint === "string" ? { endpoint: input.endpoint } : {}),
    ...(typeof input.apiKey === "string" ? { apiKey: input.apiKey } : {}),
    ...(typeof input.model === "string" ? { model: input.model } : {}),
    ...(typeof input.worldModel === "string" ? { worldModel: input.worldModel } : {}),
    ...(typeof input.worldBible === "string" ? { worldBible: input.worldBible } : {}),
    ...(quality ? { quality } : {}),
    ...(typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) ? { timeoutMs: input.timeoutMs } : {}),
    rememberKey: input.rememberKey === true,
  };
}

export function serializeAiSettings(config: AiConfig, rememberKey: boolean): StoredAiSettings {
  return { ...config, apiKey: "", rememberKey };
}

export function resolveLoadedAiSettings(
  stored: StoredAiSettings,
  options: {
    secureStorageAvailable: boolean;
    secureKey: string;
    sessionKey: string;
    rememberKey?: boolean;
  },
) {
  const { rememberKey: storedRememberKey, ...storedConfig } = stored;
  const legacyPlaintextKey = storedConfig.apiKey ?? "";
  const rememberKey = options.rememberKey ?? Boolean(storedRememberKey && options.secureStorageAvailable);
  const apiKey = rememberKey ? options.secureKey : (options.sessionKey || legacyPlaintextKey);
  const provider = storedConfig.provider ?? (storedConfig.endpoint?.includes("api.deepseek.com") ? "deepseek" : "compatible");
  const config = { ...DEEPSEEK_FLASH_PRESET, ...storedConfig, provider, apiKey } as AiConfig;
  return {
    config,
    rememberKey,
    legacyPlaintextKey,
    sanitized: serializeAiSettings(config, rememberKey),
    sessionKeyToPersist: !rememberKey && legacyPlaintextKey ? legacyPlaintextKey : "",
  };
}
