/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

// PR4 runner: exercise the production Electron preload + persistence IPC
// boundary from a real renderer, without requiring the private knowledge seed
// or an installer. The parent script launches this file twice against the
// same isolated user-data directory.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { registerPersistenceIpc } = require("../../electron/persistence-ipc.cjs");
const { createSqlitePersistenceStore } = require("../../electron/persistence-sqlite.cjs");

const phase = process.argv[2];
const userData = path.resolve(process.argv[3] || "");
const marker = process.argv[4] || "";
const activeKey = "mist-chronicle-complete-v21";
const recoveryKey = "mist-chronicle-recovery-v21";
const preloadPath = path.join(__dirname, "../../electron/preload.cjs");

// CI/desktop runners may not expose a usable GPU process. The lifecycle
// assertion is about IPC and SQLite, so keep rendering deterministic.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");

let mainWindow = null;
let persistenceStore = null;
let rendererServer = null;
let pageUrl = "";
let finished = false;

function emit(report) {
  console.log(`[pr4-run] ${JSON.stringify(report)}`);
}

function finish(code, report) {
  if (finished) return;
  finished = true;
  process.exitCode = code;
  emit({ phase, userData, databasePath: path.join(userData, "mist-chronicle.sqlite"), ...report });
  try { mainWindow?.destroy(); } catch { /* renderer may already be closed */ }
  try { rendererServer?.close(); } catch { /* server may already be closed */ }
  setImmediate(() => app.exit(code));
}

function fail(error) {
  finish(1, { ok: false, error: String(error?.message ?? error) });
}

function trustedRenderer(event) {
  const url = event?.senderFrame?.url ?? "";
  return Boolean(mainWindow)
    && event?.sender === mainWindow.webContents
    && url === pageUrl;
}

function writeScript() {
  const encodedMarker = JSON.stringify(marker);
  return `(async () => {
    const bridge = window.mistPersistence;
    if (!bridge) return { ok: false, error: "persistence-bridge-missing" };
    const marker = ${encodedMarker};
    const payload = JSON.stringify({ format: "pr4-electron-persistence-lifecycle", schemaVersion: 1, marker });
    const saved = await bridge.commitTurn("${activeKey}", payload, []);
    const recovery = await bridge.appendRecovery("${recoveryKey}", {
      id: "pr4-recovery:" + marker,
      reason: "week",
      createdAt: new Date().toISOString(),
      game: { worldKernel: { currentWeek: 1 } },
    }, 3);
    return { ok: Boolean(saved?.available && saved?.saved && saved?.durable && recovery?.available && recovery?.saved), saved, recovery };
  })()`;
}

function readScript() {
  const encodedMarker = JSON.stringify(marker);
  return `(async () => {
    const bridge = window.mistPersistence;
    if (!bridge) return { ok: false, error: "persistence-bridge-missing" };
    const marker = ${encodedMarker};
    const active = await bridge.get("${activeKey}");
    const recovery = await bridge.get("${recoveryKey}");
    let payload = null;
    let checkpoints = [];
    try { payload = active?.value ? JSON.parse(active.value) : null; } catch { return { ok: false, error: "active-payload-json-invalid", active, recovery }; }
    try { checkpoints = recovery?.value ? JSON.parse(recovery.value) : []; } catch { return { ok: false, error: "recovery-payload-json-invalid", active, recovery }; }
    const markerMatch = payload?.marker === marker;
    const recoveryMatch = checkpoints.some((item) => item?.id === "pr4-recovery:" + marker);
    return {
      ok: Boolean(active?.available && markerMatch && recovery?.available && recoveryMatch),
      active,
      recovery,
      markerMatch,
      recoveryMatch,
      checkpointCount: Array.isArray(checkpoints) ? checkpoints.length : 0,
    };
  })()`;
}

async function run() {
  if (!userData || !marker || !["write", "read"].includes(phase)) throw new Error("invalid-pr4-runner-arguments");
  fs.mkdirSync(userData, { recursive: true });
  rendererServer = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><head><meta charset=\"utf-8\"><title>gmzz-pr4-persistence</title></head><body>PR4</body></html>\n");
  });
  await new Promise((resolve, reject) => {
    rendererServer.once("error", reject);
    rendererServer.listen(0, "127.0.0.1", () => {
      const address = rendererServer.address();
      if (!address || typeof address === "string") return reject(new Error("renderer-server-address-missing"));
      pageUrl = `http://127.0.0.1:${address.port}/pr4`;
      resolve();
    });
  });
  app.setPath("userData", userData);
  persistenceStore = createSqlitePersistenceStore(path.join(userData, "mist-chronicle.sqlite"));

  await app.whenReady();
  mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });
  registerPersistenceIpc({
    ipcMain,
    store: persistenceStore,
    isTrustedSender: trustedRenderer,
    unavailableResult: () => ({ available: false, fatal: true, error: "persistence-unavailable" }),
  });
  await mainWindow.loadURL(pageUrl);
  const result = await mainWindow.webContents.executeJavaScript(
    phase === "write" ? writeScript() : readScript(),
    true,
  );
  if (!result?.ok) throw new Error(result?.error ?? `pr4-${phase}-failed`);
  finish(0, { ok: true, result });
}

app.on("before-quit", () => {
  try { persistenceStore?.close(); } catch { /* preserve the phase result */ }
  persistenceStore = null;
});

run().catch(fail);
