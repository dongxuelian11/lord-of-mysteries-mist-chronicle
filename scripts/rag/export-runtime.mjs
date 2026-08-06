// 把 private/rag/index 原子导出到 Electron 用户数据目录（%APPDATA%/灰雾纪事/rag/index）。
// 渲染端不再加载完整索引；检索由 Electron RAG Worker 读取此目录。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { indexDir, readJson } from "./lib/paths.mjs";

export function userDataRagDirs() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return [
    path.join(appData, "灰雾纪事", "rag", "index"),
    path.join(appData, "mist-chronicle-prototype", "rag", "index"),
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
