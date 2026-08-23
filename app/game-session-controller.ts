import { type AiConfig } from "./ai-client.ts";
import {
  AI_SESSION_KEY,
  AI_SETTINGS_STORAGE_KEY,
  parseStoredAiSettings,
  resolveLoadedAiSettings,
  serializeAiSettings,
} from "./ai-settings-storage.ts";
import { type GameState } from "./game-model.ts";
import { createActiveSaveAuthority } from "./persistence-authority.ts";
import { ACTIVE_SAVE_KEY, LEGACY_ACTIVE_SAVE_KEYS, migrateStoredGame } from "./save-system.ts";

export type LoadedGameSession = {
  game?: GameState;
  hasSave: boolean;
  aiConfig?: AiConfig;
  rememberApiKey: boolean;
  secureStorageAvailable: boolean;
  persistenceError?: string;
};

type PersistentActiveSave = Awaited<ReturnType<typeof readPersistentActiveSave>>;

let activeSaveWriteQueue = Promise.resolve();

function persistenceFatalError(error?: string) {
  const failure = new Error(error ?? "persistence-write-failed");
  failure.name = "PersistenceFatalError";
  return failure;
}

function isNonFatalPersistenceUnavailable(result: { available: boolean; fatal?: boolean; error?: string }) {
  return !result.available && !result.fatal && (result.error === "persistence-unavailable" || result.error === "sqlite-runtime-unavailable");
}

async function loadSecureCredentials() {
  if (!window.mistCredentials) return { available: false, apiKey: "" };
  try { return await window.mistCredentials.load(); }
  catch { return { available: false, apiKey: "", error: "secure-storage-unavailable" }; }
}

function getActiveSaveAuthority() {
  return createActiveSaveAuthority(window.localStorage, ACTIVE_SAVE_KEY, LEGACY_ACTIVE_SAVE_KEYS);
}

async function readPersistentActiveSave() {
  const bridge = window.mistPersistence;
  if (!bridge) return { available: false as const, record: undefined };
  try {
    const current = await bridge.get(ACTIVE_SAVE_KEY);
    if (!current.available) {
      if (current.fatal) return { available: true as const, fatal: true as const, error: current.error ?? "persistence-initialization-failed", record: { key: ACTIVE_SAVE_KEY, raw: "", legacy: false } };
      if (isNonFatalPersistenceUnavailable(current)) return { available: false as const, record: undefined };
      throw persistenceFatalError(current.error ?? "persistence-read-failed");
    }
    if (current.error) return { available: true as const, record: { key: ACTIVE_SAVE_KEY, raw: "", legacy: false } };
    if (current.value) return { available: true as const, record: { key: ACTIVE_SAVE_KEY, raw: current.value, legacy: false } };
    for (const key of LEGACY_ACTIVE_SAVE_KEYS) {
      const legacy = await bridge.get(key);
      if (!legacy.available) {
        if (legacy.fatal) throw persistenceFatalError(legacy.error ?? "persistence-initialization-failed");
        if (isNonFatalPersistenceUnavailable(legacy)) return { available: false as const, record: undefined };
        throw persistenceFatalError(legacy.error ?? "persistence-read-failed");
      }
      if (legacy.error) return { available: true as const, record: { key, raw: "", legacy: true } };
      if (legacy.value) return { available: true as const, record: { key, raw: legacy.value, legacy: true } };
    }
    return { available: true as const, fatal: false as const, error: undefined, record: undefined };
  } catch (error) {
    if (error instanceof Error && error.name === "PersistenceFatalError") throw error;
    throw persistenceFatalError(error instanceof Error ? error.message : "persistence-read-failed");
  }
}

async function writePersistentActiveSave(raw: string) {
  const bridge = window.mistPersistence;
  if (!bridge) {
    getActiveSaveAuthority().write(raw);
    return;
  }
  try {
    const result = await bridge.set(ACTIVE_SAVE_KEY, raw);
    if (result.fatal) throw persistenceFatalError(result.error ?? "persistence-initialization-failed");
    if (isNonFatalPersistenceUnavailable(result)) {
      getActiveSaveAuthority().write(raw);
      return;
    }
    if (!result.available || result.error || !result.saved) throw persistenceFatalError(result.error ?? "persistence-write-failed");
  } catch (error) {
    if (error instanceof Error && error.name === "PersistenceFatalError") throw error;
    throw persistenceFatalError(error instanceof Error ? error.message : "persistence-write-failed");
  }
}

export async function loadGameSession(): Promise<LoadedGameSession> {
  let game: GameState | undefined;
  let hasSave = false;
  const activeSaveAuthority = getActiveSaveAuthority();
  let persistent: PersistentActiveSave;
  try {
    persistent = await readPersistentActiveSave();
  } catch (error) {
    persistent = {
      available: true as const,
      fatal: true as const,
      error: error instanceof Error ? error.message : "persistence-read-failed",
      record: { key: ACTIVE_SAVE_KEY, raw: "", legacy: false },
    };
  }
  const stored = persistent.fatal ? persistent.record : persistent.record ?? activeSaveAuthority.read();
  const storedInPersistence = Boolean(persistent.record);
  if (stored) {
    try {
      const migrated = migrateStoredGame(JSON.parse(stored.raw));
      if (!migrated) throw new Error("unsupported-save-version");
      game = migrated.game;
      hasSave = migrated.hasSave;
    } catch {
      if (!stored.legacy) {
        if (storedInPersistence && window.mistPersistence) await window.mistPersistence.remove(stored.key).catch(() => undefined);
        else activeSaveAuthority.clear();
      }
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
  return {
    game,
    hasSave,
    aiConfig,
    rememberApiKey,
    secureStorageAvailable: secureResult.available,
    ...(persistent.error ? { persistenceError: persistent.error } : {}),
  };
}

function enqueueActiveSaveWrite(raw: string) {
  const next = activeSaveWriteQueue.catch(() => undefined).then(() => writePersistentActiveSave(raw));
  activeSaveWriteQueue = next.catch(() => undefined);
  return next;
}

export function persistActiveGame(game: GameState) {
  const raw = JSON.stringify(game);
  return enqueueActiveSaveWrite(raw);
}

export async function persistActiveGameAsync(game: GameState) {
  const raw = JSON.stringify(game);
  await enqueueActiveSaveWrite(raw);
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
