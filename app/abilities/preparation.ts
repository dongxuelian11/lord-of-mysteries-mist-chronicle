// 准备与环境：结构化引用去重加成，消耗后不可重复引用。
import { ENVIRONMENT_BONUS_CAP, INFORMATION_BONUS_CAP, PREPARATION_BONUS_CAP } from "./config.ts";

export function preparationBonus(preparationRefs: string[], environmentRefs: string[]): {
  preparation: number;
  environment: number;
  information: number;
} {
  const uniquePrep = [...new Set(preparationRefs)];
  const uniqueEnv = [...new Set(environmentRefs)];
  const information = Math.min(
    INFORMATION_BONUS_CAP,
    uniquePrep.filter((ref) => ref.startsWith("knowledge:") || ref.startsWith("medium:")).length * 1.5
  );
  return {
    preparation: Math.min(PREPARATION_BONUS_CAP, uniquePrep.length),
    environment: Math.min(ENVIRONMENT_BONUS_CAP, uniqueEnv.length),
    information,
  };
}
