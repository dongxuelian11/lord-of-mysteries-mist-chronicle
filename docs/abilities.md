# 非凡能力规则引擎（MVP）

## 定位

非凡能力不再主要依赖大模型“凭文学感觉”判断成功或失败。正式架构为：

```text
玩家自然语言命令
→ DeepSeek 解析结构化意图（辅助表达，不裁决）
→ 确定性合法性检查（硬门禁）
→ 场景、位阶、抗性与反制计算
→ 可复现规则结算（确定性随机种子）
→ AbilityOutcomeContract（不可变合同）
→ 原子更新世界状态与资源
→ 派生世界事件和动态记忆
→ DeepSeek 严格依据合同生成叙事
```

核心原则：

- 模型负责理解和描写，规则引擎负责裁决；
- 世界状态负责保存，动态记忆负责长期连续性；
- 相同状态、相同行动 ID、相同种子得到相同结果；
- 模型不能把失败写成成功、不能自增未结算效果、不能忽略代价/反噬/污染；
- 叙事重试不得重新结算、扣费或写入记忆；
- 能力结果不得绕过角色知识边界。

## 目录

```text
app/abilities/
  types.ts       # 类型：AbilityDefinition / ExtraordinaryState / AbilityIntent / OutcomeContract
  config.ts      # 集中权重、结果阈值、位阶门禁、抗性键映射、上界
  registry.ts    # 21 个代表性能力定义（来源 game-original:pathway-abilities）
  legality.ts    # 硬门禁合法性检查
  resolver.ts    # 确定性结算：强度 → 对抗 → 六级结果 → 合同
  contract.ts    # OutcomeContract schema 校验
  costs.ts       # 成本生命周期：预留 → 提交 → 返还
  counters.ts    # 反制系统：被动抗性 + 主动反制 + 位阶保护 + 环境
  preparation.ts # 准备与信息去重加成
  rank.ts        # 位阶差与特殊杠杆
  trace.ts       # 有界 Trace 环
  intent.ts      # 自然语言 → 结构化意图（确定性关键词匹配）
  apply.ts       # 原子应用：幂等账本 + 世界事件 + 动态记忆 + 资源边界
  narrative.ts   # 叙事一致性校验与确定性回退文本
  synergy.ts     # 组合规则（当前为空，未注册组合默认独立执行）
  index.ts       # 公开入口
```

## 21 个代表性能力

从项目已冻结的 `pathway-abilities` 目录中选出，不发明原著能力：

`spirit-vision`、`divination`、`danger-sense`、`flame-jump`、`damage-transfer`、`paper-substitute`、`faceless-shape`、`spirit-thread-sight`、`marionette-touch`、`empathy-probe`、`surface-thought`、`deep-hypnosis`、`dream-entry`、`short-teleport`、`spirit-travel`、`prediction-resistance`、`track`、`fire-shaping`、`reaping-strike`、`identify`、`ritual-design`

覆盖要求：

- 2 个感知/侦测：`spirit-vision`、`empathy-probe` 等；
- 2 个占卜/推演：`divination`、`spirit-thread-sight` 等；
- 2 个隐蔽/伪装/反占卜：`paper-substitute`、`faceless-shape` 等；
- 2 个精神影响/认知干扰：`surface-thought`、`deep-hypnosis` 等；
- 2 个移动/逃脱：`flame-jump`、`short-teleport`、`spirit-travel` 等；
- 2 个控制/束缚：`marionette-touch`、`track` 等；
- 2 个防御/替身/伤害转移：`damage-transfer`、`prediction-resistance` 等；
- 2 个仪式/准备型：`ritual-design`、`identify` 等；
- 至少 2 个带明显反噬/污染风险：`marionette-touch`、`deep-hypnosis`、`spirit-travel`、`damage-transfer`、`divination`、`fire-shaping`、`reaping-strike`。

每个定义都包含：id/name、pathwayId/sequence/internalRank、family/tags、激活规则、需求、目标规则、效果原语、成本、风险、反制、canon 约束、游戏参数与 sourceIds。

## 规则语义

### 位阶模型

原著序列数字越小越强，代码内部使用 `internalRank = 10 - sequence`（序列 9 → 1，序列 0 → 10）。所有比较只使用 `internalRank`；UI 与叙事仍显示原始序列。

位阶差用于：硬门禁（相差 ≥3 且无杠杆时核心效果默认封锁）、效果上界、抗性修正、反噬风险与成本。

### 合法性硬门禁

先执行硬门禁，再进入强度判定。检查项包括：是否拥有能力、能力是否被封锁、灵性是否充足、专注槽、目标类型/数量、距离/视线/接触、媒介/材料/知识/准备、仪式条件、位阶门禁、行动者是否失能、目标是否有效。

硬门禁不通过时：不进入正常随机判定、不应用成功效果、返回可解释结构化原因、不允许模型自行绕过。

### 确定性对抗

```text
行动强度 = 能力基础强度 + 熟练度 + 信息优势 + 准备优势 + 环境优势 + 位阶加成 - 伤势/精神/干扰惩罚
防御强度 = 目标领域抗性 + 被动反制 + 主动反制 + 位阶保护 + 环境保护
margin = 行动强度 - 防御强度 + deterministicVariance(seed)
```

`deterministicVariance` 由稳定哈希种子（saveId + actionId + abilityId + actorId + targetIds + resolutionAttempt 语义等价物）生成，范围 `[-2, 2]`。不使用 `Math.random()` 作为正式结算权威。

