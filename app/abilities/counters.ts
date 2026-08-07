// 反制系统：被动抗性、主动反应与优先级。
import { RESISTANCE_KEY_BY_FAMILY } from "./config.ts";
import type { AbilityDefinition, AbilityResistanceProfile, DefenseBreakdown } from "./types.ts";

export type CounterInput = {
  definition: AbilityDefinition;
  resistances: AbilityResistanceProfile;
  targetRank: number;
  actorRank: number;
  activeCounterIds: string[];
  environmentProtection: number;
};

export function resolveCounters(input: CounterInput): {
  breakdown: DefenseBreakdown;
  usedActive: string[];
} {
  const resistanceKey = RESISTANCE_KEY_BY_FAMILY[input.definition.family] ?? "spiritual";
  const resistance = input.resistances[resistanceKey as keyof AbilityResistanceProfile] ?? 0;
  const active = input.definition.counters
    .filter(
      (counter) =>
        counter.actor === "target" &&
        input.activeCounterIds.includes(counter.id) &&
        counter.affects.some((primitive) =>
          input.definition.effects.some((effect) => effect.primitive === primitive)
        )
    )
    .sort((left, right) => right.priority - left.priority);
  const activeTotal = active.reduce((sum, counter) => sum + (counter.resourceCost ?? 2), 0);
  const rankProtection = Math.max(0, input.targetRank - input.actorRank) * 1.5;
  return {
    breakdown: {
      resistance,
      passiveCounters: resistance > 0 ? 2 : 0,
      activeCounters: activeTotal,
      rankProtection,
      environment: input.environmentProtection,
    },
    usedActive: active.map((counter) => counter.id),
  };
}
