// 轻量失控 30 周路线：正常经营 / 高风险疯玩 / 污染与世界线偏离。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function routePool(route) {
  if (route === "B") return ["marionette-touch", "deep-hypnosis", "fire-shaping", "reaping-strike", "spirit-travel"];
  if (route === "C") return ["ritual-design", "divination", "spirit-travel", "fire-shaping", "deep-hypnosis"];
  return ["spirit-vision", "divination", "paper-substitute", "track", "identify"];
}

export async function runControlLongrun() {
  const control = await loadRuntimeModule("app/loss-of-control/index.ts");
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const gameModule = await loadRuntimeModule("app/game-model.ts");
  const definitions = abilities.abilityDefinitions();
  const failures = [];
  const results = {};

  for (const route of ["A", "B", "C"]) {
    const pool = definitions.filter((definition) => routePool(route).includes(definition.id));
    const baseGame = gameModule.createInitialGame("seer");
    const corruption = route === "B" ? 65 : route === "C" ? 40 : 5;
    const stability = route === "B" ? 50 : 71;
    const canon =
      route === "C"
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
      control: {
        ...control.createInitialControlState(),
        pollution: route === "B" ? 40 : route === "C" ? 35 : 0,
      },
      memory: memoryModule.emptyMemoryState(),
      facts: [],
      abilityJournal: [],
      actingMarks: [],
      hiddenWorldFacts: [],
      worldKernel: { ...baseGame.worldKernel, canon },
      playerCondition: {
        ...baseGame.playerCondition,
        pollution: route === "B" ? 40 : route === "C" ? 35 : baseGame.playerCondition.pollution,
      },
    };
    const stats = {
      actions: 0,
      fateTriggers: 0,
      controlTriggers: 0,
      maxStage: "stable",
      partialLoss: 0,
      containedLoss: 0,
      recoveredFromLoss: false,
      resourcesNegative: 0,
      deadEnd: false,
      replayReapplied: 0,
      fateSeverity3: 0,
      fateSeverity4: 0,
      controlPlans: 0,
      npcBeliefs: 0,
      worldFateEvents: 0,
      worldControlEvents: 0,
    };
    const stageRank = { stable: 0, disturbed: 1, critical: 2, "partial-loss": 3, "contained-loss": 4 };
    let hadLoss = false;

    for (let week = 1; week <= 30; week += 1) {
      game = { ...game, week };
      for (let action = 0; action < 5; action += 1) {
        stats.actions += 1;
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
        }
        if (route === "C" && definition.family === "ritual") extra.push("不完整仪式，材料不全");
        if (route === "B" && action % 5 === 2) extra.push("已知真名");
        if (route === "A") extra.push("基于已知情报");
        const intent = abilities.parseAbilityIntent(
          `${definition.name} 用于${route === "A" ? "调查" : route === "B" ? "强行行动" : "大型仪式"}，${extra.join("，")}`,
          [definition],
          "player",
          `control-${route}-${week}-${action}`
        );
        const contract = abilities.resolveAbility({
          definition,
          actorState,
          targetStates: [targetState],
          intent,
          seed: `control-long-${route}-${week}-${action}`,
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
          game: { week: game.week, saveId: "control-longrun", worldKernel: game.worldKernel, fate: game.fate },
        });
        if (fateContract.triggered) {
          stats.fateTriggers += 1;
          if (fateContract.severity === 3) stats.fateSeverity3 += 1;
          if (fateContract.severity === 4) stats.fateSeverity4 += 1;
        }
        const bundle = fate.applyFateBundle(game, contract, fateContract, definition.name);
        if (!bundle.applied) failures.push(`${route}: 首次应用未生效 week=${week}`);
        game = bundle.game;
        const controlContract = control.evaluateControlContract({
          resolutionId: contract.resolutionId,
          actorId: "player",
          saveId: "control-longrun",
          riskInput: {
            pollution: game.playerCondition?.pollution ?? 0,
            mentalLoad: game.mentalLoad,
            spirituality: game.spirituality,
            consecutiveBacklashes: 0,
            forcedCast: route === "B" && action % 4 === 0,
            overreach: contract.legality.reasons.includes("RANK_GATE_BLOCKED"),
            ritualFailure:
              route === "C" &&
              (definition.family === "ritual" || definition.activation.action === "ritual") &&
              (contract.result === "failure" || contract.result === "fail-with-progress"),
            backlash: contract.result === "backlash",
            fateSeverity: fateContract.severity,
            restRelief: 0,
            companionRelief: 0,
            protectionRelief: 0,
          },
          controlState: game.control ?? control.createInitialControlState(),
          eligibleIndex: stats.actions,
        });
        const controlApplied = control.applyControlBundle(game, contract, fateContract, controlContract, definition.name);
        game = controlApplied.game;
        if (controlContract.triggered) {
          stats.controlTriggers += 1;
          if (stageRank[controlContract.stageAfter] > stageRank[stats.maxStage]) stats.maxStage = controlContract.stageAfter;
          if (controlContract.stageAfter === "partial-loss") stats.partialLoss += 1;
          if (controlContract.stageAfter === "contained-loss") stats.containedLoss += 1;
          if (controlContract.stageAfter === "partial-loss" || controlContract.stageAfter === "contained-loss") hadLoss = true;
        }
        const replayControl = control.applyControlBundle(game, contract, fateContract, controlContract, definition.name);
        if (replayControl.applied) stats.replayReapplied += 1;
        if (game.spirituality < 0 || game.stability < 0 || game.mentalLoad < 0) stats.resourcesNegative += 1;
        if (game.stability <= 0) stats.deadEnd = true;
        stats.worldFateEvents = game.worldKernel.events.filter((event) => event.id.startsWith("world-fate-")).length;
        stats.worldControlEvents = game.worldKernel.events.filter((event) => event.id.startsWith("world-control-")).length;
        stats.controlPlans = game.memory.plans.filter((plan) => plan.sourceEventIds.some((id) => id.startsWith("world-control-"))).length;
        stats.npcBeliefs = game.memory.beliefs.filter((belief) => belief.characterId !== "player").length;
      }

      // 每周休整：A 充分休息；B 只做轻度恢复；C 用治疗与监护压制。
      const recoveryActions =
        route === "A"
          ? ["rest", "companion"]
          : route === "B"
            ? (game.control?.stage === "partial-loss" || game.control?.stage === "contained-loss"
                ? ["rest", "ritual-treatment", "purification", "custody", "companion"]
                : ["rest", "purification"])
            : ["rest", "purification", "custody"];
      game = {
        ...game,
        spirituality: game.spiritualityMax,
        mentalLoad: Math.max(0, game.mentalLoad - 30),
        stability: Math.min(100, game.stability + (route === "A" ? 8 : route === "B" ? 22 : 10)),
        control: control.applyRecovery(game.control ?? control.createInitialControlState(), week, recoveryActions),
      };
      if (hadLoss && ["stable", "disturbed", "critical"].includes(game.control?.stage ?? "stable")) {
        stats.recoveredFromLoss = true;
      }
      if (week % 15 === 0) game = JSON.parse(JSON.stringify(game));
    }
    results[route] = { ...stats, finalStage: game.control?.stage, finalRisk: game.control?.recentRisk, week: game.week, memoryEvents: game.memory.events.length };
  }

  return { failures, results };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runControlLongrun();
  console.log("[control:longrun]");
  for (const [route, stats] of Object.entries(result.results)) {
    console.log(`  ${route}: ${JSON.stringify(stats)}`);
  }
  if (result.failures.length) console.log(`  失败：${result.failures.slice(0, 10).join("; ")}`);
  const A = result.results.A;
  const B = result.results.B;
  const C = result.results.C;
  const pass =
    result.failures.length === 0 &&
    Object.values(result.results).every((stats) =>
      stats.actions >= 150 &&
      stats.resourcesNegative === 0 &&
      stats.replayReapplied === 0 &&
      !stats.deadEnd &&
      stats.week === 30
    ) &&
    A.fateTriggers >= 4 && A.fateTriggers <= 8 &&
    ["stable", "disturbed", "critical"].includes(A.finalStage) &&
    A.fateSeverity4 === 0 &&
    B.partialLoss >= 1 && B.recoveredFromLoss === true &&
    B.controlTriggers > A.controlTriggers &&
    (C.finalStage === "critical" || C.finalStage === "contained-loss" || C.containedLoss >= 1) &&
    C.fateSeverity3 >= 1 &&
    C.controlPlans > 0 &&
    C.npcBeliefs > 0 &&
    C.worldControlEvents > 0;
  console.log(`[control:longrun] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
