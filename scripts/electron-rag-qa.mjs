// RAG Worker 桥接 QA：在真实 Electron 窗口里调用 window.mistRag。
// 用法: node scripts/electron-rag-qa.mjs [exePath] [port]
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exePath =
  process.argv[2] || path.join(root, "node_modules", "electron", "dist", "electron.exe");
const port = Number(process.argv[3] || 3225);

const playwrightIndex = path.join(
  "C:\\Users\\Administrator\\AppData\\Local\\Temp\\gmzz-qa-playwright",
  "node_modules",
  "playwright",
  "index.mjs"
);
const { _electron } = await import(pathToFileURL(playwrightIndex).href);
const app = await _electron.launch({
  executablePath: exePath,
  args: ["."],
  cwd: root,
  env: {
    ...process.env,
    GMZZ_PORT: String(port),
    GMZZ_HOST: "127.0.0.1",
  },
});

const errors = [];
const window = await app.firstWindow();
window.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
window.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
await window.waitForLoadState("load");
await window.waitForTimeout(2500);

const result = await window.evaluate(async () => {
  const rag = window.mistRag;
  if (!rag) return { bridge: false };
  const status = await rag.status();
  const search = await rag.search({
    query: "占卜家途径的序列9",
    audience: { kind: "player-known", knownLoreIds: [], topicGrants: ["pathways"] },
    maxSpoilerScope: "all",
    limit: 5,
    maxChars: 2000,
  });
  const ids = await rag.listChunkIds();
  return {
    bridge: true,
    status,
    search: {
      available: search.available,
      recordCount: search.records.length,
      firstTitle: search.records[0]?.title ?? null,
      contextHead: search.context.slice(0, 80),
      error: search.error ?? null,
    },
    idCount: ids.length,
  };
});

console.log("[rag-qa] bridge=" + JSON.stringify(result, null, 2));
console.log("[rag-qa] errors=" + JSON.stringify(errors.slice(0, 8)));
await app.close();
await new Promise((r) => setTimeout(r, 2000));

let leftover = 0;
const exeName = path.basename(exePath);
try {
  const out = execFileSync(
    "tasklist",
    ["/FI", `IMAGENAME eq ${exeName}`, "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true }
  );
  leftover = out.split(/\r?\n/).filter((l) => l.includes(exeName)).length;
} catch {
  leftover = 0;
}
console.log("[rag-qa] leftover=" + leftover);
const pass =
  result?.bridge === true &&
  result?.status?.available === true &&
  result?.search?.available === true &&
  result?.search?.recordCount > 0 &&
  leftover === 0 &&
  errors.length === 0;
console.log(`[rag-qa] RESULT=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
