import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-002 — map actions must return to council and open the seeded order.
// Found by /qa on 2026-08-08.
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-08.md
test("map suggestions open the council order composer with their seeded intent", async () => {
  const [map, game, council] = await Promise.all([
    readFile(new URL("../app/backlund-control-map.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/complete-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/weekly-council.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(map, /props\.onFormDirection/);
  assert.match(game, /setIntentText\(text\).*setCouncilDecisionSignal/s);
  assert.match(council, /useState<CouncilStage \| null>\(props\.decisionSignal > 0 \? "orders" : null\)/);
  assert.match(council, /<textarea value=\{props\.intentText\}/);
});
