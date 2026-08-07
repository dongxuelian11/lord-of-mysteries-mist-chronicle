// 命运合同原子应用：能力合同与命运合同共同进入正式事务。
import type { GameState } from "../game-model.ts";
import type { AbilityOutcomeContract } from "../abilities/types.ts";
import { applyAbilityResolution } from "../abilities/apply.ts";
import { deriveMemory, emptyMemoryState, type MemorySeed } from "../memory/index.ts";
import {
  SEVERITY4_COOLDOWN_WEEKS,
} from "./config.ts";
import { createInitialFateState, pushPendingDelayed, pushRecentTemplate, pushResolvedFate } from "./pressure.ts";
import type {
  FateAberrationContract,
  FateAberrationState,
  PendingDelayedEffect,
} from "./types.ts";

export type FateApplyResult = {
  game: GameState;
  applied: boolean;
  fateEventId?: string;
};

export function fateResolutionAlreadyApplied(game: GameState, contract: FateAberrationContract): boolean {
  const fate = game.fate;
  if (fate && fate.recentFateResolutionIds.includes(contract.resolutionId)) return true;
  return (game.worldKernel?.events ?? []).some((event) => event.id === `world-fate-${contract.fateId}`);
}

export function applyFateBundle(
  game: GameState,
  abilityContract: AbilityOutcomeContract,
  fateContract: FateAberrationContract,
  abilityName: string
): FateApplyResult {
  const abilityApplied = applyAbilityResolution(game, abilityContract, abilityName);
  if (!abilityApplied.applied) return { game, applied: false };
  if (fateResolutionAlreadyApplied(game, fateContract)) return { game, applied: false };

  const fate = game.fate ?? createInitialFateState();
  let nextFate: FateAberrationState = {
    ...fate,
    pressure: fateContract.pressureAfter,
    eligibleActionCount: fate.eligibleActionCount + (fateContract.eligible ? 1 : 0),
    ...(fateContract.triggered
      ? {
          totalTriggers: fate.totalTriggers + 1,
          boonTriggers: fate.boonTriggers + (fateContract.polarity === "boon" ? 1 : 0),
          disasterTriggers: fate.disasterTriggers + (fateContract.polarity === "disaster" ? 1 : 0),
              lastTriggerWeek: game.week,
              lastTriggerResolutionId: fateContract.resolutionId,
              lastTriggerEligibleIndex: fate.eligibleActionCount + (fateContract.eligible ? 1 : 0),
              lastSeverity3Week: fateContract.severity === 3 ? game.week : fate.lastSeverity3Week,
            }
      : {}),
    ...(fateContract.triggered && fateContract.severity
      ? {
          severityCounts: {
            ...fate.severityCounts,
            [String(fateContract.severity) as "1" | "2" | "3" | "4"]:
              fate.severityCounts[String(fateContract.severity) as "1" | "2" | "3" | "4"] + 1,
          },
          severity4Count: fate.severity4Count + (fateContract.severity === 4 ? 1 : 0),
          severity4CooldownUntilWeek:
            fateContract.severity === 4 ? game.week + SEVERITY4_COOLDOWN_WEEKS : fate.severity4CooldownUntilWeek,
        }
      : {}),
  };
  nextFate = pushResolvedFate(nextFate, fateContract.resolutionId);
  if (fateContract.templateId) nextFate = pushRecentTemplate(nextFate, fateContract.templateId);

  let next: GameState = abilityApplied.game;
  let fateEventId: string | undefined;
  if (fateContract.triggered && fateContract.templateId) {
    fateEventId = `world-fate-${fateContract.fateId}`;
    const worldEvent = {
      id: fateEventId,
      week: game.week,
      title: `命运异常：${fateContract.templateTitle ?? fateContract.templateId}`,
      detail: fateContract.immediateEffects.map((item) => item.description).join("；"),
      locationId: undefined as string | undefined,
      actorIds: [abilityContract.actorId],
      factionIds: [],
      causeIds: [abilityContract.resolutionId],
      visibility: "world" as const,
    };
    let worldKernel = {
      ...next.worldKernel,
      events: [...next.worldKernel.events, worldEvent].slice(-240),
    };
    if (fateContract.severity === 4) {
      const canon = worldKernel.canon;
      worldKernel = {
        ...worldKernel,
        canon: {
          ...canon,
          mode: "diverging" as const,
          deviation: Math.min(100, canon.deviation + 10),
          pivotEventIds: [...new Set([...canon.pivotEventIds, fateEventId])],
          knowledgeHorizon: {
            ...canon.knowledgeHorizon,
            worldlineMode: "canon-diverged" as const,
          },
        },
      };
    }

    const seeds: MemorySeed[] = [
      {
        kind: "event",
        sourceEventId: fateEventId,
        week: game.week,
        type: "fate-aberration",
        summary: `命运异常：${fateContract.templateTitle ?? fateContract.templateId}（${fateContract.severity}级）`,
        participantIds: [abilityContract.actorId],
        observerIds: [...abilityContract.targetIds],
        importance: 0.9,
        emotionalWeight: 0.85,
        tags: ["fate-aberration", String(fateContract.severity), fateContract.templateId],
      },
      ...fateContract.beliefProposals.map((proposal) => ({
        kind: "belief" as const,
        characterId: proposal.characterId,
        propositionKey: proposal.propositionKey,
        subjectId: proposal.subjectId,
        claimType: proposal.claimType,
        claim: proposal.claim,
        confidence: proposal.confidence,
        truthStatus: proposal.truthStatus,
        learnedFrom: { type: "observed" as const, sourceId: fateEventId! },
        validFromWeek: game.week,
        secrecy: proposal.secrecy,
        importance: 0.85,
        emotionalWeight: 0.8,
      })),
      ...fateContract.relationshipProposals.map((proposal) => ({
        kind: "relationship" as const,
        sourceEventId: fateEventId!,
        fromCharacterId: proposal.fromCharacterId,
        toCharacterId: proposal.toCharacterId,
        dimension: proposal.dimension,
        delta: proposal.delta,
        summary: proposal.summary,
        createdWeek: game.week,
      })),
      ...fateContract.commitmentProposals.map((proposal, index) => ({
        kind: "commitment" as const,
        id: `fate-commit-${fateContract.fateId}-${index}`,
        type: proposal.type,
        participantIds: proposal.participantIds,
        summary: proposal.summary,
        createdWeek: game.week,
        sourceEventId: fateEventId!,
        importance: 0.85,
        secrecy: proposal.secrecy,
      })),
      ...fateContract.planProposals.map((proposal, index) => ({
        kind: "plan" as const,
        id: `fate-plan-${fateContract.fateId}-${index}`,
        ownerId: proposal.ownerId,
        participantIds: proposal.participantIds,
        title: proposal.title,
        objective: proposal.objective,
        currentStep: proposal.currentStep,
        createdWeek: game.week,
        dueWeek: proposal.dueWeek,
        status: "active" as const,
        sourceEventIds: [fateEventId!],
        secrecy: proposal.secrecy,
        importance: 0.8,
      })),
    ];
    const memory = deriveMemory(next.memory ?? emptyMemoryState(), seeds).state;
    next = {
      ...next,
      worldKernel,
      memory,
      facts: [
        ...next.facts,
        {
          id: `fact-fate-${fateContract.fateId}`,
          subject: fateContract.templateTitle ?? "命运异常",
          statement: `命运异常（${fateContract.severity}级）：${fateContract.immediateEffects[0]?.description ?? ""}`,
          certainty: "线索" as const,
          source: "命运失控机制",
          week: game.week,
        },
      ].slice(-100),
    };
  }

  if (fateContract.delayedEffects.length) {
    const pending: PendingDelayedEffect[] = fateContract.delayedEffects.map((item) => ({
      ...item,
      fateId: fateContract.fateId,
      templateId: fateContract.templateId ?? "unknown",
      sourceEventId: fateEventId ?? `world-fate-${fateContract.fateId}`,
    }));
    nextFate = pushPendingDelayed(nextFate, pending);
  }

  next = { ...next, fate: nextFate };
  return { game: next, applied: true, fateEventId };
}

