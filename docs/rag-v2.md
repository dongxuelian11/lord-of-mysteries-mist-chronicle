# RAG V2 · 本地优先混合检索（规模硬化版）

《灰雾纪事》的知识检索层从“静态 `LoreRecord[]` + 关键词/双字词计分”升级为
可导入大型语料、本地优先、权限安全的混合 RAG。游戏逻辑运行在浏览器端，
完整索引**不进入渲染 Bundle**；规模硬化后检索迁移到 Electron 主进程的
RAG Worker 中执行。

## 运行架构

```text
Electron Renderer
   │ typed IPC（window.mistRag，schema 校验）
   ▼
Electron Main（ipcMain，权限与请求再校验）
   │ utilityProcess MessagePort
   ▼
RAG Worker（Node，纯 JS 检索实现）
   └─ 读取 userData/rag/index（JSON 侧车索引，原子替换）
```

渲染端只拿到最终选中的切片；Worker 不暴露任意 SQL 或“按 id 读取任意切片”
的通用接口；返回结果在渲染端再次应用可见性边界。没有 Worker/索引时自动
回退旧版同步检索（浏览器开发模式与公共空壳均可用）。

## 数据流

```text
private/rag/sources.manifest.json
  └─ ingest（解析 → 清洗 → 切片 → hash 去重/近重复去重 → 增量合并）
       └─ private/rag/index/*.json（chunks / documents / inverted / alias-map / vectors）
            └─ rag:export → userData/rag/index（原子替换，供 Electron RAG Worker）
                 └─ Electron Main ↔ Renderer 的 typed IPC 桥
                      └─ council-ai / ability-system / game-engine 异步调用点
```

没有 `private/rag/index` 或未导出到用户目录时，Worker 报告不可用，渲染端
自动回退旧版同步检索（兼容旧语料与空公共知识库）。

## 统一知识模型

`app/rag/types.ts` 定义 `LoreDocument` / `LoreChunk`，覆盖：来源（仓库、
commit、路径、定位符）、语言、`canonLayer`（canon/community/fan-derived/
game-original/disputed）、`sourceGrade`、可见性（public/restricted/secret/
cosmic）、剧透范围（none/volume1/volume2/all）、时间线（from/to/week/
volume/era）、主题、实体、别名、关系、前后切片指针、内容 hash。

旧版 `LoreRecord` 通过 `scripts/rag/lib/convert-legacy.mjs` 转为切片，
游戏内 `retrieveLoreContext` 保持旧签名，异步路径由
`app/rag/client.ts`（`retrieveLoreContextAsync`）提供。

## 语料导入（`npm run rag:ingest`）

- 清单：`private/rag/sources.manifest.json`（首次运行自动从
  `scripts/rag/sources.manifest.example.json` 复制，可编辑）。
- 来源类型：`local`、`git`（clone/update，记录 commit SHA，支持稀疏克隆）、
  `compendium`（旧版知识库）。
- 格式：TXT、Markdown、JSON、JSONL、YAML、HTML、EPUB、PDF、ASS 字幕、Git 目录。
- 切片：小说按卷/章/自然段，Wiki 按一级标题拆文档再分层，结构化条目整体保留。
- 增量：按文件 hash 与 commit 指纹跳过未变化内容；精确 hash 全局去重，
  近重复（4-gram Jaccard）源内折叠。
- 每个来源输出明确状态：INGESTED / DISABLED / CLONE_FAILED / PARSE_FAILED /
  EMPTY_AFTER_FILTER / SOURCE_FETCH_NOT_RUN；外部仓库拉取失败不阻断其他来源。

## 检索流程

1. 查询标准化与中文双字词分词
2. 别名展开（领域基线表 + 索引别名表，相关实体最多 4 个）
3. 实体识别与意图分类（身份/经历/关系/途径/组织/地点/封印物/时间线/世界真值，
   确定性规则，无 LLM 依赖）
