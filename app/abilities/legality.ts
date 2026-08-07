// 硬门槛合法性：先于任何概率判定，返回结构化原因。
import type { AbilityDefinition, AbilityIntent, ExtraordinaryState } from "./types.ts";

export type LegalityResult = { allowed: boolean; reasons: string[] };

export function checkLegality(
  definition: AbilityDefinition,
  state: ExtraordinaryState,
  intent: AbilityIntent,
  targetCount: number
): LegalityResult {
  const reasons: string[] = [];
  const g = definition.gameParameters;
  if (state.pathwayId && definition.pathwayId !== state.pathwayId) reasons.push("ABILITY_NOT_OWNED");
  if (definition.sequence > (state.sequence ?? 9)) reasons.push("ABILITY_NOT_OWNED");
  if (state.spirituality <= 0) reasons.push("INSUFFICIENT_SPIRITUALITY");
  if (g.concentrationCost && state.concentrationSlots - state.occupiedConcentrationSlots < g.concentrationCost) {
    reasons.push("INSUFFICIENT_CONCENTRATION");
  }
  if (targetCount < definition.targeting.minTargets) reasons.push("INVALID_TARGET");
  if (targetCount > definition.targeting.maxTargets) reasons.push("INVALID_TARGET");
  if (g.sightRequired && !intent.preparationRefs.includes("sight-confirmed")) reasons.push("LINE_OF_SIGHT_REQUIRED");
  if (g.contactRequired && !intent.method.includes("接触")) reasons.push("CONTACT_REQUIRED");
  if (g.mediumRequired && !intent.mediumRefs.length) reasons.push("MISSING_MEDIUM");
  if (g.materialRequired && !intent.materialRefs.length) reasons.push("MISSING_MATERIAL");
  if (g.knowledgeRequired && !intent.preparationRefs.some((ref) => ref.startsWith("knowledge:"))) {
    reasons.push("KNOWLEDGE_REQUIREMENT_NOT_MET");
  }
  if (g.preparationRequired && !intent.preparationRefs.length) reasons.push("PREPARATION_INCOMPLETE");
  if (state.physicalCondition <= 0 || state.mentalCondition <= 0) reasons.push("ACTOR_INCAPACITATED");
  return { allowed: reasons.length === 0, reasons };
}

export function targetAvailable(target: { available?: boolean } | undefined): boolean {
  return target ? target.available !== false : true;
}
