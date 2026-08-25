import { readFile } from "node:fs/promises";
import { loadRuntimeModule, closeRuntimeServer } from "../rag/lib/load-runtime.mjs";

const fixtureUrl = new URL("../../tests/fixtures/nlp/intent-contract-cases.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");

const same = (left, right) => left === right;
const emptyValue = (value) => value === undefined || value === null || value === "";

function scoreField(cases, field, expectedValue, actualValue) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const item of cases) {
    const expected = expectedValue(item);
    const actual = actualValue(item);
    const expectedPresent = !emptyValue(expected);
    const actualPresent = !emptyValue(actual);
    if (expectedPresent && actualPresent && same(expected, actual)) tp += 1;
    else {
      if (actualPresent) fp += 1;
      if (expectedPresent) fn += 1;
    }
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { field, tp, fp, fn, precision, recall, f1 };
}

const evaluated = fixture.cases.map((item) => ({ item, result: parser.parseIntentContract(item.text) }));
const confusion = {};
for (const { item, result } of evaluated) {
  const expected = item.expected.kind;
  const actual = result.fields.kind.normalizedValue ?? "absent";
  confusion[expected] ??= {};
  confusion[expected][actual] = (confusion[expected][actual] ?? 0) + 1;
}

function macroF1(matrix, labels) {
  const values = labels.map((label) => {
    const tp = matrix[label]?.[label] ?? 0;
    const fp = labels.reduce((sum, expected) => sum + (expected === label ? 0 : matrix[expected]?.[label] ?? 0), 0);
    const fn = labels.reduce((sum, actual) => sum + (actual === label ? 0 : matrix[label]?.[actual] ?? 0), 0);
    const precision = tp + fp ? tp / (tp + fp) : 1;
    const recall = tp + fn ? tp / (tp + fn) : 1;
    return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  });
  return { value: values.reduce((sum, item) => sum + item, 0) / values.length, perClass: Object.fromEntries(labels.map((label, index) => [label, values[index]])) };
}

const kindLabels = [...new Set(fixture.cases.map((item) => item.expected.kind))];
const kindMacro = macroF1(confusion, kindLabels);

const fieldMetrics = [
  scoreField(evaluated, "intentKind", ({ item }) => item.expected.kind, ({ result }) => result.fields.kind.normalizedValue),
  scoreField(evaluated, "target", ({ item }) => item.expected.target, ({ result }) => result.fields.target.state === "present" ? result.fields.target.normalizedValue : undefined),
  scoreField(evaluated, "resourcePosture", ({ item }) => item.expected.posture, ({ result }) => result.fields.resourcePosture.normalizedValue ?? result.resources.posture),
  scoreField(evaluated, "authorizationScope", ({ item }) => item.expected.authorizationScope, ({ result }) => result.authorization.scope),
];

const critical = evaluated.filter(({ item }) => item.tags?.includes("critical"));
const criticalOverGrantCount = critical.filter(({ item, result }) => (
  (item.expected.authorizationScope !== "broad" && result.authorization.scope === "broad")
  || (item.expected.posture !== "all-in" && result.resources.posture === "all-in")
  || (emptyValue(item.expected.target) && result.fields.target.state === "present")
)).length;
const ambiguityDenominator = fixture.cases.filter((item) => item.expected.needsClarification).length;
const ambiguityHits = fixture.cases.filter((item, index) => item.expected.needsClarification && evaluated[index].result.needsClarification).length;
const ambiguityRecall = ambiguityDenominator ? ambiguityHits / ambiguityDenominator : 1;
const kindF1 = kindMacro.value;
const targetF1 = fieldMetrics.find((metric) => metric.field === "target")?.f1 ?? 0;
const report = {
  schemaVersion: fixture.schemaVersion,
  ruleVersion: parser.INTENT_CONTRACT_RULE_VERSION,
  caseCount: fixture.cases.length,
  categoryCount: new Set(fixture.cases.map((item) => item.intentClass)).size,
  confusionMatrix: confusion,
  intentKindMacroF1ByClass: kindMacro.perClass,
  fieldMetrics,
  criticalOverGrantCount,
  ambiguityRecall,
  gates: {
    CRITICAL_NEGATION_ACCURACY: ambiguityRecall,
    CRITICAL_AUTHORIZATION_OVER_GRANT_COUNT: criticalOverGrantCount,
    INTENT_KIND_MACRO_F1: kindF1,
    TARGET_FIELD_F1: targetF1,
    RESOURCE_POSTURE_F1: fieldMetrics.find((metric) => metric.field === "resourcePosture")?.f1 ?? 0,
    AMBIGUOUS_HIGH_IMPACT_RECALL: ambiguityRecall,
  },
};
const strict = process.argv.includes("--strict");
const resourceF1 = fieldMetrics.find((metric) => metric.field === "resourcePosture")?.f1 ?? 0;
const failures = [
  ...(report.criticalOverGrantCount === 0 ? [] : ["critical authorization/resource over-grant"]),
  ...(report.gates.INTENT_KIND_MACRO_F1 >= .95 ? [] : ["intent kind F1 below .95"]),
  ...(report.gates.TARGET_FIELD_F1 >= .95 ? [] : ["target F1 below .95"]),
  ...(resourceF1 >= .95 ? [] : ["resource posture F1 below .95"]),
  ...(report.ambiguityRecall >= 1 ? [] : ["ambiguity recall below 1"]),
];
report.status = failures.length ? "BASELINE_BELOW_GATE" : "PASS";
report.gateFailures = failures;
console.log(JSON.stringify(report, null, 2));
await closeRuntimeServer();
if (strict && failures.length) {
  console.error(`NLP_CONTRACT_GATE_FAILED: ${failures.join(", ")}`);
  process.exitCode = 1;
}
