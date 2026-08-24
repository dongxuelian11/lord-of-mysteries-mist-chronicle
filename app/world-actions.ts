import type {
  DirectiveAuthorization,
  DirectiveExecutionPlanSnapshot,
  GameState,
  ScheduledAction,
} from "./game-model.ts";
import type { AgentPlanningProjection, AgentProposal } from "./world-runtime.ts";
import type { LedgerEventInput } from "./world-ledger.ts";
import { projectWorldForAudience, type WorldAudience } from "./world-kernel.ts";

export type ActionProposer = {
  kind: "player" | "actor" | "faction" | "system";
  id: string;
};

export type ActionCommitments = {
  money: number;
  manpower: number;
  extraordinaryMaterials: number;
  spirituality: number;
};

export type ActionTimeWindow = { startDay: number; days: number };

export type WorldActionProposal = {
  id: string;
  week: number;
  proposer: ActionProposer;
  actionType: string;
  intent: string;
  method: string;
  target: { kind: "district" | "actor" | "faction" | "organization" | "world"; id: string };
  participantIds: string[];
  participantRefs: string[];
  targetRefs: string[];
  requiredKnowledgeIds: string[];
  commitments: ActionCommitments;
  timeWindow: ActionTimeWindow;
  priority: number;
  authorization: DirectiveAuthorization;
  causeEventIds: string[];
  redLines: string[];
  retreatCondition: string;
  visibility: "world" | "public" | "player" | "actors" | "factions";
  holderRefs: string[];
  sourceContractId?: string;
  sourceIssueId?: string;
  strategyIntentId?: string;
  facilityId?: string;
  attemptId?: string;
  progressBefore?: number;
  totalDays?: number;
};

export type ActionReviewStatus = "accepted" | "limited" | "escalation-required" | "rejected";

export type ActionReview = {
  proposalId: string;
  status: ActionReviewStatus;
  reasons: string[];
  enforcedLimits: string[];
};

/**
 * The authoritative plan consumed by resolution. It deliberately repeats the
 * mutable parts of a proposal so a limited decision cannot remain presentation-
 * only while the original resource or calendar request is still executed.
 */
export type ExecutionPlan = DirectiveExecutionPlanSnapshot;

export type ActionAdjudication = {
  proposal: WorldActionProposal;
  review: ActionReview;
  executionPlan: ExecutionPlan;
  resolutionOrder: number;
  conflictKeys: string[];
};

export type ActionRuleContext = {
  week: number;
  moneyAvailable: number;
  debtFloor: number;
  manpowerAvailable: number;
  extraordinaryMaterialsAvailable: number;
  actorIds: Set<string>;
  factionIds: Set<string>;
  districtIds: Set<string>;
  locationIds?: Set<string>;
  projectIds?: Set<string>;
  unavailableActorIds: Set<string>;
  actorKnowledge: Map<string, Set<string>>;
  knowledgeByRef: Map<string, Set<string>>;
};

export type ActionRuleContextOptions = {
  resolvingWeek?: number;
  knowledgeByRef?: Map<string, Set<string>>;
};

export type WorldActionAdjudicationOptions = {
  lockedPlans?: readonly DirectiveExecutionPlanSnapshot[];
};

