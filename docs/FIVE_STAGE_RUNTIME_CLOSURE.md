# 五阶段运行时闭环执行账本

状态：五阶段运行时闭环与合并前独立复审确认的缺陷均已进入运行代码；交付状态以 GitHub PR #3 为准，发行证据仍保持字面真值
开始时间：2026-08-23
当前阶段：最终独立代码级复核与精确 write-set — 完成
远端边界：仅在锁定 exact head 的计划效果复核、独立审查、必需 CI 与用户授权全部满足后合并；合并不得升级为 installer、clean-machine、production 或 human evidence。

## 任务目标

逐步关闭代码审计确认的五类系统漏洞，并在最后重新检查实现是否真正匹配原任务和计划效果，而不是以测试通过代替代码级证明：

1. 单一 `TurnCommit` 权威提交 Module。
2. `ExactPromptEvidence` 与 Main-owned 推理、RAG、凭据权威。
3. 仅观察可得的受众认知与议会逐主体投影。
4. `DurableTurnStore`、稳定 origin、durable acknowledgement、quarantine 与可用恢复。
5. 永久归档、唯一身份、持久 trace 与真实发行证据。

## 不可回退约束

- 玩家表面继续服从“看局势 → 定目标 → 派人授权 → 世界回应 → 看见回响”。
- Agent、RAG、账本、trace、事务、凭据和运行时术语不得进入玩家表面。
- 模型只能提出候选结果；规则代码拥有授权、变更、持久化和对玩家展示的最终权威。
- 失败必须保持事务隔离；不得出现内核未提交但 sidecar、记忆、账本、恢复点或 UI 已推进。
- `NOT_RUN`、`NOT_AVAILABLE`、`PENDING`、`BLOCKED` 等证据状态保持字面真值，不由本机测试升级。
- `.qa-prodserver3.err.log`、`.qa-prodserver3.out.log` 是既有未跟踪文件，不得修改、删除、提交或推送。

## 基线

- 分支：`codex/gate0-pr1-turn-guard`
- 起始 HEAD：`1248ccde93a2a1cc38f3d41a50cebb6fff9a9dbb`
- 起始工作树：除两份受保护 QA 日志外无改动。
- 当前 installer smoke：授权 seed 缺失，保持 `BLOCKED` / `NOT_RUN`。

## 执行方法

每阶段都采用竖向 RED → GREEN → 代码复审：

1. 先读真实调用链、数据所有权和失败路径。
2. 用已复现反例写一个公开行为测试并确认失败。
3. 实现最小但完整的权威闭环，不以 mock 调用次数代替行为。
4. 运行定向回归、typecheck/lint/build（按风险），再查相邻旁路。
5. 更新本账本的修改文件、RED/GREEN 证据、剩余缺口与下一动作。

## 阶段状态

| 阶段 | 状态 | 核心验收 |
|---|---|---|
| 1. TurnCommit | 完成 | delta、effect-specific sidecar、记忆、ledger 与展示派生在隔离候选中统一提交；失败不推进调用者状态 |
| 2. ExactPromptEvidence / Main authority | 完成 | 世界 RAG、Prompt、凭据、snapshot/resolution/manifest 与真实 model attempt 由 Main/durable owner 绑定 |
| 3. Audience projection | 完成 | namespaced holder、逐主体投影、知识授权与跨类型身份互斥均 fail closed |
| 4. DurableTurnStore | 完成 | 稳定 origin、事务 journal、durable ack、严格 recovery/quarantine、历史恢复新分支与 trace 校验闭合 |
| 5. Archive / trace / release | 完成（代码级） | SHA-256 身份、有界 archive、durable trace 与 artifact/provenance 绑定已落入生产代码；外部发行证据不升级 |
| 最终复核 | 完成 | 最新全量回归、源码旁路审查、独立只读复核与精确 write-set 均完成；不自动提交或推送 |

## 阶段 1 工作清单

- [x] 锁定 `game-engine`、`world-output-adapter`、`world-authority-closure`、`WorldKernel` 的现有提交与 sidecar 写入路径。
- [x] RED：声明 claim 与实际 mutation 不一致时必须拒绝。
- [x] RED：scope 仅有任一重叠不能授权无关目标或未声明资源影响。
- [x] RED：新实体、事件因果、自因果/环和未知引用必须受 capability/存在性约束。
- [x] 建立单一 `TurnCommit` public interface，集中 canonical delta、authorization、kernel apply、sidecar projection 和零副作用失败语义。
- [x] 将世界周真实调用链切换到该接口，移除/封死旁路。
- [x] 定向回归、typecheck/lint/build与代码级旁路复审。

## 已知反例（作为回归输入，不作为“已修复”证据）

- explicit mutation claim 可与实际 delta 不同；`.some()` scope overlap 可借一个合法地点授权另一个无关实体变化。
- 未声明 commitments 时大额资源影响仍可通过。
- 模型 sidecar 字段会在 `WorldKernel` 之外直接更新 `GameState`。
- 新建实体可自动附带 scope，事件原因允许自因果/环；内核只对知识 claim 做了较强验证。
- actor 看到一条观察后可能得到事件完整参与者、隐藏势力和精确风险/真值。
- final Prompt 对 lore 正文独立截断，ID/receipt 仍可能授权未展示全文。
- 持久化读错误可能被折叠成“无记录”，恢复点写入但没有产品恢复入口。
- FNV 碰撞和有限窗口允许权威身份或旧 ID 复用。

## 压缩恢复规则

发生自动压缩后，按以下顺序继续：

1. 完整读取本文件。
2. 读取 `git status --short --branch` 和当前 HEAD，保留两份 QA 日志。
3. 从“阶段状态”中第一个“进行中”阶段继续，不重做已完成阶段。
4. 读取该阶段最后一条 RED/GREEN 证据和“下一动作”。
5. 任何推送、开 PR 或合并都必须等待最终复核后由用户另行决定。

## 进度日志

### 2026-08-23 · 基线与计划锁定

- 已完整读取 `CONTEXT.md`、核心玩法总账、修复上下文、权限加固进度、PR2/PR4/PR5、WorldLedger V2/长线文档。
- 已核对起始 HEAD、分支与脏文件；未触碰两份 QA 日志。
- 已建立仓库外追加式压缩检查点和本仓库权威执行账本。
- 下一动作：深入读取阶段 1 四个 owner 模块及其真实调用者，选取第一个“claim 与实际 mutation 不一致”行为写 RED 测试。

### 2026-08-23 · 阶段 1 完成

- 新增唯一世界回合提交边界 `app/turn-commit.ts`；`game-engine` 不再直接调用 `applyWorldTurn`。提交前克隆完整 `GameState`，内核提交、现场报告修复、sidecar、记忆、账本与编年派生都在隔离副本内完成；任何晚期失败保持调用者状态不变。
- 修复 trace 提前承诺：`WorldKernel` 在 TurnCommit 内不再自行记录成功，只有全部 sidecar 校验完成后才记 `COMMITTED/REPLAYED`；晚期失败只记 `REJECTED`。
- mutation claim 改为从实际规范化 delta 生成并与显式 claim 完整比对；subject、每个 target、resourceImpact 与 sourceEventId 任一不一致即拒绝。
- scope 从“任意一个引用重叠”改为逐引用授权；未声明资源承诺按零处理；新实体必须有同提案、本轮事件和已授权既有锚点；事件拒绝自因果、环和未知原因。
- `world:world` 字符串不再具有通配权威；无目标公共事件只能由规则侧 `CREATE_PUBLIC_EVENT` capability 授权；地点变化即使拥有 ambient capability 也必须绑定本轮同地点事件。
- 代码级旁路搜索：生产代码中的 `applyWorldTurn(` 只剩 `world-kernel.ts` 定义与 `turn-commit.ts` 唯一调用；`game-engine.ts` 中模型返回后的世界权威写入均位于 TurnCommit 隔离回调内。
- 定向回归：53 / 53 通过。`typecheck`、`lint`、`git diff --check` 通过。
- 全量回归：393 项，388 通过、5 项条件性跳过、0 失败；build 通过。跳过项仍为公共空壳知识库/Playwright 条件证据，不升级其真值。
- 范围说明：本阶段封闭的是世界裁决模型到权威世界回合的提交边界；对话、即时能力和纯文学生成不是 WorldTurnDelta 的 owner，其受众与推理边界分别在阶段 2/3 继续收紧，不以本阶段结果冒充已完成。
- 下一动作：直接复现“最终 Prompt 截断正文但 receipt/records 仍授权未展示记录”，建立 `ExactPromptEvidence` 的正文、顺序、ID 与哈希单一来源。

