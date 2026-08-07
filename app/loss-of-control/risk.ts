// 风险评分：可替换策略，不建立复杂概率公式。
import {
  BACKLASH_MAX_ADD,
  BACKLASH_PER_ADD,
  FATE_SEVERITY3_ADD,
  FATE_SEVERITY4_ADD,
  FORCED_CAST_ADD,
  OVERREACH_ADD,
  RITUAL_FAILURE_ADD,
  RISK_CRITICAL,
  RISK_DISTURBED,
  RISK_MAX,
  RISK_PARTIAL_LOSS,
  SPIRITUALITY_EXHAUSTED_ADD,
  SPIRITUALITY_EXHAUSTED_THRESHOLD,
  WEIGHT_MENTAL_LOAD,
  WEIGHT_POLLUTION,
} from "./config.ts";
import type { ControlStage } from "./types.ts";

export type ControlRiskInput = {
  pollution: number;
  mentalLoad: number;
  spirituality: number;
  consecutiveBacklashes: number;
  forcedCast: boolean;
  overreach: boolean;
  ritualFailure: boolean;
  backlash: boolean;
  fateSeverity?: 1 | 2 | 3 | 4;
  restRelief: number;
  companionRelief: number;
  protectionRelief: number;
};

const clamp = (value: number) => Math.max(0, Math.min(RISK_MAX, Math.round(value)));

export function controlRiskScore(input: ControlRiskInput): number {
  const score =
    input.pollution * WEIGHT_POLLUTION +
    input.mentalLoad * WEIGHT_MENTAL_LOAD +
    (input.spirituality <= SPIRITUALITY_EXHAUSTED_THRESHOLD ? SPIRITUALITY_EXHAUSTED_ADD : 0) +
    Math.min(BACKLASH_MAX_ADD, Math.max(0, input.consecutiveBacklashes - 1) * BACKLASH_PER_ADD) +
    (input.forcedCast ? FORCED_CAST_ADD : 0) +
    (input.overreach ? OVERREACH_ADD : 0) +
    (input.ritualFailure ? RITUAL_FAILURE_ADD : 0) +
    (input.fateSeverity === 3 ? FATE_SEVERITY3_ADD : input.fateSeverity === 4 ? FATE_SEVERITY4_ADD : 0) -
    input.restRelief -
    input.companionRelief -
    input.protectionRelief;
  return clamp(score);
}

export function shouldEvaluateControl(
  riskScore: number,
  currentStage: ControlStage,
  flags: { backlash: boolean; forcedCast: boolean; ritualFailure: boolean; fateSeverity?: 1 | 2 | 3 | 4 }
): boolean {
  if (riskScore < RISK_DISTURBED) return false;
  if (riskScore >= RISK_PARTIAL_LOSS) return true;
  if (currentStage === "critical" && flags.forcedCast) return true;
  if (flags.backlash || flags.ritualFailure || (flags.fateSeverity ?? 0) >= 3) return true;
  if (riskScore >= RISK_CRITICAL && currentStage !== "stable") return true;
  return false;
}
