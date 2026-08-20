import { DISTRICTS, type GameState } from "./game-model.ts";
import type { WorldKernel } from "./world-kernel.ts";
import type { buildAdjudicatorProjection } from "./world-runtime.ts";
import { projectCampaignWorldForSimulation } from "./campaign-world.ts";
import { projectHighSequenceLedgerForSimulation } from "./high-sequence-ledger.ts";

export const AUTONOMOUS_AGENT_ADJUDICATION_RULES = "adjudicatorWorld.proposals 已由每个活跃主体从同一周起点独立生成并通过知识来源校验。裁决器不得替主体改变意图，也不得把某主体提案的私有依据泄露给其他主体或玩家。提案只表达意图，不代表成功；必须依据准备、情报、序列、能力、控制力、行动性质与既有条件命令统一处理冲突和先后。";

export type WorldAdjudicatorInputOptions = {
  game: GameState;
  resolvingWeek: number;
  playerActions: unknown[];
  adjudicatorWorld: ReturnType<typeof buildAdjudicatorProjection>;
  autonomousResidency: { activeCount: number; coldCount: number; limit: number };
  dynamicMemory: string;
  authorizedLore: string;
  loreRecordIds: string[];
  unifiedActionPlans?: unknown[];
  executableProposalIds?: string[];
  designerSupplement?: string | null;
};

export function buildWorldAdjudicatorInput(options: WorldAdjudicatorInputOptions) {
  const { game } = options;
  return {
    resolvingWeek: options.resolvingWeek,
    currentWeek: game.week,
    playerIssuedNoOrders: options.playerActions.length === 0,
    worldAuthority: {
      entityState: "adjudicatorWorld" as const,
      stateMutation: "kernelDelta" as const,
      compatibilityOutputs: ["factionMoves", "canonMoves"] as const,
    },
    chapter: options.playerActions,
    pivots: game.pivots,
    timeline: game.timeline,
    recentWorld: game.worldSnapshots?.slice(0, 4) ?? [],
    recentSignals: game.worldSignals?.slice(0, 10) ?? [],
    knownEvidence: game.evidenceNodes
      .filter((item) => item.discovered)
      .map((item) => ({ label: item.label, certainty: item.certainty, summary: item.summary })),
    organizationState: {
      foundingOrigin: game.playerOrigin.pathwayOrigin ? {
        id: game.playerOrigin.pathwayOrigin.id,
        title: game.playerOrigin.pathwayOrigin.title,
        source: game.playerOrigin.pathwayOrigin.source,
        contact: game.playerOrigin.pathwayOrigin.contact,
        enemy: game.playerOrigin.pathwayOrigin.enemy,
        firstCrisis: game.playerOrigin.pathwayOrigin.firstCrisis,
        loreEvidenceIds: game.playerOrigin.pathwayOrigin.loreEvidenceIds,
      } : null,
      playerTraits: game.playerOrigin.traits?.map((trait) => ({
        name: trait.name,
        kind: trait.kind,
        description: trait.description,
        triggers: trait.triggers,
      })) ?? [],
      resources: game.management.resources,
      offices: game.management.offices,
      formulas: game.management.formulas,
      branches: game.management.branches,
      reputation: game.management.reputation,
      exposure: game.management.exposure,
      factionHostility: game.management.factionHostility,
      controlledDistricts: game.management.map.districts.map((district) => ({ id: district.id, control: district.control })),
      departments: game.departments.map((item) => ({
        id: item.id,
        name: item.name,
        leadMemberId: item.leadMemberId,
        standingOrder: item.standingOrder,
        capacity: item.capacity,
        cohesion: item.cohesion,
        exposure: item.exposure,
        backlog: item.backlog,
        tensions: item.tensions,
        lastReport: item.lastReport,
      })),
      members: game.members.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        loyalty: item.loyalty,
        trust: item.trust,
        fatigue: item.fatigue,
        personalPressure: item.personalPressure,
        personalEventState: item.personalEventState,
        personalEventSignals: item.personalEventSignals,
        promises: item.promises,
      })),
      recruits: game.recruitPool.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        relationshipStage: item.relationshipStage,
        relationshipMomentum: item.relationshipMomentum,
        trust: item.trust,
        personalPressure: item.personalPressure,
      })),
      unresolvedIssues: game.organizationIssues.filter((item) => item.state === "待裁决" || item.state === "已逾期"),
    },
    campaignWorld: projectCampaignWorldForSimulation(game.campaignWorld, "backlund"),
    highSequenceLedger: projectHighSequenceLedgerForSimulation(game.highSequenceLedger, game.pathwayId),
    factionStrategy: {
      profiles: game.factionStrategy.profiles,
      diplomacy: game.factionStrategy.diplomacy,
      latestRound: game.factionStrategy.rounds.at(-1),
      latestOutcomes: game.factionStrategy.outcomes.slice(-12),
    },
    adjudicatorWorld: options.adjudicatorWorld,
    unifiedActionPlans: options.unifiedActionPlans ?? [],
    executableProposalIds: options.executableProposalIds ?? [],
    autonomousResidency: options.autonomousResidency,
    dynamicMemory: options.dynamicMemory,
    authorizedLore: options.authorizedLore,
    loreRecordIds: options.loreRecordIds,
    designerSupplement: options.designerSupplement?.trim().slice(0, 12_000) || null,
    autonomousAgentRules: AUTONOMOUS_AGENT_ADJUDICATION_RULES,
  };
}

export function projectLegacyWorldCompatibility(
  game: Pick<GameState, "factions" | "canonActors">,
  worldKernel: WorldKernel,
  canonMoves: unknown[],
) {
  const factions = game.factions.map((faction) => {
    const authoritative = worldKernel.factions.find((item) => item.id === faction.id);
    return authoritative ? {
      ...faction,
      currentPlan: authoritative.posture,
      suspicion: authoritative.suspicion,
      lastMove: authoritative.lastAction,
    } : faction;
  });
  const canonActors = game.canonActors.map((actor) => {
    const authoritative = worldKernel.actors.find((item) => item.id === actor.id);
    const move = canonMoves.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).actorId === actor.id) as Record<string, unknown> | undefined;
    const awareness = move && ["未知", "间接听闻", "注意", "直接接触"].includes(String(move.awareness))
      ? move.awareness as typeof actor.awareness
      : actor.awareness;
    if (!authoritative) return { ...actor, awareness };
    const location = DISTRICTS.find((district) => district.id === authoritative.locationId)?.name ?? authoritative.locationId;
    return {
      ...actor,
      location,
      agenda: authoritative.agenda,
      state: authoritative.condition,
      lastMove: authoritative.lastAction,
      awareness,
    };
  });
  return { factions, canonActors };
}
