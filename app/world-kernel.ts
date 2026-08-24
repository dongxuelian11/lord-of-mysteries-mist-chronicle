import runtimeLimits from "../shared/runtime-limits.json" with { type: "json" };
import type {
  DurableMutationClaim,
  DurableRetrievalReceipt,
  MutationClaim,
  RetrievalReceipt,
} from "./world-authority-closure.ts";
import { tryRecordRuntimeTrace } from "./runtime-trace.ts";
import { sha256Hex } from "./sha256.ts";

export type WorldVisibility = "world" | "public" | "player" | "actors";

export type PersistentWorldActor = {
  id: string;
  name: string;
  locationId: string;
  agenda: string;
  shortTermGoal: string;
  lastAction: string;
  condition: string;
  knowledgeIds: string[];
};

export type PersistentWorldFaction = {
  id: string;
  name: string;
  posture: string;
  resources: number;
  suspicion: number;
  lastAction: string;
};

export type PersistentWorldProject = {
  id: string;
  ownerId: string;
  title: string;
  stage: string;
  progress: number;
  momentum: number;
  secrecy: number;
  nextMilestone: string;
  blockers: string[];
  status: "active" | "paused" | "completed" | "failed";
  updatedWeek: number;
};

export type PersistentWorldLocation = {
  id: string;
  name: string;
  risk: number;
  stability: number;
  publicMood: string;
  conditions: string[];
  actorIds: string[];
  factionIds: string[];
  updatedWeek: number;
};

export type PersistentWorldEvent = {
  id: string;
  week: number;
  title: string;
  detail: string;
  locationId?: string;
  actorIds: string[];
  factionIds: string[];
  causeIds: string[];
  visibility: WorldVisibility;
  witnessRefs?: string[];
  sourceProposalIds?: string[];
};

export type WorldObservation = {
  id: string;
  week: number;
  eventId: string;
  channel: string;
  text: string;
  visibility: Exclude<WorldVisibility, "world">;
  holderIds: string[];
  holderRefs?: string[];
  perceivedRefs?: string[];
  acquisitionKind?: KnowledgeGrantKind;
};

export type KnowledgeGrantKind = "witness" | "communication" | "investigation" | "propagation";

export type WorldKnowledgeGrant = {
  id: string;
  week: number;
  knowledgeId: string;
  holderRef: string;
  kind: KnowledgeGrantKind;
  sourceEventId: string;
  sourceObservationId: string;
  grantedByRef?: string;
};

export type WorldKnowledgeNode = {
  id: string;
  subject: string;
  statement: string;
  truth: "confirmed" | "likely" | "false" | "unknown";
  visibility: WorldVisibility;
  holderIds: string[];
  holderRefs?: string[];
  loreRecordIds: string[];
  sourceEventId?: string;
  acquiredWeek: number;
};

export type WorldAudience =
  | { kind: "world"; holderId?: string }
  | { kind: "player"; holderId: "player" }
  | { kind: "actor"; holderId: string }
  | { kind: "faction"; holderId: string };

export type WorldTurnTransaction = {
  turnId: string;
  resolvingWeek: number;
  baseRevision: number;
  inputHash: string;
};

export type WorldKernel = {
  schemaVersion: 1;
  currentWeek: number;
  currentDate: string;
  lastResolvedWeek: number;
  revision: number;
  committedTransactions: WorldTurnTransaction[];
  retrievalReceipts: DurableRetrievalReceipt[];
  mutationClaims: DurableMutationClaim[];
  actors: PersistentWorldActor[];
  factions: PersistentWorldFaction[];
  projects: PersistentWorldProject[];
  locations: PersistentWorldLocation[];
  events: PersistentWorldEvent[];
  observations: WorldObservation[];
  knowledge: WorldKnowledgeNode[];
  knowledgeGrants: WorldKnowledgeGrant[];
  canon: {
    mode: "anchored" | "diverging";
    deviation: number;
    pivotEventIds: string[];
    knowledgeHorizon: {
      work: "LOTM" | "COI";
      maxVolume: number | null;
      maxAbsoluteChapter: number | null;
      allowedEventIds: string[];
      revealedIdentityIds: string[];
      worldlineMode: "canon-aligned" | "canon-diverged" | "post-canon" | "custom";
    };
  };
};

export type WorldKernelSeed = {
  week: number;
  date: string;
  factions: { id: string; name: string; plan: string; progress: number; suspicion?: number }[];
  actors: { id: string; name: string; locationId: string; agenda: string; state?: string; lastAction?: string }[];
  locations: { id: string; name: string; risk: number }[];
  timeline: { id: string; title: string; scheduledWeek: number; status: string }[];
};

