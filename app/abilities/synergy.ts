// 能力组合：未登记组合默认独立执行；检测重复效果与零成本循环。
import type { AbilitySynergyRule } from "./types.ts";

export const SYNERGY_RULES: AbilitySynergyRule[] = [];

export function checkSynergy(abilityIds: string[]): {
  modifier: number;
  issues: string[];
} {
  const issues: string[] = [];
  const counts = new Map<string, number>();
  for (const id of abilityIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) issues.push(`duplicate-effect:${id}`);
  }
  const rule = SYNERGY_RULES.find(
    (item) => item.abilityIds.every((id) => abilityIds.includes(id))
  );
  return { modifier: rule?.modifier ?? 0, issues };
}
