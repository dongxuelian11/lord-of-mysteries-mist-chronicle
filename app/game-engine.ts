import {
  ActionContract,
  ActionResult,
  Ability,
  ChronicleChapter,
  DISTRICTS,
  GameState,
  materialsFor,
  PATHWAYS,
  RiskLevel,
  WorldFact,
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
    facilityId: kind === "研究" ? "archive" : kind === "仪式" ? "ritual" : kind === "建设" ? "workshop" : undefined,
    days,
    budget,
    risk: inferRisk(args.intent, district.id, args.abilityIds.length),
    knownFacts: `组织只确认目前账本中与“${targetFrom(args.intent)}”直接相关的记录；${district.name}的公开背景可以作为起点。`,
    hypothesis: `玩家怀疑“${targetFrom(args.intent)}”值得投入资源，但假设本身不视为事实。`,
    unknowns: "目标真实身份、幕后关系、非凡层次与是否存在反调查手段仍未知。",
    redLines: explicitBan?.trim() || "不伤害无关者；不把未经验证的假设当作公开指控。",
    retreat: explicitRetreat?.trim() || "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
    focus: true,
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

export function availableAbilities(game: GameState): Ability[] {
  const pathway = PATHWAYS[game.pathwayId];
  if (game.currentSequence === 9) return pathway.startingAbilities;
  const sequence = pathway.sequences.find((item) => item.rank === game.currentSequence)!;
  return sequence.capabilities.map((capability, index) => ({
    id: `${game.pathwayId}-${game.currentSequence}-${index}`,
    name: capability.split("：")[0],
    verb: capability.split("：")[0],
    description: capability,
    cost: index === 0 ? 2 : 3,
    risk: "能力规模越大，灵性痕迹、精神负担与高位注视风险越高。",
    passive: false,
  }));
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
  const results: ActionResult[] = game.schedule.map((contract) => {
    const leader = contract.leaderId === "player" ? undefined : members.find((member) => member.id === contract.leaderId);
    const specificity = Math.min(16, Math.floor(contract.rawIntent.length / 14));
    const abilityBonus = contract.abilityIds.length * 11;
    const facilityBonus = contract.facilityId ? 7 : 0;
    const fatiguePenalty = leader ? Math.floor(leader.fatigue / 6) : 0;
    const riskPenalty = { 低: 0, 中: 8, 高: 19, 致命: 34 }[contract.risk];
    const threshold = Math.max(18, Math.min(91, 58 + specificity + abilityBonus + facilityBonus - fatiguePenalty - riskPenalty));
    const roll = hash(`${game.week}:${contract.rawIntent}:${contract.leaderId}`) % 100;
    const outcome: ActionResult["outcome"] = roll < threshold - 14 ? "成功" : roll < threshold ? "部分成功" : "受阻";
    const missionProgress = isMissionRelevant(contract) ? outcome === "成功" ? 28 : outcome === "部分成功" ? 16 : 5 : 0;
    const digestionGain = contract.leaderId === "player" ? outcome === "受阻" ? 3 : contract.abilityIds.length ? 11 : 7 : 0;
    const abilityEffects = contract.abilityIds.map((id) => abilities.find((ability) => ability.id === id)).filter((ability): ability is Ability => Boolean(ability)).map((ability) => `${ability.name}用于“${ability.verb}”，消耗${ability.cost}点灵性`);
    const abilityCost = contract.abilityIds.reduce((sum, id) => sum + (abilities.find((ability) => ability.id === id)?.cost ?? 0), 0);
    spirituality = Math.max(0, spirituality - abilityCost);
    const resourceChanges = {
      money: -contract.budget,
      secrecy: outcome === "受阻" ? -4 : contract.risk === "高" || contract.risk === "致命" ? -3 : -1,
      stability: outcome === "受阻" ? -3 : contract.kind === "休整" ? 7 : 0,
      influence: outcome === "成功" && ["交涉", "招募", "建设"].includes(contract.kind) ? 4 : 1,
    };
    money += resourceChanges.money;
    secrecy += resourceChanges.secrecy;
    stability += resourceChanges.stability;
    influence += resourceChanges.influence;
    digestion = Math.min(100, digestion + digestionGain);
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
      const recruit = { id: `recruit-${Date.now()}-${suffix}`, name: ["艾尔莎·莫恩", "维克托·莱恩", "诺拉·贝尔"][suffix], role: "新接触者", specialty: contract.target, loyalty: 45, fatigue: 0, status: "观察期" };
      members.push(recruit);
    }
    const findings = resultFindings(contract, game, outcome);
    const newFact: WorldFact = { id: `fact-${contract.id}`, subject: contract.target, statement: findings[1], certainty: outcome === "成功" ? "可信" : outcome === "部分成功" ? "线索" : "传闻", source: `${DISTRICTS.find((district) => district.id === contract.districtId)?.name}行动`, week: game.week };
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
    };
  });

  const totalMissionProgress = results.reduce((sum, result) => sum + result.missionProgress, 0);
  let missions = game.missions.map((mission) => {
    if (mission.state !== "active") return mission;
    const progress = Math.min(100, mission.progress + totalMissionProgress);
    const deadline = Math.max(0, mission.deadline - 1);
    return { ...mission, progress, deadline, urgency: Math.min(100, mission.urgency + (totalMissionProgress ? -8 : 9)), state: progress >= 100 ? "resolved" as const : deadline === 0 ? "failed" as const : "active" as const };
  });
  if (missions.some((mission) => mission.id === "first-knock" && mission.state === "failed") && !missions.some((mission) => mission.id === "threshold-open")) {
    missions = [...missions, { id: "threshold-open", title: "门槛已经打开", premise: "黑玻璃挂坠与某个未知地点建立了稳定联系。据点附近开始出现重复的脚步声，组织必须迁移、封闭联系或找出另一端。", deadline: 2, urgency: 88, progress: 0, consequence: "据点位置将进入官方与未知势力的共同视野。", hints: ["举行封闭仪式", "迁移核心资产", "沿联系反向追踪", "向可信教会求援"], state: "active" }];
  }
  const worldText = totalMissionProgress
    ? "挂坠相关的压力暂时受到干预，但城市其他区域没有停止。港口放行了一批没有公开收货人的货物，东区又有床位在夜间空了下来。"
    : "原初压力没有得到处理。凌晨三点的敲门声变得更清楚，像是某个看不见的访客已经学会辨认事务所内部的距离。";
  const chapter = buildLocalChapter(game, results, worldText);
  const nextWeek = game.week + 1;
  const nextState: GameState = {
    ...game,
    week: nextWeek,
    date: `1349年7月${String(Math.min(28, 1 + (nextWeek - 2) * 7)).padStart(2, "0")}日`,
    money: Math.max(0, money - 16),
    secrecy: Math.max(0, Math.min(100, secrecy)),
    stability: Math.max(0, Math.min(100, stability)),
    influence: Math.max(0, Math.min(100, influence)),
    deviation: Math.min(100, game.deviation + results.filter((result) => result.outcome === "成功").length * .35),
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
    chronicle: [chapter, ...game.chronicle].slice(0, 40),
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
    results: local.results.map((result) => ({ title: result.title, outcome: result.outcome, findings: result.findings, consequence: result.consequence, abilityEffects: result.abilityEffects, contract: result.contract })),
    activePressure: game.missions.filter((mission) => mission.state === "active"),
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
