// FateAberrationContract：不可变命运合同，生成与校验。
import { FATE_ALGORITHM_VERSION } from "./config.ts";
import { effectiveChances } from "./roll.ts";
import type {
  AbilityOutcomeContract,
  AbilityDefinition,
  AbilityIntent,
  ExtraordinaryState,
} from "../abilities/types.ts";
import type {
  FateAberrationContract,
  FateAberrationState,
  FateAberrationTemplate,
  FateDelayedEffect,
  FatePolarity,
  FateRiskClass,
  FateSeverity,
  FateTwist,
} from "./types.ts";
import { stableEntityId } from "../stable-id.ts";

export type FateResolveInput = {
  definition: AbilityDefinition;
  actorState: ExtraordinaryState;
  targetStates: (ExtraordinaryState & { id: string })[];
  intent: AbilityIntent;
  abilityContract: AbilityOutcomeContract;
  game: {
    week: number;
    saveId?: string;
    worldKernel?: { canon?: { mode?: string; deviation?: number; worldlineMode?: string } };
    fate?: FateAberrationState;
  };
  decision: {
    eligible: boolean;
    eligibilityReasons: string[];
    riskClass: FateRiskClass;
    pressureBefore: number;
    pressureAfter: number;
    gain: number;
    fateRoll: number;
    polarityRoll?: number;
    severityRoll?: number;
    templateRoll?: number;
  triggered: boolean;
  polarity?: FatePolarity;
  severity?: FateSeverity;
};
  template: FateAberrationTemplate;
};

export function twistFor(polarity: FatePolarity, result: AbilityOutcomeContract["result"]): FateTwist {
  const successSide = ["critical-success", "success", "partial-success"].includes(result);
  if (polarity === "boon") return successSide ? "pure" : "fortunate-disaster";
  return successSide ? "cursed-boon" : "full-disaster";
}

export function buildFateContract(input: FateResolveInput): FateAberrationContract {
  const { abilityContract, game, decision, template } = input;
  const seed = `${game.saveId ?? "default-save"}|${abilityContract.resolutionId}|${FATE_ALGORITHM_VERSION}`;
  const twist = decision.triggered ? twistFor(decision.polarity!, abilityContract.result) : undefined;
  const delayedEffects: FateDelayedEffect[] = template.delayedEffects.map((item) => ({
    id: `fate-delay-${template.id}-${item.id}`,
    dueWeek: game.week + item.inWeeks,
    kind: item.kind,
    description: item.description,
    worldEventTitle: item.worldEventTitle,
  }));
  const fateId = stableEntityId("fate", seed, "fate-id");
  return {
    fateId,
    resolutionId: abilityContract.resolutionId,
    algorithmVersion: FATE_ALGORITHM_VERSION,
    deterministicSeed: seed,
    eligible: decision.eligible,
    eligibilityReasons: decision.eligibilityReasons,
    pressureBefore: decision.pressureBefore,
    pressureAfter: decision.pressureAfter,
    fateRoll: decision.fateRoll,
    polarityRoll: decision.polarityRoll,
    severityRoll: decision.severityRoll,
    templateRoll: decision.templateRoll,
    triggered: decision.triggered,
    polarity: decision.polarity,
    twist,
    severity: decision.triggered ? (decision.severity ?? template.severity) : undefined,
    templateId: decision.triggered ? template.id : undefined,
    templateTitle: decision.triggered ? template.title : undefined,
    normalAbilityResult: abilityContract.result,
    immediateEffects: decision.triggered ? template.immediateEffects : [],
    delayedEffects: decision.triggered ? delayedEffects : [],
    worldEventProposals: decision.triggered ? template.worldEventProposals : [],
    beliefProposals: decision.triggered ? template.beliefProposals : [],
    relationshipProposals: decision.triggered ? template.relationshipProposals : [],
    commitmentProposals: decision.triggered ? template.commitmentProposals : [],
    planProposals: decision.triggered ? template.planProposals : [],
    recoveryHooks: decision.triggered ? template.recoveryHooks : [],
    narrativePremise: decision.triggered ? template.narrativePremise : undefined,
    narrativeConstraints: decision.triggered ? template.narrativeConstraints : [],
    invariants: [
      "hard-gate-preserved",
      "fate-seed-independent",
      "no-llm-permanent-effects",
      "no-re-roll-on-replay",
      ...(decision.triggered && (decision.severity ?? template.severity) === 4 ? ["worldline-divergence-recorded"] : []),
    ],
  };
}

export function validateFateContract(contract: FateAberrationContract): string[] {
  const errors: string[] = [];
  if (!contract.fateId) errors.push("missing-fateId");
  if (!contract.resolutionId) errors.push("missing-resolutionId");
  if (!contract.deterministicSeed.includes(contract.resolutionId)) errors.push("seed-not-bound-to-resolution");
  if (!contract.deterministicSeed.includes(FATE_ALGORITHM_VERSION)) errors.push("seed-missing-algorithm-version");
  if (!Number.isInteger(contract.fateRoll) || contract.fateRoll < 0 || contract.fateRoll > 99) errors.push("invalid-fate-roll");
  if (contract.pressureBefore < 0 || contract.pressureBefore > 100 || contract.pressureAfter < 0 || contract.pressureAfter > 100) {
    errors.push("pressure-out-of-range");
  }
  if (contract.triggered) {
    if (!contract.polarity || !contract.twist || !contract.severity || !contract.templateId) errors.push("triggered-contract-incomplete");
    if (contract.severity !== undefined && (contract.severity < 1 || contract.severity > 4)) errors.push("invalid-severity");
    if (contract.immediateEffects.length === 0) errors.push("triggered-without-effects");
  }
  if (!contract.triggered && (contract.immediateEffects.length || contract.delayedEffects.length || contract.worldEventProposals.length)) {
    errors.push("non-triggered-with-effects");
  }
  if (!contract.invariants.includes("hard-gate-preserved")) errors.push("missing-hard-gate-invariant");
  if (!contract.invariants.includes("no-re-roll-on-replay")) errors.push("missing-replay-invariant");
  return errors;
}

export function chanceSummary(riskClass: FateRiskClass, pressure: number) {
  return effectiveChances(riskClass, pressure);
}
