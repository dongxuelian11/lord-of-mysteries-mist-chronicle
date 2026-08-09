# 《灰雾纪事》自治运行时修复上下文

最后更新：2026-08-09（阶段 5 记忆审计与评测扩展完成）

> 自动压缩恢复规则：本文件是本任务唯一恢复锚点。发生上下文压缩或会话恢复后，必须先完整读取本文件，再执行第 9 节的立即动作；不得根据聊天摘要重新推测计划。长测试、关键架构决策、阶段切换和预计压缩前必须先更新本文件。

## 1. 最终目标和非目标

### 最终目标

- 为 actor/faction 建立权限隔离、预算有界、可追溯的自治 Agent 动态记忆投影，并在成功提交后记录幂等回执。
- 建立真实、结构化、可持久化、有来源的反思闭环；反思只来自主体可见信息，并实际影响下一轮目标、候选行动或提案依据。
- 在不破坏周事务原子性的前提下处理模型失败、重试和回执。
- 为世界账本建立带 schema/version 的兼容事件 reducer，使普通权威事件足以推进状态；支持从零/快照重放、按 sequence/week 截止、分支、补偿式撤销、篡改检测、旧存档迁移和反事实运行。
- 建立可执行的自动涌现评测，覆盖连续性、隐私、反思影响、关系因果、行动多样性、计划演化、世界变化、跨模型、无意义事件和模板化反思。
- 建立真人 5–20 小时长线体验协议、记录模板和验收阈值，不伪造体验数据。
- 完成专项测试、类型检查、构建、完整测试和正式文档更新。

### 非目标

- 不降低 `agentRef`、记忆受众、隐私或事务原子性校验来换取测试通过。
- 不把自动评测描述成真人体验，也不伪造真人体验结果。
- 不一次性无边界重写整个运行时或账本；采用兼容迁移和分阶段实现。
- 不删除、覆盖、提交用户现有改动；不提交、不推送、不发布。
- 不复制 GPL、AGPL 或 CC BY-NC-SA 上游代码；只有明确记录来源与取舍后才声称吸收参考机制。
- 不把不存在的 `docs/GRILL_V04_DECISION_LEDGER.md` 当作证据。

## 2. 当前仓库基线及已知问题

- 工作区：`D:\gmzz`
- 分支：`main`
- 项目版本：`v0.4.0`
- 用户已核验提交：`04d6c07a5f05c49e86ff5aaba039c7794943c00f`
- Git 工作区状态已核验：`main...origin/main`；仅有未跟踪文件 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 和本任务新建的 `docs/REPAIR_CONTEXT.md`。两个 QA 日志必须保留且不得提交。
- HEAD 已核验为 `04d6c07a5f05c49e86ff5aaba039c7794943c00f`，`package.json` 版本为 `0.4.0`。
- 已知历史测试基线：指定的 8 个测试文件共 52/52 通过。
- `npm run memory:integration:audit` 历史上通过，但只覆盖六个旧调用点，不覆盖自治 Agent。
- `npm run memory:integration:eval` 当前已知失败：测试桩不能识别新增的独立 Agent 提案请求，导致 12 个主体的 `agentRef` 与当前主体不一致。应修复测试桩请求识别和 `AgentProposal` 返回结构，不修改产品端校验。
- `app/autonomous-agents.ts` 的反思仅按新增事件数/认知数拼接模板；`AutonomousDecisionFrame` 未包含 reflection/drives；现有同名测试没有证明反思内容或决策影响。
- 独立 Agent 规划只有 WorldKernel 可见事件、观察、知识和部分 ID；未注入主体的 `CharacterBelief`、`Commitment`、`RelationshipCause`、`ActivePlan` 内容。
- faction 的受众模型尚未明确，不能用 actor ID 冒充。
- `app/world-ledger.ts` 的 `replayWorldLedger` 从最近快照开始，只用 `week-committed.payload.projection` 完整替换状态；其他权威事件没有 reducer；没有真正从初始状态归约、分支、补偿撤销或反事实运行。
- UI 的“新的历史分支”当前只是 `createInitialGame`，不是账本分支。
- 现有可靠性文档只证明连续 20 周技术回归，不证明玩法、可信涌现或长期行为多样性；仓库没有已完成的真人 5–20 小时记录。
- 来源追溯目前只明确登记 WorldLines、WarAgent、CivRealm、CivRealm baseline、AI Town、TinyTroupe。

