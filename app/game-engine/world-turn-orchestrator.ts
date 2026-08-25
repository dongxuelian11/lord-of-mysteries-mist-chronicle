import {
  type ActionCausalReceipts,
  ActionResult,
  ChronicleChapter,
  DISTRICTS,
  GameState,
  PATHWAYS,
  type PathwayId,
  type ScheduledAction,
  WorldSnapshot,
} from "../game-model";
import { stableEntityId } from "../stable-id.ts";
import { WORLD_LORE_CONTEXT_MARKER, WORLD_LORE_IDS_MARKER, type AiConfig } from "../ai-client";
import { type LegacyLoreRecord } from "../rag";
import { retrieveLoreContextAsync } from "../rag/client";
import {
  deriveMemoryFromWorldState,
  emptyMemoryState,
  memoryPromptBlockWithIds,
  submitMemoryDelivery,
  markMemoryPresented,
  markMemoryRecalled,
  actorAudience,
  factionAudience,
  worldSystemAudience,
} from "../memory/index";
import { projectWorldForAudience, type AudienceWorldEvent, type WorldTurnDelta } from "../world-kernel";
import { attachIntelligenceToBacklundMap } from "../organization-management.ts";
import {
  actionAdjudicationLedgerEvents,
  adjudicateWorldActionProposals,
  createActionRuleContext,
  proposalFromAgentProposal,
} from "../world-actions.ts";
import {
  appendWorldLedgerEvents,
  commitWorldLedgerWeek,
  createWorldLedger,
  recordWorldLedgerPhase,
} from "../world-ledger.ts";
import { advanceAutonomousWorldState } from "../autonomous-agents.ts";
import {
  assertWorldAdjudicatorPayloadBudget,
  buildAdjudicatorProjection,
  fitWorldAdjudicatorPayload,
  type AgentProposal,
} from "../world-runtime.ts";
import { buildWorldAdjudicatorPrompt, WORLD_ADJUDICATOR_SYSTEM } from "../world-adjudicator-prompt.ts";
import { applyCampaignSignals } from "../campaign-world.ts";
import { actionTextBoundaryIssue } from "../action-boundaries.ts";
import { repairActionReports, requestWorldEnvelope } from "../world-envelope.ts";
import { planAutonomousAgentsForWeek, releaseAutonomousPlanningCache } from "../agent-planning-service.ts";
import { buildWorldAdjudicatorInput, projectLegacyWorldCompatibility } from "../world-authority.ts";
import { adaptWorldAdjudication, type ExecutableProposalBoundary } from "../world-output-adapter.ts";
import { commitWorldTurn } from "../turn-commit.ts";
import { attachOrganizationAdjudicationProtocol, WORLD_KERNEL_PROTOCOL, WORLD_PROPOSAL_PROVENANCE_PROTOCOL } from "../world-adjudication-protocol.ts";
import { chronicleSummaryFromCausality } from "../chronicle-causality.ts";
import { actionDomain, seeksEvidence } from "./week-resolution.ts";
import { knowledgeHorizon } from "./dialogue-orchestration.ts";
import type { RuntimeTraceContext } from "../runtime-trace.ts";
import type { RetrievalReceipt } from "../world-authority-closure.ts";

export type LoreRecord = LegacyLoreRecord;


async function loreForWorld(records: LoreRecord[], game: GameState, query: string, maxChars = 12_000, trace?: Pick<RuntimeTraceContext, "traceId" | "turnId">) {
  return retrieveLoreContextAsync(records, {
    query,
    audience: { kind: "world-simulation-internal", principalRef: "world", purpose: "world-simulation", knownLoreIds: [], topicGrants: [] },
    limit: 24,
    maxChars,
    week: game.week,
    gameDate: game.date,
    horizon: knowledgeHorizon(game, true),
    trace,
  });
}

type CausalReceipt = ActionCausalReceipts["people"][number];
type ReceiptContext = {
  actionResult: ActionResult;
  delta: WorldTurnDelta;
  worldKernel: GameState["worldKernel"];
  game: GameState;
  proposalId?: string;
  visibleEvents: AudienceWorldEvent[];
  visibleEventIds: Set<string>;
};

function causalReceipt(id: string, summary: string, entityRefs: string[], sourceEventIds: string[] = []): CausalReceipt {
  return { id, summary, entityRefs: [...new Set(entityRefs.filter(Boolean))], sourceEventIds: [...new Set(sourceEventIds.filter(Boolean))] };
}

function playerVisibleProposalEvents(actionResult: ActionResult, delta: WorldTurnDelta, worldKernel: GameState["worldKernel"]) {
  const proposalId = actionResult.executionPlan?.proposalId;
  if (!proposalId) return [];
  const proposalEventIds = new Set(worldKernel.events
    .filter((event) => event.week === delta.week && event.sourceProposalIds?.includes(proposalId))
    .map((event) => event.id));
  return projectWorldForAudience(worldKernel, { kind: "player", holderId: "player" }).events
    .filter((event) => proposalEventIds.has(event.id));
}

function peopleReceipts(context: ReceiptContext) {
  const participantIds = [...new Set([context.actionResult.contract.leaderId, ...context.actionResult.contract.memberIds].filter((id) => id !== "organization"))];
  const receipts = participantIds.map((participantId) => {
    const name = participantId === "player" ? "你" : context.game.members.find((member) => member.id === participantId)?.name ?? context.worldKernel.actors.find((actor) => actor.id === participantId)?.name ?? "受命人";
    const eventIds = context.visibleEvents.filter((event) => event.knownActorIds.includes(participantId)).map((event) => event.id);
    return causalReceipt(`receipt:${context.actionResult.id}:person:${participantId}`, `${name}参与了“${context.actionResult.title}”，并留下了可确认的执行回执。`, [participantId === "player" ? "player" : `actor:${participantId}`], eventIds);
  });
  for (const event of context.visibleEvents) for (const actorId of event.knownActorIds) if (!receipts.some((receipt) => receipt.entityRefs.includes(`actor:${actorId}`))) {
    const name = context.worldKernel.actors.find((actor) => actor.id === actorId)?.name ?? "相关人物";
    receipts.push(causalReceipt(`receipt:${context.actionResult.id}:event-person:${actorId}`, `${event.title}改变了${name}的处境。`, [`actor:${actorId}`], [event.id]));
  }
  return receipts;
}

function resourceReceipts(context: ReceiptContext) {
  const commitments = context.actionResult.executionPlan?.commitments;
  const parts = [context.actionResult.resourceChanges.money ? `资金${context.actionResult.resourceChanges.money > 0 ? "+" : ""}${context.actionResult.resourceChanges.money}` : "", commitments?.manpower ? `调用人力${commitments.manpower}` : "", commitments?.extraordinaryMaterials ? `消耗非凡材料${commitments.extraordinaryMaterials}` : ""].filter(Boolean);
  return parts.length ? [causalReceipt(`receipt:${context.actionResult.id}:resources`, parts.join("，"), ["organization"], context.visibleEvents.map((event) => event.id))] : [];
}

function locationReceipts(context: ReceiptContext) {
  const updatedIds = context.delta.locationUpdates.filter((update) => context.proposalId && update.sourceProposalIds.includes(context.proposalId)).map((update) => update.locationId);
  const locationIds = [...new Set([context.actionResult.contract.districtId, ...context.visibleEvents.map((event) => event.locationId ?? ""), ...updatedIds].filter(Boolean))];
  return locationIds.map((locationId) => {
    const events = context.visibleEvents.filter((event) => event.locationId === locationId);
    const update = context.delta.locationUpdates.find((candidate) => candidate.locationId === locationId && context.proposalId && candidate.sourceProposalIds.includes(context.proposalId));
    const summary = events.length ? events.map((event) => event.title).join("；") : update?.condition || update?.publicMood || `“${context.actionResult.title}”在此处留下了可继续追踪的影响。`;
    return causalReceipt(`receipt:${context.actionResult.id}:location:${locationId}`, summary, [`location:${locationId}`], events.map((event) => event.id));
  });
}

