# 《灰雾纪事》自治运行时修复上下文

最后更新：2026-08-09（第二轮规则、权限、认知与长期运行修复开始）

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

## 12. 第二轮缺陷修复任务（当前唯一进行中任务）

### 任务目标

- 修复审计确认的规则级问题，不只更新说明或降低校验。
- 保持当前 `main` 的 Autonomous Reflection、Actor/Faction 显式受众、Dynamic Memory 接线和 WorldLedger V2 能力。
- 每个阶段先增加能复现缺陷的测试，再实现并运行专项回归。
- 自动压缩或会话恢复后必须先完整读取本文件；以本节状态为准，不根据聊天摘要重建进度。
- 不触碰、删除或提交 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log`。

### 当前基线

- 分支 `main`，HEAD `debb4f9ceb6a5471a6dd33a7439f09502cea9b56`，与 `origin/main` 同步。
- 项目版本 `0.4.0`。
- 第二轮开始前专项测试 60/60 通过；`npm.cmd run typecheck` 通过。
- 最小运行探针已证明：未知结构化 `targetRefs` 和不存在的 `locationId` 会被 validator 接受；`faction:*` knowledge holder 不会派生 belief；12 条高 importance 旧事件会挤掉紧急承诺；连续提交 10 周后 Ledger 有 11 个完整快照。
- 默认 `emergence:eval` 仍为 `synthetic-framework-fixture`；真人 5–20 小时记录仍为 0。

### 已确认优先级与阶段

1. **阶段 A，规则确定性**：移除 ActionContract、规则 WorldFact、finale fact/chapter 等权威或持久对象的 wall-clock ID；为同一周多行动提供持久、确定且不碰撞的 action ordinal/nonce；验证冲突排序和材料品质不再受点击毫秒影响。
2. **阶段 B，Agent 目标权限**：从 Agent 的局部投影构建 `allowedTargetRefs` 和 `allowedLocationIds`；校验引用存在且主体有权知道；未知目标只能留在自然语言 intent，不能生成结构化实体引用。
3. **阶段 C，Faction 认知生产与决策 provenance**：补齐 faction holder 到 belief/event/plan/commitment/relationship 的派生；为正式 proposal/action/outcome 接入 `usedMemoryIds` 或等价 evidence refs，只允许引用本次投影展示的记忆。
4. **阶段 D，记忆相关性与 residency**：自治记忆排序加入 objective/nextAction/relationship/未决承诺/blocked plan 信号和类型配额；residency 加 deterministic wake-up、承诺期限、战略重要性和轮转，避免 active 自增强饿死冷角色。
5. **阶段 E，运行时可用性与成本**：增加 deterministic materiality gate，仅状态实质变化的主体重新调用模型；设计单 Agent 失败隔离，保持已完成提案缓存且不让一个主体永久阻断整周。
6. **阶段 F，Ledger 长线有界**：增加快照间隔和保留/归档策略；事件仍是事实来源，不能通过删除必要事件伪造有界。
7. **阶段 G，架构清理**：逐步从裁决 payload 退出 legacy 世界表示；增加 faction RAG audience；统一存档迁移 authority；拆分 God modules。
8. **阶段 H，产品与证据**：Great Smog authored spine 需要产品裁决后再改；真人 5–20 小时测试必须真实执行，不能由自动夹具代替。

### 当前进度

- [x] 完成第二轮源码审计、13 项分级、最小运行探针、专项测试和类型检查。
- [x] 将第二轮目标、基线、优先级和恢复规则写入本文件。
- [x] 阶段 A：新增确定性 ID 红测；已证明 action、chapter 的旧实现受 `Date.now()` 影响。
- [x] 阶段 A：实现确定性、持久、无碰撞的权威 ID。
- [x] 阶段 A：专项回归、类型检查并更新本节。
- [x] 阶段 B：Agent 目标与地点授权修复。
- [x] 阶段 C：Faction 认知派生与 `usedMemoryIds` 决策来源。
- [x] 阶段 D：记忆相关性排序与 Agent residency 唤醒。
- [x] 阶段 E：实质变化门与单 Agent 失败隔离。
- [x] 阶段 F：Ledger 快照间隔、保留与归档。
- [x] 阶段 G：双世界/RAG/迁移 authority/God modules 的本轮可验证拆分。
- [ ] 阶段 H：产品裁决与真人证据（需要用户产品选择与真实参与者，不能由代码代理伪造）。

### 当前立即动作

1. 执行本轮全量测试、typecheck、build、集成评测和 diff 检查。
2. Great Smog authored spine 保持现状，等待产品明确选择“canon campaign core”或“可选 sandbox”；未获选择前不得擅自删除主线。
3. 真人 5–20 小时证据保持 0，等待真实参与者按 `docs/HUMAN_LONG_PLAYTEST_PROTOCOL.md` 执行；自动夹具不得冒充。

### 阶段 A 完成证据（2026-08-09）

- `ActionContract` 增加持久 `actionOrdinal`；最终 ID 由周次、ordinal 和规则字段哈希组成，草稿 ID 也不依赖时钟。
- 本地章节、晋升事实、finale 章节/事实、开局事实、动态出身、议会议题/消息和人物对话消息均改为确定性身份。
- 新增 `app/stable-id.ts`，仅用于持久实体身份；剩余 `Date.now()` 只用于耗时遥测、UI 防抖和本地恢复检查点，不进入世界规则实体。
- 红测首次精确失败：同一状态在 `Date.now()=1000` 与 `9999999` 下得到 `action-1000`/`action-9999999`；章节得到 `chapter-1-100`/`chapter-1-200`。
- `node --test --test-concurrency=1 tests/deterministic-authority.test.mjs`：3 通过、0 失败、1 条因公共 lore 空壳条件跳过。
- `node --test --test-concurrency=1 tests/deterministic-authority.test.mjs tests/turn-transaction.test.mjs tests/memory-save.test.mjs tests/pathway-origins.test.mjs tests/world-ledger.test.mjs`：35 通过、0 失败、3 条条件跳过。
- `npm.cmd run typecheck`：退出码 0，`tsc --noEmit` 无错误。

### 阶段 B 完成证据（2026-08-09）

- `AutonomousDecisionFrame` 新增 `allowedTargetRefs`、`allowedLocationIds`；集合由主体自身、可见事件参与者、当前地点共同在场者、已知关系、可见知识主题、合法地点和自有项目确定性推导。
- `validateAgentProposal` 在格式校验之后验证每个结构化 target/location 的可见性与授权；未知目标仍可写在自然语言 intent，但不得伪造结构化引用。
- 独立规划 Prompt 明确要求逐字使用允许列表；`buildAdjudicatorProjection` 在扩展实体详情前按原决策帧二次复核，避免猜中隐藏 ID 后泄露详情。
- 阶段 B 红测首次运行：12 通过、2 失败；失败均为 `allowedTargetRefs` 尚不存在，精确覆盖缺陷。
- `node --test --test-concurrency=1 tests/world-runtime.test.mjs`：14/14 通过。
- `node --test --test-concurrency=1 tests/world-runtime.test.mjs tests/autonomous-agents.test.mjs tests/turn-transaction.test.mjs tests/three-week-regression.test.mjs`：37/37 通过。
- `npm.cmd run typecheck`：退出码 0，`tsc --noEmit` 无错误。

### 阶段 C 完成证据（2026-08-09）

- 世界状态派生会保留 `faction:*` observation holder，并为 faction 私有 knowledge 生成规范化 belief；faction 项目 owner/participant 规范化为 `faction:*`。
- `MemoryRegistry.organizationIds` 现在可校验 faction 参与的 belief/event/plan/commitment/relationship，不再把 faction 当未知角色拒绝。
- `AgentProposal` 新增 `usedMemoryIds`；独立规划只能引用本次 `AgentPlanningProjection.memoryReferenceIds` 的子集，伪造或跨主体引用会失败并进入原有重试流程。
- 每个自治提案写入仅该主体可见的 `autonomous-proposal:*` 账本事件；相关世界结果以 proposal event 为 cause，并在 payload 中保留 `usedMemoryIds` 来源。
- 阶段 C 红测首次运行：38 项中 35 通过、3 失败，分别精确覆盖 faction observer/belief/plan 未派生、proposal 来源未保留、账本无提案来源。
- 修复测试夹具使结果事件明确包含被测 faction 后，`tests/turn-transaction.test.mjs` 17/17 通过；没有通过放宽产品校验修复测试。
- 记忆/运行时/事务/Ledger 联合专项最终通过；`memory:integration:audit` 与 `memory:integration:eval` 均 `RESULT=PASS`，后者 10,000 事件、30,000 派生记忆 P95 37.01ms。
- `npm.cmd run typecheck`：退出码 0，`tsc --noEmit` 无错误。

### 阶段 D 完成证据（2026-08-09）

- 自治记忆排序加入 objective/nextAction/relationship 信号相关度、到期承诺提升、blocked/due plan 提升，并对 commitment/plan/relationship/belief/event 各保留最低类型席位。
- 选择算法仍逐条验证渲染预算，保持最多 12 refs、2800 chars；没有放宽隐私过滤。
- `AutonomousAgentProfile.lastActiveWeek` 持久化最近获得规划席位的周次；residency 加入承诺期限、blocked/active plan、战略关系和长期冷却分，最近事件改为有限最大值而非无界累加。
- previous-active 奖励从 20 降为 8，长期 cold 主体可确定性轮转回来；新事件唤醒逻辑保持。
- 阶段 D 红测首次 16 项中 14 通过、2 失败，精确证明旧事件挤掉紧急记忆及冷主体无法回归；实现后 world-runtime/autonomous 21/21 通过。
- 记忆/受众/事务/三周回归 29/29 通过；`memory:integration:eval` `RESULT=PASS`（10,000 事件、30,000 派生，P95 48.46ms）。
- `npm.cmd run typecheck`：退出码 0，`tsc --noEmit` 无错误。

### 阶段 E 完成证据（2026-08-09）

- `AutonomousAgentProfile.lastPlanningSignature` 持久化上一轮输入签名；签名覆盖 objective/nextAction、地点/资源、反思来源、可见 observation/knowledge、被选记忆、关系和活跃项目，不包含墙上时钟或周次噪声。
- 生产独立规划启用 `materialityGate`：签名未变时不调用模型，生成 `materiality-skip` 的本地 continue/wait 提案；目标变化只重开对应主体。
- 单主体在限定重试后使用 `deterministic-fallback` 私有等待提案，空 target/knowledge/memory 引用；成功 peer 缓存与世界周继续，降级原因写入 proposal ledger payload。
- 默认低层 API 仍支持 `abort`，用于需要严格失败语义的调用和回归；生产世界周显式选择 `fallback-wait`。
- 阶段 E 红测首次 18 项中 16 通过、2 失败，分别证明 planning signature/materiality gate 与 fallback policy 尚不存在；实现后 world-runtime 18/18 通过。
- 真实周事务测试已从“单 Agent 阻断整周”改为验证隔离降级、一次裁决、世界快照/账本提交、输入状态不被部分写回和成功提交后回执；17/17 通过。
- 三周回归通过；`memory:integration:eval` `RESULT=PASS`；`npm.cmd run typecheck` 通过。

### 阶段 F 完成证据（2026-08-09）

- 新增长线红测首次在 42 周产生 42 个完整 snapshots，精确证明按周线性增长。
- 新策略每 4 周生成检查点、最多保留最近 6 个；淘汰检查点累计 `snapshotArchive` 的 archivedCount/throughWeek/throughSequence/lastChecksum。
- 只压缩快照，不删除任何权威事件、原因引用或 hash chain；早期 `throughWeek` 在无对应快照时自动从事件流重放。
- 已有 V2 存档经 `migrateWorldLedger` 读取时同样归一化到保留上限；V1 仍按原有结构化迁移重建。
- 42 周测试确认 41 个 `week-committed` 全部保留、快照不超过 6、归档元数据存在、从零与快照重放相等、早期 week 17 可重放且完整性校验通过。
- Ledger/事务/存档联合专项修正旧“每周必有快照”断言后全部通过；`npm.cmd run typecheck` 通过，`git diff --check` 无空白错误。

### 阶段 G 完成证据（2026-08-09）

- RAG 类型、renderer bridge、Electron Main/Worker 和旧版 fallback 正式增加 `faction` / `faction-private`；自治规划根据显式 memory audience 选择 actor 或 faction，不再语义复用。
- `save-system.ts` 新增纯 `normalizeStoredGame` / `migrateStoredGame`，统一本地 v5–v21、导入 envelope 和当前存档规范化；`CompleteGame` 删除版本分支、世界/组织/账本重复拼装及相关迁移依赖。
- v5–v7 旧档继续作为带“旧历史分支”标记的历史纪事迁移；v8/v9 身份与议会默认值、v10–v20 能力字段均由中央入口兼容。
- 世界裁决 payload 删除顶层 legacy `game.factions` / `game.canonActors`，新增 `worldAuthority` 明确 `adjudicatorWorld` 是实体输入、`kernelDelta` 是状态变化 authority。
- `factionMoves` / `canonMoves` 降为旧 UI 可见叙述兼容输出；重叠的势力姿态/怀疑、人物地点/目标/处境/行动在应用 `kernelDelta` 后从 `WorldKernel` 反向投影，避免第二套数值状态写入。
- 新增 `app/autonomous-planning.ts`，从 `game-engine.ts` 提取自治 RAG 授权、检索和提案模型调用；存档恢复逻辑则从 `complete-game.tsx` 提取到 `save-system.ts`，God modules 本轮完成两条高风险边界的实质拆分，但没有宣称整个大文件已一次性消失。
- RAG 专项 6/6、迁移专项与静态架构回归通过；世界运行时/事务/玩法回归 42/42；自治规划+事务 22/22；`npm.cmd run typecheck` 通过。

### 第二轮最终自动验收（2026-08-09）

- `npm.cmd test`：生产构建成功；全量 261 项中 256 通过、0 失败、5 条条件跳过（公共空壳知识库或可选 Playwright）。
- `npm.cmd run lint`：0 error、0 warning。
- `npm.cmd run typecheck`：退出码 0。
- `memory:integration:audit`：`RESULT=PASS`；七类真实接线、孤立事件与边界检查通过。
- `memory:integration:eval`：`RESULT=PASS`；10,000 events / 30,000 derived，P95 43.2ms，50 周路线通过。
- `emergence:eval`：`RESULT=PASS`，但来源明确仍是 `synthetic-framework-fixture`，只证明评测框架，不计真人或产品质量证据。
- 最终专项复验覆盖 deterministic authority、RAG audience、存档迁移、事务、WorldRuntime、WorldLedger：57 通过、0 失败、1 条公共知识条件跳过；随后存档/Ledger 14/14 通过。
- `git diff --check`：退出码 0；仅 Git 的 LF→CRLF 提示，无空白错误。
- 用户原有未跟踪 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 仍存在且未修改、未删除、未提交。

### 仍需外部决定/执行（不得被自动压缩改写为“已完成”）

- Great Smog authored spine：这是产品定位选择，不是可安全自动判定的 correctness fix。当前保持“原著历史惯性上的 authored campaign + emergent world”。若用户选择纯/可选 sandbox，下一任务需设计 campaign mode、存档迁移、开局内容、时间线与终局入口，不能直接删除第 24 周代码。
- 真人 5–20 小时：当前完成记录仍为 0。必须由真实参与者依协议执行；默认合成夹具和 20 周模型技术回归均不得冒充。
- 本轮没有 commit、push 或发布。

## 13. 提交后继续清理（当前进行中）

- 已完成提交：`0b56b1b1d25589857d4a9c8bc084d60a56dfec19`（`fix: harden autonomous world authority`）；未推送。
- 用户要求继续。当前目标是在不改变玩法与产品定位的前提下，继续降低 `game-engine.ts` 的 God module 风险。
- 当前立即动作：提取纯 `world-adjudicator-input` 模块，统一构造模型裁决输入并集中维护 `worldAuthority`；同时提取 WorldKernel → legacy UI 的兼容投影，增加直接回归，确保 legacy 输出不能成为第二状态 authority。
- Great Smog 与真人长线证据仍维持上一节外部依赖状态，不得因“继续”而自动选择或伪造。
- `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 仍必须保持未跟踪且不修改。

