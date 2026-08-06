import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { loadFixtureDocs } from "../scripts/rag/eval.mjs";
import { buildInverted } from "../scripts/rag/lib/index-builder.mjs";
import { JsHybridRetriever } from "../scripts/rag/lib/search.mjs";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("TS 运行时与 JS worker 检索在固定夹具上完全一致", async () => {
  const chunks = await loadFixtureDocs("tests/fixtures/rag");
  const inverted = buildInverted(chunks);
  const cases = JSON.parse(
    fs.readFileSync(
      path.join("tests", "fixtures", "rag", "eval-cases.json"),
      "utf8"
    )
  );
  const { HybridRetriever } = await loadRuntimeModule("app/rag/hybrid-retriever.ts");
  const ts = new HybridRetriever({ chunks, inverted });
  const js = new JsHybridRetriever({ chunks, inverted });
  for (const caseItem of cases) {
    const query = {
      text: caseItem.query,
      filters: {
        audience: caseItem.audience,
        maxSpoilerScope: caseItem.filters?.maxSpoilerScope ?? "all",
        week: caseItem.filters?.week,
        allowedVolumes: caseItem.filters?.allowedVolumes,
      },
      limit: caseItem.limit ?? 8,
      maxChars: caseItem.maxChars ?? 4000,
    };
    const tsResult = ts.searchSync(query);
    const jsResult = js.searchSync(query);
    assert.deepEqual(
      tsResult.chunks.map((chunk) => chunk.id),
      jsResult.chunks.map((chunk) => chunk.id),
      `case ${caseItem.id} 选中切片不一致`
    );
    assert.equal(tsResult.context, jsResult.context, `case ${caseItem.id} 上下文不一致`);
  }
  await closeRuntimeServer();
});
