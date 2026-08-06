// 记忆可见性：角色/玩家/世界三类视角过滤。
import type {
  ActivePlan,
  CharacterBelief,
  Commitment,
  DynamicMemoryState,
  MemoryEvent,
  RelationshipCause,
} from "./types.ts";

export type MemoryAudience = "world" | "player" | "actor";

export function visibleEvents(
  state: DynamicMemoryState,
  actorId: string | undefined,
  audience: MemoryAudience
): MemoryEvent[] {
  if (audience === "world") return state.events;
  return state.events.filter(
    (event) =>
      event.participantIds.includes(actorId ?? "") ||
      event.observerIds.includes(actorId ?? "") ||
      (audience === "player" && event.participantIds.includes("player"))
  );
}

export function visibleBeliefs(
  state: DynamicMemoryState,
  actorId: string | undefined,
  audience: MemoryAudience
): CharacterBelief[] {
  if (audience === "world") return state.beliefs;
  if (audience === "actor") return state.beliefs.filter((belief) => belief.characterId === actorId);
  return state.beliefs.filter(
    (belief) => belief.characterId === "player" || belief.secrecy === "public"
  );
}

export function visibleCommitments(
  state: DynamicMemoryState,
  actorId: string | undefined,
  audience: MemoryAudience
): Commitment[] {
  if (audience === "world") return state.commitments;
  return state.commitments.filter(
    (commitment) =>
      commitment.secrecy === "public" ||
      (actorId !== undefined && commitment.participantIds.includes(actorId))
  );
}

export function visibleRelationshipCauses(
  state: DynamicMemoryState,
  actorId: string | undefined,
  audience: MemoryAudience
): RelationshipCause[] {
  if (audience === "world") return state.relationshipCauses;
  return state.relationshipCauses.filter(
    (cause) => cause.fromCharacterId === actorId || cause.toCharacterId === actorId
  );
}

export function visiblePlans(
  state: DynamicMemoryState,
  actorId: string | undefined,
  audience: MemoryAudience
): ActivePlan[] {
  if (audience === "world") return state.plans;
  return state.plans.filter(
    (plan) =>
      plan.secrecy === "public" ||
      plan.ownerId === actorId ||
      (actorId !== undefined && plan.participantIds.includes(actorId))
  );
}
