// 真机长线回归：用真实 DeepSeek API 连续跑 N 周，记录每阶段耗时。
// 用法:
//   $env:DEEPSEEK_API_KEY="sk-..." ; node scripts/real-week-regression.mjs [周数]
// 默认 3 周，最多 20 周；模型/端点可通过环境变量覆盖：
//   DEEPSEEK_ENDPOINT=https://api.deepseek.com
//   DEEPSEEK_MODEL=deepseek-v4-flash
import { createServer } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argumentsList = process.argv.slice(2);
const weeks = Math.max(1, Math.min(20, Number(argumentsList.find((item) => /^\d+$/.test(item)) || 3)));
const resume = argumentsList.includes("--resume");
const checkpointPath = join(tmpdir(), "mist-chronicle-real-week-regression.json");
const apiKey = process.env.DEEPSEEK_API_KEY || "";
if (!apiKey) {
  console.error("缺少 DEEPSEEK_API_KEY 环境变量");
  process.exit(1);
}

globalThis.window = globalThis;

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
const engine = await server.ssrLoadModule("/app/game-engine.ts");
const model = await server.ssrLoadModule("/app/game-model.ts");

const config = {
  provider: "compatible",
  endpoint: process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com",
  apiKey,
  model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  quality: "balanced",
  timeoutMs: 170_000,
};

const checkpoint = resume && existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, "utf8")) : null;
let game = checkpoint?.game ?? model.createInitialGame("spectator");
const report = Array.isArray(checkpoint?.report) ? checkpoint.report : [];
const WEEKLY_ORDERS = [
  null,
  "整理本周公开报纸与失踪记录，只做比对，不接触任何人。",
  "与内务负责人核对基层人力、金钱和非凡材料，只处理需要议会决定的异常。",
  "根据贝克兰德地图已有情报，选择一个争夺中的战略点进行低暴露侦察。",
  "暂不下达新命令，让各负责人依照既有职责运转并报告异常。",
  "评估现有成员的职责与负担，必要时提出换任建议，但不强制调整。",
];

try {
  for (let week = Math.max(1, Number(game.week) || 1); week <= weeks; week += 1) {
    const order = WEEKLY_ORDERS[(week - 1) % WEEKLY_ORDERS.length];
    if (order) {
      const contract = engine.localContract({
        intent: `第${week}周：${order}`,
        game,
        leaderId: "organization",
        districtId: "cherwood",
        abilityIds: [],
      });
      game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
    } else {
      game = { ...game, schedule: [] };
    }
    const resolved = engine.resolveWeek(game);

    const worldStart = performance.now();
    const simulated = await engine.generateAiWorldDelta(config, resolved.state, resolved.chapter, () => {});
    const worldMs = Math.round(performance.now() - worldStart);

    const enriched = simulated.chronicle.find((item) => item.id === resolved.chapter.id) ?? resolved.chapter;
    const literaryStart = performance.now();
    const literary = await engine.generateLiteraryChapter(config, simulated, enriched, () => {});
    const literaryMs = Math.round(performance.now() - literaryStart);

    game = { ...simulated, chronicle: simulated.chronicle.map((item) => item.id === literary.id ? literary : item) };
    const paragraphs = literary.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
    const entry = {
      week: literary.week,
      worldMs,
      literaryMs,
      totalMs: worldMs + literaryMs,
      signals: simulated.worldSignals.length,
      snapshots: simulated.worldSnapshots.length,
      chapterTitle: literary.title,
      sections: literary.sections.length,
      paragraphs,
      order: order ?? "安静周：没有新命令",
    };
    report.push(entry);
    writeFileSync(checkpointPath, JSON.stringify({ game, report }), "utf8");
    console.log(`week ${entry.week}: world=${worldMs}ms literary=${literaryMs}ms total=${entry.totalMs}ms signals=${entry.signals} sections=${entry.sections} paragraphs=${paragraphs} title=${entry.chapterTitle} order=${entry.order}`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