export type WorldTurnDelta = {
  week: number;
  transaction?: WorldTurnTransaction;
  /** Proposal ids already admitted by the executable world-turn boundary. */
  executableProposalIds: string[];
  retrievalReceipt?: RetrievalReceipt;
  mutationClaims?: MutationClaim[];
  playerIssuedNoOrders: boolean;
  newActors?: (Omit<PersistentWorldActor, "lastAction" | "knowledgeIds"> & { lastAction?: string; knowledgeIds?: string[]; sourceProposalIds: string[] })[];
  newFactions?: (Omit<PersistentWorldFaction, "lastAction"> & { lastAction?: string; sourceProposalIds: string[] })[];
  newProjects?: (Omit<PersistentWorldProject, "updatedWeek"> & { sourceProposalIds: string[] })[];
  actorUpdates: { actorId: string; locationId?: string; shortTermGoal?: string; lastAction?: string; condition?: string; sourceProposalIds: string[] }[];
  factionUpdates?: { factionId: string; posture?: string; resourcesDelta?: number; suspicionDelta?: number; lastAction?: string; sourceProposalIds: string[] }[];
  projectUpdates: { projectId: string; progressDelta: number; stage?: string; nextMilestone?: string; blockers?: string[]; status?: PersistentWorldProject["status"]; sourceProposalIds: string[] }[];
  locationUpdates: { locationId: string; riskDelta?: number; stabilityDelta?: number; publicMood?: string; condition?: string; sourceProposalIds: string[] }[];
  events: Omit<PersistentWorldEvent, "week">[];
  observations: Omit<WorldObservation, "week">[];
  knowledge?: (Omit<WorldKnowledgeNode, "acquiredWeek" | "loreRecordIds"> & { loreRecordIds?: string[] })[];
  knowledgeGrants?: Omit<WorldKnowledgeGrant, "week">[];
  canon?: { mode?: "anchored" | "diverging"; deviationDelta?: number; pivotEventIds?: string[] };
  directiveInterruptions?: { proposalId: string; sourceEventId: string; triggeredBoundary: string; reason: string; completedFraction: number }[];
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));

const MAX_COMMITTED_WORLD_TRANSACTIONS = runtimeLimits.maxCommittedWorldTransactions;
const MAX_AUTHORITY_RECEIPTS = runtimeLimits.maxAuthorityReceipts;

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashText(value: string): string {
  return sha256Hex(value);
}

export function worldTurnInputHash(delta: WorldTurnDelta): string {
  const payload = { ...delta };
  delete payload.transaction;
  return hashText(stableSerialize(payload));
}

function kernelRevision(kernel: Pick<WorldKernel, "revision">): number {
  return Number.isInteger(kernel.revision) && kernel.revision >= 0 ? kernel.revision : 0;
}

export function createWorldTurnTransaction(kernel: Pick<WorldKernel, "revision">, delta: WorldTurnDelta, turnId?: string): WorldTurnTransaction {
  const inputHash = worldTurnInputHash(delta);
  return {
    turnId: turnId?.trim() || `world-turn:${delta.week}:${inputHash}`,
    resolvingWeek: delta.week,
    baseRevision: kernelRevision(kernel),
    inputHash,
  };
}

function isWorldTurnTransaction(value: unknown): value is WorldTurnTransaction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const transaction = value as Partial<WorldTurnTransaction>;
  const baseRevision = transaction.baseRevision;
  return typeof transaction.turnId === "string"
    && transaction.turnId.trim().length > 0
    && Number.isInteger(transaction.resolvingWeek)
    && typeof baseRevision === "number"
    && Number.isInteger(baseRevision)
    && baseRevision >= 0
    && typeof transaction.inputHash === "string"
    && /^(?:[0-9a-f]{8}|[0-9a-f]{64})$/.test(transaction.inputHash);
}

function isRetrievalReceipt(value: unknown): value is RetrievalReceipt & { turnId?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Partial<RetrievalReceipt & { turnId: string }>;
  return typeof receipt.requestId === "string"
    && (receipt.turnId === undefined || typeof receipt.turnId === "string" && receipt.turnId.trim().length > 0)
    && typeof receipt.indexVersion === "string"
    && typeof receipt.audienceRef === "string"
    && typeof receipt.queryHash === "string"
    && typeof receipt.filterHash === "string"
    && Array.isArray(receipt.chunkIds)
    && receipt.chunkIds.every((id) => typeof id === "string")
    && typeof receipt.contextHash === "string";
}

function isMutationClaim(value: unknown): value is MutationClaim & { turnId?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claim = value as Partial<MutationClaim & { turnId: string }>;
  return typeof claim.proposalId === "string"
    && (claim.turnId === undefined || typeof claim.turnId === "string" && claim.turnId.trim().length > 0)
    && typeof claim.effectKind === "string"
    && typeof claim.subjectRef === "string"
    && Array.isArray(claim.targetRefs)
    && claim.targetRefs.every((ref) => typeof ref === "string")
    && (claim.resourceImpact === undefined || (typeof claim.resourceImpact === "object" && claim.resourceImpact !== null))
    && (claim.sourceEventId === undefined || typeof claim.sourceEventId === "string");
}

export function ensureWorldKernelTransactionState(value: unknown): WorldKernel {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<WorldKernel>
    : {};
  const committedTransactions = Array.isArray(source.committedTransactions)
    ? source.committedTransactions.filter(isWorldTurnTransaction).slice(-MAX_COMMITTED_WORLD_TRANSACTIONS)
    : [];
  const legacyAuthorityTurnId = committedTransactions.length === 1
    ? committedTransactions[0].turnId
    : "state-import";
  const retrievalReceipts = Array.isArray(source.retrievalReceipts)
    ? source.retrievalReceipts
      .filter(isRetrievalReceipt)
      .map((receipt) => ({ ...receipt, turnId: receipt.turnId?.trim() || legacyAuthorityTurnId }))
      .slice(-MAX_AUTHORITY_RECEIPTS)
    : [];
  const mutationClaims = Array.isArray(source.mutationClaims)
    ? source.mutationClaims
      .filter(isMutationClaim)
      .map((claim) => ({ ...claim, turnId: claim.turnId?.trim() || legacyAuthorityTurnId }))
      .slice(-MAX_AUTHORITY_RECEIPTS * 4)
    : [];
  const sourceRevision = Number.isInteger(source.revision) && (source.revision as number) >= 0 ? source.revision as number : 0;
  const actors = Array.isArray(source.actors) ? source.actors : [];
  const factions = Array.isArray(source.factions) ? source.factions : [];
  assertUniqueEntityIds(actors, (item) => item.id, "角色");
  assertUniqueEntityIds(factions, (item) => item.id, "势力");
  assertDisjointActorFactionIds(actors.map((item) => item.id), factions.map((item) => item.id));
  return {
    ...(source as WorldKernel),
    revision: Math.max(sourceRevision, committedTransactions.length),
    committedTransactions,
    retrievalReceipts,
    mutationClaims,
  };
}