## 3. 已确定的架构决策

- 规则优先级：确定性、权限隔离、事件来源、失败原子性、向后兼容、可验证性。
- 每阶段遵循红—绿—重构：先新增会失败且名称与断言一致的测试，再实现，再做回归。
- actor 与 faction 使用明确区分的受众身份；记忆选择器按受众类型执行权限过滤。
- Agent 规划投影同时携带预算有界的记忆文本和引用 ID，避免仅传 ID 或把全局私有数据塞入 Prompt。
- 反思使用结构化数据和来源引用持久化；模型生成若参与，必须有校验/确定性降级，且失败不能造成部分周提交。
- 记忆投递回执只在事务成功提交后写入，重试必须幂等；具体沿用 `delivered/presented` 还是增加专用回执，待读完现有事务/记忆实现后确定。
- 账本采用带版本的事件 envelope + 按事件类型 reducer；快照是加速及校验点，不是事实来源。
- 旧 `week-committed.payload.projection` 保持可读，迁移层将旧记录适配为兼容事件流；新记录逐步不再依赖完整投影推进。
- 撤销优先追加补偿事件，历史记录不可原地修改。
- 分支从指定 sequence 的已验证状态派生，拥有独立 branch identity、事件序列和完整性链，原分支只读不变。
- 自动涌现评测必须输出可复现指标、阈值和样本证据，并与真人体验证据分栏。
- 阶段 3 记忆架构：新增专用于自治规划的 `AutonomousMemoryAudience` 判别联合（`actor`/`faction`），不把 faction 传入 actor API。新增确定性的 `buildAutonomousMemoryProjection`，按主体权限过滤后以固定引用数和字符数排序截断，输出 `text` 与 `referenceIds`。
- actor 记忆权限：仅自身参与/观察的事件、自身信念、自己参与的承诺、涉及自身的关系来源、自己拥有或参与的活动/受阻计划。不会因为条目是 public 就把无关主体的承诺/计划注入独立规划。
- faction 记忆权限：事件按 `organizationIds`；信念按规范化 `faction:<id>` 持有者引用；承诺/关系按 `faction:<id>`；计划兼容世界项目派生的原始 owner id 和规范化 faction ref。受众始终显式为 faction。
- `AgentPlanningProjection` 将携带显式 `memoryAudience`、预算有界的 `dynamicMemory` 和 `memoryReferenceIds`；`planActiveAgentsIndependently` 通过 options 接收只读记忆状态，保持旧调用兼容。
- 自治记忆回执只在整个世界周成功构造并即将提交时统一写入：actor/faction 均记录幂等 `delivered` 与 `presented`；失败/重试阶段不写原始 `game.memory`。为此扩展回执受众和 `AudienceMemoryState` 支持 faction。

## 4. 分阶段实施计划

1. 创建本文件；检查 Git 状态、HEAD、版本和关键文件，保留用户改动。
2. 运行并修复 `memory:integration:eval` 的陈旧测试桩，记录可信基线。
3. 阅读自治 Agent、动态记忆、事务和 faction 实现；先写私有记忆投影与受众隔离失败测试，再实现和回归。
4. 先写反思来源、权限、持久化、失败原子性和下一轮决策影响失败测试，再实现闭环和回归。
5. 扩展 integration-audit、integration-eval 和相关自动测试。
6. 先写账本 schema/reducer/迁移设计文档和失败测试，再分层实现从零重建、快照等价、截止重放、分支隔离、补偿、篡改检测、旧存档迁移和反事实运行。
7. 建立自动涌现评测 runner/fixtures/report schema，并创建真人长线体验协议与模板。
8. 运行专项测试、typecheck、build 和完整测试；修复回归。
9. 更新正式文档、本文件和最终证据清单。

## 5. 当前进行到哪一步

