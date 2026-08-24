"use strict";

const ACTIVE_SAVE_KEY = "mist-chronicle-complete-v21";
const DEFAULT_HORIZON = Object.freeze({
  work: "LOTM",
  maxVolume: 1,
  maxAbsoluteChapter: 195,
  allowedEventIds: [],
  revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
  worldlineMode: "canon-aligned",
});

const PURPOSES = new Set([
  "world-simulation",
  "player-narrator",
  "player-ability",
  "actor-council",
  "actor-dialogue",
  "autonomous-actor",
  "autonomous-faction",
]);

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function loadPersistedGame(store) {
  if (!store || typeof store.getItem !== "function") throw new Error("rag-authority-unavailable");
  const raw = store.getItem(ACTIVE_SAVE_KEY);
  if (typeof raw !== "string" || !raw) throw new Error("rag-authority-unavailable");
  const game = recordOf(JSON.parse(raw));
  if (!game || !recordOf(game.worldKernel)) throw new Error("rag-authority-corrupt");
  return game;
}

function requirePersistenceStore(store) {
  if (!store || typeof store !== "object") throw new Error("persistence-unavailable");
  return store;
}

function uniqueStrings(values, maximum = 256) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.length > 0 && value.length <= 256))].slice(0, maximum);
}

function holderCanSee(node, principalRef) {
  if (!node || typeof node !== "object") return false;
  if (node.visibility === "public") return true;
  if (principalRef === "player" && node.visibility === "player") return true;
  if (Array.isArray(node.holderRefs) && node.holderRefs.length > 0) return node.holderRefs.includes(principalRef);
  const id = principalRef.replace(/^(actor|faction):/, "");
  return Array.isArray(node.holderIds) && node.holderIds.includes(id);
}

function loreIdsFor(game, principalRef) {
  const knowledge = Array.isArray(game.worldKernel?.knowledge) ? game.worldKernel.knowledge : [];
  return uniqueStrings(knowledge.filter((node) => holderCanSee(node, principalRef)).flatMap((node) => node.loreRecordIds));
}

function actorTopicGrants(member) {
  const specialty = `${member?.role ?? ""} ${member?.specialty ?? ""} ${member?.background ?? ""}`;
  return uniqueStrings([
    ...(member?.pathway ? ["pathways", "beyonder-system"] : []),
    ...(/神秘|仪式|封印|灵界|梦境|非凡/.test(specialty) ? ["rituals", "spirit-world", "sealed-artifacts"] : []),
    ...(/情报|调查|警|外交|教会/.test(specialty) ? ["factions"] : []),
  ], 16);
}

function authorityFor(payload, game) {
  const purpose = typeof payload?.purpose === "string" && PURPOSES.has(payload.purpose) ? payload.purpose : null;
  if (!purpose) throw new Error("invalid-rag-purpose");
  const principalRef = typeof payload.principalRef === "string" ? payload.principalRef.trim() : "";
  const members = Array.isArray(game.members) ? game.members : [];
  const actors = Array.isArray(game.worldKernel?.actors) ? game.worldKernel.actors : [];
  const factions = Array.isArray(game.worldKernel?.factions) ? game.worldKernel.factions : [];
  const activeAutonomousRefs = new Set(uniqueStrings(game.worldAgents?.activeAgentRefs));

  if (purpose === "world-simulation") {
    if (principalRef !== "world") throw new Error("rag-principal-not-authorized");
    return { kind: "world-simulation-internal", principalRef: "world", knownLoreIds: [], topicGrants: [] };
  }
  if (purpose === "player-narrator" || purpose === "player-ability") {
    if (principalRef !== "player") throw new Error("rag-principal-not-authorized");
    return {
      kind: purpose === "player-narrator" ? "player-facing-narrator" : "player-known",
      principalRef: "player",
      knownLoreIds: loreIdsFor(game, "player"),
      topicGrants: purpose === "player-ability" ? ["pathways", "beyonder-system"] : [],
    };
  }
  if (purpose === "autonomous-faction") {
    const factionId = principalRef.match(/^faction:(.+)$/)?.[1];
    if (!factionId || !activeAutonomousRefs.has(principalRef) || !factions.some((faction) => faction?.id === factionId)) throw new Error("rag-principal-not-authorized");
    return { kind: "faction-private", principalRef, knownLoreIds: loreIdsFor(game, principalRef), topicGrants: [] };
  }
  const actorId = principalRef.match(/^actor:(.+)$/)?.[1];
  const member = members.find((candidate) => candidate?.id === actorId);
  const actorExists = actors.some((actor) => actor?.id === actorId);
  const authorizedActor = purpose === "autonomous-actor"
    ? activeAutonomousRefs.has(principalRef) && actorExists
    : Boolean(member);
  if (!actorId || !authorizedActor) throw new Error("rag-principal-not-authorized");
  return {
    kind: "actor-private",
    principalRef,
    knownLoreIds: loreIdsFor(game, principalRef),
    topicGrants: purpose === "autonomous-actor" ? [] : actorTopicGrants(member),
  };
}