### 2026-08-23 · 阶段 2 完成

- `buildExactPromptEvidence` 成为最终 lore 正文、顺序、纳入 ID 与省略 ID 的单一来源；完整记录和首条截断记录都会克隆为 Prompt 中实际可见的正文。`RetrievalReceipt` 只绑定纳入记录，并用 WebCrypto SHA-256 生成 64 位十六进制 query/filter/context hash；世界 Prompt 装配不再二次裁剪已绑定的 `authorizedLore`，总预算无法满足时直接拒绝。
- Electron RAG IPC 不再接受 renderer 提供的 audience、knownLoreIds、topicGrants、week、horizon 或剧透范围；Main 从持久活动存档推导具体 `player` / `actor:<id>` / `faction:<id>` principal、权限、周次、有效字符预算和 horizon。RAG sender 有 origin 门禁，旧 `listChunkIds` 能力已移除。
- 代码复审发现并关闭桥失败旁路：只要 Electron RAG 桥存在，Worker/Main 权威缺失或调用失败即 fail closed，不再回退到 renderer 本地语料检索；renderer 传入的超大 `maxChars` 也不能覆盖 Main 返回的有效预算。
- 新建 Main 推理网关：所有生产 `callModel` 调用必须携带编译期强制的白名单 `ModelTaskKind`；DeepSeek 固定官方 URL，本机兼容接口只允许 loopback，Prompt/模型/超时/Token 参数有界，响应上限 2 MB。renderer 不发送 Key，Main 从会话内存或 safeStorage 取凭据。
- 凭据 IPC、推理 IPC、RAG IPC 全部验证 sender/origin；credential status 只返回 configured/persistent 状态。Electron 会话和 localStorage 不再保存明文 Key；旧明文设置只做一次性 Main 迁移并立即清空。设置页不再把任意远程兼容端点描述为可用。
- Electron 窗口默认拒绝外部导航、新窗口和权限请求，并为内置来源增加 CSP、nosniff 与 no-referrer。Electron QA 脚本也改为通过 Main 凭据桥和 Main-owned RAG 合同运行，不再写明文 Key 或调用已删除的检索能力。
- 代码级旁路复审：生产模型调用均有 typed task；preload 不存在 credential load/decrypt 返回；Electron RAG 失败无 renderer fallback；Main 返回的 authority 是 receipt filter 与最终 Prompt 预算的唯一来源；模型网关拒绝 renderer 注入 endpoint/key 与超大响应。
- 定向回归：46 / 46 通过；`typecheck`、`lint`、Node syntax 与 `git diff --check` 通过。全量回归：401 项，396 通过、5 项条件性跳过、0 失败；生产 build 通过。公共空壳知识库、Playwright/PDF 与安装包 seed 的条件证据保持原状态，installer smoke 仍为 `BLOCKED / NOT_RUN`。
- 范围说明：浏览器预览保留既有同源 DeepSeek开发路径；本阶段的 Main-owned 凭据与网络权威结论严格针对正式 Electron 产品入口，不把浏览器预览冒充桌面安全边界。活动存档作为 RAG 权威源的 durable acknowledgement 与写入竞态由阶段 4 统一关闭。
- 下一动作：从 `projectWorldForAudience`、议会成员调用和文学事实包的真实字段流开始，复现“地点精确风险/状态或完整事件参与者在无观察来源时仍可见”，建立逐事实 observation-derived 投影。

### 2026-08-23 · 阶段 3 完成

- `projectWorldForAudience` 现在只通过公共事件或受众实际可见的 observation 投影事件；世界真相事件可由观察形成有限投影，但不携带原始参与者、见证者、因果、提案或精确地点。知识投影移除 canonical `truth`，改为来源型 `epistemicStatus`；地点风险、稳定度、气氛和条件只从可见文本形成定性投影。
- 关闭“同处即知晓”和关系图旁路：自主主体的 `allowedTargetRefs`、私有事件记忆与社会关系不再从原始事件参与者/witnessRef 推导；关系只由该主体实际持有且 `perceivedRefs` 明确认出的 observation 建立有向边。世界层私有知识也不再进入玩家/角色的行动授权集合。
- 议会与 NPC 调用按成员分别构造世界、记忆、上周行动和排定指令；成员 A 的私有记忆、私人命令和行动回报不会进入成员 B 的模型请求。全局玩家事实不再进入成员 Prompt。
- 玩家侧指令解析、议会因果标题、空间情报、路线风险、行动因果收据、能力已授权知识和文学事实包全部复用统一玩家投影；不再以 `witnessRefs` 自行判断可见性，也不再把原始 `actorIds/factionIds/sourceProposalIds/truth` 重新拼回玩家上下文。
- 动态记忆由世界事件派生时，完整世界事件只进入 world-system 记忆；主体信念只从其 observation/knowledge grant 派生，保留不确定性和来源，不复制 canonical truth 或完整隐藏参与者。
- RED 证据覆盖：精确地点仪表盘、原始事件参与者、同地隐藏主体、全局议会秘密、无观察关系边、`witnessRef` 玩家旁路、world-only 知识授权、非公开地点暴露。修复后定向回归 67 / 67 通过，`typecheck`、`lint`、`git diff --check` 通过。
- 全量回归与生产 build：405 项，400 通过、5 项条件性跳过、0 失败；跳过项仍为公共空壳知识库和 Playwright/完整知识条件证据，不升级其真值。
- 下一动作：深入读取 Electron SQLite schema、persistence IPC、renderer save controller、recovery checkpoint 与 save import 的真实读写顺序；先复现“活动存档写成功响应先于世界回合/收据持久落盘”或“损坏记录被 clear 而非 quarantine”的第一个 Stage 4 反例。

### 2026-08-23 · 阶段 4 完成

