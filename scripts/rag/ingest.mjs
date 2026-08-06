// RAG 语料导入：manifest 驱动，增量重建，支持本地/压缩档案/Git/旧版知识库。
import fs from "node:fs";
import path from "node:path";
import { chunkDoc } from "./chunkers/index.mjs";
import { buildIndexFiles } from "./build-index.mjs";
import { convertLegacyRecords } from "./lib/convert-legacy.mjs";
import { loadRuntimeModule, closeRuntimeServer } from "./lib/load-runtime.mjs";
import { enabledSources, loadManifest, resolveIncludePatterns } from "./lib/manifest.mjs";
import {
  cacheDir,
  ensureDirs,
  indexDir,
  readJson,
  root,
  stateDir,
  writeJson,
} from "./lib/paths.mjs";
import { sha1 } from "./lib/text.mjs";
import { deduplicateDocs, docId, normalizeDoc } from "./normalize/index.mjs";
import { cloneOrUpdate } from "./parsers/git.mjs";
import { parseFile } from "./parsers/index.mjs";
import { walkFiles } from "./lib/walk.mjs";
import { parseZhTxt } from "./lib/zh-novel.mjs";

// 已知秘密身份：章节标题命中时标记 identityIds，未在知识边界揭晓前一律拒绝。
const IDENTITY_TITLE_RULES = [
  ["周明瑞", /周明瑞/],
  ["夏洛克·莫里亚蒂", /夏洛克/],
  ["格尔曼·斯帕罗", /格尔曼/],
  ["道恩·唐泰斯", /道恩/],
  ["梅林·赫尔墨斯", /梅林/],
  ["愚者", /愚者/],
  ["世界", /^“?世界”?$/],
];

const IDENTITY_HINT = /身份|代号|真实|秘密|调查|报告|揭晓|原来|竟然|竟是|伪装|扮演|真名|马甲|对应|关联/;

// 正文级身份提及：完整身份名出现即标记（避免“格尔曼”“道恩”等短词误伤）。
const IDENTITY_CONTENT_RULES = [
  ["周明瑞", ["周明瑞"], ["Zhou Mingrui"]],
  ["夏洛克·莫里亚蒂", ["夏洛克·莫里亚蒂"], ["Sherlock Moriarty"]],
  ["格尔曼·斯帕罗", ["格尔曼·斯帕罗"], ["Gehrman Sparrow"]],
  ["道恩·唐泰斯", ["道恩·唐泰斯"], ["Dwayne Dantes"]],
  ["梅林·赫尔墨斯", ["梅林·赫尔墨斯"], ["Merlin Hermes"]],
];

function tagIdentityMentions(chunk) {
  const text = `${chunk.title ?? ""} ${chunk.content ?? ""}`;
  for (const [identity, zhNames, enNames] of IDENTITY_CONTENT_RULES) {
    if ([...zhNames, ...enNames].some((name) => text.includes(name))) {
      chunk.identityIds = [...new Set([...(chunk.identityIds ?? []), identity])];
    }
  }
  return chunk;
}

// 参考切片中的未来事件关键词：按事件所属卷标记保守边界。
const EVENT_VOLUME_RULES = [
  ["大雾霾", 5],
];

function tagReferenceEventBoundary(chunk) {
  if (chunk.volumeNumber !== undefined) return chunk;
  const text = String(chunk.content ?? "");
  for (const [keyword, volume] of EVENT_VOLUME_RULES) {
    if (text.includes(keyword)) {
      chunk.volumeNumber = volume;
      chunk.spoilerScope = `volume${volume}`;
      chunk.timelineStage = `event-${keyword}`;
      chunk.work = chunk.work ?? "LOTM";
      break;
    }
  }
  return chunk;
}

