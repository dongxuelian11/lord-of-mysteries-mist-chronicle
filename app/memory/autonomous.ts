import { renderDynamicMemoryContext } from "./prompt.ts";
import type {
  DynamicMemoryContext,
  DynamicMemoryState,
  MemoryReference,
} from "./types.ts";

export const AUTONOMOUS_MEMORY_MAX_REFS = 12;
export const AUTONOMOUS_MEMORY_MAX_CHARS = 2_800;

export type AutonomousMemoryAudience =
  | { kind: "actor"; actorId: string }
  | { kind: "faction"; factionId: string };

export type AutonomousMemoryProjection = {
  audience: AutonomousMemoryAudience;
  text: string;
  referenceIds: string[];
  sourceEventIds: string[];
};

export type AutonomousMemorySignals = {
  objective?: string;
  nextAction?: string;
  relationshipRefs?: string[];
};

function audienceIdentities(audience: AutonomousMemoryAudience) {
  return audience.kind === "actor"
    ? { raw: audience.actorId, canonical: `actor:${audience.actorId}` }
    : { raw: audience.factionId, canonical: `faction:${audience.factionId}` };
}

function involved(ids: string[], raw: string, canonical: string) {
  return ids.includes(raw) || ids.includes(canonical);
}

function reference(input: MemoryReference): MemoryReference {
  return { ...input, summary: input.summary.slice(0, 220) };
}

function emptyContext(currentWeek: number): DynamicMemoryContext {
  return {
    sceneType: "autonomous",
    currentWeek,
    worldFacts: [],
    actorBeliefs: [],
    commitments: [],
    relationshipCauses: [],
    activePlans: [],
    uncertainties: [],
    contradictions: [],
    forbiddenInferences: [
      "不得推断其他主体未向本受众公开的信念、承诺、关系或计划。",
      "记忆是主体的认知来源，不等于世界真相；不确定信念必须保留不确定性。",
    ],
    sourceEventIds: [],
    totalCharacters: 0,
  };
}

function place(context: DynamicMemoryContext, item: MemoryReference) {
  if (item.kind === "event") context.worldFacts.push(item);
  else if (item.kind === "belief") context.actorBeliefs.push(item);
  else if (item.kind === "commitment") context.commitments.push(item);
  else if (item.kind === "relationship") context.relationshipCauses.push(item);
  else context.activePlans.push(item);
}

function relevanceTerms(value: string) {
  const normalized = value.toLowerCase();
  const terms = new Set(normalized.match(/[a-z0-9:_-]{3,}|[\u4e00-\u9fff]{2,8}/g) ?? []);
  for (const chunk of normalized.match(/[\u4e00-\u9fff]{3,12}/g) ?? []) {
    for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) terms.add(chunk.slice(index, index + size));
    }
  }
  return terms;
}

function signalRelevance(item: MemoryReference, signals: AutonomousMemorySignals) {
  const query = relevanceTerms([signals.objective, signals.nextAction, ...(signals.relationshipRefs ?? [])].filter(Boolean).join(" "));
  if (!query.size) return 0;
  const memory = relevanceTerms(`${item.summary} ${item.tags.join(" ")}`);
  let matches = 0;
  for (const term of query) if (memory.has(term)) matches += 1;
  return Math.min(1, matches / Math.max(1, Math.min(4, query.size)));
}

