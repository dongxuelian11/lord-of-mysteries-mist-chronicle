# 灰雾纪事 · Lord of Mysteries: Mist Chronicle

《灰雾纪事》（Lord of Mysteries: Mist Chronicle）是一款由 AI 驱动的
《诡秘之主》（LOTM）非官方同人组织经营、世界推演与 RAG 互动叙事游戏。
玩家将从贝克兰德建立隐秘组织，通过自然语言命令、议会决策、调查、能力
使用与持续世界模拟改变原有历史，并逐步扩展到跨城网络、末日前奏、成神与
成神后的长期世界治理。

> 本项目是**非官方、非商业**同人作品，与《诡秘之主》作者及出版方无隶属
> 关系。原著设定版权归原作者及版权方所有；如有版权方要求，项目将立即
> 停止分发。详见 [NOTICE](./NOTICE)。

检索关键词：诡秘之主 · Lord of Mysteries · LOTM · 灰雾纪事 · Mist
Chronicle · AI 叙事游戏 · RAG 游戏 · 组织经营 · 世界推演 · 互动叙事。

## 特性

- **全 AI 叙事**：对话、推演、小说章节全部由大模型生成，必须配置 API Key
- **议桌集会**：地图与文书集成在一张议会桌上，点击纸张打开述职、议题、
  自由讨论与决议
- **组织经营**：以人力、金钱、非凡材料和四项治理职责驱动分部、配方、
  人员提拔与封印物循环
- **动态地图**：贝克兰德区块与战略点持续争夺；声望、暴露、势力敌意和
  控制力都会改变成本、收益、情报与反击
- **跨城战役**：廷根、拜亚姆、班西、白银城、特里尔、科尔杜可以调查和
  建立分部，大雾霾后世界仍继续推演
- **全途径长线**：22 条标准途径、220 个序列档案、22 份唯一性和 9 份源质
  进入权威账本，支持序列 0 与成神后治理
- **角色对话**：与成员自由对话，能力可在对话中即时使用
- **动态长期记忆**：承诺、背叛、救助、误会与长期计划以结构化记忆保存，
  不依赖模型上下文压缩；角色只看到自己有权知道的历史
- **差异化开局**：性别、年龄、组织类型与命名、成员班底均可自定义
- **桌面版**：Electron + NSIS 安装包，离线启动本地服务，关窗即完全退出

## 快速开始

环境要求：Node.js ≥ 22

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。首次游玩请在游戏内「模型与世界资料」填写
兼容 OpenAI 格式的 API Key（默认支持 DeepSeek）。

## 世界知识库说明

原始语料与生成期知识文件**不随开源仓库分发**；从源码直接构建且未提供
`private/` 数据时使用空壳占位。正式签名安装包包含维护者确认有权分发的
派生运行索引 seed，不包含原始 TXT、EPUB 或 Git 缓存。

维护者私有流程：

```powershell
# 将完整知识库放到 private/generated-lore-compendium.ts（已 gitignore）
npm run prepare:lore   # 构建前会自动执行：private/ 优先，其次公共空壳
```

## RAG V2（知识检索）

游戏内置本地优先混合检索（BM25 + 别名/实体 + 可选向量 + 权限/剧透过滤）。
大型语料通过可重复管线导入，详见 [docs/rag-v2.md](./docs/rag-v2.md)。

```powershell
npm run rag:ingest   # 从 private/rag/sources.manifest.json 导入并建索引
npm run rag:status   # 查看索引与来源状态
npm run rag:eval     # 固定夹具评测（新旧检索对比，泄漏率硬性为 0）
npm run rag:audit    # 索引/Bundle/构建/延迟审计
npm run rag:eval:full # 112 条完整评测（Recall@10≥0.90、MRR 目标≥0.65、泄漏=0）
npm run rag:benchmark # 1k/5k/10k 压测
npm run rag:longrun   # 20/50 周确定性长线
npm run rag:export    # 导出运行索引到 Electron 用户目录（原子替换）
npm run rag:corpus:audit # 真实语料质量审计（乱码/重复/章节/噪声抽样）
npm run rag:coverage  # 知识覆盖矩阵（人物/途径/组织/地点/封印物/历史/规则）
npm run rag:entities:audit # 实体/别名/身份注册表审计
npm run rag:conflicts # 跨层级冲突与跨来源重复报告
npm run rag:eval:blind # 150 条独立盲测（玩家式自然查询）
npm run rag:game:verify # 真实知识库驱动的游戏内验证（对话/议会/能力/世界推进）
npm run rag:align:chapters # 中英章节对齐（中文 1258 章 ↔ 英文 1430 章）
npm run rag:eval:zh # 中文正文/中英混合评测（zh-only R@10≈0.91、mixed≈0.91）
```

