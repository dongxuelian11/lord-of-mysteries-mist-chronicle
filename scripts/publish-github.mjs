// 灰雾纪事 · 一键发布到 GitHub
// 用法: node scripts/publish-github.mjs [repoName]
// 未登录时先走设备登录流程（控制台会打印一次性授权码，浏览器会打开授权页），
// 登录完成后创建公开仓库并推送 main。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const ghCandidates = [
  path.join(process.env.ProgramFiles || "", "GitHub CLI", "gh.exe"),
  path.join(process.env.LOCALAPPDATA || "", "GitHubCLI", "gh.exe"),
];
const gh = ghCandidates.find((candidate) => fs.existsSync(candidate)) || "gh";

const repoName = process.argv[2] || "mist-chronicle";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function isLoggedIn() {
  const result = run(gh, ["auth", "status"]);
  return result.status === 0;
}

function deviceLogin() {
  return new Promise((resolve, reject) => {
    console.log("[publish] 开始 GitHub 设备登录…");
    const child = spawn(gh, ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let output = "";
    let codeShown = false;
    const collect = (chunk) => {
      output += chunk.toString();
      fs.writeFileSync(
        path.join(root, ".runtime", "gh-login-raw.log"),
        output
      );
      const match = output.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
      if (match && !codeShown) {
        codeShown = true;
        const line = output
          .split(/\r?\n/)
          .find((item) => item.includes(match[1]));
        console.log(`\n[publish] 一次性授权码（请原样输入）：${match[1]}`);
        if (line) console.log("[publish] gh 原始提示行: " + line.trim());
        console.log(
          "[publish] 浏览器已打开授权页；若未打开，请访问 https://github.com/login/device\n"
        );
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    // 等待授权码打印后按 Enter 继续
    setTimeout(() => {
      try {
        child.stdin.write("\n");
        child.stdin.end();
      } catch {
        // 已结束
      }
    }, 3000);

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("设备登录超时（10 分钟）。请重试，或手动运行 gh auth login。"));
    }, 10 * 60 * 1000);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function main() {
  const version = run(gh, ["--version"]);
  if (version.status !== 0) {
    console.error("[publish] 未找到 GitHub CLI，请先安装：winget install --id GitHub.cli");
    process.exit(1);
  }
  console.log("[publish] " + version.stdout.trim().split(/\r?\n/)[0]);

  if (!isLoggedIn()) {
    const login = await deviceLogin();
    console.log("[publish] 登录进程退出码: " + login.code);
    if (login.code !== 0) {
      console.error("[publish] 登录输出:\n" + login.output);
      process.exit(1);
    }
  }
  console.log("[publish] GitHub 登录状态: OK");

  console.log(`[publish] 创建公开仓库 ${repoName} 并推送…`);
  const create = run(gh, [
    "repo", "create", repoName, "--public", "--source", ".", "--remote", "origin", "--push",
    "--description", "灰雾纪事：AI 驱动的《诡秘之主》同人组织经营与推演游戏（非官方、非商业）",
  ], { cwd: root });
  if (create.status !== 0) {
    console.error("[publish] 仓库创建/推送失败:\n" + create.stderr + create.stdout);
    process.exit(1);
  }
  console.log("[publish] " + (create.stdout || create.stderr).trim());

  const url = run(gh, ["repo", "view", repoName, "--json", "url", "--jq", ".url"], { cwd: root });
  console.log(`[publish] 仓库地址: ${(url.stdout || "").trim() || `https://github.com/<owner>/${repoName}`}`);
  console.log(`[publish] 完成。可用 git tag v${packageVersion} && git push origin v${packageVersion} 触发安装包构建。`);
}

main().catch((err) => {
  console.error("[publish] 失败: " + (err?.message || err));
  process.exit(1);
});
