import {
  createInitialGame,
  initializeWorldKernel,
  type ActionCausalReceipts,
  type ActionContract,
  type DirectiveExecutionPlanSnapshot,
  type DirectiveExecutionState,
  type DirectiveResourceUsage,
  type GameState,
  type PathwayId,
  type ScheduledAction,
} from "./game-model.ts";
import { emptyMemoryState, ensureAudienceStates } from "./memory/index.ts";
import { createInitialFateState, type FateAberrationState } from "./fate/index.ts";
import { createInitialControlState, type ControlState } from "./loss-of-control/index.ts";
import { migrateOrganizationManagementState, type OrganizationManagementState } from "./organization-management.ts";
import { createWorldLedger, migrateWorldLedger, type LegacyWorldLedger, type WorldLedger } from "./world-ledger.ts";
import { ensureAutonomousWorldState, type AutonomousWorldState } from "./autonomous-agents.ts";
import { ensureFactionStrategyState, type FactionStrategyState } from "./faction-strategy.ts";
import { ensureHighSequenceLedger, type HighSequenceLedger } from "./high-sequence-ledger.ts";
import { ensureCampaignWorldState, type CampaignWorldState } from "./campaign-world.ts";
import { ensureAttentionSimulationState } from "./attention-simulation.ts";

export const ACTIVE_SAVE_KEY = "mist-chronicle-complete-v21";
export const LEGACY_ACTIVE_SAVE_KEYS = Array.from(
  { length: 16 },
  (_, index) => `mist-chronicle-complete-v${20 - index}`,
) as readonly string[];
export const RECOVERY_KEY = "mist-chronicle-recovery-v21";
export const LEGACY_RECOVERY_KEYS = ["mist-chronicle-recovery-v20", "mist-chronicle-recovery-v19", "mist-chronicle-recovery-v18", "mist-chronicle-recovery-v17", "mist-chronicle-recovery-v16"] as const;
export const SAVE_SCHEMA_VERSION = 21;

export type SaveEnvelope = {
  format: "mist-chronicle-save";
  schemaVersion: 21;
  exportedAt: string;
  loreVersion: string;
  knowledgePermission: { unlockedRecords: number; highestSequence: number };
  checksum: string;
  game: GameState;
};

export type RecoveryCheckpoint = {
  id: string;
  reason: "week" | "import" | "history-branch" | "finale" | "sequence";
  createdAt: string;
  game: GameState;
};

const DEFAULT_HORIZON = {
  work: "LOTM" as const,
  maxVolume: 1,
  maxAbsoluteChapter: 195,
  allowedEventIds: [],
  revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
  worldlineMode: "canon-aligned" as const,
};

export type StoredGameMigration = {
  game: GameState;
  hasSave: boolean;
  sourceVersion: number;
  historicalOnly: boolean;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanStoredNarrative(text: string) {
  return text
    .replace(/若继续搁置[，,]\s*若继续(?:搁置|放任)[，,]\s*/g, "若继续搁置，")
    .replace(/([。！？；])\1+/g, "$1");
}

function normalizeDirectiveContract<T extends ActionContract>(contract: T): T {
  const legacyRedLines = typeof contract.redLines === "string" && contract.redLines.trim()
    ? [contract.redLines.trim()]
    : [];
  const legacyRetreat = typeof contract.retreat === "string" ? contract.retreat.trim() : "";
  const legacyBudget = Number.isFinite(contract.budget) && contract.budget >= 0 ? contract.budget : 0;
  return {
    ...contract,
    resourceCommitment: contract.resourceCommitment ?? {
      posture: "balanced",
      money: legacyBudget,
      manpower: 0,
      extraordinaryMaterials: 0,
    },
    authorization: contract.authorization ?? {
      scope: "bounded",
      redLines: legacyRedLines,
      mustEscalateWhen: [],
      retreatCondition: legacyRetreat,
    },
    requiredKnowledgeIds: contract.requiredKnowledgeIds ?? [],
    causeEventIds: contract.causeEventIds ?? [],
  } as T;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

function boundedUsage(value: Partial<DirectiveResourceUsage> | undefined): DirectiveResourceUsage {
  const amount = (candidate: unknown) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, parsed)) : 0;
  };
  return {
    ...value,
    money: amount(value?.money),
    manpower: amount(value?.manpower),
    extraordinaryMaterials: amount(value?.extraordinaryMaterials),
    spirituality: amount(value?.spirituality),
  };
}

