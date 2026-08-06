import fs from "node:fs";
import path from "node:path";
import { parseAss } from "./ass.mjs";
import { parseEpub } from "./epub.mjs";
import { parseHtml } from "./html.mjs";
import { parseJson, parseJsonl } from "./json.mjs";
import { parsePdf } from "./pdf.mjs";
import { parseText } from "./text.mjs";
import { parseYaml } from "./yaml.mjs";

const EXTENSION_PARSERS = {
  ".txt": parseText,
  ".md": parseText,
  ".markdown": parseText,
  ".html": parseHtml,
  ".htm": parseHtml,
  ".json": parseJson,
  ".jsonl": parseJsonl,
  ".yaml": parseYaml,
  ".yml": parseYaml,
  ".epub": parseEpub,
  ".pdf": parsePdf,
  ".ass": parseAss,
};

export function parserForFile(file) {
  return EXTENSION_PARSERS[path.extname(file).toLowerCase()];
}

export async function parseFile(file, baseMeta) {
  const parser = parserForFile(file);
  if (!parser) {
    return { error: "UNSUPPORTED_PARSER", message: `没有 ${path.extname(file)} 解析器` };
  }
  const buffer = fs.readFileSync(file);
  if (path.extname(file).toLowerCase() === ".epub") {
    return parseEpub(buffer, file, baseMeta);
  }
  if (path.extname(file).toLowerCase() === ".pdf") {
    return parsePdf(buffer, file, baseMeta);
  }
  if (path.extname(file).toLowerCase() === ".ass") {
    return parseAss(buffer.toString("utf8"), file, baseMeta);
  }
  return parser(buffer.toString("utf8"), file, baseMeta);
}
