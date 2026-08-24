import { performance } from "node:perf_hooks";

import { inspectVerbatimLoreLeak } from "../../electron/rag-evidence.cjs";

const records = Array.from({ length: 8 }, (_, index) => ({
  id: `benchmark-${index}`,
  content: `${"普通城市背景资料".repeat(2_000)}${index}号唯一暗线坐标与交接条件`,
  visibility: "restricted",
  sensitivity: "medium",
  uniqueness: "common",
}));
const response = `${"模型输出中的公开摘要".repeat(2_000)}${records[0].content.slice(200, 240)}`;
const samples = [];
for (let index = 0; index < 25; index += 1) {
  const started = performance.now();
  inspectVerbatimLoreLeak(response, records);
  samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))];
console.log(JSON.stringify({
  policy: "verbatim-leak-v2",
  responseChars: response.length,
  sourceRecords: records.length,
  p50Ms: Number(percentile(0.5).toFixed(3)),
  p95Ms: Number(percentile(0.95).toFixed(3)),
  maxMs: Number(samples.at(-1).toFixed(3)),
  mode: "Set window scan; no Aho-Corasick escalation required by this local benchmark",
}, null, 2));
