import { mkdirSync } from "node:fs";
import path from "node:path";
import { resolveRuntimePaths } from "./lib/runtime-paths.mjs";

function preflightEnvironment() {
  return {
    ...process.env,
    GMZZ_REQUIRE_D_DRIVE: process.env.GMZZ_REQUIRE_D_DRIVE ?? "1",
  };
}

try {
  const env = preflightEnvironment();
  const paths = resolveRuntimePaths({ env });
  for (const directory of Object.values(paths)) mkdirSync(directory, { recursive: true });
  const storageDrive = process.platform === "win32"
    ? path.win32.parse(paths.root).root.slice(0, 2).toUpperCase()
    : path.parse(paths.root).root;
  console.log(JSON.stringify({
    status: "PASS",
    storageRoot: paths.root,
    storageDrive,
    paths: {
      tempRoot: paths.tempRoot,
      userDataRoot: paths.userDataRoot,
      npmCacheRoot: paths.npmCacheRoot,
      electronCacheRoot: paths.electronCacheRoot,
      playwrightRoot: paths.playwrightRoot,
      ragRoot: paths.ragRoot,
    },
  }));
} catch (error) {
  console.error(JSON.stringify({
    status: "BLOCKED",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
}
