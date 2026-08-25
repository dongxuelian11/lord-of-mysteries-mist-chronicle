// 灰雾纪事 · Electron 主进程
// 职责：
//   1. 启动内置生产服务器（ELECTRON_RUN_AS_NODE 子进程）
//   2. 打开游戏窗口
//   3. 关闭窗口时杀掉整个进程树，确保无后台残留
const { app, BrowserWindow, dialog, ipcMain, safeStorage, utilityProcess } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { createRagIpc } = require("./rag-ipc.cjs");
const { deploySeed } = require("./knowledge-seed.cjs");
const { registerPersistenceIpc } = require("./persistence-ipc.cjs");
const { resolveServerPort } = require("./server-port.cjs");
const { ACTIVE_SAVE_KEY, deriveRagWorkerRequest, requirePersistenceStore } = require("./runtime-authority.cjs");
const { requestInference } = require("./inference-gateway.cjs");
const { createInferenceScheduler } = require("./inference-scheduler.cjs");
const { createSchedulerRuntimeTrace } = require("./inference-scheduler-trace.cjs");
const { requestAutonomousInference } = require("./autonomous-inference.cjs");
const { requestWorldInference } = require("./world-inference.cjs");
const { resolveRuntimePaths } = require("./runtime-paths.cjs");
const { createContentSecurityPolicy } = require("./content-security-policy.cjs");

const isWindows = process.platform === "win32";
// The installer smoke/clean-machine harness runs without a window. Some
// headless Windows hosts have no usable GPU process, so keep that QA path
// deterministic without changing the normal desktop rendering path.
if (process.env.GMZZ_NO_WINDOW === "1") app.disableHardwareAcceleration();
if (process.env.GMZZ_NO_WINDOW === "1") app.commandLine.appendSwitch("disable-gpu");
const appRoot = path.join(__dirname, "..");
const runtimeAppRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked")
  : appRoot;
const runtimeElectronDir = path.join(runtimeAppRoot, "electron");
const serverScript = path.join(runtimeElectronDir, "server.mjs");

const runtimeEnv = {
  ...process.env,
  GMZZ_REQUIRE_D_DRIVE: process.env.GMZZ_REQUIRE_D_DRIVE ?? "1",
};
let runtimePaths = null;
let runtimePathError = null;
try {
  if (app.isPackaged && !String(process.env.GMZZ_STORAGE_ROOT ?? "").trim()) {
    throw new Error("STORAGE_ROOT_NOT_CONFIGURED");
  }
  runtimePaths = resolveRuntimePaths({ repoRoot: appRoot, env: runtimeEnv });
  app.setPath("userData", runtimePaths.userDataRoot);
} catch (error) {
  runtimePathError = error instanceof Error ? error.message : String(error);
  console.error(`[gmzz] PROJECT_STORAGE_BLOCKED: ${runtimePathError}`);
}
const projectRuntimeEnv = runtimePaths
  ? {
      ...runtimeEnv,
      GMZZ_STORAGE_ROOT: runtimePaths.root,
      GMZZ_USER_DATA: runtimePaths.userDataRoot,
      TEMP: runtimePaths.tempRoot,
      TMP: runtimePaths.tempRoot,
      npm_config_cache: runtimePaths.npmCacheRoot,
      ELECTRON_CACHE: runtimePaths.electronCacheRoot,
      ELECTRON_BUILDER_CACHE: runtimePaths.electronCacheRoot,
      PLAYWRIGHT_BROWSERS_PATH: runtimePaths.playwrightRoot,
    }
  : runtimeEnv;

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
let sessionCredential = "";
const ragIpc = createRagIpc({
  timeoutMs: Number(process.env.RAG_IPC_TIMEOUT_MS ?? 15000),
});

const log = (...args) => console.log("[gmzz]", ...args);
const credentialFile = () => path.join(app.getPath("userData"), "ai-credentials.json");
const persistenceDatabaseFile = () => path.join(app.getPath("userData"), "mist-chronicle.sqlite");

let schedulerTraceSequence = 0;

function schedulerTrace(event) {
  const sequence = ++schedulerTraceSequence;
  const trace = createSchedulerRuntimeTrace(event, sequence);
  log("inference scheduler", JSON.stringify({ provider: event.provider, event: event.event, limit: event.limit, active: event.active, queued: event.queued }));
  try {
    if (persistenceStore) persistenceStore.appendRuntimeTraces(ACTIVE_SAVE_KEY, [trace]);
  } catch {
    // Scheduler diagnostics must never block the model or world authority path.
  }
}

const inferenceScheduler = createInferenceScheduler({ onTrace: schedulerTrace });

