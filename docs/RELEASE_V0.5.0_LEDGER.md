# v0.5.0 发布账本

更新时间：2026-08-25

## 固定授权与边界

- `VERSION=0.5.0`
- `RELEASE_MODE=UNSIGNED_PRERELEASE_EVIDENCE_ONLY`
- `AUTHENTICODE_SIGNATURE=NOT_RUN`
- `EXPECTED_INSTALLER_SIGNATURE_STATUS=NotSigned`
- `KNOWLEDGE_PROVENANCE=generated/C-grade`
- `CANONICAL_ORIGINAL_LORE_CLAIM=PROHIBITED`
- `PRODUCTION_EVIDENCE=NOT_AVAILABLE`
- `HUMAN_LONG_PLAY_EVIDENCE=NOT_AVAILABLE`

未提供生产代码签名证书，因此不得生成自签名证书、不得把 `NotSigned` 写成签名通过，
不得把 GitHub Prerelease 写成 production。用户已明确授权本次只做未签名预发布证据。

## 发布准备锚点

- `RELEASE_PREP_BASE=a9f0a41527c3620d4bd87f11a2a5ba4548ca0a8f`
- `RELEASE_PREP_BRANCH=codex/release-v0.5.0`
- `RELEASE_PREP_PR=PENDING`
- `RELEASE_PREP_CI=PENDING`
- `RELEASE_EXACT_MAIN=PENDING`
- `RELEASE_TAG=v0.5.0 (PENDING)`
- `RELEASE_WORKFLOW_RUN=PENDING`
- `CLEAN_MACHINE_JOB_B=NOT_RUN`
- `EVIDENCE_VERIFY_JOB_C=NOT_RUN`
- `PUBLIC_RELEASE=PENDING`
- `PUBLIC_DOWNLOAD_HASH_VERIFICATION=NOT_RUN`
- `LOCAL_RELEASE_PREP_GATES=PASS`
- `LOCAL_FULL_TEST=575 total / 569 pass / 6 skipped / 0 fail`
- `LOCAL_COVERAGE=14 sources / 8,921 counters / 35.67% statements / 24.02% branches / 28.67% functions / 41.02% lines`
- `LOCAL_NLP_STRICT=160/160 PASS`
- `LOCAL_LEAK_STRICT=120/120 PASS`
- `LOCAL_SOURCE_REVIEW=CLEAN_AFTER_FIXING_CHANGELOG_HISTORY_AND_LEDGER_ORDER`

`v0.4.0` 已指向旧提交，禁止复用、移动或强推。`v0.5.0` 只能在发布准备 PR
通过 CI/审核并锁头合并后，创建在当时的精确 `origin/main` 上。

## 独立证据契约

1. Job A 从 `v0.5.0` 对应的 exact-main 构建，验证授权 seed、源码门禁、
   `NotSigned` 状态、同机 smoke、provenance、installer SHA-256 与 bytes。
2. Job B 使用新的 Windows hosted runner；不得 checkout、setup Node 或执行 npm/pip
   install；必须按 immutable artifact ID 传输并重新验证同一 installer。
3. Job C checkout 精确 source commit，在与证据目录分离的 Git root 中验证 Job B manifest。
4. publish 只能消费 Job B 已验证的 artifact ID，并强制 GitHub Release 为 Prerelease。
5. 发布后必须重新下载公开 installer、provenance 与 clean-machine evidence，独立计算
   SHA-256，并证明公开 installer 与 Job B 验证字节完全相同。

## D 盘与工作树保护

- 项目、运行时、缓存、安装 smoke 和证据根必须在 D 盘。
- `.qa-prodserver3.err.log` 与 `.qa-prodserver3.out.log` 是既有未跟踪用户文件；不得读取、
  修改、移动、删除或提交。
- 所有暂存必须使用显式文件列表，禁止 `git add -A`。

## 当前下一动作

`CURRENT_NEXT_ACTION=COMMIT_AND_PUSH_RELEASE_PREP_BRANCH`

使用显式文件列表提交发布准备变更，保护两个未跟踪 QA 日志；推送后创建新 PR，
重新锁定精确 head，并等待 Ubuntu/Windows required CI 与远端源码审核。