const ACTIVE_DIRECTIVE_STATUSES = ["planned", "deferred", "partially-completed", "interrupted", "awaiting-authorization"] as const;
type ActiveDirectiveStatus = typeof ACTIVE_DIRECTIVE_STATUSES[number];
const TERMINAL_DIRECTIVE_STATUSES = new Set(["completed", "cancelled", "rejected"]);

function normalizeDirectiveExecution(
  execution: DirectiveExecutionState | undefined,
  legacyStatus: ScheduledAction["status"],
  currentWeek: number,
): DirectiveExecutionState & { status: ActiveDirectiveStatus } {
  const raw = execution as (Partial<DirectiveExecutionState> & Record<string, unknown>) | undefined;
  const requestedStatus: ActiveDirectiveStatus = typeof raw?.status === "string" && ACTIVE_DIRECTIVE_STATUSES.includes(raw.status as ActiveDirectiveStatus)
    ? raw.status as ActiveDirectiveStatus
    : ACTIVE_DIRECTIVE_STATUSES.includes(legacyStatus as ActiveDirectiveStatus)
      ? legacyStatus as ActiveDirectiveStatus
      : "planned";
  const originWeek = boundedInteger(raw?.originWeek, currentWeek, 1, Math.max(1, currentWeek));
  const nextEligibleWeek = raw?.nextEligibleWeek === null
    ? null
    : boundedInteger(raw?.nextEligibleWeek, currentWeek, 1, 1_000_000);
  return {
    ...raw,
    originWeek,
    attemptOrdinal: boundedInteger(raw?.attemptOrdinal, 0, 0, 1_000_000),
    status: requestedStatus,
    progress: boundedInteger(raw?.progress, 0, 0, 100),
    consumed: boundedUsage(raw?.consumed),
    nextEligibleWeek: requestedStatus === "awaiting-authorization" && raw?.nextEligibleWeek === undefined ? null : nextEligibleWeek,
    ...(typeof raw?.lastAttemptId === "string" ? { lastAttemptId: raw.lastAttemptId } : {}),
    ...(typeof raw?.lastReason === "string" ? { lastReason: raw.lastReason } : {}),
    consequenceEventIds: Array.isArray(raw?.consequenceEventIds) ? raw.consequenceEventIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function normalizeScheduledDirective(action: ScheduledAction, currentWeek: number): ScheduledAction | null {
  const executionStatus = action.execution?.status;
  if (action.status === "resolved" || typeof executionStatus === "string" && TERMINAL_DIRECTIVE_STATUSES.has(executionStatus)) return null;
  const contract = normalizeDirectiveContract(action);
  const execution = normalizeDirectiveExecution(action.execution, action.status, currentWeek);
  return {
    ...contract,
    status: execution.status,
    startDay: boundedInteger(action.startDay, 1, 1, 7),
    execution,
  };
}

const RESULT_EXECUTION_STATUSES = new Set([
  "executed", "limited", "deferred", "partially-completed", "interrupted",
  "awaiting-authorization", "escalation-required", "rejected",
]);

function normalizeExecutionPlan(
  plan: DirectiveExecutionPlanSnapshot,
  contract: ActionContract,
  chapterWeek: number,
): DirectiveExecutionPlanSnapshot {
  const raw = plan as Partial<DirectiveExecutionPlanSnapshot> & Record<string, unknown>;
  const participantIds = Array.isArray(raw.participantIds) ? raw.participantIds.filter((id): id is string => typeof id === "string") : [];
  const disposition = ["executed", "deferred", "partially-completed", "interrupted", "awaiting-authorization", "rejected"].includes(String(raw.disposition))
    ? raw.disposition as DirectiveExecutionPlanSnapshot["disposition"]
    : "executed";
  const nextEligibleWeek = raw.nextEligibleWeek === null
    ? null
    : boundedInteger(raw.nextEligibleWeek, chapterWeek + 1, 1, 1_000_000);
  return {
    ...raw,
    proposalId: typeof raw.proposalId === "string" ? raw.proposalId : `proposal:${chapterWeek}:${contract.id}`,
    attemptId: typeof raw.attemptId === "string" ? raw.attemptId : `attempt:${contract.id}:1`,
    executable: Boolean(raw.executable),
    participantIds,
    participantRefs: Array.isArray(raw.participantRefs) ? raw.participantRefs.filter((id): id is string => typeof id === "string") : participantIds.map((id) => id === "player" ? "player" : `actor:${id}`),
    targetRefs: Array.isArray(raw.targetRefs) ? raw.targetRefs.filter((id): id is string => typeof id === "string") : [],
    commitments: boundedUsage(raw.commitments),
    timeWindow: {
      startDay: boundedInteger(raw.timeWindow?.startDay, 1, 1, 7),
      days: boundedInteger(raw.timeWindow?.days, contract.days, 1, 7),
    },
    authorization: raw.authorization ?? contract.authorization,
    visibility: ["world", "public", "player", "actors", "factions"].includes(String(raw.visibility)) ? raw.visibility as DirectiveExecutionPlanSnapshot["visibility"] : "actors",
    holderRefs: Array.isArray(raw.holderRefs) ? raw.holderRefs.filter((id): id is string => typeof id === "string") : [],
    causeEventIds: Array.isArray(raw.causeEventIds) ? raw.causeEventIds.filter((id): id is string => typeof id === "string") : [],
    adjustments: Array.isArray(raw.adjustments) ? raw.adjustments.filter((item): item is string => typeof item === "string") : [],
    disposition,
    progressDelta: boundedInteger(raw.progressDelta, 0, 0, 100),
    remainingDays: boundedInteger(raw.remainingDays, 0, 0, Math.max(7, contract.days)),
    nextEligibleWeek,
    ...(typeof raw.interruptionReason === "string" ? { interruptionReason: raw.interruptionReason } : {}),
    ...(typeof raw.facilityId === "string" ? { facilityId: raw.facilityId } : {}),
  };
}

function normalizeCausalReceipts(value: ActionCausalReceipts | undefined): ActionCausalReceipts | undefined {
  if (!value || typeof value !== "object") return undefined;
  const normalizeList = (items: unknown) => Array.isArray(items) ? items.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 360) : "";
    if (!summary) return [];
    return [{
      id: typeof raw.id === "string" ? raw.id : `legacy-receipt:${index}`,
      summary,
      entityRefs: Array.isArray(raw.entityRefs) ? raw.entityRefs.map(String).slice(0, 12) : [],
      sourceEventIds: Array.isArray(raw.sourceEventIds) ? raw.sourceEventIds.map(String).slice(0, 12) : [],
    }];
  }) : [];
  return {
    people: normalizeList(value.people),
    resources: normalizeList(value.resources),
    locations: normalizeList(value.locations),
    knowledge: normalizeList(value.knowledge),
    relationships: normalizeList(value.relationships),
    futureCauses: normalizeList(value.futureCauses),
  };
}

