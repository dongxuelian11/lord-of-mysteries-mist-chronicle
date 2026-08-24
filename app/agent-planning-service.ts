import type { AiConfig } from "./ai-client.ts";
import type { ChronicleChapter, GameState } from "./game-model.ts";
import { emptyMemoryState } from "./memory/index.ts";
import type { LegacyLoreRecord } from "./rag/index.ts";
import type { CanonKnowledgeHorizon } from "./rag/types.ts";
import {
  buildAutonomousDecisionFrames,
  ensureAutonomousWorldState,
} from "./autonomous-agents.ts";
import { requestAutonomousAgentProposal } from "./autonomous-planning.ts";
import {
  buildAgentPlanningProjection,
  planActiveAgentsIndependently,
  type AgentProposal,
} from "./world-runtime.ts";

const uncommittedProposalCache = new WeakMap<GameState, Map<string, AgentProposal>>();

export type AgentPlanningServiceInput = {
  config: AiConfig;
  game: GameState;
  chapter: ChronicleChapter;
  loreRecords: LegacyLoreRecord[];
  horizon: CanonKnowledgeHorizon;
  onProgress?: (ready: number, total: number) => void;
};

export async function planAutonomousAgentsForWeek(input: AgentPlanningServiceInput) {
  const memory = input.game.memory ?? emptyMemoryState();
  const autonomousState = ensureAutonomousWorldState(input.game.worldAgents, input.game.worldKernel, memory);
  const decisionFrames = buildAutonomousDecisionFrames(autonomousState, input.game.worldKernel, input.chapter.week, memory);
  const planningProjections = new Map(
    decisionFrames.map((frame) => [
      frame.ref,
      buildAgentPlanningProjection(frame, input.game.worldKernel, memory),
    ]),
  );
  const proposalCache = uncommittedProposalCache.get(input.game) ?? new Map<string, AgentProposal>();
  uncommittedProposalCache.set(input.game, proposalCache);
  let readyAgents = 0;
  const proposals = await planActiveAgentsIndependently(
    decisionFrames,
    input.game.worldKernel,
    (projection, context) => requestAutonomousAgentProposal(
      input.config,
      input.loreRecords,
      projection,
      { week: input.game.week, date: input.game.date, horizon: input.horizon, baseRevision: input.game.worldKernel.revision },
      context,
    ),
    {
      maxAttempts: 2,
      proposalCache,
      memory,
      materialityGate: !(typeof window !== "undefined" && typeof window.mistInference?.requestAutonomous === "function"),
      failurePolicy: "fallback-wait",
      onAgentStage: ({ state }) => {
        if (state === "ready" || state === "degraded") readyAgents += 1;
        input.onProgress?.(Math.min(readyAgents, decisionFrames.length), decisionFrames.length);
      },
    },
  );
  return {
    autonomousState,
    decisionFrames,
    planningProjections,
    proposals,
  };
}

export function releaseAutonomousPlanningCache(game: GameState) {
  uncommittedProposalCache.delete(game);
}