- 新建 SQLite `DurableTurnStore` 规范化表：`world_turns`、`world_events`、`retrieval_receipts`、`mutation_claims` 与活动存档在同一个 `BEGIN IMMEDIATE` / `COMMIT` 中写入；origin 由持久 `saveId + worldLedger.branchId` 组成，回合同 ID/同周不同输入会拒绝，完全相同的重放只返回 `replayed`。
- 新游戏生成持久 `saveId`，旧存档归一化时只补一次并随活动存档保存；`persistence:commit-turn` 只在 SQLite `COMMIT` 返回后给 renderer durable acknowledgement。世界推演完成后，`complete-game` 必须先 `await persistActiveGameAsync(simulatedState)`，再更新 UI 和启动文学阶段；失败时原局面不推进。
- 损坏记录不再从 Main 伪装为 `value:null`，renderer 也不再调用 remove。校验和损坏、JSON 损坏、恢复点结构损坏或迁移拒绝都会原样移入 `persistence_quarantine`，保留原 payload、原/计算 checksum、原因与时间，并返回明确 corrupt/fatal 状态。
- 导入解析增加 24 MiB、64 层、25 万节点、5 万数组项和异常长文本边界；Electron 导入用 `replaceWithRecovery` 在一个事务中同时保存导入前恢复点、导入存档和其 durable turn journal，失败整体回滚。
- 标题页实际读取持久恢复点并提供“恢复第 N 周”的玩家入口；恢复成功前不改变当前 UI，活动存档损坏时仍可选择已保存的安全节点。界面保持玩家语言，不暴露 SQLite、journal、receipt 或 quarantine 术语。
- RED/GREEN 覆盖：损坏活动存档不删除、损坏状态不冒充缺失、事务写入四类权威记录、回合身份冲突、durable ack 顺序、导入双写原子回滚、超大/过深导入拒绝、恢复结构错误 fail closed。
- 定向回归：39 / 39 通过；`typecheck`、`lint`、`git diff --check` 通过。全量回归与生产 build：413 项，408 通过、5 项条件性跳过、0 失败；跳过项仍为公共空壳知识库与可选 Playwright/完整知识证据，不升级其真值。
- 下一动作：深入审查 `WorldLedger` 有界 event/snapshot archive、`stable-id`/FNV 完整性身份、内存 `runtime-trace` 和 release evidence 流；先复现“归档窗口后旧事件 ID 可复用”与“进程重启 trace 消失”的 Stage 5 反例。

### 2026-08-23 · 阶段 5 完成

- `WorldLedger` 的事件归档采用固定大小身份过滤器拒绝旧 ID 复用，`identityDigest` 使用 SHA-256 滚动绑定；segment 只保留最近 16 段，只有仍被保留窗口引用的 archived cause 才保留精确锚点。验证器拒绝旧 ID 复用、未知历史因果和归档摘要/过滤器篡改。
- 当前 ledger checksum、活动存档 checksum、world turn input hash、runtime trace 派生身份和通用持久实体身份统一为 SHA-256。能力行动/结算、命运/失控合同、动态出身、世界事件/观察/知识/授权收据以及 AI 派生任务等持久 ID 不再由 32 位 FNV 拼接。FNV 只保留两类边界：确定性玩法抽样，以及明确命名的旧存档 checksum 验证兼容；不会再承担当前持久身份或完整性权威。
- SQLite 新增 `runtime_traces`；世界回合提交会在同一事务中持久保存脱敏 trace，未提交失败也可通过有界追加 IPC 保存诊断。trace 有唯一 `traceInstanceId` 与关联 `traceId`，Main 只接受字段白名单、单条 16 KiB、单批 128 条；关闭并重开数据库后仍可按稳定 origin 消费。
- 发行证据验证器把 packaged artifact 绑定到完整 source commit、干净源码和 artifact SHA；clean-machine 必须来自不同 machine ID、无 source checkout、未安装依赖且验证传输 hash；production 必须是 HTTPS deployment 并绑定相同 artifact；human 必须有观察记录和正数会话时长。同机本地命令不能升级为 clean-machine。
- 代码复核额外发现并关闭终局持久顺序缺口：终局规则结算和随后的世界推演都必须先取得 `persistActiveGameAsync` durable acknowledgement，之后才 `setGame`，文学生成只在持久世界结果可见后启动。
- 定向身份/持久顺序回归：43 项中 42 通过、1 项公共空壳知识条件跳过、0 失败；此前 Stage 5 定向归档/trace/release 回归 68 / 68 通过。
- 授权 seed 门禁以显式进程退出码复核：`seed-manifest-missing`，退出码 1。故 installer smoke 继续保持 `BLOCKED / NOT_RUN`；clean-machine、production、human 证据保持 `NOT_AVAILABLE`，没有因本机测试越级。

### 2026-08-23 · 最终代码级目标/效果复核完成

- 单一提交旁路搜索：生产 `applyWorldTurn(` 只剩 `world-kernel.ts` 定义和 `turn-commit.ts` 唯一调用；`game-engine` 通过 `commitWorldTurn` 进入隔离提交。
- 推理/RAG/凭据搜索：正式 Electron 路径只经 `window.mistInference` 到 Main `requestInference`，DeepSeek 固定官方地址、compatible 仅允许 loopback；RAG principal 与 grants 由 Main 从 durable active save 派生。`openAiCompatibleEmbeddingProvider` 只有未实例化的库导出，不在正式产品调用图中形成 renderer 凭据旁路。浏览器预览仍是明确降级边界，不能冒充桌面安全证据。
- 受众搜索：议会、NPC、能力、文学、空间与世界行动全部从 `projectWorldForAudience` 取得各自投影；世界系统的 canonical memory 派生不被重新拼回玩家或角色 Prompt。
- 持久顺序搜索：普通世界周、终局规则结算、终局世界结算、导入与恢复均先等待 durable acknowledgement，再更新可见游戏状态；文学阶段位于持久世界结果之后。
- 归档/trace/release 搜索：永久事件身份集、SHA-256 摘要、SQLite trace 表和高证据级别 provenance 门禁均在真实生产模块中有 owner 与消费者，不是只有测试名。
- 最终全量：生产 build 通过；419 项测试中 414 通过、5 项条件跳过、0 失败。`typecheck`、`lint`、`git diff --check` 通过；两份受保护 QA 日志仍为未跟踪且无 diff。
- 目标效果结论：五项计划均达到其代码级验收，玩家表面仍保持“看局势 → 定目标 → 派人授权 → 世界回应 → 看见回响”，没有展示 Agent、RAG、账本、trace 或事务术语。
- 剩余真值与建议：安装包 seed、真实 installer lifecycle、异机 clean-machine、生产部署和人工会话证据仍不可用；此外非世界回合的即时 UI 操作仍主要通过串行 save effect 持久化，不属于本次 `DurableTurnStore` 的世界回合提交范围，后续若要求所有即时操作也具备 write-before-visible 语义，应单列产品交互事务化工作。当前有 70 个 tracked diff 文件和 6 个应纳入的新源代码/文档/测试文件（另有两份必须排除的受保护日志），约 2522 行新增/550 行删除；不建议未经独立 diff 审核直接推送。先确认精确 write set 与提交边界，再由用户另行授权提交/推送。

### 2026-08-23 · 独立 diff/write-set 复核后重新打开

- 旧最终结论撤回：现有相关测试 43 / 43 通过，但源码级反例证明测试覆盖不足，不能继续把绿色测试当作五阶段闭环证据。
- 当前精确基线：70 个 tracked 修改文件、7 个预期新文件（不是旧记录的 6 个），tracked diff 为 2528 行新增 / 552 行删除；两份 QA 日志继续排除。HEAD 与 fresh `origin/main` 的 tree 相同，但历史已分叉，任何历史整理都必须在内容修复、独立复审和用户授权之后进行。
- 已确认待修：sidecar 权威旁路；renderer 自授 world RAG/改写活动存档；跨 namespace 知识泄漏；compatible 泄漏 DeepSeek credential；COMMITTED trace 早于 durable ack；action ID 的 FNV 碰撞；production artifact 未绑定；origin 拼接碰撞；部分损坏 recovery 被静默过滤；RAG 使用陈旧 durable authority；重试的 REPLAYED 语义不可达；archive 无界；trace 读不验 checksum。
- 已建立仓库外追加式检查点 `20260823-192752-gmzz-independent-audit-fixes.md`。执行方式改为逐反例纵向 RED → GREEN；每一项完成后更新本节，最终重新执行代码级目标/效果审核。
- 当前下一动作：先修 compatible provider 凭据隔离并记录真实 RED/GREEN，再修 release artifact 绑定；全过程不 stage、不 commit、不 push。

