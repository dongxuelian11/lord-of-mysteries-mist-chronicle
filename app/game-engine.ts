import {
  ActionContract,
  type ActionCausalReceipts,
  ActionResult,
  Ability,
  ChronicleChapter,
  DISTRICTS,
  EvidenceNode,
  FactionState,
  GameState,
  materialsFor,
  PATHWAYS,
  type PathwayId,
  RiskLevel,
  TimelineEvent,
  type ScheduledAction,
  WorldFact,
  WorldMove,
  WorldSnapshot,
} from "./game-model";
import { createFinaleCampaign } from "./finale-system";
import { callModel as invokeModel, type AiConfig } from "./ai-client";
import { type LegacyLoreRecord } from "./rag";
import { listRuntimeChunkIds, retrieveLoreContextAsync } from "./rag/client";
import {
  deriveLocalMemory,
  deriveMemoryFromWorldState,
  emptyMemoryState,
  memoryPromptBlockWithIds,
  submitMemoryDelivery,
  markMemoryPresented,
  markMemoryRecalled,
  actorAudience,
  factionAudience,
  narratorAudience,
  worldSystemAudience,
} from "./memory/index";
export type LoreRecord = LegacyLoreRecord;
import { applyWorldTurn, type WorldTurnDelta } from "./world-kernel";
import { abilitiesFor, abilityRuleSummary } from "./pathway-abilities";
import { advanceAdvancementStage, createAdvancementProcess, evaluateActing } from "./progression-system";
import { advanceOrganizationCausality } from "./organization-causality";
import { advanceFateWeek } from "./fate/index.ts";
import { advanceOrganizationManagementWeek, attachIntelligenceToBacklundMap, syncSealedArtifactsFromInventory } from "./organization-management.ts";
import {
  actionAdjudicationLedgerEvents,
  adjudicateWorldActionProposals,
  createActionRuleContext,
  proposalFromAgentProposal,
  proposalFromScheduledAction,
} from "./world-actions.ts";
import {
  appendWorldLedgerEvents,
  commitWorldLedgerWeek,
  createWorldLedger,
  recordWorldLedgerPhase,
} from "./world-ledger.ts";
import {
  advanceAutonomousWorldState,
} from "./autonomous-agents.ts";
import {
  assertWorldAdjudicatorPayloadBudget,
  buildAdjudicatorProjection,
  fitWorldAdjudicatorPayload,
} from "./world-runtime.ts";
import { buildWorldAdjudicatorPrompt, WORLD_ADJUDICATOR_SYSTEM } from "./world-adjudicator-prompt.ts";
import { resolveFactionStrategyRound } from "./faction-strategy.ts";
import { participationSceneModelView, type ParticipationScene } from "./participation-scene.ts";
import { applyHighSequenceActionResults, highSequenceAdvancementRequirement, incorporateAdvancementAsset } from "./high-sequence-ledger.ts";
import { advanceCampaignWorld, applyCampaignActionResults, applyCampaignSignals, campaignWeeklyYield } from "./campaign-world.ts";
import { extractJson, textSimilarity } from "./model-output.ts";
import { actionTextBoundaryIssue } from "./action-boundaries.ts";
import { repairActionReports, requestWorldEnvelope } from "./world-envelope.ts";
import { planAutonomousAgentsForWeek, releaseAutonomousPlanningCache } from "./agent-planning-service.ts";
import { buildWorldAdjudicatorInput, projectLegacyWorldCompatibility } from "./world-authority.ts";
import { advanceAttentionSimulation } from "./attention-simulation.ts";
import { adaptWorldAdjudication } from "./world-output-adapter.ts";
import { attachOrganizationAdjudicationProtocol, WORLD_KERNEL_PROTOCOL, WORLD_PROPOSAL_PROVENANCE_PROTOCOL } from "./world-adjudication-protocol.ts";
import { chronicleSummaryFromCausality, advancementRetrospective } from "./chronicle-causality.ts";
export type { AiConfig } from "./ai-client";
export { actionTextBoundaryIssue } from "./action-boundaries.ts";
export const callModel = invokeModel;

export async function generateParticipationSceneBeat(config: AiConfig, game: GameState, scene: ParticipationScene, intent: string) {
  const finalBeat = scene.phase === "crisis";
  const visibleResolution = finalBeat ? scene.lockedResolution : undefined;
  const response = await callModel(config,
    "你是《灰雾纪事》的玩家亲历场景叙事器。规则引擎已经在后台锁定事实，你只能把玩家刚输入的自由行动转成连续、具体、有限视角的小说现场。不得替玩家补充未输入的关键决定，不得提前泄露后台结算；只有收到visibleResolution时才能在当前段落末尾写出行动结果。必须遵守红线与撤退条件。不要输出列表、数值、系统提示或JSON。模型失败必须直接报错，禁止降级文本。",
    `场景：${JSON.stringify(participationSceneModelView(scene))}\n玩家行动：${intent}\n${visibleResolution ? `本段结束时必须忠实呈现已锁定结果：${JSON.stringify(visibleResolution)}` : "本段只推进现场并留下新的可操作局面，不宣布最终成败。"}\n用140至320字写当前一段。`,
    { maxTokens: 1100, temperature: scene.mode === "combat" ? .82 : .74 },
  );
  if (!response.trim()) throw new Error("亲历场景模型没有返回正文");
  return response.trim().slice(0, 1800);
}

function hash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output >>> 0);
}

function canonicalIdentityText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function actionIdentityHash(contract: Pick<ActionContract,
  "rawIntent" | "title" | "kind" | "target" | "desiredOutcome" | "approach" | "leaderId" | "memberIds" |
  "executionMode" | "districtId" | "abilityIds" | "facilityId" | "days" | "budget" | "risk" | "redLines" |
  "retreat" | "resourceCommitment" | "authorization" | "requiredKnowledgeIds" | "sourceIssueId" |
  "strategyIntentId" | "causeEventIds" | "opportunityId" | "methodTags"
>) {
  return hash(JSON.stringify({
    rawIntent: canonicalIdentityText(contract.rawIntent),
    title: canonicalIdentityText(contract.title),
    kind: contract.kind,
    target: canonicalIdentityText(contract.target),
    desiredOutcome: canonicalIdentityText(contract.desiredOutcome),
    approach: canonicalIdentityText(contract.approach),
    leaderId: contract.leaderId,
    memberIds: [...new Set(contract.memberIds)].sort(),
    executionMode: contract.executionMode ?? "delegated",
    districtId: contract.districtId,
    abilityIds: [...new Set(contract.abilityIds)].sort(),
    facilityId: contract.facilityId ?? null,
    days: contract.days,
    budget: contract.budget,
    resourceCommitment: contract.resourceCommitment,
    authorization: contract.authorization,
    requiredKnowledgeIds: [...new Set(contract.requiredKnowledgeIds)].sort(),
    sourceIssueId: contract.sourceIssueId ?? null,
    strategyIntentId: contract.strategyIntentId ?? null,
    causeEventIds: [...new Set(contract.causeEventIds)].sort(),
    risk: contract.risk,
    redLines: canonicalIdentityText(contract.redLines),
    retreat: canonicalIdentityText(contract.retreat),
    opportunityId: contract.opportunityId ?? null,
    methodTags: [...new Set(contract.methodTags ?? [])].sort(),
  })).toString(36);
}

function nextActionOrdinal(game: GameState) {
  return game.schedule.reduce((maximum, action, index) => Math.max(maximum, action.actionOrdinal ?? index + 1), 0) + 1;
}

function authoritativeActionId(game: GameState, contract: ActionContract, ordinal: number) {
  return `action:${game.week}:${ordinal}:${actionIdentityHash(contract)}`;
}

function knownLoreIds(game: GameState, holderId: string) {
  const holderRef = holderId === "player" ? "player" : `actor:${holderId}`;
  return [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes(holderId) || node.holderRefs?.includes(holderRef)).flatMap((node) => node.loreRecordIds ?? []))];
}

function knowledgeHorizon(game: GameState, wider = false) {
  const canon = game.worldKernel?.canon;
  const base = canon?.knowledgeHorizon ?? {
    work: "LOTM" as const,
    maxVolume: 1,
    maxAbsoluteChapter: 195,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned" as const,
  };
  if (!wider) return base;
  return {
    ...base,
    maxVolume: 7,
    maxAbsoluteChapter: 1258,
    worldlineMode:
      canon?.mode === "diverging" ? ("canon-diverged" as const) : ("canon-aligned" as const),
  };
}

async function loreForPlayer(records: LoreRecord[], game: GameState, query: string, maxChars = 5_000) {
  return retrieveLoreContextAsync(records, {
    query,
    audience: { kind: "player-facing-narrator", knownLoreIds: knownLoreIds(game, "player"), topicGrants: [] },
    limit: 12,
    maxChars,
    week: game.week,
    gameDate: game.date,
    horizon: knowledgeHorizon(game, false),
  });
}

async function loreForActor(records: LoreRecord[], game: GameState, member: GameState["members"][number], query: string, maxChars = 5_000) {
  const specialty = `${member.role} ${member.specialty} ${member.background ?? ""}`;
  const topicGrants = [
    ...(member.pathway ? ["pathways", "beyonder-system"] : []),
    ...(/神秘|仪式|封印|灵界|梦境|非凡/.test(specialty) ? ["rituals", "spirit-world", "sealed-artifacts"] : []),
    ...(/情报|调查|警|外交|教会/.test(specialty) ? ["factions"] : []),
  ];
  return retrieveLoreContextAsync(records, {
    query,
    audience: { kind: "actor-private", knownLoreIds: knownLoreIds(game, member.id), topicGrants },
    limit: 12,
    maxChars,
    week: game.week,
    gameDate: game.date,
    horizon: knowledgeHorizon(game, false),
  });
}

async function loreForWorld(records: LoreRecord[], game: GameState, query: string, maxChars = 12_000) {
  return retrieveLoreContextAsync(records, {
    query,
    audience: { kind: "world-simulation-internal", knownLoreIds: [], topicGrants: [] },
    limit: 24,
    maxChars,
    week: game.week,
    gameDate: game.date,
    horizon: knowledgeHorizon(game, true),
  });
}


function isExplicitConstruction(intent: string) {
  const positive = /(?:^|[，。；、\s])(?:修建|建造|扩建|增设|改建|升级|布置|设立)(?:一座|一处|一间|新的|现有)?[^，。；]{0,24}(?:据点|房间|设施|实验室|仓库|安全屋|工坊|档案室|仪式室)|(?:改造|升级)(?:现有|组织的|我们的)?[^，。；]{0,18}(?:据点|房间|设施|工坊|档案室|仪式室)/;
  return positive.test(intent) && !/(?:不要|不得|避免|无需|不打算)[^，。；]{0,8}(?:修建|建造|扩建|改造|升级|设立)/.test(intent);
}

function isInternalGovernanceIntent(intent: string) {
  const governanceObject = /(?:招募|人事|成员|组织|内部|外围联络点)[^，。；]{0,18}(?:档案|名单|流程|制度|权限|保密|分级|核验|审阅|出入记录|内部整顿)|(?:档案|名单)[^，。；]{0,14}(?:保密|分级|核验|权限|泄露)|内部整顿/;
  const explicitExternalRecruit = /(?:招募|邀请|吸收|说服|发展)[^，。；]{0,18}(?:加入|入会|成为成员|成为线人|候选人|求职者|申请人)|(?:接触|面谈|约谈)[^，。；]{0,16}(?:候选人|求职者|申请人)/;
  const affirmativeIntent = intent.replace(/(?:不主动|不私自|不要|不得|禁止|避免|不)[^。；]{0,40}(?:候选人|求职者|申请人|加入组织|成为成员|成为线人)/g, "");
  return governanceObject.test(intent) && !explicitExternalRecruit.test(affirmativeIntent);
}

function isRecruitmentIntent(intent: string) {
  if (isInternalGovernanceIntent(intent)) return false;
  return /求职申请|候选人|面谈|临时合作|试用|发展线人|(?:招募|邀请|吸收|说服)[^，。；]{0,18}(?:加入|入会|成员|线人|候选人|人选)/.test(intent);
}

