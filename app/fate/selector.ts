// 模板选择：只从符合条件的手工模板中确定性选择，不现场生成。
import type { AbilityDefinition, AbilityOutcomeContract } from "../abilities/types.ts";
import { RECENT_TEMPLATE_LIMIT } from "./config.ts";
import { stableHash } from "./roll.ts";
import { safeFallbackFor } from "./templates.ts";
import type {
  FateAberrationTemplate,
  FateCondition,
  FatePolarity,
  FateSeverity,
  FateTwist,
} from "./types.ts";

export type TemplateSelectionContext = {
  definition: AbilityDefinition;
  contract: AbilityOutcomeContract;
  polarity: FatePolarity;
  twist: FateTwist;
  severity: FateSeverity;
  severity4Allowed: boolean;
  recentTemplateIds: string[];
  pressure: number;
  worldlineDiverged: boolean;
  actorCorruption: number;
  actorStability: number;
  rankGap: number;
  largeRitual: boolean;
  overPrepared: boolean;
  rareCoincidence: boolean;
  seed: string;
};

function conditionSatisfied(condition: FateCondition, context: TemplateSelectionContext): boolean {
  switch (condition.kind) {
    case "high-pressure":
      return context.pressure >= (condition.min ?? 80);
    case "high-risk":
      return context.actorCorruption >= 40 || context.actorStability <= 40 || context.rankGap >= 2 || context.largeRitual;
    case "forced-cast":
      return context.contract.legality.reasons.includes("INSUFFICIENT_SPIRITUALITY") || context.contract.legality.reasons.includes("PREPARATION_INCOMPLETE");
    case "high-corruption":
      return context.actorCorruption >= (condition.min ?? 50);
    case "low-stability":
      return context.actorStability <= (condition.max ?? 30);
    case "rank-overreach":
      return context.rankGap >= (condition.min ?? 2);
    case "large-ritual":
      return context.largeRitual;
    case "worldline-diverged":
      return context.worldlineDiverged;
    case "over-prepared":
      return context.overPrepared;
    case "rare-coincidence":
      return context.rareCoincidence;
    default:
      return false;
  }
}

export function severity4Allowed(context: Omit<TemplateSelectionContext, "seed">): boolean {
  const highRiskCondition =
    context.pressure >= 80 ||
    context.largeRitual ||
    context.actorCorruption >= 50 ||
    context.rankGap >= 3 ||
    context.worldlineDiverged;
  return highRiskCondition;
}

export function selectFateTemplate(
  candidates: FateAberrationTemplate[],
  context: TemplateSelectionContext,
  templateRollValue: number
): FateAberrationTemplate {
  const pool = candidates.filter((template) => {
    if (template.polarity !== context.polarity) return false;
    if (template.twist !== context.twist) return false;
    if (!template.compatibleNormalResults.includes(context.contract.result)) return false;
    if (!template.families.includes(context.definition.family)) return false;
    if (!template.prerequisites.every((condition) => conditionSatisfied(condition, context))) return false;
    if (template.forbiddenConditions.some((condition) => conditionSatisfied(condition, context))) return false;
    return true;
  }).filter((template) => context.severity4Allowed || template.severity !== 4);

  // 近期使用过的模板降低权重：先排除，不足时保留最近一次排除逻辑。
  const recent = new Set(context.recentTemplateIds.slice(0, Math.max(1, RECENT_TEMPLATE_LIMIT - 1)));
  const fresh = pool.filter((template) => !recent.has(template.id));
  const usable = fresh.length ? fresh : pool;
  if (!usable.length) return safeFallbackFor(context.twist);

  const scored = usable
    .map((template, index) => {
      const severityPenalty = Math.abs(template.severity - context.severity) * 100_000;
      const primitiveBonus =
        template.primitives?.length &&
        template.primitives.some((primitive) => context.definition.effects.some((effect) => effect.primitive === primitive))
          ? 50_000
          : 0;
      return {
        template,
        score:
          stableHash(`${context.seed}|${templateRollValue}|template|${template.id}`) -
          index * 997 -
          severityPenalty -
          primitiveBonus +
          (recent.has(template.id) ? -1_000_000 : 0),
      };
    })
    .sort((left, right) => right.score - left.score);
  if (scored.length > 1 && scored[0].template.id === context.recentTemplateIds[0]) {
    return scored[1].template;
  }
  if (scored.length === 1 && scored[0].template.id === context.recentTemplateIds[0]) {
    return safeFallbackFor(context.twist);
  }
  return scored[0].template;
}