### 2026-08-23 · 修复 1：compatible credential 隔离完成

- RED：新增公开网关行为测试，compatible loopback 请求仍调用 DeepSeek `getCredential` 一次，失败于 `1 !== 0`；这复现了真实凭据所有权串线，而不是 mock 名称检查。
- GREEN：`electron/inference-gateway.cjs` 仅在规范化 provider 为 `deepseek` 时读取 Main-owned credential；compatible provider 的 credential 固定为空，因而不会产生 `Authorization` header。
- 定向回归：`tests/electron-runtime-authority.test.mjs` 6 / 6 通过，同时保留 DeepSeek 必须使用 Main credential、renderer key 字段被忽略和远程 compatible endpoint 被拒绝的既有行为。
- 下一动作：为 production deployment digest 与 verified artifact/provenance 不一致建立 RED，并修复发行证据绑定。

### 2026-08-23 · 修复 2：production artifact 绑定完成

- RED：构造本地已验证 artifact/provenance 使用 digest A、production deployment 声称 digest B 的完整 `PASS` manifest；旧验证器返回 `ok: true`，证明只校验了 SHA 格式而未证明部署的是候选制品。
- GREEN：高证据级别统一构造 artifact digest 集与 provenance digest 集；production deployment 的 digest 必须同时存在于两者，否则明确拒绝。
- 定向回归：`tests/release-evidence.test.mjs` 6 / 6 通过；路径穿越、实际文件 digest、source commit、异机与 clean source 门禁仍保持。
- 下一动作：进入 Main authority 组，先关闭 renderer 通过公共 RAG IPC 自授 `world-simulation` principal 的反例，再限制活动存档 generic set/remove。

### 2026-08-23 · 修复 3：活动 authority 存档 generic mutation 关闭

- RED：受信 renderer 可直接调用 `persistence:set/remove` 覆写或删除 `mist-chronicle-complete-v21`，测试观察到 store 写入一次，证明 RAG authority 的 durable 来源可被公共 KV 接口替换。
- GREEN：generic set/remove 对所有 `-complete-` key 直接返回 `invalid-request`；preload 不再暴露 `set/remove`。正式 Electron bridge 出现但没有 `commitTurn` 时 fail closed，不再退回弱写入。RAG QA 与发行生命周期 runner 改用 durable `commitTurn`。
- 定向回归：`tests/persistence-ipc.test.mjs` 6 / 6 通过；typecheck 通过。读取、quarantine、recovery 和 durable commit 的专用接口保持。
- 下一动作：处理公共 RAG `world-simulation` 自授与 staged/durable 周次错位；先建立直接调用 `deriveRagWorkerRequest` 的拒绝反例，再设计不把 world context 返回 renderer 的 Main-owned 路径。

### 2026-08-23 · 修复 4：Main-owned world RAG 与 durable base 绑定完成

- RED 1：公共 `deriveRagWorkerRequest({purpose:"world-simulation", principalRef:"world"})` 原样成功，证明 renderer 只需自报两个字符串即可得到 world-internal context。
- GREEN 1：公共 `rag:search` 现在将 `world-simulation` 判为 `rag-purpose-internal-only`；玩家、actor、faction 的派生路径保持原有 Main-owned 投影。
- RED 2：不存在能把世界检索绑定到 durable base revision / exact turn 的内部接口；陈旧或未来 turn 也无专属拒绝语义。
- GREEN 2：新增 `deriveWorldRagWorkerRequest`，只从 durable active save 取得 week、date、horizon 与 revision，并要求 `turnId === world:<durable week>` 且 `baseRevision` 精确一致。renderer 提供的 next-state week/horizon 不参与授权。
- RED 3：世界模型若继续复用公共 RAG，world context 与完整 records 必须先返回 renderer；测试要求 Main 注入 evidence、renderer 只拿 model content + receipt 时模块不存在。
- GREEN 3：新增 `electron/world-inference.cjs`。Main 内部检索、按最终 prompt 预算裁切、生成 SHA-256 receipt、替换唯一 lore/ID marker，再调用模型；响应只含模型正文、usage、receipt 与 durable binding，不含 context/records。`world-adjudication` 必须走此路径，其他 task 夹带 worldRag 会被拒绝。
- 正式调用链：Electron 世界回合不再调用公开 world RAG；`game-engine` 只放置 Main marker，并在收到 receipt 后核对 turn/revision，再以该 receipt 授权 adapter。浏览器预览仍走既有本地资料路径，不冒充 Electron 安全证据。
- 定向验证：Main/IPC/authority/turn 相关 54 / 54 通过；typecheck、Main 与新 CJS syntax 通过。
- 下一动作：进入 sidecar/namespace 组，先修 namespaced holderRefs 优先级与跨 actor/faction ID 碰撞，再对持久 sidecar 建立来源绑定反例。

### 2026-08-23 · 修复 5：namespace 与持久 sidecar 权威闭环完成

- RED 1：`holderRefs:["faction:shared"]` 与 legacy `holderIds:["shared"]` 同时存在时，`actor:shared` 在 renderer 投影和 Main RAG 中均读到 faction secret。
- GREEN 1：canonical `holderRefs` 非空时成为唯一持有者来源；`holderIds` 只在 refs 缺失时作为旧存档 fallback。相同规则也用于 KnowledgeGrant 的来源 observation 校验。
- RED 2：`createWorldKernel` 接受 actor/faction 共享同一裸 ID，导致 legacy holder ID 无法消歧。
- GREEN 2：seed、authority normalization 与每轮新实体都检查 actor/faction namespace 互斥；同类型也保持唯一。旧存档若含歧义身份会 fail closed，而不是继续泄漏。
- RED 3：非空 `emergentLead` 没有 proposal/event/observation/claim 仍可通过 adapter，并在 TurnCommit 隔离副本里持久生成 discovered evidence 与 opportunity。
- GREEN 3：adapter 现在返回唯一的 authorized sidecar 投影。`emergentPressure`、`emergentLead`、每个 organization development/issue/formula/recruit 必须绑定本轮 executable proposal、同提案事件、玩家/组织可得的逐字 observation 与 event mutation claim；任一缺失拒绝整个回合。`game-engine` 不再读取 raw sidecar。
- publicSignals 被明确拆成展示与规则两层：所有合格文本仍可进入报纸/世界快照；只有携带并通过相同来源证明的 `ruleSignals` 才能改变 campaign 或地图情报。删除了把所有 publicSignals 自动挂到任意 fallback event 的伪观察逻辑。
- 协议已要求模型输出 sidecar/source 三元组；数值型组织后果仍完全由规则代码拥有，来源证明只授权可观察叙述/议题，不授权模型数值。
- 定向回归：sidecar/adapter/turn 47 / 47，通过 namespace/privacy 相关回归和 typecheck。
- 下一动作：进入 DurableTurnStore 组，按 trace durable 语义、origin tuple、recovery 严格性、trace checksum、retry owner 的顺序逐个 RED/GREEN。

### 2026-08-23 · 修复 6：稳定持久 origin 消除分隔符碰撞

- RED：分别提交 `(saveId="a:b", branchId="c")` 与 `(saveId="a", branchId="b:c")`；旧 `${saveId}:${branchId}` 把两组不同 tuple 压成同一 origin，并触发错误的 `durable-turn-identity-conflict`。
- GREEN：Main 与 renderer 统一使用 `origin:v2:<sha256(JSON.stringify([saveId, branchId]))>`。SQLite 回合 journal、trace 写入和 renderer trace 读取均使用同一函数；不再由可歧义分隔符承担持久身份。
- 安全取舍：不回退读取旧分隔符 origin。旧 origin 本身无法无歧义反解，兼容回退会重新引入跨存档/分支 trace 串读；本次功能尚未发行，诊断 trace 可安全放弃，活动存档和世界 journal 不受该兼容取舍影响。
- 定向验证：persistence SQLite/bridge 24 / 24 通过，typecheck 通过。
- 下一动作：对 recovery 数组建立“任一元素损坏则整条记录 corrupt/quarantine”的反例，删除静默过滤。