/**
 * The single normalization authority for local saves and imported envelopes.
 * This function is intentionally pure with respect to its input object.
 */
export function normalizeStoredGame(input: Partial<GameState>): GameState {
  input = JSON.parse(JSON.stringify(input)) as Partial<GameState>;
  const sourceVersion = Number(input.version ?? 0);
  const pathwayId = (typeof input.pathwayId === "string" ? input.pathwayId : "seer") as PathwayId;
  let fresh: GameState;
  try {
    fresh = createInitialGame(pathwayId);
  } catch {
    fresh = createInitialGame("seer");
  }
  const legacyAbilityFields = sourceVersion > 0 && sourceVersion < SAVE_SCHEMA_VERSION
    ? {
        spirituality: Math.max(12, input.spirituality ?? 12),
        spiritualityMax: 18,
        mentalLoad: input.mentalLoad ?? 0,
        lastMeditationWeek: input.lastMeditationWeek ?? 0,
        abilityJournal: input.abilityJournal ?? [],
        hiddenWorldFacts: input.hiddenWorldFacts ?? fresh.hiddenWorldFacts,
        activeAbilityScene: input.activeAbilityScene ?? null,
        activeParticipationScene: input.activeParticipationScene ?? null,
        councilTopics: input.councilTopics ?? [],
        worldSignals: input.worldSignals ?? [],
        worldSnapshots: input.worldSnapshots ?? [],
      }
    : {};
  const base = { ...fresh, ...input, ...legacyAbilityFields, version: SAVE_SCHEMA_VERSION } as GameState;
  const management = migrateOrganizationManagementState(input.management ?? fresh.management);
  const worldKernel = input.worldKernel ?? initializeWorldKernel(base);
  const normalized: GameState = {
    ...base,
    playerOrigin: {
      ...fresh.playerOrigin,
      ...(input.playerOrigin ?? {}),
      gender: input.playerOrigin?.gender ?? "",
      age: input.playerOrigin?.age ?? "",
      organizationName: input.playerOrigin?.organizationName || input.organizationName || fresh.playerOrigin.organizationName,
      organizationKind: input.playerOrigin?.organizationKind ?? "detective",
      organizationKindLabel: input.playerOrigin?.organizationKindLabel ?? "侦探事务所",
      organizationCharter: input.playerOrigin?.organizationCharter || input.charter || fresh.playerOrigin.organizationCharter,
    },
    actingMarks: input.actingMarks ?? [],
    activeParticipationScene: input.activeParticipationScene ?? null,
    advancementProcess: input.advancementProcess ?? null,
    materials: (input.materials ?? fresh.materials).map((item) => ({
      authenticity: item.obtained ? "已确认" : "未知",
      purity: item.obtained ? 80 : 0,
      freshness: item.obtained ? 75 : 0,
      contamination: 0,
      traceRisk: 0,
      storage: item.obtained ? "组织材料柜" : "尚未入库",
      provenance: item.obtained ? item.source : "尚未建立来源链",
      ...item,
    })),
    members: (input.members ?? fresh.members).map((item) => ({
      relationshipMomentum: 0,
      personalPressure: 8,
      personalEventSignals: [],
      promises: [],
      lastRelationshipChangeWeek: 0,
      ...item,
    })),
    recruitPool: (input.recruitPool ?? fresh.recruitPool).map((item) => ({
      relationshipMomentum: 0,
      personalPressure: 5,
      personalEventSignals: [],
      promises: [],
      lastRelationshipChangeWeek: 0,
      ...item,
    })),
    departments: (input.departments ?? fresh.departments).map((item) => ({
      memberIds: [item.leadMemberId],
      capacity: 50,
      cohesion: 60,
      exposure: 10,
      backlog: 20,
      standingOrder: item.mandate,
      tensions: [],
      lastReport: "等待本周汇报",
      ...item,
    })),
    departmentReports: input.departmentReports ?? [],
    organizationIssues: input.organizationIssues ?? [],
    worldSignals: input.worldSignals ?? [],
    worldSnapshots: input.worldSnapshots ?? [],
    schedule: (input.schedule ?? [])
      .map((action) => normalizeScheduledDirective(action, input.week ?? fresh.week))
      .filter((action): action is ScheduledAction => Boolean(action)),
    worldKernel,
    attentionSimulation: ensureAttentionSimulationState(input.attentionSimulation ?? fresh.attentionSimulation),
    routeHypotheses: input.routeHypotheses ?? [],
    spatialContext: input.spatialContext ?? [],
    management,
    highSequenceLedger: ensureHighSequenceLedger(input.highSequenceLedger),
    campaignWorld: ensureCampaignWorldState(input.campaignWorld),
    chronicle: (input.chronicle ?? []).map((chapter) => ({
      ...chapter,
      results: (chapter.results ?? []).map((result) => {
        const contract = normalizeDirectiveContract(result.contract);
        const executionStatus = typeof result.executionStatus === "string" && RESULT_EXECUTION_STATUSES.has(result.executionStatus)
          ? result.executionStatus
          : "executed" as const;
        return {
          ...result,
          executionStatus,
          contract,
          ...(result.executionPlan ? { executionPlan: normalizeExecutionPlan(result.executionPlan, contract, chapter.week) } : {}),
          ...(result.causalReceipts ? { causalReceipts: normalizeCausalReceipts(result.causalReceipts) } : {}),
        };
      }),
      sections: (chapter.sections ?? []).map((section) => ({
        ...section,
        paragraphs: (section.paragraphs ?? []).map(cleanStoredNarrative),
        ...(Array.isArray(section.paragraphSources) ? {
          paragraphSources: section.paragraphSources.map((source) => ({
            receiptIds: Array.isArray(source?.receiptIds) ? source.receiptIds.filter((id): id is string => typeof id === "string").slice(0, 6) : [],
            eventIds: Array.isArray(source?.eventIds) ? source.eventIds.filter((id): id is string => typeof id === "string").slice(0, 6) : [],
          })),
        } : {}),
      })),
    })),
  };
  ensureKnowledgeHorizon(normalized);
  ensureDynamicMemory(normalized);
  ensureFateState(normalized);
  ensureControlState(normalized);
  ensureOrganizationManagement(normalized);
  ensureWorldAgents(normalized);
  ensureAttentionSimulation(normalized);
  ensureFactionStrategy(normalized);
  ensureWorldLedger(normalized);
  ensureHighSequenceState(normalized);
  ensureCampaignState(normalized);
  return normalized;
}

