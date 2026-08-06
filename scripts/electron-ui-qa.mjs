// 打包版 Electron 窗口 QA：隔离临时 APPDATA，覆盖无索引启动、知识包安装、
// 存档恢复、窗口关闭无残留；真实模型命令视 QA_KEY 是否提供而定。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installPack } from "./rag/pack.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exePath = path.join(root, "release", "win-unpacked", "MistChronicle.exe");
const playwrightIndex = path.join(
  "C:\\Users\\Administrator\\AppData\\Local\\Temp\\gmzz-qa-playwright",
  "node_modules",
  "playwright",
  "index.mjs"
);
const { _electron } = await import(pathToFileURL(playwrightIndex).href);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function residualCount(exeName = "MistChronicle.exe") {
  try {
    const out = execFileSync("tasklist", ["/FI", `IMAGENAME eq ${exeName}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return out.split(/\r?\n/).filter((line) => line.includes(exeName)).length;
  } catch {
    return 0;
  }
}

async function launch(appDataDir, port, ragIndexDir, extraEnv = {}) {
  const app = await _electron.launch({
    executablePath: exePath,
    args: [],
    cwd: path.dirname(exePath),
    env: {
      ...process.env,
      APPDATA: appDataDir,
      GMZZ_PORT: String(port),
      GMZZ_HOST: "127.0.0.1",
      RAG_INDEX_DIR: ragIndexDir,
      ...extraEnv,
    },
  });
  const window = await app.firstWindow();
  const errors = [];
  window.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  window.on("pageerror", (error) => errors.push("pageerror: " + String(error)));
  await window.waitForLoadState("load");
  await sleep(3500);
  return { app, window, errors };
}

async function closeAndCheck(app, exeName = "MistChronicle.exe") {
  await app.close();
  await sleep(2500);
  return residualCount(exeName);
}

const results = { A: null, B: null, C: null, D: null, E: null };
const appData = fs.mkdtempSync(path.join(os.tmpdir(), "mist-alpha-qa-"));
const qaKey = process.env.QA_KEY || "";

// A：干净无索引启动
{
  const emptyIndex = path.join(appData, "rag-empty");
  fs.mkdirSync(emptyIndex, { recursive: true });
  const { app, window, errors } = await launch(appData, 3621, emptyIndex);
  const rag = await window.evaluate(async () => {
    const rag = window.mistRag;
    if (!rag) return { bridge: false };
    const status = await rag.status();
    return { bridge: true, status };
  });
  await window.screenshot({ path: path.join(appData, "qa-a-title.png") });
  const newGameBtn = window.getByRole("button", { name: /新游戏|新的开始|开始/ }).first();
  const newGameCount = await newGameBtn.count();
  results.A = {
    bridge: rag.bridge,
    ragAvailable: rag.status?.available ?? null,
    ragReason: rag.status?.reason ?? null,
    newGameButton: newGameCount,
    consoleErrors: errors.slice(0, 6),
  };
  const leftover = await closeAndCheck(app);
  results.A.leftover = leftover;
}

// C：全新 APPDATA、无 RAG_INDEX_DIR——安装包内置知识库应自动初始化
{
  const freshAppData = fs.mkdtempSync(path.join(os.tmpdir(), "mist-alpha-fresh-"));
  const { app, window, errors } = await launch(freshAppData, 3625, undefined, {
    GMZZ_USER_DATA: freshAppData,
  });
  const rag = await window.evaluate(async () => {
    const rag = window.mistRag;
    if (!rag) return { bridge: false };
    const status = await rag.status();
    return { bridge: true, status };
  });
  const seeded = fs.existsSync(path.join(freshAppData, "rag", "index", "chunks.json"));
  await window.screenshot({ path: path.join(freshAppData, "qa-c-bundled.png") });
  results.C = {
    bridge: rag.bridge,
    ragAvailable: rag.status?.available ?? null,
    chunks: rag.status?.chunks ?? 0,
    indexDir: rag.status?.indexDir ?? null,
    userDataPrefix: freshAppData,
    seededOnDisk: seeded,
    consoleErrors: errors.slice(0, 6),
  };
  const leftover = await closeAndCheck(app);
  results.C.leftover = leftover;
}

// B：安装知识包后重启
{
  const targetDir = path.join(appData, "灰雾纪事", "rag", "index");
  fs.mkdirSync(targetDir, { recursive: true });
  const packFile = fs.readdirSync(path.join(root, "private", "rag", "packs"))
    .filter((name) => name.endsWith(".mcrag"))
    .sort()
    .at(-1);
  const installed = await installPack(path.join(root, "private", "rag", "packs", packFile), [targetDir]);
  const { app, window, errors } = await launch(appData, 3622, targetDir);
  const rag = await window.evaluate(async () => {
    const rag = window.mistRag;
    if (!rag) return { bridge: false };
    const status = await rag.status();
    let search = null;
    if (status.available) {
      search = await rag.search({
        query: "克莱恩 占卜家",
        audience: { kind: "player-known", knownLoreIds: [], topicGrants: [] },
        maxSpoilerScope: "all",
        limit: 5,
        maxChars: 2000,
      });
    }
    return { bridge: true, status, search: search ? { available: search.available, count: search.records.length, zhHit: search.records.some((r) => r.sourceId === "zh-lotm-txt") } : null };
  });
  await window.screenshot({ path: path.join(appData, "qa-b-index.png") });
  results.B = {
    installed: installed.installed.length,
    ...rag,
    ragAvailable: rag.status?.available ?? null,
    consoleErrors: errors.slice(0, 6),
  };
  const leftover = await closeAndCheck(app);
  results.B.leftover = leftover;
}

// D：注入存档 → 继续 → 主界面 → 关闭 → 重启读档
{
  const { createInitialGame } = await import(pathToFileURL(path.join(root, "app", "game-model.ts")).href);
  let game = createInitialGame("seer");
  game = {
    ...game,
    prologueComplete: true,
    playerName: "会长",
    playerAddress: "会长阁下",
    week: 2,
    date: "1349年7月7日",
    chronicle: [
      { id: "qa-ch", week: 1, date: "1349年6月30日", title: "第一周纪事", source: "local", sections: [{ heading: "开端", paragraphs: ["雨落在窗沿上。"] }], results: [], summary: "第一周没有形成决议。" },
    ],
    schedule: [],
  };
  const stateJson = JSON.stringify(game);
  const { app, window, errors } = await launch(appData, 3623, path.join(appData, "灰雾纪事", "rag", "index"));
  await window.evaluate(([state, key]) => {
    window.localStorage.setItem("mist-chronicle-complete-v15", state);
    if (key) {
      window.localStorage.setItem("mist-chronicle-save-v3-ai", JSON.stringify({ provider: "deepseek", endpoint: "https://api.deepseek.com", apiKey: key, model: "deepseek-chat", quality: "balanced", rememberKey: true }));
    }
  }, [stateJson, qaKey]);
  await window.reload({ waitUntil: "load" });
  await sleep(2500);
  const continueBtn = window.getByRole("button", { name: /继续上次存档/ });
  const continueCount = await continueBtn.count();
  if (continueCount) {
    await continueBtn.click();
    await sleep(3000);
  }
  const blankPage = await window.evaluate(() => document.body.innerText.trim().length < 20);
  await window.screenshot({ path: path.join(appData, "qa-d-continue.png") });
  results.D = {
    continueButton: continueCount,
    blankPage,
    consoleErrors: errors.slice(0, 8),
  };
  const leftover = await closeAndCheck(app);
  results.D.leftover = leftover;
}

// E：真实模型命令（仅在提供 QA_KEY 时尝试，否则标记未自动化）
if (qaKey) {
  const { app, window, errors } = await launch(appData, 3624, path.join(appData, "灰雾纪事", "rag", "index"));
  const { createInitialGame: createGameE } = await import(pathToFileURL(path.join(root, "app", "game-model.ts")).href);
  let gameE = createGameE("seer");
  gameE = {
    ...gameE,
    prologueComplete: true,
    playerName: "会长",
    playerAddress: "会长阁下",
    week: 2,
    date: "1349年7月7日",
    chronicle: [{ id: "qa-ch-e", week: 1, date: "1349年6月30日", title: "第一周纪事", source: "local", sections: [{ heading: "开端", paragraphs: ["雨落在窗沿上。"] }], results: [], summary: "第一周没有形成决议。" }],
    schedule: [],
  };
  const stateJsonE = JSON.stringify(gameE);
  await window.evaluate(([state, key]) => {
    window.localStorage.setItem("mist-chronicle-complete-v15", state);
    window.localStorage.setItem("mist-chronicle-save-v3-ai", JSON.stringify({ provider: "deepseek", endpoint: "https://api.deepseek.com", apiKey: key, model: "deepseek-v4-flash", quality: "balanced", rememberKey: true }));
  }, [stateJsonE, qaKey]);
  await window.reload({ waitUntil: "load" });
  await sleep(4000);
  const continueBtn = window.getByRole("button", { name: /继续上次存档/ });
  let continued = false;
  let composer = window.locator(".council-composer textarea").first();
  if ((await composer.count()) === 0 && (await continueBtn.count())) {
    await continueBtn.click();
    await sleep(10000);
    continued = true;
    const openingBtn = window.locator(".situation-opening footer button").first();
    if (await openingBtn.count()) {
      await openingBtn.click({ force: true });
      await sleep(1500);
    }
    await window.keyboard.press("Escape").catch(() => {});
    await sleep(800);
    composer = window.locator(".council-composer textarea").first();
  } else {
    continued = (await composer.count()) > 0;
  }
  let commandEntered = false;
  let contractSheet = false;
  let contractConfirmed = false;
  let screenText = "";
  let textareaClasses = [];
  const resolutionTab = window.getByRole("button", { name: /形成决议/ }).first();
  if ((await composer.count()) === 0 && (await resolutionTab.count())) {
    await resolutionTab.click();
    await sleep(1200);
    composer = window.locator(".council-composer textarea").first();
  }
  if (await composer.count()) {
    await composer.fill("先核对本周公开报纸与登记记录，不接触任何人；若对方察觉调查，立刻中止。");
    commandEntered = true;
    const prepareBtn = window.getByRole("button", { name: /形成行动契约/ });
    if (await prepareBtn.count()) {
      await prepareBtn.click();
      await sleep(12000);
      contractSheet = (await window.locator(".contract-sheet").count()) > 0;
      if (contractSheet) {
        const confirmBtn = window.getByRole("button", { name: /负责人拍板/ });
        if (await confirmBtn.count()) {
          await confirmBtn.click();
          await sleep(20000);
          contractConfirmed = true;
        }
      }
    }
  }
  screenText = await window.evaluate(() => document.body.innerText.slice(0, 240));
  textareaClasses = await window.evaluate(() =>
    [...document.querySelectorAll("textarea")].map((item) => item.className).slice(0, 8)
  );
  await window.screenshot({ path: path.join(appData, "qa-e-model.png") });
  results.E = {
    attempted: true,
    continued,
    commandEntered,
    contractSheet,
    contractConfirmed,
    screenText,
    textareaClasses,
    consoleErrors: errors.slice(0, 10),
  };
  const leftover = await closeAndCheck(app);
  results.E.leftover = leftover;
} else {
  results.E = { attempted: false, reason: "QA_KEY not provided (PENDING_USER_UAU)" };
}

console.log("[electron-ui-qa]");
console.log(`  A 无索引: ${JSON.stringify(results.A)}`);
console.log(`  C 内置知识库自举: ${JSON.stringify(results.C)}`);
console.log(`  B 知识包: ${JSON.stringify(results.B)}`);
console.log(`  D 存档: ${JSON.stringify(results.D)}`);
console.log(`  E 真实模型: ${JSON.stringify(results.E)}`);

const pass =
  results.A.bridge &&
  results.A.ragAvailable === false &&
  results.A.leftover === 0 &&
  results.C.ragAvailable === true &&
  results.C.chunks > 0 &&
  String(results.C.indexDir ?? "").startsWith(results.C.userDataPrefix) &&
  results.C.seededOnDisk === true &&
  results.C.leftover === 0 &&
  results.B.installed >= 1 &&
  results.B.ragAvailable === true &&
  results.B.search?.zhHit === true &&
  results.B.leftover === 0 &&
  results.D.continueButton > 0 &&
  results.D.blankPage === false &&
  results.D.leftover === 0 &&
  (results.E.attempted === false || results.E.leftover === 0);
console.log(`[electron-ui-qa] RESULT=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
