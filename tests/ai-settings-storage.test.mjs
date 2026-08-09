import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("AI settings parser rejects malformed containers and ignores invalid typed fields", async () => {
  const { parseStoredAiSettings } = await loadRuntimeModule("app/ai-settings-storage.ts");
  assert.throws(() => parseStoredAiSettings("[]"), /invalid-ai-settings/);
  const parsed = parseStoredAiSettings(JSON.stringify({
    provider: "not-a-provider",
    endpoint: "https://api.deepseek.com",
    apiKey: "legacy-key",
    model: "model-a",
    timeoutMs: "forever",
    rememberKey: true,
  }));
  assert.equal(parsed.provider, undefined);
  assert.equal(parsed.endpoint, "https://api.deepseek.com");
  assert.equal(parsed.apiKey, "legacy-key");
  assert.equal(parsed.timeoutMs, undefined);
  assert.equal(parsed.rememberKey, true);
});

test("secure, session and legacy key precedence never persists plaintext in local settings", async () => {
  const { parseStoredAiSettings, resolveLoadedAiSettings, serializeAiSettings } = await loadRuntimeModule("app/ai-settings-storage.ts");
  const stored = parseStoredAiSettings(JSON.stringify({
    endpoint: "https://api.deepseek.com",
    apiKey: "legacy-key",
    model: "model-a",
    rememberKey: true,
  }));
  const secure = resolveLoadedAiSettings(stored, {
    secureStorageAvailable: true,
    secureKey: "secure-key",
    sessionKey: "session-key",
  });
  assert.equal(secure.config.apiKey, "secure-key");
  assert.equal(secure.config.provider, "deepseek");
  assert.equal(secure.rememberKey, true);
  assert.equal(secure.sanitized.apiKey, "");
  assert.equal("rememberKey" in secure.config, false);

  const session = resolveLoadedAiSettings(stored, {
    secureStorageAvailable: false,
    secureKey: "",
    sessionKey: "session-key",
  });
  assert.equal(session.config.apiKey, "session-key");
  assert.equal(session.rememberKey, false);
  assert.equal(session.sessionKeyToPersist, "legacy-key");
  assert.equal(session.sanitized.apiKey, "");

  const legacy = resolveLoadedAiSettings(stored, {
    secureStorageAvailable: false,
    secureKey: "",
    sessionKey: "",
  });
  assert.equal(legacy.config.apiKey, "legacy-key");
  assert.equal(legacy.sessionKeyToPersist, "legacy-key");
  assert.equal(serializeAiSettings(legacy.config, false).apiKey, "");
});
