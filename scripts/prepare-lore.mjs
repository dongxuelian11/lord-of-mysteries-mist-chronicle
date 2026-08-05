// 灰雾纪事 · 世界知识库准备脚本
// 构建前自动执行（npm prebuild/predev/prestart）：
//   1. 若 app/generated-lore-compendium.ts 已存在，保持不变（本地完整版）
//   2. 否则优先从 private/generated-lore-compendium.ts 恢复（维护者私有）
//   3. 都没有则复制公开占位版 app/generated-lore-compendium.example.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "app", "generated-lore-compendium.ts");
const privateSource = path.join(
  root,
  "private",
  "generated-lore-compendium.ts"
);
const exampleSource = path.join(
  root,
  "app",
  "generated-lore-compendium.example.ts"
);

if (fs.existsSync(target)) {
  console.log("[prepare-lore] app/generated-lore-compendium.ts 已存在，跳过");
  process.exit(0);
}

const source = fs.existsSync(privateSource) ? privateSource : exampleSource;
if (!fs.existsSync(source)) {
  console.error(
    "[prepare-lore] 找不到知识库来源（private/ 或 example 均缺失）"
  );
  process.exit(1);
}
fs.copyFileSync(source, target);
console.log(
  `[prepare-lore] 已从 ${path.relative(root, source)} 生成 app/generated-lore-compendium.ts`
);
