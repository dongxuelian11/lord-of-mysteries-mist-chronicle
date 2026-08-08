import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-002 — city actions returned to council without opening the seeded order.
// Found by /qa on 2026-08-08.
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-08.md
test("campaign city actions open the council order composer with their seeded intent", async () => {
  const [campaign, game, council] = await Promise.all([
    readFile(new URL("../app/campaign-world-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/complete-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/weekly-council.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(campaign, /onPropose\(`调查\$\{city\.name\}/);
  assert.match(game, /setIntentText\(text\).*setCouncilDecisionSignal/s);
  assert.match(council, /useState<CouncilStage \| null>\(props\.decisionSignal > 0 \? "orders" : null\)/);
  assert.match(council, /<textarea value=\{props\.intentText\}/);
});
