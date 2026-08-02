import {
  ActionContract,
  ActionResult,
  Ability,
  ChronicleChapter,
  DISTRICTS,
  EvidenceNode,
  FactionState,
  GameState,
  materialsFor,
  PATHWAYS,
  RiskLevel,
  TimelineEvent,
  WorldFact,
  WorldMove,
  WorldSignal,
  WorldSnapshot,
} from "./game-model";
import { createFinaleCampaign } from "./finale-system";
import { callModel as invokeModel, type AiConfig } from "./ai-client";
import { LORE_RECORDS } from "./generated-lore-compendium";
import { retrieveLoreContext } from "./lore-knowledge";
import { applyWorldTurn, type WorldTurnDelta } from "./world-kernel";
export type { AiConfig } from "./ai-client";
export const callModel = invokeModel;

function hash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output >>> 0);
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的JSON");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

function knownLoreIds(game: GameState, holderId: string) {
  return [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes(holderId)).flatMap((node) => node.loreRecordIds ?? []))];
}

function loreForPlayer(game: GameState, query: string, maxChars = 5_000) {
  return retrieveLoreContext(LORE_RECORDS, {
    query,
    audience: { kind: "player", knownLoreIds: knownLoreIds(game, "player"), topicGrants: [] },
    limit: 12,
    maxChars,
  });
}

function loreForActor(game: GameState, member: GameState["members"][number], query: string, maxChars = 5_000) {
  const specialty = `${member.role} ${member.specialty} ${member.background ?? ""}`;
  const topicGrants = [
    ...(member.pathway ? ["pathways", "beyonder-system"] : []),
    ...(/神秘|仪式|封印|灵界|梦境|非凡/.test(specialty) ? ["rituals", "spirit-world", "sealed-artifacts"] : []),
    ...(/情报|调查|警|外交|教会/.test(specialty) ? ["factions"] : []),
  ];
  return retrieveLoreContext(LORE_RECORDS, {
    query,
    audience: { kind: "actor", knownLoreIds: knownLoreIds(game, member.id), topicGrants },
    limit: 12,
    maxChars,
  });
}

function loreForWorld(game: GameState, query: string, maxChars = 12_000) {
  return retrieveLoreContext(LORE_RECORDS, {
    query,
    audience: { kind: "world", knownLoreIds: [], topicGrants: [] },
    limit: 24,
    maxChars,
  });
}

function parseWorldKernelDelta(raw: Record<string, unknown>, game: GameState, chapter: ChronicleChapter, publicSignals: WorldSignal[], worldMoves: WorldMove[]): WorldTurnDelta {
  const source = raw.kernelDelta && typeof raw.kernelDelta === "object" && !Array.isArray(raw.kernelDelta) ? raw.kernelDelta as Record<string, unknown> : {};
  const list = (key: string) => Array.isArray(source[key]) ? source[key] as unknown[] : [];
  const actorIds = new Set(game.worldKernel.actors.map((item) => item.id));
  const factionIds = new Set(game.worldKernel.factions.map((item) => item.id));
  const projectIds = new Set(game.worldKernel.projects.map((item) => item.id));
  const locationIds = new Set(game.worldKernel.locations.map((item) => item.id));
  const newActors = list("newActors").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 8).flatMap((value, index) => {
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 60) : "";
    if (!name) return [];
    const requested = typeof value.id === "string" ? value.id.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 64) : "";
    const id = requested && !actorIds.has(requested) ? requested : `emergent-actor-${chapter.week}-${index}-${hash(name)}`;
    actorIds.add(id);
    return [{ id, name, locationId: typeof value.locationId === "string" && locationIds.has(value.locationId) ? value.locationId : "unknown", agenda: typeof value.agenda === "string" ? value.agenda.slice(0, 220) : "在世界中维护自身处境", shortTermGoal: typeof value.shortTermGoal === "string" ? value.shortTermGoal.slice(0, 220) : "完成眼前事务", condition: typeof value.condition === "string" ? value.condition.slice(0, 140) : "正常活动", lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 280) : undefined, knowledgeIds: [] }];
  });
  const newFactions = list("newFactions").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 4).flatMap((value, index) => {
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 60) : "";
    if (!name) return [];
    const requested = typeof value.id === "string" ? value.id.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 64) : "";
    const id = requested && !factionIds.has(requested) ? requested : `emergent-faction-${chapter.week}-${index}-${hash(name)}`;
    factionIds.add(id);
    return [{ id, name, posture: typeof value.posture === "string" ? value.posture.slice(0, 220) : "维持自身利益", resources: Math.max(0, Math.min(100, Number(value.resources) || 40)), suspicion: Math.max(0, Math.min(100, Number(value.suspicion) || 0)), lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 280) : undefined }];
  });
  const newProjects = list("newProjects").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 8).flatMap((value, index) => {
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 80) : "";
    const ownerId = typeof value.ownerId === "string" ? value.ownerId : "world";
    if (!title) return [];
    const requested = typeof value.id === "string" ? value.id.trim().replace(/[^a-z0-9:_-]/gi, "-").slice(0, 72) : "";
    const id = requested && !projectIds.has(requested) ? requested : `emergent-project-${chapter.week}-${index}-${hash(title)}`;
    projectIds.add(id);
    return [{ id, ownerId, title, stage: typeof value.stage === "string" ? value.stage.slice(0, 60) : "形成", progress: Math.max(0, Math.min(100, Number(value.progress) || 0)), momentum: Math.max(-10, Math.min(10, Number(value.momentum) || 1)), secrecy: Math.max(0, Math.min(100, Number(value.secrecy) || 50)), nextMilestone: typeof value.nextMilestone === "string" ? value.nextMilestone.slice(0, 220) : "等待下一步因果变化", blockers: Array.isArray(value.blockers) ? value.blockers.map(String).slice(0, 4) : [], status: ["active", "paused", "completed", "failed"].includes(String(value.status)) ? String(value.status) as "active" | "paused" | "completed" | "failed" : "active" as const }];
  });
  const rawEvents = list("events").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 12);
  const eventIdMap = new Map<string, string>();
  const events = rawEvents.flatMap((value, index) => {
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 80) : "";
    const detail = typeof value.detail === "string" ? value.detail.trim().slice(0, 520) : "";
    if (!title || !detail) return [];
    const sourceId = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `event-${index}`;
    const id = `world-${chapter.week}-${hash(`${sourceId}:${title}`)}`;
    eventIdMap.set(sourceId, id);
    const visibility = ["world", "public", "player", "actors"].includes(String(value.visibility)) ? String(value.visibility) as "world" | "public" | "player" | "actors" : "world";
    return [{ id, title, detail, locationId: typeof value.locationId === "string" && locationIds.has(value.locationId) ? value.locationId : undefined, actorIds: Array.isArray(value.actorIds) ? value.actorIds.map(String).filter((id) => actorIds.has(id)).slice(0, 6) : [], factionIds: Array.isArray(value.factionIds) ? value.factionIds.map(String).filter((id) => factionIds.has(id)).slice(0, 6) : [], causeIds: Array.isArray(value.causeIds) ? value.causeIds.map(String).slice(0, 6) : [], visibility }];
  });
  for (const event of events) event.causeIds = event.causeIds.map((id) => eventIdMap.get(id) ?? id);
  if (events.length < 3) throw new Error("世界模型没有形成足够的独立因果事件，本周拒绝结算");
  const fallbackEventId = events.find((event) => event.visibility !== "world")?.id ?? events[0].id;
  const observations = list("observations").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 12).flatMap((value, index) => {
    const text = typeof value.text === "string" ? value.text.trim().slice(0, 420) : "";
    if (!text) return [];
    const visibility = ["public", "player", "actors"].includes(String(value.visibility)) ? String(value.visibility) as "public" | "player" | "actors" : "public";
    return [{ id: `observation-${chapter.week}-${index}-${hash(text)}`, eventId: eventIdMap.get(String(value.eventId ?? "")) ?? fallbackEventId, channel: typeof value.channel === "string" ? value.channel.slice(0, 24) : "街谈", text, visibility, holderIds: Array.isArray(value.holderIds) ? value.holderIds.map(String).slice(0, 8) : [] }];
  });
  for (const [index, signal] of publicSignals.entries()) if (!observations.some((item) => item.text === signal.body)) observations.push({ id: `observation-signal-${chapter.week}-${index}`, eventId: fallbackEventId, channel: signal.channel, text: signal.body, visibility: "public", holderIds: [] });
  const actorUpdates = list("actorUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && actorIds.has(String((item as Record<string, unknown>).actorId)))).slice(0, 12).map((value) => ({ actorId: String(value.actorId), locationId: typeof value.locationId === "string" && locationIds.has(value.locationId) ? value.locationId : undefined, shortTermGoal: typeof value.shortTermGoal === "string" ? value.shortTermGoal.slice(0, 220) : undefined, lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 320) : undefined, condition: typeof value.condition === "string" ? value.condition.slice(0, 160) : undefined }));
  const factionUpdates = list("factionUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && factionIds.has(String((item as Record<string, unknown>).factionId)))).slice(0, 10).map((value) => ({ factionId: String(value.factionId), posture: typeof value.posture === "string" ? value.posture.slice(0, 220) : undefined, resourcesDelta: Math.max(-8, Math.min(8, Number(value.resourcesDelta) || 0)), suspicionDelta: Math.max(-6, Math.min(6, Number(value.suspicionDelta) || 0)), lastAction: typeof value.lastAction === "string" ? value.lastAction.slice(0, 320) : undefined }));
  const explicitProjects = list("projectUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && projectIds.has(String((item as Record<string, unknown>).projectId)))).slice(0, 12).map((value) => ({ projectId: String(value.projectId), progressDelta: Math.max(-8, Math.min(10, Number(value.progressDelta) || 0)), stage: typeof value.stage === "string" ? value.stage.slice(0, 60) : undefined, nextMilestone: typeof value.nextMilestone === "string" ? value.nextMilestone.slice(0, 220) : undefined, blockers: Array.isArray(value.blockers) ? value.blockers.map(String).slice(0, 4) : undefined, status: ["active", "paused", "completed", "failed"].includes(String(value.status)) ? String(value.status) as "active" | "paused" | "completed" | "failed" : undefined }));
  const projectUpdates = explicitProjects.length >= 2 ? explicitProjects : worldMoves.slice(0, 5).map((move) => ({ projectId: `faction:${move.factionId}`, progressDelta: 2, stage: move.title, nextMilestone: move.detail, blockers: undefined, status: "active" as const })).filter((item) => projectIds.has(item.projectId));
  if (projectUpdates.length < 2) throw new Error("世界模型没有推进足够的持续计划，本周拒绝结算");
  const locationUpdates = list("locationUpdates").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item) && locationIds.has(String((item as Record<string, unknown>).locationId)))).slice(0, 10).map((value) => ({ locationId: String(value.locationId), riskDelta: Math.max(-8, Math.min(8, Number(value.riskDelta) || 0)), stabilityDelta: Math.max(-8, Math.min(8, Number(value.stabilityDelta) || 0)), publicMood: typeof value.publicMood === "string" ? value.publicMood.slice(0, 160) : undefined, condition: typeof value.condition === "string" ? value.condition.slice(0, 200) : undefined }));
  const loreIds = new Set(LORE_RECORDS.map((record) => record.id));
  const knowledge = list("knowledge").filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 16).flatMap((value, index) => {
    const statement = typeof value.statement === "string" ? value.statement.trim().slice(0, 360) : "";
    if (!statement) return [];
    const visibility = ["world", "public", "player", "actors"].includes(String(value.visibility)) ? String(value.visibility) as "world" | "public" | "player" | "actors" : "world";
    const truth = ["confirmed", "likely", "false", "unknown"].includes(String(value.truth)) ? String(value.truth) as "confirmed" | "likely" | "false" | "unknown" : "unknown";
    return [{ id: `knowledge-${chapter.week}-${index}-${hash(statement)}`, subject: typeof value.subject === "string" ? value.subject.slice(0, 80) : "世界变化", statement, truth, visibility, holderIds: Array.isArray(value.holderIds) ? value.holderIds.map(String).slice(0, 8) : [], loreRecordIds: Array.isArray(value.loreRecordIds) ? value.loreRecordIds.map(String).filter((id) => loreIds.has(id)).slice(0, 8) : [], sourceEventId: eventIdMap.get(String(value.sourceEventId ?? "")) }];
  });
  const canonValue = source.canon && typeof source.canon === "object" && !Array.isArray(source.canon) ? source.canon as Record<string, unknown> : {};
  const mayDiverge = game.deviation >= 15 || game.pivots.some((pivot) => pivot.magnitude >= 20);
  return { week: chapter.week, playerIssuedNoOrders: chapter.results.length === 0, newActors, newFactions, newProjects, actorUpdates, factionUpdates, projectUpdates, locationUpdates, events, observations, knowledge, canon: { mode: mayDiverge && canonValue.mode === "diverging" ? "diverging" : "anchored", deviationDelta: Math.max(0, Math.min(8, Number(canonValue.deviationDelta) || 0)), pivotEventIds: mayDiverge && Array.isArray(canonValue.pivotEventIds) ? canonValue.pivotEventIds.map(String).map((id) => eventIdMap.get(id) ?? id).slice(0, 4) : [] } };
}

