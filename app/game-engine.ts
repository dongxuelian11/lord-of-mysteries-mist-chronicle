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

export type AiConfig = { endpoint: string; apiKey: string; model: string };

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

export async function callModel(config: AiConfig, system: string, user: string) {
  const base = config.endpoint.trim().replace(/\/$/, "");
  const url = /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`模型接口返回 ${response.status}`);
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型没有返回内容");
  return content;
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
  const leader = args.leaderId === "player" ? { name: "组织负责人", specialty: PATHWAYS[args.game.pathwayId].name } : args.game.members.find((item) => item.id === args.leaderId);
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
    approach: `${leader?.name ?? "执行者"}利用${leader?.specialty ?? "现有关系"}，从当前可接触的证据层开始；路线与接触顺序允许现场调整。`,
    leaderId: args.leaderId,
    memberIds: [args.leaderId],
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
    `将自由意图整理为行动契约。缺失信息使用保守推断，只有重大歧义才在unknowns中指出。字段：title,kind,target,desiredOutcome,approach,days,budget,risk,knownFacts,hypothesis,unknowns,redLines,retreat。kind只能是调查/交涉/研究/建设/招募/仪式/休整/自由行动，risk只能是低/中/高/致命。\n玩家意图：${args.intent}\n本地状态：${JSON.stringify(safeState)}\n本地保守解释：${JSON.stringify(fallback)}`);
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
  if (game.currentSequence === 9) return pathway.startingAbilities.map((ability) => ({ ...ability, ruleTags: ability.ruleTags ?? abilityTagsFromText(`${ability.name}${ability.verb}${ability.description}`) }));
  const sequence = pathway.sequences.find((item) => item.rank === game.currentSequence)!;
  return sequence.capabilities.map((capability, index) => ({
    id: `${game.pathwayId}-${game.currentSequence}-${index}`,
    name: capability.split("：")[0],
    verb: capability.split("：")[0],
    description: capability,
    cost: index === 0 ? 2 : 3,
    risk: "能力规模越大，灵性痕迹、精神负担与高位注视风险越高。",
    passive: false,
    ruleTags: abilityTagsFromText(capability),
  }));
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
  const next = factions.map((faction) => {
    let delta = faction.id === "royal-project" ? 4 : faction.id === "witch-sect" ? 3 : 1;
    if (faction.id === "night-church" && knowsPopulation) delta += 5;
    const planProgress = Math.min(100, faction.planProgress + delta);
    const visible = faction.visibility !== "未知" || faction.suspicion >= 25 || faction.interest >= 25;
    const detail = faction.id === "royal-project" ? "新的采购批次绕过公开招标，转入一间封闭仓库。" : faction.id === "witch-sect" ? "一名使用假身份的中间人清理了临时住所。" : faction.id === "night-church" ? "值夜者把新的失踪报告并入内部卷宗。" : `${faction.name}继续推进“${faction.currentPlan}”。`;
    if (visible) moves.push({ id: `move-${game.week}-${faction.id}`, factionId: faction.id, title: `${faction.name}的本周动向`, detail, week: game.week, visibility: faction.visibility === "持续往来" ? "确认" : "迹象" });
    return { ...faction, planProgress, lastMove: detail };
  });
  return { factions: next, moves };
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
  return [
    `${district.name}的行动围绕“${contract.target}”展开，${successText}。`,
    `已确认目标与${district.landmarks[hash(contract.id) % district.landmarks.length]}存在一条可追查的人员或物流联系。`,
    outcome === "受阻" ? "执行者按撤退条件中止接触，没有把失败包装成发现。" : `一条新的局部事实已经登记：目标近期改变过原有安排，并在回避来自${district.name}的常规查问。`,
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
    if (leader) leader.fatigue = Math.min(100, leader.fatigue + contract.days * 4 + (contract.risk === "高" ? 6 : 0));

    if (contract.kind === "休整") {
      members = members.map((member) => ({ ...member, fatigue: Math.max(0, member.fatigue - 18) }));
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
    if (contract.kind === "招募" && outcome === "成功") {
      const suffix = hash(contract.target) % 3;
      const recruit = { id: `recruit-${Date.now()}-${suffix}`, name: ["艾尔莎·莫恩", "维克托·莱恩", "诺拉·贝尔"][suffix], role: "新接触者", specialty: contract.target, loyalty: 45, trust: 38, interest: 62, ideology: 35, fatigue: 0, status: "观察期", background: "通过一次正式接触进入组织观察期，完整背景仍需验证。", core: "首先确认组织是否兑现承诺。", voice: "保留而务实，不主动交出全部信息。", arc: "正在决定成为线人、长期盟友还是正式成员。" };
      members.push(recruit);
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
  const facilityCost = facilities.filter((item) => item.status === "运转中").reduce((sum, item) => sum + (item.maintenance ?? Math.max(2, item.level * 3)), 0);
  const departmentCost = game.departments.reduce((sum, item) => sum + item.budget, 0);
  const actionCost = results.reduce((sum, item) => sum + item.contract.budget, 0);
  money += coverIncome + contractIncome - facilityCost - departmentCost;
  const economyEntry = { week: game.week, coverIncome, contractIncome, facilityCost, departmentCost, actionCost, balance: money };
  const timeline = timelineAfterWeek(game.timeline, nextWeek, evidenceNodes);
  const conditions = organizationConditions(secrecy, stability, influence, money);
  const nextState: GameState = {
    ...game,
    week: nextWeek,
    date: addWeeksToDate(nextWeek),
    money,
    secrecy: Math.max(0, Math.min(100, secrecy)),
    stability: Math.max(0, Math.min(100, stability)),
    influence: Math.max(0, Math.min(100, influence)),
    deviation: Math.min(100, game.deviation + results.filter((result) => result.outcome === "成功").length * .35 + results.reduce((sum, item) => sum + (item.unlockedEvidenceIds?.length ?? 0), 0) * .18),
    digestion,
    spirituality: Math.min(game.spiritualityMax, spirituality + 2),
    formulaKnowledge,
    materials,
    facilities,
    members,
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
    player: { pathway: PATHWAYS[game.pathwayId].name, sequence: game.currentSequence },
    results: local.results.map((result) => ({ title: result.title, outcome: result.outcome, findings: result.findings, consequence: result.consequence, abilityEffects: result.abilityEffects, reasons: result.reasons, futureChanges: result.futureChanges, contract: result.contract })),
    activePressure: game.missions.filter((mission) => mission.state === "active"),
    discoveredEvidence: game.evidenceNodes.filter((item) => item.discovered),
    availableOpportunities: game.opportunities.filter((item) => item.state === "available"),
    visibleFactionMoves: game.worldMoves.slice(0, 8),
    localReference: local.sections,
    forbidden: ["改变行动成败", "新增未经结算的线索", "泄露幕后真相", "替玩家决定内心信念", "擅自判定玩家死亡"],
  };
  const system = "你为原创维多利亚神秘主义互动小说《灰雾纪事》工作。第三人称有限视角，克制悬疑，不复制任何现有小说句子。只能表达事实包，不能新增事实。只返回JSON。";
  onStage("叙事导演正在安排重点场景");
  const director = extractJson(await callModel(config, `${system}\n你是叙事导演。`, `制定700至1200字章节提纲，包含负责人锚点、一个重点场景、次要汇报和结尾压力。返回JSON。\n${JSON.stringify(factPack)}`));
  onStage("正文作者正在写作");
  const writer = extractJson(await callModel(config, `${system}\n你是正文作者。`, `按提纲写3至5个分节。返回{"title":"章名","sections":[{"heading":"分节","paragraphs":["完整段落"]}]}。\n提纲：${JSON.stringify(director)}\n事实：${JSON.stringify(factPack)}`));
  onStage("连续性编辑正在校对世界事实");
  const edited = extractJson(await callModel(config, `${system}\n你是连续性编辑，只能压缩、校正视角和人物语气。`, `校订并返回同样JSON。不得改变以下初稿所引用的事实。\n事实：${JSON.stringify(factPack)}\n初稿：${JSON.stringify(writer)}`));
  const chapter = validateChapter(edited);
  return { ...local, ...chapter, source: "ai" };
}

export function canAdvance(game: GameState) {
  return game.currentSequence > 0 && game.digestion >= 100 && game.formulaKnowledge >= 100 && game.materials.every((item) => item.obtained);
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
    materials: nextRank > 0 ? materialsFor(game.pathwayId, nextRank - 1) : [],
    deviation: Math.min(100, game.deviation + 1.2),
    facts: [...game.facts, { id: `advance-${nextRank}-${Date.now()}`, subject: "组织负责人", statement: `已晋升为序列${nextRank}·${PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === nextRank)?.name}。`, certainty: "确认" as const, source: "组织内部记录", week: game.week }],
  };
}
