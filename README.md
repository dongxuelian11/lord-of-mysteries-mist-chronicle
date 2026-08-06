# 灰雾纪事 · Lord of Mysteries: Mist Chronicle

《灰雾纪事》（Lord of Mysteries: Mist Chronicle）是一款由 AI 驱动的
《诡秘之主》（LOTM）非官方同人组织经营、世界推演与 RAG 互动叙事游戏。
玩家将在贝克兰德建立隐秘组织，通过自然语言命令、议会决策、调查、能力
使用与持续世界模拟改变原有历史。

> 本项目是**非官方、非商业**同人作品，与《诡秘之主》作者及出版方无隶属
> 关系。原著设定版权归原作者及版权方所有；如有版权方要求，项目将立即
> 停止分发。详见 [NOTICE](./NOTICE)。

检索关键词：诡秘之主 · Lord of Mysteries · LOTM · 灰雾纪事 · Mist
Chronicle · AI 叙事游戏 · RAG 游戏 · 组织经营 · 世界推演 · 互动叙事。

## 特性

- **全 AI 叙事**：对话、推演、小说章节全部由大模型生成，必须配置 API Key
- **议桌集会**：地图与文书集成在一张议会桌上，点击纸张打开述职、议题、
  自由讨论与决议
- **城市地图**：贝克兰德分区钻取、图层筛选、动态世界投射、历史回放
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

原著设定知识库（`app/generated-lore-compendium.ts`）**不随开源仓库分发**，
公共构建使用空壳占位，游戏仍可运行但不含原著专属知识。

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

支持当前 schema（v15）下缺少 `knowledgeHorizon` 字段的早期存档自动补
保守默认（第一卷边界）；缺少动态记忆（`memory`）字段的早期存档同样补空
安全默认。不承诺自动迁移其他历史 schema 的存档；读取不兼容 schema 的
存档会明确报错而不是静默改写。

动态记忆系统详见 [docs/memory.md](./docs/memory.md)。

## 桌面版打包

```powershell
npm run build
npm run dist:win
```

产物：`release/灰雾纪事-Setup-<version>.exe`（NSIS 安装包，未签名，
分发时请保留 LICENSE 与 NOTICE）。

## 测试与 QA

```powershell
npm run lint
npm test
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
  council-ai.ts       # AI 调用与上下文组装
  weekly-council.tsx  # 议会页
  city-map-workspace.tsx # 城市地图
electron/             # Electron 桌面壳
scripts/              # 启动器、QA 与工具脚本
private/              # 私有设定（gitignored，维护者持有）
tests/                # 自动化测试
```

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可

代码以 [MIT](./LICENSE) 许可证发布。游戏内容与原著设定见 [NOTICE](./NOTICE)。
