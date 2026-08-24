import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

test("AI API Key is bridged through Electron safeStorage, not persisted in localStorage", () => {
  const main = source("electron/main.cjs");
  const preload = source("electron/preload.cjs");
  const renderer = source("app/complete-game.tsx");
  const session = source("app/game-session-controller.ts");
  const storage = source("app/ai-settings-storage.ts");

  assert.match(main, /safeStorage/);
  assert.match(preload, /mistCredentials/);
  assert.doesNotMatch(preload, /credentials:load|\.load\(/);
  assert.match(preload, /mistInference/);
  assert.doesNotMatch(preload, /apiKey.*invoke\("inference:request"/);
  assert.match(renderer, /saveAiSessionSettings/);
  assert.match(session, /serializeAiSettings/);
  assert.match(storage, /apiKey: "", rememberKey/);
  assert.doesNotMatch(`${renderer}\n${session}`, /apiKey:\s*rememberApiKey\s*\?/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /Content-Security-Policy/);
});

test("Electron CSP does not permit inline script execution", () => {
  const main = source("electron/main.cjs");

  assert.doesNotMatch(main, /script-src 'self'[^;]*'unsafe-inline'/);
});

test("Electron CSP does not permit inline style execution", () => {
  const main = source("electron/main.cjs");

  assert.doesNotMatch(main, /style-src 'self'[^;]*'unsafe-inline'/);
});

test("CSP creates a per-response nonce shared by SSR scripts and styles", async () => {
  const main = source("electron/main.cjs");
  const csp = await import("../electron/content-security-policy.cjs");
  const first = csp.default.createContentSecurityPolicy();
  const second = csp.default.createContentSecurityPolicy();

  assert.match(main, /onBeforeSendHeaders/);
  assert.match(main, /const appUrlPatterns = \[`\$\{url\}\/\*`\]/);
  assert.doesNotMatch(main, /const appUrlPatterns = \[url, `\$\{url\}\/\*`\]/);
  assert.match(main, /urls: appUrlPatterns/);
  assert.match(main, /contentSecurityPolicy\.value/);
  assert.notEqual(first.nonce, second.nonce);
  assert.equal(first.value, csp.default.contentSecurityPolicyForNonce(first.nonce));
  assert.match(first.value, /script-src 'self' 'nonce-[^']+'/);
  assert.match(first.value, /style-src 'self' 'nonce-[^']+'/);
  assert.doesNotMatch(first.value, /unsafe-inline/);
});

test("renderer keeps dynamic presentation out of inline style attributes", () => {
  for (const file of [
    "app/opening-prologue.tsx",
    "app/backlund-control-map.tsx",
    "app/ability-console.tsx",
    "app/complete-game.tsx",
  ]) {
    assert.doesNotMatch(source(file), /style=\{\{/);
  }
});

test("persistence uses a Main-process SQLite bridge instead of renderer filesystem access", () => {
  const main = source("electron/main.cjs");
  const serverPort = source("electron/server-port.cjs");
  const preload = source("electron/preload.cjs");
  const sqlite = source("electron/persistence-sqlite.cjs");
  const ipc = source("electron/persistence-ipc.cjs");

  assert.match(main, /createSqlitePersistenceStore/);
  assert.match(preload, /mistPersistence/);
  assert.match(sqlite, /node:sqlite/);
  assert.match(sqlite, /journal_mode = WAL/);
  assert.match(ipc, /untrusted-renderer/);
  assert.match(main, /event\?\.sender !== mainWindow\.webContents/);
  assert.match(main, /serverPort/);
  assert.match(main, /resolveServerPort/);
  assert.match(serverPort, /EADDRINUSE/);
  assert.doesNotMatch(preload, /require\("node:fs"\)|readFile|writeFile/);
});

test("release workflow disables implicit publish and enforces provenance gates", () => {
  const workflow = source(".github/workflows/release.yml");
  const builder = source("electron-builder.yml");

  assert.match(workflow, /--publish never/);
  assert.match(workflow, /actions\/attest@v4/);
  assert.match(workflow, /Verify Authenticode signature/);
  assert.match(workflow, /release:smoke/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /unsigned_prerelease:/);
  assert.match(workflow, /Unsigned releases are allowed only through the explicit workflow_dispatch prerelease mode/);
  assert.match(workflow, /if \(\$env:UNSIGNED_PRERELEASE -ne "true"\)/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY = "false"/);
  assert.match(workflow, /signature\.Status -ne "NotSigned"/);
  assert.match(workflow, /gh release edit \$env:RELEASE_TAG --prerelease/);
  assert.match(workflow, /\$releaseExists = \$LASTEXITCODE -eq 0/);
  assert.match(workflow, /Materialize knowledge-backed game ledgers from authorized seed/);
  assert.match(builder, /asar: true/);
  assert.doesNotMatch(builder, /asar: false/);
});