function withoutMutationProvenance<T extends { sourceProposalIds: string[] }>(value: T): Omit<T, "sourceProposalIds"> {
  const copy: Partial<T> = { ...value };
  delete copy.sourceProposalIds;
  return copy as Omit<T, "sourceProposalIds">;
}

export function createWorldKernel(seed: WorldKernelSeed): WorldKernel {
  const DEFAULT_HORIZON = {
    work: "LOTM" as const,
    maxVolume: 1,
    maxAbsoluteChapter: 195,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned" as const,
  };
  assertUniqueEntityIds(seed.actors, (item) => item.id, "角色");
  assertUniqueEntityIds(seed.factions, (item) => item.id, "势力");
  assertDisjointActorFactionIds(seed.actors.map((item) => item.id), seed.factions.map((item) => item.id));
  return {
    schemaVersion: 1,
    currentWeek: seed.week,
    currentDate: seed.date,
    lastResolvedWeek: Math.max(0, seed.week - 1),
    revision: 0,
    committedTransactions: [],
    retrievalReceipts: [],
    mutationClaims: [],
    actors: seed.actors.map((actor) => ({ id: actor.id, name: actor.name, locationId: actor.locationId, agenda: actor.agenda, shortTermGoal: actor.agenda, lastAction: actor.lastAction ?? "尚未产生新的可记录行动", condition: actor.state ?? "正常活动", knowledgeIds: [] })),
    factions: seed.factions.map((faction) => ({ id: faction.id, name: faction.name, posture: faction.plan, resources: 50, suspicion: faction.suspicion ?? 0, lastAction: "正在推进既定计划" })),
    projects: [
      ...seed.factions.map((faction) => ({ id: `faction:${faction.id}`, ownerId: faction.id, title: faction.plan, stage: "推进", progress: clamp(faction.progress), momentum: 1, secrecy: 50, nextMilestone: "等待世界推演器给出下一项具体里程碑", blockers: [], status: "active" as const, updatedWeek: seed.week })),
      ...seed.timeline.map((event) => ({ id: `timeline:${event.id}`, ownerId: "canon", title: event.title, stage: event.status, progress: clamp(Math.round(seed.week / Math.max(1, event.scheduledWeek) * 100)), momentum: 1, secrecy: 75, nextMilestone: `预定窗口：第${event.scheduledWeek}周`, blockers: [], status: event.status === "resolved" ? "completed" as const : "active" as const, updatedWeek: seed.week })),
    ],
    locations: seed.locations.map((location) => ({ id: location.id, name: location.name, risk: clamp(location.risk), stability: clamp(100 - location.risk), publicMood: "日常秩序仍在维持", conditions: [], actorIds: seed.actors.filter((actor) => actor.locationId === location.id).map((actor) => actor.id), factionIds: [], updatedWeek: seed.week })),
    events: [],
    observations: [],
    knowledge: [],
    knowledgeGrants: [],
    canon: {
      mode: "anchored",
      deviation: 0,
      pivotEventIds: [],
      knowledgeHorizon: { ...DEFAULT_HORIZON },
    },
  };
}

function assertUniqueEntityIds<T>(items: readonly T[], getId: (item: T) => string, label: string) {
  const seen = new Set<string>();
  for (const item of items) {
    const id = getId(item);
    if (seen.has(id)) throw new Error(`世界${label}更新标识重复：${id}`);
    seen.add(id);
  }
}

function assertDisjointActorFactionIds(actorIds: Iterable<string>, factionIds: Iterable<string>) {
  const actors = new Set(actorIds);
  for (const id of factionIds) if (actors.has(id)) throw new Error(`角色与势力标识跨类型重复：${id}`);
}

function assertUniqueTurnEntityIds(kernel: WorldKernel, delta: WorldTurnDelta) {
  assertUniqueEntityIds(delta.actorUpdates, (item) => item.actorId, "角色");
  assertUniqueEntityIds(delta.factionUpdates ?? [], (item) => item.factionId, "势力");
  assertUniqueEntityIds(delta.projectUpdates, (item) => item.projectId, "项目");
  assertUniqueEntityIds(delta.locationUpdates, (item) => item.locationId, "地点");
  const actorIds = new Set(kernel.actors.map((item) => item.id));
  const factionIds = new Set(kernel.factions.map((item) => item.id));
  const projectIds = new Set(kernel.projects.map((item) => item.id));
  assertUniqueEntityIds(delta.newActors ?? [], (item) => item.id, "新角色");
  assertUniqueEntityIds(delta.newFactions ?? [], (item) => item.id, "新势力");
  assertUniqueEntityIds(delta.newProjects ?? [], (item) => item.id, "新项目");
  const newActorIds = new Set((delta.newActors ?? []).map((item) => item.id));
  const newFactionIds = new Set((delta.newFactions ?? []).map((item) => item.id));
  assertDisjointActorFactionIds(actorIds, factionIds);
  assertDisjointActorFactionIds(newActorIds, newFactionIds);
  assertDisjointActorFactionIds(newActorIds, factionIds);
  assertDisjointActorFactionIds(actorIds, newFactionIds);
  for (const actor of delta.newActors ?? []) if (actorIds.has(actor.id)) throw new Error(`新角色标识已存在：${actor.id}`);
  for (const faction of delta.newFactions ?? []) if (factionIds.has(faction.id)) throw new Error(`新势力标识已存在：${faction.id}`);
  for (const project of delta.newProjects ?? []) if (projectIds.has(project.id)) throw new Error(`新项目标识已存在：${project.id}`);
}

