import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.ts";
import fs from "node:fs";
import path from "node:path";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// .openai/hosting.json 是内部部署配置，不随开源仓库分发；
// 缺失时按无 D1/R2 绑定处理，保证公共代码可独立构建。
const hostingConfigPath = path.join(process.cwd(), ".openai", "hosting.json");
const hostingConfig = fs.existsSync(hostingConfigPath)
  ? JSON.parse(fs.readFileSync(hostingConfigPath, "utf8"))
  : { d1: null, r2: null };

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "react-runtime",
                test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: "game-engine",
                test: /app[\\/](?:game-engine|game-model|ability-system|council-ai|finale-system|progression-system|pathway-abilities|fate|memory|rag)[\\/.-]/,
                minSize: 40_000,
                maxSize: 320_000,
                priority: 20,
              },
              {
                name: "game-ui",
                test: /app[\\/](?:ai-settings|ability-console|great-smog-finale|opening-prologue|organization-management-console|title-screen|weekly-council)\.tsx$/,
                minSize: 40_000,
                maxSize: 260_000,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
