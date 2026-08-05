// 灰雾纪事 · NSIS 安装包 QA
// 用法: node scripts/installer-qa.mjs [installerPath] [installDir] [port]
// 静默安装 -> 启动已安装 exe 验证渲染与退出 -> 静默卸载 -> 清理检查
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer =
  process.argv[2] ||
  path.join(root, "release", "灰雾纪事-Setup-0.1.0.exe");
const installDir =
  process.argv[3] ||
  path.join(os.tmpdir(), "gmzz-install-test-" + Date.now());
const port = Number(process.argv[4] || 3224);
const qaDir = process.env.QA_DIR || path.join(root, ".runtime", "prod-qa");
fs.mkdirSync(qaDir, { recursive: true });

function run(exe, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("exit", (code) => resolve({ code, out }));
  });
}

console.log(`[installer-qa] installer=${installer}`);
console.log(`[installer-qa] installDir=${installDir}`);

// 1. 静默安装（/D 必须放在最后且不带引号）
const install = await run(installer, ["/S", `/D=${installDir}`], {
  cwd: root,
});
console.log(`[installer-qa] install exit=${install.code}`);
await new Promise((r) => setTimeout(r, 2000));

const installedExe = path.join(installDir, "MistChronicle.exe");
console.log(
  `[installer-qa] installedExe=${fs.existsSync(installedExe) ? "YES" : "NO"}`
);
if (!fs.existsSync(installedExe)) {
  console.log("[installer-qa] FAIL: exe not found");
  process.exit(1);
}

// 2. 用 Playwright 打开已安装的游戏窗口并验证
const playwrightIndex = path.join(
  "C:\\Users\\Administrator\\AppData\\Local\\Temp\\gmzz-qa-playwright",
  "node_modules",
  "playwright",
  "index.mjs"
);
const { _electron } = await import(pathToFileURL(playwrightIndex).href);
const app = await _electron.launch({
  executablePath: installedExe,
  args: [],
  cwd: installDir,
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
await window.waitForTimeout(2500);
const title = await window.title().catch(() => "");
const bodyText = (await window.locator("body").innerText().catch(() => "")) || "";
await window.screenshot({ path: path.join(qaDir, "installer-window.png") });
console.log(`[installer-qa] title=${JSON.stringify(title)} bodyLen=${bodyText.length}`);
console.log("[installer-qa] errors=" + JSON.stringify(errors.slice(0, 8)));
await app.close();
await new Promise((r) => setTimeout(r, 3000));

// 3. 卸载
const uninstaller = fs
  .readdirSync(installDir)
  .find((f) => f.toLowerCase().includes("unins"));
console.log(`[installer-qa] uninstaller=${uninstaller || "NOT FOUND"}`);
if (uninstaller) {
  const un = await run(path.join(installDir, uninstaller), ["/S"], {
    cwd: installDir,
  });
  console.log(`[installer-qa] uninstall exit=${un.code}`);
}
let filesLeft = fs.existsSync(installDir) ? fs.readdirSync(installDir).length : 0;
for (let i = 0; i < 30 && filesLeft > 0; i++) {
  await new Promise((r) => setTimeout(r, 500));
  filesLeft = fs.existsSync(installDir) ? fs.readdirSync(installDir).length : 0;
}
console.log(`[installer-qa] filesLeftInInstallDir=${filesLeft}`);

// 4. 残留进程检查
let leftover = 0;
try {
  const out = execFileSync(
    "tasklist",
    ["/FI", "IMAGENAME eq MistChronicle.exe", "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true }
  );
  leftover = out
    .split(/\r?\n/)
    .filter((l) => l.includes("MistChronicle.exe")).length;
} catch {
  leftover = 0;
}
console.log(`[installer-qa] leftoverProcesses=${leftover}`);

const pass =
  install.code === 0 &&
  errors.length === 0 &&
  leftover === 0 &&
  (!uninstaller || filesLeft === 0);
console.log(`[installer-qa] RESULT=${pass ? "PASS" : "FAIL"}`);
if (pass && filesLeft === 0 && fs.existsSync(installDir)) {
  try {
    fs.rmdirSync(installDir);
  } catch {
    // 非空或占用则留给系统处理
  }
}
process.exit(pass ? 0 : 1);
