import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

function emptyDelta(game) {
  return {
    week: game.worldKernel.lastResolvedWeek + 1,
    playerIssuedNoOrders: true,
    executableProposalIds: [],
    mutationClaims: [],
    newActors: [], newFactions: [], newProjects: [],
    actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    events: [], observations: [], knowledge: [], knowledgeGrants: [], directiveInterruptions: [],
    canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
  };
}

test("TurnCommit isolates the input GameState when a late sidecar derivation fails", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { commitWorldTurn } = await loadRuntimeModule("app/turn-commit.ts");
  const { clearRuntimeTraces, recentRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const game = createInitialGame("seer");
  const before = structuredClone(game);
  clearRuntimeTraces();

  await assert.rejects(commitWorldTurn({
    baseGame: game,
    delta: emptyDelta(game),
    turnId: `world:${game.worldKernel.lastResolvedWeek + 1}`,
    deriveNextGame: ({ baseGame }) => {
      baseGame.evidenceNodes.push({ ...baseGame.evidenceNodes[0], id: "must-not-leak" });
      throw new Error("late-sidecar-failure");
    },
  }), /late-sidecar-failure/);

  assert.deepEqual(game, before);
  assert.equal(game.evidenceNodes.some((node) => node.id === "must-not-leak"), false);
  const trace = recentRuntimeTraces().findLast((item) => item.turnId === `world:${game.worldKernel.lastResolvedWeek + 1}`);
  assert.equal(trace?.commitStatus, "REJECTED");
  assert.equal(recentRuntimeTraces().some((item) => item.commitStatus === "COMMITTED"), false);
});

test("TurnCommit returns one candidate bound to the kernel transaction it committed", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { commitWorldTurn } = await loadRuntimeModule("app/turn-commit.ts");
  const { clearRuntimeTraces, recentRuntimeTraces } = await loadRuntimeModule("app/runtime-trace.ts");
  const game = createInitialGame("seer");
  const delta = emptyDelta(game);
  const turnId = `world:${delta.week}`;
  const forwarded = [];
  globalThis.window = { mistRuntimeTrace: { async record(trace) { forwarded.push(trace); return { available: true, saved: true }; } } };
  clearRuntimeTraces();

  try {
    const committed = await commitWorldTurn({
      baseGame: game,
      delta,
      turnId,
      deriveNextGame: ({ baseGame, worldKernel }) => ({ ...baseGame, worldKernel }),
    });

    assert.equal(committed.worldKernel.revision, game.worldKernel.revision + 1);
    assert.ok(committed.worldKernel.committedTransactions.some((item) => item.turnId === turnId));
    assert.notStrictEqual(committed, game);
    assert.deepEqual(game.worldKernel, createInitialGame("seer").worldKernel);
    assert.equal(recentRuntimeTraces().findLast((item) => item.turnId === turnId)?.commitStatus, "PENDING");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(forwarded.length, 0);
  } finally {
    delete globalThis.window;
  }
});
