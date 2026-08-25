# v0.5.0 最终发布账本

更新时间：2026-08-25（Asia/Shanghai）

## 最终结论

- `VERSION=0.5.0`
- `RELEASE_STATE=PUBLIC_PRERELEASE`
- `RELEASE_MODE=UNSIGNED_PRERELEASE_EVIDENCE_ONLY`
- `RELEASE_URL=https://github.com/dongxuelian11/lord-of-mysteries-mist-chronicle/releases/tag/v0.5.0`
- `PUBLISHED_AT=2026-08-25T05:15:14Z`
- `AUTHENTICODE_SIGNING=NOT_RUN`
- `INSTALLER_SIGNATURE_STATUS=NotSigned`
- `CLEAN_MACHINE_EVIDENCE=PASS`
- `SAME_BYTE_PUBLICATION=PASS`
- `PRODUCTION_EVIDENCE=NOT_AVAILABLE`
- `HUMAN_LONG_PLAY_EVIDENCE=NOT_AVAILABLE`

本版本没有正式代码签名证书。`NotSigned` 是被验证的预期状态，不是 Authenticode
签名成功。GitHub Prerelease 也不是 production deployment；不得把本账本升级解释为
“正式签名版”“生产可用证明”或“人类长线体验通过”。

## 精确源码与 PR 链

### 发布准备

- 发布准备 PR：`#6`，head `e24cce328f906286f0f733eea36e8fa5403acb79`
- PR #6 base：`a9f0a41527c3620d4bd87f11a2a5ba4548ca0a8f`
- PR #6 CI：run `32807010731`，Ubuntu/Windows required jobs 均 `SUCCESS`
- 锁头 squash 后 exact-main：`6c8c044b7b10f0266874f128d9d0a791ed537a8b`
- resulting-main CI：run `32807273613`，`SUCCESS`
- annotated tag：`v0.5.0`，tag object
  `d0cb11ed31517176edc66c1bd1f65548d7165223`，最终目标为上述 exact-main

### 发布工作流修复

- 发布应用源码始终为 `6c8c044b7b10f0266874f128d9d0a791ed537a8b`；后续修复没有移动 tag。
- 发布工作流最终定义 head：`627b75f0fa75aaa19b7a14c737c9d5dfa024f2ef`
- 自动化修复 PR：`#7`；最新头部 CI run `32811176718` 的 Ubuntu/Windows
  required jobs 均 `SUCCESS`。
- PR #7 于公开发布完成后锁头 squash 为 `c7f4109bf809c6ebe50339b3508605c9a142a535`。
  该提交唯一父提交为 `6c8c044...`，tree
  `76bf792915871fea60ee25efa000d5f5bb2930cd` 与 PR #7 head tree 完全相同。
- PR #7 resulting-main CI：run `32812215419`，Ubuntu job `97693594263`、
  Windows job `97693594079` 均 `SUCCESS`。

所以需要同时保留三个不同锚点：发布源码/tag 目标是 `6c8c044...`，成功运行使用的
workflow head 是 `627b75f...`，发布后当前自动化 main 是 `c7f4109...`。

## 授权知识源

- 用户授权源：`app/generated-lore-compendium.ts`
- provenance：`generated/C-grade`
- canonical original-lore claim：`PROHIBITED`
- seed ZIP：`authorized-generated-only-seed-v0.5.0.zip`
- seed ZIP bytes：`2671`
- seed ZIP SHA-256：`2ff30c92458755cf8c3e023588e356097c6fa72a6bbde141c6b3b63edf9957fc`
- seed buildId：`2026-08-25T04:12:45.657Z|3c88f7f524ab`
- source manifest digest：`67b6d36770a4d0cc09a302ea457a73d1c002281cedddd90812cdcbd7d31e4c03`

该 seed 只表示本版本获授权的公开占位知识输入，不是原著 canonical lore corpus。

## 成功发布运行

- workflow run：`32811488683`，event `workflow_dispatch`，conclusion `SUCCESS`
- workflow head：`627b75f0fa75aaa19b7a14c737c9d5dfa024f2ef`
- release tag/source gate：`v0.5.0` → `6c8c044b7b10f0266874f128d9d0a791ed537a8b`
- Job A `installer`：`97691520593`，`SUCCESS`
- Job B `clean-machine`：`97692488248`，`SUCCESS`
- Job C `evidence-verify`：`97692632822`，`SUCCESS`
- Job D `publish`：`97692725771`，`SUCCESS`
- Job A artifact ID：`9550040813`（`mist-chronicle-v0.5.0`）
- Job B artifact ID：`9550058379`（`clean-machine-evidence-v0.5.0`）

Job A 在最终构建边界重新校验并暂存授权 seed，完成 typecheck、lint、full test、
bundle budget、high audit gate、`NotSigned` 检查、安装 smoke、SQLite WAL/persistence、
provenance、artifact metadata 与 build attestation。Job B 只消费 immutable artifact ID；
Job C checkout 精确发布源码并验证 Job B evidence contract；Job D 只消费 Job B 已验证字节。

