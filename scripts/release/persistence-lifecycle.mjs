import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveRuntimePaths } from "../lib/runtime-paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runner = path.join(root, "scripts", "release", "electron-persistence-lifecycle-runner.cjs");
const dbVerifier = path.join(root, "scripts", "release", "verify-persistence-db.mjs");
const args = process.argv.slice(2);
const keep = args.includes("--keep");

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function resolveElectron() {
  const configured = process.env.ELECTRON_EXE;
  const candidates = [
    configured,
    path.join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`electron-executable-missing:${candidates.join(",")}`);
  return found;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    // The process already exited.
  }
}

function runPhase(electron, phase, userData, marker) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [runner, phase, userData, marker], {
      cwd: root,
      env: { ...runtimeEnv, GMZZ_USER_DATA: userData },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killTree(child.pid);
      reject(new Error(`electron-${phase}-timeout`));
    }, 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const line = stdout.split(/\r?\n/).find((item) => item.startsWith("[pr4-run] "));
      let report = null;
      if (line) {
        try { report = JSON.parse(line.slice("[pr4-run] ".length)); } catch { /* report remains null */ }
      }
      if (code !== 0 || !report?.ok) {
        const detail = report?.error || stderr.trim() || stdout.trim() || `exit=${code ?? "null"} signal=${signal ?? "none"}`;
        reject(new Error(`electron-${phase}-failed:${detail}`));
        return;
      }
      resolve({ report, stdout, stderr });
    });
  });
}

function verifyDatabase(databasePath) {
  const result = spawn(process.execPath, [dbVerifier, databasePath], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    result.stdout.on("data", (chunk) => { stdout += chunk; });
    result.stderr.on("data", (chunk) => { stderr += chunk; });
    result.on("error", reject);
    result.on("exit", (code) => {
      if (code !== 0) reject(new Error(`persistence-db-verification-failed:${stderr.trim() || stdout.trim()}`));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new Error("persistence-db-verifier-json-invalid")); }
      }
    });
  });
}

const suppliedUserData = option("--user-data");
const outputPath = option("--output");
const createdTemp = !suppliedUserData;
const pathEnv = {
  ...process.env,
  GMZZ_REQUIRE_D_DRIVE: process.env.GMZZ_REQUIRE_D_DRIVE ?? "1",
  ...(suppliedUserData ? { GMZZ_USER_DATA: suppliedUserData } : {}),
};
const runtimePaths = resolveRuntimePaths({ repoRoot: root, env: pathEnv });
const runtimeEnv = {
  ...pathEnv,
  GMZZ_STORAGE_ROOT: runtimePaths.root,
  GMZZ_USER_DATA: runtimePaths.userDataRoot,
  RAG_INDEX_DIR: runtimePaths.ragRoot,
  TEMP: runtimePaths.tempRoot,
  TMP: runtimePaths.tempRoot,
  npm_config_cache: runtimePaths.npmCacheRoot,
  ELECTRON_CACHE: runtimePaths.electronCacheRoot,
  ELECTRON_BUILDER_CACHE: runtimePaths.electronCacheRoot,
  PLAYWRIGHT_BROWSERS_PATH: runtimePaths.playwrightRoot,
};
fs.mkdirSync(runtimePaths.tempRoot, { recursive: true });
const userData = path.resolve(
  suppliedUserData || fs.mkdtempSync(path.join(runtimePaths.tempRoot, "gmzz-pr4-lifecycle-")),
);
const marker = `pr4-${Date.now()}-${crypto.randomUUID()}`;

function resolveOutputPath(value) {
  if (!value) return null;
  const target = path.resolve(value);
  const relative = path.relative(runtimePaths.root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("PROJECT_RUNTIME_PATH_OUTSIDE_ROOT");
  }
  return target;
}

let report;
try {
  fs.mkdirSync(userData, { recursive: true });
  const electron = resolveElectron();
  const write = await runPhase(electron, "write", userData, marker);
  const read = await runPhase(electron, "read", userData, marker);
  const databasePath = path.join(userData, "mist-chronicle.sqlite");
  const persistence = await verifyDatabase(databasePath);
  report = {
    schemaVersion: 1,
    kind: "electron-persistence-lifecycle",
    status: "PASS",
    evidenceLevel: "local-electron",
    marker,
    userDataDir: userData,
    databasePath,
    phases: {
      write: write.report.result,
      read: read.report.result,
    },
    persistence,
    limitations: [
      "This is a local Electron renderer-to-IPC-to-SQLite lifecycle probe, not installer or clean-machine evidence.",
      "The authorized packaged knowledge seed is not part of this probe.",
    ],
    generatedAt: new Date().toISOString(),
  };
  const resolvedOutputPath = resolveOutputPath(outputPath);
  if (resolvedOutputPath) {
    const target = resolvedOutputPath;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(`[pr4] ${JSON.stringify(report)}`);
  if (createdTemp && !keep) fs.rmSync(userData, { recursive: true, force: true });
  process.exitCode = 0;
} catch (error) {
  console.error(`[pr4] ${error?.message ?? error}`);
  if (createdTemp || keep) console.error(`[pr4] userDataDir=${userData}`);
  process.exitCode = 1;
}
