// 原子应用：幂等账本 + 世界事件权威 + 资源不归负 + 动态记忆派生。
import { deriveMemory, type MemorySeed } from "../memory/index.ts";
import type { GameState } from "../game-model.ts";
import type { AbilityOutcomeContract } from "./types.ts";

const LEDGER_LIMIT = 1000;

export type ApplyResult = {
  game: GameState;
  applied: boolean;
  worldEventId?: string;
};

export function resolutionAlreadyApplied(game: GameState, contract: AbilityOutcomeContract): boolean {
  const ledger = (game as GameState & { abilityResolutions?: string[] }).abilityResolutions ?? [];
  if (ledger.includes(contract.resolutionId)) return true;
  return (game.worldKernel?.events ?? []).some((event) => event.id === `world-ability-${contract.resolutionId}`);
}

export function applyAbilityResolution(
  game: GameState,
  contract: AbilityOutcomeContract,
  abilityName: string
): ApplyResult {
  if (resolutionAlreadyApplied(game, contract)) return { game, applied: false };
  const spirituality = Math.max(
    0,
    game.spirituality -
      contract.committedCosts
        .filter((cost) => cost.resource === "spirituality")
        .reduce((sum, cost) => sum + cost.amount, 0)
  );
  const backlash = contract.result === "backlash";
  // 反噬的污染后果必须真正写入玩家污染状态，而不是只写叙事故意。
  const pollutionAdd = backlash
    ? Math.min(8, contract.sideEffects.reduce((sum, effect) => sum + effect.severity, 0))
    : 0;
  const stability = Math.max(0, game.stability - (backlash ? 4 : 0));
  const mentalLoad = Math.min(100, game.mentalLoad + (contract.committedCosts.length ? 3 : 0));
  const worldEventId = `world-ability-${contract.resolutionId}`;
  const worldEvent = {
    id: worldEventId,
    week: game.week,
    title: `非凡能力：${abilityName}`,
    detail: `结算结果：${contract.result}${backlash ? "，伴随反噬与污染风险。" : ""}`,
    locationId: undefined as string | undefined,
    actorIds: [contract.actorId],
    factionIds: [],
    causeIds: [],
    visibility: "world" as const,
  };

  const memorySeeds: MemorySeed[] = [
    {
      kind: "event",
      sourceEventId: worldEventId,
      week: game.week,
      type: "ability-use",
      summary: `${abilityName} 结算为 ${contract.result}`,
      participantIds: [contract.actorId],
      observerIds: contract.targetIds,
      importance: contract.result === "backlash" || contract.result === "critical-success" ? 0.8 : 0.5,
      emotionalWeight: backlash ? 0.7 : 0.4,
      tags: ["ability-use", contract.result],
    },
  ];
  for (const proposal of contract.beliefProposals) {
    memorySeeds.push({
      kind: "belief",
      characterId: proposal.characterId,
      subjectId: proposal.subjectId,
      claimType: proposal.claimType,
      propositionKey: proposal.propositionKey,
      claim: proposal.claim,
      confidence: proposal.confidence,
      truthStatus: proposal.truthStatus,
      learnedFrom: { type: "observed", sourceId: worldEventId },
      validFromWeek: game.week,
      secrecy: proposal.secrecy,
    });
  }
  const memory = deriveMemory(
    game.memory ?? {
      version: 1,
      events: [],
      beliefs: [],
      commitments: [],
      relationshipCauses: [],
      plans: [],
      audienceStates: [],
      receipts: [],
      receiptLedger: { recalledByAudience: {} },
    },
    memorySeeds
  ).state;

  const ledger = [
    ...((game as GameState & { abilityResolutions?: string[] }).abilityResolutions ?? []),
    contract.resolutionId,
  ].slice(-LEDGER_LIMIT);
  const next = {
    ...game,
    spirituality,
    stability,
    mentalLoad,
    memory,
    abilityResolutions: ledger,
    playerCondition: game.playerCondition
      ? {
          ...game.playerCondition,
          pollution: Math.min(100, (game.playerCondition?.pollution ?? 0) + pollutionAdd),
        }
      : game.playerCondition,
    worldKernel: {
      ...game.worldKernel,
      events: [...game.worldKernel.events, worldEvent].slice(-240),
    },
    facts: [
      ...game.facts,
      {
        id: `fact-ability-${contract.resolutionId}`,
        subject: abilityName,
        statement: `能力结算结果：${contract.result}`,
        certainty: "可信" as const,
        source: "规则引擎",
        week: game.week,
      },
    ].slice(-100),
  };
  return { game: next, applied: true, worldEventId };
}
