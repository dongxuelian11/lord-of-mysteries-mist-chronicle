# 正式发布

正式 Windows 版本采用 `v<package.json version>` tag 触发。当前发布线为
`0.3.x`，tag、源码提交、安装包 SHA-256 与知识 seed build ID 会同时写入
`release/provenance.json`，避免版本标签与二进制来源脱节。

## Release 环境

在 GitHub 仓库创建名为 `release` 的 Environment，并配置以下 secrets：

- `WIN_CSC_LINK`：Electron Builder 支持的 Windows 代码签名证书位置或
  base64 内容；
- `WIN_CSC_KEY_PASSWORD`：证书密码；
- `KNOWLEDGE_SEED_URL`：仅供发布任务读取的授权 seed ZIP 地址；
- `KNOWLEDGE_SEED_SHA256`：上述 ZIP 的小写或大写 SHA-256。

seed ZIP 内必须且只能有一个 `seed-manifest.json` 所在目录；该目录内容会在
构建前由 `electron/knowledge-seed.cjs` 重新校验 schema、逐文件大小与 SHA-256。
原始 TXT、EPUB、仓库缓存与可执行文件不得进入 seed。

## 发布门禁

发布任务依次执行：版本/tag 校验、seed 下载与哈希校验、TypeScript、ESLint、
完整测试与构建、高危依赖审计、Electron Builder（显式 `--publish never`）、
Authenticode 验证、静默安装与首次启动 smoke test、provenance 生成和 GitHub
attestation。全部通过后才创建或更新 GitHub Release。

创建 tag 前先把版本改到唯一目标值并合入目标提交：

```powershell
npm run typecheck
npm run lint
npm test
npm run bundle:budget
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
git tag "v$version"
git push origin "v$version"
```

不要复用或强制移动已发布 tag。需要修复时递增 patch 版本并生成新的安装包。
