// 记忆衰减与唤起：只影响召回激活度，不删除源事实。
import {
  ACTIVATION_WEIGHTS,
  DECAY_HORIZON_WEEKS,
  DECAY_POLICY_MULTIPLIER,
  NEVER_DECAY_IMPORTANCE_FLOOR,
  NEVER_DECAY_TYPES,
  RECALL_STATE_THRESHOLDS,
} from "./config.ts";
import type { CharacterBelief, DynamicMemoryState, MemoryEvent, RecallState } from "./types.ts";
import { markMemoryRecalled } from "./derive.ts";

export type ActivationInput = {
  importance: number;
  emotionalWeight: number;
  week: number;
  nowWeek: number;
  goalRelevance: number;
  relationshipRelevance: number;
  recallCount: number;
  neverDecay?: boolean;
  decayPolicy?: "none" | "slow" | "normal" | "fast";
};

export function activationScore(input: ActivationInput): number {
  const multiplier = DECAY_POLICY_MULTIPLIER[input.decayPolicy ?? "normal"] ?? 1;
  const rawRecency = input.neverDecay
    ? 1
    : Math.max(0, 1 - (Math.max(0, input.nowWeek - input.week) * multiplier) / DECAY_HORIZON_WEEKS);
  return (
    ACTIVATION_WEIGHTS.importance * input.importance +
    ACTIVATION_WEIGHTS.emotionalWeight * input.emotionalWeight +
    ACTIVATION_WEIGHTS.recency * rawRecency +
    ACTIVATION_WEIGHTS.goalRelevance * input.goalRelevance +
    ACTIVATION_WEIGHTS.relationshipRelevance * input.relationshipRelevance +
    ACTIVATION_WEIGHTS.rehearsalBoost * Math.min(1, input.recallCount / 5)
  );
}

export function recallState(score: number): RecallState {
  if (score >= RECALL_STATE_THRESHOLDS.active) return "active";
  if (score >= RECALL_STATE_THRESHOLDS.blurred) return "blurred";
  return "dormant";
}

export function eventNeverDecays(event: MemoryEvent): boolean {
  return (
    NEVER_DECAY_TYPES.has(event.type) ||
    event.importance >= NEVER_DECAY_IMPORTANCE_FLOOR ||
    event.tags.some((tag) => NEVER_DECAY_TYPES.has(tag))
  );
}

export function eventActivation(
  event: MemoryEvent,
  nowWeek: number,
  goalRelevance = 0,
  relationshipRelevance = 0,
  audienceRecallCount = 0
): number {
  return activationScore({
    importance: event.importance,
    emotionalWeight: event.emotionalWeight,
    week: event.week,
    nowWeek,
    goalRelevance,
    relationshipRelevance,
    recallCount: audienceRecallCount,
    neverDecay: eventNeverDecays(event),
  });
}

export function beliefActivation(
  belief: CharacterBelief,
  nowWeek: number,
  goalRelevance = 0,
  relationshipRelevance = 1,
  audienceRecallCount = 0
): number {
  return activationScore({
    importance: belief.importance,
    emotionalWeight: belief.emotionalWeight,
    week: belief.validFromWeek,
    nowWeek,
    goalRelevance,
    relationshipRelevance,
    recallCount: audienceRecallCount,
  });
}

export function rehearseBelief(
  state: DynamicMemoryState,
  beliefId: string,
  week: number
): DynamicMemoryState {
  const belief = state.beliefs.find((item) => item.id === beliefId);
  if (!belief) return state;
  // 委托给正式 recalled 提交：按受众+记忆+周幂等
  return markMemoryRecalled(state, {
    actionId: `rehearse:${beliefId}:${week}`,
    modelCallId: `rehearse:${beliefId}`,
    stage: "rehearse",
    audience: { kind: "actor", actorId: belief.characterId, affectsActivation: true },
    memoryIds: [beliefId],
    week,
  });
}
