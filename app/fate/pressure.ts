// 命运压力：隐藏状态、增长与触发下降。不向玩家显示精确数字。
import {
  PRESSURE_BASE_MISS,
  PRESSURE_FORCED_CAST,
  PRESSURE_HIGH_CORRUPTION_MAX,
  PRESSURE_HIGH_RISK,
  PRESSURE_LARGE_RITUAL_BASE,
  PRESSURE_LARGE_RITUAL_MAX,
  PRESSURE_LOW_STABILITY_MAX,
  PRESSURE_MAX,
  PRESSURE_MIN,
  PRESSURE_OVERREACH_BASE,
  PRESSURE_OVERREACH_MAX,
  PRESSURE_AFTER_SEVERITY_CAP,
  PRESSURE_AMBIENT_HINTS,
  RECENT_FATE_RESOLUTION_LIMIT,
  RECENT_TEMPLATE_LIMIT,
  PENDING_DELAYED_LIMIT,
} from "./config.ts";
import type {
  FateAberrationState,
  FateRiskClass,
  FateSeverity,
  PendingDelayedEffect,
} from "./types.ts";
import { stableTextHash } from "../stable-id.ts";
import type { AbilityDefinition } from "../abilities/types.ts";
import type { AbilityIntent, ExtraordinaryState } from "../abilities/types.ts";

const clamp = (value: number) => Math.max(PRESSURE_MIN, Math.min(PRESSURE_MAX, value));

export function createInitialFateState(): FateAberrationState {
  return {
    version: 1,
    pressure: 0,
    eligibleActionCount: 0,
    totalTriggers: 0,
    boonTriggers: 0,
    disasterTriggers: 0,
    recentTemplateIds: [],
    recentFateResolutionIds: [],
    resolvedFateAggregate: { count: 0, hash: "" },
    pendingDelayedEffects: [],
    severityCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
    severity4Count: 0,
  };
}

export function riskClassFor(options: {
  definition: AbilityDefinition;
  actorState: ExtraordinaryState;
  targetState?: ExtraordinaryState & { id: string };
  intent: AbilityIntent;
  legalityAllowed: boolean;
  legalityReasons: string[];
  worldlineDiverged: boolean;
}): FateRiskClass {
  const { definition, actorState, targetState, intent, legalityAllowed, legalityReasons, worldlineDiverged } = options;
  const forcedAttempt =
    !legalityAllowed &&
    legalityReasons.some((reason) =>
      [
        "INSUFFICIENT_SPIRITUALITY",
        "INSUFFICIENT_CONCENTRATION",
        "MISSING_MEDIUM",
        "MISSING_MATERIAL",
        "PREPARATION_INCOMPLETE",
        "KNOWLEDGE_REQUIREMENT_NOT_MET",
        "RANK_GATE_BLOCKED",
        "ACTOR_INCAPACITATED",
        "LINE_OF_SIGHT_REQUIRED",
        "CONTACT_REQUIRED",
        "RITUAL_CONDITION_NOT_MET",
        "TARGET_UNAVAILABLE",
      ].includes(reason)
    );
  const highCorruption = actorState.corruption >= 40;
  const lowStability = actorState.stability <= 40;
  const rankGap = targetState ? targetState.internalRank - actorState.internalRank : 0;
  const overreach = rankGap >= 2;
  const largeRitual =
    definition.activation.action === "ritual" ||
    definition.family === "ritual" ||
    definition.family === "summoning";
  const riskSeverity =
    definition.risks.reduce((sum, risk) => sum + (risk.type === "backlash" || risk.type === "corruption" ? risk.severity : 0), 0);
  const risky = riskSeverity >= 3 || definition.family === "curse" || definition.family === "summoning";

  if (forcedAttempt || intent.acceptableRisks.includes("forced")) return "forced";
  if (
    highCorruption ||
    lowStability ||
    overreach ||
    largeRitual ||
    worldlineDiverged ||
    intent.acceptableRisks.includes("extreme")
  ) {
    return "extreme";
  }
  if (risky) return "dangerous";
  return "normal";
}

