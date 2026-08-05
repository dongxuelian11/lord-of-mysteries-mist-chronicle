import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

let moduleServer;

async function loadModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  const council = await moduleServer.ssrLoadModule("/app/council-ai.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  return { council, model };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

test("the scribe turns a discussion into an executable decision draft", async () => {
  const { council, model } = await loadModules();
  const { generateDecisionDraft } = council;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const topic = {
    id: "topic-1",
    week: game.week,
    title: "东区失踪者是否值得继续追查",
    pinned: false,
    status: "open",
    messages: [
      { id: "m1", speakerId: "player", text: "先核对公开报纸与失踪登记，不要接触任何人。" },
      { id: "m2", speakerId: "ines", text: "我能整理晚报与警察厅通告，但不会去询问线人。" },
    ],
  };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: "让伊妮丝只整理本周公开报纸与失踪记录，不接触任何人；若被注意立即中止。" }) } }] }),
  });
  try {
    const draft = await generateDecisionDraft(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      game,
      topic,
    );
    assert.match(draft, /伊妮丝/);
    assert.match(draft, /不接触任何人/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("an empty scribe draft is rejected without touching the discussion", async () => {
  const { council, model } = await loadModules();
  const { generateDecisionDraft } = council;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const topic = {
    id: "topic-2",
    week: game.week,
    title: "空议题",
    pinned: false,
    status: "open",
    messages: [{ id: "m1", speakerId: "player", text: "有人有想法吗？" }],
  };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: "" }) } }] }),
  });
  try {
    await assert.rejects(
      () => generateDecisionDraft(
        { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
        game,
        topic,
      ),
      /没有形成决议文本/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
