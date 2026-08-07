// 命运失控机制公开入口。
export * from "./types.ts";
export * from "./config.ts";
export { createInitialFateState, pressureGain, riskClassFor, pressureAmbientHint } from "./pressure.ts";
export { fateSeed, fateRoll, polarityRoll, severityRoll, templateRoll, rollFateDecision, selectSeverity, effectiveChances, stableHash } from "./roll.ts";
export { isFateEligible } from "./eligibility.ts";
export { FATE_TEMPLATES, SAFE_FALLBACK_TEMPLATES, fateTemplates, safeFallbackFor } from "./templates.ts";
export { selectFateTemplate, severity4Allowed } from "./selector.ts";
export { buildFateContract, validateFateContract, twistFor, chanceSummary } from "./contract.ts";
export { resolveFateAberration, severity4CooldownWeeks } from "./resolve.ts";
export { applyFateBundle, advanceFateWeek, fateResolutionAlreadyApplied } from "./apply.ts";
export { validateFateNarrative, deterministicFateNarrative } from "./narrative.ts";
export { auditFateTemplates, fateBoundsAudit } from "./audit.ts";
export { recordFateTrace, recentFateTraces, fateTraceCount } from "./trace.ts";
