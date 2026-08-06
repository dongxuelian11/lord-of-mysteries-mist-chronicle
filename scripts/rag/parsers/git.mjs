import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(args, options) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: options.timeout ?? 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "git failed").trim().slice(0, 500)
    );
  }
  return result.stdout.trim();
}

export function cloneOrUpdate(source, cacheDir, options = {}) {
  const target = path.join(cacheDir, source.id);
  const sparsePatterns = source.sparse ?? [];
  if (fs.existsSync(path.join(target, ".git"))) {
    if (!source.skipFetch) {
      run(["-C", target, "fetch", "--all", "--quiet"], options);
      run(["-C", target, "reset", "--hard", "origin/HEAD"], options);
    }
    if (sparsePatterns.length) {
      run(
        ["-C", target, "sparse-checkout", "set", "--no-cone", ...sparsePatterns],
        options
      );
    }
  } else {
    const args = ["clone", "--quiet"];
    if (source.shallow !== false) args.push("--depth", "1");
    if (sparsePatterns.length) {
      args.push("--filter=blob:none", "--sparse");
    }
    args.push(source.url, target);
    run(args, options);
    if (sparsePatterns.length) {
      run(
        ["-C", target, "sparse-checkout", "set", "--no-cone", ...sparsePatterns],
        options
      );
    }
  }
  const commit = run(["-C", target, "rev-parse", "HEAD"], options);
  return { target, commit };
}
