// 灰雾纪事 · 生产服务器 + 打包产物 QA
// 用法:
//   node scripts/prod-qa.mjs [port] [exePath]
//   - 不带 exePath: 用 node 跑 electron/server.mjs（开发环境生产服务器）
//   - 带 exePath:    用打包后的 exe 跑（GMZZ_NO_WINDOW=1）
// 动作: 启动服务器 -> 抓首页与主 JS 资源 -> Playwright 打开页面收集错误 -> 截图 -> 杀进程树
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 3210);
const exePath = process.argv[3] || "";
const qaDir = process.env.QA_DIR || path.join(root, ".runtime", "prod-qa");
fs.mkdirSync(qaDir, { recursive: true });

const serverScript = path.join(root, "electron", "server.mjs");
const isPackaged = Boolean(exePath);

function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          length: Buffer.concat(chunks).length,
        })
      );
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const r = await fetchUrl(url, 2000);
    if (r.status === 200) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // 已退出
  }
}

const env = {
  ...process.env,
  GMZZ_PORT: String(port),
  GMZZ_HOST: "127.0.0.1",
  GMZZ_OUT_DIR: path.join(root, "dist"),
  GMZZ_VINEXT_DIR: isPackaged
    ? path.join(path.dirname(exePath), "resources", "vinext")
    : path.join(root, "node_modules", "vinext"),
  GMZZ_NO_WINDOW: "1",
  ELECTRON_RUN_AS_NODE: isPackaged ? "1" : "0",
};

const proc = isPackaged
  ? spawn(exePath, [serverScript], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  : spawn(process.execPath, [serverScript], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let serverOut = "";
proc.stdout.on("data", (d) => (serverOut += d));
proc.stderr.on("data", (d) => (serverOut += d));

const base = `http://127.0.0.1:${port}`;
const ready = await waitForServer(base, 60000);
console.log(`[prod-qa] ready=${ready} mode=${isPackaged ? "packaged-exe" : "node"} url=${base}`);
console.log("[prod-qa] server output:\n" + serverOut.slice(-2000));

const html = await fetchUrl(base + "/");
console.log(`[prod-qa] GET / -> ${html.status} len=${html.length}`);

// 从 HTML 里找出主 JS 入口
let entryJs = "";
if (html.status === 200) {
  const htmlBody = await new Promise((resolve) => {
    const req = http.get(base + "/", (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", () => resolve(""));
  });
  const m = htmlBody.match(/src="([^"]+\.js)"/);
  entryJs = m ? m[1] : "";
  if (entryJs) {
    const js = await fetchUrl(base + entryJs);
    console.log(`[prod-qa] GET ${entryJs} -> ${js.status} len=${js.length}`);
  } else {
    console.log("[prod-qa] no entry js found in html");
  }
}

// Playwright 验证页面真正渲染且无网络/控制台错误
const playwrightIndex = path.join(
  "C:\\Users\\Administrator\\AppData\\Local\\Temp\\gmzz-qa-playwright",
  "node_modules",
  "playwright",
  "index.mjs"
);
let browser = null;
try {
  const { chromium } = await import(pathToFileURL(playwrightIndex).href);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push("http " + r.status() + " " + r.url());
  });

  await page.goto(base, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  const title = await page.title().catch(() => "");
  await page.screenshot({ path: path.join(qaDir, "prod-home.png") });

  console.log(`[prod-qa] page title=${JSON.stringify(title)} bodyLen=${bodyText.length}`);
  console.log(`[prod-qa] body snippet=${JSON.stringify(bodyText.slice(0, 120))}`);
  console.log("[prod-qa] errors=" + JSON.stringify(errors.slice(0, 10)));
} catch (e) {
  console.log("[prod-qa] playwright check failed: " + (e?.message || e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

killTree(proc.pid);
console.log("[prod-qa] server killed");
process.exit(ready && html.status === 200 ? 0 : 1);
