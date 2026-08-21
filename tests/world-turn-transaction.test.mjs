import assert from "node:assert/strict";
import test from "node:test";

import { applyWorldTurn, createWorldKernel, createWorldTurnTransaction, ensureWorldKernelTransactionState } from "../app/world-kernel.ts";

function seedKernel() {
  return createWorldKernel({
    week: 1,
    date: "1349年6月30日",
    factions: [],
    actors: [{ id: "observer", name: "观察者", locationId: "east", agenda: "记录变化" }],
    locations: [{ id: "east", name: "东区", risk: 40 }],
    timeline: [],
  });
}

function emptyDelta(week = 1) {
  return {
    week,
    playerIssuedNoOrders: true,
    actorUpdates: [],
    factionUpdates: [],
    projectUpdates: [],
    locationUpdates: [],
    events: [],
    observations: [],
  };
}

function committedDelta(kernel, delta, turnId = `test-turn:${delta.week}`) {
  return { ...delta, transaction: createWorldTurnTransaction(kernel, delta, turnId) };
}

test("世界事务必须携带稳定身份，并在提交时推进修订号", () => {
  const initial = seedKernel();
  const delta = { ...emptyDelta(), actorUpdates: [{ actorId: "observer", lastAction: "记录了街角的换岗" }] };
  const committed = applyWorldTurn(initial, committedDelta(initial, delta));

  assert.equal(committed.revision, 1);
  assert.equal(committed.lastResolvedWeek, 1);
  assert.equal(committed.committedTransactions.length, 1);
  assert.equal(committed.committedTransactions[0].turnId, "test-turn:1");
});

test("同一世界事务重放返回零差异，而不会再次推进修订号", () => {
  const initial = seedKernel();
  const delta = { ...emptyDelta(), actorUpdates: [{ actorId: "observer", lastAction: "记录了街角的换岗" }] };
  const committed = applyWorldTurn(initial, committedDelta(initial, delta));
  const replay = applyWorldTurn(committed, committedDelta(initial, delta));

  assert.strictEqual(replay, committed);
  assert.equal(replay.revision, 1);
  assert.equal(replay.actors[0].lastAction, "记录了街角的换岗");
});

test("过期基准修订号、错误周次和缺少事务身份都会被拒绝", () => {
  const initial = seedKernel();
  const delta = emptyDelta();
  const valid = createWorldTurnTransaction(initial, delta, "test-turn:1");

  assert.throws(
    () => applyWorldTurn(initial, { ...delta, transaction: { ...valid, baseRevision: 7 } }),
    /修订号/,
  );
  assert.throws(
    () => applyWorldTurn(initial, { ...delta, transaction: { ...valid, resolvingWeek: 2 } }),
    /周次/,
  );
  assert.throws(() => applyWorldTurn(initial, delta), /事务/);
});

test("同一类实体更新不得出现重复 ID", () => {
  const initial = seedKernel();
  const delta = {
    ...emptyDelta(),
    actorUpdates: [
      { actorId: "observer", lastAction: "第一次记录" },
      { actorId: "observer", lastAction: "第二次记录" },
    ],
  };
  assert.throws(
    () => applyWorldTurn(initial, committedDelta(initial, delta, "test-turn:duplicate")),
    /更新标识重复/,
  );
});

test("旧世界存档归一化时补齐事务修订状态，并保留已有世界字段", () => {
  const initial = seedKernel();
  const normalized = ensureWorldKernelTransactionState({
    ...initial,
    revision: undefined,
    committedTransactions: undefined,
  });

  assert.equal(normalized.revision, 0);
  assert.deepEqual(normalized.committedTransactions, []);
  assert.equal(normalized.actors[0].id, "observer");
});