- 阶段 1 已完成：恢复上下文、Git 状态、HEAD、版本和关键符号位置均已核验。
- 阶段 2 已完成：陈旧评测桩已修复，产品端 `agentRef` 校验保持不变，`memory:integration:eval` 通过。
- 阶段 3 实现与专项回归已完成：actor/faction 私有动态记忆投影、显式受众和提交后幂等回执已接入。
- 阶段 4 实现完成：结构化反思由确定性可见状态归纳，持久化来源和受众，进入下一周 decision frame 并增加候选行动；旧字符串反思可迁移。
- 阶段 5 已完成：自治 Agent 已纳入记忆审计和真实集成评测第七类调用点。
- 阶段 6–8 已完成：账本 V2、涌现评测、正式文档和全部质量门禁均已完成；当前任务处于最终交付状态。

## 6. 已修改文件

- `docs/REPAIR_CONTEXT.md`：新建任务恢复与证据日志。
- `scripts/memory/integration-eval.mjs`：以结构化载荷识别自治 Agent 请求，返回匹配主体的合法 `AgentProposal`，并断言 12 个独立请求全部正确识别。
- `app/memory/autonomous.ts`：新增 actor/faction 专用、权限隔离、12 引用/2800 字符上限的确定性自治记忆投影。
- `app/memory/types.ts`：增加 faction 记忆回执受众与受众状态；增加 autonomous 场景类型。
- `app/memory/derive.ts`：扩展 faction 的幂等 delivered/presented/recalled 受众键和状态处理。
- `app/memory/indexer.ts`：索引 faction 受众状态键。
- `app/memory/receipts.ts`、`app/memory/index.ts`：导出 `factionAudience` 和自治记忆投影 API。
- `app/world-runtime.ts`：`AgentPlanningProjection` 增加显式记忆受众、文本和引用 ID；独立规划 options 接收只读记忆状态。
- `app/game-engine.ts`：把 `game.memory` 注入每个独立规划，并仅在完整世界周成功后统一提交 actor/faction 的 delivered+presented 回执。
- `tests/world-runtime.test.mjs`：新增 actor/faction 投影内容、隔离和预算测试。
- `tests/memory-audience.test.mjs`：新增 faction 回执受众与幂等测试。
- `tests/turn-transaction.test.mjs`：新增真实独立规划 Prompt 记忆接入、成功提交回执和失败零写回测试。
- `app/autonomous-agents.ts`：新增 `AutonomousReflection` 结构、旧字符串迁移、主体可见来源归纳、drive signals、下一轮 frame 注入和 reflection candidate。
- `app/game-engine.ts`：世界裁决后先确定性派生本周记忆供反思使用；原始游戏状态仍只在最终成功返回时提交。
- `tests/autonomous-agents.test.mjs`：新增反思来源/权限/持久化迁移/目标与候选行动影响测试。
- `tests/turn-transaction.test.mjs`：失败周同时断言 `worldAgents` 未被部分写回。
- `scripts/memory/integration-audit.mjs`：从六类扩展为七类接线，静态核验自治投影、引用 ID、显式受众、game memory 注入和 faction 回执。
- `scripts/memory/integration-eval.mjs`：加入真实自治 actor/faction 私有记忆 fixture，验证 Prompt 隔离、12 引用上限、drives、结构化反思和 delivered/presented 回执。
- `docs/WORLD_LEDGER_V2.md`：新增正式账本 V2 规范，定义事件 envelope/hash chain、reducer、结构化 patch、快照、截止重放、分支、反事实、补偿撤销和 V1 迁移语义。
- `app/world-ledger.ts`：实现 V2 事件归约、结构化投影 patch、从零/快照重放、sequence/week 截止、hash chain、补偿、分支、反事实和 V1 迁移。
- `app/save-system.ts`、`app/complete-game.tsx`：旧 V1 账本迁移到 V2；新加载路径不再把有效旧账本重置成当前快照。
- `app/game-engine.ts`：world/knowledge 权威事件显式携带 `worldEventId`/`knowledgeId`，供 reducer 更新对应投影。
- `app/ai-settings.tsx`、`app/complete-game.tsx`：把调用 `createInitialGame` 的入口改称“开始全新游戏”，不再冒充账本历史分支。
- `tests/world-ledger.test.mjs`：新增从零重建、快照等价、普通事件 reducer、截止重放、分支隔离、补偿撤销、篡改检测、V1 迁移和反事实测试。