### 六级结果

`critical-success` / `success` / `partial-success` / `fail-with-progress` / `failure` / `backlash`

阈值集中在 `config.ts`：

- margin ≥ 6 → critical-success
- margin ≥ 1 → success
- margin ≥ -2 → partial-success
- margin ≥ -5 → fail-with-progress
- margin < -5 且有反噬风险 → backlash
- 其余 → failure

### 成本模型

成本区分 `activation` / `attempt` / `success` / `maintenance` / `backlash`。激活前成本可在合法性之后预留；尝试成本失败也可能支付；成功成本只在成功效果提交时支付；反噬成本只在对应结果触发；重试叙事不再支付；资源不足不得变成负数。

### 反制系统

规则引擎主动发现反制，不依赖模型“想起来”：

- 被动：领域抗性、护符/屏障/位阶保护、环境屏蔽；
- 主动：打断、躲避、反占卜、替身、转移目标、解除控制、反向追踪；
- 事前：假情报、诱饵、阵法、切断媒介、隐藏真名、预先封印；
- 事后：驱散、净化、治疗、追查、痕迹处理、副作用压制。

每条反制定义触发条件、优先级、使用主体、资源成本、生效原语、是否自动、是否暴露自身、是否产生世界事件。

### AbilityOutcomeContract

正式结算输出不可变合同：actionId/resolutionId、确定性种子、合法性、强度/防御分解、margin、结果等级、预留/提交/返还成本、已应用/被阻断效果、创建/移除状态、世界事件与信念提案、痕迹、副作用与叙事约束。

合同要求：schema 校验、结果不可在叙事阶段修改、可序列化、可审计、可复现、可由相同输入重建、不包含完整 Prompt、不向无权限玩家泄露目标秘密防御信息。

### 原子事务与幂等

正式流程：

```text
解析意图 → 玩家确认 → 生成 resolutionId → 检查已结算
→ 合法性 → 预留成本 → 反制与结算 → 生成合同
→ 校验合同 → 原子应用效果/成本/世界事件
→ 派生动态记忆 → 保存 GameState → 生成叙事
```

`applyAbilityResolution` 维护 `abilityResolutions` 幂等账本（上限 1000，并叠加世界事件 `world-ability-<resolutionId>` 权威），同一 resolutionId 只能提交一次；叙事重试不重新结算；世界更新失败不扣费；记忆写入失败不出现半提交；结算成功但叙事失败时世界结果仍保留；失败调用不得产生成功效果。

### 动态记忆接入

能力结果按类型写入正确层级：

- 客观状态变化（伤势、位移、束缚、物品消耗、仪式完成、防护建立、环境改变）→ 正式世界状态 + `MemoryEvent`；
- 主观信息结果（占卜、推演、精神暗示、错误情报、模糊象征、被干扰感知）→ 优先生成 `CharacterBelief`（true/false/uncertain/unknown），不把占卜看到的内容直接写成世界真值；
- 关系与承诺（威胁、救助、背叛、暴露、债务、保密约定）→ 通过冻结的动态记忆接口生成对应对象。

### 叙事约束

DeepSeek 收到 AbilityIntent、OutcomeContract、当前场景、授权后的动态记忆、授权后的 RAG 与明确叙事禁区。模型不得：把 failure 写成 success、删除已支付代价、增加合同中不存在的效果、忽略反制、让未授权角色知道结果、把角色信念写成客观真相、改变死亡/伤害/资源/状态、使用玩家未选择的额外能力、修改 OutcomeContract。

`validateNarrative` 校验失败可重写文学文本，但不得重新结算。

## 命令

```text
npm run ability:audit      # 定义完整性、来源、效果原语、确定性、合同与资源边界
npm run ability:eval       # 合法性矩阵、六级结果、位阶、反制、信息/准备、幂等、叙事、自然语言等价
npm run ability:longrun    # 三条 30 周路线：调查准备 / 高风险 / 位阶反制
npm run ability:benchmark  # 100 角色 / 200 定义 / 10k 合法性 / 5k 结算 / 1k 幂等 / 100 存档往返
```

## 与既有系统的接线

- `app/ability-system.ts`：`resolveImmediateAbility` 对已注册能力走规则引擎（合法性 → 结算 → 合同校验 → 叙事校验 → 原子应用）；未注册能力保留旧逻辑作为兼容回退。
- `app/game-model.ts`：`GameState` 增加可选 `abilityResolutions` 账本，`createInitialGame` 初始化为 `[]`。
- `app/save-system.ts`：老存档缺字段时安全补 `abilityResolutions=[]`。

## 已知边界（MVP）

- 21 个能力来自已冻结的游戏原创 `pathway-abilities` 目录，不是全量原著能力；未注册能力仍走旧即时结算回退。
- `canonConstraints` 保存原著/可靠资料明确支持的边界；`gameParameters` 保存为游戏结算新增的数值与阈值，两者严格分离，不把平衡参数伪装成原著事实。
- 组合规则表当前为空：未注册组合默认按顺序独立执行、各自支付成本、无乘法加成、不共享一次成本、不自动取消副作用。
- 目标抗性目前由调用方传入（当前生产接线中为同目标默认抗性）；后续 UAU 需要把目标/NPC 的结构化状态真正接入结算入口。