function inferKind(intent: string): ActionContract["kind"] {
  if (isExplicitConstruction(intent)) return "建设";
  if (isInternalGovernanceIntent(intent)) return "自由行动";
  const primaryClause = intent.split(/[，。；]/).map((part) => part.trim()).find((part) => part && !/^(?:不要|不得|避免|不惊动|不接触|不伤害|禁止)/.test(part)) ?? intent;
  const candidates: Array<[ActionContract["kind"], RegExp]> = [
    ["调查", /调查|追踪|查明|寻找|监视|观察|侦察|记录|潜入|打听/],
    ["交涉", /谈判|说服|交涉|拜访|联系|交易|举报/],
    ["研究", /研究|配方|材料|样本|档案|分析|鉴定/],
    ["仪式", /仪式|占卜|通灵|祈祷|召唤/],
    ["招募", /邀请|吸收|加入组织|发展线人|求职申请|候选人|面谈|临时合作|试用|招募.{0,12}(?:成员|人选|候选人|加入)/],
    ["休整", /休息|休整|恢复|处理冲突|开会|训练|演练|复盘|培训|练习/],
  ];
  const firstAction = candidates.map(([kind, pattern]) => ({ kind, index: primaryClause.search(pattern) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index)[0];
  if (firstAction) return firstAction.kind;
  return "自由行动";
}

function inferRisk(intent: string, districtId: string, abilityCount: number): RiskLevel {
  const danger = DISTRICTS.find((district) => district.id === districtId)?.danger ?? 50;
  let score = danger + abilityCount * 3;
  if (/王室|教会总部|真神|天使|直接袭击|献祭|强行|高位/.test(intent)) score += 35;
  if (/秘密|撤退|远距离|只观察|不接触/.test(intent)) score -= 10;
  return score >= 95 ? "致命" : score >= 70 ? "高" : score >= 42 ? "中" : "低";
}

function targetFrom(intent: string) {
  const quoted = intent.match(/[“"]([^”"]{2,32})[”"]/)?.[1];
  if (quoted) return quoted;
  const normalized = intent.replace(/[、,]/g, "，").replace(/\s+/g, " ").trim();
  if (isInternalGovernanceIntent(normalized)) {
    const governanceTarget = normalized.match(/(?:统筹|整理|整顿|核验|复核)([^，。；]{2,32})/)?.[1];
    if (governanceTarget) return governanceTarget.replace(/^(?:一下|有关|关于|针对)/, "").slice(0, 28);
  }
  const match = normalized.match(/(?:调查|查明|寻找|追踪|观察|侦察|记录|接触|约谈|研究|鉴定|审计|整理|筛选|训练|演练|检查|监视|潜入|打听|修建|建造|扩建|增设|改造|升级|招募|邀请|说服|联系|提醒)([^，。；]{1,40})/);
  const candidate = (match?.[1] ?? normalized).split(/(?:以便|确保|同时|并且|并|但|不要|不得|避免|不惊动|不接触|不伤害|撤退|撤离|中止)/)[0]
    .replace(/^(?:一下|有关|关于|针对|一个|一间|一处|新的)/, "").replace(/(?:的情况|的线索|的问题)$/, "").trim();
  return candidate.slice(0, 28) || "未命名目标";
}

function inferMethodTags(intent: string) {
  const tags: string[] = [];
  const rules: [RegExp, string][] = [
    [/账目|采购|档案|记录|报纸|名单/, "document"], [/跟踪|追踪|尾随|路线|马车/, "track"],
    [/潜入|开锁|暗门|进入|撤离/, "access"], [/交谈|说服|询问|谈判|证人/, "social"],
    [/灵视|占卜|仪式|鉴定|污染|非凡/, "occult"], [/建设|改造|设施|据点/, "build"],
    [/求援|教会|报告|提交证据/, "official"], [/救助|保护|疏散|治疗/, "protect"],
  ];
  for (const [pattern, tag] of rules) if (pattern.test(intent)) tags.push(tag);
  return tags.length ? tags : ["open"];
}

const AUTHORIZATION_SCOPES: ActionContract["authorization"]["scope"][] = ["strict", "bounded", "broad"];

function uniqueDirectiveText(values: unknown[], maximum = 12) {
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, maximum);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

function explicitDirectiveAmount(intent: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = intent.match(pattern);
    const captured = match?.slice(1).find((value) => value !== undefined);
    if (captured !== undefined) return Number(captured);
  }
  return undefined;
}

function inferResourceCommitment(intent: string, game: GameState, kind: ActionContract["kind"], baselineMoney: number): ActionContract["resourceCommitment"] {
  const posture: ActionContract["resourceCommitment"]["posture"] = /倾尽|全部资源|所有可用资源|全力投入|不惜代价|孤注一掷/.test(intent)
    ? "all-in"
    : /大量|重兵|重点投入|充分投入|充足|足够|优先保障|不计成本|强力增援|增派|加大投入/.test(intent)
      ? "substantial"
      : /最低限度|最小投入|少量|小额|试探|低调|节省|只派|不惊动/.test(intent)
        ? "minimal"
        : "balanced";
  const factor = posture === "minimal" ? .55 : posture === "substantial" ? 1.65 : posture === "all-in" ? 2.5 : 1;
  const baseManpower = kind === "建设" ? 4 : kind === "招募" ? 2 : kind === "休整" ? 0 : kind === "研究" || kind === "仪式" ? 1 : 2;
  const baseMaterials = kind === "仪式" || /封印|污染|神秘材料|非凡材料/.test(intent) ? 1 : 0;
  const available = game.management?.resources ?? { money: game.money, manpower: 0, extraordinaryMaterials: 0 };
  const explicitMoney = explicitDirectiveAmount(intent, [
    /[£￡]\s*(\d{1,4})/,
    /(?:预算|经费|资金|投入|花费|拨款)[^\d]{0,8}(\d{1,4})\s*(?:镑|金镑)?/,
    /(\d{1,4})\s*(?:镑|金镑)(?:预算|经费|资金)?/,
  ]);
  const explicitManpower = explicitDirectiveAmount(intent, [
    /(?:人力|基层人手|支援人手|外勤人手)[^\d]{0,8}(\d{1,3})/,
    /(\d{1,3})\s*(?:名|人)(?:基层人手|人力|外勤|支援人员|普通成员)/,
  ]);
  const explicitMaterials = explicitDirectiveAmount(intent, [
    /(?:非凡材料|神秘材料|材料)[^\d]{0,8}(\d{1,3})/,
    /(\d{1,3})\s*(?:份|件|单位)?(?:非凡材料|神秘材料)/,
  ]);
  const inferredMoney = posture === "all-in"
    ? Math.max(baselineMoney, Math.min(240, available.money))
    : Math.round(baselineMoney * factor);
  const inferredManpower = posture === "all-in" ? available.manpower : Math.round(baseManpower * factor);
  const inferredMaterials = posture === "all-in" ? available.extraordinaryMaterials : Math.round(baseMaterials * factor);
  return {
    posture,
    money: boundedInteger(explicitMoney, inferredMoney, 0, 240),
    manpower: /不投入人力|不调用人力|不带人手/.test(intent) ? 0 : boundedInteger(explicitManpower, inferredManpower, 0, available.manpower),
    extraordinaryMaterials: /不投入(?:任何)?(?:非凡|神秘)?材料|不用(?:任何)?(?:非凡|神秘)?材料/.test(intent) ? 0 : boundedInteger(explicitMaterials, inferredMaterials, 0, available.extraordinaryMaterials),
  };
}

function inferAuthorization(intent: string) {
  const scope: ActionContract["authorization"]["scope"] = /逐项请示|遇事请示|先请示后行动|每一步.*请示|未经(?:我|议长|首领)?批准不得|没有(?:我|议长|首领)?的?批准不得|只允许|严格按照|不得自行|任何变化.*请示/.test(intent)
    ? "strict"
    : /全权|自行决定|无需请示|无须请示|不必请示|临机决断|便宜行事|放手去做|广泛授权/.test(intent)
      ? "broad"
      : "bounded";
  const clauses = intent.split(/[。；;，,\n]/).map((part) => part.trim()).filter(Boolean);
  const majorClauses = intent.split(/[。；;\n]/).map((part) => part.trim()).filter(Boolean);
  const explicitRedLines = clauses.filter((part) => /不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪|只做内部|只(?:整理|汇总|比对|核对)/.test(part));
  const redLines = uniqueDirectiveText([
    ...explicitRedLines,
    "不伤害无关者",
    "不把未经验证的假设当作公开指控",
  ]);
  const explicitEscalation = majorClauses.filter((part) => /请示|上报|汇报|报告|批准|同意/.test(part) && !/无需|无须|不必|不用/.test(part));
  const defaultEscalation = scope === "strict"
    ? ["改变目标、手段、执行者或资源投入前必须请示", "接触未授权对象或触及任何红线前必须请示"]
    : scope === "broad"
      ? ["触及任何红线、改变核心目标或出现撤退条件时必须请示"]
      : ["需要突破红线、扩大资源投入或改变核心目标时必须请示", "出现超出队伍层次的威胁、身份暴露或撤退条件时必须请示"];
  const explicitRetreat = clauses.find((part) => /撤退|撤离|中止|求援/.test(part)) ?? majorClauses.find((part) => /撤退|撤离|中止|求援/.test(part));
  return {
    scope,
    redLines,
    mustEscalateWhen: uniqueDirectiveText([...explicitEscalation, ...defaultEscalation]),
    retreatCondition: explicitRetreat || "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
  } satisfies ActionContract["authorization"];
}

function directiveReferences(game: GameState, intent: string) {
  const issue = game.organizationIssues
    .map((item) => ({ item, score: intent.includes(item.id) || intent.includes(item.title) || intent.includes(item.sourceId) ? 1 : textSimilarity(intent, `${item.title}${item.summary}`) }))
    .sort((left, right) => right.score - left.score)[0];
  const strategy = game.playerIntents
    .filter((item) => item.state === "active")
    .map((item) => ({ item, score: intent.includes(item.id) || intent.includes(item.text) ? 1 : textSimilarity(intent, item.text) }))
    .sort((left, right) => right.score - left.score)[0];
  const visibleKnowledge = (game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.visibility === "player" || node.holderIds.includes("player") || node.holderRefs?.includes("player"));
  const requiredKnowledge = visibleKnowledge.filter((node) => intent.includes(node.id) || intent.includes(node.subject) || textSimilarity(intent, `${node.subject}${node.statement}`) >= .28);
  const visibleEvents = (game.worldKernel?.events ?? []).filter((event) => event.visibility === "public" || event.visibility === "player" || event.witnessRefs?.includes("player"));
  const sourceEventIds = new Set(requiredKnowledge.map((node) => node.sourceEventId).filter((id): id is string => Boolean(id)));
  const causeEvents = visibleEvents.filter((event) => sourceEventIds.has(event.id) || intent.includes(event.id) || intent.includes(event.title) || textSimilarity(intent, `${event.title}${event.detail}`) >= .28);
  return {
    requiredKnowledgeIds: requiredKnowledge.map((node) => node.id).slice(0, 12),
    sourceIssueId: issue?.score >= .28 ? issue.item.id : undefined,
    strategyIntentId: strategy?.score >= .28 ? strategy.item.id : undefined,
    causeEventIds: causeEvents.map((event) => event.id).slice(0, 12),
  };
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mergeAuthorization(local: ActionContract["authorization"], proposedValue: unknown): ActionContract["authorization"] {
  const proposed = recordValue(proposedValue);
  if (!proposed) return local;
  const proposedScope = AUTHORIZATION_SCOPES.includes(String(proposed.scope) as ActionContract["authorization"]["scope"])
    ? String(proposed.scope) as ActionContract["authorization"]["scope"]
    : local.scope;
  const scopeRank = (scope: ActionContract["authorization"]["scope"]) => AUTHORIZATION_SCOPES.indexOf(scope);
  const scope = scopeRank(proposedScope) <= scopeRank(local.scope) ? proposedScope : local.scope;
  const proposedRedLines = Array.isArray(proposed.redLines) ? proposed.redLines : typeof proposed.redLines === "string" ? proposed.redLines.split(/[；;]/) : [];
  const proposedEscalation = Array.isArray(proposed.mustEscalateWhen) ? proposed.mustEscalateWhen : typeof proposed.mustEscalateWhen === "string" ? proposed.mustEscalateWhen.split(/[；;]/) : [];
  const proposedRetreat = typeof proposed.retreatCondition === "string" ? proposed.retreatCondition.trim() : "";
  return {
    scope,
    redLines: uniqueDirectiveText([...local.redLines, ...proposedRedLines]),
    mustEscalateWhen: uniqueDirectiveText([...local.mustEscalateWhen, ...proposedEscalation]),
    retreatCondition: uniqueDirectiveText([local.retreatCondition, proposedRetreat], 4).join("；"),
  };
}

function normalizeResourceCommitment(local: ActionContract["resourceCommitment"], proposedValue: unknown, legacyBudget: unknown, intent: string, game: GameState): ActionContract["resourceCommitment"] {
  if (/(?:预算|经费|资金|投入|拨款|人力|人手|非凡材料|神秘材料|全部资源|倾尽|全力|不惜代价|最小投入|最低限度|少量|大量|重兵)/.test(intent) || /[£￡]\s*\d|\d+\s*(?:镑|金镑)/.test(intent)) return local;
  const proposed = recordValue(proposedValue);
  const posture = proposed && ["minimal", "balanced", "substantial", "all-in"].includes(String(proposed.posture))
    ? String(proposed.posture) as ActionContract["resourceCommitment"]["posture"]
    : local.posture;
  const available = game.management?.resources ?? { money: game.money, manpower: 0, extraordinaryMaterials: 0 };
  return {
    posture,
    money: boundedInteger(proposed?.money ?? legacyBudget, local.money, 0, 240),
    manpower: boundedInteger(proposed?.manpower, local.manpower, 0, available.manpower),
    extraordinaryMaterials: boundedInteger(proposed?.extraordinaryMaterials, local.extraordinaryMaterials, 0, available.extraordinaryMaterials),
  };
}

export function localContract(args: {
  intent: string;
  game: GameState;
  leaderId: string;
  districtId: string;
  abilityIds: string[];
}): ActionContract {
  const kind = inferKind(args.intent);
  const district = DISTRICTS.find((item) => item.id === args.districtId) ?? DISTRICTS[0];
  const routingIntent = args.intent.replace(/(?:不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪)[^，。；]*/g, "");
  const namedMember = args.leaderId === "organization"
    ? [...args.game.members].sort((left, right) => right.name.length - left.name.length).find((member) => args.intent.includes(member.name) || (member.name.includes("·") && args.intent.includes(member.name.split("·")[0])))
    : undefined;
  const automaticMember = args.leaderId === "organization"
    ? namedMember ?? (/灵视|占卜|仪式|污染|封印|尸体|灵体/.test(routingIntent) ? args.game.members.find((item) => item.id === "rowan")
      : /账目|采购|建设|设施|证件|预算|合法/.test(routingIntent) ? args.game.members.find((item) => item.id === "cedric")
        : /报纸|贵族|消息|交涉|询问|线人/.test(routingIntent) ? args.game.members.find((item) => item.id === "ines")
          : args.game.members.find((item) => item.id === "mara"))
    : undefined;
  const effectiveLeaderId = automaticMember?.id ?? args.leaderId;
  const leader = effectiveLeaderId === "player" ? { name: args.game.playerName || "组织负责人", specialty: PATHWAYS[args.game.pathwayId].name } : automaticMember ?? args.game.members.find((item) => item.id === effectiveLeaderId);
  const matchedOpportunity = args.game.opportunities.find((item) => item.state === "available" && (args.intent.includes(item.title.replace(/^(安全|追查|追踪|进入|向)/, "")) || item.suggestedIntent === args.intent));
  const days = kind === "建设" ? 5 : kind === "研究" ? 3 : kind === "休整" ? 2 : /长期|全面|深入/.test(args.intent) ? 4 : 2;
  const baselineBudget = kind === "建设" ? 90 : kind === "交涉" ? 35 : kind === "研究" || kind === "仪式" ? 28 : 18;
  const resourceCommitment = inferResourceCommitment(args.intent, args.game, kind, baselineBudget);
  const authorization = inferAuthorization(args.intent);
  const references = directiveReferences(args.game, args.intent);
  return {
    id: `action-draft:${args.game.week}:${hash(JSON.stringify({ intent: canonicalIdentityText(args.intent), leaderId: effectiveLeaderId, districtId: district.id, abilityIds: [...new Set(args.abilityIds)].sort() })).toString(36)}`,
    rawIntent: args.intent.trim(),
    title: `${kind} · ${targetFrom(args.intent)}`,
    kind,
    target: targetFrom(args.intent),
    desiredOutcome: args.intent.trim(),
    approach: `${args.leaderId === "organization" ? "组织按决议自行分工，由" : ""}${leader?.name ?? "执行者"}利用${leader?.specialty ?? "现有关系"}，从当前可接触的证据层开始；具体人员与路线由组织在不偏离目标、方法和底线的前提下调整。`,
    leaderId: effectiveLeaderId,
    memberIds: [effectiveLeaderId],
    executionMode: effectiveLeaderId === "player" ? "player-led" : "delegated",
    districtId: district.id,
    abilityIds: args.abilityIds,
    facilityId: /封存|切断联系|危险物/.test(args.intent) ? "vault" : kind === "研究" ? "archive" : kind === "仪式" ? "ritual" : kind === "建设" ? "workshop" : kind === "休整" ? "quarters" : undefined,
    days,
    budget: resourceCommitment.money,
    resourceCommitment,
    authorization,
    requiredKnowledgeIds: references.requiredKnowledgeIds,
    sourceIssueId: references.sourceIssueId,
    strategyIntentId: references.strategyIntentId,
    causeEventIds: references.causeEventIds,
    risk: inferRisk(args.intent, district.id, args.abilityIds.length),
    knownFacts: `组织只确认目前账本中与“${targetFrom(args.intent)}”直接相关的记录；${district.name}的公开背景可以作为起点。`,
    hypothesis: `玩家怀疑“${targetFrom(args.intent)}”值得投入资源，但假设本身不视为事实。`,
    unknowns: "目标真实身份、幕后关系、非凡层次与是否存在反调查手段仍未知。",
    redLines: authorization.redLines.join("；"),
    retreat: authorization.retreatCondition,
    focus: true,
    opportunityId: matchedOpportunity?.id,
    methodTags: inferMethodTags(args.intent),
  };
}

export async function interpretIntentWithAi(config: AiConfig, args: Parameters<typeof localContract>[0]) {
  const fallback = localContract(args);
  const safeState = {
    week: args.game.week,
    pathway: PATHWAYS[args.game.pathwayId].name,
    sequence: args.game.currentSequence,
    knownFacts: args.game.facts.slice(-16),
    activePressure: args.game.missions.filter((mission) => mission.state === "active"),
    evidence: args.game.evidenceNodes.filter((item) => item.discovered),
    availableOpportunities: args.game.opportunities.filter((item) => item.state === "available"),
    organizationIssues: args.game.organizationIssues.filter((item) => item.state === "待裁决" || item.state === "已逾期").map(({ id, title, summary, sourceId }) => ({ id, title, summary, sourceId })),
    strategicIntents: args.game.playerIntents.filter((item) => item.state === "active"),
    authorizedKnowledge: (args.game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.visibility === "player" || node.holderIds.includes("player") || node.holderRefs?.includes("player")).slice(-16).map(({ id, subject, statement, sourceEventId }) => ({ id, subject, statement, sourceEventId })),
    visibleCauseEvents: (args.game.worldKernel?.events ?? []).filter((event) => event.visibility === "public" || event.visibility === "player" || event.witnessRefs?.includes("player")).slice(-16).map(({ id, title, detail }) => ({ id, title, detail })),
    district: DISTRICTS.find((district) => district.id === args.districtId),
    members: args.game.members.map(({ id, name, role, specialty, loyalty, fatigue }) => ({ id, name, role, specialty, loyalty, fatigue })),
  };
  const raw = await callModel(config,
    "你是《灰雾纪事》的首领指令解析器。只整理玩家意图，不决定成败，不新增幕后真相，不把玩家原著知识视为角色知识。不得删除或放宽本地保守解释中的任何红线、必须请示条件、撤退条件或授权限制。返回严格JSON。",
    `将自由意图整理为首领指令。缺失信息使用保守推断，只有重大歧义才在unknowns中指出。返回字段：title,kind,target,desiredOutcome,approach,days,risk,knownFacts,hypothesis,unknowns；resourceCommitment:{posture:minimal|balanced|substantial|all-in,money,manpower,extraordinaryMaterials}；authorization:{scope:strict|bounded|broad,redLines:[],mustEscalateWhen:[],retreatCondition}；requiredKnowledgeIds:[]；可选sourceIssueId、strategyIntentId；causeEventIds:[]。兼容字段budget必须等于resourceCommitment.money，redLines必须是authorization.redLines用分号连接，retreat必须等于authorization.retreatCondition。kind只能是调查/交涉/研究/建设/招募/仪式/休整/自由行动，risk只能是低/中/高/致命。所有引用id只能逐字取自本地状态；不得扩大本地授权，不得移除本地红线或请示条件。\n玩家意图：${args.intent}\n本地状态：${JSON.stringify(safeState)}\n本地保守解释：${JSON.stringify(fallback)}`, { json: true, maxTokens: 2300, temperature: .25 });
  const value = extractJson(raw);
  const kindOptions = ["调查", "交涉", "研究", "建设", "招募", "仪式", "休整", "自由行动"];
  const riskOptions = ["低", "中", "高", "致命"];
  const proposedKind = kindOptions.includes(String(value.kind)) ? value.kind as ActionContract["kind"] : fallback.kind;
  const explicitKind = inferKind(args.intent);
  const governanceIntent = isInternalGovernanceIntent(args.intent);
  const safeKind = governanceIntent ? "自由行动" : proposedKind === "建设" && !isExplicitConstruction(args.intent)
    ? fallback.kind
    : explicitKind !== "自由行动" && proposedKind !== explicitKind ? explicitKind : proposedKind;
  const safeTarget = governanceIntent ? fallback.target : typeof value.target === "string" ? targetFrom(`${fallback.kind === "调查" ? "调查" : "接触"}${value.target}`) : fallback.target;
  const proposedAuthorization = recordValue(value.authorization) ?? {};
  const legacyProposedRedLines = typeof value.redLines === "string" ? value.redLines.trim().replace(/^红线[：:]\s*/, "") : "";
  const authorization = mergeAuthorization(fallback.authorization, {
    ...proposedAuthorization,
    redLines: uniqueDirectiveText([
      ...(Array.isArray(proposedAuthorization.redLines) ? proposedAuthorization.redLines : typeof proposedAuthorization.redLines === "string" ? proposedAuthorization.redLines.split(/[；;]/) : []),
      ...legacyProposedRedLines.split(/[；;]/),
    ]),
    retreatCondition: typeof proposedAuthorization.retreatCondition === "string" ? proposedAuthorization.retreatCondition : value.retreat,
  });
  const resourceCommitment = normalizeResourceCommitment(fallback.resourceCommitment, value.resourceCommitment, value.budget, args.intent, args.game);
  const allowedKnowledgeIds = new Set((args.game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.visibility === "player" || node.holderIds.includes("player") || node.holderRefs?.includes("player")).map((node) => node.id));
  const allowedEventIds = new Set((args.game.worldKernel?.events ?? []).filter((event) => event.visibility === "public" || event.visibility === "player" || event.witnessRefs?.includes("player")).map((event) => event.id));
  const proposedKnowledgeIds = Array.isArray(value.requiredKnowledgeIds) ? value.requiredKnowledgeIds.filter((id): id is string => typeof id === "string" && allowedKnowledgeIds.has(id)) : [];
  const proposedCauseEventIds = Array.isArray(value.causeEventIds) ? value.causeEventIds.filter((id): id is string => typeof id === "string" && allowedEventIds.has(id)) : [];
  const proposedIssueId = typeof value.sourceIssueId === "string" && args.game.organizationIssues.some((issue) => issue.id === value.sourceIssueId) ? value.sourceIssueId : undefined;
  const proposedStrategyId = typeof value.strategyIntentId === "string" && args.game.playerIntents.some((intent) => intent.id === value.strategyIntentId && intent.state === "active") ? value.strategyIntentId : undefined;
  return {
    ...fallback,
    title: `${safeKind} · ${safeTarget}`,
    kind: safeKind,
    target: safeTarget,
    facilityId: safeKind === "建设" ? fallback.facilityId : safeKind === "研究" ? "archive" : safeKind === "仪式" ? "ritual" : safeKind === "休整" ? "quarters" : /封存|切断联系|危险物/.test(args.intent) ? "vault" : undefined,
    desiredOutcome: typeof value.desiredOutcome === "string" ? value.desiredOutcome : fallback.desiredOutcome,
    approach: typeof value.approach === "string" ? value.approach : fallback.approach,
    days: Math.min(6, Math.max(1, Number(value.days) || fallback.days)),
    budget: resourceCommitment.money,
    resourceCommitment,
    authorization,
    requiredKnowledgeIds: uniqueDirectiveText([...fallback.requiredKnowledgeIds, ...proposedKnowledgeIds]),
    sourceIssueId: fallback.sourceIssueId ?? proposedIssueId,
    strategyIntentId: fallback.strategyIntentId ?? proposedStrategyId,
    causeEventIds: uniqueDirectiveText([...fallback.causeEventIds, ...proposedCauseEventIds]),
    risk: riskOptions.includes(String(value.risk)) ? value.risk as RiskLevel : fallback.risk,
    knownFacts: typeof value.knownFacts === "string" ? value.knownFacts : fallback.knownFacts,
    hypothesis: typeof value.hypothesis === "string" ? value.hypothesis : fallback.hypothesis,
    unknowns: typeof value.unknowns === "string" ? value.unknowns : fallback.unknowns,
    redLines: authorization.redLines.join("；"),
    retreat: authorization.retreatCondition,
  };
}

function rangesOverlap(startA: number, daysA: number, startB: number, daysB: number) {
  return startA <= startB + daysB - 1 && startB <= startA + daysA - 1;
}

export function scheduleContract(game: GameState, contract: ActionContract) {
  const actionOrdinal = nextActionOrdinal(game);
  const authorizationRedLines = [...new Set(contract.redLines.split(/[；;。]/).map((item) => item.trim()).filter(Boolean))];
  const syncedContract: ActionContract = {
    ...contract,
    budget: contract.resourceCommitment.money,
    redLines: authorizationRedLines.join("；"),
    retreat: contract.retreat.trim(),
    authorization: {
      ...contract.authorization,
      redLines: authorizationRedLines,
      mustEscalateWhen: [...new Set([...contract.authorization.mustEscalateWhen, contract.retreat.trim()].filter(Boolean))],
      retreatCondition: contract.retreat.trim(),
    },
  };
  const authoritativeContract = {
    ...syncedContract,
    id: authoritativeActionId(game, syncedContract, actionOrdinal),
    actionOrdinal,
  };
  for (let day = 1; day <= 7 - authoritativeContract.days + 1; day += 1) {
    const conflict = game.schedule.some((action) => {
      if (!rangesOverlap(day, authoritativeContract.days, action.startDay, action.days)) return false;
      const sameMember = action.memberIds.some((id) => authoritativeContract.memberIds.includes(id));
      const sameFacility = Boolean(action.facilityId && authoritativeContract.facilityId && action.facilityId === authoritativeContract.facilityId);
      return sameMember || sameFacility;
    });
    if (!conflict) return {
      ...authoritativeContract,
      startDay: day,
      status: "planned" as const,
      execution: {
        originWeek: game.week,
        attemptOrdinal: 0,
        status: "planned" as const,
        progress: 0,
        consumed: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
        nextEligibleWeek: game.week,
        consequenceEventIds: [],
      },
    };
  }
  // The player issues goals rather than maintaining a calendar. When no clean
  // slot exists, the command remains accepted and the world adjudicator handles
  // ordering, reduced effect, interruption, or an explicit council exception.
  return {
    ...authoritativeContract,
    startDay: 1,
    status: "planned" as const,
    execution: {
      originWeek: game.week,
      attemptOrdinal: 0,
      status: "planned" as const,
      progress: 0,
      consumed: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      nextEligibleWeek: game.week,
      consequenceEventIds: [],
    },
  };
}

export function availableAbilities(game: GameState): Ability[] {
  return abilitiesFor(game.pathwayId, game.currentSequence);
}

function abilityRules(game: GameState, contract: ActionContract, abilities: Ability[]) {
  const used = contract.abilityIds.map((id) => abilities.find((ability) => ability.id === id)).filter((ability): ability is Ability => Boolean(ability));
  const usedTags = new Set(used.flatMap((ability) => ability.ruleTags ?? []));
  const scale = Math.max(1, 10 - game.currentSequence);
  let bonus = 0;
  let riskReduction = 0;
  let secrecyChange = 0;
  let extraDiscovery = 0;
  const reasons: string[] = [];
  if (!used.length) return { bonus, riskReduction, secrecyChange, extraDiscovery, reasons };
  const uniqueModes = new Set(used.map((ability) => ability.mode).filter(Boolean));
  const activeUses = used.filter((ability) => !ability.passive).length;
  bonus += Math.min(8, used.length * 2 + uniqueModes.size);
  if (activeUses > 3) { bonus -= (activeUses - 3) * 3; secrecyChange -= activeUses - 3; reasons.push("同一行动叠加过多主动能力，灵性协调和痕迹控制出现边际损耗"); }
  reasons.push(...used.slice(0, 3).map((ability) => {
    const summary = abilityRuleSummary(ability);
    return `${ability.name}：${summary.mode}，范围${summary.scope}，持续${summary.duration}${summary.constraints.length ? `；限制为${summary.constraints.join("、")}` : ""}`;
  }));
  if (game.pathwayId === "seer") {
    bonus = contract.methodTags?.includes("occult") || contract.methodTags?.includes("document") ? 7 + scale : 2;
    riskReduction = 4 + scale;
    extraDiscovery = contract.risk !== "低" ? 1 : 0;
    reasons.push("占卜家能力排除了错误方向，并在进入危险前提供象征性预警");
  }
  if (game.pathwayId === "spectator") {
    bonus = contract.methodTags?.includes("social") ? 10 + scale : 3;
    extraDiscovery = contract.methodTags?.includes("social") ? 1 : 0;
    reasons.push("观众途径读取的是情绪、矛盾与谈判底线，不会直接生成幕后事实");
  }
  if (game.pathwayId === "apprentice") {
    bonus = contract.methodTags?.includes("access") ? 11 + scale : 3;
    riskReduction = contract.retreat ? 7 + scale : 2;
    reasons.push("学徒途径创造了额外入口与撤离路线，主要降低现场失控风险");
  }
  if (game.pathwayId === "hunter") {
    bonus = contract.methodTags?.includes("track") ? 12 + scale : 4;
    secrecyChange = -Math.max(1, Math.floor(scale / 2));
    extraDiscovery = contract.methodTags?.includes("track") ? 1 : 0;
    reasons.push("猎人途径强化追踪与弱点判断，但行动痕迹更容易被目标察觉");
  }
  if (game.pathwayId === "mystery") {
    bonus = contract.methodTags?.includes("occult") || contract.kind === "研究" ? 12 + scale : 3;
    extraDiscovery = 1;
    reasons.push("窥秘人途径将异常拆成可验证的知识结构，同时增加接触危险知识的负担");
  }
  const tagMatchesMethod = usedTags.has("reveal") && (contract.methodTags?.includes("document") || contract.methodTags?.includes("occult")) || usedTags.has("access") && contract.methodTags?.includes("access") || usedTags.has("social") && contract.methodTags?.includes("social") || usedTags.has("track") && contract.methodTags?.includes("track") || usedTags.has("occult") && contract.methodTags?.includes("occult") || usedTags.has("covert") && ["access", "social"].some((tag) => contract.methodTags?.includes(tag));
  if (tagMatchesMethod) { bonus += 5; reasons.push(`所选能力的规则标签“${[...usedTags].join("、")}”与行动方法直接匹配`); }
  else { bonus = Math.max(1, bonus - 3); reasons.push("所选能力与当前方法不完全匹配，因此没有获得完整优势"); }
  if (usedTags.has("reality") && game.currentSequence <= 3) { extraDiscovery += 1; secrecyChange -= 2; reasons.push("高序列能力改变了行动尺度，同时引来更明显的历史与高位回应"); }
  if (usedTags.has("force") && !/战斗|袭击|破坏|伏击|保护/.test(contract.rawIntent)) { bonus = Math.max(0, bonus - 4); secrecyChange -= 2; reasons.push("强制型能力用于非战斗目标，制造了不必要的暴露"); }
  return { bonus, riskReduction, secrecyChange, extraDiscovery, reasons };
}

type ActionDomain = "investigation" | "finance" | "training" | "security" | "recruitment" | "cover" | "construction" | "advancement" | "rest" | "diplomacy" | "general";

export function actionDomain(contract: ActionContract): ActionDomain {
  const text = `${contract.rawIntent} ${contract.target}`;
  if (contract.kind === "建设" && /修建|建造|扩建|增设|改建|升级|设施|房间|工坊|仓库|安全屋/.test(text)) return "construction";
  if (contract.kind === "招募" || isRecruitmentIntent(text)) return "recruitment";
  if (/审计|预算|收支|成本|账目核验|现金流|可疑支出|冻结.*账/.test(text)) return "finance";
  if (/训练|演练|培训|练习|复盘|模拟口令|假文件/.test(text)) return "training";
  if (/出入口|出入记录|文件销毁|紧急撤离|安保|暗号|内部安全|内部整顿|档案保密|名单泄露|保密流程|访问权限|暴露组织/.test(text)) return "security";
  if (/公开业务|掩护身份|门牌|价目表|接待话术|组织文件.*转移|迁址|改名/.test(text)) return "cover";
  if (contract.kind === "研究" && /配方|材料|晋升|魔药|扮演/.test(text)) return "advancement";
  if (contract.kind === "休整" && !/训练|演练/.test(text)) return "rest";
  if (contract.kind === "交涉" || /写信|提醒|声明|协商|谈判|说服|联系/.test(text)) return "diplomacy";
  if (contract.kind === "调查" || /调查|查明|追踪|观察|侦察|记录|核验|证据|线索|监视|潜入|鉴定|异常|失踪者|人口问题/.test(text)) return "investigation";
  return "general";
}

function seeksEvidence(contract: ActionContract) {
  return actionDomain(contract) === "investigation";
}

function refreshOpportunities(game: GameState, evidence: EvidenceNode[], resolvedId?: string) {
  const discovered = new Set(evidence.filter((item) => item.discovered).map((item) => item.id));
  const newlyAvailable: string[] = [];
  const opportunities = game.opportunities.map((item) => {
    if (item.id === resolvedId) return { ...item, state: "resolved" as const };
    if (item.state !== "locked") return { ...item };
    if (item.requirements.every((id) => discovered.has(id))) { newlyAvailable.push(item.id); return { ...item, state: "available" as const }; }
    return { ...item };
  });
  return { opportunities, newlyAvailable };
}

function addWeeksToDate(week: number) {
  const date = new Date(Date.UTC(1349, 5, 30));
  date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function timelineAfterWeek(timeline: TimelineEvent[], nextWeek: number, evidence: EvidenceNode[]) {
  const populationKnown = evidence.find((item) => item.id === "ev-population")?.discovered;
  return timeline.map((event) => {
    if (event.status === "resolved" || event.status === "diverted") return event;
    if (event.scheduledWeek < nextWeek && event.status === "active") return { ...event, status: "resolved" as const, revealed: true };
    if (event.scheduledWeek === nextWeek) return { ...event, status: "active" as const, revealed: true };
    if (populationKnown && ["tl-population", "tl-procurement", "tl-smog-eve"].includes(event.id)) return { ...event, revealed: true };
    return event;
  });
}

function buildPivots(game: GameState, nextWeek: number, evidence: EvidenceNode[], factions: FactionState[], deviation: number) {
  const pivots = [...game.pivots];
  const discovered = new Set(evidence.filter((item) => item.discovered).map((item) => item.id));
  if (!pivots.some((item) => item.id === "pivot-evidence") && discovered.has("ev-population") && discovered.size >= 9) pivots.push({ id: "pivot-evidence", week: nextWeek, title: "不可见人口有了姓名", cause: "组织在官方收口前建立了跨案件的人口证据链。", effects: ["王室工程提前更换运输路线", "教会开始独立核验", "大雾霾不再能够完全按原计划隐蔽准备"], magnitude: 9 });
  if (!pivots.some((item) => item.id === "pivot-church") && (factions.find((item) => item.id === "night-church")?.trust ?? 0) >= 45) pivots.push({ id: "pivot-church", week: nextWeek, title: "非法组织进入教会协作名单", cause: "连续提供可核验证据，使值夜者选择有限合作而非立即取缔。", effects: ["终局可请求教会支援", "组织合法化路线开放", "密教开始把玩家视为明确阻碍"], magnitude: 7 });
  if (!pivots.some((item) => item.id === "pivot-sabotage") && ["ev-valve", "ev-sealed-cargo", "ev-ritual-site"].filter((id) => discovered.has(id)).length >= 2) pivots.push({ id: "pivot-sabotage", week: nextWeek, title: "原定仪式失去冗余", cause: "组织定位并干预了两项以上终局基础设施。", effects: ["大雾霾规模下降", "敌方计划提前", "部分原著角色会面对新的战场"], magnitude: 12 });
  const pivotMagnitude = pivots.filter((pivot) => !game.pivots.some((old) => old.id === pivot.id)).reduce((sum, pivot) => sum + pivot.magnitude, 0);
  return { pivots, deviation: Math.min(100, deviation + pivotMagnitude) };
}

function updateCases(game: GameState, evidence: EvidenceNode[], nextWeek: number) {
  return game.cases.map((caseFile) => {
    const nodes = evidence.filter((item) => item.caseId === caseFile.id);
    const discoveredCount = nodes.filter((item) => item.discovered && !item.compromised).length;
    const state = discoveredCount >= Math.max(2, nodes.length) ? "resolved" as const : discoveredCount > 0 ? "active" as const : caseFile.state === "resolved" ? "resolved" as const : nextWeek >= 8 && caseFile.id !== "black-knock" ? "active" as const : caseFile.state;
    return { ...caseFile, discoveredCount, totalCount: nodes.length, state, pressure: Math.min(100, caseFile.pressure + (state === "resolved" ? -8 : 4)) };
  });
}

function organizationConditions(secrecy: number, stability: number, influence: number, money: number) {
  const conditions = [secrecy < 35 ? "受到官方与未知势力关注" : secrecy < 65 ? "行动痕迹正在积累" : "掩护身份仍然有效"];
  conditions.push(stability < 35 ? "内部不安" : stability < 65 ? "成员承受持续压力" : "内部秩序稳定");
  conditions.push(influence >= 60 ? "地区性非凡组织" : influence >= 30 ? "开始受到同类重视" : "本地小型组织");
  if (money < 0) conditions.push(money < -80 ? "严重债务与欠薪" : "资金紧张");
  return conditions;
}

function resultFindings(contract: ActionContract, game: GameState, outcome: ActionResult["outcome"]) {
  const district = DISTRICTS.find((item) => item.id === contract.districtId)?.name ?? "未标明区域";
  return [
    `[规则结算] 行动“${contract.rawIntent}”的成功层级已锁定为“${outcome}”；规则层不会据此编造现场发现。`,
    `[规则结算] 执行范围为${district}的“${contract.target}”，必须遵守边界“${contract.redLines}”与撤退条件“${contract.retreat}”。`,
    "[规则结算] 具体人物反应、地点细节、证据和后续机会等待 AI 世界模型依据持续世界状态生成并校验。",
  ];
}
function resultConsequence(contract: ActionContract, outcome: ActionResult["outcome"]) {
  const domain = actionDomain(contract);
  if (domain === "finance") return outcome === "受阻" ? "账目没有被强行归平，冻结项会占用下周可调度资金。" : "预算边界已进入组织账本，后续支出会按新分类显示。";
  if (domain === "training") return outcome === "受阻" ? "训练暴露了内部协同缺口，成员稳定下降但没有外部暴露。" : "成员对自己的失误模式有了共同语言，内部稳定获得改善。";
  if (domain === "security") return outcome === "受阻" ? "据点仍有未修补的内部漏洞，但没有虚构外部追踪者。" : "据点隐蔽性获得实际改善，新的流程从下周开始生效。";
  if (domain === "recruitment") return outcome === "受阻" ? "接触按边界结束，对方不会被强行写成敌人或成员。" : "候选关系只推进一个阶段，是否继续仍由下一次决议决定。";
  if (domain === "cover") return outcome === "受阻" ? "公开掩护尚未完成切换，组织必须继续处理新旧口径冲突。" : "公开业务与核心活动的边界更清楚，但旧客户仍可能带来误解。";
  if (domain === "diplomacy") return outcome === "受阻" ? "信息没有送出，关系保持不变。" : "一条受限联络通道已经形成，但对方不会自动成为盟友。";
  if (["construction", "rest", "general"].includes(domain)) return outcome === "受阻" ? "没有把未完成事项包装成成果，未完成部分仍留在组织账本。" : "决议在契约边界内改变了组织状态，没有自动生成外部阴谋线索。";
  return outcome === "成功" ? "目标取得实质进展，但被调查者可能开始调整安排。" : outcome === "部分成功" ? "得到可用信息，同时留下了关系或暴露代价。" : "队伍按契约撤退，没有把猜测写成事实；该目标下一次行动将更警惕。";
}

type CausalReceipt = ActionCausalReceipts["people"][number];
type ReceiptContext = {
  actionResult: ActionResult;
  delta: WorldTurnDelta;
  worldKernel: GameState["worldKernel"];
  game: GameState;
  proposalId?: string;
  visibleEvents: GameState["worldKernel"]["events"];
  visibleEventIds: Set<string>;
};

function causalReceipt(id: string, summary: string, entityRefs: string[], sourceEventIds: string[] = []): CausalReceipt {
  return { id, summary, entityRefs: [...new Set(entityRefs.filter(Boolean))], sourceEventIds: [...new Set(sourceEventIds.filter(Boolean))] };
}

function playerVisibleProposalEvents(actionResult: ActionResult, delta: WorldTurnDelta, worldKernel: GameState["worldKernel"]) {
  const proposalId = actionResult.executionPlan?.proposalId;
  if (!proposalId) return [];
  return worldKernel.events.filter((event) => event.week === delta.week && event.sourceProposalIds?.includes(proposalId)).filter((event) => {
    if (event.visibility === "public" || event.visibility === "player") return true;
    if (event.witnessRefs?.some((ref) => ref === "player" || ref === "organization")) return true;
    return worldKernel.observations.some((observation) => observation.eventId === event.id && (observation.visibility !== "actors" || observation.holderRefs?.some((ref) => ref === "player" || ref === "organization")));
  });
}

function peopleReceipts(context: ReceiptContext) {
  const participantIds = [...new Set([context.actionResult.contract.leaderId, ...context.actionResult.contract.memberIds].filter((id) => id !== "organization"))];
  const receipts = participantIds.map((participantId) => {
    const name = participantId === "player" ? "你" : context.game.members.find((member) => member.id === participantId)?.name ?? context.worldKernel.actors.find((actor) => actor.id === participantId)?.name ?? "受命人";
    const eventIds = context.visibleEvents.filter((event) => event.actorIds.includes(participantId)).map((event) => event.id);
    return causalReceipt(`receipt:${context.actionResult.id}:person:${participantId}`, `${name}参与了“${context.actionResult.title}”，并留下了可确认的执行回执。`, [participantId === "player" ? "player" : `actor:${participantId}`], eventIds);
  });
  for (const event of context.visibleEvents) for (const actorId of event.actorIds) if (!receipts.some((receipt) => receipt.entityRefs.includes(`actor:${actorId}`))) {
    const name = context.worldKernel.actors.find((actor) => actor.id === actorId)?.name ?? "相关人物";
    receipts.push(causalReceipt(`receipt:${context.actionResult.id}:event-person:${actorId}`, `${event.title}改变了${name}的处境。`, [`actor:${actorId}`], [event.id]));
  }
  return receipts;
}

function resourceReceipts(context: ReceiptContext) {
  const commitments = context.actionResult.executionPlan?.commitments;
  const parts = [context.actionResult.resourceChanges.money ? `资金${context.actionResult.resourceChanges.money > 0 ? "+" : ""}${context.actionResult.resourceChanges.money}` : "", commitments?.manpower ? `调用人力${commitments.manpower}` : "", commitments?.extraordinaryMaterials ? `消耗非凡材料${commitments.extraordinaryMaterials}` : ""].filter(Boolean);
  return parts.length ? [causalReceipt(`receipt:${context.actionResult.id}:resources`, parts.join("，"), ["organization"], context.visibleEvents.map((event) => event.id))] : [];
}

function locationReceipts(context: ReceiptContext) {
  const updatedIds = context.delta.locationUpdates.filter((update) => context.proposalId && update.sourceProposalIds.includes(context.proposalId)).map((update) => update.locationId);
  const locationIds = [...new Set([context.actionResult.contract.districtId, ...context.visibleEvents.map((event) => event.locationId ?? ""), ...updatedIds].filter(Boolean))];
  return locationIds.map((locationId) => {
    const events = context.visibleEvents.filter((event) => event.locationId === locationId);
    const update = context.delta.locationUpdates.find((candidate) => candidate.locationId === locationId && context.proposalId && candidate.sourceProposalIds.includes(context.proposalId));
    const summary = events.length ? events.map((event) => event.title).join("；") : update?.condition || update?.publicMood || `“${context.actionResult.title}”在此处留下了可继续追踪的影响。`;
    return causalReceipt(`receipt:${context.actionResult.id}:location:${locationId}`, summary, [`location:${locationId}`], events.map((event) => event.id));
  });
}

function knowledgeReceipts(context: ReceiptContext) {
  return context.worldKernel.knowledge.filter((node) => node.acquiredWeek === context.delta.week && node.sourceEventId && context.visibleEventIds.has(node.sourceEventId) && (node.visibility === "public" || node.visibility === "player" || node.holderRefs?.includes("player") || node.holderRefs?.includes("organization"))).map((node) => causalReceipt(`receipt:${context.actionResult.id}:knowledge:${node.id}`, node.statement, [`knowledge:${node.id}`], node.sourceEventId ? [node.sourceEventId] : []));
}

function relationshipReceipts(context: ReceiptContext) {
  if (!["交涉", "招募"].includes(context.actionResult.contract.kind) || context.actionResult.outcome === "受阻") return [];
  return [causalReceipt(`receipt:${context.actionResult.id}:relationship`, `与${context.actionResult.contract.target}的关系因本次${context.actionResult.contract.kind}发生了可延续的变化。`, [], context.visibleEvents.map((event) => event.id))];
}

function futureCauseReceipts(context: ReceiptContext) {
  return [...context.visibleEvents.map((event) => causalReceipt(`receipt:${context.actionResult.id}:future:${event.id}`, `${event.title}已经进入后续因果线。`, event.locationId ? [`location:${event.locationId}`] : [], [event.id])), ...(context.actionResult.futureChanges ?? []).map((summary, index) => causalReceipt(`receipt:${context.actionResult.id}:future-local:${index}`, summary, [], context.visibleEvents.map((event) => event.id)))].slice(0, 8);
}

function causalReceiptsForAction(actionResult: ActionResult, delta: WorldTurnDelta, worldKernel: GameState["worldKernel"], game: GameState): ActionCausalReceipts {
  const visibleEvents = playerVisibleProposalEvents(actionResult, delta, worldKernel);
  const context: ReceiptContext = { actionResult, delta, worldKernel, game, proposalId: actionResult.executionPlan?.proposalId, visibleEvents, visibleEventIds: new Set(visibleEvents.map((event) => event.id)) };
  return { people: peopleReceipts(context), resources: resourceReceipts(context), locations: locationReceipts(context), knowledge: knowledgeReceipts(context), relationships: relationshipReceipts(context), futureCauses: futureCauseReceipts(context) };
}

type DirectiveInterruption = NonNullable<WorldTurnDelta["directiveInterruptions"]>[number];
type InterruptionAdjustments = { money: number; extraordinaryMaterials: number; spirituality: number; secrecy: number; stability: number; influence: number };
type InterruptionContext = {
  actionResult: ActionResult;
  plan: NonNullable<ActionResult["executionPlan"]>;
  interruption: DirectiveInterruption;
  usedCommitments: ReturnType<typeof scaledInterruptionCommitments>;
  chapterWeek: number;
  missionProgress: number;
};
type InterruptedAction = { actionResult: ActionResult; continuation: ScheduledAction; adjustments: InterruptionAdjustments; missionRefund: number };

function scaledInterruptionCommitments(plan: NonNullable<ActionResult["executionPlan"]>, fraction: number) {
  return {
    money: Math.max(0, Math.round(plan.commitments.money * fraction)),
    manpower: plan.commitments.manpower,
    extraordinaryMaterials: Math.max(0, Math.round(plan.commitments.extraordinaryMaterials * fraction)),
    spirituality: Math.max(0, Math.round(plan.commitments.spirituality * fraction)),
  };
}

function interruptedExecutionState(context: InterruptionContext) {
  const { actionResult, plan, interruption, usedCommitments, chapterWeek } = context;
  const requested = actionResult.contract.resourceCommitment ?? { money: actionResult.contract.budget, manpower: 0, extraordinaryMaterials: 0, posture: "balanced" as const };
  const progressDelta = Math.max(1, Math.round(plan.progressDelta * interruption.completedFraction));
  return {
    originWeek: chapterWeek,
    attemptOrdinal: Math.max(1, Number(plan.attemptId.split(":").at(-1)) || 1),
    status: "interrupted" as const,
    progress: Math.min(99, Math.max(0, 100 - plan.progressDelta) + progressDelta),
    consumed: {
      money: Math.max(0, requested.money - plan.commitments.money) + usedCommitments.money,
      manpower: usedCommitments.manpower,
      extraordinaryMaterials: Math.max(0, requested.extraordinaryMaterials - plan.commitments.extraordinaryMaterials) + usedCommitments.extraordinaryMaterials,
      spirituality: usedCommitments.spirituality,
    },
    nextEligibleWeek: chapterWeek + 1,
    lastAttemptId: plan.attemptId,
    lastReason: interruption.reason,
    consequenceEventIds: [...new Set([...plan.causeEventIds, interruption.sourceEventId])],
  };
}

function interruptionExecutionPlan(context: InterruptionContext) {
  const { plan, interruption, usedCommitments, chapterWeek } = context;
  const progressDelta = Math.max(1, Math.round(plan.progressDelta * interruption.completedFraction));
  return {
    ...plan,
    commitments: usedCommitments,
    disposition: "interrupted" as const,
    progressDelta,
    remainingDays: Math.max(1, Math.ceil(plan.timeWindow.days * (1 - interruption.completedFraction))),
    nextEligibleWeek: chapterWeek + 1,
    interruptionReason: interruption.reason,
    causeEventIds: [...new Set([...plan.causeEventIds, interruption.sourceEventId])],
  };
}

function interruptionResourceChanges(context: InterruptionContext) {
  const { actionResult, interruption, usedCommitments } = context;
  return {
    money: -usedCommitments.money,
    secrecy: Math.round(actionResult.resourceChanges.secrecy * interruption.completedFraction),
    stability: Math.round(actionResult.resourceChanges.stability * interruption.completedFraction),
    influence: Math.round(actionResult.resourceChanges.influence * interruption.completedFraction),
  };
}

function interruptionRefunds(context: InterruptionContext, resourceChanges: ActionResult["resourceChanges"]): InterruptionAdjustments {
  const { actionResult, plan, usedCommitments } = context;
  return {
    money: plan.commitments.money - usedCommitments.money,
    extraordinaryMaterials: plan.commitments.extraordinaryMaterials - usedCommitments.extraordinaryMaterials,
    spirituality: plan.commitments.spirituality - usedCommitments.spirituality,
    secrecy: resourceChanges.secrecy - actionResult.resourceChanges.secrecy,
    stability: resourceChanges.stability - actionResult.resourceChanges.stability,
    influence: resourceChanges.influence - actionResult.resourceChanges.influence,
  };
}

function interruptedActionResult(context: InterruptionContext, resourceChanges: ActionResult["resourceChanges"]): ActionResult {
  const { actionResult, interruption } = context;
  return {
    ...actionResult,
    outcome: "部分成功",
    executionStatus: "interrupted",
    executionPlan: interruptionExecutionPlan(context),
    resourceChanges,
    missionProgress: context.missionProgress,
    consequence: `${actionResult.consequence} 负责人在“${interruption.triggeredBoundary}”被触发后停止推进：${interruption.reason}`,
    futureChanges: [...(actionResult.futureChanges ?? []), "已经发生的变化保留，未完成部分将在条件允许时继续。"].slice(0, 6),
  };
}

function interruptAction(actionResult: ActionResult, interruption: DirectiveInterruption, chapterWeek: number): InterruptedAction | null {
  const plan = actionResult.executionPlan;
  if (!plan || !["executed", "limited"].includes(actionResult.executionStatus ?? "")) return null;
  const context: InterruptionContext = {
    actionResult,
    plan,
    interruption,
    usedCommitments: scaledInterruptionCommitments(plan, interruption.completedFraction),
    chapterWeek,
    missionProgress: Math.max(0, Math.round(actionResult.missionProgress * interruption.completedFraction)),
  };
  const resourceChanges = interruptionResourceChanges(context);
  return {
    actionResult: interruptedActionResult(context, resourceChanges),
    continuation: { ...actionResult.contract, status: "interrupted", startDay: 1, execution: interruptedExecutionState(context) },
    adjustments: interruptionRefunds(context, resourceChanges),
    missionRefund: actionResult.missionProgress - context.missionProgress,
  };
}

function applyDirectiveInterruptions(chapter: ChronicleChapter, delta: WorldTurnDelta) {
  const byProposalId = new Map((delta.directiveInterruptions ?? []).map((interruption) => [interruption.proposalId, interruption]));
  const continuations: ScheduledAction[] = [];
  const adjustments: InterruptionAdjustments = { money: 0, extraordinaryMaterials: 0, spirituality: 0, secrecy: 0, stability: 0, influence: 0 };
  const missionRefunds = new Map<string, number>();
  const actionResults = chapter.results.map((actionResult) => {
    const interruption = actionResult.executionPlan ? byProposalId.get(actionResult.executionPlan.proposalId) : undefined;
    const appliedInterruption = interruption ? interruptAction(actionResult, interruption, chapter.week) : null;
    if (!appliedInterruption) return actionResult;
    continuations.push(appliedInterruption.continuation);
    for (const key of Object.keys(adjustments) as (keyof InterruptionAdjustments)[]) adjustments[key] += appliedInterruption.adjustments[key];
    if (actionResult.missionId && appliedInterruption.missionRefund > 0) missionRefunds.set(actionResult.missionId, (missionRefunds.get(actionResult.missionId) ?? 0) + appliedInterruption.missionRefund);
    return appliedInterruption.actionResult;
  });
  return { results: actionResults, continuations, adjustments, missionRefunds };
}

function missionForContract(game: GameState, contract: ActionContract) {
  const intent = `${contract.rawIntent} ${contract.target} ${contract.desiredOutcome}`;
  const ranked = game.missions.filter((mission) => mission.state === "active").map((mission) => {
    const candidates = [mission.title, mission.premise, ...mission.hints];
    const score = Math.max(...candidates.map((candidate) => intent.includes(candidate) || candidate.includes(contract.target) ? 1 : textSimilarity(intent, candidate)));
    return { mission, score };
  }).sort((left, right) => right.score - left.score);
  return ranked[0]?.score >= .12 ? ranked[0].mission : undefined;
}

function cleanNarrative(text: string) {
  return text.trim().replace(/([。！？；])\1+/g, "$1").replace(/([。！？])；/g, "$1").replace(/\s+([，。；！？])/g, "$1");
}

function endSentence(text: string) {
  const clean = cleanNarrative(text);
  return /[。！？]$/.test(clean) ? clean : `${clean}。`;
}

function buildLocalChapter(game: GameState, results: ActionResult[], worldText: string): ChronicleChapter {
  const executed = results.filter((result) => result.executionStatus === undefined || ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus));
  const focus = executed.find((result) => result.contract.focus) ?? executed[0] ?? results.find((result) => result.contract.focus) ?? results[0];
  const focusExecuted = Boolean(focus && executed.some((result) => result.id === focus.id));
  const focusDomain = focus ? actionDomain(focus.contract) : null;
  const handledInsideBase = Boolean(focusDomain && ["finance", "training", "security", "cover", "rest"].includes(focusDomain));
  const focusOpening = !focus
    ? ""
    : !focusExecuted
      ? `档案封面保留着你的原话：“${focus.contract.rawIntent}”。负责人确认当前条件超出授权，因此没有出发，也没有把冲突伪装成一次失败行动。`
      : handledInsideBase
        ? `${focus.contract.leaderId === "player" ? "你在据点内亲自主持了这项工作" : "负责这项事务的席位留在据点内组织执行"}。档案封面保留着你的原话：“${focus.contract.rawIntent}”——没有人把它改写成另一件更方便执行的事。`
        : `${focus.contract.leaderId === "player" ? "你亲自离开了据点" : "负责行动的席位派出了下属"}，前往${DISTRICTS.find((district) => district.id === focus.contract.districtId)?.name}。档案封面保留着你的原话：“${focus.contract.rawIntent}”——没有人把它改写成另一件更方便执行的事。`;
  const sections: ChronicleChapter["sections"] = [];
  const weather = ["煤烟把晨光磨成了暗银色", "夜雨停在窗框上，雾却没有散", "街角的马车声比平日来得更早", "事务所的黄铜门牌蒙着一层潮气"][game.week % 4];
  sections.push({ heading: "密议之后", paragraphs: [
    `第${game.week}周，${weather}。散会时留在长桌上的不是任务清单，而是${results.length ? `${results.length}份由你亲自定下目标、边界与退路的行动契约` : "一页没有落款的空白日程"}。`,
    executed.length ? `负责人在各自职权内拆解获批命令。红线、联络时限和停止条件被分别记入执行记录；组织会按你的方向行动，却仍要为城市的反应付出代价。` : results.length ? "负责人没有越过授权边界：这些指令尚未执行，冲突与请示事项已经退回下一次议会。" : "无人离开据点并不等于世界静止。成员修补掩护与封印，等着凌晨三点的声音再次越过门槛。",
  ] });
  if (focus) sections.push({ heading: focus.title, paragraphs: [
    focusOpening,
    ...focus.findings.slice(0, 4).map(endSentence),
    focus.abilityEffects.length ? endSentence(`非凡能力在现场留下了可核对的影响：${focus.abilityEffects.join("；")}；相应灵性、负荷与暴露已经结算`) : "这次行动没有擅自调用你的非凡能力；报告中的每一项发现都来自人员、时间与既有资源。",
    endSentence(`书记员最后写下“${focus.outcome}”：${focus.consequence}`),
  ] });
  const secondary = results.filter((result) => result.id !== focus?.id).slice(0, 3);
  if (secondary.length) sections.push({ heading: "其余回报", paragraphs: secondary.map((result) => endSentence(`${result.title}被记为“${result.outcome}”。${result.findings[0]} ${result.consequence}`)) });
  const futureChanges = results.flatMap((result) => result.futureChanges ?? []).slice(0, 4);
  const pressure = game.missions.find((mission) => mission.state === "active");
  const pressureConsequence = pressure?.consequence.replace(/^若(?:继续(?:搁置|放任)|不加干预)[，,]?\s*/, "");
  sections.push({ heading: "下一次集会之前", paragraphs: [
    ...futureChanges.map((change) => endSentence(`${cleanNarrative(change)}；它已经成为下周可以继续追问或利用的条件`)),
    endSentence(cleanNarrative(worldText)),
    pressure ? `留在桌面中央的压力仍是“${pressure.title}”。还剩${pressure.deadline}周，当前推进${pressure.progress}%；若继续搁置，${endSentence(pressureConsequence ?? pressure.consequence)}` : "本周没有尚未处理的强制压力，但各方势力仍会依照自己的目标行动。",
  ] });
  const chapter: ChronicleChapter = {
    id: `chapter:${game.week}:rules`,
    week: game.week,
    date: game.date,
    title: focus ? `雾中意图 · ${focus.contract.target}` : "雾中的静默",
    source: "local",
    sections,
    results,
    summary: focus ? endSentence(`${focus.title}得到“${focus.outcome}”结算；${cleanNarrative(focus.findings[0] ?? focus.consequence).slice(0, 92)}`) : endSentence(`本周没有正式行动；${cleanNarrative(worldText).slice(0, 92)}`),
  };
  return results.some((result) => result.causalReceipts) ? { ...chapter, summary: chronicleSummaryFromCausality(game, chapter) } : chapter;
}

export function resolveWeek(game: GameState) {
  const eligibleSchedule = game.schedule.filter((action) => {
    const status = action.execution?.status ?? "planned";
    if (["completed", "cancelled", "rejected", "awaiting-authorization"].includes(status)) return false;
    return (action.execution?.nextEligibleWeek ?? game.week) <= game.week;
  });
  const proposals = eligibleSchedule.map((contract) => proposalFromScheduledAction(contract, game.week));
  const adjudications = adjudicateWorldActionProposals(proposals, createActionRuleContext(game));
  const adjudicationByContractId = new Map(adjudications.map((item) => [item.proposal.sourceContractId, item]));
  let worldLedger = recordWorldLedgerPhase(game.worldLedger ?? createWorldLedger(game), game.week, "governance", "议会决议与组织常设命令已锁定", { queuedDirectives: game.schedule.length, eligibleDirectives: eligibleSchedule.length });
  worldLedger = appendWorldLedgerEvents(worldLedger, actionAdjudicationLedgerEvents(adjudications));
  let money = game.money;
  let secrecy = game.secrecy;
  let stability = game.stability;
  let influence = game.influence;
  let digestion = game.digestion;
  let spirituality = game.spirituality;
  let formulaKnowledge = game.formulaKnowledge;
  let ritualReadiness = game.ritualReadiness;
  let instability = game.instability;
  let nameExposure = game.nameExposure;
  let materials = game.materials.map((item) => ({ ...item }));
  const facilities = game.facilities.map((item) => ({ ...item }));
  let members = game.members.map((item) => ({ ...item }));
  const inventory = game.inventory.map((item) => ({ ...item }));
  const facts = game.facts.map((item) => ({ ...item }));
  const abilities = availableAbilities(game);
  let evidenceNodes = game.evidenceNodes.map((item) => ({ ...item, tags: [...item.tags] }));
  let evidenceLinks = game.evidenceLinks.map((item) => ({ ...item }));
  let opportunities = game.opportunities.map((item) => ({ ...item, requirements: [...item.requirements] }));
  let factions = game.factions.map((item) => ({ ...item }));
  let recruitPool = game.recruitPool.map((item) => ({ ...item }));
  const actingMarks = [...game.actingMarks];
  let contractIncome = 0;
  const results: ActionResult[] = eligibleSchedule.map((contract) => {
    const adjudication = adjudicationByContractId.get(contract.id);
    const executionPlan = adjudication?.executionPlan;
    if (!adjudication || !executionPlan?.executable) {
      const needsEscalation = adjudication?.review.status === "escalation-required" || executionPlan?.disposition === "awaiting-authorization";
      const deferred = executionPlan?.disposition === "deferred";
      return {
        id: contract.id,
        title: contract.title,
        outcome: "受阻",
        executionStatus: deferred ? "deferred" : needsEscalation ? "awaiting-authorization" : "rejected",
        executionPlan,
        contract,
        findings: [],
        consequence: deferred
          ? "当前条件不足以安全开始；目标和授权保持不变，负责人会在下一轮条件允许时继续。"
          : needsEscalation
          ? "负责人遇到了超出授权边界的冲突；行动尚未执行，等待首领追加裁定。"
          : "行动提案未通过统一规则审查，因此没有进入世界结算。",
        abilityEffects: [],
        digestionGain: 0,
        missionProgress: 0,
        resourceChanges: { money: 0, secrecy: 0, stability: 0, influence: 0 },
        reasons: adjudication?.review.reasons ?? ["行动没有生成可执行的统一裁定"],
        unlockedEvidenceIds: [],
        unlockedOpportunityIds: [],
        futureChanges: deferred ? ["目标已经保留，下一轮会按原授权重新判断执行条件"] : needsEscalation ? ["这项授权例外将在下一轮议会中请求首领裁定"] : [],
      };
    }
    const requestedCommitments = adjudication.proposal.commitments;
    const grantedCommitments = executionPlan.commitments;
    const requestedWeight = requestedCommitments.money + requestedCommitments.manpower * 12 + requestedCommitments.extraordinaryMaterials * 30;
    const grantedWeight = grantedCommitments.money + grantedCommitments.manpower * 12 + grantedCommitments.extraordinaryMaterials * 30;
    const resourceFulfilment = requestedWeight > 0 ? Math.min(1, grantedWeight / requestedWeight) : 1;
    const resourceAdjustment = Math.round((resourceFulfilment - 1) * 16);
    const domain = actionDomain(contract);
    const leader = contract.leaderId === "player" ? undefined : members.find((member) => member.id === contract.leaderId);
    const specificity = Math.min(16, Math.floor(contract.rawIntent.length / 14));
    const abilityRule = abilityRules(game, contract, abilities);
    const abilityBonus = abilityRule.bonus;
    const facility = contract.facilityId ? facilities.find((item) => item.id === contract.facilityId && item.status === "运转中") : undefined;
    const facilityMatches = Boolean(facility && (facility.id === "archive" && (contract.methodTags?.includes("document") || contract.kind === "研究") || facility.id === "ritual" && contract.methodTags?.includes("occult") || facility.id === "workshop" && contract.kind === "建设"));
    const facilityBonus = facility ? 2 + facility.level * 2 + (facilityMatches ? 5 : 0) : 0;
    const facilityRiskReduction = facility?.id === "ritual" && contract.methodTags?.includes("occult") ? 5 : facility?.id === "vault" ? 4 : 0;
    const departmentBonus = contract.kind === "调查" ? Math.floor((game.departments.find((item) => item.id === "field")?.autonomy ?? 0) / 20) : contract.kind === "建设" || contract.kind === "研究" ? Math.floor((game.departments.find((item) => item.id === "support")?.autonomy ?? 0) / 22) : 0;
    const fatiguePenalty = leader ? Math.floor(leader.fatigue / 6) : 0;
    const riskPenalty = Math.max(0, { 低: 0, 中: 8, 高: 19, 致命: 34 }[contract.risk] - abilityRule.riskReduction - facilityRiskReduction);
    const threshold = Math.max(18, Math.min(91, 52 + specificity + abilityBonus + facilityBonus + departmentBonus - fatiguePenalty - riskPenalty + resourceAdjustment));
    const roll = hash(`${game.week}:${contract.rawIntent}:${contract.leaderId}`) % 100;
    const outcome: ActionResult["outcome"] = roll < threshold - 14 ? "成功" : roll < threshold ? "部分成功" : "受阻";
    const matchedMission = missionForContract(game, contract);
    const missionProgress = matchedMission ? outcome === "成功" ? 22 : outcome === "部分成功" ? 12 : 3 : 0;
    const provisionalResult = { outcome } as ActionResult;
    const actingMark = evaluateActing({ ...game, actingMarks }, contract, provisionalResult.outcome);
    if (actingMark) actingMarks.push(actingMark);
    const digestionGain = actingMark?.gain ?? 0;
    const abilityEffects = contract.abilityIds.map((id) => abilities.find((ability) => ability.id === id)).filter((ability): ability is Ability => Boolean(ability)).map((ability) => `${ability.name}用于“${ability.verb}”，消耗${ability.cost}点灵性`);
    const abilityCost = contract.abilityIds.reduce((sum, id) => sum + (abilities.find((ability) => ability.id === id)?.cost ?? 0), 0);
    spirituality = Math.max(0, spirituality - abilityCost);
    const resourceChanges = {
      money: -grantedCommitments.money,
      secrecy: (domain === "security" && outcome !== "受阻" ? 4 : domain === "cover" && outcome !== "受阻" ? 3 : outcome === "受阻" ? -4 : contract.risk === "高" || contract.risk === "致命" ? -3 : -1) + abilityRule.secrecyChange,
      stability: outcome === "受阻" ? -3 : domain === "rest" ? 7 : domain === "training" ? 4 : 0,
      influence: outcome === "成功" && ["交涉", "招募", "建设"].includes(contract.kind) ? 4 : 1,
    };
    money += resourceChanges.money;
    secrecy += resourceChanges.secrecy;
    stability += resourceChanges.stability;
    influence += resourceChanges.influence;
    if (/实名|真名|公开身份|签署|官方会面|出席|公开指控/.test(contract.rawIntent)) nameExposure = Math.min(100, nameExposure + (outcome === "受阻" ? 9 : 5));
    if (/化名|匿名|代理人|不透露姓名|掩护身份/.test(contract.rawIntent)) nameExposure = Math.max(0, nameExposure - (outcome === "成功" ? 3 : 1));
    digestion = Math.min(100, digestion + digestionGain);
    if (outcome === "成功" && /委托|报酬|收款|商业调查|有偿/.test(contract.rawIntent)) contractIncome += Math.max(20, Math.round(grantedCommitments.money * 1.7));
    const violatesCharter = /伤害无辜|灭口|伪造证据|不计代价|禁止撤退|强迫成员/.test(contract.rawIntent);
    const honorsCharter = /保护|救助|验证证据|撤退|求援|不伤害无关者/.test(contract.rawIntent) && outcome !== "受阻";
    if (violatesCharter || honorsCharter) members = members.map((member) => {
      const trust = Math.max(0, Math.min(100, (member.trust ?? member.loyalty) + (violatesCharter ? -3 : 2)));
      const ideology = Math.max(0, Math.min(100, (member.ideology ?? member.loyalty) + (violatesCharter ? -7 : 2)));
      const interest = member.interest ?? member.loyalty;
      return { ...member, trust, ideology, interest, loyalty: Math.round((trust + ideology + interest) / 3) };
    });
    if (contract.kind === "交涉" && outcome !== "受阻") members = members.map((member) => contract.rawIntent.includes(member.name) && member.personalEventState === "active" ? { ...member, personalEventState: "resolved" as const, trust: Math.min(100, (member.trust ?? member.loyalty) + (outcome === "成功" ? 8 : 3)), loyalty: Math.min(100, member.loyalty + (outcome === "成功" ? 5 : 2)) } : member);
    if (leader) {
      leader.fatigue = Math.min(100, leader.fatigue + executionPlan.timeWindow.days * 4 + (contract.risk === "高" ? 6 : 0));
      if (outcome === "受阻" && ["高", "致命"].includes(contract.risk)) { leader.injury = contract.risk === "致命" ? "严重灵性创伤，必须休养" : "外勤负伤"; leader.status = "受伤休养"; }
    }

    if (domain === "rest") {
      members = members.map((member) => ({ ...member, fatigue: Math.max(0, member.fatigue - 18), injury: member.injury && outcome === "成功" ? undefined : member.injury, status: member.injury && outcome === "成功" ? "可安排" : member.status }));
      spirituality = Math.min(game.spiritualityMax, spirituality + 3);
    } else if (domain === "training") {
      members = members.map((member) => ({ ...member, fatigue: Math.min(100, member.fatigue + 2) }));
    }
    if (contract.kind === "研究" && /配方|材料|晋升/.test(contract.rawIntent)) {
      formulaKnowledge = Math.min(100, formulaKnowledge + (outcome === "成功" ? 30 : 12));
      if (formulaKnowledge >= 100) materials = materials.map((item) => ({ ...item, known: true }));
      if (outcome !== "受阻") {
        const missing = materials.find((item) => item.known && !item.obtained);
        if (missing && /寻找|采购|交换|猎取|获得|材料/.test(contract.rawIntent)) {
          missing.obtained = true;
          missing.authenticity = outcome === "成功" ? "已确认" : "待核验";
          missing.purity = outcome === "成功" ? 78 + hash(`${contract.id}:purity`) % 18 : 54 + hash(`${contract.id}:purity`) % 20;
          missing.freshness = outcome === "成功" ? 72 + hash(`${contract.id}:fresh`) % 24 : 50 + hash(`${contract.id}:fresh`) % 24;
          missing.contamination = outcome === "成功" ? hash(`${contract.id}:pollution`) % 7 : 8 + hash(`${contract.id}:pollution`) % 14;
          missing.traceRisk = 6 + hash(`${contract.id}:trace`) % 24;
          missing.storage = "组织材料柜 · 独立封存";
          missing.provenance = `${DISTRICTS.find((district) => district.id === contract.districtId)?.name ?? "未知地区"}行动：${contract.title}`;
        }
      }
    }
    if (contract.kind === "仪式" && /晋升|魔药|扮演|仪式/.test(contract.rawIntent)) {
      ritualReadiness = Math.min(100, ritualReadiness + (outcome === "成功" ? 42 : outcome === "部分成功" ? 20 : 6));
      instability = Math.min(100, instability + (outcome === "受阻" ? 8 : 1));
    }
    if (contract.kind === "建设" && outcome !== "受阻") {
      const workshop = facilities.find((facility) => facility.id === "workshop");
      if (workshop) {
        workshop.name = contract.target.replace(/^(一个|一间|新的)/, "").slice(0, 18) || "自定义设施";
        workshop.type = "自定义设施";
        workshop.description = contract.desiredOutcome;
        workshop.level = Math.max(1, workshop.level);
        workshop.status = "运转中";
        workshop.benefits = [`支持与“${contract.target}”相关的行动`, "可以继续选择隐蔽、稳定或效能取向升级"];
        workshop.risk = contract.redLines;
      }
    }
    if (contract.kind === "招募" && outcome !== "受阻" && recruitPool.length) {
      const recruit = recruitPool.find((item) => contract.rawIntent.includes(item.name) || contract.target.includes(item.name)) ?? recruitPool[hash(contract.target) % recruitPool.length];
      const stages = ["接触", "临时合作", "长期盟友或线人", "正式成员"] as const;
      const currentIndex = stages.indexOf(recruit.relationshipStage ?? "接触");
      const gain = outcome === "成功" ? 1 : 0;
      const nextStage = stages[Math.min(stages.length - 1, currentIndex + gain)];
      recruit.relationshipStage = nextStage;
      recruit.status = nextStage === "正式成员" ? "可安排" : nextStage;
      recruit.trust = Math.min(100, (recruit.trust ?? recruit.loyalty) + (outcome === "成功" ? 12 : 5));
      recruit.loyalty = Math.round(((recruit.trust ?? 0) + (recruit.interest ?? 0) + (recruit.ideology ?? 0)) / 3);
      if (nextStage === "正式成员") {
        members.push({ ...recruit, role: recruit.role.replace(/线人|助手/, "成员") });
        recruitPool = recruitPool.filter((item) => item.id !== recruit.id);
      }
    }
    // The rules engine owns outcome, cost and safety boundaries only. Concrete
    // evidence is created after the AI world turn has supplied observable facts.
    const unlockedEvidenceIds: string[] = [];
    const opportunityRefresh = refreshOpportunities({ ...game, opportunities }, evidenceNodes, contract.opportunityId);
    opportunities = opportunityRefresh.opportunities;
    const unlockedOpportunityIds = opportunityRefresh.newlyAvailable;
    const discoveredSet = new Set(evidenceNodes.filter((item) => item.discovered).map((item) => item.id));
    evidenceLinks = evidenceLinks.map((item) => ({ ...item, discovered: item.discovered || discoveredSet.has(item.from) && discoveredSet.has(item.to) }));
    if (/教会|值夜者|机械之心|提交证据/.test(contract.rawIntent)) factions = factions.map((item) => item.id === "night-church" ? { ...item, trust: Math.min(100, item.trust + (outcome === "成功" ? 8 : 2)), interest: Math.min(100, item.interest + 7), suspicion: Math.min(100, item.suspicion + (outcome === "受阻" ? 5 : 1)), visibility: "已接触" as const } : item);
    if (/王室|政府采购|秘密工程/.test(contract.rawIntent)) factions = factions.map((item) => item.id === "royal-project" ? { ...item, suspicion: Math.min(100, item.suspicion + (outcome === "成功" ? 9 : 4)), interest: Math.min(100, item.interest + 5) } : item);
    const findings = resultFindings(contract, game, outcome);
    return {
      id: contract.id,
      title: contract.title,
      outcome,
      executionStatus: executionPlan.disposition === "partially-completed"
        ? "partially-completed"
        : executionPlan.disposition === "interrupted"
          ? "interrupted"
          : adjudication.review.status === "limited" ? "limited" : "executed",
      executionPlan,
      contract,
      findings,
      consequence: resultConsequence(contract, outcome),
      abilityEffects,
      digestionGain,
      missionProgress,
      missionId: matchedMission?.id,
      resourceChanges,
      reasons: [
        `指令具体度提供 ${specificity} 点准备优势`,
        facility ? `${facility.name}提供了可执行条件` : "没有使用专门设施",
        ...executionPlan.adjustments,
        ...(resourceAdjustment < 0 ? [`实际资源只满足原计划的${Math.round(resourceFulfilment * 100)}%，成功阈值相应降低`] : []),
        ...abilityRule.reasons,
        outcome === "受阻" ? "本次失败确认了目标的警戒与反调查能力" : "方法与实际获批资源通过了本周规则检定",
      ],
      unlockedEvidenceIds,
      unlockedOpportunityIds,
      futureChanges: [
        ...unlockedEvidenceIds.map((id) => `调查板新增：${evidenceNodes.find((item) => item.id === id)?.label}`),
        ...unlockedOpportunityIds.map((id) => `开放新机会：${opportunities.find((item) => item.id === id)?.title}`),
        ...(contract.opportunityId ? [`机会已处理：${game.opportunities.find((item) => item.id === contract.opportunityId)?.title}`] : []),
      ].slice(0, 4),
    };
  });

  const executedResults = results.filter((result) => ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus ?? ""));
  const resultByActionId = new Map(results.map((result) => [result.id, result]));
  const continuationSchedule = game.schedule.flatMap((action) => {
    const result = resultByActionId.get(action.id);
    if (!result) return [action];
    const plan = result.executionPlan;
    if (!plan || ["executed", "limited", "rejected"].includes(result.executionStatus ?? "")) return [];
    const status = result.executionStatus === "escalation-required" || result.executionStatus === "awaiting-authorization"
      ? "awaiting-authorization" as const
      : result.executionStatus === "partially-completed"
        ? "partially-completed" as const
        : result.executionStatus === "interrupted"
          ? "interrupted" as const
          : "deferred" as const;
    const consumed = {
      money: action.execution.consumed.money + (plan.executable ? plan.commitments.money : 0),
      manpower: action.execution.consumed.manpower + (plan.executable ? plan.commitments.manpower : 0),
      extraordinaryMaterials: action.execution.consumed.extraordinaryMaterials + (plan.executable ? plan.commitments.extraordinaryMaterials : 0),
      spirituality: action.execution.consumed.spirituality + (plan.executable ? plan.commitments.spirituality : 0),
    };
    const progress = Math.min(99, action.execution.progress + (plan.executable ? plan.progressDelta : 0));
    return [{
      ...action,
      startDay: 1,
      status,
      execution: {
        ...action.execution,
        attemptOrdinal: action.execution.attemptOrdinal + 1,
        status,
        progress,
        consumed,
        nextEligibleWeek: status === "awaiting-authorization" ? null : plan.nextEligibleWeek ?? game.week + 1,
        lastAttemptId: plan.attemptId,
        lastReason: plan.interruptionReason ?? result.consequence,
        consequenceEventIds: [...new Set([...action.execution.consequenceEventIds, ...plan.causeEventIds])],
      },
    }];
  });

  const fieldDepartment = game.departments.find((item) => item.id === "field");
  const autoVerified = fieldDepartment && fieldDepartment.autonomy >= 40 ? evidenceNodes.find((item) => item.discovered && item.certainty === "推断") : undefined;
  if (autoVerified) autoVerified.certainty = "可信证据";
  const quarters = facilities.find((item) => item.id === "quarters" && item.status === "运转中");
  if (quarters) members = members.map((member) => ({ ...member, fatigue: Math.max(0, member.fatigue - (2 + quarters.level * 2)) }));
  const overAutonomous = game.departments.filter((item) => item.autonomy >= 70);
  if (overAutonomous.length) secrecy -= overAutonomous.length * 2;
  const hostileSuspicion = Math.max(...factions.map((item) => item.suspicion), 0);
  evidenceNodes = evidenceNodes.map((item) => {
    if (!item.discovered || item.compromised) return item;
    if (item.expiresWeek && game.week > item.expiresWeek) return { ...item, compromised: true, certainty: "传闻" as const, summary: `${item.summary} 原始窗口已经关闭，必须重新核验。` };
    if (hostileSuspicion >= 60 && item.weekDiscovered && item.weekDiscovered < game.week - 2 && hash(`${game.week}:${item.id}:counter`) % 100 < 18) return { ...item, compromised: true, certainty: "推断" as const, summary: `${item.summary} 对方已经修改相关记录，这份证据只能证明曾经存在过异常。` };
    return item;
  });
  const departmentMoves: WorldMove[] = [
    ...(autoVerified ? [{ id: `move-${game.week}-field`, factionId: "organization", title: "外勤部门完成外围核验", detail: `${autoVerified.label}从推断提升为可信证据；这是部门自主权带来的自动产出。`, week: game.week, visibility: "确认" as const }] : []),
    ...overAutonomous.map((department) => ({ id: `move-${game.week}-${department.id}-autonomy`, factionId: "organization", title: `${department.name}越权行动`, detail: `部门以${department.autonomy}%自主权绕过了一次完整汇报，效率提高，但留下额外行动痕迹。`, week: game.week, visibility: "迹象" as const })),
  ];
  let missions = game.missions.map((mission) => {
    if (mission.state !== "active") return mission;
    const missionProgress = executedResults.filter((result) => result.missionId === mission.id).reduce((sum, result) => sum + result.missionProgress, 0);
    const progress = Math.min(100, mission.progress + missionProgress);
    const deadline = Math.max(0, mission.deadline - 1);
    return { ...mission, progress, deadline, urgency: Math.min(100, mission.urgency + (missionProgress ? -8 : 9)), state: progress >= 100 ? "resolved" as const : deadline === 0 ? "failed" as const : "active" as const };
  });
  if (missions.some((mission) => mission.id === "first-knock" && mission.state === "failed") && !missions.some((mission) => mission.id === "threshold-open")) {
    missions = [...missions, { id: "threshold-open", title: "门槛已经打开", premise: "黑玻璃挂坠与某个未知地点建立了稳定联系。据点附近开始出现重复的脚步声，组织必须迁移、封闭联系或找出另一端。", deadline: 2, urgency: 88, progress: 0, consequence: "据点位置将进入官方与未知势力的共同视野。", hints: ["举行封闭仪式", "迁移核心资产", "沿联系反向追踪", "向可信教会求援"], state: "active" }];
  }
  if (missions.some((mission) => mission.id === "first-knock" && mission.state === "resolved") && !missions.some((mission) => mission.id === "hidden-route")) {
    missions = [...missions, { id: "hidden-route", title: "同一条隐秘运输线", premise: "挂坠、名单与失踪信使不再是孤立异常。已有证据正在指向一条服务于秘密工程的人员和物资路线。", deadline: 6, urgency: 66, progress: evidenceNodes.filter((item) => ["ev-ink", "ev-carriage", "ev-factory", "ev-population"].includes(item.id) && item.discovered).length * 18, consequence: "若无法在窗口关闭前建立证据链，相关势力会更换仓库、身份与运输路线。", hints: ["追查政府采购", "监视凌晨货运", "进入废弃纺织厂", "建立教会合作", "救助并保护潜在证人"], state: "active" }];
  }
  if (game.week >= 21 && !missions.some((mission) => mission.id === "smog-endgame")) {
    missions = [...missions, { id: "smog-endgame", title: "雾正在等待命令", premise: "煤气、人口、仪式材料与行政封锁已经进入最后汇合阶段。组织必须决定阻止、利用、改变还是逃离。", deadline: 3, urgency: 96, progress: Math.min(85, evidenceNodes.filter((item) => item.discovered).length * 7 + factions.find((item) => item.id === "night-church")!.planProgress / 3), consequence: "大雾霾将按现有条件爆发，并永久改变贝克兰德与所有相关人物。", hints: ["向教会提交完整证据", "破坏仪式材料", "疏散不可见人口", "追查王室工程核心", "准备撤离贝克兰德"], state: "active" }];
  }
  const worldText = `${executedResults.length
    ? executedResults.some((result) => result.missionProgress > 0)
      ? "本周决议干预了当前危机，但城市其他区域没有停止。"
      : "组织执行了本周决议；它没有直接推进当前危机，城市其他区域仍在变化。"
    : "组织本周没有发出正式行动命令。"} 城市之外的变化将由独立世界模型推演，而不是由本地事件表代写。`;
  const chapter = buildLocalChapter(game, results, worldText);
  const nextWeek = game.week + 1;
  const coverIncome = 48 + Math.floor(game.influence / 5);
  const facilityCost = facilities.filter((item) => item.status === "运转中").reduce((sum, item) => sum + (item.maintenance ?? Math.max(2, item.level * 3)), 0) + game.organizationProfile.satellites.reduce((sum, item) => sum + item.upkeep, 0);
  const departmentCost = game.departments.reduce((sum, item) => sum + item.budget, 0);
  const actionCost = executedResults.reduce((sum, item) => sum + Math.max(0, -item.resourceChanges.money), 0);
  const staffSupport = members.reduce((sum, member) => sum + (member.pathway ? 5 : 3), 0);
  money += coverIncome + contractIncome - facilityCost - departmentCost - staffSupport;
  const commitments = [
    ...facilities.filter((item) => item.status === "运转中").map((item) => ({ id: `facility:${item.id}`, label: item.name, amount: item.maintenance ?? Math.max(2, item.level * 3), dueWeek: nextWeek, kind: "设施" as const })),
    ...game.departments.map((item) => ({ id: `department:${item.id}`, label: item.name, amount: item.budget, dueWeek: nextWeek, kind: "部门" as const })),
    { id: `staff:${nextWeek}`, label: `${members.length}名核心成员的生活与身份维持`, amount: staffSupport, dueWeek: nextWeek, kind: "人员" as const },
  ];
  const expectedBalance = money + coverIncome - commitments.reduce((sum, item) => sum + item.amount, 0);
  const economyEntry = { week: game.week, coverIncome, contractIncome, facilityCost, departmentCost, actionCost, staffSupport, balance: money, expectedBalance, commitments };
  const baseDeviation = Math.min(100, game.deviation + executedResults.filter((result) => result.outcome === "成功").length * .55 + executedResults.reduce((sum, item) => sum + (item.unlockedEvidenceIds?.length ?? 0), 0) * .32);
  const pivotResolution = buildPivots(game, nextWeek, evidenceNodes, factions, baseDeviation);
  let timeline = timelineAfterWeek(game.timeline, nextWeek, evidenceNodes);
  if (pivotResolution.pivots.some((item) => item.id === "pivot-sabotage")) timeline = timeline.map((event) => ["tl-procurement", "tl-smog-eve"].includes(event.id) ? { ...event, status: "diverted" as const, revealed: true, summary: `${event.summary} 该事件已因组织破坏基础设施而改走新的因果分支。` } : event);
  const conditions = organizationConditions(secrecy, stability, influence, money);
  const dangerousPlayerResult = executedResults.find((result) => result.contract.leaderId === "player" && ["高", "致命"].includes(result.contract.risk) && result.outcome !== "成功");
  const fatalSituation = dangerousPlayerResult ? {
    id: `fatal-${dangerousPlayerResult.id}`,
    actionId: dangerousPlayerResult.id,
    title: "现场撤离窗口正在闭合",
    threat: dangerousPlayerResult.contract.risk === "致命" ? "超出当前序列的非凡力量已经锁定现场；继续停留可能导致死亡。" : "队伍的身份与撤离路线同时受到威胁，错误选择会把伤势升级为致命局面。",
    knownThreats: [dangerousPlayerResult.contract.unknowns, dangerousPlayerResult.contract.retreat, `当前生命 ${game.playerCondition.health}，污染 ${game.playerCondition.pollution}`],
    stage: "decision" as const,
    odds: { retreat: Math.min(92, 70 + Math.floor(secrecy / 8)), help: Math.min(90, 52 + Math.floor((factions.find((item) => item.id === "night-church")?.trust ?? 0) / 2)), continue: Math.min(68, 24 + (10 - game.currentSequence) * 5 + dangerousPlayerResult.contract.abilityIds.length * 4) },
  } : null;
  const occultUses = executedResults.reduce((sum, result) => sum + (result.contract.methodTags?.includes("occult") ? result.contract.abilityIds.length : 0), 0);
  const playerCondition = { ...game.playerCondition, pollution: Math.min(100, game.playerCondition.pollution + occultUses + (dangerousPlayerResult ? 3 : 0)), health: Math.min(100, game.playerCondition.health + (executedResults.some((item) => item.contract.kind === "休整") ? 8 : 0)), injuries: [...game.playerCondition.injuries] };
  // Canon characters are advanced by the AI world simulator after the rules
  // transaction succeeds. Keeping them unchanged here prevents a local event
  // table from impersonating a living world.
  const canonActors = game.canonActors.map((actor) => ({ ...actor }));
  const cases = updateCases(game, evidenceNodes, nextWeek);
  const smogTimeline = timeline.find((event) => event.id === "tl-great-smog");
  const shouldEnterFinale = game.ending.phase === "running"
    && nextWeek >= 21
    && Boolean(smogTimeline && smogTimeline.status !== "resolved" && smogTimeline.status !== "diverted");
  const ending = game.ending;
  const organizationCausality = advanceOrganizationCausality({ ...game, members, recruitPool }, executedResults, nextWeek);
  const extraordinaryMaterialsSpent = adjudications
    .filter((item) => item.executionPlan.executable)
    .reduce((sum, item) => sum + item.executionPlan.commitments.extraordinaryMaterials, 0);
  const managementBeforeTurn = syncSealedArtifactsFromInventory(game.management, inventory);
  const managementTurn = advanceOrganizationManagementWeek({
    ...managementBeforeTurn,
    resources: {
      ...managementBeforeTurn.resources,
      extraordinaryMaterials: Math.max(0, managementBeforeTurn.resources.extraordinaryMaterials - extraordinaryMaterialsSpent),
    },
  }, {
    week: nextWeek,
    legacyMoney: money,
    actionSummaries: executedResults.map((result) => `${result.contract.rawIntent} ${result.contract.methodTags?.join(" ") ?? ""} ${result.outcome}`),
    actions: executedResults.map((result) => ({ actionId: result.id, districtId: result.contract.districtId, outcome: result.outcome, summary: `${result.contract.rawIntent} ${result.contract.target} ${result.contract.approach}`, methodTags: result.contract.methodTags ?? [] })),
    governanceMembers: organizationCausality.members.map(({ id, name, pathway, sequence, specialty, fatigue, status }) => ({ id, name, pathway, sequence, specialty, fatigue, status })),
    scheduledMemberIds: [...new Set([
      ...executedResults.flatMap((result) => result.contract.memberIds),
      ...game.management.branches.filter((branch) => branch.status !== "lost" && branch.status !== "evacuating").flatMap((branch) => branch.stationedBeyonderIds),
    ].filter((id) => id !== "player"))],
    strategicCompetition: true,
    knownPathwayIds: [game.pathwayId],
  });
  const factionStrategyTurn = resolveFactionStrategyRound(
    game.factionStrategy,
    managementTurn.state.map,
    managementTurn.state.factionHostility,
    game.worldKernel,
    game.week,
    managementTurn.state.manpowerAllocation.intelligence * 8,
  );
  let managementState = { ...managementTurn.state, map: factionStrategyTurn.map, factionHostility: factionStrategyTurn.hostilities };
  const highSequenceLedger = applyHighSequenceActionResults(game.highSequenceLedger, game.pathwayId, executedResults.map((result) => ({
    id: result.id,
    outcome: result.outcome,
    text: `${result.contract.rawIntent} ${result.contract.target} ${result.contract.desiredOutcome} ${result.findings.join(" ")}`,
    locationId: result.contract.districtId,
  })), game.week);
  let campaignWorld = applyCampaignActionResults(game.campaignWorld, executedResults.map((result) => ({
    id: result.id,
    outcome: result.outcome,
    text: `${result.contract.rawIntent} ${result.contract.target} ${result.contract.desiredOutcome}`,
  })), game.week);
  campaignWorld = advanceCampaignWorld(campaignWorld, {
    week: nextWeek,
    currentSequence: game.currentSequence,
    pathwayId: game.pathwayId,
    smogResolved: facts.some((fact) => fact.subject === "贝克兰德大雾霾" && fact.certainty === "确认"),
  });
  const remoteYield = campaignWeeklyYield(campaignWorld);
  managementState = {
    ...managementState,
    resources: {
      manpower: managementState.resources.manpower + remoteYield.manpower,
      money: managementState.resources.money + remoteYield.money,
      extraordinaryMaterials: managementState.resources.extraordinaryMaterials + remoteYield.extraordinaryMaterials,
    },
  };
  factions = factions.map((faction) => {
    const relation = managementState.factionHostility.find((item) => item.factionId === faction.id);
    if (!relation) return faction;
    return {
      ...faction,
      suspicion: Math.max(faction.suspicion, relation.hostility),
      trust: Math.max(0, Math.min(100, faction.trust - Math.max(0, relation.hostility - 45) / 12)),
      leverage: Math.max(faction.leverage, relation.leverageAgainstPlayer),
    };
  });
  const managedDevelopment = new Map(managementState.beyonderDevelopment.map((record) => [record.memberId, record]));
  const managedMembers = organizationCausality.members.map((member) => {
    const record = managedDevelopment.get(member.id);
    if (!record) return member;
    const status = record.status === "unstable" ? "需要失控监护" : record.status === "ready" ? "已完成消化" : record.status === "adapting" ? "适应魔药中" : "消化魔药中";
    return { ...member, sequence: record.sequence, status };
  });
  const escalationIssues = adjudications
    .filter((item) => item.review.status === "escalation-required")
    .map((item) => {
      const contract = eligibleSchedule.find((action) => action.id === item.proposal.sourceContractId);
      const resourceConflict = item.review.reasons.some((reason) => /资源|预算|资金|人力|材料/.test(reason));
      return {
        id: `org-issue-authorization-${item.proposal.sourceContractId ?? item.proposal.id}-${nextWeek}`,
        weekCreated: nextWeek,
        category: resourceConflict ? "资源" as const : "成员" as const,
        sourceId: contract?.leaderId ?? item.proposal.sourceContractId ?? item.proposal.id,
        title: `${contract?.title ?? item.proposal.intent}需要追加授权`,
        summary: `负责人没有越过既定边界。${item.review.reasons.join("；")} 请决定调整投入、改变执行安排，或维持原授权并放弃本次行动。`,
        urgency: contract?.risk === "致命" ? 92 : contract?.risk === "高" ? 78 : 64,
        deadline: nextWeek + 1,
        signals: [...item.review.reasons, ...item.executionPlan.adjustments].slice(0, 4),
        state: "待裁决" as const,
        originActionId: contract?.id,
        strategyIntentId: contract?.strategyIntentId,
        causeEventIds: contract?.causeEventIds ?? [],
        directiveState: "awaiting-authorization" as const,
      };
    });
  const organizationIssues = [
    ...organizationCausality.organizationIssues.filter((issue) => !escalationIssues.some((nextIssue) => nextIssue.id === issue.id)),
    ...escalationIssues,
  ].slice(-60);
  let nextState: GameState = {
    ...game,
    week: nextWeek,
    date: addWeeksToDate(nextWeek),
    money: managementState.resources.money,
    secrecy: Math.max(0, Math.min(100, secrecy)),
    stability: Math.max(0, Math.min(100, stability)),
    influence: Math.max(0, Math.min(100, influence)),
    deviation: pivotResolution.deviation,
    digestion,
    actingMarks: actingMarks.slice(-80),
    spirituality: Math.min(game.spiritualityMax, spirituality + Math.max(8, Math.floor(game.spiritualityMax * .6))),
    mentalLoad: Math.max(0, game.mentalLoad - 12),
    formulaKnowledge,
    ritualReadiness,
    instability,
    nameExposure,
    materials,
    facilities,
    members: managedMembers,
    recruitPool: organizationCausality.recruitPool,
    departments: organizationCausality.departments,
    departmentReports: organizationCausality.departmentReports,
    organizationIssues,
    inventory,
    facts: facts.slice(-80),
    missions,
    schedule: continuationSchedule,
    chronicle: [chapter, ...game.chronicle],
    evidenceNodes,
    evidenceLinks,
    opportunities,
    factions,
    timeline,
    worldMoves: [
      ...managementTurn.events.map((detail, index) => ({ id: `management-${nextWeek}-${index}`, factionId: "organization", title: "贝克兰德经营态势变化", detail, week: nextWeek, visibility: "迹象" as const })),
      ...factionStrategyTurn.signals.map((signal) => ({ id: signal.id, factionId: signal.factionId ?? "unknown", title: "战略点势力变化", detail: signal.summary, week: game.week, visibility: signal.visibility === "confirmed" ? "确认" as const : signal.visibility === "identified" ? "获知" as const : "迹象" as const })),
      ...departmentMoves,
      ...game.worldMoves,
    ].slice(0, 80),
    worldSignals: game.worldSignals ?? [],
    worldSnapshots: game.worldSnapshots ?? [],
    economyHistory: [economyEntry, ...game.economyHistory].slice(0, 60),
    organizationConditions: conditions,
    cases,
    pivots: pivotResolution.pivots,
    canonActors,
    fatalSituation,
    playerCondition,
    ending,
    management: managementState,
    factionStrategy: factionStrategyTurn.state,
    highSequenceLedger,
    campaignWorld,
  };
  if (shouldEnterFinale) nextState = { ...nextState, ending: { ...nextState.ending, phase: "major-event", title: "贝克兰德大雾霾", campaign: createFinaleCampaign(nextState) } };
  nextState = {
    ...nextState,
    memory: deriveLocalMemory(
      nextState.memory ?? emptyMemoryState(),
      game.members,
      nextState.members,
      executedResults,
      game.week
    ),
    attentionSimulation: advanceAttentionSimulation(nextState.attentionSimulation, {
      week: nextWeek,
      organizationIssues: nextState.organizationIssues,
    }),
  };
  nextState = advanceFateWeek(nextState);
  worldLedger = appendWorldLedgerEvents(worldLedger, results.map((result) => {
    const adjudication = adjudicationByContractId.get(result.id);
    const original = game.schedule.find((action) => action.id === result.id);
    const continuation = continuationSchedule.find((action) => action.id === result.id);
    const plan = result.executionPlan;
    const previousProgress = original?.execution.progress ?? 0;
    const progressAfter = continuation?.execution.progress
      ?? (["executed", "limited"].includes(result.executionStatus ?? "") ? 100 : previousProgress);
    const previousConsumed = original?.execution.consumed
      ?? { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 };
    const consumedAfter = continuation?.execution.consumed ?? {
      money: previousConsumed.money + (plan?.executable ? plan.commitments.money : 0),
      manpower: previousConsumed.manpower + (plan?.executable ? plan.commitments.manpower : 0),
      extraordinaryMaterials: previousConsumed.extraordinaryMaterials + (plan?.executable ? plan.commitments.extraordinaryMaterials : 0),
      spirituality: previousConsumed.spirituality + (plan?.executable ? plan.commitments.spirituality : 0),
    };
    const toStatus = result.executionStatus === "partially-completed"
      ? "partially-completed"
      : result.executionStatus === "interrupted"
        ? "interrupted"
        : result.executionStatus === "deferred"
          ? "deferred"
          : ["escalation-required", "awaiting-authorization"].includes(result.executionStatus ?? "")
            ? "awaiting-authorization"
            : result.executionStatus === "rejected"
              ? "rejected"
              : "resolved";
    return {
      id: `progress:${plan?.attemptId ?? `${result.id}:${game.week}`}`,
      week: game.week,
      phase: "player-actions" as const,
      kind: "action-progressed" as const,
      summary: `${result.title}: ${toStatus}`,
      actorIds: [result.contract.leaderId, ...result.contract.memberIds].filter((id) => id !== "player"),
      factionIds: [],
      witnessRefs: [result.contract.leaderId, ...result.contract.memberIds].map((id) => id === "player" ? "player" : `actor:${id}`),
      causeEventIds: adjudication ? [`review:${adjudication.proposal.id}`] : [`proposal:${game.week}:${result.id}`],
      audience: {
        visibility: "actors" as const,
        holderRefs: [result.contract.leaderId, ...result.contract.memberIds].map((id) => id === "player" ? "player" : `actor:${id}`),
      },
      payload: {
        actionId: result.id,
        attemptId: plan?.attemptId,
        attemptOrdinal: original?.execution.attemptOrdinal ?? 0,
        originWeek: original?.execution.originWeek ?? game.week,
        fromStatus: original?.execution.status ?? "planned",
        toStatus,
        progressBefore: previousProgress,
        progressAfter,
        resourcesUsed: plan?.executable
          ? plan.commitments
          : { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
        consumedAfter,
        nextEligibleWeek: continuation?.execution.nextEligibleWeek ?? null,
        reason: plan?.interruptionReason ?? result.consequence,
        consequenceEventIds: continuation?.execution.consequenceEventIds ?? plan?.causeEventIds ?? [],
      },
    };
  }));
  worldLedger = appendWorldLedgerEvents(worldLedger, results.filter((result) => ["executed", "limited", "rejected"].includes(result.executionStatus ?? "")).map((result) => {
    const adjudication = adjudicationByContractId.get(result.id);
    return {
      week: game.week,
      phase: "player-actions" as const,
      kind: "action-resolved" as const,
      summary: `${result.title}：${result.outcome}`,
      actorIds: [result.contract.leaderId, ...result.contract.memberIds].filter((id) => id !== "player"),
      factionIds: [],
      witnessRefs: [result.contract.leaderId, ...result.contract.memberIds].map((id) => id === "player" ? "player" : `actor:${id}`),
      causeEventIds: adjudication ? [`review:${adjudication.proposal.id}`] : [`proposal:${game.week}:${result.id}`],
      audience: {
        visibility: "actors" as const,
        holderRefs: [result.contract.leaderId, ...result.contract.memberIds].map((id) => id === "player" ? "player" : `actor:${id}`),
      },
      payload: {
        actionId: result.id,
        outcome: result.outcome,
        executionStatus: result.executionStatus,
        resourceChanges: result.resourceChanges,
        missionProgress: result.missionProgress,
        review: adjudication?.review,
        executionPlan: adjudication?.executionPlan,
      },
    };
  }));
  worldLedger = recordWorldLedgerPhase(worldLedger, game.week, "player-actions", "玩家行动已完成统一规则裁定", {
    proposed: proposals.length,
    executed: adjudications.filter((item) => item.executionPlan.executable).length,
    limited: adjudications.filter((item) => item.review.status === "limited").length,
    escalated: adjudications.filter((item) => item.review.status === "escalation-required").length,
    rejected: adjudications.filter((item) => item.review.status === "rejected").length,
  });
  worldLedger = recordWorldLedgerPhase(worldLedger, game.week, "economy", "组织收支与持续承诺已结算", { balance: nextState.money, coverIncome, contractIncome, facilityCost, departmentCost, staffSupport });
  worldLedger = recordWorldLedgerPhase(worldLedger, game.week, "development", "成员、部门与组织发展已结算", { memberCount: nextState.members.length, departmentCount: nextState.departments.length });
  worldLedger = recordWorldLedgerPhase(worldLedger, game.week, "map-control", "贝克兰德区块与战略点控制已结算", { managementEvents: managementTurn.events, factionOrders: factionStrategyTurn.orders, factionReviews: factionStrategyTurn.reviews, factionOutcomes: factionStrategyTurn.outcomes });
  worldLedger = recordWorldLedgerPhase(worldLedger, game.week, "relationships", "成员、招募对象与势力关系已结算", { recruitCount: nextState.recruitPool.length, factionCount: nextState.factions.length });
  worldLedger = recordWorldLedgerPhase(worldLedger, game.week, "consequences", "命运、失控与延迟后果已结算", { fatePressure: nextState.fate?.pressure ?? 0, controlStage: nextState.control?.stage ?? "stable" });
  nextState = { ...nextState, worldLedger };
  return { state: nextState, chapter };
}

export { generateLiteraryChapter } from "./literary-generation-service.ts";
export type NpcDialogueResult = {
  reply: string;
  mood: string;
  memory: string | null;
  trustDelta: number;
  proposal: null;
  managementAction: null | {
    kind: "screen-candidates";
    manpower: number;
    moneyCost: number;
  };
};

export type SituationBrief = {
  title: string;
  dateline: string;
  paragraphs: string[];
};

export async function generateSituationBrief(config: AiConfig, game: GameState): Promise<SituationBrief> {
  const { LORE_RECORDS } = await import("./generated-lore-compendium");
  const lore = await loreForPlayer(LORE_RECORDS, game, `${game.date} 贝克兰德 ${game.missions.filter((item) => item.state === "active").map((item) => item.title).join(" ")} ${game.worldSignals.slice(0, 5).map((item) => item.headline).join(" ")}`);
  const situationMemoryView = memoryPromptBlockWithIds(game.memory, "player", "player", game.week);
  const payload = {
    week: game.week,
    date: game.date,
    player: { name: game.playerName, address: game.playerAddress, pathway: PATHWAYS[game.pathwayId].name, sequence: game.currentSequence, origin: game.playerOrigin },
    organization: { name: game.organizationName, cover: game.coverIdentity, conditions: game.organizationConditions, members: game.members.map((member) => ({ name: member.name, role: member.role, status: member.status })) },
    pressures: game.missions.filter((mission) => mission.state === "active"),
    lastChapter: game.chronicle[0] ? { title: game.chronicle[0].title, summary: game.chronicle[0].summary } : null,
    currentWorld: game.worldSnapshots?.[0] ? { week: game.worldSnapshots[0].week, date: game.worldSnapshots[0].date, publicAtmosphere: game.worldSnapshots[0].atmosphere } : null,
    publicSignals: game.worldSignals?.slice(0, 8).map((signal) => ({ ...signal, relatedFactionId: undefined })) ?? [],
    knownFacts: game.facts.slice(-16),
    authorizedLore: lore.context || null,
    loreRecordIds: lore.records.map((item) => item.id),
    dynamicMemory: situationMemoryView.text,
  };
  const raw = extractJson(await callModel(config, "你为原创维多利亚神秘主义互动小说《灰雾纪事》写玩家进入存档时看到的当前现状。它必须像小说真正开始的一页，不是教程、任务清单、系统摘要或模板化周报。使用有限视角、具体物件、声音、天气、人物动作与消息来源，让玩家理解此刻身在何处、世界刚发生了什么、什么压力正在逼近以及自己可以自由行动。不要替玩家决定情绪或选择，不泄露角色未知的幕后真相，不复制任何现成小说句子。只返回JSON。", `写一个标题、日期行和3至6个自然段。段落可以长短不一，不要使用“当前状况/你的目标/建议行动”之类标签。返回{"title":"小说式标题","dateline":"日期与地点","paragraphs":["完整段落"]}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 3200, temperature: .92 }));
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : "";
  const dateline = typeof raw.dateline === "string" && raw.dateline.trim() ? raw.dateline.trim().slice(0, 120) : "";
  const paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 1200)).slice(0, 6) : [];
  if (!title || !dateline || paragraphs.length < 3) throw new Error("模型没有返回完整的开局现状页；游戏仍停留在标题页，不会显示模板替代内容");
  game.memory = submitMemoryDelivery(game.memory, {
    actionId: `situation:${game.week}`,
    modelCallId: `situation:${game.week}`,
    stage: "situation",
    audience: narratorAudience(),
    memoryIds: situationMemoryView.ids,
    week: game.week,
  });
  return { title, dateline, paragraphs };
}

export async function generateNpcDialogue(config: AiConfig, game: GameState, memberId: string, playerText: string, context: "council" | "private" = "council"): Promise<NpcDialogueResult> {
  const member = game.members.find((item) => item.id === memberId);
  if (!member) throw new Error("没有找到这名成员");
  const governanceOffice = game.management.offices.find((office) => office.incumbentId === memberId || office.actingMemberId === memberId);
  const { LORE_RECORDS } = await import("./generated-lore-compendium");
  const lore = await loreForActor(LORE_RECORDS, game, member, `${playerText} ${member.role} ${member.specialty} ${game.date}`);
  const thread = game.dialogueThreads.find((item) => item.memberId === memberId);
  const currentPressure = game.missions.find((item) => item.state === "active");
  const dialogueMemoryView = memoryPromptBlockWithIds(game.memory, "dialogue", memberId, game.week);
  const system = `你正在扮演原创人物${member.name}，参加维多利亚神秘组织的${context === "council" ? "每周密议" : "私下谈话"}。组织领导人是${game.playerName || "尚未登记姓名的负责人"}，正式场合应自然地称其为“${game.playerAddress || "会长阁下"}”，但不要每一段都重复称呼。你不是菜单、助手或任务发布器，而是一个有局限、有利益、有情绪、有当下注意力的人。
固定背景：${member.background ?? "未登记"}
性格核心：${member.core ?? "谨慎"}
说话习惯：${member.voice ?? "自然交谈"}
当前成长矛盾：${member.arc ?? "仍在观察组织"}
隐藏事实（只用于潜台词，除非现有关系与游戏证据足以支持，绝对不得直接泄露）：${member.secret ?? "无"}
关系：信任${member.trust ?? member.loyalty}（越高越直率，越低越试探）、利益${member.interest}、理念${member.ideology}、疲劳${member.fatigue}、关系阶段${member.relationshipStage ?? "正式成员"}。关系阶段与信任直接决定称呼、亲疏和话里藏话的程度：信任低时多保留、试探、谈条件；信任高时可以直说、提异议、甚至开简短玩笑。当前个人事件：${member.personalEvent ?? "无"}（状态：${member.personalEventState ?? "dormant"}）。你尊重组织层级：可以保留意见、请求澄清、陈述风险、婉拒违背原则的命令，但必须保持克制而正式，不得无礼顶撞、讥讽、贬低或反过来命令负责人；只有进入明确背叛或敌对状态后才可破例。只能使用人物可能知道的事实，不能读取原著幕后真相，不能替规则宣布行动成功、资源变化或人物死亡。
严格避免模板腔：禁止“请您示下”“由您拍板”“一切听从安排”“我建议您三思”这类收尾套话；禁止“关于这件事/依我看/总的来说”这类标签式开场；禁止每条回复都以称呼开头；禁止用“首先/其次/最后”或“我分几点讲”组织回答；禁止机械复述玩家原话。信息来源要自然地藏在动作、回忆、引语和措辞中；若问题很简单，一句话即可。只返回严格JSON。`;
  const payload = {
    week: game.week,
    playerSaid: playerText,
    recentConversation: thread?.messages.slice(-12).map((item) => ({ role: item.role, text: item.text, context: item.context })) ?? [],
    lastingMemories: thread?.memories.slice(-6) ?? [],
    currentPressure: currentPressure ? { title: currentPressure.title, premise: currentPressure.premise, consequence: currentPressure.consequence } : null,
    lastWeek: game.chronicle[0] ? { summary: game.chronicle[0].summary, results: game.chronicle[0].results.map((item) => ({ title: item.title, outcome: item.outcome, findings: item.findings })) } : null,
    knownFacts: game.facts.slice(-14),
    currentWorld: game.worldSnapshots?.[0] ? { week: game.worldSnapshots[0].week, date: game.worldSnapshots[0].date, atmosphere: game.worldSnapshots[0].atmosphere, changes: game.worldSnapshots[0].changes } : null,
    authorizedWorldView: game.worldKernel ? {
      observations: game.worldKernel.observations.filter((item) => item.visibility === "public" || item.holderIds.includes(member.id) || item.holderRefs?.includes(`actor:${member.id}`)).slice(-12),
      knowledge: game.worldKernel.knowledge.filter((item) => item.visibility === "public" || item.holderIds.includes(member.id) || item.holderRefs?.includes(`actor:${member.id}`)).slice(-12),
    } : null,
    recentSignals: game.worldSignals?.slice(0, 8) ?? [],
    authorizedLore: lore.context || null,
    loreRecordIds: lore.records.map((item) => item.id),
    dynamicMemory: dialogueMemoryView.text,
    scheduledOrders: game.schedule.map((item) => ({ title: item.title, leaderId: item.leaderId, risk: item.risk })),
    relationship: {
      trust: member.trust ?? member.loyalty,
      interest: member.interest,
      ideology: member.ideology,
      loyalty: member.loyalty,
      fatigue: member.fatigue,
      stage: member.relationshipStage ?? "正式成员",
      personalEvent: member.personalEvent ?? null,
      personalEventState: member.personalEventState ?? "dormant",
      lastMood: thread?.lastMood ?? null,
      promises: member.promises ?? [],
    },
    governanceOffice: governanceOffice ? { id: governanceOffice.id, name: governanceOffice.name, responsibility: governanceOffice.responsibility } : null,
    managementCapacity: governanceOffice?.id === "internal-affairs" ? {
      headquartersManpower: game.management.manpowerAllocation.headquarters,
      money: game.management.resources.money,
      alreadyScreenedThisWeek: game.management.screeningProjects.some((project) => project.startedWeek === game.week && project.status !== "cancelled"),
    } : null,
  };
  const raw = extractJson(await callModel(config, system, `像真实人物一样回应此刻这一句话。长度完全服从内容：可以20字，也可以在复杂问题中达到500字；不要为满足格式凭空扩写。普通谈话不要生成任务或提案卡。如果近期有该成员职责范围内的新信号、记忆、个人事件或上周结果，尽量自然引用其中一条具体内容，避免空泛表态；没有就不硬凑。只有当此人确实担任内务负责人、玩家明确要求筛选或提交可提拔的基层人选、且本周尚未筛选时，才返回managementAction；人力取3到5，经费至少20且不得超过现有资金，投入越高档案越充分。其他情况必须为null。返回：{"reply":"自然动作与口语组成的回应，不包含分类标签","mood":"不超过8字的当前状态","memory":"真正值得以后记住的关系事实或null","trustDelta":-2到2,"managementAction":null或{"kind":"screen-candidates","manpower":3到5,"moneyCost":20以上}}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 1900, temperature: .96 }));
  const reply = typeof raw.reply === "string" ? raw.reply.trim().slice(0, 1200) : "";
  if (!reply) throw new Error("人物没有形成可用回应");
  const mood = typeof raw.mood === "string" ? raw.mood.trim().slice(0, 16) : "克制";
  const memory = typeof raw.memory === "string" && raw.memory.trim() ? raw.memory.trim().slice(0, 180) : null;
  const trustDelta = Math.max(-2, Math.min(2, Number(raw.trustDelta) || 0));
  const rawManagementAction = raw.managementAction && typeof raw.managementAction === "object" && !Array.isArray(raw.managementAction) ? raw.managementAction as Record<string, unknown> : null;
  const managementAction = governanceOffice?.id === "internal-affairs" && rawManagementAction?.kind === "screen-candidates"
    ? {
      kind: "screen-candidates" as const,
      manpower: Math.max(3, Math.min(5, Math.round(Number(rawManagementAction.manpower) || 3))),
      moneyCost: Math.max(20, Math.min(game.management.resources.money, Math.round(Number(rawManagementAction.moneyCost) || 30))),
    }
    : null;
  game.memory = submitMemoryDelivery(game.memory, {
    actionId: `dialogue:${memberId}:${game.week}`,
    modelCallId: `dialogue:${memberId}:${game.week}:${playerText.slice(0, 40)}`,
    stage: "dialogue",
    audience: actorAudience(memberId, true),
    memoryIds: dialogueMemoryView.ids,
    week: game.week,
  });
  game.memory = markMemoryPresented(game.memory, {
    actionId: `dialogue:${memberId}:${game.week}`,
    modelCallId: `dialogue:${memberId}:${game.week}:${playerText.slice(0, 40)}`,
    stage: "dialogue",
    audience: actorAudience(memberId, true),
    memoryIds: dialogueMemoryView.ids,
    week: game.week,
  });
  return { reply, mood, memory, trustDelta, proposal: null, managementAction };
}

export async function generateAiWorldDelta(config: AiConfig, game: GameState, chapter: ChronicleChapter, onStage: (value: string) => void, onToken?: (text: string) => void): Promise<GameState> {
  let worldActionResults = chapter.results.filter((result) => result.executionStatus === undefined || ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus));
  let worldChapter = { ...chapter, results: worldActionResults };
  onStage(worldActionResults.length ? "世界运行时正在准备本周独立提案" : "世界运行时正在准备安静周的独立提案");
  const worldConfig = { ...config, model: config.worldModel?.trim() || config.model };
  const { LORE_RECORDS } = await import("./generated-lore-compendium");
  const worldMemoryView = memoryPromptBlockWithIds(game.memory, "world", undefined, chapter.week);
  const autonomousPlanning = await planAutonomousAgentsForWeek({
    config: worldConfig,
    game,
    chapter: worldChapter,
    loreRecords: LORE_RECORDS,
    horizon: knowledgeHorizon(game, false),
    onProgress: (ready, total) => onStage(`独立 Agent 规划中（${ready}/${total}）`),
  });
  const autonomousState = autonomousPlanning.autonomousState;
  const autonomousDecisionFrames = autonomousPlanning.decisionFrames;
  const autonomousPlanningProjections = autonomousPlanning.planningProjections;
  const autonomousAgentProposals = autonomousPlanning.proposals;
  const autonomousWorldProposals = autonomousAgentProposals.flatMap((proposal) => {
    const projection = autonomousPlanningProjections.get(proposal.agentRef);
    return projection ? [proposalFromAgentProposal(proposal, projection)] : [];
  });
  const autonomousKnowledgeByRef = new Map([...autonomousPlanningProjections.entries()].map(([ref, projection]) => [
    ref,
    new Set(projection.visibleKnowledge.map((node) => node.id)),
  ]));
  const lockedPlayerPlans = worldActionResults
    .map((result) => result.executionPlan)
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan?.executable));
  const autonomousAdjudications = adjudicateWorldActionProposals(
    autonomousWorldProposals,
    createActionRuleContext(game, { resolvingWeek: chapter.week, knowledgeByRef: autonomousKnowledgeByRef }),
    { lockedPlans: lockedPlayerPlans },
  );
  const executableAutonomousRefs = new Set(autonomousAdjudications
    .filter((item) => item.executionPlan.executable)
    .map((item) => item.proposal.participantRefs[0]));
  const executableAutonomousAgentProposals = autonomousAgentProposals
    .filter((proposal) => executableAutonomousRefs.has(proposal.agentRef));
  const executableProposalBoundaries = new Map<string, { redLines: string[]; mustEscalateWhen: string[]; retreatCondition: string }>([
    ...worldActionResults.flatMap((result) => result.executionPlan?.executable ? [[
      result.executionPlan.proposalId,
      {
        redLines: result.executionPlan.authorization.redLines,
        mustEscalateWhen: result.executionPlan.authorization.mustEscalateWhen,
        retreatCondition: result.executionPlan.authorization.retreatCondition,
      },
    ] as const] : []),
    ...autonomousAdjudications.flatMap((item) => item.executionPlan.executable ? [[
      item.proposal.id,
      {
        redLines: item.executionPlan.authorization.redLines,
        mustEscalateWhen: item.executionPlan.authorization.mustEscalateWhen,
        retreatCondition: item.executionPlan.authorization.retreatCondition,
      },
    ] as const] : []),
  ]);
  const executableProposalIds = [...executableProposalBoundaries.keys()];
  onStage("世界裁决器正在处理同时发生的提案");
  const adjudicatorWorld = buildAdjudicatorProjection(game.worldKernel, executableAutonomousAgentProposals, [...autonomousPlanningProjections.values()]);
  const lore = await loreForWorld(
    LORE_RECORDS,
    game,
    `${game.date} ${worldActionResults.map((item) => item.contract.rawIntent).join(" ")} ${adjudicatorWorld.projects.map((item) => item.title).join(" ")} ${autonomousDecisionFrames.map((item) => `${item.displayName} ${item.currentObjective}`).join(" ")}`,
  );
  const payload = buildWorldAdjudicatorInput({
    game,
    resolvingWeek: chapter.week,
    playerActions: worldActionResults.map((item) => ({ actionId: item.id, outcome: item.outcome, domain: actionDomain(item.contract), evidenceSeeking: seeksEvidence(item.contract), contract: item.contract.rawIntent, target: item.contract.target, desiredOutcome: item.contract.desiredOutcome, districtId: item.contract.districtId, approach: item.contract.approach, redLines: item.contract.redLines, retreat: item.contract.retreat, findings: item.findings, futureChanges: item.futureChanges })),
    adjudicatorWorld,
    unifiedActionPlans: [
      ...worldActionResults.map((result) => ({ source: "leader", actionId: result.id, executionPlan: result.executionPlan })),
      ...autonomousAdjudications.map((item) => ({
        source: "autonomous-agent",
        proposalId: item.proposal.id,
        agentRef: item.proposal.participantRefs[0],
        review: item.review,
        executionPlan: item.executionPlan,
      })),
    ],
    executableProposalIds,
    autonomousResidency: {
      activeCount: autonomousState.activeAgentRefs.length,
      coldCount: autonomousState.coldAgentRefs.length,
      limit: 24,
    },
    dynamicMemory: worldMemoryView.text,
    authorizedLore: lore.context,
    loreRecordIds: lore.records.map((item) => item.id),
    designerSupplement: config.worldBible,
  });
  const boundedPayload = fitWorldAdjudicatorPayload(attachOrganizationAdjudicationProtocol(payload));
  assertWorldAdjudicatorPayloadBudget(boundedPayload);
  const raw = await requestWorldEnvelope(worldConfig, WORLD_ADJUDICATOR_SYSTEM, buildWorldAdjudicatorPrompt(boundedPayload, `${WORLD_KERNEL_PROTOCOL}\n${WORLD_PROPOSAL_PROVENANCE_PROTOCOL}`), game, worldActionResults.length === 0, worldActionResults.map((result) => result.id), onStage, onToken);
  const allowedLoreIds = new Set([...LORE_RECORDS.map((record) => record.id), ...(await listRuntimeChunkIds())]);
  const { worldMoves, canonMoves, publicSignals, atmosphere, undercurrents, kernelDelta } = adaptWorldAdjudication(raw, {
    game,
    resolvingWeek: chapter.week,
    playerIssuedNoOrders: worldActionResults.length === 0,
    allowedLoreIds,
    allowedProposalIds: new Set(executableProposalIds),
    proposalBoundaries: executableProposalBoundaries,
  });
  const worldKernel = { ...applyWorldTurn(game.worldKernel, kernelDelta), currentWeek: game.week, currentDate: game.date };
  const interruptionApplication = applyDirectiveInterruptions(chapter, kernelDelta);
  const postWorldResults = interruptionApplication.results;
  const interruptionContinuations = interruptionApplication.continuations;
  const interruptionAdjustments = interruptionApplication.adjustments;
  const missionProgressRefunds = interruptionApplication.missionRefunds;
  worldActionResults = postWorldResults.filter((result) => result.executionStatus === undefined || ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus));
  worldChapter = { ...chapter, results: worldActionResults };
  // Legacy UI collections are compatibility projections only. Overlapping state is
  // always read back from the authoritative WorldKernel after applying kernelDelta.
  const { factions, canonActors } = projectLegacyWorldCompatibility(game, worldKernel, canonMoves);
  const reflectionMemory = deriveMemoryFromWorldState(game.memory ?? emptyMemoryState(), worldKernel, chapter.week);
  const worldAgents = advanceAutonomousWorldState(
    autonomousState,
    game.worldKernel,
    worldKernel,
    chapter.week,
    reflectionMemory,
    new Map(autonomousDecisionFrames.map((frame) => [frame.ref, frame.planningSignature])),
  );
  const worldSnapshot: WorldSnapshot = {
    week: chapter.week,
    date: chapter.date,
    atmosphere,
    changes: publicSignals.slice(0, 4).map((signal) => `${signal.channel}：${signal.headline}`),
    undercurrents,
    eventIds: worldKernel.events.filter((event) => event.week === chapter.week).map((event) => event.id),
    districtStates: worldKernel.locations.map((location) => ({ districtId: location.id, risk: location.risk, stability: location.stability, conditions: location.conditions.slice(-4) })),
    cityStates: game.campaignWorld.cities.map((city) => ({ cityId: city.id, control: city.playerControl, intelligence: city.intelligence, pressure: city.localPressure, status: city.status })),
  };
  const campaignWorld = applyCampaignSignals(game.campaignWorld, publicSignals, chapter.week);
  let missions = game.missions;
  const pressure = raw.emergentPressure;
  if (pressure && typeof pressure === "object" && !Array.isArray(pressure)) {
    const value = pressure as Record<string, unknown>;
    if (typeof value.title === "string" && typeof value.premise === "string" && typeof value.consequence === "string") missions = [...missions, { id: `ai-pressure-${game.week}-${hash(value.title)}`, title: value.title.slice(0, 45), premise: value.premise.slice(0, 280), deadline: Math.max(2, Math.min(6, Number(value.deadline) || 3)), urgency: 58, progress: 0, consequence: value.consequence.slice(0, 240), hints: ["自由调查其来源", "与相关成员讨论", "寻求一项外部合作", "暂不处理并承担后果"], state: "active" as const }];
  }
  let evidenceNodes = game.evidenceNodes;
  let opportunities = game.opportunities;
  const lead = raw.emergentLead;
  if (lead && typeof lead === "object" && !Array.isArray(lead)) {
    const value = lead as Record<string, unknown>;
    const districtId = typeof value.districtId === "string" && DISTRICTS.some((district) => district.id === value.districtId) ? value.districtId : "cherwood";
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 48) : "";
    const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 320) : "";
    const source = typeof value.source === "string" ? value.source.trim().slice(0, 80) : "城市回应";
    const followUp = typeof value.followUp === "string" ? value.followUp.trim().slice(0, 280) : "核验这条新线索的来源、时间和与现有证据的联系。";
    const allowedTags = new Set(["document", "track", "social", "occult", "official", "protect"]);
    const tags = Array.isArray(value.tags) ? value.tags.map(String).filter((tag) => allowedTags.has(tag)).slice(0, 4) : [];
    if (label && summary && !game.evidenceNodes.some((item) => item.label === label)) {
      const id = `ev-ai-${game.week}-${hash(label)}`;
      evidenceNodes = [...game.evidenceNodes, { id, caseId: "ai-emergent", label, kind: tags.includes("document") ? "记录" as const : tags.includes("social") ? "证词" as const : tags.includes("occult") ? "异常" as const : "推断" as const, summary, certainty: "推断" as const, discovered: true, source, tags: tags.length ? tags : ["open"], weekDiscovered: game.week }];
      opportunities = [...game.opportunities, { id: `op-ai-${game.week}-${hash(label)}`, caseId: "ai-emergent", title: `追查 · ${label}`, description: summary, districtId, risk: DISTRICTS.find((district) => district.id === districtId)!.danger >= 65 ? "高" as const : "中" as const, requirements: [id], suggestedIntent: followUp, rewardPreview: "把世界回应转化为可交叉验证的新事实或关系", state: "available" as const }];
    }
  }
  let actionReportsRaw = Array.isArray(raw.actionReports) ? raw.actionReports : [];
  const scanned = new Map<string, Record<string, unknown>>();
  for (const report of actionReportsRaw) {
    if (!report || typeof report !== "object") continue;
    const value = report as Record<string, unknown>;
    if (typeof value.actionId === "string" && worldActionResults.some((item) => item.id === value.actionId)) scanned.set(value.actionId, value);
  }
  const violations = worldActionResults.flatMap((result) => {
    const report = scanned.get(result.id);
    if (!report) return [];
    const fieldReport = typeof report.fieldReport === "string" ? report.fieldReport.trim().slice(0, 700) : "";
    const observableFacts = Array.isArray(report.observableFacts) ? report.observableFacts.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [];
    const followUp = typeof report.followUp === "string" ? report.followUp.trim().slice(0, 300) : "";
    const issue = actionTextBoundaryIssue([fieldReport, ...observableFacts, followUp].join("\n"), game, result.contract);
    return issue ? [{ result, issue }] : [];
  });
  if (violations.length) {
    onStage("连续性编辑正在修复越界的现场报告");
    const kernelDelta = raw.kernelDelta && typeof raw.kernelDelta === "object" && !Array.isArray(raw.kernelDelta) ? raw.kernelDelta as Record<string, unknown> : {};
    actionReportsRaw = await repairActionReports(config, game, worldChapter, violations, actionReportsRaw, {
      worldSummary: raw.worldSummary,
      publicSignals: raw.publicSignals,
      events: kernelDelta.events,
      locationUpdates: kernelDelta.locationUpdates,
    }, onToken);
  }
  const reportById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(actionReportsRaw)) for (const report of actionReportsRaw) {
    if (!report || typeof report !== "object") continue;
    const value = report as Record<string, unknown>;
    if (typeof value.actionId === "string" && worldActionResults.some((item) => item.id === value.actionId)) reportById.set(value.actionId, value);
  }
  const enrichedResults = postWorldResults.map((result) => {
    const report = reportById.get(result.id);
    if (!report) return { ...result, causalReceipts: causalReceiptsForAction(result, kernelDelta, worldKernel, game) };
    const fieldReport = typeof report.fieldReport === "string" ? report.fieldReport.trim().slice(0, 700) : "";
    const observableFacts = Array.isArray(report.observableFacts) ? report.observableFacts.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [];
    const followUp = typeof report.followUp === "string" ? report.followUp.trim().slice(0, 300) : "";
    const boundaryIssue = actionTextBoundaryIssue([fieldReport, ...observableFacts, followUp].join("\n"), game, result.contract);
    if (boundaryIssue) throw new Error(`世界模型对“${result.title}”的现场报告${boundaryIssue}；本周拒绝结算`);
    const actionEvidenceIds = seeksEvidence(result.contract) && result.outcome !== "受阻" ? observableFacts.map((fact, index) => {
      const id = `ev-ai-action-${result.id}-${hash(fact)}`;
      if (!evidenceNodes.some((item) => item.id === id)) evidenceNodes.push({
        id,
        caseId: "player-led",
        label: `${result.contract.target} · 可核验事实${index + 1}`,
        kind: result.contract.methodTags?.includes("social") ? "证词" : result.contract.methodTags?.includes("document") ? "记录" : result.contract.methodTags?.includes("occult") ? "异常" : "推断",
        summary: fact,
        certainty: result.outcome === "成功" ? "可信证据" : "推断",
        discovered: true,
        source: `${result.title} · AI世界现场报告`,
        tags: [...(result.contract.methodTags ?? ["open"]), result.contract.target],
        weekDiscovered: chapter.week,
      });
      return id;
    }) : [];
    const enrichedResult = {
      ...result,
      findings: observableFacts.length ? observableFacts : result.findings,
      reasons: fieldReport ? [...(result.reasons ?? []), `现场述职：${fieldReport}`] : result.reasons,
      unlockedEvidenceIds: [...new Set([...(result.unlockedEvidenceIds ?? []), ...actionEvidenceIds])],
      futureChanges: [...(result.futureChanges ?? []), ...actionEvidenceIds.map((id) => `调查板新增：${evidenceNodes.find((item) => item.id === id)?.label}`), ...(followUp ? [followUp] : [])].slice(0, 6),
      consequence: fieldReport ? `${result.consequence} ${fieldReport}` : result.consequence,
    };
    return {
      ...enrichedResult,
      causalReceipts: causalReceiptsForAction(enrichedResult, kernelDelta, worldKernel, game),
    };
  });
  const enrichedChapter = {
    ...chapter,
    results: enrichedResults,
    summary: chronicleSummaryFromCausality({ ...game, worldKernel }, { ...chapter, results: enrichedResults }),
  };
  const chronicle = game.chronicle.map((item) => item.id === chapter.id ? enrichedChapter : item);
  const organizationDelta = raw.organizationDelta && typeof raw.organizationDelta === "object" && !Array.isArray(raw.organizationDelta) ? raw.organizationDelta as Record<string, unknown> : {};
  const clampOrg = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, Math.round(value)));
  const departments = game.departments.map((item) => ({ ...item }));
  let departmentReports = [...game.departmentReports];
  const organizationIssues = [...game.organizationIssues];
  for (const continuation of interruptionContinuations) if (!organizationIssues.some((issue) => issue.originActionId === continuation.id && issue.directiveState === "interrupted" && issue.state === "待裁决")) {
    organizationIssues.push({
      id: `directive-interrupted:${chapter.week}:${continuation.id}`,
      weekCreated: chapter.week,
      category: "成员",
      sourceId: continuation.leaderId,
      title: `${continuation.title}已在授权边界前停下`,
      summary: continuation.execution.lastReason ?? "负责人触发停止条件后中断了行动。",
      urgency: continuation.risk === "致命" ? 92 : continuation.risk === "高" ? 78 : 62,
      deadline: game.week + 1,
      signals: ["已经发生的变化保留，未完成部分不会被视为完成。"],
      state: "待裁决",
      originActionId: continuation.id,
      strategyIntentId: continuation.strategyIntentId,
      causeEventIds: continuation.execution.consequenceEventIds,
      directiveState: "interrupted",
    });
  }
  let members = game.members.map((item) => ({ ...item }));
  let recruitPool = game.recruitPool.map((item) => ({ ...item }));
  let management = {
    ...game.management,
    resources: {
      ...game.management.resources,
      money: game.management.resources.money + interruptionAdjustments.money,
      extraordinaryMaterials: game.management.resources.extraordinaryMaterials + interruptionAdjustments.extraordinaryMaterials,
    },
  };
  if (Array.isArray(organizationDelta.departmentDevelopments)) for (const [index, development] of organizationDelta.departmentDevelopments.slice(0, 6).entries()) {
    if (!development || typeof development !== "object") continue;
    const value = development as Record<string, unknown>;
    const department = departments.find((item) => item.id === value.departmentId);
    const report = typeof value.report === "string" ? value.report.trim().slice(0, 220) : "";
    if (!department || !report) continue;
    department.lastReport = report;
    const detail = typeof value.cause === "string" ? value.cause.trim().slice(0, 260) : "该变化来自本周组织状态与既有常设命令。";
    const requiresDecision = (department.backlog ?? 0) >= 65 || (department.exposure ?? 0) >= 55 || (department.cohesion ?? 100) <= 35;
    departmentReports = [{ id: `ai-department-report-${game.week}-${index}-${department.id}`, week: game.week, departmentId: department.id, headline: report, detail, consequence: requiresDecision ? "若继续越过临界值，下一周将转化为需要会长裁决的组织问题。" : "仍在部门授权范围内。", requiresDecision }, ...departmentReports].slice(0, 80);
  }
  if (Array.isArray(organizationDelta.memberDevelopments)) for (const development of organizationDelta.memberDevelopments.slice(0, 6)) {
    if (!development || typeof development !== "object") continue;
    const value = development as Record<string, unknown>;
    members = members.map((member) => member.id !== value.memberId ? member : {
      ...member,
      personalEventSignals: typeof value.observation === "string" ? [...(member.personalEventSignals ?? []), value.observation.trim().slice(0, 220)].slice(-6) : member.personalEventSignals,
    });
  }
  if (Array.isArray(organizationDelta.recruitDevelopments)) for (const development of organizationDelta.recruitDevelopments.slice(0, 6)) {
    if (!development || typeof development !== "object") continue;
    const value = development as Record<string, unknown>;
    recruitPool = recruitPool.map((member) => member.id !== value.memberId ? member : {
      ...member,
      personalEventSignals: typeof value.observation === "string" ? [...(member.personalEventSignals ?? []), value.observation.trim().slice(0, 220)].slice(-6) : member.personalEventSignals,
    });
  }
  if (Array.isArray(organizationDelta.governanceIssues)) for (const [index, issue] of organizationDelta.governanceIssues.slice(0, 3).entries()) {
    if (!issue || typeof issue !== "object") continue;
    const value = issue as Record<string, unknown>;
    const category = ["部门", "招募", "成员", "资源"].includes(String(value.category)) ? value.category as "部门" | "招募" | "成员" | "资源" : "资源";
    const sourceId = typeof value.sourceId === "string" ? value.sourceId : "organization";
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 70) : "";
    const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 360) : "";
    if (!title || !summary || organizationIssues.some((item) => item.sourceId === sourceId && item.state === "待裁决")) continue;
    organizationIssues.push({ id: `ai-org-issue-${game.week}-${index}-${hash(title)}`, weekCreated: game.week, category, sourceId, title, summary, urgency: clampOrg(Number(value.urgency) || 55, 35, 95), deadline: game.week + clampOrg(Number(value.deadline) || 2, 1, 3), signals: Array.isArray(value.signals) ? value.signals.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [], state: "待裁决" });
  }
  const newRecruit = organizationDelta.newRecruitableNpc && typeof organizationDelta.newRecruitableNpc === "object" && !Array.isArray(organizationDelta.newRecruitableNpc) ? organizationDelta.newRecruitableNpc as Record<string, unknown> : null;
  const newRecruitName = typeof newRecruit?.name === "string" ? newRecruit.name.trim().slice(0, 40) : "";
  const hasPersistentContact = Boolean(newRecruitName && (worldActionResults.some((result) => ["招募", "交涉"].includes(result.contract.kind) && result.contract.rawIntent.includes(newRecruitName)) || worldKernel.actors.some((actor) => actor.name === newRecruitName)));
  if (newRecruit && newRecruitName && hasPersistentContact && ![...members, ...recruitPool].some((item) => item.name === newRecruitName)) {
    recruitPool.push({ id: `ai-recruit-${hash(newRecruitName)}`, name: newRecruitName, role: typeof newRecruit.role === "string" ? newRecruit.role.slice(0, 50) : "新近联系人", specialty: typeof newRecruit.specialty === "string" ? newRecruit.specialty.slice(0, 100) : "尚待确认", loyalty: 24, trust: 18, interest: 55, ideology: 50, fatigue: 8, status: "尚未接触", background: typeof newRecruit.background === "string" ? newRecruit.background.slice(0, 300) : "其背景已被世界账本锁定，仍待组织核验。", core: typeof newRecruit.core === "string" ? newRecruit.core.slice(0, 180) : "谨慎观察组织", voice: typeof newRecruit.voice === "string" ? newRecruit.voice.slice(0, 120) : "保留而具体", arc: typeof newRecruit.arc === "string" ? newRecruit.arc.slice(0, 180) : "尚未形成", secret: typeof newRecruit.secret === "string" ? newRecruit.secret.slice(0, 180) : "未公开", personalEvent: typeof newRecruit.contactReason === "string" ? newRecruit.contactReason.slice(0, 220) : "因持续接触进入组织视野。", personalEventState: "dormant", relationshipStage: "接触", relationshipMomentum: 0, personalPressure: 4, personalEventSignals: [], promises: [], lastRelationshipChangeWeek: game.week });
  }
  const hasSuccessfulFormulaAction = worldActionResults.some((result) => result.outcome === "成功" && /配方|魔药|神秘学资料/.test(`${result.contract.rawIntent} ${result.contract.target} ${result.contract.desiredOutcome}`));
  if (hasSuccessfulFormulaAction && Array.isArray(organizationDelta.formulaDiscoveries)) {
    const formulas = [...management.formulas];
    for (const discovery of organizationDelta.formulaDiscoveries.slice(0, 3)) {
      if (!discovery || typeof discovery !== "object") continue;
      const value = discovery as Record<string, unknown>;
      const pathwayId = typeof value.pathwayId === "string" && value.pathwayId in PATHWAYS ? value.pathwayId as PathwayId : undefined;
      const sequence = Math.max(0, Math.min(9, Math.round(Number(value.sequence))));
      if (!pathwayId || !Number.isFinite(sequence)) continue;
      const reliability = Math.max(0, Math.min(100, Math.round(Number(value.reliability) || 0)));
      const loreEvidenceIds = Array.isArray(value.loreEvidenceIds) ? value.loreEvidenceIds.map(String).filter((id) => allowedLoreIds.has(id)).slice(0, 8) : [];
      const requestedStatus = ["lead", "fragment", "verifying", "verified"].includes(String(value.status)) ? String(value.status) as "lead" | "fragment" | "verifying" | "verified" : "lead";
      const status = requestedStatus === "verified" && (reliability < 90 || loreEvidenceIds.length === 0) ? "verifying" : requestedStatus;
      const sourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs.map(String).filter((id) => worldActionResults.some((result) => result.id === id) || worldKernel.events.some((event) => event.id === id)).slice(0, 8) : [];
      const id = `formula-${pathwayId}-${sequence}`;
      const record = { id, pathwayId, sequence, name: `${PATHWAYS[pathwayId].name}途径·序列${sequence} ${PATHWAYS[pathwayId].sequences.find((item) => item.rank === sequence)?.name ?? "配方"}`, status, reliability, sourceRefs, loreEvidenceIds };
      const existing = formulas.findIndex((formula) => formula.id === id);
      if (existing >= 0) {
        const previous = formulas[existing];
        const rank = { lead: 0, fragment: 1, verifying: 2, verified: 3 } as const;
        if (rank[record.status] >= rank[previous.status]) formulas[existing] = { ...previous, ...record, sourceRefs: [...new Set([...previous.sourceRefs, ...record.sourceRefs])], loreEvidenceIds: [...new Set([...previous.loreEvidenceIds, ...record.loreEvidenceIds])] };
      } else formulas.push(record);
    }
    management = { ...management, formulas };
  }
  management = {
    ...management,
    map: attachIntelligenceToBacklundMap(management.map, publicSignals.map((signal) => ({ id: signal.id, districtId: signal.districtId, text: `${signal.headline} ${signal.body}` }))),
  };
  let worldLedger = game.worldLedger ?? createWorldLedger(game);
  worldLedger = appendWorldLedgerEvents(worldLedger, actionAdjudicationLedgerEvents(autonomousAdjudications, "autonomous-actors"));
  worldLedger = appendWorldLedgerEvents(worldLedger, autonomousAgentProposals.map((proposal) => {
    const actorId = proposal.agentRef.startsWith("actor:") ? proposal.agentRef.slice("actor:".length) : null;
    const factionId = proposal.agentRef.startsWith("faction:") ? proposal.agentRef.slice("faction:".length) : null;
    const id = `autonomous-proposal:${chapter.week}:${proposal.agentRef}`;
    return {
      id,
      week: chapter.week,
      phase: "autonomous-actors" as const,
      kind: "action-proposed" as const,
      summary: proposal.intent,
      actorIds: actorId ? [actorId] : [],
      factionIds: factionId ? [factionId] : [],
      witnessRefs: [proposal.agentRef],
      causeEventIds: [],
      audience: { visibility: "actors" as const, holderRefs: [proposal.agentRef] },
      payload: {
        actionId: `proposal:agent:${chapter.week}:${proposal.agentRef}`,
        agentRef: proposal.agentRef,
        disposition: proposal.disposition,
        intent: proposal.intent,
        targetRefs: proposal.targetRefs,
        requiredKnowledgeIds: proposal.requiredKnowledgeIds,
        usedMemoryIds: proposal.usedMemoryIds,
        planningSource: proposal.planningSource,
        planningIssue: proposal.planningIssue,
      },
    };
  }));
  worldLedger = appendWorldLedgerEvents(worldLedger, worldKernel.events.filter((event) => event.week === chapter.week).map((event) => ({
    ...(() => {
      const sourceProposalIds = event.sourceProposalIds ?? [];
      const contributingProposals = executableAutonomousAgentProposals.filter((proposal) => sourceProposalIds.includes(`proposal:agent:${chapter.week}:${proposal.agentRef}`));
      const proposalEventIds = sourceProposalIds.flatMap((proposalId) => {
        const agentPrefix = `proposal:agent:${chapter.week}:`;
        return proposalId.startsWith(agentPrefix)
          ? [proposalId, `autonomous-proposal:${chapter.week}:${proposalId.slice(agentPrefix.length)}`]
          : [proposalId];
      });
      return {
        id: event.id,
        week: chapter.week,
        phase: "autonomous-actors" as const,
        kind: "world-event-recorded" as const,
        summary: event.title,
        actorIds: event.actorIds,
        factionIds: event.factionIds,
        witnessRefs: event.witnessRefs ?? [],
        causeEventIds: proposalEventIds,
        audience: { visibility: event.visibility, holderRefs: event.witnessRefs ?? [] },
        payload: {
          worldEventId: event.id,
          detail: event.detail,
          locationId: event.locationId,
          kernelCauseIds: event.causeIds,
          proposalEventIds,
          usedMemoryIds: [...new Set(contributingProposals.flatMap((proposal) => proposal.usedMemoryIds))],
        },
      };
    })(),
  })));
  worldLedger = appendWorldLedgerEvents(worldLedger, interruptionContinuations.map((continuation) => {
    const result = postWorldResults.find((item) => item.id === continuation.id);
    const sourceEventId = continuation.execution.consequenceEventIds.at(-1);
    return {
      id: `progress:world-interruption:${continuation.execution.lastAttemptId ?? continuation.id}`,
      week: chapter.week,
      phase: "consequences" as const,
      kind: "action-progressed" as const,
      summary: `${continuation.title}在授权边界前中断`,
      actorIds: continuation.memberIds,
      factionIds: [],
      witnessRefs: [continuation.leaderId, ...continuation.memberIds].map((id) => id === "player" ? "player" : `actor:${id}`),
      causeEventIds: sourceEventId ? [sourceEventId] : [],
      audience: { visibility: "actors" as const, holderRefs: ["player", ...continuation.memberIds.map((id) => `actor:${id}`)] },
      payload: {
        actionId: continuation.id,
        attemptId: `world-interruption:${continuation.execution.lastAttemptId ?? continuation.id}`,
        attemptOrdinal: continuation.execution.attemptOrdinal,
        originWeek: continuation.execution.originWeek,
        fromStatus: "resolved",
        toStatus: "interrupted",
        progressAfter: continuation.execution.progress,
        consumedAfter: continuation.execution.consumed,
        nextEligibleWeek: continuation.execution.nextEligibleWeek,
        reason: continuation.execution.lastReason,
        consequenceEventIds: continuation.execution.consequenceEventIds,
        executionPlan: result?.executionPlan,
      },
    };
  }));
  worldLedger = appendWorldLedgerEvents(worldLedger, worldKernel.knowledge.filter((node) => node.acquiredWeek === chapter.week).map((node) => ({
    id: `delivery:${node.id}`,
    week: chapter.week,
    phase: "autonomous-actors" as const,
    kind: "knowledge-delivered" as const,
    summary: node.subject,
    actorIds: [],
    factionIds: [],
    witnessRefs: node.holderRefs ?? node.holderIds.map((id) => id === "player" ? "player" : `actor:${id}`),
    causeEventIds: node.sourceEventId && worldLedger.events.some((event) => event.id === node.sourceEventId) ? [node.sourceEventId] : [],
    audience: { visibility: node.visibility, holderRefs: node.holderRefs ?? node.holderIds.map((id) => id === "player" ? "player" : `actor:${id}`) },
    payload: { knowledgeId: node.id, statement: node.statement, truth: node.truth, loreRecordIds: node.loreRecordIds },
  })));
  worldLedger = recordWorldLedgerPhase(worldLedger, chapter.week, "autonomous-actors", "独立角色、势力与持续计划已完成世界推演", { eventCount: worldKernel.events.filter((event) => event.week === chapter.week).length, signalCount: publicSignals.length, factionMoveCount: worldMoves.length, autonomousAgentCount: worldAgents.activeAgentRefs.length, coldAgentCount: worldAgents.coldAgentRefs.length, socialTieCount: worldAgents.socialTies.length });
  worldLedger = recordWorldLedgerPhase(worldLedger, chapter.week, "narrative-ready", "本周权威事实已锁定，可以生成文学叙事", { chapterId: chapter.id });
  let committedMemory = game.memory ?? emptyMemoryState();
  for (const proposal of autonomousAgentProposals) {
    const projection = autonomousPlanningProjections.get(proposal.agentRef);
    if (!projection) continue;
    const audience = projection.memoryAudience.kind === "actor"
      ? actorAudience(projection.memoryAudience.actorId, true)
      : factionAudience(projection.memoryAudience.factionId, true);
    const descriptor = {
      actionId: `autonomous-agent:${chapter.week}:${proposal.agentRef}`,
      modelCallId: `autonomous-agent:${chapter.week}:${proposal.agentRef}`,
      stage: "autonomous-agent",
      audience,
      memoryIds: projection.memoryReferenceIds,
      week: chapter.week,
    };
    committedMemory = submitMemoryDelivery(committedMemory, descriptor);
    committedMemory = markMemoryPresented(committedMemory, descriptor);
    if (proposal.usedMemoryIds.length) {
      committedMemory = markMemoryRecalled(committedMemory, { ...descriptor, memoryIds: proposal.usedMemoryIds });
    }
  }
  committedMemory = submitMemoryDelivery(committedMemory, {
    actionId: `world:${chapter.week}`,
    modelCallId: `world:${chapter.week}`,
    stage: "world",
    audience: worldSystemAudience(),
    memoryIds: worldMemoryView.ids,
    week: chapter.week,
  });
  missions = missions.map((mission) => {
    const refund = missionProgressRefunds.get(mission.id) ?? 0;
    return refund ? { ...mission, progress: Math.max(0, mission.progress - refund), state: mission.progress - refund < 100 && mission.state === "resolved" ? "active" as const : mission.state } : mission;
  });
  const schedule = [
    ...game.schedule.filter((action) => !interruptionContinuations.some((continuation) => continuation.id === action.id)),
    ...interruptionContinuations,
  ];
  const economyHistory = game.economyHistory.map((entry, index) => index === 0 && entry.week === chapter.week ? {
    ...entry,
    actionCost: Math.max(0, entry.actionCost - interruptionAdjustments.money),
    balance: entry.balance + interruptionAdjustments.money,
    expectedBalance: (entry.expectedBalance ?? entry.balance) + interruptionAdjustments.money,
  } : entry);
  const nextGame: GameState = {
    ...game,
    money: game.money + interruptionAdjustments.money,
    spirituality: Math.min(game.spiritualityMax, game.spirituality + interruptionAdjustments.spirituality),
    secrecy: Math.max(0, Math.min(100, game.secrecy + interruptionAdjustments.secrecy)),
    stability: Math.max(0, Math.min(100, game.stability + interruptionAdjustments.stability)),
    influence: Math.max(0, Math.min(100, game.influence + interruptionAdjustments.influence)),
    factions,
    canonActors,
    missions,
    evidenceNodes,
    opportunities,
    worldMoves: [...worldMoves, ...game.worldMoves].slice(0, 80),
    worldSignals: [...publicSignals, ...(game.worldSignals ?? []).filter((signal) => signal.week !== chapter.week || !publicSignals.length)].slice(0, 120),
    worldSnapshots: [worldSnapshot, ...(game.worldSnapshots ?? []).filter((snapshot) => snapshot.week !== chapter.week)].slice(0, 60),
    worldKernel,
    worldAgents,
    memory: deriveMemoryFromWorldState(committedMemory, worldKernel, chapter.week),
    chronicle,
    departments,
    departmentReports,
    organizationIssues,
    members,
    recruitPool,
    management,
    campaignWorld,
    schedule,
    economyHistory,
  };
  nextGame.worldLedger = commitWorldLedgerWeek(worldLedger, nextGame);
  releaseAutonomousPlanningCache(game);
  return nextGame;
}

