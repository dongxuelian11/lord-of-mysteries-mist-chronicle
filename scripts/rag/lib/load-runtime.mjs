// 用 vite 加载 app/rag 的 TS 运行模块（Node 无法直接解析无扩展名的 TS 导入）。
let serverPromise = null;

export async function runtimeServer() {
  if (!serverPromise) {
    const { createServer } = await import("vite");
    serverPromise = createServer({
      configFile: false,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
  }
  return serverPromise;
}

export async function loadRuntimeModule(specifier) {
  const server = await runtimeServer();
  return server.ssrLoadModule(specifier);
}

export async function closeRuntimeServer() {
  if (serverPromise) {
    const server = await serverPromise;
    await server.close();
    serverPromise = null;
  }
}