### 13.1 World authority 边界提取（已完成）

- 新增 `app/world-authority.ts`：纯 `buildWorldAdjudicatorInput` 集中维护裁决 payload、组织/战役/高序列投影和 `worldAuthority`；`game-engine.ts` 不再内联拼装该大对象。
- 同模块的 `projectLegacyWorldCompatibility` 统一在 `kernelDelta` 应用后把 WorldKernel 的势力姿态/怀疑/行动与人物地点/目标/处境/行动投影回旧 UI；`canonMoves` 只能补 UI awareness，不能覆盖内核行动。
- 新增 `tests/world-authority.test.mjs`，直接证明裁决输入没有顶层 legacy factions/canonActors、designer supplement 有界、compatibility projection 不修改输入且以内核状态覆盖冲突输出。
- 首次组合测试因测试加载器同时加载两个 Vite runtime 模块而挂起，无产品异常；终止进程后把新测试改成顺序加载，单文件 2/2 通过。
- 最终 world-authority/事务/WorldRuntime/玩法专项 44/44 通过；`npm.cmd run typecheck` 通过。

### 当前立即动作（继续）

1. 从 `game-engine.ts` 提取世界模型输出的 faction move / public signal 结构化解析，形成纯、可单测的 adapter，继续缩小世界周事务函数。
2. 运行专项、lint、typecheck 与全量构建测试并更新本节。
3. 不处理 Great Smog 产品选择或伪造真人长线证据。