export function canAdvance(game: GameState) {
  return game.currentSequence > 0 && game.advancementProcess?.stage === "可以晋升" && game.instability < 70;
}


export function progressAdvancement(game: GameState) {
  return advanceAdvancementStage(game);
}

export function beginAdvancement(game: GameState) {
  return { ...game, advancementProcess: createAdvancementProcess(game) };
}

export function advanceSequence(game: GameState) {
  if (!canAdvance(game)) throw new Error("晋升档案尚未完成配方核验、魔药调制、仪式执行与精神稳定。 ");
  const nextRank = game.currentSequence - 1;
  const requirement = highSequenceAdvancementRequirement(game.highSequenceLedger, game.pathwayId, nextRank);
  if (!requirement.satisfied) throw new Error(`高位晋升条件尚未满足：${requirement.missing.join("、")}。先通过自由决议寻找、争夺或交换对应高位资产；账本不会凭空生成。`);
  const highSequenceLedger = incorporateAdvancementAsset(game.highSequenceLedger, game.pathwayId, nextRank, "player", game.week);
  const campaignWorld = advanceCampaignWorld(game.campaignWorld, {
    week: game.week,
    currentSequence: nextRank,
    pathwayId: game.pathwayId,
    smogResolved: game.facts.some((fact) => fact.subject === "贝克兰德大雾霾" && fact.certainty === "确认"),
  });
  const retrospective = advancementRetrospective(game, nextRank);
  return {
    ...game,
    currentSequence: nextRank,
    digestion: 0,
    spirituality: game.spiritualityMax + 2,
    spiritualityMax: game.spiritualityMax + 2,
    formulaKnowledge: nextRank > 0 ? 18 : 100,
    ritualReadiness: 0,
    instability: Math.min(100, game.instability + Math.max(5, 14 - nextRank)),
    materials: nextRank > 0 ? materialsFor(game.pathwayId, nextRank - 1) : [],
    advancementProcess: null,
    deviation: Math.min(100, game.deviation + 1.2),
    facts: [...game.facts, { id: `fact:advance:${game.week}:${nextRank}`, subject: "组织负责人", statement: `已晋升为序列${nextRank}·${PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === nextRank)?.name}。`, certainty: "确认" as const, source: "组织内部记录", week: game.week }],
    chronicle: [retrospective, ...game.chronicle],
    highSequenceLedger,
    campaignWorld,
  };
}

