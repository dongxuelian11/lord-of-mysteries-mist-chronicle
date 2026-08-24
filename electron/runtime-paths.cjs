const path = require("node:path");

function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function resolveStorageRoot({ repoRoot = process.cwd(), env = process.env, platform = process.platform } = {}) {
  const pathApi = pathFor(platform);
  const hasConfiguredRoot = Object.prototype.hasOwnProperty.call(env ?? {}, "GMZZ_STORAGE_ROOT");
  const configured = typeof env?.GMZZ_STORAGE_ROOT === "string" ? env.GMZZ_STORAGE_ROOT.trim() : "";
  if (hasConfiguredRoot && !configured) throw new Error("PROJECT_STORAGE_ROOT_NOT_CONFIGURED");
  if (configured && !pathApi.isAbsolute(configured)) throw new Error("PROJECT_STORAGE_ROOT_NOT_ABSOLUTE");
  const root = pathApi.resolve(configured || pathApi.join(repoRoot, ".runtime"));
  if (platform === "win32" && String(env?.GMZZ_REQUIRE_D_DRIVE ?? "").trim() === "1") {
    const drive = path.win32.parse(root).root.slice(0, 2).toUpperCase();
    if (drive !== "D:") throw new Error("PROJECT_STORAGE_ROOT_NOT_ON_D");
  }
  return root;
}

function resolveRuntimePaths(options = {}) {
  const { env = process.env, platform = process.platform } = options;
  const pathApi = pathFor(platform);
  const root = resolveStorageRoot(options);
  const resolveBounded = (configured, fallback, errorCode) => {
    const configuredPath = typeof configured === "string" ? configured.trim() : "";
    if (configuredPath && !pathApi.isAbsolute(configuredPath)) throw new Error("PROJECT_RUNTIME_PATH_NOT_ABSOLUTE");
    const candidate = pathApi.resolve(configuredPath || pathApi.join(root, fallback));
    const relative = pathApi.relative(root, candidate);
    if (relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
      throw new Error(errorCode);
    }
    return candidate;
  };
  return Object.freeze({
    root,
    tempRoot: pathApi.join(root, "tmp"),
    userDataRoot: resolveBounded(env?.GMZZ_USER_DATA, "user-data", "PROJECT_RUNTIME_PATH_OUTSIDE_ROOT"),
    npmCacheRoot: pathApi.join(root, "npm-cache"),
    electronCacheRoot: pathApi.join(root, "electron-cache"),
    playwrightRoot: pathApi.join(root, "playwright"),
    ragRoot: resolveBounded(env?.RAG_INDEX_DIR, "rag", "PROJECT_RUNTIME_PATH_OUTSIDE_ROOT"),
  });
}

module.exports = { resolveStorageRoot, resolveRuntimePaths };
