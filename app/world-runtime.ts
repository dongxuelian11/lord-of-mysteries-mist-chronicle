import type { AutonomousDecisionFrame } from "./autonomous-agents.ts";
import { projectWorldForAudience, type WorldKernel } from "./world-kernel.ts";

export const ACTIVE_AGENT_LIMIT = 24;
export const WORLD_ADJUDICATOR_PAYLOAD_CHAR_LIMIT = 72_000;

export const WORLD_RUNTIME_LIMITS = {
  visibleEventsPerAgent: 8,
  visibleObservationsPerAgent: 12,
  visibleKnowledgePerAgent: 12,
  ownedProjectsPerAgent: 4,
  adjudicatorActors: 24,
  adjudicatorFactions: 16,
  adjudicatorProjects: 32,
  adjudicatorLocations: 16,
  adjudicatorRecentEvents: 48,
} as const;

export type AgentDisposition = "act" | "continue" | "observe" | "hide" | "rest" | "wait";

export type AgentProposal = {
  version: 1;
  planningWeek: number;
  agentRef: string;
  disposition: AgentDisposition;
  intent: string;
  rationale: string;
  locationId?: string;
  targetRefs: string[];
  requiredKnowledgeIds: string[];
  conditionalOn?: string;
};

export type AgentPlanningProjection = {
  week: number;
  agent: AutonomousDecisionFrame;
  currentLocation: WorldKernel["locations"][number] | null;
  ownedProjects: WorldKernel["projects"];
  visibleEvents: WorldKernel["events"];
  visibleObservations: WorldKernel["observations"];
  visibleKnowledge: WorldKernel["knowledge"];
};

export type AgentPlanner = (
  projection: AgentPlanningProjection,
  context: { attempt: number; previousIssue?: string },
) => Promise<unknown>;

export type IndependentPlanningOptions = {
  maxAttempts?: number;
  concurrency?: number;
  proposalCache?: Map<string, AgentProposal>;
  onAgentStage?: (stage: { ref: string; attempt: number; state: "planning" | "retrying" | "ready" }) => void;
};

type PlanningFailure = { frame: AutonomousDecisionFrame; issue: string };

export class AgentPlanningError extends Error {
  readonly failedRefs: string[];
  readonly cachedProposalRefs: string[];

  constructor(failures: PlanningFailure[], cachedProposalRefs: string[]) {
    super(`Agent 独立规划失败：${failures.map((failure) => `${failure.frame.displayName}（${failure.issue}）`).join("；")}`);
    this.name = "AgentPlanningError";
    this.failedRefs = failures.map((failure) => failure.frame.ref);
    this.cachedProposalRefs = cachedProposalRefs;
  }
}

const dispositions = new Set<AgentDisposition>(["act", "continue", "observe", "hide", "rest", "wait"]);
const targetRefPattern = /^(actor|faction|location|project):[^\s:][^\s]*$|^(player|organization)$/;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function shortText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringList(value: unknown, maximum: number) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, maximum)
    : [];
}

export function validateAgentProposal(value: unknown, frame: AutonomousDecisionFrame): { proposal?: AgentProposal; issue?: string } {
  const input = recordOf(value);
  if (!input) return { issue: "没有返回对象" };
  if (input.agentRef !== frame.ref) return { issue: "agentRef 与当前独立主体不一致" };
  if (Number(input.planningWeek) !== frame.planningWeek) return { issue: "planningWeek 与当前周次不一致" };
  const disposition = String(input.disposition ?? "") as AgentDisposition;
  if (!dispositions.has(disposition)) return { issue: "disposition 无效" };
  const intent = shortText(input.intent, 360);
  const rationale = shortText(input.rationale, 480);
  if (!intent) return { issue: "缺少本周意图" };
  if (!rationale) return { issue: "缺少依据" };
  const allowedKnowledgeIds = new Set(frame.knownKnowledgeIds);
  const explicitKnowledgeIds = stringList(input.requiredKnowledgeIds, 16);
  const unknownKnowledge = explicitKnowledgeIds.find((id) => !allowedKnowledgeIds.has(id));
  if (unknownKnowledge) return { issue: `引用了自身不可见的知识：${unknownKnowledge}` };
  const rawTargetRefs = stringList(input.targetRefs, 12);
  // 模型偶尔会把自身可见的 knowledge id 放进 targetRefs。它表达的是依据而非行动目标，
  // 因此确定性地归位到 requiredKnowledgeIds；未知裸 id 仍然拒绝，不能猜测实体类型。
  const misplacedKnowledgeIds = rawTargetRefs.filter((ref) => allowedKnowledgeIds.has(ref));
  const requiredKnowledgeIds = [...new Set([...explicitKnowledgeIds, ...misplacedKnowledgeIds])].slice(0, 16);
  const targetRefs = rawTargetRefs.filter((ref) => !allowedKnowledgeIds.has(ref));
  const invalidTarget = targetRefs.find((ref) => !targetRefPattern.test(ref));
  if (invalidTarget) return { issue: `目标引用格式无效：${invalidTarget}` };
  const locationId = shortText(input.locationId, 80) || undefined;
  const conditionalOn = shortText(input.conditionalOn, 300) || undefined;
  return {
    proposal: {
      version: 1,
      planningWeek: frame.planningWeek,
      agentRef: frame.ref,
      disposition,
      intent,
      rationale,
      ...(locationId ? { locationId } : {}),
      targetRefs,
      requiredKnowledgeIds,
      ...(conditionalOn ? { conditionalOn } : {}),
    },
  };
}