### 13.2 世界输出 adapter（已完成）

- 新增 `app/world-output-adapter.ts`，集中解析 `factionMoves`、`canonMoves`、`publicSignals` 与 `worldSummary` 基础字段；保留原有 ID 算法、数量/长度预算、枚举 fallback 和事务拒绝错误文本。
- 无效 faction/city/district 引用会被过滤或移除；模型少于两条公开消息、缺失城市气氛仍会拒绝整周结算，没有引入降级伪造。
- `game-engine.ts` 的世界周主事务改为消费 adapter 结果，不再内联维护格式白名单和消息 ID 生成。
- 新增 `tests/world-output-adapter.test.mjs`，覆盖确定性、字段有界、未知引用、默认枚举、过长暗流截断与两个拒绝条件。
- adapter/world-authority/三周/事务专项 22/22 通过；`npm.cmd run typecheck` 与 `npm.cmd run lint` 均通过。

### 当前立即动作（继续）

1. 评估 `CompleteGame` 剩余可纯化边界；优先提取 AI 设置与凭据持久化的纯解析/序列化逻辑，避免触碰 UI 行为。
2. 完成后运行专项与全量验收，再形成独立提交候选。

### 13.3 AI 设置存储纯化（已完成）

- 新增 `app/ai-settings-storage.ts`，集中定义 storage/session keys，并提供有类型白名单的解析、secure/session/legacy key 优先级解析和永不持久化明文 key 的序列化。
- `CompleteGame` 仍负责 Electron safeStorage 与 local/sessionStorage 副作用，但不再自己推断 provider、拼装 sanitization 或混合三种 key 来源。
- 旧 localStorage 明文 key 仍按原行为迁移到 OS 凭据库或当前 session；解析会忽略无效 provider/timeout 类型，配置对象不再意外携带 `rememberKey` UI 字段。
- 新增 `tests/ai-settings-storage.test.mjs`；安全静态回归改为检查中央 serializer。
- AI settings/security/render/save 专项 11/11 通过；`npm.cmd run typecheck` 与 `npm.cmd run lint` 均通过。

