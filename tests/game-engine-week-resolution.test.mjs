import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

test.after(() => closeRuntimeServer());

function contractArgs(game, intent = "核对公开报纸与失踪登记，只做来源比对。") {
  return { intent, game, leaderId: "organization", districtId: "cherwood", abilityIds: [] };
}

async function loadResolutionModules() {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const week = await loadRuntimeModule("app/game-engine/week-resolution.ts");
  return { engine, model, week };
}

test("week resolution owns the implementation and the game-engine facade re-exports it", async () => {
  const facade = await readFile("app/game-engine.ts", "utf8");
  const extracted = await readFile("app/game-engine/week-resolution.ts", "utf8");
  assert.match(extracted, /export function resolveWeek/);
  assert.match(facade, /export \{[^}]*resolveWeek[^}]*\} from "\.\/game-engine\/week-resolution\.ts"/);
  assert.doesNotMatch(facade, /export function resolveWeek/);
  assert.doesNotMatch(extracted, /from ["']\.\.\/game-engine(?:\.ts)?["']/);
});

test("empty week resolution remains deterministic and façade-equivalent", async () => {
  const { engine, model, week } = await loadResolutionModules();
  const game = model.createInitialGame("spectator");
  const facadeResult = engine.resolveWeek(game);
  const extractedResult = week.resolveWeek(structuredClone(game));

  assert.deepEqual(extractedResult, facadeResult);
  assert.equal(facadeResult.chapter.id, "chapter:1:rules");
  assert.equal(facadeResult.state.week, 2);
  assert.equal(facadeResult.chapter.source, "local");
  assert.equal(facadeResult.state.worldLedger.events.at(-1)?.kind, "phase-completed");
});

test("scheduled action resolution preserves outcome, resource, continuation, and ledger boundaries", async () => {
  const { engine, model, week } = await loadResolutionModules();
  const game = model.createInitialGame("seer");
  const contract = engine.localContract(contractArgs(game));
  const scheduled = engine.scheduleContract(game, contract);
  const facadeGame = { ...game, schedule: [scheduled] };
  const extractedGame = structuredClone(facadeGame);

  const facadeResult = engine.resolveWeek(facadeGame);
  const extractedResult = week.resolveWeek(extractedGame);

  assert.deepEqual(extractedResult, facadeResult);
  assert.equal(facadeResult.chapter.results.length, 1);
  assert.equal(facadeResult.chapter.results[0].id, scheduled.id);
  assert.ok(facadeResult.chapter.results[0].executionStatus);
  assert.equal(facadeResult.state.worldLedger.events.filter((event) => event.kind === "action-progressed").length, 1);
  assert.equal(facadeResult.state.week, game.week + 1);
  assert.equal(facadeResult.state.schedule.length, 0);
});

test("awaiting-authorization schedules remain excluded without changing the extracted boundary", async () => {
  const { engine, model, week } = await loadResolutionModules();
  const game = model.createInitialGame("spectator");
  const contract = engine.localContract(contractArgs(game, "调查公开报纸，但每一步先请示。"));
  const scheduled = engine.scheduleContract(game, contract);
  const blocked = {
    ...scheduled,
    execution: { ...scheduled.execution, status: "awaiting-authorization" },
  };
  const facadeResult = engine.resolveWeek({ ...game, schedule: [blocked] });
  const extractedResult = week.resolveWeek({ ...game, schedule: [blocked] });

  assert.deepEqual(extractedResult, facadeResult);
  assert.equal(facadeResult.chapter.results.length, 0);
  assert.equal(facadeResult.state.schedule.length, 1);
  assert.equal(facadeResult.state.schedule[0].execution.status, "awaiting-authorization");
});
