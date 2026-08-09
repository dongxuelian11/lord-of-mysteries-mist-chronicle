# 世界账本 V2：事件归约、兼容迁移与历史分支

状态：实现规范（v0.4.0 修复阶段）

## 目标

世界账本 V2 把事件流恢复为权威事实来源。快照只用于加速和校验；删除全部快照后，账本仍必须能从第一个事件重建相同投影。

## Envelope 与完整性链

每个 V2 事件包含：

- `schemaVersion: 1`：事件载荷 schema 版本；
- `branchId`：事件所属分支；
- `sequence`：分支内严格递增序号；
- `prevHash`：前一事件哈希，首事件为 `null`；
- `hash`：对除 `hash` 外的规范化事件 envelope 计算的稳定校验值；
- `id/week/phase/kind/summary/actorIds/factionIds/witnessRefs/causeEventIds/audience/payload`：业务字段。

校验必须检查序号、重复 ID、因果引用、branchId、`prevHash` 和事件自身哈希。修改历史事件或重排事件都会破坏链。

## 权威事件与 reducer

- `ledger-initialized`：分支的初始投影；只在根账本创建或分支派生时出现一次。
- `projection-patched`：对投影应用结构化增量。资源使用字段级变更；成员、势力、战略点、自治主体、关系和势力策略使用 upsert/remove；世界事件和知识使用 add/remove。新周不得依赖完整 projection 替换。
- `action-proposed`：新增或更新 action record 的 proposed 状态。
- `action-reviewed`：把 action record 更新为 accepted/rejected 及理由。
- `action-resolved`：记录 outcome，并将 action record 更新为 resolved。
- `world-event-recorded`：把事件 ID 加入 `worldEventIds`。
- `knowledge-delivered`：把知识 ID 加入 `knowledgeIds`。
- `phase-completed`：记录周阶段完成状态。
- `compensation-applied`：应用显式 inverse patch，并通过 `compensatesEventIds` 指向被补偿事件。历史事件不删除、不改写。
- `week-committed`：只声明本周提交并携带预期 checksum；不再携带完整 projection。reducer 更新 week/date 和提交标记。

## 快照

快照保存某一 `afterSequence` 的投影及 checksum。重放可以从已通过 checksum 校验的最近快照开始，也必须支持 `useSnapshots: false` 从零归约。验证会比较从零重放、快照加速重放和最新快照。

快照不是每周事实副本。当前策略每隔 4 周生成一个检查点，最多保留最近 6 个完整快照；超出上限的检查点只累计到 `snapshotArchive` 元数据（数量、截止周、截止 sequence、最后 checksum）。所有权威事件和 hash chain 均保留，因此被淘汰快照覆盖的早期周仍可从 `ledger-initialized` 与事件流精确重放。加载已有 V2 存档时也会应用相同保留上限。

## 截止重放

`replayWorldLedger` 支持：

- `throughSequence`：包含该 sequence 及以前的事件；
- `throughWeek`：只包含该 week 及以前的事件；
- `useSnapshots`：是否允许快照加速。

旧的数字第二参数继续解释为 `throughSequence`。

## 分支与反事实

`createWorldLedgerBranch(parent, atSequence, branchId)` 先验证父账本，再重放到指定 sequence，以得到的投影创建新的独立 V2 账本。新账本记录 `parentBranchId`、`forkedAtSequence`、`forkedFromChecksum`；父账本不修改。分支拥有自己的 sequence 和哈希链。

`runWorldLedgerCounterfactual` 在派生分支上追加调用方提供的合法事件并返回分支与投影。反事实结果不写回父分支。

## V1 兼容迁移

V1 读取路径不会丢弃旧事件：

1. 选择 sequence 0 快照或可用的最早权威 projection 作为 `ledger-initialized`；
2. 保留并重新封装旧的 proposal/review/outcome/world/knowledge/phase 事件；
3. 对每个旧 `week-committed.payload.projection` 与当前归约状态计算结构化 patch，再追加 V2 `projection-patched` 与不含 projection 的 `week-committed`；
4. 重新建立 V2 哈希链和快照；
5. 若没有可恢复的旧投影，可用当前存档状态作为初始化兜底，并记录 migration 元数据。

迁移是确定性的；同一 V1 输入必须产生相同业务投影。旧账本仍可读取，但所有新写入使用 V2。

## 撤销语义

撤销不是删除事件，也不是移动 sequence。调用方必须追加 `compensation-applied`，明确提供 inverse patch、理由和被补偿事件 ID。无法构造可靠 inverse patch 时拒绝撤销，避免伪造“回到过去”。

## UI 术语

改变途径并调用 `createInitialGame` 是“开始全新游戏”，不是账本分支。只有从现有账本指定 sequence 派生的新 V2 ledger 才称为“历史分支”。