### 2026-08-23 · 修复 7：recovery 全记录严格校验完成

- RED：`[validCheckpoint, {id:"malformed"}]` 在 Main `readItem` 与 renderer strict parser 中都静默过滤坏元素并返回有效子集；损坏事实被降级成“部分可用”。
- GREEN：两侧都要求数组每个元素至少为 object、`game` 为 object、`game.worldKernel` 为 object；任一元素失败即 `persistence-recovery-corrupt`。SQLite guarded read 把原始整条 payload 移入 quarantine 并删除活动记录，不制造经筛选的新历史。
- 定向验证：persistence SQLite/bridge 26 / 26 通过，typecheck 通过。
- 下一动作：篡改 `runtime_traces.payload` 但保留原 checksum，复现读取端不验 checksum，再关闭该旁路。

### 2026-08-23 · 修复 8：runtime trace 读取校验完成

- RED：回合提交后直接把 `runtime_traces.payload.turnId` 改为另一回合、保留原 checksum；旧读取端只 `JSON.parse`，把篡改后的 trace 当成真实诊断记录返回。
- GREEN：读取查询同时取 `trace_id/payload/checksum`；逐条重算 SHA-256，校验 JSON object 与 `traceInstanceId === trace_id`，任一失败即 `runtime-trace-corrupt`，整次读取 fail closed。
- 定向验证：SQLite persistence 13 / 13 通过，CJS syntax 通过。
- 下一动作：重构 turn trace 的 durable 时序与 replay 归属，确保 durable ACK 前 renderer 和独立 trace IPC 都不能声称 `COMMITTED`。

### 2026-08-23 · 修复 9：turn trace durable 时序与 replay owner 完成

- RED 1：`commitWorldTurn` 返回候选时 renderer ring 已是 `COMMITTED`，且 `mistRuntimeTrace.record` 可在活动存档提交前独立持久该声称。
- GREEN 1：kernel/TurnCommit 成功只生成 `PENDING`；`PENDING/COMMITTED/REPLAYED` turn trace 不走独立 IPC。持久失败后 ring 保持 `PENDING`，不会制造 committed 诊断事实。
- RED 2：renderer 等待中的 bridge request 携带 `PENDING`，durable ACK 返回后 ring 仍为 `PENDING`；旧 TurnCommit 的内存对象等价判断也无法在进程重试后可靠产生 `REPLAYED`。
- GREEN 2：SQLite 在同一 `commitTurn` 事务中，依据 durable `world_turns` 是否已存在，把 journal 内匹配的 `PENDING` 转成 `COMMITTED` 或 `REPLAYED` 后落盘；公共 append 拒绝 renderer 自报最终状态。ACK 返回后 renderer 只据 `ack.turnId/replayed` 提升本地 ring，不重复 IPC 写入。
- 重试语义：第一次同输入持久提交写 `COMMITTED`；第二次同输入由 SQLite identity journal 判为 `REPLAYED`。来源不再是进程内对象引用或已推进 revision。
- 定向验证：persistence/turn/runtime trace 37 / 37 通过，typecheck 与 SQLite CJS syntax 通过。
- 下一动作：替换 `game-engine` 中动作持久身份的 32 位 FNV，并用已知碰撞输入证明新 ID 不再冲突。

### 2026-08-23 · 修复 10：动作持久身份改用 SHA-256

- RED：固定其他 ActionContract 字段，仅令 `rawIntent` 分别为 `intent-4fd` 与 `intent-48h0`；旧 32 位 FNV 为两者生成相同 `action:1:1:1uhwfpy`。
- GREEN：`actionIdentityHash` 保留原 canonical contract 字段与集合排序，但摘要改为 `stableTextHash` 的 64 位十六进制 SHA-256。`hash()` 仍只用于成功率/候选抽样，不再承担动作持久身份。
- 定向验证：deterministic authority 5 项中 4 通过、1 项因公共空壳知识库条件跳过，0 失败；typecheck 通过。
- 下一动作：重新设计 `WorldLedger.eventArchive` 的有界身份证明，既拒绝旧 ID 复用，又不永久保留所有 segment 与 event ID。

### 2026-08-23 · 修复 11：WorldLedger 有界归档证明完成

- RED：110 周、每周 90 个事件后，旧归档增长到 22 个 segment、8097 个永久 ID，archive JSON 约 125 KiB，且会继续线性增长。
- GREEN：segment 固定保留最近 16 段；所有 archived ID 进入固定 262144-bit / 7-hash 身份过滤器（hex 64 KiB），旧 `archivedEventIds` 在 V2 load/migration 时一次性转入并移除。过滤器只用于拒绝复用，允许假阳性 fail closed，不用于证明因果存在。
- 因果完整性：仅为仍被 2048 条 retained event 引用的 archived cause 保存精确锚点；单事件 cause refs 上限 64。未知旧 cause 不能凭过滤器假阳性获准，锚点随着 retained window 推进而回收，总空间由 active retention 上界约束。
- 完整性：filter 自带 SHA-256 checksum 与 inserted/archive 计数一致性校验；锚点必须确实命中过滤器；segment、锚点、事件及快照均有上限验证。旧归档元数据不一致时 migration fail closed。
- 定向验证：world-ledger/100 周 scale 14 / 14 通过；已知 `bulk:2:0` 在 ID 明细被删除后仍拒绝复用，未知 archived cause 仍使 verify 失败。lint、typecheck、`git diff --check` 通过。
- 下一动作：全部计划修复已进入运行代码。开始全量回归前的源码级旁路搜索，检查是否还有 FNV 身份、generic active-save mutation、renderer world-RAG、自报最终 trace 或无界归档路径。

### 2026-08-23 · 第二次独立源码复核重新打开 4 个 P1

- Main-owned world RAG 仍接受 renderer 自选 `system/user/query`；占位符和 durable turn/revision 只能证明检索时点，不能阻止 renderer 借模型正文回读世界私密资料或滥用 Main credential。修复目标：renderer 只提交 Main 可验证的完整世界请求契约，Main 重建固定 system/prompt，并把检索 query 从 durable-bound payload 派生。
- persistent sidecar 的来源证明只证明“某个合法事件存在”，没有逐项绑定 member/department/lead/task 等实际 mutation subject。修复目标：每个持久 sidecar 项必须有 effect-specific claim，且 subject/targets 进入对应 ExecutionPlan scope。
- 历史 checkpoint 恢复沿用原 `saveId/branchId`，被放弃未来的 `world_turns/runtime_traces` 会与新未来冲突。修复目标：恢复必须创建新 ledger branch，从而产生新 durable origin，并保留恢复来源审计信息。
- `appendWorldLedgerEvents` 接受未知 `causeEventIds`，直到事后 verifier 才发现。修复目标：写入边界只接受当前批次先前事件、retained events 或 exact archived cause anchors，未知/前向 cause 立即拒绝。
- 当前结论恢复为 `NOT_READY_FOR_COMMIT / NOT_READY_FOR_PUSH`；四项必须全部 RED → GREEN，再重新全量验证和独立 write-set 审核。

### 2026-08-23 · 第二次独立复核的 4 个 P1 已修复