export function pressureGain(options: {
  riskClass: FateRiskClass;
  actorState: ExtraordinaryState;
  targetState?: ExtraordinaryState & { id: string };
  definition: AbilityDefinition;
  intent: AbilityIntent;
  seed: string;
  worldlineDiverged: boolean;
}): number {
  const { riskClass, actorState, targetState, definition, intent, seed, worldlineDiverged } = options;
  let gain = PRESSURE_BASE_MISS;
  if (riskClass === "dangerous") gain += PRESSURE_HIGH_RISK;
  if (riskClass === "forced") gain += PRESSURE_FORCED_CAST;
  if (riskClass === "extreme") {
    // 高污染 / 低稳定 / 越级 / 大型仪式分别叠加确定性增量。
    const corruptionDelta = Math.min(
      PRESSURE_HIGH_CORRUPTION_MAX,
      Math.max(0, Math.floor((actorState.corruption - 30) / 7))
    );
    const stabilityDelta = Math.min(
      PRESSURE_LOW_STABILITY_MAX,
      Math.max(0, Math.floor((50 - actorState.stability) / 6))
    );
    const rankGap = targetState ? Math.max(0, targetState.internalRank - actorState.internalRank) : 0;
    const overreachDelta = rankGap >= 2 ? Math.min(PRESSURE_OVERREACH_MAX, PRESSURE_OVERREACH_BASE + rankGap * 2) : 0;
    const ritualDelta =
      definition.activation.action === "ritual" || definition.family === "ritual"
        ? Math.min(PRESSURE_LARGE_RITUAL_MAX, PRESSURE_LARGE_RITUAL_BASE + intent.preparationRefs.length * 2)
        : 0;
    gain += corruptionDelta + stabilityDelta + overreachDelta + ritualDelta;
    if (worldlineDiverged) gain += 5;
  }
  // 高污染/低稳定也影响普通与危险行动。
  if (riskClass !== "extreme") {
    if (actorState.corruption >= 60) gain += 3;
    if (actorState.stability <= 25) gain += 3;
  }
  // 正确的过度准备仍让宇宙忍不住整蛊：投入越多，命运越觉得有趣。
  if (intent.preparationRefs.length >= 3) gain += 2;
  // 确定性微扰：同一风险配置下压力增长稳定可复现。
  gain += (hashNumber(seed) % 3);
  return clamp(gain);
}

function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pressureAfterTrigger(pressureBefore: number, severity: FateSeverity): number {
  return Math.min(pressureBefore, PRESSURE_AFTER_SEVERITY_CAP[severity]);
}

export function pushRecentTemplate(state: FateAberrationState, templateId: string): FateAberrationState {
  return {
    ...state,
    recentTemplateIds: [templateId, ...state.recentTemplateIds.filter((id) => id !== templateId)].slice(0, RECENT_TEMPLATE_LIMIT),
  };
}

export function pushResolvedFate(state: FateAberrationState, resolutionId: string): FateAberrationState {
  const aggregateHash = state.resolvedFateAggregate.hash
    ? stableTextHash(`${state.resolvedFateAggregate.hash}|${resolutionId}`)
    : stableTextHash(resolutionId);
  return {
    ...state,
    recentFateResolutionIds: [resolutionId, ...state.recentFateResolutionIds].slice(0, RECENT_FATE_RESOLUTION_LIMIT),
    resolvedFateAggregate: {
      count: state.resolvedFateAggregate.count + 1,
      hash: aggregateHash,
    },
  };
}

export function pushPendingDelayed(
  state: FateAberrationState,
  pending: PendingDelayedEffect[]
): FateAberrationState {
  return {
    ...state,
    pendingDelayedEffects: [...pending, ...state.pendingDelayedEffects].slice(0, PENDING_DELAYED_LIMIT),
  };
}

export function pressureAmbientHint(pressure: number): string | undefined {
  let hint: string | undefined;
  for (const item of PRESSURE_AMBIENT_HINTS) {
    if (pressure >= item.threshold) hint = item.hint;
  }
  return hint;
}
