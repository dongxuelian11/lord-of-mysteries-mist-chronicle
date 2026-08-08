import { projectWorldForAudience, type WorldKernel } from "./world-kernel.ts";

export type AutonomousEntityKind = "actor" | "faction";

export type AutonomousAgentProfile = {
  ref: string;
  kind: AutonomousEntityKind;
  entityId: string;
  displayName: string;
  drives: string[];
  currentObjective: string;
  nextAction: string;
  riskTolerance: number;
  planningHorizonWeeks: number;
  privateMemoryIds: string[];
  reflection: string;
  updatedWeek: number;
};

export type AutonomousSocialTie = {
  id: string;
  sourceRef: string;
  targetRef: string;
  familiarity: number;
  tension: number;
  leverage: number;
  lastInteractionWeek: number;
  causeEventIds: string[];
};

export type AutonomousWorldState = {
  version: 1;
  profiles: AutonomousAgentProfile[];
  socialTies: AutonomousSocialTie[];
  lastPlannedWeek: number;
};

export type AutonomousActionCandidate = {
  id: string;
  intent: string;
  reason: string;
  requiredKnowledgeIds: string[];
};

export type AutonomousDecisionFrame = {
  planningWeek: number;
  ref: string;
  kind: AutonomousEntityKind;
  displayName: string;
  currentObjective: string;
  nextAction: string;
  locationId?: string;
  resources?: number;
  riskTolerance: number;
  planningHorizonWeeks: number;
  knownObservationIds: string[];
  knownKnowledgeIds: string[];
  privateMemoryIds: string[];
  relationships: Array<Pick<AutonomousSocialTie, "targetRef" | "familiarity" | "tension" | "leverage">>;
  candidateActions: AutonomousActionCandidate[];
  freeActionAllowed: true;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function stableNumber(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function actorProfile(actor: WorldKernel["actors"][number], week: number): AutonomousAgentProfile {
  return {
    ref: `actor:${actor.id}`,
    kind: "actor",
    entityId: actor.id,
    displayName: actor.name,
    drives: [actor.agenda, "维持自身处境与身份连续性"],
    currentObjective: actor.shortTermGoal,
    nextAction: actor.lastAction,
    riskTolerance: 25 + stableNumber(actor.id) % 51,
    planningHorizonWeeks: 2 + stableNumber(`horizon:${actor.id}`) % 5,
    privateMemoryIds: actor.knowledgeIds.slice(-24),
    reflection: "尚未形成新的跨周反思。",
    updatedWeek: week,
  };
}

function factionProfile(faction: WorldKernel["factions"][number], week: number): AutonomousAgentProfile {
  return {
    ref: `faction:${faction.id}`,
    kind: "faction",
    entityId: faction.id,
    displayName: faction.name,
    drives: [faction.posture, "保存组织资源并扩大可持续影响"],
    currentObjective: faction.posture,
    nextAction: faction.lastAction,
    riskTolerance: clamp(35 + faction.suspicion / 2),
    planningHorizonWeeks: 3 + stableNumber(`horizon:${faction.id}`) % 6,
    privateMemoryIds: [],
    reflection: "尚未形成新的跨周反思。",
    updatedWeek: week,
  };
}

export function createAutonomousWorldState(kernel: WorldKernel): AutonomousWorldState {
  return {
    version: 1,
    profiles: [
      ...kernel.actors.map((actor) => actorProfile(actor, kernel.currentWeek)),
      ...kernel.factions.map((faction) => factionProfile(faction, kernel.currentWeek)),
    ],
    socialTies: [],
    lastPlannedWeek: Math.max(0, kernel.currentWeek - 1),
  };
}

export function ensureAutonomousWorldState(state: AutonomousWorldState | undefined, kernel: WorldKernel): AutonomousWorldState {
  const current = state?.version === 1 ? state : createAutonomousWorldState(kernel);
  const profileByRef = new Map(current.profiles.map((profile) => [profile.ref, profile]));
  for (const actor of kernel.actors) if (!profileByRef.has(`actor:${actor.id}`)) profileByRef.set(`actor:${actor.id}`, actorProfile(actor, kernel.currentWeek));
  for (const faction of kernel.factions) if (!profileByRef.has(`faction:${faction.id}`)) profileByRef.set(`faction:${faction.id}`, factionProfile(faction, kernel.currentWeek));
  const validRefs = new Set([
    ...kernel.actors.map((actor) => `actor:${actor.id}`),
    ...kernel.factions.map((faction) => `faction:${faction.id}`),
  ]);
  return {
    version: 1,
    profiles: [...profileByRef.values()].filter((profile) => validRefs.has(profile.ref)),
    socialTies: current.socialTies.filter((tie) => validRefs.has(tie.sourceRef) && validRefs.has(tie.targetRef)),
    lastPlannedWeek: current.lastPlannedWeek,
  };
}

function candidateActions(profile: AutonomousAgentProfile, kernel: WorldKernel, knownKnowledgeIds: string[], relationships: AutonomousDecisionFrame["relationships"]): AutonomousActionCandidate[] {
  const ownedProject = kernel.projects
    .filter((project) => project.ownerId === profile.entityId && project.status === "active")
    .sort((left, right) => right.progress - left.progress || left.id.localeCompare(right.id))[0];
  const candidates: AutonomousActionCandidate[] = [];
  if (ownedProject) candidates.push({
    id: `${profile.ref}:continue:${ownedProject.id}`,
    intent: ownedProject.nextMilestone,
    reason: `继续推进“${ownedProject.title}”的${ownedProject.stage}阶段`,
    requiredKnowledgeIds: [],
  });
  const newestKnowledgeId = knownKnowledgeIds.at(-1);
  if (newestKnowledgeId) candidates.push({
    id: `${profile.ref}:respond:${newestKnowledgeId}`,
    intent: "核验或利用最近获得的认知",
    reason: "该认知刚进入自身视野，但仍需依据其可信度行动",
    requiredKnowledgeIds: [newestKnowledgeId],
  });
  const salientRelationship = relationships.slice().sort((left, right) => (right.tension + right.familiarity + right.leverage) - (left.tension + left.familiarity + left.leverage) || left.targetRef.localeCompare(right.targetRef))[0];
  if (salientRelationship && (salientRelationship.tension >= 4 || salientRelationship.familiarity >= 4)) candidates.push({
    id: `${profile.ref}:relationship:${salientRelationship.targetRef}`,
    intent: salientRelationship.tension >= salientRelationship.familiarity
      ? `监控、规避或牵制${salientRelationship.targetRef}`
      : `与${salientRelationship.targetRef}交换信息或协调利益`,
    reason: `持续关系已形成：熟悉度${salientRelationship.familiarity}，紧张度${salientRelationship.tension}，筹码${salientRelationship.leverage}`,
    requiredKnowledgeIds: [],
  });
  candidates.push({
    id: `${profile.ref}:preserve-position`,
    intent: profile.kind === "faction" ? "巩固资源、联络点与既有影响" : "在不暴露长期诉求的前提下改善当前处境",
    reason: "没有更紧迫的已知变化时维持长期连续性",
    requiredKnowledgeIds: [],
  });
  return candidates.slice(0, 3);
}

export function buildAutonomousDecisionFrames(state: AutonomousWorldState, kernel: WorldKernel, week: number): AutonomousDecisionFrame[] {
  const current = ensureAutonomousWorldState(state, kernel);
  return current.profiles.map((profile) => {
    const audience = profile.kind === "actor"
      ? { kind: "actor" as const, holderId: profile.entityId }
      : { kind: "faction" as const, holderId: profile.entityId };
    const view = projectWorldForAudience(kernel, audience);
    const entity = profile.kind === "actor"
      ? kernel.actors.find((actor) => actor.id === profile.entityId)
      : kernel.factions.find((faction) => faction.id === profile.entityId);
    const knownKnowledgeIds = view.knowledge.map((node) => node.id);
    const relationships = current.socialTies.filter((tie) => tie.sourceRef === profile.ref).map(({ targetRef, familiarity, tension, leverage }) => ({ targetRef, familiarity, tension, leverage }));
    return {
      planningWeek: week,
      ref: profile.ref,
      kind: profile.kind,
      displayName: profile.displayName,
      currentObjective: profile.currentObjective,
      nextAction: profile.nextAction,
      ...(profile.kind === "actor" ? { locationId: (entity as WorldKernel["actors"][number] | undefined)?.locationId } : { resources: (entity as WorldKernel["factions"][number] | undefined)?.resources }),
      riskTolerance: profile.riskTolerance,
      planningHorizonWeeks: profile.planningHorizonWeeks,
      knownObservationIds: view.observations.map((observation) => observation.id),
      knownKnowledgeIds,
      privateMemoryIds: [...new Set([...profile.privateMemoryIds, ...knownKnowledgeIds])].slice(-32),
      relationships,
      candidateActions: candidateActions(profile, kernel, knownKnowledgeIds, relationships),
      freeActionAllowed: true,
    };
  });
}

function eventParticipantRefs(event: WorldKernel["events"][number]) {
  return [...new Set([
    ...event.actorIds.map((id) => `actor:${id}`),
    ...event.factionIds.map((id) => `faction:${id}`),
    ...(event.witnessRefs ?? []).filter((ref) => ref.startsWith("actor:") || ref.startsWith("faction:")),
  ])];
}

function updateSocialTies(previous: AutonomousSocialTie[], kernel: WorldKernel, week: number) {
  const byId = new Map(previous.map((tie) => [tie.id, { ...tie, causeEventIds: [...tie.causeEventIds] }]));
  for (const event of kernel.events.filter((candidate) => candidate.week === week)) {
    const refs = eventParticipantRefs(event);
    const tense = /袭击|冲突|追捕|背叛|威胁|破坏|争夺|死亡|受伤/.test(`${event.title} ${event.detail}`);
    for (const sourceRef of refs) for (const targetRef of refs) {
      if (sourceRef === targetRef) continue;
      const id = `${sourceRef}->${targetRef}`;
      const existing = byId.get(id) ?? { id, sourceRef, targetRef, familiarity: 0, tension: 0, leverage: 0, lastInteractionWeek: week, causeEventIds: [] };
      byId.set(id, {
        ...existing,
        familiarity: clamp(existing.familiarity + 4),
        tension: clamp(existing.tension + (tense ? 7 : 1)),
        leverage: clamp(existing.leverage + (event.visibility === "world" ? 2 : 0)),
        lastInteractionWeek: week,
        causeEventIds: [...new Set([...existing.causeEventIds, event.id])].slice(-16),
      });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function advanceAutonomousWorldState(
  state: AutonomousWorldState,
  before: WorldKernel,
  after: WorldKernel,
  week: number,
): AutonomousWorldState {
  const current = ensureAutonomousWorldState(state, after);
  const profiles = current.profiles.map((profile) => {
    const entity = profile.kind === "actor"
      ? after.actors.find((actor) => actor.id === profile.entityId)
      : after.factions.find((faction) => faction.id === profile.entityId);
    const holderRef = profile.ref;
    const receivedKnowledgeIds = after.knowledge
      .filter((node) => node.acquiredWeek === week && (node.visibility === "public" || node.holderRefs?.includes(holderRef) || node.holderIds.includes(profile.entityId)))
      .map((node) => node.id);
    const witnessedEvents = after.events.filter((event) => event.week === week && (event.visibility === "public" || event.witnessRefs?.includes(holderRef)));
    const previousEventCount = before.events.filter((event) => event.week === week && (event.visibility === "public" || event.witnessRefs?.includes(holderRef))).length;
    const newEventCount = Math.max(0, witnessedEvents.length - previousEventCount);
    const currentObjective = profile.kind === "actor"
      ? (entity as WorldKernel["actors"][number] | undefined)?.shortTermGoal ?? profile.currentObjective
      : (entity as WorldKernel["factions"][number] | undefined)?.posture ?? profile.currentObjective;
    const nextAction = profile.kind === "actor"
      ? (entity as WorldKernel["actors"][number] | undefined)?.lastAction ?? profile.nextAction
      : (entity as WorldKernel["factions"][number] | undefined)?.lastAction ?? profile.nextAction;
    return {
      ...profile,
      currentObjective,
      nextAction,
      privateMemoryIds: [...new Set([...profile.privateMemoryIds, ...receivedKnowledgeIds, ...witnessedEvents.map((event) => event.id)])].slice(-32),
      reflection: newEventCount || receivedKnowledgeIds.length
        ? `本周有${newEventCount}项新事件和${receivedKnowledgeIds.length}项新认知进入自身视野；下一步仍围绕“${currentObjective}”。`
        : `本周没有新的可感知变化；继续维持“${currentObjective}”。`,
      updatedWeek: week,
    };
  });
  return {
    version: 1,
    profiles,
    socialTies: updateSocialTies(current.socialTies, after, week),
    lastPlannedWeek: week,
  };
}