function stableSchedulerValue(value) {
  if (Array.isArray(value)) return value.map(stableSchedulerValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSchedulerValue(value[key])]));
}

function schedulerProvider(task) {
  const raw = task?.config?.provider;
  if (raw === "deepseek" || raw === "compatible") return raw;
  if (raw !== undefined) throw new Error("provider-not-supported");
  return /api\.deepseek\.com/i.test(String(task?.config?.endpoint ?? "")) ? "deepseek" : "compatible";
}

function schedulerIdempotencyKey(scope, task) {
  const body = stableSchedulerValue({
    scope,
    task: task?.task,
    config: { provider: task?.config?.provider, endpoint: task?.config?.endpoint, model: task?.config?.model, timeoutMs: task?.config?.timeoutMs },
    options: task?.options,
    system: task?.system,
    user: task?.user,
    worldRequest: task?.worldRequest,
    autonomousRequest: task?.autonomousRequest,
  });
  return `inference:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`;
}

function scheduleInference(task, dependencies, scope) {
  const provider = schedulerProvider(task);
  return inferenceScheduler.run({
    provider,
    task: task?.task,
    idempotencyKey: schedulerIdempotencyKey(scope, task),
    maxAttempts: 2,
  }, () => requestInference(task, dependencies));
}

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
  sessionCredential = "";
  fs.rmSync(credentialFile(), { force: true });
  return { available: true, cleared: true };
}

