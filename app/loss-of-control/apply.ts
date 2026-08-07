// 失控合同原子应用：与能力合同、命运合同共同进入正式事务。
import type { GameState } from "../game-model.ts";
import type { AbilityOutcomeContract } from "../abilities/types.ts";
import type { FateAberrationContract } from "../fate/types.ts";
import { deriveMemory, emptyMemoryState, type MemorySeed } from "../memory/index.ts";
import { CONTROL_RESOLVED_LIMIT } from "./config.ts";
import type { ControlState, LossOfControlContract } from "./types.ts";

export function createInitialControlState(): ControlState {
  return {
    stability: 100,
    pollution: 0,
    mentalLoad: 0,
    stage: "stable",
    recentRisk: 0,
    activeSymptoms: [],
    resolvedControlIds: [],
  };
}

export function controlResolutionAlreadyApplied(game: GameState, contract: LossOfControlContract): boolean {
  const control = game.control;
  if (control && control.resolvedControlIds.includes(contract.resolutionId)) return true;
  return (game.worldKernel?.events ?? []).some((event) => event.id === `world-control-${contract.id}`);
}

export function applyControlBundle(
  game: GameState,
  abilityContract: AbilityOutcomeContract,
  fateContract: FateAberrationContract,
  controlContract: LossOfControlContract,
  actorName: string
): { game: GameState; applied: boolean } {
  if (controlResolutionAlreadyApplied(game, controlContract)) return { game, applied: false };
  const control = game.control ?? createInitialControlState();
  let stability = Math.max(0, game.stability);
  let pollution = game.playerCondition?.pollution ?? control.pollution;
  let mentalLoad = Math.max(0, game.mentalLoad);
  for (const change of controlContract.stateChanges) {
    if (change.field === "stability") stability = Math.max(0, Math.min(100, stability + change.delta));
    if (change.field === "pollution") pollution = Math.max(0, Math.min(100, pollution + change.delta));
    if (change.field === "mentalLoad") mentalLoad = Math.max(0, Math.min(100, mentalLoad + change.delta));
  }

  const nextControl: ControlState = {
    ...control,
    stability: controlContract.triggered ? Math.min(control.stability, stability) : control.stability,
    pollution: controlContract.triggered ? Math.max(control.pollution, pollution) : control.pollution,
    mentalLoad: controlContract.triggered ? Math.max(control.mentalLoad, mentalLoad) : control.mentalLoad,
    stage: controlContract.triggered ? controlContract.stageAfter : control.stage,
    recentRisk: controlContract.triggered ? controlContract.riskScore : control.recentRisk,
    activeSymptoms: controlContract.triggered ? controlContract.symptoms : control.activeSymptoms,
    lastTriggerEligibleIndex: controlContract.triggered
      ? controlContract.eligibleIndex ?? control.resolvedControlIds.length
      : control.lastTriggerEligibleIndex,
    resolvedControlIds: [...control.resolvedControlIds, controlContract.resolutionId].slice(-CONTROL_RESOLVED_LIMIT),
  };

  let next: GameState = {
    ...game,
    stability,
    mentalLoad,
    playerCondition: { ...game.playerCondition, pollution },
    control: nextControl,
  };

  if (controlContract.triggered) {
    const worldEventId = `world-control-${controlContract.id}`;
    const worldEvent = {
      id: worldEventId,
      week: game.week,
      title: `失控：${controlContract.stageAfter}`,
      detail: controlContract.symptoms.join("；"),
      locationId: undefined as string | undefined,
      actorIds: [abilityContract.actorId],
      factionIds: [],
      causeIds: [fateContract.fateId],
      // 玩家自己的失控事件必须对玩家投影可见。
      visibility: "player" as const,
    };
    const seeds: MemorySeed[] = [
      {
        kind: "event",
        sourceEventId: worldEventId,
        week: game.week,
        type: "control-loss",
        summary: `${actorName}进入失控阶段「${controlContract.stageAfter}」`,
        participantIds: [abilityContract.actorId],
        observerIds: [],
        importance: 0.85,
        emotionalWeight: 0.8,
        tags: ["control-loss", controlContract.stageAfter],
      },
      ...controlContract.recoveryPlanProposals.map((proposal, index) => ({
        kind: "plan" as const,
        id: `control-plan-${controlContract.id}-${index}`,
        ownerId: proposal.ownerId,
        participantIds: proposal.participantIds,
        title: proposal.title,
        objective: proposal.objective,
        currentStep: proposal.currentStep,
        createdWeek: game.week,
        dueWeek: proposal.dueWeek,
        status: "active" as const,
        sourceEventIds: [worldEventId],
        secrecy: proposal.secrecy,
        importance: 0.85,
      })),
    ];
    next = {
      ...next,
      worldKernel: {
        ...next.worldKernel,
        events: [...next.worldKernel.events, worldEvent].slice(-240),
      },
      memory: deriveMemory(next.memory ?? emptyMemoryState(), seeds).state,
      facts: [
        ...next.facts,
        {
          id: `fact-control-${controlContract.id}`,
          subject: actorName,
          statement: `失控阶段：${controlContract.stageAfter}`,
          certainty: "线索" as const,
          source: "轻量失控框架",
          week: game.week,
        },
      ].slice(-100),
    };
  }
  return { game: next, applied: true };
}