### 当前立即动作（最终验收）

1. 运行最终 `npm.cmd test`、lint、typecheck、diff check。
2. 核对工作树只包含本次继续清理和原有两个未跟踪日志。
3. 更新本节最终结果；等待用户决定是否提交本次后续清理。

### 13.4 提交后清理最终验收（2026-08-09）

- `npm.cmd test`：生产构建成功；全量 267 项中 262 通过、0 失败、5 条条件跳过（公共空壳知识库或可选 Playwright 条件）。
- `npm.cmd run lint`：退出码 0，ESLint 无错误。
- `npm.cmd run typecheck`：退出码 0，`tsc --noEmit` 无错误。
- `git diff --check`：退出码 0；仅有 Git 的 LF→CRLF 提示，无空白错误。
- `game-engine.ts` 当前 1975 行；本轮继续把世界裁决输入、兼容投影和模型输出解析移出主事务函数。`complete-game.tsx` 当前 1036 行；AI 设置的纯解析与序列化已移出组件。
- 当前未提交代码只涉及本轮继续清理：`world-authority`、`world-output-adapter`、`ai-settings-storage` 及其接线和回归测试；`docs/REPAIR_CONTEXT.md` 同步更新。
- 用户原有 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 仍为未跟踪状态，未修改、未删除、未纳入提交。
- 本轮后续清理尚未 commit、未 push；上一个已完成提交仍为 `0b56b1b1d25589857d4a9c8bc084d60a56dfec19`。
- Great Smog 产品定位与真人 5–20 小时证据仍是外部依赖，不因本轮代码验收而标记完成。