function isExplicitConstruction(intent: string) {
  const positive = /(?:^|[，。；、\s])(?:修建|建造|扩建|增设|改建|升级|布置|设立)(?:一座|一处|一间|新的|现有)?[^，。；]{0,24}(?:据点|房间|设施|实验室|仓库|安全屋|工坊|档案室|仪式室)|(?:改造|升级)(?:现有|组织的|我们的)?[^，。；]{0,18}(?:据点|房间|设施|工坊|档案室|仪式室)/;
  return positive.test(intent) && !/(?:不要|不得|避免|无需|不打算)[^，。；]{0,8}(?:修建|建造|扩建|改造|升级|设立)/.test(intent);
}

function inferKind(intent: string): ActionContract["kind"] {
  if (isExplicitConstruction(intent)) return "建设";
  const primaryClause = intent.split(/[，。；]/).map((part) => part.trim()).find((part) => part && !/^(?:不要|不得|避免|不惊动|不接触|不伤害|禁止)/.test(part)) ?? intent;
  const candidates: Array<[ActionContract["kind"], RegExp]> = [
    ["调查", /调查|追踪|查明|寻找|监视|潜入|打听/],
    ["交涉", /谈判|说服|交涉|拜访|联系|交易|举报/],
    ["研究", /研究|配方|材料|样本|档案|分析|鉴定/],
    ["仪式", /仪式|占卜|通灵|祈祷|召唤/],
    ["招募", /招募|邀请|吸收|加入组织|发展线人/],
    ["休整", /休息|休整|恢复|处理冲突|开会/],
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
  const match = normalized.match(/(?:调查|查明|寻找|追踪|接触|研究|鉴定|监视|潜入|打听|修建|建造|扩建|增设|改造|升级|招募|邀请|说服)([^，。；]{1,40})/);
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

export function localContract(args: {
  intent: string;
  game: GameState;
  leaderId: string;
  districtId: string;
  abilityIds: string[];
}): ActionContract {
  const kind = inferKind(args.intent);
  const district = DISTRICTS.find((item) => item.id === args.districtId) ?? DISTRICTS[0];
  const automaticMember = args.leaderId === "organization"
    ? /灵视|占卜|仪式|污染|封印|尸体|灵体/.test(args.intent) ? args.game.members.find((item) => item.id === "rowan")
      : /账目|采购|建设|设施|证件|预算|合法/.test(args.intent) ? args.game.members.find((item) => item.id === "cedric")
        : /报纸|贵族|消息|交涉|询问|线人/.test(args.intent) ? args.game.members.find((item) => item.id === "ines")
          : args.game.members.find((item) => item.id === "mara")
    : undefined;
  const effectiveLeaderId = automaticMember?.id ?? args.leaderId;
  const leader = effectiveLeaderId === "player" ? { name: args.game.playerName || "组织负责人", specialty: PATHWAYS[args.game.pathwayId].name } : automaticMember ?? args.game.members.find((item) => item.id === effectiveLeaderId);
  const explicitRetreat = args.intent.split(/[。；]/).find((part) => /撤退|撤离|中止|求援/.test(part));
  const explicitBan = args.intent.split(/[。；]/).find((part) => /不要|不得|禁止|避免/.test(part));
  const matchedOpportunity = args.game.opportunities.find((item) => item.state === "available" && (args.intent.includes(item.title.replace(/^(安全|追查|追踪|进入|向)/, "")) || item.suggestedIntent === args.intent));
  const days = kind === "建设" ? 5 : kind === "研究" ? 3 : kind === "休整" ? 2 : /长期|全面|深入/.test(args.intent) ? 4 : 2;
  const budget = kind === "建设" ? 90 : kind === "交涉" ? 35 : kind === "研究" || kind === "仪式" ? 28 : 18;
  return {
    id: `action-${Date.now()}`,
    rawIntent: args.intent.trim(),
    title: `${kind} · ${targetFrom(args.intent)}`,
    kind,
    target: targetFrom(args.intent),
    desiredOutcome: args.intent.trim(),
    approach: `${args.leaderId === "organization" ? "组织按决议自行分工，由" : ""}${leader?.name ?? "执行者"}利用${leader?.specialty ?? "现有关系"}，从当前可接触的证据层开始；具体人员与路线由组织在不偏离目标、方法和底线的前提下调整。`,
    leaderId: effectiveLeaderId,
    memberIds: [effectiveLeaderId],
    districtId: district.id,
    abilityIds: args.abilityIds,
    facilityId: /封存|切断联系|危险物/.test(args.intent) ? "vault" : kind === "研究" ? "archive" : kind === "仪式" ? "ritual" : kind === "建设" ? "workshop" : kind === "休整" ? "quarters" : undefined,
    days,
    budget,
    risk: inferRisk(args.intent, district.id, args.abilityIds.length),
    knownFacts: `组织只确认目前账本中与“${targetFrom(args.intent)}”直接相关的记录；${district.name}的公开背景可以作为起点。`,
    hypothesis: `玩家怀疑“${targetFrom(args.intent)}”值得投入资源，但假设本身不视为事实。`,
    unknowns: "目标真实身份、幕后关系、非凡层次与是否存在反调查手段仍未知。",
    redLines: explicitBan?.trim() || "不伤害无关者；不把未经验证的假设当作公开指控。",
    retreat: explicitRetreat?.trim() || "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
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
    district: DISTRICTS.find((district) => district.id === args.districtId),
    members: args.game.members.map(({ id, name, role, specialty, loyalty, fatigue }) => ({ id, name, role, specialty, loyalty, fatigue })),
  };
  const raw = await callModel(config,
    "你是《灰雾纪事》的行动契约解析器。只整理玩家意图，不决定成败，不新增幕后真相，不把玩家原著知识视为角色知识。返回严格JSON。",
    `将自由意图整理为行动契约。缺失信息使用保守推断，只有重大歧义才在unknowns中指出。字段：title,kind,target,desiredOutcome,approach,days,budget,risk,knownFacts,hypothesis,unknowns,redLines,retreat。kind只能是调查/交涉/研究/建设/招募/仪式/休整/自由行动，risk只能是低/中/高/致命。\n玩家意图：${args.intent}\n本地状态：${JSON.stringify(safeState)}\n本地保守解释：${JSON.stringify(fallback)}`, { json: true, maxTokens: 1800, temperature: .25 });
  const value = extractJson(raw);
  const kindOptions = ["调查", "交涉", "研究", "建设", "招募", "仪式", "休整", "自由行动"];
  const riskOptions = ["低", "中", "高", "致命"];
  const proposedKind = kindOptions.includes(String(value.kind)) ? value.kind as ActionContract["kind"] : fallback.kind;
  const explicitKind = inferKind(args.intent);
  const safeKind = proposedKind === "建设" && !isExplicitConstruction(args.intent)
    ? fallback.kind
    : explicitKind !== "自由行动" && proposedKind !== explicitKind ? explicitKind : proposedKind;
  const safeTarget = typeof value.target === "string" ? targetFrom(`${fallback.kind === "调查" ? "调查" : "接触"}${value.target}`) : fallback.target;
  return {
    ...fallback,
    title: `${safeKind} · ${safeTarget}`,
    kind: safeKind,
    target: safeTarget,
    facilityId: safeKind === "建设" ? fallback.facilityId : safeKind === "研究" ? "archive" : safeKind === "仪式" ? "ritual" : safeKind === "休整" ? "quarters" : /封存|切断联系|危险物/.test(args.intent) ? "vault" : undefined,
    desiredOutcome: typeof value.desiredOutcome === "string" ? value.desiredOutcome : fallback.desiredOutcome,
    approach: typeof value.approach === "string" ? value.approach : fallback.approach,
    days: Math.min(6, Math.max(1, Number(value.days) || fallback.days)),
    budget: Math.min(240, Math.max(0, Number(value.budget) || fallback.budget)),
    risk: riskOptions.includes(String(value.risk)) ? value.risk as RiskLevel : fallback.risk,
    knownFacts: typeof value.knownFacts === "string" ? value.knownFacts : fallback.knownFacts,
    hypothesis: typeof value.hypothesis === "string" ? value.hypothesis : fallback.hypothesis,
    unknowns: typeof value.unknowns === "string" ? value.unknowns : fallback.unknowns,
    redLines: typeof value.redLines === "string" ? value.redLines : fallback.redLines,
    retreat: typeof value.retreat === "string" ? value.retreat : fallback.retreat,
  };
}

function rangesOverlap(startA: number, daysA: number, startB: number, daysB: number) {
  return startA <= startB + daysB - 1 && startB <= startA + daysA - 1;
}

export function scheduleContract(game: GameState, contract: ActionContract) {
  const meetingRoom = game.facilities.find((item) => item.id === "meeting" && item.status === "运转中");
  const planningCapacity = meetingRoom ? 3 + meetingRoom.level : 2;
  if (game.schedule.length >= planningCapacity) throw new Error(`密议室当前最多协调${planningCapacity}项正式行动；升级指挥设施或移除其他计划。`);
  const committed = game.schedule.reduce((sum, item) => sum + item.budget, 0);
  if (game.money - committed - contract.budget < -80) throw new Error("这项行动会让组织越过严重债务线。请先取得收入、降低预算或接受一项有条件的资助。 ");
  for (let day = 1; day <= 7 - contract.days + 1; day += 1) {
    const conflict = game.schedule.some((action) => {
      if (!rangesOverlap(day, contract.days, action.startDay, action.days)) return false;
      const sameMember = action.memberIds.some((id) => contract.memberIds.includes(id));
      const sameFacility = Boolean(action.facilityId && contract.facilityId && action.facilityId === contract.facilityId);
      return sameMember || sameFacility;
    });
    if (!conflict) return { ...contract, startDay: day, status: "planned" as const };
  }
  throw new Error("本周没有满足人员与设施占用条件的连续时间，请调整队伍、工期或移除其他计划。");
}

function abilityTagsFromText(text: string) {
  const tags: string[] = [];
  const rules: [RegExp, string][] = [
    [/灵视|观察|洞察|预言|占卜|星象|感知/, "reveal"], [/门|穿越|传送|空间|旅行|坐标/, "access"],
    [/心理|情绪|催眠|梦境|人格|思想|暗示/, "social"], [/追踪|弱点|陷阱|阴谋|猎物/, "track"],
    [/火焰|攻击|武器|收割|战争|军团|征服/, "force"], [/仪式|知识|鉴定|卷轴|巫术|神秘/, "occult"],
    [/历史|奇迹|嫁接|愿望|规则|权柄|空想/, "reality"], [/隐秘|伪装|容貌|秘偶|替身/, "covert"],
  ];
  for (const [pattern, tag] of rules) if (pattern.test(text)) tags.push(tag);
  return tags.length ? tags : ["general"];
}

export function availableAbilities(game: GameState): Ability[] {
  const pathway = PATHWAYS[game.pathwayId];
  const base = pathway.startingAbilities.map((ability) => ({ ...ability, ruleTags: ability.ruleTags ?? abilityTagsFromText(`${ability.name}${ability.verb}${ability.description}`) }));
  const gained = pathway.sequences.filter((sequence) => sequence.rank < 9 && sequence.rank >= game.currentSequence).flatMap((sequence) => sequence.capabilities.map((capability, index) => ({
    id: `${game.pathwayId}-${sequence.rank}-${index}`,
    name: capability.split("：")[0],
    verb: capability.split("：")[0],
    description: `序列${sequence.rank}·${sequence.name}：${capability}`,
    cost: Math.max(1, Math.min(6, 2 + Math.floor((8 - sequence.rank) / 2))),
    risk: sequence.rank <= 4 ? "圣者层次能力会改变现场规则并留下可被高位存在辨认的痕迹。" : "能力规模越大，灵性痕迹、精神负担与反调查风险越高。",
    passive: false,
    ruleTags: abilityTagsFromText(capability),
  })));
  return [...base, ...gained];
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

const EVIDENCE_RULES: { id: string; pattern: RegExp; abilityPaths?: GameState["pathwayId"][] }[] = [
  { id: "ev-resonance", pattern: /挂坠|敲门|共鸣|封闭空间|鉴定|污染/, abilityPaths: ["seer", "apprentice", "mystery"] },
  { id: "ev-ink", pattern: /名单|墨水|采购|印刷|政府|港务|账目/ },
  { id: "ev-carriage", pattern: /信使|马车|追踪|货运|路线/, abilityPaths: ["hunter", "apprentice", "seer"] },
  { id: "ev-factory", pattern: /纺织厂|工厂|地下层|东区|潜入/ },
  { id: "ev-population", pattern: /人口|迁移|失踪|招工|秘密工程|王室/ },
  { id: "ev-gas-map", pattern: /煤气|管网|蓝图|压力表|调压站/ },
  { id: "ev-valve", pattern: /阀门|设备|机械|调压|释放装置/ },
  { id: "ev-engineer-order", pattern: /销毁|工程师|承包公司|蓝图命令/ },
  { id: "ev-mirror-guest", pattern: /镜子|倒影|贵客|侍女|仆役|皇后区/ },
  { id: "ev-perfume", pattern: /香水|灾祸|疾病|魔女|残留/ , abilityPaths: ["seer", "spectator", "mystery"] },
  { id: "ev-banquet-list", pattern: /晚宴|名单|贵族|仆役网络|社交/ },
  { id: "ev-returned-ship", pattern: /沉船|旧船|货轮|领航员|吃水线/ },
  { id: "ev-sealed-cargo", pattern: /密封箱|货物|报关|走私|旧船/ },
  { id: "ev-victim-register", pattern: /病例|诊所|受害者|救援|工棚名册/ },
  { id: "ev-ritual-site", pattern: /核心仪式|坐标|交点|远距离验证/ },
];

function discoverEvidence(game: GameState, contract: ActionContract, outcome: ActionResult["outcome"], extraDiscovery: number) {
  const evidence = game.evidenceNodes.map((item) => ({ ...item, tags: [...item.tags] }));
  if (outcome === "受阻") return { evidence, unlocked: [] as string[] };
  const candidates = EVIDENCE_RULES.filter((rule) => rule.pattern.test(contract.rawIntent + contract.target))
    .filter((rule) => !evidence.find((item) => item.id === rule.id)?.discovered)
    .filter((rule) => !rule.abilityPaths || !contract.abilityIds.length || rule.abilityPaths.includes(game.pathwayId));
  const limit = outcome === "成功" ? 1 + extraDiscovery : 1;
  const unlocked = candidates.slice(0, limit).map((item) => item.id);
  for (const id of unlocked) {
    const node = evidence.find((item) => item.id === id);
    if (node) { node.discovered = true; node.weekDiscovered = game.week; node.certainty = outcome === "成功" ? "可信证据" : "推断"; }
  }
  return { evidence, unlocked };
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
  const district = DISTRICTS.find((item) => item.id === contract.districtId)!;
  const successText = outcome === "成功" ? "得到两份相互独立的印证" : outcome === "部分成功" ? "得到一份可复核记录，但关键证人仍保持沉默" : "没有得到足够证据，却确认对方会对哪些问题产生反应";
  if (contract.kind === "建设") return [
    `建设方案已按“${contract.target}”拆分为隔离、人员、维护与撤离四个模块。`,
    outcome === "受阻" ? "工程暴露出结构或许可问题，需要补充资金和文书。" : "主要功能已经可以投入运转，后续仍可选择隐蔽、稳定或效能取向。",
    `当前工程使用${district.name}的既有掩护，未把组织非凡背景写入公开账目。`,
  ];
  if (contract.kind === "研究" && /配方|材料|晋升/.test(contract.rawIntent)) return [
    `档案室完成对“${contract.target}”的配方知识交叉校验。`,
    successText,
    "研究结果只确认组织能够验证的材料信息，未知项仍保留为未知。",
  ];
  const methodDetail = contract.methodTags?.includes("document") ? `档案员核对了登记时间、签章和纸张来源；其中一项记录在${game.week > 8 ? "本月" : "上月"}被人以补录名义覆盖。` : contract.methodTags?.includes("track") ? `追踪组记录了三处固定停留点，最稳定的一处靠近${district.landmarks[hash(contract.target) % district.landmarks.length]}，并确认目标会主动绕开有警察值守的路口。` : contract.methodTags?.includes("social") ? "接触对象没有直接承认推测，却在人员数量、时间和付款来源三个问题上先后改变说法；其中时间矛盾可以由第三方复核。" : contract.methodTags?.includes("occult") ? "灵性观察只确认残留的性质与方向：它来自近期反复使用，而不是偶然接触；更高层来源仍被反占卜或污染遮蔽。" : `执行者按契约记录了进入、观察与撤离三个时间点，现场变化发生在目标被问及“${contract.target}”之后。`;
  const limitDetail = outcome === "成功" ? "报告已经区分亲眼所见、他人证词与分析推断；当前结论可以支持下一步行动，但仍不足以单独公开指控重要人物。" : outcome === "部分成功" ? "唯一来源仍可能说谎或受到胁迫；档案室已经列出第二来源和重新接触窗口。" : "对方的警戒已经提高，原方法短期内不可重复；下一次应更换人员、入口或以盟友名义核验。";
  return [
    `${district.name}的行动围绕“${contract.target}”展开，${successText}；报告注明了具体时间、来源和无法验证的部分。`,
    methodDetail,
    `目标与${district.landmarks[hash(contract.id) % district.landmarks.length]}之间存在一条可继续复核的人员或物流联系，最早可追溯到本周行动前${1 + hash(contract.id) % 5}日。`,
    outcome === "受阻" ? "执行者在第一项撤退条件成立后中止接触，没有把失败包装成发现；撤离路线中的一个观察点已经暴露。" : `目标在得知有人查问后改变了原有安排；这既是新迹象，也是敌方反调查开始的信号。`,
    limitDetail,
  ];
}

function isMissionRelevant(contract: ActionContract) {
  return /挂坠|敲门|名单|信使|工人|失踪|黑玻璃|门缝|污染/.test(contract.rawIntent + contract.target);
}

function cleanNarrative(text: string) {
  return text.trim().replace(/([。！？；])\1+/g, "$1").replace(/([。！？])；/g, "$1").replace(/\s+([，。；！？])/g, "$1");
}

function endSentence(text: string) {
  const clean = cleanNarrative(text);
  return /[。！？]$/.test(clean) ? clean : `${clean}。`;
}

function buildLocalChapter(game: GameState, results: ActionResult[], worldText: string): ChronicleChapter {
  const focus = results.find((result) => result.contract.focus) ?? results[0];
  const sections: ChronicleChapter["sections"] = [];
  const weather = ["煤烟把晨光磨成了暗银色", "夜雨停在窗框上，雾却没有散", "街角的马车声比平日来得更早", "事务所的黄铜门牌蒙着一层潮气"][game.week % 4];
  sections.push({ heading: "密议之后", paragraphs: [
    `第${game.week}周，${weather}。散会时留在长桌上的不是任务清单，而是${results.length ? `${results.length}份由你亲自定下目标、边界与退路的行动契约` : "一页没有落款的空白日程"}。`,
    results.length ? `负责各席的人把命令复述给下属。红线、联络时限和撤离信号被分别封进信封；从这一刻起，组织会按你的方向行动，却仍要为城市的反应付出代价。` : "无人离开据点并不等于世界静止。成员修补掩护与封印，等着凌晨三点的声音再次越过门槛。",
  ] });
  if (focus) sections.push({ heading: focus.title, paragraphs: [
    `${focus.contract.leaderId === "player" ? "你亲自离开了据点" : "负责行动的席位派出了下属"}，前往${DISTRICTS.find((district) => district.id === focus.contract.districtId)?.name}。档案封面保留着你的原话：“${focus.contract.rawIntent}”——没有人把它改写成另一件更方便执行的事。`,
    ...focus.findings.slice(0, 4).map(endSentence),
    focus.abilityEffects.length ? endSentence(`非凡能力在现场留下了可核对的影响：${focus.abilityEffects.join("；")}；相应灵性、负荷与暴露已经结算`) : "这次行动没有擅自调用你的非凡能力；报告中的每一项发现都来自人员、时间与既有资源。",
    endSentence(`书记员最后写下“${focus.outcome}”：${focus.consequence}`),
  ] });
  const secondary = results.filter((result) => result.id !== focus?.id).slice(0, 3);
  if (secondary.length) sections.push({ heading: "其余回报", paragraphs: secondary.map((result) => endSentence(`${result.title}被记为“${result.outcome}”。${result.findings[0]} ${result.consequence}`)) });
  const futureChanges = results.flatMap((result) => result.futureChanges ?? []).slice(0, 4);
  const pressure = game.missions.find((mission) => mission.state === "active");
  const pressureConsequence = pressure?.consequence.replace(/^若继续(?:搁置|放任)[，,]?\s*/, "");
  sections.push({ heading: "下一次集会之前", paragraphs: [
    ...futureChanges.map((change) => endSentence(`${cleanNarrative(change)}；它已经成为下周可以继续追问或利用的条件`)),
    endSentence(cleanNarrative(worldText)),
    pressure ? `留在桌面中央的压力仍是“${pressure.title}”。还剩${pressure.deadline}周，当前推进${pressure.progress}%；若继续搁置，${endSentence(pressureConsequence ?? pressure.consequence)}` : "本周没有尚未处理的强制压力，但各方势力仍会依照自己的目标行动。",
  ] });
  return {
    id: `chapter-${game.week}-${Date.now()}`,
    week: game.week,
    date: game.date,
    title: focus ? `雾中意图 · ${focus.contract.target}` : "雾中的静默",
    source: "local",
    sections,
    results,
    summary: focus ? endSentence(`${focus.title}得到“${focus.outcome}”结算；${cleanNarrative(focus.findings[0] ?? focus.consequence).slice(0, 92)}`) : endSentence(`本周没有正式行动；${cleanNarrative(worldText).slice(0, 92)}`),
  };
}

export function resolveWeek(game: GameState) {
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
  let contractIncome = 0;
  const results: ActionResult[] = game.schedule.map((contract) => {
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
    const threshold = Math.max(18, Math.min(91, 52 + specificity + abilityBonus + facilityBonus + departmentBonus - fatiguePenalty - riskPenalty));
    const roll = hash(`${game.week}:${contract.rawIntent}:${contract.leaderId}`) % 100;
    const outcome: ActionResult["outcome"] = roll < threshold - 14 ? "成功" : roll < threshold ? "部分成功" : "受阻";
    const missionProgress = isMissionRelevant(contract) ? outcome === "成功" ? 22 : outcome === "部分成功" ? 12 : 3 : 0;
    const digestionGain = contract.leaderId === "player" ? outcome === "受阻" ? 2 : contract.abilityIds.length ? 9 : 4 : 0;
    const abilityEffects = contract.abilityIds.map((id) => abilities.find((ability) => ability.id === id)).filter((ability): ability is Ability => Boolean(ability)).map((ability) => `${ability.name}用于“${ability.verb}”，消耗${ability.cost}点灵性`);
    const abilityCost = contract.abilityIds.reduce((sum, id) => sum + (abilities.find((ability) => ability.id === id)?.cost ?? 0), 0);
    spirituality = Math.max(0, spirituality - abilityCost);
    const resourceChanges = {
      money: -contract.budget,
      secrecy: (outcome === "受阻" ? -4 : contract.risk === "高" || contract.risk === "致命" ? -3 : -1) + abilityRule.secrecyChange,
      stability: outcome === "受阻" ? -3 : contract.kind === "休整" ? 7 : 0,
      influence: outcome === "成功" && ["交涉", "招募", "建设"].includes(contract.kind) ? 4 : 1,
    };
    money += resourceChanges.money;
    secrecy += resourceChanges.secrecy;
    stability += resourceChanges.stability;
    influence += resourceChanges.influence;
    if (/实名|真名|公开身份|签署|官方会面|出席|公开指控/.test(contract.rawIntent)) nameExposure = Math.min(100, nameExposure + (outcome === "受阻" ? 9 : 5));
    if (/化名|匿名|代理人|不透露姓名|掩护身份/.test(contract.rawIntent)) nameExposure = Math.max(0, nameExposure - (outcome === "成功" ? 3 : 1));
    digestion = Math.min(100, digestion + digestionGain);
    if (outcome === "成功" && /委托|报酬|收款|商业调查|有偿/.test(contract.rawIntent)) contractIncome += Math.max(20, Math.round(contract.budget * 1.7));
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
      leader.fatigue = Math.min(100, leader.fatigue + contract.days * 4 + (contract.risk === "高" ? 6 : 0));
      if (outcome === "受阻" && ["高", "致命"].includes(contract.risk)) { leader.injury = contract.risk === "致命" ? "严重灵性创伤，必须休养" : "外勤负伤"; leader.status = "受伤休养"; }
    }

    if (contract.kind === "休整") {
      members = members.map((member) => ({ ...member, fatigue: Math.max(0, member.fatigue - 18), injury: member.injury && outcome === "成功" ? undefined : member.injury, status: member.injury && outcome === "成功" ? "可安排" : member.status }));
      spirituality = Math.min(game.spiritualityMax, spirituality + 3);
    }
    if (contract.kind === "研究" && /配方|材料|晋升/.test(contract.rawIntent)) {
      formulaKnowledge = Math.min(100, formulaKnowledge + (outcome === "成功" ? 30 : 12));
      if (formulaKnowledge >= 100) materials = materials.map((item) => ({ ...item, known: true }));
      if (outcome !== "受阻") {
        const missing = materials.find((item) => item.known && !item.obtained);
        if (missing && /寻找|采购|交换|猎取|获得|材料/.test(contract.rawIntent)) missing.obtained = true;
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
    const evidenceResult = discoverEvidence({ ...game, evidenceNodes, opportunities, factions }, contract, outcome, abilityRule.extraDiscovery);
    evidenceNodes = evidenceResult.evidence;
    const unlockedEvidenceIds = [...evidenceResult.unlocked];
    if (!unlockedEvidenceIds.length && outcome !== "受阻" && ["调查", "研究", "交涉", "仪式", "自由行动"].includes(contract.kind)) {
      const localId = `ev-local-${contract.id}`;
      evidenceNodes.push({ id: localId, caseId: "player-led", label: `${contract.target}的行动记录`, kind: contract.methodTags?.includes("social") ? "证词" : contract.methodTags?.includes("document") ? "记录" : "推断", summary: `${DISTRICTS.find((district) => district.id === contract.districtId)?.name}的${contract.methodTags?.join("、") || "现场"}方法确认了一个可复核切入点；它不能独立证明幕后结论。`, certainty: outcome === "成功" ? "可信证据" : "推断", discovered: true, source: contract.title, tags: [...(contract.methodTags ?? ["open"]), contract.target], weekDiscovered: game.week });
      unlockedEvidenceIds.push(localId);
    }
    const opportunityRefresh = refreshOpportunities({ ...game, opportunities }, evidenceNodes, contract.opportunityId);
    opportunities = opportunityRefresh.opportunities;
    const unlockedOpportunityIds = opportunityRefresh.newlyAvailable;
    const discoveredSet = new Set(evidenceNodes.filter((item) => item.discovered).map((item) => item.id));
    evidenceLinks = evidenceLinks.map((item) => ({ ...item, discovered: item.discovered || discoveredSet.has(item.from) && discoveredSet.has(item.to) }));
    if (/教会|值夜者|机械之心|提交证据/.test(contract.rawIntent)) factions = factions.map((item) => item.id === "night-church" ? { ...item, trust: Math.min(100, item.trust + (outcome === "成功" ? 8 : 2)), interest: Math.min(100, item.interest + 7), suspicion: Math.min(100, item.suspicion + (outcome === "受阻" ? 5 : 1)), visibility: "已接触" as const } : item);
    if (/王室|政府采购|秘密工程/.test(contract.rawIntent)) factions = factions.map((item) => item.id === "royal-project" ? { ...item, suspicion: Math.min(100, item.suspicion + (outcome === "成功" ? 9 : 4)), interest: Math.min(100, item.interest + 5) } : item);
    const baseFindings = resultFindings(contract, game, outcome);
    const concreteFindings = unlockedEvidenceIds.map((id) => evidenceNodes.find((item) => item.id === id)?.summary).filter((item): item is string => Boolean(item));
    const findings = concreteFindings.length ? [...concreteFindings, ...baseFindings.slice(0, Math.max(1, 3 - concreteFindings.length))] : baseFindings;
    const newFact: WorldFact = { id: `fact-${contract.id}`, subject: contract.target, statement: findings[0], certainty: outcome === "成功" ? "可信" : outcome === "部分成功" ? "线索" : "传闻", source: `${DISTRICTS.find((district) => district.id === contract.districtId)?.name}行动`, week: game.week };
    facts.push(newFact);
    if (contract.kind === "调查" && outcome === "成功") inventory.push({ id: `evidence-${contract.id}`, name: `${contract.target}的交叉验证记录`, category: "证据", quantity: 1, location: "证据档案室", keeper: "伊妮丝·科尔", risk: "只有与独立来源结合后才能形成正式指控。" });
    return {
      id: contract.id,
      title: contract.title,
      outcome,
      contract,
      findings,
      consequence: outcome === "成功" ? "目标取得实质进展，但被调查者可能开始调整安排。" : outcome === "部分成功" ? "得到可用信息，同时留下了关系或暴露代价。" : "队伍按契约撤退，没有把猜测写成事实；该目标下一次行动将更警惕。",
      abilityEffects,
      digestionGain,
      missionProgress,
      resourceChanges,
      reasons: [`指令具体度提供 ${specificity} 点准备优势`, facility ? `${facility.name}提供了可执行条件` : "没有使用专门设施", ...abilityRule.reasons, outcome === "受阻" ? "本次失败确认了目标的警戒与反调查能力" : "方法与资源通过了本周规则检定"],
      unlockedEvidenceIds,
      unlockedOpportunityIds,
      futureChanges: [
        ...unlockedEvidenceIds.map((id) => `调查板新增：${evidenceNodes.find((item) => item.id === id)?.label}`),
        ...unlockedOpportunityIds.map((id) => `开放新机会：${opportunities.find((item) => item.id === id)?.title}`),
        ...(contract.opportunityId ? [`机会已处理：${game.opportunities.find((item) => item.id === contract.opportunityId)?.title}`] : []),
      ].slice(0, 4),
    };
  });

  const totalMissionProgress = results.reduce((sum, result) => sum + result.missionProgress, 0);
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
    const progress = Math.min(100, mission.progress + totalMissionProgress);
    const deadline = Math.max(0, mission.deadline - 1);
    return { ...mission, progress, deadline, urgency: Math.min(100, mission.urgency + (totalMissionProgress ? -8 : 9)), state: progress >= 100 ? "resolved" as const : deadline === 0 ? "failed" as const : "active" as const };
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
  const worldText = `${totalMissionProgress
    ? "挂坠相关的压力暂时受到干预，但城市其他区域没有停止。"
    : "组织本周没有发出正式行动命令。"} 城市之外的变化将由独立世界模型推演，而不是由本地事件表代写。`;
  const chapter = buildLocalChapter(game, results, worldText);
  const nextWeek = game.week + 1;
  const coverIncome = 48 + Math.floor(game.influence / 5);
  const facilityCost = facilities.filter((item) => item.status === "运转中").reduce((sum, item) => sum + (item.maintenance ?? Math.max(2, item.level * 3)), 0) + game.organizationProfile.satellites.reduce((sum, item) => sum + item.upkeep, 0);
  const departmentCost = game.departments.reduce((sum, item) => sum + item.budget, 0);
  const actionCost = results.reduce((sum, item) => sum + item.contract.budget, 0);
  money += coverIncome + contractIncome - facilityCost - departmentCost;
  const economyEntry = { week: game.week, coverIncome, contractIncome, facilityCost, departmentCost, actionCost, balance: money };
  const baseDeviation = Math.min(100, game.deviation + results.filter((result) => result.outcome === "成功").length * .55 + results.reduce((sum, item) => sum + (item.unlockedEvidenceIds?.length ?? 0), 0) * .32);
  const pivotResolution = buildPivots(game, nextWeek, evidenceNodes, factions, baseDeviation);
  let timeline = timelineAfterWeek(game.timeline, nextWeek, evidenceNodes);
  if (pivotResolution.pivots.some((item) => item.id === "pivot-sabotage")) timeline = timeline.map((event) => ["tl-procurement", "tl-smog-eve"].includes(event.id) ? { ...event, status: "diverted" as const, revealed: true, summary: `${event.summary} 该事件已因组织破坏基础设施而改走新的因果分支。` } : event);
  const conditions = organizationConditions(secrecy, stability, influence, money);
  const dangerousPlayerResult = results.find((result) => result.contract.leaderId === "player" && ["高", "致命"].includes(result.contract.risk) && result.outcome !== "成功");
  const fatalSituation = dangerousPlayerResult ? {
    id: `fatal-${dangerousPlayerResult.id}`,
    actionId: dangerousPlayerResult.id,
    title: "现场撤离窗口正在闭合",
    threat: dangerousPlayerResult.contract.risk === "致命" ? "超出当前序列的非凡力量已经锁定现场；继续停留可能导致死亡。" : "队伍的身份与撤离路线同时受到威胁，错误选择会把伤势升级为致命局面。",
    knownThreats: [dangerousPlayerResult.contract.unknowns, dangerousPlayerResult.contract.retreat, `当前生命 ${game.playerCondition.health}，污染 ${game.playerCondition.pollution}`],
    stage: "decision" as const,
    odds: { retreat: Math.min(92, 70 + Math.floor(secrecy / 8)), help: Math.min(90, 52 + Math.floor((factions.find((item) => item.id === "night-church")?.trust ?? 0) / 2)), continue: Math.min(68, 24 + (10 - game.currentSequence) * 5 + dangerousPlayerResult.contract.abilityIds.length * 4) },
  } : null;
  const occultUses = results.reduce((sum, result) => sum + (result.contract.methodTags?.includes("occult") ? result.contract.abilityIds.length : 0), 0);
  const playerCondition = { ...game.playerCondition, pollution: Math.min(100, game.playerCondition.pollution + occultUses + (dangerousPlayerResult ? 3 : 0)), health: Math.min(100, game.playerCondition.health + (results.some((item) => item.contract.kind === "休整") ? 8 : 0)), injuries: [...game.playerCondition.injuries] };
  members = members.map((member) => ({ ...member, personalEventState: member.personalEventState === "dormant" && (member.fatigue >= 45 || nextWeek >= 8 + hash(member.id) % 8) ? "active" as const : member.personalEventState }));
  // Canon characters are advanced by the AI world simulator after the rules
  // transaction succeeds. Keeping them unchanged here prevents a local event
  // table from impersonating a living world.
  const canonActors = game.canonActors.map((actor) => ({ ...actor }));
  const cases = updateCases(game, evidenceNodes, nextWeek);
  const ending = game.ending.phase === "running" && nextWeek >= 21
    ? { ...game.ending, phase: "finale" as const, campaign: createFinaleCampaign() }
    : game.ending;
  const nextState: GameState = {
    ...game,
    week: nextWeek,
    date: addWeeksToDate(nextWeek),
    money,
    secrecy: Math.max(0, Math.min(100, secrecy)),
    stability: Math.max(0, Math.min(100, stability)),
    influence: Math.max(0, Math.min(100, influence)),
    deviation: pivotResolution.deviation,
    digestion,
    spirituality: Math.min(game.spiritualityMax, spirituality + Math.max(8, Math.floor(game.spiritualityMax * .6))),
    mentalLoad: Math.max(0, game.mentalLoad - 12),
    formulaKnowledge,
    ritualReadiness,
    instability,
    nameExposure,
    materials,
    facilities,
    members,
    recruitPool,
    inventory,
    facts: facts.slice(-80),
    missions,
    schedule: [],
    chronicle: [chapter, ...game.chronicle],
    evidenceNodes,
    evidenceLinks,
    opportunities,
    factions,
    timeline,
    worldMoves: [...departmentMoves, ...game.worldMoves].slice(0, 80),
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
  };
  return { state: nextState, chapter };
}

function validateChapter(value: Record<string, unknown>) {
  const title = typeof value.title === "string" ? value.title : "本周纪事";
  const sections = Array.isArray(value.sections) ? value.sections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const candidate = section as { heading?: unknown; paragraphs?: unknown };
    const paragraphs = Array.isArray(candidate.paragraphs) ? candidate.paragraphs.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
    return typeof candidate.heading === "string" && paragraphs.length ? [{ heading: candidate.heading, paragraphs }] : [];
  }) : [];
  if (sections.length < 1) throw new Error("文学章节没有形成正文");
  return { title, sections };
}

export async function generateLiteraryChapter(config: AiConfig, game: GameState, local: ChronicleChapter, onStage: (value: string) => void): Promise<ChronicleChapter> {
  const factPack = {
    week: local.week,
    date: local.date,
    organization: { name: game.organizationName, charter: game.charter },
    player: { name: game.playerName, address: game.playerAddress, nameExposure: game.nameExposure, pathway: PATHWAYS[game.pathwayId].name, sequence: game.currentSequence },
    results: local.results.map((result) => ({ title: result.title, outcome: result.outcome, findings: result.findings, consequence: result.consequence, abilityEffects: result.abilityEffects, reasons: result.reasons, futureChanges: result.futureChanges, contract: result.contract })),
    activePressure: game.missions.filter((mission) => mission.state === "active"),
    discoveredEvidence: game.evidenceNodes.filter((item) => item.discovered),
    availableOpportunities: game.opportunities.filter((item) => item.state === "available"),
    visibleFactionMoves: game.worldMoves.filter((move) => move.week === local.week && move.visibility !== "迹象").slice(0, 6),
    worldState: (() => { const snapshot = game.worldSnapshots?.find((item) => item.week === local.week); return snapshot ? { week: snapshot.week, date: snapshot.date, publicAtmosphere: snapshot.atmosphere } : null; })(),
    publicSignals: game.worldSignals?.filter((signal) => signal.week === local.week).slice(0, 8).map((signal) => ({ ...signal, relatedFactionId: undefined })) ?? [],
    playerWorldKnowledge: game.worldKernel.knowledge.filter((node) => node.visibility === "public" || node.holderIds.includes("player")).slice(-16),
    localReference: local.sections,
    forbidden: ["改变行动成败", "新增未经结算的线索", "泄露幕后真相", "替玩家决定内心信念", "擅自判定玩家死亡"],
  };
  const system = "你为原创维多利亚神秘主义互动小说《灰雾纪事》工作。使用严格的第三人称有限视角和克制的神秘悬疑文风，不复制任何现有小说句子。不要套用固定的周报结构、固定开场、固定收尾、信息分类标题或‘首先/其次/最后’式模板；根据这一周真正发生的事情自行决定场景、节奏、详略和分节数量。即使玩家没有发布命令，也要以事实包里的报纸、街谈、来信、亲历场景和可感知异常写出世界继续运行的实感。事实包故意排除了全知世界层：不得补写任何未被玩家观察到的势力行动、幕后身份、秘密工程目的或原著真相；publicAtmosphere只能用于天气与公共气氛，不能从中推导幕后主体。只能表达事实包，不能新增事实。只返回JSON。";
  if ((config.quality ?? "balanced") === "balanced") {
    onStage("小说引擎正在把规则结果写成章节");
    const written = extractJson(await callModel(config, system, `根据事实包写成600至1400字的完整章节。分节数量由内容决定，允许一段连续场景，也允许多地点交错；不要为了凑结构重复信息。返回JSON：{"title":"章名","sections":[{"heading":"自然分节名","paragraphs":["完整段落"]}]}。不得改变成败或新增线索。\n事实：${JSON.stringify(factPack)}`, { json: true, maxTokens: 6200, temperature: .86 }));
    const chapter = validateChapter(written);
    return { ...local, ...chapter, source: "ai" };
  }
  onStage("叙事导演正在安排重点场景");
  const director = extractJson(await callModel(config, `${system}\n你是叙事导演。`, `根据事实的戏剧重量制定600至1500字章节提纲，自行决定视角锚点、场景数量和结尾位置，不使用固定周报结构。返回JSON。\n${JSON.stringify(factPack)}`, { json: true, maxTokens: 2600, temperature: .62 }));
  onStage("正文作者正在写作");
  const writer = extractJson(await callModel(config, `${system}\n你是正文作者。`, `按提纲完成正文，分节数量服从故事而不是模板。返回{"title":"章名","sections":[{"heading":"分节","paragraphs":["完整段落"]}]}。\n提纲：${JSON.stringify(director)}\n事实：${JSON.stringify(factPack)}`, { json: true, maxTokens: 6800, temperature: .9 }));
  onStage("连续性编辑正在校对世界事实");
  const edited = extractJson(await callModel(config, `${system}\n你是连续性编辑，只能压缩、校正视角和人物语气。`, `校订并返回同样JSON。不得改变以下初稿所引用的事实。\n事实：${JSON.stringify(factPack)}\n初稿：${JSON.stringify(writer)}`, { json: true, maxTokens: 6200, temperature: .35 }));
  const chapter = validateChapter(edited);
  return { ...local, ...chapter, source: "ai" };
}

export type NpcDialogueResult = {
  reply: string;
  mood: string;
  memory: string | null;
  trustDelta: number;
  proposal: null;
};

export type SituationBrief = {
  title: string;
  dateline: string;
  paragraphs: string[];
};

export function localSituationBrief(game: GameState): SituationBrief {
  const pressure = game.missions.find((mission) => mission.state === "active");
  const snapshot = game.worldSnapshots?.[0];
  const signals = (game.worldSignals ?? []).filter((signal) => signal.week >= Math.max(1, game.week - 1)).slice(0, 3);
  return {
    title: game.week === 1 ? "雨水还留在门槛上" : `第${game.week}周 · 城市没有等候`,
    dateline: `${game.date} · 贝克兰德 · ${game.organizationName}`,
    paragraphs: [
      game.week === 1
        ? `廷根的一名年轻人刚从死亡中醒来。数百里外，贝克兰德的煤烟正压在屋脊之间；你的事务所已经收到一件不属于普通委托的东西。黑玻璃挂坠被锁进储藏间，浸水名单摊在灯下，送信的人却没有回来。`
        : snapshot?.atmosphere ?? `你离开密议室的这些日子里，贝克兰德继续吞吐煤烟、货物、消息与失踪者。组织保存下来的记录只照亮了其中很小的一部分。`,
      pressure ? `${pressure.premise} 这不是替你规定道路的任务，而是一件正在发生、会在${pressure.deadline}周后自行越过临界点的事。` : "眼下没有一项压力要求你立刻回应，但各方计划仍在向前推进。",
      signals.length ? signals.map((signal) => `${signal.channel}带来一条消息：“${signal.headline}”。${signal.body}`).join(" ") : "桌面上还没有足够的新消息。窗外仍有马车经过，城市的沉默并不等于安全。",
      `你以序列${game.currentSequence}·${PATHWAYS[game.pathwayId].sequences.find((sequence) => sequence.rank === game.currentSequence)?.name}的身份主持这个未获许可的组织。你可以召集成员、追问消息、发动能力、改变据点与组织结构，也可以整周不下达命令；无论选择什么，世界都会继续运行。`,
    ],
  };
}

export async function generateSituationBrief(config: AiConfig, game: GameState): Promise<SituationBrief> {
  const fallback = localSituationBrief(game);
  const lore = loreForPlayer(game, `${game.date} 贝克兰德 ${game.missions.filter((item) => item.state === "active").map((item) => item.title).join(" ")} ${game.worldSignals.slice(0, 5).map((item) => item.headline).join(" ")}`);
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
  };
  const raw = extractJson(await callModel(config, "你为原创维多利亚神秘主义互动小说《灰雾纪事》写玩家进入存档时看到的当前现状。它必须像小说真正开始的一页，不是教程、任务清单、系统摘要或模板化周报。使用有限视角、具体物件、声音、天气、人物动作与消息来源，让玩家理解此刻身在何处、世界刚发生了什么、什么压力正在逼近以及自己可以自由行动。不要替玩家决定情绪或选择，不泄露角色未知的幕后真相，不复制任何现成小说句子。只返回JSON。", `写一个标题、日期行和3至6个自然段。段落可以长短不一，不要使用“当前状况/你的目标/建议行动”之类标签。返回{"title":"小说式标题","dateline":"日期与地点","paragraphs":["完整段落"]}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 3200, temperature: .92 }));
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : fallback.title;
  const dateline = typeof raw.dateline === "string" && raw.dateline.trim() ? raw.dateline.trim().slice(0, 120) : fallback.dateline;
  const paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 1200)).slice(0, 6) : [];
  return { title, dateline, paragraphs: paragraphs.length ? paragraphs : fallback.paragraphs };
}

export async function generateNpcDialogue(config: AiConfig, game: GameState, memberId: string, playerText: string, context: "council" | "private" = "council"): Promise<NpcDialogueResult> {
  const member = game.members.find((item) => item.id === memberId);
  if (!member) throw new Error("没有找到这名成员");
  const lore = loreForActor(game, member, `${playerText} ${member.role} ${member.specialty} ${game.date}`);
  const thread = game.dialogueThreads.find((item) => item.memberId === memberId);
  const currentPressure = game.missions.find((item) => item.state === "active");
  const system = `你正在扮演原创人物${member.name}，参加维多利亚神秘组织的${context === "council" ? "每周密议" : "私下谈话"}。组织领导人是${game.playerName || "尚未登记姓名的负责人"}，正式场合应自然地称其为“${game.playerAddress || "会长阁下"}”，但不要每一段都重复称呼。你不是菜单、助手或任务发布器，而是一个有局限、有利益、有情绪、有当下注意力的人。
固定背景：${member.background ?? "未登记"}
性格核心：${member.core ?? "谨慎"}
说话习惯：${member.voice ?? "自然交谈"}
当前成长矛盾：${member.arc ?? "仍在观察组织"}
隐藏事实（只用于潜台词，除非现有关系与游戏证据足以支持，绝对不得直接泄露）：${member.secret ?? "无"}
忠诚${member.loyalty}，信任${member.trust ?? member.loyalty}，疲劳${member.fatigue}。你尊重组织层级：可以保留意见、请求澄清、陈述风险、婉拒违背原则的命令，但必须使用克制而正式的措辞，不得无礼顶撞、讥讽、贬低或反过来命令负责人；只有进入明确背叛或敌对状态后才可破例。只能使用人物可能知道的事实，不能读取原著幕后真相，不能替规则宣布行动成功、资源变化或人物死亡。
严格避免模板腔：不要说“我分几层讲”，不要逐项标注“亲历/下属报告/个人推断/未知”，不要机械复述玩家原话，不要总用“谨慎为上、请您示下、最后由您拍板”收尾。信息来源应该自然地藏在动作、回忆、引用和措辞中；若问题很简单，可以只答一句。只返回严格JSON。`;
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
      observations: game.worldKernel.observations.filter((item) => item.visibility === "public" || item.holderIds.includes(member.id)).slice(-12),
      knowledge: game.worldKernel.knowledge.filter((item) => item.visibility === "public" || item.holderIds.includes(member.id)).slice(-12),
    } : null,
    recentSignals: game.worldSignals?.slice(0, 8) ?? [],
    authorizedLore: lore.context || null,
    loreRecordIds: lore.records.map((item) => item.id),
    scheduledOrders: game.schedule.map((item) => ({ title: item.title, leaderId: item.leaderId, risk: item.risk })),
  };
  const raw = extractJson(await callModel(config, system, `像真实人物一样回应此刻这一句话。长度完全服从内容：可以20字，也可以在复杂问题中达到500字；不要为满足格式凭空扩写。普通谈话不要生成任务或提案卡。返回：{"reply":"自然动作与口语组成的回应，不包含分类标签","mood":"不超过8字的当前状态","memory":"真正值得以后记住的关系事实或null","trustDelta":-2到2}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 1900, temperature: .96 }));
  const reply = typeof raw.reply === "string" ? raw.reply.trim().slice(0, 1200) : "";
  if (!reply) throw new Error("人物没有形成可用回应");
  const mood = typeof raw.mood === "string" ? raw.mood.trim().slice(0, 16) : "克制";
  const memory = typeof raw.memory === "string" && raw.memory.trim() ? raw.memory.trim().slice(0, 180) : null;
  const trustDelta = Math.max(-2, Math.min(2, Number(raw.trustDelta) || 0));
  return { reply, mood, memory, trustDelta, proposal: null };
}

