import { DEEPSEEK_FLASH_PRESET, type AiConfig } from "./ai-client.ts";
import {
  AI_SESSION_KEY,
  AI_SETTINGS_STORAGE_KEY,
  parseStoredAiSettings,
  resolveLoadedAiSettings,
  serializeAiSettings,
} from "./ai-settings-storage.ts";
import { type GameState } from "./game-model.ts";
import { createActiveSaveAuthority } from "./persistence-authority.ts";
import { ACTIVE_SAVE_KEY, LEGACY_ACTIVE_SAVE_KEYS, RECOVERY_KEY, migrateStoredGame } from "./save-system.ts";
import { acknowledgeDurableTurnTrace, runtimeTracesForDurableCommit, type RuntimeTrace } from "./runtime-trace.ts";
import { stablePersistenceOriginId } from "./persistence-origin.ts";
import { stableTextHash } from "./stable-id.ts";
import { createWorldLedgerBranch } from "./world-ledger.ts";

export type LoadedGameSession = {
  game?: GameState;
  hasSave: boolean;
  aiConfig?: AiConfig;
  rememberApiKey: boolean;
  secureStorageAvailable: boolean;
  credentialConfigured: boolean;
  persistenceError?: string;
  persistenceWarning?: string;
};

type PersistentActiveSave = {
  available: boolean;
  fatal?: boolean;
  error?: string;
  record?: { key: string; raw: string; legacy: boolean };
};

let activeSaveWriteQueue = Promise.resolve();
const BROWSER_LEGACY_QUARANTINE_PREFIX = "mist-chronicle-quarantine:";

function quarantineBrowserSave(stored: { key: string; raw: string }, reason: string) {
  const quarantineKey = `${BROWSER_LEGACY_QUARANTINE_PREFIX}${stored.key}`;
  try {
    window.localStorage.setItem(quarantineKey, stored.raw);
    window.localStorage.setItem(`${quarantineKey}:reason`, reason);
    window.localStorage.removeItem(stored.key);
    return true;
  } catch {
    // Keep the source record when local quarantine cannot be written.
    return false;
  }
}

function persistenceFatalError(error?: string) {
  const failure = new Error(error ?? "persistence-write-failed");
  failure.name = "PersistenceFatalError";
  return failure;
}

function isNonFatalPersistenceUnavailable(result: { available: boolean; fatal?: boolean; error?: string }) {
  return !result.available && !result.fatal && (result.error === "persistence-unavailable" || result.error === "sqlite-runtime-unavailable");
}

async function loadCredentialStatus() {
  if (!window.mistCredentials) return { available: false, configured: false, persistent: false };
  try { return await window.mistCredentials.status(); }
  catch { return { available: false, configured: false, persistent: false, error: "secure-storage-unavailable" }; }
}

function getActiveSaveAuthority() {
  return createActiveSaveAuthority(window.localStorage, ACTIVE_SAVE_KEY, LEGACY_ACTIVE_SAVE_KEYS);
}