function validateWorldTurnTransaction(kernel: WorldKernel, delta: WorldTurnDelta): { transaction: WorldTurnTransaction; replay: boolean } {
  const transaction = delta.transaction;
  if (!isWorldTurnTransaction(transaction)) throw new Error("世界事务缺少完整事务身份");
  const expectedInputHash = worldTurnInputHash(delta);
  if (transaction.inputHash !== expectedInputHash) throw new Error("世界事务输入哈希不匹配");
  const committedTransactions = Array.isArray(kernel.committedTransactions) ? kernel.committedTransactions : [];
  const existing = committedTransactions.find((item) => item.turnId === transaction.turnId);
  if (existing) {
    if (existing.resolvingWeek !== transaction.resolvingWeek || existing.baseRevision !== transaction.baseRevision || existing.inputHash !== transaction.inputHash) {
      throw new Error(`世界事务标识已用于不同输入：${transaction.turnId}`);
    }
    return { transaction, replay: true };
  }
  if (transaction.resolvingWeek !== delta.week || delta.week !== kernel.lastResolvedWeek + 1 || delta.week > kernel.currentWeek) throw new Error("世界推演事务周次必须严格连续");
  if (transaction.baseRevision !== kernelRevision(kernel)) throw new Error("世界推演事务基准修订号已过期");
  return { transaction, replay: false };
}

function turnFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/事务|周次|修订号|输入哈希/.test(message)) return "TURN_TRANSACTION_REJECTED";
  if (/Knowledge|知识|lore|LORE/.test(message)) return "TURN_KNOWLEDGE_REJECTED";
  if (/事件|角色|势力|项目|地点|实体|引用/.test(message)) return "TURN_ENTITY_REJECTED";
  return "TURN_COMMIT_REJECTED";
}

/**
 * Exactly-once world commit with a redacted runtime trace. The trace records
 * only transaction/retrieval identifiers and outcome codes; world payloads
 * remain in the authoritative kernel and are never copied into diagnostics.
 */
export function applyWorldTurn(kernel: WorldKernel, delta: WorldTurnDelta, options: { recordTrace?: boolean } = {}): WorldKernel {
  const startedAt = Date.now();
  const transaction = delta.transaction;
  const turnId = transaction && typeof transaction.turnId === "string" && transaction.turnId.trim()
    ? transaction.turnId
    : null;
  const traceId = turnId ? `turn:${turnId}` : `turn:invalid:${worldTurnInputHash(delta)}`;
  try {
    const next = applyWorldTurnUnchecked(kernel, delta);
    if (options.recordTrace !== false) tryRecordRuntimeTrace({
      traceId,
      operation: "turn",
      requestId: delta.retrievalReceipt?.requestId,
      turnId,
      retrievalId: delta.retrievalReceipt?.requestId,
      retrievalMode: null,
      retrievalSelectedCount: null,
      retrievalRejectedCount: null,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      firstTokenLatencyMs: null,
      repairCount: 0,
      rejectionReasons: [],
      outcome: "PASS",
      // Kernel application is not a durable acknowledgement. Main owns the
      // final COMMITTED/REPLAYED status after its SQLite transaction.
      commitStatus: "PENDING",
    });
    return next;
  } catch (error) {
    if (options.recordTrace !== false) tryRecordRuntimeTrace({
      traceId,
      operation: "turn",
      requestId: delta.retrievalReceipt?.requestId,
      turnId,
      retrievalId: delta.retrievalReceipt?.requestId,
      retrievalMode: null,
      retrievalSelectedCount: null,
      retrievalRejectedCount: null,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      firstTokenLatencyMs: null,
      repairCount: 0,
      rejectionReasons: [turnFailureCode(error)],
      outcome: "FAILED",
      commitStatus: "REJECTED",
    });
    throw error;
  }
}

