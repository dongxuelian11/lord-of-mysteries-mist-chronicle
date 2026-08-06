// 动态记忆压力测试：1k/5k/10k 事件 + 派生记忆，检索 P95 与内存趋势。
import { performance } from "node:perf_hooks";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function generateScale(memoryModule, eventCount) {
  const { emptyMemoryState, deriveMemory } = memoryModule;
  const seeds = [];
  const characters = Array.from({ length: 100 }, (_, index) => `c${index}`);
  for (let index = 0; index < eventCount; index += 1) {
    const from = characters[index % characters.length];
    const to = characters[(index * 7 + 3) % characters.length];
    seeds.push({
      kind: "event",
      sourceEventId: `e-${eventCount}-${index}`,
      week: 1 + (index % 60),
      type: index % 10 === 0 ? "betrayal" : index % 6 === 0 ? "rescue" : "chat",
      summary: `第 ${index} 条事件`,
      participantIds: [from, to],
      observerIds: [characters[(index + 1) % characters.length]],
      importance: index % 10 === 0 ? 0.9 : 0.3,
      emotionalWeight: index % 10 === 0 ? 0.8 : 0.2,
      tags: index % 10 === 0 ? ["betrayal"] : ["chat"],
    });
    seeds.push({
      kind: "relationship",
      sourceEventId: `e-${eventCount}-${index}`,
      fromCharacterId: from,
      toCharacterId: to,
      dimension: index % 2 === 0 ? "trust" : "suspicion",
      delta: index % 2 === 0 ? 5 : -5,
      summary: `关系变化 ${index}`,
      createdWeek: 1 + (index % 60),
      decayPolicy: index % 10 === 0 ? "none" : "normal",
    });
    seeds.push({
      kind: "belief",
      characterId: to,
      subjectId: `subject-${index % 40}`,
      claimType: "observation",
      claim: `信念 ${index}`,
      confidence: 0.7,
      truthStatus: "uncertain",
      learnedFrom: { type: "observed", sourceId: `e-${eventCount}-${index}` },
      validFromWeek: 1 + (index % 60),
      secrecy: "restricted",
      importance: 0.5,
    });
    if (index % 2 === 0) {
      seeds.push({
        kind: "commitment",
        id: `cm-${eventCount}-${index}`,
        type: "agreement",
        participantIds: [from, to],
        summary: `约定 ${index}`,
        createdWeek: 1 + (index % 60),
        dueWeek: 1 + ((index + 5) % 60),
        sourceEventId: `e-${eventCount}-${index}`,
        importance: 0.5,
        secrecy: "restricted",
      });
    }
    if (index % 2 === 1) {
      seeds.push({
        kind: "plan",
        id: `p-${eventCount}-${index}`,
        ownerId: from,
        participantIds: [from, to],
        title: `计划 ${index}`,
        objective: `目标 ${index}`,
        currentStep: `步骤 ${index}`,
        createdWeek: 1 + (index % 60),
        status: index % 20 === 0 ? "completed" : "active",
        secrecy: "restricted",
        importance: 0.6,
      });
    }
  }
  const derivedCount =
    seeds.filter((seed) => seed.kind !== "event").length;
  const { state } = deriveMemory(emptyMemoryState(), seeds);
  return { state, eventCount, derivedCount };
}

export async function runMemoryBenchmark() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { buildMemoryIndexes, buildSceneMemory } = memoryModule;
  const scales = [1000, 5000, 10000].map((count) => generateScale(memoryModule, count));
  const rows = [];
  const memoryBefore = process.memoryUsage().heapUsed;
  for (const scale of scales) {
    const indexes = buildMemoryIndexes(scale.state);
    const latencies = [];
    for (let i = 0; i < 1000; i += 1) {
      const actorId = `c${i % 100}`;
      const startedAt = performance.now();
      buildSceneMemory({
        sceneType: "dialogue",
        state: scale.state,
        indexes,
        currentWeek: 60,
        actorId,
        queryTags: i % 3 === 0 ? ["betrayal"] : ["chat"],
      });
      latencies.push(performance.now() - startedAt);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    rows.push({
      events: scale.eventCount,
      derived: scale.derivedCount,
      p95Ms: Number(p95.toFixed(2)),
      maxMs: Number(latencies[latencies.length - 1].toFixed(2)),
    });
  }
  const memoryAfter = process.memoryUsage().heapUsed;
  return { rows, memoryDeltaMb: Number(((memoryAfter - memoryBefore) / 1048576).toFixed(1)) };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runMemoryBenchmark();
  console.log("[memory:benchmark]");
  for (const row of result.rows) {
    console.log(`  事件=${row.events} 派生记忆=${row.derived} 检索P95=${row.p95Ms}ms max=${row.maxMs}ms`);
  }
  console.log(`  进程堆增量=${result.memoryDeltaMb}MB`);
  const pass =
    result.rows.every((row) => row.p95Ms <= 50) &&
    result.rows[2].derived >= 30000 &&
    result.memoryDeltaMb < 400;
  console.log(`[memory:benchmark] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
