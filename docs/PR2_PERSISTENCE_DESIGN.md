# PR2 持久化边界设计记录

状态：2026-08-22，本地设计与第一条 integrity slice 已完成；SQLite runtime、Main Process gateway 和生产迁移尚未开始。

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

## 下一条 SQLite WAL driver 的契约（尚未实现）

1. driver 只实现现有 authority port，不把 SQL 类型泄漏到 `game-session-controller` 或 UI。
2. active save 与 recovery checkpoint 使用明确的记录类型、schema version、payload、checksum 和写入时间；单次保存必须在一个 SQLite 事务内完成，WAL 只解决本地崩溃恢复与读写隔离，不改变世界事务语义。
3. 读取先验证记录格式、checksum 和迁移版本，再交给现有 `migrateStoredGame`；任何不通过的记录都 fail closed，不能把半解析对象送进游戏状态。
4. 从当前 localStorage/raw v21 与 v20 旧键迁移必须是一次性、可重试、可审计的 additive migration；迁移失败不得删除唯一可恢复源。
5. 恢复优先级必须显式记录：当前存档缺失时才允许使用兼容旧键或有效 checkpoint；当前存档存在但损坏时，保持现有语义，不静默跳过损坏源改用旧档。
6. driver 不提供回档、重掷、历史重写或跨机器同步 API；这些都超出本 PR2 范围。

## 失败测试顺序

后续按单一垂直切片推进，每条先 RED 再 GREEN：

1. SQLite driver 未安装时，纯 port contract 仍可用内存 store 验证读/写/清边界。
2. checksum 不匹配、未知 schema、截断 payload、重复 active 记录均拒绝且不改变已加载游戏。
3. v20/v21 raw save 的迁移只执行一次；重试产生相同 normalized game，不删除源记录。
4. WAL 事务中断前后只出现旧记录或完整新记录，不出现半写 payload；该条需要 driver 与受控故障夹具后才实现。
5. checkpoint 数量上限、旧 checkpoint 回退和损坏 checkpoint 隔离；不能把 checkpoint 当成新的世界事实来源。

## 证据上限

当前只证明纯 adapter、checksum helper、现有 SaveEnvelope 回归和 localStorage 行为保持不变。它们不证明 SQLite 已接入、不证明 Electron clean-machine 行为、不证明跨设备恢复，也不替代真人 5–20 小时体验证据。
