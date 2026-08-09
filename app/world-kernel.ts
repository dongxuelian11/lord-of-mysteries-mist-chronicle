export type WorldVisibility = "world" | "public" | "player" | "actors";

export type PersistentWorldActor = {
  id: string;
  name: string;
  locationId: string;
  agenda: string;
  shortTermGoal: string;
  lastAction: string;
  condition: string;
  knowledgeIds: string[];
};

export type PersistentWorldFaction = {
  id: string;
  name: string;
  posture: string;
  resources: number;
  suspicion: number;
  lastAction: string;
};

export type PersistentWorldProject = {
  id: string;
  ownerId: string;
  title: string;
  stage: string;
  progress: number;
  momentum: number;
  secrecy: number;
  nextMilestone: string;
  blockers: string[];
  status: "active" | "paused" | "completed" | "failed";
  updatedWeek: number;
};

export type PersistentWorldLocation = {
  id: string;
  name: string;
  risk: number;
  stability: number;
  publicMood: string;
  conditions: string[];
  actorIds: string[];
  factionIds: string[];
  updatedWeek: number;
};

export type PersistentWorldEvent = {
  id: string;
  week: number;
  title: string;
  detail: string;
  locationId?: string;
  actorIds: string[];
  factionIds: string[];
  causeIds: string[];
  visibility: WorldVisibility;
  witnessRefs?: string[];
};

export type WorldObservation = {
  id: string;
  week: number;
  eventId: string;
  channel: string;
  text: string;
  visibility: Exclude<WorldVisibility, "world">;
  holderIds: string[];
  holderRefs?: string[];
  perceivedRefs?: string[];
  acquisitionKind?: KnowledgeGrantKind;
};

export type KnowledgeGrantKind = "witness" | "communication" | "investigation" | "propagation";

export type WorldKnowledgeGrant = {
  id: string;
  week: number;
  knowledgeId: string;
  holderRef: string;
  kind: KnowledgeGrantKind;
  sourceEventId: string;
  sourceObservationId: string;
  grantedByRef?: string;
};

export type WorldKnowledgeNode = {
  id: string;
  subject: string;
  statement: string;
  truth: "confirmed" | "likely" | "false" | "unknown";
  visibility: WorldVisibility;
  holderIds: string[];
  holderRefs?: string[];
  loreRecordIds: string[];
  sourceEventId?: string;
  acquiredWeek: number;
};

export type WorldAudience =
  | { kind: "world"; holderId?: string }
  | { kind: "player"; holderId: "player" }
  | { kind: "actor"; holderId: string }
  | { kind: "faction"; holderId: string };

export type WorldKernel = {
  schemaVersion: 1;
  currentWeek: number;
  currentDate: string;
  lastResolvedWeek: number;
  actors: PersistentWorldActor[];
  factions: PersistentWorldFaction[];
  projects: PersistentWorldProject[];
  locations: PersistentWorldLocation[];
  events: PersistentWorldEvent[];
  observations: WorldObservation[];
  knowledge: WorldKnowledgeNode[];
  knowledgeGrants: WorldKnowledgeGrant[];
  canon: {
    mode: "anchored" | "diverging";
    deviation: number;
    pivotEventIds: string[];
    knowledgeHorizon: {
      work: "LOTM" | "COI";
      maxVolume: number | null;
      maxAbsoluteChapter: number | null;
      allowedEventIds: string[];
      revealedIdentityIds: string[];
      worldlineMode: "canon-aligned" | "canon-diverged" | "post-canon" | "custom";
    };
  };
};

export type WorldKernelSeed = {
  week: number;
  date: string;
  factions: { id: string; name: string; plan: string; progress: number; suspicion?: number }[];
  actors: { id: string; name: string; locationId: string; agenda: string; state?: string; lastAction?: string }[];
  locations: { id: string; name: string; risk: number }[];
  timeline: { id: string; title: string; scheduledWeek: number; status: string }[];
};

export type WorldTurnDelta = {
  week: number;
  playerIssuedNoOrders: boolean;
  newActors?: (Omit<PersistentWorldActor, "lastAction" | "knowledgeIds"> & { lastAction?: string; knowledgeIds?: string[] })[];
  newFactions?: (Omit<PersistentWorldFaction, "lastAction"> & { lastAction?: string })[];
  newProjects?: Omit<PersistentWorldProject, "updatedWeek">[];
  actorUpdates: { actorId: string; locationId?: string; shortTermGoal?: string; lastAction?: string; condition?: string }[];
  factionUpdates?: { factionId: string; posture?: string; resourcesDelta?: number; suspicionDelta?: number; lastAction?: string }[];
  projectUpdates: { projectId: string; progressDelta: number; stage?: string; nextMilestone?: string; blockers?: string[]; status?: PersistentWorldProject["status"] }[];
  locationUpdates: { locationId: string; riskDelta?: number; stabilityDelta?: number; publicMood?: string; condition?: string }[];
  events: Omit<PersistentWorldEvent, "week">[];
  observations: Omit<WorldObservation, "week">[];
  knowledge?: (Omit<WorldKnowledgeNode, "acquiredWeek" | "loreRecordIds"> & { loreRecordIds?: string[] })[];
  knowledgeGrants?: Omit<WorldKnowledgeGrant, "week">[];
  canon?: { mode?: "anchored" | "diverging"; deviationDelta?: number; pivotEventIds?: string[] };
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));

