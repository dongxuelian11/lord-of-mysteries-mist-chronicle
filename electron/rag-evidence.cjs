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

const LEAK_POLICY_VERSION = "verbatim-leak-v2";
const SENSITIVITY_WINDOW_BASE = Object.freeze({ low: 16, medium: 12, high: 8, critical: 6 });

function normalizeLeakText(value) {
  return value.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function leakSensitivityFor(record) {
  if (record?.publicCanonical === true || record?.isPublicCanonical === true || record?.canonicalVisibility === "public" || record?.visibility === "public") return "public";
  const candidate = String(record?.leakSensitivity ?? record?.sensitivity ?? record?.visibility ?? "").trim().toLowerCase();
  if (candidate === "public" || candidate === "public-canonical") return "public";
  if (candidate === "low" || candidate === "restricted-low") return "low";
  if (candidate === "medium" || candidate === "restricted") return "medium";
  if (candidate === "critical" || candidate === "cosmic") return "critical";
  return "high";
}

function leakUniquenessFor(record, sensitivity) {
  if (record?.uniqueness === "unique" || record?.unique === true) return "unique";
  if (record?.uniqueness === "common" || record?.uniqueness === "shared" || record?.unique === false) return "common";
  if (Number.isFinite(record?.uniquenessScore)) return Number(record.uniquenessScore) >= 0.7 ? "unique" : "common";
  return sensitivity === "high" || sensitivity === "critical" ? "unique" : "common";
}

function leakPolicyForRecord(record, sourceLength) {
  const sensitivity = leakSensitivityFor(record);
  if (sensitivity === "public") return { sensitivity, uniqueness: "common", minimumWindowLength: Number.POSITIVE_INFINITY, lengthBand: "public" };
  const uniqueness = leakUniquenessFor(record, sensitivity);
  const base = SENSITIVITY_WINDOW_BASE[sensitivity] ?? SENSITIVITY_WINDOW_BASE.high;
  const uniquenessAdjustment = uniqueness === "unique" ? 0 : 4;
  const candidate = base + uniquenessAdjustment;
  const minimumWindowLength = Math.max(4, Math.min(sourceLength, candidate));
  const lengthBand = sourceLength < 12 ? "short" : sourceLength < 32 ? "medium" : "long";
  return { sensitivity, uniqueness, minimumWindowLength, lengthBand };
}

function hasSharedWindow(source, response, windowSize) {
  if (!Number.isFinite(windowSize) || windowSize <= 0 || source.length < windowSize || response.length < windowSize) return false;
  const responseWindows = new Set();
  for (let offset = 0; offset + windowSize <= response.length; offset += 1) responseWindows.add(response.slice(offset, offset + windowSize));
  for (let offset = 0; offset + windowSize <= source.length; offset += 1) {
    if (responseWindows.has(source.slice(offset, offset + windowSize))) return true;
  }
  return false;
}

function inspectVerbatimLoreLeak(content, records) {
  if (typeof content !== "string") throw new Error("MODEL_RESPONSE_INVALID");
  const normalized = normalizeLeakText(content);
  const rejects = [];
  const riskSignals = [];
  for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
    const source = typeof record?.content === "string" ? normalizeLeakText(record.content) : "";
    if (!source) continue;
    const policy = leakPolicyForRecord(record, source.length);
    if (policy.sensitivity === "public") continue;
    const recordId = typeof record?.id === "string" && record.id.trim() ? record.id.trim() : `record:${index}`;
    const matched = source.length < policy.minimumWindowLength
      ? normalized.includes(source)
      : hasSharedWindow(source, normalized, policy.minimumWindowLength);
    if (matched) {
      rejects.push({ recordId, sensitivity: policy.sensitivity, uniqueness: policy.uniqueness, matchedLength: source.length < policy.minimumWindowLength ? source.length : policy.minimumWindowLength, minimumWindowLength: policy.minimumWindowLength, lengthBand: policy.lengthBand });
      continue;
    }
    if (policy.minimumWindowLength > 8 && hasSharedWindow(source, normalized, 8)) {
      riskSignals.push({ recordId, sensitivity: policy.sensitivity, uniqueness: policy.uniqueness, minimumWindowLength: policy.minimumWindowLength, signalLength: 8, lengthBand: policy.lengthBand });
    }
  }
  return { policyVersion: LEAK_POLICY_VERSION, rejects, riskSignals };
}

function assertNoVerbatimLoreLeak(content, records) {
  const result = inspectVerbatimLoreLeak(content, records);
  if (result.rejects.length) {
    const error = new Error("WORLD_LORE_VERBATIM_LEAK_REJECTED");
    error.leaks = result.rejects;
    error.riskSignals = result.riskSignals;
    throw error;
  }
  return result;
}

module.exports = {
  LEAK_POLICY_VERSION,
  assertNoVerbatimLoreLeak,
  exactPromptEvidence,
  inspectVerbatimLoreLeak,
  leakPolicyForRecord,
  normalizeLeakText,
  receiptFor,
  stableSerialize,
};
