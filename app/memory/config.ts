// 动态记忆集中配置：激活权重、场景预算、衰减与 Trace 上限。

export const MEMORY_VERSION = 1;
export const TRACE_LIMIT = 64;

export const ACTIVATION_WEIGHTS = {
  importance: 0.3,
  emotionalWeight: 0.2,
  recency: 0.15,
  goalRelevance: 0.15,
  relationshipRelevance: 0.1,
  rehearsalBoost: 0.1,
};

export const DECAY_HORIZON_WEEKS = 24;
export const DECAY_POLICY_MULTIPLIER: Record<string, number> = {
  none: 0,
  slow: 0.35,
  normal: 1,
  fast: 2.2,
};

// 永不衰减的世界事实：类型或标签命中即强制保留激活度
export const NEVER_DECAY_TYPES = new Set([
  "death",
  "identity-reveal",
  "advancement",
  "organization-founded",
  "organization-dissolved",
  "betrayal",
  "rescue",
  "severe-harm",
  "item-lost",
  "item-gained",
  "worldline-pivot",
  "secret-shared",
]);
export const NEVER_DECAY_IMPORTANCE_FLOOR = 0.8;

export const RECALL_STATE_THRESHOLDS = { active: 0.55, blurred: 0.35 };

export const SCENE_BUDGETS: Record<string, number> = {
  dialogue: 2800,
  council: 3600,
  investigation: 3200,
  action: 2600,
  world: 6000,
  player: 3000,
};

export const SCENE_MAX_REFS: Record<string, number> = {
  dialogue: 14,
  council: 20,
  investigation: 18,
  action: 12,
  world: 32,
  player: 16,
};

export const FORBIDDEN_INFERENCES = [
  "不得把角色信念当作世界真值",
  "不得把已过时或被纠正的信息当作当前事实",
  "不得把未完成承诺写成已经履行",
  "不得把其他角色私密记忆写入当前角色认知",
  "不得让模型自行裁决相互冲突的世界事实",
];
