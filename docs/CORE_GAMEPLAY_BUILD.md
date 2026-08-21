# 《灰雾纪事》核心玩法构建总账

状态：执行中
最后更新：2026-08-21
维护规则：每完成一个工作包，必须更新本文件的状态、证据与下一步。后续会话先读本文件，再读 `git status --short`，不得依赖聊天上下文恢复目标。

## 北极星体验

> 我是秘密非凡组织的首领；我决定组织下一步要改变什么、交给谁去做，世界自行回应，并把一切后果写成不可回头的纪事。

最小循环：**看局势 → 定目标 → 派人授权 → 世界回应 → 看见回响**。

干部讨论、地图部署、资源投入和亲自介入是完成这个循环的手段，不是并列的顶层模式。玩家可以下达任意数量的命令，但不管理行动点、周日程、排班或任务步骤；时间、地点、人员与资源冲突由后台裁定。

## 不可回退的产品约束

1. 每轮最多三件大事。通常最多两件世界压力，至少一件关联玩家当前主战略；只有生存危机可以占满三件，并说明被中断的长期计划。
2. 玩家只做三类决定：改变什么；交给谁、投入多少、授权到哪里；是否亲自介入。
3. 每个重大议题必须说明发生了什么、原因、与既往决定的关系、合适负责人、推荐方案、两种执行风险和不处理的后果。
4. 结果必须写回人员、资源、地点、知识与关系，并保留未来因果线；不得只展示数值涨跌或后台日志。
5. 世界始终运行。玩家注意力改变操作粒度，不提供数值加成，也不允许回到过去。
6. 成长表现为操作更少、命令尺度更大、世界反应更强，不得表现为更多管理页。
7. AI 建议是可编辑的自然语言起点；玩家可采用、修改、组合、否决或输入完全不同的命令。
8. Agent、RAG、Fate、记忆、账本、replay 和 branch 是后台能力。玩家不能回档、分支或重掷结果。
9. 所有能力、污染、晋升、人物认知、历史与世界规则必须服从知识库；小说必须来自真实因果。

## 目标信息架构

| 玩家表面 | 责任 | 默认粒度 |
|---|---|---|
| 最高议会 | 三件大事、四名负责人、自由指令、授权、地图入口 | 一级 |
| 世界回应与纪事 | 小说化结果、具体变化、未来因果 | 一级 |
| 亲历场景 | 玩家本人承担风险时连续自由输入 | 一级 |
| 组织总账 | 三资源、四负责人、异常、总体能力 | 二级 |
| 人事、配方、封印物、分部 | 只在使用或异常时展开 | 二级 |
| 推演内核 | Agent、裁定、记忆、Fate、账本、日程和任务步骤 | 后台 |

## 工作包与依赖

状态值：`待开始`、`进行中`、`已完成`、`受阻`。

| ID | 状态 | 工作包 | 依赖 | 主要文件 | 验收标准 |
|---|---|---|---|---|---|
| CG-01 | 已完成 | 议会收敛为单一决策面 | 无 | `app/weekly-council.tsx`, `app/weekly-council.css`, `app/council-focus.ts` | 没有报告/议程/讨论/命令固定阶段；同屏看到最多三件大事、负责人入口、自由指令、已下决议和世界回响 |
| CG-02 | 已完成 | 三件大事筛选与因果说明 | CG-01 | `app/council-focus.ts`, 世界输出适配层 | 默认最多两件世界压力；主战略保留一席；普通部门报告不进入议会；卡片字段覆盖原因、推荐、风险、不处理后果 |
| CG-03 | 已完成 | 首领指令与授权契约 | CG-01 | `app/game-model.ts`, `app/game-engine.ts`, AI 意图解析 | 契约显式表达目标、负责人、资源姿态、授权边界、请示条件、亲历条件；不要求玩家输入天数或排班 |
| CG-04 | 已完成 | 干部方案与可编辑起点 | CG-02, CG-03 | `app/council-focus.ts`, `app/council-system.ts`, `app/weekly-council.tsx` | 每个重大议题有一个推荐方案和 1–2 个真实替代意见；一键写入输入框但不直接执行 |
| CG-05 | 已完成 | 后台冲突裁定与异常上浮 | CG-03 | `app/game-engine.ts`, `app/world-runtime.ts` | 任意数量命令可提交；冲突由后台排序、降效、中断或生成请示；普通日程不展示给玩家 |
| CG-06 | 已完成 | 世界回应因果收据 | CG-02, CG-05 | `app/world-output-adapter.ts`, `app/game-model.ts` | 每轮输出人员、资源、地点、知识、关系、未来因果六类变化；只显示与玩家有关且可知的内容 |
| CG-07 | 已完成 | 纪事与规则统一 | CG-06 | `app/literary-generation-service.ts`, `app/chronicle-causality.ts`, 纪事阅读器 | 小说段落能追溯到真实行动结果/世界事件；摘要短且有决策密度；晋升时生成阶段回望 |
| CG-08 | 已完成 | 组织总账渐进披露 | CG-01 | `app/organization-management-console.tsx`, `app/management-console.css` | 默认只显示三资源、四负责人、异常和总体能力；人事/配方/封印物/分部只按需展开；隐藏外部势力精确数值 |
| CG-09 | 已完成 | 注意力驱动模拟 | CG-05, CG-06 | `app/attention-simulation.ts`, `app/game-engine.ts`, `app/organization-management-console.tsx` | 成熟流程可经玩家确认后自动运行；稳定城市可收拢为摘要；任何早期地点/人物仍可重新展开 |
| CG-10 | 已完成 | 长期成长与规模测试 | CG-07, CG-08, CG-09 | `tests/scale-regression.test.mjs`, 保存与账本回归 | 组织规模增长不会线性增加操作；10/30/100 周长跑保持三件大事纪律和可恢复一致性 |

### 当前权威状态（2026-08-20 · I）

CG-01 至 CG-10 全部已完成，剩余 0 个未开发工作包。后续会话以本段和表格为准；下方历史记录中的“当前工作包”只保留当时断点，不覆盖最新状态。

## 当前迭代：核心循环竖切 A