- Main world inference 改为专用 `inference:world`。renderer 不再提交世界 `system/user/query`；Main 从结构化 payload 派生查询，校验 durable week/date/base revision，覆盖 renderer 提供的 lore 字段，以 Main 固定 prompt 发起模型请求。generic inference 明确拒绝 `world-adjudication`，模型若逐字回显检索正文也会在 Main 返回 renderer 前拒绝。
- persistent sidecar 不再复用一条泛化 event claim。每个 mission、lead、department/member/recruit、governance issue、formula 和 rule signal 都生成 effect-specific `MutationClaim`，使用实际持久 identity 作为 subject，并同时校验来源事件、可见 observation、ExecutionPlan scope 与具体 actor/location/faction anchor；借角色 A 的事件修改角色 B 会 fail closed。
- 历史 checkpoint 恢复和 save import 都先调用 `createWorldLedgerBranch`，新 branch ID 由 save、父分支、fork sequence、checkpoint/import 标识和唯一 nonce 的 SHA-256 派生。活动 save 与废弃未来因此拥有不同 durable origin；旧 `world_turns/runtime_traces` 不会进入新分支。
- `appendWorldLedgerEvents` 在构造 event hash 前建立 retained IDs + exact archived cause anchors 的集合；当前批次只允许引用已先写入的事件。未知或前向 cause 立即拒绝，不再等事后 verifier 报损坏。
- 定向回归：上述四组及相邻 authority/persistence/ledger 路径 70 / 70 通过；后续新增 Main verbatim lore 拒绝后相关 48 / 48 通过。全量 build + test 为 442 项、437 通过、5 项条件跳过、0 失败。
- 静态与构建门禁：`typecheck`、`lint`、CJS syntax、`git diff --check`、bundle budget 均通过，最大 chunk 188.0 KiB / 450 KiB。
- 发行真值没有升级：`release:verify:seed` 仍以 `seed-manifest-missing` 退出，installer smoke 为 `BLOCKED / NOT_RUN`，clean-machine、production、human 证据仍为 `NOT_AVAILABLE`。
- 下一动作：等待独立代码级复核确认四个反例已闭合，再重新计算精确 write-set 与提交边界；在此之前不 stage、不 commit、不 push。

### 2026-08-23 · 第三轮代码级缺口关闭与最终验证

- Main 世界裁决不再只有“检索时点”锁。SQLite 依次冻结 pre-resolution snapshot、确定性 rule resolution 与首次完整 manifest；普通周在 resolveWeek 后、任何异步 Agent/模型调用前 stage，亲历场景复用同一 resolution，终局在 pending state 可见/持久化前 stage。首次 manifest 只能在活动存档仍等于 snapshot、resolution，或只差 activeParticipationScene 的严格兼容状态时写入；崩溃重启后修改旧日程不能把同一 turn 偷换成 quiet week。
- 重试 epoch 返回首次冻结 manifest，renderer 用其中完整 runtimeAutonomousProposals 恢复所有 act/wait/deferred proposal，再重建 adjudication、proposal boundary 与 executable ID，并与冻结 ID 集精确比对。Main 从 durable resolution 取得规则结果，不从后来活动存档重新取结果。
- 本地 retry sidecar 与模型 ticket 已物理分离：完整 manifest 独立限制为 1 MiB，推理 ticket 为 256 KiB UTF-8；runtimeAutonomousProposals 不进入 ticket 或最终 prompt。Main 仅从已冻结 sidecar 限界提取 agentRef、disposition、intent、rationale、conditionalOn，保留主体行动语义，不重新信任后来的 renderer payload。
- RAG 不可用时不会消耗世界模型 attempt；只有 durable ticket、resolution、manifest 与 RAG 全部验证后，才在实际模型调用前推进 attempt。两次结构尝试耗尽后，显式重入创建同 manifest 的新 retry epoch。
- 终局三类危机结果都具备真实 executable proposal/plan；世界失败时持久保存 pendingFinaleWorldTurn，重试复用同 chapter/turn/base revision。pending 时全屏终局层保持，doctrine、自动部署和三类 assignment 全部 disabled 且 handler 再拒绝，唯一可用动作是继续已锁定的世界回应；模型未配置时只打开设置，不先推进状态。
- recruit sidecar 必须绑定同一 actor、同一来源事件与 observation；姓名从 canonical actor 覆盖，背景/接触原因来自绑定观察，模型不能借合法事件伪造另一人物。部门、配方、rule signal 与其他 persistent sidecar 继续使用 effect-specific claim 和具体 proposal scope。
- 最新生产 build 与全量测试通过：453 项中 448 通过、5 项条件性跳过、0 失败。typecheck、lint、198 个 CJS/MJS syntax、git diff --check、bundle budget 均通过；最大 chunk 188.0 KiB / 450 KiB。
- 发行证据真值未升级：release:verify:seed 仍以 seed-manifest-missing 退出码 1 失败，因此 installer smoke 保持 BLOCKED / NOT_RUN，clean-machine、production、human 证据保持 NOT_AVAILABLE。
- 威胁边界保持明确：本轮防御合法 UI 下的晚到、失败、重入与 renderer payload 漂移；不声称抵抗已经完全攻陷并能任意调用受信 IPC 的 renderer。正式提交/推送仍等待独立只读结论、精确 write-set 和用户另行授权。

### 2026-08-23 · 最终独立审核的两个 P2 已关闭

- P2 1（RAG 失败后的 attempt 错位）：Main 只在 durable ticket、resolution、manifest、RAG 与最终 Prompt 构造均成功后推进 durable attempt；推理或回显泄漏拒绝发生在推进后时，错误通过 `worldAttemptStarted` 跨 Main IPC 返回。renderer 不再用循环序号冒充 durable attempt，而是分别限制最多 2 次 pre-model failure 与 2 次真实 model attempt。行为反例确认首次 RAG 失败后请求序列为 `[0, 0]`，而结构失败仍会推进到 attempt 1。
- P2 2（同回合新角色招募误拒）：recruit claim 只额外携带与当前 recruit 相同的 canonical `actor:*` created ref；该 actor 仍须先通过新实体创建校验，并且必须出现在同提案来源事件与玩家可得逐字 observation 中。没有把其他新角色、其他 sidecar 或普通 actor mutation 变成通配授权。
- 剩余 P2 架构边界：第一次受信 `finalizeWorld` 仍接收 renderer 构造的 execution-plan scope/commitments。当前威胁模型明确不声称抵抗已完全攻陷且可任意调用受信 IPC 的 renderer；若要抵抗该攻击者，必须把 autonomous proposal 与 execution-plan 的首次生成/签发整体迁到 Main 或独立规则进程，属于新的 authority architecture，不在本轮合法 UI 失败/重入闭环中。该项不得被描述为已修复，也不构成当前 P0/P1 阻断。
- 最新验证：生产 build 与全量测试通过，455 项中 450 通过、5 项条件性跳过、0 失败；`typecheck`、`lint`、200 个 CJS/MJS syntax、`git diff --check` 与 bundle budget 通过，最大 chunk 188.0 KiB / 450 KiB。
- 发行证据保持字面真值：`release:verify:seed` 仍以退出码 1 报 `seed-manifest-missing`；installer smoke 为 `BLOCKED / NOT_RUN`，clean-machine、production 与 human evidence 为 `NOT_AVAILABLE`。
- 当前候选 write set：76 个 tracked 修改 + 11 个预期新文件，共 87 个文件，约 6022 行新增 / 680 行删除；staged 为 0。两份受保护 QA 日志继续排除且 SHA-256 未变。当前 HEAD 与本地 `origin/main` 的 tree 相同，但历史为 1 behind / 33 ahead，因此即使独立复核无阻断，也不应直接从当前历史分支推送；提交/分支整理必须等待用户另行授权。

