// 按场景检索工作记忆：可见性 → 激活评分 → 预算截断 → 结构化引用。
import { FORBIDDEN_INFERENCES, SCENE_BUDGETS, SCENE_MAX_REFS } from "./config.ts";
import { beliefActivation, eventActivation } from "./decay.ts";
import { relationshipScore, planScore, commitmentScore } from "./scoring.ts";
import type { MemoryAudience } from "./permissions.ts";
import { recordMemoryTrace } from "./trace.ts";
import type {
  CharacterBelief,
  DynamicMemoryContext,
  DynamicMemoryState,
  MemoryEvent,
  MemoryReference,
  MemoryTrace,
  SceneType,
} from "./types.ts";
import type { MemoryIndexes } from "./indexer.ts";

export type SceneMemoryRequest = {
  sceneType: SceneType;
  state: DynamicMemoryState;
  indexes: MemoryIndexes;
  currentWeek: number;
  actorId?: string;
  queryTags?: string[];
  locationId?: string;
  organizationIds?: string[];
};

function audienceFor(sceneType: SceneType): MemoryAudience {
  if (sceneType === "world") return "world";
  if (sceneType === "dialogue" || sceneType === "action" || sceneType === "council") return "actor";
  return "player";
}

function toReference(
  id: string,
  kind: MemoryReference["kind"],
  week: number,
  importance: number,
  summary: string,
  sourceEventId: string | undefined,
  tags: string[],
  status: string | undefined,
  confidence?: number
): MemoryReference {
  return { id, kind, week, importance, summary: summary.slice(0, 220), confidence, sourceEventId, tags, status };
}

function goalRelevance(tags: string[], queryTags: string[], locationId?: string, queryLocation?: string): number {
  if (queryTags.some((tag) => tags.includes(tag))) return 1;
  if (queryLocation && locationId === queryLocation) return 0.8;
  return 0;
}