function registerCredentialIpc() {
  const guard = (event) => {
    if (!isTrustedPersistenceSender(event)) throw new Error("untrusted-renderer");
  };
  ipcMain.handle("credentials:status", async (event) => {
    try {
      guard(event);
      const loaded = await loadCredential();
      return {
        available: loaded.available,
        configured: Boolean(sessionCredential || loaded.apiKey),
        persistent: fs.existsSync(credentialFile()),
        ...(loaded.error ? { error: loaded.error } : {}),
      };
    } catch (error) {
      return { available: false, configured: false, persistent: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("credentials:set", async (event, apiKey, persist = false) => {
    try {
      guard(event);
      if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 32768) throw new Error("invalid-api-key");
      sessionCredential = apiKey.trim();
      if (persist) {
        try {
          await saveCredential(sessionCredential);
          return { available: true, configured: true, persistent: true };
        } catch (error) {
          return { available: false, configured: true, persistent: false, error: String(error?.message ?? error) };
        }
      }
      fs.rmSync(credentialFile(), { force: true });
      return { available: await credentialEncryptionAvailable(), configured: true, persistent: false };
    } catch (error) {
      return { available: false, configured: false, persistent: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("credentials:clear", (event) => {
    try { guard(event); return { ...clearCredential(), configured: false, persistent: false }; }
    catch (error) { return { available: false, configured: false, persistent: false, error: String(error?.message ?? error) }; }
  });
}

async function inferenceCredential() {
  if (sessionCredential) return sessionCredential;
  const loaded = await loadCredential();
  return loaded.apiKey ?? "";
}

function registerInferenceIpc() {
  ipcMain.handle("inference:request", async (event, task) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      if (task?.task === "world-adjudication" || task?.worldRequest !== undefined || task?.worldRag !== undefined) throw new Error("world-inference-dedicated-channel-required");
      if (task?.task === "autonomous-planning" || task?.autonomousRequest !== undefined) throw new Error("autonomous-inference-dedicated-channel-required");
      const result = await scheduleInference(task, { getCredential: inferenceCredential }, "generic");
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:autonomous", async (event, task) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      const result = await requestAutonomousInference(task, {
        store,
        loadAuthorityGame: (turnId, baseRevision) => store.readWorldInferenceAuthority(ACTIVE_SAVE_KEY, turnId, baseRevision),
        readRecordedProposal: (turnId, baseRevision, agentRef) => store.readAutonomousProposal(ACTIVE_SAVE_KEY, turnId, baseRevision, agentRef),
        recordProposal: (turnId, baseRevision, proposal) => store.recordAutonomousProposal(ACTIVE_SAVE_KEY, turnId, baseRevision, proposal),
        recordMateriality: (event) => schedulerTrace({ provider: schedulerProvider(task), event: `materiality-${event.outcome}`, active: 0, queued: 0, limit: inferenceScheduler.getStatus(schedulerProvider(task)).limit, reason: event.agentRef }),
        callRag,
        infer: (boundTask) => scheduleInference(boundTask, { getCredential: inferenceCredential, allowAutonomousPlanning: true }, "autonomous"),
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:prepare-world", async (event, request) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      if (!request || typeof request !== "object" || !request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) throw new Error("world-inference-prepare-invalid");
      const prepared = store.prepareWorldInference(
        ACTIVE_SAVE_KEY,
        JSON.stringify({ payload: request.payload, maxChars: request.maxChars }),
        request.turnId,
        request.baseRevision,
      );
      return { ok: true, ...prepared };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:world-status", async (event, request) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      if (!request || typeof request !== "object" || typeof request.ticket !== "string") throw new Error("world-inference-status-invalid");
      const status = store.worldInferenceStatus(ACTIVE_SAVE_KEY, request.ticket);
      return { ok: true, ...status };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:lock-world", async (event, request) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      if (!request || typeof request !== "object") throw new Error("world-inference-lock-invalid");
      const locked = store.lockWorldInference(ACTIVE_SAVE_KEY, request.turnId, request.baseRevision);
      return { ok: true, ...locked };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:finalize-world", async (event, request) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      if (!request || typeof request !== "object" || !request.manifest || typeof request.manifest !== "object" || Array.isArray(request.manifest)) throw new Error("world-inference-manifest-invalid");
      const finalized = store.finalizeWorldInference(ACTIVE_SAVE_KEY, request.turnId, request.baseRevision, request.manifest);
      return { ok: true, ...finalized };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:stage-world", async (event, request) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      if (!request || typeof request !== "object" || !request.resolution || typeof request.resolution !== "object" || Array.isArray(request.resolution)) throw new Error("world-inference-resolution-invalid");
      const staged = store.stageWorldInference(ACTIVE_SAVE_KEY, request.turnId, request.baseRevision, request.resolution);
      return { ok: true, ...staged };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  });
  ipcMain.handle("inference:world", async (event, task) => {
    if (!isTrustedPersistenceSender(event)) return { ok: false, error: "untrusted-renderer" };
    try {
      const store = requirePersistenceStore(persistenceStore);
      const result = await requestWorldInference(task, {
        store,
        consumeWorldRequest: (ticket, attempt) => store.consumeWorldInference(ACTIVE_SAVE_KEY, ticket, attempt),
        beginWorldAttempt: (ticket, attempt) => store.beginWorldInferenceAttempt(ticket, attempt),
        callRag,
        infer: (boundTask) => scheduleInference(boundTask, { getCredential: inferenceCredential, allowWorldAdjudication: true }, "world"),
      });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message ?? error),
        attemptStarted: error?.worldAttemptStarted === true,
      };
    }
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
      ...projectRuntimeEnv,
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
  ipcMain.handle("rag:search", async (event, payload) => {
    if (!isTrustedPersistenceSender(event)) return { available: false, records: [], context: "", error: "untrusted-renderer" };
    try {
      const derived = deriveRagWorkerRequest(payload, persistenceStore);
      const { authority, ...workerRequest } = derived;
      const response = await callRag("search", workerRequest);
      return { ...response, authority };
    } catch (error) {
      return {
        available: false,
        records: [],
        context: "",
        error: String(error?.message ?? error),
      };
    }
  });
  ipcMain.handle("rag:status", (event) => isTrustedPersistenceSender(event)
    ? callRag("status", null).catch(() => ({ available: false, chunks: 0 }))
    : { available: false, chunks: 0, error: "untrusted-renderer" });
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
  serverPort = await resolveServerPort(envPort);
  const out = openLogStream();

  log(`启动生产服务器（端口 ${serverPort}）…`);
  serverProc = spawn(process.execPath, [serverScript], {
    cwd: runtimeAppRoot,
    env: {
      ...projectRuntimeEnv,
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
  const contentSecurityPolicy = createContentSecurityPolicy();
  // webRequest patterns require a non-empty path. The exact origin is still
  // guarded by isTrustedPersistenceSender; the wildcard is only for headers.
  const appUrlPatterns = [`${url}/*`];
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

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== `${url}/` && targetUrl !== url && !targetUrl.startsWith(`${url}/`)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: appUrlPatterns },
    (details, callback) => callback({
      requestHeaders: {
        ...details.requestHeaders,
        "Content-Security-Policy": contentSecurityPolicy.value,
      },
    }),
  );
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: appUrlPatterns },
    (details, callback) => callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [contentSecurityPolicy.value],
        "X-Content-Type-Options": ["nosniff"],
        "Referrer-Policy": ["no-referrer"],
      },
    }),
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
    if (runtimePathError) {
      dialog.showErrorBox("灰雾纪事 · 存储路径未配置", `项目运行数据必须位于显式 D 盘根目录。\n原因：${runtimePathError}`);
      app.exit(1);
      return;
    }
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
    registerInferenceIpc();
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
