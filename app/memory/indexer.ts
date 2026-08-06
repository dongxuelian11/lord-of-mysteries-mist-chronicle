// 有界内存索引：从 DynamicMemoryState 构建，读档后重建，不复制进存档。
import type {
  ActivePlan,
  AudienceMemoryState,
  CharacterBelief,
  Commitment,
  DynamicMemoryState,
  MemoryEvent,
  RelationshipCause,
} from "./types.ts";
import { beliefPropositionKey } from "./derive.ts";

export type MemoryIndexes = {
  eventsById: Map<string, MemoryEvent>;
  eventsByCharacter: Map<string, string[]>;
  eventsByLocation: Map<string, string[]>;
  eventsByOrganization: Map<string, string[]>;
  eventsByType: Map<string, string[]>;
  eventsByWeek: Map<number, string[]>;
  eventsBySource: Map<string, string>;
  beliefsById: Map<string, CharacterBelief>;
  beliefsByCharacter: Map<string, string[]>;
  beliefsByKey: Map<string, string>;
  commitmentsById: Map<string, Commitment>;
  commitmentsByCharacter: Map<string, string[]>;
  commitmentsBySource: Map<string, string>;
  relationshipsById: Map<string, RelationshipCause>;
  relationshipsByPair: Map<string, string[]>;
  relationshipsByCharacter: Map<string, string[]>;
  plansById: Map<string, ActivePlan>;
  plansByOwner: Map<string, string[]>;
  plansByCharacter: Map<string, string[]>;
  audienceByKey: Map<string, Map<string, AudienceMemoryState>>;
};

export function buildMemoryIndexes(state: DynamicMemoryState): MemoryIndexes {
  const index: MemoryIndexes = {
    eventsById: new Map(),
    eventsByCharacter: new Map(),
    eventsByLocation: new Map(),
    eventsByOrganization: new Map(),
    eventsByType: new Map(),
    eventsByWeek: new Map(),
    eventsBySource: new Map(),
    beliefsById: new Map(),
    beliefsByCharacter: new Map(),
    beliefsByKey: new Map(),
    commitmentsById: new Map(),
    commitmentsByCharacter: new Map(),
    commitmentsBySource: new Map(),
    relationshipsById: new Map(),
    relationshipsByPair: new Map(),
    relationshipsByCharacter: new Map(),
    plansById: new Map(),
    plansByOwner: new Map(),
    plansByCharacter: new Map(),
    audienceByKey: new Map(),
  };
  const push = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(id);
    map.set(key, list);
  };
  for (const event of state.events) {
    index.eventsById.set(event.id, event);
    index.eventsBySource.set(event.sourceEventId, event.id);
    for (const id of [...event.participantIds, ...event.observerIds]) push(index.eventsByCharacter, id, event.id);
    if (event.locationId) push(index.eventsByLocation, event.locationId, event.id);
    for (const id of event.organizationIds) push(index.eventsByOrganization, id, event.id);
    push(index.eventsByType, event.type, event.id);
    push(index.eventsByWeek, event.week, event.id);
  }
  for (const belief of state.beliefs) {
    index.beliefsById.set(belief.id, belief);
    push(index.beliefsByCharacter, belief.characterId, belief.id);
    index.beliefsByKey.set(`${belief.characterId}|${beliefPropositionKey(belief)}`, belief.id);
  }
  for (const commitment of state.commitments) {
    index.commitmentsById.set(commitment.id, commitment);
    for (const id of commitment.participantIds) push(index.commitmentsByCharacter, id, commitment.id);
    index.commitmentsBySource.set(`${commitment.sourceEventId}|${commitment.type}`, commitment.id);
  }
  for (const cause of state.relationshipCauses) {
    index.relationshipsById.set(cause.id, cause);
    push(index.relationshipsByPair, `${cause.fromCharacterId}|${cause.toCharacterId}`, cause.id);
    push(index.relationshipsByCharacter, cause.fromCharacterId, cause.id);
    push(index.relationshipsByCharacter, cause.toCharacterId, cause.id);
  }
  for (const plan of state.plans) {
    index.plansById.set(plan.id, plan);
    push(index.plansByOwner, plan.ownerId, plan.id);
    for (const id of plan.participantIds) push(index.plansByCharacter, id, plan.id);
  }
  for (const audienceState of state.audienceStates ?? []) {
    const key = `${audienceState.audienceKind}:${audienceState.actorId ?? ""}`;
    const byMemory = index.audienceByKey.get(key) ?? new Map();
    byMemory.set(audienceState.memoryId, audienceState);
    index.audienceByKey.set(key, byMemory);
  }
  return index;
}

export function emptyMemoryState(): DynamicMemoryState {
  return {
    version: 1,
    events: [],
    beliefs: [],
    commitments: [],
    relationshipCauses: [],
    plans: [],
    audienceStates: [],
    receipts: [],
    receiptLedger: { recalledByAudience: {}, recalledWeeks: {} },
  };
}
