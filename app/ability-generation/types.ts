// 生成式能力：AI 提出轻量方案，规则层只做包络裁剪。
import type { EffectPrimitive } from "../abilities/types.ts";

export type AbilityPlanVerdict =
  | "ACCEPT"
  | "ACCEPT_WITH_LIMITS"
  | "ACCEPT_AS_IMPROVISED_EFFECT"
  | "REQUIRES_PREPARATION"
  | "REQUIRES_CLARIFICATION"
  | "REJECT_OUTSIDE_ABILITY_DOMAIN";

export type ProposedAbilityPlan = {
  objective: string;
  abilityIds: string[];
  method: string;
  proposedEffects: string[];
  usedItems: string[];
  usedKnowledge: string[];
  risks: string[];
};

export type AbilityPlanEnvelope = {
  verdict: AbilityPlanVerdict;
  reasons: string[];
  limits: string[];
  requiredPreparations: string[];
  clarificationQuestions: string[];
  suggestedEffects: EffectPrimitive[];
  improvisedEffect?: string;
  riskAdjustment: number;
};

export type AbilityPlanContext = {
  ownedAbilities: {
    id: string;
    name: string;
    family: string;
    effects: { primitive: EffectPrimitive }[];
    gameParameters?: {
      mediumRequired?: boolean;
      materialRequired?: boolean;
      knowledgeRequired?: boolean;
      preparationRequired?: boolean;
    };
  }[];
  inventoryIds: string[];
  knowledgeRefs: string[];
  spirituality: number;
  concentrationSlots: number;
  occupiedConcentrationSlots: number;
};