function knowledgeReceipts(context: ReceiptContext) {
  const sourceEventByKnowledgeId = new Map(context.worldKernel.knowledge
    .filter((node) => node.sourceEventId)
    .map((node) => [node.id, node.sourceEventId!]));
  return projectWorldForAudience(context.worldKernel, { kind: "player", holderId: "player" }).knowledge
    .filter((node) => node.acquiredWeek === context.delta.week && context.visibleEventIds.has(sourceEventByKnowledgeId.get(node.id) ?? ""))
    .map((node) => {
      const sourceEventId = sourceEventByKnowledgeId.get(node.id)!;
      return causalReceipt(`receipt:${context.actionResult.id}:knowledge:${node.id}`, node.statement, [`knowledge:${node.id}`], [sourceEventId]);
    });
}

function relationshipReceipts(context: ReceiptContext) {
  if (!["交涉", "招募"].includes(context.actionResult.contract.kind) || context.actionResult.outcome === "受阻") return [];
  return [causalReceipt(`receipt:${context.actionResult.id}:relationship`, `与${context.actionResult.contract.target}的关系因本次${context.actionResult.contract.kind}发生了可延续的变化。`, [], context.visibleEvents.map((event) => event.id))];
}

function futureCauseReceipts(context: ReceiptContext) {
  return [...context.visibleEvents.map((event) => causalReceipt(`receipt:${context.actionResult.id}:future:${event.id}`, `${event.title}已经进入后续因果线。`, event.locationId ? [`location:${event.locationId}`] : [], [event.id])), ...(context.actionResult.futureChanges ?? []).map((summary, index) => causalReceipt(`receipt:${context.actionResult.id}:future-local:${index}`, summary, [], context.visibleEvents.map((event) => event.id)))].slice(0, 8);
}

function causalReceiptsForAction(actionResult: ActionResult, delta: WorldTurnDelta, worldKernel: GameState["worldKernel"], game: GameState): ActionCausalReceipts {
  const visibleEvents = playerVisibleProposalEvents(actionResult, delta, worldKernel);
  const context: ReceiptContext = { actionResult, delta, worldKernel, game, proposalId: actionResult.executionPlan?.proposalId, visibleEvents, visibleEventIds: new Set(visibleEvents.map((event) => event.id)) };
  return { people: peopleReceipts(context), resources: resourceReceipts(context), locations: locationReceipts(context), knowledge: knowledgeReceipts(context), relationships: relationshipReceipts(context), futureCauses: futureCauseReceipts(context) };
}

type DirectiveInterruption = NonNullable<WorldTurnDelta["directiveInterruptions"]>[number];
type InterruptionAdjustments = { money: number; extraordinaryMaterials: number; spirituality: number; secrecy: number; stability: number; influence: number };
type InterruptionContext = {
  actionResult: ActionResult;
  plan: NonNullable<ActionResult["executionPlan"]>;
  interruption: DirectiveInterruption;
  usedCommitments: ReturnType<typeof scaledInterruptionCommitments>;
  chapterWeek: number;
  missionProgress: number;
};
type InterruptedAction = { actionResult: ActionResult; continuation: ScheduledAction; adjustments: InterruptionAdjustments; missionRefund: number };

function scaledInterruptionCommitments(plan: NonNullable<ActionResult["executionPlan"]>, fraction: number) {
  return {
    money: Math.max(0, Math.round(plan.commitments.money * fraction)),
    manpower: plan.commitments.manpower,
    extraordinaryMaterials: Math.max(0, Math.round(plan.commitments.extraordinaryMaterials * fraction)),
    spirituality: Math.max(0, Math.round(plan.commitments.spirituality * fraction)),
  };
}

function interruptedExecutionState(context: InterruptionContext) {
  const { actionResult, plan, interruption, usedCommitments, chapterWeek } = context;
  const requested = actionResult.contract.resourceCommitment ?? { money: actionResult.contract.budget, manpower: 0, extraordinaryMaterials: 0, posture: "balanced" as const };
  const progressDelta = Math.max(1, Math.round(plan.progressDelta * interruption.completedFraction));
  return {
    originWeek: chapterWeek,
    attemptOrdinal: Math.max(1, Number(plan.attemptId.split(":").at(-1)) || 1),
    status: "interrupted" as const,
    progress: Math.min(99, Math.max(0, 100 - plan.progressDelta) + progressDelta),
    consumed: {
      money: Math.max(0, requested.money - plan.commitments.money) + usedCommitments.money,
      manpower: usedCommitments.manpower,
      extraordinaryMaterials: Math.max(0, requested.extraordinaryMaterials - plan.commitments.extraordinaryMaterials) + usedCommitments.extraordinaryMaterials,
      spirituality: usedCommitments.spirituality,
    },
    nextEligibleWeek: chapterWeek + 1,
    lastAttemptId: plan.attemptId,
    lastReason: interruption.reason,
    consequenceEventIds: [...new Set([...plan.causeEventIds, interruption.sourceEventId])],
  };
}

function interruptionExecutionPlan(context: InterruptionContext) {
  const { plan, interruption, usedCommitments, chapterWeek } = context;
  const progressDelta = Math.max(1, Math.round(plan.progressDelta * interruption.completedFraction));
  return {
    ...plan,
    commitments: usedCommitments,
    disposition: "interrupted" as const,
    progressDelta,
    remainingDays: Math.max(1, Math.ceil(plan.timeWindow.days * (1 - interruption.completedFraction))),
    nextEligibleWeek: chapterWeek + 1,
    interruptionReason: interruption.reason,
    causeEventIds: [...new Set([...plan.causeEventIds, interruption.sourceEventId])],
  };
}

function interruptionResourceChanges(context: InterruptionContext) {
  const { actionResult, interruption, usedCommitments } = context;
  return {
    money: -usedCommitments.money,
    secrecy: Math.round(actionResult.resourceChanges.secrecy * interruption.completedFraction),
    stability: Math.round(actionResult.resourceChanges.stability * interruption.completedFraction),
    influence: Math.round(actionResult.resourceChanges.influence * interruption.completedFraction),
  };
}

function interruptionRefunds(context: InterruptionContext, resourceChanges: ActionResult["resourceChanges"]): InterruptionAdjustments {
  const { actionResult, plan, usedCommitments } = context;
  return {
    money: plan.commitments.money - usedCommitments.money,
    extraordinaryMaterials: plan.commitments.extraordinaryMaterials - usedCommitments.extraordinaryMaterials,
    spirituality: plan.commitments.spirituality - usedCommitments.spirituality,
    secrecy: resourceChanges.secrecy - actionResult.resourceChanges.secrecy,
    stability: resourceChanges.stability - actionResult.resourceChanges.stability,
    influence: resourceChanges.influence - actionResult.resourceChanges.influence,
  };
}

function interruptedActionResult(context: InterruptionContext, resourceChanges: ActionResult["resourceChanges"]): ActionResult {
  const { actionResult, interruption } = context;
  return {
    ...actionResult,
    outcome: "部分成功",
    executionStatus: "interrupted",
    executionPlan: interruptionExecutionPlan(context),
    resourceChanges,
    missionProgress: context.missionProgress,
    consequence: `${actionResult.consequence} 负责人在“${interruption.triggeredBoundary}”被触发后停止推进：${interruption.reason}`,
    futureChanges: [...(actionResult.futureChanges ?? []), "已经发生的变化保留，未完成部分将在条件允许时继续。"].slice(0, 6),
  };
}

