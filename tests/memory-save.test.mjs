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

test("本地 v20/v8/v6 存档只通过 save-system 的统一入口迁移", async () => {
  const model = await loadRuntimeModule("app/game-model.ts");
  const save = await loadRuntimeModule("app/save-system.ts");
  const current = model.createInitialGame("seer");

  const v20 = { ...current, version: 20, prologueComplete: true };
  delete v20.memory;
  delete v20.worldAgents;
  delete v20.factionStrategy;
  const v20Before = JSON.stringify(v20);
  const migrated20 = save.migrateStoredGame(v20);
  assert.equal(JSON.stringify(v20), v20Before, "central migration must not mutate the parsed legacy input");
  assert.equal(migrated20.sourceVersion, 20);
  assert.equal(migrated20.game.version, 21);
  assert.equal(migrated20.hasSave, true);
  assert.ok(Array.isArray(migrated20.game.memory.events));
  assert.ok(Array.isArray(migrated20.game.worldAgents.profiles));
  assert.equal(migrated20.game.worldLedger.version, 2);

  const migrated8 = save.migrateStoredGame({
    ...current,
    version: 8,
    prologueComplete: undefined,
    playerName: undefined,
    playerAddress: undefined,
    dialogueThreads: undefined,
    councilRecords: undefined,
  });
  assert.equal(migrated8.game.playerName, "无名负责人");
  assert.equal(migrated8.game.playerAddress, "会长阁下");
  assert.equal(migrated8.game.prologueComplete, true);
  assert.deepEqual(migrated8.game.dialogueThreads, []);
  assert.equal(migrated8.game.councilRecords[0].status, "convened");

  const migrated6 = save.migrateStoredGame({
    version: 6,
    chronicle: [{ id: "old-1", title: "旧章", week: 1, date: "旧日", sections: [] }],
  });
  assert.equal(migrated6.historicalOnly, true);
  assert.equal(migrated6.hasSave, true);
  assert.equal(migrated6.game.chronicle[0].id, "legacy-old-1");
  assert.match(migrated6.game.chronicle[0].title, /^旧历史分支/);
  assert.equal(save.migrateStoredGame({ version: 4 }), null);
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
