# 正式发布

正式 Windows 版本采用 `v<package.json version>` tag 触发。当前发布线为
`0.4.x`，tag、源码提交、安装包 SHA-256 与知识 seed build ID 会同时写入
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

### 本机受控 C-grade 构建说明

本轮由项目负责人明确授权 `D:\gmzz\app\generated-lore-compendium.ts` 作为
本版本知识源，并接受 `generated/C-grade` provenance。该文件当前是公开占位版，
`LORE_RECORDS` 为 0；本机 seed 因而只包含占位 compendium 加项目自有文档切片，
不能标记为原著 canonical 知识库，也不能替代正式发布所需的官方 seed ZIP。
构建产物可以作为本机 C-grade unsigned prerelease candidate，正式签名发布仍需
代码签名证书和独立 clean-machine/production/human evidence。
本次工作树仍为 `DIRTY_UNCOMMITTED`，所以 `release/provenance.json` 中的
`sourceCommit` 仅是 HEAD 锚点，不代表 clean exact-main 或正式 tag 证明。

## 本机受控 seed 资格验证

本机不会根据 URL 自动下载 seed，也不会在没有明确授权时从生成的 lore 或空壳
索引重建 seed。若负责人已明确授权一个本地 C-grade 来源，或已有合法授权 seed
目录，可在 D 盘设置绝对路径：

```powershell
$env:GMZZ_STORAGE_ROOT = 'D:\gmzz\.runtime'
$env:GMZZ_REQUIRE_D_DRIVE = '1'
$env:KNOWLEDGE_SEED_DIR = 'D:\authorized\mist-chronicle-seed'
npm run release:verify:seed
```

`KNOWLEDGE_SEED_DIR` 存在时，验证器不会回退到仓库目录；它先校验来源
manifest 与逐文件哈希，再把 manifest 声明的文件暂存到
`<GMZZ_STORAGE_ROOT>\release-seed`。Windows 下来源和运行目录必须解析到 D 盘，
路径非法、seed 缺失或哈希不匹配都会保持 fail-closed。CI 的 URL/SHA 下载仍只
由受保护的 release workflow 执行。

## 发布门禁

发布任务依次执行：版本/tag 校验、seed 下载与哈希校验、TypeScript、ESLint、
完整测试与构建、高危依赖审计、Electron Builder（显式 `--publish never`）、
Authenticode 验证、静默安装与首次启动 smoke test、provenance 生成和 GitHub
attestation。全部通过后才创建或更新 GitHub Release。

正式 tag 推送始终要求有效的 Authenticode 证书。需要先向测试者提供安装包、但
暂时没有证书时，只能从 Actions 手动运行 `release.yml`，填写已经存在的 tag，
并显式启用 `unsigned_prerelease`。该模式会验证安装包确实未签名，并强制把
GitHub Release 保持为 Prerelease；它不会改变普通 tag 推送的签名门禁。

```powershell
gh workflow run release.yml --ref main `
  -f release_tag=v0.4.0 `
  -f unsigned_prerelease=true
```

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
