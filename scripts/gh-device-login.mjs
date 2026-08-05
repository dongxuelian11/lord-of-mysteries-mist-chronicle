// 灰雾纪事 · GitHub 设备码登录（带 scope）
// 用法: node scripts/gh-device-login.mjs [scopes]
// 默认 scopes: repo,workflow（推送 CI 工作流需要 workflow scope）
// 授权码与原始输出会写入 .runtime/gh-login-raw.log，控制台也会打印。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const gh =
  path.join(process.env.ProgramFiles || "", "GitHub CLI", "gh.exe");
const scopes = process.argv[2] || "repo,workflow";

fs.mkdirSync(path.join(root, ".runtime"), { recursive: true });
const rawLog = path.join(root, ".runtime", "gh-login-raw.log");

const child = spawn(
  gh,
  [
    "auth", "login", "--hostname", "github.com",
    "--git-protocol", "https", "--web",
    "--scopes", scopes,
  ],
  {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" },
  }
);

let output = "";
let codeShown = false;
const collect = (chunk) => {
  output += chunk.toString();
  fs.writeFileSync(rawLog, output);
  const match = output.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
  if (match && !codeShown) {
    codeShown = true;
    const line = output
      .split(/\r?\n/)
      .find((item) => item.includes(match[1]));
    console.log(`\n一次性授权码（请原样输入）：${match[1]}`);
    if (line) console.log("gh 原始提示行: " + line.trim());
    console.log("若浏览器未打开，请访问 https://github.com/login/device\n");
  }
};
child.stdout.on("data", collect);
child.stderr.on("data", collect);

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
  console.error("设备登录超时（10 分钟）。");
  process.exit(1);
}, 10 * 60 * 1000);

child.on("error", (err) => {
  clearTimeout(timer);
  console.error("gh 启动失败: " + err.message);
  process.exit(1);
});
child.on("exit", (code) => {
  clearTimeout(timer);
  console.log("登录进程退出码: " + code);
  process.exit(code ?? 1);
});
