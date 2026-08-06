# 动态长期记忆系统

静态原著知识 RAG（作品设定）与动态存档记忆（本局历史）分层协作：

```text
静态原著知识 RAG + 动态存档记忆 → 按场景生成的模型工作上下文
```

## 五类记忆对象

- `MemoryEvent`：已经正式发生的世界事件（world-fact），不可衰减、不可改写；
- `CharacterBelief`：角色主观认知（正确/错误/怀疑/过时），被纠正后保留历史并标记失效；
- `Commitment`：承诺、债务、交易、保密约定、威胁、定期会面等，到期进入推进与角色上下文；
- `RelationshipCause`：关系数值变化的原因（信任/恐惧/尊敬/怨恨/债务/忠诚/怀疑），重大原因不自动衰减；
- `ActivePlan`：长期计划，结构化保存，完成/失败/放弃后不再作为当前目标。

## 写入流程

```text
玩家命令 → 规则与世界引擎结算 → 正式世界事件 → 派生结构化记忆变化
→ 验证 → 原子保存世界状态与记忆 → 构建叙事上下文 → LLM 文学表达
```

- 记忆派生是**确定性规则**（`deriveMemory`），同一 `sourceEventId + kind + subject` 幂等去重；
- LLM 只能提出候选记忆，必须经过 schema/参与者/可见性/来源/一致性/重复/数值范围校验；
- 叙事生成失败不撤销已结算的世界事件与记忆；世界结算失败不写入正式记忆；
- 记忆与存档在同一 `GameState.memory` 中，`checksum` 覆盖，读写原子一致。

## 衰减与唤起

- 世界事实永不衰减；角色回忆激活度可衰减（active/blurred/dormant/superseded）；
- 激活度 = 0.30×重要性 + 0.20×情绪权重 + 0.15×近因 + 0.15×目标相关 + 0.10×关系相关 + 0.10×重复唤起；
- 地点/角色/物品/报告/提醒/计划相关线索可提高激活度；唤起只更新 `lastRecalledWeek/recallCount`；
- 死亡、身份揭露、晋升、背叛、救命之恩、严重伤害、世界线偏转等默认不衰减。

## 场景工作记忆

`buildSceneMemory` 按场景（对话/议会/调查/行动/世界/玩家叙事）召回：

- 对话：共同经历、角色信念、关系原因、未完成承诺、共享秘密；
- 议会：组织目标、活跃计划、未决危机、过去决策后果、成员立场与关系原因；
- 调查：线索来源、矛盾证词、已排除假设、错误情报、参与者分别知道什么；
- 行动：类似行动、已知风险、当前承诺与目标（不决定能力合法性/成败）；
- 世界推进：活跃计划、到期承诺、未解决事件、世界线偏转；
- 玩家叙事：仅玩家观察过的事实与已揭露关系。

上下文是结构化引用（`MemoryReference`），区分世界真值/角色信念/不确定/错误/过时信息，并带预算上限。

## 存档

- `DynamicMemoryState` 存入 `GameState.memory`；旧存档（无 memory）读取时补空安全默认；
- 索引是派生数据，读档后由 `buildMemoryIndexes` 重建，不入存档；
- 不保存整段正文或 Prompt；MemoryTrace 有界（64 条）且只记录 ID/分数/原因。

## 命令

```text
npm run memory:audit       # 重复/孤立引用/互斥事实/无效角色/失效承诺/Trace 上限
npm run memory:eval        # 固定第 1–50 周长期场景 + 权限/衰减/原子性
npm run memory:longrun     # 三条 50 周路线（保守/高冲突/原著偏离）
npm run memory:benchmark   # 1k/5k/10k 事件与 30k 派生记忆压力测试
npm run memory:integration:audit # 六类调用点接线/孤立事件/计划一致性/propositionKey/检索副作用
npm run memory:integration:eval  # 六类真实 Prompt 接入/只读检索/回忆提交/50 周路线/性能
npm run memory:receipt:audit     # 回执受众语义/重复/幂等账本/actor 隔离/有界性
npm run memory:receipt:eval      # 成功/失败路径、重试幂等、审计淘汰、50 周路线、性能
npm run memory:audience:audit    # 共享对象纯内容/受众级幂等/迁移正确/narrator·world 无副作用
npm run memory:audience:eval     # 多角色共享事件/玩家·NPC 隔离/激活隔离/淘汰后幂等/性能
```