### 2026-08-23 · 崩溃重入与跨提案反例关闭后的最终结论

- 独立复核曾重新打开 P1：Main 已落盘 attempt 后若应用退出或 IPC 响应丢失，renderer 会从 0 重放并永久失步。现由 SQLite `prepareWorldInference` 返回真实 durable attempt；新增只读 `worldInferenceStatus`，同时核验 ticket、payload、active-save checksum、origin、turn、revision 与冻结 lock。renderer 启动从该计数恢复，只有 IPC 结果不确定时才查询 status；status=2 结束当前调用，下一次显式重入才由 prepare 创建新 epoch。
- 同一复核曾重新打开 P1：提案 B 可借用提案 A 新建角色的 created-ref。现只有同 `proposalId`、`actor-state`、同 `actorId` 且 `sourceEventId` 精确相同的 creation claim 才为该 recruit sidecar 增加 created ref；跨提案“看见角色”仍须在自己的 ExecutionPlan scope 中拥有该角色，否则拒绝。
- 独立复核的最后一个 P2 也已关闭：IPC 丢响应但 status 已证明 attempt 前进时，不再误占 pre-model failure 配额。行为序列覆盖 `[0, 1, 1]`：attempt 0 丢响应、attempt 1 的 RAG 前置失败、同 attempt 1 成功。
- 最终独立只读结论：`NO_BLOCKING_FINDINGS`，没有新的 P0/P1；上述两个 P1 与最后一个 P2 均已源码级关闭。仍保留“完全攻陷 trusted renderer”下首次 manifest/raw durable save/credential command 的架构边界，不把合法 UI 威胁模型的结论升级为该攻击者模型下的安全声明。
- 最终验证：生产 build 与全量测试通过，456 项中 451 通过、5 项条件性跳过、0 失败；`typecheck`、`lint`、200 个 CJS/MJS syntax、`git diff --check` 与 bundle budget 通过，最大 chunk 188.0 KiB / 450 KiB。`release:verify:seed` 仍明确失败为 `seed-manifest-missing`，因此 installer smoke 保持 `BLOCKED / NOT_RUN`，clean-machine、production 与 human evidence 保持 `NOT_AVAILABLE`。
- 最终候选 write set：76 个 tracked 修改 + 11 个预期新文件，共 87 个文件，约 6241 行新增 / 686 行删除；staged 为 0。受保护日志保持未跟踪且 SHA-256 未变。HEAD 与本地 `origin/main` 的 tree 均为 `da91f8d9411ad2b3efaf2778da09e829dc767ecf`，但历史为 1 behind / 33 ahead。远端 GitHub CURRENT 的只读查询因当前网络/配额限制为 `NOT_AVAILABLE`；因此本轮结论是内容可进入独立提交准备，但不能直接从当前历史分支推送，也没有执行提交或推送。

### 2026-08-24 · 远端 CURRENT 与干净分支迁移

- GitHub `refs/heads/main` 已重新只读查询并成功 fetch，远端 CURRENT、`FETCH_HEAD` 与本地 `origin/main` 均为 `d54f8e0f6abade0c3682e63f5e735e3eae39775a`。
- 87 个候选路径先以内容聚合 SHA-256 `1B58092F70C1854AA122A16AF3A351AA5E50D88C070FDAABF97420864D3B189A` 固定，再保存为可恢复 stash `f9576ecdb78aab850390a19608c25ceb751603a6`；stash 路径计数精确为 87，两份受保护 QA 日志不在其中。
- 新分支 `codex/five-stage-runtime-closure-current` 从上述 `origin/main` 精确创建，未设置 upstream；创建时 HEAD、merge-base 与 `origin/main` 相同，分叉为 0 behind / 0 ahead。随后无冲突恢复上述 87 个路径，保持 unstaged；没有提交或推送。
- 迁移后的最终门禁已确认：当前 76 个 tracked 修改 + 11 个预期新文件与 stash 的 87 个路径精确相同，路径差集为 0；staged=0、unmerged=0，`git diff --check` 通过。远端 CURRENT 二次查询仍为同一 SHA；受保护日志哈希未变。恢复 stash 保留，没有提交或推送。

### 2026-08-24 · 最终提交前审核重新打开缺陷，修复已完成

- 任务目标：不以全量测试通过代替运行代码正确性；关闭 normalized durable journal 的回合 provenance / checksum 失真、legacy 活动存档迁移失败静默吞错，并在完成后重新对照五阶段目标和预计效果。
- 已确认反例：连续回合提交会把旧 `mutationClaim` 复制并归到最新回合；完整两回合存档进入新 origin 时，两条 `retrievalReceipt` 都被归到最新回合；`mutation_claims.checksum` 不等于其 `payload` 的 SHA-256。现有单回合测试没有覆盖这些行为。
- 已确认反例：legacy 活动存档 JSON 或迁移失败时，`loadGameSession()` 返回 `hasSave=false`，既不报告 `persistenceError`，也不隔离 SQLite legacy 记录，后续启动会重复静默失败。
- 修复顺序：先以真实 SQLite 公共接口增加失败测试并修复 receipt/claim 的显式 `turnId`、稳定 ID、payload checksum 与导入行为；再增加 legacy bridge/local fallback 的失败测试并修复显式错误/quarantine；最后更新本账本和核心玩法总账，复跑定向、全量、静态与发行真值门禁。
- 当前边界：继续绑定 `codex/five-stage-runtime-closure-current` 与 fresh `origin/main=d54f8e0f6abade0c3682e63f5e735e3eae39775a`；候选仍严格限制在既有 87 个路径，不纳入或触碰两份 `.qa-prodserver3.*.log`；修复、效果复核与最终独立审核完成前不 stage、不 commit、不 push。
- 进度 1（完成）：`WorldKernel` 在提交时为新增 receipt/claim 写入真实 transaction `turnId`；SQLite writer 验证显式 owner 属于 journal transaction，多回合旧档缺少 owner 时保留字面 `state-import`，不再伪造最新回合。claim identity 与 payload checksum 已分离，连续累计提交和 fresh import 反例均已转绿。
- 进度 1 验证：新增 3 个真实 SQLite/WorldKernel 行为回归；`tests/persistence-sqlite.test.mjs` + `tests/world-kernel.test.mjs` 共 29 / 29 通过。
- 进度 2（完成）：活动存档 JSON/迁移失败统一产生 `active-save-migration-rejected`；Electron persistence 中的 current/legacy key 走 Main quarantine，浏览器 fallback 中的 current/legacy key 先复制原始字节与原因到本地 quarantine 再删除来源。若 quarantine 写入失败，来源记录保持不动，避免恢复性修复反而造成数据丢失。
- 进度 2 验证：首个 Electron legacy RED 先确认 `persistenceError` 为空；修复后 Electron quarantine 与 browser preservation 两个行为回归均通过，完整 `tests/persistence-bridge.test.mjs` 为 18 / 18。
- 深度自检补充（完成）：transaction journal 有界保留 256 回合，而低密度 claim 可能比其 transaction 保留更久。独立复审证明“可能已老化”不能等价于“任意显式 owner 可信”；writer 现在只有在 owner 仍被 journal 保留或 SQLite `world_turns` 已有对应 durable history 时才保留显式 owner。fresh import 中无法证明的老化 owner 降级为字面 `state-import`，未达到老化边界的未知 owner继续拒绝。

#### 预计效果对照（实现与最终门禁均已确认）