目标：不改写可靠的世界运行时，先让玩家表面第一次真正呈现“看三件大事 → 问负责人 → 写入/修改指令 → 委派或亲历 → 闭会推演 → 阅读回响”。

本批范围：

- 新增纯函数筛选本轮最多三件大事，并提供稳定的卡片视图模型。
- 将 `weekly-council.tsx` 从四阶段/四文书改为一个连续决策面。
- 保留负责人对话、自由讨论、地图、自由命令、委派/亲历、已下决议、闭会推演与纪事入口。
- 从玩家表面移除周日程条、持续天数与精确预算展示；后台 `ScheduledAction` 暂时保留兼容性。
- 更新回归测试，锁定单一决策面和地图建议回填行为。

本批不做：

- 不改 Agent、Fate、RAG、WorldLedger 和原子提交流程。
- 不在同一批次重写组织总账、AI 方案生成或长期注意力模拟。
- 不删除兼容字段；先隐藏玩家不应管理的实现细节，再在 CG-03/CG-05 收敛数据契约。

## 已确认的后台基础

- `app/world-runtime.ts` 已支持独立 Agent 规划、有限相关性投影、世界裁定与失败隔离。
- `app/game-engine.ts` 已允许命令在无干净日程槽时继续提交，由世界裁定排序、降效、中断或例外。
- `app/participation-scene-overlay.tsx` 与参与场景状态已支持事实先锁定、玩家连续输入、完成后继续推演。
- `WorldLedger`、动态记忆、Fate 与知识权限继续作为隐藏基础设施，不在玩家界面暴露。

## 恢复与交接协议

后续开发会话必须按以下顺序恢复：

1. 读取本文件的“北极星体验”“不可回退约束”“工作包与依赖”“当前迭代”。
2. 运行 `git status --short`，区分用户原有改动与本项目改动，不得清理未知文件。
3. 找到第一个 `进行中` 工作包；核对其验收标准和最近测试证据。
4. 完成实现后运行与改动成比例的 typecheck、定向测试和 build。
5. 更新本文件：状态、实现证据、验证命令、未解决问题和下一工作包。

## 实现记录

### 2026-08-09 · 核心循环竖切 A

- 状态：CG-01 已完成；CG-02 已完成可由现有数据支持的第一层，权威因果聚合仍待继续。
- 决策：先收敛玩家表面，不重写已经可靠的后台推演。
- 已实现：
  - 新增 `app/council-focus.ts`，稳定筛出最多三件大事。
  - 普通轮始终为主战略保留一席，世界/组织压力最多两席；生存危机可占满三席，并明确被中断的长期方向。
  - 普通部门报告不进入议会，只有 `requiresDecision` 的例外可以上浮。
  - 每件大事现在包含发生事实、出现原因、既往决议关系、推荐负责人、推荐方案、替代意见、委派风险、亲历风险与不处理后果。
  - `weekly-council.tsx` 删除四阶段和四文书入口，改为上一轮回响、三件大事、四负责人、干部讨论、自由指令、已下指令的单一连续页面。
  - 玩家表面不再显示周一至周日排期、行动天数、精确行动预算或“重点叙事”开关；底层兼容字段暂时保留。
  - 行动确认窗改为目标、执行方向与投入尺度、未知、授权边界和重新请示条件。
  - 亲历与纪事界面移除了“后台锁定”“世界分支”“权威账本”等技术措辞。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `npm.cmd test`：构建通过；282 项测试中 277 通过、5 项按公共空壳知识库/可选 Playwright 条件跳过、0 失败。
  - 新增 `tests/council-prioritization.test.mjs`；重写议会导航与渲染边界回归断言。
- 未解决事实：
  - 当前大事的“与过去决定有关”只能在来源不足时诚实标记未知；还没有把 `worldKernel.events[].causeIds`、知识授予、关系记忆和持续项目聚合为权威因果收据。
  - `ActionContract` 仍是日程化兼容模型，`days/startDay` 虽已隐藏但仍主导后台静态冲突。
  - 当前 `ActionReview.status === "limited"` 只有文字限制，结算并不会真正执行该限制；不得对玩家宣称授权边界已经生效。

### 2026-08-09 · 首领指令与真实授权裁定 B

- 状态：CG-03 已完成；CG-05 已完成玩家指令侧的资源、时段、受限执行与升级请示闭环，Agent 提案统一仍待继续。
- 已实现：
  - `ActionContract` 新增资源姿态、金钱/人力/非凡材料承诺、严格/有界/广泛授权、红线、必须请示条件、撤退条件、知识与因果引用；旧 `budget/redLines/retreat/days/startDay` 暂时保留为兼容镜像或后台计划。
  - 本地与 AI 意图解析都会从自由文本生成新合同。AI 只能收紧授权，不能删除本地红线、请示条件或撤退条件；知识、议题、战略与事件引用必须来自玩家可见的真实 ID。
  - 提交阶段不再因债务线或负责人状态拒绝玩家下令；所有命令先进入统一裁定。
  - `WorldActionProposal` 已完整携带三类资源、授权、必要知识与因果引用；账本保留提案、审查、实际执行计划与来源事件。
  - 新增权威 `ExecutionPlan`。有界/广泛授权可在允许范围内缩减资源、收紧可见性或改到本周空闲时段；严格授权与明确请示边界不会被后台暗改，而会成为 `escalation-required`。
  - `resolveWeek` 只执行 `executionPlan.executable === true` 的行动，按获批资金扣费、按实际时长增加疲劳、按资源满足度调整成功阈值，并从组织总账扣除实际使用的非凡材料。
  - 需要升级请示的行动不进入世界结算、不消耗资源，并生成下一轮“需要追加授权”的待裁决事项。
  - 指令回执与实际行动已分流：`escalation-required/rejected` 不再制造部门积压、成员压力、地图暴露、污染、致命现场、亲历场景或 AI 现场报告；世界运行时把“没有任何获批行动”当作安静周继续自主运行。
  - WorldLedger 使用同一 `actionId` 串联 proposed/reviewed/resolved；升级请示不会再被投影为 accepted，resolved 事件以 review 为直接因果来源。
  - 旧存档中的排期合同和纪事结果合同采用 additive normalization，无 schema bump；输入不被原地修改。
  - 指令确认窗显示资源姿态、调用的资源类型、授权尺度和请示边界数量，仍不要求玩家管理精确日历。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `node --test tests/leader-directive.test.mjs tests/leader-directive-save.test.mjs tests/world-ledger.test.mjs`：18/18 通过。
  - `npm.cmd test`：构建通过；289 项测试中 284 通过、5 项按公共空壳知识库/可选 Playwright 条件跳过、0 失败。
