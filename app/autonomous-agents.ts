import { projectWorldForAudience, type WorldKernel } from "./world-kernel.ts";
import { buildAutonomousMemoryProjection, type DynamicMemoryState } from "./memory/index.ts";

export type AutonomousEntityKind = "actor" | "faction";

export type AutonomousReflection = {
  version: 1;
  createdWeek: number;
  audienceRef: string;
  summary: string;
  conclusions: string[];
  sourceRefs: string[];
  sourceEventIds: string[];
  recommendedObjective: string;
  recommendedIntent: string;
  requiredKnowledgeIds: string[];
  driveSignals: string[];
  provenance: "deterministic-visible-state" | "migration";
};

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
  reflection: AutonomousReflection;
  updatedWeek: number;
  lastActiveWeek?: number;
  lastPlanningSignature?: string;
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
  activeAgentRefs: string[];
  coldAgentRefs: string[];
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
  drives: string[];
  currentObjective: string;
  nextAction: string;
  locationId?: string;
  resources?: number;
  riskTolerance: number;
  planningHorizonWeeks: number;
  reflection: AutonomousReflection;
  knownObservationIds: string[];
  knownKnowledgeIds: string[];
  privateMemoryIds: string[];
  planningSignature: string;
  previousPlanningSignature?: string;
  allowedTargetRefs: string[];
  allowedLocationIds: string[];
  relationships: Array<Pick<AutonomousSocialTie, "targetRef" | "familiarity" | "tension" | "leverage">>;
  candidateActions: AutonomousActionCandidate[];
  freeActionAllowed: true;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
export const MAX_ACTIVE_AUTONOMOUS_AGENTS = 24;

function stableNumber(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function baselineReflection(
  audienceRef: string,
  objective: string,
  nextAction: string,
  week: number,
  legacySummary?: string,
): AutonomousReflection {
  return {
    version: 1,
    createdWeek: week,
    audienceRef,
    summary: legacySummary?.trim() || "尚未形成有新来源支持的跨周反思。",
    conclusions: [],
    sourceRefs: [],
    sourceEventIds: [],
    recommendedObjective: objective,
    recommendedIntent: nextAction,
    requiredKnowledgeIds: [],
    driveSignals: [],
    provenance: legacySummary ? "migration" : "deterministic-visible-state",
  };
}

function normalizeReflection(profile: AutonomousAgentProfile | (Omit<AutonomousAgentProfile, "reflection"> & { reflection?: unknown })): AutonomousReflection {
  const value = profile.reflection;
  if (value && typeof value === "object" && !Array.isArray(value) && (value as AutonomousReflection).version === 1) {
    const reflection = value as AutonomousReflection;
    return {
      ...reflection,
      audienceRef: reflection.audienceRef || profile.ref,
      conclusions: Array.isArray(reflection.conclusions) ? reflection.conclusions.slice(0, 8) : [],
      sourceRefs: Array.isArray(reflection.sourceRefs) ? [...new Set(reflection.sourceRefs)].slice(0, 32) : [],
      sourceEventIds: Array.isArray(reflection.sourceEventIds) ? [...new Set(reflection.sourceEventIds)].slice(0, 24) : [],
      requiredKnowledgeIds: Array.isArray(reflection.requiredKnowledgeIds) ? [...new Set(reflection.requiredKnowledgeIds)].slice(0, 12) : [],
      driveSignals: Array.isArray(reflection.driveSignals) ? [...new Set(reflection.driveSignals)].slice(0, 6) : [],
    };
  }
  return baselineReflection(
    profile.ref,
    profile.currentObjective,
    profile.nextAction,
    profile.updatedWeek,
    typeof value === "string" ? value : undefined,
  );
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
    reflection: baselineReflection(`actor:${actor.id}`, actor.shortTermGoal, actor.lastAction, week),
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
    reflection: baselineReflection(`faction:${faction.id}`, faction.posture, faction.lastAction, week),
    updatedWeek: week,
  };
}

