import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

let moduleServer;

async function loadModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  return {
    engine: await moduleServer.ssrLoadModule("/app/game-engine.ts"),
    model: await moduleServer.ssrLoadModule("/app/game-model.ts"),
    causality: await moduleServer.ssrLoadModule("/app/chronicle-causality.ts"),
    highSequence: await moduleServer.ssrLoadModule("/app/high-sequence-ledger.ts"),
  };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

test("literary causal packs keep only player-visible events and compress the four player-facing answers", async () => {
  const { model, causality } = await loadModules();
  const game = model.createInitialGame("seer");
  game.worldKernel = {
    ...game.worldKernel,
    events: [
      { id: "event-visible", week: 1, title: "门锁更换", detail: "联络点换上了新的门锁。", locationId: "dock", actorIds: ["mara"], factionIds: [], causeIds: [], visibility: "public", witnessRefs: ["player"], sourceProposalIds: ["action:one"] },
      { id: "event-hidden", week: 1, title: "幕后追踪", detail: "敌对势力决定秘密追踪组织。", locationId: "dock", actorIds: [], factionIds: ["royal-project"], causeIds: [], visibility: "world", witnessRefs: [], sourceProposalIds: ["action:one"] },
    ],
  };
  const chapter = {
    id: "chapter:1:rules", week: 1, date: game.date, title: "门锁之后", source: "local", sections: [], summary: "",
    results: [{
      id: "action:one", title: "核验联络点", outcome: "成功", contract: { leaderId: "mara", memberIds: ["mara"] }, findings: [], consequence: "门锁已经更换。", abilityEffects: [], digestionGain: 0, missionProgress: 0, resourceChanges: { money: -10, secrecy: 0, stability: 0, influence: 0 },
      causalReceipts: {
        people: [], resources: [{ id: "receipt:resource", summary: "实际消耗资金10。", entityRefs: ["organization"], sourceEventIds: [] }],
        locations: [{ id: "receipt:visible", summary: "联络点换上了新的门锁。", entityRefs: ["location:dock"], sourceEventIds: ["event-visible"] }], knowledge: [], relationships: [{ id: "receipt:hidden", summary: "幕后追踪已经进入敌方计划。", entityRefs: [], sourceEventIds: ["event-hidden"] }], futureCauses: [{ id: "receipt:future", summary: "新门锁会影响下一次核验。", entityRefs: ["location:dock"], sourceEventIds: ["event-visible"] }],
      },
    }],
  };
  const pack = causality.buildLiteraryCausalPack(game, chapter);
  assert.deepEqual(pack.allowedEventIds, ["event-visible"]);
  assert.ok(pack.receipts.some((receipt) => receipt.id === "receipt:visible"));
  assert.ok(!pack.receipts.some((receipt) => receipt.id === "receipt:hidden"));
  assert.match(pack.summary, /发生变化：/);
  assert.match(pack.summary, /谁知道：你/);
  assert.match(pack.summary, /后续因果：/);
  assert.doesNotMatch(JSON.stringify(pack), /event-hidden|幕后追踪/);
});

test("literary prose gets paragraph-level sources while rules receipts remain unchanged", async () => {
  const { engine, model } = await loadModules();
  let game = model.createInitialGame("spectator");
  const contract = engine.localContract({ intent: "只整理本周已经持有的公开报纸，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
  const resolved = engine.resolveWeek(game);
  const chapter = resolved.chapter;
  const result = chapter.results[0];
  result.causalReceipts = {
    people: [], resources: [], locations: [], knowledge: [{ id: "receipt:knowledge", summary: "三份公开报纸的日期存在一日差异。", entityRefs: ["knowledge:paper"], sourceEventIds: ["event:paper"] }], relationships: [], futureCauses: [],
  };
  const visibleEvent = { id: "event:paper", week: chapter.week, title: "报纸日期差异", detail: "公开报纸的日期出现一日差异。", locationId: "cherwood", actorIds: [], factionIds: [], causeIds: [], visibility: "public", witnessRefs: ["player"], sourceProposalIds: [result.id] };
  const hiddenEvent = { id: "event:secret", week: chapter.week, title: "隐藏决策", detail: "幕后势力改变了计划。", locationId: "cherwood", actorIds: [], factionIds: [], causeIds: [], visibility: "world", witnessRefs: [], sourceProposalIds: [result.id] };
  const simulated = { ...resolved.state, worldKernel: { ...resolved.state.worldKernel, events: [...resolved.state.worldKernel.events, visibleEvent, hiddenEvent] }, chronicle: resolved.state.chronicle.map((item) => item.id === chapter.id ? { ...item, results: [result] } : item) };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let prompt = "";
  globalThis.window = globalThis;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    prompt = body.messages?.at(-1)?.content ?? "";
    const content = { title: "纸面差异", sections: [{ heading: "煤气灯下", paragraphs: ["三份公开报纸在煤气灯下摊开，日期的差异终于有了清楚的边缘。"], paragraphSources: [{ receiptIds: ["receipt:knowledge"], eventIds: ["event:paper"] }] }] };
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }) };
  };
  try {
    const literary = await engine.generateLiteraryChapter({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model", quality: "balanced" }, simulated, simulated.chronicle[0], () => {});
    assert.deepEqual(literary.results, simulated.chronicle[0].results);
    assert.deepEqual(literary.sections[0].paragraphSources, [{ receiptIds: ["receipt:knowledge"], eventIds: ["event:paper"] }]);
    assert.match(prompt, /receipt:knowledge/);
    assert.match(prompt, /event:paper/);
    assert.doesNotMatch(prompt, /event:secret|隐藏决策|幕后势力改变/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("sequence advancement creates a stage retrospective without rewriting prior chapters", async () => {
  const { engine, model, highSequence } = await loadModules();
  let game = model.createInitialGame("seer");
  game.currentSequence = 5;
  game.advancementProcess = { targetRank: 4, stage: "可以晋升", startedWeek: 2, formulaIntegrity: 100, brewIntegrity: 100, ritualIntegrity: 100, stabilization: 100, flaws: [], safeguards: [], log: [] };
  game.chronicle = [{ id: "old-chapter", week: 2, date: game.date, title: "旧纪事", source: "local", sections: [], results: [], summary: "旧历史" }];
  game.highSequenceLedger = highSequence.claimHighSequenceCharacteristic(game.highSequenceLedger, { pathwayId: "seer", sequence: 4, holderRef: "player", week: game.week, sourceEventId: "event:sequence-four" });
  const advanced = engine.advanceSequence(game);
  assert.equal(advanced.currentSequence, 4);
  assert.equal(advanced.chronicle[0].title, "阶段回望 · 序列4");
  assert.match(advanced.chronicle[0].summary, /阶段回望/);
  assert.equal(advanced.chronicle[1].id, "old-chapter");
});