- 仍未解决：
  - 玩家指令与自主 Agent 提案仍在两个阶段产生，尚未进入同一个资源/人员/地点冲突批次；不能宣称所有世界行动已经统一裁定。
  - 本周完全塞不下的指令目前升级请示，没有跨周 `deferred` 队列；执行中的中断与部分完成也还没有权威状态。
  - `ActionResult` 尚未形成“人员、资源、地点、知识、关系、未来因果”六类结构化回响收据。
  - 三件大事的因果说明虽然可以引用 `sourceIssueId/strategyIntentId/causeEventIds`，但议会聚合层尚未消费这些权威引用。

## 当前状态与立即动作

当前工作包：**CG-05（统一冲突裁定）进行中；CG-02 的权威因果补全等待消费本批新增引用**。

下一次开发从这里开始：

1. 为自主 `AgentProposal` 增加适配器，使玩家指令与 Agent 行动最终进入同一 `WorldActionProposal` 裁定批次；统一人员、地点、设施、知识和资源冲突，不改 WorldKernel 的原子提交边界。
2. 增加权威的 `deferred/interrupted/partially-completed` 执行状态：跨周延后必须持久化并进入下一周裁定；中断必须记录已经消耗的资源和已发生的可见后果。
3. 在 `ActionResult` 建立六类结构化因果收据：人员、资源、地点、知识、关系、未来因果；先由规则和 WorldKernel 事实生成，再让小说消费。
4. 让 `council-focus.ts` 优先消费 `sourceIssueId/strategyIntentId/causeEventIds`，把“为什么发生、与哪项过去决定有关”从启发式文本升级为权威因果说明。
5. 补玩家与 Agent 同批冲突、跨周延后、部分中断、六类收据和因果议题聚合测试，再进入 CG-04 干部方案与可编辑起点。

当前阻塞：无。

### 2026-08-10 · 统一裁决与跨周执行 C

- 状态：CG-05 的首领指令持续执行、Agent 同周避让和玩家语言异常回执已经落地；CG-05 仍保持“进行中”，因为运行中的真实红线中断尚未由 WorldKernel 结果反向生成，世界输出也还缺少强制 `sourceProposalIds` 归因校验。
- 已实现：
  - `ScheduledAction` 新增权威执行状态：来源周、尝试序号、进度、累计消耗、下次可执行周、最后尝试与后果事件；`deferred / partially-completed / interrupted / awaiting-authorization` 会跨周保留，不再在闭会时清空。
  - 每次执行使用稳定 `attemptId`；金钱和非凡材料按剩余额度投入，人力按当周并发容量重新占用，避免跨周重复扣减或错误耗尽。
  - 后台裁决现在能在授权范围内改期、执行最大连续片段或顺延；严格授权发生冲突时停下请示，不擅自改写命令。
  - `ActionResult` 持久携带实际 `executionPlan`；WorldLedger 新增 `action-progressed` 回执，记录进度前后、实际资源、累计消耗、下次资格与因果事件，同一 `attemptId` 重放时不会重复推进。
  - 自主 `AgentProposal` 通过纯适配器进入同一 `WorldActionProposal` 规则模型；首领已经锁定的人员、设施和时段作为只读保留项，Agent 在同周避让、等待或部分执行，且不会错误消耗玩家组织资源，也不会向玩家生成授权请示。
  - 只有通过统一裁决且可执行的 Agent 提案进入世界模型的变更依据；原始 Agent 规划缓存、私有记忆提交和 WorldKernel 原子提交边界保持不变。
  - 授权请示、顺延、部分完成和中断在议会中使用首领语言呈现；只解析玩家可见的指令、战略与事件名称，不泄漏 `executionPlan`、具体日期、改期或账本 ID。
  - 对授权请示重新下令时，新的指令会替换旧的等待项并将原议题标记为已处理，避免旧命令与追加授权并存。
  - 存档采用 additive normalization：旧排期补执行状态，终态旧行动不会重新入队，新执行进度和累计消耗可无损往返，不提升存档 schema。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - 定向测试：首领指令、存档、议会投影、渲染防泄漏、账本共 33/33 通过。
  - `tests/turn-transaction.test.mjs`：17/17 通过，确认 Agent 记忆仍只在世界周提交后交付，失败降级与重试缓存未被破坏。
  - `npm.cmd test` 首次集成发现 2 条旧 Agent 审计事件兼容回归；已修复为“保留稳定审计事件并共享统一 actionId”，定向事务测试已恢复。最终全量结果见本记录之后的最新验证更新。
- 明确边界：
  - 这是“首领命令先锁定、自治主体在同周统一规则中避让”的安全非对称裁决，不是把亲历场景前移后的完全同时竞价。
  - 当前统一冲突覆盖人员、设施、时段、知识和首领资源；Agent 尚无同伴、设施和独立资源承诺字段，地点/目标语义冲突仍主要由世界模型处理。
  - 世界输出适配器尚未强制每个 mutation 声明并验证 `sourceProposalIds`，因此不能把 CG-06 的强因果收据视为完成。

## 自动压缩恢复断点（2026-08-10）

当前工作包：**CG-05 进行中，核心跨周队列和 Agent 避让已完成；下一批进入 CG-06，并补完 CG-05 的运行时中断来源。**

下一批严格从这里开始：

