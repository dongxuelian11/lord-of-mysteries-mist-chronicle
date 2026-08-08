import {
  type ActionResult,
  type ChronicleChapter,
  DISTRICTS,
  type FinaleCampaign,
  type FinaleCrisis,
  type FinaleDoctrine,
  type FinaleReport,
  type GameState,
  PATHWAYS,
  type WorldFact,
} from "./game-model.ts";

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));

function hash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) { output ^= value.charCodeAt(index); output = Math.imul(output, 16777619); }
  return Math.abs(output >>> 0);
}

function finaleDate(week: number) {
  const date = new Date(Date.UTC(1349, 5, 30));
  date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function tagsFor(text: string) {
  const tags: string[] = [];
  if (/人口|工人|失踪|伤|救|撤离/.test(text)) tags.push("protect", "social");
  if (/煤气|管线|工程|机械|工厂/.test(text)) tags.push("build", "access");
  if (/仪式|魔女|污染|灵性|神秘/.test(text)) tags.push("occult", "reveal");
  if (/档案|名单|证据|报纸|记录/.test(text)) tags.push("document", "official");
  if (/转移|货物|码头|跟踪|路线/.test(text)) tags.push("track", "covert");
  return [...new Set(tags.length ? tags : ["covert", "social"])];
}

function knownEvidenceFor(game: GameState, districtId: string, text: string) {
  const district = DISTRICTS.find((item) => item.id === districtId);
  return game.evidenceNodes
    .filter((item) => item.discovered && !item.compromised && (item.tags.some((tag) => text.includes(tag)) || district?.landmarks.some((landmark) => item.summary.includes(landmark)) || item.summary.includes(district?.name ?? "")))
    .slice(0, 4)
    .map((item) => item.id);
}

function crisisCandidates(game: GameState) {
  const eventCandidates = game.worldKernel.events
    .filter((event) => event.locationId && DISTRICTS.some((district) => district.id === event.locationId))
    .slice()
    .sort((a, b) => b.week - a.week)
    .map((event) => ({ id: `event:${event.id}`, districtId: event.locationId!, title: event.title, detail: event.detail, progress: 48 + (game.worldKernel.locations.find((item) => item.id === event.locationId)?.risk ?? 30), sourceFactIds: [event.id] }));
  const projectCandidates = game.worldKernel.projects
    .filter((project) => project.status === "active" && project.progress >= 35)
    .slice()
    .sort((a, b) => b.progress - a.progress)
    .map((project) => {
      const ownerActor = game.worldKernel.actors.find((actor) => actor.id === project.ownerId);
      const ownerFaction = game.worldKernel.factions.find((faction) => faction.id === project.ownerId);
      const districtId = ownerActor?.locationId ?? game.worldKernel.events.slice().reverse().find((event) => event.factionIds.includes(ownerFaction?.id ?? ""))?.locationId ?? "east";
      return { id: `project:${project.id}`, districtId, title: project.title, detail: `${project.stage}；下一里程碑是${project.nextMilestone}`, progress: project.progress, sourceFactIds: [project.id] };
    });
  const locationCandidates = game.worldKernel.locations
    .filter((location) => location.risk >= 48)
    .slice()
    .sort((a, b) => b.risk - a.risk)
    .map((location) => ({ id: `location:${location.id}`, districtId: location.id, title: `${location.name}的秩序正在失去余量`, detail: [...location.conditions.slice(-2), location.publicMood].filter(Boolean).join("；"), progress: location.risk, sourceFactIds: [location.id] }));
  return [...eventCandidates, ...projectCandidates, ...locationCandidates].filter((candidate, index, all) => all.findIndex((item) => item.districtId === candidate.districtId && item.title === candidate.title) === index);
}

function buildStageCrises(game: GameState, campaign: Pick<FinaleCampaign, "stage" | "enemyProgress" | "resolvedFrontIds">): FinaleCrisis[] {
  const prior = new Set(campaign.resolvedFrontIds ?? []);
  const candidates = crisisCandidates(game).filter((item) => !prior.has(item.id));
  const count = clamp(2 + Math.floor(campaign.enemyProgress / 38), 2, 4);
  const chosen = candidates.slice(0, count);
  if (chosen.length < 2) {
    for (const location of game.worldKernel.locations.slice().sort((a, b) => b.risk - a.risk)) {
      const id = `pressure:${campaign.stage}:${location.id}`;
      if (chosen.some((item) => item.districtId === location.id)) continue;
      chosen.push({ id, districtId: location.id, title: `${location.name}出现新的危机征兆`, detail: `${location.publicMood}；目前能够确认的区域条件为${location.conditions.slice(-2).join("、") || "来源仍不足"}`, progress: location.risk, sourceFactIds: [location.id] });
      if (chosen.length >= 2) break;
    }
  }
  return chosen.slice(0, count).map((candidate, index) => {
    const tags = tagsFor(`${candidate.title}${candidate.detail}`);
    const risk: FinaleCrisis["risk"] = candidate.progress >= 78 || (campaign.stage >= 3 && index === 0) ? "致命" : "高";
    return {
      id: candidate.id,
      stage: campaign.stage,
      districtId: candidate.districtId,
      title: candidate.title,
      scene: candidate.detail,
      threat: `这一前线由当前世界状态推导；风险读数为${clamp(Math.round(candidate.progress))}，仍有未进入组织视野的行动者。`,
      risk,
      tags,
      evidenceIds: knownEvidenceFor(game, candidate.districtId, `${candidate.title}${candidate.detail}`),
      consequence: `若不介入，相关世界项目会继续获得进度，${DISTRICTS.find((item) => item.id === candidate.districtId)?.name ?? "该区域"}的风险与伤亡压力会进入下一阶段。`,
      sourceFactIds: candidate.sourceFactIds,
    };
  });
}

function stageHeading(game: GameState, stage: number) {
  const dominant = crisisCandidates(game)[0];
  return dominant ? `${dominant.title}越过第${stage}道门槛` : `城市危机进入第${stage}次汇合`;
}

function finaleActionResults(game: GameState, campaign: FinaleCampaign, crises: FinaleCrisis[], report: FinaleReport): ActionResult[] {
  return crises.map((crisis) => {
    const reported = report.results.find((item) => item.crisisId === crisis.id)!;
    const executor = crisis.assignedMemberId === "player" ? game.playerAddress : game.members.find((item) => item.id === crisis.assignedMemberId)?.name ?? "未记录执行者";
    return {
      id: `finale-action-${campaign.stage}-${crisis.id}`,
      title: reported.title,
      outcome: reported.outcome === "失败" ? "受阻" : reported.outcome,
      contract: {
        id: `finale-contract-${campaign.stage}-${crisis.id}`,
        rawIntent: `终局立场“${campaign.doctrine}”：由${executor}处理${crisis.title}；服从已知威胁、既有证据与撤退边界，不越权改写世界事实。`,
        title: crisis.title,
        kind: "自由行动",
        target: crisis.title,
        desiredOutcome: `${campaign.doctrine}这条危机前线，并让城市与其他行动者依据结果继续运行。`,
        approach: `${executor}依靠${crisis.tags.join("、") || "现场判断"}，使用已部署的成员、势力与设施支点执行。`,
        leaderId: crisis.assignedMemberId ?? "player",
        memberIds: crisis.assignedMemberId && crisis.assignedMemberId !== "player" ? [crisis.assignedMemberId] : [],
        districtId: crisis.districtId,
        abilityIds: [],
        facilityId: crisis.assignedFacilityId,
        days: 1,
        budget: 0,
        risk: crisis.risk,
        knownFacts: `${crisis.scene} ${crisis.threat}`,
        hypothesis: "仍有未进入组织视野的高位行动者与后续反应。",
        unknowns: "敌对势力、原著人物和城市机构将如何回应，只能由持续世界模型结算。",
        redLines: "AI不得改写规则成败、资源、伤亡与玩家死亡边界；不得让未公开的世界真相自动成为角色知识。",
        retreat: "若玩家陷入致命处境，必须进入撤退、求援或继续的明确选择与最终检定。",
        focus: true,
        methodTags: crisis.tags,
      },
      findings: [reported.detail],
      consequence: crisis.consequence,
      abilityEffects: [],
      digestionGain: 0,
      missionProgress: 0,
      resourceChanges: { money: 0, secrecy: 0, stability: 0, influence: 0 },
      reasons: [`终局规则已锁定为${reported.outcome}；文学模型与世界模型只能据此继续。`],
      unlockedEvidenceIds: crisis.evidenceIds,
      futureChanges: [crisis.consequence],
    };
  });
}

export function createFinaleCampaign(game: GameState): FinaleCampaign {
  const base: FinaleCampaign = {
    stage: 1,
    totalStages: 3,
    stageTitle: stageHeading(game, 1),
    stageBrief: "终局已经由世界状态触发。议桌只展示目前有来源支撑的危机前线；新威胁必须先以征兆出现。",
    crises: [], reports: [], momentum: 0,
    enemyProgress: clamp(Math.round(Math.max(45, ...game.worldKernel.projects.filter((item) => item.status === "active").map((item) => item.progress))), 45, 92),
    rescued: 0, casualties: 0, exposedTruth: 0,
    crisisKey: game.worldKernel.projects.filter((item) => item.status === "active").sort((a, b) => b.progress - a.progress)[0]?.id ?? "city-pressure",
    resolvedFrontIds: [],
  };
  return { ...base, crises: buildStageCrises(game, base) };
}

export function refreshFinaleFronts(game: GameState) {
  const campaign = game.ending.campaign;
  if ((game.ending.phase !== "finale" && game.ending.phase !== "major-event") || !campaign || game.fatalSituation) return game;
  const refreshed: FinaleCampaign = {
    ...campaign,
    stageTitle: stageHeading(game, campaign.stage),
    stageBrief: "独立世界模型已经写入上一阶段的城市、势力与原著人物回应；这一阶段只从仍在运行的项目、区域压力和已锁定余波中形成前线。",
    crises: buildStageCrises(game, campaign),
  };
  return { ...game, ending: { ...game.ending, campaign: refreshed } };
}

export function chooseFinaleDoctrine(game: GameState, doctrine: FinaleDoctrine) {
  if ((game.ending.phase !== "finale" && game.ending.phase !== "major-event") || !game.ending.campaign) return game;
  return { ...game, ending: { ...game.ending, route: doctrine, campaign: { ...game.ending.campaign, doctrine } } };
}

export function assignFinaleResource(game: GameState, crisisId: string, kind: "member" | "faction" | "facility", id: string) {
  const campaign = game.ending.campaign;
  if (!campaign || (game.ending.phase !== "finale" && game.ending.phase !== "major-event")) return game;
  const key = kind === "member" ? "assignedMemberId" : kind === "faction" ? "assignedFactionId" : "assignedFacilityId";
  const crises = campaign.crises.map((item) => {
    const cleared = id && item.id !== crisisId && item[key] === id ? { ...item, [key]: undefined } : item;
    return item.id === crisisId ? { ...cleared, [key]: id || undefined } : cleared;
  });
  return { ...game, ending: { ...game.ending, campaign: { ...campaign, crises } } };
}

function memberPower(game: GameState, item: FinaleCrisis, memberId = item.assignedMemberId) {
  if (memberId === "player") return 24 + (9 - game.currentSequence) * 7 + Math.floor(game.playerCondition.health / 10) - Math.floor(game.playerCondition.pollution / 8);
  const member = game.members.find((entry) => entry.id === memberId);
  if (!member) return 0;
  const text = `${member.specialty}${member.role}`;
  const patterns: Record<string, RegExp> = { protect: /急救|撤离|保护|尸检/, social: /关系|审讯|联络|礼仪|人事/, track: /跟踪|追踪|船运|路线/, document: /账目|档案|语言|记录/, build: /工程|机械|管理/, covert: /身份|侍女|隐蔽|伪装/, access: /撤离|船运|路线/, occult: /灵体|仪式|神秘/, force: /格斗|战斗|陷阱/ };
  const fit = item.tags.filter((tag) => patterns[tag]?.test(text)).length;
  return 8 + Math.floor(member.loyalty / 6) + fit * 8 + (member.pathway ? 8 : 0) - Math.floor(member.fatigue / 10);
}

function allyPower(game: GameState, item: FinaleCrisis, factionId = item.assignedFactionId) {
  const faction = game.factions.find((entry) => entry.id === factionId);
  if (!faction || faction.trust < 35) return 0;
  return Math.floor((faction.trust + faction.leverage) / 7) + (item.tags.some((tag) => /official|document|protect/.test(tag)) ? 9 : 3);
}

function facilityPower(game: GameState, item: FinaleCrisis, facilityId = item.assignedFacilityId) {
  const facility = game.facilities.find((entry) => entry.id === facilityId && entry.status === "运转中");
  if (!facility) return 0;
  return facility.level * 4 + (item.tags.some((tag) => `${facility.type}${facility.benefits.join("")}`.includes(tag)) ? 9 : 3);
}

function doctrinePower(doctrine: FinaleDoctrine | undefined, item: FinaleCrisis) {
  if (doctrine === "阻止" && item.tags.some((tag) => /force|occult|build/.test(tag))) return 10;
  if (doctrine === "改变" && item.tags.some((tag) => /access|covert|protect/.test(tag))) return 10;
  if (doctrine === "利用" && item.tags.some((tag) => /occult|document/.test(tag))) return 10;
  if (doctrine === "逃离" && item.tags.some((tag) => /protect|access|covert/.test(tag))) return 10;
  return 2;
}

export function autoDeployFinale(game: GameState) {
  const campaign = game.ending.campaign;
  if (!campaign) return game;
  const members = ["player", ...game.members.filter((item) => item.status !== "阵亡" && !item.injury).map((item) => item.id)];
  const used = new Set<string>();
  const crises = campaign.crises.map((crisis) => {
    const assignedMemberId = members.filter((id) => !used.has(id)).sort((a, b) => memberPower(game, crisis, b) - memberPower(game, crisis, a))[0];
    if (assignedMemberId) used.add(assignedMemberId);
    const assignedFactionId = game.factions.filter((item) => item.trust >= 35).sort((a, b) => allyPower(game, crisis, b.id) - allyPower(game, crisis, a.id))[0]?.id;
    const assignedFacilityId = game.facilities.filter((item) => item.status === "运转中").sort((a, b) => facilityPower(game, crisis, b.id) - facilityPower(game, crisis, a.id))[0]?.id;
    return { ...crisis, assignedMemberId, assignedFactionId, assignedFacilityId };
  });
  return { ...game, ending: { ...game.ending, campaign: { ...campaign, crises } } };
}

function aftermathLedger(game: GameState, campaign: FinaleCampaign) {
  const living = game.members.filter((item) => item.status !== "阵亡");
  const allies = game.factions.filter((item) => item.trust >= 35);
  const damaged = game.facilities.filter((item) => item.status === "受损");
  return {
    organization: [`组织稳定度${game.stability}，隐秘度${game.secrecy}，仍持有£${game.money}。`, damaged.length ? `${damaged.map((item) => item.name).join("、")}在终局中受损。` : "核心设施没有被规则判定为毁坏。"],
    members: [`${living.length}/${game.members.length}名核心成员存活。`, ...game.members.filter((item) => item.injury).map((item) => `${item.name}：${item.injury}`)],
    city: [`已记录撤离${campaign.rescued}人，死亡${campaign.casualties}人。`, `敌方计划残余进度${campaign.enemyProgress}%，被公开的真相强度${campaign.exposedTruth}。`],
    factions: allies.length ? allies.map((item) => `${item.name}以信任${item.trust}进入余波。`) : ["没有外部势力以稳定盟友身份进入余波。"],
    history: [`历史偏转${game.deviation.toFixed(1)}%，终局势头${campaign.momentum}。`, ...game.pivots.slice(-3).map((item) => `${item.title}：${item.effects.join("；")}`)],
  };
}

function completeCampaign(game: GameState, campaign: FinaleCampaign) {
  const doctrine = campaign.doctrine!;
  const score = campaign.momentum + campaign.exposedTruth - campaign.enemyProgress - Math.floor(campaign.casualties / 300) + game.pivots.reduce((sum, item) => sum + item.magnitude, 0);
  const tier = score >= 70 ? "决定性偏转" : score >= 15 ? "代价沉重的偏转" : "未能压倒世界惯性";
  const aftermath = aftermathLedger(game, campaign);
  const aliveMembers = game.members.filter((item) => item.status !== "阵亡");
  return {
    ...game,
    deviation: clamp(game.deviation + (score >= 70 ? 22 : score >= 15 ? 12 : 5)),
    ending: {
      phase: "running" as const,
      route: doctrine,
      title: `大雾霾阶段结算 · ${tier}`,
      campaign: undefined,
      epilogue: [...aftermath.organization, ...aftermath.city],
      grades: {
        organization: game.stability >= 45 ? "存续并进入余波治理" : "在余波中面临分裂，但世界仍继续",
        members: `${aliveMembers.length}/${game.members.length}名核心成员存活`,
        advancement: `序列${game.currentSequence}·${PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)?.name}`,
        relations: game.factions.filter((item) => item.trust >= 35).length >= 2 ? "形成战后合作网" : "仍然孤立",
        history: tier,
      },
      sandboxUnlocked: false,
    },
    facts: [...game.facts, { id: `major-event-smog-${game.week}`, subject: "贝克兰德大雾霾", statement: `${tier}；组织选择${doctrine}，世界在余波中继续推演。`, certainty: "确认" as const, source: "重大阶段事件规则账本", week: game.week }],
    timeline: game.timeline.map((event) => event.id === "tl-great-smog" ? { ...event, status: score >= 70 ? "diverted" as const : "resolved" as const, summary: `重大阶段事件已结算：${tier}；这不是世界终局。` } : event),
  };
}

export function resolveFinalePhase(game: GameState) {
  const campaign = game.ending.campaign;
  if (!campaign || !campaign.doctrine || campaign.crises.some((item) => !item.assignedMemberId)) return game;
  let momentum = campaign.momentum;
  let enemyProgress = campaign.enemyProgress;
  let rescued = campaign.rescued;
  let casualties = campaign.casualties;
  let exposedTruth = campaign.exposedTruth;
  let members = game.members.map((item) => ({ ...item }));
  let facilities = game.facilities.map((item) => ({ ...item }));
  let fatalSituation = game.fatalSituation;
  const results: FinaleReport["results"] = [];

  const crises = campaign.crises.map((item) => {
    const evidencePower = item.evidenceIds.filter((id) => game.evidenceNodes.some((entry) => entry.id === id && entry.discovered && !entry.compromised)).length * 11;
    const preparation = memberPower(game, item) + allyPower(game, item) + facilityPower(game, item) + doctrinePower(campaign.doctrine, item) + evidencePower;
    const difficulty = item.risk === "致命" ? 68 : 54;
    const roll = hash(`${game.week}:${campaign.stage}:${item.id}:${item.assignedMemberId}`) % 24;
    const total = preparation + roll - difficulty;
    const outcome: FinaleCrisis["outcome"] = total >= 30 ? "成功" : total >= 8 ? "部分成功" : "失败";
    const district = DISTRICTS.find((entry) => entry.id === item.districtId)?.name ?? item.districtId;
    const executor = item.assignedMemberId === "player" ? game.playerAddress : game.members.find((entry) => entry.id === item.assignedMemberId)?.name ?? "未记录执行者";
    const detail = `${executor}在${district}处理此危机。规则准备值${preparation}，环境难度${difficulty}，世界检定${roll}；结果为${outcome}。涉及的来源、伤亡和资源变化已锁定，文学模型只能据此叙述。`;
    results.push({ crisisId: item.id, title: item.title, outcome: outcome!, detail });
    if (outcome === "成功") { momentum += 16; enemyProgress = clamp(enemyProgress - 12); if (item.tags.includes("protect")) rescued += 900 + roll * 30; if (item.tags.includes("document") || item.tags.includes("reveal")) exposedTruth += 11; }
    else if (outcome === "部分成功") { momentum += 5; enemyProgress = clamp(enemyProgress - 3); casualties += item.tags.includes("protect") ? 220 : 70; if (item.tags.includes("protect")) rescued += 380; if (item.tags.includes("document")) exposedTruth += 4; }
    else { enemyProgress = clamp(enemyProgress + 9); casualties += item.tags.includes("protect") ? 760 : 180; }
    if (item.assignedMemberId === "player" && item.risk === "致命" && outcome !== "成功") fatalSituation = { id: `fatal-finale-${campaign.stage}-${item.id}`, actionId: `finale-${item.id}`, title: `${district}的撤离窗口正在关闭`, threat: item.threat, knownThreats: [item.scene, item.consequence, `本阶段检定结果：${outcome}`], stage: "decision", odds: { retreat: clamp(70 + Math.floor(game.secrecy / 10)), help: clamp(50 + Math.floor(allyPower(game, item) / 2)), continue: clamp(25 + (9 - game.currentSequence) * 6) } };
    if (item.assignedMemberId && item.assignedMemberId !== "player" && item.risk === "致命" && outcome !== "成功") members = members.map((member) => member.id === item.assignedMemberId ? { ...member, injury: outcome === "失败" && hash(`${item.id}:death`) % 100 < 14 ? "阵亡" : "严重灵性创伤", status: outcome === "失败" && hash(`${item.id}:death`) % 100 < 14 ? "阵亡" : "受伤休养", fatigue: 100 } : member);
    if (item.assignedFacilityId && outcome === "失败" && hash(`${item.id}:facility`) % 100 < 38) facilities = facilities.map((entry) => entry.id === item.assignedFacilityId ? { ...entry, status: "受损" as const, risk: `在${item.title}中暴露或损坏，需要余波修复。` } : entry);
    return { ...item, outcome };
  });

  const report: FinaleReport = { stage: campaign.stage, title: campaign.stageTitle, summary: `${results.filter((item) => item.outcome === "成功").length}项成功，${results.filter((item) => item.outcome === "部分成功").length}项部分成功，${results.filter((item) => item.outcome === "失败").length}项失败。`, paragraphs: results.map((item) => item.detail), results };
  const chapter: ChronicleChapter = { id: `finale-chapter-${campaign.stage}-${Date.now()}`, week: game.week, date: game.date, title: `重大事件 · ${campaign.stageTitle}`, source: "local", sections: [], results: finaleActionResults(game, campaign, crises, report), summary: report.summary };
  const resolvedFrontIds = [...new Set([...(campaign.resolvedFrontIds ?? []), ...crises.filter((item) => item.outcome === "成功").map((item) => item.id)])];
  const updatedCampaign: FinaleCampaign = { ...campaign, crises, reports: [report, ...campaign.reports], momentum, enemyProgress, rescued, casualties, exposedTruth, resolvedFrontIds };
  const facts: WorldFact[] = [...game.facts, { id: `finale-fact-${campaign.stage}-${Date.now()}`, subject: `大雾霾第${campaign.stage}阶段`, statement: report.summary, certainty: "确认", source: "重大阶段事件规则账本", week: game.week }];
  const updated = { ...game, members, facilities, fatalSituation, chronicle: [chapter, ...game.chronicle], facts, ending: { ...game.ending, campaign: updatedCampaign } };
  const shouldEnd = enemyProgress <= 18 || momentum >= 78 || campaign.stage >= 6 || (campaign.stage >= (campaign.totalStages ?? 3) && crisisCandidates(updated).filter((item) => !resolvedFrontIds.includes(item.id)).length < 2);
  if (shouldEnd) return completeCampaign(updated, updatedCampaign);
  const nextStage = campaign.stage + 1;
  const nextWeek = game.week + 1;
  const nextCampaign: FinaleCampaign = { ...updatedCampaign, stage: nextStage, totalStages: Math.max(campaign.totalStages ?? 3, nextStage), stageTitle: stageHeading(updated, nextStage), stageBrief: "这一阶段只继承已经结算的事实。新的危机来自仍在运行的世界项目、区域压力与上阶段余波。", crises: [] };
  nextCampaign.crises = buildStageCrises(updated, nextCampaign);
  return { ...updated, week: nextWeek, date: finaleDate(nextWeek), ending: { ...updated.ending, campaign: nextCampaign } };
}