function interruptAction(actionResult: ActionResult, interruption: DirectiveInterruption, chapterWeek: number): InterruptedAction | null {
  const plan = actionResult.executionPlan;
  if (!plan || !["executed", "limited"].includes(actionResult.executionStatus ?? "")) return null;
  const context: InterruptionContext = {
    actionResult,
    plan,
    interruption,
    usedCommitments: scaledInterruptionCommitments(plan, interruption.completedFraction),
    chapterWeek,
    missionProgress: Math.max(0, Math.round(actionResult.missionProgress * interruption.completedFraction)),
  };
  const resourceChanges = interruptionResourceChanges(context);
  return {
    actionResult: interruptedActionResult(context, resourceChanges),
    continuation: { ...actionResult.contract, status: "interrupted", startDay: 1, execution: interruptedExecutionState(context) },
    adjustments: interruptionRefunds(context, resourceChanges),
    missionRefund: actionResult.missionProgress - context.missionProgress,
  };
}

function applyDirectiveInterruptions(chapter: ChronicleChapter, delta: WorldTurnDelta) {
  const byProposalId = new Map((delta.directiveInterruptions ?? []).map((interruption) => [interruption.proposalId, interruption]));
  const continuations: ScheduledAction[] = [];
  const adjustments: InterruptionAdjustments = { money: 0, extraordinaryMaterials: 0, spirituality: 0, secrecy: 0, stability: 0, influence: 0 };
  const missionRefunds = new Map<string, number>();
  const actionResults = chapter.results.map((actionResult) => {
    const interruption = actionResult.executionPlan ? byProposalId.get(actionResult.executionPlan.proposalId) : undefined;
    const appliedInterruption = interruption ? interruptAction(actionResult, interruption, chapter.week) : null;
    if (!appliedInterruption) return actionResult;
    continuations.push(appliedInterruption.continuation);
    for (const key of Object.keys(adjustments) as (keyof InterruptionAdjustments)[]) adjustments[key] += appliedInterruption.adjustments[key];
    if (actionResult.missionId && appliedInterruption.missionRefund > 0) missionRefunds.set(actionResult.missionId, (missionRefunds.get(actionResult.missionId) ?? 0) + appliedInterruption.missionRefund);
    return appliedInterruption.actionResult;
  });
  return { results: actionResults, continuations, adjustments, missionRefunds };
}