export function resolveFatalSituation(game: GameState, choice: "retreat" | "help" | "continue") {
  const crisis = game.fatalSituation;
  if (!crisis || crisis.stage !== "decision") return game;
  const odds = crisis.odds[choice];
  const roll = hash(`${crisis.id}:${choice}:${game.week}`) % 100;
  const survived = roll < odds;
  const label = choice === "retreat" ? "按预案撤退" : choice === "help" ? "向盟友求援" : "继续深入";
  const severe = !survived || choice === "continue";
  const deathThreshold = choice === "continue" ? 30 : choice === "help" ? 10 : 6;
  const deathRoll = hash(`${crisis.id}:${choice}:final`) % 100;
  const died = !survived && deathRoll < deathThreshold;
  const injury = died ? "致命伤" : severe ? choice === "continue" ? "灵性灼伤与肋骨骨裂" : "撤离时遭受贯穿伤" : "轻微擦伤";
  const healthLoss = died ? game.playerCondition.health : severe ? 34 : 12;
  const pollutionGain = choice === "continue" ? 15 : choice === "help" ? 6 : 3;
  const fact: WorldFact = { id: `crisis-${crisis.id}`, subject: crisis.title, statement: `${label}的最终检定为${survived ? "成功" : died ? "死亡" : "失败但幸存"}；规则掷值${roll}，安全阈值${odds}。`, certainty: "确认", source: "致命处境结算", week: game.week };
  const finaleAdjustment = crisis.actionId.startsWith("finale-") && game.ending.campaign
    ? {
        ...game.ending.campaign,
        momentum: game.ending.campaign.momentum + (choice === "continue" && survived ? 8 : choice === "retreat" ? -4 : 0),
        enemyProgress: Math.min(100, game.ending.campaign.enemyProgress + (choice === "retreat" ? 4 : 0)),
      }
    : game.ending.campaign;
  const ending = died ? { phase: "ended" as const, title: "雾中止步", campaign: finaleAdjustment, epilogue: ["负责人的死亡让所有未完成的命令停在密议室桌面上。", "成员按照各自的忠诚、利益与理念带走能带走的东西，组织就此结束。"], grades: { organization: "覆灭", members: "失散", advancement: `序列${game.currentSequence}`, relations: "未竟", history: `${game.deviation.toFixed(1)}%偏转` }, sandboxUnlocked: false } : { ...game.ending, campaign: finaleAdjustment };
  return {
    ...game,
    playerCondition: { health: Math.max(0, game.playerCondition.health - healthLoss), pollution: Math.min(100, game.playerCondition.pollution + pollutionGain), injuries: [...game.playerCondition.injuries, injury], alive: !died },
    fatalSituation: null,
    ending,
    stability: Math.max(0, game.stability - (died ? 100 : severe ? 12 : 4)),
    secrecy: Math.max(0, game.secrecy - (choice === "help" ? 5 : choice === "continue" ? 8 : 2)),
    facts: [...game.facts, fact],
  };
}