function applyWorldTurnUnchecked(kernel: WorldKernel, delta: WorldTurnDelta): WorldKernel {
  const transactionState = validateWorldTurnTransaction(kernel, delta);
  if (transactionState.replay) return kernel;
  assertUniqueTurnEntityIds(kernel, delta);
  const existingEventIds = new Set(kernel.events.map((event) => event.id));
  const incomingEventIds = new Set(delta.events.map((event) => event.id));
  if (incomingEventIds.size !== delta.events.length || [...incomingEventIds].some((id) => existingEventIds.has(id))) throw new Error("世界事件标识重复");
  for (const event of delta.events) {
    if (event.causeIds.some((id) => !existingEventIds.has(id) && !incomingEventIds.has(id))) throw new Error(`世界事件引用了不存在的原因：${event.id}`);
  }
  const existingActorIds = new Set(kernel.actors.map((actor) => actor.id));
  const existingFactionIds = new Set(kernel.factions.map((faction) => faction.id));
  const existingProjectIds = new Set(kernel.projects.map((project) => project.id));
  const locationIds = new Set(kernel.locations.map((location) => location.id));
  for (const actor of delta.newActors ?? []) {
    if (!locationIds.has(actor.locationId)) throw new Error(`新角色引用了不存在的地点：${actor.id} -> ${actor.locationId}`);
  }
  for (const update of delta.actorUpdates) {
    if (update.locationId && !locationIds.has(update.locationId)) throw new Error(`角色更新引用了不存在的地点：${update.actorId} -> ${update.locationId}`);
  }
  const validOwnerIds = new Set([
    "world",
    "canon",
    "player",
    "organization",
    ...existingActorIds,
    ...existingFactionIds,
    ...(delta.newActors ?? []).map((actor) => actor.id),
    ...(delta.newFactions ?? []).map((faction) => faction.id),
  ]);
  for (const project of delta.newProjects ?? []) {
    if (!validOwnerIds.has(project.ownerId)) throw new Error(`新项目引用了不存在的所有者：${project.id} -> ${project.ownerId}`);
  }
  const seededActors = [...kernel.actors, ...(delta.newActors ?? []).filter((actor) => !existingActorIds.has(actor.id)).map((value) => { const actor = withoutMutationProvenance(value); return { ...actor, lastAction: actor.lastAction ?? "刚刚进入持续世界状态", knowledgeIds: actor.knowledgeIds ?? [] }; })];
  const seededFactions = [...kernel.factions, ...(delta.newFactions ?? []).filter((faction) => !existingFactionIds.has(faction.id)).map((value) => { const faction = withoutMutationProvenance(value); return { ...faction, lastAction: faction.lastAction ?? "刚刚进入持续世界状态" }; })];
  const seededProjects = [...kernel.projects, ...(delta.newProjects ?? []).filter((project) => !existingProjectIds.has(project.id)).map((value) => ({ ...withoutMutationProvenance(value), updatedWeek: delta.week }))];
  const actors = seededActors.map((actor) => {
    const update = delta.actorUpdates.find((item) => item.actorId === actor.id);
    return update ? { ...actor, locationId: update.locationId ?? actor.locationId, shortTermGoal: update.shortTermGoal ?? actor.shortTermGoal, lastAction: update.lastAction ?? actor.lastAction, condition: update.condition ?? actor.condition } : actor;
  });
  const factions = seededFactions.map((faction) => {
    const update = delta.factionUpdates?.find((item) => item.factionId === faction.id);
    return update ? { ...faction, posture: update.posture ?? faction.posture, resources: clamp(faction.resources + (update.resourcesDelta ?? 0)), suspicion: clamp(faction.suspicion + (update.suspicionDelta ?? 0)), lastAction: update.lastAction ?? faction.lastAction } : faction;
  });
  const projects = seededProjects.map((project) => {
    const update = delta.projectUpdates.find((item) => item.projectId === project.id);
    return update ? { ...project, progress: clamp(project.progress + update.progressDelta), momentum: clamp(update.progressDelta, -10, 10), stage: update.stage ?? project.stage, nextMilestone: update.nextMilestone ?? project.nextMilestone, blockers: update.blockers ?? project.blockers, status: update.status ?? project.status, updatedWeek: delta.week } : project;
  });
  const locations = kernel.locations.map((location) => {
    const update = delta.locationUpdates.find((item) => item.locationId === location.id);
    const locationEvents = delta.events.filter((event) => event.locationId === location.id);
    const factionIds = [...new Set([...location.factionIds, ...locationEvents.flatMap((event) => event.factionIds)])];
    const actorIds = actors.filter((actor) => actor.locationId === location.id).map((actor) => actor.id);
    if (!update) return { ...location, actorIds, factionIds, updatedWeek: locationEvents.length ? delta.week : location.updatedWeek };
    return { ...location, risk: clamp(location.risk + (update.riskDelta ?? 0)), stability: clamp(location.stability + (update.stabilityDelta ?? 0)), publicMood: update.publicMood ?? location.publicMood, conditions: update.condition && !location.conditions.includes(update.condition) ? [...location.conditions, update.condition].slice(-8) : location.conditions, actorIds, factionIds, updatedWeek: delta.week };
  });
  const events = [...kernel.events, ...delta.events.map((event) => ({
    ...event,
    week: delta.week,
    witnessRefs: [...new Set([
      ...(event.witnessRefs ?? []),
      ...event.actorIds.map((id) => `actor:${id}`),
      ...event.factionIds.map((id) => `faction:${id}`),
    ])],
  }))].slice(-240);
  const eventIds = new Set(events.map((event) => event.id));
  const observations = [...kernel.observations, ...delta.observations.filter((observation) => eventIds.has(observation.eventId)).map((observation) => ({ ...observation, week: delta.week }))].slice(-320);
  const currentTurnEventIds = new Set((delta.events ?? []).map((event) => event.id));
  const executableProposalIds = new Set((delta.executableProposalIds ?? []).filter(Boolean));
  const knowledgeClaims = delta.mutationClaims ?? [];
  for (const node of delta.knowledge ?? []) {
    const sourceEvent = node.sourceEventId ? delta.events.find((event) => event.id === node.sourceEventId) : undefined;
    if (!node.sourceEventId || !currentTurnEventIds.has(node.sourceEventId) || !sourceEvent) {
      throw new Error(`Knowledge mutation must reference a current-turn event: ${node.id}`);
    }
    const sourceProposalIds = sourceEvent.sourceProposalIds ?? [];
    if (!executableProposalIds.size || !sourceProposalIds.some((proposalId) => executableProposalIds.has(proposalId))) {
      throw new Error(`Knowledge mutation source event is not tied to an executable proposal: ${node.id}`);
    }
    const claim = knowledgeClaims.find((candidate) => candidate.effectKind === "knowledge"
      && candidate.subjectRef === `knowledge:${node.id}`
      && candidate.sourceEventId === node.sourceEventId
      && executableProposalIds.has(candidate.proposalId)
      && sourceProposalIds.includes(candidate.proposalId));
    if (!claim) throw new Error(`Knowledge mutation is missing an executable authority claim: ${node.id}`);
  }
  const incomingKnowledge = (delta.knowledge ?? [])
    .map((node) => ({ ...node, loreRecordIds: node.loreRecordIds ?? [], acquiredWeek: delta.week }));
  const incomingKnowledgeIds = new Set(incomingKnowledge.map((node) => node.id));
  const incomingKnowledgeGrants = (delta.knowledgeGrants ?? []).map((grant) => ({ ...grant, week: delta.week }));
  const validKnowledgeHolderRefs = new Set([
    "player",
    "organization",
    ...seededActors.map((actor) => `actor:${actor.id}`),
    ...seededFactions.map((faction) => `faction:${faction.id}`),
  ]);
  for (const grant of incomingKnowledgeGrants) {
    if (!incomingKnowledgeIds.has(grant.knowledgeId)) throw new Error(`KnowledgeGrant references unknown knowledge: ${grant.id}`);
    if (!validKnowledgeHolderRefs.has(grant.holderRef)) throw new Error(`KnowledgeGrant references unknown holder: ${grant.id}`);
    if (!eventIds.has(grant.sourceEventId)) throw new Error(`KnowledgeGrant references unknown event: ${grant.id}`);
    const holderId = grant.holderRef.replace(/^(actor|faction):/, "");
    const sourceObservation = observations.find((observation) => observation.id === grant.sourceObservationId && observation.eventId === grant.sourceEventId);
    if (!sourceObservation || sourceObservation.visibility !== "public"
      && !holderIncludes(sourceObservation.holderIds, sourceObservation.holderRefs, grant.holderRef, holderId)) {
      throw new Error(`KnowledgeGrant references invalid observation: ${grant.id}`);
    }
  }
  const grantedHolders = new Map<string, string[]>();
  for (const grant of incomingKnowledgeGrants) grantedHolders.set(grant.knowledgeId, [...new Set([...(grantedHolders.get(grant.knowledgeId) ?? []), grant.holderRef])]);
  const authorizedKnowledge = incomingKnowledge.map((node) => {
    if (node.visibility === "public" || node.visibility === "world") return node;
    const holderRefs = grantedHolders.get(node.id) ?? [];
    const holderIds = holderRefs.map((ref) => ref === "player" ? "player" : ref.replace(/^(actor|faction):/, ""));
    return { ...node, holderIds, holderRefs };
  });
  const knowledge = [...kernel.knowledge, ...authorizedKnowledge].slice(-400);
  const knowledgeIds = new Set(knowledge.map((node) => node.id));
  const knowledgeGrants = [...(kernel.knowledgeGrants ?? []), ...incomingKnowledgeGrants]
    .filter((grant) => knowledgeIds.has(grant.knowledgeId))
    .slice(-800);
  return {
    ...kernel,
    currentWeek: Math.max(kernel.currentWeek, delta.week + 1),
    lastResolvedWeek: delta.week,
    revision: kernelRevision(kernel) + 1,
    committedTransactions: [
      ...(Array.isArray(kernel.committedTransactions) ? kernel.committedTransactions : []),
      transactionState.transaction,
    ].slice(-MAX_COMMITTED_WORLD_TRANSACTIONS),
    retrievalReceipts: delta.retrievalReceipt
      ? [...(kernel.retrievalReceipts ?? []), { ...delta.retrievalReceipt, turnId: transactionState.transaction.turnId }].slice(-MAX_AUTHORITY_RECEIPTS)
      : [...(kernel.retrievalReceipts ?? [])],
    mutationClaims: delta.mutationClaims?.length
      ? [...(kernel.mutationClaims ?? []), ...delta.mutationClaims.map((claim) => ({ ...claim, turnId: transactionState.transaction.turnId }))].slice(-MAX_AUTHORITY_RECEIPTS * 4)
      : [...(kernel.mutationClaims ?? [])],
    actors,
    factions,
    projects,
    locations,
    events,
    observations,
    knowledge,
    knowledgeGrants,
    canon: {
      ...kernel.canon,
      mode: delta.canon?.mode ?? kernel.canon.mode,
      deviation: clamp(kernel.canon.deviation + (delta.canon?.deviationDelta ?? 0)),
      pivotEventIds: [...new Set([...kernel.canon.pivotEventIds, ...(delta.canon?.pivotEventIds ?? [])])],
    },
  };
}

