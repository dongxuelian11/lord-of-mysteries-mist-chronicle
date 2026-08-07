// 独立命运骰：与能力 variance 完全独立、确定性、可复现。
import {
  BASE_FATE_RATES,
  FATE_ALGORITHM_VERSION,
  MAX_COMBINED_CHANCE,
  PRESSURE_BOON_SCALE,
  PRESSURE_DISASTER_SCALE,
  PRESSURE_MAX,
  SEVERITY4_BOOST_WEIGHT,
  SEVERITY_WEIGHTS,
} from "./config.ts";
import type { FatePolarity, FateRiskClass, FateSeverity } from "./types.ts";

export function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fateSeed(resolutionId: string, saveId = "default-save"): string {
  return `${saveId}|${resolutionId}|${FATE_ALGORITHM_VERSION}`;
}

export function fateRoll(seed: string): number {
  return stableHash(`${seed}|fate-roll`) % 100;
}

export function polarityRoll(seed: string): number {
  return stableHash(`${seed}|polarity-roll`) % 100;
}

export function severityRoll(seed: string): number {
  return stableHash(`${seed}|severity-roll`) % 100;
}

export function templateRoll(seed: string): number {
  return stableHash(`${seed}|template-roll`) % 1000;
}

export function effectiveChances(
  riskClass: FateRiskClass,
  pressure: number
): { boon: number; disaster: number } {
  const base = BASE_FATE_RATES[riskClass];
  const ratio = Math.max(0, Math.min(1, pressure / PRESSURE_MAX));
  const boon = Math.min(MAX_COMBINED_CHANCE, base.boon + ratio * PRESSURE_BOON_SCALE);
  const disaster = Math.min(MAX_COMBINED_CHANCE, base.disaster + ratio * PRESSURE_DISASTER_SCALE);
  return { boon, disaster };
}

export type FateDecision = {
  fateRoll: number;
  polarityRoll: number;
  severityRoll: number;
  templateRoll: number;
  triggered: boolean;
  forced: boolean;
  polarity?: FatePolarity;
};

export function rollFateDecision(options: {
  seed: string;
  riskClass: FateRiskClass;
  pressure: number;
  forceTrigger: boolean;
}): FateDecision {
  const { seed, riskClass, pressure, forceTrigger } = options;
  const roll = fateRoll(seed);
  const pol = polarityRoll(seed);
  const severity = severityRoll(seed);
  const template = templateRoll(seed);
  const chances = effectiveChances(riskClass, pressure);
  const combined = chances.boon + chances.disaster;
  const triggered = forceTrigger || roll / 100 < combined;
  if (!triggered) return { fateRoll: roll, polarityRoll: pol, severityRoll: severity, templateRoll: template, triggered: false, forced: false };
  const polarity: FatePolarity = pol / 100 < chances.boon / Math.max(1e-9, combined) ? "boon" : "disaster";
  return {
    fateRoll: roll,
    polarityRoll: pol,
    severityRoll: severity,
    templateRoll: template,
    triggered: true,
    forced: forceTrigger,
    polarity,
  };
}

export function selectSeverity(options: {
  severityRoll: number;
  severity4Allowed: boolean;
  highPressure: boolean;
  worldlineDiverged?: boolean;
  boost3?: boolean;
  boost4?: boolean;
}): FateSeverity {
  const { severityRoll: roll, severity4Allowed, highPressure, worldlineDiverged } = options;
  const boost4 = options.boost4 ?? (highPressure || worldlineDiverged === true);
  const boost3 = options.boost3 ?? false;
  const weights: Record<FateSeverity, number> = { ...SEVERITY_WEIGHTS };
  if (boost4) {
    weights[4] = SEVERITY4_BOOST_WEIGHT;
    weights[1] = Math.max(20, weights[1] - 15);
  } else if (boost3) {
    weights[3] += 10;
    weights[1] = Math.max(25, weights[1] - 10);
  }
  const usable = (severity4Allowed ? [1, 2, 3, 4] : [1, 2, 3]) as FateSeverity[];
  const total = usable.reduce((sum, level) => sum + weights[level], 0);
  const target = (roll / 100) * total;
  let cursor = 0;
  for (const level of usable) {
    cursor += weights[level];
    if (target < cursor) return level;
  }
  return usable[usable.length - 1];
}
