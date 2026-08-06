// 归一化：清洗文本、稳定 ID、hash 去重与近重复检测。
import {
  addToNearDuplicateIndex,
  cleanText,
  nearDuplicateCheck,
  sha1,
  stableId,
} from "../lib/text.mjs";

export function normalizeDoc(doc, index) {
  const content = cleanText(doc.content);
  const title = (doc.title ?? doc.path ?? `doc-${index}`).trim();
  return {
    ...doc,
    title,
    content,
    contentHash: sha1(`${title}\n${content}`),
    updatedAt: doc.updatedAt ?? new Date().toISOString(),
  };
}

export function deduplicateDocs(docs, existingHashes = []) {
  const seen = new Set(existingHashes.map((item) => item.hash));
  const nearIndex = new Map();
  for (const item of existingHashes) {
    addToNearDuplicateIndex(nearIndex, item.content, item);
  }
  const unique = [];
  for (const doc of docs) {
    if (seen.has(doc.contentHash)) continue;
    if (nearDuplicateCheck(doc.content, nearIndex)) continue;
    seen.add(doc.contentHash);
    addToNearDuplicateIndex(nearIndex, doc.content, doc);
    unique.push(doc);
  }
  return unique;
}

export function docId(sourceId, doc, index) {
  return stableId(`doc-${sourceId}`, `${doc.title}|${doc.contentHash}`, index);
}