### 下一步

1. 本轮后续清理已达到可提交状态；等待用户下达提交指令。
2. 提交时继续排除两份 `.qa-prodserver3.*.log`，且不自动 push。

## 14. 用户指令：执行第 1、2 项并提交推送（当前进行中）

- 用户明确要求同时执行上一轮清单的第 1 项和第 2 项：保留并提交当前后续清理，并继续对 God modules 做实质拆分；完成后直接 commit 并 push 到 GitHub。
- 本轮已获得 push 授权；目标远端为 `origin`（`https://github.com/dongxuelian11/lord-of-mysteries-mist-chronicle.git`），当前分支为 `main`，本地相对 `origin/main` ahead 1。
- 必须先保留当前未提交的 `world-authority`、`world-output-adapter`、`ai-settings-storage` 及其测试，再选择下一条具有 locality/leverage 的 God module seam，补回归并运行全量质量门禁。
- 完成标准：本轮架构拆分通过专项测试、全量 `npm.cmd test`、lint、typecheck、`git diff --check`；创建新 commit；把此前未推送的 `0b56b1b` 与新 commit 一并推送到 `origin/main`；核验远端跟踪状态。
- 用户原有 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 必须保持未跟踪、未修改、未删除、未提交。
- Great Smog 产品选择与真人 5–20 小时证据不在本轮授权范围内，继续保持外部依赖状态。

### 当前进度

- [x] 把新目标、push 授权、远端和排除项写入持久记录。
- [ ] 审查 God modules 并选定下一条深模块 seam。
- [ ] 实施拆分与回归测试。
- [ ] 全量验收并更新本节。
- [ ] commit 并 push `origin/main`，核验远端。

### 14.1 God module 深化方案与实现（已完成，待全量验收）

- 按 `improve-codebase-architecture` 的 deletion test、locality 与 leverage 规则审查后，选择把世界裁决输出适配深化进现有 `world-output-adapter`，而不是整体搬迁已经具有深 interface 的 `resolveWeek`，也不搬移未被运行时调用的遗留函数。
- 架构报告生成于系统临时目录：`C:\Users\Administrator\AppData\Local\Temp\architecture-review-20260809-203853.html`，不进入仓库。
- `world-output-adapter.ts` 新增唯一公开深 interface `adaptWorldAdjudication`；一次调用同时完成公开消息、势力动作、城市气氛、WorldKernel 增量、ID 重映射、引用过滤、知识来源白名单与 canon 偏转门槛。
- 原 `parseWorldAdjudicationBasics` 与从 `game-engine.ts` 移入的 `parseWorldKernelDelta` 均成为 adapter 内部 implementation；`game-engine.ts` 不再持有 WorldKernel 模型输出字段知识，只消费适配后的 `kernelDelta`。
- 专项红测发现并修复原有来源缺口：模型显式引用不存在的 observation `eventId` 时，旧实现会静默挂到 fallback 事件；现在显式引用必须命中本周 ID 映射或已存在权威事件，否则该观察被拒绝。完全未提供引用时才允许使用本周 fallback。
- `tests/world-output-adapter.test.mjs` 改为只穿过新深 interface，覆盖确定性、公开输出拒绝、未知实体过滤、临时 cause ID 重映射、悬空因果删除、actor/faction holderRefs、loreRecordIds 白名单与低偏转 canon 锚定。
- `tests/gameplay-loop.regression-1.test.mjs` 增加静态架构防回流断言：`game-engine.ts` 不得重新定义 `parseWorldKernelDelta`。
- world-output/gameplay/事务/三周专项最终 27/27 通过；迁移后的首次 `npm.cmd run typecheck` 通过。