async function readPersistentActiveSave(): Promise<PersistentActiveSave> {
  const bridge = window.mistPersistence;
  if (!bridge) return { available: false as const, record: undefined };
  try {
    const current = await bridge.get(ACTIVE_SAVE_KEY);
    if (!current.available) {
      if (current.fatal) return { available: true as const, fatal: true as const, error: current.error ?? "persistence-initialization-failed", record: { key: ACTIVE_SAVE_KEY, raw: "", legacy: false } };
      if (isNonFatalPersistenceUnavailable(current)) return { available: false as const, record: undefined };
      throw persistenceFatalError(current.error ?? "persistence-read-failed");
    }
    if (current.corrupt) throw persistenceFatalError(current.error ?? "persistence-record-corrupt");
    if (current.error) throw persistenceFatalError(current.error);
    if (current.value) return { available: true as const, record: { key: ACTIVE_SAVE_KEY, raw: current.value, legacy: false } };
    for (const key of LEGACY_ACTIVE_SAVE_KEYS) {
      const legacy = await bridge.get(key);
      if (!legacy.available) {
        if (legacy.fatal) throw persistenceFatalError(legacy.error ?? "persistence-initialization-failed");
        if (isNonFatalPersistenceUnavailable(legacy)) return { available: false as const, record: undefined };
        throw persistenceFatalError(legacy.error ?? "persistence-read-failed");
      }
      if (legacy.corrupt) throw persistenceFatalError(legacy.error ?? "persistence-record-corrupt");
      if (legacy.error) throw persistenceFatalError(legacy.error);
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
    if (typeof bridge.commitTurn !== "function") throw persistenceFatalError("durable-turn-store-unavailable");
    const result = await bridge.commitTurn(ACTIVE_SAVE_KEY, raw, runtimeTracesForDurableCommit() as unknown as Array<Record<string, unknown>>);
    if (result.fatal) throw persistenceFatalError(result.error ?? "persistence-initialization-failed");
    if (isNonFatalPersistenceUnavailable(result)) {
      getActiveSaveAuthority().write(raw);
      return;
    }
    if (!result.available || result.error || !result.saved || !result.durable) throw persistenceFatalError(result.error ?? "persistence-write-failed");
    if (typeof result.turnId === "string" && result.turnId) {
      acknowledgeDurableTurnTrace(result.turnId, result.replayed === true);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "PersistenceFatalError") throw error;
    throw persistenceFatalError(error instanceof Error ? error.message : "persistence-write-failed");
  }
}

export async function loadGameSession(): Promise<LoadedGameSession> {
  let game: GameState | undefined;
  let hasSave = false;
  let persistenceWarning: string | undefined;
  const activeSaveAuthority = getActiveSaveAuthority();
  let persistent: PersistentActiveSave;
  try {
    persistent = await readPersistentActiveSave();
  } catch (error) {
    persistent = {
      available: true as const,
      fatal: true as const,
      error: error instanceof Error ? error.message : "persistence-read-failed",
      record: undefined,
    };
  }
  const stored = persistent.fatal ? undefined : persistent.record ?? activeSaveAuthority.read();
  const storedInPersistence = Boolean(persistent.record);
  if (stored) {
    try {
      const migrated = migrateStoredGame(JSON.parse(stored.raw));
      if (!migrated) throw new Error("unsupported-save-version");
      game = migrated.game;
      hasSave = migrated.hasSave;
    } catch {
      const reason = "active-save-migration-rejected";
      let quarantined = false;
      if (storedInPersistence) {
        if (window.mistPersistence?.quarantine) {
          const result = await window.mistPersistence.quarantine(stored.key, reason).catch(() => undefined);
          quarantined = Boolean(result?.available && result.quarantined);
        }
      } else quarantined = quarantineBrowserSave(stored, reason);
      if (quarantined) {
        persistenceWarning = reason;
        persistent = { ...persistent, error: undefined };
      } else {
        persistent = { ...persistent, error: "active-save-quarantine-failed" };
      }
    }
  }

  const desktopCredentials = Boolean(window.mistCredentials && window.mistInference);
  const secureResult = await loadCredentialStatus();
  const secureStorageAvailable = Boolean(secureResult.available);
  const savedAi = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
  let aiConfig: AiConfig | undefined;
  let rememberApiKey = false;
  let credentialConfigured = Boolean(secureResult.configured);
  if (savedAi) {
    try {
      const value = parseStoredAiSettings(savedAi);
      if (desktopCredentials) {
        const { rememberKey, apiKey: legacyPlaintextKey = "", ...storedConfig } = value;
        if (legacyPlaintextKey && window.mistCredentials) {
          const migrated = await window.mistCredentials.set(legacyPlaintextKey, Boolean(rememberKey && secureResult.available));
          credentialConfigured = Boolean(migrated.configured);
          rememberApiKey = Boolean(migrated.persistent);
        }
        const provider = storedConfig.provider ?? (storedConfig.endpoint?.includes("api.deepseek.com") ? "deepseek" : "compatible");
        aiConfig = { ...DEEPSEEK_FLASH_PRESET, ...storedConfig, provider, apiKey: "" } as AiConfig;
        rememberApiKey = rememberApiKey || Boolean(secureResult.persistent);
        window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(serializeAiSettings(aiConfig, rememberApiKey)));
        window.sessionStorage.removeItem(AI_SESSION_KEY);
      } else {
        const loaded = resolveLoadedAiSettings(value, {
          secureStorageAvailable: false,
          secureKey: "",
          sessionKey: window.sessionStorage.getItem(AI_SESSION_KEY) ?? "",
          rememberKey: false,
        });
        window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(loaded.sanitized));
        if (loaded.sessionKeyToPersist) window.sessionStorage.setItem(AI_SESSION_KEY, loaded.sessionKeyToPersist);
        aiConfig = loaded.config;
      }
    } catch {
      window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
    }
  }
  return {
    game,
    hasSave,
    aiConfig,
    rememberApiKey,
    secureStorageAvailable,
    credentialConfigured,
    ...(persistent.error ? { persistenceError: persistent.error } : {}),
    ...(persistenceWarning ? { persistenceWarning } : {}),
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

export async function loadPersistentRuntimeTraces(game: GameState): Promise<RuntimeTrace[]> {
  const bridge = window.mistPersistence;
  const saveId = game.saveId?.trim();
  const branchId = game.worldLedger?.branchId?.trim();
  if (!bridge?.runtimeTraces || !saveId || !branchId) return [];
  const result = await bridge.runtimeTraces(stablePersistenceOriginId(saveId, branchId), 128);
  if (!result.available || result.error || !Array.isArray(result.traces)) throw persistenceFatalError(result.error ?? "runtime-trace-read-failed");
  return result.traces as unknown as RuntimeTrace[];
}

export function branchRecoveredGame(game: GameState, checkpointId: string, nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`): GameState {
  const parent = game.worldLedger;
  if (!parent || parent.version !== 2) throw persistenceFatalError("persistence-recovery-ledger-missing");
  const atSequence = parent.nextSequence - 1;
  const branchId = `recovery:${stableTextHash(JSON.stringify([game.saveId, parent.branchId, atSequence, checkpointId, nonce]))}`;
  return {
    ...game,
    worldLedger: createWorldLedgerBranch(parent, atSequence, branchId),
  };
}

export async function replaceActiveGameWithRecoveryAsync(current: GameState, replacement: GameState, reason: "import" | "history-branch" = "import") {
  const raw = JSON.stringify(replacement);
  const checkpoint = {
    id: `recovery:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
    reason,
    createdAt: new Date().toISOString(),
    game: current,
  };
  const bridge = window.mistPersistence;
  if (bridge?.replaceWithRecovery) {
    try {
      const result = await bridge.replaceWithRecovery(ACTIVE_SAVE_KEY, raw, RECOVERY_KEY, checkpoint, 3);
      if (result.fatal) throw persistenceFatalError(result.error);
      if (!isNonFatalPersistenceUnavailable(result)) {
        if (!result.available || result.error || !result.saved || !result.durable) throw persistenceFatalError(result.error ?? "persistence-import-replacement-failed");
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "PersistenceFatalError") throw error;
      throw persistenceFatalError(error instanceof Error ? error.message : "persistence-import-replacement-failed");
    }
  }
  let recovery: unknown[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECOVERY_KEY) ?? "[]");
    if (Array.isArray(parsed)) recovery = parsed;
  } catch { /* overwrite only the browser fallback's malformed recovery index */ }
  window.localStorage.setItem(RECOVERY_KEY, JSON.stringify([checkpoint, ...recovery].slice(0, 3)));
  getActiveSaveAuthority().write(raw);
}