| 五阶段目标 | 本轮预计效果 | 当前代码级对照 |
|---|---|---|
| 1. 单一 `TurnCommit` | 不改变事务输入、重放或晚期失败隔离 | `turnId` 只在 transaction 验证成功且非 replay 后写入 kernel 累计 authority 记录；`worldTurnInputHash` 仍只计算原始 delta |
| 2. Main-owned inference / RAG | receipt 继续由 Main 检索结果产生，renderer/模型不能自授回合 owner | adapter 仍显式重建 receipt/claim；durable owner 只由 `WorldKernel` 用已验证 transaction 覆盖 |
| 3. 观察限定投影 | 新增持久元数据不得进入玩家、角色或模型可见投影 | `turnId` 只存在于 kernel 内部 authority 记录；既有 audience projection 仍排除 `retrievalReceipts` / `mutationClaims` |
| 4. `DurableTurnStore` | normalized receipt/claim 能证明真实回合；旧档不能伪归最新回合；坏 current/legacy save 可恢复诊断 | retained/durable-history owner 校验、`state-import` 真值、payload SHA-256、Electron quarantine 与 browser local quarantine 已进入运行代码并有真实 SQLite/bridge 回归 |
| 5. Archive / trace / release | 不把本机修复升级为 installer/clean-machine/production 证据 | runtime trace 与 archive 路径未改；发行 seed 缺失时继续 `BLOCKED / NOT_RUN`，等待最终门禁实测 |

- 最终本地验证：生产 build 与全量 `npm.cmd test` 通过，466 项中 461 通过、5 项条件性跳过、0 失败；`typecheck`、`lint`、200 个 CJS/MJS syntax、`git diff --check origin/main` 与 bundle budget 均通过，最大 chunk 188.0 KiB / 450 KiB。
- 发行证据继续保持字面真值：`release:verify:seed` 以退出码 1 报 `seed-manifest-missing`；installer smoke 仍为 `BLOCKED / NOT_RUN`，clean-machine、production 与 human evidence 仍为 `NOT_AVAILABLE`。
- 远端与提交边界：2026-08-24 再次 fetch 后，`origin/main`、HEAD 与 merge-base 均为 `d54f8e0f6abade0c3682e63f5e735e3eae39775a`，分叉为 0 / 0。候选仍是 76 个 tracked 修改 + 11 个预期新文件，共 87 个路径；两份 `.qa-prodserver3.*.log` 继续排除，staged=0。没有执行 commit 或 push。
- 独立复审：维护性、安全/数据完整性和测试覆盖三路审查先后重新打开 browser-only quarantine 与 unproven aged-out owner 反例；两项均按 RED → GREEN 修复并再次复审，最终三路均为 `NO_BLOCKING_FINDINGS`。
- 压缩恢复断点：代码修复、计划效果对照、本地最终门禁、独立复审和 write-set 复核均已完成。当前结论仅为具备本地提交条件；等待用户决定是否提交，之后再单独考虑是否推送。不得自行 stage、commit 或 push。

### 2026-08-24 · 用户授权后的合并前独立审查（历史记录）

- 用户授权边界：只有再次确认五阶段计划效果与当前代码一致、独立审查无阻断、锁定 head 的必需 CI 通过时才合并；不得因已有测试或旧 head 绿色直接合并。
- 审查起点：PR #3 的锁定 head 为 `e32d934ecdd3d891a6aade6e0e34d9670f474728`，相对 fresh `origin/main=d54f8e0f6abade0c3682e63f5e735e3eae39775a` 仍精确为原 87 路径，远端双平台 CI 绿色。
- 代码级复核重新打开并修复：长设定短片段可绕过逐字泄露检测；renderer RAG 可冒充已存在但未授权的 NPC/势力；坏 recovery 在替换事务前被先行隔离；写入口接受无法读取的 malformed checkpoint；SQLite 不可用时 world IPC 解引用空 store；Main 机器错误码直出玩家；成功隔离的旧存档被误报为数据库打不开；受众投影存在重复全数组扫描；关键拒绝分支缺少直接回归。
- 当前实现效果：隐藏设定按去空白/标点后的 8 字滑窗拒绝逐字摘录；议会/对话 RAG 只接受真实成员，自治 RAG 只接受 durable active principal 且实体存在；recovery 读取、隔离、替换与 active save 写入处于同一 SQLite 事务；checkpoint 由 IPC/store 共用结构谓词；所有 world IPC 在空 store 时稳定 fail closed；模型、world、RAG、persistence 错误在玩家边界映射；迁移隔离成功为可恢复 warning、隔离失败仍 fatal；投影改用事件/观察/地点索引。
- 新增行为回归覆盖非法 TurnCommit candidate、缺失 RAG authority envelope、15 字/标点分段/多字段 lore 泄露、NPC/非 active autonomous 冒充、空 persistence store、坏 recovery 回滚、malformed checkpoint 拒绝、隔离 warning/fatal 分流与用户可读错误映射。
- 本记录写入时的远端边界：上述合并前增量尚待新的本地完整门禁、精确提交、push 与 exact-head CI；该顺序是历史事实，不表示后续步骤已自动完成。

### 2026-08-24 · 合并前技术债闭环

- 单一保留策略：renderer `WorldKernel` 与 Main SQLite 不再各自硬编码 256；`shared/runtime-limits.json` 成为 committed transaction 与 authority receipt 上限的共同 owner，避免老化 owner 判断和内存裁剪发生漂移。
- 语义 DTO 与 durable DTO 分离：模型/adapter 只生成没有 `turnId` 的 `RetrievalReceipt` / `MutationClaim`；事务成功后由 `WorldKernel` 生成必带 owner 的 durable 记录。旧存档只在唯一 retained transaction 时继承该 owner，否则明确记为 `state-import`。
- Electron 自治规划迁入 Main：公开 RAG 不再接受 autonomous purpose，generic inference 不再接受 `autonomous-planning`。renderer 只提交 principal/week/baseRevision/attempt；Main 从 staged durable authority 派生主体投影、私有记忆、RAG query、固定 system/user prompt，校验模型提案和逐字 lore 泄漏后才返回有界 proposal。
- 自治提案首次 authority 不再由 renderer 签发：Main 按 origin/turn/revision/agent 将 canonical proposal 写入 checksummed SQLite；重启与并发重入读取同一记录，第二次失败由 Main 生成固定的 deterministic fallback。最终 manifest 必须包含与 Main 记录精确相同的完整 active-agent proposal 集，且 autonomous ExecutionPlan 只能使用同一 agent、已记录 target 与全零资源承诺。
- staged authority 与规划状态使用同一 `ensureAutonomousWorldState` 归一化，避免新唤醒/轮换主体在 renderer 规划集合与 Main 授权集合之间漂移。world turn 提交后，proposal、world lock 与 inference ticket 在同一事务路径清理。
- 威胁边界：本批关闭 autonomous query/prompt/proposal/基础 execution scope 的 renderer 替换路径；不声称任意受信 IPC 与活动存档写入都已迁出 renderer，也不把 browser preview 路径当作 Electron 权威证据。
- 本地门禁：生产 build 与全量测试通过，485 项中 480 通过、5 项条件跳过、0 失败；typecheck、lint（0 warning）、202 个 CJS/MJS syntax、`git diff --check`、source release verify 与 bundle budget 均通过，最大 chunk 188.0 KiB / 450 KiB。
- 发行真值：`release:verify:seed` 仍以退出码 1 报 `seed-manifest-missing`；installer smoke 为 `BLOCKED / NOT_RUN`，clean-machine、production 与 human evidence 为 `NOT_AVAILABLE`。
- 合并门禁状态：本地实现、代码级复核与门禁已完成；fresh remote CURRENT、精确 write-set、锁定提交、exact-head CI、合并和 resulting-main CI 仍须以后续实际执行结果为准，不预先升级。
