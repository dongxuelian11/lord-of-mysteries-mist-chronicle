// OutcomeContract 校验：可复现、可审计、schema 完整性。
import type { AbilityOutcomeContract } from "./types.ts";

export function validateContract(contract: AbilityOutcomeContract): string[] {
  const errors: string[] = [];
  if (!contract.actionId) errors.push("missing-actionId");
  if (!contract.resolutionId) errors.push("missing-resolutionId");
  if (!contract.abilityId) errors.push("missing-abilityId");
  if (!contract.actorId) errors.push("missing-actorId");
  if (!contract.deterministicSeed) errors.push("missing-seed");
  if (!contract.legality || typeof contract.legality.allowed !== "boolean") errors.push("invalid-legality");
  if (!["critical-success", "success", "partial-success", "fail-with-progress", "failure", "backlash"].includes(contract.result)) {
    errors.push("invalid-result");
  }
  if (!Array.isArray(contract.committedCosts) || !Array.isArray(contract.refundedCosts)) errors.push("invalid-costs");
  if (!Array.isArray(contract.appliedEffects) || !Array.isArray(contract.blockedEffects)) errors.push("invalid-effects");
  if (contract.legality?.allowed === false && contract.appliedEffects.length) errors.push("effects-on-illegal");
  if (contract.result === "failure" && contract.appliedEffects.length) errors.push("failure-applies-effects");
  return errors;
}