function stableNumber(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function splitRules(value: string) {
  return [...new Set(value.split(/[，。；]/).map((item) => item.trim()).filter(Boolean))];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function proposalFromScheduledAction(action: ScheduledAction, week: number): WorldActionProposal {
  const participantIds = unique([action.leaderId, ...action.memberIds].filter((id) => id !== "organization"));
  const participantRefs = participantIds.map((id) => id === "player" ? "player" : `actor:${id}`);
  const holderRefs = [...participantRefs];
  const authorization = action.authorization ?? {
    scope: "strict" as const,
    redLines: splitRules(action.redLines),
    mustEscalateWhen: [],
    retreatCondition: action.retreat.trim(),
  };
  const resources = action.resourceCommitment ?? {
    posture: "balanced" as const,
    money: action.budget,
    manpower: 0,
    extraordinaryMaterials: 0,
  };
  const consumed = action.execution?.consumed ?? { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 };
  const progressBefore = Math.max(0, Math.min(100, action.execution?.progress ?? 0));
  const remainingDays = Math.max(1, Math.ceil(action.days * (100 - progressBefore) / 100));
  return {
    id: `proposal:${week}:${action.id}`,
    week,
    proposer: { kind: "player", id: "player" },
    actionType: action.kind,
    intent: action.desiredOutcome,
    method: action.approach,
    target: { kind: "district", id: action.districtId },
    participantIds,
    participantRefs,
    targetRefs: [`location:${action.districtId}`],
    requiredKnowledgeIds: unique(action.requiredKnowledgeIds ?? []),
    commitments: {
      money: Math.max(0, resources.money - consumed.money),
      manpower: resources.manpower,
      extraordinaryMaterials: Math.max(0, resources.extraordinaryMaterials - consumed.extraordinaryMaterials),
      spirituality: 0,
    },
    timeWindow: { startDay: action.startDay, days: remainingDays },
    priority: (action.focus ? 20 : 0) + (action.executionMode === "player-led" ? 90 : 70),
    authorization: {
      ...authorization,
      redLines: unique(authorization.redLines),
      mustEscalateWhen: unique(authorization.mustEscalateWhen),
    },
    causeEventIds: unique(action.causeEventIds ?? []),
    redLines: unique(authorization.redLines.length ? authorization.redLines : splitRules(action.redLines)),
    retreatCondition: authorization.retreatCondition.trim() || action.retreat.trim(),
    visibility: "actors",
    holderRefs,
    attemptId: `attempt:${action.id}:${(action.execution?.attemptOrdinal ?? 0) + 1}`,
    progressBefore,
    totalDays: action.days,
    sourceContractId: action.id,
    ...(action.sourceIssueId ? { sourceIssueId: action.sourceIssueId } : {}),
    ...(action.strategyIntentId ? { strategyIntentId: action.strategyIntentId } : {}),
    ...(action.facilityId ? { facilityId: action.facilityId } : {}),
  };
}

function targetFromRefs(targetRefs: string[], locationId?: string): WorldActionProposal["target"] {
  const primary = targetRefs[0];
  if (primary?.startsWith("actor:")) return { kind: "actor", id: primary.slice("actor:".length) };
  if (primary?.startsWith("faction:")) return { kind: "faction", id: primary.slice("faction:".length) };
  if (primary === "organization") return { kind: "organization", id: "organization" };
  if (locationId) return { kind: "world", id: locationId };
  return { kind: "world", id: primary ?? "world" };
}

/** Pure adapter: it copies planner output and never mutates the proposal cache or projection. */
export function proposalFromAgentProposal(raw: AgentProposal, projection: AgentPlanningProjection): WorldActionProposal {
  const participantRefs = [raw.agentRef];
  const participantIds = raw.agentRef.startsWith("actor:")
    ? [raw.agentRef.slice("actor:".length)]
    : [];
  const targetRefs = unique([...raw.targetRefs]);
  const duration = raw.disposition === "act" || raw.disposition === "continue" ? 2 : 1;
  const latestStart = 7 - duration + 1;
  const startDay = 1 + stableNumber(`${raw.planningWeek}:${raw.agentRef}:${raw.disposition}`) % latestStart;
  const knowledgeEvents = projection.visibleKnowledge
    .filter((node) => raw.requiredKnowledgeIds.includes(node.id))
    .map((node) => projection.knowledgeSourceEventIds?.[node.id] ?? (node as { sourceEventId?: string }).sourceEventId ?? "")
    .filter(Boolean);
  const agentId = raw.agentRef.replace(/^(actor|faction):/, "");
  const authorization: DirectiveAuthorization = {
    scope: "bounded",
    redLines: ["不得使用主体未知的知识", "不得越过已验证的目标边界"],
    mustEscalateWhen: [],
    retreatCondition: raw.conditionalOn?.trim() || "条件不再成立时等待下一次自主规划",
  };
  return {
    id: `proposal:agent:${raw.planningWeek}:${raw.agentRef}`,
    week: raw.planningWeek,
    proposer: { kind: projection.agent.kind, id: agentId },
    actionType: raw.disposition,
    intent: raw.intent,
    method: raw.rationale,
    target: targetFromRefs(targetRefs, raw.locationId),
    participantIds,
    participantRefs,
    targetRefs,
    requiredKnowledgeIds: unique([...raw.requiredKnowledgeIds]),
    commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
    timeWindow: { startDay, days: duration },
    priority: 10 + Math.floor(projection.agent.riskTolerance / 10) + (raw.disposition === "act" ? 8 : raw.disposition === "continue" ? 6 : 0),
    authorization,
    causeEventIds: unique(knowledgeEvents),
    redLines: [...authorization.redLines],
    retreatCondition: authorization.retreatCondition,
    visibility: projection.agent.kind === "faction" ? "factions" : "actors",
    holderRefs: [...participantRefs],
    attemptId: `attempt:agent:${raw.planningWeek}:${raw.agentRef}`,
    progressBefore: 0,
    totalDays: duration,
  };
}

export function createActionRuleContext(game: GameState, options: ActionRuleContextOptions = {}): ActionRuleContext {
  const knowledgeByRef = new Map<string, Set<string>>();
  const knowledgeFor = (audience: Exclude<WorldAudience, { kind: "world" }>) => new Set(
    projectWorldForAudience(game.worldKernel, audience).knowledge.map((node) => node.id),
  );
  for (const member of game.members) {
    knowledgeByRef.set(`actor:${member.id}`, knowledgeFor({ kind: "actor", holderId: member.id }));
  }
  for (const actor of game.worldKernel.actors) knowledgeByRef.set(`actor:${actor.id}`, knowledgeFor({ kind: "actor", holderId: actor.id }));
  for (const faction of game.worldKernel.factions) knowledgeByRef.set(`faction:${faction.id}`, knowledgeFor({ kind: "faction", holderId: faction.id }));
  knowledgeByRef.set("player", knowledgeFor({ kind: "player", holderId: "player" }));
  for (const [ref, ids] of options.knowledgeByRef ?? []) knowledgeByRef.set(ref, new Set(ids));
  const actorKnowledge = new Map<string, Set<string>>();
  for (const [ref, ids] of knowledgeByRef) {
    if (ref === "player") actorKnowledge.set("player", ids);
    else if (ref.startsWith("actor:")) actorKnowledge.set(ref.slice("actor:".length), ids);
  }
  return {
    week: options.resolvingWeek ?? game.week,
    moneyAvailable: game.money,
    debtFloor: -80,
    manpowerAvailable: game.management.resources.manpower,
    extraordinaryMaterialsAvailable: game.management.resources.extraordinaryMaterials,
    actorIds: new Set(["player", ...game.members.map((member) => member.id), ...game.worldKernel.actors.map((actor) => actor.id)]),
    factionIds: new Set([...game.factions.map((faction) => faction.id), ...game.worldKernel.factions.map((faction) => faction.id)]),
    districtIds: new Set(game.management.map.districts.map((district) => district.id)),
    locationIds: new Set(game.worldKernel.locations.map((location) => location.id)),
    projectIds: new Set(game.worldKernel.projects.map((project) => project.id)),
    unavailableActorIds: new Set(game.members.filter((member) => /阵亡|失踪|重伤|受伤休养|被俘/.test(member.status)).map((member) => member.id)),
    actorKnowledge,
    knowledgeByRef,
  };
}

type OccupancySource = Pick<WorldActionProposal, "participantIds" | "facilityId" | "timeWindow"> & { participantRefs?: string[] };

function occupiedKeys(source: OccupancySource) {
  const days = Array.from({ length: Math.max(1, source.timeWindow.days) }, (_, index) => source.timeWindow.startDay + index);
  return [
    ...unique(source.participantRefs?.length ? source.participantRefs : source.participantIds.map((id) => id === "player" ? "player" : `actor:${id}`))
      .flatMap((ref) => days.map((day) => `${ref}:day:${day}`)),
    ...(source.facilityId ? days.map((day) => `facility:${source.facilityId}:day:${day}`) : []),
  ];
}

function requestedPlan(proposal: WorldActionProposal, authorization: DirectiveAuthorization): ExecutionPlan {
  const participantRefs = unique(proposal.participantRefs?.length
    ? proposal.participantRefs
    : proposal.participantIds.map((id) => id === "player" ? "player" : `actor:${id}`));
  return {
    proposalId: proposal.id,
    attemptId: proposal.attemptId ?? `attempt:${proposal.week}:${proposal.id}`,
    executable: true,
    participantIds: [...proposal.participantIds],
    participantRefs,
    targetRefs: unique(proposal.targetRefs?.length ? proposal.targetRefs : [`${proposal.target.kind}:${proposal.target.id}`]),
    commitments: { ...proposal.commitments },
    timeWindow: { ...proposal.timeWindow },
    authorization,
    visibility: proposal.visibility,
    holderRefs: [...proposal.holderRefs],
    causeEventIds: [...(proposal.causeEventIds ?? [])],
    adjustments: [],
    disposition: "executed",
    progressDelta: Math.max(0, 100 - (proposal.progressBefore ?? 0)),
    remainingDays: 0,
    nextEligibleWeek: null,
    ...(proposal.facilityId ? { facilityId: proposal.facilityId } : {}),
  };
}

function authorizationFor(proposal: WorldActionProposal) {
  return proposal.authorization ?? {
    scope: "strict" as const,
    redLines: [...proposal.redLines],
    mustEscalateWhen: [],
    retreatCondition: proposal.retreatCondition,
  };
}

function isLegacyProposal(proposal: WorldActionProposal) {
  return !proposal.authorization;
}

function escalationBoundaryMatches(authorization: DirectiveAuthorization, kind: "resource" | "schedule" | "visibility") {
  const boundary = authorization.mustEscalateWhen.join(" ");
  if (kind === "resource") return /资源|预算|资金|人力|材料|resource|budget|manpower|material/i.test(boundary);
  if (kind === "schedule") return /改期|延期|时段|人员冲突|设施冲突|schedule|delay|conflict/i.test(boundary);
  return /公开|保密|可见|visibility|public|secret/i.test(boundary);
}

function canAdjust(authorization: DirectiveAuthorization, kind: "resource" | "schedule" | "visibility") {
  return authorization.scope !== "strict" && !escalationBoundaryMatches(authorization, kind);
}

function invalidProposalReasons(proposal: WorldActionProposal, context: ActionRuleContext) {
  const reasons: string[] = [];
  const participantRefs = unique(proposal.participantRefs?.length
    ? proposal.participantRefs
    : proposal.participantIds.map((id) => id === "player" ? "player" : `actor:${id}`));
  const targetRefs = unique(proposal.targetRefs ?? []);
  if (proposal.week !== context.week) reasons.push("行动提案周次与当前世界周次不一致");
  if (!proposal.intent.trim() || !proposal.method.trim()) reasons.push("行动目标或执行方法为空");
  if (!proposal.redLines.length) reasons.push("行动没有声明不可越过的红线");
  if (!proposal.retreatCondition) reasons.push("行动没有声明撤退或中止条件");
  if (proposal.target.kind === "district" && !context.districtIds.has(proposal.target.id)) reasons.push("行动目标地区不存在");
  if (proposal.target.kind === "actor" && !context.actorIds.has(proposal.target.id)) reasons.push("行动目标角色不存在");
  if (proposal.target.kind === "faction" && !context.factionIds.has(proposal.target.id)) reasons.push("行动目标势力不存在");
  const unknownActors = proposal.participantIds.filter((id) => !context.actorIds.has(id));
  const unknownParticipantRefs = participantRefs.filter((ref) => {
    if (ref === "player" || ref === "organization") return false;
    if (ref.startsWith("actor:")) return !context.actorIds.has(ref.slice("actor:".length));
    if (ref.startsWith("faction:")) return !context.factionIds.has(ref.slice("faction:".length));
    return true;
  });
  if (unknownParticipantRefs.length) reasons.push(`行动引用未知参与主体：${unknownParticipantRefs.join("、")}`);
  const unknownTargetRefs = targetRefs.filter((ref) => {
    if (ref === "player" || ref === "organization") return false;
    if (ref.startsWith("actor:")) return !context.actorIds.has(ref.slice("actor:".length));
    if (ref.startsWith("faction:")) return !context.factionIds.has(ref.slice("faction:".length));
    if (ref.startsWith("location:")) return Boolean(context.locationIds && !context.locationIds.has(ref.slice("location:".length)) && !context.districtIds.has(ref.slice("location:".length)));
    if (ref.startsWith("project:")) return Boolean(context.projectIds && !context.projectIds.has(ref.slice("project:".length)));
    return true;
  });
  if (unknownTargetRefs.length) reasons.push(`行动引用未知目标：${unknownTargetRefs.join("、")}`);
  if (unknownActors.length) reasons.push(`行动引用未知参与者：${unknownActors.join("、")}`);
  const unavailable = proposal.participantIds.filter((id) => context.unavailableActorIds.has(id));
  if (unavailable.length) reasons.push(`参与者当前不可行动：${unavailable.join("、")}`);
  const missingKnowledge = proposal.requiredKnowledgeIds.filter((id) => !participantRefs.some((ref) =>
    context.knowledgeByRef?.get(ref)?.has(id)
    || (ref === "player" ? context.actorKnowledge.get("player")?.has(id) : ref.startsWith("actor:") && context.actorKnowledge.get(ref.slice("actor:".length))?.has(id))));
  if (missingKnowledge.length) reasons.push(`参与者没有获得行动所需知识：${missingKnowledge.join("、")}`);
  if (!Number.isInteger(proposal.timeWindow.days) || proposal.timeWindow.days < 1 || proposal.timeWindow.days > 7) reasons.push("行动持续时间无效");
  const commitmentValues = Object.values(proposal.commitments);
  if (commitmentValues.some((value) => !Number.isFinite(value) || value < 0)) reasons.push("行动资源承诺包含无效数值");
  return reasons;
}

function remainingResources(context: ActionRuleContext, reserved: ExecutionPlan[]): ActionCommitments {
  const used = reserved.reduce<ActionCommitments>((total, plan) => ({
    money: total.money + plan.commitments.money,
    manpower: total.manpower + plan.commitments.manpower,
    extraordinaryMaterials: total.extraordinaryMaterials + plan.commitments.extraordinaryMaterials,
    spirituality: total.spirituality + plan.commitments.spirituality,
  }), { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 });
  return {
    money: Math.max(0, context.moneyAvailable - context.debtFloor - used.money),
    manpower: Math.max(0, context.manpowerAvailable - used.manpower),
    extraordinaryMaterials: Math.max(0, context.extraordinaryMaterialsAvailable - used.extraordinaryMaterials),
    // Spirituality has no shared pool in ActionRuleContext yet, so it is not
    // silently reduced by a rule that cannot establish the available amount.
    spirituality: Number.POSITIVE_INFINITY,
  };
}

function fitResources(plan: ExecutionPlan, available: ActionCommitments) {
  const adjustments: string[] = [];
  for (const key of ["money", "manpower", "extraordinaryMaterials"] as const) {
    const requested = plan.commitments[key];
    const granted = Math.min(requested, available[key]);
    if (granted !== requested) {
      plan.commitments[key] = granted;
      adjustments.push(`${key}投入由${requested}缩减为${granted}`);
    }
  }
  return adjustments;
}

function firstAvailableWindow(plan: ExecutionPlan, usedKeys: Set<string>) {
  const latestStart = 7 - plan.timeWindow.days + 1;
  for (let startDay = 1; startDay <= latestStart; startDay += 1) {
    const candidate = { ...plan, timeWindow: { ...plan.timeWindow, startDay } };
    if (!occupiedKeys(candidate).some((key) => usedKeys.has(key))) return candidate.timeWindow;
  }
  return null;
}

function bestPartialWindow(plan: ExecutionPlan, usedKeys: Set<string>) {
  let best: ActionTimeWindow | null = null;
  for (let startDay = 1; startDay <= 7; startDay += 1) {
    let days = 0;
    while (startDay + days <= 7 && days < plan.timeWindow.days) {
      const candidate = { ...plan, timeWindow: { startDay: startDay + days, days: 1 } };
      if (occupiedKeys(candidate).some((key) => usedKeys.has(key))) break;
      days += 1;
    }
    if (days > 0 && (!best || days > best.days)) best = { startDay, days };
  }
  return best;
}

function isAutonomousProposal(proposal: WorldActionProposal) {
  return proposal.proposer.kind === "actor" || proposal.proposer.kind === "faction";
}

function scaleCommitments(plan: ExecutionPlan, numerator: number, denominator: number) {
  if (numerator >= denominator) return;
  // Manpower is concurrent capacity for the fragment, not a cumulatively
  // consumed inventory. Only consumable commitments scale with elapsed work.
  for (const key of ["money", "extraordinaryMaterials", "spirituality"] as const) {
    plan.commitments[key] = Math.max(0, Math.round(plan.commitments[key] * numerator / denominator));
  }
}

function deferPlan(plan: ExecutionPlan, context: ActionRuleContext, disposition: "deferred" | "awaiting-authorization") {
  plan.executable = false;
  plan.disposition = disposition;
  plan.progressDelta = 0;
  plan.remainingDays = plan.timeWindow.days;
  plan.nextEligibleWeek = context.week + 1;
}

function adjudicateProposal(
  proposal: WorldActionProposal,
  context: ActionRuleContext,
  reserved: ExecutionPlan[],
  usedKeys: Set<string>,
): { review: ActionReview; executionPlan: ExecutionPlan } {
  const authorization = authorizationFor(proposal);
  const executionPlan = requestedPlan(proposal, authorization);
  const invalidReasons = invalidProposalReasons(proposal, context);
  if (invalidReasons.length) {
    executionPlan.executable = false;
    executionPlan.disposition = "rejected";
    executionPlan.progressDelta = 0;
    executionPlan.remainingDays = proposal.timeWindow.days;
    executionPlan.nextEligibleWeek = null;
    return {
      review: { proposalId: proposal.id, status: "rejected", reasons: invalidReasons, enforcedLimits: [] },
      executionPlan,
    };
  }

  const escalationReasons: string[] = [];
  const adjustments: string[] = [];
  const available = remainingResources(context, reserved);
  const needsResourceReduction = (["money", "manpower", "extraordinaryMaterials"] as const)
    .some((key) => executionPlan.commitments[key] > available[key]);
  if (needsResourceReduction) {
    if (isLegacyProposal(proposal)) {
      executionPlan.executable = false;
      executionPlan.disposition = "rejected";
      executionPlan.progressDelta = 0;
      executionPlan.remainingDays = proposal.timeWindow.days;
      executionPlan.nextEligibleWeek = null;
      return {
        review: { proposalId: proposal.id, status: "rejected", reasons: ["行动承诺的资源超过当前可用总量"], enforcedLimits: [] },
        executionPlan,
      };
    }
    if (canAdjust(authorization, "resource")) adjustments.push(...fitResources(executionPlan, available));
    else if (isAutonomousProposal(proposal)) {
      deferPlan(executionPlan, context, "deferred");
      executionPlan.adjustments = ["资源窗口不足，自主主体等待下一周重新规划"];
      return {
        review: { proposalId: proposal.id, status: "limited", reasons: [], enforcedLimits: [...executionPlan.adjustments] },
        executionPlan,
      };
    } else escalationReasons.push("资源不足，且授权不允许后台缩减投入");
  }

  const requestedKeys = occupiedKeys(executionPlan);
  const invalidStart = executionPlan.timeWindow.startDay < 1 || executionPlan.timeWindow.startDay + executionPlan.timeWindow.days - 1 > 7;
  const hasConflict = requestedKeys.some((key) => usedKeys.has(key));
  if (invalidStart || hasConflict) {
    if (isLegacyProposal(proposal)) {
      executionPlan.executable = false;
      executionPlan.disposition = "rejected";
      executionPlan.progressDelta = 0;
      executionPlan.remainingDays = proposal.timeWindow.days;
      executionPlan.nextEligibleWeek = null;
      return {
        review: { proposalId: proposal.id, status: "rejected", reasons: [hasConflict ? "行动与更高优先级提案争用同一人员或设施时段" : "行动时段越过本周边界"], enforcedLimits: [] },
        executionPlan,
      };
    }
    if (authorization.scope !== "strict" || isAutonomousProposal(proposal)) {
      const alternative = firstAvailableWindow(executionPlan, usedKeys);
      if (alternative) {
        const previous = executionPlan.timeWindow.startDay;
        executionPlan.timeWindow = alternative;
        adjustments.push(`执行时段由第${previous}日改为第${alternative.startDay}日开始`);
      } else {
        const partial = bestPartialWindow(executionPlan, usedKeys);
        if (partial) {
          const requestedDays = executionPlan.timeWindow.days;
          executionPlan.timeWindow = partial;
          executionPlan.disposition = "partially-completed";
          executionPlan.progressDelta = Math.min(
            100 - (proposal.progressBefore ?? 0),
            Math.max(1, Math.round(partial.days / Math.max(1, proposal.totalDays ?? requestedDays) * 100)),
          );
          executionPlan.remainingDays = Math.max(0, requestedDays - partial.days);
          executionPlan.nextEligibleWeek = context.week + 1;
          scaleCommitments(executionPlan, partial.days, requestedDays);
          adjustments.push(`本周仅有连续${partial.days}日窗口，先完成可执行片段`);
        } else {
          deferPlan(executionPlan, context, "deferred");
          adjustments.push(isAutonomousProposal(proposal)
            ? "与首领已锁定的安排冲突，自主主体本周等待"
            : "本周没有连续可用时段，指令顺延至下一周");
        }
      }
    } else escalationReasons.push("人员或设施时段冲突，且授权要求先请示");
  }

  const secrecyConflict = executionPlan.visibility === "public" && authorization.redLines.some((item) => /保密|匿名|不暴露|不透露/.test(item));
  if (secrecyConflict) {
    if (isLegacyProposal(proposal) || canAdjust(authorization, "visibility") || isAutonomousProposal(proposal)) {
      executionPlan.visibility = "actors";
      adjustments.push("公开传播范围收紧为仅参与者可见");
    } else escalationReasons.push("公开可见性与保密红线冲突");
  }

  executionPlan.adjustments = adjustments;
  if (escalationReasons.length) {
    deferPlan(executionPlan, context, "awaiting-authorization");
    return {
      review: { proposalId: proposal.id, status: "escalation-required", reasons: escalationReasons, enforcedLimits: adjustments },
      executionPlan,
    };
  }
  return {
    review: {
      proposalId: proposal.id,
      status: adjustments.length ? "limited" : "accepted",
      reasons: [],
      enforcedLimits: adjustments,
    },
    executionPlan,
  };
}

export function adjudicateWorldActionProposals(
  proposals: WorldActionProposal[],
  context: ActionRuleContext,
  options: WorldActionAdjudicationOptions = {},
): ActionAdjudication[] {
  const sorted = proposals.slice().sort((left, right) => right.priority - left.priority || stableNumber(left.id) - stableNumber(right.id) || left.id.localeCompare(right.id));
  const reserved: ExecutionPlan[] = [];
  const usedKeys = new Set<string>();
  for (const plan of options.lockedPlans ?? []) {
    if (!plan.executable) continue;
    for (const key of occupiedKeys(plan)) usedKeys.add(key);
  }
  return sorted.map((proposal, index) => {
    const { review, executionPlan } = adjudicateProposal(proposal, context, reserved, usedKeys);
    const keys = occupiedKeys(executionPlan);
    if (executionPlan.executable) {
      reserved.push(executionPlan);
      for (const key of keys) usedKeys.add(key);
    }
    return { proposal, review, executionPlan, resolutionOrder: index + 1, conflictKeys: keys };
  });
}

export function actionAdjudicationLedgerEvents(
  adjudications: ActionAdjudication[],
  phase: LedgerEventInput["phase"] = "player-actions",
): LedgerEventInput[] {
  return adjudications.flatMap(({ proposal, review, executionPlan, resolutionOrder }) => {
    const actionId = proposal.sourceContractId ?? proposal.id;
    const common = {
      week: proposal.week,
      phase,
      actorIds: proposal.participantIds.filter((id) => id !== "player"),
      factionIds: proposal.proposer.kind === "faction" ? [proposal.proposer.id] : [],
      witnessRefs: proposal.holderRefs,
      audience: { visibility: proposal.visibility, holderRefs: proposal.holderRefs },
    };
    return [
      {
        ...common,
        id: proposal.id,
        kind: "action-proposed" as const,
        summary: `${proposal.proposer.id}提出${proposal.actionType}行动`,
        causeEventIds: proposal.causeEventIds ?? [],
        payload: { actionId, intent: proposal.intent, proposal, causeEventIds: proposal.causeEventIds ?? [] },
      },
      {
        ...common,
        id: `review:${proposal.id}`,
        kind: "action-reviewed" as const,
        summary: review.status === "rejected"
          ? "行动提案被规则拒绝"
          : review.status === "escalation-required"
            ? "行动提案需要首领追加裁定"
            : review.status === "limited"
              ? "行动提案在授权范围内调整后通过"
              : "行动提案通过规则审查",
        causeEventIds: [proposal.id],
        payload: {
          actionId,
          status: review.status,
          reasons: review.reasons,
          review,
          executionPlan,
          resolutionOrder,
          causeEventIds: proposal.causeEventIds ?? [],
        },
      },
    ];
  });
}
