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

export function buildAutonomousMemoryProjection(
  state: DynamicMemoryState | undefined,
  audience: AutonomousMemoryAudience,
  currentWeek: number,
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
    candidates.push(reference({ id: event.id, kind: "event", week: event.week, importance: event.importance, summary: event.summary, sourceEventId: event.sourceEventId, tags: event.tags, status: event.status }));
  }

  for (const belief of state.beliefs ?? []) {
    if (!belief.active) continue;
    const visible = audience.kind === "actor"
      ? belief.characterId === raw || belief.characterId === canonical
      : belief.characterId === canonical;
    if (!visible) continue;
    candidates.push(reference({ id: belief.id, kind: "belief", week: belief.validFromWeek, importance: belief.importance, summary: belief.claim, confidence: belief.confidence, sourceEventId: belief.learnedFrom.sourceId, tags: [belief.claimType], status: belief.truthStatus }));
  }

  for (const commitment of state.commitments ?? []) {
    if (commitment.status !== "active") continue;
    const visible = audience.kind === "actor"
      ? involved(commitment.participantIds, raw, canonical)
      : commitment.participantIds.includes(canonical);
    if (!visible) continue;
    candidates.push(reference({ id: commitment.id, kind: "commitment", week: commitment.createdWeek, importance: commitment.importance, summary: commitment.summary, sourceEventId: commitment.sourceEventId, tags: [commitment.type], status: commitment.status }));
  }

  for (const cause of state.relationshipCauses ?? []) {
    if (!cause.active) continue;
    const visible = audience.kind === "actor"
      ? [cause.fromCharacterId, cause.toCharacterId].some((id) => id === raw || id === canonical)
      : cause.fromCharacterId === canonical || cause.toCharacterId === canonical;
    if (!visible) continue;
    candidates.push(reference({ id: cause.id, kind: "relationship", week: cause.createdWeek, importance: Math.min(1, Math.abs(cause.delta) / 20 + 0.3), summary: cause.summary, sourceEventId: cause.sourceEventId, tags: [cause.dimension], status: cause.delta >= 0 ? "positive" : "negative" }));
  }

  for (const plan of state.plans ?? []) {
    if (plan.status !== "active" && plan.status !== "blocked") continue;
    const visible = audience.kind === "actor"
      ? plan.ownerId === raw || plan.ownerId === canonical || involved(plan.participantIds, raw, canonical)
      : plan.ownerId === raw || plan.ownerId === canonical || plan.participantIds.includes(canonical);
    if (!visible) continue;
    candidates.push(reference({ id: plan.id, kind: "plan", week: plan.createdWeek, importance: plan.importance, summary: `${plan.title}：${plan.objective}；当前步骤：${plan.currentStep}`, sourceEventId: plan.sourceEventIds[0], tags: [plan.title, plan.status], status: plan.status }));
  }

  candidates.sort((left, right) => right.importance - left.importance || right.week - left.week || left.id.localeCompare(right.id));
  const selected: MemoryReference[] = [];
  for (const candidate of candidates) {
    if (selected.length >= AUTONOMOUS_MEMORY_MAX_REFS) break;
    const trial = emptyContext(currentWeek);
    for (const item of [...selected, candidate]) place(trial, item);
    if (renderDynamicMemoryContext(trial).length > AUTONOMOUS_MEMORY_MAX_CHARS) continue;
    selected.push(candidate);
  }
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
