import type { GameState, ScheduledAction } from "./game-model.ts";
import type { LedgerEventInput } from "./world-ledger.ts";

export type ActionProposer = {
  kind: "player" | "actor" | "faction" | "system";
  id: string;
};

export type WorldActionProposal = {
  id: string;
  week: number;
  proposer: ActionProposer;
  actionType: string;
  intent: string;
  method: string;
  target: { kind: "district" | "actor" | "faction" | "organization" | "world"; id: string };
  participantIds: string[];
  requiredKnowledgeIds: string[];
  commitments: { money: number; manpower: number; extraordinaryMaterials: number; spirituality: number };
  timeWindow: { startDay: number; days: number };
  priority: number;
  redLines: string[];
  retreatCondition: string;
  visibility: "world" | "public" | "player" | "actors" | "factions";
  holderRefs: string[];
  sourceContractId?: string;
  facilityId?: string;
};

export type ActionReview = {
  proposalId: string;
  status: "accepted" | "limited" | "rejected";
  reasons: string[];
  enforcedLimits: string[];
};

export type ActionAdjudication = {
  proposal: WorldActionProposal;
  review: ActionReview;
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
  unavailableActorIds: Set<string>;
  actorKnowledge: Map<string, Set<string>>;
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
  return [...new Set(value.split(/[；;。]/).map((item) => item.trim()).filter(Boolean))];
}

