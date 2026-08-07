// 非凡能力规则引擎 MVP 类型：确定性结算、合同、成本、反制与叙事约束。

export type AbilityFamily =
  | "perception"
  | "divination"
  | "concealment"
  | "deception"
  | "mental"
  | "control"
  | "mobility"
  | "physical"
  | "transformation"
  | "protection"
  | "binding"
  | "curse"
  | "ritual"
  | "summoning"
  | "tracking"
  | "creation";

export type EffectPrimitive =
  | "DETECT"
  | "REVEAL"
  | "INFER"
  | "CONCEAL"
  | "DECEIVE"
  | "INFLUENCE"
  | "CONTROL"
  | "CREATE_CONDITION"
  | "REMOVE_CONDITION"
  | "MOVE"
  | "TRANSFORM"
  | "DAMAGE"
  | "HEAL"
  | "PROTECT"
  | "BIND"
  | "SUMMON"
  | "TRACE"
  | "CREATE_LINK"
  | "BREAK_LINK"
  | "RITUAL_EFFECT"
  | "RESOURCE_CHANGE";

export type ResultLevel =
  | "critical-success"
  | "success"
  | "partial-success"
  | "fail-with-progress"
  | "failure"
  | "backlash";

export type CostKind = "activation" | "attempt" | "success" | "maintenance" | "backlash";

export type AppliedCost = {
  kind: CostKind;
  resource: string;
  amount: number;
};

export type AppliedEffect = {
  primitive: EffectPrimitive;
  targetId?: string;
  amount?: number;
  durationWeeks?: number;
  description: string;
};

export type BlockedEffect = {
  primitive: EffectPrimitive;
  reason: string;
};

export type ConditionState = {
  id: string;
  name: string;
  kind: string;
  startWeek: number;
  durationWeeks?: number;
  severity: number;
  sourceActionId?: string;
};

export type TraceEffect = {
  type: string;
  strength: number;
  note: string;
};

export type SideEffect = {
  type: string;
  description: string;
  severity: number;
};

export type WorldEventProposal = {
  type: string;
  title: string;
  detail: string;
  participantIds: string[];
  observerIds: string[];
  visibility: "world" | "public" | "player" | "actors";
};

export type CharacterBeliefProposal = {
  characterId: string;
  subjectId: string;
  claimType: string;
  claim: string;
  truthStatus: "true" | "false" | "uncertain" | "unknown";
  confidence: number;
  propositionKey: string;
  secrecy: "public" | "restricted" | "secret";
};

export type RelationshipChangeProposal = {
  fromCharacterId: string;
  toCharacterId: string;
  dimension: "trust" | "fear" | "respect" | "resentment" | "debt" | "loyalty" | "suspicion";
  delta: number;
  summary: string;
};

export type CommitmentProposal = {
  type: "promise" | "debt" | "agreement" | "secret" | "threat" | "exchange" | "meeting";
  participantIds: string[];
  summary: string;
  secrecy: "public" | "restricted" | "secret";
};

export type ActivationRule = {
  action?: "instant" | "concentration" | "ritual" | "maintained";
  duration?: string;
  concentrationCost?: number;
};

export type RequirementRule = {
  kind: string;
  detail: string;
};

export type TargetingRule = {
  types: string[];
  minTargets: number;
  maxTargets: number;
  range?: string;
  requiresLineOfSight?: boolean;
  requiresContact?: boolean;
  requiresMedium?: boolean;
  requiresMaterial?: boolean;
  requiresKnowledge?: boolean;
  requiresPreparation?: boolean;
};

export type EffectRule = {
  primitive: EffectPrimitive;
  power: number;
  conditions?: string[];
  durationWeeks?: number;
};

export type CostRule = {
  kind: CostKind;
  resource: string;
  amount: number;
};

export type RiskRule = {
  type: "backlash" | "corruption" | "exposure" | "trace" | "injury";
  severity: number;
  condition?: string;
};

export type CounterRule = {
  id: string;
  trigger: string;
  priority: number;
  actor: "self" | "target" | "third-party";
  resourceCost?: number;
  affects: EffectPrimitive[];
  automatic?: boolean;
  exposesSelf?: boolean;
  producesEvent?: boolean;
};

