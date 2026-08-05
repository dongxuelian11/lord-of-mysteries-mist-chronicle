import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("the 132-record lore corpus loads only when an AI feature actually needs retrieval", async () => {
  const [engine, ability, council, settings] = await Promise.all([
    readFile(new URL("../app/game-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ability-system.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/council-ai.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ai-settings.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [engine, ability, council]) {
    assert.doesNotMatch(source, /import \{ LORE_RECORDS \} from "\.\/generated-lore-compendium"/);
    assert.match(source, /import\("\.\/generated-lore-compendium"\)/);
  }
  assert.doesNotMatch(settings, /generated-lore-compendium/);
  assert.match(settings, /LORE_LIBRARY_SUMMARY/);
});
