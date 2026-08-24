// 灰雾纪事 · 一键本地启动器
// 用法:
//   双击根目录的 启动游戏.cmd
//   或执行: node scripts/play.mjs
// 可选参数:
//   --no-browser      只启动服务，不打开游戏窗口
//   --port=3200       指定端口（默认自动从 3000 起寻找空闲端口）
//   --wait=10         服务就绪后等待 N 秒自动退出（用于自动化验证）

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import net from "node:net";
import { prepareQaEnvironment, resolveQaPaths } from "./lib/qa-paths.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const qaPaths = resolveQaPaths({ env: process.env });
const qaEnv = prepareQaEnvironment({ env: process.env, runtimePaths: qaPaths });
const runtimeDir = qaPaths.qaRoot;
mkdirSync(runtimeDir, { recursive: true });
const devLogPath = join(runtimeDir, "dev.log");
const devErrLogPath = join(runtimeDir, "dev-error.log");

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const valueOf = (name, fallback) => {
  const item = argv.find((arg) => arg.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : fallback;
};

const noBrowser = has("no-browser");
const waitSeconds = Number(valueOf("wait", 0)) || 0;
let port = Number(valueOf("port", 0)) || 0;

const log = (...args) => console.log(...args);
const warn = (...args) => console.warn(...args);
const error = (...args) => console.error(...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const comSpec = process.env.ComSpec || "cmd.exe";

let serverProc = null;
let browserProc = null;
let devLogStream = null;
let devErrLogStream = null;
let cleaned = false;

function freePort(start) {
  return new Promise((resolve, reject) => {
    const attempt = (candidate) => {
      if (candidate > start + 30) return reject(new Error("未找到可用端口"));
      const server = net.createServer();
      server.once("error", () => {
        server.close();
        attempt(candidate + 1);
      });
      server.listen(candidate, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => resolve(address.port));
      });
    };
    attempt(start);
  });
}

function httpReady(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await httpReady(url, 2000)) return true;
    await sleep(1000);
  }
  return false;
}

function tailFile(path, maxLines) {
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

function killTree(pid) {
  if (!pid) return;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // 进程已经退出，忽略
  }
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (browserProc) killTree(browserProc.pid);
  if (serverProc) killTree(serverProc.pid);
  serverProc?.stdout?.unpipe(devLogStream);
  serverProc?.stderr?.unpipe(devErrLogStream);
  devLogStream?.destroy();
  devErrLogStream?.destroy();
  devLogStream = null;
  devErrLogStream = null;
}

process.on("SIGINT", () => {
  log("\n收到退出信号，正在停止服务…");
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

function findBrowser() {
  const candidates = [];
  const pf = process.env.ProgramFiles || "";
  const pf86 = process.env["ProgramFiles(x86)"] || "";
  const local = process.env.LOCALAPPDATA || "";
  if (pf) candidates.push(join(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
  if (pf86) candidates.push(join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
  if (pf) candidates.push(join(pf, "Google", "Chrome", "Application", "chrome.exe"));
  if (pf86) candidates.push(join(pf86, "Google", "Chrome", "Application", "chrome.exe"));
  if (local) candidates.push(join(local, "Google", "Chrome", "Application", "chrome.exe"));
  return candidates.find((path) => existsSync(path)) || null;
}

function openGameWindow(url) {
  const browser = findBrowser();
  if (!browser) return null;
  const profile = join(qaPaths.tempRoot, "mist-chronicle-game-profile");
  mkdirSync(profile, { recursive: true });
  const args = [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
  ];
  const proc = spawn(browser, args, { env: qaEnv, stdio: "ignore", windowsHide: false });
  proc.on("error", () => {});
  return proc;
}

async function main() {
  log("======================================");
  log("  灰雾纪事 · 本地启动器");
  log("======================================");

  if (!existsSync(join(root, "node_modules"))) {
    log("检测到依赖未安装，正在执行 npm install …");
    const code = await new Promise((resolve) => {
      const child = spawn(comSpec, ["/d", "/s", "/c", "npm install"], {
        cwd: root,
        env: qaEnv,
        stdio: "inherit",
        windowsHide: true,
      });
      child.on("exit", resolve);
    });
    if (code !== 0) {
      error("依赖安装失败，请手动执行 npm install");
      process.exit(1);
    }
  }

  if (!port) port = await freePort(3000);
  const url = `http://localhost:${port}`;

  if (await httpReady(url, 1500)) {
    warn(`端口 ${port} 已有服务在运行，直接打开该地址。`);
  } else {
    log(`正在启动开发服务（端口 ${port}）…`);
    devLogStream = createWriteStream(devLogPath, { flags: "a" });
    devErrLogStream = createWriteStream(devErrLogPath, { flags: "a" });
    devLogStream.write(`\n[${new Date().toISOString()}] launcher: starting dev server on ${port}\n`);
    serverProc = spawn(comSpec, ["/d", "/s", "/c", `npm run dev -- --port ${port}`], {
      cwd: root,
      env: qaEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    serverProc.stdout.pipe(devLogStream);
    serverProc.stderr.pipe(devErrLogStream);
    serverProc.on("exit", (code) => {
      if (cleaned) return;
      error(`开发服务意外退出（exit code=${code}）。`);
      error(`日志位置：${devLogPath} / ${devErrLogPath}`);
      process.exit(1);
    });

    const ready = await waitForServer(url, 120000);
    if (!ready) {
      error("服务启动超时，最近日志如下：");
      error(tailFile(devLogPath, 20));
      error(tailFile(devErrLogPath, 20));
      cleanup();
      process.exit(1);
    }
    log(`开发服务已就绪：${url}`);
  }

  if (noBrowser) {
    log("已跳过浏览器（--no-browser）。");
    if (waitSeconds > 0) {
      log(`测试模式：等待 ${waitSeconds} 秒后自动停止…`);
      await sleep(waitSeconds * 1000);
    } else {
      log("按 Ctrl+C 或关闭本窗口停止服务。");
      await new Promise(() => {});
    }
    return;
  }

  const proc = openGameWindow(url);
  if (proc) {
    browserProc = proc;
    log("游戏窗口已打开。关闭游戏窗口后，本启动器会自动停止服务。");
    log("（如需强制停止，按 Ctrl+C 或关闭本窗口）");
    await new Promise((resolve) => proc.once("exit", resolve));
    log("游戏窗口已关闭，正在停止服务…");
  } else {
    log(`未找到 Edge/Chrome，已用默认浏览器打开：${url}`);
    log("关闭本窗口即可停止服务。");
    await new Promise(() => {});
  }
}

main()
  .catch((err) => {
    error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    log("服务已停止，后台进程已清理。");
    if (waitSeconds > 0) process.exit(process.exitCode ?? 0);
  });
