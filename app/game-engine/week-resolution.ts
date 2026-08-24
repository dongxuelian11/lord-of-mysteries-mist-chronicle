import {
  ActionContract,
  ActionResult,
  Ability,
  ChronicleChapter,
  DISTRICTS,
  EvidenceNode,
  FactionState,
  GameState,
  TimelineEvent,
  WorldMove,
} from "../game-model";
import { createFinaleCampaign } from "../finale-system";
import { deriveLocalMemory, emptyMemoryState } from "../memory/index";
import { abilitiesFor, abilityRuleSummary } from "../pathway-abilities";
import { evaluateActing } from "../progression-system";
import { advanceOrganizationCausality } from "../organization-causality";
import { advanceFateWeek } from "../fate/index.ts";
import { advanceOrganizationManagementWeek, syncSealedArtifactsFromInventory } from "../organization-management.ts";
import {
  actionAdjudicationLedgerEvents,
  adjudicateWorldActionProposals,
  createActionRuleContext,
  proposalFromScheduledAction,
} from "../world-actions.ts";
import {
  appendWorldLedgerEvents,
  createWorldLedger,
  recordWorldLedgerPhase,
} from "../world-ledger.ts";
import { resolveFactionStrategyRound } from "../faction-strategy.ts";
import { applyHighSequenceActionResults } from "../high-sequence-ledger.ts";
import { advanceCampaignWorld, applyCampaignActionResults, campaignWeeklyYield } from "../campaign-world.ts";
import { textSimilarity } from "../model-output.ts";
import { advanceAttentionSimulation } from "../attention-simulation.ts";
import { chronicleSummaryFromCausality } from "../chronicle-causality.ts";
import { isRecruitmentIntent } from "./action-contracts.ts";

export function hash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output >>> 0);
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

export type ActionDomain = "investigation" | "finance" | "training" | "security" | "recruitment" | "cover" | "construction" | "advancement" | "rest" | "diplomacy" | "general";

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

export function seeksEvidence(contract: ActionContract) {
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
