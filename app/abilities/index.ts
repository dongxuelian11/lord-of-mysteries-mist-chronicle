// 非凡能力规则引擎公开入口。
export * from "./types.ts";
export * from "./config.ts";
export { abilityDefinitions, abilityDefinitionById, abilityDefinitionsForPathway } from "./registry.ts";
export { checkLegality } from "./legality.ts";
export { resolveAbility, deterministicVariance } from "./resolver.ts";
export { validateContract } from "./contract.ts";
export { applyAbilityResolution, resolutionAlreadyApplied, type ApplyResult } from "./apply.ts";
export { validateNarrative, deterministicNarrative } from "./narrative.ts";
export { parseAbilityIntent, abilityIntentNeedsClarification } from "./intent.ts";
export { checkSynergy, SYNERGY_RULES } from "./synergy.ts";
export { recordAbilityTrace, recentAbilityTraces, abilityTraceCount } from "./trace.ts";
export { resolveCounters } from "./counters.ts";
export { rankGap, leverageAvailable } from "./rank.ts";