export function migrateStoredGame(value: unknown): StoredGameMigration | null {
  const record = recordOf(value);
  const sourceVersion = Number(record?.version ?? 0);
  if (!record || !Number.isInteger(sourceVersion) || sourceVersion < 5 || sourceVersion > SAVE_SCHEMA_VERSION) return null;
  const input = record as Partial<GameState>;
  if (sourceVersion <= 7) {
    if (!Array.isArray(input.chronicle)) return null;
    const fresh = createInitialGame("seer");
    return {
      game: normalizeStoredGame({
        ...fresh,
        chronicle: input.chronicle.map((chapter) => ({
          ...chapter,
          id: `legacy-${chapter.id}`,
          title: `旧历史分支 · ${chapter.title}`,
        })),
      }),
      hasSave: true,
      sourceVersion,
      historicalOnly: true,
    };
  }
  const legacyIdentity = sourceVersion <= 9
    ? {
        prologueComplete: true,
        playerName: "无名负责人",
        playerAddress: "会长阁下",
        nameExposure: 4,
        knownAliases: [],
        ...(sourceVersion === 8
          ? { dialogueThreads: [], councilRecords: [{ week: input.week ?? 1, status: "convened" as const, decisions: [] }] }
          : {}),
      }
    : {};
  const game = normalizeStoredGame({ ...input, ...legacyIdentity });
  return {
    game,
    hasSave: Boolean(input.prologueComplete ?? sourceVersion < 10),
    sourceVersion,
    historicalOnly: false,
  };
}

