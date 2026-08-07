// 能力方案包络校验：规则层输出必须可序列化、可复现。
import { VERDICTS } from "./envelope.ts";
import type { AbilityPlanEnvelope, ProposedAbilityPlan } from "./types.ts";

export function validateAbilityPlan(plan: ProposedAbilityPlan): string[] {
  const errors: string[] = [];
  if (!plan.objective?.trim()) errors.push("missing-objective");
  if (!plan.method?.trim()) errors.push("missing-method");
  if (!Array.isArray(plan.abilityIds) || plan.abilityIds.length === 0) errors.push("missing-ability-ids");
  if (!Array.isArray(plan.proposedEffects) || plan.proposedEffects.length === 0) errors.push("missing-proposed-effects");
  return errors;
}

export function validateEnvelope(envelope: AbilityPlanEnvelope): string[] {
  const errors: string[] = [];
  if (!VERDICTS.includes(envelope.verdict)) errors.push(`invalid-verdict:${envelope.verdict}`);
  if (!Array.isArray(envelope.reasons)) errors.push("invalid-reasons");
  if (!Array.isArray(envelope.limits)) errors.push("invalid-limits");
  if (!Number.isFinite(envelope.riskAdjustment)) errors.push("invalid-risk-adjustment");
  if (envelope.verdict === "REQUIRES_PREPARATION" && envelope.requiredPreparations.length === 0) errors.push("preparation-without-items");
  if (envelope.verdict === "REQUIRES_CLARIFICATION" && envelope.clarificationQuestions.length === 0) errors.push("clarification-without-questions");
  if (envelope.verdict === "REJECT_OUTSIDE_ABILITY_DOMAIN" && envelope.reasons.length === 0) errors.push("reject-without-reason");
  return errors;
}