1. 在 `world-adjudication-protocol.ts` 与 `world-output-adapter.ts` 要求所有世界事件/实体更新携带 `sourceProposalIds`，只允许引用本周可执行的首领或 Agent 提案；拒绝提案不得成为 mutation 依据。
2. 从 WorldKernel 的红线触发、撤退条件和已提交结果生成真实 `interrupted` 回执，保留已发生后果和资源消耗，只把未完成部分续入下一周。
3. 为 `ActionResult` 增加六类结构化因果收据：人员、资源、地点、知识、关系、未来因果；由规则结果和 WorldKernel 事实生成，不由小说反推。
4. 让纪事与下一轮三件大事消费这些结构化收据，替代启发式文本匹配；继续只展示玩家可知事实。
5. 增加“拒绝 Agent 不产生 kernel mutation”“中断只消费已执行片段”“同 attempt 重放不重复扣费”“六类收据可见性”事务测试。

当前阻塞：无。不要清理 `.qa-prodserver3.err.log` 或 `.qa-prodserver3.out.log`；它们是未知来源文件。

最终验证更新：`npm.cmd test` 已通过；共 297 项，292 通过、5 项因公共空壳知识库或可选 Playwright 条件跳过、0 失败。构建包含在该命令中并通过。

### 2026-08-18 · 提案归因、真实中断与因果收据 D

- 状态：CG-02、CG-05、CG-06 已完成；核心循环的下一块玩家可见缺口转为 CG-04“干部方案与可编辑起点”。
- 已实现：
  - 世界裁定协议要求所有新增实体、世界事件和实体/地点更新声明 `sourceProposalIds`；适配器只保留本周真正可执行的首领或 Agent 提案引用。无来源、引用被拒绝提案或只引用等待项的 mutation 在进入 WorldKernel 前被移除。
  - WorldLedger 的世界事件因果改为消费持久化的 `sourceProposalIds`，不再按行动者或势力名称猜测贡献提案；既有 Agent 审计事件 ID 仍兼容保留。
  - 运行时中断必须同时满足三项证据：本周已执行的提案、引用该提案且成功进入 WorldKernel 的事件、与指令红线/请示条件/撤退条件逐字一致的触发边界。缺少任一项都不能把行动写成中断。
  - 中断只保留已完成片段：按完成比例缩放资金、非凡材料、灵性、组织状态和任务进度；未使用资源返还，已发生世界事件保留，未完成部分带累计消耗和因果事件进入下一周。人力继续按当周并发容量处理，不被错误永久耗尽。
  - `ActionResult` 新增人员、资源、地点、知识、关系、未来因果六类结构化收据。收据只从规则结算、带提案来源的玩家可见事件、可见观察与 KnowledgeGrant 派生；隐藏事件标题和账本 ID 不进入玩家回响。
  - 议会的上一轮回响直接展示结构化收据摘要；存档采用 additive normalization，旧纪事无需 schema bump，新收据可安全往返并过滤畸形条目。
  - 世界推演失败仍不会提交 WorldKernel、动态记忆或收据；成功提交后才释放 Agent 规划缓存，保持原有原子边界。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `node --test tests/world-output-adapter.test.mjs tests/turn-transaction.test.mjs tests/leader-directive-save.test.mjs tests/world-authority.test.mjs`：34/34 通过。
  - `npm.cmd test`：构建通过；301 项测试中 296 通过、5 项按公共空壳知识库或可选 Playwright 条件跳过、0 失败。
- 明确边界：
  - 玩家首领指令仍先于自治主体锁定；Agent 在同周统一规则中避让。这是有意保留的事务边界，不宣称完全同时竞价。
  - 六类收据已经是权威结构，但关系类目前主要来自交涉/招募的规则结果与可见事件；更细的信任、利益和社会关系变化需要在 CG-07 进入小说前继续绑定到明确的关系状态变更。
  - `sourceProposalIds` 证明“哪项获准行动可以造成变化”，不等于证明小说每个句子。段落级事实追溯属于 CG-07。

## 自动压缩恢复断点（2026-08-18）

当前工作包：**CG-04 待开始；CG-01、CG-02、CG-03、CG-05、CG-06 已完成。**

下一批严格从这里开始：

1. 为每件 `CouncilMatterView` 建立一个明确推荐方案和 1–2 个真正不同的替代方案；方案必须带负责人立场、所需资源姿态、主要风险与请示边界，不生成固定动作菜单。
2. 复用四名负责人的既有人格、职责、关系和可见知识生成方案；同一负责人不得为所有议题给出同质建议，未知事实不得被补成情报。
3. “采用/组合/修改方案”只把自然语言写入现有首领指令输入框，绝不直接排期或执行；玩家仍可删除全部建议并输入任意行为。
4. 方案标签、能力或仪式标签只能插入可编辑表达；不得恢复报告/议程/讨论/命令阶段，也不得展示行动天数、排班或后台裁决字段。
5. 增加方案差异性、知识权限、输入框回填、不直接执行与三件大事纪律测试；完成 CG-04 后进入 CG-07，让纪事段落消费并引用结构化因果收据。

当前阻塞：无。保留未知来源的 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log`，不得清理或覆盖。

## 自动压缩恢复断点（2026-08-21 · Gate 0 + PR1）

当前任务目标：**先完成 Gate 0 与 PR1（MIST-TURN-01），建立可恢复、不可重复结算的世界周事务边界；不要在此任务中扩展玩家表面或引入 SQLite。**

当前分支：`codex/gate0-pr1-turn-guard`。工作树中两个未知来源的 QA 日志仍保持未跟踪，禁止清理或覆盖。

### Gate 0 状态

- 已完成注意力模拟修复：授权历史不再静默截断到 24 项；分部候选会检查所在 district 的异常；新增 2 条回归测试。
- 已完成 CI 矩阵：`.github/workflows/ci.yml` 在 Ubuntu 与 Windows 上执行相同的 typecheck、lint、test、bundle budget 与 high-severity audit。
- 已完成并复核 `main` 分支保护：严格要求两个矩阵检查、至少 1 次 PR 审阅、线性历史、会话解决，禁止强推与删除。
- 远端 CI：`PENDING`（当前分支尚未推送/开 PR；本地通过不替代远端检查）。

### PR1 / MIST-TURN-01 状态

- `WorldKernel` 增加 `revision` 与有界 `committedTransactions`，旧存档归一化会 additive 补齐这两个字段。
- 每个提交事务携带 `turnId / resolvingWeek / baseRevision / inputHash`；周次必须严格为 `lastResolvedWeek + 1`，基准修订号必须匹配。
- 同一事务以完全相同的输入重放时直接返回原内核（零差异）；同一 ID 绑定不同输入、哈希不匹配、更新 ID 重复或事务身份缺失都会拒绝。
- 生产世界推演使用稳定的 `world:<week>` 事务 ID；不新增数据库、不把模型输出当作第二套 authority。

### 已验证证据

- `npm.cmd test`：构建成功；320 项测试中 315 通过、5 项按既有公共知识库/可选 Playwright 条件跳过、0 失败。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run bundle:budget`：通过（最大 bundle 198.8 KiB，预算 450 KiB）。
- `git diff --check`：通过。
- `npm.cmd audit --audit-level=high`：退出码 0；报告 4 个 moderate，未执行会引入 breaking change 的 `--force` 修复。
- Gate 0 主分支保护：只读 API 已复核上述两个检查和保护规则；这不是远端 CI 通过证明。

