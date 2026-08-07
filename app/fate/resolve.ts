// 命运结算编排：资格 → 压力 → 独立骰 → 严重度 → 模板 → 不可变合同。
import type {
  AbilityDefinition,
  AbilityIntent,
  AbilityOutcomeContract,
  ExtraordinaryState,
} from "../abilities/types.ts";
import {
  FATE_ACTION_COOLDOWN,
  FATE_WEEKLY_TRIGGER_LIMIT,
  PRESSURE_AFTER_SEVERITY_CAP,
  PRESSURE_MAX,
  SEVERITY3_COOLDOWN_WEEKS,
  SEVERITY4_CAMPAIGN_LIMIT,
  SEVERITY4_COOLDOWN_WEEKS,
  SEVERITY4_MIN_PRESSURE,
  SEVERITY4_HIGH_CORRUPTION,
  SEVERITY4_RANK_GAP,
  SEVERITY4_WORLDLINE_DEVIATION,
} from "./config.ts";
import { buildFateContract, twistFor } from "./contract.ts";
import { isFateEligible } from "./eligibility.ts";
import { createInitialFateState, pressureGain, riskClassFor } from "./pressure.ts";
import { fateSeed, rollFateDecision, selectSeverity, stableHash } from "./roll.ts";
import { selectFateTemplate } from "./selector.ts";
import { fateTemplates, safeFallbackFor } from "./templates.ts";
import { recordFateTraceFromContract } from "./trace.ts";
import type {
  FateAberrationContract,
  FateAberrationState,
  FateDecision,
  FateRiskClass,
} from "./types.ts";

export type FateResolveOptions = {
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
  // 仅供测试/评测显式构造交叉结果；生产接线绝不传入。
  force?: { polarity?: "boon" | "disaster"; severity?: 1 | 2 | 3 | 4; templateId?: string };
};

