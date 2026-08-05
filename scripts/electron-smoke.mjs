// 灰雾纪事 · Electron 冒烟测试
// 用法: node scripts/electron-smoke.mjs [port] [exePath] [noWindow] [--server-only]
// 启动 Electron -> 等待内置服务器就绪 -> 打印结果 -> 杀掉整棵进程树
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 3218);
const electronExe =
  process.argv[3] ||
  path.join(root, "node_modules", "electron", "dist", "electron.exe");
const noWindow = process.argv[4] === "1";
const serverOnly = process.argv.includes("--server-only");
const keepAlive = process.argv.includes("--keep");

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
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // 已退出
  }
}

let appArgs = [];
if (serverOnly) {
  const appRoot = process.argv[3]
    ? path.join(path.dirname(process.argv[3]), "resources", "app")
    : root;
  appArgs = [path.join(appRoot, "electron", "server.mjs")];
} else if (!process.argv[3]) {
  appArgs = ["."];
}
const proc = spawn(electronExe, appArgs, {
  cwd: root,
  env: {
    ...process.env,
    ...(serverOnly ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    GMZZ_PORT: String(port),
    GMZZ_HOST: "127.0.0.1",
    GMZZ_NO_WINDOW: noWindow ? "1" : "0",
    GMZZ_VINEXT_DIR: serverOnly
      ? process.argv[3]
        ? path.join(path.dirname(process.argv[3]), "resources", "vinext")
        : path.join(root, "node_modules", "vinext")
      : undefined,
    GMZZ_OUT_DIR: serverOnly
      ? path.join(
          process.argv[3]
            ? path.join(path.dirname(process.argv[3]), "resources", "app")
            : root,
          "dist"
        )
      : undefined,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: false,
});

proc.stdout.on("data", (d) => process.stdout.write(d));
proc.stderr.on("data", (d) => process.stderr.write(d));

const url = `http://127.0.0.1:${port}`;
const ready = await waitForServer(url, 60000);
console.log(`\n[smoke] ready=${ready} url=${url} electronPid=${proc.pid}`);

const logPath = path.join(
  process.env.APPDATA || "",
  "灰雾纪事",
  "gmzz-server.log"
);
if (fs.existsSync(logPath)) {
  const lines = fs
    .readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  console.log("[smoke] server log tail:");
  console.log(lines.slice(-5).join("\n"));
}

if (keepAlive) {
  console.log(`[smoke] keep-alive mode: electron running (pid=${proc.pid})`);
  await new Promise(() => {});
} else {
  killTree(proc.pid);
  console.log("[smoke] electron process tree killed");
}
process.exit(ready ? 0 : 1);
