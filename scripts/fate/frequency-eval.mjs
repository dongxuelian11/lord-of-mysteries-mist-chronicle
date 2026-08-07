// 命运频率评估：4×10 万次模拟，验证低频目标与全部冷却不变量。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runFateFrequencyEval() {
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const failures = [];

  function simulate(riskClass, count, options) {
    let state = fate.createInitialFateState();
    let triggers = 0;
    let boons = 0;
    let disasters = 0;
    let s4 = 0;
    let actionIndex = 0;
    let lastTriggerActionIndex = -999;
    let lastTriggerWeek = -999;
    let lastS3Week = -999;
    let lastS4Week = -999;
    let minActionGap = 999;
    let maxTriggersPerWeek = 0;
    let minS3GapWeeks = 999;
    let minS4GapWeeks = 999;
    const triggersByWeek = new Map();
    for (let index = 0; index < count; index += 1) {
      const week = Math.floor(index / 5);
      const seed = `freq-${riskClass}-${index}`;
      const gain =
        fate.PRESSURE_BASE_MISS +
        (riskClass === "dangerous" ? fate.PRESSURE_HIGH_RISK : 0) +
        (riskClass === "forced" ? fate.PRESSURE_FORCED_CAST : 0) +
        (riskClass === "extreme" ? 6 + Math.min(10, Math.max(0, Math.floor(((options.corruption ?? 0) - 30) / 7))) : 0) +
        (index % 3);
      const pressureForRoll = Math.min(100, state.pressure + gain);
      const decision = fate.rollFateDecision({ seed, riskClass, pressure: pressureForRoll, forceTrigger: state.pressure >= 100 });
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
      } else {
        state = { ...state, pressure: pressureForRoll };
      }
      actionIndex += 1;
    }
    return { rate: triggers / count, boonRate: boons / count, disasterRate: disasters / count, s4, minActionGap, maxTriggersPerWeek, minS3GapWeeks, minS4GapWeeks };
  }

  const normal = simulate("normal", 100000, {});
  const dangerous = simulate("dangerous", 100000, {});
  const forced = simulate("forced", 100000, {});
  const extreme = simulate("extreme", 100000, { corruption: 70, stability: 25, rankGap: 3, largeRitual: true, worldline: true });
  const normalRepro = simulate("normal", 100000, {});

  const targets = fate.DISTRIBUTION_TARGETS;
  const inRange = (value, range) => value >= range.min && value <= range.max;
  if (!inRange(normal.rate, targets.normal)) failures.push(`normal-rate:${normal.rate.toFixed(4)}`);
  if (!inRange(dangerous.rate, targets.dangerous)) failures.push(`dangerous-rate:${dangerous.rate.toFixed(4)}`);
  if (!inRange(forced.rate, targets.forced)) failures.push(`forced-rate:${forced.rate.toFixed(4)}`);
  if (!inRange(extreme.rate, targets.extreme)) failures.push(`extreme-rate:${extreme.rate.toFixed(4)}`);
  if (forced.rate <= dangerous.rate || dangerous.rate <= normal.rate || extreme.rate <= forced.rate) failures.push("rate-ordering");
  if (extreme.disasterRate <= normal.disasterRate) failures.push("disaster-bias");
  if (normal.s4 !== 0) failures.push(`normal-route-severity4:${normal.s4}`);
  for (const [name, result] of Object.entries({ normal, dangerous, forced, extreme })) {
    if (result.minActionGap < fate.FATE_ACTION_COOLDOWN) failures.push(`${name}-action-gap:${result.minActionGap}`);
    if (result.maxTriggersPerWeek > fate.FATE_WEEKLY_TRIGGER_LIMIT) failures.push(`${name}-weekly-limit:${result.maxTriggersPerWeek}`);
    if (result.minS3GapWeeks < fate.SEVERITY3_COOLDOWN_WEEKS) failures.push(`${name}-s3-gap:${result.minS3GapWeeks}`);
    if (result.s4 > fate.SEVERITY4_CAMPAIGN_LIMIT) failures.push(`${name}-s4-campaign:${result.s4}`);
    if (result.s4 > 0 && result.minS4GapWeeks < fate.SEVERITY4_COOLDOWN_WEEKS) failures.push(`${name}-s4-gap:${result.minS4GapWeeks}`);
  }
  if (JSON.stringify(normal) !== JSON.stringify(normalRepro)) failures.push("reproducibility");

  return {
    failures,
    rates: {
      normal: normal.rate,
      dangerous: dangerous.rate,
      forced: forced.rate,
      extreme: extreme.rate,
    },
    invariants: {
      normalS4: normal.s4,
      s4Total: normal.s4 + dangerous.s4 + forced.s4 + extreme.s4,
      minActionGap: Math.min(normal.minActionGap, dangerous.minActionGap, forced.minActionGap, extreme.minActionGap),
      maxTriggersPerWeek: Math.max(normal.maxTriggersPerWeek, dangerous.maxTriggersPerWeek, forced.maxTriggersPerWeek, extreme.maxTriggersPerWeek),
      minS3GapWeeks: Math.min(normal.minS3GapWeeks, dangerous.minS3GapWeeks, forced.minS3GapWeeks, extreme.minS3GapWeeks),
    },
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runFateFrequencyEval();
  console.log("[fate:frequency]");
  console.log(`  触发率 normal=${(result.rates.normal * 100).toFixed(2)}% dangerous=${(result.rates.dangerous * 100).toFixed(2)}% forced=${(result.rates.forced * 100).toFixed(2)}% extreme=${(result.rates.extreme * 100).toFixed(2)}%`);
  console.log(`  不变量 普通路线四级=${result.invariants.normalS4} 四级总数=${result.invariants.s4Total} 最小行动间隔=${result.invariants.minActionGap} 每周最多=${result.invariants.maxTriggersPerWeek} 三级最小间隔=${result.invariants.minS3GapWeeks}周`);
  if (result.failures.length) console.log(`  失败：${result.failures.slice(0, 12).join("; ")}`);
  const pass = result.failures.length === 0;
  console.log(`[fate:frequency] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
