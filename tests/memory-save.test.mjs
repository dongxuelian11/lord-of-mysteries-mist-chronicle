import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("新游戏自带空动态记忆，存档往返保留记忆且 checksum 覆盖", async () => {
  const model = await loadRuntimeModule("app/game-model.ts");
  const memory = await loadRuntimeModule("app/memory/index.ts");
  const save = await loadRuntimeModule("app/save-system.ts");
  let game = model.createInitialGame("seer");
  assert.ok(Array.isArray(game.memory.events));
  const { state } = memory.deriveMemory(
    game.memory,
    [
      { kind: "commitment", id: "c-save", type: "promise", participantIds: ["player", "mara"], summary: "存档测试承诺", createdWeek: 1, sourceEventId: "e-save", importance: 0.8 },
      { kind: "event", sourceEventId: "e-save", week: 1, type: "chat", summary: "存档测试事件", participantIds: ["player"] },
    ]
  );
  game = { ...game, prologueComplete: true, week: 2, memory: state };
  const envelope = save.createSaveEnvelope(game);
  const parsed = save.parseSaveEnvelope(JSON.stringify(envelope));
  assert.equal(parsed.game.memory.events.length, 1);
  assert.equal(parsed.game.memory.commitments.length, 1);
});

test("旧存档（无 memory 字段）读取时补空安全默认", async () => {
  const model = await loadRuntimeModule("app/game-model.ts");
  const save = await loadRuntimeModule("app/save-system.ts");
  const game = { ...model.createInitialGame("seer"), prologueComplete: true };
  const legacy = { ...game };
  delete legacy.memory;
  const legacyEnvelope = save.createSaveEnvelope(legacy);
  const parsed = save.parseSaveEnvelope(JSON.stringify(legacyEnvelope));
  assert.ok(Array.isArray(parsed.game.memory.events));
  assert.equal(parsed.game.memory.events.length, 0);
});

test("resolveWeek 与 generateAiWorldDelta 不破坏记忆（引擎集成冒烟）", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const engine = await server.ssrLoadModule("/app/game-engine.ts");
    const model = await server.ssrLoadModule("/app/game-model.ts");
    let game = model.createInitialGame("seer");
    game = { ...game, prologueComplete: true, playerName: "会长", playerAddress: "会长阁下", money: 500, schedule: [] };
    const contract = engine.localContract({
      intent: "核对公开记录",
      game,
      leaderId: "mara",
      districtId: "cherwood",
      abilityIds: [],
    });
    game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
    const resolved = engine.resolveWeek(game);
    assert.ok(Array.isArray(resolved.state.memory.commitments));
    assert.ok(resolved.state.memory.commitments.length >= 1);
    assert.ok(Array.isArray(resolved.state.memory.events));
  } finally {
    await server.close();
  }
});