export function buildAgentPlanningProjection(frame: AutonomousDecisionFrame, kernel: WorldKernel): AgentPlanningProjection {
  const audience = frame.kind === "actor"
    ? { kind: "actor" as const, holderId: frame.ref.slice("actor:".length) }
    : { kind: "faction" as const, holderId: frame.ref.slice("faction:".length) };
  const visible = projectWorldForAudience(kernel, audience);
  const entityId = frame.ref.slice(frame.ref.indexOf(":") + 1);
  return {
    week: frame.planningWeek,
    agent: frame,
    currentLocation: frame.locationId ? kernel.locations.find((location) => location.id === frame.locationId) ?? null : null,
    ownedProjects: kernel.projects
      .filter((project) => project.ownerId === entityId && project.status === "active")
      .sort((left, right) => right.updatedWeek - left.updatedWeek || right.progress - left.progress)
      .slice(0, WORLD_RUNTIME_LIMITS.ownedProjectsPerAgent),
    visibleEvents: visible.events.slice(-WORLD_RUNTIME_LIMITS.visibleEventsPerAgent),
    visibleObservations: visible.observations.slice(-WORLD_RUNTIME_LIMITS.visibleObservationsPerAgent),
    visibleKnowledge: visible.knowledge.slice(-WORLD_RUNTIME_LIMITS.visibleKnowledgePerAgent),
  };
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number) {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length || 1)) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function planActiveAgentsIndependently(
  frames: AutonomousDecisionFrame[],
  kernel: WorldKernel,
  planner: AgentPlanner,
  options: IndependentPlanningOptions = {},
): Promise<AgentProposal[]> {
  if (frames.length > ACTIVE_AGENT_LIMIT) throw new Error(`活跃 Agent 超过上限 ${ACTIVE_AGENT_LIMIT}`);
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 2));
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));
  const cached = options.proposalCache ?? new Map<string, AgentProposal>();
  const framesByRef = new Map(frames.map((frame) => [frame.ref, frame]));
  for (const [ref, proposal] of cached) {
    const frame = framesByRef.get(ref);
    if (!frame || !validateAgentProposal(proposal, frame).proposal) cached.delete(ref);
  }
  let pending: PlanningFailure[] = frames.filter((frame) => !cached.has(frame.ref)).map((frame) => ({ frame, issue: "尚未规划" }));

  for (let attempt = 1; attempt <= maxAttempts && pending.length; attempt += 1) {
    const current = pending;
    pending = [];
    const results = await runPool(current.map(({ frame, issue }) => async () => {
      options.onAgentStage?.({ ref: frame.ref, attempt, state: attempt === 1 ? "planning" : "retrying" });
      try {
        const raw = await planner(buildAgentPlanningProjection(frame, kernel), { attempt, ...(attempt > 1 ? { previousIssue: issue } : {}) });
        const checked = validateAgentProposal(raw, frame);
        return checked.proposal ? { frame, proposal: checked.proposal } : { frame, issue: checked.issue ?? "未知结构错误" };
      } catch (error) {
        return { frame, issue: error instanceof Error ? error.message : "模型调用失败" };
      }
    }), concurrency);
    for (const result of results) {
      if ("proposal" in result && result.proposal) {
        cached.set(result.frame.ref, result.proposal);
        options.onAgentStage?.({ ref: result.frame.ref, attempt, state: "ready" });
      } else pending.push({ frame: result.frame, issue: result.issue });
    }
  }

  if (pending.length) throw new AgentPlanningError(pending, [...cached.keys()]);
  return frames.map((frame) => cached.get(frame.ref)!).filter(Boolean);
}

function proposalRefs(proposals: AgentProposal[]) {
  return new Set(proposals.flatMap((proposal) => [proposal.agentRef, ...proposal.targetRefs]));
}