function identityIdsForTitle(title) {
  const text = String(title ?? "").trim();
  const normalized = text.replace(/[“”"'《》\s]/g, "");
  const exact = IDENTITY_TITLE_RULES.filter(
    ([identity]) => normalized === identity.replace(/·/g, "") || text === identity
  ).map(([identity]) => identity);
  if (exact.length) return exact;
  return IDENTITY_TITLE_RULES.filter(
    ([, pattern]) => pattern.test(text) && IDENTITY_HINT.test(text)
  ).map(([identity]) => identity);
}

function absoluteChapters(chapters) {
  const unique = [];
  const seen = new Set();
  for (const chapter of chapters) {
    const key = `${chapter.volumeNumber ?? 0}:${chapter.chapterNumber ?? 0}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(chapter);
    }
  }
  unique.sort(
    (a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0) || (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0)
  );
  const offset = new Map();
  let cumulative = 0;
  let lastVolume = -1;
  for (const chapter of unique) {
    if (chapter.volumeNumber !== lastVolume) {
      offset.set(chapter.volumeNumber, cumulative);
      lastVolume = chapter.volumeNumber;
    }
    cumulative += 1;
  }
  const byKey = new Map(unique.map((chapter) => [`${chapter.volumeNumber ?? 0}:${chapter.chapterNumber ?? 0}`, chapter]));
  for (const chapter of chapters) {
    const key = `${chapter.volumeNumber ?? 0}:${chapter.chapterNumber ?? 0}`;
    const canon = byKey.get(key);
    if (canon) {
      chapter.absoluteChapter = (offset.get(chapter.volumeNumber) ?? 0) + chapter.chapterNumber;
    }
  }
  return chapters;
}

// 英文小说切片元数据补全：work/绝对章号/对齐卷边界；未对齐章节保守标记 all。
function enrichNovelMetadata(chunks) {
  const alignment = readJson(path.join(indexDir, "chapter-alignments.json"));
  const byEnDoc = new Map(
    (alignment?.alignments ?? []).map((item) => [item.enDocumentId, item])
  );
  for (const chunk of chunks) {
    tagIdentityMentions(chunk);
    tagReferenceEventBoundary(chunk);
    if (chunk.work) continue;
    if (chunk.sourceId !== "lotm-reader") continue;
    const p = String(chunk.sourcePath ?? "").replace(/\\/g, "/");
    const isLOTM = /\/chapters\/lotm\//i.test(p);
    const isCOI = /\/chapters\/coi\//i.test(p);
    if (!isLOTM && !isCOI) {
      // 同仓库的非小说文档（README/TOC 等）：保守边界，不进入玩家检索
      chunk.spoilerScope = "all";
      chunk.timelineStage = "non-novel-conservative";
      continue;
    }
    chunk.work = isLOTM ? "LOTM" : "COI";
    const match = String(chunk.title ?? "").match(/^Chapter\s+(\d+)/i);
    const abs = match ? Number(match[1]) : undefined;
    if (abs) {
      chunk.absoluteChapter = abs;
      chunk.chapterNumberWithinVolume = abs;
      chunk.chapterTitle = chunk.title;
      const align = byEnDoc.get(chunk.documentId);
      if (isLOTM && align?.volumeNumber) {
        chunk.volumeNumber = align.volumeNumber;
        chunk.volumeTitle = align.volumeTitle ?? "";
        chunk.spoilerScope = `volume${align.volumeNumber}`;
        chunk.timelineStage = `chapter-${abs}`;
      } else {
        // 未对齐英文章节与 COI：保守边界，不得默认允许
        chunk.spoilerScope = "all";
        chunk.timelineStage = `chapter-${abs}-unaligned`;
      }
    } else {
      chunk.spoilerScope = "all";
      chunk.timelineStage = "novel-unaligned";
    }
  }
  return chunks;
}

function fileHash(file) {
  return sha1(fs.readFileSync(file));
}

async function loadLegacyRecords(compendiumPath) {
  const { LORE_RECORDS } = await loadRuntimeModule(
    path.relative(root, compendiumPath).replace(/\\/g, "/")
  );
  return LORE_RECORDS;
}

function baseMetaFor(source, extra = {}) {
  return {
    repo: source.repo ?? source.id,
    commit: source.commit ?? "unknown",
    language: source.language ?? "zh-CN",
    canonLayer: source.canonLayer ?? "canon",
    sourceGrade: source.sourceGrade ?? "C",
    visibility: source.visibility,
    spoilerScope: source.spoilerScope,
    timeline: source.timeline,
    type: source.type,
    topics: source.topics ?? [],
    entities: source.entities ?? [],
    aliases: source.aliases ?? [],
    relations: source.relations ?? [],
    ...extra,
  };
}

async function ingestGitSource(source, report, force = false) {
  const timeout = Number(process.env.RAG_FETCH_TIMEOUT_MS ?? 120_000);
  try {
    const { target, commit } = cloneOrUpdate(source, cacheDir, { timeout });
    source.path = target;
    source.commit = commit;
    return await ingestLocalSource(source, report, { commit }, force);
  } catch (error) {
    report.push({
      source: source.id,
      status: "CLONE_FAILED",
      message: String(error?.message ?? error),
    });
    return { chunks: [], docs: [], state: null };
  }
}

async function ingestLocalSource(source, report, extra = {}, force = false) {
  const { base, include, exclude } = resolveIncludePatterns(source);
  const files = walkFiles(base, include, exclude);
  const existingState = readJson(path.join(stateDir, `${source.id}.json`));
  const previousChunks =
    readJson(path.join(indexDir, "chunks.json")) ?? [];
  const byId = new Map(previousChunks.map((chunk) => [chunk.id, chunk]));
  const keptChunkIds = new Set();
  const newChunks = [];
  const fileHashes = {};
  const fileChunksMap = {};
  const baseMeta = baseMetaFor(source, extra);
  let parsed = 0;

  for (const file of files) {
    const relative = path.relative(base, file).replace(/\\/g, "/");
    const hash = fileHash(file);
    fileHashes[relative] = hash;
    const unchanged =
      !force &&
      existingState?.status === "ok" &&
      existingState.commit === (source.commit ?? existingState.commit) &&
      existingState.fileHashes?.[relative] === hash;
    if (unchanged) {
      const oldChunkIds = existingState.fileChunks?.[relative] ?? [];
      fileChunksMap[relative] = oldChunkIds.filter((id) => byId.has(id));
      for (const id of oldChunkIds) {
        if (byId.has(id)) {
          keptChunkIds.add(id);
        }
      }
      continue;
    }
    fileChunksMap[relative] = [];
    let parsedDocs;
    if (source.zhNovel) {
      const buffer = fs.readFileSync(file);
      const parsed = parseZhTxt(buffer);
      absoluteChapters(parsed.chapters);
      parsedDocs = parsed.chapters.map((chapter) => ({
        ...baseMeta,
        path: relative,
        title: chapter.chapterTitle,
        content: chapter.content,
        locator: `vol${chapter.volumeNumber}-ch${chapter.chapterNumber}`,
        work: "LOTM",
        volumeNumber: chapter.volumeNumber,
        volumeTitle: chapter.volumeTitle,
        chapterNumber: chapter.chapterNumber,
        chapterNumberWithinVolume: chapter.chapterNumber,
        absoluteChapter: chapter.absoluteChapter,
        chapterTitle: chapter.chapterTitle,
        sceneNumber: 0,
        timelineStage: `chapter-${chapter.absoluteChapter ?? chapter.chapterNumber}`,
        spoilerScope: `volume${chapter.volumeNumber}`,
        identityIds: identityIdsForTitle(chapter.chapterTitle),
        sourceProvenance: source.sourceProvenance ?? "third-party-mirror",
        textIntegrity: source.textIntegrity ?? "structurally-verified",
        editionId: source.editionId ?? "unknown",
        editionHash: source.editionHash,
        isSpecial: chapter.isSpecial,
        authorNote: chapter.authorNote,
      }));
    } else {
      parsedDocs = await parseFile(file, {
        ...baseMeta,
        path: relative,
        locator: "",
      });
    }
    if (Array.isArray(parsedDocs) && parsedDocs.some((doc) => doc && doc.error)) {
      const failed = parsedDocs.find((doc) => doc && doc.error);
      report.push({
        source: source.id,
        status: "SKIPPED",
        message: `${relative}: ${failed.message}`,
      });
      continue;
    }
    const docs = (Array.isArray(parsedDocs) ? parsedDocs : [])
      .filter(Boolean)
      .map((doc, index) => normalizeDoc({ ...doc, id: docId(source.id, doc, index) }, index));
    for (const doc of docs) {
      const chunks = chunkDoc(doc, source.id);
      for (const chunk of chunks) {
        newChunks.push(chunk);
        fileChunksMap[relative].push(chunk.id);
      }
    }
    parsed += 1;
  }

  const deduped = deduplicateDocs(newChunks.map((chunk) => ({ ...chunk, content: chunk.content })));
  const finalNew = deduped.map((chunk) => chunk);
  const state = {
    status: "ok",
    commit: source.commit ?? "unknown",
    fileHashes,
    fileChunks: fileChunksMap,
    chunkIds: [...keptChunkIds, ...finalNew.map((chunk) => chunk.id)],
    ingestedAt: new Date().toISOString(),
  };
  report.push({
    source: source.id,
    status: "ok",
    files: files.length,
    parsed,
    unchanged: files.length - parsed,
    keptChunks: keptChunkIds.size,
    newChunks: finalNew.length,
    commit: source.commit ?? null,
  });
  return { chunks: finalNew, docs: [], state };
}

async function ingestCompendiumSource(source, report) {
  const existingState = readJson(path.join(stateDir, `${source.id}.json`));
  const records = await loadLegacyRecords(path.join(root, source.path));
  const fingerprint = sha1(JSON.stringify(records.map((r) => [r.id, r.content])));
  if (existingState?.status === "ok" && existingState.fingerprint === fingerprint) {
    report.push({
      source: source.id,
      status: "ok",
      unchanged: true,
      chunks: existingState.chunkIds.length,
    });
    return { chunks: [], docs: [], state: existingState };
  }
  const chunks = convertLegacyRecords(records, source.id, baseMetaFor(source));
  const state = {
    status: "ok",
    fingerprint,
    chunkIds: chunks.map((chunk) => chunk.id),
    ingestedAt: new Date().toISOString(),
  };
  report.push({
    source: source.id,
    status: "ok",
    chunks: chunks.length,
    records: records.length,
  });
  return { chunks, docs: [], state };
}

async function embedChunks(chunks, report) {
  const endpoint = process.env.RAG_EMBEDDING_ENDPOINT;
  const model = process.env.RAG_EMBEDDING_MODEL;
  if (!endpoint || !model) {
    report.push({ source: "embedding", status: "SKIPPED", message: "未配置 RAG_EMBEDDING_ENDPOINT / RAG_EMBEDDING_MODEL" });
    return false;
  }
  try {
    const vectors = {};
    const batchSize = 64;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const response = await fetch(`${endpoint.replace(/\/+$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.RAG_EMBEDDING_API_KEY
            ? { authorization: `Bearer ${process.env.RAG_EMBEDDING_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({ model, input: batch.map((chunk) => chunk.content.slice(0, 800)) }),
      });
      if (!response.ok) throw new Error(`embedding http ${response.status}`);
      const data = await response.json();
      batch.forEach((chunk, index) => {
        vectors[chunk.id] = data.data?.[index]?.embedding;
      });
    }
    writeJson(path.join(indexDir, "vectors.json"), vectors);
    writeJson(path.join(indexDir, "embedding-meta.json"), { model, endpoint, builtAt: new Date().toISOString() });
    report.push({ source: "embedding", status: "ok", chunks: chunks.length, model });
    return true;
  } catch (error) {
    report.push({ source: "embedding", status: "SKIPPED", message: String(error?.message ?? error) });
    return false;
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const skipExternal = process.argv.includes("--skip-external");
  const doEmbed = process.argv.includes("--embed");
  const sourcesFilter = new Set(
    (process.argv.find((arg) => arg.startsWith("--sources=")) ?? "")
      .slice("--sources=".length)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
  ensureDirs();

  const privateManifest = path.join(root, "private", "rag", "sources.manifest.json");
  if (!fs.existsSync(privateManifest)) {
    fs.copyFileSync(
      path.join(root, "scripts", "rag", "sources.manifest.example.json"),
      privateManifest
    );
    console.log(`[rag:ingest] 已生成可编辑清单 ${path.relative(root, privateManifest)}`);
  }

  const manifest = loadManifest();
  const report = [];
  const allChunks = [];
  const keptIds = new Set();
  const previousChunks = readJson(path.join(indexDir, "chunks.json")) ?? [];
  const previousById = new Map(previousChunks.map((chunk) => [chunk.id, chunk]));

  for (const source of enabledSources(manifest)) {
    if (source.enabled === false) continue;
    if (sourcesFilter.size && !sourcesFilter.has(source.id)) continue;
    if (skipExternal && source.kind === "git") {
      report.push({ source: source.id, status: "SKIPPED", message: "--skip-external" });
      continue;
    }
    let outcome;
    try {
      if (source.kind === "git") outcome = await ingestGitSource(source, report, force);
      else if (source.kind === "compendium") outcome = await ingestCompendiumSource(source, report);
      else outcome = await ingestLocalSource(source, report, {}, force);
    } catch (error) {
      report.push({ source: source.id, status: "ERROR", message: String(error?.message ?? error) });
      continue;
    }
    if (outcome?.state) {
      writeJson(path.join(stateDir, `${source.id}.json`), outcome.state);
    }
    console.log(`[rag:ingest] 完成 ${source.id}: ${report[report.length - 1]?.status ?? "?"} chunks=${outcome?.state?.chunkIds?.length ?? outcome?.chunks?.length ?? 0}`);
    const freshById = new Map((outcome?.chunks ?? []).map((chunk) => [chunk.id, chunk]));
    for (const id of outcome?.state?.chunkIds ?? []) {
      if (freshById.has(id)) continue;
      if (previousById.has(id)) {
        keptIds.add(id);
        allChunks.push(previousById.get(id));
      }
    }
    for (const chunk of outcome?.chunks ?? []) {
      keptIds.add(chunk.id);
      allChunks.push(chunk);
    }
  }

  enrichNovelMetadata(allChunks);

  // 全局精确 hash 去重（保留首见）
  const seenHash = new Set();
  const dedupedChunks = allChunks.filter((chunk) => {
    if (seenHash.has(chunk.contentHash)) return false;
    seenHash.add(chunk.contentHash);
    return true;
  });

  const documents = new Map();
  for (const chunk of dedupedChunks) {
    const existing = documents.get(chunk.documentId);
    if (!existing) {
      documents.set(chunk.documentId, {
        id: chunk.documentId,
        title: chunk.title,
        sourceId: chunk.sourceId,
        sourceType: chunk.sourceType,
        sourceRepo: chunk.sourceRepo,
        sourceCommit: chunk.sourceCommit,
        sourcePath: chunk.sourcePath,
        language: chunk.language,
        canonLayer: chunk.canonLayer,
        sourceGrade: chunk.sourceGrade,
        updatedAt: chunk.updatedAt,
        contentHash: chunk.contentHash,
        chunkIds: [],
      });
    }
    documents.get(chunk.documentId).chunkIds.push(chunk.id);
  }

  writeJson(path.join(indexDir, "chunks.json"), dedupedChunks);
  writeJson(path.join(indexDir, "documents.json"), [...documents.values()]);
  const summary = buildIndexFiles();

  if (doEmbed) {
    await embedChunks(allChunks, report);
    buildIndexFiles();
  }

  console.log("[rag:ingest] 源报告：");
  for (const item of report) {
    console.log(`  ${item.source}: ${item.status}${item.message ? ` (${item.message})` : ""}${item.chunks !== undefined ? ` chunks=${item.chunks}` : ""}${item.newChunks !== undefined ? ` new=${item.newChunks}` : ""}${item.unchanged !== undefined ? ` unchanged=${item.unchanged}` : ""}`);
  }
  console.log(`[rag:ingest] 索引汇总：${summary.chunks} 切片 / ${summary.documents} 文档 / ${summary.terms} 词项`);
  const failures = report.filter(
    (item) => item.status === "ERROR" || item.status === "CLONE_FAILED"
  );
  console.log(
    `[rag:ingest] 失败/未拉取=${failures.length}（CLONE_FAILED 不阻断核心实现）`
  );
  await closeRuntimeServer();
  process.exit(failures.length && allChunks.length === 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[rag:ingest] 失败:", error);
  process.exit(1);
});
