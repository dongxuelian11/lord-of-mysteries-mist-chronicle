# PR5 · 发布证据契约

PR5 把“完成”“未运行”“不可用”和“被阻塞”保持为可审计的机器状态。它不创造新的安装包或 seed 证据，只防止发布记录把本机、适配器或历史结果误写成更高等级的证明。

## 证据文件

证据文件是一个 JSON 文档，至少包含：

```json
{
  "schemaVersion": 1,
  "application": "lord-of-mysteries-mist-chronicle",
  "generatedAt": "2026-08-22T00:00:00.000Z",
  "source": {
    "commit": "<当前提交 SHA>",
    "branch": "<分支或 DETACHED>",
    "worktreeStatus": "clean"
  },
  "claims": [
    {
      "id": "pr4.electron-persistence-lifecycle",
      "status": "PASS",
      "evidenceLevel": "local-electron",
      "summary": "真实 Electron renderer → IPC → SQLite 写入、退出、重启读回。",
      "observedAt": "2026-08-22T00:00:00.000Z",
      "evidence": [
        { "type": "command", "value": "npm run release:persistence:lifecycle" }
      ]
    },
    {
      "id": "pr3.packaged-persistence-startup",
      "status": "BLOCKED",
      "evidenceLevel": "packaged",
      "summary": "安装包启动证据尚未取得。",
      "observedAt": "2026-08-22T00:00:00.000Z",
      "reason": "authorized knowledge seed is unavailable"
    }
  ]
}
```

允许的状态为 `PASS`、`NOT_RUN`、`NOT_AVAILABLE`、`PENDING`、`BLOCKED`、`DEFERRED`。`PASS` 必须至少有一条证据；其他状态必须给出非空 `reason`。允许的证据等级为 `local`、`local-electron`、`packaged`、`clean-machine`、`production` 和 `human`。

`artifact` 证据必须使用仓库相对路径、64 位 SHA-256，并由校验器重新读取文件比对；路径穿越、绝对路径、缺文件或 hash 不匹配都会失败。`--match-head` 会再把 `source.commit` 与当前 Git HEAD 比对。

## 校验

```powershell
node scripts/release/verify-evidence.mjs .runtime/release-evidence.json
node scripts/release/verify-evidence.mjs .runtime/release-evidence.json --match-head
```

PR4 的本机结果可以作为 `local-electron` claim；它不能替代 `packaged`、`clean-machine`、`production` 或 `human` 证据。当前 PR3 因授权 seed 缺失仍应记录为 `BLOCKED`/`NOT_RUN`，不能用空知识库、源码生成物或 adapter-only 结果填充。
