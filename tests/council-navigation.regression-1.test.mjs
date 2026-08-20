import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-002 — map actions must return to council and open the seeded order.
// Found by /qa on 2026-08-08.
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-08.md
test("map suggestions seed the always-visible leadership composer", async () => {
  const [map, game, council] = await Promise.all([
    readFile(new URL("../app/backlund-control-map.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/complete-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/weekly-council.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(map, /props\.onFormDirection/);
  assert.match(game, /setIntentText\(text\).*setCouncilDecisionSignal/s);
  assert.doesNotMatch(council, /type CouncilStage|"reports" \| "agenda" \| "discussion" \| "orders"/);
  assert.match(council, /ref=\{textareaRef\} value=\{props\.intentText\}/);
  assert.match(council, /props\.decisionSignal > 0.*textareaRef\.current\?\.focus/s);
  assert.match(council, /buildCouncilMatters\(game\)/);
});
