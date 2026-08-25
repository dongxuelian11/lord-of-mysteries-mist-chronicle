// 灰雾纪事 · 对话框与地图 UI 真机 QA
// 用法: node scripts/ui-qa.mjs [port]
// 生产服务器 -> 注入存档 -> 打开议桌发言 -> 验证输入框/滚动条/决议栏可见
// -> 打开城市地图 -> 验证弹窗尺寸与信息密度 -> 截图
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareQaEnvironment, resolveQaPaths } from "./lib/qa-paths.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 3210);
const qaPaths = resolveQaPaths();
const qaEnv = prepareQaEnvironment({ runtimePaths: qaPaths });
const qaDir = qaPaths.qaRoot;
fs.mkdirSync(qaDir, { recursive: true });
const base = `http://127.0.0.1:${port}`;

function fetchUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fetchUrl(url)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // 已退出
  }
}

// 1. 启动生产服务器
const server = spawn(
  process.execPath,
  [path.join(root, "electron", "server.mjs")],
  {
    cwd: root,
    env: {
      ...qaEnv,
      RAG_INDEX_DIR: qaPaths.ragRoot,
      GMZZ_PORT: String(port),
      GMZZ_HOST: "127.0.0.1",
      GMZZ_OUT_DIR: path.join(root, "dist"),
      GMZZ_VINEXT_DIR: path.join(root, "node_modules", "vinext"),
      ELECTRON_RUN_AS_NODE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }
);
server.stdout.on("data", (d) => process.stdout.write(d));
server.stderr.on("data", (d) => process.stderr.write(d));

const ready = await waitForServer(base, 60000);
if (!ready) {
  console.log("[ui-qa] server not ready");
  killTree(server.pid);
  process.exit(1);
}

// 2. 构造带对话记录的存档
const { createInitialGame } = await import(
  pathToFileURL(path.join(root, "app", "game-model.ts")).href
);
let game = createInitialGame("seer");
game = {
  ...game,
  prologueComplete: true,
  playerName: "会长",
  playerAddress: "会长阁下",
  week: 2,
  date: "1349年8月8日",
  dialogueThreads: [
    {
      memberId: "mara",
      messages: Array.from({ length: 18 }, (_, i) => ({
        id: `d${i + 1}`,
        role: i % 2 === 0 ? "player" : "member",
        text:
          i % 2 === 0
            ? `第${i + 1}条玩家发言：先核对公开报纸与失踪记录，不要接触任何人，把线索按时间归档。`
            : `第${i + 1}条成员回应：旧成员的密信我已核对过笔迹，是他本人；匿名信圈了西区一家废弃印刷厂。`,
        mood: i % 4 === 0 ? "保留" : undefined,
      })),
      memories: ["成员玛拉曾单独核对过密信笔迹", "匿名信指向西区废弃印刷厂"],
      lastMood: "审慎",
      lastUpdatedWeek: 2,
    },
  ],
};
const stateJson = JSON.stringify(game);

// 3. Playwright 打开页面
const { chromium } = await import(pathToFileURL(qaPaths.playwrightIndex).href);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push("http " + r.status() + " " + r.url());
});

await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(2000);
await page.evaluate(([state]) => {
  localStorage.setItem("mist-chronicle-complete-v15", state);
  localStorage.setItem(
    "mist-chronicle-save-v3-ai",
    JSON.stringify({
      provider: "deepseek",
      endpoint: "https://api.deepseek.com",
      apiKey: process.env.QA_KEY ?? "",
      model: "deepseek-v4-flash",
      quality: "balanced",
      rememberKey: true,
    })
  );
}, [stateJson]);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1500);

