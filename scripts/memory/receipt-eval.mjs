// 动态记忆回执评测：成功/失败路径、重试幂等、审计淘汰、50 周路线与性能。
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";
import { runIntegrationEval } from "./integration-eval.mjs";

export async function runReceiptEval() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { emptyMemoryState, deriveMemory, submitMemoryDelivery, markMemoryPresented, markMemoryRecalled, runAcceptedModelCall } = memoryModule;
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  // 六类生产调用（集成评测已断言回执语义）
  const integration = await runIntegrationEval();
  failures.push(...integration.failures);

  // 失败路径：invoke 抛错 / 校验失败 → 正式回执为 0
  const { state } = deriveMemory(emptyMemoryState(), [
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "信念", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
  ]);
  const descriptor = { actionId: "a", modelCallId: "m", stage: "dialogue", audience: memoryModule.actorAudience("mara", true), memoryIds: [state.beliefs[0].id], week: 1 };
  await assert.rejects(
    runAcceptedModelCall({ state, descriptor, invoke: async () => { throw new Error("api-error"); }, validate: (value) => value }),
    /api-error/
  );
  check(state.receipts.length === 0, "失败调用回执=0");
  await assert.rejects(
    runAcceptedModelCall({ state, descriptor, invoke: async () => ({ bad: true }), validate: (value) => { if (!value.ok) throw new Error("schema-fail"); return value; } }),
    /schema-fail/
  );
  check(state.receipts.length === 0, "校验失败回执=0");

  // 成功路径 + 重试幂等
  const accepted = await runAcceptedModelCall({ state, descriptor, invoke: async () => ({ ok: true }), validate: (value) => value });
  check(accepted.memory.receipts.some((receipt) => receipt.kind === "delivered"), "成功调用 delivered");
  check(accepted.memory.receipts.some((receipt) => receipt.kind === "presented"), "actor 成功调用 presented");
  const retry = await runAcceptedModelCall({ state: accepted.memory, descriptor, invoke: async () => ({ ok: true }), validate: (value) => value });
  check(retry.memory.receipts.filter((receipt) => receipt.id === accepted.memory.receipts[accepted.memory.receipts.length - 1].id).length === 1, "重试不重复回执");

  // 审计淘汰后幂等仍成立
  let ledgerState = deriveMemory(emptyMemoryState(), [
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "信念", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
  ]).state;
  const beliefId = ledgerState.beliefs[0].id;
  ledgerState = markMemoryRecalled(ledgerState, { actionId: "old-recall", modelCallId: "old-recall", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [beliefId], week: 1 });
  const countBefore = ledgerState.audienceStates.find((item) => item.memoryId === beliefId).recallCount;
  for (let i = 0; i < 600; i += 1) {
    ledgerState = submitMemoryDelivery(ledgerState, { actionId: `fill-${i}`, modelCallId: `fill-${i}`, stage: "fill", audience: memoryModule.worldSystemAudience(), memoryIds: [beliefId], week: 1 });
  }
  check(ledgerState.receipts.length <= 500, `审计回执有界（${ledgerState.receipts.length}）`);
  ledgerState = markMemoryRecalled(ledgerState, { actionId: "old-recall", modelCallId: "old-recall", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [beliefId], week: 1 });
  check(ledgerState.audienceStates.find((item) => item.memoryId === beliefId).recallCount === countBefore, "回执淘汰后重放旧 recalled 不重复计数");

  // 1000 次幂等检查 P95<=5ms
  const idemTimes = [];
  for (let i = 0; i < 1000; i += 1) {
    const startedAt = performance.now();
    ledgerState = markMemoryRecalled(ledgerState, { actionId: "old-recall", modelCallId: "old-recall", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [beliefId], week: 1 });
    idemTimes.push(performance.now() - startedAt);
  }
  idemTimes.sort((a, b) => a - b);
  const idemP95 = idemTimes[Math.floor(idemTimes.length * 0.95)];
  check(idemP95 <= 5, `幂等检查 P95<=5ms（${idemP95.toFixed(2)}ms）`);
  check(ledgerState.audienceStates.find((item) => item.memoryId === beliefId).recallCount === countBefore, "1000 次幂等检查不重复计数");

  // 5000 次回执提交 P95<=10ms（含构建状态）
  const submitTimes = [];
  let submitState = emptyMemoryState();
  for (let i = 0; i < 5000; i += 1) {
    const startedAt = performance.now();
    submitState = submitMemoryDelivery(submitState, { actionId: `s-${i}`, modelCallId: `s-${i}`, stage: "bulk", audience: memoryModule.worldSystemAudience(), memoryIds: [], week: 1 });
    submitTimes.push(performance.now() - startedAt);
  }
  submitTimes.sort((a, b) => a - b);
  const submitP95 = submitTimes[Math.floor(submitTimes.length * 0.95)];
  check(submitP95 <= 10, `回执提交 P95<=10ms（${submitP95.toFixed(2)}ms）`);
  check(submitState.receipts.length <= 500, "5000 次提交后审计列表保持上限");

  // 100 次存档往返
  const serialized = JSON.parse(JSON.stringify(submitState));
  for (let i = 0; i < 100; i += 1) {
    const roundtrip = JSON.parse(JSON.stringify(serialized));
    check(roundtrip.receipts.length === serialized.receipts.length, `存档往返 ${i}`);
  }

  // 50 周路线：每周对话/议会/世界回执 + 失败重试；narrator 不提高激活度
  let routeMemory = deriveMemory(emptyMemoryState(), [
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "重要记忆", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
  ]).state;
  const importantId = routeMemory.beliefs[0].id;
  for (let week = 1; week <= 50; week += 1) {
    const dialogueDescriptor = { actionId: `d:${week}`, modelCallId: `d:${week}`, stage: "dialogue", audience: memoryModule.actorAudience("mara", true), memoryIds: [importantId], week };
    routeMemory = submitMemoryDelivery(routeMemory, dialogueDescriptor);
    routeMemory = markMemoryPresented(routeMemory, dialogueDescriptor);
    routeMemory = submitMemoryDelivery(routeMemory, { actionId: `w:${week}`, modelCallId: `w:${week}`, stage: "world", audience: memoryModule.worldSystemAudience(), memoryIds: [importantId], week });
    routeMemory = submitMemoryDelivery(routeMemory, { actionId: `l:${week}`, modelCallId: `l:${week}`, stage: "director", audience: memoryModule.narratorAudience(), memoryIds: [importantId], week });
    // 失败重试：不产生回执
    try {
      await runAcceptedModelCall({ state: routeMemory, descriptor: dialogueDescriptor, invoke: async () => { throw new Error("timeout"); }, validate: (value) => value });
    } catch {
      // 忽略
    }
    routeMemory = markMemoryRecalled(routeMemory, { actionId: `r:${week}`, modelCallId: `r:${week}`, stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [importantId], week });
  }
  const maraState = routeMemory.audienceStates.find(
    (item) => item.memoryId === importantId && item.audienceKind === "actor" && item.actorId === "mara"
  );
  check(maraState.lastPresentedWeek === 50, "重要 NPC 记忆 lastPresentedWeek 正确更新");
  check(maraState.recallCount === 50, "每周确定性回忆各计一次");
  check(routeMemory.receipts.length <= 500, "50 周路线回执列表有界");

  return { failures, perf: { idemP95Ms: Number(idemP95.toFixed(2)), submitP95Ms: Number(submitP95.toFixed(2)) }, receipts: routeMemory.receipts.length };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runReceiptEval();
  console.log("[memory:receipt:eval]");
  console.log(`  性能: ${JSON.stringify(result.perf)} 最终回执=${result.receipts}`);
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项：${result.failures.slice(0, 12).join("; ")}`);
  } else {
    console.log("  六类生产调用、失败路径、重试幂等、审计淘汰、50 周路线全部通过");
  }
  const pass = result.failures.length === 0;
  console.log(`[memory:receipt:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
