// 命运失控机制长线：三条 30 周路线（正常经营 / 高风险疯玩 / 世界线偏离）。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function routeAbilities(route) {
  if (route === "B") return ["marionette-touch", "deep-hypnosis", "fire-shaping", "reaping-strike", "spirit-travel"];
  if (route === "C") return ["ritual-design", "divination", "spirit-travel", "fire-shaping", "deep-hypnosis"];
  return ["spirit-vision", "divination", "paper-substitute", "track", "identify"];
}

export async function runFateLongrun() {
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const definitions = abilities.abilityDefinitions();
  const failures = [];
  const results = {};

  for (const route of ["A", "B", "C"]) {
    const pool = definitions.filter((definition) => routeAbilities(route).includes(definition.id));
    const baseGame = gameModule.createInitialGame("seer");
    const corruption = route === "B" ? 65 : route === "C" ? 40 : 5;
    const stability = route === "B" ? 40 : 71;
    const worldlineDiverged = route === "C";
    const canon = worldlineDiverged
      ? {
          ...baseGame.worldKernel.canon,
          mode: "diverging",
          deviation: 45,
          knowledgeHorizon: { ...baseGame.worldKernel.canon.knowledgeHorizon, worldlineMode: "canon-diverged" },
        }
      : baseGame.worldKernel.canon;
    let game = {
      ...baseGame,
      prologueComplete: true,
      playerName: "会长",
      playerAddress: "会长阁下",
      spirituality: 200,
      spiritualityMax: 200,
      stability,
      mentalLoad: 0,
      abilityResolutions: [],
      fate: route === "C" ? { ...fate.createInitialFateState(), pressure: 65 } : fate.createInitialFateState(),
      memory: memoryModule.emptyMemoryState(),
      facts: [],
      abilityJournal: [],
      actingMarks: [],
      hiddenWorldFacts: [],
      worldKernel: { ...baseGame.worldKernel, canon },
    };
    const stats = {
      actions: 0,
      eligible: 0,
      triggers: 0,
      boons: 0,
      disasters: 0,
      severity: { 1: 0, 2: 0, 3: 0, 4: 0 },
      maxGap: 0,
      consecutiveSameTemplate: 0,
      severity4WithoutPrereq: 0,
      severity4DuringCooldown: 0,
      worldlineWritten: 0,
      resourcesNegative: 0,
      deadEnd: false,
      replayReapplied: 0,
      fateMemoryEvents: 0,
      fatePlans: 0,
      fateNpcBeliefs: 0,
      worldFateEvents: 0,
      saves: 0,
    };
    let gap = 0;
    let lastTemplateId = "";
    let lastS4Week = -999;

    for (let week = 1; week <= 30; week += 1) {
      game = { ...game, week };
      for (let action = 0; action < 5; action += 1) {
        const definition = pool[(week + action) % pool.length];
        const actorState = {
          ...abilities.DEFAULT_EXTRAORDINARY_STATE,
          pathwayId: definition.pathwayId,
          sequence: definition.sequence,
          internalRank: definition.internalRank,
          spirituality: game.spirituality,
          maxSpirituality: game.spiritualityMax,
          stability: game.stability,
          corruption,
          physicalCondition: 100,
          mentalCondition: Math.max(0, 100 - game.mentalLoad),
        };
        const targetRank = route === "A" ? 1 : route === "B" && action % 3 === 0 ? 3 : 1 + (action % 3);
        const resistance = route === "B" ? 14 : route === "C" ? 8 : 4;
        const targetState = {
          id: "target",
          ...actorState,
          internalRank: targetRank,
          resistances: Object.fromEntries(Object.keys(actorState.resistances).map((key) => [key, resistance])),
        };
        const extra = [];
        if (route !== "B" || action % 4 !== 0) {
          if (definition.gameParameters.mediumRequired) extra.push("使用随身物品作为媒介");
          if (definition.gameParameters.knowledgeRequired) extra.push("已掌握目标媒介与身份信息");
          if (definition.gameParameters.materialRequired) extra.push("携带仪式材料");
        }
        if (route === "C" && definition.family === "ritual") extra.push("准备大型仪式材料");
        if (route === "B" && action % 5 === 2) extra.push("已知真名");
        if (route === "A") extra.push("基于已知情报");
        const intent = abilities.parseAbilityIntent(
          `${definition.name} 用于${route === "A" ? "调查" : route === "B" ? "强行行动" : "大型仪式"}，${extra.join("，")}`,
          [definition],
          "player",
          `fate-${route}-${week}-${action}`
        );
        const contract = abilities.resolveAbility({
          definition,
          actorState,
          targetStates: [targetState],
          intent,
          seed: `fate-long-${route}-${week}-${action}`,
          environmentRefs: route === "A" ? ["home-ground"] : [],
          activeCounterIds: [],
          environmentProtection: 0,
          targetInjured: route === "B" && action % 6 === 0,
          mastery: 1,
        });
        const fateContract = fate.resolveFateAberration({
          definition,
          actorState,
          targetStates: [targetState],
          intent,
          abilityContract: contract,
          game: { week: game.week, saveId: "fate-longrun", worldKernel: game.worldKernel, fate: game.fate },
        });
        stats.actions += 1;
        if (fateContract.eligible) stats.eligible += 1;
        if (fateContract.triggered) {
          stats.triggers += 1;
          stats.boons += fateContract.polarity === "boon" ? 1 : 0;
          stats.disasters += fateContract.polarity === "disaster" ? 1 : 0;
          stats.severity[fateContract.severity] += 1;
          if (lastTemplateId === fateContract.templateId) {
            stats.consecutiveSameTemplate += 1;
          }
          lastTemplateId = fateContract.templateId;
          if (fateContract.severity === 4) {
            if (week - lastS4Week < 25) stats.severity4DuringCooldown += 1;
            lastS4Week = week;
            const highRisk = (game.fate?.pressure ?? 0) >= 80 || definition.family === "ritual" || corruption >= 50 || targetRank - actorState.internalRank >= 3 || worldlineDiverged;
            if (!highRisk) stats.severity4WithoutPrereq += 1;
          }
          gap = 0;
        } else {
          gap += 1;
          stats.maxGap = Math.max(stats.maxGap, gap);
        }
        const bundle = fate.applyFateBundle(game, contract, fateContract, definition.name);
        if (!bundle.applied) failures.push(`${route}: 首次应用未生效 week=${week}`);
        game = bundle.game;
        const replay = fate.applyFateBundle(game, contract, fateContract, definition.name);
        if (replay.applied) stats.replayReapplied += 1;
        if (game.spirituality < 0 || game.stability < 0 || game.mentalLoad < 0) stats.resourcesNegative += 1;
        if (game.stability <= 0) stats.deadEnd = true;
        if (game.worldKernel.events.some((event) => event.id.startsWith("world-fate-"))) stats.worldFateEvents = game.worldKernel.events.filter((event) => event.id.startsWith("world-fate-")).length;
        stats.fateMemoryEvents = game.memory.events.filter((event) => event.type === "fate-aberration").length;
        stats.fatePlans = game.memory.plans.filter((plan) => plan.sourceEventIds.some((id) => id.startsWith("world-fate-"))).length;
        stats.fateNpcBeliefs = game.memory.beliefs.filter((belief) => belief.characterId !== "player" && belief.learnedFrom.sourceId.startsWith("world-fate-")).length;
        if (fateContract.severity === 4) {
          const pivotWritten = game.worldKernel.canon.pivotEventIds.some((id) => id.startsWith("world-fate-"));
          const deviationRaised = game.worldKernel.canon.deviation > 45 || game.worldKernel.canon.deviation > 0;
          if (pivotWritten && deviationRaised) stats.worldlineWritten += 1;
        }
      }
      // 每周休整：恢复灵性、精神负荷与稳定度，保证三条路线都能继续经营。
      const stabilityRecovery = route === "B" ? 14 : route === "C" ? 8 : 4;
      game = { ...game, spirituality: game.spiritualityMax, mentalLoad: 0, stability: Math.min(100, game.stability + stabilityRecovery) };
      game = fate.advanceFateWeek(game);
      if (week % 15 === 0) {
        game = JSON.parse(JSON.stringify(game));
        stats.saves += 1;
      }
    }
    results[route] = { ...stats, pressure: game.fate.pressure, memoryEvents: game.memory.events.length, spirituality: game.spirituality };
  }

  return { failures, results };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runFateLongrun();
  console.log("[fate:longrun]");
  for (const [route, stats] of Object.entries(result.results)) {
    console.log(`  ${route}: ${JSON.stringify(stats)}`);
  }
  if (result.failures.length) {
    console.log(`  失败：${result.failures.slice(0, 10).join("; ")}`);
  }
  const A = result.results.A;
  const B = result.results.B;
  const C = result.results.C;
  const pass =
    result.failures.length === 0 &&
    Object.values(result.results).every((stats) =>
      stats.actions >= 150 &&
      stats.eligible >= 120 &&
      stats.consecutiveSameTemplate === 0 &&
      stats.resourcesNegative === 0 &&
      stats.replayReapplied === 0 &&
      !stats.deadEnd &&
      stats.worldFateEvents > 0
    ) &&
    A.triggers >= 4 && A.triggers <= 8 && A.severity["1"] >= 1 && A.severity["2"] >= 1 && A.severity["4"] === 0 &&
    B.disasters > B.boons && B.severity["3"] >= 2 && B.severity["4"] <= 1 &&
    C.severity["4"] === 1 && C.severity4WithoutPrereq === 0 && C.severity4DuringCooldown === 0 && C.worldlineWritten >= 1 &&
    Object.values(result.results).every((stats) => stats.fateMemoryEvents > 0 && stats.fatePlans > 0 && stats.fateNpcBeliefs > 0);
  console.log(`[fate:longrun] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
