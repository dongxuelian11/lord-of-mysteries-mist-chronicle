import path from "node:path";
import { resolveRuntimePaths } from "./runtime-paths.mjs";

function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function resolveWithinRoot(pathApi, root, configured, fallback, errorCode) {
  const value = typeof configured === "string" ? configured.trim() : "";
  const candidate = pathApi.resolve(value || pathApi.join(root, fallback));
  const relative = pathApi.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
    throw new Error(errorCode);
  }
  return candidate;
}

export function resolveQaPaths({ env = process.env, platform = process.platform } = {}) {
  const strictEnv = {
    ...env,
    GMZZ_REQUIRE_D_DRIVE: env?.GMZZ_REQUIRE_D_DRIVE ?? "1",
  };
  const runtimePaths = resolveRuntimePaths({ env: strictEnv, platform });
  const pathApi = pathFor(platform);
  return Object.freeze({
    ...runtimePaths,
    qaRoot: resolveWithinRoot(
      pathApi,
      runtimePaths.root,
      env?.QA_DIR,
      "qa",
      "PROJECT_QA_PATH_OUTSIDE_ROOT",
    ),
    playwrightIndex: resolveWithinRoot(
      pathApi,
      runtimePaths.root,
      env?.GMZZ_PLAYWRIGHT_INDEX,
      pathApi.join("playwright", "node_modules", "playwright", "index.mjs"),
      "PROJECT_QA_PATH_OUTSIDE_ROOT",
    ),
  });
}

export function prepareQaEnvironment({ env = process.env, runtimePaths = resolveQaPaths({ env }) } = {}) {
  return {
    ...env,
    GMZZ_REQUIRE_D_DRIVE: env?.GMZZ_REQUIRE_D_DRIVE ?? "1",
    GMZZ_STORAGE_ROOT: runtimePaths.root,
    GMZZ_USER_DATA: runtimePaths.userDataRoot,
    TEMP: runtimePaths.tempRoot,
    TMP: runtimePaths.tempRoot,
    npm_config_cache: runtimePaths.npmCacheRoot,
    ELECTRON_CACHE: runtimePaths.electronCacheRoot,
    ELECTRON_BUILDER_CACHE: runtimePaths.electronCacheRoot,
    PLAYWRIGHT_BROWSERS_PATH: runtimePaths.playwrightRoot,
  };
}