export function createWorldKernel(seed: WorldKernelSeed): WorldKernel {
  const DEFAULT_HORIZON = {
    work: "LOTM" as const,
    maxVolume: 1,
    maxAbsoluteChapter: 195,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned" as const,
  };
  return {
    schemaVersion: 1,
    currentWeek: seed.week,
    currentDate: seed.date,
    lastResolvedWeek: Math.max(0, seed.week - 1),
    actors: seed.actors.map((actor) => ({ id: actor.id, name: actor.name, locationId: actor.locationId, agenda: actor.agenda, shortTermGoal: actor.agenda, lastAction: actor.lastAction ?? "尚未产生新的可记录行动", condition: actor.state ?? "正常活动", knowledgeIds: [] })),
    factions: seed.factions.map((faction) => ({ id: faction.id, name: faction.name, posture: faction.plan, resources: 50, suspicion: faction.suspicion ?? 0, lastAction: "正在推进既定计划" })),
    projects: [
      ...seed.factions.map((faction) => ({ id: `faction:${faction.id}`, ownerId: faction.id, title: faction.plan, stage: "推进", progress: clamp(faction.progress), momentum: 1, secrecy: 50, nextMilestone: "等待世界推演器给出下一项具体里程碑", blockers: [], status: "active" as const, updatedWeek: seed.week })),
      ...seed.timeline.map((event) => ({ id: `timeline:${event.id}`, ownerId: "canon", title: event.title, stage: event.status, progress: clamp(Math.round(seed.week / Math.max(1, event.scheduledWeek) * 100)), momentum: 1, secrecy: 75, nextMilestone: `预定窗口：第${event.scheduledWeek}周`, blockers: [], status: event.status === "resolved" ? "completed" as const : "active" as const, updatedWeek: seed.week })),
    ],
    locations: seed.locations.map((location) => ({ id: location.id, name: location.name, risk: clamp(location.risk), stability: clamp(100 - location.risk), publicMood: "日常秩序仍在维持", conditions: [], actorIds: seed.actors.filter((actor) => actor.locationId === location.id).map((actor) => actor.id), factionIds: [], updatedWeek: seed.week })),
    events: [],
    observations: [],
    knowledge: [],
    knowledgeGrants: [],
    canon: {
      mode: "anchored",
      deviation: 0,
      pivotEventIds: [],
      knowledgeHorizon: { ...DEFAULT_HORIZON },
    },
  };
}

