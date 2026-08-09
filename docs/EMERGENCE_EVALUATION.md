# 自动涌现评测

## 证据边界

该评测只接受 `evidenceKind: "automated-simulation"` 的结构化运行记录。报告固定写入 `humanPlaytestCompleted: false`。它用于发现长期模拟中的连续性、权限、因果和重复风险，不能替代真人体验，也不能单独证明游戏“好玩”或社会涌现可信。

仓库目前没有已完成的 5–20 小时真人体验数据。真人验收必须单独执行 [HUMAN_LONG_PLAYTEST_PROTOCOL.md](./HUMAN_LONG_PLAYTEST_PROTOCOL.md)，不得把自动运行、模型自评或默认合成夹具记为真人证据。

## 运行方式

```powershell
# 仅验证评测框架；默认数据明确标记为 synthetic-framework-fixture
npm run emergence:eval

# 评测真实的自动模拟导出，并保存结构化报告
npm run emergence:eval -- --input=artifacts/emergence/runs.json --output=artifacts/emergence/report.json
```

输入可为运行数组，也可为 `{ "runs": [...] }`。每个运行必须包含：

- `schemaVersion: 1`、`evidenceKind: "automated-simulation"`、`modelId`、`seed`；
- 按周排列的 `decisions`、`events`、`relationshipChanges`、`state` 和 `privacyViolations`；
- 决策中的主体、意图、反思来源、实际使用的记忆引用、计划及状态转换；
- 事件的稳定 ID、意义标记、影响域和因果引用；
- 关系变化的原因 ID，以及社会、经济、势力、世界四类状态样本。

同一组模型比较应固定场景、初始存档、seed、周数、Prompt/工具预算和采样参数。模型或配置变化必须使用不同的 `modelId`，报告会生成逐对 `metricDeltas`，不把不同条件下的差异归因给模型本身。

## 指标定义

| 指标 | 计算方式 | 默认门槛 |
| --- | --- | --- |
| `behavioralContinuity` | 同一主体相邻决策保持同一计划或明确延续同一意图的比例 | ≥ 0.45 |
| `privateKnowledgeIsolation` | 1 − 已记录越权记忆次数 / 决策数 | = 1.00 |
| `reflectionDecisionInfluence` | 反思来源与下一决策实际使用记忆有交集的决策比例 | ≥ 0.60 |
| `relationshipCausalCoverage` | 关系变化含非空原因，且原因都指向本次运行事件的比例 | ≥ 0.95 |
| `actionDiversity` | 规范化后的唯一行动意图 / 全部行动 | ≥ 0.45 |
| `actionRepetitionRate` | 重复的规范化行动意图 / 全部行动 | ≤ 0.40 |
| `planCompletionRate` | 出现完成状态的不同计划 / 不同计划总数 | 观察项 |
| `planAbandonmentRate` | 出现放弃状态的不同计划 / 不同计划总数 | 观察项 |
| `planRerouteRate` | 出现改线状态的不同计划 / 不同计划总数 | 观察项 |
| `stateDomainCoverage` | 社会、经济、势力、世界四域中发生变化或有事件影响的比例 | ≥ 0.75 |
| `meaninglessEventRate` | 标为无意义的事件 / 全部事件 | ≤ 0.15 |
| `templatedReflectionRate` | 命中通用模板或在同一运行重复出现的反思 / 全部反思 | ≤ 0.25 |

计划三个比例不是互斥分类：同一计划可以先改线，之后完成或放弃。它们用于判断计划是否真正演化，当前不设单一好坏门槛。

## 解释与复现

- 门槛逐运行判断，不能用一个强模型的结果掩盖另一个模型的失败。
- 零关系变化时因果覆盖记为 1，但报告中的原始计数仍应结合场景审阅；没有关系变化本身不是涌现质量证据。
- 无决策、无事件的输入会得到保守的多样性/影响比率；运行生成器应另行设置最低周数和最低事件量。
- `meaningful` 由场景标注规则或人工盲审产生，必须记录标注版本。评测器不会根据文风猜测事件是否有意义。
- 隐私违规必须由运行时权限审计器生成；只在输出文本里“没看到泄露”不等于隔离为 1。
- 发布报告应保留输入、输出、版本、commit、seed、模型标识和配置摘要，以便重放。
