// 动态长期记忆：五类结构化对象 + 存档状态 + 场景工作上下文。

export type MemoryTruth = "world-fact";
export type MemoryStatus = "active" | "superseded" | "resolved";
export type BeliefTruth = "true" | "false" | "uncertain" | "unknown";
export type BeliefSourceType =
  | "observed"
  | "told"
  | "report"
  | "deduced"
  | "rumor"
  | "memory";
export type Secrecy = "public" | "restricted" | "secret" | "cosmic";
export type MemoryCreatedBy = "deterministic-rule" | "validated-llm-proposal" | "migration";
export type RecallState = "active" | "blurred" | "dormant" | "superseded";
export type MemoryAudienceKind = "actor" | "player" | "narrator" | "world-system";

export type MemoryAudience = {
  kind: MemoryAudienceKind;
  actorId?: string;
  affectsActivation: boolean;
};

export type MemoryReceiptKind = "delivered" | "presented" | "recalled";

export type MemoryDeliveryReceipt = {
  id: string;
  actionId: string;
  modelCallId: string;
  stage: string;
  kind: MemoryReceiptKind;
  audience: MemoryAudience;
  memoryIds: string[];
  week: number;
  accepted: true;
  createdAt: string;
};

export type MemoryReceiptLedger = {
  // recalled 幂等账本（按受众）：audienceKey -> memoryId -> recalled weeks
  recalledByAudience: Record<string, Record<string, number[]>>;
  // 旧存档兼容字段（deprecated）：仅迁移读取，新代码不写入
  recalledWeeks?: Record<string, number[]>;
};

export type AudienceMemoryState = {
  memoryId: string;
  audienceKind: "actor" | "player";
  actorId?: string;
  lastPresentedWeek?: number;
  presentationCount: number;
  lastRecalledWeek?: number;
  recallCount: number;
  updatedAtWeek: number;
};

export type MemoryEvent = {
  id: string;
  sourceEventId: string;
  week: number;
  timestamp?: string;
  type: string;
  summary: string;
  participantIds: string[];
  observerIds: string[];
  locationId?: string;
  organizationIds: string[];
  importance: number;
  emotionalWeight: number;
  truthStatus: MemoryTruth;
  status: MemoryStatus;
  causeEventIds: string[];
  consequenceEventIds: string[];
  supersedes: string[];
  createdBy: MemoryCreatedBy;
  tags: string[];
};

export type CharacterBelief = {
  id: string;
  characterId: string;
  propositionKey?: string;
  subjectId: string;
  claimType: string;
  claim: string;
  confidence: number;
  truthStatus: BeliefTruth;
  learnedFrom: { type: BeliefSourceType; sourceId: string };
  validFromWeek: number;
  validUntilWeek?: number;
  secrecy: Secrecy;
  active: boolean;
  supersededBy?: string;
  contradictedBy?: string[];
  importance: number;
  emotionalWeight: number;
  lastRecalledWeek?: number;
  lastPresentedWeek?: number;
  recallCount: number;
};

export type CommitmentType =
  | "promise"
  | "debt"
  | "agreement"
  | "secret"
  | "threat"
  | "exchange"
  | "meeting";
export type CommitmentStatus = "active" | "fulfilled" | "broken" | "cancelled" | "expired";

export type Commitment = {
  id: string;
  type: CommitmentType;
  debtorId?: string;
  creditorId?: string;
  participantIds: string[];
  summary: string;
  createdWeek: number;
  dueWeek?: number;
  status: CommitmentStatus;
  sourceEventId: string;
  resolvedByEventId?: string;
  importance: number;
  secrecy: Secrecy;
};

export type RelationshipDimension =
  | "trust"
  | "fear"
  | "respect"
  | "resentment"
  | "debt"
  | "loyalty"
  | "suspicion";
export type DecayPolicy = "none" | "slow" | "normal" | "fast";

export type RelationshipCause = {
  id: string;
  sourceEventId: string;
  fromCharacterId: string;
  toCharacterId: string;
  dimension: RelationshipDimension;
  delta: number;
  summary: string;
  createdWeek: number;
  active: boolean;
  decayPolicy: DecayPolicy;
  supersededBy?: string;
};

export type PlanStatus = "active" | "blocked" | "completed" | "failed" | "abandoned";

export type ActivePlan = {
  id: string;
  sourcePlanId?: string;
  ownerId: string;
  participantIds: string[];
  title: string;
  objective: string;
  currentStep: string;
  createdWeek: number;
  dueWeek?: number;
  status: PlanStatus;
  dependencyIds: string[];
  blockerIds: string[];
  sourceEventIds: string[];
  secrecy: Secrecy;
  importance: number;
};

