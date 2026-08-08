import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const assetsDir = path.join(root, "dist", "client", "assets");
const limitBytes = 450 * 1024;

if (!fs.existsSync(assetsDir)) {
  console.error("[bundle:budget] dist/client/assets is missing; run npm run build first");
  process.exit(1);
}

const javascript = fs.readdirSync(assetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => ({
    name: entry.name,
    bytes: fs.statSync(path.join(assetsDir, entry.name)).size,
  }))
  .sort((a, b) => b.bytes - a.bytes);

if (!javascript.length) {
  console.error("[bundle:budget] no client JavaScript chunks were found");
  process.exit(1);
}

const offenders = javascript.filter((entry) => entry.bytes > limitBytes);
if (offenders.length) {
  for (const entry of offenders) {
    console.error(`[bundle:budget] ${entry.name} is ${(entry.bytes / 1024).toFixed(1)} KiB (limit 450 KiB)`);
  }
  process.exit(1);
}

console.log(`[bundle:budget] largest=${javascript[0].name} ${(javascript[0].bytes / 1024).toFixed(1)} KiB; limit=450 KiB`);
