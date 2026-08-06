// 生成内置知识库 seed manifest（写入 private/rag/index/seed-manifest.json）。
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { indexDir } from "./lib/paths.mjs";

const require = createRequire(import.meta.url);
const { buildSeedManifest } = require("../../electron/knowledge-seed.cjs");

const manifest = buildSeedManifest(indexDir);
const target = path.join(indexDir, "seed-manifest.json");
fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
console.log(
  `[rag:seed:manifest] ${target} corpusVersion=${manifest.corpusVersion} files=${Object.keys(manifest.files).length}`
);
