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
| 本轮实际 Windows 安装包构建/安装运行 | `PASS`：用户明确授权 D 盘 C-grade seed；Electron 43.3.0 / NSIS 0.4.0 构建、静默安装、首次启动与 SQLite/WAL schema 冒烟均通过 |
| 本机授权 seed 输入 | `PASS / C-grade`：`D:\gmzz\.runtime\authorized-cgrade-seed`，来源为授权的 `app/generated-lore-compendium.ts` 加项目文档切片；`buildId=2026-08-24T16:41:12.965Z|04386697b5c6` |
| clean-machine、跨设备、升级迁移、生产可用性 | `NOT_AVAILABLE` |
| renderer 真实保存后再重启恢复 | 不由本 PR3 启动 probe 宣称；仍属于 PR2 本机测试边界 |
| renderer UI 真实窗口 QA | `BLOCKED_BY_HOST_GPU_VIRTUALIZATION`：安装器可安装且 Main/server smoke 通过，但本机 Playwright renderer target 崩溃 |
| 安装包签名 | `NOT_SIGNED`：本机无代码签名证书；只能作为明确标注的 unsigned prerelease candidate |
| 真人 5–20 小时证据 | 外部依赖，`NOT_AVAILABLE` |

`GMZZ_READY`、seed 文件和 SQLite schema 三项同时成立，才允许 installer smoke 报告通过。数据库探针失败时脚本以非零退出，不得用服务器 ready 或直接 adapter 证据替代。

## 验收门

1. `node --test tests/release-persistence-smoke.test.mjs`：3/3 通过。
2. `npm.cmd run typecheck`、`npm.cmd run lint`、D 盘串行全量测试（571 中 565 通过、6 跳过、0 失败）、`npm.cmd run bundle:budget` 和 `git diff --check` 通过。
3. `node --check scripts/release/verify-persistence-db.mjs` 与 PowerShell parse 均通过。
4. `npm.cmd run electron:build` 使用锁定 Electron 43.3.0 生成 NSIS；`npm.cmd run release:provenance` 绑定最终安装器 SHA-256；`npm.cmd run release:smoke` 通过 `GMZZ_READY`、seed 部署和 SQLite/WAL schema。签名、clean-machine、production、人类长线和 renderer UI 仍按上表保持较低证据等级。

## 当前阻塞

本机受控 C-grade candidate 的 seed、构建、安装和 server/SQLite smoke 已完成；这不等于 canonical lore、签名正式发布或独立环境可用。当前仍阻塞在代码签名证书、宿主机 GPU/虚拟化导致的 renderer UI QA，以及 clean-machine、production 和真人长线证据。`app/generated-lore-compendium.ts` 当前是公开占位文件（`LORE_RECORDS=0`），因此本包不得标记为原著 canonical 知识库。

用户已明确授权此 C-grade 例外；未授权时仍必须保持旧规则：不得从生成 lore、空壳知识库或未核验目录重建 seed 来绕过发布门禁。

## 后续

PR3 完成后，PR4 另行定义。下一阶段若要提高证据等级，应单独设计真实安装包下的 renderer 保存—退出—重启恢复测试，并明确 clean-machine 资源与可重复性；不得把它混入本 PR3 的启动 schema probe。
