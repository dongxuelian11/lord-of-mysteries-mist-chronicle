import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-001 — Windows production server cached asset URLs with backslashes.
// Found by /qa on 2026-08-08.
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-08.md
test("vinext static assets are normalized after install and before production start", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const patchScript = await readFile(new URL("../scripts/patch-vinext-windows.mjs", import.meta.url), "utf8");
  const installedCache = await readFile(new URL("../node_modules/vinext/dist/server/static-file-cache.js", import.meta.url), "utf8");

  assert.equal(packageJson.scripts.postinstall, "node scripts/patch-vinext-windows.mjs");
  assert.match(packageJson.scripts.prestart, /patch-vinext-windows\.mjs/);
  assert.ok(patchScript.includes('split(path.sep).join(\\"/\\")'));
  assert.match(installedCache, /relativePath: path\.relative\(base, batch\[j\]\)\.split\(path\.sep\)\.join\(\"\/\"\)/);
});
