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
