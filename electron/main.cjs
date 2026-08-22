// 灰雾纪事 · Electron 主进程
// 职责：
//   1. 启动内置生产服务器（ELECTRON_RUN_AS_NODE 子进程）
//   2. 打开游戏窗口
//   3. 关闭窗口时杀掉整个进程树，确保无后台残留
const { app, BrowserWindow, dialog, ipcMain, safeStorage, utilityProcess } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { createRagIpc } = require("./rag-ipc.cjs");
const { deploySeed } = require("./knowledge-seed.cjs");
const { registerPersistenceIpc } = require("./persistence-ipc.cjs");

const isWindows = process.platform === "win32";
const appRoot = path.join(__dirname, "..");
const runtimeAppRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked")
  : appRoot;
const runtimeElectronDir = path.join(runtimeAppRoot, "electron");
const serverScript = path.join(runtimeElectronDir, "server.mjs");

// 允许通过环境变量指定用户数据目录（便携/隔离测试用）
if (process.env.GMZZ_USER_DATA) {
  try {
    app.setPath("userData", path.resolve(process.env.GMZZ_USER_DATA));
  } catch {
    // 保持默认
  }
} else {
  // 仓库改名后保持运行身份：用户数据目录固定为历史路径，避免生成第二个目录
  try {
    app.setPath("userData", path.join(app.getPath("appData"), "mist-chronicle-prototype"));
  } catch {
    // 保持默认
  }
}

const vinextDir = app.isPackaged
  ? path.join(process.resourcesPath, "vinext")
  : path.join(appRoot, "node_modules", "vinext");

let mainWindow = null;
let serverProc = null;
let ragWorker = null;
let persistenceStore = null;
let persistenceStatus = { available: false, error: "persistence-unavailable", fatal: false };
let serverPort = 0;
let stopping = false;
const ragIpc = createRagIpc({
  timeoutMs: Number(process.env.RAG_IPC_TIMEOUT_MS ?? 15000),
});

const log = (...args) => console.log("[gmzz]", ...args);
const credentialFile = () => path.join(app.getPath("userData"), "ai-credentials.json");
const persistenceDatabaseFile = () => path.join(app.getPath("userData"), "mist-chronicle.sqlite");

function startPersistenceStore() {
  const databaseFile = persistenceDatabaseFile();
  const existingDatabase = fs.existsSync(databaseFile);
  try {
    const { createSqlitePersistenceStore } = require("./persistence-sqlite.cjs");
    persistenceStore = createSqlitePersistenceStore(databaseFile);
    persistenceStatus = { available: true, error: "", fatal: false };
    log(`持久化数据库已就绪（SQLite WAL）：${databaseFile}`);
  } catch (error) {
    persistenceStore = null;
    persistenceStatus = {
      available: false,
      error: existingDatabase ? "persistence-initialization-failed" : "sqlite-runtime-unavailable",
      fatal: existingDatabase,
    };
    log(existingDatabase
      ? "SQLite 持久化数据库无法打开，已阻断旧存档回退："
      : "SQLite runtime 不可用，渲染端将保留兼容存储回退：", error?.message ?? error);
  }
}

function stopPersistenceStore() {
  if (!persistenceStore) return;
  try { persistenceStore.close(); } catch (error) { log("关闭持久化数据库失败:", error?.message ?? error); }
  persistenceStore = null;
}

function isTrustedPersistenceSender(event) {
  if (!mainWindow || event?.sender !== mainWindow.webContents) return false;
  const url = event?.senderFrame?.url ?? "";
  return url === `http://127.0.0.1:${serverPort}/` || url.startsWith(`http://127.0.0.1:${serverPort}/`);
}

async function credentialEncryptionAvailable() {
  const available = typeof safeStorage.isAsyncEncryptionAvailable === "function"
    ? await safeStorage.isAsyncEncryptionAvailable()
    : safeStorage.isEncryptionAvailable();
  if (!available) return false;
  return !(process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text");
}

async function saveCredential(apiKey) {
  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 32768) {
    throw new Error("invalid-api-key");
  }
  if (!(await credentialEncryptionAvailable())) throw new Error("secure-storage-unavailable");
  const encrypted = typeof safeStorage.encryptStringAsync === "function"
    ? await safeStorage.encryptStringAsync(apiKey)
    : safeStorage.encryptString(apiKey);
  const target = credentialFile();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, encrypted: encrypted.toString("base64") }), { mode: 0o600 });
  try { fs.rmSync(target, { force: true }); } catch { /* first save */ }
  fs.renameSync(temporary, target);
  return { available: true, saved: true };
}