function audienceRef(audience: WorldAudience) {
  if (audience.kind === "world") return "world";
  return audience.kind === "player" ? "player" : `${audience.kind}:${audience.holderId}`;
}

function holderIncludes(holderIds: string[], holderRefs: string[] | undefined, reference: string, legacyId: string) {
  return Array.isArray(holderRefs) && holderRefs.length > 0
    ? holderRefs.includes(reference)
    : holderIds.includes(legacyId);
}

function canSee(visibility: WorldVisibility, holderIds: string[], holderRefs: string[] | undefined, audience: WorldAudience) {
  if (audience.kind === "world") return true;
  if (visibility === "public") return true;
  const directlyHeld = holderIncludes(holderIds, holderRefs, audienceRef(audience), audience.holderId);
  if (visibility === "player") return audience.kind === "player" || directlyHeld;
  if (visibility === "actors") return directlyHeld;
  return false;
}

export type AudienceLocationProjection = {
  id: string;
  name: string;
  knownConditions: string[];
  knownActorIds: string[];
  knownFactionIds: string[];
  perceivedRisk: number | null;
  publicMood: string | null;
  stability: number | null;
  observedWeek: number | null;
};

export type AudienceWorldEvent = Pick<PersistentWorldEvent, "id" | "week" | "title" | "detail" | "locationId" | "visibility"> & {
  knownActorIds: string[];
  knownFactionIds: string[];
  observationIds: string[];
};