export function buildAutonomousMemoryProjection(
  state: DynamicMemoryState | undefined,
  audience: AutonomousMemoryAudience,
  currentWeek: number,
  signals: AutonomousMemorySignals = {},
): AutonomousMemoryProjection {
  const context = emptyContext(currentWeek);
  if (!state) return { audience, text: renderDynamicMemoryContext(context), referenceIds: [], sourceEventIds: [] };
  const { raw, canonical } = audienceIdentities(audience);
  const candidates: MemoryReference[] = [];

  for (const event of state.events ?? []) {
    if (event.status !== "active") continue;
    const visible = audience.kind === "actor"
      ? involved(event.participantIds, raw, canonical) || involved(event.observerIds, raw, canonical)
      : event.organizationIds.includes(raw) || event.organizationIds.includes(canonical) || event.participantIds.includes(canonical) || event.observerIds.includes(canonical);
    if (!visible) continue;
    candidates.push(reference({ id: event.id, kind: "event", week: event.week, importance: event.importance, summary: event.summary, sourceEventId: event.sourceEventId, tags: [...event.tags, ...event.participantIds, ...event.observerIds], status: event.status }));
  }

  for (const belief of state.beliefs ?? []) {
    if (!belief.active) continue;
    const visible = audience.kind === "actor"
      ? belief.characterId === raw || belief.characterId === canonical
      : belief.characterId === canonical;
    if (!visible) continue;
    candidates.push(reference({ id: belief.id, kind: "belief", week: belief.validFromWeek, importance: belief.importance, summary: belief.claim, confidence: belief.confidence, sourceEventId: belief.learnedFrom.sourceId, tags: [belief.claimType, belief.subjectId], status: belief.truthStatus }));
  }

  for (const commitment of state.commitments ?? []) {
    if (commitment.status !== "active") continue;
    const visible = audience.kind === "actor"
      ? involved(commitment.participantIds, raw, canonical)
      : commitment.participantIds.includes(canonical);
    if (!visible) continue;
    candidates.push(reference({ id: commitment.id, kind: "commitment", week: commitment.createdWeek, importance: commitment.importance, summary: commitment.summary, sourceEventId: commitment.sourceEventId, tags: [commitment.type, ...commitment.participantIds], status: commitment.status }));
  }

  for (const cause of state.relationshipCauses ?? []) {
    if (!cause.active) continue;
    const visible = audience.kind === "actor"
      ? [cause.fromCharacterId, cause.toCharacterId].some((id) => id === raw || id === canonical)
      : cause.fromCharacterId === canonical || cause.toCharacterId === canonical;
    if (!visible) continue;
    candidates.push(reference({ id: cause.id, kind: "relationship", week: cause.createdWeek, importance: Math.min(1, Math.abs(cause.delta) / 20 + 0.3), summary: cause.summary, sourceEventId: cause.sourceEventId, tags: [cause.dimension, cause.fromCharacterId, cause.toCharacterId], status: cause.delta >= 0 ? "positive" : "negative" }));
  }

  for (const plan of state.plans ?? []) {
    if (plan.status !== "active" && plan.status !== "blocked") continue;
    const visible = audience.kind === "actor"
      ? plan.ownerId === raw || plan.ownerId === canonical || involved(plan.participantIds, raw, canonical)
      : plan.ownerId === raw || plan.ownerId === canonical || plan.participantIds.includes(canonical);
    if (!visible) continue;
    candidates.push(reference({ id: plan.id, kind: "plan", week: plan.createdWeek, importance: plan.importance, summary: `${plan.title}：${plan.objective}；当前步骤：${plan.currentStep}`, sourceEventId: plan.sourceEventIds[0], tags: [plan.title, plan.status, plan.ownerId, ...plan.participantIds], status: plan.status }));
  }

  const commitments = new Map((state.commitments ?? []).map((item) => [item.id, item]));
  const plans = new Map((state.plans ?? []).map((item) => [item.id, item]));
  const ranked = candidates.map((item) => {
    const age = Math.max(0, currentWeek - item.week);
    const recency = Math.max(0, 1 - age / 24);
    let priority = item.importance + recency * 0.35 + signalRelevance(item, signals) * 2;
    if (item.kind === "commitment") {
      const dueWeek = commitments.get(item.id)?.dueWeek;
      if (dueWeek !== undefined) priority += dueWeek <= currentWeek ? 4 : dueWeek <= currentWeek + 2 ? 3 : dueWeek <= currentWeek + 5 ? 1 : 0;
    }
    if (item.kind === "plan") {
      const plan = plans.get(item.id);
      if (plan?.status === "blocked") priority += 2.5;
      if (plan?.dueWeek !== undefined && plan.dueWeek <= currentWeek + 2) priority += 2;
    }
    return { item, priority };
  }).sort((left, right) => right.priority - left.priority || right.item.week - left.item.week || left.item.id.localeCompare(right.item.id));
  const selected: MemoryReference[] = [];
  const selectedIds = new Set<string>();
  const trySelect = (candidate: MemoryReference) => {
    if (selected.length >= AUTONOMOUS_MEMORY_MAX_REFS) return;
    if (selectedIds.has(candidate.id)) return;
    const trial = emptyContext(currentWeek);
    for (const item of [...selected, candidate]) place(trial, item);
    if (renderDynamicMemoryContext(trial).length > AUTONOMOUS_MEMORY_MAX_CHARS) return;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  };
  for (const kind of ["commitment", "plan", "relationship", "belief", "event"] as const) {
    const best = ranked.find((candidate) => candidate.item.kind === kind)?.item;
    if (best) trySelect(best);
  }
  for (const candidate of ranked) trySelect(candidate.item);
  for (const item of selected) place(context, item);
  const selectedBeliefs = selected.filter((item) => item.kind === "belief");
  context.uncertainties = selectedBeliefs.filter((item) => item.status === "uncertain" || item.status === "unknown" || (item.confidence ?? 1) < 0.6);
  context.sourceEventIds = [...new Set(selected.flatMap((item) => item.sourceEventId ? [item.sourceEventId] : []))];
  const text = renderDynamicMemoryContext(context);
  context.totalCharacters = text.length;
  return {
    audience,
    text,
    referenceIds: [...new Set(selected.map((item) => item.id))],
    sourceEventIds: context.sourceEventIds,
  };
}
