// 命运失控机制基准：10 万级分布模拟 + 资格/判定/合同/应用/幂等/存档性能。
import { performance } from "node:perf_hooks";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function p95(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

export async function runFateBenchmark() {
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const definitions = abilities.abilityDefinitions();
  const byId = (id) => definitions.find((item) => item.id === id);
  const actor = {
    ...abilities.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
    corruption: 0,
    stability: 100,
  };
  const intent = {
    actionId: "bench-fate",
    actorId: "player",
    objective: "观察目标",
    requestedAbilityIds: ["spirit-vision"],
    targetRefs: [],
    method: "观察",
    preparationRefs: ["sight-confirmed"],
    mediumRefs: [],
    materialRefs: [],
    acceptableRisks: [],
    retreatConditions: [],
  };

  // ---------- 分布模拟（10 万 × 4 类，带压力状态机与低频冷却） ----------
  function simulate(riskClass, count, options) {
    const config = fate.BASE_FATE_RATES[riskClass];
    let state = fate.createInitialFateState();
    let triggers = 0;
    let boons = 0;
    let disasters = 0;
    let maxGap = 0;
    let gap = 0;
    let s4 = 0;
    let actionIndex = 0;
    let lastTriggerActionIndex = -999;
    let lastS4Week = -999;
    let lastS3Week = -999;
    let lastTriggerWeek = -999;
    let minActionGap = 999;
    let maxTriggersPerWeek = 0;
    let minS3GapWeeks = 999;
    let minS4GapWeeks = 999;
    const triggersByWeek = new Map();
    for (let index = 0; index < count; index += 1) {
      const week = Math.floor(index / 5);
      const seed = `bench-dist-${riskClass}-${index}`;
      const gain = fate.pressureGain({
        riskClass,
        actorState: { ...actor, corruption: options.corruption ?? 0, stability: options.stability ?? 100 },
        targetState: { id: "t", ...actor, internalRank: 1 + (options.rankGap ?? 0) },
        definition: byId(options.definitionId ?? "spirit-vision"),
        intent,
        seed,
        worldlineDiverged: options.worldline ?? false,
      });
      const pressureForRoll = Math.min(100, state.pressure + gain);
      const decision = fate.rollFateDecision({
        seed,
        riskClass,
        pressure: pressureForRoll,
        forceTrigger: state.pressure >= 100,
      });
      const actionCooldown = actionIndex - lastTriggerActionIndex < fate.FATE_ACTION_COOLDOWN;
      const weeklyLimit = fate.FATE_WEEKLY_TRIGGER_LIMIT === 1 && lastTriggerWeek === week;
      const canTrigger = decision.triggered && !actionCooldown && !weeklyLimit;
      if (canTrigger) {
        triggers += 1;
        minActionGap = Math.min(minActionGap, actionIndex - lastTriggerActionIndex);
        lastTriggerActionIndex = actionIndex;
        triggersByWeek.set(week, (triggersByWeek.get(week) ?? 0) + 1);
        maxTriggersPerWeek = Math.max(maxTriggersPerWeek, triggersByWeek.get(week));
        boons += decision.polarity === "boon" ? 1 : 0;
        disasters += decision.polarity === "disaster" ? 1 : 0;
        const fourAllowed =
          (options.largeRitual || (options.corruption ?? 0) >= 50 || (options.rankGap ?? 0) >= 3 || options.worldline) &&
          week - lastS4Week >= fate.SEVERITY4_COOLDOWN_WEEKS;
        let severity = fate.selectSeverity({
          severityRoll: decision.severityRoll,
          severity4Allowed: fourAllowed,
          highPressure: pressureForRoll >= 80,
          worldlineDiverged: options.worldline ?? false,
        });
        if (severity === 4 && s4 >= fate.SEVERITY4_CAMPAIGN_LIMIT) severity = 3;
        if (severity === 3 && week - lastS3Week < fate.SEVERITY3_COOLDOWN_WEEKS) {
          severity = 2;
        }
        if (severity === 4) {
          s4 += 1;
          minS4GapWeeks = Math.min(minS4GapWeeks, week - lastS4Week);
          lastS4Week = week;
        }
        if (severity === 3) {
          minS3GapWeeks = Math.min(minS3GapWeeks, week - lastS3Week);
          lastS3Week = week;
        }
        state = { ...state, pressure: Math.min(pressureForRoll, fate.PRESSURE_AFTER_SEVERITY_CAP[severity]) };
        lastTriggerWeek = week;
        gap = 0;
      } else {
        state = { ...state, pressure: pressureForRoll };
        gap += 1;
        maxGap = Math.max(maxGap, gap);
      }
      actionIndex += 1;
    }
    return {
      rate: triggers / count,
      boonRate: boons / count,
      disasterRate: disasters / count,
      maxGap,
      s4,
      minActionGap,
      maxTriggersPerWeek,
      minS3GapWeeks,
      minS4GapWeeks,
      base: config,
    };
  }

  const normal = simulate("normal", 100000, {});
  const dangerous = simulate("dangerous", 100000, {});
  const forced = simulate("forced", 100000, {});
  const extreme = simulate("extreme", 100000, { corruption: 70, stability: 25, rankGap: 3, largeRitual: true, worldline: true });
  const normalRepro = simulate("normal", 100000, {});

  // ---------- 性能压测 ----------
  const definition = byId("spirit-vision");
  const abilityContract = abilities.resolveAbility({
    definition,
    actorState: actor,
    targetStates: [{ id: "t", ...actor }],
    intent,
    seed: "bench-ability",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  const eligibilityTimes = [];
  for (let index = 0; index < 100000; index += 1) {
    const start = performance.now();
    fate.isFateEligible({ definition, contract: abilityContract, intent });
    eligibilityTimes.push(performance.now() - start);
  }
  const resolveTimes = [];
  const contracts = [];
  const abilityContracts = [];
  for (let index = 0; index < 20000; index += 1) {
    const start = performance.now();
    const abilityContract = abilities.resolveAbility({
      definition,
      actorState: actor,
      targetStates: [{ id: "t", ...actor }],
      intent: { ...intent, actionId: `bench-ability-${index}` },
      seed: `bench-ability-${index}`,
      environmentRefs: [],
      activeCounterIds: [],
      environmentProtection: 0,
      targetInjured: false,
      mastery: 1,
    });
    abilityContracts.push(abilityContract);
    const contract = fate.resolveFateAberration({
      definition,
      actorState: actor,
      targetStates: [{ id: "t", ...actor }],
      intent: { ...intent, actionId: `bench-fate-${index}` },
      abilityContract,
      game: { week: 1, saveId: "bench-save", worldKernel: {}, fate: { ...fate.createInitialFateState(), pressure: 70 } },
      force: { polarity: index % 2 === 0 ? "boon" : "disaster" },
    });
    resolveTimes.push(performance.now() - start);
    contracts.push(contract);
  }
  const validateTimes = [];
  for (const contract of contracts) {
    const start = performance.now();
    fate.validateFateContract(contract);
    validateTimes.push(performance.now() - start);
  }
  const idemTimes = [];
  for (let index = 0; index < 1000; index += 1) {
    const contract = contracts[index % contracts.length];
    const start = performance.now();
    fate.fateResolutionAlreadyApplied(
      { fate: { ...fate.createInitialFateState(), recentFateResolutionIds: contracts.slice(0, 200).map((item) => item.resolutionId) }, worldKernel: { events: [] } },
      contract
    );
    idemTimes.push(performance.now() - start);
  }

  function minimalGame(week = 1, fateState) {
    return {
      week,
      spirituality: 18,
      stability: 71,
      mentalLoad: 0,
      abilityResolutions: [],
      fate: fateState ?? fate.createInitialFateState(),
      memory: memoryModule.emptyMemoryState(),
      facts: [],
      worldKernel: { events: [], canon: { mode: "anchored", deviation: 0, pivotEventIds: [], knowledgeHorizon: { worldlineMode: "canon-aligned" } } },
    };
  }

  const applyTimes = [];
  let appliedGame = minimalGame();
  for (let index = 0; index < 5000; index += 1) {
    const contract = contracts[index % contracts.length];
    const abilityContractForApply = abilityContracts[index % abilityContracts.length];
    const start = performance.now();
    appliedGame = fate.applyFateBundle(appliedGame, abilityContractForApply, contract, "灵视").game;
    applyTimes.push(performance.now() - start);
  }
  const replayTimes = [];
  for (let index = 0; index < 1000; index += 1) {
    const contract = contracts[index % contracts.length];
    const abilityContractForApply = abilityContracts[index % abilityContracts.length];
    const start = performance.now();
    fate.applyFateBundle(appliedGame, abilityContractForApply, contract, "灵视");
    replayTimes.push(performance.now() - start);
  }
  const roundtripTimes = [];
  let serialized = "";
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now();
    serialized = JSON.stringify(JSON.parse(JSON.stringify(appliedGame)));
    roundtripTimes.push(performance.now() - start);
  }

  const bounded =
    appliedGame.fate.recentTemplateIds.length <= fate.RECENT_TEMPLATE_LIMIT &&
    appliedGame.fate.recentFateResolutionIds.length <= fate.RECENT_FATE_RESOLUTION_LIMIT &&
    appliedGame.fate.pendingDelayedEffects.length <= fate.PENDING_DELAYED_LIMIT;

  return {
    distribution: { normal, dangerous, forced, extreme, normalRepro },
    targets: { ...fate.DISTRIBUTION_TARGETS },
    limits: {
      actionCooldown: fate.FATE_ACTION_COOLDOWN,
      weeklyLimit: fate.FATE_WEEKLY_TRIGGER_LIMIT,
      severity3Cooldown: fate.SEVERITY3_COOLDOWN_WEEKS,
      severity4Cooldown: fate.SEVERITY4_COOLDOWN_WEEKS,
      severity4CampaignLimit: fate.SEVERITY4_CAMPAIGN_LIMIT,
    },
    perf: {
      eligibilityP95Ms: Number(p95(eligibilityTimes).toFixed(2)),
      resolveP95Ms: Number(p95(resolveTimes).toFixed(2)),
      validateP95Ms: Number(p95(validateTimes).toFixed(2)),
      idemP95Ms: Number(p95(idemTimes).toFixed(2)),
      applyP95Ms: Number(p95(applyTimes).toFixed(2)),
      replayP95Ms: Number(p95(replayTimes).toFixed(2)),
      roundtripP95Ms: Number(p95(roundtripTimes).toFixed(2)),
      contracts: contracts.length,
      applies: 5000,
      replays: 1000,
      roundtrips: 100,
      saveBytes: serialized.length,
      bounded,
    },
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runFateBenchmark();
  const d = result.distribution;
  const p = result.perf;
  console.log("[fate:benchmark]");
  console.log(`  分布 normal=${(d.normal.rate * 100).toFixed(2)}% dangerous=${(d.dangerous.rate * 100).toFixed(2)}% forced=${(d.forced.rate * 100).toFixed(2)}% extreme=${(d.extreme.rate * 100).toFixed(2)}%`);
  console.log(`  normal 灾难占比=${(d.normal.disasterRate * 100).toFixed(2)}% extreme 灾难占比=${(d.extreme.disasterRate * 100).toFixed(2)}% maxGap=${d.normal.maxGap}/${d.dangerous.maxGap}/${d.forced.maxGap}/${d.extreme.maxGap}`);
  console.log(`  s4=${d.normal.s4}/${d.dangerous.s4}/${d.forced.s4}/${d.extreme.s4} 四级总数=${d.normal.s4 + d.dangerous.s4 + d.forced.s4 + d.extreme.s4}`);
  console.log(`  冷却 最小行动间隔=${Math.min(d.normal.minActionGap, d.dangerous.minActionGap, d.forced.minActionGap, d.extreme.minActionGap)} 每周最多=${Math.max(d.normal.maxTriggersPerWeek, d.dangerous.maxTriggersPerWeek, d.forced.maxTriggersPerWeek, d.extreme.maxTriggersPerWeek)} 三级间隔=${Math.min(d.normal.minS3GapWeeks, d.dangerous.minS3GapWeeks, d.forced.minS3GapWeeks, d.extreme.minS3GapWeeks)}周 四级间隔=${Math.min(d.normal.minS4GapWeeks, d.dangerous.minS4GapWeeks, d.forced.minS4GapWeeks, d.extreme.minS4GapWeeks)}周`);
  console.log(`  性能 资格P95=${p.eligibilityP95Ms}ms 判定P95=${p.resolveP95Ms}ms 合同P95=${p.validateP95Ms}ms 幂等P95=${p.idemP95Ms}ms 应用P95=${p.applyP95Ms}ms 重放P95=${p.replayP95Ms}ms`);
  console.log(`  规模 合同=${p.contracts} 应用=${p.applies} 重放=${p.replays} 存档往返=${p.roundtrips} 存档=${(p.saveBytes / 1024).toFixed(1)}KB 有界=${p.bounded}`);
  const target = result.targets;
  const pass =
    d.normal.rate >= target.normal.min && d.normal.rate <= target.normal.max &&
    d.dangerous.rate >= target.dangerous.min && d.dangerous.rate <= target.dangerous.max &&
    d.forced.rate >= target.forced.min && d.forced.rate <= target.forced.max &&
    d.extreme.rate >= target.extreme.min && d.extreme.rate <= target.extreme.max &&
    d.forced.rate > d.dangerous.rate && d.dangerous.rate > d.normal.rate &&
    d.extreme.rate > d.forced.rate &&
    d.extreme.disasterRate > d.normal.disasterRate &&
    JSON.stringify(d.normal) === JSON.stringify(d.normalRepro) &&
    d.normal.s4 === 0 &&
    Object.values({ normal: d.normal, dangerous: d.dangerous, forced: d.forced, extreme: d.extreme }).every((entry) =>
      entry.minActionGap >= result.limits.actionCooldown &&
      entry.maxTriggersPerWeek <= result.limits.weeklyLimit &&
      entry.minS3GapWeeks >= result.limits.severity3Cooldown &&
      entry.s4 <= result.limits.severity4CampaignLimit &&
      (entry.s4 === 0 || entry.minS4GapWeeks >= result.limits.severity4Cooldown)
    ) &&
    p.eligibilityP95Ms <= 5 && p.resolveP95Ms <= 10 && p.validateP95Ms <= 10 && p.idemP95Ms <= 5 && p.bounded;
  console.log(`[fate:benchmark] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
