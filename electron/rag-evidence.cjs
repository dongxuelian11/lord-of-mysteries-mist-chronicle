"use strict";

const crypto = require("node:crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stableSerialize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function exactPromptEvidence(records, maximumChars) {
  const budget = Math.max(0, Math.floor(maximumChars));
  const included = [];
  const lines = [];
  let used = 0;
  for (const record of records) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || typeof record.title !== "string" || typeof record.content !== "string") continue;
    const citation = typeof record.sourceId === "string" && record.sourceId.length
      ? `${record.sourceId}·${record.sourceGrade ?? "?"}`
      : `资料库·${record.sourceGrade ?? "?"}`;
    const prefix = `[${citation}] ${record.title}：`;
    const content = record.content.trim();
    const separatorLength = lines.length ? 1 : 0;
    const fullLine = `${prefix}${content}`;
    const remaining = budget - used - separatorLength;
    if (fullLine.length > remaining) {
      if (lines.length || remaining <= prefix.length) break;
      const exactContent = content.slice(0, Math.max(0, remaining - prefix.length));
      if (!exactContent) break;
      lines.push(`${prefix}${exactContent}`);
      included.push({ ...record, content: exactContent });
      break;
    }
    lines.push(fullLine);
    included.push({ ...record, content });
    used += separatorLength + fullLine.length;
  }
  return { context: lines.join("\n"), records: included };
}

function receiptFor(derived, evidence, indexVersion, audience) {
  const filter = {
    audience,
    week: derived.week,
    gameDate: derived.gameDate,
    maxSpoilerScope: derived.maxSpoilerScope,
    horizon: derived.horizon,
    limit: derived.limit,
    maxChars: derived.maxChars,
  };
  const queryHash = sha256(derived.query.trim());
  const filterHash = sha256(stableSerialize(filter));
  const contextHash = sha256(evidence.context);
  return {
    requestId: `rag:${queryHash.slice(0, 16)}:${filterHash.slice(0, 16)}:${contextHash.slice(0, 16)}`,
    indexVersion: typeof indexVersion === "string" && indexVersion.trim() ? indexVersion.trim() : "bridge-unknown",
    audienceRef: audience.principalRef,
    queryHash,
    filterHash,
    chunkIds: [...new Set(evidence.records.map((record) => record.id))],
    contextHash,
  };
}

function assertNoVerbatimLoreLeak(content, records) {
  if (typeof content !== "string") throw new Error("MODEL_RESPONSE_INVALID");
  const normalizeLeakText = (value) => value.replace(/[\s\p{P}\p{S}]+/gu, "");
  const normalized = normalizeLeakText(content);
  const minimumWindowSize = 8;
  const responseWindows = new Set();
  for (let offset = 0; offset + minimumWindowSize <= normalized.length; offset += 1) {
    responseWindows.add(normalized.slice(offset, offset + minimumWindowSize));
  }
  for (const record of records) {
    const source = typeof record?.content === "string" ? normalizeLeakText(record.content) : "";
    if (!source) continue;
    if (source.length < minimumWindowSize) {
      if (normalized.includes(source)) throw new Error("WORLD_LORE_VERBATIM_LEAK_REJECTED");
      continue;
    }
    for (let offset = 0; offset + minimumWindowSize <= source.length; offset += 1) {
      if (responseWindows.has(source.slice(offset, offset + minimumWindowSize))) throw new Error("WORLD_LORE_VERBATIM_LEAK_REJECTED");
    }
  }
}

module.exports = {
  assertNoVerbatimLoreLeak,
  exactPromptEvidence,
  receiptFor,
  stableSerialize,
};