export function advanceFateWeek(game: GameState): GameState {
  const fate = game.fate;
  if (!fate || !fate.pendingDelayedEffects.length) return game;
  const due = fate.pendingDelayedEffects.filter((item) => item.dueWeek <= game.week);
  if (!due.length) return game;
  const remaining = fate.pendingDelayedEffects.filter((item) => item.dueWeek > game.week);
  let next = game;
  for (const item of due) {
    const eventId = `world-fate-delay-${item.id}`;
    if ((next.worldKernel?.events ?? []).some((event) => event.id === eventId)) continue;
    const worldEvent = {
      id: eventId,
      week: game.week,
      title: item.worldEventTitle,
      detail: item.description,
      locationId: undefined as string | undefined,
      actorIds: [],
      factionIds: [],
      causeIds: [item.sourceEventId],
      visibility: "world" as const,
    };
    const seeds: MemorySeed[] = [
      {
        kind: "event",
        sourceEventId: eventId,
        week: game.week,
        type: "fate-delayed",
        summary: item.description,
        participantIds: [],
        observerIds: [],
        importance: 0.75,
        emotionalWeight: 0.65,
        tags: ["fate-delayed", item.templateId],
      },
    ];
    next = {
      ...next,
      worldKernel: {
        ...next.worldKernel,
        events: [...next.worldKernel.events, worldEvent].slice(-240),
      },
      memory: deriveMemory(next.memory ?? emptyMemoryState(), seeds).state,
    };
  }
  return { ...next, fate: { ...fate, pendingDelayedEffects: remaining } };
}
