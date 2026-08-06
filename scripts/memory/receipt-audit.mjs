// 动态记忆回执审计：受众语义、重复回执、幂等账本、actor 隔离与有界性。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runReceiptAudit() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { emptyMemoryState, deriveMemory, submitMemoryDelivery, markMemoryPresented, markMemoryRecalled } = memoryModule;
  const registry = { characterIds: new Set(["player", "mara", "rowan"]), organizationIds: new Set() };
  const { state } = deriveMemory(
    emptyMemoryState(),
    [
      { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "玛拉信念", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e1" }, validFromWeek: 1 },
      { kind: "belief", characterId: "rowan", subjectId: "s2", claimType: "c", propositionKey: "p2", claim: "罗文秘密", confidence: 0.8, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e2" }, validFromWeek: 1 },
      { kind: "event", sourceEventId: "e1", week: 1, type: "chat", summary: "事件", participantIds: ["player", "mara"], observerIds: [] },
    ],
    registry
  );
  const maraId = state.beliefs.find((belief) => belief.characterId === "mara").id;
  const rowanId = state.beliefs.find((belief) => belief.characterId === "rowan").id;
  const findings = [];

  let current = state;
  current = submitMemoryDelivery(current, { actionId: "lit:1", modelCallId: "lit:1:director", stage: "director", audience: memoryModule.narratorAudience(), memoryIds: [maraId], week: 1 });
  current = submitMemoryDelivery(current, { actionId: "world:1", modelCallId: "world:1", stage: "world", audience: memoryModule.worldSystemAudience(), memoryIds: [maraId], week: 1 });
  current = markMemoryPresented(current, { actionId: "dialogue:1:mara", modelCallId: "dialogue:1:mara:x", stage: "dialogue", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraId], week: 1 });
  current = markMemoryPresented(current, { actionId: "dialogue:1:rowan", modelCallId: "dialogue:1:rowan:x", stage: "dialogue", audience: memoryModule.actorAudience("rowan", true), memoryIds: [rowanId], week: 1 });
  current = markMemoryRecalled(current, { actionId: "recall:1", modelCallId: "recall:1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraId], week: 2 });
  current = markMemoryRecalled(current, { actionId: "recall:1", modelCallId: "recall:1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraId], week: 2 });
  // 非法：narrator/world 提交 presented/recalled 应被忽略（接口不调用，但审计防御性检查）
  current = markMemoryPresented(current, { actionId: "bad:1", modelCallId: "bad:1", stage: "world", audience: memoryModule.worldSystemAudience(), memoryIds: [maraId], week: 1 });
  current = markMemoryRecalled(current, { actionId: "bad:2", modelCallId: "bad:2", stage: "director", audience: memoryModule.narratorAudience(), memoryIds: [maraId], week: 1 });

  const ids = new Set(current.receipts.map((receipt) => receipt.id));
  if (ids.size !== current.receipts.length) findings.push("duplicate-receipt-id");
  for (const receipt of current.receipts) {
    if (!receipt.accepted) findings.push(`receipt-not-accepted:${receipt.id}`);
    if (["narrator", "world-system"].includes(receipt.audience.kind) && receipt.kind !== "delivered") {
      findings.push(`narrator-world-wrong-kind:${receipt.id}`);
    }
    if (receipt.audience.kind === "actor" && receipt.kind === "presented") {
      for (const memoryId of receipt.memoryIds) {
        const belief = current.beliefs.find((item) => item.id === memoryId);
        if (belief && belief.characterId !== receipt.audience.actorId) {
          findings.push(`actor-isolation-leak:${receipt.id}:${memoryId}`);
        }
      }
    }
  }
  if (!current.receiptLedger || typeof current.receiptLedger.recalledWeeks !== "object") {
    findings.push("receipt-ledger-missing");
  }
  const maraState = current.audienceStates.find(
    (item) => item.memoryId === maraId && item.audienceKind === "actor" && item.actorId === "mara"
  );
  if (!maraState || maraState.recallCount !== 1) findings.push(`recalled-idempotency:${maraState?.recallCount}`);
  if (!maraState || maraState.lastPresentedWeek !== 1) findings.push(`presented-week:${maraState?.lastPresentedWeek}`);
  const maraPresented = current.receipts.filter((receipt) => receipt.audience.actorId === "mara" && receipt.kind === "presented");
  if (maraPresented.some((receipt) => receipt.memoryIds.includes(rowanId))) {
    findings.push("rowan-secret-in-mara-presented");
  }
  if (current.receipts.length > 500) findings.push("receipts-over-limit");
  return { findings, receipts: current.receipts.length, recallCount: maraState?.recallCount ?? 0, lastPresentedWeek: maraState?.lastPresentedWeek };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runReceiptAudit();
  console.log("[memory:receipt:audit]");
  console.log(`  回执=${result.receipts} recallCount=${result.recallCount} lastPresentedWeek=${result.lastPresentedWeek}`);
  if (result.findings.length) {
    console.log(`  发现：${result.findings.join("; ")}`);
  } else {
    console.log("  受众语义、幂等账本、actor 隔离、回执有界与重复检查全部通过");
  }
  const pass = result.findings.length === 0 && result.recallCount === 1;
  console.log(`[memory:receipt:audit] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
