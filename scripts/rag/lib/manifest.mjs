import fs from "node:fs";
import path from "node:path";
import { ragDir, root } from "./paths.mjs";

const EXAMPLE_MANIFEST = path.join(
  root,
  "scripts",
  "rag",
  "sources.manifest.example.json"
);

export function manifestPath() {
  const privateManifest = path.join(ragDir, "sources.manifest.json");
  return fs.existsSync(privateManifest) ? privateManifest : EXAMPLE_MANIFEST;
}

export function loadManifest() {
  const file = manifestPath();
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, sources: Array.isArray(raw.sources) ? raw.sources : [] };
}

export function enabledSources(manifest) {
  return manifest.sources.filter((source) => source.enabled !== false);
}

export function resolveIncludePatterns(source) {
  const base = source.kind === "git" ? source.path : path.join(root, source.path ?? ".");
  return { base, include: source.include ?? ["**/*"], exclude: source.exclude ?? [] };
}