export function proposalFromScheduledAction(action: ScheduledAction, week: number): WorldActionProposal {
  const participantIds = [...new Set([action.leaderId, ...action.memberIds].filter((id) => id && id !== "organization"))];
  const holderRefs = participantIds.map((id) => id === "player" ? "player" : `actor:${id}`);
  return {
    id: `proposal:${week}:${action.id}`,
    week,
    proposer: { kind: "player", id: "player" },
    actionType: action.kind,
    intent: action.desiredOutcome,
    method: action.approach,
    target: { kind: "district", id: action.districtId },
    participantIds,
    requiredKnowledgeIds: [],
    commitments: { money: action.budget, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
    timeWindow: { startDay: action.startDay, days: action.days },
    priority: (action.focus ? 20 : 0) + (action.executionMode === "player-led" ? 90 : 70),
    redLines: splitRules(action.redLines),
    retreatCondition: action.retreat.trim(),
    visibility: "actors",
    holderRefs,
    sourceContractId: action.id,
    ...(action.facilityId ? { facilityId: action.facilityId } : {}),
  };
}

export function createActionRuleContext(game: GameState): ActionRuleContext {
  const actorKnowledge = new Map<string, Set<string>>();
  for (const member of game.members) {
    actorKnowledge.set(member.id, new Set(game.worldKernel.knowledge.filter((node) => node.visibility === "public" || node.holderIds.includes(member.id) || node.holderRefs?.includes(`actor:${member.id}`)).map((node) => node.id)));
  }
  actorKnowledge.set("player", new Set(game.worldKernel.knowledge.filter((node) => node.visibility === "public" || node.visibility === "player" || node.holderIds.includes("player") || node.holderRefs?.includes("player")).map((node) => node.id)));
  return {
    week: game.week,
    moneyAvailable: game.money,
    debtFloor: -80,
    manpowerAvailable: game.management.resources.manpower,
    extraordinaryMaterialsAvailable: game.management.resources.extraordinaryMaterials,
    actorIds: new Set(["player", ...game.members.map((member) => member.id), ...game.worldKernel.actors.map((actor) => actor.id)]),
    factionIds: new Set([...game.factions.map((faction) => faction.id), ...game.worldKernel.factions.map((faction) => faction.id)]),
    districtIds: new Set(game.management.map.districts.map((district) => district.id)),
    unavailableActorIds: new Set(game.members.filter((member) => /阵亡|失踪|重伤|受伤休养|被俘/.test(member.status)).map((member) => member.id)),
    actorKnowledge,
  };
}

function occupiedKeys(proposal: WorldActionProposal) {
  const days = Array.from({ length: Math.max(1, proposal.timeWindow.days) }, (_, index) => proposal.timeWindow.startDay + index);
  return [
    ...proposal.participantIds.flatMap((id) => days.map((day) => `actor:${id}:day:${day}`)),
    ...(proposal.facilityId ? days.map((day) => `facility:${proposal.facilityId}:day:${day}`) : []),
  ];
}

function reviewProposal(proposal: WorldActionProposal, context: ActionRuleContext, reserved: WorldActionProposal[], usedKeys: Set<string>): ActionReview {
  const reasons: string[] = [];
  const enforcedLimits: string[] = [];
  if (proposal.week !== context.week) reasons.push("行动提案周次与当前世界周次不一致");
  if (!proposal.intent.trim() || !proposal.method.trim()) reasons.push("行动目标或执行方法为空");
  if (!proposal.redLines.length) reasons.push("行动没有声明不可越过的红线");
  if (!proposal.retreatCondition) reasons.push("行动没有声明撤退或中止条件");
  if (proposal.target.kind === "district" && !context.districtIds.has(proposal.target.id)) reasons.push("行动目标地区不存在");
  const unknownActors = proposal.participantIds.filter((id) => !context.actorIds.has(id));
  if (unknownActors.length) reasons.push(`行动引用未知参与者：${unknownActors.join("、")}`);
  const unavailable = proposal.participantIds.filter((id) => context.unavailableActorIds.has(id));
  if (unavailable.length) reasons.push(`参与者当前不可行动：${unavailable.join("、")}`);
  const missingKnowledge = proposal.requiredKnowledgeIds.filter((id) => !proposal.participantIds.some((actorId) => context.actorKnowledge.get(actorId)?.has(id)));
  if (missingKnowledge.length) reasons.push(`参与者没有获得行动所需知识：${missingKnowledge.join("、")}`);
  if (occupiedKeys(proposal).some((key) => usedKeys.has(key))) reasons.push("行动与更高优先级提案争用同一人员或设施时段");
  const committedMoney = reserved.reduce((sum, item) => sum + item.commitments.money, 0) + proposal.commitments.money;
  if (context.moneyAvailable - committedMoney < context.debtFloor) reasons.push("行动会越过组织严重债务线");
  const committedManpower = reserved.reduce((sum, item) => sum + item.commitments.manpower, 0) + proposal.commitments.manpower;
  if (committedManpower > context.manpowerAvailable) reasons.push("行动承诺的人力超过可用总量");
  const committedMaterials = reserved.reduce((sum, item) => sum + item.commitments.extraordinaryMaterials, 0) + proposal.commitments.extraordinaryMaterials;
  if (committedMaterials > context.extraordinaryMaterialsAvailable) reasons.push("行动承诺的非凡材料超过库存");
  if (proposal.timeWindow.startDay < 1 || proposal.timeWindow.startDay + proposal.timeWindow.days - 1 > 7) reasons.push("行动时段越过本周边界");
  if (proposal.visibility === "public" && proposal.redLines.some((item) => /保密|匿名|不暴露|不透露/.test(item))) {
    enforcedLimits.push("公开传播范围被收紧为仅参与者可见");
  }
  return {
    proposalId: proposal.id,
    status: reasons.length ? "rejected" : enforcedLimits.length ? "limited" : "accepted",
    reasons,
    enforcedLimits,
  };
}

export function adjudicateWorldActionProposals(proposals: WorldActionProposal[], context: ActionRuleContext): ActionAdjudication[] {
  const sorted = proposals.slice().sort((left, right) => right.priority - left.priority || stableNumber(left.id) - stableNumber(right.id) || left.id.localeCompare(right.id));
  const accepted: WorldActionProposal[] = [];
  const usedKeys = new Set<string>();
  return sorted.map((proposal, index) => {
    const review = reviewProposal(proposal, context, accepted, usedKeys);
    const keys = occupiedKeys(proposal);
    if (review.status !== "rejected") {
      accepted.push(proposal);
      for (const key of keys) usedKeys.add(key);
    }
    return { proposal, review, resolutionOrder: index + 1, conflictKeys: keys };
  });
}

export function actionAdjudicationLedgerEvents(adjudications: ActionAdjudication[]): LedgerEventInput[] {
  return adjudications.flatMap(({ proposal, review, resolutionOrder }) => {
    const common = {
      week: proposal.week,
      phase: "player-actions" as const,
      actorIds: proposal.participantIds.filter((id) => id !== "player"),
      factionIds: proposal.proposer.kind === "faction" ? [proposal.proposer.id] : [],
      witnessRefs: proposal.holderRefs,
      causeEventIds: [],
      audience: { visibility: proposal.visibility, holderRefs: proposal.holderRefs },
    };
    return [
      {
        ...common,
        id: proposal.id,
        kind: "action-proposed" as const,
        summary: `${proposal.proposer.id}提出${proposal.actionType}行动`,
        payload: { proposal },
      },
      {
        ...common,
        id: `review:${proposal.id}`,
        kind: "action-reviewed" as const,
        summary: review.status === "rejected" ? "行动提案被规则拒绝" : review.status === "limited" ? "行动提案在附加限制后通过" : "行动提案通过规则审查",
        payload: { review, resolutionOrder },
      },
    ];
  });
}
