// 命运失控机制集中配置：概率、压力、严重度与上界。
// 全部为游戏化参数，不是原著设定。
import type { FateRiskClass, FateSeverity } from "./types.ts";

export const FATE_ALGORITHM_VERSION = "fate-aberration-v1";
export const FATE_STATE_VERSION = 1;

export const PRESSURE_MAX = 100;
export const PRESSURE_MIN = 0;

// 每次符合条件但未触发的压力增长（低频命运节奏调参后放缓）。
export const PRESSURE_BASE_MISS = 3;
export const PRESSURE_HIGH_RISK = 2;
export const PRESSURE_FORCED_CAST = 4;
export const PRESSURE_HIGH_CORRUPTION_MAX = 10;
export const PRESSURE_LOW_STABILITY_MAX = 8;
export const PRESSURE_OVERREACH_BASE = 4;
export const PRESSURE_OVERREACH_MAX = 12;
export const PRESSURE_LARGE_RITUAL_BASE = 6;
export const PRESSURE_LARGE_RITUAL_MAX = 15;

// 触发后压力上限：一级降到 4 以内、二级 2 以内、三四级清零。
export const PRESSURE_AFTER_SEVERITY_CAP: Record<FateSeverity, number> = {
  1: 4,
  2: 2,
  3: 0,
  4: 0,
};

// 基础触发区间（百分比概率），命运压力按比例扩大。
export const BASE_FATE_RATES: Record<FateRiskClass, { boon: number; disaster: number }> = {
  normal: { boon: 0.008, disaster: 0.008 },
  dangerous: { boon: 0.03, disaster: 0.05 },
  forced: { boon: 0.06, disaster: 0.12 },
  extreme: { boon: 0.08, disaster: 0.2 },
};

// 每 100 点压力对概率的额外加成（0-1 比例）。
// 调参依据：正常路线 5%-10%、高风险路线 15%-30%、18 次未触发内必强制。
export const PRESSURE_BOON_SCALE = 0.003;
export const PRESSURE_DISASTER_SCALE = 0.007;
export const MAX_COMBINED_CHANCE = 0.65;

// 严重度权重（确定性骰）。四级受前置与冷却约束。
export const SEVERITY_WEIGHTS: Record<FateSeverity, number> = {
  1: 55,
  2: 30,
  3: 12,
  4: 3,
};
export const SEVERITY4_BOOST_WEIGHT = 12;
export const SEVERITY4_COOLDOWN_WEEKS = 30;
export const SEVERITY4_MIN_PRESSURE = 80;
export const SEVERITY4_HIGH_CORRUPTION = 50;
export const SEVERITY4_RANK_GAP = 3;
export const SEVERITY4_WORLDLINE_DEVIATION = 30;

// 低频冷却：任意异常后至少 2 次行动不触发；同周最多 1 次；
// 三级至少间隔 4 周；四级至少间隔 30 周且一局最多 1 次。
export const FATE_ACTION_COOLDOWN = 2;
export const FATE_WEEKLY_TRIGGER_LIMIT = 1;
export const SEVERITY3_COOLDOWN_WEEKS = 4;
export const SEVERITY4_CAMPAIGN_LIMIT = 1;

// 有界结构上限。
export const RECENT_TEMPLATE_LIMIT = 12;
export const RECENT_FATE_RESOLUTION_LIMIT = 256;
export const PENDING_DELAYED_LIMIT = 48;

// 兜底模板：模板执行失败或无法筛选时使用，不重新抽取。
export const SAFE_FALLBACK_TEMPLATE_IDS: Record<string, string> = {
  pure: "fate-safe-fallback-pure",
  "cursed-boon": "fate-safe-fallback-cursed-boon",
  "fortunate-disaster": "fate-safe-fallback-fortunate-disaster",
  "full-disaster": "fate-safe-fallback-full-disaster",
};

// 氛围提示阈值：只给气氛，不泄漏具体异常。
export const PRESSURE_AMBIENT_HINTS: { threshold: number; hint: string }[] = [
  { threshold: 30, hint: "命运的丝线似乎绷得过紧。" },
  { threshold: 50, hint: "最近的巧合已经不像巧合。" },
  { threshold: 70, hint: "灵界的回声正变得异常活跃。" },
  { threshold: 85, hint: "某种看不见的东西似乎正在等待一个机会。" },
];

// 概率分布验收区间（低频目标）。
export const DISTRIBUTION_TARGETS: Record<"normal" | "dangerous" | "forced" | "extreme", { min: number; max: number }> = {
  normal: { min: 0.03, max: 0.05 },
  dangerous: { min: 0.07, max: 0.12 },
  forced: { min: 0.12, max: 0.18 },
  extreme: { min: 0.18, max: 0.25 },
};
