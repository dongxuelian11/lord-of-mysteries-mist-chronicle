// 确定性结算：稳定种子 → 强度 → 对抗 → 六级结果 → OutcomeContract。
import {
  ACTION_POWER_WEIGHTS,
  MASTERY_BONUS_CAP,
  RESULT_THRESHOLDS,
  VARIANCE_RANGE,
} from "./config.ts";
import { buildCosts } from "./costs.ts";
import { resolveCounters } from "./counters.ts";
import { checkLegality } from "./legality.ts";
import { preparationBonus } from "./preparation.ts";
import { leverageAvailable, rankGap } from "./rank.ts";
import { recordAbilityTrace } from "./trace.ts";
import type {
  AbilityDefinition,
  AbilityIntent,
  AbilityOutcomeContract,
  ExtraordinaryState,
  ResultLevel,
} from "./types.ts";
import { stableEntityId } from "../stable-id.ts";

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicVariance(seed: string): number {
  const value = (stableHash(seed) % 1000) / 1000;
  return VARIANCE_RANGE[0] + value * (VARIANCE_RANGE[1] - VARIANCE_RANGE[0]);
}

function resultLevel(margin: number, rankGapBlocked: boolean, backlashRisk: number): ResultLevel {
  if (rankGapBlocked) return "failure";
  if (margin < -5 && backlashRisk > 0) return "backlash";
  for (const threshold of RESULT_THRESHOLDS) {
    if (margin >= threshold.minMargin) return threshold.level;
  }
  return "failure";
}

export type ResolveOptions = {
  definition: AbilityDefinition;
  actorState: ExtraordinaryState;
  targetStates: (ExtraordinaryState & { id: string; available?: boolean })[];
  intent: AbilityIntent;
  seed: string;
  environmentRefs: string[];
  activeCounterIds: string[];
  environmentProtection: number;
  targetInjured: boolean;
  mastery: number;
};

