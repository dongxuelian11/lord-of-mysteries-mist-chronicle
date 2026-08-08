import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve("node_modules/vinext/dist/server/static-file-cache.js");
const original = "relativePath: path.relative(base, batch[j]),";
const patched = "relativePath: path.relative(base, batch[j]).split(path.sep).join(\"/\"),";

try {
  await access(target);
} catch {
  console.log("[patch-vinext-windows] vinext is not installed; skipping.");
  process.exit(0);
}

const source = await readFile(target, "utf8");
if (source.includes(patched)) {
  console.log("[patch-vinext-windows] static asset paths are already normalized.");
} else if (source.includes(original)) {
  await writeFile(target, source.replace(original, patched), "utf8");
  console.log("[patch-vinext-windows] normalized static asset cache keys for Windows.");
} else {
  console.warn("[patch-vinext-windows] target signature not found; vinext may have changed.");
}
