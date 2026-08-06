import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

export const privateDir = path.join(root, "private");
export const ragDir = path.join(privateDir, "rag");
export const sourceDir = path.join(ragDir, "sources");
export const cacheDir = path.join(ragDir, "cache");
export const indexDir = path.join(ragDir, "index");
export const stateDir = path.join(indexDir, "state");

export function ensureDirs() {
  for (const dir of [privateDir, ragDir, sourceDir, cacheDir, indexDir, stateDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