export type AudienceWorldObservation = Pick<WorldObservation, "id" | "week" | "eventId" | "channel" | "text" | "visibility" | "perceivedRefs" | "acquisitionKind">;

export type AudienceWorldKnowledge = Pick<WorldKnowledgeNode, "id" | "subject" | "statement" | "visibility" | "acquiredWeek"> & {
  epistemicStatus: "public-report" | "witnessed" | "communicated" | "investigated" | "propagated" | "held";
};

export type AudienceKnowledgeGrant = Pick<WorldKnowledgeGrant, "knowledgeId" | "kind">;

export type AudienceWorldProjection = {
  currentWeek: number;
  currentDate: string;
  locations: AudienceLocationProjection[];
  events: AudienceWorldEvent[];
  observations: AudienceWorldObservation[];
  knowledge: AudienceWorldKnowledge[];
  knowledgeGrants: AudienceKnowledgeGrant[];
  projectionHash: string;
};

function projectLocationForAudience(
  location: PersistentWorldLocation,
  audience: WorldAudience,
  eventsByLocationId: ReadonlyMap<string, AudienceWorldEvent[]>,
  observationsByEventId: ReadonlyMap<string, WorldObservation[]>,
): AudienceLocationProjection {
  const locationEvents = eventsByLocationId.get(location.id) ?? [];
  const locationObservations = locationEvents.flatMap((event) => observationsByEventId.get(event.id) ?? []);
  const knownActorIds = new Set<string>();
  const knownFactionIds = new Set<string>();
  for (const event of locationEvents) {
    for (const actorId of event.knownActorIds) knownActorIds.add(actorId);
    for (const factionId of event.knownFactionIds) knownFactionIds.add(factionId);
  }
  for (const observation of locationObservations) {
    for (const perceivedRef of observation.perceivedRefs ?? []) {
      const actor = perceivedRef.match(/^actor:(.+)$/)?.[1];
      const faction = perceivedRef.match(/^faction:(.+)$/)?.[1];
      if (actor) knownActorIds.add(actor);
      if (faction) knownFactionIds.add(faction);
    }
  }
  if (audience.kind === "actor" && location.actorIds.includes(audience.holderId)) knownActorIds.add(audience.holderId);
  if (audience.kind === "faction" && location.factionIds.includes(audience.holderId)) knownFactionIds.add(audience.holderId);
  const visibleText = [
    ...locationEvents.flatMap((event) => [event.title, event.detail]),
    ...locationObservations.map((observation) => observation.text),
  ].join("\n");
  const knownConditions = location.conditions.filter((condition) => condition.trim() && visibleText.includes(condition));
  const riskText = visibleText.match(/(?:致命|极度危险|高度危险|危机|危险|风险上升|不安全|警戒|安全|平静)/)?.[0] ?? "";
  const stabilityText = visibleText.match(/(?:完全失控|混乱|动荡|不稳|秩序恢复|秩序稳定|平静)/)?.[0] ?? "";
  const perceivedRisk = !riskText ? null : /致命|极度危险/.test(riskText) ? 90 : /高度危险|危机/.test(riskText) ? 75 : /危险|风险上升|不安全|警戒/.test(riskText) ? 60 : 20;
  const stability = !stabilityText ? null : /完全失控/.test(stabilityText) ? 10 : /混乱|动荡/.test(stabilityText) ? 30 : /不稳/.test(stabilityText) ? 45 : /秩序恢复/.test(stabilityText) ? 65 : 80;
  const observedWeeks = [...locationEvents.map((event) => event.week), ...locationObservations.map((observation) => observation.week)];
  return {
    id: location.id,
    name: location.name,
    knownConditions: [...new Set(knownConditions)].slice(-8),
    knownActorIds: [...knownActorIds].sort(),
    knownFactionIds: [...knownFactionIds].sort(),
    perceivedRisk,
    publicMood: location.publicMood.trim() && visibleText.includes(location.publicMood) ? location.publicMood : null,
    stability,
    observedWeek: observedWeeks.length ? Math.max(...observedWeeks) : null,
  };
}

