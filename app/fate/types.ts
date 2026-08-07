// 命运失控机制：类型定义。
// 正常能力规则与命运异常严格分离；命运层只读取能力合同，不修改结算。
import type {
  AbilityFamily,
  CharacterBeliefProposal,
  CommitmentProposal,
  EffectPrimitive,
  RelationshipChangeProposal,
  ResultLevel,
  WorldEventProposal,
} from "../abilities/types.ts";

export type FatePolarity = "boon" | "disaster";
export type FateTwist = "pure" | "cursed-boon" | "fortunate-disaster" | "full-disaster";
export type FateSeverity = 1 | 2 | 3 | 4;
export type FateRiskClass = "normal" | "dangerous" | "forced" | "extreme";

export type FateConditionKind =
  | "high-pressure"
  | "high-risk"
  | "forced-cast"
  | "high-corruption"
  | "low-stability"
  | "rank-overreach"
  | "large-ritual"
  | "worldline-diverged"
  | "over-prepared"
  | "rare-coincidence";

export type FateCondition = {
  kind: FateConditionKind;
  min?: number;
  max?: number;
};

// 结构化“错位”效果：目标/身份/受众/时间/地点/权威/因果错位等。
export type FateTwistEffectKind =
  | "scene-absurdity"
  | "misplaced-target"
  | "misplaced-identity"
  | "misplaced-audience"
  | "misplaced-time"
  | "misplaced-location"
  | "authority-misplacement"
  | "new-debt"
  | "long-term-belief"
  | "organization-relation"
  | "new-plan"
  | "worldline-shift"
  | "absurd-opportunity"
  | "mystic-signature"
  | "misplaced-item"
  | "misinterpreted-answer"
  | "resource-phenomenon";

export type FateImmediateEffect = {
  kind: FateTwistEffectKind;
  description: string;
  targetId?: string;
};

export type FateDelayedEffect = {
  id: string;
  dueWeek: number;
  kind: FateTwistEffectKind;
  description: string;
  worldEventTitle: string;
};

export type TemplateDelayedEffect = Omit<FateDelayedEffect, "dueWeek"> & {
  inWeeks: number;
};

export type FateRecoveryHook = {
  kind: "plan" | "commitment" | "investigation" | "bargain" | "rumor" | "identity-claim" | "cleanup" | "embrace";
  title: string;
  objective: string;
  detail: string;
};

export type ActivePlanProposal = {
  title: string;
  objective: string;
  currentStep: string;
  ownerId: string;
  participantIds: string[];
  dueWeek?: number;
  secrecy: "public" | "restricted" | "secret";
};

export type FateAberrationTemplate = {
  id: string;
  title: string;
  families: AbilityFamily[];
  primitives?: EffectPrimitive[];
  polarity: FatePolarity;
  twist: FateTwist;
  severity: FateSeverity;
  compatibleNormalResults: ResultLevel[];
  prerequisites: FateCondition[];
  forbiddenConditions: FateCondition[];
  immediateEffects: FateImmediateEffect[];
  delayedEffects: TemplateDelayedEffect[];
  worldEventProposals: WorldEventProposal[];
  beliefProposals: CharacterBeliefProposal[];
  relationshipProposals: RelationshipChangeProposal[];
  commitmentProposals: CommitmentProposal[];
  planProposals: ActivePlanProposal[];
  pressureAfterTrigger?: number;
  narrativePremise: string;
  narrativeConstraints: string[];
  recoveryHooks: FateRecoveryHook[];
  sourceType: "game-original-fate-template";
  absurdityScore: number;
  longTermConsequenceScore: number;
  recoverabilityScore: number;
};

export type PendingDelayedEffect = FateDelayedEffect & {
  fateId: string;
  templateId: string;
  sourceEventId: string;
};

export type FateResolvedAggregate = {
  count: number;
  hash: string;
};

export type FateAberrationState = {
  version: 1;
  pressure: number;
  eligibleActionCount: number;
  totalTriggers: number;
  boonTriggers: number;
  disasterTriggers: number;
  lastTriggerWeek?: number;
  lastTriggerResolutionId?: string;
  lastTriggerEligibleIndex?: number;
  lastSeverity3Week?: number;
  recentTemplateIds: string[];
  recentFateResolutionIds: string[];
  resolvedFateAggregate: FateResolvedAggregate;
  pendingDelayedEffects: PendingDelayedEffect[];
  severityCounts: Record<"1" | "2" | "3" | "4", number>;
  severity4Count: number;
  severity4CooldownUntilWeek?: number;
};

export type FateAberrationContract = {
  fateId: string;
  resolutionId: string;
  algorithmVersion: string;
  deterministicSeed: string;
  eligible: boolean;
  eligibilityReasons: string[];
  pressureBefore: number;
  pressureAfter: number;
  fateRoll: number;
  polarityRoll?: number;
  severityRoll?: number;
  templateRoll?: number;
  triggered: boolean;
  polarity?: FatePolarity;
  twist?: FateTwist;
  severity?: FateSeverity;
  templateId?: string;
  templateTitle?: string;
  normalAbilityResult: ResultLevel;
  immediateEffects: FateImmediateEffect[];
  delayedEffects: FateDelayedEffect[];
  worldEventProposals: WorldEventProposal[];
  beliefProposals: CharacterBeliefProposal[];
  relationshipProposals: RelationshipChangeProposal[];
  commitmentProposals: CommitmentProposal[];
  planProposals: ActivePlanProposal[];
  recoveryHooks: FateRecoveryHook[];
  narrativePremise?: string;
  narrativeConstraints: string[];
  invariants: string[];
};

export type FateTrace = {
  fateId: string;
  resolutionId: string;
  eligible: boolean;
  triggered: boolean;
  pressureBefore: number;
  pressureAfter: number;
  templateId?: string;
  severity?: FateSeverity;
  latencyMs: number;
};