### 自动压缩后的继续规则

1. 先读本节与 `git status --short`，保留当前分支、两个 QA 日志和未合并边界。
2. 不重复实现 Gate 0/PR1；只完成本地提交和必要的独立复核。
3. 若要让 GitHub CI 运行，先单独确认推送/开 PR；在 CI 通过和独立审阅前不得合并。
4. 下一阶段只在 PR1 证据稳定后规划 SQLite/恢复点等后续工作，不把本地专项通过写成生产可用。

## 自动压缩恢复断点（2026-08-21 · MIST-AUTH-01）

当前任务目标：**把“知识 ID 存在”升级为“本轮实际获得的证据”，把“提案 ID 合法”升级为“该提案实际授权的变化”；不新增 UI、剧情、SQLite、本地模型或大规模 Agent 能力。**

当前分支仍为：`codex/gate0-pr1-turn-guard`。两个未知来源的 QA 日志 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log` 仍保持未跟踪，禁止清理或覆盖。

### MIST-AUTH-01 已完成的本地闭环

- `app/rag/client.ts` 的异步检索现在返回 `RetrievalReceipt`：包含 `requestId`、`indexVersion`、`audienceRef`、`queryHash`、`filterHash`、最终过滤后的 `chunkIds` 与 `contextHash`；Electron worker 从索引元数据提供稳定版本标识，旧检索回退使用明确的 `legacy-v1`。
- 世界裁决只使用 `receipt.chunkIds` 作为 `allowedLoreIds`；知识与配方引用未在本轮检索结果中的 lore 会以 `UNRETRIEVED_LORE_REFERENCE_REJECTED` 拒绝，不再用整个静态语料或运行时索引白名单代替本轮证据。
- 新增 `app/world-authority-closure.ts` 的 `MutationClaim`、`ExecutionPlanScope` 和确定性校验器：检查参与者/目标/持有者范围、资源投入上限、地点同地点来源事件、知识事件与观察链；无关实体会以 `UNRELATED_PROPOSAL_MUTATION_REJECTED` 拒绝。
- `WorldKernel` turn delta 携带 receipt 与 mutation claims；它们进入事务输入哈希、有限历史与幂等重放。`narrative-ready` 账本事件绑定 `modelCallId`、receipt 与 claims，保留模型结果与权威提交之间的证据链。
- 世界协议已要求模型声明 `mutationClaims`；玩家表面和现有三件大事循环未扩展。

### 当前证据

- `npm.cmd test`：构建成功；327 项测试中 322 通过、5 项按公共空壳知识库或可选 Playwright 条件跳过、0 失败。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run bundle:budget`：通过（最大 bundle 198.8 KiB，预算 450 KiB）。
- `npm.cmd audit --audit-level=high`：退出码 0；报告 4 个 moderate 的 esbuild/drizzle-kit 依赖问题，修复会触发 breaking change，未执行 `--force`。
- 新增负向与重放覆盖：本轮未检索 lore、合法 proposal 绑定无关势力、地点缺少来源事件、receipt/claims 事务重放；现有世界周集成测试保持通过。
- 远端 CI：仍为 `PENDING`；分支尚未推送/开 PR，本地通过不替代 GitHub 检查或独立审阅。

### 自动压缩后的继续规则

1. 先读本节、`git status --short` 与当前提交；不要重做 Gate 0/PR1 或 MIST-AUTH-01。
2. 当前本地提交需要独立 review 后再决定是否推送；不得自动合并，也不得把本地证据写成远端 CI 通过。
3. 下一项按原审查顺序进入 exactly-once 与角色隐私闭环；SQLite 仍不在本批范围内。
4. 继续工作时保留两个未知 QA 日志，不扩大玩家表面，不引入新的剧情或 Agent 能力。

## 自动压缩恢复断点（2026-08-21 · P0-4 角色隐私闭环）

当前任务目标：**关闭角色知识隔离的两条硬泄漏路径；不新增 UI、剧情、SQLite、本地模型或 Agent 数量。**