export function applyWorldTurn(kernel: WorldKernel, delta: WorldTurnDelta): WorldKernel {
  if (delta.week < kernel.lastResolvedWeek || delta.week > kernel.currentWeek) throw new Error("世界推演周次与持续状态不一致");
  const existingEventIds = new Set(kernel.events.map((event) => event.id));
  const incomingEventIds = new Set(delta.events.map((event) => event.id));
  if (incomingEventIds.size !== delta.events.length || [...incomingEventIds].some((id) => existingEventIds.has(id))) throw new Error("世界事件标识重复");
  for (const event of delta.events) {
    if (event.causeIds.some((id) => !existingEventIds.has(id) && !incomingEventIds.has(id))) throw new Error(`世界事件引用了不存在的原因：${event.id}`);
  }
  const existingActorIds = new Set(kernel.actors.map((actor) => actor.id));
  const existingFactionIds = new Set(kernel.factions.map((faction) => faction.id));
  const existingProjectIds = new Set(kernel.projects.map((project) => project.id));
  const locationIds = new Set(kernel.locations.map((location) => location.id));
  for (const actor of delta.newActors ?? []) {
    if (!locationIds.has(actor.locationId)) throw new Error(`新角色引用了不存在的地点：${actor.id} -> ${actor.locationId}`);
  }
  for (const update of delta.actorUpdates) {
    if (update.locationId && !locationIds.has(update.locationId)) throw new Error(`角色更新引用了不存在的地点：${update.actorId} -> ${update.locationId}`);
  }
  const validOwnerIds = new Set([
    "world",
    "canon",
    "player",
    "organization",
    ...existingActorIds,
    ...existingFactionIds,
    ...(delta.newActors ?? []).map((actor) => actor.id),
    ...(delta.newFactions ?? []).map((faction) => faction.id),
  ]);
  for (const project of delta.newProjects ?? []) {
    if (!validOwnerIds.has(project.ownerId)) throw new Error(`新项目引用了不存在的所有者：${project.id} -> ${project.ownerId}`);
  }
  const seededActors = [...kernel.actors, ...(delta.newActors ?? []).filter((actor) => !existingActorIds.has(actor.id)).map((actor) => ({ ...actor, lastAction: actor.lastAction ?? "刚刚进入持续世界状态", knowledgeIds: actor.knowledgeIds ?? [] }))];
  const seededFactions = [...kernel.factions, ...(delta.newFactions ?? []).filter((faction) => !existingFactionIds.has(faction.id)).map((faction) => ({ ...faction, lastAction: faction.lastAction ?? "刚刚进入持续世界状态" }))];
  const seededProjects = [...kernel.projects, ...(delta.newProjects ?? []).filter((project) => !existingProjectIds.has(project.id)).map((project) => ({ ...project, updatedWeek: delta.week }))];
  const actors = seededActors.map((actor) => {
    const update = delta.actorUpdates.find((item) => item.actorId === actor.id);
    return update ? { ...actor, locationId: update.locationId ?? actor.locationId, shortTermGoal: update.shortTermGoal ?? actor.shortTermGoal, lastAction: update.lastAction ?? actor.lastAction, condition: update.condition ?? actor.condition } : actor;
  });
  const factions = seededFactions.map((faction) => {
    const update = delta.factionUpdates?.find((item) => item.factionId === faction.id);
    return update ? { ...faction, posture: update.posture ?? faction.posture, resources: clamp(faction.resources + (update.resourcesDelta ?? 0)), suspicion: clamp(faction.suspicion + (update.suspicionDelta ?? 0)), lastAction: update.lastAction ?? faction.lastAction } : faction;
  });
  const projects = seededProjects.map((project) => {
    const update = delta.projectUpdates.find((item) => item.projectId === project.id);
    return update ? { ...project, progress: clamp(project.progress + update.progressDelta), momentum: clamp(update.progressDelta, -10, 10), stage: update.stage ?? project.stage, nextMilestone: update.nextMilestone ?? project.nextMilestone, blockers: update.blockers ?? project.blockers, status: update.status ?? project.status, updatedWeek: delta.week } : project;
  });
  const locations = kernel.locations.map((location) => {
    const update = delta.locationUpdates.find((item) => item.locationId === location.id);
    const locationEvents = delta.events.filter((event) => event.locationId === location.id);
    const factionIds = [...new Set([...location.factionIds, ...locationEvents.flatMap((event) => event.factionIds)])];
    const actorIds = actors.filter((actor) => actor.locationId === location.id).map((actor) => actor.id);
    if (!update) return { ...location, actorIds, factionIds, updatedWeek: locationEvents.length ? delta.week : location.updatedWeek };
    return { ...location, risk: clamp(location.risk + (update.riskDelta ?? 0)), stability: clamp(location.stability + (update.stabilityDelta ?? 0)), publicMood: update.publicMood ?? location.publicMood, conditions: update.condition && !location.conditions.includes(update.condition) ? [...location.conditions, update.condition].slice(-8) : location.conditions, actorIds, factionIds, updatedWeek: delta.week };
  });
  const events = [...kernel.events, ...delta.events.map((event) => ({
    ...event,
    week: delta.week,
    witnessRefs: [...new Set([
      ...(event.witnessRefs ?? []),
      ...event.actorIds.map((id) => `actor:${id}`),
      ...event.factionIds.map((id) => `faction:${id}`),
    ])],
  }))].slice(-240);
  const eventIds = new Set(events.map((event) => event.id));
  const observations = [...kernel.observations, ...delta.observations.filter((observation) => eventIds.has(observation.eventId)).map((observation) => ({ ...observation, week: delta.week }))].slice(-320);
  const incomingKnowledge = (delta.knowledge ?? [])
    .filter((node) => !node.sourceEventId || eventIds.has(node.sourceEventId))
    .map((node) => ({ ...node, loreRecordIds: node.loreRecordIds ?? [], acquiredWeek: delta.week }));
  const incomingKnowledgeIds = new Set(incomingKnowledge.map((node) => node.id));
  const incomingKnowledgeGrants = (delta.knowledgeGrants ?? []).map((grant) => ({ ...grant, week: delta.week }));
  const validKnowledgeHolderRefs = new Set([
    "player",
    "organization",
    ...seededActors.map((actor) => `actor:${actor.id}`),
    ...seededFactions.map((faction) => `faction:${faction.id}`),
  ]);
  for (const grant of incomingKnowledgeGrants) {
    if (!incomingKnowledgeIds.has(grant.knowledgeId)) throw new Error(`KnowledgeGrant references unknown knowledge: ${grant.id}`);
    if (!validKnowledgeHolderRefs.has(grant.holderRef)) throw new Error(`KnowledgeGrant references unknown holder: ${grant.id}`);
    if (!eventIds.has(grant.sourceEventId)) throw new Error(`KnowledgeGrant references unknown event: ${grant.id}`);
    const holderId = grant.holderRef.replace(/^(actor|faction):/, "");
    const sourceObservation = observations.find((observation) => observation.id === grant.sourceObservationId && observation.eventId === grant.sourceEventId);
    if (!sourceObservation || sourceObservation.visibility !== "public"
      && !sourceObservation.holderRefs?.includes(grant.holderRef)
      && !sourceObservation.holderIds.includes(holderId)) {
      throw new Error(`KnowledgeGrant references invalid observation: ${grant.id}`);
    }
  }
  const grantedHolders = new Map<string, string[]>();
  for (const grant of incomingKnowledgeGrants) grantedHolders.set(grant.knowledgeId, [...new Set([...(grantedHolders.get(grant.knowledgeId) ?? []), grant.holderRef])]);
  const authorizedKnowledge = incomingKnowledge.map((node) => {
    if (node.visibility === "public" || node.visibility === "world") return node;
    const holderRefs = grantedHolders.get(node.id) ?? [];
    const holderIds = holderRefs.map((ref) => ref === "player" ? "player" : ref.replace(/^(actor|faction):/, ""));
    return { ...node, holderIds, holderRefs };
  });
  const knowledge = [...kernel.knowledge, ...authorizedKnowledge].slice(-400);
  const knowledgeIds = new Set(knowledge.map((node) => node.id));
  const knowledgeGrants = [...(kernel.knowledgeGrants ?? []), ...incomingKnowledgeGrants]
    .filter((grant) => knowledgeIds.has(grant.knowledgeId))
    .slice(-800);
  return {
    ...kernel,
    currentWeek: Math.max(kernel.currentWeek, delta.week + 1),
    lastResolvedWeek: Math.max(kernel.lastResolvedWeek, delta.week),
    actors,
    factions,
    projects,
    locations,
    events,
    observations,
    knowledge,
    knowledgeGrants,
    canon: {
      ...kernel.canon,
      mode: delta.canon?.mode ?? kernel.canon.mode,
      deviation: clamp(kernel.canon.deviation + (delta.canon?.deviationDelta ?? 0)),
      pivotEventIds: [...new Set([...kernel.canon.pivotEventIds, ...(delta.canon?.pivotEventIds ?? [])])],
    },
  };
}

