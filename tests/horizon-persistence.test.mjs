import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

function turnDelta(week, extra = {}) {
  return {
    week,
    playerIssuedNoOrders: true,
    newActors: [],
    newFactions: [],
    newProjects: [],
    actorUpdates: [],
    factionUpdates: [],
    projectUpdates: [],
    locationUpdates: [],
    events: [],
    observations: [],
    knowledge: [],
    ...extra,
  };
}

function applyCommittedTurn(applyWorldTurn, createWorldTurnTransaction, kernel, delta, turnId = `test:${delta.week}`) {
  return applyWorldTurn(kernel, { ...delta, transaction: createWorldTurnTransaction(kernel, delta, turnId) });
}

test("knowledgeHorizon：新世界推进一周后保留", async () => {
  const { createWorldKernel, applyWorldTurn, createWorldTurnTransaction } = await loadRuntimeModule("app/world-kernel.ts");
  const kernel = createWorldKernel({
    week: 1,
    date: "1349年6月30日",
    factions: [{ id: "f1", name: "甲", plan: "扩张", progress: 30 }],
    actors: [{ id: "a1", name: "乙", locationId: "east", agenda: "观察" }],
    locations: [{ id: "east", name: "东区", risk: 30 }],
    timeline: [],
  });
  assert.equal(kernel.canon.knowledgeHorizon.maxVolume, 1);
  const next = applyCommittedTurn(applyWorldTurn, createWorldTurnTransaction, kernel, turnDelta(1));
  assert.equal(next.canon.knowledgeHorizon.maxVolume, 1);
  assert.deepEqual(next.canon.knowledgeHorizon.revealedIdentityIds, ["周明瑞", "夏洛克·莫里亚蒂"]);
});

test("knowledgeHorizon：修改卷号/章节/身份/事件/偏转后推进仍保留", async () => {
  const { createWorldKernel, applyWorldTurn, createWorldTurnTransaction } = await loadRuntimeModule("app/world-kernel.ts");
  let kernel = createWorldKernel({
    week: 1,
    date: "1349年6月30日",
    factions: [],
    actors: [],
    locations: [],
    timeline: [],
  });
  kernel = {
    ...kernel,
    canon: {
      ...kernel.canon,
      knowledgeHorizon: {
        work: "LOTM",
        maxVolume: 3,
        maxAbsoluteChapter: 677,
        allowedEventIds: ["e-1"],
        revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂", "格尔曼·斯帕罗"],
        worldlineMode: "canon-diverged",
      },
    },
  };
  const next = applyCommittedTurn(
    applyWorldTurn,
    createWorldTurnTransaction,
    kernel,
    turnDelta(1, { canon: { mode: "diverging", deviationDelta: 3, pivotEventIds: ["e-1"] } })
  );
  const horizon = next.canon.knowledgeHorizon;
  assert.equal(horizon.maxVolume, 3);
  assert.equal(horizon.maxAbsoluteChapter, 677);
  assert.deepEqual(horizon.allowedEventIds, ["e-1"]);
  assert.ok(horizon.revealedIdentityIds.includes("格尔曼·斯帕罗"));
  assert.equal(horizon.worldlineMode, "canon-diverged");
  assert.equal(next.canon.mode, "diverging");
});

test("knowledgeHorizon：JSON 存档往返后保留，并连续推进 20 周", async () => {
  const { createWorldKernel, applyWorldTurn, createWorldTurnTransaction } = await loadRuntimeModule("app/world-kernel.ts");
  let kernel = createWorldKernel({
    week: 1,
    date: "1349年6月30日",
    factions: [],
    actors: [],
    locations: [],
    timeline: [],
  });
  kernel = JSON.parse(JSON.stringify(kernel));
  for (let week = 1; week <= 20; week += 1) {
    kernel = applyCommittedTurn(applyWorldTurn, createWorldTurnTransaction, kernel, turnDelta(week));
    kernel = JSON.parse(JSON.stringify(kernel));
  }
  assert.equal(kernel.canon.knowledgeHorizon.maxVolume, 1);
  assert.equal(kernel.canon.knowledgeHorizon.worldlineMode, "canon-aligned");
});

test("旧存档迁移：缺少 knowledgeHorizon 时补保守默认，已有则保留", async () => {
  const { ensureKnowledgeHorizon } = await loadRuntimeModule("app/save-system.ts");
  const oldGame = {
    worldKernel: { canon: { mode: "anchored", deviation: 5, pivotEventIds: ["x"] } },
  };
  ensureKnowledgeHorizon(oldGame);
  assert.equal(oldGame.worldKernel.canon.knowledgeHorizon.maxVolume, 1);
  assert.equal(oldGame.worldKernel.canon.mode, "anchored");
  assert.deepEqual(oldGame.worldKernel.canon.knowledgeHorizon.revealedIdentityIds, ["周明瑞", "夏洛克·莫里亚蒂"]);
  const existing = {
    worldKernel: {
      canon: {
        mode: "diverging",
        deviation: 20,
        pivotEventIds: ["y"],
        knowledgeHorizon: {
          work: "LOTM",
          maxVolume: 7,
          maxAbsoluteChapter: 1258,
          allowedEventIds: [],
          revealedIdentityIds: ["周明瑞"],
          worldlineMode: "canon-diverged",
        },
      },
    },
  };
  ensureKnowledgeHorizon(existing);
  assert.equal(existing.worldKernel.canon.knowledgeHorizon.maxVolume, 7);
  assert.equal(existing.worldKernel.canon.knowledgeHorizon.worldlineMode, "canon-diverged");
});