export type DynamicMemoryState = {
  version: number;
  events: MemoryEvent[];
  beliefs: CharacterBelief[];
  commitments: Commitment[];
  relationshipCauses: RelationshipCause[];
  plans: ActivePlan[];
  audienceStates: AudienceMemoryState[];
  receipts: MemoryDeliveryReceipt[];
  receiptLedger: MemoryReceiptLedger;
};

export type MemorySeed =
  | {
      kind: "event";
      sourceEventId: string;
      week: number;
      timestamp?: string;
      type: string;
      summary: string;
      participantIds: string[];
      observerIds: string[];
      locationId?: string;
      organizationIds?: string[];
      importance?: number;
      emotionalWeight?: number;
      status?: MemoryStatus;
      causeEventIds?: string[];
      consequenceEventIds?: string[];
      supersedes?: string[];
      tags?: string[];
      createdBy?: MemoryCreatedBy;
    }
  | {
      kind: "belief";
      characterId: string;
      propositionKey?: string;
      subjectId: string;
      claimType: string;
      claim: string;
      confidence: number;
      truthStatus: BeliefTruth;
      learnedFrom: { type: BeliefSourceType; sourceId: string };
      validFromWeek: number;
      secrecy?: Secrecy;
      importance?: number;
      emotionalWeight?: number;
      supersedes?: string;
      contradictedBy?: string[];
      createdBy?: MemoryCreatedBy;
    }
  | {
      kind: "commitment";
      id: string;
      type: CommitmentType;
      debtorId?: string;
      creditorId?: string;
      participantIds: string[];
      summary: string;
      createdWeek: number;
      dueWeek?: number;
      status?: CommitmentStatus;
      sourceEventId: string;
      resolvedByEventId?: string;
      importance?: number;
      secrecy?: Secrecy;
    }
  | {
      kind: "relationship";
      sourceEventId: string;
      fromCharacterId: string;
      toCharacterId: string;
      dimension: RelationshipDimension;
      delta: number;
      summary: string;
      createdWeek: number;
      decayPolicy?: DecayPolicy;
      active?: boolean;
    }
  | {
      kind: "plan";
      id: string;
      sourcePlanId?: string;
      ownerId: string;
      participantIds: string[];
      title: string;
      objective: string;
      currentStep: string;
      createdWeek: number;
      dueWeek?: number;
      status: PlanStatus;
      dependencyIds?: string[];
      blockerIds?: string[];
      sourceEventIds?: string[];
      secrecy?: Secrecy;
      importance?: number;
    };

export type MemoryChange =
  | { kind: "event"; id: string; action: "created" | "superseded" }
  | { kind: "belief"; id: string; action: "created" | "superseded" }
  | { kind: "commitment"; id: string; action: "created" | "updated" | "resolved" }
  | { kind: "relationship"; id: string; action: "created" | "superseded" }
  | { kind: "plan"; id: string; action: "created" | "updated" }
  | { kind: "rejected"; reason: string };

export type MemoryReference = {
  id: string;
  kind: "event" | "belief" | "commitment" | "relationship" | "plan";
  week: number;
  importance: number;
  summary: string;
  confidence?: number;
  sourceEventId?: string;
  tags: string[];
  status?: string;
};

export type SceneType =
  | "dialogue"
  | "council"
  | "investigation"
  | "action"
  | "world"
  | "player";

export type DynamicMemoryContext = {
  sceneType: SceneType;
  currentWeek: number;
  worldFacts: MemoryReference[];
  actorBeliefs: MemoryReference[];
  commitments: MemoryReference[];
  relationshipCauses: MemoryReference[];
  activePlans: MemoryReference[];
  uncertainties: MemoryReference[];
  contradictions: MemoryReference[];
  forbiddenInferences: string[];
  sourceEventIds: string[];
  totalCharacters: number;
};

export type MemoryTrace = {
  sceneType: SceneType;
  actorId?: string;
  queryTags: string[];
  candidateIds: string[];
  selectedIds: string[];
  rejectedIds: string[];
  rejectionReasons: Record<string, string>;
  recallScores: Record<string, number>;
  contextBudget: { used: number; max: number };
  latencyMs: number;
  sourceEventIds: string[];
};

export type MemoryRegistry = {
  characterIds: Set<string>;
  organizationIds: Set<string>;
};