function audienceRef(audience: WorldAudience) {
  if (audience.kind === "world") return "world";
  return audience.kind === "player" ? "player" : `${audience.kind}:${audience.holderId}`;
}

function canSee(visibility: WorldVisibility, holderIds: string[], holderRefs: string[] | undefined, audience: WorldAudience) {
  if (audience.kind === "world") return true;
  if (visibility === "public") return true;
  const directlyHeld = holderIds.includes(audience.holderId) || (holderRefs ?? []).includes(audienceRef(audience));
  if (visibility === "player") return audience.kind === "player" || directlyHeld;
  if (visibility === "actors") return directlyHeld;
  return false;
}

export function projectWorldForAudience(kernel: WorldKernel, audience: WorldAudience) {
  if (audience.kind === "world") return kernel;
  const visibleObservations = kernel.observations.filter((observation) => canSee(observation.visibility, observation.holderIds, observation.holderRefs, audience));
  const observableEventIds = new Set(visibleObservations.map((observation) => observation.eventId));
  const reference = audienceRef(audience);
  return {
    ...kernel,
    actors: [],
    factions: [],
    projects: [],
    events: kernel.events.filter((event) => event.visibility !== "world" && (event.visibility === "public" || observableEventIds.has(event.id) || event.witnessRefs?.includes(reference))),
    observations: visibleObservations,
    knowledge: kernel.knowledge.filter((node) => canSee(node.visibility, node.holderIds, node.holderRefs, audience)),
    knowledgeGrants: (kernel.knowledgeGrants ?? []).filter((grant) => grant.holderRef === reference),
  };
}

export function deliverWorldPerceptions(kernel: WorldKernel, audiences: WorldAudience[]) {
  return Object.fromEntries(audiences.map((audience) => [audienceRef(audience), projectWorldForAudience(kernel, audience)]));
}
