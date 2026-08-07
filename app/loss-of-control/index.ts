// 轻量失控框架公开入口。
export * from "./types.ts";
export * from "./config.ts";
export { controlRiskScore, shouldEvaluateControl, type ControlRiskInput } from "./risk.ts";
export { evaluateControlContract, validateControlContract } from "./contract.ts";
export { applyControlBundle, createInitialControlState, controlResolutionAlreadyApplied } from "./apply.ts";
export { applyRecovery, canRecoverStage, RECOVERY_RELIEF } from "./recovery.ts";
export { validateControlNarrative, deterministicControlNarrative } from "./narrative.ts";