const continueBtn = page.getByRole("button", { name: /继续上次存档/ });
if (await continueBtn.count()) await continueBtn.click();
await page.waitForSelector(".council-page", { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(1500);

// 关闭可能出现的开场简报
const briefEnter = page.locator(".situation-opening footer button").first();
if (await briefEnter.count()) {
  await briefEnter.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
}

// 4. 打开议桌发言
const memberBtn = page.locator(".council-attendance button", {
  hasText: "玛拉",
});
if (await memberBtn.count()) await memberBtn.click();
await page.waitForSelector(".living-dialogue", { timeout: 10000 });
await page.waitForTimeout(800);

const dialogueMetrics = await page.evaluate(() => {
  const sheet = document.querySelector(".living-dialogue");
  const messages = document.querySelector(".character-dialogue");
  const headerName = document.querySelector(".living-dialogue header h2")
    ?.textContent;
  const input = document.querySelector(".chat-input textarea");
  const sendBtn = document.querySelector(".chat-input button");
  const decision = document.querySelector(".dialogue-decision-bar");
  const strip = document.querySelector(".dialogue-ability-strip");
  const vh = window.innerHeight;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      visibleInViewport:
        r.top >= 0 && r.bottom <= vh && r.height > 0 && r.width > 0,
    };
  };
  return {
    headerName,
    sheet: rect(sheet),
    messages: rect(messages),
    input: rect(input),
    sendButton: rect(sendBtn),
    decision: rect(decision),
    strip: rect(strip),
    sheetRight: sheet ? Math.round(sheet.getBoundingClientRect().right) : 0,
    sheetLeft: sheet ? Math.round(sheet.getBoundingClientRect().left) : 0,
    viewportHeight: vh,
    messagesScroll: messages
      ? {
          clientHeight: messages.clientHeight,
          scrollHeight: messages.scrollHeight,
          scrollbarWidth: getComputedStyle(messages).scrollbarWidth,
          childCount: messages.children.length,
          lastChildBottom: messages.lastElementChild
            ? Math.round(messages.lastElementChild.getBoundingClientRect().bottom)
            : 0,
          boxBottom: Math.round(messages.getBoundingClientRect().bottom),
        }
      : null,
  };
});
console.log("[ui-qa] dialogueMetrics=" + JSON.stringify(dialogueMetrics, null, 2));
await page.screenshot({ path: path.join(qaDir, "fix-dialogue.png") });

// 5. 打开地图
const closeDialogue = page.locator(".living-dialogue header button").first();
if (await closeDialogue.count()) await closeDialogue.click();
await page.waitForTimeout(400);

const mapBtn = page.locator(".paper-scroll").first();
if (await mapBtn.count()) await mapBtn.click();
await page.waitForSelector(".council-map-modal", { timeout: 10000 });
await page.waitForTimeout(1200);

const mapMetrics = await page.evaluate(() => {
  const modal = document.querySelector(".council-map-modal");
  const map = document.querySelector(".engraved-map");
  const subNames = [...document.querySelectorAll(".map-sublocation b")].filter(
    (el) => el.offsetParent !== null && el.textContent.trim()
  ).length;
  const districtSummaries = [
    ...document.querySelectorAll(".engraved-district small"),
  ].filter((el) => el.offsetParent !== null).length;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  return {
    modal: rect(modal),
    map: rect(map),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    visibleSubLocationNames: subNames,
    visibleDistrictSummaries: districtSummaries,
    overflowX: modal ? modal.scrollWidth - modal.clientWidth : 0,
    overflowY: modal ? modal.scrollHeight - modal.clientHeight : 0,
  };
});
console.log("[ui-qa] mapMetrics=" + JSON.stringify(mapMetrics, null, 2));
await page.screenshot({ path: path.join(qaDir, "fix-map.png") });

console.log("[ui-qa] errors=" + JSON.stringify(errors.slice(0, 10)));
await browser.close();
killTree(server.pid);

const pass =
  dialogueMetrics.input?.visibleInViewport &&
  dialogueMetrics.decision?.visibleInViewport &&
  mapMetrics.modal &&
  mapMetrics.modal.width >= 1200 &&
  mapMetrics.overflowX <= 0;
console.log(`[ui-qa] RESULT=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
