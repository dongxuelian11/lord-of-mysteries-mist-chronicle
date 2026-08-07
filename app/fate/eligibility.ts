// 命运异常资格：只有真实、已确认、进入尝试阶段的非凡行动才可进入命运判定。
import type { AbilityDefinition, AbilityOutcomeContract, AbilityIntent } from "../abilities/types.ts";

const ATTEMPT_REASONS = new Set([
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
]);

export type FateEligibility = {
  eligible: boolean;
  reasons: string[];
};

export function isFateEligible(options: {
  definition: AbilityDefinition;
  contract: AbilityOutcomeContract;
  intent: AbilityIntent;
}): FateEligibility {
  const { definition, contract, intent } = options;
  const reasons: string[] = [];

  // 被动状态维护不进入命运判定。
  if (definition.activation.action === "maintained") reasons.push("passive-maintenance");
  // 完全未拥有能力且无任何尝试痕迹：普通错误输入，不触发。
  if (!contract.legality.allowed) {
    const hasAttemptReason = contract.legality.reasons.some((reason) => ATTEMPT_REASONS.has(reason));
    if (!hasAttemptReason && contract.legality.reasons.every((reason) => reason === "ABILITY_NOT_OWNED" || reason === "INVALID_TARGET")) {
      reasons.push("not-a-real-attempt");
    }
  }
  // 意图必须是实际行动而非空壳。
  if (!intent.method.trim() || !intent.objective.trim()) reasons.push("empty-intent");
  // 预览/解析阶段不会走到这里：本层只接收已生成 resolutionId 的正式合同。
  if (!contract.resolutionId) reasons.push("missing-resolution-id");

  return { eligible: reasons.length === 0, reasons };
}
