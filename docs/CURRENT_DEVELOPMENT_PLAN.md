# 《灰雾纪事》当前开发计划与技术债闭环账本

状态：`DELIVERY_IN_PROGRESS / CLEAN_PR_EXACT_MAIN_THEN_REL-01.4`

最后更新：2026-08-25

用途：本文件是下一阶段唯一的执行真相源。Codex 自动压缩、换会话或更换模型后，执行者必须完整重读本文件，不得依赖聊天摘要恢复任务目标和进度。

## 0. 当前锚点

```text
REPOSITORY=D:\gmzz
AUDITED_LOCAL_BRANCH=codex/technical-debt-delivery
DELIVERY_BASE=origin/main@c75eb6b03c6529d3eb14d536cb4a73e086f12e40
DELIVERY_MIGRATION_COMMIT=2e9d8d5ae71b51e7905a46c0a4e37a3fd2c0235b (parent is exact DELIVERY_BASE; tree matched authorized 930a771 commit before delivery-workflow edits)
DELIVERY_GATE_COMMIT=95b4b729c1df5a1be1a8264b8e4bd5b14db7e0bc
CURRENT_WORKTREE=DIRTY_INTENTIONAL_CI_FIX (PR merge-ref isolation and cross-platform provenance test root plus ledger; two protected untracked QA logs remain)
REMOTE_MAIN_CURRENT=c75eb6b03c6529d3eb14d536cb4a73e086f12e40 (refreshed after local gate commit; merge-base exact; refresh again before merge)
AUDITED_TREE=e1853441ab86d1ff827763af9ac500b6ea90133e (delivery gate commit)
REMOTE_MAIN_TREE=PENDING_EXACT_HEAD_RECHECK
REMOTE_MAIN_TREE_BASIS=CLEAN_BRANCH_PARENT_IS_EXACT_VERIFIED_MAIN
LATEST_MERGED_DELIVERY=GitHub PR #4
CURRENT_NEXT_PACKAGE=DELIVERY-01 then REL-01.4
CURRENT_NEXT_ACTION=提交并推送 PR merge-ref/跨平台测试根修复，等待 PR #5 再次更新后的精确 head 通过 build(ubuntu/windows) CI 与审核；main 当前要求 strict 两项 CI、approval count=0、三种合并方式均允许；仅在锁定精确 head 后合并并验证 resulting main；之后才进入版本/tag、签名、Job B/Job C 和发布证据
PACKAGE_PROGRESS=IMPLEMENTATION_AND_LOCAL_DELIVERY_GATE_COMPLETE; PR_5_OPEN; HOSTED_CI_FAILED_ON_96fabd2_AND_FIX_PENDING; EXACT_MAIN_NOT_MERGED; SIGNED_RELEASE_AND_EXTERNAL_EVIDENCE_PENDING
```

本地审计分支与远端 `main` 的 commit identity 不同；本轮只读 `git ls-remote` 得到 `c75eb6b03c6529d3eb14d536cb4a73e086f12e40`，没有 fetch，因此不宣称远端 tree 与本地相同。开始提交/推送前仍必须重新查询 GitHub CURRENT，不能把上面的 SHA 当成永久事实。

既有未跟踪文件：

- `.qa-prodserver3.err.log`
- `.qa-prodserver3.out.log`

它们不属于本计划，禁止读取后改写、清理、提交、移动或覆盖。

## 1. 不可回退约束

1. 玩家表面继续服从“看局势 → 定目标 → 派人授权 → 世界回应 → 看见回响”；本计划不新增玩法页、不增加行动点、排班、任务步骤或玩家可见的 Agent/RAG/账本术语。
2. 模型只能提出候选；规则、授权、受众投影、持久化和最终展示权威继续由确定性代码拥有。
3. `NOT_RUN`、`NOT_AVAILABLE`、`PENDING`、`BLOCKED`、`UNVERIFIED` 必须保持字面真值。本机测试不能升级成安装包、干净机器、生产或真人长线证据。
4. 不得伪造知识库、市场数据、模型输出或发布证据；依赖、网络、seed 或模型不可用时必须失败关闭。
5. 不得自动提交、推送、创建 PR、合并或修改分支保护；这些动作需要用户明确授权。本轮用户已明确授权“干净交付分支 → 新 PR/CI/审核 → exact-head 合并 → exact-main → 签名和独立发布证据”，但仍不得绕过失败检查、必要审核、版本确认、证书或发布输入门禁。
6. 每次只推进一个工作包。共享权威模块上的任务不得并行改写。
7. 每个工作包开始、遇到阻塞、完成验证时，都要先更新本文件的状态、证据和 `CURRENT_NEXT_ACTION`。

## 2. D 盘唯一项目存储政策

用户要求从本阶段开始，项目源文件、构建产物、测试临时文件、浏览器缓存、Electron userData、npm 缓存、RAG 索引、覆盖率报告和发行证据都不得写入 C 盘。

本要求按以下边界执行：

