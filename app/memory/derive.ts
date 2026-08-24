// 确定性记忆派生：种子校验、去重、替代、世界状态派生与本地结算派生。
import { MEMORY_VERSION } from "./config.ts";
import type {
  AudienceMemoryState,
  CharacterBelief,
  Commitment,
  MemoryAudience,
  MemoryDeliveryReceipt,
  DynamicMemoryState,
  MemoryChange,
  MemoryEvent,
  MemoryRegistry,
  MemorySeed,
  RelationshipCause,
  ActivePlan,
} from "./types.ts";

const RECEIPT_LIMIT = 500;

export function beliefPropositionKey(belief: {
  characterId: string;
  claimType: string;
  subjectId: string;
  propositionKey?: string;
}): string {
  return (
    belief.propositionKey ??
    `legacy:${belief.characterId}:${belief.claimType}:${belief.subjectId}`
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function knownCharacter(registry: MemoryRegistry | undefined, id: string | undefined) {
  if (!id) return true;
  if (id === "player") return true;
  if (!registry) return true;
  if (registry.characterIds.has(id) || registry.organizationIds.has(id)) return true;
  return id.startsWith("faction:") && registry.organizationIds.has(id.slice("faction:".length));
}

function validateSeed(seed: MemorySeed, registry?: MemoryRegistry): string | null {
  if (seed.kind === "event") {
    if (!seed.sourceEventId || !seed.summary) return "event-missing-fields";
    if (seed.week < 0) return "event-invalid-week";
    if ((seed.importance ?? 0.5) < 0 || (seed.importance ?? 0.5) > 1) return "event-importance-range";
    if ((seed.emotionalWeight ?? 0.4) < 0 || (seed.emotionalWeight ?? 0.4) > 1) return "event-emotional-range";
    if (![...seed.participantIds, ...(seed.observerIds ?? [])].every((id) => knownCharacter(registry, id))) {
      return "event-unknown-character";
    }
  } else if (seed.kind === "belief") {
    if (!seed.characterId || !seed.claim) return "belief-missing-fields";
    if (!knownCharacter(registry, seed.characterId)) return "belief-unknown-character";
    if (seed.confidence < 0 || seed.confidence > 1) return "belief-confidence-range";
    if (!seed.learnedFrom?.sourceId) return "belief-missing-source";
  } else if (seed.kind === "commitment") {
    if (!seed.id || !seed.summary || !seed.sourceEventId) return "commitment-missing-fields";
    if (!seed.participantIds.every((id) => knownCharacter(registry, id))) {
      return "commitment-unknown-character";
    }
  } else if (seed.kind === "relationship") {
    if (!seed.sourceEventId || !seed.summary) return "relationship-missing-fields";
    if (!knownCharacter(registry, seed.fromCharacterId) || !knownCharacter(registry, seed.toCharacterId)) {
      return "relationship-unknown-character";
    }
    if (seed.delta < -100 || seed.delta > 100) return "relationship-delta-range";
  } else if (seed.kind === "plan") {
    if (!seed.id || !seed.ownerId || !seed.title) return "plan-missing-fields";
    if (!knownCharacter(registry, seed.ownerId)) return "plan-unknown-owner";
  }
  return null;
}

export function deriveMemory(
  state: DynamicMemoryState,
  seeds: MemorySeed[],
  registry?: MemoryRegistry
): { state: DynamicMemoryState; changes: MemoryChange[] } {
  const events = [...state.events];
  let beliefs = [...state.beliefs];
  let commitments = [...state.commitments];
  const relationshipCauses = [...state.relationshipCauses];
  let plans = [...state.plans];
  const changes: MemoryChange[] = [];

  const eventBySource = new Map(events.map((event) => [event.sourceEventId, event]));
  const beliefByKey = new Map(
    beliefs.map((belief) => [`${belief.characterId}|${beliefPropositionKey(belief)}`, belief])
  );
  const beliefById = new Map(beliefs.map((belief) => [belief.id, belief]));
  const commitmentById = new Map(commitments.map((item) => [item.id, item]));
  const relationshipKey = new Set(
    relationshipCauses.map((item) => `${item.sourceEventId}|${item.fromCharacterId}|${item.toCharacterId}|${item.dimension}`)
  );
  const planById = new Map(plans.map((item) => [item.id, item]));

  for (const seed of seeds) {
    const invalid = validateSeed(seed, registry);
    if (invalid) {
      changes.push({ kind: "rejected", reason: invalid });
      continue;
    }
    if (seed.kind === "event") {
      if (eventBySource.has(seed.sourceEventId)) continue;
      const event: MemoryEvent = {
        id: `mem:event:${seed.sourceEventId}`,
        sourceEventId: seed.sourceEventId,
        week: seed.week,
        timestamp: seed.timestamp,
        type: seed.type,
        summary: seed.summary.slice(0, 240),
        participantIds: [...new Set(seed.participantIds)],
        observerIds: [...new Set(seed.observerIds ?? [])],
        locationId: seed.locationId,
        organizationIds: [...new Set(seed.organizationIds ?? [])],
        importance: clamp(seed.importance ?? 0.5, 0, 1),
        emotionalWeight: clamp(seed.emotionalWeight ?? 0.4, 0, 1),
        truthStatus: "world-fact",
        status: seed.status ?? "active",
        causeEventIds: seed.causeEventIds ?? [],
        consequenceEventIds: seed.consequenceEventIds ?? [],
        supersedes: seed.supersedes ?? [],
        createdBy: seed.createdBy ?? "deterministic-rule",
        tags: seed.tags ?? [],
      };
      events.push(event);
      eventBySource.set(event.sourceEventId, event);
      changes.push({ kind: "event", id: event.id, action: "created" });
    } else if (seed.kind === "belief") {
      const propositionKey = seed.propositionKey ?? `legacy:${seed.characterId}:${seed.claimType}:${seed.subjectId}`;
      const key = `${seed.characterId}|${propositionKey}`;
      const existing = beliefByKey.get(key);
      const id = `mem:belief:${seed.characterId}|${propositionKey}:${seed.validFromWeek}`;
      if (beliefById.has(id)) continue; // 重放/重试幂等
      if (existing && existing.claim === seed.claim && existing.truthStatus === seed.truthStatus) {
        continue;
      }
      const belief: CharacterBelief = {
        id,
        characterId: seed.characterId,
        propositionKey,
        subjectId: seed.subjectId,
        claimType: seed.claimType,
        claim: seed.claim.slice(0, 240),
        confidence: clamp(seed.confidence, 0, 1),
        truthStatus: seed.truthStatus,
        learnedFrom: seed.learnedFrom,
        validFromWeek: seed.validFromWeek,
        secrecy: seed.secrecy ?? "restricted",
        active: true,
        supersededBy: existing ? id : undefined,
        contradictedBy: seed.contradictedBy ?? [],
        importance: clamp(seed.importance ?? 0.5, 0, 1),
        emotionalWeight: clamp(seed.emotionalWeight ?? 0.4, 0, 1),
        recallCount: 0,
      };
      if (existing) {
        beliefs = beliefs.map((item) =>
          item.id === existing.id ? { ...item, active: false, supersededBy: id } : item
        );
        changes.push({ kind: "belief", id: existing.id, action: "superseded" });
      }
      beliefs.push(belief);
      beliefByKey.set(key, belief);
      changes.push({ kind: "belief", id, action: "created" });
    } else if (seed.kind === "commitment") {
      const existing = commitmentById.get(seed.id);
      const commitment: Commitment = {
        id: seed.id,
        type: seed.type,
        debtorId: seed.debtorId,
        creditorId: seed.creditorId,
        participantIds: [...new Set(seed.participantIds)],
        summary: seed.summary.slice(0, 240),
        createdWeek: seed.createdWeek,
        dueWeek: seed.dueWeek,
        status: seed.status ?? "active",
        sourceEventId: seed.sourceEventId,
        resolvedByEventId: seed.resolvedByEventId,
        importance: clamp(seed.importance ?? 0.6, 0, 1),
        secrecy: seed.secrecy ?? "restricted",
      };
      if (!existing) {
        commitments.push(commitment);
        commitmentById.set(commitment.id, commitment);
        changes.push({ kind: "commitment", id: commitment.id, action: "created" });
      } else if (
        existing.status !== commitment.status ||
        existing.dueWeek !== commitment.dueWeek
      ) {
        commitments = commitments.map((item) => (item.id === commitment.id ? commitment : item));
        commitmentById.set(commitment.id, commitment);
        changes.push({
          kind: "commitment",
          id: commitment.id,
          action: commitment.status === "fulfilled" || commitment.status === "broken" ? "resolved" : "updated",
        });
      }
    } else if (seed.kind === "relationship") {
      const key = `${seed.sourceEventId}|${seed.fromCharacterId}|${seed.toCharacterId}|${seed.dimension}`;
      if (relationshipKey.has(key)) continue;
      const cause: RelationshipCause = {
        id: `mem:rel:${key}`,
        sourceEventId: seed.sourceEventId,
        fromCharacterId: seed.fromCharacterId,
        toCharacterId: seed.toCharacterId,
        dimension: seed.dimension,
        delta: clamp(seed.delta, -100, 100),
        summary: seed.summary.slice(0, 240),
        createdWeek: seed.createdWeek,
        active: seed.active ?? true,
        decayPolicy: seed.decayPolicy ?? "normal",
      };
      relationshipCauses.push(cause);
      relationshipKey.add(key);
      changes.push({ kind: "relationship", id: cause.id, action: "created" });
    } else if (seed.kind === "plan") {
      const plan: ActivePlan = {
        id: seed.id,
        sourcePlanId: seed.sourcePlanId,
        ownerId: seed.ownerId,
        participantIds: [...new Set(seed.participantIds)],
        title: seed.title.slice(0, 120),
        objective: seed.objective.slice(0, 240),
        currentStep: seed.currentStep.slice(0, 160),
        createdWeek: seed.createdWeek,
        dueWeek: seed.dueWeek,
        status: seed.status,
        dependencyIds: seed.dependencyIds ?? [],
        blockerIds: seed.blockerIds ?? [],
        sourceEventIds: seed.sourceEventIds ?? [],
        secrecy: seed.secrecy ?? "restricted",
        importance: clamp(seed.importance ?? 0.6, 0, 1),
      };
      const existing = planById.get(plan.id);
      if (!existing) {
        plans.push(plan);
        changes.push({ kind: "plan", id: plan.id, action: "created" });
      } else {
        plans = plans.map((item) => (item.id === plan.id ? { ...item, ...plan } : item));
        changes.push({ kind: "plan", id: plan.id, action: "updated" });
      }
    }
  }

  return {
    state: {
      version: MEMORY_VERSION,
      events,
      beliefs,
      commitments,
      relationshipCauses,
      plans,
      audienceStates: state.audienceStates ?? [],
      receipts: state.receipts ?? [],
      receiptLedger: state.receiptLedger ?? { recalledByAudience: {}, recalledWeeks: {} },
    },
    changes,
  };
}

type ActivatingAudienceKind = "actor" | "faction" | "player";

export function audienceKey(kind: ActivatingAudienceKind, actorId?: string, factionId?: string): string {
  if (kind === "actor") return `actor:${actorId ?? ""}`;
  if (kind === "faction") return `faction:${factionId ?? ""}`;
  return "player";
}

function getAudienceState(
  state: DynamicMemoryState,
  memoryId: string,
  kind: ActivatingAudienceKind,
  audienceId?: string
): AudienceMemoryState | undefined {
  return (state.audienceStates ?? []).find(
    (item) =>
      item.memoryId === memoryId &&
      item.audienceKind === kind &&
      (kind === "actor" ? item.actorId === audienceId : kind === "faction" ? item.factionId === audienceId : true)
  );
}

function upsertAudienceState(
  state: DynamicMemoryState,
  memoryId: string,
  kind: ActivatingAudienceKind,
  audienceId: string | undefined,
  week: number,
  update: (item: AudienceMemoryState) => AudienceMemoryState
): DynamicMemoryState {
  const existing = getAudienceState(state, memoryId, kind, audienceId);
  if (existing) {
    return {
      ...state,
      audienceStates: state.audienceStates.map((item) =>
        item === existing ? update(item) : item
      ),
    };
  }
  return {
    ...state,
    audienceStates: [
      ...state.audienceStates,
      update({
        memoryId,
        audienceKind: kind,
        actorId: kind === "actor" ? audienceId : undefined,
        factionId: kind === "faction" ? audienceId : undefined,
        presentationCount: 0,
        recallCount: 0,
        updatedAtWeek: week,
      }),
    ],
  };
}

export type MemoryReceiptDescriptor = {
  actionId: string;
  modelCallId: string;
  stage: string;
  audience: MemoryAudience;
  memoryIds: string[];
  week: number;
};

function receiptId(descriptor: MemoryReceiptDescriptor, kind: "delivered" | "presented" | "recalled"): string {
  return [
    descriptor.actionId,
    descriptor.modelCallId,
    descriptor.stage,
    kind,
    descriptor.audience.kind,
    descriptor.audience.actorId ?? "",
    descriptor.audience.factionId ?? "",
    [...descriptor.memoryIds].sort().join(","),
  ].join("|");
}

function appendReceipt(
  state: DynamicMemoryState,
  descriptor: MemoryReceiptDescriptor,
  kind: "delivered" | "presented" | "recalled"
): DynamicMemoryState {
  const receipts = state.receipts ?? [];
  const id = receiptId(descriptor, kind);
  if (receipts.some((receipt) => receipt.id === id)) return state; // 幂等
  const receipt: MemoryDeliveryReceipt = {
    id,
    actionId: descriptor.actionId,
    modelCallId: descriptor.modelCallId,
    stage: descriptor.stage,
    kind,
    audience: { ...descriptor.audience },
    memoryIds: [...descriptor.memoryIds],
    week: descriptor.week,
    accepted: true,
    createdAt: new Date().toISOString(),
  };
  const nextReceipts = [...receipts, receipt].slice(-RECEIPT_LIMIT);
  if (kind === "presented") {
    if (descriptor.audience.kind !== "actor" && descriptor.audience.kind !== "faction" && descriptor.audience.kind !== "player") {
      return state; // narrator/world-system 不产生角色展示状态
    }
    let next = { ...state, receipts: nextReceipts };
    for (const memoryId of descriptor.memoryIds) {
      next = upsertAudienceState(
        next,
        memoryId,
        descriptor.audience.kind,
        descriptor.audience.kind === "actor" ? descriptor.audience.actorId : descriptor.audience.kind === "faction" ? descriptor.audience.factionId : undefined,
        descriptor.week,
        (item) => ({
          ...item,
          lastPresentedWeek: Math.max(item.lastPresentedWeek ?? -1, descriptor.week),
          presentationCount: item.presentationCount + 1,
          updatedAtWeek: descriptor.week,
        })
      );
    }
    return next;
  }
  if (kind === "recalled") {
    if (
      (descriptor.audience.kind !== "actor" && descriptor.audience.kind !== "faction" && descriptor.audience.kind !== "player") ||
      !descriptor.audience.affectsActivation
    ) {
      return state;
    }
    const ledger = state.receiptLedger ?? { recalledByAudience: {}, recalledWeeks: {} };
    const key = audienceKey(descriptor.audience.kind, descriptor.audience.actorId, descriptor.audience.factionId);
    const byMemory = { ...(ledger.recalledByAudience ?? {}) };
    const memoryWeeks = { ...(byMemory[key] ?? {}) };
    const pending = descriptor.memoryIds.filter((memoryId) => {
      const weeks = memoryWeeks[memoryId] ?? [];
      return !weeks.includes(descriptor.week);
    });
    if (!pending.length) return state; // 同受众+记忆+周已计过：完全幂等
    let next: DynamicMemoryState = {
      ...state,
      receipts: nextReceipts,
      receiptLedger: {
        ...ledger,
        recalledByAudience: byMemory,
      },
    };
    for (const memoryId of pending) {
      memoryWeeks[memoryId] = [...(memoryWeeks[memoryId] ?? []), descriptor.week].sort((a, b) => a - b);
      next = upsertAudienceState(
        next,
        memoryId,
        descriptor.audience.kind,
        descriptor.audience.kind === "actor" ? descriptor.audience.actorId : descriptor.audience.kind === "faction" ? descriptor.audience.factionId : undefined,
        descriptor.week,
        (item) => ({
          ...item,
          lastRecalledWeek: descriptor.week,
          recallCount: item.recallCount + 1,
          updatedAtWeek: descriptor.week,
        })
      );
    }
    byMemory[key] = memoryWeeks;
    return { ...next, receiptLedger: { ...ledger, recalledByAudience: byMemory } };
  }
  return {
    ...state,
    receipts: nextReceipts,
  };
}

export function submitMemoryDelivery(
  state: DynamicMemoryState,
  descriptor: MemoryReceiptDescriptor
): DynamicMemoryState {
  return appendReceipt(state, descriptor, "delivered");
}

// 正式呈现：audience.affectsActivation 时更新 lastPresentedWeek，不增加 recallCount。
export function markMemoryPresented(
  state: DynamicMemoryState,
  descriptor: MemoryReceiptDescriptor
): DynamicMemoryState {
  if (descriptor.audience.kind !== "actor" && descriptor.audience.kind !== "faction" && descriptor.audience.kind !== "player") {
    return state; // narrator/world-system 不产生角色展示回执
  }
  return appendReceipt(state, descriptor, "presented");
}

// 正式回忆：仅 actor 且 affectsActivation 时计数，按周幂等。
export function markMemoryRecalled(
  state: DynamicMemoryState,
  descriptor: MemoryReceiptDescriptor
): DynamicMemoryState {
  if (
    (descriptor.audience.kind !== "actor" && descriptor.audience.kind !== "faction" && descriptor.audience.kind !== "player") ||
    !descriptor.audience.affectsActivation
  ) {
    return state;
  }
  return appendReceipt(state, descriptor, "recalled");
}

// 旧存档迁移：把共享信念上的 legacy recall/presented 字段迁移为该角色受众状态（保守，不复制给其他角色）。
export function ensureAudienceStates(state: DynamicMemoryState): DynamicMemoryState {
  let next = { ...state, audienceStates: state.audienceStates ?? [] };
  for (const belief of state.beliefs) {
    const hasLegacy =
      belief.recallCount > 0 ||
      belief.lastRecalledWeek !== undefined ||
      belief.lastPresentedWeek !== undefined;
    if (!hasLegacy) continue;
    if (getAudienceState(next, belief.id, "actor", belief.characterId)) continue;
    next = upsertAudienceState(next, belief.id, "actor", belief.characterId, belief.validFromWeek, (item) => ({
      ...item,
      lastPresentedWeek: item.lastPresentedWeek ?? belief.lastPresentedWeek,
      presentationCount: belief.lastPresentedWeek !== undefined ? 1 : 0,
      lastRecalledWeek: item.lastRecalledWeek ?? belief.lastRecalledWeek,
      recallCount: belief.recallCount,
      updatedAtWeek: Math.max(item.updatedAtWeek, belief.validFromWeek),
    }));
  }
  return next;
}

// 从世界内核派生：新事件 → MemoryEvent；新知识节点 → CharacterBelief；项目 → ActivePlan。
export function deriveMemoryFromWorldState(
  memory: DynamicMemoryState,
  worldKernel: {
    events: { id: string; week: number; title: string; detail: string; locationId?: string; actorIds: string[]; factionIds: string[]; visibility: string }[];
    knowledge: { id: string; subject: string; statement: string; truth: string; visibility: string; holderIds: string[]; holderRefs?: string[]; sourceEventId?: string; acquiredWeek: number }[];
    projects: { id: string; ownerId: string; title: string; stage: string; progress: number; secrecy: number; nextMilestone: string; blockers: string[]; status: string; updatedWeek: number }[];
    observations: { id: string; week: number; eventId: string; channel: string; text: string; holderIds: string[]; holderRefs?: string[]; visibility: string; perceivedRefs?: string[]; acquisitionKind?: "witness" | "communication" | "investigation" | "propagation" }[];
    knowledgeGrants?: { knowledgeId: string; holderRef: string; kind: "witness" | "communication" | "investigation" | "propagation"; sourceObservationId: string }[];
    factions?: { id: string }[];
  },
  week: number
): DynamicMemoryState {
  const seeds: MemorySeed[] = [];
  for (const event of worldKernel.events) {
    if (event.week !== week) continue;
    seeds.push({
      kind: "event",
      sourceEventId: event.id,
      week,
      type: "world-event",
      summary: `${event.title}：${event.detail}`.slice(0, 240),
      // The full event is a world-system memory only. Actor/player memories are
      // derived from their concrete observations below, never from authority
      // participant lists or the omniscient event detail.
      participantIds: [],
      observerIds: [],
      locationId: event.locationId,
      organizationIds: [],
      importance: event.visibility === "world" ? 0.65 : 0.5,
      emotionalWeight: 0.4,
      tags: [event.visibility, "world-event"],
    });
  }
  for (const observation of worldKernel.observations) {
    if (observation.week !== week) continue;
    const holders = [...new Set([
      ...observation.holderIds,
      ...(observation.holderRefs ?? []).flatMap((reference) => reference === "player"
        ? ["player"]
        : reference.startsWith("actor:")
          ? [reference.slice("actor:".length)]
          : reference.startsWith("faction:")
            ? [reference]
            : []),
    ])];
    const sourceType = observation.acquisitionKind === "witness" ? "observed"
      : observation.acquisitionKind === "communication" ? "told"
        : observation.acquisitionKind === "investigation" ? "deduced"
          : "report";
    const confidence = observation.acquisitionKind === "witness" ? 0.78
      : observation.acquisitionKind === "investigation" ? 0.7
        : observation.acquisitionKind === "communication" ? 0.6 : 0.45;
    for (const holder of holders) seeds.push({
      kind: "belief",
      characterId: holder,
      propositionKey: `observation:${observation.id}`,
      subjectId: observation.eventId,
      claimType: "world-observation",
      claim: observation.text,
      confidence,
      truthStatus: "uncertain",
      learnedFrom: { type: sourceType, sourceId: observation.id },
      validFromWeek: observation.week,
      secrecy: observation.visibility === "public" ? "public" : "restricted",
      importance: 0.55,
      emotionalWeight: observation.acquisitionKind === "witness" ? 0.5 : 0.3,
    } as MemorySeed);
  }
  for (const node of worldKernel.knowledge) {
    if (node.acquiredWeek !== week) continue;
    const secrecy = node.visibility === "public" ? "public" : node.visibility === "world" ? "secret" : "restricted";
    const beliefHolders = [...new Set([
      ...node.holderIds,
      ...(node.holderRefs ?? []).flatMap((reference) => reference === "player"
        ? ["player"]
        : reference.startsWith("actor:")
          ? [reference.slice("actor:".length)]
          : reference.startsWith("faction:")
            ? [reference]
            : []),
    ])];
    for (const holder of beliefHolders) {
      const holderRef = holder === "player" || holder.startsWith("faction:") ? holder : `actor:${holder}`;
      const grant = (worldKernel.knowledgeGrants ?? []).find((item) => item.knowledgeId === node.id && item.holderRef === holderRef);
      const confidence = grant?.kind === "witness" ? 0.78
        : grant?.kind === "investigation" ? 0.7
          : grant?.kind === "communication" ? 0.6
            : grant?.kind === "propagation" ? 0.45 : 0.4;
      const learnedFrom = grant?.kind === "witness" ? "observed"
        : grant?.kind === "communication" ? "told"
          : grant?.kind === "investigation" ? "deduced" : "report";
      seeds.push({
        kind: "belief",
        characterId: holder,
        subjectId: node.subject,
        claimType: "world-knowledge",
        claim: node.statement,
        confidence,
        truthStatus: "uncertain",
        learnedFrom: { type: learnedFrom, sourceId: grant?.sourceObservationId ?? node.sourceEventId ?? node.id },
        validFromWeek: node.acquiredWeek,
        secrecy,
        importance: 0.55,
        emotionalWeight: 0.35,
      } as MemorySeed);
    }
  }
  const factionIds = new Set((worldKernel.factions ?? []).map((faction) => faction.id));
  for (const project of worldKernel.projects) {
    if (project.updatedWeek !== week) continue;
    const ownerId = factionIds.has(project.ownerId) ? `faction:${project.ownerId}` : project.ownerId;
    seeds.push({
      kind: "plan",
      id: `mem:plan:${project.id}`,
      sourcePlanId: project.id,
      ownerId,
      participantIds: ownerId.startsWith("faction:") ? [ownerId] : [],
      title: project.title,
      objective: project.nextMilestone,
      currentStep: project.stage,
      createdWeek: week,
      status:
        project.status === "completed"
          ? "completed"
          : project.status === "failed"
            ? "failed"
            : project.status === "paused"
              ? "blocked"
              : "active",
      blockerIds: project.blockers,
      secrecy: project.secrecy >= 75 ? "secret" : project.secrecy >= 50 ? "restricted" : "public",
      importance: 0.6,
    } as MemorySeed);
  }
  return deriveMemory(memory, seeds).state;
}

// 从本地结算派生：行动契约 → Commitment；成员信任差值 → RelationshipCause。
export function deriveLocalMemory(
  memory: DynamicMemoryState,
  previousMembers: { id: string; trust?: number; loyalty?: number }[],
  nextMembers: { id: string; trust?: number; loyalty?: number }[],
  results: { id: string; outcome: string; contract: { id: string; rawIntent: string; leaderId: string; memberIds: string[] } }[],
  week: number
): DynamicMemoryState {
  const seeds: MemorySeed[] = [];
  for (const result of results) {
    const contract = result.contract;
    const participants = [...new Set([contract.leaderId, ...contract.memberIds])];
    const fulfilled = result.outcome === "成功" || result.outcome === "部分成功";
    seeds.push({
      kind: "commitment",
      id: `mem:commit:${contract.id}`,
      type: "agreement",
      debtorId: contract.leaderId === "player" ? "player" : contract.leaderId,
      participantIds: participants,
      summary: contract.rawIntent,
      createdWeek: week,
      dueWeek: week + 1,
      status: fulfilled ? "fulfilled" : "broken",
      sourceEventId: `contract:${contract.id}`,
      resolvedByEventId: `action:${result.id}`,
      importance: 0.6,
      secrecy: "restricted",
    });
  }
  const before = new Map(previousMembers.map((member) => [member.id, member.trust ?? member.loyalty ?? 0]));
  for (const member of nextMembers) {
    const previous = before.get(member.id) ?? 0;
    const current = member.trust ?? member.loyalty ?? 0;
    const delta = current - previous;
    if (Math.abs(delta) < 1) continue;
    seeds.push({
      kind: "relationship",
      sourceEventId: `week:${week}:member:${member.id}`,
      fromCharacterId: "player",
      toCharacterId: member.id,
      dimension: delta > 0 ? "trust" : "suspicion",
      delta,
      summary: delta > 0 ? "本周行动提升了该成员对组织的信任" : "本周行动使该成员信任下降或疑虑增加",
      createdWeek: week,
      decayPolicy: "normal",
    });
  }
  return deriveMemory(memory, seeds).state;
}
