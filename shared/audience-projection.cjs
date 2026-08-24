(function exposeAudienceProjection(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.__GMZZ_AUDIENCE_PROJECTION__ = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
"use strict";

const nodeCrypto = typeof process === "object" && typeof process.getBuiltinModule === "function"
  ? process.getBuiltinModule("node:crypto")
  : null;

function audienceRef(audience) {
  if (audience?.kind === "world") return "world";
  return audience?.kind === "player" ? "player" : `${audience?.kind}:${audience?.holderId}`;
}

function holderIncludes(holderIds, holderRefs, reference, legacyId) {
  return Array.isArray(holderRefs) && holderRefs.length > 0
    ? holderRefs.includes(reference)
    : Array.isArray(holderIds) && holderIds.includes(legacyId);
}

function canSee(visibility, holderIds, holderRefs, audience) {
  if (audience?.kind === "world") return true;
  if (visibility === "public") return true;
  const directlyHeld = holderIncludes(holderIds, holderRefs, audienceRef(audience), audience?.holderId);
  if (visibility === "player") return audience?.kind === "player" || directlyHeld;
  if (visibility === "actors") return directlyHeld;
  return false;
}

function stableSerialize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashText(value, hashFn) {
  if (typeof hashFn === "function") return hashFn(value);
  if (!nodeCrypto) throw new Error("audience-projection-hasher-unavailable");
  return nodeCrypto.createHash("sha256").update(value).digest("hex");
}

function projectLocationForAudience(location, audience, eventsByLocationId, observationsByEventId) {
  const locationEvents = eventsByLocationId.get(location.id) ?? [];
  const locationObservations = locationEvents.flatMap((event) => observationsByEventId.get(event.id) ?? []);
  const knownActorIds = new Set();
  const knownFactionIds = new Set();
  for (const event of locationEvents) {
    for (const actorId of event.knownActorIds) knownActorIds.add(actorId);
    for (const factionId of event.knownFactionIds) knownFactionIds.add(factionId);
  }
  for (const observation of locationObservations) {
    for (const perceivedRef of observation.perceivedRefs ?? []) {
      const actor = String(perceivedRef).match(/^actor:(.+)$/)?.[1];
      const faction = String(perceivedRef).match(/^faction:(.+)$/)?.[1];
      if (actor) knownActorIds.add(actor);
      if (faction) knownFactionIds.add(faction);
    }
  }
  if (audience.kind === "actor" && (location.actorIds ?? []).includes(audience.holderId)) knownActorIds.add(audience.holderId);
  if (audience.kind === "faction" && (location.factionIds ?? []).includes(audience.holderId)) knownFactionIds.add(audience.holderId);
  const visibleText = [
    ...locationEvents.flatMap((event) => [event.title, event.detail]),
    ...locationObservations.map((observation) => observation.text),
  ].join("\n");
  const conditions = Array.isArray(location.conditions) ? location.conditions : [];
  const knownConditions = conditions.filter((condition) => String(condition).trim() && visibleText.includes(condition));
  const riskText = visibleText.match(/(?:致命|极度危险|高度危险|危机|危险|风险上升|不安全|警戒|安全|平静)/)?.[0] ?? "";
  const stabilityText = visibleText.match(/(?:完全失控|混乱|动荡|不稳|秩序恢复|秩序稳定|平静)/)?.[0] ?? "";
  const perceivedRisk = !riskText ? null : /致命|极度危险/.test(riskText) ? 90 : /高度危险|危机/.test(riskText) ? 75 : /危险|风险上升|不安全|警戒/.test(riskText) ? 60 : 20;
  const stability = !stabilityText ? null : /完全失控/.test(stabilityText) ? 10 : /混乱|动荡/.test(stabilityText) ? 30 : /不稳/.test(stabilityText) ? 45 : /秩序恢复/.test(stabilityText) ? 65 : 80;
  const observedWeeks = [...locationEvents.map((event) => event.week), ...locationObservations.map((observation) => observation.week)];
  return {
    id: location.id,
    name: location.name,
    knownConditions: [...new Set(knownConditions)].slice(-8),
    knownActorIds: [...knownActorIds].sort(),
    knownFactionIds: [...knownFactionIds].sort(),
    perceivedRisk,
    publicMood: String(location.publicMood ?? "").trim() && visibleText.includes(location.publicMood) ? location.publicMood : null,
    stability,
    observedWeek: observedWeeks.length ? Math.max(...observedWeeks) : null,
  };
}

function projectWorldForAudience(kernel, audience, hashFn) {
  if (audience.kind === "world") return kernel;
  const observations = Array.isArray(kernel.observations) ? kernel.observations : [];
  const events = Array.isArray(kernel.events) ? kernel.events : [];
  const knowledge = Array.isArray(kernel.knowledge) ? kernel.knowledge : [];
  const visibleObservations = observations.filter((observation) => canSee(observation.visibility, observation.holderIds, observation.holderRefs, audience));
  const observableEventIds = new Set(visibleObservations.map((observation) => observation.eventId));
  const reference = audienceRef(audience);
  const visibleEvents = events.filter((event) => event.visibility === "public" || observableEventIds.has(event.id));
  const visibleKnowledge = knowledge.filter((node) => canSee(node.visibility, node.holderIds, node.holderRefs, audience));
  const visibleKnowledgeGrants = (Array.isArray(kernel.knowledgeGrants) ? kernel.knowledgeGrants : []).filter((grant) => grant.holderRef === reference);
  const observationsByEventId = new Map();
  for (const observation of visibleObservations) {
    const eventObservations = observationsByEventId.get(observation.eventId) ?? [];
    eventObservations.push(observation);
    observationsByEventId.set(observation.eventId, eventObservations);
  }
  const locations = Array.isArray(kernel.locations) ? kernel.locations : [];
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const audienceEvents = visibleEvents.map((event) => {
    const eventObservations = observationsByEventId.get(event.id) ?? [];
    const perceivedRefs = eventObservations.flatMap((observation) => observation.perceivedRefs ?? []);
    const knownActorIds = new Set(perceivedRefs.flatMap((item) => String(item).startsWith("actor:") ? [String(item).slice("actor:".length)] : []));
    const knownFactionIds = new Set(perceivedRefs.flatMap((item) => String(item).startsWith("faction:") ? [String(item).slice("faction:".length)] : []));
    if (audience.kind === "actor" && (event.actorIds ?? []).includes(audience.holderId)) knownActorIds.add(audience.holderId);
    if (audience.kind === "faction" && (event.factionIds ?? []).includes(audience.holderId)) knownFactionIds.add(audience.holderId);
    const observationText = eventObservations.map((observation) => observation.text).filter(Boolean).join("；");
    const eventLocation = event.locationId ? locationById.get(event.locationId) : undefined;
    const observedLocationId = event.visibility === "public"
      || Boolean(eventLocation && eventObservations.some((observation) => observation.text.includes(eventLocation.id) || observation.text.includes(eventLocation.name)))
      ? event.locationId
      : undefined;
    return {
      id: event.id,
      week: event.week,
      title: event.visibility === "public" ? event.title : eventObservations[0]?.channel ?? "可见变化",
      detail: event.visibility === "public" ? event.detail : observationText,
      locationId: observedLocationId,
      visibility: event.visibility,
      knownActorIds: [...knownActorIds].sort(),
      knownFactionIds: [...knownFactionIds].sort(),
      observationIds: eventObservations.map((observation) => observation.id).sort(),
    };
  });
  const eventsByLocationId = new Map();
  for (const event of audienceEvents) {
    if (!event.locationId) continue;
    const locationEvents = eventsByLocationId.get(event.locationId) ?? [];
    locationEvents.push(event);
    eventsByLocationId.set(event.locationId, locationEvents);
  }
  const projectedLocations = locations.map((location) => projectLocationForAudience(location, audience, eventsByLocationId, observationsByEventId));
  const audienceObservations = visibleObservations.map(({ id, week, eventId, channel, text, visibility, perceivedRefs, acquisitionKind }) => ({ id, week, eventId, channel, text, visibility, perceivedRefs, acquisitionKind }));
  const grantByKnowledgeId = new Map(visibleKnowledgeGrants.map((grant) => [grant.knowledgeId, grant.kind]));
  const audienceKnowledge = visibleKnowledge.map(({ id, subject, statement, visibility, acquiredWeek }) => {
    const grantKind = grantByKnowledgeId.get(id);
    const epistemicStatus = grantKind === "witness" ? "witnessed"
      : grantKind === "communication" ? "communicated"
        : grantKind === "investigation" ? "investigated"
          : grantKind === "propagation" ? "propagated"
            : visibility === "public" ? "public-report" : "held";
    return { id, subject, statement, visibility, acquiredWeek, epistemicStatus };
  });
  const audienceKnowledgeGrants = visibleKnowledgeGrants.map(({ knowledgeId, kind }) => ({ knowledgeId, kind }));
  const projection = {
    currentWeek: kernel.currentWeek,
    currentDate: kernel.currentDate,
    locations: projectedLocations,
    events: audienceEvents,
    observations: audienceObservations,
    knowledge: audienceKnowledge,
    knowledgeGrants: audienceKnowledgeGrants,
  };
  return { ...projection, projectionHash: hashText(stableSerialize({ audience: reference, ...projection }), hashFn) };
}

function selectKnowledge(knowledge, maximum = 12) {
  const selected = (Array.isArray(knowledge) ? knowledge : []).slice(0, maximum);
  return {
    records: selected,
    ids: selected.map((item) => item.id),
  };
}

function deriveAllowedLocationIds({ locations, currentLocationId, visibleEvents, ownedProjects = [] }) {
  const knownIds = new Set((Array.isArray(locations) ? locations : []).map((location) => location?.id).filter((id) => typeof id === "string"));
  const allowed = new Set();
  if (knownIds.has(currentLocationId)) allowed.add(currentLocationId);
  for (const event of Array.isArray(visibleEvents) ? visibleEvents : []) {
    if (knownIds.has(event?.locationId)) allowed.add(event.locationId);
  }
  for (const project of Array.isArray(ownedProjects) ? ownedProjects : []) {
    if (knownIds.has(project?.locationId)) allowed.add(project.locationId);
  }
  return [...allowed].filter((id) => id.length <= 256).sort().slice(0, 256);
}

return {
  audienceRef,
  canSee,
  deriveAllowedLocationIds,
  holderIncludes,
  projectWorldForAudience,
  selectKnowledge,
};
});
