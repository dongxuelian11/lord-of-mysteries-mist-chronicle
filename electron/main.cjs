// 灰雾纪事 · Electron 主进程
// 职责：
//   1. 启动内置生产服务器（ELECTRON_RUN_AS_NODE 子进程）
//   2. 打开游戏窗口
//   3. 关闭窗口时杀掉整个进程树，确保无后台残留
const { app, BrowserWindow, dialog, ipcMain, utilityProcess } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const isWindows = process.platform === "win32";
const appRoot = path.join(__dirname, "..");
const serverScript = path.join(__dirname, "server.mjs");
const vinextDir = app.isPackaged
  ? path.join(process.resourcesPath, "vinext")
  : path.join(appRoot, "node_modules", "vinext");

let mainWindow = null;
let serverProc = null;
let ragWorker = null;
let serverPort = 0;
let stopping = false;
let ragPending = new Map();
let ragSequence = 0;

const log = (...args) => console.log("[gmzz]", ...args);

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function httpReady(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
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
    if (await httpReady(url, 1500)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (isWindows) {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // 已退出
      }
    }
  } catch {
    // 进程已不存在，忽略
  }
}

function stopServer() {
  if (stopping) return;
  stopping = true;
  if (serverProc) {
    log("正在停止内置服务器…");
    killTree(serverProc.pid);
    serverProc = null;
  }
}

function resolveRagIndexDir() {
  if (process.env.RAG_INDEX_DIR) return process.env.RAG_INDEX_DIR;
  const devIndex = path.join(appRoot, "private", "rag", "index");
  if (!app.isPackaged && fs.existsSync(path.join(devIndex, "index.meta.json"))) {
    return devIndex;
  }
  return path.join(app.getPath("userData"), "rag", "index");
}

function startRagWorker() {
  if (ragWorker) return;
  const workerPath = path.join(__dirname, "rag-worker.mjs");
  ragWorker = utilityProcess.fork(workerPath, [], {
    env: {
      ...process.env,
      RAG_INDEX_DIR: resolveRagIndexDir(),
    },
    stdio: "pipe",
  });
  ragWorker.on("message", (message) => {
    if (!message || typeof message !== "object" || message.id === undefined) return;
    const pending = ragPending.get(message.id);
    if (!pending) return;
    ragPending.delete(message.id);
    if (message.ok) pending.resolve(message.payload);
    else pending.reject(new Error(message.payload?.error ?? "rag worker error"));
  });
  ragWorker.on("exit", () => {
    ragWorker = null;
    for (const pending of ragPending.values()) {
      pending.reject(new Error("rag worker exited"));
    }
    ragPending.clear();
  });
}

function callRag(type, payload) {
  if (!ragWorker) return Promise.reject(new Error("rag worker unavailable"));
  const id = `rag-${Date.now()}-${ragSequence++}`;
  return new Promise((resolve, reject) => {
    ragPending.set(id, { resolve, reject });
    ragWorker.postMessage({ type, id, payload });
  });
}

function registerRagIpc() {
  const allowedKinds = new Set([
    "world",
    "player",
    "actor",
    "world-simulation-internal",
    "player-facing-narrator",
    "player-known",
    "actor-private",
  ]);
  ipcMain.handle("rag:search", (_event, payload) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.query !== "string" ||
      !payload.audience ||
      typeof payload.audience !== "object" ||
      !allowedKinds.has(payload.audience.kind) ||
      !Array.isArray(payload.audience.knownLoreIds) ||
      !Array.isArray(payload.audience.topicGrants)
    ) {
      return { available: false, records: [], context: "", error: "invalid-request" };
    }
    return callRag("search", payload).catch((error) => ({
      available: false,
      records: [],
      context: "",
      error: String(error?.message ?? error),
    }));
  });
  ipcMain.handle("rag:listChunkIds", () =>
    callRag("listChunkIds", null).catch(() => [])
  );
  ipcMain.handle("rag:status", () =>
    callRag("status", null).catch(() => ({ available: false, chunks: 0 }))
  );
}

function openLogStream() {
  const logDir = app.getPath("userData");
  fs.mkdirSync(logDir, { recursive: true });
  return fs.createWriteStream(path.join(logDir, "gmzz-server.log"), {
    flags: "w",
  });
}

async function startServer() {
  const envPort = Number(process.env.GMZZ_PORT || 0);
  serverPort = envPort || await freePort();
  const out = openLogStream();

  log(`启动生产服务器（端口 ${serverPort}）…`);
  serverProc = spawn(process.execPath, [serverScript], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      GMZZ_PORT: String(serverPort),
      GMZZ_HOST: "127.0.0.1",
      GMZZ_OUT_DIR: path.join(appRoot, "dist"),
      GMZZ_VINEXT_DIR: vinextDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProc.stdout.on("data", (chunk) => out.write(chunk));
  serverProc.stderr.on("data", (chunk) => out.write(chunk));

  serverProc.on("error", (err) => {
    log("服务器进程启动失败:", err);
  });
  serverProc.on("exit", (code) => {
    out.end();
    if (stopping) return;
    log(`服务器意外退出（exit code=${code}）`);
    if (mainWindow) {
      dialog.showErrorBox(
        "灰雾纪事 · 服务异常",
        `内置服务器意外退出（${code ?? "unknown"}）。\n游戏将关闭。`
      );
    }
    app.quit();
  });

  const url = `http://127.0.0.1:${serverPort}`;
  const ready = await waitForServer(url, 60000);
  if (!ready) {
    dialog.showErrorBox(
      "灰雾纪事 · 启动失败",
      `内置服务器 60 秒内未能就绪。\n日志位置：${path.join(
        app.getPath("userData"),
        "gmzz-server.log"
      )}`
    );
    app.exit(1);
    return null;
  }
  log(`服务器已就绪：${url}`);
  return url;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: "灰雾纪事",
    autoHideMenuBar: true,
    backgroundColor: "#0b0d10",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (errorCode === -3) return; // 被新导航中断
      log("页面加载失败:", errorCode, errorDescription);
    }
  );

  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    stopServer();
    if (ragWorker) {
      try {
        ragWorker.kill();
      } catch {
        // 已退出
      }
      ragWorker = null;
    }
  });

  app.on("quit", () => {
    stopServer();
  });

  app.whenReady().then(async () => {
    startRagWorker();
    registerRagIpc();
    const url = await startServer();
    if (!url) return;

    if (process.env.GMZZ_NO_WINDOW === "1") {
      // QA 模式：只跑服务器，不开窗口
      log("QA 模式：仅启动服务器，不创建窗口");
      return;
    }
    createWindow(url);
  });
}
