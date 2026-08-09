import { type AiConfig } from "./ai-client.ts";
import {
  AI_SESSION_KEY,
  AI_SETTINGS_STORAGE_KEY,
  parseStoredAiSettings,
  resolveLoadedAiSettings,
  serializeAiSettings,
} from "./ai-settings-storage.ts";
import { type GameState } from "./game-model.ts";
import { ACTIVE_SAVE_KEY, LEGACY_ACTIVE_SAVE_KEYS, migrateStoredGame } from "./save-system.ts";

export type LoadedGameSession = {
  game?: GameState;
  hasSave: boolean;
  aiConfig?: AiConfig;
  rememberApiKey: boolean;
  secureStorageAvailable: boolean;
};

async function loadSecureCredentials() {
  if (!window.mistCredentials) return { available: false, apiKey: "" };
  try { return await window.mistCredentials.load(); }
  catch { return { available: false, apiKey: "", error: "secure-storage-unavailable" }; }
}

export async function loadGameSession(): Promise<LoadedGameSession> {
  let game: GameState | undefined;
  let hasSave = false;
  const saved = window.localStorage.getItem(ACTIVE_SAVE_KEY);
  const legacySaved = LEGACY_ACTIVE_SAVE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
  if (saved) {
    try {
      const migrated = migrateStoredGame(JSON.parse(saved));
      if (!migrated) throw new Error("unsupported-save-version");
      game = migrated.game;
      hasSave = migrated.hasSave;
    } catch {
      window.localStorage.removeItem(ACTIVE_SAVE_KEY);
    }
  } else if (legacySaved) {
    try {
      const migrated = migrateStoredGame(JSON.parse(legacySaved));
      if (migrated) {
        game = migrated.game;
        hasSave = migrated.hasSave;
      }
    } catch {
      // 旧存档只用于迁移；损坏时不影响新游戏。
    }
  }

  const secureResult = await loadSecureCredentials();
  const savedAi = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
  let aiConfig: AiConfig | undefined;
  let rememberApiKey = false;
  if (savedAi) {
    try {
      const value = parseStoredAiSettings(savedAi);
      const sessionKey = window.sessionStorage.getItem(AI_SESSION_KEY) ?? "";
      const legacyPlaintextKey = value.apiKey ?? "";
      let secureKey = secureResult.apiKey ?? "";
      rememberApiKey = Boolean(value.rememberKey && secureResult.available);
      if (legacyPlaintextKey && rememberApiKey && window.mistCredentials) {
        const migration = await window.mistCredentials.save(legacyPlaintextKey);
        rememberApiKey = Boolean(migration.saved);
        secureKey = rememberApiKey ? legacyPlaintextKey : "";
      }
      const loaded = resolveLoadedAiSettings(value, {
        secureStorageAvailable: secureResult.available,
        secureKey,
        sessionKey,
        rememberKey: rememberApiKey,
      });
      window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(loaded.sanitized));
      if (loaded.sessionKeyToPersist) window.sessionStorage.setItem(AI_SESSION_KEY, loaded.sessionKeyToPersist);
      aiConfig = loaded.config;
      rememberApiKey = loaded.rememberKey;
    } catch {
      window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
    }
  }
  return { game, hasSave, aiConfig, rememberApiKey, secureStorageAvailable: secureResult.available };
}

export function persistActiveGame(game: GameState) {
  window.localStorage.setItem(ACTIVE_SAVE_KEY, JSON.stringify(game));
}

export async function saveAiSessionSettings(config: AiConfig, rememberRequested: boolean, secureStorageAvailable: boolean) {
  let remembered = false;
  if (rememberRequested && secureStorageAvailable && window.mistCredentials) {
    try {
      const result = await window.mistCredentials.save(config.apiKey);
      remembered = Boolean(result.saved);
    } catch {
      remembered = false;
    }
  }
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(serializeAiSettings(config, remembered)));
  if (remembered) window.sessionStorage.removeItem(AI_SESSION_KEY);
  else window.sessionStorage.setItem(AI_SESSION_KEY, config.apiKey);
  return { remembered };
}

export async function clearAiSessionKey(config: AiConfig) {
  try { await window.mistCredentials?.clear(); } catch { /* 本地状态仍然清除。 */ }
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(serializeAiSettings(config, false)));
  window.sessionStorage.removeItem(AI_SESSION_KEY);
}