export function resolveFinale(game: GameState, route: "阻止" | "利用" | "改变" | "逃离") {
  if (game.ending.phase !== "finale" && game.ending.phase !== "major-event") return game;
  const discovered = game.evidenceNodes.filter((item) => item.discovered && !item.compromised).length;
  const keyEvidence = ["ev-population", "ev-gas-map", "ev-perfume", "ev-sealed-cargo", "ev-ritual-site", "ev-victim-register"].filter((id) => game.evidenceNodes.find((item) => item.id === id)?.discovered).length;
  const allyPower = game.factions.filter((item) => item.trust >= 35).reduce((sum, item) => sum + item.trust + item.leverage, 0);
  const orgPower = game.influence + game.stability + game.members.length * 7 + game.facilities.filter((item) => item.status === "运转中").length * 4;
  const routeModifier = route === "阻止" ? keyEvidence * 10 + allyPower / 5 : route === "改变" ? keyEvidence * 8 + orgPower / 4 : route === "利用" ? game.currentSequence <= 7 ? 24 : -8 : game.secrecy + game.money / 20;
  const score = Math.round(discovered * 2 + routeModifier + orgPower / 6 - game.playerCondition.pollution / 2 - game.instability / 3);
  const tier = score >= 115 ? "decisive" : score >= 78 ? "costly" : "failed";
  const titles = {
    阻止: tier === "decisive" ? "没有降临的大雾" : tier === "costly" ? "被撕开的雾幕" : "迟到的警报",
    改变: tier === "decisive" ? "雾向无人之地" : tier === "costly" ? "被改写的灾难" : "偏转失控",
    利用: tier === "decisive" ? "从灾难中夺火" : tier === "costly" ? "带血的晋身阶" : "觊觎者的代价",
    逃离: tier === "decisive" ? "带走一座城的名单" : tier === "costly" ? "离城列车" : "身后的灰雾",
  } as const;
  const casualties = tier === "decisive" ? "核心仪式被破坏，伤亡被压缩到局部并得到及时救援。" : tier === "costly" ? "大雾仍然降临，但规模与受害区域因提前准备而改变。" : "准备不足使原定灾难大体发生，组织只能保存少数成果。";
  const routeText = route === "阻止" ? "组织把证据、盟友与破坏行动集中在同一夜，主动冲击仪式结构。" : route === "改变" ? "组织没有幻想完全消灭高位阴谋，而是改变人口、煤气与仪式材料的汇合方式。" : route === "利用" ? "负责人试图从仪式崩解中夺取材料、身份与晋升机会，并承担最重的污染。" : "组织启动分散撤离，把成员、证据与潜在受害者名单带出贝克兰德。";
  const memberAverage = game.members.reduce((sum, item) => sum + item.loyalty, 0) / Math.max(1, game.members.length);
  const organizationGrade = game.stability >= 55 && game.money > -50 ? "存续并拥有独立立场" : game.stability >= 25 ? "重创后存续" : "在余波中分裂";
  const memberGrade = memberAverage >= 65 ? "核心成员选择留下" : memberAverage >= 45 ? "有人留下，也有人离开" : "成员按各自道路散去";
  return {
    ...game,
    ending: {
      phase: "ended",
      route,
      title: titles[route],
      epilogue: [routeText, casualties, `这条历史最终偏转了${Math.min(100, game.deviation + (tier === "decisive" ? 18 : tier === "costly" ? 9 : 3)).toFixed(1)}%。它不会再被强行修正回原著。`],
      grades: { organization: organizationGrade, members: memberGrade, advancement: `序列${game.currentSequence}·${PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)?.name}`, relations: allyPower >= 150 ? "拥有可靠盟友网" : allyPower >= 70 ? "保留有限合作" : "几乎孤立", history: tier === "decisive" ? "决定性偏转" : tier === "costly" ? "明确偏转" : "局部偏转" },
      sandboxUnlocked: true,
    },
    deviation: Math.min(100, game.deviation + (tier === "decisive" ? 18 : tier === "costly" ? 9 : 3)),
    playerCondition: route === "利用" ? { ...game.playerCondition, pollution: Math.min(100, game.playerCondition.pollution + (tier === "failed" ? 28 : 14)) } : game.playerCondition,
    timeline: game.timeline.map((event) => event.id === "tl-great-smog" ? { ...event, status: tier === "decisive" ? "diverted" as const : "resolved" as const, summary: `${titles[route]}：${casualties}` } : event),
  };
}

