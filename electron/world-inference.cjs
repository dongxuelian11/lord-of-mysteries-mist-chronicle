"use strict";

const crypto = require("node:crypto");
const { deriveWorldRagWorkerRequest, loadPersistedGame } = require("./runtime-authority.cjs");
const { WORLD_MAIN_SYSTEM, buildDurableWorldPayload, buildMainWorldPrompt, worldQueryFromDurableGame } = require("./world-prompt.cjs");

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

function inferenceManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { runtimeAutonomousProposals: _runtimeAutonomousProposals, ...payload } = value;
  return payload;
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

function receiptFor(derived, evidence, indexVersion) {
  const filter = {
    audience: { kind: "world", principalRef: "world", knownLoreIds: [], topicGrants: [] },
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
    audienceRef: "world",
    queryHash,
    filterHash,
    chunkIds: [...new Set(evidence.records.map((record) => record.id))],
    contextHash,
  };
}

function assertNoVerbatimLoreLeak(content, records) {
  if (typeof content !== "string") throw new Error("MODEL_RESPONSE_INVALID");
  const normalized = content.replace(/\s+/g, " ");
  for (const record of records) {
    const source = typeof record?.content === "string" ? record.content.replace(/\s+/g, " ").trim() : "";
    if (!source) continue;
    const windowSize = Math.min(64, source.length);
    if (windowSize < 16) {
      if (normalized.includes(source)) throw new Error("WORLD_LORE_VERBATIM_LEAK_REJECTED");
      continue;
    }
    for (let offset = 0; offset + windowSize <= source.length; offset += Math.max(1, Math.floor(windowSize / 2))) {
      if (normalized.includes(source.slice(offset, offset + windowSize))) throw new Error("WORLD_LORE_VERBATIM_LEAK_REJECTED");
    }
  }
}