export async function saveAiSessionSettings(config: AiConfig, rememberRequested: boolean, secureStorageAvailable: boolean) {
  if (window.mistCredentials && window.mistInference) {
    let result = await loadCredentialStatus();
    if (config.apiKey.trim()) result = await window.mistCredentials.set(config.apiKey.trim(), Boolean(rememberRequested && secureStorageAvailable));
    const remembered = Boolean(result.persistent);
    const credentialConfigured = Boolean(result.configured);
    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(serializeAiSettings({ ...config, apiKey: "" }, remembered)));
    window.sessionStorage.removeItem(AI_SESSION_KEY);
    return { remembered, credentialConfigured };
  }
  const remembered = false;
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(serializeAiSettings(config, remembered)));
  window.sessionStorage.setItem(AI_SESSION_KEY, config.apiKey);
  return { remembered, credentialConfigured: Boolean(config.apiKey.trim()) };
}

export async function stageAiCredential(config: AiConfig, rememberRequested: boolean, secureStorageAvailable: boolean) {
  if (!window.mistCredentials || !window.mistInference) return { configured: Boolean(config.apiKey.trim()), persistent: false, error: undefined };
  if (config.apiKey.trim()) return window.mistCredentials.set(config.apiKey.trim(), Boolean(rememberRequested && secureStorageAvailable));
  return window.mistCredentials.status();
}

export async function clearAiSessionKey(config: AiConfig) {
  try { await window.mistCredentials?.clear(); } catch { /* 本地状态仍然清除。 */ }
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(serializeAiSettings(config, false)));
  window.sessionStorage.removeItem(AI_SESSION_KEY);
}
