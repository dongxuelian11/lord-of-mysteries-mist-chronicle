// 按来源输出质量统计 + 30 切片抽样检查（只读，供导入质量审计）。
import { readJson } from "./lib/paths.mjs";

const chunks = readJson("private/rag/index/chunks.json") ?? [];
const bySource = {};
for (const chunk of chunks) {
  const entry =
    bySource[chunk.sourceId] ??
    {
      files: new Set(),
      docs: new Set(),
      chunks: 0,
      chars: 0,
      lens: [],
      empty: 0,
      noTitle: 0,
      noLocator: 0,
      layers: {},
      types: {},
      langs: {},
    };
  entry.chunks += 1;
  entry.chars += chunk.content.length;
  entry.lens.push(chunk.content.length);
  entry.files.add(chunk.sourcePath);
  entry.docs.add(chunk.documentId);
  if (!chunk.content.trim()) entry.empty += 1;
  if (!chunk.title) entry.noTitle += 1;
  if (!chunk.sourceLocator && !chunk.sourcePath) entry.noLocator += 1;
  entry.layers[chunk.canonLayer] = (entry.layers[chunk.canonLayer] ?? 0) + 1;
  entry.types[chunk.sourceType] = (entry.types[chunk.sourceType] ?? 0) + 1;
  entry.langs[chunk.language] = (entry.langs[chunk.language] ?? 0) + 1;
  bySource[chunk.sourceId] = entry;
}

const hash = new Map();
let exactDuplicates = 0;
for (const chunk of chunks) {
  const count = (hash.get(chunk.contentHash) ?? 0) + 1;
  hash.set(chunk.contentHash, count);
  if (count > 1) exactDuplicates += 1;
}

for (const [id, entry] of Object.entries(bySource)) {
  const sorted = [...entry.lens].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  console.log(
    `${id}: files=${entry.files.size} docs=${entry.docs.size} chunks=${entry.chunks} chars=${entry.chars} avgLen=${Math.round(entry.chars / entry.chunks)} p95Len=${p95} empty=${entry.empty} noTitle=${entry.noTitle} noLocator=${entry.noLocator} layers=${JSON.stringify(entry.layers)} types=${JSON.stringify(entry.types)} langs=${JSON.stringify(entry.langs)}`
  );
}
console.log("globalExactDuplicates=", exactDuplicates);

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const rand = seeded(7);
const sample = [];
const used = new Set();
while (sample.length < 30 && sample.length < chunks.length) {
  const index = Math.floor(rand() * chunks.length);
  if (!used.has(index)) {
    used.add(index);
    sample.push(chunks[index]);
  }
}
const noisePatterns = [/目录/, /导航/, /下一页/, /上一页/, /版权页/, /广告/];
let titleOk = 0;
let noise = 0;
let garbled = 0;
let concat = 0;
let locatorOk = 0;
for (const chunk of sample) {
  if (chunk.title) titleOk += 1;
  if (noisePatterns.some((pattern) => pattern.test(chunk.content))) noise += 1;
  if (/\uFFFD/.test(chunk.content)) garbled += 1;
  if (/\n{4,}/.test(chunk.content)) concat += 1;
  if (chunk.sourceLocator || chunk.sourcePath) locatorOk += 1;
}
console.log(
  `sample30: titleOk=${titleOk} noise=${noise} garbled=${garbled} concat=${concat} empty=${sample.filter((chunk) => !chunk.content.trim()).length} locatorOk=${locatorOk}`
);