4. 权限 + 剧透 + canonLayer + 时间线预过滤
5. BM25 风格词法检索（倒排索引 + 字段加权）
6. 可选向量检索（构建期预计算，运行时本地余弦）
7. RRF + 归一化分数融合
8. 精确实体/标题/结构化优先的意图加权
9. 同文档去重、hash 去重、邻居/父级扩展（再过权限）
10. 字符预算裁剪

TS 运行时（渲染端回退）与 JS Worker 实现由
`tests/rag-parity.test.mjs` 锁定完全一致。

## 权限与叙述者拆分

`app/rag/permissions.ts` / `scripts/rag/lib/search.mjs` 是唯一过滤出口，
支持四种检索主体：

- `world-simulation-internal`：后台世界结算，输出不直接展示给玩家
- `player-facing-narrator`：只使用玩家可见信息，默认剧透边界 volume1
- `player-known`：玩家已获得的知识
- `actor-private`：每个角色独立检索，不得串知识

`cosmic` 默认不可见；未来周目、第二部剧透、未授权秘密在任何扩展路径
（别名、邻居、rerank）下都不可绕过。被拒内容只记录 id 与原因，不写标题/
正文/别名进日志或调试界面。

## 上下文组装

`context-builder.ts` 生成结构化上下文包：检索目的、角色、证据切片、
来源标识、证据等级、冲突资料、未知项、禁止推断项、预算。同一实体的
canon/community/fan 冲突以“支持版本 + 冲突版本 + 来源层级 + 不确定性”
并列输出，不静默融合；资料不足时显式告知“角色不知道 / 不得补写事实”。

## 评测

- `npm run rag:eval`：小型固定夹具（新旧检索对比）。
- `npm run rag:eval:full`：112 条完整评测（别名/途径/组织/地点/封印物/时间线/
  冲突/权限/对抗泄漏），当前结果 Recall@5=0.969、Recall@10=0.978、
  MRR@10=0.798、citation=1.000、duplicate=0、全部泄漏=0。
- 硬指标：unauthorized/cosmic/future/forbidden-alias leakage=0、
  citation≥0.90、dup≤0.03、Recall@10≥0.90、MRR@10 目标≥0.65。

## 压测与长线

- `npm run rag:benchmark`：1k/5k/10k 合成 + 真实语料的索引大小、构建/加载时间、
  P50/P95/P99、内存、1000 次查询内存变化。
- `npm run rag:longrun`：确定性 mock 下 20/50 周完整世界回合，校验存档
  可序列化/恢复、上下文有界、知识/事件线性增长、恢复后继续推进。
- `npm run rag:audit`：索引/Bundle/构建/冷启动/检索延迟/迁移触发审计。

## 状态与导出

- `npm run rag:status`：清单、索引、可见性/分层统计、各源状态。
- `npm run rag:export`：把 `private/rag/index` 原子导出到 Electron 用户目录
  （`%APPDATA%/灰雾纪事` 与 `%APPDATA%/mist-chronicle-prototype` 均写入）。
- `predev` / `prebuild` / `prestart` 自动执行 prepare-lore。

## 中文原著语料（zh-lotm-txt）

- 来源：`private/rag/sources/canon-zh/lotm/诡秘之主-精校版全本.txt`
  （vdisk 精校 TXT，`sourceProvenance=third-party-mirror`，不做官方导出伪装）。
  备选 `诡秘之主.epub`（wxnacy/book 镜像）仅用于交叉校验，不进入默认索引。
- 校验：`node scripts/rag/validate-zh.mjs` 输出
  `private/rag/reports/zh-validation.json`。TXT：1300 章 / 唯一 1258 章 / 7 卷、
  重复 42、短章 0、广告 0、缺章 0；EPUB：重复 480、广告 149、短章 8，落选主版本。
- 交叉校验：按规范化标题对齐 623 章，平均正文相似度 0.895，差异较大章节 20 条
  单独列入异常报告；因此主版本 `textIntegrity=verified-against-secondary`。
- 入库：manifest `zh-lotm-txt`（kind=local、zhNovel=true、
  canonLayer=canon-primary、language=zh-CN、sourceGrade=A），每章切片，
  共 3130 切片，切片带 volumeNumber/chapterNumber/spoilerScope。
