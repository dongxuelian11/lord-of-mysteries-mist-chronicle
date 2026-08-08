import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VISIBILITIES = new Set(["public", "restricted", "secret", "cosmic"]);
const GRADES = new Set(["A", "B", "C", "D"]);

function locatorNumber(locator) {
  const match = /^lotm-(\d+)-(\d+)$/.exec(locator);
  return match ? Number(match[1]) * 1000 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

function parseSources(records) {
  const bibliography = records.find((record) => record.id === "lotm-16-001");
  if (!bibliography) throw new Error("authorized seed is missing the source bibliography (lotm-16-001)");
  const sources = [];
  for (const line of bibliography.content.split(/\r?\n/)) {
    const match = /^\|\s*(S\d{2})\s*\|\s*([A-D])\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(line);
    if (!match) continue;
    sources.push({ id: match[1], grade: match[2], type: match[3].trim(), title: match[4].trim(), use: match[5].trim() });
  }
  if (!sources.some((source) => source.id === "S01" && source.grade === "A")) {
    throw new Error("authorized seed bibliography does not contain the required S01 grade-A source");
  }
  return sources;
}

function parsePathway(record) {
  const title = /·\s*\d+\.\s*(.+?)途径（序列9：(.+?)）/.exec(record.title);
  const group = /^•\s*源质组：\s*(.+?)\s*→\s*(.+?)\s*$/m.exec(record.content);
  const theme = /^•\s*核心主题：\s*(.+?)\s*$/m.exec(record.content);
  const representatives = /^•\s*代表人物：\s*(.+?)\s*$/m.exec(record.content);
  const sequences = [...record.content.matchAll(/^\|\s*([0-9])\s*\|\s*([^|]+?)\s*\|\s*$/gm)]
    .map((match) => ({ sequence: Number(match[1]), name: match[2].trim() }))
    .sort((left, right) => right.sequence - left.sequence);
  if (!title || !group || !theme || !representatives || sequences.length !== 10 || sequences.some((entry, index) => entry.sequence !== 9 - index)) {
    throw new Error(`cannot reconstruct pathway ledger from ${record.id}`);
  }
  const sequenceNames = sequences.map((entry) => entry.name);
  return {
    group: group[1].trim(),
    above: group[2].trim(),
    pathway: title[1].trim(),
    entry: title[2].trim(),
    theme: theme[1].trim(),
    representatives: representatives[1].trim(),
    sequence_0_to_9: [...sequenceNames].reverse(),
    sequence_9_to_0: sequenceNames,
  };
}

export function buildLoreModuleFromSeedChunks(chunks) {
  if (!Array.isArray(chunks)) throw new Error("seed chunks.json must contain an array");
  const selected = chunks
    .filter((chunk) => chunk?.sourceId === "legacy-compendium" && /^lotm-\d+-\d+$/.test(String(chunk.sourceLocator ?? "")))
    .sort((left, right) => locatorNumber(left.sourceLocator) - locatorNumber(right.sourceLocator));
  if (selected.length < 60) throw new Error(`authorized seed contains too few design-ledger records: ${selected.length}`);

  const seen = new Set();
  const records = selected.map((chunk) => {
    const id = String(chunk.sourceLocator);
    if (seen.has(id)) throw new Error(`authorized seed contains duplicate lore record: ${id}`);
    seen.add(id);
    const visibility = String(chunk.visibility ?? "");
    if (!VISIBILITIES.has(visibility)) throw new Error(`authorized seed contains invalid visibility for ${id}`);
    const sourceIds = [...new Set([...String(chunk.content ?? "").matchAll(/\[(S\d{2})\]/g)].map((match) => match[1]))];
    const sourceGrade = GRADES.has(String(chunk.sourceGrade)) ? String(chunk.sourceGrade) : "C";
    return {
      id,
      title: String(chunk.title ?? id),
      content: String(chunk.content ?? ""),
      visibility,
      topics: Array.isArray(chunk.topics) ? chunk.topics.map(String) : [],
      sourceIds,
      sourceGrade,
      canon: id.startsWith("lotm-15-") ? "disputed" : "derived",
    };
  });

  const sources = parseSources(records);
  const sourceGradeById = new Map(sources.map((source) => [source.id, source.grade]));
  const gradeOrder = ["A", "B", "C", "D"];
  for (const record of records) {
    const citedGrades = record.sourceIds.map((id) => sourceGradeById.get(id)).filter(Boolean);
    if (citedGrades.length) record.sourceGrade = citedGrades.sort((left, right) => gradeOrder.indexOf(left) - gradeOrder.indexOf(right))[0];
  }
  const pathwayRecords = records.filter((record) => /^lotm-04-(00[2-9]|01\d|02[0-3])$/.test(record.id));
  if (pathwayRecords.length !== 22) throw new Error(`authorized seed must contain 22 pathway ledgers, found ${pathwayRecords.length}`);
  const pathways = pathwayRecords.map(parsePathway);
  const meta = { version: "2026-08-02", scope: "authorized runtime seed", recordCount: records.length };

  return `// Generated deterministically from the authorized runtime knowledge seed. Do not edit by hand.\n`
    + `import type { LoreRecord } from "./lore-knowledge";\n\n`
    + `export const LORE_COMPENDIUM_META = ${JSON.stringify(meta, null, 2)} as const;\n\n`
    + `export const LOTM_SOURCES = ${JSON.stringify(sources, null, 2)} as const;\n\n`
    + `export const LOTM_PATHWAYS = ${JSON.stringify(pathways, null, 2)} as const;\n\n`
    + `export const LOTM_GLOSSARY: unknown[] = [];\n\n`
    + `export const LORE_RECORDS: LoreRecord[] = ${JSON.stringify(records, null, 2)};\n`;
}

async function main() {
  const [seedDirArg, outputArg] = process.argv.slice(2);
  if (!seedDirArg || !outputArg) throw new Error("usage: node materialize-lore-from-seed.mjs <seed-dir> <output.ts>");
  const chunks = JSON.parse(await readFile(path.resolve(seedDirArg, "chunks.json"), "utf8"));
  const output = path.resolve(outputArg);
  await mkdir(path.dirname(output), { recursive: true });
  const source = buildLoreModuleFromSeedChunks(chunks);
  await writeFile(output, source, "utf8");
  console.log(`[materialize-lore] wrote ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
