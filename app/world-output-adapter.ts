import { DISTRICTS, type GameState, type WorldMove, type WorldSignal } from "./game-model.ts";
import type { WorldTurnDelta } from "./world-kernel.ts";

export type ExecutableProposalBoundary = {
  redLines: string[];
  mustEscalateWhen: string[];
  retreatCondition: string;
};

type KernelDeltaParseOptions = {
  game: GameState;
  resolvingWeek: number;
  playerIssuedNoOrders: boolean;
  publicSignals: WorldSignal[];
  allowedLoreIds: ReadonlySet<string>;
  allowedProposalIds: ReadonlySet<string>;
  proposalBoundaries: ReadonlyMap<string, ExecutableProposalBoundary>;
};

function legacyHash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output >>> 0);
}

function parseWorldKernelDelta(
  raw: Record<string, unknown>,
  options: KernelDeltaParseOptions,
): WorldTurnDelta {
  const { game, resolvingWeek, playerIssuedNoOrders, publicSignals, allowedLoreIds, allowedProposalIds, proposalBoundaries } = options;
  const source = raw.kernelDelta && typeof raw.kernelDelta === "object" && !Array.isArray(raw.kernelDelta) ? raw.kernelDelta as Record<string, unknown> : {};
  const list = (key: string) => Array.isArray(source[key]) ? source[key] as unknown[] : [];
  const proposalSources = (value: Record<string, unknown>) => Array.isArray(value.sourceProposalIds)
    ? [...new Set(value.sourceProposalIds.map(String).filter((id) => allowedProposalIds.has(id)))].slice(0, 8)
    : [];
  const actorIds = new Set(game.worldKernel.actors.map((item) => item.id));
  const factionIds = new Set(game.worldKernel.factions.map((item) => item.id));
  const projectIds = new Set(game.worldKernel.projects.map((item) => item.id));
  const locationIds = new Set(game.worldKernel.locations.map((item) => item.id));
  const validHolderRef = (ref: string) => ref === "player"
    || ref === "organization"
    || ref.startsWith("actor:") && actorIds.has(ref.slice("actor:".length))
    || ref.startsWith("faction:") && factionIds.has(ref.slice("faction:".length));
  const holderRefForId = (id: string) => id === "player" || id === "organization"
    ? id
    : actorIds.has(id)
      ? `actor:${id}`
      : factionIds.has(id)
        ? `faction:${id}`
        : "";
  const newActors = list("newActors").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 8).flatMap((value, index) => {
    const sourceProposalIds = proposalSources(value);
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 60) : "";
    const locationId = typeof value.locationId === "string" && locationIds.has(value.locationId) ? value.locationId : "";
    if (!name || !locationId || !sourceProposalIds.length) return [];
    const requested = typeof value.id === "string" ? value.id.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 64) : "";
    const id = requested && !actorIds.has(requested) ? requested : `emergent-actor-${resolvingWeek}-${index}-${legacyHash(name)}`;
    actorIds.add(id);
    return [{ id, name, locationId, agenda: typeof value.agenda === "string" ? value.agenda.slice(0, 220) : "在世界中维护自身处境", shortTermGoal: typeof value.shortTermGoal === "string" ? value.shortTermGoal.slice(0, 220) : "完成眼前事务", condition: typeof value.condition === "string" ? value.condition.slice(0, 140) : "正常活动", lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 280) : undefined, knowledgeIds: [], sourceProposalIds }];
  });
  const newFactions = list("newFactions").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 4).flatMap((value, index) => {
    const sourceProposalIds = proposalSources(value);
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 60) : "";
    if (!name || !sourceProposalIds.length) return [];
    const requested = typeof value.id === "string" ? value.id.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 64) : "";
    const id = requested && !factionIds.has(requested) ? requested : `emergent-faction-${resolvingWeek}-${index}-${legacyHash(name)}`;
    factionIds.add(id);
    return [{ id, name, posture: typeof value.posture === "string" ? value.posture.slice(0, 220) : "维持自身利益", resources: Math.max(0, Math.min(100, Number(value.resources) || 40)), suspicion: Math.max(0, Math.min(100, Number(value.suspicion) || 0)), lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 280) : undefined, sourceProposalIds }];
  });
  const newProjects = list("newProjects").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 8).flatMap((value, index) => {
    const sourceProposalIds = proposalSources(value);
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 80) : "";
    const ownerId = typeof value.ownerId === "string" ? value.ownerId : "world";
    const validOwnerIds = new Set(["world", "canon", "player", "organization", ...actorIds, ...factionIds]);
    if (!title || !validOwnerIds.has(ownerId) || !sourceProposalIds.length) return [];
    const requested = typeof value.id === "string" ? value.id.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 72) : "";
    const id = requested && !projectIds.has(requested) ? requested : `emergent-project-${resolvingWeek}-${index}-${legacyHash(title)}`;
    projectIds.add(id);
    return [{ id, ownerId, title, stage: typeof value.stage === "string" ? value.stage.slice(0, 60) : "形成", progress: Math.max(0, Math.min(100, Number(value.progress) || 0)), momentum: Math.max(-10, Math.min(10, Number(value.momentum) || 1)), secrecy: Math.max(0, Math.min(100, Number(value.secrecy) || 50)), nextMilestone: typeof value.nextMilestone === "string" ? value.nextMilestone.slice(0, 220) : "等待下一步因果变化", blockers: Array.isArray(value.blockers) ? value.blockers.map(String).slice(0, 4) : [], status: ["active", "paused", "completed", "failed"].includes(String(value.status)) ? String(value.status) as "active" | "paused" | "completed" | "failed" : "active" as const, sourceProposalIds }];
  });
  const rawEvents = list("events").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 12);
  const eventIdMap = new Map<string, string>();
  const events = rawEvents.flatMap((value, index) => {
    const sourceProposalIds = proposalSources(value);
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 80) : "";
    const detail = typeof value.detail === "string" ? value.detail.trim().slice(0, 520) : "";
    if (!title || !detail || !sourceProposalIds.length) return [];
    const sourceId = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `event-${index}`;
    const id = `world-${resolvingWeek}-${legacyHash(`${sourceId}:${title}`)}`;
    eventIdMap.set(sourceId, id);
    const visibility = ["world", "public", "player", "actors"].includes(String(value.visibility)) ? String(value.visibility) as "world" | "public" | "player" | "actors" : "world";
    const eventActorIds = Array.isArray(value.actorIds) ? value.actorIds.map(String).filter((id) => actorIds.has(id)).slice(0, 6) : [];
    const eventFactionIds = Array.isArray(value.factionIds) ? value.factionIds.map(String).filter((id) => factionIds.has(id)).slice(0, 6) : [];
    const witnessRefs = [...new Set([
      ...(Array.isArray(value.witnessRefs) ? value.witnessRefs.map(String).slice(0, 12) : []),
      ...eventActorIds.map((actorId) => `actor:${actorId}`),
      ...eventFactionIds.map((factionId) => `faction:${factionId}`),
    ])];
    return [{ id, title, detail, locationId: typeof value.locationId === "string" && locationIds.has(value.locationId) ? value.locationId : undefined, actorIds: eventActorIds, factionIds: eventFactionIds, causeIds: Array.isArray(value.causeIds) ? value.causeIds.map(String).slice(0, 6) : [], visibility, witnessRefs, sourceProposalIds }];
  });
  const existingEventIds = new Set(game.worldKernel.events.map((event) => event.id));
  const incomingEventIds = new Set(events.map((event) => event.id));
  for (const event of events) {
    event.causeIds = event.causeIds
      .map((id) => eventIdMap.get(id) ?? id)
      .filter((id) => existingEventIds.has(id) || incomingEventIds.has(id))
      .slice(0, 6);
  }
  const fallbackEventId = events.find((event) => event.visibility !== "world")?.id ?? events[0]?.id;
  const observations = list("observations").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 12).flatMap((value, index) => {
    const text = typeof value.text === "string" ? value.text.trim().slice(0, 420) : "";
    if (!text) return [];
    const visibility = ["public", "player", "actors"].includes(String(value.visibility)) ? String(value.visibility) as "public" | "player" | "actors" : "public";
    const holderIds = Array.isArray(value.holderIds) ? value.holderIds.map(String).filter((id) => Boolean(holderRefForId(id))).slice(0, 8) : [];
    const holderRefs = [...new Set([
      ...(Array.isArray(value.holderRefs) ? value.holderRefs.map(String).filter(validHolderRef).slice(0, 12) : []),
      ...holderIds.map(holderRefForId).filter(Boolean),
    ])];
    const requestedEventId = typeof value.eventId === "string" ? value.eventId.trim() : "";
    const eventId = requestedEventId
      ? eventIdMap.get(requestedEventId) ?? (existingEventIds.has(requestedEventId) ? requestedEventId : undefined)
      : fallbackEventId;
    if (!eventId) return [];
    const event = events.find((candidate) => candidate.id === eventId) ?? game.worldKernel.events.find((candidate) => candidate.id === eventId);
    const eventEntityRefs = new Set([
      ...(event?.actorIds ?? []).map((id) => `actor:${id}`),
      ...(event?.factionIds ?? []).map((id) => `faction:${id}`),
    ]);
    const perceivedRefs = Array.isArray(value.perceivedRefs)
      ? [...new Set(value.perceivedRefs.map(String).filter((ref) => validHolderRef(ref) && eventEntityRefs.has(ref)).slice(0, 12))]
      : [];
    const acquisitionKind = ["witness", "communication", "investigation", "propagation"].includes(String(value.acquisitionKind))
      ? String(value.acquisitionKind) as "witness" | "communication" | "investigation" | "propagation"
      : "investigation" as const;
    return [{ id: `observation-${resolvingWeek}-${index}-${legacyHash(text)}`, eventId, channel: typeof value.channel === "string" ? value.channel.slice(0, 24) : "街谈", text, visibility, holderIds, holderRefs, perceivedRefs, acquisitionKind }];
  });
  if (fallbackEventId) for (const [index, signal] of publicSignals.entries()) if (!observations.some((item) => item.text === signal.body)) observations.push({ id: `observation-signal-${resolvingWeek}-${index}`, eventId: fallbackEventId, channel: signal.channel, text: signal.body, visibility: "public", holderIds: [], holderRefs: [], perceivedRefs: [], acquisitionKind: "propagation" });
  const actorUpdates = list("actorUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && actorIds.has(String((item as Record<string, unknown>).actorId)) && proposalSources(item as Record<string, unknown>).length)).slice(0, 12).map((value) => ({ actorId: String(value.actorId), locationId: typeof value.locationId === "string" && locationIds.has(value.locationId) ? value.locationId : undefined, shortTermGoal: typeof value.shortTermGoal === "string" ? value.shortTermGoal.slice(0, 220) : undefined, lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 320) : undefined, condition: typeof value.condition === "string" ? value.condition.slice(0, 160) : undefined, sourceProposalIds: proposalSources(value) }));
  const factionUpdates = list("factionUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && factionIds.has(String((item as Record<string, unknown>).factionId)) && proposalSources(item as Record<string, unknown>).length)).slice(0, 10).map((value) => ({ factionId: String(value.factionId), posture: typeof value.posture === "string" ? value.posture.slice(0, 220) : undefined, resourcesDelta: Math.max(-8, Math.min(8, Number(value.resourcesDelta) || 0)), suspicionDelta: Math.max(-6, Math.min(6, Number(value.suspicionDelta) || 0)), lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 320) : undefined, sourceProposalIds: proposalSources(value) }));
  const projectUpdates = list("projectUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && projectIds.has(String((item as Record<string, unknown>).projectId)) && proposalSources(item as Record<string, unknown>).length)).slice(0, 12).map((value) => ({ projectId: String(value.projectId), progressDelta: Math.max(-8, Math.min(10, Number(value.progressDelta) || 0)), stage: typeof value.stage === "string" ? value.stage.slice(0, 60) : undefined, nextMilestone: typeof value.nextMilestone === "string" ? value.nextMilestone.slice(0, 220) : undefined, blockers: Array.isArray(value.blockers) ? value.blockers.map(String).slice(0, 4) : undefined, status: ["active", "paused", "completed", "failed"].includes(String(value.status)) ? String(value.status) as "active" | "paused" | "completed" | "failed" : undefined, sourceProposalIds: proposalSources(value) }));
  const locationUpdates = list("locationUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && locationIds.has(String((item as Record<string, unknown>).locationId)) && proposalSources(item as Record<string, unknown>).length)).slice(0, 10).map((value) => ({ locationId: String(value.locationId), riskDelta: Math.max(-8, Math.min(8, Number(value.riskDelta) || 0)), stabilityDelta: Math.max(-8, Math.min(8, Number(value.stabilityDelta) || 0)), publicMood: typeof value.publicMood === "string" ? value.publicMood.slice(0, 160) : undefined, condition: typeof value.condition === "string" ? value.condition.slice(0, 200) : undefined, sourceProposalIds: proposalSources(value) }));
  const knowledge = list("knowledge").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 16).flatMap((value, index) => {
    const statement = typeof value.statement === "string" ? value.statement.trim().slice(0, 360) : "";
    if (!statement) return [];
    const visibility = ["world", "public", "player", "actors"].includes(String(value.visibility)) ? String(value.visibility) as "world" | "public" | "player" | "actors" : "world";
    const truth = ["confirmed", "likely", "false", "unknown"].includes(String(value.truth)) ? String(value.truth) as "confirmed" | "likely" | "false" | "unknown" : "unknown";
    const requestedHolderIds = Array.isArray(value.holderIds) ? value.holderIds.map(String).filter((id) => Boolean(holderRefForId(id))).slice(0, 8) : [];
    const requestedHolderRefs = [...new Set([
      ...(Array.isArray(value.holderRefs) ? value.holderRefs.map(String).filter(validHolderRef).slice(0, 12) : []),
      ...requestedHolderIds.map(holderRefForId).filter(Boolean),
    ])];
    const sourceEventId = eventIdMap.get(String(value.sourceEventId ?? ""));
    const privateHolders = visibility === "actors" || visibility === "player" ? requestedHolderRefs : [];
    for (const holderRef of privateHolders) {
      const sourceObservation = observations.find((observation) => observation.eventId === sourceEventId && observation.holderRefs.includes(holderRef));
      if (!sourceObservation) throw new Error(`KnowledgeGrant missing for ${holderRef}: private knowledge requires a matching persisted observation`);
    }
    const holderRefs = privateHolders;
    const holderIds = holderRefs.map((ref) => ref === "player" || ref === "organization" ? ref : ref.replace(/^(actor|faction):/, ""));
    return [{ id: `knowledge-${resolvingWeek}-${index}-${legacyHash(statement)}`, subject: typeof value.subject === "string" ? value.subject.slice(0, 80) : "世界变化", statement, truth, visibility, holderIds, holderRefs, loreRecordIds: Array.isArray(value.loreRecordIds) ? value.loreRecordIds.map(String).filter((id) => allowedLoreIds.has(id)).slice(0, 8) : [], sourceEventId }];
  });
  const knowledgeGrants = knowledge.flatMap((node) => node.holderRefs.map((holderRef) => {
    const observation = observations.find((candidate) => candidate.eventId === node.sourceEventId && candidate.holderRefs.includes(holderRef));
    if (!node.sourceEventId || !observation) throw new Error(`KnowledgeGrant missing for ${holderRef}: acquisition evidence did not survive normalization`);
    return {
      id: `knowledge-grant-${resolvingWeek}-${legacyHash(`${node.id}:${holderRef}:${observation.id}`)}`,
      knowledgeId: node.id,
      holderRef,
      kind: observation.acquisitionKind,
      sourceEventId: node.sourceEventId,
      sourceObservationId: observation.id,
    };
  }));
  const directiveInterruptions = list("directiveInterruptions")
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .slice(0, 8)
    .flatMap((value) => {
      const proposalId = typeof value.proposalId === "string" && allowedProposalIds.has(value.proposalId) ? value.proposalId : "";
      const sourceEventId = eventIdMap.get(String(value.sourceEventId ?? ""));
      const sourceEvent = events.find((event) => event.id === sourceEventId && event.sourceProposalIds?.includes(proposalId));
      const triggeredBoundary = typeof value.triggeredBoundary === "string" ? value.triggeredBoundary.trim().slice(0, 220) : "";
      const boundary = proposalBoundaries.get(proposalId);
      const validBoundaries = boundary
        ? [...boundary.redLines, ...boundary.mustEscalateWhen, boundary.retreatCondition].map((item) => item.trim()).filter(Boolean)
        : [];
      const completedFraction = Math.max(0.05, Math.min(0.95, Number(value.completedFraction) || 0));
      const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 320) : "";
      if (!proposalId || !sourceEventId || !sourceEvent || !triggeredBoundary || !validBoundaries.includes(triggeredBoundary) || !reason) return [];
      return [{ proposalId, sourceEventId, triggeredBoundary, reason, completedFraction }];
    });
  const canonValue = source.canon && typeof source.canon === "object" && !Array.isArray(source.canon) ? source.canon as Record<string, unknown> : {};
  const mayDiverge = game.deviation >= 15 || game.pivots.some((pivot) => pivot.magnitude >= 20);
  return { week: resolvingWeek, playerIssuedNoOrders: playerIssuedNoOrders, newActors, newFactions, newProjects, actorUpdates, factionUpdates, projectUpdates, locationUpdates, events, observations, knowledge, knowledgeGrants, directiveInterruptions, canon: { mode: mayDiverge && canonValue.mode === "diverging" ? "diverging" : "anchored", deviationDelta: Math.max(0, Math.min(8, Number(canonValue.deviationDelta) || 0)), pivotEventIds: mayDiverge && Array.isArray(canonValue.pivotEventIds) ? canonValue.pivotEventIds.map(String).map((id) => eventIdMap.get(id) ?? id).filter((id) => events.some((event) => event.id === id)).slice(0, 4) : [] } };
}

export function adaptWorldAdjudication(
  raw: Record<string, unknown>,
  options: {
    game: GameState;
    resolvingWeek: number;
    playerIssuedNoOrders: boolean;
    allowedLoreIds: ReadonlySet<string>;
    allowedProposalIds: ReadonlySet<string>;
    proposalBoundaries: ReadonlyMap<string, ExecutableProposalBoundary>;
  },
) {
  const basics = parseWorldAdjudicationBasics(raw, options.game, options.resolvingWeek);
  return {
    ...basics,
    kernelDelta: parseWorldKernelDelta(raw, {
      game: options.game,
      resolvingWeek: options.resolvingWeek,
      playerIssuedNoOrders: options.playerIssuedNoOrders,
      publicSignals: basics.publicSignals,
      allowedLoreIds: options.allowedLoreIds,
      allowedProposalIds: options.allowedProposalIds,
      proposalBoundaries: options.proposalBoundaries,
    }),
  };
}

function boundedList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit).map((item) => item.slice(0, 260))
    : [];
}

