export const WEEK_RESOLUTION_PHASES = [
  "governance",
  "player-actions",
  "economy",
  "development",
  "map-control",
  "relationships",
  "consequences",
  "autonomous-actors",
  "narrative-ready",
] as const;

export type WeekResolutionPhase = (typeof WEEK_RESOLUTION_PHASES)[number];

export type WorldLedgerEventKind =
  | "ledger-initialized"
  | "projection-patched"
  | "phase-completed"
  | "action-proposed"
  | "action-reviewed"
  | "action-progressed"
  | "action-resolved"
  | "world-event-recorded"
  | "knowledge-delivered"
  | "compensation-applied"
  | "week-committed";

export type LedgerVisibility = "world" | "public" | "player" | "actors" | "factions";

export type WorldLedgerAudience = {
  visibility: LedgerVisibility;
  holderRefs: string[];
};

export type LedgerActionRecord = {
  id: string;
  status: "proposed" | "accepted" | "deferred" | "partially-completed" | "interrupted" | "awaiting-authorization" | "escalation-required" | "rejected" | "resolved";
  week: number;
  intent?: string;
  reasons: string[];
  outcome?: string;
  sourceEventIds: string[];
  originWeek?: number;
  attemptOrdinal?: number;
  progress?: number;
  consumed?: { money: number; manpower: number; extraordinaryMaterials: number; spirituality: number };
  nextEligibleWeek?: number | null;
  lastAttemptId?: string;
  consequenceEventIds?: string[];
};

export type LedgerCompletedPhase = {
  week: number;
  phase: WeekResolutionPhase;
  eventId: string;
};

export type WorldLedgerEvent = {
  schemaVersion: 1;
  branchId: string;
  id: string;
  sequence: number;
  prevHash: string | null;
  hash: string;
  week: number;
  phase: WeekResolutionPhase;
  kind: WorldLedgerEventKind;
  summary: string;
  actorIds: string[];
  factionIds: string[];
  witnessRefs: string[];
  causeEventIds: string[];
  audience: WorldLedgerAudience;
  payload: Record<string, unknown>;
};

export type WorldLedgerProjection = {
  week: number;
  date: string;
  resources: {
    money: number;
    secrecy: number;
    stability: number;
    influence: number;
    spirituality: number;
    manpower: number;
    extraordinaryMaterials: number;
  };
  members: Array<{ id: string; status: string; sequence?: number; fatigue: number; trust: number }>;
  factions: Array<{ id: string; trust: number; suspicion: number; planProgress: number }>;
  strategicPoints: Array<{ id: string; control: number; controller?: string }>;
  worldEventIds: string[];
  knowledgeIds: string[];
  autonomousAgents: Array<{ ref: string; objective: string; nextAction: string; privateMemoryIds: string[] }>;
  socialTies: Array<{ id: string; familiarity: number; tension: number; leverage: number }>;
  factionStrategy: {
    lastResolvedWeek: number;
    profiles: Array<{ factionId: string; resourcePool: number; objective: string }>;
    diplomacy: Array<{ id: string; pressure: number; stance: string }>;
    outcomeIds: string[];
  };
  actions?: LedgerActionRecord[];
  completedPhases?: LedgerCompletedPhase[];
};

export type WorldLedgerSnapshot = {
  id: string;
  week: number;
  afterSequence: number;
  checksum: string;
  projection: WorldLedgerProjection;
};

export type WorldLedgerSnapshotArchive = {
  archivedCount: number;
  throughWeek: number;
  throughSequence: number;
  lastChecksum: string;
};

export type WorldLedgerEventSegment = {
  id: string;
  fromSequence: number;
  throughSequence: number;
  throughWeek: number;
  eventCount: number;
  firstPrevHash: string | null;
  lastHash: string;
  checksum: string;
};

export type WorldLedgerEventArchive = {
  archivedCount: number;
  throughWeek: number;
  throughSequence: number;
  lastHash: string;
  projectionChecksum: string;
  checkpoint: WorldLedgerSnapshot;
  segments: WorldLedgerEventSegment[];
};

export const WORLD_LEDGER_SNAPSHOT_INTERVAL_WEEKS = 4;
export const WORLD_LEDGER_SNAPSHOT_RETENTION = 6;
export const WORLD_LEDGER_EVENT_RETENTION = 2048;
export const WORLD_LEDGER_SEGMENT_RETENTION = 16;

export type WorldLedger = {
  version: 2;
  branchId: string;
  parentBranchId?: string;
  forkedAtSequence?: number;
  forkedFromChecksum?: string;
  nextSequence: number;
  events: WorldLedgerEvent[];
  snapshots: WorldLedgerSnapshot[];
  snapshotArchive?: WorldLedgerSnapshotArchive;
  eventArchive?: WorldLedgerEventArchive;
};

export type LegacyWorldLedger = {
  version: 1;
  nextSequence: number;
  events: Array<Omit<WorldLedgerEvent, "schemaVersion" | "branchId" | "prevHash" | "hash">>;
  snapshots: WorldLedgerSnapshot[];
};

