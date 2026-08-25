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
不能标记为原著 canonical 知识库。正式工作流使用由该授权来源制作、带完整 manifest
和 SHA-256 的受控 seed ZIP；准备过程不得反向改写已审核的 tracked compendium。
构建产物只有在 exact-main、签名和独立 clean-machine 门禁全部通过后才能升级为
正式发布候选；旧的 dirty/same-machine 安装包仍只属于本机证据。

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

发布工作流分成三个证据作业和一个发布作业：

1. Job A 只从当前 `origin/main` 对应的既有 tag 构建，要求 clean exact-main；校验
   seed、源码门禁、签名、同机 smoke、provenance 和 GitHub attestation，再用
   immutable artifact ID 输出安装包 SHA-256、bytes 与构建机身份。
2. Job B 是新的 Windows hosted runner，不 checkout、不 setup Node、不执行
   npm/pip install；它按 immutable artifact ID 接收 Job A 字节，核对 hash/bytes/
   provenance，在独立机器上静默安装和首次启动，并生成 `clean-machine-evidence.json`。
3. Job C checkout 精确 source commit，只验证 Job B 转交的证据目录和安装包字节；
   evidence root 与 Git checkout root 分离，禁止借本地 checkout 冒充转交产物。
4. `publish` 只能消费 Job B 已验证的同一 artifact。手动运行默认
   `publish_release=false`，只构建和取证；只有 tag push 或显式开启发布输入才创建/
   更新 GitHub Release。

Job A/Job B 的安装运行根必须解析到 D 盘，否则 smoke fail-closed。Job B 成功只能
证明 clean-machine，不自动升级为 production 或 human long-play evidence。

正式 tag 推送始终要求有效的 Authenticode 证书。需要先向测试者提供安装包、但
暂时没有证书时，只能从 Actions 手动运行 `release.yml`，填写已经存在的 tag，
并显式启用 `unsigned_prerelease`。该模式会验证安装包确实未签名，并强制把
GitHub Release 保持为 Prerelease；它不会改变普通 tag 推送的签名门禁。

```powershell
gh workflow run release.yml --ref main `
  -f release_tag=v0.4.0 `
  -f unsigned_prerelease=true `
  -f publish_release=false
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