## 独立 clean-machine 证据

- claim：`release.clean-machine-installer=PASS`
- evidence level：`clean-machine`
- build machine：`runnervm6iq3x|GitHub Actions 1000000482|win25-vs2026`
- execution machine：`runnervm6iq3x|GitHub Actions 1000000483|win25-vs2026`
- distinct machine：`PASS`
- `sourceCheckout=ABSENT`
- `dependencyInstall=NOT_RUN`
- `artifactTransferVerified=true`
- transferred installer 启动、内置 seed 部署、SQLite WAL persistence qualification：`PASS`

Job B 没有 checkout、setup-node、npm install 或 pip install。其 manifest 由 Job C 在精确
source commit 上复验通过，因此不是同机 smoke 冒充 clean-machine。

## 制品与同字节证明

| 资产 | bytes | SHA-256 |
|---|---:|---|
| `Mist-Chronicle-Setup-0.5.0.exe` | 114186119 | `e11ec846e2a226882c08770613861f4d6d9ef5eadc6bccc42e0bb41ce81ee895` |
| `provenance.json` | 621 | `af629a5e2a8cd9a8aaa030be9ace368f09b3504b35bf6b072b404dc7b4c29dc0` |
| `clean-machine-evidence.json` | 1653 | `f2c97866dd97bae47275c4f7895ac199240bb650dd22dd47672b773b1b8eadac` |
| `authorized-generated-only-seed-v0.5.0.zip` | 2671 | `2ff30c92458755cf8c3e023588e356097c6fa72a6bbde141c6b3b63edf9957fc` |

核验顺序如下：

1. Job B 从 Job A immutable artifact ID 接收并验证 installer。
2. Publish 从 Job B immutable artifact ID 接收同一 installer/provenance/evidence。
3. Draft 资产下载到 `D:\gmzz\.runtime\draft-verification-v0.5.0-32811488683`，
   与 Job B artifact 逐文件比较，三项 bytes/hash 全部相同。
4. Release 公开后，不带 GitHub 身份令牌从公共 URL 下载全部四项到
   `D:\gmzz\.runtime\public-verification-v0.5.0-20260825T051514Z`；重新计算的
   bytes/SHA-256 与上表、Draft、Job B 和 GitHub asset digest 全部一致。
5. 公共 installer 再次由 Windows `Get-AuthenticodeSignature` 验证为 `NotSigned`；
   signer certificate 与 timestamp certificate 均不存在。

`SAME_BYTE_PUBLICATION=PASS` 只证明公开字节与独立验证字节一致，不等于正式签名或 production。

## 失败运行与闭环

以下运行均 fail-closed，且没有被当成成功证据：

- `32807635355`：seed ZIP 含运行状态目录，输入校验拒绝。
- `32808201270`：测试 fixture 清理了固定 release staging；修复为唯一 fixture root，并在
  最终构建边界重新校验/暂存 seed。
- `32808993731`：Draft asset 短时签名 URL 过期；成功运行前重新生成并安全写入环境 secret。
- `32809169263`、`32809868722`：artifact 下载默认增加名称子目录，Job B/Job C 读取扁平根失败；
  三个消费者均显式 `merge-multiple: true` 并增加回归断言。
- `32810676878`：checkout-free Publish 未显式指定 repository；所有 `gh release` 命令增加
  `--repo $GITHUB_REPOSITORY` 后由最终运行证明通过。

公开后 `KNOWLEDGE_SEED_URL` 已从短时 Draft URL 替换为 `v0.5.0` 公共资产稳定 URL。

## D 盘与工作树保护

- 项目、授权 seed、缓存、installer smoke、Draft/Job B/公共下载证据全部落在 D 盘。
- `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log` 始终作为既有本地未跟踪用户文件保护；
  未读取、未修改、未移动、未删除、未暂存。
- 所有 Git 暂存均使用显式文件列表，没有使用 `git add -A`。

## 剩余边界

- 正式 Authenticode 证书：`NOT_AVAILABLE`
- 正式 Authenticode 签名：`NOT_RUN`
- production deployment：`NOT_AVAILABLE / NOT_RUN`
- human long-play：`NOT_AVAILABLE / NOT_RUN`
- GitHub Actions 的 Node 20 action runtime deprecation 注解：`NON_BLOCKING_FOLLOW_UP`

若未来获得正式证书，应创建新的签名发布版本和新的独立证据链；不得原地把本次
`v0.5.0` unsigned prerelease 改写成已签名或 production 证据。

## 最终状态

`RELEASE_0_5_0_PLAN=COMPLETE_WITH_EXPLICIT_UNSIGNED_BOUNDARY`

本文件所在账本 PR 一旦按 required CI、源码审核与 locked-head 规则进入 main，最终账本发布
即同时完成；不为记录账本自身的 merge SHA 递归创建后续 PR。