async function loadCredential() {
  const available = await credentialEncryptionAvailable();
  if (!available) return { available: false, apiKey: "" };
  const target = credentialFile();
  if (!fs.existsSync(target)) return { available: true, apiKey: "" };
  try {
    const payload = JSON.parse(fs.readFileSync(target, "utf8"));
    if (payload.version !== 1 || typeof payload.encrypted !== "string") throw new Error("invalid-credential-file");
    const encrypted = Buffer.from(payload.encrypted, "base64");
    if (typeof safeStorage.decryptStringAsync === "function") {
      const decrypted = await safeStorage.decryptStringAsync(encrypted);
      if (decrypted.shouldReEncrypt) await saveCredential(decrypted.result);
      return { available: true, apiKey: decrypted.result };
    }
    return { available: true, apiKey: safeStorage.decryptString(encrypted) };
  } catch (error) {
    log("无法读取系统加密的 AI 凭据:", error?.message ?? error);
    return { available: true, apiKey: "", error: "credential-decryption-failed" };
  }
}

function clearCredential() {
  fs.rmSync(credentialFile(), { force: true });
  return { available: true, cleared: true };
}

function registerCredentialIpc() {
  ipcMain.handle("credentials:load", () => loadCredential());
  ipcMain.handle("credentials:save", (_event, apiKey) => saveCredential(apiKey));
  ipcMain.handle("credentials:clear", () => clearCredential());
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
  const hasBundledSeed = fs.existsSync(
    path.join(process.resourcesPath, "knowledge", "seed", "index.meta.json")
  );
  if (
    !app.isPackaged &&
    !hasBundledSeed &&
    fs.existsSync(path.join(devIndex, "index.meta.json"))
  ) {
    return devIndex;
  }
  return path.join(app.getPath("userData"), "rag", "index");
}

// 首次启动：若用户数据目录没有有效索引，则从安装包内置知识库种子初始化。
// 已存在索引（例如用户安装的知识包）优先，不会被覆盖。
function ensureBundledKnowledge() {
  if (process.env.RAG_INDEX_DIR) return;
  const seed = path.join(process.resourcesPath, "knowledge", "seed");
  if (!fs.existsSync(path.join(seed, "seed-manifest.json"))) return;
  const target = path.join(app.getPath("userData"), "rag", "index");
  const result = deploySeed(seed, target);
  if (result.deployed) {
    log(`内置知识库已部署/升级 -> ${target} (${result.seedVersion ?? "?"})`);
  } else if (result.decision?.action === "failed") {
    log(`内置知识库部署失败（安全回退，不崩溃）: ${result.decision.reason}`);
  }
}

function startRagWorker() {
  if (ragWorker) return;
  const workerPath = path.join(runtimeElectronDir, "rag-worker.mjs");
  ragWorker = utilityProcess.fork(workerPath, [], {
    env: {
      ...process.env,
      RAG_INDEX_DIR: resolveRagIndexDir(),
    },
    stdio: "pipe",
  });
  ragWorker.on("message", (message) => {
    ragIpc.handleResponse(message);
  });
  ragWorker.on("exit", () => {
    ragWorker = null;
    ragIpc.abortAll("rag worker exited");
  });
}

function callRag(type, payload) {
  if (!ragWorker) return Promise.reject(new Error("rag worker unavailable"));
  return ragIpc.request((message) => ragWorker.postMessage(message), type, payload);
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
    "faction-private",
    "faction",
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
  const envPort = Number(process.env.GMZZ_PORT || 43121);
  serverPort = envPort > 0 ? envPort : 43121;
  const out = openLogStream();

  log(`启动生产服务器（端口 ${serverPort}）…`);
  serverProc = spawn(process.execPath, [serverScript], {
    cwd: runtimeAppRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      GMZZ_PORT: String(serverPort),
      GMZZ_HOST: "127.0.0.1",
      GMZZ_OUT_DIR: path.join(runtimeAppRoot, "dist"),
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
    stopPersistenceStore();
    ragIpc.abortAll("app quitting");
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
    startPersistenceStore();
    registerPersistenceIpc({
      ipcMain,
      store: persistenceStore,
      isTrustedSender: isTrustedPersistenceSender,
      unavailableResult: () => ({ ...persistenceStatus }),
    });
    ensureBundledKnowledge();
    startRagWorker();
    registerRagIpc();
    registerCredentialIpc();
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