export async function generateAiWorldDelta(config: AiConfig, game: GameState, chapter: ChronicleChapter, onStage: (value: string) => void): Promise<GameState> {
  onStage(chapter.results.length ? "世界推演器正在结算城市对本周行动的回应" : "世界推演器正在推进没有玩家干预的这一周");
  const worldConfig = { ...config, model: config.worldModel?.trim() || config.model };
  const lore = loreForWorld(game, `${game.date} ${chapter.results.map((item) => item.contract.rawIntent).join(" ")} ${game.worldKernel.projects.filter((item) => item.status === "active").map((item) => item.title).join(" ")} ${game.worldKernel.actors.map((item) => `${item.name} ${item.agenda}`).join(" ")}`);
  const payload = {
    resolvingWeek: chapter.week,
    currentWeek: game.week,
    playerIssuedNoOrders: chapter.results.length === 0,
    chapter: chapter.results.map((item) => ({ actionId: item.id, outcome: item.outcome, contract: item.contract.rawIntent, target: item.contract.target, districtId: item.contract.districtId, approach: item.contract.approach, findings: item.findings, futureChanges: item.futureChanges })),
    factions: game.factions.map((item) => ({ id: item.id, name: item.name, currentPlan: item.currentPlan, trust: item.trust, suspicion: item.suspicion, planProgress: item.planProgress, lastMove: item.lastMove })),
    canonActors: game.canonActors.map((item) => ({ id: item.id, name: item.name, location: item.location, agenda: item.agenda, awareness: item.awareness, state: item.state })),
    pivots: game.pivots,
    timeline: game.timeline,
    recentWorld: game.worldSnapshots?.slice(0, 4) ?? [],
    recentSignals: game.worldSignals?.slice(0, 10) ?? [],
    knownEvidence: game.evidenceNodes.filter((item) => item.discovered).map((item) => ({ label: item.label, certainty: item.certainty, summary: item.summary })),
    persistentWorld: { ...game.worldKernel, events: game.worldKernel.events.slice(-80), observations: game.worldKernel.observations.slice(-80), knowledge: game.worldKernel.knowledge.slice(-100) },
    authorizedLore: lore.context,
    loreRecordIds: lore.records.map((item) => item.id),
    designerSupplement: config.worldBible?.trim().slice(0, 12000) || null,
  };
  const kernelProtocol = `同时必须返回kernelDelta，作为下周继续推演的权威世界状态增量：{"kernelDelta":{"newActors":[{"id":"稳定英文id","name":"本周首次进入推演且值得长期追踪的人物","locationId":"已有地点id","agenda":"长期诉求","shortTermGoal":"当前目标","condition":"处境"}],"newFactions":[{"id":"稳定英文id","name":"本周首次进入推演的组织","posture":"立场与目标","resources":0到100,"suspicion":0到100}],"newProjects":[{"id":"稳定英文id","ownerId":"已有或新角色/势力id","title":"新形成的持续计划","stage":"阶段","progress":0到100,"momentum":-10到10,"secrecy":0到100,"nextMilestone":"下一里程碑","blockers":[],"status":"active|paused|completed|failed"}],"actorUpdates":[{"actorId":"persistentWorld中的id","locationId":"已有地点id","shortTermGoal":"下一阶段目标","lastAction":"本周实际行动","condition":"当前处境"}],"factionUpdates":[{"factionId":"已有id","posture":"当前姿态与目标","resourcesDelta":-8到8,"suspicionDelta":-6到6,"lastAction":"本周自主行动"}],"projectUpdates":[{"projectId":"persistentWorld中的项目id","progressDelta":-8到10,"stage":"当前阶段","nextMilestone":"可检验的下一里程碑","blockers":["阻碍"],"status":"active|paused|completed|failed"}],"locationUpdates":[{"locationId":"已有地点id","riskDelta":-8到8,"stabilityDelta":-8到8,"publicMood":"普通人可感受到的气氛","condition":"本周形成的地点状态"}],"events":[{"id":"本回合内部临时id","title":"事件名","detail":"世界真相层发生的具体事件","locationId":"已有地点id或空","actorIds":["已有或newActors的id"],"factionIds":["已有或newFactions的id"],"causeIds":["本回合事件临时id或既有事件id"],"visibility":"world|public|player|actors"}],"observations":[{"eventId":"对应事件临时id","channel":"观察来源","text":"实际能被某方获知的内容","visibility":"public|player|actors","holderIds":["仅actors时填写角色id"]}],"knowledge":[{"subject":"对象","statement":"新形成的认知，允许为误判","truth":"confirmed|likely|false|unknown","visibility":"world|public|player|actors","holderIds":["持有者id"],"loreRecordIds":["本次authorizedLore中确实被获知的记录id"],"sourceEventId":"事件临时id"}],"canon":{"mode":"anchored|diverging","deviationDelta":0到8,"pivotEventIds":["明确偏转事件临时id"]}}}。newActors/newFactions只用于真正需要跨周追踪的新主体，不能每周滥造。至少生成3个彼此不全围绕玩家的events并推进2项持续project。世界真相事件默认visibility=world；只有observations可以把其中一部分转化为角色或玩家认知。不要因为模型读到了authorizedLore，就让NPC或玩家自动知道它。历史偏转未达到门槛时必须保持anchored，并让原著锚点大致按时间惯性发展。`;
  const raw = extractJson(await callModel(worldConfig, "你是《灰雾纪事》专用的持续世界模拟器。每一周必须先推进整个世界，再考虑玩家是否介入。势力、原著人物、城市生活、公共机构和神秘异常都拥有自己的目标与惯性；玩家无行动绝不等于世界无事件。规则引擎已经锁定玩家行动成败、资源和生死边界，你不得改写这些结算，不得杀死玩家，不得控制玩家意志，也不得把隐藏真相直接变成角色知识。公开信息必须通过报纸、街谈、通告、行业消息、私人来信或可感知征兆进入玩家视野。只返回严格JSON。", `独立完成这一周的世界推演。先在内部推演各方计划，再输出玩家实际能接触到的结果。没有玩家命令时，actionReports必须为空，但世界动向、原著人物行动、城市消息和时间线仍须推进。避免重复上一周措辞，避免所有事件都围绕玩家组织发生。worldSummary.changes必须是能由publicSignals或玩家观察直接支持的公开变化；undercurrents属于全知世界账本，绝不能被写进玩家周报。每条publicSignal只标一个主要发生城区，正文不得混写其他城区；跨区事件拆成多条消息。返回：{"worldSummary":{"atmosphere":"本周首都可公开感受到的整体气氛，80至180字","changes":["3至6条可由公开消息支持的变化"],"undercurrents":["2至4条仅供世界内核延续的暗流"]},"publicSignals":[{"channel":"报纸|街谈|官方通告|行业消息|神秘征兆|私人来信","headline":"自然标题","body":"只描述一个主要城区的具体可见信息，60至220字","reliability":"公开事实|多源传闻|单一消息|异常感知","districtId":"正文对应的唯一已有城区id或空","relatedFactionId":"只有玩家已知关联时才填写已有势力id，否则为空"}],"actionReports":[{"actionId":"已有actionId","fieldReport":"小说化现场述职","observableFacts":["2至4条可核验事实"],"followUp":"自然产生的可能方向"}],"factionMoves":[{"factionId":"已有id","title":"短标题","detail":"该势力自主推进的具体行动","visibility":"迹象|获知|确认","suspicionDelta":-4到6,"progressDelta":1到8}],"canonMoves":[{"actorId":"已有id","lastMove":"独立于玩家的自主行动","awareness":"未知|间接听闻|注意|直接接触"}],"emergentPressure":{"title":"只在因果确实形成时出现","premise":"来源","consequence":"放任后果","deadline":2到6}|null,"emergentLead":{"districtId":"已有城区id","label":"线索名","summary":"可观察事实","source":"来源","tags":["document|track|social|occult|official|protect"],"followUp":"可自由调查的方向"}|null}。每周给出3至6条publicSignals、3至5个factionMoves、1至3个canonMoves；它们之间应有跨周连续性，但不要把所有暗流强行连成同一阴谋。\n${kernelProtocol}\n${JSON.stringify(payload)}`, { json: true, maxTokens: 8200, temperature: .72 }));
  const moves = Array.isArray(raw.factionMoves) ? raw.factionMoves.slice(0, 5) : [];
  const factions = game.factions.map((item) => ({ ...item }));
  const worldMoves: WorldMove[] = [];
  for (const [index, move] of moves.entries()) {
    if (!move || typeof move !== "object") continue;
    const value = move as Record<string, unknown>;
    const faction = factions.find((item) => item.id === value.factionId);
    if (!faction || typeof value.detail !== "string" || typeof value.title !== "string") continue;
    const visibility = ["迹象", "获知", "确认"].includes(String(value.visibility)) ? value.visibility as WorldMove["visibility"] : "迹象";
    const suspicionDelta = Math.max(-4, Math.min(6, Number(value.suspicionDelta) || 0));
    const progressDelta = Math.max(0, Math.min(5, Number(value.progressDelta) || 0));
    faction.suspicion = Math.max(0, Math.min(100, faction.suspicion + suspicionDelta));
    faction.planProgress = Math.min(100, faction.planProgress + progressDelta);
    faction.lastMove = value.detail.slice(0, 240);
    worldMoves.push({ id: `ai-move-${game.week}-${index}-${faction.id}`, factionId: faction.id, title: value.title.slice(0, 40), detail: value.detail.slice(0, 240), week: game.week, visibility });
  }
  const canonMoves = Array.isArray(raw.canonMoves) ? raw.canonMoves.slice(0, 3) : [];
  const canonActors = game.canonActors.map((actor) => {
    const move = canonMoves.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).actorId === actor.id) as Record<string, unknown> | undefined;
    if (!move || typeof move.lastMove !== "string") return actor;
    const awareness = ["未知", "间接听闻", "注意", "直接接触"].includes(String(move.awareness)) ? move.awareness as typeof actor.awareness : actor.awareness;
    return { ...actor, lastMove: move.lastMove.slice(0, 220), awareness };
  });
  const allowedChannels = new Set<WorldSignal["channel"]>(["报纸", "街谈", "官方通告", "行业消息", "神秘征兆", "私人来信"]);
  const allowedReliability = new Set<WorldSignal["reliability"]>(["公开事实", "多源传闻", "单一消息", "异常感知"]);
  const publicSignals: WorldSignal[] = Array.isArray(raw.publicSignals) ? raw.publicSignals.slice(0, 6).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const headline = typeof value.headline === "string" ? value.headline.trim().slice(0, 70) : "";
    const body = typeof value.body === "string" ? value.body.trim().slice(0, 420) : "";
    if (!headline || !body) return [];
    const channel = allowedChannels.has(String(value.channel) as WorldSignal["channel"]) ? String(value.channel) as WorldSignal["channel"] : "街谈";
    const reliability = allowedReliability.has(String(value.reliability) as WorldSignal["reliability"]) ? String(value.reliability) as WorldSignal["reliability"] : "单一消息";
    const districtId = typeof value.districtId === "string" && DISTRICTS.some((district) => district.id === value.districtId) ? value.districtId : undefined;
    const relatedFactionId = typeof value.relatedFactionId === "string" && game.factions.some((faction) => faction.id === value.relatedFactionId) ? value.relatedFactionId : undefined;
    return [{ id: `ai-signal-${chapter.week}-${index}-${hash(headline)}`, week: chapter.week, channel, headline, body, reliability, districtId, relatedFactionId }];
  }) : [];
  if (publicSignals.length < 3) throw new Error("世界模型没有生成足够的报纸、传闻或公开征兆，本周拒绝结算");
  if (worldMoves.length < 2) throw new Error("世界模型没有让足够的独立势力采取行动，本周拒绝结算");
  const summaryValue = raw.worldSummary && typeof raw.worldSummary === "object" && !Array.isArray(raw.worldSummary) ? raw.worldSummary as Record<string, unknown> : {};
  const list = (value: unknown, limit: number) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit).map((item) => item.slice(0, 260)) : [];
  const latestLocalSnapshot = (game.worldSnapshots ?? []).find((snapshot) => snapshot.week === chapter.week);
  const worldSnapshot: WorldSnapshot = {
    week: chapter.week,
    date: chapter.date,
    atmosphere: typeof summaryValue.atmosphere === "string" && summaryValue.atmosphere.trim() ? summaryValue.atmosphere.trim().slice(0, 420) : latestLocalSnapshot?.atmosphere ?? "城市在组织视野之外继续运转。",
    changes: publicSignals.slice(0, 6).map((signal) => `${signal.channel}：${signal.headline}`),
    undercurrents: list(summaryValue.undercurrents, 4).length ? list(summaryValue.undercurrents, 4) : latestLocalSnapshot?.undercurrents ?? [],
  };
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
  const reportById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(raw.actionReports)) for (const report of raw.actionReports) {
    if (!report || typeof report !== "object") continue;
    const value = report as Record<string, unknown>;
    if (typeof value.actionId === "string" && chapter.results.some((item) => item.id === value.actionId)) reportById.set(value.actionId, value);
  }
  const enrichedResults = chapter.results.map((result) => {
    const report = reportById.get(result.id);
    if (!report) return result;
    const fieldReport = typeof report.fieldReport === "string" ? report.fieldReport.trim().slice(0, 700) : "";
    const observableFacts = Array.isArray(report.observableFacts) ? report.observableFacts.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4) : [];
    const followUp = typeof report.followUp === "string" ? report.followUp.trim().slice(0, 300) : "";
    return {
      ...result,
      findings: [...result.findings, ...observableFacts.filter((item) => !result.findings.includes(item))],
      reasons: fieldReport ? [...(result.reasons ?? []), `现场述职：${fieldReport}`] : result.reasons,
      futureChanges: followUp ? [...(result.futureChanges ?? []), followUp] : result.futureChanges,
      consequence: fieldReport ? `${result.consequence} ${fieldReport}` : result.consequence,
    };
  });
  const enrichedChapter = { ...chapter, results: enrichedResults };
  const chronicle = game.chronicle.map((item) => item.id === chapter.id ? enrichedChapter : item);
  const worldKernel = { ...applyWorldTurn(game.worldKernel, parseWorldKernelDelta(raw, game, chapter, publicSignals, worldMoves)), currentWeek: game.week, currentDate: game.date };
  return {
    ...game,
    factions,
    canonActors,
    missions,
    evidenceNodes,
    opportunities,
    worldMoves: [...worldMoves, ...game.worldMoves].slice(0, 80),
    worldSignals: [...publicSignals, ...(game.worldSignals ?? []).filter((signal) => signal.week !== chapter.week || !publicSignals.length)].slice(0, 120),
    worldSnapshots: [worldSnapshot, ...(game.worldSnapshots ?? []).filter((snapshot) => snapshot.week !== chapter.week)].slice(0, 60),
    worldKernel,
    chronicle,
  };
}

export function canAdvance(game: GameState) {
  return game.currentSequence > 0 && game.digestion >= 100 && game.formulaKnowledge >= 100 && game.ritualReadiness >= 100 && game.instability < 70 && game.materials.every((item) => item.obtained);
}

export function advanceSequence(game: GameState) {
  if (!canAdvance(game)) throw new Error("消化、配方或材料尚未满足晋升要求。");
  const nextRank = game.currentSequence - 1;
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
    deviation: Math.min(100, game.deviation + 1.2),
    facts: [...game.facts, { id: `advance-${nextRank}-${Date.now()}`, subject: "组织负责人", statement: `已晋升为序列${nextRank}·${PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === nextRank)?.name}。`, certainty: "确认" as const, source: "组织内部记录", week: game.week }],
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
  if (game.ending.phase !== "finale") return game;
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
