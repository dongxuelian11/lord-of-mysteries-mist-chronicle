import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const { assertNoVerbatimLoreLeak, inspectVerbatimLoreLeak, leakPolicyForRecord } = require("../electron/rag-evidence.cjs");

test("leak evaluator has 120 explicit sensitivity-tiered gold cases and passes strict gates", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/leak/verbatim-leak-cases.json", import.meta.url), "utf8"));
  assert.ok(fixture.cases.length >= 120);
  const { stdout } = await run(process.execPath, ["scripts/leak/eval-verbatim-leak.mjs", "--strict"], {
    cwd: process.cwd(),
    env: { ...process.env, GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime", TEMP: "D:\\gmzz\\.runtime\\tmp", TMP: "D:\\gmzz\\.runtime\\tmp" },
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(stdout);
  assert.equal(report.caseCount, 120);
  assert.equal(report.categoryCount, 5);
  assert.equal(report.status, "PASS");
  assert.equal(report.hiddenVerbatimFalseNegativeCount, 0);
  assert.equal(report.structuredFactFalseNegativeCount, 0);
  assert.equal(report.publicSafeFalsePositiveCount, 0);
  assert.deepEqual(report.gateFailures, []);
});

test("public canonical phrases bypass privacy rejection while legacy unlabelled evidence stays strict", () => {
  const phrase = "贝克兰德的值夜者小队";
  assert.doesNotThrow(() => assertNoVerbatimLoreLeak(`公开资料：${phrase}`, [{ id: "public", content: phrase, visibility: "public", publicCanonical: true }]));
  assert.throws(() => assertNoVerbatimLoreLeak(`公开资料：${phrase}`, [{ id: "legacy", content: phrase }]), /WORLD_LORE_VERBATIM_LEAK_REJECTED/);
});

test("an eight-character overlap is a risk signal for common restricted lore, not an automatic rejection", () => {
  const record = { id: "common", content: "贝克兰德东区的公共钟声每天清晨六点准时响起", visibility: "restricted", sensitivity: "low", uniqueness: "common" };
  const result = inspectVerbatimLoreLeak("公开报道提到贝克兰德东区的公，今天仍按时鸣钟。", [record]);
  assert.equal(result.rejects.length, 0);
  assert.equal(result.riskSignals.length, 1);
  assert.equal(result.riskSignals[0].signalLength, 8);
  assert.equal(leakPolicyForRecord(record, record.content.length).minimumWindowLength, 20);
});

test("high-sensitivity punctuated excerpts remain rejected after normalization", () => {
  const record = { id: "secret", content: "北区旧钟楼记录了灰色雾潮的第七次回返", visibility: "secret", sensitivity: "high", uniqueness: "unique" };
  assert.throws(() => assertNoVerbatimLoreLeak("已确认：北区旧钟楼，记录了灰色雾潮的第七次回返。", [record]), /WORLD_LORE_VERBATIM_LEAK_REJECTED/);
});
