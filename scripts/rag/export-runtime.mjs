// 把 private/rag/index 原子导出到显式项目运行根的 Electron userData/rag/index。
// 渲染端不再加载完整索引；检索由 Electron RAG Worker 读取此目录。
import fs from "node:fs";
import path from "node:path";
import { indexDir, readJson } from "./lib/paths.mjs";
import { resolveRuntimePaths } from "../lib/runtime-paths.mjs";

function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

export function userDataRagDirs({ env = process.env, platform = process.platform } = {}) {
  const runtimeEnv = {
    ...env,
    GMZZ_REQUIRE_D_DRIVE: env?.GMZZ_REQUIRE_D_DRIVE ?? "1",
  };
  const runtimePaths = resolveRuntimePaths({ env: runtimeEnv, platform });
  const pathApi = pathFor(platform);
  const configuredIndex = typeof env?.RAG_INDEX_DIR === "string" ? env.RAG_INDEX_DIR.trim() : "";
  return [
    configuredIndex ? runtimePaths.ragRoot : pathApi.join(runtimePaths.userDataRoot, "rag", "index"),
  ];
}

export function exportRuntimeIndex(targetDirs = userDataRagDirs()) {
  const meta = readJson(path.join(indexDir, "index.meta.json"));
  if (!meta || !meta.chunks) {
    return { mode: "no-index", chunks: 0 };
  }
  const written = [];
  for (const targetDir of targetDirs) {
    const staging = `${targetDir}.new`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    for (const name of [
      "index.meta.json",
      "chunks.json",
      "documents.json",
      "inverted.json",
      "alias-map.json",
    ]) {
      const source = path.join(indexDir, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(staging, name));
    }
    for (const name of ["vectors.json", "embedding-meta.json"]) {
      const source = path.join(indexDir, name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(staging, name));
    }
    // 原子替换：先写 .new 再整体换名
    if (fs.existsSync(targetDir)) {
      fs.rmSync(`${targetDir}.old`, { recursive: true, force: true });
      fs.renameSync(targetDir, `${targetDir}.old`);
    }
    fs.renameSync(staging, targetDir);
    if (fs.existsSync(`${targetDir}.old`)) {
      fs.rmSync(`${targetDir}.old`, { recursive: true, force: true });
    }
    written.push(targetDir);
  }
  return { mode: "userdata", chunks: meta.chunks, targetDirs: written };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = exportRuntimeIndex();
  console.log(
    `[rag:export] ${result.mode}：${result.chunks} 切片 -> ${(result.targetDirs ?? []).join(", ") || "（未构建索引）"}`
  );
}
