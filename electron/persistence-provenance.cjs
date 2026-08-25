"use strict";

const PROVENANCE_STATUSES = Object.freeze([
  "current-turn",
  "durable-turn",
  "legacy-import",
  "unproven-import",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmptyText(value) {
  return typeof value === "string" && Boolean(value.trim()) ? value.trim() : null;
}

function asTurnSet(values) {
  return new Set((Array.isArray(values) ? values : [...(values instanceof Set ? values : [])])
    .map(nonEmptyText)
    .filter(Boolean));
}

function classifyAuthorityProvenance(record, context = {}) {
  const turnId = nonEmptyText(record?.turnId);
  const currentTurnId = nonEmptyText(context.currentTurnId);
  const durableTurnIds = asTurnSet(context.durableTurnIds);
  const retainedTurnIds = asTurnSet(context.retainedTurnIds);
  if (currentTurnId && turnId === currentTurnId && !durableTurnIds.has(turnId)) return "current-turn";
  if (turnId && durableTurnIds.has(turnId)) return "durable-turn";
  if (!turnId) return "legacy-import";
  if (turnId === "state-import") return context.legacyImport === true ? "legacy-import" : "unproven-import";
  if (retainedTurnIds.has(turnId)) return "unproven-import";
  return "unproven-import";
}

function statusRank(status) {
  return {
    "current-turn": 4,
    "unproven-import": 3,
    "legacy-import": 2,
    "durable-turn": 1,
  }[status] ?? 0;
}

function weekByTurn(durableTurns) {
  return new Map((Array.isArray(durableTurns) ? durableTurns : [])
    .filter((turn) => isRecord(turn) && Number.isInteger(turn.resolvingWeek) && typeof turn.turnId === "string")
    .map((turn) => [turn.turnId, turn.resolvingWeek]));
}

function replayability(durableTurns) {
  const weeks = [...new Set((Array.isArray(durableTurns) ? durableTurns : [])
    .map((turn) => Number(turn?.resolvingWeek))
    .filter((week) => Number.isInteger(week) && week >= 0))].sort((a, b) => a - b);
  if (weeks.length === 0) {
    return { status: "unreplayable", reason: "no-durable-turn-history" };
  }
  const gaps = [];
  for (let index = 1; index < weeks.length; index += 1) {
    if (weeks[index] !== weeks[index - 1] + 1) gaps.push(`${weeks[index - 1]}-${weeks[index]}`);
  }
  if (gaps.length) return { status: "partial", reason: `durable-turn-week-gap:${gaps.join(",")}` };
  return { status: "replayable", reason: null };
}

function summarizeProvenance({
  originId = null,
  transactions = [],
  durableTurns = [],
  receipts = [],
  claims = [],
  currentTurnId = null,
  legacyImport = false,
} = {}) {
  const durableTurnIds = asTurnSet(durableTurns.map((turn) => turn?.turnId));
  const retainedTurnIds = asTurnSet(transactions.map((turn) => turn?.turnId));
  const turnWeeks = weekByTurn(durableTurns);
  const replay = replayability(durableTurns);
  const authority = [
    ...(Array.isArray(receipts) ? receipts : []).map((record) => ({ kind: "retrieval-receipt", id: record?.requestId ?? null, record })),
    ...(Array.isArray(claims) ? claims : []).map((record) => ({ kind: "mutation-claim", id: record?.proposalId ?? null, record })),
  ].map(({ kind, id, record }) => {
    const provenanceStatus = classifyAuthorityProvenance(record, { currentTurnId, durableTurnIds, retainedTurnIds, legacyImport: legacyImport || !retainedTurnIds.size });
    const turnId = nonEmptyText(record?.turnId);
    return {
      kind,
      id,
      turnId,
      resolvingWeek: turnId && turnWeeks.has(turnId) ? turnWeeks.get(turnId) : null,
      provenanceStatus,
    };
  });
  const statuses = authority.map((entry) => entry.provenanceStatus);
  const overallStatus = statuses.reduce((best, candidate) => statusRank(candidate) > statusRank(best) ? candidate : best, retainedTurnIds.size ? "durable-turn" : legacyImport ? "legacy-import" : "unproven-import");
  const ownedWeeks = authority
    .map((entry) => entry.resolvingWeek)
    .filter((week) => Number.isInteger(week));
  const allWeeks = durableTurns.map((turn) => Number(turn?.resolvingWeek)).filter((week) => Number.isInteger(week));
  return {
    schemaVersion: 1,
    originId,
    provenanceStatus: overallStatus,
    oldestReplayableWeek: replay.status === "unreplayable" ? null : Math.min(...allWeeks),
    oldestDurablyOwnedWeek: ownedWeeks.length ? Math.min(...ownedWeeks) : null,
    unreplayableReason: replay.reason,
    replayability: replay,
    authority,
    retainedTurnCount: retainedTurnIds.size,
    durableTurnCount: durableTurnIds.size,
  };
}

module.exports = {
  PROVENANCE_STATUSES,
  classifyAuthorityProvenance,
  summarizeProvenance,
};