- 当前工作区所有项目运行都使用 `D:\gmzz\.runtime\<run-id>`；该目录已被 `.gitignore` 忽略。
- 不把 `D:\` 写死为面向所有用户的发行假设。代码接收显式 `GMZZ_STORAGE_ROOT`；本机门禁再要求其解析结果位于 D 盘。未来通用发行必须让用户选择数据根目录，未选择时返回 `STORAGE_ROOT_NOT_CONFIGURED`，不得静默回落到 C 盘。
- Codex 桌面应用自身的附件、日志和记忆目录不属于项目进程，本仓库无法控制；本计划只承诺不主动向 C 盘写入项目文件或项目运行数据。

在 D 盘门禁完成前，所有本机验证命令必须显式设置：

```powershell
$env:GMZZ_STORAGE_ROOT = 'D:\gmzz\.runtime'
$env:GMZZ_USER_DATA = 'D:\gmzz\.runtime\user-data'
$env:TEMP = 'D:\gmzz\.runtime\tmp'
$env:TMP = 'D:\gmzz\.runtime\tmp'
$env:npm_config_cache = 'D:\gmzz\.runtime\npm-cache'
$env:ELECTRON_CACHE = 'D:\gmzz\.runtime\electron-cache'
$env:ELECTRON_BUILDER_CACHE = 'D:\gmzz\.runtime\electron-builder-cache'
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\gmzz\.runtime\playwright'
```

当前已确认的不合规点：

- 测试文件仍调用 `os.tmpdir()`，但 npm/D 盘 runner 已把 `TEMP/TMP` 显式指向 D 盘；后续可作为独立收紧包，不把 Node 默认值当作项目生产写路径。
- `scripts/play.mjs` 与 `scripts/publish-github.mjs` 仍读取 `LOCALAPPDATA` 以发现只读外部可执行文件（浏览器/GitHub CLI），不把它作为项目写入根；写入的日志、profile、缓存和 userData 均已迁移到 runtime policy。

DSK-01B.1、DSK-01B.2、DSK-01B.3、DSK-01B.4 已关闭：QA 路径、RAG 导出/状态、真实回归、Electron userData、smoke/play、release/RAG 临时目录和 secure wrapper 均使用 runtime policy。

## 3. 本次审计方法与当前验证

### 3.1 当前仓库验证

```text
TYPECHECK=PASS
LINT=PASS
BUILD=PASS
BUNDLE_BUDGET=PASS (largest react-runtime chunk 185.3 KiB / limit 450 KiB)
FINAL_GIT_DIFF_CHECK=PASS
FINAL_PRODUCTION_STORAGE_SCAN=PASS (production sources have no C-drive project write root; test os.tmpdir calls resolve under the D-bound TEMP/TMP validation environment; LOCALAPPDATA is read-only executable discovery only)
FINAL_D_STORAGE_PREFLIGHT=PASS (D:\\gmzz\\.runtime)
TESTS_TOTAL=571
TESTS_PASS=565
TESTS_SKIP=6
TESTS_FAIL=0
TEST_DURATION_MS=452824.7288
VALIDATION_ENV=GMZZ_STORAGE_ROOT/TEMP/TMP/npm_config_cache/ELECTRON_CACHE/ELECTRON_BUILDER_CACHE/PLAYWRIGHT_BROWSERS_PATH all under D:\\gmzz\\.runtime
DSK_TARGETED_TESTS_TOTAL=24
DSK_TARGETED_TESTS_PASS=24
DSK_TARGETED_TESTS_FAIL=0
STORAGE_PREFLIGHT=PASS (D:\\gmzz\\.runtime)
COV_VERIFIER_TARGETED=8/8 PASS (source-file presence, executable counters, finite counters, commit binding, report digest, missing-manifest and baseline fail-closed cases)
COV_VERIFIER_EMPTY_REPORT=PASS_EXPECTED_FAIL_CLOSED (negative fixture exits non-zero instead of false green)
QA_PLAYWRIGHT_HARDCODE_SCAN=PASS (5 scripts + rag-media test)
NLP_EVALUATOR_STRICT=PASS (160 cases / 40 classes; kind macro F1=1.000; target F1=0.9669421488; authorization scope F1=0.9000000000; resource posture F1=1.0000000000; critical over-grant=0; ambiguity recall=1.000; resource posture gate >=0.95)
NLP_TARGETED_TESTS=12/12 PASS (gold fixture, source-bound evidence, negated-resource minimal posture, kind/target/resource/auth/red-line/retreat façade characterization)
LEAK_EVALUATOR_STRICT=PASS (120 cases / 5 classes; hidden verbatim false negatives=0; structured fact false negatives=0; public/safe false positives=0/48; risk signals=8; policy=verbatim-leak-v2)
LEAK_BENCHMARK=PASS (20,040-character response, 8 records; Set scan recheck p50=21.546ms, p95=28.307ms, max=29.724ms; no Aho-Corasick escalation)
ELECTRON_MAIN_UI_SMOKE=BLOCKED_BY_HOST_GPU_VIRTUALIZATION (local Chromium/GPU renderer cannot create a stable window; this does not invalidate server-only installer smoke)
PRODUCTION_SERVER_D_RUNTIME=PASS (node electron/server.mjs, port 3224, HTTP 200, 9359 bytes, title present)
PLAY_D_RUNTIME=PASS (no-browser, --wait=1, 3020)
PERSISTENCE_LIFECYCLE_D_RUNTIME=PASS (local-electron, D userData/temp)
PUBLIC_BUILD_D_RUNTIME=PASS (D temp clone, 485/480/5)
RAG_CLEAN_SEED_SOAK=NOT_RUN (private index/authorized seed absent; clean-install stopped at pack precondition)
CODE_COVERAGE=PASS (35.67% statements / 24.02% branches / 28.67% functions / 41.02% lines; 14 required sources including ai-provider-capabilities.ts, inference-scheduler.cjs, persistence-provenance.cjs, week-resolution.ts and world-turn-orchestrator.ts; post-fix baseline no-regression)
COV_MANIFEST=PASS (HEAD-bound report SHA-256=81e317c590ce9337116d25d89f1c1a4550971b9f889e6714e5986532176ff2f0; sourceFileCount=14)
COV_VERIFIER=PASS (baseline, source presence, finite counters, digest and commit binding; totalCounters=8921)
AUTH_TARGETED_TESTS=30/30 PASS (runtime authority + projection parity)
AUTH_PRIVACY_PERSISTENCE_TARGETED=55/55 PASS
PACKAGED_INSTALLER_BUILD=PASS (NSIS 0.4.0, Electron 43.3.0; D:\\gmzz\\release\\灰雾纪事-Setup-0.4.0.exe)
PACKAGED_INSTALLER_PROVENANCE=PASS (release/provenance.json; sourceCommit=1aed3d86c6ce3375e8beb9982722e5b05568cbab; signature=NotSigned)
INSTALLER_SMOKE=PASS (GMZZ_READY + C-grade seed deployment + SQLite WAL/persistence_records read-only schema probe + exact-root cleanup)
INSTALLER_UI_QA=BLOCKED_BY_HOST_GPU_VIRTUALIZATION (install succeeds; Playwright renderer target crashes)
CLEAN_MACHINE=NOT_AVAILABLE
PRODUCTION=NOT_AVAILABLE
HUMAN_LONG_PLAY=NOT_AVAILABLE
REMOTE_PR4_STATE=MERGED
REMOTE_PR4_UBUNTU_CI=SUCCESS
REMOTE_PR4_WINDOWS_CI=SUCCESS
REMOTE_PR4_EVIDENCE_BASIS=LAST_KNOWN_PR_RECORD (CURRENT_REMOTE_UNAVAILABLE)
SEC_TARGETED_TESTS=7/7 PASS (CSP script/style, per-response nonce, non-empty app URL/* pattern, and renderer inline-style source scan)
PROMPT_TARGETED_TESTS=18/18 PASS (quiet-week empty output, zero-to-four contract, source binding and adapter limit)
INLINE_STYLE_SOURCE_SCAN=PASS (0 style={{ matches in app/*.tsx)
SSR_INLINE_STYLE_SCAN=PASS (production root HTML 0 <style> tags and 0 style= attributes)
SSR_INLINE_SCRIPT_SCAN=PASS_WITH_REQUEST_NONCE (manual D-runtime server check: 7/7 SSR inline scripts received the supplied request nonce)
SSR_NONCE_REQUEST_RESPONSE=PASS (two different request nonces, 7/7 scripts each, Cache-Control no-store)
CSP_URL_PATTERN=PASS (Main webRequest uses valid non-empty app URL/*; exact origin remains enforced by trusted persistence sender guard)
CSP_SCRIPT_UNSAFE_INLINE=ABSENT
CSP_STYLE_UNSAFE_INLINE=ABSENT
```

本轮完整测试使用 D 盘隔离的 `TEMP/TMP/GMZZ_USER_DATA/npm/Electron cache`；`storage:preflight` 也在 D 盘输出机器可读 PASS。6 个 skip 是公共 C-grade 空壳知识库、可选 Playwright/renderer 生命周期或需要 Release CI 的真实 lore 一致性检查，不得写成通过。

### 3.2 结构量化

| 文件 | 字节 | 行数 | 结论 |
|---|---:|---:|---|
| `app/game-engine.ts` | 25,733 | 355 | ARCH-01D 后的 façade；组合根与玩家/晋升/场景 API 保留，世界回合 owner 已移出 |
| `app/game-engine/week-resolution.ts` | 65,803 | 886 | ARCH-01C 新 owner；行为已锁定，但模块本身仍大于最终单模块目标 |
| `app/game-engine/world-turn-orchestrator.ts` | 61,395 | 927 | ARCH-01D 新 owner；保留世界回合完整顺序，行为由 characterization 与相邻回归锁定 |
| `app/complete-game.tsx` | 105,333 | 1,203 | 第二个明显控制中心，暂不与引擎拆分同包处理 |
| `app/game-model.ts` | 94,516 | 1,526 | 大型模型定义文件，当前不是最高风险执行权威 |
| `electron/persistence-sqlite.cjs` | 65,212 | 1,100 | 评价所称“超过 1000 行的持久化控制中心”成立 |
| `electron/main.cjs` | 25,029 | 647 | Main 组合根偏大，但远小于 `game-engine.ts` |

ARCH-01D 后，`resolveWeek` 与 `generateAiWorldDelta` 均只保留一个 owner 实现，façade 只做兼容导出；三个引擎模块之间没有反向 import。源码位置断言已改为同时读取 façade 与 owner 模块，行为 characterization 仍是独立证据，不能被源码文本断言替代。

### 3.3 正则量化

对 `app/` 与 `electron/` 的 158 个生产文件做 TypeScript AST 统计（排除生成的 lore 文件）：

```text
REGEX_LITERALS_TOTAL=406
REGEX_LITERALS_WITH_HAN=296
FILES_WITH_HAN_REGEX=33
GAME_ENGINE_REGEX_TOTAL=104
GAME_ENGINE_REGEX_WITH_HAN=86
```

中文正则最多的文件包括：

| 文件 | 中文正则数 |
|---|---:|
| `app/game-engine.ts` | 86 |
| `app/progression-system.ts` | 27 |
| `app/abilities/intent.ts` | 17 |
| `app/ability-generation/planner.ts` | 14 |
| `app/finale-system.ts` | 14 |
| `app/ability-system.ts` | 12 |
| `app/world-kernel.ts` | 12 |
| `app/rag/query-analyzer.ts` | 9 |

“正则很多”本身不是缺陷。ID、格式、长度、标点清洗和确定性安全校验继续适合正则。真实风险是：自由中文中的意图类别、否定范围、授权边界、资源姿态、目标和风险判断，有多处仍由关键词/正则单独作语义权威。

### 3.4 覆盖率审计

初始审计结论仍成立：此前 `package.json` 只有 `node --test`，CI 没有代码覆盖门禁，且 Node 内置探针对 Vite `ssrLoadModule` 的目标源文件会产生空报告假绿；`rag:coverage` 不是代码覆盖率。

`COV-01` 已完成闭环：

- `vitest@4.1.11` + `@vitest/coverage-v8@4.1.11` 使用 `D:\gmzz\.runtime\npm-cache`，配置收集 14 个权威源文件（包含 `app/nlp/intent-contract.ts`、`dialogue-orchestration.ts`、`week-resolution.ts`、`world-turn-orchestrator.ts`、scheduler 与 provenance owners），并将报告写入 `D:\gmzz\.runtime\coverage`。
- `tests/coverage-baseline.json` 是第一次真实 source-aware 基线；`scripts/write-code-coverage-manifest.mjs` 绑定 HEAD、报告 SHA-256 和源文件清单；`scripts/verify-code-coverage.mjs --baseline tests/coverage-baseline.json` 拒绝空报告、缺源、计数/百分比回退。
- 最新本地报告：`35.67% statements / 24.02% branches / 28.67% functions / 41.02% lines`，14 个必需源文件、8,921 counters，`coverage:verify=PASS`，manifest report SHA-256=`81e317c590ce9337116d25d89f1c1a4550971b9f889e6714e5986532176ff2f0`。其中新增 scheduler/provenance owner 与 NLP 对抗分支已进入 source-aware 收集；Node characterization 仍作为行为证据单独保留，不混算。这是真实本机报告，不等同于 hosted CI、安装包或生产覆盖率。

当前 Vitest 官方文档说明其 V8 provider 会对 Vite 转换后的源文件做 AST remap，并支持 include、glob 阈值和 per-file 阈值；本计划选它建立单独的 source-aware 覆盖通道，同时保留现有 Node 测试，不一次性迁移 485 个测试。参考：<https://main.vitest.dev/guide/coverage>、<https://main.vitest.dev/config/coverage>。

## 4. 对粘贴评价的逐项裁决

裁决值：`VERIFIED`、`MOSTLY_VERIFIED`、`PARTIALLY_CORRECT`、`OUTDATED`、`UNVERIFIED_OPINION`。

| ID | 原评价主张 | 裁决 | 审计结论 |
|---|---|---|---|
| A-01 | 当前交付已进入 PR #4/current main | `MOSTLY_VERIFIED` | PR #4 已合并；源 head `1aed3d8` 与 merge commit `c75eb6b` 的历史 tree 相同，但本轮无法查询 GitHub CURRENT，不能证明它仍是当前远端 main。现有两份账本文首仍写 PR #3，属于文档陈旧。 |
| A-02 | Exact Prompt Evidence 已实质修复 | `VERIFIED` | Main 依据最终实际放入 prompt 的精确 record/content 生成 context hash 和 receipt，不再把未放入 prompt 的记录算作证据。 |
| A-03 | Mutation authority 已从“提案存在”提升为语义范围校验 | `VERIFIED` | claim 会校验 effect、subject、target、resource 和本轮来源事件；`world:world` 不再是通配授权；adapter 还会把 claim 与实际 delta 比对。 |
| A-04 | API key 与关键推理已迁到 Main | `VERIFIED` | DeepSeek 凭据由 `safeStorage`/Main 持有，renderer 不能给 internal world task 注入 key、endpoint 或 prompt。 |
| A-05 | SQLite exactly-once 已显著加强 | `MOSTLY_VERIFIED` | `world_turns` 对 `(origin_id, turn_id)` 与 `(origin_id, resolving_week)` 唯一；推理锁、请求与主体 proposal 都有 durable identity/checksum，并在 `BEGIN IMMEDIATE` 事务内冻结。这里只证明代码和本机 SQLite 回归，不等于安装包/干净机证据。 |
| A-06 | 自治主体规划已成为 Main-owned | `VERIFIED` | Main 重建投影、RAG、prompt、模型调用、fallback 和 proposal 持久化；renderer 只能消费冻结后的提案。 |
| P0-01 | Main 自治投影绕过规范受众投影 | `VERIFIED` | `electron/autonomous-inference.cjs` 直接读取 canonical kernel；所有 location ID 都进入允许列表，当前地点还暴露 canonical risk/stability/publicMood/conditions。 |
| P0-02 | `knownKnowledgeIds` 与 `visibleKnowledge` 选择不同 12 条 | `VERIFIED` | 前者取过滤结果前 12 条，后者取后 12 条；知识超过 12 条时模型看见的内容和允许引用的 ID 会错位。 |
| P1-01 | 世界 prompt 通过固定 first-N 截断，缺少因果闭包 | `VERIFIED` | location/actor/faction/project 与 plans 分别按固定上限取数组前部；没有“所有可执行 target 必须进入上下文”的强制不变量或 omission receipt。 |
| P1-02 | 推理网关能力较基础 | `MOSTLY_VERIFIED` | 目前按字符限制 prompt、固定 `stream:false`、只请求 `json_object`；没有 provider capability registry、token budget、schema/grammar、退避、熔断和 provider-aware queue。但已有 timeout、响应字节上限、远端 compatible endpoint 拒绝和稳定错误映射，不能称为完全裸奔。 |
| P1-03 | 固定并发 8 缺少供应商调度 | `VERIFIED` | `AgentPlanningService` 写死 8；底层只做本地 pool clamp，没有按 provider/rate-limit/延迟自适应。 |
| P1-04 | 安静周与“必须 2 至 4 条公开消息”冲突 | `VERIFIED` | Main prompt 同一句同时表达两者，确有自相矛盾；现有安静周测试没有约束该 prompt。 |
| P1-05 | 8 字中文泄漏检测容易误报 | `VERIFIED` | 实测公开常见短语“贝克兰德的值夜者小队”会触发 `WORLD_LORE_VERBATIM_LEAK_REJECTED`。 |
| P1-05b | 该检测会发生明显平方级性能爆炸 | `OUTDATED` | 当前先构建 response 8-gram `Set`，再扫描 source，近似线性于文本总长度；主要缺陷是语义误报和敏感度策略，不是所称的朴素平方复杂度。 |
| P1-06 | CSP 含 `unsafe-inline` | `VERIFIED` | 初始审计确认 script/style 都允许 inline，且未发现 `dangerouslySetInnerHTML`、直接 `innerHTML=`、`eval` 或 `new Function`，所以可利用链未被证明；SEC-01 已移除 `unsafe-inline`，并以 per-response nonce 覆盖合法 SSR bootstrap。 |
| P1-07 | 旧权威会静默退化为 `state-import` | `PARTIALLY_CORRECT` | fresh legacy/import 无 durable owner 证明时会显式标记 `state-import`；retained journal 或既有 `world_turns` 能证明的 owner 会保留。它是显式 provenance 边界，不是当前数据库内已提交回合的静默 exactly-once 退化。 |
| P2-01 | 存在上帝文件/控制中心 | `VERIFIED` | `game-engine.ts` 与 `persistence-sqlite.cjs` 均成立；必须在行为覆盖和 P0 修复后采用绞杀式拆分，不能大爆炸重写。 |
| P2-02 | 无覆盖率量化 | `PARTIALLY_CORRECT` | 原主张对当前状态已过时：已建立 7 源文件 source-aware statements/branches/functions/lines 报告、HEAD-bound manifest、baseline 与 fail-closed verifier；但仍是本机/本地源码证据，未证明 hosted CI、安装包、干净机或生产覆盖率。 |
| P2-03 | 中文 NLP 正则脆弱 | `VERIFIED_WITH_SCOPE` | 语义权威路径成立；格式和安全正则不应为了降低计数而移除。 |
| BIZ-01 | 8.3/10、第一梯队候选、竞品排名 | `UNVERIFIED_OPINION` | 没有公开的评分量表、版本锁定、同场景脚本和原始结果，无法复现；不把这些分数写入产品事实或工程优先级。 |

## 5. 工作包总览

状态值只允许：`READY`、`PENDING`、`IN_PROGRESS`、`BLOCKED`、`COMPLETE`。

| ID | 状态 | 目标 | 依赖 | 最大生产文件 write-set |
|---|---|---|---|---:|
| DSK-01A | `COMPLETE` | 建立 D 盘运行根与失败关闭门禁 | 无 | 4 |
| DSK-01B | `COMPLETE` | 清除 QA/RAG 的 C 盘硬编码与隐式回退 | DSK-01A | 7 |
| AUTH-01 | `COMPLETE` | 统一 Main 自治受众投影并修复知识错位 | DSK-01A | 5 |
| COV-01 | `COMPLETE` | 建立 source-aware 代码覆盖率与反假绿门禁；首次真实基线已记录，CI 按基线不得回退 | AUTH-01 | 8 |
| CTX-01 | `COMPLETE` | 用因果实体闭包替代 first-N 上下文 | AUTH-01, COV-01 | 3 |
| PROMPT-01 | `COMPLETE` | 消除安静周公开消息矛盾 | CTX-01 | 1 |
| NLP-01 | `COMPLETE` | 建立中文意图金标评测与解释性 contract parser | COV-01 | 5 |
| LEAK-01 | `COMPLETE` | 建立敏感度感知的泄漏策略与误报评测 | COV-01 | 3 |
| ARCH-01A | `COMPLETE` | 从 game-engine 提取行动契约解析 | NLP-01 | 2 |
| ARCH-01B | `COMPLETE` | 提取 NPC/议会对话编排 | ARCH-01A | 2 |
| ARCH-01C | `COMPLETE` | 提取周结算 | ARCH-01B | 2 |
| ARCH-01D | `COMPLETE` | 提取世界回合编排并保留 façade | CTX-01, ARCH-01C | 2 |
| GATE-01 | `COMPLETE` | provider capability 与 token/schema 策略 | CTX-01 | 3 |
| SCHED-01 | `COMPLETE` | provider-aware 队列、退避与熔断 | GATE-01 | 3 |
| SEC-01 | `COMPLETE` | 去除 CSP `unsafe-inline`，以 per-response nonce 保留合法 SSR bootstrap（Electron 主流程 smoke 保持 BLOCKED_BY_LOCAL_GPU） | DSK-01B | 10 |
| PROV-01 | `COMPLETE` | 显式 provenance/readability 边界 | COV-01 | 3 |
| REL-01 | `IN_PROGRESS` | C-grade seed/安装包已完成；签名、clean-machine、production、human 证据仍待补 | 前述所有包 | 依证据任务锁定 |

## 6. 工作包执行规格

### DSK-01A：D 盘运行根与门禁

目标：在任何测试、构建、QA 或 Electron 启动前，解析出一个显式项目存储根；本机严格模式下若不是 D 盘就失败关闭。

当前执行状态：`COMPLETE`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

完成证据：`runtime-paths`、`d-storage-preflight`、D 盘路径边界和失败关闭测试均已落地；后续 DSK-01B 只调用其公共路径契约，不复制根解析逻辑。

原子进度：

- `DSK-01A.1` `COMPLETE`：显式 `GMZZ_STORAGE_ROOT` 规范化；先观察 `ERR_MODULE_NOT_FOUND` 红测，再实现，单测 `1/1 PASS`。
- `DSK-01A.2` `COMPLETE`：严格 D 盘根、显式空/相对根、相对运行覆盖和路径穿越均先红后绿；C 盘 preflight `BLOCKED` 且不创建目录。
- `DSK-01A.3` `COMPLETE`：`tempRoot`、`userDataRoot`、缓存、Playwright、RAG 和 QA 路径均有 root containment 断言。
- `DSK-01A.4` `COMPLETE`：`npm run storage:preflight` 输出机器可读 PASS/BLOCKED，未访问网络。

允许写入：

- 新建 `scripts/lib/runtime-paths.mjs`
- 新建 `scripts/d-storage-preflight.mjs`
- 修改 `package.json`
- 新建 `tests/d-storage-policy.test.mjs`
- 更新本文件状态

步骤：

1. `resolveStorageRoot()` 优先读取 `GMZZ_STORAGE_ROOT`，开发态默认 `<repo>/.runtime`；返回绝对路径和 drive。
2. 当 `GMZZ_REQUIRE_D_DRIVE=1` 时，非 `D:\` 根抛出 `PROJECT_STORAGE_ROOT_NOT_ON_D`；不得 fallback 到 home、APPDATA 或 `os.tmpdir()`。
3. 暴露 `tempRoot`、`userDataRoot`、`npmCacheRoot`、`electronCacheRoot`、`playwrightRoot`、`ragRoot`，全部必须位于 storage root 内。
4. 新增 `npm run storage:preflight`；它只创建 D 盘目录并输出机器可读 JSON，不访问网络。
5. 新增负向测试：C 盘根、相对路径、路径穿越、空配置都按契约拒绝。

验收：

```text
D_STORAGE_PREFLIGHT=PASS
PROJECT_STORAGE_DRIVE=D
C_DRIVE_PROJECT_WRITE_COUNT=0
STORAGE_FALLBACK_TO_APPDATA=DISABLED_IN_STRICT_MODE
```

停止条件：若 CI 必须在非 D 盘运行，CI 只关闭 `GMZZ_REQUIRE_D_DRIVE`，但仍用仓库内 `.runtime`；不得为了 CI 删除路径边界测试。

### DSK-01B：迁移隐式 C 盘写入

当前执行状态：`COMPLETE`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

原子进度：

- `DSK-01B.1` `COMPLETE`：新增 `scripts/lib/qa-paths.mjs`；5 个 QA 脚本和 `tests/rag-media.test.mjs` 不再出现用户特定 C 盘 Playwright 路径；QA 子进程继承 D 盘 storage/userData/TEMP/cache/Playwright 环境。
- `DSK-01B.2` `COMPLETE`：`export-runtime`、`status`、`real-week-regression`、`real-materiality-regression` 已先红后绿迁移到显式 runtime/RAG 根。
- `DSK-01B.3` `COMPLETE`：`electron/main.cjs`、两个 safeStorage 长线启动器共享 CJS runtime resolver；开发态默认 repo `.runtime/user-data`，打包态无显式根返回 `STORAGE_ROOT_NOT_CONFIGURED`。
- `DSK-01B.4` `COMPLETE`：先观察新增策略红测失败，再迁移 `electron-smoke.mjs`、`play.mjs`、`verify-public-build.mjs`、`release/persistence-lifecycle.mjs` 与 3 个 RAG 临时目录脚本；补上 `play --wait` 的可退出清理，定向策略 16/16、smoke、play、Electron lifecycle、公共构建均在 D 盘通过。

分两次窄提交完成，单次不超过 7 个生产文件：

1. QA 路径批次（`DSK-01B.1`）：移除 5 个 `gmzz-qa-playwright` 硬编码，统一从 runtime paths 取得 Playwright 与临时目录。
2. RAG/真实周批次（`DSK-01B.2`）：`export-runtime`、`status`、`real-week-regression`、`real-materiality-regression` 只读取显式 `RAG_INDEX_DIR` 或 storage root；不再回退 `%APPDATA%`。
3. Electron 开发启动在未传 `GMZZ_USER_DATA` 时使用 repo `.runtime/user-data`。打包运行若没有显式 storage root，返回可诊断状态，不暗写 C 盘（`DSK-01B.3`）。
4. `os.tmpdir()` 测试可继续使用，但项目 QA/release/RAG 脚本必须从 runtime `tempRoot` 取得临时目录；npm 脚本由 D 盘 runner 注入 `TEMP/TMP`，直接运行给出失败提示（`DSK-01B.4`）。

验收：

- 全仓库不再出现用户特定的 `C:\Users\Administrator\AppData\Local\Temp\gmzz-qa-playwright`。
- D 盘 runner 下完整 `npm test`、typecheck、lint 通过。
- 运行前后对 C 盘项目路径的监测没有新文件；只记录相对时间窗和显式目标，不做全盘删除。
- `GMZZ_USER_DATA` 行为和 SQLite 生命周期回归继续通过。

### DSK-01B.4 完成证据

- 红测：`project QA, release, and RAG temp writes use the D-drive runtime policy` 首次运行 `15 pass / 1 fail`；实现后 `16 pass / 0 fail`。
- 代码级静态审计：生产脚本不再调用 `os.tmpdir()`；剩余命中仅为测试文件，由 D 盘 runner 注入 `TEMP/TMP`；`LOCALAPPDATA` 仅用于只读外部浏览器/GitHub CLI 发现。
- 运行级证据：`electron-smoke --server-only` PASS、`play --no-browser --wait=1` PASS、`release:persistence:lifecycle` PASS、`verify-public-build` PASS；每个命令的 runtime roots 都解析到 D 盘。
- 前置边界：`rag:clean:install` 在 `buildPack` 处因仓库没有私有索引停止；这保持 `NOT_RUN`，不将缺少授权 seed/私有索引升级为 RAG 通过。

### AUTH-01：统一自治受众投影

当前执行状态：`COMPLETE`

目标：Main 自治规划只能看到规范受众投影，模型可见知识与允许引用 ID 必须来自同一个选择结果。

预期 write-set：

- 新建 `shared/audience-projection.cjs`
- 新建 `shared/audience-projection.d.ts`
- 修改 `app/world-kernel.ts` 使现有导出委托给 shared core
- 修改 `electron/autonomous-inference.cjs`
- 修改 `tests/electron-runtime-authority.test.mjs`
- 必要时只修改一个现有受众投影测试文件

执行顺序：

1. 先写红测，构造 20 条主体可见知识：断言模型看到的 12 条内容 ID 与 `knownKnowledgeIds` 完全相等。
2. 写红测，构造未观察地点与 canonical risk/stability/conditions：断言 Main prompt 不含这些真值，也不能把该地点加入 `allowedLocationIds`。
3. 写红测，构造被 observation/perceivedRefs 明确认知的主体、地点和公开事件：断言仍可规划，不得因修复把合法上下文清空。
4. 把当前 `projectWorldForAudience` 的纯算法移到 shared CJS；TS 保留类型重载和 façade。若 Vite 或 Electron 无法共同加载，标记 `BLOCKED_SHARED_PROJECTION_PACKAGING`，不得复制第三套实现。
5. Main 先取得 shared audience projection，再构造主体自己的 profile、memory、social ties 和 owned projects。canonical kernel 只用于验证 ID 存在，不直接进入 prompt。
6. 用一个确定性排序后的 `selectedKnowledge` 同时生成 `visibleKnowledge` 与 `knownKnowledgeIds`。
7. `allowedLocationIds` 只包含主体当前位置、已有可见 observation/event 的地点、以及被已授权自有 project 明确引用的地点；禁止把全 location table 变成 allowlist。
8. 所有投影输出带 `projectionHash`；Main proposal receipt 绑定它。

验收：

```text
AUTONOMOUS_PROJECTION_CANONICAL_PARITY=PASS
VISIBLE_KNOWLEDGE_ID_SET_EQUALS_ALLOWED_SET=PASS
UNOBSERVED_LOCATION_TRUTH_LEAKS=0
UNOBSERVED_LOCATION_TARGETS=0
AUTHORIZED_VISIBLE_TARGET_REGRESSIONS=0
```

完成证据：

- 红测先证明知识 ID 错位（29 pass / 1 fail），实现后 `tests/electron-runtime-authority.test.mjs` 为 `30/30`；Main prompt 的 `visibleKnowledge` 与 `knownKnowledgeIds` 现在来自同一个确定性选择结果。
- 新增 `shared/audience-projection.cjs` 作为 UMD shared core，TS renderer façade 与 Electron Main CJS 共用同一算法；Vite build 无 `node:crypto` externalization 警告，`tests/privacy-closure.test.mjs` 的 byte-equivalence 检查通过。
- Main 只使用受众投影后的 observations/events/knowledge；`allowedLocationIds` 仅由当前位置、可见事件地点和已授权自有项目地点闭包派生，未观察地点真值不进入 prompt；proposal receipt 持有 64 位 `projectionHash`，SQLite validator 允许旧记录但校验新 hash。
- 相邻 authority/privacy/persistence 定向集合 `55/55`，世界投影/账本/运行时集合 `48/48`；最新全量 `npm test` 为 `538 total / 533 pass / 5 skip / 0 fail`。

### COV-01：真实代码覆盖率

当前执行状态：`COMPLETE (LOCAL_BASELINE_AND_REGRESSION_GATE_PASS; HOSTED_CI_PENDING)`

依赖安装已获得本轮明确授权，并严格写入 `D:\gmzz\.runtime\npm-cache`；Vitest 与 `@vitest/coverage-v8` 均锁定为 `4.1.11`。真实报告已经生成，不能再把 Node 回归计数当成 source coverage。

目标：新增独立的 source-aware 覆盖通道；不替换现有 Node 回归 suite。

预期 write-set：

- `package.json` 与 lockfile
- 新建 `vitest.config.ts`
- 新建 `tests/coverage/authority-coverage.test.ts`
- 新建 `scripts/verify-code-coverage.mjs`
- 修改 `.github/workflows/ci.yml`

当前已完成的 write-set：

- `package.json` 与 `package-lock.json`（锁定 Vitest、coverage-v8、coverage 命令）
- `vitest.config.ts`
- `tests/coverage/authority-coverage.test.ts`
- `tests/coverage-baseline.json`
- `scripts/verify-code-coverage.mjs`
- `scripts/write-code-coverage-manifest.mjs`
- `tests/code-coverage-verifier.test.mjs`
- `.github/workflows/ci.yml`

已完成的 provider-independent 原子步骤：

- `COV-01.0.1` `COMPLETE`：`verify-code-coverage.mjs` 读取 Istanbul/V8 source map 风格的 `coverage-final.json`，拒绝空报告、零 executable counters、缺少 `game-engine.ts` 或其他 authority source、非有限/非整数计数、错误 commit、错误 report digest 和缺失 manifest。
- `COV-01.0.2` `COMPLETE`：新增 6 个 Node 行为测试并通过；测试 fixture 只写入 `GMZZ_STORAGE_ROOT` 下的 D 盘临时目录。
- `COV-01.0.3` `COMPLETE`：增加 `npm run verify:coverage` 命令；未生成真实覆盖率时该命令仍应失败，不能被误报为 PASS。

步骤：

1. `COMPLETE`：在 D 盘 npm cache 下安装并锁定兼容当前 Vite 8 的 `vitest@4.1.11` 与 `@vitest/coverage-v8@4.1.11`。
2. `COMPLETE`：保留 `npm test`；新增 `test:coverage`，报告目录为 `D:\gmzz\.runtime\coverage`。
3. `COMPLETE`：首批 include 明确包含 `app/game-engine.ts`、`app/world-kernel.ts`、`app/world-authority-closure.ts`、`app/world-output-adapter.ts`、`electron/autonomous-inference.cjs`、`electron/world-prompt.cjs`。
4. `COMPLETE`：`verify-code-coverage.mjs` 在报告不存在、源文件数为 0、`game-engine.ts` 不在报告、任一数值非有限数、报告来自不同 commit 或 digest 不一致时失败。
5. `COMPLETE`：第一次真实运行建立了版本化 `tests/coverage-baseline.json`，记录每个目标文件的 lines/functions/branches/statements；没有预设 80%，没有把空报告当 100%。
6. `COMPLETE_CODE`：CI 已加入“基线不得回退”步骤；`autoUpdate` 未启用。shared audience projection 与后续新增 authority 模块的 100%/95% 专项阈值仍随模块新增单独审阅，不用当前低基线伪装达标。
7. `COMPLETE`：文档把 `CODE_COVERAGE` 与 `RAG_CORPUS_COVERAGE` 分开记录。

验收：

```text
COVERAGE_REPORT_SOURCE_FILE_COUNT_GT_0=PASS (10 source files; report SHA-256 bound in manifest)
GAME_ENGINE_PRESENT_IN_COVERAGE_REPORT=PASS
EMPTY_COVERAGE_FALSE_GREEN_TEST=PASS (8/8 verifier behavior tests)
AUTHORITY_COVERAGE_BASELINE_RECORDED=PASS (tests/coverage-baseline.json; first real baseline)
COVERAGE_REGRESSION_GATE=PASS (local baseline verifier; hosted CI pending)
```

### CTX-01：因果实体闭包编译器

当前执行状态：`COMPLETE (LOCAL_SOURCE_AND_BEHAVIOR_PASS; HOSTED_CI_PENDING)`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

本包允许 write-set：`electron/world-context-compiler.cjs`、`electron/world-prompt.cjs`、`tests/world-context-compiler.test.mjs`，必要时只修改 `tests/electron-runtime-authority.test.mjs`。

红测入口：`tests/world-context-compiler.test.mjs` 已覆盖第 129 位目标、因果祖先、must-include 超限、顺序稳定和未知引用失败关闭；红测先因模块缺失失败，接入后 `4/4 PASS`。

完成的原子步骤：

- `CTX-01.1` `COMPLETE`：`electron/world-context-compiler.cjs` 从可执行计划建立 participant/target/holder/source-event seed，解析项目 owner/location、主体 location、事件 actor/faction/location，并沿 `causeIds` 向前最多 4 层。
- `CTX-01.2` `COMPLETE`：must-include 先于背景预算；强制集合超限抛出 `WORLD_CONTEXT_REQUIRED_SET_OVERFLOW`，未知引用抛出 `WORLD_CONTEXT_UNKNOWN_REFERENCE`，不截断继续模型调用。
- `CTX-01.3` `COMPLETE`：背景按引用距离、最近周次、稳定 ID 填充；`omissionReceipt` 绑定 commit/tree/budget/IDs/reason/inputHash，数组重排结果保持 byte-equivalent。
- `CTX-01.4` `COMPLETE`：Main `buildDurableWorldPayload` 接入 `worldContext`；`buildMainWorldPrompt` 明确只认因果闭包，不允许模型用 first-N 替代 must-include；receipt 不进入玩家 UI。

验收：

```text
ALL_EXECUTABLE_PARTICIPANTS_INCLUDED=PASS (targeted red/green closure tests)
ALL_EXECUTABLE_TARGETS_INCLUDED=PASS (index-129 target retained)
DIRECT_CAUSAL_ANCESTORS_INCLUDED=PASS (event-129 through event-125)
MUST_INCLUDE_TRUNCATION_COUNT=0
OMISSION_RECEIPT_DETERMINISTIC=PASS
CTX_TARGETED_TESTS=4/4 PASS; ELECTRON_RUNTIME_AUTHORITY_TARGETED=30/30 PASS
```

目标：所有本轮可执行计划及其参与者、目标、位置、所有者和直接因果祖先都必须进入世界裁决上下文；固定 first-N 只能用于背景补充，不能删除 must-include。

预期 write-set：

- 新建 `electron/world-context-compiler.cjs`
- 修改 `electron/world-prompt.cjs`
- 新建 `tests/world-context-compiler.test.mjs`
- 必要时修改 `tests/electron-runtime-authority.test.mjs`

算法：

1. seed 集合来自每个 `executionPlan.executable=true` 的 proposalId、participantRefs、targetRefs、sourceEventId、资源 holder 和项目 owner/location。
2. 扩展一跳结构引用：actor/faction 所在 location、project owner/location、event actor/faction/location/causeIds。
3. 沿 event `causeIds` 向前最多 4 层；按 `week desc → id asc` 稳定排序。
4. must-include 超过安全字节预算时抛 `WORLD_CONTEXT_REQUIRED_SET_OVERFLOW`，不得截断后继续模型调用。
5. 剩余背景按“与 seed 的引用距离 → 最近周次 → 稳定 ID”填充预算。
6. 生成 `omissionReceipt`：commit/tree、budget、included IDs、omitted IDs、reason、input hash；receipt 不进入玩家 UI。
7. prompt 仍受总字符/字节硬上限；token 精确化留给 GATE-01。

红测必须覆盖：目标恰好位于数组第 129 位、因果祖先位于第 129 位、must-include 自身超限、顺序变化但语义相同、未知引用失败关闭。

验收：

```text
ALL_EXECUTABLE_PARTICIPANTS_INCLUDED=PASS
ALL_EXECUTABLE_TARGETS_INCLUDED=PASS
DIRECT_CAUSAL_ANCESTORS_INCLUDED=PASS
MUST_INCLUDE_TRUNCATION_COUNT=0
OMISSION_RECEIPT_DETERMINISTIC=PASS
```

### PROMPT-01：安静周契约

当前执行状态：`COMPLETE`

1. 将 `publicSignals` 改为 `0..4`；无公开事实时允许空数组。
2. 禁止为了凑条数生成消息；固定报纸/玩家表面文案继续由本地确定性层负责，并明确不是世界事件。
3. 增加 Main prompt 源码和行为测试：安静周返回 0 条仍可提交；有事实时每条必须绑定本轮事件/claim。

原子进度：

- `PROMPT-01.1` `COMPLETE`：`app/world-envelope.ts` 接受显式空数组，拒绝缺数组、结构无效、超过 4 条及全量重复；修复提示明确 0 至 4 条、无事实返回 `[]`、禁止凑数。
- `PROMPT-01.2` `COMPLETE`：Main `electron/world-prompt.cjs`、世界裁决 prompt 与 schema 示例统一 0 至 4 条；非空条目显式要求 `sourceProposalId`、`sourceEventId`、`sourceObservation`，固定报纸/玩家表面标记为本地确定性层而非世界事件。
- `PROMPT-01.3` `COMPLETE`：`app/world-output-adapter.ts` 在生产 `requireSourcedPublicSignals:true` 路径执行 proposal→当前事件→event claim→public/player observation 闭包校验，并规范化临时事件 ID；直接适配器调用也拒绝超过 4 条，避免静默截断。
- `PROMPT-01.4` `COMPLETE`：`app/game-engine.ts` 接入严格生产选项；三周长跑夹具改为真实可执行 proposal/事件/观察链，防止旧夹具绕过新权威。

验收：`QUIET_WEEK_MODEL_SIGNAL_MINIMUM=0 PASS`、`FABRICATED_PUBLIC_SIGNAL_COUNT=0 PASS`、`PUBLIC_SIGNAL_PROVENANCE=PASS`、`PUBLIC_SIGNAL_LIMIT=PASS`。

证据：`tests/quiet-week-public-signals.test.mjs`、`tests/world-output-adapter.test.mjs`、`tests/turn-transaction.test.mjs`、`tests/three-week-regression.test.mjs`；定向回归 `18/18 PASS`，最新全量 `538 tests / 533 pass / 5 skipped / 0 fail`。

### NLP-01：中文意图 contract parser

范围：先替换 `game-engine.ts` 中行动种类、资源姿态、授权/红线/撤退条件的语义权威；不追求删除所有中文正则。

当前执行状态：`COMPLETE / NLP-01.1 COMPLETE; NLP-01.2 COMPLETE; NLP-01.3 COMPLETE; NLP-01.4 COMPLETE; NLP-01.5 COMPLETE; NLP-01.6 COMPLETE; NLP-01.7 COMPLETE; NLP-01.8 COMPLETE; NLP-01.9 COMPLETE; closeout-revalidation COMPLETE`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

本轮启动证据：源码审计已确认 `app/game-engine.ts` 的现有语义权威集中在 `inferKind`、`targetFrom`、`inferResourceCommitment`、`inferAuthorization`、`inferMethodTags` 及 `localContract`；当前仍由中文关键词/正则直接决定行动种类、目标、资源姿态/数量和授权范围。本步骤先建立独立 gold contract，不改生产调用点。

NLP-01.1 完成证据：`tests/fixtures/nlp/intent-contract-cases.json` 有 160 个显式手工审阅用例、40 个 intentClass；覆盖 40 个否定/双重否定、128 个资源边界、146 个授权边界、40 个代词目标和 41 个同义词/语序变体。`app/nlp/intent-contract.ts` 输出四态字段、规则 id、源码 span、冲突和保守 needs-clarification；`scripts/nlp/eval-intent-contract.mjs` 输出 confusion matrix、字段 P/R/F1、critical over-grant 和 ambiguity recall，并在 `--strict` 下失败关闭。

NLP-01.1 首轮真实基线已保存，随后 NLP-01.2 规则收敛通过：`CASE_COUNT=160`、`CATEGORY_COUNT=40`、`CRITICAL_AUTHORIZATION_OVER_GRANT_COUNT=0`、`AMBIGUOUS_HIGH_IMPACT_RECALL=1.000`、`INTENT_KIND_MACRO_F1=1.000`（8/8 类）、`TARGET_FIELD_F1=0.9669421488`、`AUTHORIZATION_SCOPE_F1=0.9000000000`、`RESOURCE_POSTURE_F1=0.8062500000`、`STATUS=PASS`。首轮低于门禁的报告仍由 evaluator 的 `--strict` 失败关闭逻辑保留；门禁通过后，下一步才允许单类字段接入生产 façade。

NLP-01.3 完成证据：`app/game-engine.ts` 仅把 `localContract` 的 `kind` 来源切换为 `parseIntentContract(...).fields.kind`；parser 非 `present` 时保留旧 `inferKind` fallback，目标、资源金额/人力/材料、授权和旧 helper 未改。NLP gold façade 表征 `4/4 PASS`，既有三周/turn 事务定向回归 `21/21 PASS`。

NLP-01.4 约束：只修改 `app/game-engine.ts` 的 `target` 来源；资源金额/人力/材料、授权和重命名旧 helper 不得混入。`target.state=ambiguous|absent|negated` 时保留旧 `targetFrom` fallback，并单独记录代词和多目标边界。

NLP-01.4 完成证据：`localContract` 仅在 parser target `present` 时采用规范化 target；`ambiguous` 明确降为 `待确认目标`，不再把多目标/未解析代词交给旧 `targetFrom` 猜测，`absent|negated` 才保留旧 fallback。160 例 target delegation 与代词边界表征 `5/5 PASS`，既有 turn/three-week 回归 `21/21 PASS`。

NLP-01.5 约束：只迁移 `resourcePosture`、money、manpower、extraordinaryMaterials；缺失资源字段必须保持 `absent`，显式“不投入/不用”才可归零；不得让模型候选扩大可用资源或绕过 `boundedInteger`，授权仍保持旧路径。

NLP-01.5 完成证据：`localContract` 仅在 parser 资源字段 `present|negated` 时采用 parser 值；所有金额/人力/材料继续经过 `boundedInteger` 和当前可用量限制，缺失字段保留旧 baseline。NLP 定向表征 `6/6 PASS`，既有 turn/three-week 回归 `21/21 PASS`；该阶段的历史报告曾为 `RESOURCE_POSTURE_F1=0.8062500000`，后续 closeout revalidation 已将否定资源姿态收敛为 minimal 并把新门禁提升到 1.0000000000。

NLP-01.6 约束：只修改 `authorization.scope` 来源；parser `present` 可采用 strict/broad，`ambiguous` 一律收紧为 strict，`absent|negated` 保留旧 scope；`redLines`、`mustEscalateWhen`、`retreatCondition` 和模型 merge 逻辑不得混入。

NLP-01.6 完成证据：`localContract` 仅在 parser scope `present` 时采用 strict/broad，scope `ambiguous` 强制 strict，其他状态保留旧 scope；redLines、mustEscalateWhen、retreatCondition 与 AI merge 未改。NLP 定向表征 `7/7 PASS`，既有 turn/three-week 回归 `21/21 PASS`。

NLP-01.7 约束：只把 parser `redLines` 的源码证据追加到旧默认红线；不得删除旧默认“不伤害无关者/不把未经验证假设当公开指控”，不得改变 `mustEscalateWhen` 或撤退条件。

NLP-01.7 完成证据：`localContract` 合并 parser red-line clauses 与旧默认红线，新增 parser 明确禁止条件的保护，默认红线保留；`mustEscalateWhen`、`retreatCondition` 和 AI merge 未改。NLP 定向表征 `8/8 PASS`，既有 turn/three-week 回归 `21/21 PASS`。

NLP-01.8 约束：只在 parser `retreatCondition` 为 `present` 且有源码证据时采用该文本；无证据时保留旧 fallback，不修改 `mustEscalateWhen`、scope、redLines 或资源字段。

NLP-01.8 完成证据：`localContract` 仅在 parser `retreatCondition` 为 `present` 且有 `normalizedValue` 时采用 parser 文本，否则沿用旧 `inferAuthorization` fallback；`mustEscalateWhen`、scope、redLines、资源和 AI merge 未改变。新增原始文本 evidence 坐标回归（含兼容字符）后，NLP-01.8 原子定向 `11/11 PASS`、严格 evaluator PASS。同时修正 parser 先 NFKC 后生成 span 的源码级错位风险，保留 trimmed 原文作为唯一 evidence 坐标空间，并删除未使用 helper。

NLP-01.closeout-revalidation 完成证据：否定型资源指令保持 `resourcePosture.state=negated`，但规范化姿态安全降为 `minimal`，不增加正向授权；新增资源姿态回归后定向 `12/12 PASS`，`RESOURCE_POSTURE_F1=1.0000000000`，并将 `RESOURCE_POSTURE_F1>=0.95` 加入严格 evaluator 门禁。`localContract` 现已同时消费 parser 的 `present|negated` 姿态，D-bound full test/typecheck/build/lint/coverage/manifest/verify/storage 全部通过，NLP-01 标记 COMPLETE。

NLP-01.9 完成证据：源码对抗审计发现 `别`、`请勿`、`暂时不`、`不想`、`未` 等常见否定未被旧规则识别，且 `A 或 B` 目标会被压成一个字符串。新增 action-negation suffix/prefix、并列目标 evidence/conflict，并将规则版本升级为 `intent-rules-2026-08-24-v2`；`localContract` 对否定行动降为 `自由行动`、对 ambiguous target 使用 `待确认目标`，不把风险动作交给旧猜测。新增 adversarial 定向 `12/12 PASS`，source-aware coverage 执行这些分支后 `14 sources / 8,921 counters / 35.67% statements / 24.02% branches / 28.67% functions / 41.02% lines`，coverage verify PASS；严格 160 例与完整 D 盘 `569 total / 564 pass / 5 skipped / 0 fail` 均通过。

阶段一，金标评测：

- 新建 `tests/fixtures/nlp/intent-contract-cases.json`，至少 160 个手工审阅用例。
- 至少覆盖 40 个意图类别、30 个否定/双重否定/反问、30 个资源与数量边界、20 个授权/禁止、20 个目标/代词、20 个同义词/省略/语序最小对。
- 每例包含原文、期望结构字段、明确证据 span、是否需要澄清和风险级别；不得用待测 parser 自动生成 gold。
- 新建 `scripts/nlp/eval-intent-contract.mjs` 输出 confusion matrix、field precision/recall、critical over-grant count 和 ambiguity recall。

阶段二，parser：

- 新建 `app/nlp/intent-contract.ts` 与版本化 lexicon/rule 数据。
- 先按标点和连接词切 clause；每个字段使用 `present | negated | ambiguous | absent` 四态，不用一个布尔值吞掉范围。
- 每个结果保留 `ruleIds`、evidence spans、normalized value 和冲突说明。
- 高影响授权、不可逆行动、大额资源或互相冲突时返回 `needs-clarification` 或保守零授权，不允许模型自行放宽。
- AI 可提出 parser candidate，但确定性 validator 重新计算并拥有最终 contract。
- `game-engine.ts` 保留原导出 façade；调用点一次只迁移一类字段。

门禁：

```text
CRITICAL_NEGATION_ACCURACY=100%
CRITICAL_AUTHORIZATION_OVER_GRANT_COUNT=0
INTENT_KIND_MACRO_F1>=0.95
TARGET_FIELD_F1>=0.95
RESOURCE_POSTURE_F1>=0.95
AMBIGUOUS_HIGH_IMPACT_RECALL=100%
EXISTING_BEHAVIOR_REGRESSION=0
```

若基线达不到阈值，先记录真实 baseline，再增加金标和规则；不得删难例或把 ambiguous 改成错误的确定答案来提分。

### LEAK-01：泄漏检测策略

目标：保护非公开 lore 的同时，公开常见短语不再被固定 8 字窗口误杀。

当前执行状态：`COMPLETE / LEAK-01.1 gold-fixture-and-red-tests-and-policy`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

本轮启动证据：源码审计确认 `electron/rag-evidence.cjs` 的 `assertNoVerbatimLoreLeak` 对所有 evidence 统一使用固定 8 字归一化窗口，未读取 `visibility`、sensitivity、唯一性或 public canonical 语义；现有三类回归只证明私有逐字拒绝，未量化公开短语误报与分层阈值。本步骤先建立独立 120+ gold fixture、可解释 evaluator 与 red tests，再改策略实现。

LEAK-01.1 完成证据：`tests/fixtures/leak/verbatim-leak-cases.json` 固定 120 例、5 类各 24 例；`scripts/leak/eval-verbatim-leak.mjs --strict` 报告隐藏逐字 false negative=0、结构化事实 false negative=0、公开/安全 false positive=0/48、8 字风险信号=8。`electron/rag-evidence.cjs` 的 `verbatim-leak-v2` 按 `visibility/sensitivity`、`uniqueness` 和 source length 计算 minimum window；public canonical 直接放行，缺元数据仍按高敏感旧路径处理；`assertNoVerbatimLoreLeak` 继续服务 world/autonomous Main 门禁。最终复核 benchmark 在 20,040 字响应、8 records 下 Set 扫描 p50=21.546ms/p95=28.307ms/max=29.724ms，未触发 Aho-Corasick 升级条件；该值为单次本机重测，评测门禁只约束正确性，不把延迟写成固定承诺。结构化 claim/audience 的最终绑定仍由既有 `world-output-adapter` provenance/MutationClaim 校验负责，未用字符窗口替代。

1. 建立至少 120 个金标用例：隐藏逐字泄漏、带标点短泄漏、公开专名/常见短语、安全重叠、结构化事实越权。
2. 只有非公开/敏感 evidence 进入逐字泄漏门禁；public canonical phrase 不触发隐私拒绝。
3. 固定 8 字命中降为风险信号；按 sensitivity、唯一性和长度使用分层阈值。阈值从评测得出，不直接拍成 32/64。
4. 非公开结构化事实由 claim/audience schema 校验；不能把 paraphrase 安全寄托于字符窗口。
5. 保留当前 Set 扫描，先做 benchmark；只有吞吐量证据失败才引入 Aho-Corasick。

验收：隐藏逐字泄漏 false negative 为 0；公开/安全样本 false positive ≤1%；当前三类拒绝回归全部通过。

### ARCH-01A 至 ARCH-01D：绞杀式拆分 `game-engine.ts`

共同规则：每一包只移动一个责任域，先 characterization tests，后无语义提取；不得在同一包改规则、改 prompt、改 UI 和重命名公共 API。

#### ARCH-01A：行动契约解析（当前包）

当前执行状态：`COMPLETE / ARCH-01A.1–ARCH-01A.3`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

允许 write-set（本包之外不得改写）：

- `app/game-engine.ts`
- 新建 `app/game-engine/action-contracts.ts`
- 新建 `tests/game-engine-action-contracts.test.mjs`
- 仅为更新源码位置断言，允许修改 `tests/gameplay-loop.regression-1.test.mjs` 与 `tests/priority-one-reliability.test.mjs`
- 若覆盖率 source manifest 必须随新模块扩展，再允许 `vitest.config.ts`、`tests/coverage-baseline.json` 和本文件；否则不改覆盖率配置

源码边界审计（开始前）：当前行动契约权威集中在 `game-engine.ts` 的 `inferKind`、`targetFrom`、`inferResourceCommitment`、`inferAuthorization`、`inferMethodTags`、`localContract` 及其类型/常量依赖；本包只迁移这些解析责任，`interpretIntentWithAi` 的模型编排、prompt、UI、周结算和世界回合暂不触碰。新模块不得反向 import `game-engine.ts`，以避免循环依赖。

原子进度：

- `ARCH-01A.1` `COMPLETE`：`tests/game-engine-action-contracts.test.mjs` 的 `game-engine action contract characterization` 通过；6 个代表意图固定了 kind/target、成员、资源、授权、撤退、设施、风险和方法标签的当前输出。
- `ARCH-01A.2` `COMPLETE`：新建 `app/game-engine/action-contracts.ts`，facade 删除 389 行行动契约解析实现，仅保留 `localContract`/`interpretIntentWithAi` re-export，并导入 `isRecruitmentIntent`；新模块无反向 import `game-engine.ts`；characterization 与 typecheck 均通过。
- `ARCH-01A.3` `COMPLETE`：定向行动/NLP/authority 回归 `23 pass / 1 skipped / 0 fail`；完整仓库回归 `539 tests / 534 pass / 5 skipped / 0 fail`；build/typecheck/lint/bundle budget 通过；coverage `32.84% statements / 21.46% branches / 25.10% functions / 38.11% lines`，8 source files、8274 counters，manifest/verify PASS；D-storage preflight PASS；deterministic identity/characterization 与无循环 import 检查通过；源码位置断言已改为验证新模块与 façade re-export。

完成后的下一条命令（历史断点，已执行）：将 `ARCH-01B` 标记 `IN_PROGRESS` 并先写 `dialogue-orchestration` characterization tests；当前恢复点以文末 `ARCH-01D READY` 为准。

#### ARCH-01B：NPC/议会对话编排（当前包）

当前执行状态：`COMPLETE / ARCH-01B.1–ARCH-01B.3`。

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`。

允许 write-set（本包之外不得改写）：

- `app/game-engine.ts`（只删除 NPC dialogue 实现并保留同名 façade/export）
- 新建 `app/game-engine/dialogue-orchestration.ts`
- 新建 `tests/game-engine-dialogue-orchestration.test.mjs`
- 若必须更新源码位置断言，只允许追加到已有 dialogue/engine 断言；若新模块必须进入 source-aware coverage，再允许 `vitest.config.ts`、`scripts/verify-code-coverage.mjs`、`tests/coverage-baseline.json`、manifest 与本文件

源码边界审计（开始前）：`game-engine.ts` 的唯一 NPC 对话权威是 `generateNpcDialogue`，它负责成员/管理岗位解析、actor world projection、角色私有 RAG、dialogue memory、模型 prompt/response normalization 和 memory delivered/presented receipt；`context="council"` 是议会语境入口。独立的 `app/council-ai.ts` 已经拥有 council replies/summary/decision-draft 实现，本包不复制或重写其模型网关、RAG 或 summary 逻辑；characterization 只验证 NPC façade 在 council/private 两种语境下的稳定边界，并确认与现有 council-ai 模块没有循环依赖。

原子进度：

- `ARCH-01B.1` `COMPLETE`：新建 `tests/game-engine-dialogue-orchestration.test.mjs`，覆盖成员不存在的 fail-closed、council/private prompt 语境、最近会话/记忆/关系/授权 world view 输入、响应字段裁剪与 memory receipt，以及 façade 与新模块导出契约；先行 RED 为 `2 fail / 1 pass`（新模块缺失产生 `ENOENT` 与 `ERR_LOAD_URL`，未知成员 fail-closed 通过），未先改生产代码。
- `ARCH-01B.2` `COMPLETE`：新建 `app/game-engine/dialogue-orchestration.ts`，迁移 `generateNpcDialogue`、`NpcDialogueResult`、`loreForActor` 及共享 `knownLoreIds`/`knowledgeHorizon` helper；`game-engine.ts` 仅保留兼容 import/re-export 与 player/world lore 调用，模块无反向 import façade。B 完成时 façade 为 2,119 行 / 153,124 bytes；ARCH-01C 完成后当前 façade 为 1,261 行 / 87,350 bytes；没有改模型任务、RAG、prompt、memory 或 UI 契约。
- `ARCH-01B.3` `COMPLETE`：已把新模块加入 `vitest.config.ts` 与 `scripts/verify-code-coverage.mjs`，重新生成真实 source-aware baseline/manifest；NPC/议会相邻回归 `19 total / 18 pass / 1 skip / 0 fail`，全量 `542 total / 537 pass / 5 skip / 0 fail`，typecheck/lint/build/bundle、coverage/manifest/verify、D-storage、NLP/leak 与无循环 import 均通过。新模块在 Vitest-only report 中诚实呈现为 0%（行为由 Node characterization 覆盖），没有把它写成高覆盖率；源边界、公开导出、写集和受保护日志已复核通过。

#### ARCH-01C：周结算

当前执行状态：`COMPLETE / ARCH-01C.1–ARCH-01C.3`。

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`。

允许 write-set（本包之外不得改写）：

- `app/game-engine.ts`（只删除周结算实现并保留同名 façade/export）
- 新建 `app/game-engine/week-resolution.ts`
- 新建 `tests/game-engine-week-resolution.test.mjs`
- 仅因责任归属迁移而更新源码位置断言：`tests/gameplay-loop.regression-1.test.mjs`、`tests/priority-one-reliability.test.mjs`、`tests/leader-directive.test.mjs`、`tests/rendered-html.test.mjs`
- 若新模块进入 source-aware coverage，再允许 `vitest.config.ts`、`scripts/verify-code-coverage.mjs`、`tests/coverage-baseline.json`、manifest 与本文件

源码边界审计（开始前）：`game-engine.ts` 的周结算权威是同步 `resolveWeek` 及其局部规则 helper；它负责行动提案裁定后的资源、成员、证据、机会、派系、组织、命运、记忆、ledger、chapter 与 next-week 状态聚合。`generateAiWorldDelta`、`TurnCommit`、模型网关和玩家 UI 不在本包修改；世界回合 commit 顺序与错误边界只能由 characterization 锁定。

原子进度：

- `ARCH-01C.1` `COMPLETE`：新建 `tests/game-engine-week-resolution.test.mjs`，覆盖 façade/新模块导出、空周确定性快照、带行动周的资源/ledger/chapter 边界和 awaiting-authorization 排除；先行 RED 为 `4 fail / 0 pass`，精确为 1 个模块读取 `ENOENT` 与 3 个新模块加载 `ERR_LOAD_URL`，未先改生产实现。
- `ARCH-01C.2` `COMPLETE`：新建 `app/game-engine/week-resolution.ts`，迁移 `resolveWeek`、周结算私有 helper、`hash`、`actionDomain`/`availableAbilities` façade exports；`game-engine.ts` 只保留兼容 import/re-export，未修改规则、prompt、模型或 world commit。模块无反向 import façade；C characterization 已 `4/4 pass`。
- `ARCH-01C.3` `COMPLETE`：相邻回归 `81 total / 80 pass / 1 skip / 0 fail`；完整 D 盘 `npm test` 为 `546 total / 541 pass / 5 skip / 0 fail`，构建、typecheck、lint、bundle budget 全部通过。source-aware coverage/manifest/verify 为 `10 sources / 8,275 counters / 32.83% statements / 21.46% branches / 25.10% functions / 38.10% lines`；D-storage preflight、严格 NLP、严格 leak、leak benchmark、覆盖率/存储 24 项测试均通过。源码复核确认 façade 仅 re-export/import 周结算 owner，无反向 import、无重复 `resolveWeek` 实现；写集和受保护日志边界复核通过。

#### ARCH-01D：世界回合编排

当前执行状态：`COMPLETE / ARCH-01D.1–ARCH-01D.3`。

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`。本包只允许移动世界回合编排责任，不允许借机修改规则、模型任务、RAG、prompt、memory、UI 或持久化语义。

允许 write-set：

- `app/game-engine.ts`（只删除 `generateAiWorldDelta` 的实现，保留兼容 import/re-export）
- 新建 `app/game-engine/world-turn-orchestrator.ts`
- 新建 `tests/game-engine-world-turn-orchestrator.test.mjs`
- 仅因责任归属迁移而更新既有源码位置断言；若新模块进入 source-aware coverage，再允许 `vitest.config.ts`、`scripts/verify-code-coverage.mjs`、`tests/coverage-baseline.json`、manifest 与本文件

源码级审计结论（已完成）：`generateAiWorldDelta` 当前约从 `app/game-engine.ts:487` 延伸到 `:1120`，实际同时承担章节过滤、world config/lore、自治 agent 规划与提案裁定、公式授权、Main finalize/frozen scope、world adjudicator RAG 与文学重试、`TurnCommit`、世界快照/派系/组织/证据/因果/纪事 sidecar、WorldLedger 追加、memory receipts、next-game 聚合和 release planning cache。D-only 私有 helper 包括 causal receipt、directive interruption、`loreForWorld` 与其边界类型；提取后 façade 不得保留第二份实现，也不得让 owner 反向 import façade。

原子进度：

- `ARCH-01D.1` `COMPLETE`：先行 characterization 已落盘并执行，覆盖 owner/re-export/no-reverse-import、facade 与 owner 的 world snapshot/ledger/worldAgents/factionStrategy 边界等价、unsupported provider 在 durable commit 前 fail-closed。严格 RED 为 `3 fail / 0 pass`：1 个源文件读取 `ENOENT`，2 个 owner 模块加载 `ERR_LOAD_URL`；未先改生产实现。
- `ARCH-01D.2` `COMPLETE`：新建 `app/game-engine/world-turn-orchestrator.ts`，原样迁移 `generateAiWorldDelta` 与 D-only helper；`game-engine.ts` 仅保留 façade export。第一次相邻回归发现旧源码位置断言仍只读 façade，已把断言改为 façade + owner 联合扫描；没有修改 Main finalize、文学重试、`TurnCommit`、ledger/memory 顺序或错误边界。
- `ARCH-01D.3` `COMPLETE`：D characterization `3/3`；D 世界回合/事务/记忆/三周/渲染等相邻集合 `58 total / 57 pass / 1 fail`（唯一失败为已修正的旧源码断言），修正后目标集合 `31/31`；完整 D 盘 `npm test` 为 `549 total / 544 pass / 5 skip / 0 fail`，耗时 `191966.625 ms`。typecheck/lint/build/bundle、source-aware coverage/manifest/verify、D-storage、严格 NLP/leak、leak benchmark 全部通过；覆盖 `11 sources / 8,275 counters / SHA-256=163f354afbb53f86ea14e27f6db52f811dc57b4e73d94cd21fdc42761fea65dd`。源码扫描确认无重复 `generateAiWorldDelta`、无 owner→façade 反向 import；façade `355 lines / 25,733 bytes`，owner `927 lines / 61,395 bytes`。

当前源码级不变量：不修改 `callModel`/模型任务 contract、RAG authority、受众投影、prompt 文案、memory 语义、UI 调用签名或 council-ai；同一输入的 model request、返回结构、memory receipt 和错误消息必须保持一致。

1. `ARCH-01A`：提取 `app/game-engine/action-contracts.ts`，迁移当前约 195–581 行的意图/授权 contract 逻辑；`game-engine.ts` 只 re-export/delegate。
2. `ARCH-01B`：提取 `app/game-engine/dialogue-orchestration.ts`，迁移 NPC dialogue 与议会对话编排；模型网关不在本包修改。
3. `ARCH-01C`：提取 `app/game-engine/week-resolution.ts`，迁移 `resolveWeek` 及其私有 helper；world commit 调用顺序与错误边界完全不变。
4. `ARCH-01D`：提取 `app/game-engine/world-turn-orchestrator.ts`，迁移 `generateAiWorldDelta`；保持 `TurnCommit`、Main finalize、文学重试边界和现有导出签名。

每包验收：完整仓库回归、目标模块覆盖不下降、无循环 import、同输入 snapshot/hash 完全一致。ARCH-01C 完成后的下一包是 ARCH-01D：先写 `world-turn-orchestrator` characterization，再迁移 `generateAiWorldDelta`，不把 C 的大模块继续无测试拆分。

```text
GAME_ENGINE_FACADE_LINES<=600
GAME_ENGINE_FACADE_BYTES<=50000
MAX_FUNCTION_LINES<=150
PUBLIC_EXPORT_BREAKS=0
BEHAVIOR_CHANGES_IN_EXTRACTION_COMMITS=0
```

若为了达到行数必须改行为，停止并拆新工作包，不能把重构与规则变更混在一起。

### GATE-01 与 SCHED-01：推理能力和调度

`GATE-01`：

- 当前状态：`COMPLETE / GATE-01.1–GATE-01.2`。允许写集已闭合为 `shared/ai-provider-capabilities.json`、`app/ai-provider-capabilities.ts`、`electron/inference-gateway.cjs`、`electron-builder.yml`、`app/ai-client.ts`、`app/runtime-trace.ts`、`app/world-envelope.ts`、`electron/persistence-sqlite.cjs` 与对应 characterization；SCHED-01 另行拥有 Main scheduler 和 materiality 文件，不能混写。
- `GATE-01.1 RED`：首轮 `tests/ai-provider-capabilities.test.mjs` 为 `7 fail / 0 pass`；6 项因 owner/registry 缺失得到 `ERR_LOAD_URL`，Main gateway 世界任务能力字段断言失败。未先改生产实现。
- `GATE-01.1 GREEN`：共享 JSON 作为 Main/renderer 可审计的 capability 数据源；TS owner 提供 provider/task lookup、官方 DeepSeek 固定 endpoint、compatible loopback 校验、world/autonomous structured non-streaming、未知 provider/task fail-closed、估算 token 的 `accuracy=estimated`；Main gateway 消费同一 registry，characterization `7/7 PASS`。`shared/**` 已加入 Electron packaging files，避免 packaged Main 使用另一份常量。
- `GATE-01.2 RED/GREEN`：新增三项边界表征后首轮为 `3 fail / 7 pass`；接入 `assertTaskCapability`、provider/task context/output 上限和共享 retry status 后 `10/10 PASS`。browser fallback 缺 usage 使用保守字符估算并写 `inputTokenAccuracy/outputTokenAccuracy=estimated`；Main usage 写 `provider-reported`；world/world-repair/autonomous 只允许 structured non-streaming。SQLite trace sanitizer 已保留两个 accuracy 字段；严格 JSON object validator 在 Main response boundary fail-closed。
- GATE 关闭条件全部满足：能力数据只有一份共享 owner；DeepSeek endpoint 固定、compatible Main 只允许 loopback；未知 provider/task 不回退；token 数绝不冒充精确；结构化输出在 Main 先做本地 JSON object 校验。下一包为 SCHED-01，不把能力常量复制进队列。

- 新建 provider capability registry：endpoint policy、context budget、输出能力、streaming、并发上限、retryable 状态。
- DeepSeek 继续固定官方 endpoint；compatible 继续仅允许 loopback，不能扩大 SSRF 面。
- world/autonomous 仅使用结构化非流式输出；provider 支持 JSON Schema 时启用，否则严格 JSON + 本地 schema validator。
- token 数只能在有明确 tokenizer/capability 时称为精确；否则使用保守估算并标记 `estimated`。

`SCHED-01`：

- 当前状态：`COMPLETE / SCHED-01.1–SCHED-01.2`。允许写集为 `electron/inference-scheduler.cjs`、`electron/inference-scheduler-trace.cjs`、`electron/main.cjs`、`electron/autonomous-inference.cjs`、`app/agent-planning-service.ts`、`tests/inference-scheduler.test.mjs`、`tests/inference-scheduler-integration.test.mjs`、相关 Main authority tests；不得把调度状态写入玩家存档或玩家投影。
- `SCHED-01.1 RED/GREEN`：首轮 `tests/inference-scheduler.test.mjs` 为 `4 fail / 0 pass`（scheduler 模块缺失）；实现后 `4/4 PASS`。scheduler 按 provider 隔离队列，读取 capability `defaultConcurrency`，稳定 idempotency key 合并同一任务，最多两次 retry 只接受连接/timeout/429/registry 明确 5xx，schema/authority/leak/durable 错误不重试。
- Main 集成已进入代码：generic/autonomous/world inference 均经过同一 scheduler；provider/任务/规范化输入的 SHA-256 作为稳定键，不记录 prompt；主进程对 retry、429/高延迟降并发、成功渐进恢复、circuit open/half-open/closed 写受限 model trace（失败时 trace 不阻断权威路径）。`AgentPlanningService` 不再写死 `concurrency: 8`。
- materiality 由 Main autonomous path 记录 `attempted`、`model`、`reused`、`fallback`、`avoided`；已记录 proposal 在相同 durable turn/baseRevision 下不再调用模型，renderer 只能消费结果，browser preview 的本地 skip 不可升级为 packaged Main 证据。
- `SCHED-01.2 GREEN`：新增不依赖 Electron GUI 的 `tests/inference-scheduler-integration.test.mjs`，以真实 SQLite origin 验证 world retry 后同键复用、deepseek/compatible 同可见 key 不互相命中、scheduler trace 落 durable runtime trace 且不含 prompt；目标集合 `73/73 PASS`，完整 D 盘 `npm test` 为 `564 total / 559 pass / 5 skipped / 0 fail`。
- SCHED 全量门禁：typecheck、lint（0 warning）、build、bundle、D-storage、严格 NLP `160/160`、严格 leak `120/120`、leak benchmark、source-aware coverage/manifest/verify 均通过；coverage 后续纳入 scheduler/provenance 两个 CJS owner 后为 `14 sources / 8,880 counters / 35.22% statements / 23.24% branches / 28.42% functions / 40.61% lines`，manifest report SHA-256=`dc0b5391cea5c9080f5c9e607c5e650220e5b3b0fe68bc393a8fa4fe8dae5c0f`。首次全量回归暴露 SSR JSON import 循环初始化缺陷，改为 JSON import attribute + 延迟 registry 读取后重新 build 与全量回归通过。

- Main 维护按 provider 隔离的队列；默认并发从 capability 取得，不再在 `AgentPlanningService` 写死 8。
- 仅对连接错误、429、明确 5xx 做最多 2 次指数退避+jitter；认证、schema、authority、leak 或 durable identity 错误不得重试。
- 429/高延迟降低并发，持续成功缓慢恢复；熔断状态写 runtime trace，不进入玩家 UI。
- 每个任务绑定稳定 idempotency key；已冻结 proposal 不重新调用模型。
- Materiality 判断迁到 Main，并记录 attempted/model/reused/fallback/avoided，不能用受控 80% 冒充真实长线率。

验收：429 风暴不超过预算、一个主体失败不丢弃 peers、重启复用 durable proposal、compatible endpoint 仍不能读取 DeepSeek key。

### SEC-01：CSP

当前执行状态：`COMPLETE_CODE / ELECTRON_SMOKE_BLOCKED_BY_LOCAL_GPU`

开始 HEAD：`1aed3d86c6ce3375e8beb9982722e5b05568cbab`

本包在 COV-01 完成后保留为独立窄安全包；Electron 主流程 smoke 仍受本机 GPU 阻塞，但不影响 CSP 源码和 SSR nonce 证据。

原子进度：

- `SEC-01.1` `COMPLETE`：新增 script-src 负向红测；先观察 `4 pass / 1 fail`，再删除 `script-src 'unsafe-inline'`，该切片定向通过。
- `SEC-01.2` `COMPLETE_CODE`：style-src 负向红测先保持失败；4 个 React 组件中的 8 处动态 style 属性迁移为 SVG/CSS/data attribute 后，再删除 `style-src 'unsafe-inline'`。
- `SEC-01.3` `COMPLETE_CODE`：SSR 仍需要合法的 inline bootstrap 脚本，因此新增每窗口/每响应 nonce；Main 通过 `onBeforeSendHeaders` 将同一 nonce 送入 Vinext 请求，响应 CSP 同时授权该 nonce，根 URL 与子路径均纳入过滤。

当前没有发现 raw HTML/eval sink，因此先做窄安全加固：

1. 先删除 `script-src 'unsafe-inline'`，并以负向测试断言其不存在。
2. 将 8 处 React inline style 改为受限 SVG/CSS/data attribute 表现，再删除 `style-src 'unsafe-inline'`。
3. 保留 `object-src 'none'`、`base-uri 'self'`、`frame-ancestors 'none'` 和 sender/permission 门禁。
4. 为 SSR bootstrap 保留每响应 nonce，不使用 `unsafe-inline`；请求和响应同时覆盖根 URL 与子路径。
5. 增加 inline script/style 注入的负向测试，并扫描生产 TSX 不再包含 `style={{`。

实际 write-set：`electron/main.cjs`、`electron/content-security-policy.cjs`、`tests/security-hardening.test.mjs`、`app/opening-prologue.tsx`、`app/backlund-control-map.tsx`、`app/ability-console.tsx`、`app/complete-game.tsx` 及对应 4 个 CSS 文件。

代码验收：`CSP_SCRIPT_UNSAFE_INLINE=ABSENT`、`CSP_STYLE_UNSAFE_INLINE=ABSENT`、`INLINE_STYLE_SOURCE_SCAN=PASS`、`SSR_INLINE_STYLE_SCAN=PASS`、`SSR_NONCE_REQUEST_RESPONSE=PASS`、`SEC_TARGETED_TESTS=7/7 PASS`、typecheck/lint/build/bundle/full regression `507/502/5/0` 均通过。Electron 主流程 smoke 当前因本机 Chromium GPU 在 ready 前退出而 `BLOCKED`；同构建 `node electron/server.mjs` 已在 D 盘环境 HTTP 200，不能把该结果升级为 Electron smoke。

### PROV-01：显式 provenance 边界

本包不是 exactly-once 热修复。它只让历史可解释：

- 当前状态：`COMPLETE / PROV-01.1`。允许写集已闭合为 `electron/persistence-provenance.cjs`、`electron/persistence-sqlite.cjs`、`electron/persistence-ipc.cjs`、`electron/preload.cjs`、`app/electron-bridge.d.ts` 与对应 persistence characterization；只读 API 不改变历史 `turnId`，不写入玩家投影。

- 对权威记录暴露 `provenanceStatus=current-turn|durable-turn|legacy-import|unproven-import`。
- 只读 API 提供 `oldestReplayableWeek`、`oldestDurablyOwnedWeek` 和不可重放原因。
- 不篡改历史 `turnId`；无证明的 legacy 保持 `state-import`。
- 测试 retained journal、durable `world_turns`、fresh import、aged-out owner 四种边界。

验收：任何历史项都不会在 UI/日志中伪装成比实际更强的来源证明。`persistence:provenance` 定向集合 `17/17 PASS`；完整 D 盘回归 `569 total / 564 pass / 5 skipped / 0 fail`，typecheck/lint/build、coverage、strict NLP/leak、D-storage 与 bundle 均重新通过。

### REL-01：发行证据

当前状态：`IN_PROGRESS / REL-01.3 COMPLETE; REL-01.4 BLOCKED`。用户已授权本版本使用
`D:\gmzz\app\generated-lore-compendium.ts`，接受 `generated/C-grade` provenance，并允许生成安装包。
本机 C-grade seed、NSIS 安装包、provenance 和同机 server/SQLite smoke 已完成；签名正式发布、
renderer UI、clean-machine、production 与真人证据仍未完成，不能把本机状态升级为正式发行完成。

本版本已执行：

1. 受控 `KNOWLEDGE_SEED_DIR=D:\gmzz\.runtime\authorized-cgrade-seed` 通过 `release:verify:seed`；
   seed `buildId=2026-08-24T16:41:12.965Z|04386697b5c6`，来源 manifest digest
   `e12c075b9cf982e1be6be8bffcaa6ee29977c4eccdc576e816e8ad30bf6fe396`。
2. Electron 43.3.0 / electron-builder 26.15.3 生成 NSIS 0.4.0；最终安装器为
   `D:\gmzz\release\灰雾纪事-Setup-0.4.0.exe`，最终 SHA-256/bytes 以 `release/provenance.json` 为准。
3. `release:smoke` 使用唯一 D 盘临时安装根，验证 `GMZZ_READY`、seed 部署、SQLite WAL 和
   `persistence_records` 六列，并清理安装器子进程。
4. 干净机必须是不同、无 checkout 的 Job B，使用上游传递 artifact 和 hash，不得 npm/pip install；
   production 与 human long-play 需要各自独立证据，不由 CI 或同机 smoke 推断。

当前阻塞：`PACKAGE_SIGNATURE=NOT_SIGNED`（无证书）；`INSTALLER_UI_QA=BLOCKED_BY_HOST_GPU_VIRTUALIZATION`
（安装成功但 Playwright renderer target 崩溃）；`CLEAN_MACHINE_JOB_B=NOT_AVAILABLE`；
`PRODUCTION_EVIDENCE=NOT_AVAILABLE`；`HUMAN_LONG_PLAY=NOT_AVAILABLE`。`app/generated-lore-compendium.ts`
是公开占位版（`LORE_RECORDS=0`），本包只能标记为明确授权的 C-grade unsigned prerelease candidate，
不得标记为 canonical lore 或正式签名发行。

## 7. 每个工作包的固定测试顺序

1. 写最小 red test，记录精确失败名；不先改生产代码。
2. 跑目标测试，确认只因预期缺陷失败。
3. 实现最小修复。
4. 跑目标测试和相邻 authority/privacy/persistence tests。
5. 通过 D 盘 runner 依次跑 `npm run typecheck`、`npm run lint`、`npm test`、`npm run bundle:budget`。
6. COV-01 完成后追加 `npm run test:coverage`、manifest 生成和基线不得回退 verifier。
7. 执行 `git diff --check`、`git status --short`、write-set 比对。
8. 把命令、计数、skip、失败和未运行项写回本文件；不得只写“测试通过”。

## 8. 自动压缩/换会话恢复协议

新的 Luna Max/Codex 会话必须按顺序执行：

1. 完整读取本文件，不得只读结尾或聊天摘要。
2. 完整读取 `docs/CORE_GAMEPLAY_BUILD.md` 与 `docs/FIVE_STAGE_RUNTIME_CLOSURE.md` 的当前状态、Deferred/NOT_AVAILABLE 项。
3. 运行 `git status --short`；确认并保护两个 `.qa-prodserver3.*.log`。
4. 运行 `git branch --show-current`、`git rev-parse HEAD`、`git diff --name-only`。
5. 只读查询 `git ls-remote origin refs/heads/main` 和相关 PR/CI CURRENT；若网络不可用则写 `REMOTE_CURRENT=NOT_AVAILABLE`，不得使用旧 SHA 假装当前。
6. 若本文件锚点与 Git CURRENT 不同，先判断是已完成工作还是未知漂移；无法证明时状态改为 `BLOCKED_BASELINE_DRIFT`，停止生产代码修改。
7. 找到状态为 `IN_PROGRESS` 的唯一工作包；没有则从第一个 `READY` 开始。禁止跳到后面的重构。
8. 把该包改为 `IN_PROGRESS`，写入 `START_HEAD`、允许 write-set、red test 名和下一条命令，然后才编辑代码。
9. 每完成一个原子步骤、每次准备触发自动压缩前，都更新 `CURRENT_NEXT_ACTION` 与证据。下一会话只从该动作继续，不重做已完成步骤。
10. 未经用户明确授权，不 commit/push/建 PR/merge；GitHub 自动分配的 PR 编号不得预先写死为 PR5/PR6。

## 9. 当前交接状态

```text
LAST_COMPLETED=DSK-01A and DSK-01B.1/DSK-01B.2/DSK-01B.3/DSK-01B.4 runtime storage migration, AUTH-01 canonical audience projection, SEC-01 CSP code closure, COV-01 real source-aware report/baseline/regression gate, CTX-01 causal entity closure compiler, PROMPT-01 quiet-week public signal provenance contract, NLP-01.1 gold fixture/parser/evaluator baseline, NLP-01.2 rule convergence, NLP-01.3 kind-only production façade migration, NLP-01.4 target-only production façade migration, NLP-01.5 resource-only production façade migration, NLP-01.6 authorization-scope-only production façade migration, NLP-01.7 red-line evidence merge, NLP-01.8 retreat-condition migration and source-bound evidence correction, NLP-01 parser closeout revalidation with resource posture gate and façade negated posture consumption, NLP-01.9 colloquial negation and alternative-target fail-closed hardening, LEAK-01.1 gold-fixture-and-policy, ARCH-01A.1 characterization, ARCH-01A.2 action-contract extraction, ARCH-01A.3 extraction validation, ARCH-01B.1 characterization, ARCH-01B.2 dialogue-orchestration extraction, ARCH-01B.3 extraction validation, ARCH-01C.1 characterization, ARCH-01C.2 week-resolution extraction, ARCH-01C.3 extraction validation, ARCH-01D.1 characterization, ARCH-01D.2 production extraction, ARCH-01D.3 extraction validation, GATE-01.1 provider capability characterization, GATE-01.2 renderer capability gate/token-accounting accuracy/schema boundary, SCHED-01.1 provider-aware scheduler characterization and implementation, SCHED-01.2 Main scheduler/durable integration characterization and full D gate, COV-01 provider capability source inclusion and lazy SSR registry fix, PROV-01.1 read-only provenance/readability API and IPC contract, REL-01 source-stage fail-closed release verification, REL-01.1 local D-bound seed input path and manifest staging fix, REL-01.2 authorized C-grade seed materialization, REL-01.3 Electron 43.3.0 NSIS build/provenance/install smoke, SEC-01 CSP URL-pattern runtime fix and security contract refresh
IN_PROGRESS=DELIVERY-01 CLEAN_PR_EXACT_MAIN
START_HEAD=c75eb6b03c6529d3eb14d536cb4a73e086f12e40
DELIVERY_MIGRATION_COMMIT=2e9d8d5ae71b51e7905a46c0a4e37a3fd2c0235b
NEXT=DELIVERY-01_LOCAL_GATES_AND_SOURCE_REVIEW
NEXT_COMMAND=在 D 盘环境完成 typecheck/lint/full test/coverage/strict NLP+leak/storage/bundle/audit/diff/PowerShell+YAML 门禁；更新精确计数；显式暂存且排除两个 QA 日志；提交后刷新远端 main 和 GitHub 保护/CI，推送 codex/technical-debt-delivery 并创建新 PR。任何检查或审核失败先修复，不合并
KNOWN_BLOCKERS=PR_NOT_CREATED; HOSTED_CI_NOT_RUN; INDEPENDENT_PR_REVIEW_PENDING; PACKAGE_SIGNATURE_NOT_SIGNED; HOSTED_RELEASE_SEED_SECRETS_NOT_VERIFIED; INSTALLER_UI_QA_BLOCKED_BY_HOST_GPU_VIRTUALIZATION; PRODUCTION_EVIDENCE_NOT_AVAILABLE; HUMAN_LONG_PLAY_NOT_AVAILABLE
FINAL_RECHECK=LOCAL_DELIVERY_GATE_PASS; full test first run 575 total/568 pass/6 skip/1 fail exposed stale release-workflow contract, fixed and rerun 575 total/569 pass/6 skip/0 fail duration=489558.1933ms; release+security targeted 20/20 PASS; typecheck/lint/build PASS; coverage 14 sources/8,921 counters, 35.67% statements/24.02% branches/28.67% functions/41.02% lines, manifest SHA-256=81e317c590ce9337116d25d89f1c1a4550971b9f889e6714e5986532176ff2f0; strict NLP 160/160 PASS; strict leak 120/120 PASS; leak p95=11.652ms; D-storage/bundle/release-source/authorized-seed/PowerShell/YAML/diff gates PASS; npm audit high gate PASS with 4 moderate transitive esbuild findings and no high/critical; no clean-machine PASS claimed before hosted Job B
SOURCE_PATH_RECHECK=PASS (façade exports owners without reverse import; Main exits on runtimePathError before userData/server/RAG use; provenance remains read-only behind bounded IPC; release verifier accepts only validated absolute D-bound seed input and stages before artifact writes)
REL_INPUT_PATH_RECHECK=PASS (explicit KNOWLEDGE_SEED_DIR, manifest-listed optional files, D-drive rejection and no-fallback behavior covered by 9/9 release evidence tests)
REL_BLOCKER_RECHECK=IN_PROGRESS (Job B/Job C code exists and local contracts pass; hosted execution, signature and external evidence remain literal PENDING/NOT_AVAILABLE)
BLOCKER_CLASSIFICATION=DELIVERY_VALIDATION_AND_REMOTE_REVIEW_PENDING / FORMAL_SIGNATURE_AND_EXTERNAL_EVIDENCE_PENDING
REMOTE_RECHECK=PASS_AFTER_LOCAL_GATE (origin/main=c75eb6b03c6529d3eb14d536cb4a73e086f12e40; merge-base exact; ahead=2 behind=0; branch protection strict build ubuntu/windows, approval count=0; refresh required before merge)
CONTINUATION_RECHECK=PASS (clean branch is based directly on exact main; authorized implementation tree migration matched; current edits are bounded to release evidence closure and documentation; final full gate still pending)

### 2026-08-24 · REL-01.1 受控本地 seed 输入路径修复

- 源码审计发现一个真实的发行工具缺口：`docs/releasing.md` 与 release workflow 定义了授权 seed 输入，但 `scripts/release/verify-release.mjs` 本地只读取 `private/rag/index`，忽略了受控本地目录，也只暂存固定核心文件，manifest 声明的可选文件会在暂存后丢失。
- 先行 RED：`tests/release-evidence.test.mjs` 新增 D 盘 fixture；修复前显式 `KNOWLEDGE_SEED_DIR` 仍得到 `seed-manifest-missing`，C 盘路径也错误回退到仓库目录；未先改生产代码。
- 代码修复：验证器现在接受显式绝对 `KNOWLEDGE_SEED_DIR`；Windows 默认强制来源、解析后的真实路径与运行暂存根位于 D 盘；显式路径无效时不回退；先校验来源，再以 `GMZZ_STORAGE_ROOT` 解析 `<root>\release-seed`，复制 manifest 声明文件并二次校验，来源与目标同路径时不自删。
- GREEN：发行证据定向集合 `9/9 PASS`，覆盖有效 D 盘目录、可选 manifest 文件暂存、C 盘路径 fail-closed、缺 seed 的 artifact 诊断；`node --check scripts/release/verify-release.mjs` 通过。未生成或下载任何 seed。
- 历史边界（2026-08-24）：当时没有用户授权 seed，因此 `release:verify:seed`/`release:provenance` 必须返回 `seed-manifest-missing`；该状态已由 2026-08-25 用户授权的 C-grade 输入更新，不能回读为当前状态。
- 历史 `CURRENT_NEXT_ACTION=REL-01.1` 已完成；当前转入 `REL-01.4` 签名与独立证据门禁，仍不自动 commit/push/merge。

### 2026-08-25 · REL-01.2/REL-01.3 用户授权的 C-grade 安装包候选

- 用户明确授权 `D:\gmzz\app\generated-lore-compendium.ts` 作为本版本知识源，接受 `generated/C-grade` provenance，并允许生成/构建安装包。源码审计确认该文件是公开占位版：`LORE_RECORDS=0`、`recordCount=0`；因此不能宣称原著 canonical lore。
- `npm.cmd run rag:ingest -- --skip-external --force` 与 `npm.cmd run rag:seed:manifest` 在 D 盘完成；最终受控 seed 输入为 `D:\gmzz\.runtime\authorized-cgrade-seed`，只保留 manifest 声明的五类索引文件（另含 seed-manifest），避免把 `private/rag/index/state` 等运行状态混入 seed。seed `buildId=2026-08-24T16:41:12.965Z|04386697b5c6`，source manifest digest=`e12c075b9cf982e1be6be8bffcaa6ee29977c4eccdc576e816e8ad30bf6fe396`。
- 依赖恢复到锁定的 Electron `43.3.0`；`npm.cmd run electron:build` 用 electron-builder `26.15.3` 生成 `D:\gmzz\release\灰雾纪事-Setup-0.4.0.exe`。`release/provenance.json` 绑定最终 bytes/SHA-256、seed buildId/source digest 和 HEAD；当前签名检查为 `NotSigned`，无代码签名证书。
- 构建时 worktree 仍为 `DIRTY_UNCOMMITTED`，因此 `sourceCommit=HEAD` 只是候选来源锚点，不是 clean exact-main/正式 tag 证明；本候选不得直接升级为正式发布证据。
- 本轮源码级修复：使用 `build/icon.ico` 绕过 ESM 项目根下 electron-builder CommonJS icon helper；修正 `webRequest` 空路径 URL pattern（`[\`${url}/*\`]`，防止 packaged UI 创建窗口时 `Invalid url pattern ... Empty path`）；installer smoke 在 D 盘启动时注入无窗口 GPU 参数，并按精确安装根清理 Electron 子进程。
- `npm.cmd run release:smoke` 已通过：`GMZZ_READY`、首次 seed 部署、SQLite `journal_mode=wal`、`persistence_records` 六列和 read-only probe 全部 PASS；临时根与 userData 均在 `D:\gmzz\.runtime`，无残留 `MistChronicle` 进程。
- UI 证据边界：`scripts/installer-qa.mjs` 的安装步骤成功，但本机 Playwright renderer target 因 GPU/虚拟化上下文崩溃，记录为 `INSTALLER_UI_QA=BLOCKED_BY_HOST_GPU_VIRTUALIZATION`；不得写成 UI PASS。clean-machine、production、人类长线继续 `NOT_AVAILABLE`。
- 自动压缩恢复锚点：下一次会话先读本账本、`docs/CORE_GAMEPLAY_BUILD.md`、`docs/FIVE_STAGE_RUNTIME_CLOSURE.md`，确认 `REL-01.4`；先重跑最终全量质量门禁并更新本节的精确计数，再决定是否需要签名/独立证据。未获用户明确授权时不自动 commit、push、建 PR 或 merge；本次用户已授权收尾审计通过后仅提交/推送当前分支，不建 PR、不 merge、不签名发布。

### 2026-08-25 · REL-01.4 证书、独立 clean-machine 与 production 门禁复核

- 正式签名复核：`Get-AuthenticodeSignature D:\gmzz\release\灰雾纪事-Setup-0.4.0.exe` 返回 `NotSigned`，没有 signer certificate；`Cert:\CurrentUser\My` 与 `Cert:\LocalMachine\My` 均未发现带私钥且含 Code Signing EKU 的证书。`CSC_LINK`、`WIN_CSC_LINK`、`CSC_KEY_PASSWORD`、`WIN_CSC_KEY_PASSWORD` 均未设置；D:\gmzz 项目范围没有 `.pfx`、`.p12`、`.pem` 或 `.cer` 证书文件。不能生成自签名证书冒充正式 Authenticode，也不能在没有密码的情况下尝试签名。
- 独立 clean-machine 复核：`.github/workflows/release.yml` 当前只有一个 `installer` job；checkout、依赖安装、构建和 smoke 全部在同一 runner，不能满足 PR5 的独立 `machineId`、`sourceCheckout=ABSENT`、`dependencyInstall=NOT_RUN`、`artifactTransferVerified=true` 契约。本机未发现 Docker 或 Windows Sandbox，WSL 不能运行此 Windows NSIS 证据；因此 `CLEAN_MACHINE_JOB_B=NOT_AVAILABLE`，没有生成伪造 manifest。
- production 复核：仓库没有配置可写入的 production HTTPS 目标、发布平台或部署凭据；`PRODUCTION_URL`/`DEPLOY_URL` 未设置，`gh auth status` 显示默认 GitHub token 已失效。GitHub Release 资产发布不等于产品 production deployment；因此没有发起网络部署或 release workflow，`PRODUCTION_EVIDENCE=NOT_AVAILABLE`。
- 已验证候选仍保持原值：`D:\gmzz\release\灰雾纪事-Setup-0.4.0.exe`，SHA-256=`e028bc59c15b6e18ab1f975d6e7be24a2c4d4ef4c886791be0d038a46d926152`，bytes=`114676071`，`release:provenance`/D 盘 installer smoke PASS；它仍是 DIRTY_UNCOMMITTED、`generated/C-grade`、unsigned candidate，不是正式 signed/clean-machine/production 版本。
- 继续条件（需用户提供或授权）：(1) D 盘可读的正式代码签名 PFX/PKCS#12 路径及密码注入方式（密码不要贴到聊天）；(2) 一台与构建机不同的 Windows 主机/VM 或已授权的 hosted runner，用于无 checkout、无 npm/pip install 的 Job B；(3) production HTTPS URL、部署方式/凭据和允许发布的精确 artifact SHA。取得前正式签名/独立证据/production 保持 `BLOCKED/NOT_AVAILABLE`；代码闭环可在本次用户明确授权下提交/推送当前分支，但不建 PR、不 merge、不把候选升级为正式发布。
- 收尾复核（本次继续执行）：完整 `npm test` 为 `571 total / 565 pass / 6 skipped / 0 fail`，耗时 `457865.3649ms`；首次发现的发行负向用例因依赖本机 `private/rag/index` 状态而不稳定，已改为显式不存在的 D 盘 seed fixture，`tests/release-evidence.test.mjs` 定向 `9/9 PASS`。coverage、严格 NLP/leak、D storage、bundle、source/seed/provenance 和 installer smoke 均重新通过。该修复不改变正式签名、独立 clean-machine、production 或 human evidence 的阻塞真值。

PROTECTED_UNTRACKED=.qa-prodserver3.err.log,.qa-prodserver3.out.log
REAL_MODEL_REQUESTS_AUTHORIZED=NO
NETWORK_DEPENDENCY_INSTALL_AUTHORIZED=YES_FOR_COV01_ONLY (vitest@4.1.11 and coverage-v8@4.1.11; cache=D:\gmzz\.runtime\npm-cache)
COMMIT_PUSH_PR_MERGE_AUTHORIZED=YES_FOR_CLEAN_DELIVERY_CHAIN (user explicitly authorized new PR/CI/review and locked-head exact-main merge; failure gates remain binding)
PUSH_STATUS=PR_5_OPEN; CI_FIX_PENDING_COMMIT_AND_PUSH
```

### 2026-08-25 · DELIVERY-01 干净分支与独立发布证据工作流

- 从已验证的 `origin/main@c75eb6b03c6529d3eb14d536cb4a73e086f12e40` 建立
  `codex/technical-debt-delivery`，把授权实现提交迁移为
  `2e9d8d5ae71b51e7905a46c0a4e37a3fd2c0235b`；迁移前后的实现 tree 都是
  `46df678ce58f6b1120bbaf9dfa3fca0ab4419e41`，`TREE_EQUAL=PASS`。该分支尚未推送，
  新 PR/hosted CI/独立审核均未发生。
- 源码审计确认旧 `release.yml` 在同一 runner 构建并 smoke，无法证明 clean-machine；还会
  在构建时改写 tracked lore source。新链路拆成 Job A 构建、无 checkout/无依赖安装的
  Job B 安装资格验证、精确 source checkout 的 Job C 契约验证，以及只消费 Job B 同一字节的
  publish job；手动运行默认不发布。
- TDD 首先证明 evidence root 与 Git checkout root 不能分离、工作流缺 Job B、installer smoke
  未绑定 `GMZZ_STORAGE_ROOT`，以及机器身份错误包含 `GITHUB_JOB`。四处实现修复后定向集合
  `13/13 PASS`；两个 PowerShell 脚本 parse PASS，release YAML 由项目锁定的 `js-yaml`
  parse PASS。GitHub 官方 Action 文档核验：单一 artifact ID 会直接解压到指定目录；
  attestation 需要 `id-token`、`attestations`、`artifact-metadata` write 权限，工作流已声明。
- 当前证据边界：本机只证明代码和静态契约，`CLEAN_MACHINE_JOB_B=NOT_RUN`、
  `HOSTED_CI=NOT_RUN`、`PR_REVIEW=PENDING`。必须等新 PR 精确 head 的 CI/审核通过并锁头合并，
  再验证 resulting-main；签名、tag、GitHub Release 与 production/human 证据不得提前。
- 全量本地门禁已经完成：第一次完整回归为 `575 total / 568 pass / 6 skip / 1 fail`，
  失败是 security contract 仍要求旧的 seed-to-source materialization；在保留 release-exists
  退出码冻结的同时，把契约更新为“不得改写 tracked compendium”，定向 `20/20 PASS`，随后
  第二次完整回归为 `575 total / 569 pass / 6 skip / 0 fail`。coverage 为 14 个权威源、
  8,921 counters，`35.67/24.02/28.67/41.02`；严格 NLP `160/160`、严格 leak
  `120/120`、D-storage、bundle、release source/授权 seed、PowerShell/YAML parse 均通过。
  `npm audit --audit-level=high` 无 high/critical 阻断，但保留 4 个来自 drizzle-kit 工具链的
  moderate esbuild 告警；自动修复要求 breaking `--force`，不在本交付包内擅自升级。
- 原始重点问题复核：`app/game-engine.ts` 当前为 25,733 bytes（不再是 182 KB 单体实现）；
  主要执行 owner 已拆至 `action-contracts`、`dialogue-orchestration`、`week-resolution`、
  `world-turn-orchestrator`。覆盖率已有真实 source-aware 量化和不得回退门禁；中文 NLP 仍以
  规则 parser 运行，但由 160 条人工金标、否定/授权 over-grant 门禁和生产 façade 约束，
  当前不再是“无量化的裸正则”，仍不能把金标全绿解释为任意自然语言都可靠。
- 新 PR 已创建为 `#5`，初始精确 head=`5d87e95280fe283f6d8c905611e5978f5cf96834`、
  base=`c75eb6b03c6529d3eb14d536cb4a73e086f12e40`。PR 源码审核发现 artifact download
  发生在 D-drive smoke 检查之前；新增 RED 后先得到 `12 pass / 1 fail`，再把 D-drive
  runner root preflight 放到 installer、clean-machine、evidence-verify、publish 四个 Windows
  job 的第一个写入动作前，定向 release+security `20/20 PASS`、YAML parse/diff PASS。
  旧 head 的 CI 不能用于合并，必须等待该修复推送后的新精确 head。
- PR head `96fabd215171840fe12be8cb6bca7fca21ee66a5` 的 Ubuntu CI 在 full test
  `575 total / 563 pass / 7 skip / 5 fail` 停止。源码/日志定位后确认：3 项 release 测试
  继承 PR `GITHUB_REF_NAME=5/merge`，错误提前触发版本门禁；2 项 provenance 测试在
  `GMZZ_STORAGE_ROOT` 缺失时由三元表达式返回 `undefined`。修复只隔离测试环境：release
  子进程显式清空 tag/ref；provenance fixture 默认使用仓库 `.runtime` 并创建目录，生产
  `verify-release` 的 tag/D-drive fail-closed 逻辑未放宽。模拟 `GITHUB_REF_NAME=5/merge`
  且未设置 storage root 的定向集合 `23/23 PASS`。该失败 head 绝不可合并。
