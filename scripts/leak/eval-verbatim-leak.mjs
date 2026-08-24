import { readFile } from "node:fs/promises";

import {
  LEAK_POLICY_VERSION,
  inspectVerbatimLoreLeak,
  leakPolicyForRecord,
} from "../../electron/rag-evidence.cjs";

const fixture = JSON.parse(await readFile(new URL("../../tests/fixtures/leak/verbatim-leak-cases.json", import.meta.url), "utf8"));
const evaluated = fixture.cases.map((item) => {
  const result = inspectVerbatimLoreLeak(item.response, item.records);
  return { item, result, actual: result.rejects.length ? "reject" : "allow" };
});

const expectedReject = evaluated.filter(({ item }) => item.expected === "reject");
const expectedAllow = evaluated.filter(({ item }) => item.expected === "allow");
const hidden = evaluated.filter(({ item }) => item.category === "hidden-verbatim" || item.category === "hidden-punctuated");
const structured = evaluated.filter(({ item }) => item.category === "structured-fact");
const publicAndSafe = evaluated.filter(({ item }) => item.category === "public-canonical" || item.category === "safe-overlap");
const falseNegatives = expectedReject.filter(({ actual }) => actual !== "reject");
const falsePositives = expectedAllow.filter(({ actual }) => actual !== "allow");
const hiddenFalseNegatives = hidden.filter(({ item, actual }) => item.expected === "reject" && actual !== "reject");
const structuredFalseNegatives = structured.filter(({ actual }) => actual !== "reject");
const publicSafeFalsePositives = publicAndSafe.filter(({ actual }) => actual !== "allow");
const riskSignals = evaluated.reduce((sum, entry) => sum + entry.result.riskSignals.length, 0);

const policyExamples = {};
for (const entry of evaluated) {
  for (const record of entry.item.records ?? []) {
    const sourceLength = typeof record.content === "string" ? [...record.content].length : 0;
    const policy = leakPolicyForRecord(record, sourceLength);
    const key = `${policy.sensitivity}:${policy.uniqueness}:${policy.lengthBand}`;
    policyExamples[key] ??= { ...policy, sourceLength };
  }
}

const report = {
  schemaVersion: fixture.schemaVersion,
  fixturePolicyVersion: fixture.policyVersion,
  policyVersion: LEAK_POLICY_VERSION,
  caseCount: fixture.cases.length,
  categoryCount: new Set(fixture.cases.map((item) => item.category)).size,
  categoryCounts: Object.fromEntries([...new Set(fixture.cases.map((item) => item.category))].map((category) => [category, fixture.cases.filter((item) => item.category === category).length])),
  expectedRejectCount: expectedReject.length,
  expectedAllowCount: expectedAllow.length,
  falseNegativeCount: falseNegatives.length,
  falsePositiveCount: falsePositives.length,
  hiddenVerbatimFalseNegativeCount: hiddenFalseNegatives.length,
  structuredFactFalseNegativeCount: structuredFalseNegatives.length,
  publicSafeFalsePositiveCount: publicSafeFalsePositives.length,
  publicSafeFalsePositiveRate: expectedAllow.length ? falsePositives.length / expectedAllow.length : 0,
  riskSignalCount: riskSignals,
  policyExamples,
  gates: {
    HIDDEN_VERBATIM_FALSE_NEGATIVES: hiddenFalseNegatives.length,
    STRUCTURED_FACT_FALSE_NEGATIVES: structuredFalseNegatives.length,
    PUBLIC_SAFE_FALSE_POSITIVE_RATE: expectedAllow.length ? falsePositives.length / expectedAllow.length : 0,
    PUBLIC_SAFE_FALSE_POSITIVE_MAX: 0.01,
  },
};

const failures = [
  ...(hiddenFalseNegatives.length === 0 ? [] : [`hidden verbatim false negatives=${hiddenFalseNegatives.length}`]),
  ...(structuredFalseNegatives.length === 0 ? [] : [`structured fact false negatives=${structuredFalseNegatives.length}`]),
  ...(report.publicSafeFalsePositiveRate <= 0.01 ? [] : [`public/safe false positive rate=${report.publicSafeFalsePositiveRate}`]),
];
report.status = failures.length ? "FAIL" : "PASS";
report.gateFailures = failures;
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict") && failures.length) {
  console.error(`LEAK_POLICY_GATE_FAILED: ${failures.join(", ")}`);
  process.exitCode = 1;
}
