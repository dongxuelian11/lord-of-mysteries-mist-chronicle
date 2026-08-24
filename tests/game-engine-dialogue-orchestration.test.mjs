import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

test.after(() => closeRuntimeServer());

const config = {
  provider: "compatible",
  endpoint: "https://model.invalid/v1",
  apiKey: "test-key",
  model: "test-model",
};

function seededGame(model) {
  const game = model.createInitialGame("spectator");
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
  game.memory = {
    ...game.memory,
    events: [{
      id: "memory-event:dialogue",
      sourceEventId: "event:dialogue",
      week: game.week,
      type: "dialogue",
      summary: "伊妮丝曾承诺不再单独接触前主编",
      participantIds: ["ines", "player"],
      observerIds: ["ines"],
      organizationIds: [],
      importance: .7,
      emotionalWeight: .4,
      truthStatus: "world-fact",
      status: "active",
      causeEventIds: [],
      consequenceEventIds: [],
      supersedes: [],
      createdBy: "deterministic-rule",
      tags: ["dialogue"],
    }],
  };
  return game;
}

async function withMockModel(callback) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const requests = [];
  globalThis.window = globalThis;
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "我查过那批晚报，删改发生在第三版。",
              mood: "警惕",
              memory: "负责人记住了晚报删改。",
              trustDelta: 1,
              managementAction: null,
            }),
          },
        }],
      }),
    };
  };
  try {
    return await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

test("dialogue orchestration owns NPC implementation and the game-engine facade re-exports it", async () => {
  const facade = await readFile("app/game-engine.ts", "utf8");
  const extracted = await readFile("app/game-engine/dialogue-orchestration.ts", "utf8");
  assert.match(extracted, /export async function generateNpcDialogue/);
  assert.match(facade, /export \{ generateNpcDialogue \} from "\.\/game-engine\/dialogue-orchestration\.ts"/);
  assert.doesNotMatch(facade, /export async function generateNpcDialogue/);
  assert.doesNotMatch(extracted, /from ["']\.\.\/game-engine(?:\.ts)?["']/);
});

test("NPC dialogue characterization preserves private and council context, normalization, and memory receipts", async () => {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const dialogue = await loadRuntimeModule("app/game-engine/dialogue-orchestration.ts");
  assert.equal(engine.generateNpcDialogue, dialogue.generateNpcDialogue);

  await withMockModel(async (requests) => {
    const privateGame = seededGame(model);
    const privateResult = await engine.generateNpcDialogue(config, privateGame, "ines", "上次你说晚报有删改，现在能确认吗？", "private");
    assert.deepEqual(privateResult, {
      reply: "我查过那批晚报，删改发生在第三版。",
      mood: "警惕",
      memory: "负责人记住了晚报删改。",
      trustDelta: 1,
      proposal: null,
      managementAction: null,
    });
    assert.match(requests[0].messages[0].content, /私下谈话/);
    assert.match(requests[0].messages[0].content, /关系阶段与信任直接决定称呼/);
    assert.ok(requests[0].messages[1].content.includes("伊妮丝曾承诺不再单独接触前主编"));
    assert.ok(requests[0].messages[1].content.includes("前主编要求她交换一份组织内部消息。") );
    assert.ok(requests[0].messages[1].content.includes("42"));
    const privateReceipts = privateGame.memory.receipts.filter((receipt) => receipt.actionId === "dialogue:ines:1");
    assert.deepEqual(privateReceipts.map((receipt) => receipt.kind), ["delivered", "presented"]);
    assert.ok(privateReceipts.every((receipt) => receipt.audience.kind === "actor" && receipt.audience.actorId === "ines"));

    const councilGame = seededGame(model);
    const councilResult = await dialogue.generateNpcDialogue(config, councilGame, "ines", "请在议会上说明晚报删改的风险。", "council");
    assert.equal(councilResult.reply, privateResult.reply);
    assert.match(requests[1].messages[0].content, /每周密议/);
    assert.ok(requests[1].messages[1].content.includes("请在议会上说明晚报删改的风险。"));
  });
});

test("NPC dialogue rejects an unknown member before any model request", async () => {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  await assert.rejects(
    () => engine.generateNpcDialogue(config, model.createInitialGame("spectator"), "missing-member", "请回应。"),
    { message: "没有找到这名成员" },
  );
});
