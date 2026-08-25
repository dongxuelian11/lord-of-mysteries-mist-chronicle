// 灰雾纪事 · 公共仓库构建验证
// 临时克隆当前仓库（不包含 private/ 与本地知识库）→ 用空壳知识库构建 → 跑全部测试。
// 用于确保公开代码在 CI / 新贡献者环境下可以独立构建通过。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimePaths } from "./lib/runtime-paths.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeEnv = {
  ...process.env,
  GMZZ_REQUIRE_D_DRIVE: process.env.GMZZ_REQUIRE_D_DRIVE ?? "1",
};
const runtimePaths = resolveRuntimePaths({ repoRoot: root, env: runtimeEnv });
fs.mkdirSync(runtimePaths.tempRoot, { recursive: true });
const tmp = fs.mkdtempSync(path.join(runtimePaths.tempRoot, "gmzz-public-check-"));
const repo = path.join(tmp, "repo");
const childEnv = {
  ...runtimeEnv,
  GMZZ_STORAGE_ROOT: runtimePaths.root,
  GMZZ_USER_DATA: runtimePaths.userDataRoot,
  RAG_INDEX_DIR: runtimePaths.ragRoot,
  TEMP: runtimePaths.tempRoot,
  TMP: runtimePaths.tempRoot,
  npm_config_cache: runtimePaths.npmCacheRoot,
  ELECTRON_CACHE: runtimePaths.electronCacheRoot,
  ELECTRON_BUILDER_CACHE: runtimePaths.electronCacheRoot,
};

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

try {
  console.log(`[verify-public] clone -> ${repo}`);
  const clone = run("git", ["clone", "--quiet", root, repo], tmp);
  if (clone !== 0) process.exit(clone);

  // 复用本机 node_modules（只读，构建产物仍写入临时目录）
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(repo, "node_modules"),
    "junction"
  );

  console.log("[verify-public] prepare-lore（应使用公共空壳）");
  const prep = run(process.execPath, ["scripts/prepare-lore.mjs"], repo);
  if (prep !== 0) process.exit(prep);

  const lorePath = path.join(repo, "app", "generated-lore-compendium.ts");
  const lore = fs.readFileSync(lorePath, "utf8");
  if (!lore.includes("public-placeholder")) {
    console.error("[verify-public] 知识库不是公共空壳，验证失败");
    process.exit(1);
  }

  console.log("[verify-public] npm run build");
  const build = run("npm", ["run", "build"], repo);
  if (build !== 0) process.exit(build);

  console.log("[verify-public] node --test tests/*.test.mjs");
  const test = run(process.execPath, ["--test", "tests/*.test.mjs"], repo);
  if (test !== 0) process.exit(test);

  console.log("[verify-public] PASS：公共仓库可独立构建并通过测试");
  process.exit(0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("[verify-public] 临时目录已清理");
}
