// 受众隔离评测：多角色共享事件、玩家/NPC 隔离、激活评分隔离、淘汰后幂等、50 周路线与性能。
import { performance } from "node:perf_hooks";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runAudienceEval() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { emptyMemoryState, deriveMemory, markMemoryPresented, markMemoryRecalled, submitMemoryDelivery, buildMemoryIndexes, buildSceneMemory, beliefActivation } = memoryModule;
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const registry = { characterIds: new Set(["player", "mara", "rowan", "ines", "cedric"]), organizationIds: new Set() };
  const { state } = deriveMemory(emptyMemoryState(), [
    { kind: "event", sourceEventId: "e-shared", week: 3, type: "rescue", summary: "玩家救助玛拉（罗文旁观）", participantIds: ["player", "mara"], observerIds: ["rowan"], importance: 0.9, emotionalWeight: 0.8, tags: ["rescue"] },
    { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", propositionKey: "p1", claim: "玛拉记得被救", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e-shared" }, validFromWeek: 3 },
    { kind: "belief", characterId: "rowan", subjectId: "s2", claimType: "c", propositionKey: "p2", claim: "罗文记得旁观", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "e-shared" }, validFromWeek: 3 },
  ], registry);
  const eventId = state.events[0].id;
  const maraBeliefId = state.beliefs.find((belief) => belief.characterId === "mara").id;
  const rowanBeliefId = state.beliefs.find((belief) => belief.characterId === "rowan").id;
  const stateOf = (memory, memoryId, actorId) =>
    memory.audienceStates.find((item) => item.memoryId === memoryId && item.audienceKind === "actor" && item.actorId === actorId);

  // 1. 多角色共享事件：A 展示 10 次 → 只更新 A；B/玩家不变
  let current = state;
  for (let i = 0; i < 10; i += 1) {
    current = markMemoryPresented(current, { actionId: `pa-${i}`, modelCallId: `pa-${i}`, stage: "dialogue", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 20 });
  }
  check(stateOf(current, maraBeliefId, "mara")?.presentationCount === 10, "A 展示 10 次");
  check(stateOf(current, maraBeliefId, "rowan") === undefined, "B 展示不变");
  check(!current.audienceStates.some((item) => item.audienceKind === "player" && item.memoryId === maraBeliefId), "玩家展示不变");
  // 2. A 与 B 同周分别 recalled；A 同周重复不叠加；A 下周可再 +1；B 独立
  current = markMemoryRecalled(current, { actionId: "ra-1", modelCallId: "ra-1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "rb-1", modelCallId: "rb-1", stage: "confirmed", audience: memoryModule.actorAudience("rowan", true), memoryIds: [rowanBeliefId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "ra-1", modelCallId: "ra-1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "ra-2", modelCallId: "ra-2", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 21 });
  check(stateOf(current, maraBeliefId, "mara")?.recallCount === 2, "A 同周去重+下周新增");
  check(stateOf(current, rowanBeliefId, "rowan")?.recallCount === 1, "B 独立一次");
  // 3. 玩家与 NPC 隔离
  current = markMemoryPresented(current, { actionId: "pp-1", modelCallId: "pp-1", stage: "player", audience: memoryModule.playerAudience(true), memoryIds: [eventId], week: 20 });
  current = markMemoryRecalled(current, { actionId: "pr-1", modelCallId: "pr-1", stage: "confirmed", audience: memoryModule.playerAudience(true), memoryIds: [eventId], week: 20 });
  const playerState = current.audienceStates.find((item) => item.audienceKind === "player" && item.memoryId === eventId);
  check(playerState?.recallCount === 1, "玩家 recalled 独立");
  check(stateOf(current, maraBeliefId, "mara")?.recallCount === 2, "NPC 计数不受玩家影响");
  // 4. narrator/world ×100 无副作用
  const beforeAudience = JSON.stringify(current.audienceStates);
  for (let i = 0; i < 100; i += 1) {
    current = submitMemoryDelivery(current, { actionId: `n-${i}`, modelCallId: `n-${i}`, stage: "director", audience: memoryModule.narratorAudience(), memoryIds: [eventId, maraBeliefId], week: 30 });
    current = submitMemoryDelivery(current, { actionId: `w-${i}`, modelCallId: `w-${i}`, stage: "world", audience: memoryModule.worldSystemAudience(), memoryIds: [eventId], week: 30 });
  }
  check(JSON.stringify(current.audienceStates) === beforeAudience, "narrator/world 无副作用");
  // 5. 激活评分隔离：A 高频 recalled > B 低频 > 玩家 presented-only（同一事件）
  const aScore = beliefActivation(current.beliefs.find((belief) => belief.id === maraBeliefId), 50, 0, 1, stateOf(current, maraBeliefId, "mara")?.recallCount ?? 0);
  const bScore = beliefActivation(current.beliefs.find((belief) => belief.id === rowanBeliefId), 50, 0, 1, stateOf(current, rowanBeliefId, "rowan")?.recallCount ?? 0);
  check(aScore > bScore, "A 激活度高于 B（仅由各自受众状态决定）");
  // 6. 审计淘汰后按受众幂等
  for (let i = 0; i < 600; i += 1) {
    current = submitMemoryDelivery(current, { actionId: `fill-${i}`, modelCallId: `fill-${i}`, stage: "fill", audience: memoryModule.worldSystemAudience(), memoryIds: [], week: 1 });
  }
  check(current.receipts.length <= 500, "审计回执有界");
  current = markMemoryRecalled(current, { actionId: "ra-1", modelCallId: "ra-1", stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [maraBeliefId], week: 20 });
  check(stateOf(current, maraBeliefId, "mara")?.recallCount === 2, "淘汰后重放 A 不重复");
  current = markMemoryRecalled(current, { actionId: "rb-1", modelCallId: "rb-1", stage: "confirmed", audience: memoryModule.actorAudience("rowan", true), memoryIds: [rowanBeliefId], week: 20 });
  check(stateOf(current, rowanBeliefId, "rowan")?.recallCount === 1, "淘汰后 B 仍独立计数");
  // 7. 存档往返 ×100
  const serialized = JSON.stringify(current);
  for (let i = 0; i < 100; i += 1) {
    const roundtrip = JSON.parse(serialized);
    check(roundtrip.audienceStates.length === current.audienceStates.length, `存档往返 ${i}`);
  }
  // 8. 50 周路线：A 频繁、B 沉默、玩家偶尔、narrator/world 每周
  let route = state;
  for (let week = 1; week <= 50; week += 1) {
    route = markMemoryPresented(route, { actionId: `d-${week}`, modelCallId: `d-${week}`, stage: "dialogue", audience: memoryModule.actorAudience("mara", true), memoryIds: [eventId], week });
    if (week === 20) route = markMemoryRecalled(route, { actionId: `ra-${week}`, modelCallId: `ra-${week}`, stage: "confirmed", audience: memoryModule.actorAudience("mara", true), memoryIds: [eventId], week });
    if (week === 30) route = markMemoryRecalled(route, { actionId: `rb-${week}`, modelCallId: `rb-${week}`, stage: "confirmed", audience: memoryModule.actorAudience("rowan", true), memoryIds: [eventId], week });
    if (week === 40) route = markMemoryRecalled(route, { actionId: `pr-${week}`, modelCallId: `pr-${week}`, stage: "confirmed", audience: memoryModule.playerAudience(true), memoryIds: [eventId], week });
    route = submitMemoryDelivery(route, { actionId: `n-${week}`, modelCallId: `n-${week}`, stage: "director", audience: memoryModule.narratorAudience(), memoryIds: [eventId], week });
    route = submitMemoryDelivery(route, { actionId: `w-${week}`, modelCallId: `w-${week}`, stage: "world", audience: memoryModule.worldSystemAudience(), memoryIds: [eventId], week });
  }
  const a50 = route.audienceStates.find((item) => item.memoryId === eventId && item.actorId === "mara");
  const b50 = route.audienceStates.find((item) => item.memoryId === eventId && item.actorId === "rowan");
  const p50 = route.audienceStates.find((item) => item.memoryId === eventId && item.audienceKind === "player");
  check(a50.recallCount === 1 && a50.lastPresentedWeek === 50, "A 第20周回忆+第50周展示");
  check(b50.recallCount === 1 && b50.lastPresentedWeek === undefined, "B 第30周回忆，展示不串线");
  check(p50.recallCount === 1, "玩家第40周回忆");
  check(route.events.some((event) => event.id === eventId), "世界事件事实始终存在");
  const context = buildSceneMemory({ sceneType: "dialogue", state: route, indexes: buildMemoryIndexes(route), currentWeek: 50, actorId: "mara" });
  check(context.totalCharacters <= 3000, "Prompt 预算有界");
  const invisible = buildSceneMemory({ sceneType: "dialogue", state: route, indexes: buildMemoryIndexes(route), currentWeek: 50, actorId: "cedric" });
  check(invisible.worldFacts.length === 0, "无权限角色始终不知道");
  // 9. 性能：30k 受众状态 + 5k presented + 5k recalled + 1k 幂等
  const perfSeeds = [];
  const chars = Array.from({ length: 100 }, (_, index) => `c${index}`);
  for (let index = 0; index < 10000; index += 1) {
    perfSeeds.push({ kind: "event", sourceEventId: `pe-${index}`, week: 1 + (index % 60), type: "chat", summary: `e${index}`, participantIds: [chars[index % 100], chars[(index + 1) % 100]], observerIds: [], importance: 0.3 });
  }
  let perfState = deriveMemory(emptyMemoryState(), perfSeeds).state;
  // 预填充 30,000 条受众状态（100 角色 × 分布到 10k 记忆）
  for (let i = 0; i < 30000; i += 1) {
    const actor = chars[i % 100];
    const block = Math.floor(i / 100);
    const memoryIdx = (block + (i % 100) * 300) % perfState.events.length;
    const memoryId = perfState.events[memoryIdx].id;
    perfState = markMemoryPresented(perfState, { actionId: `pre-${i}`, modelCallId: `pre-${i}`, stage: "prefill", audience: memoryModule.actorAudience(actor, true), memoryIds: [memoryId], week: 1 + (i % 50) });
  }
  const presentedTimes = [];
  const recalledTimes = [];
  for (let i = 0; i < 5000; i += 1) {
    const actor = chars[i % 100];
    const memoryId = perfState.events[(i * 11) % perfState.events.length].id;
    let start = performance.now();
    perfState = markMemoryPresented(perfState, { actionId: `pa-${i}`, modelCallId: `pa-${i}`, stage: "dialogue", audience: memoryModule.actorAudience(actor, true), memoryIds: [memoryId], week: 1 + (i % 50) });
    presentedTimes.push(performance.now() - start);
    start = performance.now();
    perfState = markMemoryRecalled(perfState, { actionId: `pr-${i}`, modelCallId: `pr-${i}`, stage: "confirmed", audience: memoryModule.actorAudience(actor, true), memoryIds: [memoryId], week: 1 + (i % 50) });
    recalledTimes.push(performance.now() - start);
  }
  const p95 = (times) => { const sorted = [...times].sort((a, b) => a - b); return sorted[Math.floor(sorted.length * 0.95)]; };
  const presentedP95 = p95(presentedTimes);
  const recalledP95 = p95(recalledTimes);
  check(presentedP95 <= 10, `presented P95<=10ms（${presentedP95.toFixed(2)}）`);
  check(recalledP95 <= 10, `recalled P95<=10ms（${recalledP95.toFixed(2)}）`);
  const audienceCount = perfState.audienceStates.length;
  check(audienceCount >= 30000, `受众状态 >=30000（${audienceCount}）`);
  const queryTimes = [];
  const perfIndexes = buildMemoryIndexes(perfState);
  for (let i = 0; i < 1000; i += 1) {
    const start = performance.now();
    buildSceneMemory({ sceneType: "dialogue", state: perfState, indexes: perfIndexes, currentWeek: 60, actorId: chars[i % 100] });
    queryTimes.push(performance.now() - start);
  }
  const queryP95 = p95(queryTimes);
  check(queryP95 <= 10, `受众查询 P95<=10ms（${queryP95.toFixed(2)}）`);
  return { failures, perf: { presentedP95Ms: Number(presentedP95.toFixed(2)), recalledP95Ms: Number(recalledP95.toFixed(2)), queryP95Ms: Number(queryP95.toFixed(2)), audienceCount } };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runAudienceEval();
  console.log("[memory:audience:eval]");
  console.log(`  性能: ${JSON.stringify(result.perf)}`);
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项：${result.failures.slice(0, 12).join("; ")}`);
  } else {
    console.log("  多角色共享事件、玩家/NPC 隔离、narrator/world 无副作用、激活隔离、淘汰后幂等、50 周路线全部通过");
  }
  const pass = result.failures.length === 0;
  console.log(`[memory:audience:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
