// 承诺/关系/计划的确定性激活评分。
import { DECAY_HORIZON_WEEKS } from "./config.ts";
import type { ActivePlan, Commitment, RelationshipCause } from "./types.ts";

function recency(week: number, nowWeek: number): number {
  return Math.max(0, 1 - Math.max(0, nowWeek - week) / DECAY_HORIZON_WEEKS);
}

export function commitmentScore(commitment: Commitment, nowWeek: number, goalRelevance: number): number {
  const dueUrgency = commitment.dueWeek !== undefined && nowWeek >= commitment.dueWeek - 2 ? 0.3 : 0;
  return (
    0.45 * commitment.importance +
    0.25 * recency(commitment.createdWeek, nowWeek) +
    0.2 * goalRelevance +
    dueUrgency
  );
}

export function relationshipScore(cause: RelationshipCause, nowWeek: number): number {
  const magnitude = Math.min(1, Math.abs(cause.delta) / 30);
  const noDecay = cause.decayPolicy === "none" ? 0.25 : 0;
  const decayFactor = cause.decayPolicy === "none" ? 1 : cause.decayPolicy === "slow" ? 0.7 : 0.4;
  return 0.35 * magnitude + 0.25 * noDecay + 0.4 * recency(cause.createdWeek, nowWeek) * decayFactor;
}

export function planScore(plan: ActivePlan, nowWeek: number, goalRelevance: number): number {
  const blocked = plan.status === "blocked" ? 0.15 : 0;
  return 0.4 * plan.importance + 0.25 * recency(plan.createdWeek, nowWeek) + 0.2 * goalRelevance + blocked;
}

export function beliefActivationScore(belief: { importance: number; emotionalWeight: number; validFromWeek: number; recallCount: number }, nowWeek: number, goalRelevance: number): number {
  return (
    0.3 * belief.importance +
    0.2 * belief.emotionalWeight +
    0.15 * recency(belief.validFromWeek, nowWeek) +
    0.15 * goalRelevance +
    0.1 * 1 +
    0.1 * Math.min(1, belief.recallCount / 5)
  );
}
