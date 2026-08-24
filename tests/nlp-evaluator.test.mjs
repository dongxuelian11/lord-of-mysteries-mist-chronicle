import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("NLP evaluator reports the explicit gold gate result", async () => {
  const { stdout } = await run(process.execPath, ["scripts/nlp/eval-intent-contract.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
      TEMP: "D:\\gmzz\\.runtime\\tmp",
      TMP: "D:\\gmzz\\.runtime\\tmp",
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(stdout);
  assert.equal(report.caseCount, 160);
  assert.equal(report.categoryCount, 40);
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.gateFailures, []);
  assert.equal(report.gates.INTENT_KIND_MACRO_F1, 1);
  assert.equal(report.gates.RESOURCE_POSTURE_F1, 1);
  assert.ok(report.intentKindMacroF1ByClass.调查 >= .95);
  assert.equal(report.criticalOverGrantCount, 0);
});
