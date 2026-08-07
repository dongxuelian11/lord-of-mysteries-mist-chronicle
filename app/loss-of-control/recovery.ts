// 恢复机制：不能一键清空，每次恢复动作花费一周并确定性降低风险。
import {
  ABSTAIN_RELIEF,
  COMPANION_RELIEF,
  CUSTODY_RELIEF,
  LEAVE_SOURCE_RELIEF,
  PURIFICATION_RELIEF,
  RECOVERY_TASK_RELIEF,
  REST_RELIEF,
  RITUAL_TREATMENT_RELIEF,
  RISK_MAX,
  STAGE_DOWNGRADE_RISK,
} from "./config.ts";
import type { ControlRecoveryAction, ControlState, ControlStage } from "./types.ts";

export const RECOVERY_RELIEF: Record<ControlRecoveryAction, number> = {
  rest: REST_RELIEF,
  abstain: ABSTAIN_RELIEF,
  companion: COMPANION_RELIEF,
  "ritual-treatment": RITUAL_TREATMENT_RELIEF,
  purification: PURIFICATION_RELIEF,
  "leave-source": LEAVE_SOURCE_RELIEF,
  custody: CUSTODY_RELIEF,
  "complete-task": RECOVERY_TASK_RELIEF,
};

export function applyRecovery(
  state: ControlState,
  week: number,
  actions: ControlRecoveryAction[]
): ControlState {
  const relief = actions.reduce((sum, action) => sum + (RECOVERY_RELIEF[action] ?? 0), 0);
  const pollutionRelief =
    (actions.includes("purification") ? 15 : 0) +
    (actions.includes("ritual-treatment") ? 8 : 0) +
    (actions.includes("custody") ? 6 : 0) +
    (actions.includes("leave-source") ? 12 : 0);
  const risk = Math.max(0, Math.min(RISK_MAX, state.recentRisk - relief));
  let stage: ControlStage = state.stage;
  if (stage === "contained-loss" && risk < STAGE_DOWNGRADE_RISK["contained-loss"]) stage = "critical";
  if (stage === "critical" && risk < STAGE_DOWNGRADE_RISK.critical) stage = "disturbed";
  if (stage === "disturbed" && risk < STAGE_DOWNGRADE_RISK.disturbed) stage = "stable";
  if (stage === "partial-loss") stage = risk < STAGE_DOWNGRADE_RISK["contained-loss"] ? "critical" : stage;
  const symptoms = stage === "stable" ? [] : state.activeSymptoms.slice(0, stage === "disturbed" ? 2 : 4);
  return {
    ...state,
    recentRisk: risk,
    stage,
    activeSymptoms: symptoms,
    mentalLoad: Math.max(0, state.mentalLoad - Math.round(relief / 2)),
    pollution: Math.max(0, state.pollution - pollutionRelief),
  };
}

export function canRecoverStage(stage: ControlStage, risk: number): boolean {
  if (stage === "contained-loss") return risk < STAGE_DOWNGRADE_RISK["contained-loss"];
  if (stage === "critical") return risk < STAGE_DOWNGRADE_RISK.critical;
  if (stage === "disturbed") return risk < STAGE_DOWNGRADE_RISK.disturbed;
  return true;
}