### 当前立即动作

1. 运行全量 `npm.cmd test`、lint、typecheck、`git diff --check`。
2. 核对 diff、未跟踪日志排除项和提交内容。
3. 创建提交并把本地两个提交推送到 `origin/main`，随后核验跟踪状态与远端 HEAD。

### 14.2 提交前最终验收（2026-08-09）

- `npm.cmd test`：生产构建成功；全量 267 项中 262 通过、0 失败、5 条条件跳过。
- `npm.cmd run lint`：迁移后首次发现并清除 `game-engine.ts` 的一个未使用 `WorldSignal` 类型；复跑退出码 0，0 error、0 warning。
- `npm.cmd run typecheck`：退出码 0，`tsc --noEmit` 无错误。
- `git diff --check`：退出码 0；仅 Git 的 LF→CRLF 提示，无空白错误。
- `game-engine.ts` 从本轮开始时 1975 行降至 1884 行；`world-output-adapter.ts` 现为 219 行。行数不是目标本身，验收重点是调用者只依赖一个深 interface，解析 implementation 与 authority 规则具有 locality。
- 工作树核对：除用户原有两份未跟踪 QA 日志外，只包含本轮第 1、2 项的代码、测试和本进度文件。
- 下一步仅剩：精确暂存任务文件（排除 `.qa-prodserver3.*.log`）、创建 commit、push `origin/main`、核验远端跟踪状态。

### 14.3 提交完成、推送等待明确远端授权

- 已创建提交 `6c02799`（完整 hash 由 Git 历史核验），提交信息为 `refactor: deepen world authority modules`；包含 11 个任务文件，802 insertions、221 deletions。
- 两份 `.qa-prodserver3.*.log` 未进入提交，仍保持未跟踪。
- 当前 `main` 相对 `origin/main` 有两个待推送提交：此前的 `0b56b1b` 与本次 `6c02799`。
- 已尝试按用户指令执行 `git push origin main`，但安全审查在建立网络推送前拒绝：需要用户明确确认确切远端与源码 payload。没有任何提交被推送。
- 待用户明确确认：允许把上述两个包含仓库源码与测试的提交推送到 `https://github.com/dongxuelian11/lord-of-mysteries-mist-chronicle.git` 的 `main` 分支。获得确认后立即推送并核验远端。

### 14.4 GitHub 推送授权已明确确认

- 用户已明确授权：将 `0b56b1b`、`6c02799`（包含仓库源码和测试），以及仅用于记录本次进度/推送结果的提交，推送到 `https://github.com/dongxuelian11/lord-of-mysteries-mist-chronicle.git` 的 `main` 分支。
- 当前动作：提交本进度记录；执行 `git push origin main`；读取本地跟踪状态与远端 `main` 引用进行核验。
- 两份 `.qa-prodserver3.*.log` 继续排除，不提交、不推送。

## 15. 2026-08-22 当前任务恢复覆盖（Gate 0 + PR1）

本节覆盖本文件中更早的 `main`/旧推送任务记录；当前任务以 `docs/CORE_GAMEPLAY_BUILD.md` 最新 Gate 0/PR1 节和实际 Git 状态为准。不要把旧的 `main` 推送授权迁移到当前分支。

