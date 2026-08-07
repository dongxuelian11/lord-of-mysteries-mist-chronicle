// 轻量失控合同：确定性判定、阶段迁移、症状与状态变化。
import {
  CONTROL_ALGORITHM_VERSION,
  CONTROL_ACTION_COOLDOWN,
  RISK_CONTAINED,
  RISK_CRITICAL,
  RISK_DISTURBED,
  RISK_PARTIAL_LOSS,
  SAFE_SYMPTOM_POOL,
} from "./config.ts";
import { stableHash } from "../fate/roll.ts";
import { controlRiskScore, shouldEvaluateControl, type ControlRiskInput } from "./risk.ts";
import type { FateAberrationContract } from "../fate/types.ts";
import type { ControlStage, ControlState, LossOfControlContract } from "./types.ts";

export type ControlEvaluationInput = {
  resolutionId: string;
  actorId: string;
  saveId: string;
  riskInput: ControlRiskInput;
  controlState: ControlState;
  fateContract: FateAberrationContract;
  eligibleIndex?: number;
};

function nextStage(
  current: ControlStage,
  riskScore: number,
  roll: number,
  flags: { forcedCast: boolean; ritualFailure: boolean; fateSeverity?: 1 | 2 | 3 | 4 }
): ControlStage {
  const highRiskSource =
    flags.fateSeverity === 4 || (flags.forcedCast && riskScore >= RISK_CONTAINED) || (flags.ritualFailure && riskScore >= RISK_CONTAINED);
  if (current === "contained-loss") return "contained-loss";
  if (current === "partial-loss") return riskScore >= RISK_CONTAINED ? "contained-loss" : "critical";
  if (current === "critical") {
    return roll < Math.min(90, riskScore) ? "partial-loss" : "critical";
  }
  if (current === "disturbed") {
    if (riskScore >= RISK_PARTIAL_LOSS && roll < 70) return "partial-loss";
    return riskScore >= RISK_CRITICAL ? "critical" : "disturbed";
  }
  // stable：普通行动绝不能直接跳到 partial-loss。
  if (riskScore >= RISK_PARTIAL_LOSS && highRiskSource && roll < 50) return "partial-loss";
  if (riskScore >= RISK_CRITICAL) return "critical";
  if (riskScore >= RISK_DISTURBED) return "disturbed";
  return "stable";
}

function symptomsFor(stage: ControlStage, seed: string): string[] {
  const pool = SAFE_SYMPTOM_POOL[stage];
  if (!pool.length) return [];
  const count = stage === "disturbed" ? 2 : stage === "critical" ? 3 : stage === "partial-loss" ? 4 : 3;
  const start = stableHash(seed) % pool.length;
  const result: string[] = [];
  for (let index = 0; index < Math.min(count, pool.length); index += 1) {
    result.push(pool[(start + index) % pool.length]);
  }
  return result;
}

export function evaluateControlContract(input: ControlEvaluationInput): LossOfControlContract {
  const riskScore = controlRiskScore(input.riskInput);
  const flags = {
    backlash: input.riskInput.backlash,
    forcedCast: input.riskInput.forcedCast,
    ritualFailure: input.riskInput.ritualFailure,
    fateSeverity: input.riskInput.fateSeverity,
  };
  const shouldRoll = shouldEvaluateControl(riskScore, input.controlState.stage, flags);
  const seed = `${input.saveId}|${input.resolutionId}|${CONTROL_ALGORITHM_VERSION}`;
  const roll = stableHash(`${seed}|control-roll`) % 100;
  // contained-loss 是“已被暂时压制”：除非极端危机源再次冲垮压制，否则不反复重触发。
  const containedGuard =
    input.controlState.stage === "contained-loss" &&
    !(riskScore >= 95 && (flags.fateSeverity === 4 || flags.forcedCast));
  const actionCooldown =
    input.controlState.lastTriggerEligibleIndex !== undefined &&
    (input.eligibleIndex ?? 0) - input.controlState.lastTriggerEligibleIndex < CONTROL_ACTION_COOLDOWN;
  const triggered = shouldRoll && riskScore >= RISK_DISTURBED && !containedGuard && !actionCooldown;
  const stageBefore = input.controlState.stage;
  const stageAfter = triggered
    ? nextStage(stageBefore, riskScore, roll, flags)
    : stageBefore;
  const id = `control-${stableHash(seed).toString(16)}`;
  const symptoms = triggered ? symptomsFor(stageAfter, seed) : [];
  const stateChanges = triggered
    ? [
        { field: "pollution" as const, delta: Math.min(10, (flags.fateSeverity === 4 ? 10 : flags.fateSeverity === 3 ? 6 : flags.backlash ? 4 : 3)) },
        { field: "stability" as const, delta: -(stageAfter === "partial-loss" || stageAfter === "contained-loss" ? 6 : 4) },
        { field: "mentalLoad" as const, delta: stageAfter === "partial-loss" || stageAfter === "contained-loss" ? 10 : 5 },
      ]
    : [];
  const recoveryPlanProposals =
    stageAfter === "contained-loss"
      ? [{
          title: "压制失控并恢复",
          objective: `把角色从${stageAfter}恢复到 critical 以下`,
          currentStep: "组织监护、暂停使用能力并接受仪式治疗",
          ownerId: input.actorId,
          participantIds: [input.actorId],
          secrecy: "restricted" as const,
        }]
      : stageAfter === "critical" || stageAfter === "partial-loss"
        ? [{
            title: "降低失控风险",
            objective: "通过休整与治疗把风险压回 disturbed 以下",
            currentStep: "休息一周并暂停高风险能力",
            ownerId: input.actorId,
            participantIds: [input.actorId],
            secrecy: "restricted" as const,
          }]
        : [];
  return {
    id,
    resolutionId: input.resolutionId,
    actorId: input.actorId,
    triggered,
    stageBefore,
    stageAfter,
    riskScore,
    deterministicSeed: seed,
    eligibleIndex: input.eligibleIndex,
    symptoms,
    stateChanges,
    worldEventProposals: triggered
      ? [{ type: "control-loss", title: `失控：${stageAfter}`, detail: symptoms.join("；"), participantIds: [input.actorId], observerIds: [], visibility: "actors" as const }]
      : [],
    beliefProposals: [],
    relationshipProposals: [],
    recoveryPlanProposals,
    narrativeConstraints: [
      `结果阶段必须与“${stageAfter}”一致`,
      ...(stageAfter === "contained-loss" ? ["必须体现监护与恢复计划，不得让角色永久退场"] : []),
      "不得把失控写成普通失败，也不得把命运异常写成失控",
    ],
  };
}

export function validateControlContract(contract: LossOfControlContract): string[] {
  const errors: string[] = [];
  if (!contract.id) errors.push("missing-id");
  if (!contract.resolutionId) errors.push("missing-resolution-id");
  if (!contract.deterministicSeed.includes(contract.resolutionId)) errors.push("seed-not-bound");
  if (contract.riskScore < 0 || contract.riskScore > 100) errors.push("risk-out-of-range");
  if (!contract.triggered && contract.symptoms.length) errors.push("non-triggered-with-symptoms");
  if (contract.stageAfter === "contained-loss" && contract.recoveryPlanProposals.length === 0) errors.push("contained-loss-without-recovery-plan");
  return errors;
}
