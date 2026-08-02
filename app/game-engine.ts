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
} from "./game-model";
import { createFinaleCampaign } from "./finale-system";
import { callModel as invokeModel, type AiConfig } from "./ai-client";
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

function inferKind(intent: string): ActionContract["kind"] {
  if (/建|修建|改造|据点|房间|设施|实验室|仓库|安全屋/.test(intent)) return "建设";
  if (/招募|邀请|吸收|加入组织|发展线人/.test(intent)) return "招募";
  if (/谈判|说服|交涉|拜访|联系|交易|举报/.test(intent)) return "交涉";
  if (/研究|配方|材料|样本|档案|分析|鉴定/.test(intent)) return "研究";
  if (/仪式|占卜|通灵|祈祷|召唤/.test(intent)) return "仪式";
  if (/休息|休整|恢复|处理冲突|开会/.test(intent)) return "休整";
  if (/调查|追踪|查明|寻找|监视|潜入|打听/.test(intent)) return "调查";
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
  const match = intent.match(/(?:调查|寻找|追踪|接触|研究|鉴定|监视|修建|改造|招募|说服)([^，。；]{2,30})/);
  return match?.[1]?.trim() || intent.slice(0, 28);
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
  return {
    ...fallback,
    title: typeof value.title === "string" ? value.title : fallback.title,
    kind: kindOptions.includes(String(value.kind)) ? value.kind as ActionContract["kind"] : fallback.kind,
    target: typeof value.target === "string" ? value.target : fallback.target,
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

function factionTurn(factions: FactionState[], game: GameState, evidence: EvidenceNode[]) {
  const knowsPopulation = evidence.find((item) => item.id === "ev-population")?.discovered;
  const moves: WorldMove[] = [];
  const observedActions = game.schedule.map((item) => item.rawIntent).join("；");
  const behavior: Record<string, { delta: number; detail: string }> = {
    "royal-project": { delta: knowsPopulation ? 7 : 4, detail: knowsPopulation ? "王室承包商连夜废弃一条运输线，并把临时工转移到新的封闭工棚。" : "新的采购批次绕过公开招标，转入一间封闭仓库。" },
    "witch-sect": { delta: /魔女|香水|镜子|贵族/.test(observedActions) ? 6 : 3, detail: /魔女|香水|镜子|贵族/.test(observedActions) ? "一名假身份女性离开住所前焚毁了香水账单，并开始调查是谁询问过她。" : "一名使用假身份的中间人清理了临时住所。" },
    "night-church": { delta: knowsPopulation ? 6 : 2, detail: knowsPopulation ? "值夜者把人口、煤气与仪式异常合并成内部专案，同时核验玩家提供的证据。" : "值夜者把新的失踪报告并入内部卷宗。" },
    "steam-church": { delta: evidence.find((item) => item.id === "ev-gas-map")?.discovered ? 6 : 2, detail: evidence.find((item) => item.id === "ev-gas-map")?.discovered ? "机械之心封存了一座调压站，并开始追查被销毁的管网蓝图。" : "机械之心复核本周煤气事故和异常设备记录。" },
    "aurora-order": { delta: 2, detail: "极光会外围尝试接触一名被官方忽视的失踪者家属。" },
    police: { delta: game.influence >= 35 ? 3 : 1, detail: game.secrecy < 50 ? "警察厅把事务所的出入记录列入例行检查，并向房东询问租约。" : "警察把新报案继续归入普通治安卷宗。" },
    press: { delta: game.influence >= 30 ? 3 : 2, detail: knowsPopulation ? "晚报编辑留下了人口异常的备份稿，却暂时拒绝刊登未经保护的证人姓名。" : "报社继续收集东区事故短讯和被撤下的讣告。" },
    "black-market": { delta: 2, detail: /材料|配方|采购/.test(observedActions) ? "黑市抬高了玩家所需材料的报价，并有人打听组织的真实买家。" : "桥区掮客重新核对本周危险材料买家。" },
  };
  const next = factions.map((faction) => {
    let delta = behavior[faction.id]?.delta ?? 1;
    if (faction.id === "night-church" && knowsPopulation) delta += 5;
    const planProgress = Math.min(100, faction.planProgress + delta);
    const visible = faction.visibility !== "未知" || faction.suspicion >= 25 || faction.interest >= 25;
    const detail = behavior[faction.id]?.detail ?? `${faction.name}继续推进“${faction.currentPlan}”。`;
    if (visible) moves.push({ id: `move-${game.week}-${faction.id}`, factionId: faction.id, title: `${faction.name}的本周动向`, detail, week: game.week, visibility: faction.visibility === "持续往来" ? "确认" : "迹象" });
    return { ...faction, planProgress, lastMove: detail };
  });
  return { factions: next, moves };
}

function canonTurn(game: GameState, nextWeek: number) {
  return game.canonActors.map((actor) => {
    if (actor.id === "klein" && nextWeek >= 10) return { ...actor, location: "贝克兰德", publicIdentity: "夏洛克·莫里亚蒂", state: "以私人侦探身份进入首都，并独立追查新的委托。", awareness: game.influence >= 45 ? "间接听闻" as const : actor.awareness, lastMove: "在桥区接下了一宗看似普通的调查；他的行动有自己的目标，不受玩家调度。" };
    if (actor.id === "klein" && nextWeek >= 6) return { ...actor, state: "廷根事件改变了他的身份与行动方式。", lastMove: "离开熟悉的城市，为进入贝克兰德做准备。" };
    if (actor.id === "audrey" && nextWeek >= 9) return { ...actor, state: "已经接触真正的神秘学圈层。", awareness: game.factions.find((item) => item.id === "press")?.interest && game.influence >= 35 ? "间接听闻" as const : actor.awareness, lastMove: "从贵族社交与心理观察中察觉人口议题的不协调。" };
    if (actor.id === "dunn" && nextWeek >= 7) return { ...actor, state: "廷根事件已经完成结算；他的命运取决于那条未受玩家直接控制的历史线。", lastMove: "原著锚点已越过，只有此前足够强的远程偏转才能改变其结果。" };
    return { ...actor };
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

function buildLocalChapter(game: GameState, results: ActionResult[], worldText: string): ChronicleChapter {
  const focus = results.find((result) => result.contract.focus) ?? results[0];
  const sections: ChronicleChapter["sections"] = [];
  sections.push({ heading: "据点的清晨", paragraphs: [
    `第${game.week}周开始时，乔伍德区的雾贴着事务所窗沿缓慢移动。密议室的长桌上放着本周日程、材料清单和仍在倒数的压力任务。组织没有替负责人决定什么，只把每项自由意图整理成可以付诸行动的契约。`,
    results.length ? `七天里共有${results.length}项行动进入日程。有人离开据点，有人守着仪式室或档案室；每个人都知道自己的目标、红线和最晚撤退时间。` : "负责人没有安排正式行动。成员修补掩护与封印，而城市依旧沿自己的方向发展。",
  ] });
  if (focus) sections.push({ heading: focus.title, paragraphs: [
    `${focus.contract.leaderId === "player" ? "负责人亲自" : "被派出的成员"}前往${DISTRICTS.find((district) => district.id === focus.contract.districtId)?.name}。这不是预设案件要求的路线，而是对“${focus.contract.rawIntent}”的直接执行。`,
    ...focus.findings.map((finding) => finding.endsWith("。") ? finding : `${finding}。`),
    focus.abilityEffects.length ? `非凡能力在现场留下了具体影响：${focus.abilityEffects.join("；")}。代价已经从灵性与暴露中扣除，没有被一句气氛描写掩盖。` : "这次行动没有擅自调用负责人的非凡能力，所有发现都来自人员、时间与已有资源。",
    `行动最终被记录为“${focus.outcome}”。${focus.consequence}`,
  ] });
  const secondary = results.filter((result) => result.id !== focus?.id);
  if (secondary.length) sections.push({ heading: "送回密议室的报告", paragraphs: secondary.map((result) => `${result.title}：${result.findings[0]} ${result.consequence}`) });
  const futureChanges = results.flatMap((result) => result.futureChanges ?? []).slice(0, 4);
  if (futureChanges.length) sections.push({ heading: "本周改变了什么", paragraphs: futureChanges.map((change) => `${change}。这会直接改变下一周可选择的行动，而不只是增加一个数字。`) });
  sections.push({ heading: "没有等待组织的世界", paragraphs: [worldText] });
  return {
    id: `chapter-${game.week}-${Date.now()}`,
    week: game.week,
    date: game.date,
    title: focus ? `雾中意图 · ${focus.contract.target}` : "雾中的静默",
    source: "local",
    sections,
    results,
    summary: `${results.filter((result) => result.outcome === "成功").length}项成功，${results.filter((result) => result.outcome === "部分成功").length}项部分成功，${results.filter((result) => result.outcome === "受阻").length}项受阻。`,
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
  const factionResolution = factionTurn(factions, game, evidenceNodes);
  factions = factionResolution.factions;
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
  const visibleWorldMoves = factionResolution.moves.slice(0, 2).map((move) => move.detail).join(" ");
  const worldText = `${totalMissionProgress
    ? "挂坠相关的压力暂时受到干预，但城市其他区域没有停止。"
    : "原初压力没有得到处理。凌晨三点的敲门声变得更清楚，像是某个看不见的访客已经学会辨认事务所内部的距离。"} ${visibleWorldMoves || "组织暂时没有取得足以辨认幕后行动的新迹象。"}`;
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
  const canonActors = canonTurn(game, nextWeek);
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
    spirituality: Math.min(game.spiritualityMax, spirituality + 2),
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
    worldMoves: [...factionResolution.moves, ...departmentMoves, ...game.worldMoves].slice(0, 80),
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
  if (sections.length < 3) throw new Error("文学章节结构不完整");
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
    visibleFactionMoves: game.worldMoves.slice(0, 8),
    localReference: local.sections,
    forbidden: ["改变行动成败", "新增未经结算的线索", "泄露幕后真相", "替玩家决定内心信念", "擅自判定玩家死亡"],
  };
  const system = "你为原创维多利亚神秘主义互动小说《灰雾纪事》工作。第三人称有限视角，克制悬疑，不复制任何现有小说句子。只能表达事实包，不能新增事实。只返回JSON。";
  if ((config.quality ?? "balanced") === "balanced") {
    onStage("小说引擎正在把规则结果写成章节");
    const written = extractJson(await callModel(config, system, `根据事实包直接写成700至1100字章节。需要3至5个分节，必须包含负责人视角、一个重点场景、次要汇报和结尾压力。返回JSON：{"title":"章名","sections":[{"heading":"分节","paragraphs":["完整段落"]}]}。不得改变成败或新增线索。\n事实：${JSON.stringify(factPack)}`, { json: true, maxTokens: 5600, temperature: .75 }));
    const chapter = validateChapter(written);
    return { ...local, ...chapter, source: "ai" };
  }
  onStage("叙事导演正在安排重点场景");
  const director = extractJson(await callModel(config, `${system}\n你是叙事导演。`, `制定700至1200字章节提纲，包含负责人锚点、一个重点场景、次要汇报和结尾压力。返回JSON。\n${JSON.stringify(factPack)}`, { json: true, maxTokens: 2200, temperature: .45 }));
  onStage("正文作者正在写作");
  const writer = extractJson(await callModel(config, `${system}\n你是正文作者。`, `按提纲写3至5个分节。返回{"title":"章名","sections":[{"heading":"分节","paragraphs":["完整段落"]}]}。\n提纲：${JSON.stringify(director)}\n事实：${JSON.stringify(factPack)}`, { json: true, maxTokens: 6200, temperature: .8 }));
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

export async function generateNpcDialogue(config: AiConfig, game: GameState, memberId: string, playerText: string, context: "council" | "private" = "council"): Promise<NpcDialogueResult> {
  const member = game.members.find((item) => item.id === memberId);
  if (!member) throw new Error("没有找到这名成员");
  const thread = game.dialogueThreads.find((item) => item.memberId === memberId);
  const currentPressure = game.missions.find((item) => item.state === "active");
  const system = `你正在扮演原创人物${member.name}，参加维多利亚神秘组织的${context === "council" ? "每周密议" : "私下谈话"}。组织领导人是${game.playerName || "尚未登记姓名的负责人"}，你应称其为“${game.playerAddress || "会长阁下"}”。你不是菜单、助手或任务发布器，而是一个有局限、有利益、有情绪的人。
固定背景：${member.background ?? "未登记"}
性格核心：${member.core ?? "谨慎"}
说话习惯：${member.voice ?? "自然交谈"}
当前成长矛盾：${member.arc ?? "仍在观察组织"}
隐藏事实（只用于潜台词，除非现有关系与游戏证据足以支持，绝对不得直接泄露）：${member.secret ?? "无"}
忠诚${member.loyalty}，信任${member.trust ?? member.loyalty}，疲劳${member.fatigue}。你尊重组织层级：可以保留意见、请求澄清、陈述风险、婉拒违背原则的命令，但必须使用克制而正式的措辞，不得无礼顶撞、讥讽、贬低或反过来命令负责人；只有进入明确背叛或敌对状态后才可破例。只能使用人物可能知道的事实，不能读取原著幕后真相，不能替规则宣布行动成功、资源变化或人物死亡。只返回严格JSON。`;
  const payload = {
    week: game.week,
    playerSaid: playerText,
    recentConversation: thread?.messages.slice(-12).map((item) => ({ role: item.role, text: item.text, context: item.context })) ?? [],
    lastingMemories: thread?.memories.slice(-6) ?? [],
    currentPressure: currentPressure ? { title: currentPressure.title, premise: currentPressure.premise, consequence: currentPressure.consequence } : null,
    lastWeek: game.chronicle[0] ? { summary: game.chronicle[0].summary, results: game.chronicle[0].results.map((item) => ({ title: item.title, outcome: item.outcome, findings: item.findings })) } : null,
    knownFacts: game.facts.slice(-14),
    scheduledOrders: game.schedule.map((item) => ({ title: item.title, leaderId: item.leaderId, risk: item.risk })),
  };
  const raw = extractJson(await callModel(config, system, `自然回应玩家。回复长度由内容决定，通常120至360字；复杂议题可以更长。成员必须承认玩家的最终领导权：可以恭敬地进言、请求澄清、说明代价或因原则正式请辞，但不得顶撞、嘲讽、贬低或命令玩家。普通谈话不要生成任务或提案卡。返回：{"reply":"带人物动作与自然口语的完整回应","mood":"不超过8字的当前状态","memory":"值得此人以后记住的关系事实或null","trustDelta":-2到2}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 1400, temperature: .88 }));
  const reply = typeof raw.reply === "string" ? raw.reply.trim().slice(0, 1200) : "";
  if (!reply) throw new Error("人物没有形成可用回应");
  const mood = typeof raw.mood === "string" ? raw.mood.trim().slice(0, 16) : "克制";
  const memory = typeof raw.memory === "string" && raw.memory.trim() ? raw.memory.trim().slice(0, 180) : null;
  const trustDelta = Math.max(-2, Math.min(2, Number(raw.trustDelta) || 0));
  return { reply, mood, memory, trustDelta, proposal: null };
}

export async function generateAiWorldDelta(config: AiConfig, game: GameState, chapter: ChronicleChapter, onStage: (value: string) => void): Promise<GameState> {
  onStage("世界推演器正在生成受约束的势力回应");
  const payload = {
    week: game.week,
    chapter: chapter.results.map((item) => ({ actionId: item.id, outcome: item.outcome, contract: item.contract.rawIntent, target: item.contract.target, districtId: item.contract.districtId, approach: item.contract.approach, findings: item.findings, futureChanges: item.futureChanges })),
    factions: game.factions.map((item) => ({ id: item.id, name: item.name, currentPlan: item.currentPlan, trust: item.trust, suspicion: item.suspicion, planProgress: item.planProgress, lastMove: item.lastMove })),
    canonActors: game.canonActors.map((item) => ({ id: item.id, name: item.name, location: item.location, agenda: item.agenda, awareness: item.awareness, state: item.state })),
    pivots: game.pivots,
    knownEvidence: game.evidenceNodes.filter((item) => item.discovered).map((item) => ({ label: item.label, certainty: item.certainty, summary: item.summary })),
  };
  const raw = extractJson(await callModel(config, "你是AI原生回合制世界状态推演器。玩家可以下达任何自然语言命令。规则已经锁定成败、资源与生死边界；你负责让具体人物、现场与势力产生合乎因果的回应。不得新增核心幕后真相，不改变已结算成败，不杀死玩家，不控制玩家意志。只返回严格JSON。", `根据可见状态生成本周后续回应。每一项玩家命令都必须得到具体而有信息量的现场报告，不能只复述成功或失败。返回：{"actionReports":[{"actionId":"本周已有actionId","fieldReport":"像成员在集会上述职一样报告现场过程、人物反应与阻碍","observableFacts":["2至4条可观察、可核验的具体事实"],"followUp":"由结果自然产生但不强迫玩家接受的下一步"}],"factionMoves":[{"factionId":"已有id","title":"短标题","detail":"可被玩家观察到的具体行动","visibility":"迹象|获知|确认","suspicionDelta":-4到6,"progressDelta":0到5}],"canonMoves":[{"actorId":"已有id","lastMove":"自主行动","awareness":"未知|间接听闻|注意|直接接触"}],"emergentPressure":{"title":"可选的新压力","premise":"由玩家行动后果产生","consequence":"放任后果","deadline":2到6}|null,"emergentLead":{"districtId":"已有城区id","label":"玩家可理解的线索名","summary":"仅描述可观察事实，不揭露幕后","source":"消息来源","tags":["document|track|social|occult|official|protect"],"followUp":"可以自由调查的具体下一步"}|null}。最多3个势力行动、2个原著人物行动；只能从事实推断局部回应。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 4400, temperature: .48 }));
  const moves = Array.isArray(raw.factionMoves) ? raw.factionMoves.slice(0, 3) : [];
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
  const canonMoves = Array.isArray(raw.canonMoves) ? raw.canonMoves.slice(0, 2) : [];
  const canonActors = game.canonActors.map((actor) => {
    const move = canonMoves.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).actorId === actor.id) as Record<string, unknown> | undefined;
    if (!move || typeof move.lastMove !== "string") return actor;
    const awareness = ["未知", "间接听闻", "注意", "直接接触"].includes(String(move.awareness)) ? move.awareness as typeof actor.awareness : actor.awareness;
    return { ...actor, lastMove: move.lastMove.slice(0, 220), awareness };
  });
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
  return { ...game, factions, canonActors, missions, evidenceNodes, opportunities, worldMoves: [...worldMoves, ...game.worldMoves].slice(0, 80), chronicle };
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
