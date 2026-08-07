// 规则引擎集中配置：强度权重、结果阈值、成本与反制。
import type { AbilityFamily, ResultLevel } from "./types.ts";

export const ABILITY_VERSION = 1;
export const TRACE_LIMIT = 64;
export const RESOLVED_LEDGER_LIMIT = 1000;

export const INTERNAL_RANK_MAX = 10; // 序列0
export const INTERNAL_RANK_MIN = 1; // 序列9

export function internalRank(sequence: number): number {
  return Math.max(INTERNAL_RANK_MIN, Math.min(INTERNAL_RANK_MAX, 10 - sequence));
}

export const ACTION_POWER_WEIGHTS = {
  mastery: 0.15,
  information: 0.2,
  preparation: 0.2,
  environment: 0.1,
  rank: 0.15,
  penalties: -0.2,
};

export const FAMILY_BASE_POWER: Record<AbilityFamily, number> = {
  perception: 8,
  divination: 10,
  concealment: 9,
  deception: 9,
  mental: 11,
  control: 12,
  mobility: 10,
  physical: 12,
  transformation: 12,
  protection: 9,
  binding: 12,
  curse: 13,
  ritual: 14,
  summoning: 14,
  tracking: 9,
  creation: 10,
};

export const RESISTANCE_KEY_BY_FAMILY: Record<AbilityFamily, string> = {
  perception: "spiritual",
  divination: "divination",
  concealment: "concealment",
  deception: "mental",
  mental: "mental",
  control: "control",
  mobility: "physical",
  physical: "physical",
  transformation: "authority",
  protection: "spiritual",
  binding: "control",
  curse: "curse",
  ritual: "spiritual",
  summoning: "authority",
  tracking: "divination",
  creation: "authority",
};

export const RESULT_THRESHOLDS: { level: ResultLevel; minMargin: number }[] = [
  { level: "critical-success", minMargin: 6 },
  { level: "success", minMargin: 1 },
  { level: "partial-success", minMargin: -2 },
  { level: "fail-with-progress", minMargin: -5 },
];

export const VARIANCE_RANGE = [-2, 2];

export const RANK_GATE_BLOCK = 3; // 相差 >=3 级：核心效果默认硬门槛阻断
export const RANK_GATE_DEGRADE = 2; // 相差 >=2 级：结果降级与代价增加

export const PREPARATION_BONUS_CAP = 5;
export const INFORMATION_BONUS_CAP = 4;
export const ENVIRONMENT_BONUS_CAP = 3;
export const MASTERY_BONUS_CAP = 4;

export const DEFAULT_EXTRAORDINARY_STATE = {
  internalRank: 1,
  spirituality: 18,
  maxSpirituality: 18,
  stability: 71,
  corruption: 0,
  physicalCondition: 100,
  mentalCondition: 100,
  concentrationSlots: 1,
  occupiedConcentrationSlots: 0,
  abilityMastery: {},
  resistances: {
    physical: 5,
    mental: 5,
    spiritual: 5,
    divination: 5,
    concealment: 5,
    curse: 5,
    control: 5,
    corruption: 5,
    authority: 0,
  },
  activeConditions: [],
};

export const NARRATIVE_FORBIDDEN = [
  "不得把失败写成成功",
  "不得删除或忽略合同中的代价",
  "不得增加合同中不存在的效果",
  "不得忽略反制",
  "不得让未授权角色知道结果",
  "不得把角色信念写成客观真相",
  "不得改变死亡、伤势、资源和状态",
  "不得使用玩家未选择的能力",
];