export function createAutonomousWorldState(kernel: WorldKernel): AutonomousWorldState {
  const profiles = [
    ...kernel.actors.map((actor) => actorProfile(actor, kernel.currentWeek)),
    ...kernel.factions.map((faction) => factionProfile(faction, kernel.currentWeek)),
  ];
  const residency = selectAutonomousAgentResidency(profiles, kernel, [], MAX_ACTIVE_AUTONOMOUS_AGENTS);
  const active = new Set(residency.activeAgentRefs);
  return {
    version: 1,
    profiles: profiles.map((profile) => ({
      ...profile,
      lastActiveWeek: active.has(profile.ref) ? kernel.currentWeek : Math.max(0, kernel.currentWeek - 1),
    })),
    socialTies: [],
    ...residency,
    lastPlannedWeek: Math.max(0, kernel.currentWeek - 1),
  };
}

function recentParticipationScore(ref: string, kernel: WorldKernel) {
  const [kind, entityId] = ref.split(":", 2);
  const recentWeek = Math.max(0, kernel.currentWeek - 3);
  const eventScore = kernel.events.reduce((score, event) => {
    if (event.week < recentWeek) return score;
    const involved = kind === "actor" ? event.actorIds.includes(entityId) : event.factionIds.includes(entityId);
    return involved || event.witnessRefs?.includes(ref) ? Math.max(score, 80 + event.week) : score;
  }, 0);
  const projectScore = kernel.projects.reduce((score, project) => project.ownerId === entityId && project.status === "active" ? score + 60 + project.updatedWeek : score, 0);
  const locationScore = kind === "actor"
    ? (kernel.locations.find((location) => location.actorIds.includes(entityId))?.updatedWeek ?? 0)
    : Math.max(0, ...kernel.locations.filter((location) => location.factionIds.includes(entityId)).map((location) => location.updatedWeek));
  return eventScore + projectScore + locationScore;
}

function memoryResidencyScore(profile: AutonomousAgentProfile, memory: DynamicMemoryState | undefined, currentWeek: number) {
  if (!memory) return 0;
  const raw = profile.entityId;
  const canonical = profile.ref;
  const involved = (ids: string[]) => ids.includes(raw) || ids.includes(canonical);
  const commitmentUrgency = (memory.commitments ?? []).reduce((score, commitment) => {
    if (commitment.status !== "active" || !involved(commitment.participantIds)) return score;
    const due = commitment.dueWeek === undefined ? 0 : commitment.dueWeek <= currentWeek ? 260 : commitment.dueWeek <= currentWeek + 2 ? 220 : commitment.dueWeek <= currentWeek + 5 ? 100 : 0;
    return Math.max(score, due + commitment.importance * 40);
  }, 0);
  const planUrgency = (memory.plans ?? []).reduce((score, plan) => {
    if ((plan.status !== "active" && plan.status !== "blocked") || !(plan.ownerId === raw || plan.ownerId === canonical || involved(plan.participantIds))) return score;
    const blocked = plan.status === "blocked" ? 170 : 60;
    const due = plan.dueWeek !== undefined && plan.dueWeek <= currentWeek + 2 ? 120 : 0;
    return Math.max(score, blocked + due + plan.importance * 40);
  }, 0);
  const strategicRelationship = (memory.relationshipCauses ?? []).reduce((score, cause) => {
    if (!cause.active || ![cause.fromCharacterId, cause.toCharacterId].includes(raw) && ![cause.fromCharacterId, cause.toCharacterId].includes(canonical)) return score;
    return Math.max(score, Math.min(80, Math.abs(cause.delta) * 2));
  }, 0);
  return commitmentUrgency + planUrgency + strategicRelationship;
}

