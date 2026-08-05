// 真机 3 周回归：用真实 DeepSeek API 连续跑 N 周，记录每阶段耗时。
// 用法:
//   $env:DEEPSEEK_API_KEY="sk-..." ; node scripts/real-week-regression.mjs [周数]
// 默认 3 周；模型/端点可通过环境变量覆盖：
//   DEEPSEEK_ENDPOINT=https://api.deepseek.com
//   DEEPSEEK_MODEL=deepseek-v4-flash
import { createServer } from "vite";

const weeks = Math.max(1, Math.min(5, Number(process.argv[2] || 3)));
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

let game = model.createInitialGame("spectator");
const report = [];

try {
  for (let week = 1; week <= weeks; week += 1) {
    const contract = engine.localContract({
      intent: `第${week}周：整理本周公开报纸与失踪记录，只做比对，不接触任何人。`,
      game,
      leaderId: "organization",
      districtId: "cherwood",
      abilityIds: [],
    });
    game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
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
    };
    report.push(entry);
    console.log(`week ${entry.week}: world=${worldMs}ms literary=${literaryMs}ms total=${entry.totalMs}ms signals=${entry.signals} sections=${entry.sections} paragraphs=${paragraphs} title=${entry.chapterTitle}`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
