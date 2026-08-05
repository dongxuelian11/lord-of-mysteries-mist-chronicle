// 灰雾纪事 · Electron 内置生产服务器
// 以 ELECTRON_RUN_AS_NODE 方式运行：只负责把 vinext 生产服务器拉起来。
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

// vinext 在 Windows 上会把静态缓存 key 拼成反斜杠路径（/assets\xx.js），
// 导致生产服务器对 /assets/* 全部 404。这里统一把 path.relative 的
// 结果规范成斜杠，修复其目录扫描逻辑。
const originalRelative = path.relative;
path.relative = function normalizedRelative(from, to) {
  return originalRelative(from, to).replaceAll("\\", "/");
};

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const vinextDir =
  process.env.GMZZ_VINEXT_DIR ||
  path.join(appRoot, "node_modules", "vinext");
const prodServerUrl = pathToFileURL(
  path.join(vinextDir, "dist", "server", "prod-server.js")
).href;
const { startProdServer } = await import(prodServerUrl);

const port = Number(process.env.GMZZ_PORT || 0);
const host = process.env.GMZZ_HOST || "127.0.0.1";
const outDir = process.env.GMZZ_OUT_DIR || path.join(appRoot, "dist");

try {
  const { port: actualPort } = await startProdServer({ port, host, outDir });
  console.log(`GMZZ_READY http://${host}:${actualPort}`);
} catch (err) {
  console.error("GMZZ_SERVER_ERROR", err);
  process.exit(1);
}
