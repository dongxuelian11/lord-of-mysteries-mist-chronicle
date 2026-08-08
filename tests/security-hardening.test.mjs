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

  assert.match(main, /safeStorage/);
  assert.match(preload, /mistCredentials/);
  assert.match(renderer, /apiKey: "", rememberKey/);
  assert.doesNotMatch(renderer, /apiKey:\s*rememberApiKey\s*\?/);
});

test("release workflow disables implicit publish and enforces provenance gates", () => {
  const workflow = source(".github/workflows/release.yml");
  const builder = source("electron-builder.yml");

  assert.match(workflow, /--publish never/);
  assert.match(workflow, /actions\/attest@v4/);
  assert.match(workflow, /Verify Authenticode signature/);
  assert.match(workflow, /release:smoke/);
  assert.match(builder, /asar: true/);
  assert.doesNotMatch(builder, /asar: false/);
});
