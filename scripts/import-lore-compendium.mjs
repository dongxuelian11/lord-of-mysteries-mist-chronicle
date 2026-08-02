import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error("usage: node scripts/import-lore-compendium.mjs <extracted-root> <output.ts>");

const sourceRoot = resolve(sourceArg);
const outputPath = resolve(outputArg);
const sources = JSON.parse(await readFile(join(sourceRoot, "data", "sources.json"), "utf8"));
const pathways = JSON.parse(await readFile(join(sourceRoot, "data", "22_pathways.json"), "utf8"));
const glossary = JSON.parse(await readFile(join(sourceRoot, "data", "术语表.json"), "utf8"));
const sourceById = new Map(sources.map((source) => [source.id, source]));

const policies = {
  "00": { visibility: "cosmic", topics: ["overview", "cosmology", "pathways"] },
  "01": { visibility: "cosmic", topics: ["cosmology", "world-truth"] },
  "02": { visibility: "secret", topics: ["history", "timeline", "canon-actors"] },
  "03": { visibility: "restricted", topics: ["pathways", "beyonder-system", "advancement"] },
  "04": { visibility: "restricted", topics: ["pathways", "sequences", "abilities"] },
  "05": { visibility: "cosmic", topics: ["sefirot", "outer-deities", "cosmology"] },
  "06": { visibility: "secret", topics: ["deities", "angels", "high-sequence"] },
  "07": { visibility: "restricted", topics: ["factions", "churches", "families"] },
  "08": { visibility: "public", topics: ["geography", "countries", "cities"] },
  "09": { visibility: "restricted", topics: ["spirit-world", "astral-world", "rituals"] },
  "10": { visibility: "restricted", topics: ["sealed-artifacts", "items"] },
  "11": { visibility: "public", topics: ["society", "technology", "economy"] },
  "12": { visibility: "secret", topics: ["canon-actors", "relationships", "tarot-club"] },
  "13": { visibility: "cosmic", topics: ["circle-of-inevitability", "boons", "outer-deities"] },
  "14": { visibility: "secret", topics: ["narrative-principles", "themes"] },
  "15": { visibility: "restricted", topics: ["disputes", "naming", "source-criticism"] },
  "16": { visibility: "restricted", topics: ["sources", "source-criticism"] },
};

function cleanMarkdown(value) {
  return value
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunksOf(value, max = 1200) {
  const paragraphs = value.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > max) { chunks.push(current); current = ""; }
    if (paragraph.length > max) {
      if (current) { chunks.push(current); current = ""; }
      for (let index = 0; index < paragraph.length; index += max) chunks.push(paragraph.slice(index, index + max));
    } else current += `${current ? "\n\n" : ""}${paragraph}`;
  }
  if (current) chunks.push(current);
  return chunks;
}

function sourceGrade(ids) {
  const order = ["A", "B", "C", "D"];
  return ids.map((id) => sourceById.get(id)?.grade).filter(Boolean).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? "C";
}

function parseDocument(fileName, markdown) {
  const prefix = fileName.slice(0, 2);
  const policy = policies[prefix];
  if (!policy) return [];
  const lines = markdown.split(/\r?\n/);
  const documentTitle = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() ?? basename(fileName, ".md");
  const sections = [];
  let heading = documentTitle;
  let body = [];
  const flush = () => {
    const content = cleanMarkdown(body.join("\n"));
    if (content) sections.push({ heading, content });
    body = [];
  };
  for (const line of lines) {
    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (match) { flush(); heading = match[2].trim(); }
    else body.push(line);
  }
  flush();
  let sequence = 0;
  return sections.flatMap((section) => chunksOf(section.content).map((content) => {
    const sourceIds = [...new Set([...content.matchAll(/\[(S\d{2})\]/g)].map((match) => match[1]))];
    const grade = sourceGrade(sourceIds);
    sequence += 1;
    return {
      id: `lotm-${prefix}-${String(sequence).padStart(3, "0")}`,
      title: section.heading === documentTitle ? documentTitle : `${documentTitle} · ${section.heading}`,
      content,
      visibility: policy.visibility,
      topics: policy.topics,
      sourceIds,
      sourceGrade: grade,
      canon: prefix === "15" ? "disputed" : "derived",
    };
  }));
}

const files = (await readdir(sourceRoot)).filter((file) => /^\d{2}_.+\.md$/u.test(file)).sort();
const records = [];
for (const file of files) records.push(...parseDocument(file, await readFile(join(sourceRoot, file), "utf8")));

const output = `// Generated from the user-supplied LOTM Worldbuilding Compendium. Do not edit by hand.\n` +
  `import type { LoreRecord } from "./lore-knowledge";\n\n` +
  `export const LORE_COMPENDIUM_META = ${JSON.stringify({ version: "2026-08-02", scope: "LOTM I primary, COI supplementary", recordCount: records.length }, null, 2)} as const;\n\n` +
  `export const LOTM_SOURCES = ${JSON.stringify(sources, null, 2)} as const;\n\n` +
  `export const LOTM_PATHWAYS = ${JSON.stringify(pathways, null, 2)} as const;\n\n` +
  `export const LOTM_GLOSSARY = ${JSON.stringify(glossary, null, 2)} as const;\n\n` +
  `export const LORE_RECORDS: LoreRecord[] = ${JSON.stringify(records, null, 2)};\n`;

await writeFile(outputPath, output, "utf8");
console.log(JSON.stringify({ outputPath, records: records.length, pathways: pathways.length, sources: sources.length, glossary: glossary.length }));