function parseWorldAdjudicationBasics(
  raw: Record<string, unknown>,
  game: Pick<GameState, "week" | "factions" | "campaignWorld">,
  resolvingWeek: number,
) {
  const moves = Array.isArray(raw.factionMoves) ? raw.factionMoves.slice(0, 5) : [];
  const worldMoves: WorldMove[] = [];
  for (const [index, move] of moves.entries()) {
    if (!move || typeof move !== "object" || Array.isArray(move)) continue;
    const value = move as Record<string, unknown>;
    const faction = game.factions.find((item) => item.id === value.factionId);
    if (!faction || typeof value.detail !== "string" || typeof value.title !== "string") continue;
    const visibility = ["迹象", "获知", "确认"].includes(String(value.visibility))
      ? value.visibility as WorldMove["visibility"]
      : "迹象";
    worldMoves.push({
      id: `ai-move-${game.week}-${index}-${faction.id}`,
      factionId: faction.id,
      title: value.title.slice(0, 40),
      detail: value.detail.slice(0, 240),
      week: game.week,
      visibility,
    });
  }

  const canonMoves = Array.isArray(raw.canonMoves) ? raw.canonMoves.slice(0, 3) : [];
  const allowedChannels = new Set<WorldSignal["channel"]>(["报纸", "街谈", "官方通告", "行业消息", "神秘征兆", "私人来信"]);
  const allowedReliability = new Set<WorldSignal["reliability"]>(["公开事实", "多源传闻", "单一消息", "异常感知"]);
  const publicSignals: WorldSignal[] = Array.isArray(raw.publicSignals)
    ? raw.publicSignals.slice(0, 4).flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const value = item as Record<string, unknown>;
        const headline = typeof value.headline === "string" ? value.headline.trim().slice(0, 70) : "";
        const body = typeof value.body === "string" ? value.body.trim().slice(0, 420) : "";
        if (!headline || !body) return [];
        const channel = allowedChannels.has(String(value.channel) as WorldSignal["channel"])
          ? String(value.channel) as WorldSignal["channel"]
          : "街谈";
        const reliability = allowedReliability.has(String(value.reliability) as WorldSignal["reliability"])
          ? String(value.reliability) as WorldSignal["reliability"]
          : "单一消息";
        const districtId = typeof value.districtId === "string" && DISTRICTS.some((district) => district.id === value.districtId)
          ? value.districtId
          : undefined;
        const cityId = typeof value.cityId === "string" && game.campaignWorld.cities.some((city) => city.id === value.cityId)
          ? value.cityId
          : undefined;
        const relatedFactionId = typeof value.relatedFactionId === "string" && game.factions.some((faction) => faction.id === value.relatedFactionId)
          ? value.relatedFactionId
          : undefined;
        return [{
          id: `ai-signal-${resolvingWeek}-${index}-${legacyHash(headline)}`,
          week: resolvingWeek,
          channel,
          headline,
          body,
          reliability,
          districtId,
          cityId,
          relatedFactionId,
        }];
      })
    : [];
  if (publicSignals.length < 2) throw new Error("世界模型没有生成固定报纸所需的2条公开消息，本周拒绝结算");

  const summary = raw.worldSummary && typeof raw.worldSummary === "object" && !Array.isArray(raw.worldSummary)
    ? raw.worldSummary as Record<string, unknown>
    : {};
  const atmosphere = typeof summary.atmosphere === "string" ? summary.atmosphere.trim().slice(0, 420) : "";
  if (!atmosphere) throw new Error("世界模型没有返回本周城市气氛；本周拒绝结算，不使用本地替代文本");
  return {
    worldMoves,
    canonMoves,
    publicSignals,
    atmosphere,
    undercurrents: boundedList(summary.undercurrents, 4),
  };
}
