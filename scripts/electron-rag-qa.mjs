// RAG Worker 桥接 QA：在真实 Electron 窗口里调用 window.mistRag。
// 用法: node scripts/electron-rag-qa.mjs [exePath] [port]
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareQaEnvironment, resolveQaPaths } from "./lib/qa-paths.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exePath =
  process.argv[2] || path.join(root, "node_modules", "electron", "dist", "electron.exe");
const port = Number(process.argv[3] || 3225);
const qaPaths = resolveQaPaths();
const qaEnv = prepareQaEnvironment({ runtimePaths: qaPaths });

const { _electron } = await import(pathToFileURL(qaPaths.playwrightIndex).href);
const { createInitialGame } = await import(pathToFileURL(path.join(root, "app", "game-model.ts")).href);
const seededGame = createInitialGame("seer");
const app = await _electron.launch({
  executablePath: exePath,
  args: ["."],
  cwd: root,
  env: {
    ...qaEnv,
    RAG_INDEX_DIR: qaPaths.ragRoot,
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

const result = await window.evaluate(async (activeSave) => {
  const rag = window.mistRag;
  if (!rag || !window.mistPersistence) return { bridge: false };
  const saved = await window.mistPersistence.commitTurn("mist-chronicle-complete-v21", activeSave, []);
  if (!saved?.available || !saved?.saved || !saved?.durable) return { bridge: true, status: { available: false, error: saved?.error ?? "seed-save-failed" } };
  const status = await rag.status();
  const search = await rag.search({
    query: "占卜家途径的序列9",
    purpose: "player-ability",
    principalRef: "player",
    limit: 5,
    maxChars: 2000,
  });
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
  };
}, JSON.stringify(seededGame));

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
