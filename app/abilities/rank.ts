// 位阶差与特殊杠杆。
import { RANK_GATE_BLOCK, RANK_GATE_DEGRADE } from "./config.ts";

export type RankGapInfo = {
  gap: number;
  blocked: boolean;
  degraded: boolean;
  hasLeverage: boolean;
};

export function rankGap(actorRank: number, targetRank: number, leverage: boolean): RankGapInfo {
  const gap = targetRank - actorRank;
  return {
    gap,
    blocked: gap >= RANK_GATE_BLOCK && !leverage,
    degraded: gap >= RANK_GATE_DEGRADE,
    hasLeverage: leverage,
  };
}

export function leverageAvailable(
  preparationRefs: string[],
  mediumRefs: string[],
  environmentRefs: string[],
  targetInjured: boolean
): boolean {
  return (
    targetInjured ||
    preparationRefs.some((ref) => ref.startsWith("knowledge:")) ||
    mediumRefs.length > 0 ||
    environmentRefs.length > 0
  );
}