async function requestWorldInference(task, dependencies = {}) {
  if (!task || typeof task !== "object" || task.task !== "world-adjudication") throw new Error("invalid-world-inference-task");
  const request = task.worldRequest && typeof task.worldRequest === "object" && !Array.isArray(task.worldRequest) ? task.worldRequest : null;
  if (!request || typeof request.ticket !== "string" || !Number.isInteger(request.attempt) || request.attempt < 0 || request.attempt > 1) throw new Error("world-inference-contract-invalid");
  if (typeof dependencies.consumeWorldRequest !== "function" || typeof dependencies.beginWorldAttempt !== "function" || typeof dependencies.callRag !== "function" || typeof dependencies.infer !== "function") throw new Error("world-inference-dependency-unavailable");
  const persisted = dependencies.consumeWorldRequest(request.ticket, request.attempt);
  const prepared = persisted?.payload && typeof persisted.payload === "object" && !Array.isArray(persisted.payload) ? persisted.payload : null;
  const payload = prepared?.payload && typeof prepared.payload === "object" && !Array.isArray(prepared.payload) ? structuredClone(prepared.payload) : null;
  if (!prepared || !payload || Buffer.byteLength(JSON.stringify(payload), "utf8") > 256 * 1024) throw new Error("world-inference-persisted-contract-invalid");
  const durableGame = loadPersistedGame(dependencies.store);
  const authorityGame = persisted?.authorityPayload && typeof persisted.authorityPayload === "object" && !Array.isArray(persisted.authorityPayload) ? structuredClone(persisted.authorityPayload) : null;
  if (!authorityGame || !authorityGame.worldKernel || typeof persisted.authoritySnapshotHash !== "string" || !/^[0-9a-f]{64}$/.test(persisted.authoritySnapshotHash)) throw new Error("world-inference-lock-invalid");
  const authorityManifest = persisted?.authorityManifest && typeof persisted.authorityManifest === "object" && !Array.isArray(persisted.authorityManifest) ? structuredClone(persisted.authorityManifest) : null;
  if (!authorityManifest || typeof persisted.authorityManifestHash !== "string" || !/^[0-9a-f]{64}$/.test(persisted.authorityManifestHash)) throw new Error("world-inference-manifest-invalid");
  const authorityResolution = persisted?.authorityResolution && typeof persisted.authorityResolution === "object" && !Array.isArray(persisted.authorityResolution) ? structuredClone(persisted.authorityResolution) : null;
  if (!authorityResolution || typeof persisted.authorityResolutionHash !== "string" || !/^[0-9a-f]{64}$/.test(persisted.authorityResolutionHash)) throw new Error("world-inference-resolution-invalid");
  if (stableSerialize(payload) !== stableSerialize(inferenceManifest(authorityManifest))) throw new Error("world-inference-manifest-mismatch");
  const derived = deriveWorldRagWorkerRequest({
    query: worldQueryFromDurableGame(authorityGame),
    turnId: persisted.turnId,
    baseRevision: persisted.baseRevision,
    maxChars: prepared.maxChars,
  }, dependencies.store);
  const { authority, ...workerRequest } = derived;
  const boundPayload = buildDurableWorldPayload(authorityManifest, authorityGame, authority, authorityResolution);
  if (Number(payload.resolvingWeek) !== derived.week || Number(payload.currentWeek) !== boundPayload.currentWeek) throw new Error("world-inference-payload-week-mismatch");
  const worldAuthority = payload.worldAuthority && typeof payload.worldAuthority === "object" && !Array.isArray(payload.worldAuthority) ? payload.worldAuthority : null;
  if (worldAuthority?.entityState !== "adjudicatorWorld" || worldAuthority?.stateMutation !== "kernelDelta" || Number(worldAuthority?.baseRevision) !== derived.authority.baseRevision) throw new Error("world-inference-payload-revision-mismatch");
  const adjudicatorWorld = payload.adjudicatorWorld && typeof payload.adjudicatorWorld === "object" && !Array.isArray(payload.adjudicatorWorld) ? payload.adjudicatorWorld : null;
  if (!adjudicatorWorld || adjudicatorWorld.currentDate !== derived.gameDate || Number(adjudicatorWorld.currentWeek) !== derived.week) throw new Error("world-inference-payload-date-mismatch");
  const response = await dependencies.callRag("search", workerRequest);
  if (!response || response.available !== true || !Array.isArray(response.records)) throw new Error("RAG_GATEWAY_UNAVAILABLE");
  const evidence = exactPromptEvidence(response.records, derived.maxChars);
  const receipt = receiptFor(derived, evidence, response.indexVersion);
  boundPayload.authorizedLore = evidence.context;
  boundPayload.loreRecordIds = receipt.chunkIds;
  const user = buildMainWorldPrompt(boundPayload, request.attempt ? { previousIssue: "上一次输出未通过结构校验；请依据同一已锁定投影完整重算" } : {});
  dependencies.beginWorldAttempt(request.ticket, request.attempt);
  let result;
  try {
    result = await dependencies.infer({
      task: "world-adjudication",
      config: task.config,
      system: WORLD_MAIN_SYSTEM,
      user,
      options: task.options,
    });
    assertNoVerbatimLoreLeak(result?.content, evidence.records);
  } catch (error) {
    const marked = error instanceof Error ? error : new Error(String(error));
    try {
      marked.worldAttemptStarted = true;
    } catch {
      const wrapped = new Error(marked.message, { cause: error });
      wrapped.worldAttemptStarted = true;
      throw wrapped;
    }
    throw marked;
  }
  return {
    ...result,
    retrieval: {
      receipt,
      selectedCount: receipt.chunkIds.length,
      rejectedCount: Math.max(0, response.records.length - evidence.records.length),
      authority: {
        turnId: authority.turnId,
        baseRevision: authority.baseRevision,
        week: authority.week,
        gameDate: authority.gameDate,
        payloadHash: persisted.payloadHash,
        authoritySnapshotHash: persisted.authoritySnapshotHash,
      },
    },
  };
}

module.exports = {
  assertNoVerbatimLoreLeak,
  requestWorldInference,
};
