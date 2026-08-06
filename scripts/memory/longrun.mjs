// 动态记忆三条 50 周长线路线：保守经营 / 高冲突 / 原著偏离。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function routeGenerator(route, week) {
  const seeds = [];
  const characters = ["player", "mara", "rowan", "ines", "cedric", "audrey"];
  const partner = characters[(week * 3) % characters.length];
  if (route === "conservative") {
    seeds.push({
      kind: "event",
      sourceEventId: `c-${week}`,
      week,
      type: week % 6 === 0 ? "rescue" : "chat",
      summary: week % 6 === 0 ? `第${week}周救助了${partner}` : `第${week}周与${partner}正常往来`,
      participantIds: ["player", partner],
      observerIds: [characters[(week + 1) % characters.length]],
      importance: week % 6 === 0 ? 0.85 : 0.25,
      emotionalWeight: week % 6 === 0 ? 0.7 : 0.1,
      tags: week % 6 === 0 ? ["rescue", "relationship"] : ["chat"],
    });
    if (week % 6 === 0) {
      seeds.push({
        kind: "relationship",
        sourceEventId: `c-${week}`,
        fromCharacterId: partner,
        toCharacterId: "player",
        dimension: "trust",
        delta: 8,
        summary: "救助提升了信任",
        createdWeek: week,
        decayPolicy: "none",
      });
    }
  } else if (route === "conflict") {
    seeds.push({
      kind: "event",
      sourceEventId: `x-${week}`,
      week,
      type: week % 4 === 0 ? "betrayal" : week % 3 === 0 ? "severe-harm" : "conflict",
      summary: week % 4 === 0 ? `第${week}周${partner}背叛了组织` : `第${week}周与${partner}发生冲突`,
      participantIds: ["player", partner],
      observerIds: [characters[(week + 2) % characters.length]],
      importance: week % 4 === 0 ? 0.95 : 0.6,
      emotionalWeight: week % 4 === 0 ? 0.9 : 0.5,
      tags: week % 4 === 0 ? ["betrayal", "relationship"] : ["conflict"],
    });
    seeds.push({
      kind: "relationship",
      sourceEventId: `x-${week}`,
      fromCharacterId: "player",
      toCharacterId: partner,
      dimension: week % 4 === 0 ? "resentment" : "suspicion",
      delta: week % 4 === 0 ? -25 : -6,
      summary: week % 4 === 0 ? "重大背叛" : "冲突降低信任",
      createdWeek: week,
      decayPolicy: week % 4 === 0 ? "none" : "normal",
    });
    if (week % 7 === 0) {
      seeds.push({
        kind: "commitment",
        id: `x-commit-${week}`,
        type: "threat",
        debtorId: partner,
        participantIds: ["player", partner],
        summary: `第${week}周发出的警告`,
        createdWeek: week,
        dueWeek: week + 5,
        sourceEventId: `x-${week}`,
        importance: 0.7,
        secrecy: "secret",
      });
    }
  } else {
    seeds.push({
      kind: "event",
      sourceEventId: `d-${week}`,
      week,
      type: "worldline-pivot",
      summary: `第${week}周世界线偏离：原著节点被改变`,
      participantIds: ["player"],
      observerIds: ["mara"],
      importance: 0.9,
      emotionalWeight: 0.6,
      tags: ["worldline-pivot"],
    });
    if (week % 5 === 0) {
      seeds.push({
        kind: "plan",
        id: `d-plan-${week}`,
        ownerId: "player",
        participantIds: ["player", "mara"],
        title: `偏离路线的第${week}周计划`,
        objective: "按当前世界线推进",
        currentStep: `步骤${week}`,
        createdWeek: week,
        status: week % 10 === 0 ? "completed" : "active",
        secrecy: "restricted",
        importance: 0.75,
      });
    }
  }
  return seeds;
}

export async function runMemoryLongrun() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { emptyMemoryState, deriveMemory, buildSceneMemory, buildMemoryIndexes } = memoryModule;
  const registry = {
    characterIds: new Set(["player", "mara", "rowan", "ines", "cedric", "audrey"]),
    organizationIds: new Set(),
  };
  const results = {};
  const failures = [];
  for (const route of ["conservative", "conflict", "divergent"]) {
    let memory = emptyMemoryState();
    let ok = true;
    for (let week = 1; week <= 50; week += 1) {
      const seeds = routeGenerator(route, week);
      const derived = deriveMemory(memory, seeds, registry);
      memory = derived.state;
      // 不变量：事件按 sourceEventId 唯一；序列化往返一致
      const sources = new Set(memory.events.map((event) => event.sourceEventId));
      if (sources.size !== memory.events.length) {
        failures.push(`${route}: 第${week}周出现重复记忆事件`);
        ok = false;
      }
      const roundtrip = JSON.parse(JSON.stringify(memory));
      if (roundtrip.events.length !== memory.events.length) {
        failures.push(`${route}: 第${week}周序列化不一致`);
        ok = false;
      }
      if (week === 50) {
        const context = buildSceneMemory({ sceneType: "world", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50 });
        if (context.totalCharacters > 6000) {
          failures.push(`${route}: 第50周世界上下文超预算`);
          ok = false;
        }
      }
    }
    const worldFacts = memory.events.filter((event) => event.status === "active").length;
    results[route] = {
      events: memory.events.length,
      beliefs: memory.beliefs.length,
      commitments: memory.commitments.length,
      relationships: memory.relationshipCauses.length,
      plans: memory.plans.length,
      activeWorldFacts: worldFacts,
      ok,
    };
  }
  return { results, failures };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runMemoryLongrun();
  console.log("[memory:longrun]");
  for (const [route, stats] of Object.entries(result.results)) {
    console.log(`  ${route}: ${JSON.stringify(stats)}`);
  }
  if (result.failures.length) {
    console.log(`  失败：${result.failures.slice(0, 10).join("; ")}`);
  } else {
    console.log("  三条路线 50 周：无重复记忆、序列化一致、世界上下文有界");
  }
  const pass =
    result.failures.length === 0 &&
    Object.values(result.results).every((stats) => stats.ok && stats.activeWorldFacts >= 30);
  console.log(`[memory:longrun] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