export function projectWorldForAudience(kernel: WorldKernel, audience: Extract<WorldAudience, { kind: "world" }>): WorldKernel;
export function projectWorldForAudience(kernel: WorldKernel, audience: Exclude<WorldAudience, { kind: "world" }>): AudienceWorldProjection;
export function projectWorldForAudience(kernel: WorldKernel, audience: WorldAudience): WorldKernel | AudienceWorldProjection;
export function projectWorldForAudience(kernel: WorldKernel, audience: WorldAudience): WorldKernel | AudienceWorldProjection {
  if (audience.kind === "world") return kernel;
  const visibleObservations = kernel.observations.filter((observation) => canSee(observation.visibility, observation.holderIds, observation.holderRefs, audience));
  const observableEventIds = new Set(visibleObservations.map((observation) => observation.eventId));
  const reference = audienceRef(audience);
  const visibleEvents = kernel.events.filter((event) => event.visibility === "public" || observableEventIds.has(event.id));
  const visibleKnowledge = kernel.knowledge.filter((node) => canSee(node.visibility, node.holderIds, node.holderRefs, audience));
  const visibleKnowledgeGrants = (kernel.knowledgeGrants ?? []).filter((grant) => grant.holderRef === reference);
  const observationsByEventId = new Map<string, WorldObservation[]>();
  for (const observation of visibleObservations) {
    const eventObservations = observationsByEventId.get(observation.eventId) ?? [];
    eventObservations.push(observation);
    observationsByEventId.set(observation.eventId, eventObservations);
  }
  const locationById = new Map(kernel.locations.map((location) => [location.id, location]));
  const audienceEvents: AudienceWorldEvent[] = visibleEvents.map((event) => {
    const eventObservations = observationsByEventId.get(event.id) ?? [];
    const perceivedRefs = eventObservations.flatMap((observation) => observation.perceivedRefs ?? []);
    const knownActorIds = new Set(perceivedRefs.flatMap((item) => item.startsWith("actor:") ? [item.slice("actor:".length)] : []));
    const knownFactionIds = new Set(perceivedRefs.flatMap((item) => item.startsWith("faction:") ? [item.slice("faction:".length)] : []));
    if (audience.kind === "actor" && event.actorIds.includes(audience.holderId)) knownActorIds.add(audience.holderId);
    if (audience.kind === "faction" && event.factionIds.includes(audience.holderId)) knownFactionIds.add(audience.holderId);
    const observationText = eventObservations.map((observation) => observation.text).filter(Boolean).join("；");
    const eventLocation = event.locationId ? locationById.get(event.locationId) : undefined;
    const observedLocationId = event.visibility === "public"
      || Boolean(eventLocation && eventObservations.some((observation) => observation.text.includes(eventLocation.id) || observation.text.includes(eventLocation.name)))
      ? event.locationId
      : undefined;
    return {
      id: event.id,
      week: event.week,
      title: event.visibility === "public" ? event.title : eventObservations[0]?.channel ?? "可见变化",
      detail: event.visibility === "public" ? event.detail : observationText,
      locationId: observedLocationId,
      visibility: event.visibility,
      knownActorIds: [...knownActorIds].sort(),
      knownFactionIds: [...knownFactionIds].sort(),
      observationIds: eventObservations.map((observation) => observation.id).sort(),
    };
  });
  const eventsByLocationId = new Map<string, AudienceWorldEvent[]>();
  for (const event of audienceEvents) {
    if (!event.locationId) continue;
    const locationEvents = eventsByLocationId.get(event.locationId) ?? [];
    locationEvents.push(event);
    eventsByLocationId.set(event.locationId, locationEvents);
  }
  const locations = kernel.locations.map((location) => projectLocationForAudience(location, audience, eventsByLocationId, observationsByEventId));
  const audienceObservations: AudienceWorldObservation[] = visibleObservations.map(({ id, week, eventId, channel, text, visibility, perceivedRefs, acquisitionKind }) => ({ id, week, eventId, channel, text, visibility, perceivedRefs, acquisitionKind }));
  const grantByKnowledgeId = new Map(visibleKnowledgeGrants.map((grant) => [grant.knowledgeId, grant.kind]));
  const audienceKnowledge: AudienceWorldKnowledge[] = visibleKnowledge.map(({ id, subject, statement, visibility, acquiredWeek }) => {
    const grantKind = grantByKnowledgeId.get(id);
    const epistemicStatus = grantKind === "witness" ? "witnessed"
      : grantKind === "communication" ? "communicated"
        : grantKind === "investigation" ? "investigated"
          : grantKind === "propagation" ? "propagated"
            : visibility === "public" ? "public-report" : "held";
    return { id, subject, statement, visibility, acquiredWeek, epistemicStatus };
  });
  const audienceKnowledgeGrants: AudienceKnowledgeGrant[] = visibleKnowledgeGrants.map(({ knowledgeId, kind }) => ({ knowledgeId, kind }));
  const projectionHash = hashText(stableSerialize({
    audience: reference,
    currentWeek: kernel.currentWeek,
    currentDate: kernel.currentDate,
    locations,
    events: audienceEvents,
    observations: audienceObservations,
    knowledge: audienceKnowledge,
    knowledgeGrants: audienceKnowledgeGrants,
  }));
  return {
    currentWeek: kernel.currentWeek,
    currentDate: kernel.currentDate,
    locations,
    events: audienceEvents,
    observations: audienceObservations,
    knowledge: audienceKnowledge,
    knowledgeGrants: audienceKnowledgeGrants,
    projectionHash,
  };
}

export function deliverWorldPerceptions(kernel: WorldKernel, audiences: WorldAudience[]) {
  return Object.fromEntries(audiences.map((audience) => [audienceRef(audience), projectWorldForAudience(kernel, audience)]));
}
