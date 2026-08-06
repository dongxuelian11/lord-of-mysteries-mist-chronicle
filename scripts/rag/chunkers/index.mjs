import { sha1, stableId } from "../lib/text.mjs";

const MAX_CHUNK = 1800;

function splitHeadings(content, pattern) {
  const lines = content.split("\n");
  const sections = [];
  let current = { heading: null, body: [] };
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      if (current.heading !== null || current.body.length) {
        sections.push(current);
      }
      current = { heading: match[1] ?? match[0].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.heading !== null || current.body.length) sections.push(current);
  return sections;
}

function paragraphGroups(body, max = MAX_CHUNK) {
  const text = Array.isArray(body) ? body.join("\n") : body;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const groups = [];
  let current = [];
  let size = 0;
  const pushParagraph = (paragraph) => {
    if (paragraph.length <= max) {
      if (size + paragraph.length > max && current.length) {
        groups.push(current.join("\n\n"));
        current = [];
        size = 0;
      }
      current.push(paragraph);
      size += paragraph.length;
      return;
    }
    // 超长段落按行二次切分，避免整段被吞成单块
    for (const line of paragraph.split("\n")) {
      if (size + line.length > max && current.length) {
        groups.push(current.join("\n"));
        current = [];
        size = 0;
      }
      current.push(line);
      size += line.length + 1;
    }
  };
  for (const paragraph of paragraphs) {
    pushParagraph(paragraph);
  }
  if (current.length) groups.push(current.join("\n\n"));
  return groups;
}

function finalizeChunks(chunks, doc, sourceId) {
  const result = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const content = chunks[i];
    if (!content.trim()) continue;
    const id = stableId(`chunk-${sourceId}`, `${doc.title}|${content}|${i}`, i);
    result.push({
      id,
      documentId: doc.id,
      title: doc.title,
      content,
      summary: doc.summary,
      sourceId,
      sourceType: doc.type ?? "other",
      sourceRepo: doc.repo ?? "local",
      sourceCommit: doc.commit ?? "unknown",
      sourcePath: doc.path ?? doc.title,
      sourceLocator: doc.locator ?? "",
      language: doc.language ?? "zh-CN",
      canonLayer: doc.canonLayer ?? "canon",
      sourceGrade: doc.sourceGrade ?? "C",
      visibility: doc.visibility ?? "public",
      spoilerScope: doc.spoilerScope ?? "volume1",
      timeline: doc.timeline,
      work: doc.work,
      volumeNumber: doc.volumeNumber,
      volumeTitle: doc.volumeTitle,
      chapterNumberWithinVolume: doc.chapterNumberWithinVolume,
      absoluteChapter: doc.absoluteChapter,
      chapterTitle: doc.chapterTitle,
      sceneNumber: doc.sceneNumber ?? 0,
      timelineStage: doc.timelineStage,
      identityIds: doc.identityIds ?? [],
      eventId: doc.eventId,
      topics: doc.topics ?? [],
      entities: doc.entities ?? [],
      aliases: doc.aliases ?? [],
      relations: doc.relations ?? [],
      previousChunkId: i > 0 ? undefined : undefined,
      nextChunkId: undefined,
      contentHash: sha1(`${doc.id}|${content}`),
      updatedAt: doc.updatedAt ?? new Date().toISOString(),
      volumeNumber: doc.volumeNumber,
      volumeTitle: doc.volumeTitle,
      chapterNumber: doc.chapterNumber,
      sourceProvenance: doc.sourceProvenance,
      textIntegrity: doc.textIntegrity,
      editionId: doc.editionId,
    });
  }
  for (let i = 0; i < result.length; i += 1) {
    if (i > 0) result[i].previousChunkId = result[i - 1].id;
    if (i < result.length - 1) result[i].nextChunkId = result[i + 1].id;
  }
  return result;
}

function chunkNovel(doc, sourceId) {
  const sections = splitHeadings(doc.content, /^\s*(第[一二三四五六七八九十百千0-9]+[卷部章回]|[Cc]hapter\s+\d+|[Vv]ol(?:ume)?\s+\d+)[^\n]*$/);
  const chunks = [];
  for (const section of sections) {
    const body = section.heading ? `${section.heading}\n${section.body.join("\n")}` : section.body.join("\n");
    for (const group of paragraphGroups(body)) chunks.push(group);
  }
  if (!chunks.length) chunks.push(doc.content);
  return finalizeChunks(chunks, doc, sourceId, 0);
}

function chunkWiki(doc, sourceId) {
  const sections = splitHeadings(doc.content, /^(#{1,3})\s+(.+)$/);
  const chunks = [];
  for (const section of sections) {
    const heading = section.heading ? `# ${section.heading}` : "";
    const body = section.body.join("\n");
    const combined = `${heading}\n${body}`.trim();
    for (const group of paragraphGroups(combined)) chunks.push(group);
  }
  if (!chunks.length) chunks.push(doc.content);
  return finalizeChunks(chunks, doc, sourceId, 0);
}

function chunkStructured(doc, sourceId) {
  const chunks = paragraphGroups(doc.content);
  return finalizeChunks(chunks, doc, sourceId, 0);
}

export function chunkDoc(doc, sourceId) {
  const type = doc.type ?? "reference";
  if (type === "novel") return chunkNovel(doc, sourceId);
  if (type === "wiki") return chunkWiki(doc, sourceId);
  if (type === "structured" || type === "game" || type === "reference") {
    return chunkStructured(doc, sourceId);
  }
  return chunkStructured(doc, sourceId);
}