function workerRequestFor(payload, game, audience, authorityBinding = {}) {
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query || query.length > 4_000) throw new Error("invalid-rag-query");
  const horizon = recordOf(game.worldKernel?.canon)?.knowledgeHorizon ?? DEFAULT_HORIZON;
  const week = Number.isInteger(game.week) ? game.week : undefined;
  const gameDate = typeof game.date === "string" ? game.date.slice(0, 80) : undefined;
  const maxSpoilerScope = payload.purpose === "player-narrator" ? "volume1" : "all";
  const limit = Math.max(1, Math.min(24, Number(payload.limit) || 8));
  const maxChars = Math.max(120, Math.min(24_000, Number(payload.maxChars) || 6_000));
  return {
    query,
    audience: {
      kind: audience.kind,
      knownLoreIds: audience.knownLoreIds,
      topicGrants: audience.topicGrants,
    },
    week,
    gameDate,
    maxSpoilerScope,
    horizon,
    limit,
    maxChars,
    authority: { ...audience, horizon, week, gameDate, maxSpoilerScope, limit, maxChars, ...authorityBinding },
  };
}

function deriveRagWorkerRequest(payload, store) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid-rag-request");
  if (payload.purpose === "world-simulation") throw new Error("rag-purpose-internal-only");
  const game = loadPersistedGame(store);
  return workerRequestFor(payload, game, authorityFor(payload, game));
}

function deriveWorldRagWorkerRequest(payload, store) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid-rag-request");
  const game = loadPersistedGame(store);
  const kernelWeek = Number(game.worldKernel?.currentWeek);
  const durableWeek = Number.isInteger(kernelWeek) ? kernelWeek : Number(game.week);
  const kernelDate = typeof game.worldKernel?.currentDate === "string" ? game.worldKernel.currentDate.slice(0, 80) : "";
  const durableDate = kernelDate || (typeof game.date === "string" ? game.date.slice(0, 80) : undefined);
  const durableRevision = Number(game.worldKernel?.revision);
  const turnId = typeof payload.turnId === "string" ? payload.turnId.trim() : "";
  if (!Number.isInteger(durableWeek) || turnId !== `world:${durableWeek}`) throw new Error("rag-world-turn-mismatch");
  if (!Number.isInteger(durableRevision) || payload.baseRevision !== durableRevision) throw new Error("rag-world-base-revision-mismatch");
  const audience = { kind: "world-simulation-internal", principalRef: "world", knownLoreIds: [], topicGrants: [] };
  const request = workerRequestFor({ ...payload, purpose: "world-simulation" }, game, audience, { turnId, baseRevision: durableRevision });
  return {
    ...request,
    week: durableWeek,
    gameDate: durableDate,
    authority: { ...request.authority, week: durableWeek, gameDate: durableDate },
  };
}

module.exports = {
  ACTIVE_SAVE_KEY,
  DEFAULT_HORIZON,
  PURPOSES,
  deriveRagWorkerRequest,
  deriveWorldRagWorkerRequest,
  loadPersistedGame,
  requirePersistenceStore,
};
