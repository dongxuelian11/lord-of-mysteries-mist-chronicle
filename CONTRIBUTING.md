# 贡献指南

感谢你愿意参与《灰雾纪事》的开发。

## 流程

1. Fork 本仓库并创建特性分支（`codex/xxx` 或任意你习惯的前缀）。
2. 提交前运行：

   ```powershell
   npm run typecheck
   npm run lint
   npm test
   npm run bundle:budget
   ```

3. 通过 Pull Request 提交，说明改动动机与验证方式（附截图更好）。

## 红线

- **不要提交** `app/generated-lore-compendium.ts`。它是原著设定知识库，
  仅由维护者私有持有；仓库只保留空壳 `generated-lore-compendium.example.ts`。
- **不要提交** `private/rag/` 与 `app/rag/runtime-index.ts`。它们是
  语料、索引与生成文件，仅由维护者本地持有。
- **不要提交** `.env`、API Key 或任何凭据。
- **不要提交** `.gstack/`、`.openai/`、`private/` 等内部目录。
- 不要大段复制《诡秘之主》原文进入公共仓库；可以写原创的、基于设定的
  玩法与机制描述。

## 本地构建

```powershell
npm install
npm run build     # prebuild 会自动准备知识库（本地有 private/ 用完整版，否则用空壳）
npm run dev       # 打开开发服务器
npm run start     # 生产模式；prestart 会校正 Windows 下 vinext 静态资源路径
```

`postinstall` 会幂等执行 `scripts/patch-vinext-windows.mjs`。这是当前 vinext
版本在 Windows 生产服务器上的兼容补丁；升级 vinext 时应先运行
`tests/release-runtime.regression-1.test.mjs`，确认上游是否已经修复，再决定
是否删除补丁。

首次游玩需要在游戏内“模型与世界资料”填写兼容 OpenAI 格式的 API Key。

## 桌面版

```powershell
npm run dist:win  # 生成 release/灰雾纪事-Setup-<version>.exe
```

本地安装包默认不具备正式发布资格。正式分发必须使用受保护的 release
环境完成 seed 校验、Windows 代码签名、安装 smoke test 与 provenance 生成，
详见 `docs/releasing.md`。
