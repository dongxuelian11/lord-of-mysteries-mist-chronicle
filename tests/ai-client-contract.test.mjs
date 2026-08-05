import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("DeepSeek calls always disable reasoning so content is returned", async () => {
  const source = await readFile(new URL("../app/ai-client.ts", import.meta.url), "utf8");
  assert.match(source, /api\\.deepseek\\.com\/i\.test\(config\.endpoint\)/);
  assert.match(source, /thinking = \{ type: "disabled" \}/);
  assert.doesNotMatch(source, /thinking: \{ type: "enabled" \}/);
});