export function selectAutonomousAgentResidency(
  profiles: AutonomousAgentProfile[],
  kernel: WorldKernel,
  previousActiveRefs: string[] = [],
  limit = MAX_ACTIVE_AUTONOMOUS_AGENTS,
  memory?: DynamicMemoryState,
) {
  const previous = new Set(previousActiveRefs);
  const activeAgentRefs = profiles
    .map((profile) => ({
      ref: profile.ref,
      score: recentParticipationScore(profile.ref, kernel)
        + memoryResidencyScore(profile, memory, kernel.currentWeek)
        + Math.min(160, Math.max(0, kernel.currentWeek - (profile.lastActiveWeek ?? profile.updatedWeek)) * 12)
        + (previous.has(profile.ref) ? 8 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.ref.localeCompare(right.ref))
    .slice(0, Math.max(0, limit))
    .map((item) => item.ref);
  const active = new Set(activeAgentRefs);
  return {
    activeAgentRefs,
    coldAgentRefs: profiles.map((profile) => profile.ref).filter((ref) => !active.has(ref)),
  };
}

export function ensureAutonomousWorldState(state: AutonomousWorldState | undefined, kernel: WorldKernel, memory?: DynamicMemoryState): AutonomousWorldState {
  const current = state?.version === 1 ? state : createAutonomousWorldState(kernel);
  const profileByRef = new Map(current.profiles.map((profile) => [profile.ref, profile]));
  for (const actor of kernel.actors) if (!profileByRef.has(`actor:${actor.id}`)) profileByRef.set(`actor:${actor.id}`, actorProfile(actor, kernel.currentWeek));
  for (const faction of kernel.factions) if (!profileByRef.has(`faction:${faction.id}`)) profileByRef.set(`faction:${faction.id}`, factionProfile(faction, kernel.currentWeek));
  const validRefs = new Set([
    ...kernel.actors.map((actor) => `actor:${actor.id}`),
    ...kernel.factions.map((faction) => `faction:${faction.id}`),
  ]);
  const profiles = [...profileByRef.values()]
    .filter((profile) => validRefs.has(profile.ref))
    .map((profile) => ({ ...profile, reflection: normalizeReflection(profile) }));
  const residency = selectAutonomousAgentResidency(profiles, kernel, current.activeAgentRefs ?? [], MAX_ACTIVE_AUTONOMOUS_AGENTS, memory);
  const active = new Set(residency.activeAgentRefs);
  return {
    version: 1,
    profiles: profiles.map((profile) => active.has(profile.ref) ? { ...profile, lastActiveWeek: Math.max(profile.lastActiveWeek ?? 0, kernel.currentWeek) } : profile),
    socialTies: current.socialTies.filter((tie) => validRefs.has(tie.sourceRef) && validRefs.has(tie.targetRef)),
    ...residency,
    lastPlannedWeek: current.lastPlannedWeek,
  };
}

function candidateActions(profile: AutonomousAgentProfile, kernel: WorldKernel, knownKnowledgeIds: string[], relationships: AutonomousDecisionFrame["relationships"]): AutonomousActionCandidate[] {
  const ownedProject = kernel.projects
    .filter((project) => project.ownerId === profile.entityId && project.status === "active")
    .sort((left, right) => right.progress - left.progress || left.id.localeCompare(right.id))[0];
  const candidates: AutonomousActionCandidate[] = [];
  if (profile.reflection.sourceRefs.length && profile.reflection.recommendedIntent) candidates.push({
    id: `${profile.ref}:reflection:${profile.reflection.createdWeek}`,
    intent: profile.reflection.recommendedIntent,
    reason: profile.reflection.summary,
    requiredKnowledgeIds: profile.reflection.requiredKnowledgeIds.filter((id) => knownKnowledgeIds.includes(id)),
  });
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
  return candidates.slice(0, 4);
}

export function buildAutonomousDecisionFrames(state: AutonomousWorldState, kernel: WorldKernel, week: number, memory?: DynamicMemoryState): AutonomousDecisionFrame[] {
  const current = ensureAutonomousWorldState(state, kernel, memory);
  const activeRefs = new Set(current.activeAgentRefs);
  return current.profiles.filter((profile) => activeRefs.has(profile.ref)).map((profile) => {
    const audience = profile.kind === "actor"
      ? { kind: "actor" as const, holderId: profile.entityId }
      : { kind: "faction" as const, holderId: profile.entityId };
    const view = projectWorldForAudience(kernel, audience);
    const entity = profile.kind === "actor"
      ? kernel.actors.find((actor) => actor.id === profile.entityId)
      : kernel.factions.find((faction) => faction.id === profile.entityId);
    const knownKnowledgeIds = view.knowledge.map((node) => node.id);
    const relationships = current.socialTies.filter((tie) => tie.sourceRef === profile.ref).map(({ targetRef, familiarity, tension, leverage }) => ({ targetRef, familiarity, tension, leverage }));
    const actorIds = new Set(kernel.actors.map((actor) => actor.id));
    const factionIds = new Set(kernel.factions.map((faction) => faction.id));
    const projectIds = new Set(kernel.projects.map((project) => project.id));
    const locationIds = new Set(view.locations.map((location) => location.id));
    const currentLocation = profile.kind === "actor"
      ? kernel.locations.find((location) => location.id === (entity as WorldKernel["actors"][number] | undefined)?.locationId)
      : undefined;
    const visibleEntityRefs = view.events.flatMap((event) => [
      ...event.actorIds.map((id) => `actor:${id}`),
      ...event.factionIds.map((id) => `faction:${id}`),
    ]);
    const subjectRefs = view.knowledge.flatMap((node) => {
      const subject = node.subject.trim();
      if (actorIds.has(subject)) return [`actor:${subject}`];
      if (factionIds.has(subject)) return [`faction:${subject}`];
      if (projectIds.has(subject)) return [`project:${subject}`];
      if (locationIds.has(subject)) return [`location:${subject}`];
      if (subject === "player" || subject === "organization") return [subject];
      if (subject.startsWith("actor:") && actorIds.has(subject.slice("actor:".length))) return [subject];
      if (subject.startsWith("faction:") && factionIds.has(subject.slice("faction:".length))) return [subject];
      if (subject.startsWith("project:") && projectIds.has(subject.slice("project:".length))) return [subject];
      if (subject.startsWith("location:") && locationIds.has(subject.slice("location:".length))) return [subject];
      return [];
    });
    const allowedLocationIds = [...locationIds].sort();
    const allowedTargetRefs = [...new Set([
      profile.ref,
      ...allowedLocationIds.map((id) => `location:${id}`),
      ...relationships.map((relationship) => relationship.targetRef),
      ...visibleEntityRefs,
      ...subjectRefs,
      ...(currentLocation?.actorIds ?? []).map((id) => `actor:${id}`),
      ...(currentLocation?.factionIds ?? []).map((id) => `faction:${id}`),
      ...kernel.projects.filter((project) => project.ownerId === profile.entityId).map((project) => `project:${project.id}`),
    ])].filter((ref) => {
      if (ref === "player" || ref === "organization") return true;
      if (ref.startsWith("actor:")) return actorIds.has(ref.slice("actor:".length));
      if (ref.startsWith("faction:")) return factionIds.has(ref.slice("faction:".length));
      if (ref.startsWith("project:")) return projectIds.has(ref.slice("project:".length));
      if (ref.startsWith("location:")) return locationIds.has(ref.slice("location:".length));
      return false;
    }).sort();
    const memoryAudience = profile.kind === "actor"
      ? { kind: "actor" as const, actorId: profile.entityId }
      : { kind: "faction" as const, factionId: profile.entityId };
    const materialMemory = buildAutonomousMemoryProjection(memory, memoryAudience, week, {
      objective: profile.currentObjective,
      nextAction: profile.nextAction,
      relationshipRefs: relationships.map((relationship) => relationship.targetRef),
    });
    const planningSignature = stableNumber(JSON.stringify({
      ref: profile.ref,
      objective: profile.currentObjective,
      nextAction: profile.nextAction,
      locationId: profile.kind === "actor" ? (entity as WorldKernel["actors"][number] | undefined)?.locationId : undefined,
      resources: profile.kind === "faction" ? (entity as WorldKernel["factions"][number] | undefined)?.resources : undefined,
      reflectionSources: profile.reflection.sourceRefs,
      reflectionIntent: profile.reflection.recommendedIntent,
      observations: view.observations.map((observation) => observation.id).sort(),
      knowledge: knownKnowledgeIds.slice().sort(),
      memory: materialMemory.referenceIds.slice().sort(),
      relationships,
      projects: kernel.projects.filter((project) => project.ownerId === profile.entityId && project.status === "active").map((project) => [project.id, project.stage, project.progress, project.nextMilestone, project.blockers]).sort(),
    })).toString(36);
    return {
      planningWeek: week,
      ref: profile.ref,
      kind: profile.kind,
      displayName: profile.displayName,
      drives: [...new Set([...profile.drives, ...profile.reflection.driveSignals])].slice(0, 8),
      currentObjective: profile.currentObjective,
      nextAction: profile.nextAction,
      ...(profile.kind === "actor" ? { locationId: (entity as WorldKernel["actors"][number] | undefined)?.locationId } : { resources: (entity as WorldKernel["factions"][number] | undefined)?.resources }),
      riskTolerance: profile.riskTolerance,
      planningHorizonWeeks: profile.planningHorizonWeeks,
      reflection: profile.reflection,
      knownObservationIds: view.observations.map((observation) => observation.id),
      knownKnowledgeIds,
      privateMemoryIds: [...new Set([...profile.privateMemoryIds, ...knownKnowledgeIds])].slice(-32),
      planningSignature,
      ...(profile.lastPlanningSignature ? { previousPlanningSignature: profile.lastPlanningSignature } : {}),
      allowedTargetRefs,
      allowedLocationIds,
      relationships,
      candidateActions: candidateActions(profile, kernel, knownKnowledgeIds, relationships),
      freeActionAllowed: true,
    };
  });
}

function buildStructuredReflection(
  profile: AutonomousAgentProfile,
  after: WorldKernel,
  week: number,
  memory?: DynamicMemoryState,
): AutonomousReflection {
  const audience = profile.kind === "actor"
    ? { kind: "actor" as const, holderId: profile.entityId }
    : { kind: "faction" as const, holderId: profile.entityId };
  const memoryAudience = profile.kind === "actor"
    ? { kind: "actor" as const, actorId: profile.entityId }
    : { kind: "faction" as const, factionId: profile.entityId };
  const worldView = projectWorldForAudience(after, audience);
  const visibleEvents = worldView.events.filter((event) => event.week === week);
  const visibleKnowledge = worldView.knowledge.filter((knowledge) => knowledge.acquiredWeek === week);
  const memoryProjection = buildAutonomousMemoryProjection(memory, memoryAudience, week, {
    objective: profile.currentObjective,
    nextAction: profile.nextAction,
  });
  const memoryIds = new Set(memoryProjection.referenceIds);
  const visibleBeliefs = (memory?.beliefs ?? []).filter((belief) => memoryIds.has(belief.id));
  const visibleCommitments = (memory?.commitments ?? []).filter((commitment) => memoryIds.has(commitment.id) && commitment.status === "active");
  const visibleRelationships = (memory?.relationshipCauses ?? []).filter((cause) => memoryIds.has(cause.id) && cause.active);
  const visiblePlans = (memory?.plans ?? []).filter((plan) => memoryIds.has(plan.id) && (plan.status === "active" || plan.status === "blocked"));
  const plan = visiblePlans.sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))[0];
  const knowledge = visibleKnowledge[0];
  const belief = visibleBeliefs.sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))[0];
  const commitment = visibleCommitments.sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))[0];
  const relationship = visibleRelationships.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.id.localeCompare(right.id))[0];
  const event = visibleEvents[0];
  const conclusions = [
    ...(plan ? [`计划“${plan.title}”仍要求：${plan.currentStep}`] : []),
    ...(knowledge ? [`新认知“${knowledge.statement}”需要纳入下一步判断`] : []),
    ...(belief ? [`当前信念：“${belief.claim}”`] : []),
    ...(commitment ? [`仍受承诺约束：“${commitment.summary}”`] : []),
    ...(relationship ? [`关系依据：“${relationship.summary}”`] : []),
    ...(event ? [`本周亲历：“${event.title}”`] : []),
  ].slice(0, 8);
  const recommendedObjective = plan?.objective || profile.currentObjective;
  const recommendedIntent = plan?.currentStep
    || (knowledge ? `核验或利用关于${knowledge.subject}的新认知` : "")
    || (relationship ? `根据既有关系调整对${relationship.fromCharacterId === profile.entityId ? relationship.toCharacterId : relationship.fromCharacterId}的行动` : "")
    || profile.nextAction;
  const summary = conclusions.length
    ? conclusions.join("；").slice(0, 720)
    : `没有新的主体可见依据足以改变“${profile.currentObjective}”；维持既定方向。`;
  return {
    version: 1,
    createdWeek: week,
    audienceRef: profile.ref,
    summary,
    conclusions,
    sourceRefs: [...new Set([
      ...visibleEvents.map((item) => item.id),
      ...visibleKnowledge.map((item) => item.id),
      ...memoryProjection.referenceIds,
    ])].slice(0, 32),
    sourceEventIds: [...new Set([
      ...visibleEvents.map((item) => item.id),
      ...visibleKnowledge.flatMap((item) => item.sourceEventId ? [item.sourceEventId] : []),
      ...memoryProjection.sourceEventIds,
    ])].slice(0, 24),
    recommendedObjective,
    recommendedIntent,
    requiredKnowledgeIds: visibleKnowledge.map((item) => item.id).slice(0, 12),
    driveSignals: [...new Set([
      ...(plan ? [plan.objective] : []),
      ...(commitment ? [commitment.summary] : []),
    ])].slice(0, 6),
    provenance: "deterministic-visible-state",
  };
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
  memory?: DynamicMemoryState,
  planningSignatures?: ReadonlyMap<string, string>,
): AutonomousWorldState {
  const current = ensureAutonomousWorldState(state, after, memory);
  const profiles = current.profiles.map((profile) => {
    const entity = profile.kind === "actor"
      ? after.actors.find((actor) => actor.id === profile.entityId)
      : after.factions.find((faction) => faction.id === profile.entityId);
    const holderRef = profile.ref;
    const receivedKnowledgeIds = after.knowledge
      .filter((node) => node.acquiredWeek === week && (node.visibility === "public" || node.holderRefs?.includes(holderRef) || node.holderIds.includes(profile.entityId)))
      .map((node) => node.id);
    const witnessedEvents = after.events.filter((event) => event.week === week && (event.visibility === "public" || event.witnessRefs?.includes(holderRef)));
    const currentObjective = profile.kind === "actor"
      ? (entity as WorldKernel["actors"][number] | undefined)?.shortTermGoal ?? profile.currentObjective
      : (entity as WorldKernel["factions"][number] | undefined)?.posture ?? profile.currentObjective;
    const nextAction = profile.kind === "actor"
      ? (entity as WorldKernel["actors"][number] | undefined)?.lastAction ?? profile.nextAction
      : (entity as WorldKernel["factions"][number] | undefined)?.lastAction ?? profile.nextAction;
    const reflection = buildStructuredReflection(profile, after, week, memory);
    return {
      ...profile,
      drives: [...new Set([...profile.drives, ...reflection.driveSignals])].slice(0, 8),
      currentObjective,
      nextAction,
      privateMemoryIds: [...new Set([...profile.privateMemoryIds, ...receivedKnowledgeIds, ...witnessedEvents.map((event) => event.id)])].slice(-32),
      reflection,
      lastPlanningSignature: planningSignatures?.get(profile.ref) ?? profile.lastPlanningSignature,
      updatedWeek: week,
    };
  });
  const residency = selectAutonomousAgentResidency(profiles, after, current.activeAgentRefs, MAX_ACTIVE_AUTONOMOUS_AGENTS, memory);
  const active = new Set(residency.activeAgentRefs);
  return {
    version: 1,
    profiles: profiles.map((profile) => active.has(profile.ref) ? { ...profile, lastActiveWeek: Math.max(profile.lastActiveWeek ?? 0, after.currentWeek) } : profile),
    socialTies: updateSocialTies(current.socialTies, after, week),
    ...residency,
    lastPlannedWeek: week,
  };
}