- 当前工作区：`D:\gmzz`；当前分支：`codex/gate0-pr1-turn-guard`。
- 当前 HEAD：PR2 一次性实现提交为 `90b6407`（后续恢复文档提交不在此处硬编码）；Gate 0/PR1 代码修复提交为 `5e34789`，PR2-A 提交为 `2aeee12`，PR2-D 实现/测试/CORE 账本提交为 `78de1ee`。
- Gate 0 + PR1/MIST-TURN-01 仍保持完成；PR2-A、PR2-B、PR2-C、PR2-D 与本次整套 PR2 的独立 Codex 只读复审均为 `CLEAN`；本次最终复审覆盖 SQLite driver、IPC sender/key/payload、renderer authority、读写/传输 fail-closed、异步状态一致性和新增测试。
- 最新本地证据：`npm.cmd test` 369 项中 364 通过、5 跳过、0 失败；PR2 定向回归 34/34；typecheck、build、lint、bundle budget、diff check 和 Electron CJS syntax check 均通过；Gate 0 的 high-severity audit 退出码 0，保留 4 个 moderate 依赖告警，未执行 breaking `--force` 修复。
- 当前工作树除 PR2 持久化闭环代码、测试和账本文档外，仍只保留两个既有未跟踪 QA 日志 `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log`；日志不得删除、覆盖、提交或推送。
- 当前没有 push、开 PR、合并授权；远端 CI 仍为 `PENDING`。旧章节的 GitHub 推送授权不适用于本分支。
- Wave 3/PR2 持久化闭环已完成：active-save 先经 `app/persistence-authority.ts` 端口；SaveEnvelope checksum 与迁移边界经 `app/persistence-integrity.ts`/`app/save-system.ts` 锁定；recovery checkpoint 具备上限、旧键回退和损坏 fail-closed；桌面端通过 `electron/persistence-sqlite.cjs` 的内置 `node:sqlite` WAL store 与 Main IPC gateway 持久化，renderer 不获得文件系统能力；空数据库首次启动仍可从 localStorage/v20 兼容键迁移。当前证据仍只到本机闭环，不提升为跨设备、clean-machine 或生产可用证据，不改变产品定位或伪造真人长线证据。

### 当前下一步

1. Gate 0/PR1 不重做；若用户授权远端交付，再单独执行 push/开 PR 前的 exact-head 复核。
2. PR2 已一次完成；若继续开发，应另立 PR3 目标。当前不再拆分 PR2，不安装额外 native runtime，不改变已验证的 authority 介质边界。
3. 保持 Great Smog 产品选择和真人 5–20 小时证据为外部依赖，不能自动决定或伪造。

### 15.1. 2026-08-22 PR2-A 恢复覆盖

- PR2-A 提交 `2aeee12` 包含 `app/persistence-authority.ts`、`app/game-session-controller.ts`、`tests/persistence-authority.test.mjs` 与 `docs/CORE_GAMEPLAY_BUILD.md`；两个 `.qa-prodserver3.*.log` 仍未跟踪、未修改、未提交。
- 适配器行为已由 4 项公开端口测试锁定：当前键优先、旧键有序回退、空值按旧逻辑视为缺失、写入/清理只作用于当前键。
- 定向回归 38/38、全量 341 中 336 通过/5 跳过/0 失败；typecheck、lint、bundle budget、diff check 均通过。
- 同一项目既有 Codex 独立审阅线程已复核当前工作树的 PR2-A 三文件：`CLEAN`，未发现 `[P1]`/`[P2]`；审阅只读，无文件修改。
- 该阶段后续的 PR2-C recovery contract 已在 `7f31b40` 完成；当前恢复点见 15.3，不能把 adapter 证据升级为 SQLite、跨机器或生产可用证据。

### 15.2. 2026-08-22 PR2-B 恢复覆盖

- PR2-B 提交 `02e5dba` 包含 `app/persistence-integrity.ts`、`app/save-system.ts`、`tests/persistence-integrity.test.mjs`、`docs/PR2_PERSISTENCE_DESIGN.md` 和 `docs/CORE_GAMEPLAY_BUILD.md`；两个 `.qa-prodserver3.*.log` 仍未跟踪、未修改、未提交。
- integrity 边界已由 3 项测试锁定：确定性 checksum、SaveEnvelope 共享校验与篡改拒绝、非 JSON 输入 fail-closed；原 SaveEnvelope 格式与错误语义保持不变。
- PR2-B 定向回归 41/41、全量 344 中 339 通过/5 跳过/0 失败；typecheck、lint、bundle budget、diff check 均通过。
- 同一项目既有 Codex 独立审阅线程复核 PR2-B 变更：`CLEAN`，未发现 `[P1]`/`[P2]`；设计文档把 SQLite/WAL/Main gateway/生产迁移明确列为未实现未来契约。
- 该阶段后续的 PR2-C recovery contract 已在 `7f31b40` 完成；当前恢复点见 15.3，不能把纯 integrity 证据升级为 SQLite、跨机器或生产可用证据。

### 15.3. 2026-08-22 PR2-C 恢复覆盖

- PR2-C 提交 `7f31b40` 仅包含 `tests/recovery-checkpoint.test.mjs` 与 `docs/CORE_GAMEPLAY_BUILD.md`；两个 `.qa-prodserver3.*.log` 仍未跟踪、未修改、未提交。
- recovery contract 已由 3 项公开行为测试锁定：当前键最多三条有效记录、旧键声明顺序回退、当前键 malformed 时 fail-closed 且不静默回退；全局 `window` 在测试后恢复。
- 全量回归 347 中 342 通过/5 跳过/0 失败；lint、bundle budget、diff check 均通过。
- 同一项目既有 Codex 独立审阅线程复核 PR2-C 测试：`CLEAN`，未发现 `[P1]`/`[P2]`；审阅只读，无文件修改。
- 未推送、未开 PR、未合并；远端 CI 仍为 `PENDING`。PR2 已完成，下一步若继续只建立独立 PR3 目标，不能把 migration/recovery/SQLite 本机证据升级为跨机器或生产可用证据。