- 中英对齐：`npm run rag:align:chapters` 输出
  `private/rag/index/chapter-alignments.json`——中文 1258 章 ↔ 英文 1430 章，
  最佳偏移 0，zh/en 对齐 1258/1258，未对齐 zh=0 / en=243，平均置信度 0.95，
  各卷对齐率 1.0；英文语料仅取 `chapters/lotm/`（Book 1），排除同源 COI
  （第二部，章号从 1 重排），因此多候选章号=0。英文 web 版 1501 个编号中
  未对齐的 243 章为中英文版本章节切分差异（番外/合并），未做标题/内容
  相似度交叉，按绝对章号直连。
- 中文评测：`npm run rag:eval:zh`（150 条盲测 × 8 配置；召回口径与冻结盲测一致，
  仅统计 116 条有预期实体的用例）：zh-only R@10=0.914、mixed R@10=0.905、
  en-old R@10=0.596；canonP≥0.956、zhHit≥0.953、泄漏=0。
- 默认检索层级：普通玩家/叙述者默认
  `canon-primary + canon + official-reference + canon-adaptation +
  community-reference + community`；fan-derived/game-original 仅当查询显式提到
  Mod/MUD/跑团/同人/游戏机制，或请求参数 `includeFanDerived=true` 时启用。

## 本机完整语料

```powershell
# 1. 编辑 private/rag/sources.manifest.json（启用需要的 Git 源或本地路径）
# 2. 导入并重建索引（可选 --embed 启用向量）
npm run rag:ingest
# 2.5 中文双源校验 / 中英章节对齐 / 中文评测
node scripts/rag/validate-zh.mjs
npm run rag:align:chapters
npm run rag:eval:zh
# 3. 状态 / 审计 / 评测 / 压测 / 长线
npm run rag:status
npm run rag:audit
npm run rag:eval
npm run rag:eval:full
npm run rag:eval:blind
npm run rag:game:verify
npm run rag:benchmark
npm run rag:longrun
# 4. 导出运行索引到 Electron 用户目录（桌面版生效）
npm run rag:export
```

`private/` 被 Git 忽略；不要把原始正文、API Key 或生成期索引提交到公共仓库。
维护者确认有权分发的正式安装包包含经过 manifest 与逐文件 SHA-256 校验的
运行索引 seed；源码构建未提供 seed 时从用户目录加载并回退到公共空壳。

## 已知边界

- 运行索引为 JSON 侧车文件（10k 切片约 35MB），由主进程 Worker 加载；
  语料达到数百万字时可改为分片懒加载。
- embedding 服务未配置时自动降级 lexical-only（报告
  `EMBEDDING_RUNTIME_NOT_CONFIGURED`），不阻塞其他能力。
- PDF/EPUB 解析依赖可选依赖（pdf-parse/jszip），缺失时对应源报告跳过。
- LLM rerank 接口已预留（`reranker.ts`），默认关闭，失败自动回退。
- 冻结盲测/中文评测按“检索质量”口径运行（`maxSpoilerScope=all`），
  卷章剧透门由 `rag:spoiler:eval` 与游戏内 horizon 强制执行；章节切片
  的 `timeline.week` 仍未按周细化（周级过滤对小说正文不生效，卷章级已生效）。

## 卷章级防剧透（Alpha 闭合）

- 新增 `CanonKnowledgeHorizon`：每个存档/请求携带 `work`、`maxVolume`、
  `maxAbsoluteChapter`、`allowedEventIds`、`revealedIdentityIds`、
  `worldlineMode`；旧存档在 `parseSaveEnvelope` 中安全迁移为保守默认
  （第一卷边界，已揭晓：周明瑞、夏洛克·莫里亚蒂）。
- 中英文小说切片补全元数据：`work`、`volumeNumber`、`volumeTitle`、
  `chapterNumberWithinVolume`、`absoluteChapter`、`chapterTitle`、
  `sceneNumber`、`spoilerScope`、`timelineStage`、`identityIds`。
  中文 1258 章按实际 7 卷归属；英文按对齐继承卷边界，未对齐章节与 COI
  统一保守标记 `spoilerScope=all`。
