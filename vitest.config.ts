import path from "node:path";
import { defineConfig } from "vitest/config";

const configuredRoot = typeof process.env.GMZZ_STORAGE_ROOT === "string" && process.env.GMZZ_STORAGE_ROOT.trim()
  ? path.resolve(process.env.GMZZ_STORAGE_ROOT.trim())
  : path.resolve(process.cwd(), ".runtime");

if (process.platform === "win32" && path.parse(configuredRoot).root.toUpperCase() !== "D:\\") {
  throw new Error(`COVERAGE_STORAGE_ROOT_MUST_BE_ON_D: ${configuredRoot}`);
}

const coverageDirectory = path.join(configuredRoot, "coverage");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/coverage/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".next", ".runtime"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["json", "text"],
      reportsDirectory: coverageDirectory,
      include: [
        "app/game-engine.ts",
        "app/game-engine/action-contracts.ts",
        "app/game-engine/dialogue-orchestration.ts",
        "app/game-engine/week-resolution.ts",
        "app/game-engine/world-turn-orchestrator.ts",
        "app/ai-provider-capabilities.ts",
        "app/nlp/intent-contract.ts",
        "app/world-kernel.ts",
        "app/world-authority-closure.ts",
        "app/world-output-adapter.ts",
        "electron/autonomous-inference.cjs",
        "electron/world-prompt.cjs",
        "electron/inference-scheduler.cjs",
        "electron/persistence-provenance.cjs",
      ],
      exclude: ["**/*.d.ts"],
      clean: true,
      cleanOnRerun: true,
    },
  },
});