export type LedgerStateSource = {
  week: number;
  date: string;
  money: number;
  secrecy: number;
  stability: number;
  influence: number;
  spirituality: number;
  members: Array<{ id: string; status: string; sequence?: number; fatigue: number; loyalty: number; trust?: number }>;
  factions: Array<{ id: string; trust: number; suspicion: number; planProgress: number }>;
  worldKernel: { events: Array<{ id: string }>; knowledge: Array<{ id: string }> };
  worldAgents: {
    profiles: Array<{ ref: string; currentObjective: string; nextAction: string; privateMemoryIds: string[] }>;
    socialTies: Array<{ id: string; familiarity: number; tension: number; leverage: number }>;
  };
  factionStrategy: {
    lastResolvedWeek: number;
    profiles: Array<{ factionId: string; resourcePool: number; objective: string }>;
    diplomacy: Array<{ id: string; pressure: number; stance: string }>;
    outcomes: Array<{ orderId: string }>;
  };
  management: {
    resources: { manpower: number; extraordinaryMaterials: number };
    map: {
      playerFactionId: string;
      districts: Array<{ blocks: Array<{ strategicPoints: Array<{ id: string; influenceByFaction: Record<string, number>; controllerId?: string }> }> }>;
    };
  };
};

export type LedgerEventInput = Omit<WorldLedgerEvent, "schemaVersion" | "branchId" | "id" | "sequence" | "prevHash" | "hash"> & { id?: string };

type EntityPatch<T> = { upsert?: T[]; removeIds?: string[] };

export type WorldLedgerProjectionPatch = {
  week?: number;
  date?: string;
  resources?: Partial<WorldLedgerProjection["resources"]>;
  members?: EntityPatch<WorldLedgerProjection["members"][number]>;
  factions?: EntityPatch<WorldLedgerProjection["factions"][number]>;
  strategicPoints?: EntityPatch<WorldLedgerProjection["strategicPoints"][number]>;
  worldEventIds?: { add?: string[]; remove?: string[] };
  knowledgeIds?: { add?: string[]; remove?: string[] };
  autonomousAgents?: EntityPatch<WorldLedgerProjection["autonomousAgents"][number]>;
  socialTies?: EntityPatch<WorldLedgerProjection["socialTies"][number]>;
  factionStrategy?: WorldLedgerProjection["factionStrategy"];
};

export type ReplayWorldLedgerOptions = {
  throughSequence?: number;
  throughWeek?: number;
  useSnapshots?: boolean;
};

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

export function ledgerChecksum(value: unknown) {
  const text = stableSerialize(value);
  let output = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    output ^= text.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return (output >>> 0).toString(16).padStart(8, "0");
}

function copyValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copyProjection(projection: WorldLedgerProjection): WorldLedgerProjection {
  return copyValue(projection);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function projectLedgerState(source: LedgerStateSource): WorldLedgerProjection {
  return {
    week: source.week,
    date: source.date,
    resources: {
      money: source.money,
      secrecy: source.secrecy,
      stability: source.stability,
      influence: source.influence,
      spirituality: source.spirituality,
      manpower: source.management.resources.manpower,
      extraordinaryMaterials: source.management.resources.extraordinaryMaterials,
    },
    members: source.members.map((member) => ({
      id: member.id,
      status: member.status,
      ...(member.sequence === undefined ? {} : { sequence: member.sequence }),
      fatigue: member.fatigue,
      trust: member.trust ?? member.loyalty,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    factions: source.factions.map(({ id, trust, suspicion, planProgress }) => ({ id, trust, suspicion, planProgress })).sort((left, right) => left.id.localeCompare(right.id)),
    strategicPoints: source.management.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints.map((point) => ({
      id: point.id,
      control: point.influenceByFaction[source.management.map.playerFactionId] ?? 0,
      ...(point.controllerId === undefined ? {} : { controller: point.controllerId }),
    })))).sort((left, right) => left.id.localeCompare(right.id)),
    worldEventIds: source.worldKernel.events.map((event) => event.id),
    knowledgeIds: source.worldKernel.knowledge.map((node) => node.id),
    autonomousAgents: source.worldAgents.profiles.map((profile) => ({ ref: profile.ref, objective: profile.currentObjective, nextAction: profile.nextAction, privateMemoryIds: [...profile.privateMemoryIds] })).sort((left, right) => left.ref.localeCompare(right.ref)),
    socialTies: source.worldAgents.socialTies.map(({ id, familiarity, tension, leverage }) => ({ id, familiarity, tension, leverage })).sort((left, right) => left.id.localeCompare(right.id)),
    factionStrategy: {
      lastResolvedWeek: source.factionStrategy.lastResolvedWeek,
      profiles: source.factionStrategy.profiles.map(({ factionId, resourcePool, objective }) => ({ factionId, resourcePool, objective })).sort((left, right) => left.factionId.localeCompare(right.factionId)),
      diplomacy: source.factionStrategy.diplomacy.map(({ id, pressure, stance }) => ({ id, pressure, stance })).sort((left, right) => left.id.localeCompare(right.id)),
      outcomeIds: source.factionStrategy.outcomes.map((outcome) => outcome.orderId),
    },
  };
}

function eventHash(event: Omit<WorldLedgerEvent, "hash">) {
  return ledgerChecksum(event);
}

function emptyLedger(branchId: string, metadata: Partial<WorldLedger> = {}): WorldLedger {
  return { version: 2, branchId, nextSequence: 1, events: [], snapshots: [], ...metadata };
}

function snapshotFor(ledger: WorldLedger, projection: WorldLedgerProjection, afterSequence: number): WorldLedgerSnapshot {
  return {
    id: `ledger-snapshot-${ledger.branchId}-${projection.week}-${afterSequence}`,
    week: projection.week,
    afterSequence,
    checksum: ledgerChecksum(projection),
    projection: copyProjection(projection),
  };
}

export function compactWorldLedgerSnapshots(ledger: WorldLedger): WorldLedger {
  const ordered = ledger.snapshots.slice().sort((left, right) => left.afterSequence - right.afterSequence);
  if (ordered.length <= WORLD_LEDGER_SNAPSHOT_RETENTION) return ordered === ledger.snapshots ? ledger : { ...ledger, snapshots: ordered };
  const removed = ordered.slice(0, -WORLD_LEDGER_SNAPSHOT_RETENTION);
  const retained = ordered.slice(-WORLD_LEDGER_SNAPSHOT_RETENTION);
  const boundary = removed.at(-1)!;
  return {
    ...ledger,
    snapshots: retained,
    snapshotArchive: {
      archivedCount: (ledger.snapshotArchive?.archivedCount ?? 0) + removed.length,
      throughWeek: Math.max(ledger.snapshotArchive?.throughWeek ?? 0, boundary.week),
      throughSequence: Math.max(ledger.snapshotArchive?.throughSequence ?? 0, boundary.afterSequence),
      lastChecksum: boundary.checksum,
    },
  };
}

export function compactWorldLedgerEvents(ledger: WorldLedger): WorldLedger {
  if (ledger.events.length <= WORLD_LEDGER_EVENT_RETENTION) return ledger;
  const cutoffSequence = ledger.events[Math.max(0, ledger.events.length - WORLD_LEDGER_EVENT_RETENTION)].sequence;
  const checkpoint = ledger.snapshots
    .filter((snapshot) => snapshot.afterSequence >= cutoffSequence && snapshot.afterSequence > (ledger.eventArchive?.throughSequence ?? 0))
    .sort((left, right) => left.afterSequence - right.afterSequence)[0];
  if (!checkpoint) return ledger;
  const removed = ledger.events.filter((event) => event.sequence <= checkpoint.afterSequence);
  if (!removed.length) return ledger;
  const retained = ledger.events.filter((event) => event.sequence > checkpoint.afterSequence);
  const last = removed.at(-1)!;
  const segment: WorldLedgerEventSegment = {
    id: `ledger-segment-${ledger.branchId}-${removed[0].sequence}-${last.sequence}`,
    fromSequence: removed[0].sequence,
    throughSequence: last.sequence,
    throughWeek: last.week,
    eventCount: removed.length,
    firstPrevHash: removed[0].prevHash,
    lastHash: last.hash,
    checksum: ledgerChecksum(removed.map((event) => [event.sequence, event.hash])),
  };
  return {
    ...ledger,
    events: retained,
    eventArchive: {
      archivedCount: (ledger.eventArchive?.archivedCount ?? 0) + removed.length,
      throughWeek: checkpoint.week,
      throughSequence: checkpoint.afterSequence,
      lastHash: last.hash,
      projectionChecksum: checkpoint.checksum,
      checkpoint: copyValue(checkpoint),
      segments: [...(ledger.eventArchive?.segments ?? []), segment].slice(-WORLD_LEDGER_SEGMENT_RETENTION),
    },
  };
}

function createLedgerFromProjection(
  projection: WorldLedgerProjection,
  branchId: string,
  metadata: Partial<Pick<WorldLedger, "parentBranchId" | "forkedAtSequence" | "forkedFromChecksum">> = {},
): WorldLedger {
  let ledger = emptyLedger(branchId, metadata);
  ledger = appendWorldLedgerEvents(ledger, [{
    id: `ledger-initialized:${branchId}`,
    week: projection.week,
    phase: "governance",
    kind: "ledger-initialized",
    summary: "账本分支初始状态已登记",
    actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [],
    audience: { visibility: "world", holderRefs: [] },
    payload: { projection: copyProjection(projection) },
  }]);
  const afterSequence = ledger.nextSequence - 1;
  return { ...ledger, snapshots: [snapshotFor(ledger, projection, afterSequence)] };
}

export function createWorldLedger(initial?: LedgerStateSource): WorldLedger {
  return initial ? createLedgerFromProjection(projectLedgerState(initial), "main") : emptyLedger("main");
}

export function appendWorldLedgerEvents(ledger: WorldLedger, inputs: LedgerEventInput[]): WorldLedger {
  if (!inputs.length) return ledger;
  if (ledger.version !== 2) throw new Error("必须先把 V1 世界账本迁移为 V2 才能追加事件");
  let sequence = ledger.nextSequence;
  let prevHash = ledger.events.at(-1)?.hash ?? ledger.eventArchive?.lastHash ?? null;
  const existingIds = new Set(ledger.events.map((event) => event.id));
  const events: WorldLedgerEvent[] = [];
  for (const input of inputs) {
    const id = input.id ?? `ledger-${input.week}-${sequence}-${input.kind}`;
    if (existingIds.has(id)) throw new Error(`世界账本事件 ID 重复：${id}`);
    const withoutHash: Omit<WorldLedgerEvent, "hash"> = {
      schemaVersion: 1,
      branchId: ledger.branchId,
      ...input,
      id,
      sequence,
      prevHash,
      actorIds: unique(input.actorIds),
      factionIds: unique(input.factionIds),
      witnessRefs: unique(input.witnessRefs),
      causeEventIds: unique(input.causeEventIds),
      audience: { ...input.audience, holderRefs: unique(input.audience.holderRefs) },
      payload: copyValue(input.payload),
    };
    const event: WorldLedgerEvent = { ...withoutHash, hash: eventHash(withoutHash) };
    events.push(event);
    existingIds.add(id);
    prevHash = event.hash;
    sequence += 1;
  }
  return { ...ledger, nextSequence: sequence, events: [...ledger.events, ...events] };
}

export function recordWorldLedgerPhase(ledger: WorldLedger, week: number, phase: WeekResolutionPhase, summary: string, payload: Record<string, unknown> = {}): WorldLedger {
  return appendWorldLedgerEvents(ledger, [{
    week, phase, kind: "phase-completed", summary,
    actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [],
    audience: { visibility: "world", holderRefs: [] }, payload,
  }]);
}

function diffEntities<T>(before: T[], after: T[], key: (item: T) => string): EntityPatch<T> | undefined {
  const beforeById = new Map(before.map((item) => [key(item), item]));
  const afterById = new Map(after.map((item) => [key(item), item]));
  const upsert = after.filter((item) => ledgerChecksum(beforeById.get(key(item))) !== ledgerChecksum(item)).map(copyValue);
  const removeIds = before.filter((item) => !afterById.has(key(item))).map(key);
  return upsert.length || removeIds.length ? { ...(upsert.length ? { upsert } : {}), ...(removeIds.length ? { removeIds } : {}) } : undefined;
}

function diffIds(before: string[], after: string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const add = after.filter((id) => !beforeSet.has(id));
  const remove = before.filter((id) => !afterSet.has(id));
  return add.length || remove.length ? { ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) } : undefined;
}

export function createWorldLedgerProjectionPatch(before: WorldLedgerProjection, after: WorldLedgerProjection): WorldLedgerProjectionPatch {
  const resources = Object.fromEntries(Object.entries(after.resources).filter(([key, value]) => before.resources[key as keyof typeof before.resources] !== value)) as Partial<WorldLedgerProjection["resources"]>;
  const patch: WorldLedgerProjectionPatch = {
    ...(before.week !== after.week ? { week: after.week } : {}),
    ...(before.date !== after.date ? { date: after.date } : {}),
    ...(Object.keys(resources).length ? { resources } : {}),
    ...(diffEntities(before.members, after.members, (item) => item.id) ? { members: diffEntities(before.members, after.members, (item) => item.id) } : {}),
    ...(diffEntities(before.factions, after.factions, (item) => item.id) ? { factions: diffEntities(before.factions, after.factions, (item) => item.id) } : {}),
    ...(diffEntities(before.strategicPoints, after.strategicPoints, (item) => item.id) ? { strategicPoints: diffEntities(before.strategicPoints, after.strategicPoints, (item) => item.id) } : {}),
    ...(diffIds(before.worldEventIds, after.worldEventIds) ? { worldEventIds: diffIds(before.worldEventIds, after.worldEventIds) } : {}),
    ...(diffIds(before.knowledgeIds, after.knowledgeIds) ? { knowledgeIds: diffIds(before.knowledgeIds, after.knowledgeIds) } : {}),
    ...(diffEntities(before.autonomousAgents, after.autonomousAgents, (item) => item.ref) ? { autonomousAgents: diffEntities(before.autonomousAgents, after.autonomousAgents, (item) => item.ref) } : {}),
    ...(diffEntities(before.socialTies, after.socialTies, (item) => item.id) ? { socialTies: diffEntities(before.socialTies, after.socialTies, (item) => item.id) } : {}),
    ...(ledgerChecksum(before.factionStrategy) !== ledgerChecksum(after.factionStrategy) ? { factionStrategy: copyValue(after.factionStrategy) } : {}),
  };
  return patch;
}

function applyEntities<T>(before: T[], patch: EntityPatch<T> | undefined, key: (item: T) => string): T[] {
  if (!patch) return before;
  const removed = new Set(patch.removeIds ?? []);
  const byId = new Map(before.filter((item) => !removed.has(key(item))).map((item) => [key(item), copyValue(item)]));
  for (const item of patch.upsert ?? []) byId.set(key(item), copyValue(item));
  return [...byId.values()].sort((left, right) => key(left).localeCompare(key(right)));
}

function applyIds(before: string[], patch?: { add?: string[]; remove?: string[] }) {
  if (!patch) return before;
  const removed = new Set(patch.remove ?? []);
  return unique([...before.filter((id) => !removed.has(id)), ...(patch.add ?? [])]);
}

export function applyWorldLedgerProjectionPatch(projection: WorldLedgerProjection, patch: WorldLedgerProjectionPatch): WorldLedgerProjection {
  return {
    ...projection,
    ...(patch.week === undefined ? {} : { week: patch.week }),
    ...(patch.date === undefined ? {} : { date: patch.date }),
    resources: { ...projection.resources, ...(patch.resources ?? {}) },
    members: applyEntities(projection.members, patch.members, (item) => item.id),
    factions: applyEntities(projection.factions, patch.factions, (item) => item.id),
    strategicPoints: applyEntities(projection.strategicPoints, patch.strategicPoints, (item) => item.id),
    worldEventIds: applyIds(projection.worldEventIds, patch.worldEventIds),
    knowledgeIds: applyIds(projection.knowledgeIds, patch.knowledgeIds),
    autonomousAgents: applyEntities(projection.autonomousAgents, patch.autonomousAgents, (item) => item.ref),
    socialTies: applyEntities(projection.socialTies, patch.socialTies, (item) => item.id),
    factionStrategy: patch.factionStrategy ? copyValue(patch.factionStrategy) : projection.factionStrategy,
  };
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function actionIdFor(event: WorldLedgerEvent) {
  return typeof event.payload.actionId === "string" ? event.payload.actionId : event.id;
}

function updateAction(projection: WorldLedgerProjection, event: WorldLedgerEvent): WorldLedgerProjection {
  const id = actionIdFor(event);
  const actions = [...(projection.actions ?? [])];
  const existing = actions.find((action) => action.id === id);
  const base: LedgerActionRecord = existing ?? { id, status: "proposed", week: event.week, reasons: [], sourceEventIds: [] };
  const attemptId = typeof event.payload.attemptId === "string" ? event.payload.attemptId : undefined;
  if (event.kind === "action-progressed" && attemptId && base.lastAttemptId === attemptId) return projection;
  const progressedStatus = typeof event.payload.toStatus === "string" && ["deferred", "partially-completed", "interrupted", "awaiting-authorization", "rejected", "resolved"].includes(event.payload.toStatus)
    ? event.payload.toStatus as LedgerActionRecord["status"]
    : "accepted";
  const status = event.kind === "action-proposed"
    ? "proposed"
    : event.kind === "action-reviewed"
      ? (event.payload.status === "rejected" ? "rejected" : event.payload.status === "deferred" ? "deferred" : event.payload.status === "escalation-required" ? "escalation-required" : "accepted")
      : event.kind === "action-progressed"
        ? progressedStatus
      : event.payload.executionStatus === "rejected"
        ? "rejected"
        : event.payload.executionStatus === "escalation-required"
          ? "escalation-required"
          : "resolved";
  const next: LedgerActionRecord = {
    ...base,
    status,
    week: event.week,
    ...(typeof event.payload.intent === "string" ? { intent: event.payload.intent } : {}),
    ...(Array.isArray(event.payload.reasons) ? { reasons: event.payload.reasons.map(String) } : {}),
    ...(event.kind === "action-resolved" && typeof event.payload.outcome === "string" ? { outcome: event.payload.outcome } : {}),
    ...(Number.isFinite(event.payload.originWeek) ? { originWeek: Number(event.payload.originWeek) } : {}),
    ...(Number.isFinite(event.payload.attemptOrdinal) ? { attemptOrdinal: Number(event.payload.attemptOrdinal) } : {}),
    ...(Number.isFinite(event.payload.progressAfter) ? { progress: Number(event.payload.progressAfter) } : {}),
    ...(recordOf(event.payload.consumedAfter) ? { consumed: event.payload.consumedAfter as LedgerActionRecord["consumed"] } : {}),
    ...(event.payload.nextEligibleWeek === null || Number.isFinite(event.payload.nextEligibleWeek) ? { nextEligibleWeek: event.payload.nextEligibleWeek === null ? null : Number(event.payload.nextEligibleWeek) } : {}),
    ...(attemptId ? { lastAttemptId: attemptId } : {}),
    ...(Array.isArray(event.payload.consequenceEventIds) ? { consequenceEventIds: event.payload.consequenceEventIds.map(String) } : {}),
    sourceEventIds: unique([...base.sourceEventIds, event.id]),
  };
  const index = actions.findIndex((action) => action.id === id);
  if (index >= 0) actions[index] = next;
  else actions.push(next);
  return { ...projection, actions: actions.sort((left, right) => left.id.localeCompare(right.id)) };
}

export function reduceWorldLedgerEvent(projection: WorldLedgerProjection | null, event: WorldLedgerEvent): WorldLedgerProjection | null {
  if (event.kind === "ledger-initialized") {
    const initial = event.payload.projection;
    return initial && typeof initial === "object" && !Array.isArray(initial) ? copyProjection(initial as WorldLedgerProjection) : projection;
  }
  if (!projection) return null;
  if (event.kind === "projection-patched") {
    const patch = recordOf(event.payload.patch);
    return patch ? applyWorldLedgerProjectionPatch(projection, patch as WorldLedgerProjectionPatch) : projection;
  }
  if (event.kind === "compensation-applied") {
    const patch = recordOf(event.payload.inversePatch);
    return patch ? applyWorldLedgerProjectionPatch(projection, patch as WorldLedgerProjectionPatch) : projection;
  }
  if (event.kind === "action-proposed" || event.kind === "action-reviewed" || event.kind === "action-progressed" || event.kind === "action-resolved") return updateAction(projection, event);
  if (event.kind === "world-event-recorded") {
    const id = typeof event.payload.worldEventId === "string" ? event.payload.worldEventId : event.id;
    return { ...projection, worldEventIds: unique([...projection.worldEventIds, id]) };
  }
  if (event.kind === "knowledge-delivered") {
    const id = typeof event.payload.knowledgeId === "string" ? event.payload.knowledgeId : event.id;
    return { ...projection, knowledgeIds: unique([...projection.knowledgeIds, id]) };
  }
  if (event.kind === "phase-completed") {
    const completedPhases = [...(projection.completedPhases ?? [])];
    if (!completedPhases.some((item) => item.eventId === event.id)) completedPhases.push({ week: event.week, phase: event.phase, eventId: event.id });
    return { ...projection, completedPhases };
  }
  if (event.kind === "week-committed") {
    return { ...projection, week: event.week, date: typeof event.payload.date === "string" ? event.payload.date : projection.date };
  }
  return projection;
}

function normalizeReplayOptions(value: number | ReplayWorldLedgerOptions | undefined): Required<ReplayWorldLedgerOptions> {
  if (typeof value === "number") return { throughSequence: value, throughWeek: Number.POSITIVE_INFINITY, useSnapshots: true };
  return {
    throughSequence: value?.throughSequence ?? Number.POSITIVE_INFINITY,
    throughWeek: value?.throughWeek ?? Number.POSITIVE_INFINITY,
    useSnapshots: value?.useSnapshots ?? true,
  };
}

export function replayWorldLedger(ledger: WorldLedger, through?: number | ReplayWorldLedgerOptions): WorldLedgerProjection | null {
  const options = normalizeReplayOptions(through);
  const archiveCheckpoint = ledger.eventArchive?.checkpoint;
  if (archiveCheckpoint && (options.throughSequence < archiveCheckpoint.afterSequence || options.throughWeek < archiveCheckpoint.week)) return null;
  const eligibleEvents = ledger.events
    .filter((event) => event.sequence <= options.throughSequence && event.week <= options.throughWeek)
    .sort((left, right) => left.sequence - right.sequence);
  const maximumSequence = eligibleEvents.at(-1)?.sequence ?? archiveCheckpoint?.afterSequence ?? 0;
  const snapshot = options.useSnapshots
    ? ledger.snapshots
        .filter((item) => item.afterSequence <= maximumSequence && item.afterSequence <= options.throughSequence && item.week <= options.throughWeek && ledgerChecksum(item.projection) === item.checksum)
        .sort((left, right) => right.afterSequence - left.afterSequence)[0]
    : undefined;
  const base = snapshot ?? archiveCheckpoint;
  let projection = base ? copyProjection(base.projection) : null;
  const start = base?.afterSequence ?? 0;
  for (const event of eligibleEvents) if (event.sequence > start) projection = reduceWorldLedgerEvent(projection, event);
  return projection;
}

function addSnapshotAtHead(ledger: WorldLedger): WorldLedger {
  const projection = replayWorldLedger(ledger, { useSnapshots: false });
  if (!projection) return ledger;
  const afterSequence = ledger.nextSequence - 1;
  const latest = ledger.snapshots.slice().sort((left, right) => right.afterSequence - left.afterSequence)[0];
  const withSnapshot = latest && projection.week - latest.week < WORLD_LEDGER_SNAPSHOT_INTERVAL_WEEKS
    ? ledger
    : { ...ledger, snapshots: [...ledger.snapshots, snapshotFor(ledger, projection, afterSequence)] };
  return compactWorldLedgerEvents(compactWorldLedgerSnapshots(withSnapshot));
}

export function commitWorldLedgerWeek(ledger: WorldLedger, source: LedgerStateSource): WorldLedger {
  const target = projectLedgerState(source);
  let next = ledger.version === 2 ? ledger : migrateWorldLedger(ledger as unknown as LegacyWorldLedger, source);
  let current = replayWorldLedger(next, { useSnapshots: false });
  if (!current) {
    next = createLedgerFromProjection(target, next.branchId, next);
    current = replayWorldLedger(next, { useSnapshots: false });
  } else {
    const patch = createWorldLedgerProjectionPatch(current, target);
    if (Object.keys(patch).length) {
      next = appendWorldLedgerEvents(next, [{
        week: target.week, phase: "narrative-ready", kind: "projection-patched", summary: `第${target.week}周权威状态增量`,
        actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [], audience: { visibility: "world", holderRefs: [] }, payload: { patch },
      }]);
      current = replayWorldLedger(next, { useSnapshots: false });
    }
  }
  const committedProjection = { ...current!, week: target.week, date: target.date };
  next = appendWorldLedgerEvents(next, [{
    week: target.week, phase: "narrative-ready", kind: "week-committed", summary: `第${target.week}周权威事实已经提交`,
    actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [], audience: { visibility: "world", holderRefs: [] },
    payload: { date: target.date, checksum: ledgerChecksum(committedProjection) },
  }]);
  return addSnapshotAtHead(next);
}

export function appendWorldLedgerCompensation(ledger: WorldLedger, input: {
  week: number;
  phase: WeekResolutionPhase;
  summary: string;
  compensatesEventIds: string[];
  inversePatch: WorldLedgerProjectionPatch;
}): WorldLedger {
  const known = new Set(ledger.events.map((event) => event.id));
  const missing = input.compensatesEventIds.find((id) => !known.has(id));
  if (missing) throw new Error(`补偿事件引用了不存在的历史事件：${missing}`);
  return appendWorldLedgerEvents(ledger, [{
    week: input.week,
    phase: input.phase,
    kind: "compensation-applied",
    summary: input.summary,
    actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: input.compensatesEventIds,
    audience: { visibility: "world", holderRefs: [] },
    payload: { compensatesEventIds: unique(input.compensatesEventIds), inversePatch: copyValue(input.inversePatch) },
  }]);
}

function projectionFromLegacyCommit(event: LegacyWorldLedger["events"][number]): WorldLedgerProjection | null {
  if (event.kind !== "week-committed") return null;
  const projection = event.payload.projection;
  return projection && typeof projection === "object" && !Array.isArray(projection) ? copyProjection(projection as WorldLedgerProjection) : null;
}

export function migrateWorldLedger(value: WorldLedger | LegacyWorldLedger, fallback?: LedgerStateSource): WorldLedger {
  if (value.version === 2) return compactWorldLedgerEvents(compactWorldLedgerSnapshots(value));
  const legacyEvents = [...(value.events ?? [])].sort((left, right) => left.sequence - right.sequence);
  const initial = value.snapshots?.find((snapshot) => snapshot.afterSequence === 0)?.projection
    ?? (fallback ? projectLedgerState(fallback) : undefined)
    ?? legacyEvents.map(projectionFromLegacyCommit).find((projection): projection is WorldLedgerProjection => Boolean(projection));
  let ledger = initial ? createLedgerFromProjection(initial, "main") : emptyLedger("main");
  for (const event of legacyEvents) {
    if (event.kind === "week-committed") {
      const target = projectionFromLegacyCommit(event);
      const current = replayWorldLedger(ledger, { useSnapshots: false });
      if (target && current) {
        const patch = createWorldLedgerProjectionPatch(current, target);
        if (Object.keys(patch).length) ledger = appendWorldLedgerEvents(ledger, [{
          week: event.week, phase: event.phase, kind: "projection-patched", summary: `迁移旧账本第${event.week}周状态增量`,
          actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [], audience: { visibility: "world", holderRefs: [] }, payload: { patch, migratedFromVersion: 1 },
        }]);
      } else if (target && !current) {
        ledger = createLedgerFromProjection(target, "main");
      }
      const projection = replayWorldLedger(ledger, { useSnapshots: false });
      ledger = appendWorldLedgerEvents(ledger, [{
        id: event.id,
        week: event.week, phase: event.phase, kind: "week-committed", summary: event.summary,
        actorIds: event.actorIds, factionIds: event.factionIds, witnessRefs: event.witnessRefs, causeEventIds: event.causeEventIds.filter((id) => ledger.events.some((item) => item.id === id)),
        audience: event.audience, payload: { date: target?.date ?? projection?.date ?? "", checksum: ledgerChecksum(target ?? projection), migratedFromVersion: 1 },
      }]);
      ledger = addSnapshotAtHead(ledger);
      continue;
    }
    const kind = event.kind as WorldLedgerEventKind;
    if (kind === "ledger-initialized" || kind === "projection-patched" || kind === "compensation-applied") continue;
    ledger = appendWorldLedgerEvents(ledger, [{
      id: event.id, week: event.week, phase: event.phase, kind, summary: event.summary,
      actorIds: event.actorIds, factionIds: event.factionIds, witnessRefs: event.witnessRefs,
      causeEventIds: event.causeEventIds.filter((id) => ledger.events.some((item) => item.id === id)),
      audience: event.audience, payload: event.payload,
    }]);
  }
  if (!ledger.snapshots.length) ledger = addSnapshotAtHead(ledger);
  return ledger;
}

export function createWorldLedgerBranch(parent: WorldLedger, atSequence: number, branchId?: string): WorldLedger {
  const verified = verifyWorldLedger(parent);
  if (!verified.ok) throw new Error(`父账本未通过完整性校验：${verified.issues.join("；")}`);
  const projection = replayWorldLedger(parent, { throughSequence: atSequence, useSnapshots: false });
  if (!projection) throw new Error(`无法在 sequence ${atSequence} 创建分支：该位置没有可重放状态`);
  const checksum = ledgerChecksum(projection);
  const id = branchId?.trim() || `branch:${parent.branchId}:${atSequence}:${checksum}`;
  if (id === parent.branchId) throw new Error("新分支 ID 必须与父分支不同");
  return createLedgerFromProjection(projection, id, { parentBranchId: parent.branchId, forkedAtSequence: atSequence, forkedFromChecksum: checksum });
}

export function runWorldLedgerCounterfactual(parent: WorldLedger, atSequence: number, events: LedgerEventInput[], branchId?: string) {
  const ledger = appendWorldLedgerEvents(createWorldLedgerBranch(parent, atSequence, branchId), events);
  const projection = replayWorldLedger(ledger, { useSnapshots: false });
  if (!projection) throw new Error("反事实事件没有产生可重放投影");
  return { ledger, projection };
}

export function verifyWorldLedger(ledger: WorldLedger) {
  const issues: string[] = [];
  let previousSequence = ledger.eventArchive?.throughSequence ?? 0;
  let previousHash: string | null = ledger.eventArchive?.lastHash ?? null;
  let replayed = ledger.eventArchive ? copyProjection(ledger.eventArchive.checkpoint.projection) : null;
  const ids = new Set<string>();
  const retainedEventSequences = new Map(ledger.events.map((event) => [event.id, event.sequence]));
  if (ledger.eventArchive) {
    const archive = ledger.eventArchive;
    if (archive.checkpoint.afterSequence !== archive.throughSequence || archive.checkpoint.week !== archive.throughWeek) issues.push("事件归档检查点边界不一致");
    if (ledgerChecksum(archive.checkpoint.projection) !== archive.projectionChecksum || archive.checkpoint.checksum !== archive.projectionChecksum) issues.push("事件归档检查点校验失败");
    if (archive.segments.length > WORLD_LEDGER_SEGMENT_RETENTION) issues.push("事件分段元数据超过保留上限");
    for (let index = 0; index < archive.segments.length; index += 1) {
      const segment = archive.segments[index];
      if (segment.eventCount < 1 || segment.fromSequence > segment.throughSequence || !segment.lastHash || !segment.checksum) issues.push(`事件分段${segment.id}元数据无效`);
      if (index > 0 && segment.fromSequence <= archive.segments[index - 1].throughSequence) issues.push(`事件分段${segment.id}与前一分段重叠`);
    }
  }
  for (const event of ledger.events) {
    if (event.schemaVersion !== 1) issues.push(`事件${event.id}使用未知 schemaVersion`);
    if (event.branchId !== ledger.branchId) issues.push(`事件${event.id}属于错误分支`);
    if (ids.has(event.id)) issues.push(`重复事件ID：${event.id}`);
    if (event.sequence <= previousSequence) issues.push(`事件序号未严格递增：${event.sequence}`);
    if (event.prevHash !== previousHash) issues.push(`事件${event.id}的 prevHash 断链`);
    const { hash, ...withoutHash } = event;
    if (eventHash(withoutHash) !== hash) issues.push(`事件${event.id}哈希校验失败`);
    if (event.causeEventIds.some((id) => !ids.has(id) && (!ledger.eventArchive || retainedEventSequences.has(id)))) issues.push(`事件${event.id}引用了尚不存在的原因`);
    ids.add(event.id);
    previousSequence = event.sequence;
    previousHash = event.hash;
    replayed = reduceWorldLedgerEvent(replayed, event);
    if (event.kind === "week-committed") {
      const expected = typeof event.payload.checksum === "string" ? event.payload.checksum : "";
      if (expected && ledgerChecksum(replayed) !== expected) issues.push(`第${event.week}周提交 checksum 与事件重放不一致`);
    }
  }
  for (const snapshot of ledger.snapshots) {
    if (ledgerChecksum(snapshot.projection) !== snapshot.checksum) issues.push(`快照${snapshot.id}校验失败`);
    if (snapshot.afterSequence > previousSequence) issues.push(`快照${snapshot.id}指向不存在的 sequence`);
  }
  if (ledger.snapshots.length > WORLD_LEDGER_SNAPSHOT_RETENTION) issues.push(`快照数量超过保留上限：${ledger.snapshots.length}`);
  if (ledger.snapshotArchive && (ledger.snapshotArchive.archivedCount < 1 || ledger.snapshotArchive.throughSequence < 1 || !ledger.snapshotArchive.lastChecksum)) issues.push("快照归档元数据无效");
  const fromZero = replayed;
  const accelerated = replayWorldLedger(ledger, { useSnapshots: true });
  if (ledgerChecksum(fromZero) !== ledgerChecksum(accelerated)) issues.push("从零重放与快照加速重放不一致");
  const latest = ledger.snapshots.slice().sort((left, right) => right.afterSequence - left.afterSequence)[0];
  if (latest && fromZero && latest.afterSequence === previousSequence && ledgerChecksum(fromZero) !== latest.checksum) issues.push("重放结果与最新快照不一致");
  if (ledger.nextSequence <= previousSequence) issues.push("nextSequence没有越过最后一个事件");
  return { ok: issues.length === 0, issues, replayed: fromZero };
}
