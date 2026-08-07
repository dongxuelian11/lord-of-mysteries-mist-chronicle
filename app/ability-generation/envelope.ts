// 能力方案包络：把规则层裁剪结果组装成可校验的轻量信封。
import type { AbilityPlanEnvelope, AbilityPlanVerdict } from "./types.ts";

export const VERDICTS: AbilityPlanVerdict[] = [
  "ACCEPT",
  "ACCEPT_WITH_LIMITS",
  "ACCEPT_AS_IMPROVISED_EFFECT",
  "REQUIRES_PREPARATION",
  "REQUIRES_CLARIFICATION",
  "REJECT_OUTSIDE_ABILITY_DOMAIN",
];

export function buildEnvelope(input: Partial<AbilityPlanEnvelope> & { verdict: AbilityPlanVerdict }): AbilityPlanEnvelope {
  return {
    reasons: [],
    limits: [],
    requiredPreparations: [],
    clarificationQuestions: [],
    suggestedEffects: [],
    riskAdjustment: 0,
    ...input,
  };
}