### 15.4. 2026-08-22 PR2-D 恢复覆盖

- PR2-D 代码与测试本地完成：`app/save-system.ts` 在 `normalizeStoredGame` 后重算 envelope checksum；`tests/persistence-migration-boundary.test.mjs` 锁定 unknown schema、截断 JSON、v20→v21 确定性迁移、round-trip 再导入和 source 不变。对应实现/测试/CORE 账本提交为 `78de1ee`。
- PR2-D 定向测试 3/3，联合 PR2-A/B/C/D 定向回归 47/47；全量 `npm.cmd test` 350 中 345 通过/5 跳过/0 失败；typecheck、lint、bundle budget、diff check 均通过。
- 同一项目既有 Codex 独立审阅线程首次发现 `[P2]`：迁移后保留旧 checksum 导致 round-trip 失败；最小修复后第二次复审为 `CLEAN`，未发现 `[P1]`/`[P2]`/`[P3]`，且确认测试未宣称 SQLite/WAL/生产迁移已实现。
- 未推送、未开 PR、未合并；两个 `.qa-prodserver3.*.log` 仍未跟踪、未修改、未提交。PR2 后续不再拆分；若继续，应另立 PR3，并重新定义范围与证据门禁。

### 15.5. 2026-08-22 PR2 持久化闭环恢复覆盖

- PR2 一次性闭环已实现，代码提交为 `90b6407`：`electron/persistence-sqlite.cjs`（WAL/FULL、记录 schema/checksum、atomic batch、recovery append）、`electron/persistence-ipc.cjs`（key/payload/sender 门禁）、`electron/main.cjs`/`electron/preload.cjs`（Main 生命周期与受限 bridge）、renderer active-save/recovery 接线、异步状态防陈旧覆盖和首次 localStorage 迁移回退。
- 新增 `tests/persistence-sqlite.test.mjs`、`tests/persistence-ipc.test.mjs`、`tests/persistence-bridge.test.mjs`；SQLite/IPC/bridge/迁移/recovery 定向 34/34；全量 369 中 364 通过/5 跳过/0 失败；typecheck、build、lint、bundle budget、diff check、Electron CJS syntax check 均通过。
- `docs/PR2_PERSISTENCE_DESIGN.md` 与 `docs/CORE_GAMEPLAY_BUILD.md` 已更新为 PR2 完成状态；本机 SQLite/WAL 与 renderer authority 已有测试证据，但跨设备、clean-machine、长期生产和真人 5–20 小时仍未证明。
- 本次整套 diff 的 Codex 独立只读审阅最终结论为 `CLEAN`；覆盖 driver、IPC、renderer 接线、迁移、异步状态一致性、读写/传输 fail-closed 和新增测试。审阅未修改文件；不声称 clean-machine、Electron 实机或生产证据。
- 未推送、未开 PR、未合并；两个 `.qa-prodserver3.*.log` 继续未跟踪、未修改、未提交。PR2 已收口，下一阶段只允许另立 PR3。

### 15.6. 2026-08-22 PR3 打包桌面持久化启动资格恢复覆盖

- PR3 目标已收敛为一个有界增量：把 PR2 的 SQLite/WAL 本机边界接入现有 installer smoke，确认隔离 `GMZZ_USER_DATA` 首次启动确实创建 `mist-chronicle.sqlite`，并以 read-only probe 验证 `journal_mode=wal`、`persistence_records` 及六个必要列。
- 当前变更文件：`scripts/release/smoke-installer.ps1`、`scripts/release/verify-persistence-db.mjs`、`tests/release-persistence-smoke.test.mjs`、`docs/PR3_PACKAGED_RUNTIME_QUALIFICATION.md` 和本账本/核心账本更新；不触碰两个 `.qa-prodserver3.*.log`。
- 证据边界：probe 只验证启动 schema，不写业务记录，不宣称 renderer 保存—退出—重启恢复；clean-machine、跨设备、升级迁移、生产可用性和真人 5–20 小时仍为 `NOT_AVAILABLE`。若本轮没有实际构建并运行安装包，installer `release:smoke` 仍记为 `NOT_RUN`。
- 当前进度：PR3 定向测试 3/3、全量 `npm.cmd test` 372 中 367 通过/5 跳过/0 失败、typecheck、lint、bundle budget、Node syntax check、PowerShell parse 和 diff check 均通过；既有 Codex 独立只读复审为 `CLEAN`。`npm.cmd run dist:win` 在 `release:verify:seed` 因 `seed-manifest-missing` 未生成 installer，故 `release:smoke` 记为 `NOT_RUN`。实现与证据整理已提交为 `68f0598`；未 push、未建 PR、未合并，工作树只保留两个既有未跟踪 QA 日志。
