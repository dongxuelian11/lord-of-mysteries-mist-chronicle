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
  | "phase-completed"
  | "action-proposed"
  | "action-reviewed"
  | "action-resolved"
  | "world-event-recorded"
  | "knowledge-delivered"
  | "week-committed";

export type LedgerVisibility = "world" | "public" | "player" | "actors" | "factions";

export type WorldLedgerAudience = {
  visibility: LedgerVisibility;
  holderRefs: string[];
};

export type WorldLedgerEvent = {
  id: string;
  sequence: number;
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
};

export type WorldLedgerSnapshot = {
  id: string;
  week: number;
  afterSequence: number;
  checksum: string;
  projection: WorldLedgerProjection;
};

export type WorldLedger = {
  version: 1;
  nextSequence: number;
  events: WorldLedgerEvent[];
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
      districts: Array<{
        blocks: Array<{
          strategicPoints: Array<{ id: string; influenceByFaction: Record<string, number>; controllerId?: string }>;
        }>;
      }>;
    };
  };
};

export type LedgerEventInput = Omit<WorldLedgerEvent, "id" | "sequence"> & { id?: string };

function stableSerialize(value: unknown): string {
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

function copyProjection(projection: WorldLedgerProjection): WorldLedgerProjection {
  return JSON.parse(JSON.stringify(projection)) as WorldLedgerProjection;
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

export function createWorldLedger(initial?: LedgerStateSource): WorldLedger {
  if (!initial) return { version: 1, nextSequence: 1, events: [], snapshots: [] };
  const projection = projectLedgerState(initial);
  return {
    version: 1,
    nextSequence: 1,
    events: [],
    snapshots: [{ id: `ledger-snapshot-${projection.week}-0`, week: projection.week, afterSequence: 0, checksum: ledgerChecksum(projection), projection }],
  };
}

export function appendWorldLedgerEvents(ledger: WorldLedger, inputs: LedgerEventInput[]): WorldLedger {
  if (!inputs.length) return ledger;
  let sequence = ledger.nextSequence;
  const events = inputs.map((input) => {
    const event: WorldLedgerEvent = {
      ...input,
      id: input.id ?? `ledger-${input.week}-${sequence}-${input.kind}`,
      sequence,
      actorIds: [...new Set(input.actorIds)],
      factionIds: [...new Set(input.factionIds)],
      witnessRefs: [...new Set(input.witnessRefs)],
      causeEventIds: [...new Set(input.causeEventIds)],
      audience: { ...input.audience, holderRefs: [...new Set(input.audience.holderRefs)] },
      payload: { ...input.payload },
    };
    sequence += 1;
    return event;
  });
  return { ...ledger, nextSequence: sequence, events: [...ledger.events, ...events] };
}

export function recordWorldLedgerPhase(
  ledger: WorldLedger,
  week: number,
  phase: WeekResolutionPhase,
  summary: string,
  payload: Record<string, unknown> = {},
): WorldLedger {
  return appendWorldLedgerEvents(ledger, [{
    week,
    phase,
    kind: "phase-completed",
    summary,
    actorIds: [],
    factionIds: [],
    witnessRefs: [],
    causeEventIds: [],
    audience: { visibility: "world", holderRefs: [] },
    payload,
  }]);
}

export function commitWorldLedgerWeek(ledger: WorldLedger, source: LedgerStateSource): WorldLedger {
  const projection = projectLedgerState(source);
  let next = appendWorldLedgerEvents(ledger, [{
    week: projection.week,
    phase: "narrative-ready",
    kind: "week-committed",
    summary: `第${projection.week}周权威事实已经提交`,
    actorIds: [],
    factionIds: [],
    witnessRefs: [],
    causeEventIds: [],
    audience: { visibility: "world", holderRefs: [] },
    payload: { projection, checksum: ledgerChecksum(projection) },
  }]);
  const afterSequence = next.nextSequence - 1;
  const snapshot: WorldLedgerSnapshot = {
    id: `ledger-snapshot-${projection.week}-${afterSequence}`,
    week: projection.week,
    afterSequence,
    checksum: ledgerChecksum(projection),
    projection: copyProjection(projection),
  };
  next = { ...next, snapshots: [...next.snapshots, snapshot] };
  return next;
}

function projectionFromCommit(event: WorldLedgerEvent): WorldLedgerProjection | null {
  if (event.kind !== "week-committed") return null;
  const value = event.payload.projection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as WorldLedgerProjection;
}

export function replayWorldLedger(ledger: WorldLedger, throughSequence = Number.POSITIVE_INFINITY): WorldLedgerProjection | null {
  const snapshot = ledger.snapshots.filter((item) => item.afterSequence <= throughSequence).sort((left, right) => right.afterSequence - left.afterSequence)[0];
  let projection = snapshot ? copyProjection(snapshot.projection) : null;
  const start = snapshot?.afterSequence ?? 0;
  for (const event of ledger.events) {
    if (event.sequence <= start || event.sequence > throughSequence) continue;
    const committed = projectionFromCommit(event);
    if (committed) projection = copyProjection(committed);
  }
  return projection;
}

export function verifyWorldLedger(ledger: WorldLedger) {
  const issues: string[] = [];
  let previous = 0;
  const ids = new Set<string>();
  for (const event of ledger.events) {
    if (ids.has(event.id)) issues.push(`重复事件ID：${event.id}`);
    ids.add(event.id);
    if (event.sequence <= previous) issues.push(`事件序号未严格递增：${event.sequence}`);
    previous = event.sequence;
    if (event.causeEventIds.some((id) => !ids.has(id))) issues.push(`事件${event.id}引用了尚不存在的原因`);
  }
  for (const snapshot of ledger.snapshots) {
    if (ledgerChecksum(snapshot.projection) !== snapshot.checksum) issues.push(`快照${snapshot.id}校验失败`);
  }
  const replayed = replayWorldLedger(ledger);
  const latest = ledger.snapshots.slice().sort((left, right) => right.afterSequence - left.afterSequence)[0];
  if (latest && replayed && ledgerChecksum(replayed) !== latest.checksum) issues.push("重放结果与最新快照不一致");
  if (ledger.nextSequence <= previous) issues.push("nextSequence没有越过最后一个事件");
  return { ok: issues.length === 0, issues, replayed };
}
