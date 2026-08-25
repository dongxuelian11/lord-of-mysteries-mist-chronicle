import fs from "node:fs";
import path from "node:path";
import { loadManifest } from "./lib/manifest.mjs";
import { indexDir, readJson, stateDir } from "./lib/paths.mjs";
import { resolveRuntimePaths } from "../lib/runtime-paths.mjs";

function safeRead(file) {
  return readJson(file);
}

function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

export function ragStatus({ env = process.env, platform = process.platform } = {}) {
  const runtimeEnv = {
    ...env,
    GMZZ_REQUIRE_D_DRIVE: env?.GMZZ_REQUIRE_D_DRIVE ?? "1",
  };
  const runtimePaths = resolveRuntimePaths({ env: runtimeEnv, platform });
  const pathApi = pathFor(platform);
  const manifest = loadManifest();
  const meta = safeRead(path.join(indexDir, "index.meta.json"));
  const chunks = safeRead(path.join(indexDir, "chunks.json")) ?? [];
  const documents = safeRead(path.join(indexDir, "documents.json")) ?? [];
  const vectors = safeRead(path.join(indexDir, "vectors.json"));
  const embeddingMeta = safeRead(path.join(indexDir, "embedding-meta.json"));
  const byVisibility = {};
  const byLayer = {};
  for (const chunk of chunks) {
    byVisibility[chunk.visibility ?? "?"] = (byVisibility[chunk.visibility ?? "?"] ?? 0) + 1;
    byLayer[chunk.canonLayer ?? "?"] = (byLayer[chunk.canonLayer ?? "?"] ?? 0) + 1;
  }
  const states = manifest.sources.map((source) => {
    const state = safeRead(path.join(stateDir, `${source.id}.json`));
    return {
      id: source.id,
      kind: source.kind,
      enabled: source.enabled !== false,
      status: source.enabled === false ? "disabled" : state?.status ?? "never-ingested",
      chunks: state?.chunkIds?.length ?? 0,
      commit: state?.commit ?? null,
      ingestedAt: state?.ingestedAt ?? null,
    };
  });
  const configuredRag = typeof env?.RAG_INDEX_DIR === "string" ? env.RAG_INDEX_DIR.trim() : "";
  const userDataRagDir = configuredRag
    ? runtimePaths.ragRoot
    : pathApi.join(runtimePaths.userDataRoot, "rag", "index");
  const workerCandidates = configuredRag ? [runtimePaths.ragRoot] : [indexDir, userDataRagDir];
  const workerIndexDir = workerCandidates.find((candidate) =>
    fs.existsSync(pathApi.join(candidate, "index.meta.json"))
  ) ?? null;
  return {
    manifest: manifest.file,
    index: meta
      ? {
          version: meta.version,
          builtAt: meta.builtAt,
          chunks: meta.chunks,
          documents: meta.documents,
          embeddingModel: meta.embeddingModel,
        }
      : null,
    counts: {
      chunks: chunks.length,
      documents: documents.length,
      vectors: vectors ? Object.keys(vectors).length : 0,
    },
    byVisibility,
    byLayer,
    sources: states,
    runtimeIndex: {
      workerIndexDir,
      chunks: meta?.chunks ?? 0,
    },
    embedding: embeddingMeta ?? null,
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const status = ragStatus();
  console.log(`[rag:status] manifest: ${status.manifest}`);
  if (status.index) {
    console.log(
      `[rag:status] index: ${status.index.chunks} chunks / ${status.index.documents} documents / built ${status.index.builtAt}${status.index.embeddingModel ? ` / embedding ${status.index.embeddingModel}` : ""}`
    );
  } else {
    console.log("[rag:status] index: 未构建（运行 npm run rag:ingest）");
  }
  console.log(
    `[rag:status] worker index: ${status.runtimeIndex.workerIndexDir ?? "未就绪（运行 npm run rag:ingest 与 rag:export）"}`
  );
  console.log("[rag:status] visibility:", JSON.stringify(status.byVisibility));
  console.log("[rag:status] canon layers:", JSON.stringify(status.byLayer));
  for (const source of status.sources) {
    console.log(
      `  ${source.id} [${source.kind}] ${source.enabled ? source.status : "disabled"} chunks=${source.chunks}${source.commit ? ` commit=${source.commit.slice(0, 8)}` : ""}`
    );
  }
}
