# PR3 · Packaged desktop persistence qualification

## 目标

PR2 已经把持久化边界落到 Electron Main 进程的 SQLite/WAL store，但此前的安装包 smoke 只证明服务器 ready 和知识 seed 部署，没有证明首次启动真的创建了 PR2 所需的数据库结构。PR3 只补这一条可重复的启动资格链，不扩大产品权限，也不把启动资格误报成完整存档 E2E。

## 变更

- `scripts/release/smoke-installer.ps1` 每次使用唯一的临时安装根和 `GMZZ_USER_DATA`，在 `GMZZ_READY` 后检查 `mist-chronicle.sqlite` 是否创建，避免复用旧运行的 seed 或数据库。
- 新增 `scripts/release/verify-persistence-db.mjs`。它以 read-only 方式打开数据库，确认 `journal_mode=wal`、`persistence_records` 表及 PR2 的六个必要列；该 probe 不写入业务记录。
- 新增 `tests/release-persistence-smoke.test.mjs`，覆盖有效 WAL 数据库、缺失数据库 fail-closed，以及 installer smoke 的接线契约和唯一临时目录约束。

## 证据等级与边界

| 项目 | 本 PR3 状态 |
| --- | --- |
| 本机 verifier 对真实 PR2 SQLite 数据库的 read-only 检查 | `PASS`（新增测试 1/1） |
| installer smoke 脚本包含启动后 SQLite 资格检查 | `PASS`（静态契约 + PowerShell parse） |
| 本轮实际 Windows 安装包构建/安装运行 | `NOT_RUN`：`dist:win` 在 seed-manifest 校验处阻塞 |
| 本机授权 seed 输入 | `BLOCKED`：`KNOWLEDGE_SEED_URL`、`KNOWLEDGE_SEED_SHA256` 未设置，`private/rag/index` 不存在，受限 D 盘查找未发现 seed manifest |
| clean-machine、跨设备、升级迁移、生产可用性 | `NOT_AVAILABLE` |
| renderer 真实保存后再重启恢复 | 不由本 PR3 启动 probe 宣称；仍属于 PR2 本机测试边界 |
| 真人 5–20 小时证据 | 外部依赖，`NOT_AVAILABLE` |

`GMZZ_READY`、seed 文件和 SQLite schema 三项同时成立，才允许 installer smoke 报告通过。数据库探针失败时脚本以非零退出，不得用服务器 ready 或直接 adapter 证据替代。

## 验收门

1. `node --test tests/release-persistence-smoke.test.mjs`：3/3 通过。
2. `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`（372 中 367 通过、5 跳过、0 失败）、`npm.cmd run bundle:budget` 和 `git diff --check` 通过。
3. `node --check scripts/release/verify-persistence-db.mjs` 与 PowerShell parse 均通过。
4. `npm.cmd run dist:win` 未进入 electron-builder：`release:verify:seed` 报 `seed-manifest-missing`；因此 installer `release:smoke` 保持 `NOT_RUN`，不能写成 packaged runtime pass。

## 当前阻塞

PR3 的实现和本机门禁已经完成；继续取得真实 installer 证据只需要一个合法授权的 seed ZIP 及其 SHA-256。仓库发布流程由 `KNOWLEDGE_SEED_URL` / `KNOWLEDGE_SEED_SHA256` 注入该输入，随后才可执行 `release:verify:seed`、`dist:win` 和 `release:smoke`。不得从 `app/generated-lore-compendium.ts`、空壳知识库或未核验目录重建 seed 来绕过发布门禁。

## 后续

PR3 完成后，PR4 另行定义。下一阶段若要提高证据等级，应单独设计真实安装包下的 renderer 保存—退出—重启恢复测试，并明确 clean-machine 资源与可重复性；不得把它混入本 PR3 的启动 schema probe。
