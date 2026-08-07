// 成本生命周期：预留 → 提交 → 返还。
import type { AppliedCost, CostKind } from "./types.ts";

export function buildCosts(
  definition: { costs: { kind: CostKind; resource: string; amount: number }[] }
): AppliedCost[] {
  return definition.costs.map((cost) => ({ ...cost }));
}

export function reserveCosts(
  costs: { kind: CostKind; resource: string; amount: number }[]
): AppliedCost[] {
  return costs.map((cost) => ({ ...cost }));
}

export function commitCosts(
  reserved: AppliedCost[],
  includeBacklash: boolean
): AppliedCost[] {
  return reserved.filter(
    (cost) => cost.kind !== "backlash" || includeBacklash
  );
}

export function refundCosts(
  reserved: AppliedCost[],
  committed: AppliedCost[]
): AppliedCost[] {
  const committedKeys = new Set(committed.map((cost) => `${cost.kind}:${cost.resource}`));
  return reserved.filter((cost) => !committedKeys.has(`${cost.kind}:${cost.resource}`));
}
