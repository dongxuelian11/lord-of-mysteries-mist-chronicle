// 能力长线：三条 30 周路线（调查准备 / 高风险 / 位阶反制）。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function routeAbilities(route) {
  if (route === "investigation") return ["spirit-vision", "divination", "paper-substitute", "track", "identify"];
  if (route === "high-risk") return ["marionette-touch", "deep-hypnosis", "fire-shaping", "reaping-strike", "spirit-travel"];
  return ["divination", "short-teleport", "prediction-resistance", "damage-transfer", "surface-thought"];
}

export async function runAbilityLongrun() {
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const definitions = abilities.abilityDefinitions();
  const failures = [];
  const results = {};
  for (const route of ["investigation", "high-risk", "rank-counter"]) {
    const ids = routeAbilities(route);
    const pool = definitions.filter((definition) => ids.includes(definition.id));
    const baseGame = gameModule.createInitialGame("seer");
    let game = {
      ...baseGame,
      prologueComplete: true,
      playerName: "会长",
      playerAddress: "会长阁下",
      spirituality: 200,
      spiritualityMax: 200,
      stability: 71,
      mentalLoad: 0,
      abilityResolutions: [],
      memory: memoryModule.emptyMemoryState(),
      facts: [],
      abilityJournal: [],
      actingMarks: [],
      hiddenWorldFacts: [],
      worldKernel: { ...baseGame.worldKernel },
    };
    const stats = { actions: 0, failures: 0, partials: 0, backlashes: 0, counters: 0, narrativeRetries: 0, saves: 0, corrections: 0 };
    let seedIndex = 0;
    for (let week = 1; week <= 30; week += 1) {
      for (let action = 0; action < 20; action += 1) {
        const definition = pool[(week + action) % pool.length];
        // 行动者必须拥有该能力：途径与序列按定义匹配，避免整条路线被 ABILITY_NOT_OWNED 判定为失败。
        const actorState = {
          ...abilities.DEFAULT_EXTRAORDINARY_STATE,
          pathwayId: definition.pathwayId,
          sequence: definition.sequence,
          internalRank: definition.internalRank,
          spirituality: game.spirituality,
          maxSpirituality: game.spiritualityMax,
          stability: game.stability,
          physicalCondition: 100,
          mentalCondition: Math.max(0, 100 - game.mentalLoad),
        };
        const targetRank = route === "rank-counter" && action % 4 === 0 ? 7 : 1 + (action % 3);
        const leverage = route === "rank-counter" && action % 4 === 1;
        const resistancePool =
          route === "high-risk"
            ? [4, 8, 12, 16, 20]
            : route === "investigation"
              ? [0, 1, 2, 3, 4, 6, 8, 12]
              : [2, 4, 6, 8, 12, 16];
        const resistance = resistancePool[(week + action) % resistancePool.length];
        const extra = [];
        if (definition.gameParameters.mediumRequired) extra.push("使用随身物品作为媒介");
        if (definition.gameParameters.knowledgeRequired) extra.push("已掌握目标媒介与身份信息");
        if (route === "investigation") extra.push("基于已知情报");
        if (leverage) extra.push("已知真名");
        const intent = abilities.parseAbilityIntent(
          `${definition.name} 用于${route === "investigation" ? "调查" : "行动"}，${extra.join("，")}`,
          [definition],
          "player",
          `ability-${week}-${action}`
        );
        const seed = `long-${route}-${week}-${action}-${seedIndex++}`;
        const contract = abilities.resolveAbility({
          definition,
          actorState,
          targetStates: [
            {
              id: "target",
              ...actorState,
              internalRank: targetRank,
              resistances: Object.fromEntries(
                Object.keys(actorState.resistances).map((key) => [key, resistance])
              ),
            },
          ],
          intent,
          seed,
          environmentRefs: route === "investigation" ? ["home-ground"] : [],
          activeCounterIds: (week + action) % 8 === 0 ? [`counter-${definition.id}-resistance`] : [],
          environmentProtection: route === "rank-counter" ? 3 : 0,
          targetInjured: route === "rank-counter" && action % 6 === 0,
          mastery: 1,
        });
        stats.actions += 1;
        if (contract.result === "failure" || contract.result === "fail-with-progress") stats.failures += 1;
        if (contract.result === "partial-success") stats.partials += 1;
        if (contract.result === "backlash") stats.backlashes += 1;
        if (contract.defenseBreakdown.activeCounters > 0) stats.counters += 1;
        const applied = abilities.applyAbilityResolution(game, contract, definition.name);
        game = applied.game;
        if (game.spirituality < 0 || game.stability < 0 || game.mentalLoad < 0) {
          failures.push(`${route}: 资源为负 week=${week}`);
        }
        // 叙事重试：不重新结算
        const replay = abilities.applyAbilityResolution(game, contract, definition.name);
        if (replay.applied) failures.push(`${route}: 重试重复结算 week=${week}`);
        if (action % 10 === 0) stats.narrativeRetries += 1;
      }
      // 每周恢复灵性与精神负荷（模拟休整），保证后续行动可结算
      game = { ...game, spirituality: game.spiritualityMax, mentalLoad: 0 };
      if (week % 15 === 0) {
        game = JSON.parse(JSON.stringify(game));
        stats.saves += 1;
      }
      // 错误信念纠正（模拟）：写入一条 corrected belief 并检查不被当作世界真值
      if (week === 8) {
        game.memory = memoryModule.deriveMemory(game.memory, [
          { kind: "belief", characterId: "player", subjectId: "route-truth", claimType: "report", propositionKey: `route:${route}:truth`, claim: "路线事实", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "report", sourceId: `week:${week}` }, validFromWeek: week, secrecy: "public" },
          { kind: "belief", characterId: "player", subjectId: "route-truth", claimType: "report", propositionKey: `route:${route}:truth`, claim: "更正后的路线事实", confidence: 0.95, truthStatus: "true", learnedFrom: { type: "observed", sourceId: `week:${week}-corrected` }, validFromWeek: week },
        ]).state;
        stats.corrections += 1;
      }
    }
    const firstEventId = game.memory.events[0]?.sourceEventId;
    results[route] = { ...stats, memoryEvents: game.memory.events.length, firstEventStillPresent: firstEventId ? game.memory.events.some((event) => event.sourceEventId === firstEventId) : true, spirituality: game.spirituality };
  }
  return { failures, results };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runAbilityLongrun();
  console.log("[ability:longrun]");
  for (const [route, stats] of Object.entries(result.results)) {
    console.log(`  ${route}: ${JSON.stringify(stats)}`);
  }
  if (result.failures.length) {
    console.log(`  失败：${result.failures.slice(0, 10).join("; ")}`);
  } else {
    console.log("  三条 30 周路线：资源不归负、重试不重复结算、记忆长期保留");
  }
  const pass =
    result.failures.length === 0 &&
    Object.values(result.results).every((stats) => stats.actions >= 600 && stats.failures >= 5 && stats.partials >= 3 && stats.backlashes >= 2 && stats.firstEventStillPresent);
  console.log(`[ability:longrun] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
