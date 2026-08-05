// 灰雾纪事 · Electron 窗口端到端 QA
// 用法: node scripts/electron-ui-qa.mjs [exePath] [port]
// 打开真实游戏窗口 -> 收集页面错误 -> 截图 -> 关闭窗口 -> 验证无残留进程
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exePath =
  process.argv[2] ||
  path.join(root, "release", "win-unpacked", "MistChronicle.exe");
const port = Number(process.argv[3] || 3222);
const qaDir = process.env.QA_DIR || path.join(root, ".runtime", "prod-qa");
fs.mkdirSync(qaDir, { recursive: true });

const playwrightIndex = path.join(
  "C:\\Users\\Administrator\\AppData\\Local\\Temp\\gmzz-qa-playwright",
  "node_modules",
  "playwright",
  "index.mjs"
);
const { _electron } = await import(pathToFileURL(playwrightIndex).href);

const app = await _electron.launch({
  executablePath: exePath,
  args: [],
  cwd: path.dirname(exePath),
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
window.on("response", (r) => {
  if (r.status() >= 400) errors.push("http " + r.status() + " " + r.url());
});

await window.waitForLoadState("load");
await window.waitForTimeout(3000);
const title = await window.title().catch(() => "");
const bodyText = (await window.locator("body").innerText().catch(() => "")) || "";
await window.screenshot({ path: path.join(qaDir, "electron-window.png") });

console.log(`[ui-qa] title=${JSON.stringify(title)} bodyLen=${bodyText.length}`);
console.log(`[ui-qa] bodySnippet=${JSON.stringify(bodyText.slice(0, 100))}`);
console.log("[ui-qa] errors=" + JSON.stringify(errors.slice(0, 10)));

await app.close();
await new Promise((r) => setTimeout(r, 3000));

const exeName = path.basename(exePath);
let leftover = 0;
try {
  const out = execFileSync(
    "tasklist",
    ["/FI", `IMAGENAME eq ${exeName}`, "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true }
  );
  leftover = out
    .split(/\r?\n/)
    .filter((l) => l.includes(exeName)).length;
} catch {
  leftover = 0;
}
console.log(`[ui-qa] leftoverProcesses=${leftover}`);
process.exit(errors.length === 0 && leftover === 0 ? 0 : 1);
