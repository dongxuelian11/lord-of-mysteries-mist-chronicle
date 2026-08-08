import type { GameState } from "./game-model.ts";
import { emptyMemoryState, ensureAudienceStates } from "./memory/index.ts";
import { createInitialFateState, type FateAberrationState } from "./fate/index.ts";
import { createInitialControlState, type ControlState } from "./loss-of-control/index.ts";
import { migrateOrganizationManagementState, type OrganizationManagementState } from "./organization-management.ts";
import { createWorldLedger, type WorldLedger } from "./world-ledger.ts";
import { ensureAutonomousWorldState, type AutonomousWorldState } from "./autonomous-agents.ts";
import { ensureFactionStrategyState, type FactionStrategyState } from "./faction-strategy.ts";
import { ensureHighSequenceLedger, type HighSequenceLedger } from "./high-sequence-ledger.ts";
import { ensureCampaignWorldState, type CampaignWorldState } from "./campaign-world.ts";

export const ACTIVE_SAVE_KEY = "mist-chronicle-complete-v21";
export const LEGACY_ACTIVE_SAVE_KEYS = ["mist-chronicle-complete-v20", "mist-chronicle-complete-v19", "mist-chronicle-complete-v18", "mist-chronicle-complete-v17", "mist-chronicle-complete-v16"] as const;
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
  const current = game.worldLedger as WorldLedger | undefined;
  if (!current || current.version !== 1 || !Array.isArray(current.events) || !Array.isArray(current.snapshots) || !Number.isFinite(current.nextSequence)) {
    game.worldLedger = createWorldLedger(game);
  }
}

export function ensureWorldAgents(game: GameState): void {
  game.worldAgents = ensureAutonomousWorldState(game.worldAgents as AutonomousWorldState | undefined, game.worldKernel);
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
  ensureKnowledgeHorizon(value.game);
  ensureDynamicMemory(value.game);
  ensureFateState(value.game);
  ensureControlState(value.game);
  ensureOrganizationManagement(value.game);
  ensureWorldAgents(value.game);
  ensureFactionStrategy(value.game);
  ensureWorldLedger(value.game);
  ensureHighSequenceState(value.game);
  ensureCampaignState(value.game);
  value.game.activeParticipationScene = value.game.activeParticipationScene ?? null;
  value.game.version = 21;
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
