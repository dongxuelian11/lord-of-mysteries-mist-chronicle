import path from "node:path";
import { buildAliasMap, buildInverted } from "./lib/index-builder.mjs";
import { indexDir, readJson, writeJson } from "./lib/paths.mjs";

export function buildIndexFiles() {
  const chunks = readJson(path.join(indexDir, "chunks.json")) ?? [];
  const documents = readJson(path.join(indexDir, "documents.json")) ?? [];
  const inverted = buildInverted(chunks);
  const aliasMap = buildAliasMap(chunks);
  const vectorsFile = path.join(indexDir, "vectors.json");
  const vectors = readJson(vectorsFile) ?? undefined;
  const meta = {
    version: 2,
    builtAt: new Date().toISOString(),
    chunks: chunks.length,
    documents: documents.length,
    embeddingModel: undefined,
  };
  if (vectors) {
    meta.embeddingModel = readJson(path.join(indexDir, "embedding-meta.json"))?.model;
  }
  writeJson(path.join(indexDir, "inverted.json"), inverted);
  writeJson(path.join(indexDir, "alias-map.json"), aliasMap);
  writeJson(path.join(indexDir, "index.meta.json"), meta);
  return { chunks: chunks.length, documents: documents.length, terms: Object.keys(inverted).length };
}

function pathToFileUrl(file) {
  return `file:///${file.replace(/\\/g, "/")}`;
}

if (import.meta.url === pathToFileUrl(process.argv[1] ?? "")) {
  const result = buildIndexFiles();
  console.log(`[rag:index] 重建索引完成：${result.chunks} 切片 / ${result.documents} 文档 / ${result.terms} 词项`);
}
