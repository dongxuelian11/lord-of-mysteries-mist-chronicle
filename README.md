# 灰雾纪事

一个由 AI 驱动的《诡秘之主》同人组织经营与推演游戏。你在 1349 年的
贝克兰德建立一支不被历史记住的组织，通过周回推演、议桌讨论、能力使用与
决议执行，亲眼看着它如何改变历史。

> 本项目是**非官方、非商业**同人作品，与《诡秘之主》作者及出版方无隶属
> 关系。原著设定版权归原作者及版权方所有；如有版权方要求，项目将立即
> 停止分发。详见 [NOTICE](./NOTICE)。

## 特性

- **全 AI 叙事**：对话、推演、小说章节全部由大模型生成，必须配置 API Key
- **议桌集会**：地图与文书集成在一张议会桌上，点击纸张打开述职、议题、
  自由讨论与决议
- **城市地图**：贝克兰德分区钻取、图层筛选、动态世界投射、历史回放
- **角色对话**：与成员自由对话，能力可在对话中即时使用
- **差异化开局**：性别、年龄、组织类型与命名、成员班底均可自定义
- **桌面版**：Electron + NSIS 安装包，离线启动本地服务，关窗即完全退出

## 快速开始

环境要求：Node.js ≥ 22

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。首次游玩请在游戏内「模型与世界资料」填写
兼容 OpenAI 格式的 API Key（默认支持 DeepSeek）。

## 世界知识库说明

原著设定知识库（`app/generated-lore-compendium.ts`）**不随开源仓库分发**，
公共构建使用空壳占位，游戏仍可运行但不含原著专属知识。

维护者私有流程：

```powershell
# 将完整知识库放到 private/generated-lore-compendium.ts（已 gitignore）
npm run prepare:lore   # 构建前会自动执行：private/ 优先，其次公共空壳
```

## 桌面版打包

```powershell
npm run build
npm run dist:win
```

产物：`release/灰雾纪事-Setup-<version>.exe`（NSIS 安装包，未签名，
分发时请保留 LICENSE 与 NOTICE）。

## 测试与 QA

```powershell
npm run lint
npm test
```

仓库内附带一套可复用的真机 QA 脚本：

- `scripts/prod-qa.mjs`：生产服务器 + 页面资源检查
- `scripts/ui-qa.mjs`：对话框与地图布局自动验证（需要本地 Playwright）
- `scripts/electron-ui-qa.mjs`：打包窗口端到端验证
- `scripts/installer-qa.mjs`：安装 → 启动 → 卸载全链路验证

## 目录结构

```text
app/                  # 游戏前端与逻辑（React + vinext/Next 风格）
  game-model.ts       # 游戏状态模型
  game-engine.ts      # 推演引擎
  council-ai.ts       # AI 调用与上下文组装
  weekly-council.tsx  # 议会页
  city-map-workspace.tsx # 城市地图
electron/             # Electron 桌面壳
scripts/              # 启动器、QA 与工具脚本
private/              # 私有设定（gitignored，维护者持有）
tests/                # 自动化测试
```

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可

代码以 [MIT](./LICENSE) 许可证发布。游戏内容与原著设定见 [NOTICE](./NOTICE)。