当前分支仍为：`codex/gate0-pr1-turn-guard`。`main` 仍停在 `f519128`，本地工作提交尚未推送、尚未开 PR、尚未合并。两个未知来源的 QA 日志 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log` 仍保持未跟踪，禁止清理或覆盖。

### P0-4 已完成的本地闭环

- `projectWorldForAudience()` 不再把权威地点对象原样放进角色投影；非 `world` 受众收到 `AudienceLocationProjection`，只包含地点标识/名称、`knownConditions`、`knownActorIds`、`knownFactionIds`、`perceivedRisk`、`publicMood`、稳定性和更新时间。隐藏的 `actorIds`、`factionIds`、原始 `conditions` 不再透传；已知实体只从受众可见事件、观察和受众自身持有关系中派生。投影还带确定性的 `projectionHash`，并清空不属于角色视角的检索收据与 mutation claims。
- Agent 规划的 `currentLocation` 改为读取同一份受众地点投影；自治规划的相关地点签名和势力归属也只消费 `knownFactionIds`、`knownConditions` 与 `perceivedRisk`。
- `generateCouncilReplies()` 改为每位成员独立调用模型，可并行但不合并 Prompt。每次请求只包含一个 `speaker`、该成员的 `authorizedLore`、`dynamicMemory` 和 `authorizedKnowledge`；模型只能返回该成员的公开发言。跨成员私有上下文不再通过“不要串读”的提示词隔离，后续书记员只消费已经公开的发言。
- 新增 `tests/privacy-closure.test.mjs`：地点投影隐藏字段回归、跨成员私有令牌 canary、每成员调用次数和公开回复数量回归。

### 当前证据与继续规则

- 本地红绿循环已通过：地点投影、Agent 规划投影、议会独立调用与跨成员秘密 canary。
- `npm.cmd test`：构建成功；329 项测试中 324 通过、5 项按既有公共空壳知识库或可选 Playwright 条件跳过、0 失败。
- `npm.cmd run typecheck`：通过；`npm.cmd run lint`：通过；`npm.cmd run bundle:budget`：通过，最大 bundle 198.8 KiB / 450 KiB。
- `npm.cmd audit --audit-level=high`：退出码 0；仍报告 4 个 moderate 的 esbuild/drizzle-kit 依赖问题，修复会触发 breaking change，未执行 `--force`。
- `git diff --check`：通过；本轮隐私闭环已形成本地提交。本地通过不替代 GitHub CI，远端仍为 `PENDING`，不得自动推送、开 PR 或合并。
- 继续时先读本节、`git status --short` 和最新提交；保留两个 QA 日志，不重复 Gate 0、PR1、MIST-AUTH-01 或本 P0-4 闭环。
- 下一步是独立审阅本地差异并决定是否推送；SQLite、完整存档恢复和更大范围模型实跑仍不在本批范围内。

### 2026-08-21 · 继续复核

- 发现并修复一条权威边界漏洞：带本轮 `retrievalReceipt` 的知识增量不能再复用历史事件或历史 `sourceProposalIds`；必须绑定本轮事件及本轮可执行提案。新增回归测试覆盖该路径。
- 修复后本地全量：`npm.cmd test` 330 项中 325 通过、5 项条件跳过、0 失败；`typecheck`、`lint`、`bundle:budget`、`git diff --check` 均通过；依赖审计仍为 4 个 moderate，未执行 breaking `--force` 修复。
- 跨模型 Codex 只读审阅两次均未形成结果：首次是本机 `codex.exe` 启动被拒绝，第二次被主机以私有仓库差异外发需额外授权为由拒绝；不能计作独立审阅，也不得绕过该安全边界。没有推送、开 PR 或合并。
- 继续门禁：需要用户明确授权外部只读审阅，或提供另一独立审阅主体；完成后再决定是否推送/开 PR；远端 CI 仍为 `PENDING`。

### 2026-08-21 · Gate 0/PR1 Codex 独立审阅修复（进行中）

- 用户已明确授权把当前分支差异发送给 Codex 做只读独立审阅。审阅通过现有本地 Codex 项目线程完成；未修改、提交、推送、开 PR 或合并。
- 首轮审阅结论为 `NOT CLEAN`，指出 4 个 P1 与 1 个 P2：新实体创建被旧执行范围拒绝、本轮临时事件 ID 未归一化、地点 claim 可借历史事件、周推演缺少并发单飞/CAS、受众投影泄漏事务技术元数据。
- 已修复：新 actor/faction/project 创建绑定到现有 proposal scope；explicit claim 的临时事件 ID 统一映射到本轮权威事件；地点/知识 claim 只接受本轮事件且要求当前 proposal 来源；标准闭周与重大事件入口共用单飞锁；受众投影改为显式白名单，不携带 `revision`、`committedTransactions`、receipts 或 mutation claims。
- 修复后复审通过上述五项，但仍发现 1 个 P1 与 1 个 P2：无检索回执时知识仍可借历史事件，角色投影事件/观察/知识 DTO 仍携带因果或检索内部字段。
- 已再次修复：知识无条件要求本轮事件、观察和当前可执行提案；`WorldKernel` 事务层拒绝只引用历史事件的知识；受众事件/观察/知识/授权记录改用脱敏 DTO，Agent 所需 lore 与因果映射仅保留在后端并从模型序列化中排除。
- 新增 authority/privacy/kernel 回归覆盖；最新定向测试 60/60 通过。

### 当前证据

- `npm.cmd test`：构建成功；336 项测试中 331 通过、5 项按既有公共空壳知识库/可选 Playwright 条件跳过、0 失败。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run bundle:budget`：通过（最大 bundle 198.8 KiB，预算 450 KiB）。
- `git diff --check`：通过。
- `npm.cmd audit --audit-level=high`：退出码 0；报告 4 个 moderate 的 esbuild/drizzle-kit 依赖问题，修复需要 breaking `--force`，未执行。
- Codex 第二次修复后复审：`PENDING`；在复审返回 `CLEAN` 前，不把本地实现写成独立审阅通过。

### 自动压缩后的继续规则

1. 先读本节、`git status --short` 和最新提交；保留两个未知 QA 日志及未合并边界。
2. 完成本地提交后，在同一 Codex 线程进行只读修复后复审；若仍有 P1/P2，只做本批高置信、最小修复并重新验证。
3. 不推送、不开 PR、不合并；远端 CI 仍为 `PENDING`，任何远端动作需单独授权。
4. PR1 只建立内存事务边界；SQLite、完整存档恢复和更大范围模型实跑不在本批范围内。

### 2026-08-20 · 注意力驱动模拟 H