实测：10,000 事件 + 30,000 派生记忆时，工作记忆构建 P95≈5ms（目标 ≤50ms），连续 1000 次构建无持续线性内存增长。

## 真实接线

- 人物对话（`generateNpcDialogue`）：`sceneType=dialogue`、actor=当前 NPC，仅角色视角记忆；
- 议会（`generateCouncilReplies`）：每名成员独立 `speakerDynamicMemory`，禁止全局秘密上下文；
- 调查/行动（`generateAbilityDraft`、`generateSceneResponse`）：`sceneType=investigation|action`、actor=player；
- 世界推进（`generateAiWorldDelta`）：`sceneType=world`，成功结算后写入 `presented` 回执；
- 玩家叙事（`generateSituationBrief`、`generateLiteraryChapter`）：`sceneType=player`，只含玩家可见记忆。

## 回执语义（retrieved / delivered / presented / recalled）

- `retrieved`：系统检索到候选——严格只读，不写存档；
- `delivered`：记忆实际进入一次成功且被业务层接受的模型调用（审计信息，不改激活度）；
- `presented`：记忆进入某个游戏内认知主体（NPC/玩家）的有效上下文——更新 `lastPresentedWeek`，不增加 `recallCount`；
- `recalled`：确定性角色行为/正式决策确认使用——唯一允许增加 `recallCount/lastRecalledWeek` 的路径。

受众模型：`actor`（可 presented/recalled）、`player`（可 presented，不改 NPC 激活度）、
`narrator`（导演/作者/编辑/现状简报，仅 delivered）、`world-system`（仅 delivered）。
后台模型看到记忆 ≠ 角色回忆记忆。

统一提交入口 `runAcceptedModelCall`：检索（只读）→ 构建 Prompt → 调用模型 → schema/业务校验 →
调用方正式接受 → 提交 delivered → `audience.affectsActivation` 时提交 presented → 确定性确认才提交 recalled。
失败/超时/取消/重试/迟到响应一律不回执；相同 `actionId+modelCallId+stage+kind+audience+memoryIds`
幂等去重。

审计与幂等分离：`receipts` 为有界审计列表（500 条）；`receiptLedger.recalledByAudience`
按受众+记忆+周聚合，保证回执淘汰后重放旧调用不重复计数；两者都进入存档并被 checksum
覆盖，缺失时安全补默认。

## 受众隔离

- 展示/回忆状态存放在独立 `AudienceMemoryState`（`memoryId + audienceKey`，key = `actor:<id>` 或 `player`），
  共享记忆对象（MemoryEvent/CharacterBelief/Commitment/RelationshipCause/ActivePlan）只保留纯内容与来源，不再作为运行权威；
- `receiptLedger.recalledByAudience` 按受众维度保存 recalled 周集合：同一受众+记忆+周最多一次，
  A 与 B 同周回忆同一事件互不阻断，玩家与 NPC 完全隔离；
- 激活评分只读取当前受众的 `recallCount/lastPresentedWeek`，同一记忆在不同角色可处于 active/blurred/dormant；
- narrator/world-system 只产生 delivered 审计，不创建/更新任何受众状态；
- 旧存档的共享 recall/presented 字段只迁移给对应角色（`ensureAudienceStates`），不复制给所有参与者，迁移幂等。

## 真值边界

- `MemoryEvent` 是正式世界事件的长期记忆索引：必须引用 `sourceEventId`，可由世界事件重建，不允许作为第二套可改写事实；
- `ActivePlan` 引用正式 `sourcePlanId`：状态以 `worldKernel.projects/missions` 为权威，记忆仅派生视图，审计会报告不一致；
- `CharacterBelief` 使用 `characterId + propositionKey` 作为替代键，`claimType` 仅用于分类；旧存档缺失 `propositionKey` 时使用 `legacy:` 兼容键安全读取，不丢失历史。
