// 轻量失控框架：MVP 只建立可支撑真实游玩的基础机制，不建立最终完整体系。
import type {
  ActivePlanProposal,
} from "../fate/types.ts";
import type {
  CharacterBeliefProposal,
  RelationshipChangeProposal,
  WorldEventProposal,
} from "../abilities/types.ts";

export type ControlStage = "stable" | "disturbed" | "critical" | "partial-loss" | "contained-loss";

export type ControlState = {
  stability: number;
  pollution: number;
  mentalLoad: number;
  stage: ControlStage;
  recentRisk: number;
  activeSymptoms: string[];
  lastTriggerEligibleIndex?: number;
  resolvedControlIds: string[];
};

export type AppliedStateChange = {
  field: "stability" | "pollution" | "mentalLoad";
  delta: number;
};

export type LossOfControlContract = {
  id: string;
  resolutionId: string;
  actorId: string;
  triggered: boolean;
  stageBefore: ControlStage;
  stageAfter: ControlStage;
  riskScore: number;
  deterministicSeed: string;
  eligibleIndex?: number;
  symptoms: string[];
  stateChanges: AppliedStateChange[];
  worldEventProposals: WorldEventProposal[];
  beliefProposals: CharacterBeliefProposal[];
  relationshipProposals: RelationshipChangeProposal[];
  recoveryPlanProposals: ActivePlanProposal[];
  narrativeConstraints: string[];
};

export type ControlRecoveryAction =
  | "rest"
  | "abstain"
  | "companion"
  | "ritual-treatment"
  | "purification"
  | "leave-source"
  | "custody"
  | "complete-task";
