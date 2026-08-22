# PR2 持久化边界设计记录

状态：2026-08-22，PR2 持久化闭环已完成本地实现与验证；SQLite runtime 使用 Node/Electron 内置 `node:sqlite`，Main Process gateway、renderer authority 接线、迁移回退和 WAL 故障测试均已落地。跨设备、clean-machine 和真人长线证据仍未完成。

## 目标

把当前 renderer `localStorage` 存档路径逐步替换为可测试的持久化端口，同时保持已经完成的 Gate 0/PR1 事务、知识权限、无回档和旧档迁移语义。每一步都必须能在不引入 SQLite 的情况下由纯测试证明边界。

## 当前已落地端口

`app/persistence-authority.ts` 提供 storage-neutral `KeyValueStore` 与 `ActiveSaveAuthority`：

- `read()`：当前键优先；当前键缺失或空值时按声明顺序回退旧键。
- `write(raw)`：只写当前键。
- `clear()`：只清当前键。
- 当前键损坏由 session controller 清理；旧键损坏只结束迁移尝试，不清理旧数据。

这层不依赖 `window`，因此未来可以由 SQLite driver、测试内存 store 或受控 Electron gateway 实现。

`app/persistence-integrity.ts` 提供现有 FNV-1a 风格 JSON checksum 的纯实现。它只负责稳定序列化校验，不宣称密码学防篡改；`save-system.ts` 的 `SaveEnvelope` 已通过该边界生成和验证 checksum，格式与错误语义保持不变。

## SQLite WAL driver 与 Main gateway（PR2 已实现）

1. `electron/persistence-sqlite.cjs` 只实现现有 key-value authority port，不把 SQL 类型泄漏到 `game-session-controller` 或 UI。
2. active save 与 recovery checkpoint 使用明确的记录类型、schema version、payload、SHA-256 checksum 和写入时间；写入通过 SQLite transaction，数据库启用 WAL 与 `synchronous = FULL`。
3. `electron/persistence-ipc.cjs` 只接受 active/recovery 白名单键、有界 payload，并要求当前主窗口 WebContents 与当前动态 serverPort；preload 不暴露文件系统；SQLite 已打开后读写/传输错误不伪装成正常浏览器回退。
4. 读取先验证记录格式和 checksum，再交给现有 `migrateStoredGame`；损坏当前记录只清理当前记录，不静默改用旧键。
5. 空 SQLite 首次启动会读取兼容 localStorage/raw v21 或 v20 键，成功后由正常 active-save 写队列迁入 SQLite；迁移失败不删除唯一可恢复源；只有明确 runtime 不可用状态允许兼容回退，未知状态和 bridge 传输异常 fail-closed。
6. driver 不提供回档、重掷、历史重写或跨机器同步 API；这些都超出本 PR2 范围。

## 失败测试顺序

PR2 已按 RED→GREEN 完成以下边界：

1. SQLite driver 的内存/文件 store 读写、WAL metadata、payload checksum 和删除边界。
2. checksum 不匹配、unknown schema、截断 payload、IPC 非法键和不可信 sender 均 fail-closed。
3. v20/v21 raw save 的迁移确定性、source 不变、round-trip 再导入和空 SQLite 首次 localStorage 回退。
4. WAL transaction 中断后只出现旧记录或完整新记录，不出现半写 payload。
5. recovery checkpoint 数量上限、旧键回退和损坏当前记录隔离；checkpoint 不是新的世界事实来源。

## 证据上限

当前证明纯 adapter、checksum helper、SaveEnvelope 迁移、SQLite WAL driver、Main IPC sender/key 门禁、renderer authority/recovery 接线、异步状态防陈旧覆盖和本地故障夹具均通过；Codex 独立只读复审结论为 `CLEAN`。不证明跨设备恢复、clean-machine 安装矩阵、长时间 Electron 用户数据升级或真人 5–20 小时体验。PR2 也没有把 SQLite 证据提升为“生产可用”结论。