export function enterSandbox(game: GameState) {
  if (!game.ending.sandboxUnlocked) return game;
  return { ...game, ending: { ...game.ending, phase: "sandbox" as const }, missions: game.missions.map((mission) => mission.state === "active" ? { ...mission, state: "resolved" as const } : mission) };
}

export function connectEvidence(game: GameState, from: string, to: string, label: string) {
  if (from === to || !label.trim()) return game;
  const valid = [from, to].every((id) => game.evidenceNodes.find((item) => item.id === id)?.discovered);
  if (!valid) return game;
  const id = `player-link-${[from, to].sort().join("-")}`;
  if (game.evidenceLinks.some((item) => item.id === id)) return game;
  return { ...game, evidenceLinks: [...game.evidenceLinks, { id, from, to, label: label.trim(), discovered: true }], deviation: Math.min(100, game.deviation + .4) };
}

export function transformOrganization(game: GameState, action: "rename" | "move" | "legalize" | "satellite" | "split" | "merge" | "rebuild", value: string) {
  const profile = { ...game.organizationProfile, satellites: [...game.organizationProfile.satellites], formerOrganizations: [...game.organizationProfile.formerOrganizations] };
  if (action === "rename" && value.trim()) return { ...game, organizationName: value.trim().slice(0, 30), secrecy: Math.min(100, game.secrecy + 3) };
  if (action === "move") { const district = DISTRICTS.find((item) => item.id === value); if (!district || game.money < 120) return game; profile.headquartersDistrictId = district.id; return { ...game, organizationProfile: profile, money: game.money - 120, secrecy: Math.min(100, game.secrecy + 14), schedule: [] } ; }
  if (action === "legalize") { const trust = Math.max(...game.factions.filter((item) => item.kind === "教会" || item.kind === "官方").map((item) => item.trust), 0); if (trust < 35 || game.influence < 25) return game; profile.legalStatus = trust >= 60 ? "官方协作" : "合法掩护"; return { ...game, organizationProfile: profile, secrecy: Math.min(100, game.secrecy + 8), influence: Math.min(100, game.influence + 6) }; }
  if (action === "satellite") { const district = DISTRICTS.find((item) => item.id === value); if (!district || game.money < 160 || profile.satellites.some((item) => item.districtId === value)) return game; profile.satellites.push({ id: `sat-${value}`, name: `${district.name}外围据点`, districtId: value, function: "情报、撤离与成员接应", upkeep: 9 }); return { ...game, organizationProfile: profile, money: game.money - 160, influence: Math.min(100, game.influence + 5) }; }
  if (action === "split") { const departing = game.members.filter((item) => (item.ideology ?? 50) < 45 || (item.trust ?? 50) < 38); profile.formerOrganizations.push(`${game.organizationName}分离派`); return { ...game, organizationProfile: profile, members: game.members.filter((item) => !departing.some((leave) => leave.id === item.id)), facilities: game.facilities.map((item, index) => index === game.facilities.length - 1 ? { ...item, status: "闲置" as const } : item), stability: Math.max(0, game.stability - 18) }; }
  if (action === "merge") { const allies = game.factions.filter((item) => item.trust >= 55); if (!allies.length) return game; return { ...game, organizationName: value.trim() || `${game.organizationName}联合会`, influence: Math.min(100, game.influence + 14), stability: Math.max(0, game.stability - 6), organizationProfile: profile }; }
  if (action === "rebuild") { const followers = game.members.filter((item) => (item.trust ?? 0) >= 55 && (item.ideology ?? 0) >= 50); profile.formerOrganizations.push(game.organizationName); return { ...game, organizationName: value.trim() || "无名调查结社", members: followers, facilities: game.facilities.slice(0, 2), departments: [], inventory: game.inventory.filter((item) => followers.some((member) => item.keeper.includes(member.name.split("·")[0]))), money: Math.max(40, Math.floor(game.money * .45)), influence: Math.floor(game.influence * .55), stability: 58, organizationProfile: profile }; }
  return game;
}
