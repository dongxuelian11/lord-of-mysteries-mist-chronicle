"use strict";

const MAX_PERSISTENCE_PAYLOAD_BYTES = 24 * 1024 * 1024;

function isAllowedPersistenceKey(key) {
  return typeof key === "string"
    && /^mist-chronicle-(?:complete|recovery)-v(?:[5-9]|1[0-9]|2[0-1])$/.test(key);
}

function isTrustedLocalRenderer(event, expectedOrigin) {
  if (typeof expectedOrigin !== "string" || !expectedOrigin) return false;
  const url = event?.senderFrame?.url ?? "";
  return url === expectedOrigin || url.startsWith(`${expectedOrigin}/`);
}

function invalidRequest() {
  return { available: false, error: "invalid-request" };
}

function unavailable() {
  return { available: false, error: "persistence-unavailable" };
}

function registerPersistenceIpc({ ipcMain, store, isTrustedSender = () => false, unavailableResult = () => ({ available: false, error: "persistence-unavailable", fatal: false }) } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function") throw new Error("invalid-ipc-main");

  const unavailable = () => typeof unavailableResult === "function" ? unavailableResult() : unavailableResult;

  const guard = (event) => {
    if (!isTrustedSender(event)) throw new Error("untrusted-renderer");
    if (!store) throw new Error("persistence-unavailable");
  };

  ipcMain.handle("persistence:get", (_event, key) => {
    if (!isAllowedPersistenceKey(key)) return invalidRequest();
    try {
      guard(_event);
      return { available: true, value: store.getItem(key) };
    } catch (error) {
      return store ? { available: true, value: null, error: String(error?.message ?? error) } : unavailable();
    }
  });

  ipcMain.handle("persistence:set", (_event, key, payload) => {
    if (!isAllowedPersistenceKey(key) || typeof payload !== "string" || Buffer.byteLength(payload, "utf8") > MAX_PERSISTENCE_PAYLOAD_BYTES) return invalidRequest();
    try {
      guard(_event);
      store.setItem(key, payload);
      return { available: true, saved: true };
    } catch (error) {
      return store ? { available: true, saved: false, fatal: true, error: String(error?.message ?? error) } : unavailable();
    }
  });

  ipcMain.handle("persistence:remove", (_event, key) => {
    if (!isAllowedPersistenceKey(key)) return invalidRequest();
    try {
      guard(_event);
      store.removeItem(key);
      return { available: true, removed: true };
    } catch (error) {
      return store ? { available: true, removed: false, error: String(error?.message ?? error) } : unavailable();
    }
  });

  ipcMain.handle("persistence:append-recovery", (_event, key, checkpoint, maxEntries = 3) => {
    if (!isAllowedPersistenceKey(key) || !key.includes("-recovery-") || !checkpoint || typeof checkpoint !== "object") return invalidRequest();
    try {
      guard(_event);
      store.appendRecoveryCheckpoint(key, checkpoint, maxEntries);
      return { available: true, saved: true };
    } catch (error) {
      return store ? { available: true, saved: false, fatal: true, error: String(error?.message ?? error) } : unavailable();
    }
  });

  return { registered: true };
}

module.exports = {
  MAX_PERSISTENCE_PAYLOAD_BYTES,
  isAllowedPersistenceKey,
  isTrustedLocalRenderer,
  registerPersistenceIpc,
};