// 旧存档迁移：没有知识边界时补上保守默认（第一卷边界，不自动获得全书知识）。
export function ensureKnowledgeHorizon(game: {
  worldKernel?: { canon?: Record<string, unknown> | null };
}): void {
  const canon = game.worldKernel?.canon;
  if (!canon || !canon.knowledgeHorizon) {
    const nextCanon = {
      ...(canon ?? { mode: "anchored", deviation: 0, pivotEventIds: [] }),
      knowledgeHorizon: { ...DEFAULT_HORIZON },
    };
    if (game.worldKernel) {
      (game.worldKernel as { canon: unknown }).canon = nextCanon;
    }
  }
}

// 旧存档迁移：没有动态记忆时补空安全默认。
export function ensureDynamicMemory(game: { memory?: unknown }): void {
  if (!game.memory || typeof game.memory !== "object") {
    (game as { memory: unknown }).memory = emptyMemoryState();
    return;
  }
  const memory = game.memory as {
    audienceStates?: unknown;
    receiptLedger?: { recalledByAudience?: unknown; recalledWeeks?: unknown };
  };
  if (!Array.isArray(memory.audienceStates)) memory.audienceStates = [];
  if (!memory.receiptLedger || typeof memory.receiptLedger !== "object" || !memory.receiptLedger.recalledByAudience) {
    memory.receiptLedger = {
      recalledByAudience: {},
      recalledWeeks: memory.receiptLedger?.recalledWeeks ?? {},
    };
  }
  if (!Array.isArray((game as { abilityResolutions?: unknown }).abilityResolutions)) {
    (game as { abilityResolutions: string[] }).abilityResolutions = [];
  }
  (game as { memory: unknown }).memory = ensureAudienceStates(game.memory as never);
}