export async function generateAiWorldDelta(config: AiConfig, game: GameState, chapter: ChronicleChapter, onStage: (value: string) => void, onToken?: (text: string) => void): Promise<GameState> {
  let worldActionResults = chapter.results.filter((result) => result.executionStatus === undefined || ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus));
  let worldChapter = { ...chapter, results: worldActionResults };
  onStage(worldActionResults.length ? "世界运行时正在准备本周独立提案" : "世界运行时正在准备安静周的独立提案");
  const worldConfig = { ...config, model: config.worldModel?.trim() || config.model };
  const { LORE_RECORDS } = await import("../generated-lore-compendium");
  const worldMemoryView = memoryPromptBlockWithIds(game.memory, "world", undefined, chapter.week);
  const autonomousPlanning = await planAutonomousAgentsForWeek({
    config: worldConfig,
    game,
    chapter: worldChapter,
    loreRecords: LORE_RECORDS,
    horizon: knowledgeHorizon(game, false),
    onProgress: (ready, total) => onStage(`独立 Agent 规划中（${ready}/${total}）`),
  });
  const autonomousState = autonomousPlanning.autonomousState;
  const autonomousDecisionFrames = autonomousPlanning.decisionFrames;
  const autonomousPlanningProjections = autonomousPlanning.planningProjections;
  let autonomousAgentProposals = autonomousPlanning.proposals;
  let autonomousWorldProposals = autonomousAgentProposals.flatMap((proposal) => {
    const projection = autonomousPlanningProjections.get(proposal.agentRef);
    return projection ? [proposalFromAgentProposal(proposal, projection)] : [];
  });
  const autonomousKnowledgeByRef = new Map([...autonomousPlanningProjections.entries()].map(([ref, projection]) => [
    ref,
    new Set(projection.visibleKnowledge.map((node) => node.id)),
  ]));
  const lockedPlayerPlans = worldActionResults
    .map((result) => result.executionPlan)
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan?.executable));
  let autonomousAdjudications = adjudicateWorldActionProposals(
    autonomousWorldProposals,
    createActionRuleContext(game, { resolvingWeek: chapter.week, knowledgeByRef: autonomousKnowledgeByRef }),
    { lockedPlans: lockedPlayerPlans },
  );
  let executableAutonomousRefs = new Set(autonomousAdjudications
    .filter((item) => item.executionPlan.executable)
    .map((item) => item.proposal.participantRefs[0]));
  let executableAutonomousAgentProposals = autonomousAgentProposals
    .filter((proposal) => executableAutonomousRefs.has(proposal.agentRef));
  const formulaProposalAuthorizations = new Map(worldActionResults.flatMap((result) => {
    const proposalId = result.executionPlan?.proposalId;
    const actionText = `${result.contract.rawIntent} ${result.contract.target} ${result.contract.desiredOutcome}`;
    if (!proposalId || result.outcome !== "成功" || !/配方|魔药|神秘学资料/.test(actionText)) return [];
    return [[proposalId, {
      actionId: result.id,
      existingFormulaRefs: game.management.formulas.filter((formula) => {
        const pathway = formula.pathwayId in PATHWAYS ? PATHWAYS[formula.pathwayId as PathwayId] : undefined;
        const sequenceName = pathway?.sequences.find((item) => item.rank === formula.sequence)?.name ?? "";
        const pathwayNamed = actionText.includes(formula.pathwayId) || Boolean(pathway?.name && actionText.includes(pathway.name));
        const sequenceNamed = actionText.includes(`序列${formula.sequence}`) || Boolean(sequenceName && actionText.includes(sequenceName));
        return actionText.includes(formula.id) || (pathwayNamed && sequenceNamed);
      }).map((formula) => `knowledge:${formula.id}`),
    }]] as const;
  }));
  const proposalBoundaryFor = (proposalId: string, plan: NonNullable<typeof worldActionResults[number]["executionPlan"]>, principalRefs: string[] = []): ExecutableProposalBoundary => ({
    proposalId,
    redLines: [...plan.authorization.redLines],
    mustEscalateWhen: [...plan.authorization.mustEscalateWhen],
    retreatCondition: plan.authorization.retreatCondition,
    participantRefs: [...plan.participantRefs],
    targetRefs: [...new Set([
      ...plan.targetRefs,
      ...game.departments.filter((department) => plan.participantRefs.includes(`actor:${department.leadMemberId}`)).map((department) => `department:${department.id}`),
      ...(formulaProposalAuthorizations.get(proposalId)?.existingFormulaRefs ?? []),
    ])],
    holderRefs: [...new Set([...plan.holderRefs, ...principalRefs])],
    commitments: { ...plan.commitments },
    causeEventIds: [...plan.causeEventIds],
  });
  let executableProposalBoundaries = new Map<string, ExecutableProposalBoundary>([
    ...worldActionResults.flatMap((result) => result.executionPlan?.executable ? [[
      result.executionPlan.proposalId,
      proposalBoundaryFor(result.executionPlan.proposalId, result.executionPlan, ["player", "organization"]),
    ] as [string, ExecutableProposalBoundary]] : []),
    ...autonomousAdjudications.flatMap((item) => item.executionPlan.executable ? [[
      item.proposal.id,
      proposalBoundaryFor(item.proposal.id, item.executionPlan),
    ] as [string, ExecutableProposalBoundary]] : []),
  ]);
  let executableProposalIds = [...executableProposalBoundaries.keys()];
  onStage("世界裁决器正在处理同时发生的提案");
  const adjudicatorWorld = buildAdjudicatorProjection(game.worldKernel, executableAutonomousAgentProposals, [...autonomousPlanningProjections.values()]);
  const worldLoreQuery = `${game.date} ${worldActionResults.map((item) => item.contract.rawIntent).join(" ")} ${adjudicatorWorld.projects.map((item) => item.title).join(" ")} ${autonomousDecisionFrames.map((item) => `${item.displayName} ${item.currentObjective}`).join(" ")}`;
  const mainOwnsWorldLore = typeof window !== "undefined" && Boolean(window.mistInference?.requestWorld && window.mistRag);
  const lore = mainOwnsWorldLore ? null : await loreForWorld(
    LORE_RECORDS,
    game,
    worldLoreQuery,
    12_000,
    { traceId: `turn:world:${chapter.week}`, turnId: `world:${chapter.week}` },
  );
  let mainRetrievalReceipt: RetrievalReceipt | undefined;
  const payload = buildWorldAdjudicatorInput({
    game,
    resolvingWeek: chapter.week,
    playerActions: worldActionResults.map((item) => ({ actionId: item.id, outcome: item.outcome, domain: actionDomain(item.contract), evidenceSeeking: seeksEvidence(item.contract), contract: item.contract.rawIntent, target: item.contract.target, desiredOutcome: item.contract.desiredOutcome, districtId: item.contract.districtId, approach: item.contract.approach, redLines: item.contract.redLines, retreat: item.contract.retreat, findings: item.findings, futureChanges: item.futureChanges })),
    adjudicatorWorld,
    unifiedActionPlans: [
      ...worldActionResults.map((result) => ({ source: "leader", actionId: result.id, executionPlan: result.executionPlan })),
      ...autonomousAdjudications.map((item) => ({
        source: "autonomous-agent",
        proposalId: item.proposal.id,
        agentRef: item.proposal.participantRefs[0],
        review: item.review,
        executionPlan: item.executionPlan,
      })),
    ],
    executableProposalIds,
    autonomousResidency: {
      activeCount: autonomousState.activeAgentRefs.length,
      coldCount: autonomousState.coldAgentRefs.length,
      limit: 24,
    },
    dynamicMemory: worldMemoryView.text,
    authorizedLore: mainOwnsWorldLore ? WORLD_LORE_CONTEXT_MARKER : lore?.context ?? "",
    loreRecordIds: mainOwnsWorldLore ? [WORLD_LORE_IDS_MARKER] : lore?.records.map((item) => item.id) ?? [],
    designerSupplement: config.worldBible,
  });
  let boundedPayload = fitWorldAdjudicatorPayload(attachOrganizationAdjudicationProtocol(payload)) as ReturnType<typeof fitWorldAdjudicatorPayload> & { runtimeAutonomousProposals?: AgentProposal[] };
  assertWorldAdjudicatorPayloadBudget(boundedPayload);
  if (mainOwnsWorldLore) {
    if (typeof window.mistInference?.finalizeWorld !== "function") throw new Error("WORLD_INFERENCE_MANIFEST_UNAVAILABLE");
    const manifestPayload = { ...boundedPayload, runtimeAutonomousProposals: autonomousAgentProposals };
    const finalized = await window.mistInference.finalizeWorld({ turnId: `world:${chapter.week}`, baseRevision: game.worldKernel.revision, manifest: manifestPayload });
    if (!finalized.ok || typeof finalized.manifestHash !== "string" || !/^[0-9a-f]{64}$/.test(finalized.manifestHash) || !finalized.manifest || typeof finalized.manifest !== "object" || Array.isArray(finalized.manifest)) throw new Error(finalized.error ?? "WORLD_INFERENCE_MANIFEST_FAILED");
    boundedPayload = finalized.manifest as typeof boundedPayload;
    const frozenProposals = Array.isArray(boundedPayload.runtimeAutonomousProposals) ? boundedPayload.runtimeAutonomousProposals as AgentProposal[] : [];
    // A retry epoch must use the same autonomous intentions and scopes that Main
    // froze for the first attempt. Replanning may still run, but it cannot become
    // a second local authority while Main is adjudicating the original manifest.
    buildAdjudicatorProjection(game.worldKernel, frozenProposals, [...autonomousPlanningProjections.values()]);
    autonomousAgentProposals = frozenProposals;
    autonomousWorldProposals = autonomousAgentProposals.flatMap((proposal) => {
      const projection = autonomousPlanningProjections.get(proposal.agentRef);
      return projection ? [proposalFromAgentProposal(proposal, projection)] : [];
    });
    autonomousAdjudications = adjudicateWorldActionProposals(
      autonomousWorldProposals,
      createActionRuleContext(game, { resolvingWeek: chapter.week, knowledgeByRef: autonomousKnowledgeByRef }),
      { lockedPlans: lockedPlayerPlans },
    );
    executableAutonomousRefs = new Set(autonomousAdjudications.filter((item) => item.executionPlan.executable).map((item) => item.proposal.participantRefs[0]));
    executableAutonomousAgentProposals = autonomousAgentProposals.filter((proposal) => executableAutonomousRefs.has(proposal.agentRef));
    executableProposalBoundaries = new Map<string, ExecutableProposalBoundary>([
      ...worldActionResults.flatMap((result) => result.executionPlan?.executable ? [[
        result.executionPlan.proposalId,
        proposalBoundaryFor(result.executionPlan.proposalId, result.executionPlan, ["player", "organization"]),
      ] as [string, ExecutableProposalBoundary]] : []),
      ...autonomousAdjudications.flatMap((item) => item.executionPlan.executable ? [[
        item.proposal.id,
        proposalBoundaryFor(item.proposal.id, item.executionPlan),
      ] as [string, ExecutableProposalBoundary]] : []),
    ]);
    executableProposalIds = [...executableProposalBoundaries.keys()];
    const frozenExecutableIds = Array.isArray(boundedPayload.executableProposalIds) ? boundedPayload.executableProposalIds.map(String) : [];
    if (JSON.stringify([...executableProposalIds].sort()) !== JSON.stringify([...frozenExecutableIds].sort())) throw new Error("WORLD_INFERENCE_FROZEN_SCOPE_MISMATCH");
  }
  const mainInferencePayload = mainOwnsWorldLore
    ? Object.fromEntries(Object.entries(boundedPayload).filter(([key]) => key !== "runtimeAutonomousProposals"))
    : boundedPayload;
  const raw = await requestWorldEnvelope(worldConfig, WORLD_ADJUDICATOR_SYSTEM, buildWorldAdjudicatorPrompt(boundedPayload, `${WORLD_KERNEL_PROTOCOL}\n${WORLD_PROPOSAL_PROVENANCE_PROTOCOL}`), game, worldActionResults.length === 0, worldActionResults.map((result) => result.id), onStage, onToken, {
    traceId: `turn:world:${chapter.week}:model`,
    turnId: `world:${chapter.week}`,
    requestId: lore?.receipt.requestId,
    retrievalId: lore?.receipt.requestId,
    promptVersion: "world-adjudicator:v1",
    responseSchemaVersion: "world-envelope:v1",
  }, mainOwnsWorldLore ? {
    payload: mainInferencePayload,
    turnId: `world:${chapter.week}`,
    baseRevision: game.worldKernel.revision,
    maxChars: 12_000,
  } : undefined, mainOwnsWorldLore ? (retrieval) => {
    if (retrieval.authority.turnId !== `world:${chapter.week}` || retrieval.authority.baseRevision !== game.worldKernel.revision) throw new Error("WORLD_RAG_AUTHORITY_MISMATCH");
    mainRetrievalReceipt = retrieval.receipt;
  } : undefined);
  const retrievalReceipt = lore?.receipt ?? mainRetrievalReceipt;
  if (!retrievalReceipt) throw new Error("WORLD_RAG_RECEIPT_UNAVAILABLE");
  const allowedLoreIds = new Set(retrievalReceipt.chunkIds);
  const { worldMoves, canonMoves, publicSignals, atmosphere, undercurrents, kernelDelta, emergentPressure, emergentLead, organizationDelta: authorizedOrganizationDelta, ruleSignals } = adaptWorldAdjudication(raw, {
    game,
    resolvingWeek: chapter.week,
    playerIssuedNoOrders: worldActionResults.length === 0,
    allowedLoreIds,
    allowedProposalIds: new Set(executableProposalIds),
    proposalBoundaries: executableProposalBoundaries,
    formulaProposalAuthorizations,
    retrievalReceipt,
    requireSourcedPublicSignals: true,
  });
  const committedKernelDelta = {
    ...kernelDelta,
    executableProposalIds,
  };
  const committedGame = await commitWorldTurn({
    baseGame: game,
    delta: committedKernelDelta,
    turnId: `world:${chapter.week}`,
    deriveNextGame: async ({ baseGame: game, worldKernel }) => {
  const interruptionApplication = applyDirectiveInterruptions(chapter, kernelDelta);
  const postWorldResults = interruptionApplication.results;
  const interruptionContinuations = interruptionApplication.continuations;
  const interruptionAdjustments = interruptionApplication.adjustments;
  const missionProgressRefunds = interruptionApplication.missionRefunds;
  worldActionResults = postWorldResults.filter((result) => result.executionStatus === undefined || ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus));
  worldChapter = { ...chapter, results: worldActionResults };
  // Legacy UI collections are compatibility projections only. Overlapping state is
  // always read back from the authoritative WorldKernel after applying kernelDelta.
  const { factions, canonActors } = projectLegacyWorldCompatibility(game, worldKernel, canonMoves);
  const reflectionMemory = deriveMemoryFromWorldState(game.memory ?? emptyMemoryState(), worldKernel, chapter.week);
  const worldAgents = advanceAutonomousWorldState(
    autonomousState,
    game.worldKernel,
    worldKernel,
    chapter.week,
    reflectionMemory,
    new Map(autonomousDecisionFrames.map((frame) => [frame.ref, frame.planningSignature])),
  );
  const worldSnapshot: WorldSnapshot = {
    week: chapter.week,
    date: chapter.date,
    atmosphere,
    changes: publicSignals.slice(0, 4).map((signal) => `${signal.channel}：${signal.headline}`),
    undercurrents,
    eventIds: worldKernel.events.filter((event) => event.week === chapter.week).map((event) => event.id),
    districtStates: worldKernel.locations.map((location) => ({ districtId: location.id, risk: location.risk, stability: location.stability, conditions: location.conditions.slice(-4) })),
    cityStates: game.campaignWorld.cities.map((city) => ({ cityId: city.id, control: city.playerControl, intelligence: city.intelligence, pressure: city.localPressure, status: city.status })),
  };
  const campaignWorld = applyCampaignSignals(game.campaignWorld, ruleSignals, chapter.week);
  let missions = game.missions;
  const pressure = emergentPressure;
  if (pressure && typeof pressure === "object" && !Array.isArray(pressure)) {
    const value = pressure as Record<string, unknown>;
    if (typeof value.title === "string" && typeof value.premise === "string" && typeof value.consequence === "string") missions = [...missions, { id: stableEntityId("ai-pressure", game.saveId ?? "legacy-save", game.week, value.title, value.premise), title: value.title.slice(0, 45), premise: value.premise.slice(0, 280), deadline: Math.max(2, Math.min(6, Number(value.deadline) || 3)), urgency: 58, progress: 0, consequence: value.consequence.slice(0, 240), hints: ["自由调查其来源", "与相关成员讨论", "寻求一项外部合作", "暂不处理并承担后果"], state: "active" as const }];
  }
  let evidenceNodes = game.evidenceNodes;
  let opportunities = game.opportunities;
  const lead = emergentLead;
  if (lead && typeof lead === "object" && !Array.isArray(lead)) {
    const value = lead as Record<string, unknown>;
    const districtId = typeof value.districtId === "string" && DISTRICTS.some((district) => district.id === value.districtId) ? value.districtId : "cherwood";
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 48) : "";
    const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 320) : "";
    const source = typeof value.source === "string" ? value.source.trim().slice(0, 80) : "城市回应";
    const followUp = typeof value.followUp === "string" ? value.followUp.trim().slice(0, 280) : "核验这条新线索的来源、时间和与现有证据的联系。";
    const allowedTags = new Set(["document", "track", "social", "occult", "official", "protect"]);
    const tags = Array.isArray(value.tags) ? value.tags.map(String).filter((tag) => allowedTags.has(tag)).slice(0, 4) : [];
    if (label && summary && !game.evidenceNodes.some((item) => item.label === label)) {
      const id = stableEntityId("ev-ai", game.saveId ?? "legacy-save", game.week, label, summary);
      evidenceNodes = [...game.evidenceNodes, { id, caseId: "ai-emergent", label, kind: tags.includes("document") ? "记录" as const : tags.includes("social") ? "证词" as const : tags.includes("occult") ? "异常" as const : "推断" as const, summary, certainty: "推断" as const, discovered: true, source, tags: tags.length ? tags : ["open"], weekDiscovered: game.week }];
      opportunities = [...game.opportunities, { id: stableEntityId("op-ai", game.saveId ?? "legacy-save", game.week, label, summary), caseId: "ai-emergent", title: `追查 · ${label}`, description: summary, districtId, risk: DISTRICTS.find((district) => district.id === districtId)!.danger >= 65 ? "高" as const : "中" as const, requirements: [id], suggestedIntent: followUp, rewardPreview: "把世界回应转化为可交叉验证的新事实或关系", state: "available" as const }];
    }
  }
  let actionReportsRaw = Array.isArray(raw.actionReports) ? raw.actionReports : [];
  const scanned = new Map<string, Record<string, unknown>>();
  for (const report of actionReportsRaw) {
    if (!report || typeof report !== "object") continue;
    const value = report as Record<string, unknown>;
    if (typeof value.actionId === "string" && worldActionResults.some((item) => item.id === value.actionId)) scanned.set(value.actionId, value);
  }
  const violations = worldActionResults.flatMap((result) => {
    const report = scanned.get(result.id);
    if (!report) return [];
    const fieldReport = typeof report.fieldReport === "string" ? report.fieldReport.trim().slice(0, 700) : "";
    const observableFacts = Array.isArray(report.observableFacts) ? report.observableFacts.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [];
    const followUp = typeof report.followUp === "string" ? report.followUp.trim().slice(0, 300) : "";
    const issue = actionTextBoundaryIssue([fieldReport, ...observableFacts, followUp].join("\n"), game, result.contract);
    return issue ? [{ result, issue }] : [];
  });
  if (violations.length) {
    onStage("连续性编辑正在修复越界的现场报告");
    const kernelDelta = raw.kernelDelta && typeof raw.kernelDelta === "object" && !Array.isArray(raw.kernelDelta) ? raw.kernelDelta as Record<string, unknown> : {};
    actionReportsRaw = await repairActionReports(config, game, worldChapter, violations, actionReportsRaw, {
      worldSummary: raw.worldSummary,
      publicSignals: raw.publicSignals,
      events: kernelDelta.events,
      locationUpdates: kernelDelta.locationUpdates,
    }, onToken);
  }
  const reportById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(actionReportsRaw)) for (const report of actionReportsRaw) {
    if (!report || typeof report !== "object") continue;
    const value = report as Record<string, unknown>;
    if (typeof value.actionId === "string" && worldActionResults.some((item) => item.id === value.actionId)) reportById.set(value.actionId, value);
  }
  const enrichedResults = postWorldResults.map((result) => {
    const report = reportById.get(result.id);
    if (!report) return { ...result, causalReceipts: causalReceiptsForAction(result, kernelDelta, worldKernel, game) };
    const fieldReport = typeof report.fieldReport === "string" ? report.fieldReport.trim().slice(0, 700) : "";
    const observableFacts = Array.isArray(report.observableFacts) ? report.observableFacts.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [];
    const followUp = typeof report.followUp === "string" ? report.followUp.trim().slice(0, 300) : "";
    const boundaryIssue = actionTextBoundaryIssue([fieldReport, ...observableFacts, followUp].join("\n"), game, result.contract);
    if (boundaryIssue) throw new Error(`世界模型对“${result.title}”的现场报告${boundaryIssue}；本周拒绝结算`);
    const actionEvidenceIds = seeksEvidence(result.contract) && result.outcome !== "受阻" ? observableFacts.map((fact, index) => {
      const id = stableEntityId("ev-ai-action", game.saveId ?? "legacy-save", result.id, fact);
      if (!evidenceNodes.some((item) => item.id === id)) evidenceNodes.push({
        id,
        caseId: "player-led",
        label: `${result.contract.target} · 可核验事实${index + 1}`,
        kind: result.contract.methodTags?.includes("social") ? "证词" : result.contract.methodTags?.includes("document") ? "记录" : result.contract.methodTags?.includes("occult") ? "异常" : "推断",
        summary: fact,
        certainty: result.outcome === "成功" ? "可信证据" : "推断",
        discovered: true,
        source: `${result.title} · AI世界现场报告`,
        tags: [...(result.contract.methodTags ?? ["open"]), result.contract.target],
        weekDiscovered: chapter.week,
      });
      return id;
    }) : [];
    const enrichedResult = {
      ...result,
      findings: observableFacts.length ? observableFacts : result.findings,
      reasons: fieldReport ? [...(result.reasons ?? []), `现场述职：${fieldReport}`] : result.reasons,
      unlockedEvidenceIds: [...new Set([...(result.unlockedEvidenceIds ?? []), ...actionEvidenceIds])],
      futureChanges: [...(result.futureChanges ?? []), ...actionEvidenceIds.map((id) => `调查板新增：${evidenceNodes.find((item) => item.id === id)?.label}`), ...(followUp ? [followUp] : [])].slice(0, 6),
      consequence: fieldReport ? `${result.consequence} ${fieldReport}` : result.consequence,
    };
    return {
      ...enrichedResult,
      causalReceipts: causalReceiptsForAction(enrichedResult, kernelDelta, worldKernel, game),
    };
  });
  const enrichedChapter = {
    ...chapter,
    results: enrichedResults,
    summary: chronicleSummaryFromCausality({ ...game, worldKernel }, { ...chapter, results: enrichedResults }),
  };
  const chronicle = game.chronicle.map((item) => item.id === chapter.id ? enrichedChapter : item);
  const organizationDelta = authorizedOrganizationDelta;
  const clampOrg = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, Math.round(value)));
  const departments = game.departments.map((item) => ({ ...item }));
  let departmentReports = [...game.departmentReports];
  const organizationIssues = [...game.organizationIssues];
  for (const continuation of interruptionContinuations) if (!organizationIssues.some((issue) => issue.originActionId === continuation.id && issue.directiveState === "interrupted" && issue.state === "待裁决")) {
    organizationIssues.push({
      id: `directive-interrupted:${chapter.week}:${continuation.id}`,
      weekCreated: chapter.week,
      category: "成员",
      sourceId: continuation.leaderId,
      title: `${continuation.title}已在授权边界前停下`,
      summary: continuation.execution.lastReason ?? "负责人触发停止条件后中断了行动。",
      urgency: continuation.risk === "致命" ? 92 : continuation.risk === "高" ? 78 : 62,
      deadline: game.week + 1,
      signals: ["已经发生的变化保留，未完成部分不会被视为完成。"],
      state: "待裁决",
      originActionId: continuation.id,
      strategyIntentId: continuation.strategyIntentId,
      causeEventIds: continuation.execution.consequenceEventIds,
      directiveState: "interrupted",
    });
  }
  let members = game.members.map((item) => ({ ...item }));
  let recruitPool = game.recruitPool.map((item) => ({ ...item }));
  let management = {
    ...game.management,
    resources: {
      ...game.management.resources,
      money: game.management.resources.money + interruptionAdjustments.money,
      extraordinaryMaterials: game.management.resources.extraordinaryMaterials + interruptionAdjustments.extraordinaryMaterials,
    },
  };
  if (Array.isArray(organizationDelta.departmentDevelopments)) for (const [index, development] of organizationDelta.departmentDevelopments.slice(0, 6).entries()) {
    if (!development || typeof development !== "object") continue;
    const value = development as Record<string, unknown>;
    const department = departments.find((item) => item.id === value.departmentId);
    const report = typeof value.report === "string" ? value.report.trim().slice(0, 220) : "";
    if (!department || !report) continue;
    department.lastReport = report;
    const detail = typeof value.cause === "string" ? value.cause.trim().slice(0, 260) : "该变化来自本周组织状态与既有常设命令。";
    const requiresDecision = (department.backlog ?? 0) >= 65 || (department.exposure ?? 0) >= 55 || (department.cohesion ?? 100) <= 35;
    departmentReports = [{ id: `ai-department-report-${game.week}-${index}-${department.id}`, week: game.week, departmentId: department.id, headline: report, detail, consequence: requiresDecision ? "若继续越过临界值，下一周将转化为需要会长裁决的组织问题。" : "仍在部门授权范围内。", requiresDecision }, ...departmentReports].slice(0, 80);
  }
  if (Array.isArray(organizationDelta.memberDevelopments)) for (const development of organizationDelta.memberDevelopments.slice(0, 6)) {
    if (!development || typeof development !== "object") continue;
    const value = development as Record<string, unknown>;
    members = members.map((member) => member.id !== value.memberId ? member : {
      ...member,
      personalEventSignals: typeof value.observation === "string" ? [...(member.personalEventSignals ?? []), value.observation.trim().slice(0, 220)].slice(-6) : member.personalEventSignals,
    });
  }
  if (Array.isArray(organizationDelta.recruitDevelopments)) for (const development of organizationDelta.recruitDevelopments.slice(0, 6)) {
    if (!development || typeof development !== "object") continue;
    const value = development as Record<string, unknown>;
    recruitPool = recruitPool.map((member) => member.id !== value.memberId ? member : {
      ...member,
      personalEventSignals: typeof value.observation === "string" ? [...(member.personalEventSignals ?? []), value.observation.trim().slice(0, 220)].slice(-6) : member.personalEventSignals,
    });
  }
  if (Array.isArray(organizationDelta.governanceIssues)) for (const [index, issue] of organizationDelta.governanceIssues.slice(0, 3).entries()) {
    if (!issue || typeof issue !== "object") continue;
    const value = issue as Record<string, unknown>;
    const category = ["部门", "招募", "成员", "资源"].includes(String(value.category)) ? value.category as "部门" | "招募" | "成员" | "资源" : "资源";
    const sourceId = typeof value.sourceId === "string" ? value.sourceId : "organization";
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 70) : "";
    const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 360) : "";
    if (!title || !summary || organizationIssues.some((item) => item.sourceId === sourceId && item.state === "待裁决")) continue;
    organizationIssues.push({ id: stableEntityId("ai-org-issue", game.saveId ?? "legacy-save", game.week, index, sourceId, title), weekCreated: game.week, category, sourceId, title, summary, urgency: clampOrg(Number(value.urgency) || 55, 35, 95), deadline: game.week + clampOrg(Number(value.deadline) || 2, 1, 3), signals: Array.isArray(value.signals) ? value.signals.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [], state: "待裁决" });
  }
  const newRecruit = organizationDelta.newRecruitableNpc && typeof organizationDelta.newRecruitableNpc === "object" && !Array.isArray(organizationDelta.newRecruitableNpc) ? organizationDelta.newRecruitableNpc as Record<string, unknown> : null;
  const newRecruitActorId = typeof newRecruit?.actorId === "string" ? newRecruit.actorId.trim() : "";
  const newRecruitActor = worldKernel.actors.find((actor) => actor.id === newRecruitActorId);
  const newRecruitName = typeof newRecruit?.name === "string" ? newRecruit.name.trim().slice(0, 40) : "";
  const newRecruitId = newRecruitActorId ? stableEntityId("ai-recruit", game.saveId ?? "legacy-save", newRecruitActorId) : "";
  const hasPersistentContact = Boolean(newRecruit && newRecruitActor && newRecruitName === newRecruitActor.name.trim().slice(0, 40));
  if (newRecruit && newRecruitActor && newRecruitName && newRecruitId && hasPersistentContact && ![...members, ...recruitPool].some((item) => item.id === newRecruitId || item.name === newRecruitName)) {
    recruitPool.push({ id: newRecruitId, name: newRecruitName, role: typeof newRecruit.role === "string" ? newRecruit.role.slice(0, 50) : "新近联系人", specialty: typeof newRecruit.specialty === "string" ? newRecruit.specialty.slice(0, 100) : "尚待确认", loyalty: 24, trust: 18, interest: 55, ideology: 50, fatigue: 8, status: "尚未接触", background: typeof newRecruit.background === "string" ? newRecruit.background.slice(0, 300) : "其背景已被世界账本锁定，仍待组织核验。", core: typeof newRecruit.core === "string" ? newRecruit.core.slice(0, 180) : "谨慎观察组织", voice: typeof newRecruit.voice === "string" ? newRecruit.voice.slice(0, 120) : "保留而具体", arc: typeof newRecruit.arc === "string" ? newRecruit.arc.slice(0, 180) : "尚未形成", secret: "尚未确认", personalEvent: typeof newRecruit.contactReason === "string" ? newRecruit.contactReason.slice(0, 220) : "因持续接触进入组织视野。", personalEventState: "dormant", relationshipStage: "接触", relationshipMomentum: 0, personalPressure: 4, personalEventSignals: [], promises: [], lastRelationshipChangeWeek: game.week });
  }
  if (Array.isArray(organizationDelta.formulaDiscoveries)) {
    const formulas = [...management.formulas];
    for (const discovery of organizationDelta.formulaDiscoveries.slice(0, 3)) {
      if (!discovery || typeof discovery !== "object") continue;
      const value = discovery as Record<string, unknown>;
      const sourceProposalId = typeof value.sourceProposalId === "string" ? value.sourceProposalId.trim() : "";
      const formulaAuthorization = formulaProposalAuthorizations.get(sourceProposalId);
      const declaredSourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs.map(String).map((item) => item.trim()).filter(Boolean) : [];
      if (!formulaAuthorization || !declaredSourceRefs.includes(formulaAuthorization.actionId)) throw new Error("SIDECAR_AUTHORITY_REJECTED: 配方变化未绑定同一提案的成功行动");
      const pathwayId = typeof value.pathwayId === "string" && value.pathwayId in PATHWAYS ? value.pathwayId as PathwayId : undefined;
      const sequence = Number(value.sequence);
      if (!pathwayId || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) throw new Error("SIDECAR_AUTHORITY_REJECTED: 配方途径或序列无效");
      const reliability = Math.max(0, Math.min(100, Math.round(Number(value.reliability) || 0)));
      const requestedLoreEvidenceIds = Array.isArray(value.loreEvidenceIds) ? [...new Set(value.loreEvidenceIds.map(String).map((id) => id.trim()).filter(Boolean))].slice(0, 8) : [];
      const unretrievedLoreEvidenceIds = requestedLoreEvidenceIds.filter((id) => !allowedLoreIds.has(id));
      if (unretrievedLoreEvidenceIds.length) throw new Error(`UNRETRIEVED_LORE_REFERENCE_REJECTED: ${unretrievedLoreEvidenceIds.join("、")}`);
      const loreEvidenceIds = requestedLoreEvidenceIds;
      const requestedStatus = ["lead", "fragment", "verifying", "verified"].includes(String(value.status)) ? String(value.status) as "lead" | "fragment" | "verifying" | "verified" : "lead";
      const status = requestedStatus === "verified" && (reliability < 90 || loreEvidenceIds.length === 0) ? "verifying" : requestedStatus;
      const sourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs.map(String).filter((id) => worldActionResults.some((result) => result.id === id) || worldKernel.events.some((event) => event.id === id)).slice(0, 8) : [];
      const id = `formula-${pathwayId}-${sequence}`;
      const record = { id, pathwayId, sequence, name: `${PATHWAYS[pathwayId].name}途径·序列${sequence} ${PATHWAYS[pathwayId].sequences.find((item) => item.rank === sequence)?.name ?? "配方"}`, status, reliability, sourceRefs, loreEvidenceIds };
      const existing = formulas.findIndex((formula) => formula.id === id);
      if (existing >= 0) {
        const previous = formulas[existing];
        const rank = { lead: 0, fragment: 1, verifying: 2, verified: 3 } as const;
        if (rank[record.status] >= rank[previous.status]) formulas[existing] = { ...previous, ...record, sourceRefs: [...new Set([...previous.sourceRefs, ...record.sourceRefs])], loreEvidenceIds: [...new Set([...previous.loreEvidenceIds, ...record.loreEvidenceIds])] };
      } else formulas.push(record);
    }
    management = { ...management, formulas };
  }
  management = {
    ...management,
    map: attachIntelligenceToBacklundMap(management.map, ruleSignals.map((signal) => ({ id: signal.id, districtId: signal.districtId, text: `${signal.headline} ${signal.body}` }))),
  };
  let worldLedger = game.worldLedger ?? createWorldLedger(game);
  worldLedger = appendWorldLedgerEvents(worldLedger, actionAdjudicationLedgerEvents(autonomousAdjudications, "autonomous-actors"));
  worldLedger = appendWorldLedgerEvents(worldLedger, autonomousAgentProposals.map((proposal) => {
    const actorId = proposal.agentRef.startsWith("actor:") ? proposal.agentRef.slice("actor:".length) : null;
    const factionId = proposal.agentRef.startsWith("faction:") ? proposal.agentRef.slice("faction:".length) : null;
    const id = `autonomous-proposal:${chapter.week}:${proposal.agentRef}`;
    return {
      id,
      week: chapter.week,
      phase: "autonomous-actors" as const,
      kind: "action-proposed" as const,
      summary: proposal.intent,
      actorIds: actorId ? [actorId] : [],
      factionIds: factionId ? [factionId] : [],
      witnessRefs: [proposal.agentRef],
      causeEventIds: [],
      audience: { visibility: "actors" as const, holderRefs: [proposal.agentRef] },
      payload: {
        actionId: `proposal:agent:${chapter.week}:${proposal.agentRef}`,
        agentRef: proposal.agentRef,
        disposition: proposal.disposition,
        intent: proposal.intent,
        targetRefs: proposal.targetRefs,
        requiredKnowledgeIds: proposal.requiredKnowledgeIds,
        usedMemoryIds: proposal.usedMemoryIds,
        planningSource: proposal.planningSource,
        planningIssue: proposal.planningIssue,
      },
    };
  }));
  worldLedger = appendWorldLedgerEvents(worldLedger, worldKernel.events.filter((event) => event.week === chapter.week).map((event) => ({
    ...(() => {
      const sourceProposalIds = event.sourceProposalIds ?? [];
      const contributingProposals = executableAutonomousAgentProposals.filter((proposal) => sourceProposalIds.includes(`proposal:agent:${chapter.week}:${proposal.agentRef}`));
      const proposalEventIds = sourceProposalIds.flatMap((proposalId) => {
        const agentPrefix = `proposal:agent:${chapter.week}:`;
        return proposalId.startsWith(agentPrefix)
          ? [proposalId, `autonomous-proposal:${chapter.week}:${proposalId.slice(agentPrefix.length)}`]
          : [proposalId];
      });
      return {
        id: event.id,
        week: chapter.week,
        phase: "autonomous-actors" as const,
        kind: "world-event-recorded" as const,
        summary: event.title,
        actorIds: event.actorIds,
        factionIds: event.factionIds,
        witnessRefs: event.witnessRefs ?? [],
        causeEventIds: proposalEventIds,
        audience: { visibility: event.visibility, holderRefs: event.witnessRefs ?? [] },
        payload: {
          worldEventId: event.id,
          detail: event.detail,
          locationId: event.locationId,
          kernelCauseIds: event.causeIds,
          proposalEventIds,
          usedMemoryIds: [...new Set(contributingProposals.flatMap((proposal) => proposal.usedMemoryIds))],
        },
      };
    })(),
  })));
  worldLedger = appendWorldLedgerEvents(worldLedger, interruptionContinuations.map((continuation) => {
    const result = postWorldResults.find((item) => item.id === continuation.id);
    const sourceEventId = continuation.execution.consequenceEventIds.at(-1);
    return {
      id: `progress:world-interruption:${continuation.execution.lastAttemptId ?? continuation.id}`,
      week: chapter.week,
      phase: "consequences" as const,
      kind: "action-progressed" as const,
      summary: `${continuation.title}在授权边界前中断`,
      actorIds: continuation.memberIds,
      factionIds: [],
      witnessRefs: [continuation.leaderId, ...continuation.memberIds].map((id) => id === "player" ? "player" : `actor:${id}`),
      causeEventIds: sourceEventId ? [sourceEventId] : [],
      audience: { visibility: "actors" as const, holderRefs: ["player", ...continuation.memberIds.map((id) => `actor:${id}`)] },
      payload: {
        actionId: continuation.id,
        attemptId: `world-interruption:${continuation.execution.lastAttemptId ?? continuation.id}`,
        attemptOrdinal: continuation.execution.attemptOrdinal,
        originWeek: continuation.execution.originWeek,
        fromStatus: "resolved",
        toStatus: "interrupted",
        progressAfter: continuation.execution.progress,
        consumedAfter: continuation.execution.consumed,
        nextEligibleWeek: continuation.execution.nextEligibleWeek,
        reason: continuation.execution.lastReason,
        consequenceEventIds: continuation.execution.consequenceEventIds,
        executionPlan: result?.executionPlan,
      },
    };
  }));
  worldLedger = appendWorldLedgerEvents(worldLedger, worldKernel.knowledge.filter((node) => node.acquiredWeek === chapter.week).map((node) => ({
    id: `delivery:${node.id}`,
    week: chapter.week,
    phase: "autonomous-actors" as const,
    kind: "knowledge-delivered" as const,
    summary: node.subject,
    actorIds: [],
    factionIds: [],
    witnessRefs: node.holderRefs ?? node.holderIds.map((id) => id === "player" ? "player" : `actor:${id}`),
    causeEventIds: node.sourceEventId && worldLedger.events.some((event) => event.id === node.sourceEventId) ? [node.sourceEventId] : [],
    audience: { visibility: node.visibility, holderRefs: node.holderRefs ?? node.holderIds.map((id) => id === "player" ? "player" : `actor:${id}`) },
    payload: { knowledgeId: node.id, statement: node.statement, truth: node.truth, loreRecordIds: node.loreRecordIds },
  })));
  worldLedger = recordWorldLedgerPhase(worldLedger, chapter.week, "autonomous-actors", "独立角色、势力与持续计划已完成世界推演", { eventCount: worldKernel.events.filter((event) => event.week === chapter.week).length, signalCount: publicSignals.length, factionMoveCount: worldMoves.length, autonomousAgentCount: worldAgents.activeAgentRefs.length, coldAgentCount: worldAgents.coldAgentRefs.length, socialTieCount: worldAgents.socialTies.length });
  worldLedger = recordWorldLedgerPhase(worldLedger, chapter.week, "narrative-ready", "本周权威事实已锁定，可以生成文学叙事", {
    chapterId: chapter.id,
    modelCallId: `world:${chapter.week}`,
    retrievalReceipt: kernelDelta.retrievalReceipt,
    mutationClaims: kernelDelta.mutationClaims,
  });
  let committedMemory = game.memory ?? emptyMemoryState();
  for (const proposal of autonomousAgentProposals) {
    const projection = autonomousPlanningProjections.get(proposal.agentRef);
    if (!projection) continue;
    const audience = projection.memoryAudience.kind === "actor"
      ? actorAudience(projection.memoryAudience.actorId, true)
      : factionAudience(projection.memoryAudience.factionId, true);
    const descriptor = {
      actionId: `autonomous-agent:${chapter.week}:${proposal.agentRef}`,
      modelCallId: `autonomous-agent:${chapter.week}:${proposal.agentRef}`,
      stage: "autonomous-agent",
      audience,
      memoryIds: projection.memoryReferenceIds,
      week: chapter.week,
    };
    committedMemory = submitMemoryDelivery(committedMemory, descriptor);
    committedMemory = markMemoryPresented(committedMemory, descriptor);
    if (proposal.usedMemoryIds.length) {
      committedMemory = markMemoryRecalled(committedMemory, { ...descriptor, memoryIds: proposal.usedMemoryIds });
    }
  }
  committedMemory = submitMemoryDelivery(committedMemory, {
    actionId: `world:${chapter.week}`,
    modelCallId: `world:${chapter.week}`,
    stage: "world",
    audience: worldSystemAudience(),
    memoryIds: worldMemoryView.ids,
    week: chapter.week,
  });
  missions = missions.map((mission) => {
    const refund = missionProgressRefunds.get(mission.id) ?? 0;
    return refund ? { ...mission, progress: Math.max(0, mission.progress - refund), state: mission.progress - refund < 100 && mission.state === "resolved" ? "active" as const : mission.state } : mission;
  });
  const schedule = [
    ...game.schedule.filter((action) => !interruptionContinuations.some((continuation) => continuation.id === action.id)),
    ...interruptionContinuations,
  ];
  const economyHistory = game.economyHistory.map((entry, index) => index === 0 && entry.week === chapter.week ? {
    ...entry,
    actionCost: Math.max(0, entry.actionCost - interruptionAdjustments.money),
    balance: entry.balance + interruptionAdjustments.money,
    expectedBalance: (entry.expectedBalance ?? entry.balance) + interruptionAdjustments.money,
  } : entry);
  const nextGame: GameState = {
    ...game,
    money: game.money + interruptionAdjustments.money,
    spirituality: Math.min(game.spiritualityMax, game.spirituality + interruptionAdjustments.spirituality),
    secrecy: Math.max(0, Math.min(100, game.secrecy + interruptionAdjustments.secrecy)),
    stability: Math.max(0, Math.min(100, game.stability + interruptionAdjustments.stability)),
    influence: Math.max(0, Math.min(100, game.influence + interruptionAdjustments.influence)),
    factions,
    canonActors,
    missions,
    evidenceNodes,
    opportunities,
    worldMoves: [...worldMoves, ...game.worldMoves].slice(0, 80),
    worldSignals: [...publicSignals, ...(game.worldSignals ?? []).filter((signal) => signal.week !== chapter.week || !publicSignals.length)].slice(0, 120),
    worldSnapshots: [worldSnapshot, ...(game.worldSnapshots ?? []).filter((snapshot) => snapshot.week !== chapter.week)].slice(0, 60),
    worldKernel,
    worldAgents,
    memory: deriveMemoryFromWorldState(committedMemory, worldKernel, chapter.week),
    chronicle,
    departments,
    departmentReports,
    organizationIssues,
    members,
    recruitPool,
    management,
    campaignWorld,
    schedule,
    economyHistory,
  };
  nextGame.worldLedger = commitWorldLedgerWeek(worldLedger, nextGame);
  return nextGame;
    },
  });
  releaseAutonomousPlanningCache(game);
  return committedGame;
}