- 参考切片按未来事件关键词（如“大雾霾”→卷 5）与身份全名做保守标记；
  旧版回退路径（RAG 桥失败）同样应用知识边界过滤。
- 四种检索主体：`player-facing-narrator`/`player-known`/`actor-private`
  严格受 horizon 限制；`world-simulation-internal` 可读更广背景但仍受
  `work` 边界约束，世界线偏离时上下文标记“原著后续仅为历史背景/可能趋势”。
- 验收：`npm run rag:spoiler:audit` + `npm run rag:spoiler:eval`
  （50 用例 / 373 条实际返回上下文抽查，全部泄漏=0）。

## Worker 内存稳态

- `npm run rag:memory:benchmark`：进程内 500 预热 + 5000 查询（10 批），
  每批强制 GC，记录 heapUsed/heapTotal/external/arrayBuffers/RSS。
- `npm run rag:memory:soak`：真实 Worker IPC 浸泡（560 条不同查询），
  外加 100 次启动/关闭、20 次 reload、20 次损坏索引回退、20 次非法 IPC、
  20 次退出终止。
- 实测：5000 次查询后 post-GC heapUsed 净增长 0~-1MB，RSS 斜率
  ≤4MB/1000q，Trace/缓存恒为 0（无界存储问题不存在），无 listener
  warning，无残留进程。

## 私有知识包

- `npm run rag:pack` 构建 `mist-chronicle-lore-pack-<日期>.mcrag`
  （zip：索引文件 + `pack-manifest.json`，含 schema、corpus 版本、来源
  清单摘要、逐文件 SHA-256，另有 `.sha256` 侧车）。
- `npm run rag:pack:verify`：校验 zip 完整性、schema、hash、路径穿越、
  未知条目。
- `npm run rag:pack:install -- <path>`：校验后原子写入用户数据目录，
  失败保留旧索引；不允许执行包内代码。
- `npm run rag:pack:status`：查看已安装索引与包清单。
- 干净安装四场景（无索引/有效包/损坏包/升级回滚）由
  `npm run rag:clean:install` 验证。

## 安装包内置知识库（seed）

- `npm run rag:seed:manifest` 生成 `seed-manifest.json`
  （formatVersion、indexSchemaVersion、corpusVersion、buildId、createdAt、
  sourceManifestDigest、seedVersion、minAppVersion、逐文件 SHA-256）；
- `electron-builder.yml` 把正式运行索引（meta/chunks/documents/inverted/
  alias-map + seed-manifest）打包到 `resources/knowledge/seed`；
- 主进程首次启动调用 `electron/knowledge-seed.cjs`：校验 manifest/schema/
  hash → 原子部署到用户数据目录 → 失败安全回退且下次可重试；
- 版本优先级：较新的用户 `.mcrag` 知识包 > 较新的安装包 seed > 较旧的
  用户索引；同版本跳过，seed 升级原子执行并可回滚；
- `npm run rag:seed:scenarios` 覆盖 A–F 六个隔离场景（首次安装/同版本/
  用户更新/seed 升级/损坏 seed/知识包升级）。

## 存档兼容范围

- 支持当前 schema（v15）下缺少 `knowledgeHorizon` 的早期存档：读取时
  补保守默认（第一卷边界，已揭晓周明瑞/夏洛克），不覆盖原文件；
- 不承诺迁移其他历史 schema；不兼容存档明确报错。

## Alpha 玩家式路线与窗口 QA

- `npm run rag:alpha:routes`：三条新存档 × 20 周（保守调查/激进行动/
  偏离原著），覆盖命令、对话、议会、调查、能力、失败行动、存档恢复、
  RAG 中断、知识包重载；偏离路线验证 `worldlineMode=diverging`。
- `node scripts/electron-ui-qa.mjs`：打包版实际窗口 QA（无索引启动、
  知识包安装后检索、存档继续/读档、退出无残留）；真实模型命令步骤在
  提供有效 `QA_KEY` 时执行，否则标记 `PENDING_USER_UAU`。