## 7. 已运行命令及精确结果

- `git status --short --branch; git rev-parse HEAD`
  - 退出码：0。
  - 输出：`## main...origin/main`；未跟踪 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log`、`docs/REPAIR_CONTEXT.md`；HEAD 为 `04d6c07a5f05c49e86ff5aaba039c7794943c00f`。
  - 附带两条只读警告：无法访问 `C:\Users\Administrator/.config/git/ignore`（Permission denied），不影响结果。
- `Get-Content -LiteralPath package.json -Raw`
  - 退出码：0。
  - 核验 `version` 为 `0.4.0`；`memory:integration:audit` 和 `memory:integration:eval` 脚本存在。
- `rg -n "reflection|AutonomousDecisionFrame|AgentPlanningProjection|replayWorldLedger|memory:integration" app tests scripts docs package.json`
  - 退出码：0。
  - 定位到 `app/autonomous-agents.ts`、`app/world-runtime.ts`、`app/world-ledger.ts`、相关测试和记忆脚本。
- `Get-Content -LiteralPath docs\REPAIR_CONTEXT.md -Raw`
  - 退出码：0。
  - 文件可读；当前 PowerShell 输出代码页把 UTF-8 中文显示成乱码，属于终端显示问题，文件由 UTF-8 patch 创建。
- `npm.cmd run memory:integration:eval`
  - 退出码：1，耗时约 2.7 秒。
  - 在 `app/world-runtime.ts:183` 抛出 `AgentPlanningError`。
  - 12 个失败主体：`actor:klein`、`actor:dunn`、`actor:audrey`、`actor:azik`、`faction:night-church`、`faction:steam-church`、`faction:royal-project`、`faction:witch-sect`、`faction:aurora-order`、`faction:police`、`faction:press`、`faction:black-market`。
  - 每个失败原因均为“agentRef 与当前独立主体不一致”；`cachedProposalRefs` 为空。与交接描述完全一致。
- 修复后再次运行 `npm.cmd run memory:integration:eval`
  - 退出码：0，脚本总耗时约 11.1 秒。
  - 捕获调用：`dialogue, council, ability, situation, director, writer, editor, autonomous-agent, world`。
  - 性能：`{"events":10000,"derived":30000,"p95Ms":41.24,"totalMs":8985}`。
  - 输出：六类 Prompt 接入、只读检索、presented/recalled、propositionKey、计划/事件一致性、50 周路线全部通过；`RESULT=PASS`。
- 阶段 3 红测：`node --test --test-concurrency=1 tests/world-runtime.test.mjs tests/memory-audience.test.mjs`
  - 首次退出码：1；16 项中 14 通过、2 失败。
  - 失败 1：`faction memory receipts use an explicit audience and remain idempotent`，原因 `memory.factionAudience is not a function`。
  - 失败 2：`agent planning projections include bounded private memory with explicit actor and faction audiences`，原因 `memoryAudience` 为 `undefined`。
  - 实现专用投影和 faction 回执后重跑退出码：0；16/16 通过，约 0.60 秒。
- 阶段 3 事务红测：`node --test --test-concurrency=1 tests/turn-transaction.test.mjs`
  - 退出码：1；17 项中 16 通过、1 失败。
  - 失败项：`autonomous memory is delivered to each explicit audience only after the world week commits`。
  - 精确失败：捕获的 actor 独立规划投影 `dynamicMemory` 不包含“角色私有路线只经旧桥”，证明 `generateAiWorldDelta` 尚未把 `game.memory` 传入独立规划；失败事务保持原记忆不变的新增断言已通过。
- 阶段 3 实现后重跑 `node --test --test-concurrency=1 tests/turn-transaction.test.mjs`
  - 退出码：0；17/17 通过，约 0.80 秒。
  - 成功周的 actor/faction 投影均只含各自记忆；提交结果含每主体一组幂等 delivered/presented；失败周仍无回执写入。
- 阶段 3 类型检查：`npm.cmd run typecheck`
  - 退出码：0，约 7.7 秒；`prepare-lore` 检测到生成文件已存在并跳过，`tsc --noEmit` 无错误。
- 阶段 4 红测：`node --test --test-concurrency=1 tests/autonomous-agents.test.mjs`
  - 退出码：1；5 项中 3 通过、2 失败。
  - `structured reflection cites only visible experience and changes the next decision frame`：`reflection.version` 为 `undefined`，证明仍是字符串模板。
  - `legacy string reflection migrates deterministically without losing its text`：迁移后 `reflection.version` 仍为 `undefined`，证明旧反思没有结构迁移。
- 阶段 4 实现后重跑同一命令：退出码 0；5/5 通过，约 0.10 秒。
- 反思实现不增加新的模型调用：来源是主体可见的 WorldKernel 投影和权限过滤后的动态记忆投影，因此不存在“反思模型成功但周事务失败”的部分提交状态；所有 profile 更新仍只存在于最终返回的 `nextGame`。
- 阶段 3+4 联合回归：`node --test --test-concurrency=1 tests/autonomous-agents.test.mjs tests/world-runtime.test.mjs tests/memory-audience.test.mjs tests/turn-transaction.test.mjs`
  - 退出码：0；38/38 通过，约 1.40 秒。
- 阶段 4 类型检查：`npm.cmd run typecheck`
  - 退出码：0，约 5.4 秒；`tsc --noEmit` 无错误。
- 阶段 5 已修改审计/评测但尚待运行：integration-audit 将自治 Agent 纳入第七类正式调用点；integration-eval 增加真实 actor/faction 私有记忆、显式受众、引用预算、drives、结构化反思和提交回执断言。
- 首次并行运行阶段 5 审计/评测时，`memory:integration:eval` 退出码 1：`scenarioMemory(memoryModule, game)` 新签名在 50 周路线的第二个调用点仍以单参数调用，导致 `game.worldKernel` 读取 `undefined`。修复该测试桩调用；产品代码未改。
- `npm.cmd run memory:integration:audit`
  - 退出码：0；七类接线全部为 true，孤立事件检测为 true，无意外问题，`RESULT=PASS`。
- 修复后 `npm.cmd run memory:integration:eval`
  - 退出码：0，约 10.8 秒。
  - 捕获：`dialogue, council, ability, situation, director, writer, editor, autonomous-agent, world`。
  - 性能：`{"events":10000,"derived":30000,"p95Ms":36.73,"totalMs":8651}`；七类评测全部通过，`RESULT=PASS`。
- 阶段 6 红测：`node --test --test-concurrency=1 tests/world-ledger.test.mjs`
  - 首次退出码：1；模块加载失败，因为 `appendWorldLedgerCompensation` 等 V2 API 尚不存在。这证明新增测试先于实现。
- 阶段 6 初次实现后重跑同一命令：退出码 0；9/9 通过，约 0.18 秒。

## 8. 失败尝试和剩余工作

### 失败尝试

- `memory:integration:eval` 基线失败：陈旧测试桩为 12 个自治提案请求返回了错误 `agentRef`。这是预期需要修复的评测基础设施问题，不是产品校验问题。
- 根因已定位：`scripts/memory/integration-eval.mjs` 的 `makeMockFetch` 能解析独立规划请求末尾的 `{ projection, authorizedKnownLore, loreRecordIds }`，但请求分类器没有自治 Agent 分支，因而落入默认文学 JSON 输出；`requestAutonomousAgentProposal` 再把该对象送入 `validateAgentProposal`，产品端按设计拒绝缺失/错误的 `agentRef`。
- 修复决策：以 `payload.projection.agent.ref` 和 `payload.projection.week` 作为结构化识别条件，测试桩返回含 `version: 1`、匹配 `planningWeek/agentRef`、空目标/知识引用的合法等待提案；评测同时断言 12 个请求全部被识别、引用唯一且与各自投影一致。
- 上述失败已修复；当前无未解决的阶段 2 失败。

### 剩余工作

- 代码、自动测试和文档范围内无剩余实现工作。真人 5–20 小时体验尚未执行，这是明确的外部后续验证，不得由本任务伪造。

## 9. 下一次恢复时应立即执行的动作

1. 完整读取本文件。
2. 查看 `git status --short --branch`，确认仅有本任务改动和两个用户 QA 日志；不要删除或提交日志。
3. 若工作区未出现新的代码变化，直接依据第 10 节最终证据交付；不要重复实现或重新运行长测试。若有新变化，只重跑受影响专项和最终门禁。

## 10. 2026-08-09 自动压缩恢复增量（阶段 6 完成，阶段 7 开始）

- 已按恢复规则完整读取本文件。PowerShell 当前代码页导致中文输出乱码，但 UTF-8 文件内容未损坏。
- 阶段 6 已完成：账本 V2 的 schema、hash chain、事件 reducer、结构化 projection patch、从零/快照重放、sequence/week 截止、补偿事件、隔离分支、反事实运行和 V1 迁移均已实现。
- 阶段 6 验证：`node --test --test-concurrency=1 tests/world-ledger.test.mjs` 退出码 0，9/9 通过。
- 阶段 6 类型检查：`npm.cmd run typecheck` 退出码 0，`tsc --noEmit` 无错误。
- 阶段 6 相关回归：`node --test --test-concurrency=1 tests/world-ledger.test.mjs tests/turn-transaction.test.mjs tests/management-refactor.test.mjs tests/memory-save.test.mjs tests/horizon-persistence.test.mjs` 退出码 0，54/54 通过，约 2.95 秒。
- 为真实事务增加账本完整性断言后再次运行 `node --test --test-concurrency=1 tests/turn-transaction.test.mjs`：退出码 0，17/17 通过。
- 阶段 7 已开始；已新增 `tests/emergence-evaluation.test.mjs`，但尚未运行。它要求一个只接受 `automated-simulation` 证据的纯评测器，覆盖连续性、隐私、反思影响、关系因果、行动多样性/重复率、计划完成/放弃/改线、四类世界状态变化、跨模型比较、无意义事件和模板化反思，并明确 `humanPlaytestCompleted=false`。
- 当前立即动作：运行 `node --test --test-concurrency=1 tests/emergence-evaluation.test.mjs` 建立红测；记录精确失败；再实现 `app/emergence-evaluation.ts`、可执行 runner、评测说明、5/10/20 小时真人协议和空白记录模板。
- 阶段 7 红测已运行：`node --test --test-concurrency=1 tests/emergence-evaluation.test.mjs` 退出码 1，0/1 通过；Node v24.16.0 报 `ERR_MODULE_NOT_FOUND`，缺少 `D:\gmzz\app\emergence-evaluation.ts`。这是预期的先测后实现失败。
- 阶段 7 实现完成：新增 `app/emergence-evaluation.ts`、`scripts/emergence/eval.mjs`、`emergence:eval` npm script、自动评测说明、真人 5/10/20 小时协议和空白会话模板；可靠性文档已明确 20 周技术回归不等于好玩或真人体验。
- `node --test --test-concurrency=1 tests/emergence-evaluation.test.mjs`：退出码 0，2/2 通过，约 0.17 秒。
- `npm.cmd run emergence:eval`：退出码 0；默认 `synthetic-framework-fixture` 的 2 个运行、1 个跨模型比较、18 项阈值均通过；输出明确警告默认夹具只验证框架、不能作为产品质量或真人体验证据；`RESULT=PASS`。
- `npm.cmd run typecheck`：退出码 0；`tsc --noEmit` 无错误。
- 阶段 7 当前证据状态：没有创建或伪造任何已完成人类体验数据；只创建了协议与空白模板。
- 下一动作：检查 Git diff/status 和正式文档覆盖；更新本记录后运行用户指定专项测试、记忆审计/评测、账本/涌现测试、typecheck、build 和完整 `npm test`。
- 正式文档覆盖已补齐：`docs/AUTONOMOUS_WORLD_PHASE_2.md` 记录 actor/faction 投影、预算、回执和结构化反思闭环；`docs/memory.md` 把真实接线从六类改为七类并登记 faction 受众；`README.md` 链接账本 V2、涌现评测和真人协议并修正 20 周回归的证据边界。
- Git 状态检查确认 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 仍为未跟踪且未触碰；`git diff --check` 退出码 0，仅有仓库既有的 LF/CRLF 提示，无空白错误。
- 即将运行核心专项：用户指定的 8 个测试文件加 `tests/emergence-evaluation.test.mjs`；之后运行 memory integration audit/eval。若发生压缩，先读本文件，再查看这两批命令结果。
- 核心专项命令 `node --test --test-concurrency=1 tests/autonomous-agents.test.mjs tests/world-runtime.test.mjs tests/world-ledger.test.mjs tests/faction-strategy.test.mjs tests/memory-core.test.mjs tests/memory-integration.test.mjs tests/memory-audience.test.mjs tests/turn-transaction.test.mjs tests/emergence-evaluation.test.mjs`：退出码 0，65/65 通过，约 2.83 秒。
- `npm.cmd run memory:integration:audit`：退出码 0；七类接线全部为 true，孤立事件检测通过，无计划不一致、检索副作用或 Trace 越界；`RESULT=PASS`。
- `npm.cmd run memory:integration:eval`：退出码 0，约 11.3 秒；捕获 dialogue/council/ability/situation/director/writer/editor/autonomous-agent/world；10,000 事件、30,000 派生记忆，P95 34.41 ms，总计 8,509 ms；七类 Prompt、只读检索、回执、propositionKey、计划/事件一致性和 50 周路线通过；`RESULT=PASS`。
- 即将运行最终长门禁：`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd test`。完整测试会按标准脚本再次 build；不要因重复构建跳过。
- 最终 `npm.cmd run typecheck`：退出码 0，约 4.0 秒；`tsc --noEmit` 无错误。
- 最终独立 `npm.cmd run build`：退出码 0，约 5.2 秒；vinext/Vite 五阶段构建完成，97/201/103/1911/208 modules transformed；仅输出 vinext 无法静态分类动态 API 的提示，无构建错误。
- 完整 `npm.cmd test`：退出码 0，约 26.7 秒；先完成生产 build，再运行全仓测试；247 项中 243 通过、0 失败、4 跳过，总测试耗时约 21.50 秒。跳过项为公共空壳知识库的完整 lore 断言与 Playwright 不可用时的 PDF 实测，均为已有条件性跳过。
- 阶段 1–8 的实现和要求中的 typecheck/build/full test 已完成。剩余仅为 lint、最终 Git/空白检查、将完成状态与最终文件清单写入本文件，然后交付；不提交、不推送。
- `npm.cmd run lint`：退出码 0，约 12.8 秒；0 error、1 warning。唯一警告位于未修改的 `tests/gameplay-loop.regression-1.test.mjs:66`，变量 `council` 未使用。
- 最终 `git diff --check`：退出码 0；仅有 LF 将来可能转 CRLF 的提示，无空白错误。
- 最终检索确认没有把不存在的 `docs/GRILL_V04_DECISION_LEDGER.md` 当作证据；它只在本文件“非目标”中作为禁止事项出现。
- 最终工作区确认两个用户日志 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 仍为未跟踪，`git diff --numstat --` 对二者无输出，未被修改、删除或纳入提交。
- 阶段 7/8 新增或补充文件：`app/emergence-evaluation.ts`、`scripts/emergence/eval.mjs`、`tests/emergence-evaluation.test.mjs`、`docs/EMERGENCE_EVALUATION.md`、`docs/HUMAN_LONG_PLAYTEST_PROTOCOL.md`、`docs/templates/HUMAN_LONG_PLAYTEST_SESSION.md`、`README.md`、`docs/AUTONOMOUS_WORLD_PHASE_2.md`、`docs/memory.md`、`docs/WORLD_RUNTIME_RELIABILITY.md`、`package.json`。
- 最终状态：实现、自动测试、审计、typecheck、build、全量测试和文档均完成；没有提交、推送或发布。真人长线体验仍明确为“未执行”，只提供协议和空白模板。

## 11. 提交阶段

- 2026-08-09 用户已明确要求提交当前修复集。
- 提交范围包括本任务的自治 Agent、动态记忆、结构化反思、世界账本 V2、自动评测、测试与文档改动。
- `.qa-prodserver3.err.log` 和 `.qa-prodserver3.out.log` 必须继续保持未跟踪，不纳入提交。
- 本次只创建本地提交，不推送、不发布。最终 commit SHA 在交付消息中记录；本文件不自引用 SHA，避免 amend 改变哈希。
