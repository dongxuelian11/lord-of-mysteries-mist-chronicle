// 受众隔离审计：共享对象不再承载权威 recall、幂等账本按受众、narrator/world 无副作用、迁移正确。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runAudienceAudit() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { emptyMemoryState, deriveMemory, ensureAudienceStates, markMemoryRecalled, submitMemoryDelivery, audienceKey } = memoryModule;
  const registry = { characterIds: new Set(["player", "mara", "rowan", "ines", "cedric"]), organizationIds: new Set() };
  const findings = [];
  const { state } = deriveMemory(
    emptyMemoryState(),
    [
      { kind: "event", sourceEventId: "e-shared", week: 3, type: "rescue", summary: "玩家救助玛拉（罗文旁观）", participantIds: ["player", "mara"], observerIds: ["rowan"], importance: 0.9, emotionalWeight: 0.8, tags: ["rescue"] },
      { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "玛拉记得被救", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e-shared" }, validFromWeek: 3 },
      { kind: "belief", characterId: "rowan", subjectId: "s2", claimType: "c", propositionKey: "p2", claim: "罗文记得旁观", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e-shared" }, validFromWeek: 3 },
    ],
    registry
  );
  const eventId = state.events[0].id;
  const maraBeliefId = state.beliefs.find((belief) => belief.characterId === "mara").id;
  const rowanBeliefId = state.beliefs.find((belief) => belief.characterId === "rowan").id;

  let current = state;
  // A、B 同周分别 recalled + A 同周重复 + A 下周再回忆
  current = markMemoryRecalled(current, { actionId: "r-a-1", modelCallId: "r-a-1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "r-b-1", modelCallId: "r-b-1", stage: "confirmed", audience: memoryModule.actorAudience("rowan", true), memoryIds: [rowanBeliefId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "r-a-1", modelCallId: "r-a-1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "r-a-2", modelCallId: "r-a-2", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 21 });
  const stateOf = (memoryId, actorId) =>
    current.audienceStates.find((item) => item.memoryId === memoryId && item.audienceKind === "actor" && item.actorId === actorId);
  if (stateOf(maraBeliefId, "mara")?.recallCount !== 2) findings.push("mara-recall-count");
  if (stateOf(rowanBeliefId, "rowan")?.recallCount !== 1) findings.push("rowan-recall-count");
  if (stateOf(maraBeliefId, "rowan")) findings.push("mara-state-on-rowan");
  if (current.beliefs.find((belief) => belief.id === maraBeliefId).recallCount !== 0) {
    findings.push("shared-belief-still-authoritative");
  }
  // narrator/world 100 次不产生受众状态
  for (let i = 0; i < 100; i += 1) {
    current = submitMemoryDelivery(current, { actionId: `n-${i}`, modelCallId: `n-${i}`, stage: "director", audience: memoryModule.narratorAudience(), memoryIds: [eventId, maraBeliefId], week: 1 });
    current = submitMemoryDelivery(current, { actionId: `w-${i}`, modelCallId: `w-${i}`, stage: "world", audience: memoryModule.worldSystemAudience(), memoryIds: [eventId], week: 1 });
  }
  const narratorWorldStates = current.audienceStates.filter((item) => item.audienceKind !== "actor" && item.audienceKind !== "player");
  if (narratorWorldStates.length) findings.push("narrator-world-audience-state");
  if (current.audienceStates.filter((item) => item.memoryId === eventId).length) {
    findings.push("event-should-not-have-default-audience-state");
  }
  // 幂等账本按受众
  const ledger = current.receiptLedger.recalledByAudience ?? {};
  if (!ledger["actor:mara"]?.[maraBeliefId]?.includes(20)) findings.push("ledger-mara-week20");
  if (!ledger["actor:rowan"]?.[rowanBeliefId]?.includes(20)) findings.push("ledger-rowan-week20");
  if (ledger["actor:mara"]?.[maraBeliefId]?.filter((week) => week === 20).length !== 1) findings.push("ledger-mara-dedupe");
  if (!ledger["actor:mara"]?.[maraBeliefId]?.includes(21)) findings.push("ledger-mara-week21");
  // 迁移：旧信念字段 → 该角色受众状态（不复制给其他角色）
  const legacy = {
    ...emptyMemoryState(),
    beliefs: [{
      id: "mem:belief:legacy:1",
      characterId: "ines",
      subjectId: "old",
      claimType: "c",
      claim: "旧",
      confidence: 0.8,
      truthStatus: "true",
      learnedFrom: { type: "observed", sourceId: "e1" },
      validFromWeek: 1,
      secrecy: "restricted",
      active: true,
      contradictedBy: [],
      importance: 0.5,
      emotionalWeight: 0.4,
      lastPresentedWeek: 5,
      lastRecalledWeek: 7,
      recallCount: 3,
    }],
  };
  const migrated1 = ensureAudienceStates(legacy);
  const migrated2 = ensureAudienceStates(migrated1);
  const inesState = migrated2.audienceStates.find((item) => item.memoryId === "mem:belief:legacy:1" && item.actorId === "ines");
  if (!inesState || inesState.recallCount !== 3) findings.push("migration-recall");
  if (migrated2.audienceStates.length !== 1) findings.push("migration-idempotent");
  if (migrated2.audienceStates.some((item) => item.actorId !== "ines")) findings.push("migration-cross-actor");
  // 不可见角色（cedric 无权）无状态
  if (current.audienceStates.some((item) => item.actorId === "cedric")) findings.push("invisible-actor-state");
  return { findings, audiences: current.audienceStates.length, ledgerKeys: Object.keys(ledger).length, audienceKeyFn: typeof audienceKey === "function" };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runAudienceAudit();
  console.log("[memory:audience:audit]");
  console.log(`  受众状态=${result.audiences} 账本受众键=${result.ledgerKeys}`);
  if (result.findings.length) {
    console.log(`  发现：${result.findings.join("; ")}`);
  } else {
    console.log("  共享对象纯内容、受众级幂等、narrator/world 无副作用、迁移正确");
  }
  const pass = result.findings.length === 0;
  console.log(`[memory:audience:audit] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