未配置 embedding 服务时自动退化为纯词法检索；DeepSeek 不提供
embedding 接口也不影响游玩。桌面版由 Electron RAG Worker 在本地离线检索，
渲染端不加载完整索引。

原始中文与英文小说文件、TXT、EPUB 及开发语料仅保存在本机私有目录中，
不进入 GitHub 源码仓库或正式安装包。正式安装包会包含由这些语料构建
生成的完整运行索引 seed，因此用户安装后即可直接使用本地知识库。

### 安装包内置知识库（正式产品策略）

- 正式安装包**内置完整知识索引**（`resources/knowledge/seed`），用户安装后
  开箱即用，无需手动运行任何开发命令；
- 首次启动会把 seed 校验后原子部署到用户数据目录；已存在有效索引时不会
  重复复制，较新的用户 `.mcrag` 知识包不会被较旧 seed 覆盖；
- `.mcrag` 继续用于知识库热修、升级、替换与回滚；
- 数据边界：GitHub 源码仓库不包含小说正文与完整索引；Renderer Bundle 不
  包含完整知识库；安装包只包含运行索引，不包含原始 TXT/EPUB/Git 缓存；
  完整知识库由本地 Worker 读取，Renderer 只能取得权限过滤后的检索结果。

### 存档兼容范围

当前存档 schema 为 v21。v15 至 v20 存档会自动补齐知识边界、动态记忆、
组织经营、自治主体、势力战略、高位资产账本和跨城战役状态，并保留原有
世界内核。校验和失败、缺少关键世界状态或不在支持范围内的存档会明确报错，
不会静默改写。

动态记忆系统详见 [docs/memory.md](./docs/memory.md)。

## 组织经营与长期世界

第一阶段的贝克兰德经营规格见
[docs/BACKLUND_MANAGEMENT_REFACTOR.md](./docs/BACKLUND_MANAGEMENT_REFACTOR.md)，
自治角色与势力见
[docs/AUTONOMOUS_WORLD_PHASE_2.md](./docs/AUTONOMOUS_WORLD_PHASE_2.md)，世界账本事件重放、分支和兼容迁移见
[docs/WORLD_LEDGER_V2.md](./docs/WORLD_LEDGER_V2.md)，
多势力战略竞争见
[docs/FACTION_STRATEGY_PHASE_3.md](./docs/FACTION_STRATEGY_PHASE_3.md)，
经营闭环与亲历任务见
[docs/MANAGEMENT_AND_PARTICIPATION_PHASE_4.md](./docs/MANAGEMENT_AND_PARTICIPATION_PHASE_4.md)。

22 条途径完整账本、七城战役、重大历史阶段、成神后世界和 v21 存档迁移见
[docs/CAMPAIGN_WORLD_PHASE_5_7.md](./docs/CAMPAIGN_WORLD_PHASE_5_7.md)。

## 非凡能力规则引擎（MVP）

非凡能力不再主要依赖大模型“凭感觉”裁决：玩家自然语言命令先解析为结构化意图，再由确定性规则引擎完成合法性检查、位阶/抗性/反制计算、六级结果结算与 `AbilityOutcomeContract` 合同，最后 DeepSeek 严格依据合同生成叙事。详见 [docs/abilities.md](./docs/abilities.md)。

```powershell
npm run ability:audit      # 定义与资源边界审计
npm run ability:eval       # 合法性/六级结果/位阶/反制/幂等/叙事等价评测
npm run ability:longrun    # 三条 30 周路线
npm run ability:benchmark  # 性能与存档压测
```

## 命运失控机制（MVP）

大成功和大失败会“离谱地整蛊”玩家：诅咒式成功、歪打正着、全面失控都会真正扭曲任务与长期局面，而不是单纯加减数值。命运骰独立、可复现、防读档重骰，压力会主动“憋一个大的”。详见 [docs/fate.md](./docs/fate.md)。

