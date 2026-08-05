import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

let moduleServer;

async function loadGameModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  const engine = await moduleServer.ssrLoadModule("/app/game-engine.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  return { engine, model };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

function sseData(payload) {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

const CHAPTER_JSON = JSON.stringify({
  title: "测试章节",
  sections: [{ heading: "开端", paragraphs: ["雨落在窗沿上。"] }],
});

test("literary streaming parses SSE deltas and reports tokens as they arrive", async () => {
  const { engine, model } = await loadGameModules();
  const { generateLiteraryChapter, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const contract = localContract({ intent: "整理本周公开报纸资料，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const chunks = [CHAPTER_JSON.slice(0, 18), CHAPTER_JSON.slice(18, 60), CHAPTER_JSON.slice(60)];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(sseData({ choices: [{ delta: { content: chunk } }] }));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
  });
  let streamed = "";
  try {
    const chapter = await generateLiteraryChapter(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      game,
      resolved.chapter,
      () => {},
      (token) => { streamed += token; },
    );
    assert.equal(chapter.source, "ai");
    assert.equal(chapter.title, "测试章节");
    assert.equal(chapter.sections[0].paragraphs[0], "雨落在窗沿上。");
    assert.equal(streamed, CHAPTER_JSON);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("streaming calls fall back to plain JSON responses without a body", async () => {
  const { engine, model } = await loadGameModules();
  const { generateLiteraryChapter, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const contract = localContract({ intent: "整理本周公开报纸资料，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: CHAPTER_JSON } }] }),
  });
  try {
    const chapter = await generateLiteraryChapter(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      game,
      resolved.chapter,
      () => {},
    );
    assert.equal(chapter.source, "ai");
    assert.equal(chapter.title, "测试章节");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