export function resolveFateAberration(options: FateResolveOptions): FateAberrationContract {
  const startedAt = Date.now();
  const { definition, actorState, targetStates, intent, abilityContract, game } = options;
  const state = game.fate ?? createInitialFateState();
  const seed = fateSeed(abilityContract.resolutionId, game.saveId);
  const eligibility = isFateEligible({ definition, contract: abilityContract, intent });
  const worldlineDiverged =
    game.worldKernel?.canon?.mode === "diverging" ||
    (game.worldKernel?.canon?.deviation ?? 0) >= SEVERITY4_WORLDLINE_DEVIATION ||
    game.worldKernel?.canon?.worldlineMode === "canon-diverged";
  const targetState = targetStates[0];
  const riskClass: FateRiskClass = eligibility.eligible
    ? riskClassFor({
        definition,
        actorState,
        targetState,
        intent,
        legalityAllowed: abilityContract.legality.allowed,
        legalityReasons: abilityContract.legality.reasons,
        worldlineDiverged,
      })
    : "normal";

  const gain = eligibility.eligible
    ? pressureGain({
        riskClass,
        actorState,
        targetState,
        definition,
        intent,
        seed,
        worldlineDiverged,
      })
    : 0;
  const pressureBefore = state.pressure;
  const pressureForRoll = Math.min(PRESSURE_MAX, pressureBefore + gain);
  const forceTrigger = eligibility.eligible && state.pressure >= PRESSURE_MAX;

  let decision: FateDecision;
  if (!eligibility.eligible) {
    decision = {
      fateRoll: stableHash(`${seed}|fate-roll`) % 100,
      polarityRoll: stableHash(`${seed}|polarity-roll`) % 100,
      severityRoll: stableHash(`${seed}|severity-roll`) % 100,
      templateRoll: stableHash(`${seed}|template-roll`) % 1000,
      triggered: false,
      forced: false,
    };
  } else {
    decision = rollFateDecision({ seed, riskClass, pressure: pressureForRoll, forceTrigger });
  }

  // 低频冷却：任意异常后至少 2 次行动不触发；同周最多 1 次。
  if (!options.force) {
    if (
      eligibility.eligible &&
      state.lastTriggerEligibleIndex !== undefined &&
      state.eligibleActionCount - state.lastTriggerEligibleIndex < FATE_ACTION_COOLDOWN
    ) {
      decision = { ...decision, triggered: false };
    }
    if (
      eligibility.eligible &&
      FATE_WEEKLY_TRIGGER_LIMIT === 1 &&
      state.lastTriggerWeek === game.week
    ) {
      decision = { ...decision, triggered: false };
    }
  }

  // 测试覆盖显式指定（生产不会传入）。
  if (options.force?.polarity) {
    decision = {
      ...decision,
      triggered: true,
      polarity: options.force.polarity,
    };
  }

  const rankGap = targetState ? Math.max(0, targetState.internalRank - actorState.internalRank) : 0;
  const largeRitual =
    definition.activation.action === "ritual" ||
    definition.family === "ritual" ||
    definition.family === "summoning";
  const overPrepared = intent.preparationRefs.length >= 3;
  const rareCoincidence = intent.preparationRefs.length >= 2;

  let severity: 1 | 2 | 3 | 4 | undefined;
  if (decision.triggered) {
    const cooldownPassed = !state.severity4CooldownUntilWeek || game.week >= state.severity4CooldownUntilWeek;
    // 四级解锁需要真实高风险因素；仅压力高不足以解锁（普通路线不出现四级）。
    const highRisk =
      largeRitual ||
      actorState.corruption >= SEVERITY4_HIGH_CORRUPTION ||
      rankGap >= SEVERITY4_RANK_GAP ||
      worldlineDiverged;
    const fourAllowed = cooldownPassed && highRisk;
    severity = options.force?.severity ?? selectSeverity({
      severityRoll: decision.severityRoll ?? 0,
      severity4Allowed: fourAllowed,
      highPressure: pressureForRoll >= SEVERITY4_MIN_PRESSURE,
      worldlineDiverged,
      boost3: actorState.corruption >= 50 || rankGap >= 3 || actorState.stability <= 30,
      boost4: pressureForRoll >= SEVERITY4_MIN_PRESSURE || worldlineDiverged || largeRitual,
    });
    // 即使测试显式指定四级，也必须满足前置与冷却；一局最多 1 次四级。
    if (severity === 4 && (!fourAllowed || state.severity4Count >= SEVERITY4_CAMPAIGN_LIMIT)) severity = 3;
    // 三级至少间隔 4 周。
    if (
      severity === 3 &&
      !options.force &&
      state.lastSeverity3Week !== undefined &&
      game.week - state.lastSeverity3Week < SEVERITY3_COOLDOWN_WEEKS
    ) {
      severity = 2;
    }
  }

  const polarity = decision.polarity ?? "boon";
  const twist = decision.triggered ? twistFor(polarity, abilityContract.result) : undefined;
  const template = decision.triggered && twist
    ? (options.force?.templateId
        // 模板执行失败不得重新抽取：直接使用确定性安全兜底。
        ? fateTemplates().find((item) => item.id === options.force.templateId) ?? safeFallbackFor(twist)
        : selectFateTemplate(fateTemplates(), {
            definition,
            contract: abilityContract,
            polarity,
            twist,
            severity: severity ?? 1,
            severity4Allowed: severity === 4,
            recentTemplateIds: state.recentTemplateIds,
            pressure: pressureForRoll,
            worldlineDiverged,
            actorCorruption: actorState.corruption,
            actorStability: actorState.stability,
            rankGap,
            largeRitual,
            overPrepared,
            rareCoincidence,
            seed,
          }, decision.templateRoll ?? 0))
    : undefined;

  const pressureAfter = !eligibility.eligible
    ? pressureBefore
    : decision.triggered && severity
      ? Math.min(pressureForRoll, PRESSURE_AFTER_SEVERITY_CAP[severity])
      : pressureForRoll;

  const contract = buildFateContract({
    definition,
    actorState,
    targetStates,
    intent,
    abilityContract,
    game,
    decision: {
      eligible: eligibility.eligible,
      eligibilityReasons: eligibility.reasons,
      riskClass,
      pressureBefore,
      pressureAfter,
      gain,
      fateRoll: decision.fateRoll,
      polarityRoll: decision.polarityRoll,
      severityRoll: decision.severityRoll,
      templateRoll: decision.templateRoll,
      triggered: decision.triggered,
      polarity: decision.polarity,
      severity,
    },
    template: template ?? {
      id: "fate-unused-fallback",
      title: "未触发",
      families: [definition.family],
      polarity,
      twist: "pure",
      severity: 1,
      compatibleNormalResults: [abilityContract.result],
      prerequisites: [],
      forbiddenConditions: [],
      immediateEffects: [],
      delayedEffects: [],
      worldEventProposals: [],
      beliefProposals: [],
      relationshipProposals: [],
      commitmentProposals: [],
      planProposals: [],
      narrativePremise: "",
      narrativeConstraints: [],
      recoveryHooks: [],
      sourceType: "game-original-fate-template",
      absurdityScore: 0,
      longTermConsequenceScore: 0,
      recoverabilityScore: 0,
    },
  });
  recordFateTraceFromContract(contract, Date.now() - startedAt);
  return contract;
}

export function severity4CooldownWeeks(): number {
  return SEVERITY4_COOLDOWN_WEEKS;
}
