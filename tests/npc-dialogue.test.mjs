import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

let moduleServer;

async function loadModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  const engine = await moduleServer.ssrLoadModule("/app/game-engine.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  return { engine, model };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

test("NPC dialogue carries voice, relationship and memories into the model request", async () => {
  const { engine, model } = await loadModules();
  const { generateNpcDialogue } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const ines = game.members.find((item) => item.id === "ines");
  ines.trust = 42;
  ines.interest = 71;
  ines.ideology = 58;
  ines.relationshipStage = "正式成员";
  ines.personalEvent = "前主编要求她交换一份组织内部消息。";
  ines.personalEventState = "active";
  game.dialogueThreads = [{
    memberId: "ines",
    messages: [{ id: "x", role: "player", text: "上次你说晚报有删改。", week: game.week, context: "council" }],
    memories: ["伊妮丝曾承诺不再单独接触前主编"],
    lastMood: "警惕",
    lastUpdatedWeek: game.week,
  }];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  let captured = "";
  globalThis.fetch = async (_url, init) => {
    captured = String(init?.body ?? "");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "我查过那批晚报，删改发生在第三版。", mood: "警惕", memory: "负责人记住了晚报删改。", trustDelta: 1 }) } }] }),
    };
  };
  try {
    const result = await generateNpcDialogue(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      game,
      "ines",
      "上次你说晚报有删改，现在能确认吗？",
      "private",
    );
    assert.equal(result.reply, "我查过那批晚报，删改发生在第三版。");
    assert.equal(result.trustDelta, 1);
    const parsed = JSON.parse(captured);
    const system = parsed.messages[0].content;
    const user = parsed.messages[1].content;
    assert.match(system, /禁止“请您示下”/);
    assert.match(system, /关系阶段与信任直接决定称呼/);
    assert.ok(user.includes("伊妮丝曾承诺不再单独接触前主编"));
    assert.ok(user.includes("前主编要求她交换一份组织内部消息。"));
    assert.ok(user.includes("42"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