export function buildSceneMemory(request: SceneMemoryRequest): DynamicMemoryContext {
  const startedAt = Date.now();
  const audience = audienceFor(request.sceneType);
  const actorId =
    audience === "actor" || audience === "player" ? (request.actorId ?? "player") : undefined;
  const queryTags = request.queryTags ?? [];
  const maxChars = SCENE_BUDGETS[request.sceneType] ?? 3000;
  const maxRefs = SCENE_MAX_REFS[request.sceneType] ?? 16;
  const pool: { ref: MemoryReference; score: number }[] = [];
  const maxPool = maxRefs * 2;
  const candidateIds: string[] = [];
  const rejectedIds: string[] = [];
  const rejectionReasons: Record<string, string> = {};
  const recallScores: Record<string, number> = {};
  const sourceEventIds = new Set<string>();

  const pushCandidate = (
    id: string,
    kind: MemoryReference["kind"],
    week: number,
    importance: number,
    summary: string,
    sourceEventId: string | undefined,
    tags: string[],
    status: string | undefined,
    score: number,
    confidence?: number
  ) => {
    if (candidateIds.length < 1000) candidateIds.push(id);
    recallScores[id] = Number(score.toFixed(4));
    const ref = toReference(id, kind, week, importance, summary, sourceEventId, tags, status, confidence);
    if (pool.length < maxPool) {
      pool.push({ ref, score });
    } else if (score > pool[pool.length - 1].score) {
      pool[pool.length - 1] = { ref, score };
    } else {
      if (rejectedIds.length < 200) {
        rejectedIds.push(id);
        rejectionReasons[id] = "below-top-pool";
      }
      return;
    }
    pool.sort((left, right) => right.score - left.score || left.ref.id.localeCompare(right.ref.id));
    if (sourceEventId) sourceEventIds.add(sourceEventId);
  };

  const audienceStateFor = (memoryId: string) => {
    if (audience === "world") return undefined;
    const key = audience === "actor" ? `actor:${actorId}` : "player";
    return request.indexes.audienceByKey.get(key)?.get(memoryId);
  };

  // 世界事实（事件）
  const events =
    audience === "actor" && actorId
      ? (request.indexes.eventsByCharacter.get(actorId) ?? [])
          .map((eventId) => request.indexes.eventsById.get(eventId))
          .filter((event): event is MemoryEvent => Boolean(event))
      : audience === "player"
        ? [...new Set([
            ...(request.indexes.eventsByCharacter.get(actorId ?? "player") ?? []),
            ...(request.indexes.eventsByCharacter.get("player") ?? []),
          ])]
            .map((eventId) => request.indexes.eventsById.get(eventId))
            .filter((event): event is MemoryEvent => Boolean(event))
        : request.state.events;
  for (const event of events) {
    if (event.status !== "active") continue;
    const relevance = goalRelevance(event.tags, queryTags, event.locationId, request.locationId);
    const relationship = actorId && (event.participantIds.includes(actorId) || event.observerIds.includes(actorId)) ? 1 : 0;
    const score = eventActivation(event, request.currentWeek, relevance, relationship, audienceStateFor(event.id)?.recallCount ?? 0);
    pushCandidate(
      event.id,
      "event",
      event.week,
      event.importance,
      event.summary,
      event.sourceEventId,
      event.tags,
      event.status,
      score
    );
  }

  // 角色信念
  const beliefs =
    audience === "actor" && actorId
      ? (request.indexes.beliefsByCharacter.get(actorId) ?? [])
          .map((beliefId) => request.indexes.beliefsById.get(beliefId))
          .filter((belief): belief is CharacterBelief => Boolean(belief))
      : audience === "player"
        ? request.state.beliefs.filter(
            (belief) => belief.characterId === (actorId ?? "player") || belief.secrecy === "public"
          )
        : request.state.beliefs;
  for (const belief of beliefs) {
    if (!belief.active) continue;
    const relevance = goalRelevance([belief.claimType], queryTags);
    const score = beliefActivation(belief, request.currentWeek, relevance, 1, audienceStateFor(belief.id)?.recallCount ?? 0);
    pushCandidate(
      belief.id,
      "belief",
      belief.validFromWeek,
      belief.importance,
      belief.claim,
      belief.learnedFrom?.sourceId,
      [belief.claimType],
      belief.truthStatus,
      score,
      belief.confidence
    );
  }

  // 承诺
  const commitmentIds =
    audience === "actor" && actorId
      ? request.indexes.commitmentsByCharacter.get(actorId) ?? []
      : audience === "player"
        ? request.state.commitments
            .filter(
              (commitment) =>
                commitment.secrecy === "public" ||
                commitment.participantIds.includes(actorId ?? "player")
            )
            .map((commitment) => commitment.id)
        : request.state.commitments.map((commitment) => commitment.id);
  for (const commitmentId of commitmentIds) {
    const commitment = request.indexes.commitmentsById.get(commitmentId);
    if (!commitment) continue;
    if (commitment.status !== "active") continue;
    const relevance = goalRelevance([commitment.type], queryTags);
    const score = commitmentScore(commitment, request.currentWeek, relevance);
    pushCandidate(
      commitment.id,
      "commitment",
      commitment.createdWeek,
      commitment.importance,
      commitment.summary,
      commitment.sourceEventId,
      [commitment.type],
      commitment.status,
      score
    );
  }

  // 关系原因
  const relationshipIds =
    audience === "actor" && actorId
      ? (request.indexes.relationshipsByCharacter.get(actorId) ?? [])
      : audience === "player"
        ? request.state.relationshipCauses
            .filter(
              (cause) =>
                cause.fromCharacterId === (actorId ?? "player") ||
                cause.toCharacterId === (actorId ?? "player")
            )
            .map((cause) => cause.id)
        : request.state.relationshipCauses.map((cause) => cause.id);
  const seenRelationships = new Set();
  for (const relationshipId of relationshipIds) {
    if (seenRelationships.has(relationshipId)) continue;
    seenRelationships.add(relationshipId);
    const cause = request.indexes.relationshipsById.get(relationshipId);
    if (!cause) continue;
    if (!cause.active) continue;
    const score = relationshipScore(cause, request.currentWeek);
    pushCandidate(
      cause.id,
      "relationship",
      cause.createdWeek,
      Math.min(1, Math.abs(cause.delta) / 20 + 0.3),
      cause.summary,
      cause.sourceEventId,
      [cause.dimension],
      cause.delta > 0 ? "positive" : "negative",
      score
    );
  }

  // 长期计划
  const planIds =
    audience === "actor" && actorId
      ? [
          ...(request.indexes.plansByOwner.get(actorId) ?? []),
          ...(request.indexes.plansByCharacter.get(actorId) ?? []),
        ]
      : audience === "player"
        ? request.state.plans
            .filter(
              (plan) =>
                plan.secrecy === "public" ||
                plan.ownerId === (actorId ?? "player") ||
                plan.participantIds.includes(actorId ?? "player")
            )
            .map((plan) => plan.id)
        : request.state.plans.map((plan) => plan.id);
  const seenPlans = new Set();
  for (const planId of planIds) {
    if (seenPlans.has(planId)) continue;
    seenPlans.add(planId);
    const plan = request.indexes.plansById.get(planId);
    if (!plan) continue;
    if (plan.status !== "active" && plan.status !== "blocked") continue;
    const relevance = goalRelevance([plan.title, plan.status], queryTags);
    const score = planScore(plan, request.currentWeek, relevance);
    pushCandidate(
      plan.id,
      "plan",
      plan.createdWeek,
      plan.importance,
      `${plan.title}：${plan.objective}`,
      plan.sourceEventIds[0],
      [plan.title, plan.status],
      plan.status,
      score
    );
  }

  const selected: MemoryReference[] = [];
  let used = 0;
  for (const item of pool) {
    if (selected.length >= maxRefs) {
      rejectedIds.push(item.ref.id);
      rejectionReasons[item.ref.id] = "budget-max-refs";
      continue;
    }
    if (item.score < 0.2 && selected.length >= 4) {
      rejectedIds.push(item.ref.id);
      rejectionReasons[item.ref.id] = "low-activation";
      continue;
    }
    const added = item.ref.summary.length + 24;
    if (used + added > maxChars && selected.length > 0) {
      rejectedIds.push(item.ref.id);
      rejectionReasons[item.ref.id] = "budget-max-chars";
      continue;
    }
    selected.push(item.ref);
    used += added;
  }
  const selectedIds = selected.map((item) => item.id);
  const uncertainties: MemoryReference[] = beliefs
    .filter(
      (belief) =>
        belief.active &&
        (belief.truthStatus === "uncertain" || belief.truthStatus === "unknown" || belief.confidence < 0.6)
    )
    .slice(0, 5)
    .map((belief) => toReference(belief.id, "belief", belief.validFromWeek, belief.importance, belief.claim, belief.learnedFrom?.sourceId, [belief.claimType], belief.truthStatus, belief.confidence));

  const contradictions: MemoryReference[] = [];
  const bySubject = new Map<string, CharacterBelief[]>();
  for (const belief of beliefs) {
    if (!belief.active) continue;
    const key = `${belief.characterId}|${belief.subjectId}`;
    const list = bySubject.get(key) ?? [];
    list.push(belief);
    bySubject.set(key, list);
  }
  for (const list of bySubject.values()) {
    if (list.some((item) => item.truthStatus === "true") && list.some((item) => item.truthStatus === "false")) {
      contradictions.push(
        ...list.slice(0, 2).map((belief) =>
          toReference(belief.id, "belief", belief.validFromWeek, belief.importance, belief.claim, belief.learnedFrom?.sourceId, ["contradiction"], belief.truthStatus, belief.confidence)
        )
      );
    }
  }

  const context: DynamicMemoryContext = {
    sceneType: request.sceneType,
    currentWeek: request.currentWeek,
    worldFacts: selected.filter((item) => item.kind === "event"),
    actorBeliefs: selected.filter((item) => item.kind === "belief"),
    commitments: selected.filter((item) => item.kind === "commitment"),
    relationshipCauses: selected.filter((item) => item.kind === "relationship"),
    activePlans: selected.filter((item) => item.kind === "plan"),
    uncertainties,
    contradictions,
    forbiddenInferences: [...FORBIDDEN_INFERENCES],
    sourceEventIds: [...sourceEventIds],
    totalCharacters: used,
  };

  const trace: MemoryTrace = {
    sceneType: request.sceneType,
    actorId: request.actorId,
    queryTags,
    candidateIds,
    selectedIds,
    rejectedIds,
    rejectionReasons,
    recallScores,
    contextBudget: { used, max: maxChars },
    latencyMs: Date.now() - startedAt,
    sourceEventIds: [...sourceEventIds],
  };
  recordMemoryTrace(trace);
  return context;
}