- 状态：CG-09 已完成；剩余 1 个工作包：CG-10。
- 已实现：
  - 新增 `app/attention-simulation.ts`，用可迁移的注意力状态记录玩家确认过的成熟部门常设命令与稳定分部方针；未确认流程不会进入自动运行白名单。
  - 确认后的流程每周只在原授权内留下定性背景摘要；不改变资源、地点、人物、世界事实或任何数值加成。异常与授权范围相符时自动标记为“需要你关注”，不会自行扩大目标或权限。
  - 组织总账新增注意力入口：玩家可确认自动运行、重新展开负责人/地点/情报，且明确知道关注不提供加成、不能回到过去。稳定分部和常设流程收拢为简短回响，早期区块仍保留可重新展开引用。
  - 新存档写入注意力状态；旧存档采用 additive normalization，畸形状态和过长引用会被安全裁剪，不提升 schema 版本。
  - `resolveWeek` 在规则结算后推进注意力状态，保持世界运行与现有 Agent/WorldKernel 原子提交边界；未关注不等于暂停世界，关注只改变玩家看到的粒度。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `npm.cmd run build`：通过。
  - `node --test tests/attention-simulation.test.mjs tests/organization-console-surface.test.mjs tests/rendered-html.test.mjs`：8/8 通过。
- 明确边界：
  - 注意力状态是自动运行资格与玩家视图投影，不是另一套资源模拟；现有负责人、分部和 Agent 后台仍按既有规则运行。
  - 真实长期规模压力和 10/30/100 周可恢复性尚未完成，进入 CG-10 验收。

## 自动压缩恢复断点（2026-08-20 · H）

当前工作包：**CG-10 待开始；CG-01 至 CG-09 已完成。剩余 1 个未开发包。**

下一批严格从这里开始：

1. 建立 10/30/100 周长跑测试或确定性模拟夹具，验证组织规模增长不把议题、操作和报告线性推给玩家。
2. 验证三件大事纪律、成熟流程自动运行、异常上浮、早期地点/人物可重新展开和无回档事实一致性。
3. 对长跑结果做可恢复性检查：保存/读取、世界账本重放、文学重试和 Agent 失败降级不得改变权威结果。
4. 检查组织成长后的默认首屏与议会源代码，不重新暴露部门预算、日程、排班、精确外部势力值或后台日志。

当前阻塞：无。保留未知来源的 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log`，不得清理或覆盖。

### 2026-08-20 · 组织总账渐进披露 G

- 状态：CG-08 已完成；剩余 2 个工作包：CG-09、CG-10。
- 已实现：
  - 组织总账首屏保留三项资源、四名负责人、组织声望/暴露边界/外部压力/控制网络和本周实际后果；不再直接展示外部势力敌意数值或区块控制精确值。
  - 提拔普通人、配方/封印物/分部资产和已完成消化成员均改为默认收起的按需展开；只有玩家准备任命、晋升、使用或处理异常时才进入详细操作。
  - 四名负责人仍可直接交谈和调整人选，保持“组织总账是首领决策入口”而不是部门日常菜单。
  - 详细内容的资源、筛选、提拔、资产和分部规则未改写，仍由既有管理状态与规则函数负责；本批只收拢表面复杂度。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `node --test tests/organization-console-surface.test.mjs tests/rendered-html.test.mjs`：5/5 通过。
  - 上一轮 `npm.cmd test`：305 项测试中 300 通过、5 项跳过、0 失败；本批未改变规则层。
- 明确边界：
  - 详细资产仍存在于后台状态和展开面板，尚未做 CG-09 的成熟流程自动化；玩家不需要在总账首屏维护预算、积压、自治或排班。

## 自动压缩恢复断点（2026-08-20 · G）

当前工作包：**CG-09 待开始；CG-01 至 CG-08 已完成。剩余 2 个未开发包。**

下一批严格从这里开始：

1. 为已被玩家确认并稳定运行的组织流程建立可见的“自动运行方式”标记；未确认流程不得自动升级权限或扩大目标。
2. 注意力聚焦议题时展开真实人物、地点、情报与手动决策；不聚焦时只让负责人/分部/Agent 按已有授权继续运行。
3. 稳定城市与成熟分部收拢为宏观摘要，但保留早期区块、战略点和人物的可重新展开入口；不删除历史事实，不允许回档。
4. 增加 `tests/attention-simulation.test.mjs`，覆盖确认后自动化、注意力展开、未确认流程不自动升级、早期地点可重新展开和三件大事纪律。
5. CG-09 完成后再进入 CG-10 长期成长与 10/30/100 周规模恢复测试。

当前阻塞：无。保留未知来源的 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log`，不得清理或覆盖。

### 2026-08-20 · 干部方案与可编辑起点 E

- 状态：CG-04 已完成；剩余 4 个工作包：CG-07、CG-08、CG-09、CG-10。
- 已实现：
  - 每件 surfaced `CouncilMatterView` 都生成一个推荐方案和两个真正不同的替代视角；不是固定动作按钮，而是可直接删改的自然语言起点。
  - 每个方案都绑定具名负责人、负责人立场、职责与专长依据、投入姿态、主要风险和重新请示边界；依据只使用成员的公开职责/专长/核心立场，不读取 secret 或隐藏世界事实。
  - 推荐视角偏向在授权内推进；替代视角分别偏向保持隐蔽的证据回路和一次可中止的主动推进。授权请示、已中断事项会自动收紧方案边界。
  - 方案卡的“写入可编辑指令”只调用现有 `onUseSuggestion` 回填首领输入框并聚焦文本区；不会调用 `scheduleContract`、`resolveWeek` 或任何直接执行路径。
  - 原有三件大事纪律、干部追问、自由讨论、地图回填和后台裁定保持不变；方案只是理解世界与编辑命令的入口。
  - `council-system.ts` 的类型导入改为运行时安全的显式 type import，保证直接测试与生产构建使用同一模块边界。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `node --test tests/council-prioritization.test.mjs tests/rendered-html.test.mjs tests/council-navigation.regression-1.test.mjs`：11/11 通过。
  - `npm.cmd test`：构建通过；302 项测试中 297 通过、5 项按公共空壳知识库或可选 Playwright 条件跳过、0 失败。
- 明确边界：
  - 当前方案是确定性本地起点，不是新增一套后台 Agent；负责人真正的动态交锋仍通过已有追问与议会对话生成。
  - 方案卡没有显示精确预算、天数、排班或 `ExecutionPlan`；玩家仍只决定目标、负责人、投入尺度和授权边界。

## 自动压缩恢复断点（2026-08-20）

当前工作包：**CG-07 待开始；CG-01 至 CG-06、CG-04 已完成。剩余 4 个未开发包。**