```powershell
npm run fate:audit      # 模板质量与反无聊审计
npm run fate:eval       # 四种交叉/旁路/幂等/受众行为评测
npm run fate:longrun    # 三条 30 周整活路线
npm run fate:benchmark  # 4×10 万分布模拟与性能压测
```

## 生成式能力与轻量失控（MVP）

能力不做成固定技能卡：玩家自由描述用法，AI 出方案、规则层只做包络裁剪（ACCEPT / ACCEPT_WITH_LIMITS / ACCEPT_AS_IMPROVISED_EFFECT / REQUIRES_PREPARATION / REQUIRES_CLARIFICATION / REJECT_OUTSIDE_ABILITY_DOMAIN）。命运异常改为低频节奏并带行动/周/三级/四级冷却；另新增 stable→disturbed→critical→partial-loss→contained-loss 轻量失控框架，失控可恢复、可压制、不可读档重骰。详见 [docs/lightweight-mvp.md](./docs/lightweight-mvp.md)。

```powershell
npm run ability:generative:eval   # 20 个自由能力方案评测
npm run fate:frequency:eval       # 低频分布与冷却不变量
npm run control:eval              # 失控行为评测
npm run control:longrun           # 三条 30 周失控路线
```

## 桌面版打包

```powershell
npm run build
npm run dist:win
```

本地命令产物：`release/灰雾纪事-Setup-<version>.exe`。正式版本由 tag 触发
发布流水线，要求 tag 与 `package.json` 版本完全一致，并完成授权 seed 哈希
校验、Windows 代码签名、干净安装启动测试及 GitHub provenance attestation。
发布配置见 [docs/releasing.md](./docs/releasing.md)。

## 长线世界可靠性

自治世界采用 24 Agent 活跃集、逐主体独立规划、冷存储与 72,000 字符硬预算。公开消息、行动报告和文学越权只做局部重试；已接受的世界事实不会被整周重算，模型连续失败会直接报错，不使用降级文本。v0.4.0 已完成连续 20 周真实模型技术回归；该记录不等于玩法或真人体验验收。可靠性边界见 [docs/WORLD_RUNTIME_RELIABILITY.md](./docs/WORLD_RUNTIME_RELIABILITY.md)，自动涌现指标见 [docs/EMERGENCE_EVALUATION.md](./docs/EMERGENCE_EVALUATION.md)，真人 5–20 小时协议见 [docs/HUMAN_LONG_PLAYTEST_PROTOCOL.md](./docs/HUMAN_LONG_PLAYTEST_PROTOCOL.md)。

## 测试与 QA

```powershell
npm run lint
npm run typecheck
npm test
npm run bundle:budget
```

仓库内附带一套可复用的真机 QA 脚本：

- `scripts/prod-qa.mjs`：生产服务器 + 页面资源检查
- `scripts/ui-qa.mjs`：对话框与地图布局自动验证（需要本地 Playwright）
- `scripts/electron-ui-qa.mjs`：打包窗口端到端验证
- `scripts/installer-qa.mjs`：安装 → 启动 → 卸载全链路验证

## 目录结构

```text
app/                  # 游戏前端与逻辑（React + vinext/Next 风格）
  game-model.ts       # 游戏状态模型
  game-engine.ts      # 推演引擎
  world-runtime.ts    # 活跃集、独立 Agent 与裁决相关性投影
  world-envelope.ts   # 世界输出校验及局部修复
  action-boundaries.ts # 玩家行动红线校验
  model-output.ts     # 模型 JSON 解析与文本相似度
  council-ai.ts       # AI 调用与上下文组装
  weekly-council.tsx  # 议会页
  city-map-workspace.tsx # 城市地图
electron/             # Electron 桌面壳
scripts/              # 启动器、QA 与工具脚本
  patch-vinext-windows.mjs # 修复 vinext 生产资源在 Windows 上的路径键
private/              # 私有设定（gitignored，维护者持有）
tests/                # 自动化测试
```

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可

代码以 [MIT](./LICENSE) 许可证发布。游戏内容与原著设定见 [NOTICE](./NOTICE)。
