import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".playwright-cli/**",
    "dist/**",
    "out/**",
    "output/**",
    "build/**",
    "next-env.d.ts",
    // Electron 主进程使用 CJS 入口，不参与前端 lint
    "electron/**",
    // 构建产物与内部/私有目录
    "release/**",
    ".gstack/**",
    ".openai/**",
    "private/**",
  ]),
]);

export default eslintConfig;