下一批严格从这里开始：

1. 让纪事生成请求携带已执行行动的结构化因果收据与可见 WorldKernel 事件来源，并在段落级保留来源关联；小说只能扩写真实结果，不能替规则层补造事实。
2. 将纪事摘要压缩为“发生变化—谁知道—哪段关系改变—哪条因果继续”，避免每个资源变化生成独立长文本；普通周不强行分卷，序列晋升时才生成阶段回望。
3. 为小说失败重试建立收据/事实不变断言：只重写文学表达，不重新结算世界、不改变 ActionResult、WorldLedger 或玩家已知边界。
4. 增加 `tests/literary-causality.test.mjs`，覆盖来源提案、可见性、隐藏事件不泄漏、小说与规则结果一致、摘要决策密度和晋升阶段回望。
5. CG-07 完成后再进入 CG-08，收拢组织总账默认视图；不要提前扩大管理页面。

当前阻塞：无。保留未知来源的 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log`，不得清理或覆盖。

### 2026-08-20 · 纪事因果绑定与阶段回望 F

- 状态：CG-07 已完成；剩余 3 个工作包：CG-08、CG-09、CG-10。
- 已实现：
  - 新增 `chronicle-causality.ts`，从已执行 `ActionResult.causalReceipts` 与本周 `WorldKernel` 事件构建文学事实包；事件必须对玩家可见，隐藏事件、隐藏来源 ID 和只存在于世界层的幕后决定不会进入文学请求。
  - 文学请求显式携带“发生变化、谁知道、关系改变、后续因果”四类压缩摘要，以及可用收据/事件来源；模型可以为每个段落返回 `paragraphSources`，运行时只接受事实包白名单中的来源 ID，缺失时使用确定性匹配，不让模型凭空创造出处。
  - `ChronicleSection` 增加可选段落级来源关联；长段拆分会复制原段来源，存档采用 additive normalization，不改变旧章节和 schema。
  - 世界推演完成后重新用权威收据生成纪事摘要；普通周不把每个资源变化扩写成独立摘要，玩家回响固定围绕四个决策问题组织。
  - `advanceSequence` 写入单独的“阶段回望”纪事，只回顾已保存的知识、关系和未来因果，不重写旧章节、不替缺失经历补事实。
  - 文学重写前后锁定 `ActionResult`；候选文本若试图改变规则结果会失败，失败只能保留已提交世界与收据，之后继续单独重试文学表达。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `node --test tests/literary-causality.test.mjs`：3/3 通过，覆盖来源白名单、隐藏事件隔离、段落来源、规则结果不变与晋升回望。
  - `npm.cmd test`：构建通过；305 项测试中 300 通过、5 项按公共空壳知识库或可选 Playwright 条件跳过、0 失败。
- 明确边界：
  - `paragraphSources` 是后台事实关联，不在阅读器中显示原始 ID；玩家只看到小说和已有规则附录。
  - 当前阶段回望使用本地确定性文本；后续若需要更强文学表达，可让 CG-07 的同一事实包驱动重写，但不能把回望变成新的世界裁定。

## 自动压缩恢复断点（2026-08-20 · F）

当前工作包：**CG-08 待开始；CG-01 至 CG-07 已完成。剩余 3 个未开发包。**

下一批严格从这里开始：

1. 收拢 `organization-management-console.tsx` 的默认首屏，只显示三资源、四名负责人、异常和总体能力；详细人事、配方、封印物、分部内容改为按需展开。
2. 默认视图不显示预算、积压、自治滑块、精确岗位、外部势力数值或后台日程；这些数据仍保留给异常解释和二级详情。
3. 组织成长增加成员/分部时，首屏操作数量不得线性增加；把“任命、提拔、使用配方、处理封印物”放到具体需要发生时的局部入口。
4. 增加 `tests/organization-console-surface.test.mjs`，锁定默认首屏字段、按需展开入口和后台字段防泄漏；保留现有总账状态迁移与管理规则测试。
5. CG-08 完成后再进入 CG-09 的注意力驱动模拟，不提前改 Agent 或世界内核。

当前阻塞：无。保留未知来源的 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log`，不得清理或覆盖。

### 2026-08-20 · 长期成长与规模验收 I

- 状态：CG-10 已完成；CG-01 至 CG-09、CG-10 全部完成，剩余 0 个未开发包。
- 已实现：
  - 新增 `tests/scale-regression.test.mjs`，用确定性组织/账本长跑夹具覆盖第 10、30、100 周；每周三件大事上限持续成立。
  - 每个里程碑都执行存档归一化、WorldLedger 校验与快照/全量重放比对；重复长跑的账本 checksum、纪事和组织议题一致，确认没有隐式回档或重掷。
  - 用 120 项组织异常与 100 名成员压力夹具验证议会仍只取三件大事，组织账簿的负责人、注意力与资产入口按固定上限展示，不随规模线性增加操作。
  - Agent 失败降级、文学重试事实锁定、保存往返与世界提交原子性继续由既有事务回归覆盖；本批未新增玩家可见后台边界。
- 验证证据：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run lint`：通过，0 warning。
  - `node --test tests/scale-regression.test.mjs`：3/3 通过。
  - 最终 `npm.cmd test`：构建通过；314 项测试中 309 通过、5 项按公共空壳知识库或可选 Playwright 条件跳过、0 失败。
- 明确边界：
  - 长跑夹具是确定性规则/账本验收，不伪造 AI 世界文本；真实模型推演仍受现有知识权限、Agent 失败隔离和提交顺序约束。
  - 0 个未开发工作包不等于所有内容无限扩张；后续只接受不破坏北极星体验、三件大事纪律和无回档事实一致性的增量。

## 自动压缩恢复断点（2026-08-20 · I）

当前工作包：**全部 CG 工作包已完成；剩余 0 个未开发包。**

若继续开发，只做回归驱动的小步增量：先读取本文件和 `git status --short`，再以现有三件大事、首领指令、世界回应、纪事与注意力边界为验收基线。不得借新增页面、日程或后台字段重新扩大玩家表面。

当前阻塞：无。保留未知来源的 `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log`，不得清理或覆盖。
