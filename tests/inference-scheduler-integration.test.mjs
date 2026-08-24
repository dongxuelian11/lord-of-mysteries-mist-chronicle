import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { createInferenceScheduler } from "../electron/inference-scheduler.cjs";
import { createSchedulerRuntimeTrace } from "../electron/inference-scheduler-trace.cjs";
import { createSqlitePersistenceStore } from "../electron/persistence-sqlite.cjs";
import { stablePersistenceOriginId } from "../electron/persistence-origin.cjs";

test("Main scheduler diagnostics persist to the durable origin without mixing world and agent keys", async () => {
  const root = String(process.env.GMZZ_STORAGE_ROOT ?? "").startsWith("D:\\") ? process.env.GMZZ_STORAGE_ROOT : path.resolve(".runtime");
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "scheduler-integration-"));
  const dbPath = path.join(directory, "scheduler.sqlite");
  const key = "mist-chronicle-complete-v21";
  const store = createSqlitePersistenceStore(dbPath, { clock: () => "2026-08-24T00:00:00.000Z" });
  try {
    store.commitTurn(key, JSON.stringify({
      version: 21,
      saveId: "scheduler-integration",
      worldLedger: { branchId: "main" },
      worldKernel: {
        revision: 1,
        committedTransactions: [{ turnId: "world:1", resolvingWeek: 1, baseRevision: 0, inputHash: "a".repeat(64) }],
        events: [],
        retrievalReceipts: [],
        mutationClaims: [],
      },
    }));
    let sequence = 0;
    const scheduler = createInferenceScheduler({
      sleep: async () => undefined,
      jitter: () => 0,
      onTrace: (event) => store.appendRuntimeTraces(key, [createSchedulerRuntimeTrace(event, ++sequence, 1_724_448_000_000 + sequence)]),
    });
    let attempts = 0;
    const world = await scheduler.run({ provider: "deepseek", task: "world-adjudication", idempotencyKey: "world:1:attempt:0" }, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("MODEL_HTTP_503");
      return "world-result";
    });
    assert.equal(world, "world-result");
    assert.equal(attempts, 2);
    assert.equal(await scheduler.run({ provider: "deepseek", task: "world-adjudication", idempotencyKey: "world:1:attempt:0" }, async () => "must-not-run"), "world-result");

    let deepCalls = 0;
    let compatibleCalls = 0;
    const sameKey = "same-visible-request-id";
    assert.equal(await scheduler.run({ provider: "deepseek", task: "autonomous-planning", idempotencyKey: sameKey }, async () => { deepCalls += 1; return "deep"; }), "deep");
    assert.equal(await scheduler.run({ provider: "compatible", task: "autonomous-planning", idempotencyKey: sameKey }, async () => { compatibleCalls += 1; return "compatible"; }), "compatible");
    assert.equal(deepCalls, 1);
    assert.equal(compatibleCalls, 1);

    const origin = stablePersistenceOriginId("scheduler-integration", "main");
    const traces = store.readRuntimeTraces(origin);
    assert.ok(traces.some((trace) => trace.modelId === "scheduler:retry"));
    assert.ok(traces.every((trace) => !Object.prototype.hasOwnProperty.call(trace, "prompt")));
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