// 旧存档迁移：没有命运状态时补安全默认，并补齐字段。
export function ensureFateState(game: { fate?: unknown }): void {
  const fate = game.fate as FateAberrationState | undefined;
  if (!fate || typeof fate !== "object" || typeof fate.pressure !== "number") {
    (game as { fate: FateAberrationState }).fate = createInitialFateState();
    return;
  }
  const next: FateAberrationState = {
    version: 1,
    pressure: Math.max(0, Math.min(100, fate.pressure)),
    eligibleActionCount: Number.isFinite(fate.eligibleActionCount) ? fate.eligibleActionCount : 0,
    totalTriggers: Number.isFinite(fate.totalTriggers) ? fate.totalTriggers : 0,
    boonTriggers: Number.isFinite(fate.boonTriggers) ? fate.boonTriggers : 0,
    disasterTriggers: Number.isFinite(fate.disasterTriggers) ? fate.disasterTriggers : 0,
    lastTriggerWeek: fate.lastTriggerWeek,
    lastTriggerResolutionId: fate.lastTriggerResolutionId,
    recentTemplateIds: Array.isArray(fate.recentTemplateIds) ? fate.recentTemplateIds.slice(0, 12) : [],
    recentFateResolutionIds: Array.isArray(fate.recentFateResolutionIds) ? fate.recentFateResolutionIds.slice(0, 256) : [],
    resolvedFateAggregate: {
      count: Number.isFinite(fate.resolvedFateAggregate?.count) ? fate.resolvedFateAggregate.count : 0,
      hash: typeof fate.resolvedFateAggregate?.hash === "string" ? fate.resolvedFateAggregate.hash : "",
    },
    pendingDelayedEffects: Array.isArray(fate.pendingDelayedEffects) ? fate.pendingDelayedEffects.slice(0, 48) : [],
    severityCounts: {
      1: Number.isFinite(fate.severityCounts?.["1"]) ? fate.severityCounts["1"] : 0,
      2: Number.isFinite(fate.severityCounts?.["2"]) ? fate.severityCounts["2"] : 0,
      3: Number.isFinite(fate.severityCounts?.["3"]) ? fate.severityCounts["3"] : 0,
      4: Number.isFinite(fate.severityCounts?.["4"]) ? fate.severityCounts["4"] : 0,
    },
    severity4Count: Number.isFinite(fate.severity4Count) ? fate.severity4Count : 0,
    severity4CooldownUntilWeek: fate.severity4CooldownUntilWeek,
  };
  (game as { fate: FateAberrationState }).fate = next;
}

// 旧存档迁移：没有失控状态时补安全默认。
export function ensureControlState(game: { control?: unknown }): void {
  const control = game.control as ControlState | undefined;
  if (!control || typeof control !== "object" || typeof control.stage !== "string") {
    (game as { control: ControlState }).control = createInitialControlState();
    return;
  }
  (game as { control: ControlState }).control = {
    stability: Number.isFinite(control.stability) ? control.stability : 100,
    pollution: Number.isFinite(control.pollution) ? control.pollution : 0,
    mentalLoad: Number.isFinite(control.mentalLoad) ? control.mentalLoad : 0,
    stage: ["stable", "disturbed", "critical", "partial-loss", "contained-loss"].includes(control.stage)
      ? control.stage
      : "stable",
    recentRisk: Number.isFinite(control.recentRisk) ? control.recentRisk : 0,
    activeSymptoms: Array.isArray(control.activeSymptoms) ? control.activeSymptoms.slice(0, 8) : [],
    lastTriggerEligibleIndex: Number.isFinite(control.lastTriggerEligibleIndex) ? control.lastTriggerEligibleIndex : undefined,
    resolvedControlIds: Array.isArray(control.resolvedControlIds) ? control.resolvedControlIds.slice(0, 128) : [],
  };
}

export function ensureOrganizationManagement(game: { management?: unknown }): void {
  const current = game.management as Partial<OrganizationManagementState> | undefined;
  (game as { management: OrganizationManagementState }).management = migrateOrganizationManagementState(current);
}

export function ensureWorldLedger(game: GameState): void {
  const factionIds = new Set(game.worldKernel.factions.map((faction) => faction.id));
  const legacyHolderRef = (id: string) => id === "player" ? "player" : factionIds.has(id) ? `faction:${id}` : `actor:${id}`;
  for (const event of game.worldKernel.events) {
    event.witnessRefs = [...new Set([
      ...(event.witnessRefs ?? []),
      ...event.actorIds.map((id) => `actor:${id}`),
      ...event.factionIds.map((id) => `faction:${id}`),
    ])];
  }
  for (const observation of game.worldKernel.observations) {
    observation.holderRefs = [...new Set([
      ...(observation.holderRefs ?? []),
      ...observation.holderIds.map(legacyHolderRef),
    ])];
  }
  for (const node of game.worldKernel.knowledge) {
    node.holderRefs = [...new Set([
      ...(node.holderRefs ?? []),
      ...node.holderIds.map(legacyHolderRef),
    ])];
  }
  const current = game.worldLedger as unknown as WorldLedger | LegacyWorldLedger | undefined;
  if (!current || !Array.isArray(current.events) || !Array.isArray(current.snapshots) || !Number.isFinite(current.nextSequence)) {
    game.worldLedger = createWorldLedger(game);
  } else if (current.version === 1 || current.version === 2) {
    game.worldLedger = migrateWorldLedger(current, game);
  } else {
    game.worldLedger = createWorldLedger(game);
  }
}

