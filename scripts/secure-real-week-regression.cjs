/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload-style QA launcher must execute as CommonJS. */
// 从 Electron safeStorage 读取本机已保存的 DeepSeek Key，传给真实长线回归。
// 不打印、不落盘明文 Key。用法：npx electron scripts/secure-real-week-regression.cjs 20
const { app, safeStorage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const userData = process.env.GMZZ_USER_DATA
  ? path.resolve(process.env.GMZZ_USER_DATA)
  : path.join(app.getPath("appData"), "mist-chronicle-prototype");
app.setPath("userData", userData);

async function decryptCredential() {
  const credentialPath = path.join(userData, "ai-credentials.json");
  if (!fs.existsSync(credentialPath)) throw new Error(`未找到安全凭据：${credentialPath}`);
  const payload = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (payload.version !== 1 || typeof payload.encrypted !== "string") throw new Error("安全凭据格式无效");
  const encrypted = Buffer.from(payload.encrypted, "base64");
  if (typeof safeStorage.decryptStringAsync === "function") {
    const result = await safeStorage.decryptStringAsync(encrypted);
    return result.result;
  }
  return safeStorage.decryptString(encrypted);
}

app.whenReady().then(async () => {
  try {
    const apiKey = await decryptCredential();
    if (!apiKey) throw new Error("安全凭据中没有可用的 API Key");
    const child = spawn(process.execPath, [path.join(root, "scripts", "real-week-regression.mjs"), ...process.argv.slice(2)], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DEEPSEEK_API_KEY: apiKey },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("exit", (code, signal) => app.exit(code ?? (signal ? 1 : 0)));
    child.once("error", (error) => { console.error(error.message); app.exit(1); });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    app.exit(1);
  }
});