export function buildAdjudicatorProjection(kernel: WorldKernel, proposals: AgentProposal[]) {
  const refs = proposalRefs(proposals);
  const entityIds = new Set([...refs].filter((ref) => ref.startsWith("actor:") || ref.startsWith("faction:")).map((ref) => ref.slice(ref.indexOf(":") + 1)));
  const locationIds = new Set(proposals.flatMap((proposal) => [proposal.locationId, ...proposal.targetRefs.filter((ref) => ref.startsWith("location:")).map((ref) => ref.slice("location:".length))]).filter((id): id is string => Boolean(id)));
  const projectIds = new Set(proposals.flatMap((proposal) => proposal.targetRefs.filter((ref) => ref.startsWith("project:")).map((ref) => ref.slice("project:".length))));
  const projects = kernel.projects
    .filter((project) => projectIds.has(project.id) || entityIds.has(project.ownerId) || (project.status === "active" && project.updatedWeek >= kernel.currentWeek - 2))
    .sort((left, right) => right.updatedWeek - left.updatedWeek || left.id.localeCompare(right.id))
    .slice(0, WORLD_RUNTIME_LIMITS.adjudicatorProjects);
  projects.forEach((project) => entityIds.add(project.ownerId));
  const recentEvents = kernel.events
    .filter((event) => event.week >= kernel.currentWeek - 4 && (!locationIds.size || !event.locationId || locationIds.has(event.locationId) || event.actorIds.some((id) => entityIds.has(id)) || event.factionIds.some((id) => entityIds.has(id))))
    .slice(-WORLD_RUNTIME_LIMITS.adjudicatorRecentEvents);
  recentEvents.forEach((event) => {
    if (event.locationId) locationIds.add(event.locationId);
    event.actorIds.forEach((id) => entityIds.add(id));
    event.factionIds.forEach((id) => entityIds.add(id));
  });
  return {
    currentWeek: kernel.currentWeek,
    currentDate: kernel.currentDate,
    canon: kernel.canon,
    proposals,
    actors: kernel.actors.filter((actor) => entityIds.has(actor.id)).slice(0, WORLD_RUNTIME_LIMITS.adjudicatorActors),
    factions: kernel.factions.filter((faction) => entityIds.has(faction.id)).slice(0, WORLD_RUNTIME_LIMITS.adjudicatorFactions),
    projects,
    locations: kernel.locations.filter((location) => locationIds.has(location.id) || location.updatedWeek >= kernel.currentWeek - 2).slice(0, WORLD_RUNTIME_LIMITS.adjudicatorLocations),
    recentEvents,
  };
}

export function assertWorldAdjudicatorPayloadBudget(payload: unknown, maximum = WORLD_ADJUDICATOR_PAYLOAD_CHAR_LIMIT) {
  const characters = JSON.stringify(payload).length;
  if (characters > maximum) {
    throw new Error(`世界裁决投影超过字符预算：${characters}/${maximum}；必须先缩小相关性投影，禁止发送无界 Prompt`);
  }
  return characters;
}

function trimPayloadArray(container: Record<string, unknown> | null, key: string, maximum: number, newest = false) {
  if (!container || !Array.isArray(container[key])) return;
  const values = container[key] as unknown[];
  container[key] = newest ? values.slice(-maximum) : values.slice(0, maximum);
}

function trimPayloadText(container: Record<string, unknown>, key: string, maximum: number) {
  if (typeof container[key] === "string" && container[key].length > maximum) container[key] = container[key].slice(0, maximum);
}

function compactOptionalValue(value: unknown, maximumText: number, depth = 0): unknown {
  if (typeof value === "string") return value.length > maximumText ? value.slice(0, maximumText) : value;
  if (depth >= 5) return value;
  if (Array.isArray(value)) return value.map((item) => compactOptionalValue(item, maximumText, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compactOptionalValue(item, maximumText, depth + 1)]));
}

function compactPayloadArrayText(container: Record<string, unknown> | null, key: string, maximumText: number) {
  if (!container || !Array.isArray(container[key])) return;
  container[key] = (container[key] as unknown[]).map((item) => compactOptionalValue(item, maximumText));
}