export type CanonConstraint = {
  constraint: string;
  source: string;
};

export type GameAbilityParameters = {
  basePower: number;
  rangeMeters?: number;
  sightRequired?: boolean;
  contactRequired?: boolean;
  mediumRequired?: boolean;
  materialRequired?: boolean;
  knowledgeRequired?: boolean;
  preparationRequired?: boolean;
  concentrationCost?: number;
  effectCap?: number;
  note: string;
};

export type AbilityDefinition = {
  id: string;
  name: string;
  pathwayId: string;
  sequence: number;
  internalRank: number;
  family: AbilityFamily;
  tags: string[];
  activation: ActivationRule;
  requirements: RequirementRule[];
  targeting: TargetingRule;
  effects: EffectRule[];
  costs: CostRule[];
  risks: RiskRule[];
  counters: CounterRule[];
  canonConstraints: CanonConstraint[];
  gameParameters: GameAbilityParameters;
  sourceIds: string[];
};

export type AbilityResistanceProfile = {
  physical: number;
  mental: number;
  spiritual: number;
  divination: number;
  concealment: number;
  curse: number;
  control: number;
  corruption: number;
  authority: number;
};

export type ExtraordinaryState = {
  pathwayId?: string;
  sequence?: number;
  internalRank: number;
  spirituality: number;
  maxSpirituality: number;
  stability: number;
  corruption: number;
  physicalCondition: number;
  mentalCondition: number;
  concentrationSlots: number;
  occupiedConcentrationSlots: number;
  abilityMastery: Record<string, number>;
  resistances: AbilityResistanceProfile;
  activeConditions: ConditionState[];
};

export type AbilityIntent = {
  actionId: string;
  actorId: string;
  objective: string;
  requestedAbilityIds: string[];
  targetRefs: string[];
  method: string;
  preparationRefs: string[];
  mediumRefs: string[];
  materialRefs: string[];
  acceptableRisks: string[];
  retreatConditions: string[];
  secrecyRequirement?: string;
  desiredOutcome?: string;
};

export type PowerBreakdown = {
  base: number;
  mastery: number;
  information: number;
  preparation: number;
  environment: number;
  rank: number;
  penalties: number;
};

export type DefenseBreakdown = {
  resistance: number;
  passiveCounters: number;
  activeCounters: number;
  rankProtection: number;
  environment: number;
};

export type AbilityOutcomeContract = {
  actionId: string;
  resolutionId: string;
  abilityId: string;
  actorId: string;
  targetIds: string[];
  deterministicSeed: string;
  legality: { allowed: boolean; reasons: string[] };
  powerBreakdown: PowerBreakdown;
  defenseBreakdown: DefenseBreakdown;
  margin?: number;
  result: ResultLevel;
  reservedCosts: AppliedCost[];
  committedCosts: AppliedCost[];
  refundedCosts: AppliedCost[];
  appliedEffects: AppliedEffect[];
  blockedEffects: BlockedEffect[];
  createdConditions: ConditionState[];
  removedConditionIds: string[];
  worldEventProposals: WorldEventProposal[];
  beliefProposals: CharacterBeliefProposal[];
  relationshipChangeProposals: RelationshipChangeProposal[];
  commitmentProposals: CommitmentProposal[];
  tracesLeft: TraceEffect[];
  sideEffects: SideEffect[];
  narrativeConstraints: string[];
};

export type AbilitySynergyRule = {
  abilityIds: string[];
  type: "synergy" | "sequence" | "conflict" | "exclusive";
  modifier: number;
  requiredOrder?: string[];
  explanation: string;
};

export type AbilityTrace = {
  actionId: string;
  resolutionId: string;
  abilityId: string;
  legality: { allowed: boolean; reasons: string[] };
  result: ResultLevel;
  latencyMs: number;
};

// 方便内存派生用的种子类型（避免导入 memory 类型循环）
export type MemorySeedLike = {
  kind: "event" | "belief" | "commitment" | "relationship" | "plan";
  [key: string]: unknown;
};