export function ensureWorldAgents(game: GameState): void {
  game.worldAgents = ensureAutonomousWorldState(game.worldAgents as AutonomousWorldState | undefined, game.worldKernel);
}

export function ensureAttentionSimulation(game: GameState): void {
  game.attentionSimulation = ensureAttentionSimulationState(game.attentionSimulation);
}

export function ensureFactionStrategy(game: GameState): void {
  game.factionStrategy = ensureFactionStrategyState(game.factionStrategy as FactionStrategyState | undefined, game.management, game.worldKernel);
}

export function ensureHighSequenceState(game: { highSequenceLedger?: unknown }): void {
  (game as { highSequenceLedger: HighSequenceLedger }).highSequenceLedger = ensureHighSequenceLedger(game.highSequenceLedger as Partial<HighSequenceLedger> | undefined);
}

export function ensureCampaignState(game: { campaignWorld?: unknown }): void {
  (game as { campaignWorld: CampaignWorldState }).campaignWorld = ensureCampaignWorldState(game.campaignWorld as Partial<CampaignWorldState> | undefined);
}

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createSaveEnvelope(game: GameState): SaveEnvelope {
  const payload = JSON.stringify(game);
  return {
    format: "mist-chronicle-save",
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    loreVersion: "LOTM_Worldbuilding_Compendium_2026-08-02",
    knowledgePermission: { unlockedRecords: game.facts.length + game.evidenceNodes.filter((item) => item.discovered).length, highestSequence: game.currentSequence },
    checksum: stableHash(payload),
    game,
  };
}

export function parseSaveEnvelope(raw: string) {
  const value = JSON.parse(raw) as Partial<SaveEnvelope> & { schemaVersion?: number };
  if (value.format !== "mist-chronicle-save" || ![15, 16, 17, 18, 19, 20, SAVE_SCHEMA_VERSION].includes(value.schemaVersion ?? -1) || !value.game) throw new Error("这不是可迁移的《灰雾纪事》存档文件");
  if (stableHash(JSON.stringify(value.game)) !== value.checksum) throw new Error("存档校验失败：文件不完整或被修改");
  if (!value.game.prologueComplete || !value.game.worldKernel || !Array.isArray(value.game.chronicle)) throw new Error("存档缺少世界状态或开局记录，未覆盖当前游戏");
  value.game = normalizeStoredGame(value.game);
  value.schemaVersion = SAVE_SCHEMA_VERSION;
  return value as SaveEnvelope;
}

export function savePreview(envelope: SaveEnvelope) {
  return {
    organization: envelope.game.organizationName,
    leader: envelope.game.playerName,
    week: envelope.game.week,
    date: envelope.game.date,
    pathway: envelope.game.pathwayId,
    sequence: envelope.game.currentSequence,
    chapters: envelope.game.chronicle.length,
    exportedAt: envelope.exportedAt,
  };
}

export function downloadSave(game: GameState, prefix = "灰雾纪事") {
  const envelope = createSaveEnvelope(game);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${prefix}-第${game.week}周-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createRecoveryCheckpoint(game: GameState, reason: RecoveryCheckpoint["reason"]) {
  const current = readRecoveryCheckpoints();
  const checkpoint: RecoveryCheckpoint = { id: `recovery-${Date.now()}`, reason, createdAt: new Date().toISOString(), game };
  window.localStorage.setItem(RECOVERY_KEY, JSON.stringify([checkpoint, ...current].slice(0, 3)));
}

export function readRecoveryCheckpoints(): RecoveryCheckpoint[] {
  try {
    const raw = window.localStorage.getItem(RECOVERY_KEY) ?? LEGACY_RECOVERY_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean) ?? "[]";
    const parsed = JSON.parse(raw) as RecoveryCheckpoint[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.game?.worldKernel).slice(0, 3) : [];
  } catch {
    return [];
  }
}