export function fitWorldAdjudicatorPayload<T extends Record<string, unknown>>(input: T, maximum = WORLD_ADJUDICATOR_PAYLOAD_CHAR_LIMIT): T {
  const payload = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  if (JSON.stringify(payload).length <= maximum) return payload as T;

  trimPayloadArray(payload, "recentWorld", 2);
  trimPayloadArray(payload, "recentSignals", 6);
  trimPayloadArray(payload, "knownEvidence", 16, true);
  trimPayloadArray(payload, "pivots", 8, true);
  trimPayloadArray(payload, "timeline", 16, true);
  trimPayloadArray(payload, "factions", 12);
  trimPayloadArray(payload, "canonActors", 12);
  trimPayloadText(payload, "dynamicMemory", 7_000);
  trimPayloadText(payload, "authorizedLore", 10_000);
  trimPayloadText(payload, "designerSupplement", 4_000);

  const organization = recordOf(payload.organizationState);
  trimPayloadArray(organization, "formulas", 16, true);
  trimPayloadArray(organization, "branches", 12, true);
  trimPayloadArray(organization, "members", 10);
  trimPayloadArray(organization, "recruits", 8);
  trimPayloadArray(organization, "unresolvedIssues", 10, true);

  const strategy = recordOf(payload.factionStrategy);
  trimPayloadArray(strategy, "diplomacy", 20, true);
  trimPayloadArray(strategy, "latestOutcomes", 8, true);

  const adjudicator = recordOf(payload.adjudicatorWorld);
  trimPayloadArray(adjudicator, "recentEvents", 28, true);
  trimPayloadArray(adjudicator, "projects", 24);
  trimPayloadArray(adjudicator, "locations", 12);

  if (JSON.stringify(payload).length > maximum) {
    trimPayloadText(payload, "dynamicMemory", 4_000);
    trimPayloadText(payload, "authorizedLore", 6_000);
    trimPayloadText(payload, "designerSupplement", 1_500);
    trimPayloadArray(adjudicator, "recentEvents", 16, true);
    trimPayloadArray(adjudicator, "projects", 16);
  }

  // 长线世界的最后一级相关性投影。当前行动契约与独立 Agent 提案是裁决输入，
  // 永不在这里裁剪；只继续收缩可由持久账本恢复的历史、旁支实体与参考资料。
  if (JSON.stringify(payload).length > maximum) {
    trimPayloadArray(payload, "recentWorld", 1);
    trimPayloadArray(payload, "recentSignals", 4);
    trimPayloadArray(payload, "knownEvidence", 8, true);
    trimPayloadArray(payload, "pivots", 4, true);
    trimPayloadArray(payload, "timeline", 8, true);
    trimPayloadArray(payload, "factions", 8);
    trimPayloadArray(payload, "canonActors", 8);
    trimPayloadText(payload, "dynamicMemory", 2_000);
    trimPayloadText(payload, "authorizedLore", 3_500);
    trimPayloadText(payload, "designerSupplement", 500);

    trimPayloadArray(organization, "offices", 8);
    trimPayloadArray(organization, "formulas", 10, true);
    trimPayloadArray(organization, "branches", 8, true);
    trimPayloadArray(organization, "departments", 8);
    trimPayloadArray(organization, "members", 8);
    trimPayloadArray(organization, "recruits", 6);
    trimPayloadArray(organization, "unresolvedIssues", 6, true);

    trimPayloadArray(strategy, "profiles", 10);
    trimPayloadArray(strategy, "diplomacy", 12, true);
    trimPayloadArray(strategy, "latestOutcomes", 5, true);

    trimPayloadArray(adjudicator, "actors", 12);
    trimPayloadArray(adjudicator, "factions", 10);
    trimPayloadArray(adjudicator, "recentEvents", 10, true);
    trimPayloadArray(adjudicator, "projects", 12);
    trimPayloadArray(adjudicator, "locations", 8);

    const campaign = recordOf(payload.campaignWorld);
    trimPayloadArray(campaign, "stages", 4);
    trimPayloadArray(campaign, "recentEvents", 8, true);

    const highSequence = recordOf(payload.highSequenceLedger);
    trimPayloadArray(highSequence, "characteristics", 24, true);
    trimPayloadArray(highSequence, "uniquenesses", 10);
    trimPayloadArray(highSequence, "sefirot", 5);
    trimPayloadArray(highSequence, "recentEvents", 10, true);

    for (const key of ["recentWorld", "recentSignals", "knownEvidence", "pivots", "timeline", "factions", "canonActors"]) compactPayloadArrayText(payload, key, 240);
    for (const key of ["offices", "formulas", "branches", "departments", "members", "recruits", "unresolvedIssues"]) compactPayloadArrayText(organization, key, 240);
    for (const key of ["profiles", "diplomacy", "latestOutcomes"]) compactPayloadArrayText(strategy, key, 240);
    for (const key of ["actors", "factions", "recentEvents", "projects", "locations"]) compactPayloadArrayText(adjudicator, key, 240);
    for (const key of ["stages", "recentEvents"]) compactPayloadArrayText(campaign, key, 240);
    for (const key of ["characteristics", "uniquenesses", "sefirot", "recentEvents"]) compactPayloadArrayText(highSequence, key, 240);
  }
  assertWorldAdjudicatorPayloadBudget(payload, maximum);
  return payload as T;
}