export function resolveAbility(options: ResolveOptions): AbilityOutcomeContract {
  const startedAt = Date.now();
  const { definition, actorState, intent, seed } = options;
  const legality = checkLegality(definition, actorState, intent, options.targetStates.length);
  const resolutionId = stableEntityId("res", seed);

  const prep = preparationBonus(intent.preparationRefs, options.environmentRefs);
  const leverage = leverageAvailable(
    intent.preparationRefs,
    intent.mediumRefs,
    options.environmentRefs,
    options.targetInjured
  );
  const targetRank = options.targetStates.length
    ? Math.max(...options.targetStates.map((target) => target.internalRank))
    : actorState.internalRank;
  const gap = rankGap(actorState.internalRank, targetRank, leverage);
  const counters = resolveCounters({
    definition,
    resistances: options.targetStates[0]?.resistances ?? actorState.resistances,
    targetRank,
    actorRank: actorState.internalRank,
    activeCounterIds: options.activeCounterIds,
    environmentProtection: options.environmentProtection,
  });

  const mastery = Math.min(MASTERY_BONUS_CAP, options.mastery);
  const penalties =
    Math.max(0, 100 - actorState.physicalCondition) / 25 +
    Math.max(0, 100 - actorState.mentalCondition) / 25 +
    actorState.corruption / 40 +
    (gap.degraded && !gap.hasLeverage ? 3 : 0);

  const powerBreakdown = {
    base: definition.gameParameters.basePower,
    mastery: Math.round(mastery * ACTION_POWER_WEIGHTS.mastery * 10) / 10,
    information: Math.round(prep.information * ACTION_POWER_WEIGHTS.information * 10) / 10,
    preparation: Math.round(prep.preparation * ACTION_POWER_WEIGHTS.preparation * 10) / 10,
    environment: Math.round(prep.environment * ACTION_POWER_WEIGHTS.environment * 10) / 10,
    rank: Math.round((actorState.internalRank - (targetRank - actorState.internalRank)) * ACTION_POWER_WEIGHTS.rank),
    penalties: Math.round(penalties * ACTION_POWER_WEIGHTS.penalties * 10) / 10,
  };
  const defenseBreakdown = counters.breakdown;
  const actionPower =
    powerBreakdown.base +
    powerBreakdown.mastery +
    powerBreakdown.information +
    powerBreakdown.preparation +
    powerBreakdown.environment +
    powerBreakdown.rank +
    powerBreakdown.penalties;
  const defensePower =
    defenseBreakdown.resistance +
    defenseBreakdown.passiveCounters +
    defenseBreakdown.activeCounters +
    defenseBreakdown.rankProtection +
    defenseBreakdown.environment;
  const variance = deterministicVariance(seed);
  const margin = actionPower - defensePower + variance;
  const backlashRisk = definition.risks
    .filter((risk) => risk.type === "backlash" || risk.type === "corruption")
    .reduce((sum, risk) => sum + risk.severity, 0);
  const result = legality.allowed ? resultLevel(margin, gap.blocked, backlashRisk) : "failure";

  const reserved = buildCosts(definition);
  const committed =
    result === "failure" || result === "fail-with-progress"
      ? reserved.filter((cost) => cost.kind === "activation" || cost.kind === "attempt")
      : result === "backlash"
        ? reserved
        : reserved.filter((cost) => cost.kind !== "backlash");
  const refunded = reserved.filter(
    (cost) => !committed.some((item) => item.kind === cost.kind && item.resource === cost.resource)
  );

  const effectCap = Math.max(1, definition.gameParameters.effectCap ?? definition.effects.length);
  const blockedEffects =
    !legality.allowed || result === "failure" || result === "backlash" || gap.blocked
      ? definition.effects.map((effect) => ({
          primitive: effect.primitive,
          reason: !legality.allowed
            ? legality.reasons[0] ?? "ILLEGAL"
            : gap.blocked
              ? "RANK_GATE_BLOCKED"
              : result === "backlash"
                ? "BACKLASH"
                : "FAILURE",
        }))
      : result === "partial-success"
        ? definition.effects.slice(effectCap).map((effect) => ({
            primitive: effect.primitive,
            reason: "PARTIAL_SUCCESS_CAP",
          }))
        : [];
  const appliedEffects =
    !legality.allowed || result === "failure" || result === "backlash" || gap.blocked
      ? []
      : definition.effects
          .slice(0, result === "partial-success" ? effectCap : definition.effects.length)
          .map((effect) => ({
            primitive: effect.primitive,
            amount: effect.power,
            durationWeeks: effect.durationWeeks,
            description: `${definition.name}：${effect.primitive}`,
          }));

  const tracesLeft =
    result === "failure" || result === "backlash"
      ? [{ type: "ritual-trace", strength: 2 + (result === "backlash" ? 2 : 0), note: definition.name }]
      : [];
  const sideEffects =
    result === "backlash"
      ? [
          {
            type: "backlash",
            description: `反噬：${definition.name}引发${definition.risks.some((risk) => risk.type === "corruption") ? "污染与" : ""}失控风险`,
            severity: backlashRisk,
          },
        ]
      : [];

  const contract: AbilityOutcomeContract = {
    actionId: intent.actionId,
    resolutionId,
    abilityId: definition.id,
    actorId: intent.actorId,
    targetIds: options.targetStates.map((target) => target.id),
    deterministicSeed: seed,
    legality,
    powerBreakdown,
    defenseBreakdown,
    margin: Number(margin.toFixed(2)),
    result,
    reservedCosts: reserved,
    committedCosts: committed,
    refundedCosts: refunded,
    appliedEffects,
    blockedEffects,
    createdConditions: [],
    removedConditionIds: [],
    worldEventProposals: [],
    beliefProposals: [],
    relationshipChangeProposals: [],
    commitmentProposals: [],
    tracesLeft,
    sideEffects,
    narrativeConstraints: [
      `结果等级必须与“${result}”一致`,
      ...committed.map((cost) => `必须体现已支付代价：${cost.resource} ${cost.amount}`),
      ...(blockedEffects.length ? ["不得表现被阻断的效果"] : []),
      ...definition.canonConstraints.map((item) => item.constraint),
    ],
  };
  recordAbilityTrace({
    actionId: intent.actionId,
    resolutionId,
    abilityId: definition.id,
    legality,
    result,
    latencyMs: Date.now() - startedAt,
  });
  return contract;
}
