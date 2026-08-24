import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { prepareQaEnvironment, resolveQaPaths } from "../scripts/lib/qa-paths.mjs";
import { userDataRagDirs } from "../scripts/rag/export-runtime.mjs";
import { ragStatus } from "../scripts/rag/status.mjs";
import { resolveRuntimePaths, resolveStorageRoot } from "../scripts/lib/runtime-paths.mjs";

test("resolveStorageRoot normalizes an explicit project storage root", () => {
  const root = resolveStorageRoot({
    repoRoot: "D:\\gmzz",
    env: { GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime" },
    platform: "win32",
  });

  assert.equal(root, path.win32.resolve("D:\\gmzz\\.runtime"));
});

test("resolveStorageRoot fails closed when strict Windows mode resolves outside D drive", () => {
  assert.throws(
    () => resolveStorageRoot({
      repoRoot: "C:\\workspace\\gmzz",
      env: { GMZZ_REQUIRE_D_DRIVE: "1" },
      platform: "win32",
    }),
    /PROJECT_STORAGE_ROOT_NOT_ON_D/,
  );
});

test("resolveStorageRoot rejects an explicitly empty or relative storage root", () => {
  assert.throws(
    () => resolveStorageRoot({
      repoRoot: "D:\\gmzz",
      env: { GMZZ_STORAGE_ROOT: "" },
      platform: "win32",
    }),
    /PROJECT_STORAGE_ROOT_NOT_CONFIGURED/,
  );
  assert.throws(
    () => resolveStorageRoot({
      repoRoot: "D:\\gmzz",
      env: { GMZZ_STORAGE_ROOT: ".runtime" },
      platform: "win32",
    }),
    /PROJECT_STORAGE_ROOT_NOT_ABSOLUTE/,
  );
});

test("resolveRuntimePaths keeps every project runtime directory below the storage root", () => {
  const paths = resolveRuntimePaths({
    repoRoot: "D:\\gmzz",
    env: { GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime" },
    platform: "win32",
  });
  const root = paths.root;
  const windowsPath = path.win32;

  for (const key of ["tempRoot", "userDataRoot", "npmCacheRoot", "electronCacheRoot", "playwrightRoot", "ragRoot"]) {
    const relative = windowsPath.relative(root, paths[key]);
    assert.notEqual(relative, "");
    assert.notEqual(relative, "..");
    assert.equal(relative.startsWith(`..${windowsPath.sep}`), false);
    assert.equal(windowsPath.isAbsolute(relative), false);
  }
});

test("resolveRuntimePaths rejects an explicit user-data directory outside the storage root", () => {
  assert.throws(
    () => resolveRuntimePaths({
      repoRoot: "D:\\gmzz",
      env: {
        GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
        GMZZ_USER_DATA: "C:\\Users\\Administrator\\AppData\\Roaming\\mist-chronicle-prototype",
      },
      platform: "win32",
    }),
    /PROJECT_RUNTIME_PATH_OUTSIDE_ROOT/,
  );
});

test("resolveRuntimePaths rejects relative and traversing project runtime overrides", () => {
  assert.throws(
    () => resolveRuntimePaths({
      repoRoot: "D:\\gmzz",
      env: {
        GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
        GMZZ_USER_DATA: ".\\user-data",
      },
      platform: "win32",
    }),
    /PROJECT_RUNTIME_PATH_NOT_ABSOLUTE/,
  );
  assert.throws(
    () => resolveRuntimePaths({
      repoRoot: "D:\\gmzz",
      env: {
        GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
        RAG_INDEX_DIR: "D:\\gmzz\\.runtime\\..\\..\\outside",
      },
      platform: "win32",
    }),
    /PROJECT_RUNTIME_PATH_OUTSIDE_ROOT/,
  );
});

test("QA scripts resolve Playwright from the runtime policy", () => {
  const scripts = [
    "electron-rag-qa.mjs",
    "electron-ui-qa.mjs",
    "installer-qa.mjs",
    "ui-qa.mjs",
    "prod-qa.mjs",
  ];
  for (const script of scripts) {
    const source = readFileSync(path.join(process.cwd(), "scripts", script), "utf8");
    assert.doesNotMatch(source, /gmzz-qa-playwright/);
    assert.match(source, /resolveQaPaths/);
  }
});

test("QA paths and child-process environment stay below the D-drive runtime root", () => {
  const paths = resolveQaPaths({
    env: {
      GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
      GMZZ_USER_DATA: "D:\\gmzz\\.runtime\\user-data",
      QA_DIR: "D:\\gmzz\\.runtime\\qa",
    },
    platform: "win32",
  });
  assert.equal(path.win32.parse(paths.root).root, "D:\\");
  for (const value of [paths.qaRoot, paths.playwrightIndex]) {
    const relative = path.win32.relative(paths.root, value);
    assert.notEqual(relative, "..");
    assert.equal(relative.startsWith("..\\"), false);
    assert.equal(path.win32.isAbsolute(relative), false);
  }
  const childEnv = prepareQaEnvironment({
    env: { GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime" },
    runtimePaths: paths,
  });
  assert.equal(childEnv.GMZZ_USER_DATA, paths.userDataRoot);
  assert.equal(childEnv.TEMP, paths.tempRoot);
  assert.equal(childEnv.PLAYWRIGHT_BROWSERS_PATH, paths.playwrightRoot);
});

test("RAG export targets the explicit D-drive runtime and ignores APPDATA/home fallback", () => {
  const dirs = userDataRagDirs({
    env: {
      GMZZ_STORAGE_ROOT: "D:\\gmzz\\.runtime",
      GMZZ_USER_DATA: "D:\\gmzz\\.runtime\\user-data",
      APPDATA: "C:\\Users\\Administrator\\AppData\\Roaming",
      GMZZ_REQUIRE_D_DRIVE: "1",
    },
    platform: "win32",
  });
  assert.deepEqual(dirs, ["D:\\gmzz\\.runtime\\user-data\\rag\\index"]);
});

test("RAG status resolves the worker index from the explicit runtime root", () => {
  const runtimeRoot = path.join(process.cwd(), ".runtime", "rag-status-policy-test");
  const userDataRoot = path.join(runtimeRoot, "user-data");
  const ragRoot = path.join(runtimeRoot, "rag");
  mkdirSync(ragRoot, { recursive: true });
  writeFileSync(path.join(ragRoot, "index.meta.json"), JSON.stringify({ version: 2, builtAt: "test", chunks: 1, documents: 1 }));
  try {
    const status = ragStatus({
      env: {
        GMZZ_STORAGE_ROOT: runtimeRoot,
        GMZZ_USER_DATA: userDataRoot,
        RAG_INDEX_DIR: ragRoot,
        APPDATA: "C:\\Users\\Administrator\\AppData\\Roaming",
        GMZZ_REQUIRE_D_DRIVE: process.platform === "win32" ? "1" : "0",
      },
      platform: process.platform,
    });
    assert.equal(status.runtimeIndex.workerIndexDir, ragRoot);
  } finally {
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test("real regression scripts use the runtime root instead of APPDATA/home fallback", () => {
  for (const script of ["real-week-regression.mjs", "real-materiality-regression.mjs"]) {
    const source = readFileSync(path.join(process.cwd(), "scripts", script), "utf8");
    assert.doesNotMatch(source, /process\.env\.APPDATA/);
    assert.doesNotMatch(source, /tmpdir\(\)/);
    assert.match(source, /resolveRuntimePaths/);
  }
});

test("project QA, release, and RAG temp writes use the D-drive runtime policy", () => {
  const scripts = [
    "electron-smoke.mjs",
    "play.mjs",
    "verify-public-build.mjs",
    path.join("release", "persistence-lifecycle.mjs"),
    path.join("rag", "clean-install-test.mjs"),
    path.join("rag", "seed-scenarios.mjs"),
    path.join("rag", "memory-soak.mjs"),
  ];
  for (const script of scripts) {
    const source = readFileSync(path.join(process.cwd(), "scripts", script), "utf8");
    assert.doesNotMatch(source, /os\.tmpdir\(\)/, script);
    assert.match(source, /resolveRuntimePaths|resolveQaPaths/, script);
  }
  const smoke = readFileSync(path.join(process.cwd(), "scripts", "electron-smoke.mjs"), "utf8");
  assert.doesNotMatch(smoke, /process\.env\.APPDATA/, "electron-smoke.mjs");
  const play = readFileSync(path.join(process.cwd(), "scripts", "play.mjs"), "utf8");
  assert.doesNotMatch(play, /profileBase\s*=\s*process\.env\.LOCALAPPDATA/, "play.mjs");
});

test("Electron main must not default project userData to the system appData path", () => {
  const source = readFileSync(path.join(process.cwd(), "electron", "main.cjs"), "utf8");
  assert.match(source, /runtime-paths\.cjs/);
  assert.match(source, /STORAGE_ROOT_NOT_CONFIGURED/);
  assert.doesNotMatch(source, /app\.getPath\("appData"\)/);
});

test("secure real-regression launchers inherit the D-drive runtime userData policy", () => {
  for (const script of ["secure-real-week-regression.cjs", "secure-real-materiality-regression.cjs"]) {
    const source = readFileSync(path.join(process.cwd(), "scripts", script), "utf8");
    assert.match(source, /runtime-paths\.cjs/);
    assert.doesNotMatch(source, /app\.getPath\("appData"\)/);
  }
});

test("storage preflight creates D-drive runtime roots and emits machine-readable PASS", () => {
  const runtimeRoot = path.join(process.cwd(), ".runtime", "test-storage-preflight");
  const isWindows = process.platform === "win32";
  const result = spawnSync(process.execPath, ["scripts/d-storage-preflight.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GMZZ_STORAGE_ROOT: runtimeRoot,
      GMZZ_USER_DATA: path.join(runtimeRoot, "user-data"),
      RAG_INDEX_DIR: path.join(runtimeRoot, "rag"),
      GMZZ_REQUIRE_D_DRIVE: isWindows ? "1" : "0",
      TEMP: path.join(runtimeRoot, "tmp"),
      TMP: path.join(runtimeRoot, "tmp"),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.storageDrive, isWindows ? "D:" : path.parse(runtimeRoot).root);
  for (const directory of Object.values(report.paths)) assert.equal(existsSync(directory), true, directory);
});

test("storage preflight emits BLOCKED without creating directories for a C-drive root", { skip: process.platform !== "win32" }, () => {
  const result = spawnSync(process.execPath, ["scripts/d-storage-preflight.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GMZZ_STORAGE_ROOT: "C:\\gmzz\\.runtime\\blocked-preflight",
      GMZZ_REQUIRE_D_DRIVE: "1",
    },
  });

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).status, "BLOCKED");
  assert.match(result.stderr, /PROJECT_STORAGE_ROOT_NOT_ON_D/);
});
