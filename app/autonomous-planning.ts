import { callModel, userFacingModelError, type AiConfig } from "./ai-client.ts";
import type { LegacyLoreRecord } from "./rag/index.ts";
import { retrieveLoreContextAsync, type RagBridgeAudience } from "./rag/client.ts";
import type { CanonKnowledgeHorizon } from "./rag/types.ts";
import type { AgentPlanningProjection } from "./world-runtime.ts";
import { extractJson } from "./model-output.ts";

export type AutonomousPlanningRuntime = {
  week: number;
  date: string;
  horizon: CanonKnowledgeHorizon;
  baseRevision: number;
};

export function autonomousRagAudience(projection: Pick<AgentPlanningProjection, "memoryAudience">): RagBridgeAudience["kind"] {
  return projection.memoryAudience.kind === "faction" ? "faction-private" : "actor-private";
}

async function loreForAutonomousAgent(
  records: LegacyLoreRecord[],
  projection: AgentPlanningProjection,
  runtime: AutonomousPlanningRuntime,
) {
  const knownLoreIds = projection.authorizedLoreIds;
  const principalRef = projection.agent.ref as `actor:${string}` | `faction:${string}`;
  return retrieveLoreContextAsync(records, {
    query: `${projection.agent.displayName} ${projection.agent.currentObjective} ${projection.agent.nextAction} ${projection.ownedProjects.map((project) => project.title).join(" ")}`,
    audience: { kind: autonomousRagAudience(projection), principalRef, purpose: projection.memoryAudience.kind === "faction" ? "autonomous-faction" : "autonomous-actor", knownLoreIds, topicGrants: [] },
    limit: 8,
    maxChars: 3_500,
    week: runtime.week,
    gameDate: runtime.date,
    horizon: runtime.horizon,
  });
}

export async function requestAutonomousAgentProposal(
  config: AiConfig,
  records: LegacyLoreRecord[],
  projectionInput: AgentPlanningProjection,
  runtime: AutonomousPlanningRuntime,
  context: { attempt: number; previousIssue?: string },
) {
  if (typeof window !== "undefined" && typeof window.mistInference?.requestAutonomous === "function") {
    const response = await window.mistInference.requestAutonomous({
      task: "autonomous-planning",
      config: {
        provider: config.provider,
        endpoint: config.endpoint,
        model: config.model,
        timeoutMs: config.timeoutMs,
      },
      autonomousRequest: {
        principalRef: projectionInput.agent.ref,
        planningWeek: projectionInput.week,
        baseRevision: runtime.baseRevision,
        attempt: Math.max(0, context.attempt - 1),
      },
    });
    if (!response.ok || typeof response.content !== "string" || !response.content.trim()) {
      throw new Error(userFacingModelError(response.error ?? "MODEL_REQUEST_FAILED"), { cause: response.error });
    }
    const raw = extractJson(response.content);
    return raw.proposal && typeof raw.proposal === "object" && !Array.isArray(raw.proposal) ? raw.proposal : raw;
  }
  const lore = await loreForAutonomousAgent(records, projectionInput, runtime);
  const projection = Object.fromEntries(
    Object.entries(projectionInput).filter(([key]) => key !== "authorizedLoreIds" && key !== "knowledgeSourceEventIds"),
  ) as Omit<AgentPlanningProjection, "authorizedLoreIds" | "knowledgeSourceEventIds">;
  const repair = context.previousIssue
    ? `\n上一次提案未通过本主体的局部校验：${context.previousIssue}。只修复该问题，不改变主体掌握的信息。`
    : "";
  const raw = extractJson(await callModel(
    config,
    "你正在扮演《灰雾纪事》持续世界中的一个独立主体。你只能依据本次提供的自身投影、私有记忆引用和已授权知识做本周计划；不得假设知道其他主体的私密提案或世界真相。你只提出意图，不决定成功，不修改资源和事实。允许行动、延续、观察、隐藏、休整或等待；没有状态驱动的理由时应自然等待。只返回严格JSON。",
    `为这个主体独立形成同一周起点上的提案。返回：{"proposal":{"planningWeek":${projection.week},"agentRef":"${projection.agent.ref}","disposition":"act|continue|observe|hide|rest|wait","intent":"本周意图","rationale":"只能引用自身可见依据","locationId":"只能取自agent.allowedLocationIds或省略","targetRefs":["只能取自agent.allowedTargetRefs"],"requiredKnowledgeIds":["只能取自agent.knownKnowledgeIds"],"usedMemoryIds":["实际影响本提案且只能取自memoryReferenceIds；未使用则为空"],"conditionalOn":"仅限本周开始前已经存在的条件命令或省略"}}。结构化 targetRefs 与 locationId 必须逐字取自允许列表；未知或未获知的目标只能保留在自然语言 intent 中，不能猜测实体引用。knowledge id 绝不能放入 targetRefs，只能放入 requiredKnowledgeIds；usedMemoryIds 只能声明实际影响判断的已展示记忆，不能照抄全部记忆；没有明确目标时 targetRefs 必须为 []。不要为了热闹强迫主体行动。\n${JSON.stringify({ projection, authorizedKnownLore: lore.context })}${repair}`,
    {
      task: "autonomous-planning",
      json: true,
      maxTokens: 1_100,
      temperature: Math.max(.55, Math.min(.92, .55 + projection.agent.riskTolerance / 240)),
    },
  ));
  return raw.proposal && typeof raw.proposal === "object" && !Array.isArray(raw.proposal) ? raw.proposal : raw;
}
