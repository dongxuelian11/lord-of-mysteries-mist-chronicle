import { ChronicleChapter, DISTRICTS, FinaleCampaign, FinaleCrisis, FinaleDoctrine, FinaleReport, GameState, PATHWAYS, WorldFact } from "./game-model";

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

const STAGES = [
  { title: "名单与暗流", brief: "雾还没有落下。最后一批证人、工程记录和仪式货物正在被同时转移。你不可能亲自出现在每个地方。" },
  { title: "城市开始收口", brief: "警察封街，王室承包人更换身份，魔女教派清理中间人。每一项部署都会暴露组织的立场。" },
  { title: "灰雾降临", brief: "煤气混入雾中，东区最先失去方向。救援、破坏与对抗在同一小时发生。" },
  { title: "核心仪式之夜", brief: "所有被保留下来的证据、盟友和成员关系在这里兑现。历史不会再回到原来的轨道。" },
] as const;

function crisis(id: string, stage: 1 | 2 | 3 | 4, districtId: string, title: string, scene: string, threat: string, risk: "高" | "致命", tags: string[], evidenceIds: string[], consequence: string): FinaleCrisis {
  return { id, stage, districtId, title, scene, threat, risk, tags, evidenceIds, consequence };
}

function crisesFor(stage: 1 | 2 | 3 | 4): FinaleCrisis[] {
  if (stage === 1) return [
    crisis("f1-witness", 1, "east", "带出最后一批证人", "玛拉确认，三名临时工知道地下层真正用途，却将在午夜前被转移。", "敌方清理人员与警察封锁同时逼近。", "高", ["protect", "social", "track"], ["ev-worker-list", "ev-victim-register"], "证人消失后，人口链只能依赖容易被篡改的纸面记录。"),
    crisis("f1-blueprint", 1, "south", "保住管网原图", "煤气公司正在销毁最后一套带压力标记的原始蓝图。", "机械之心、王室承包人和组织都可能在同一处档案库相遇。", "高", ["document", "build", "covert"], ["ev-gas-map", "ev-engineer-order"], "失去原图会让终局破坏只能依赖推断。"),
    crisis("f1-cargo", 1, "dock", "截断密封货物", "沉船重新入港，密封箱将在涨潮前离开码头。", "箱内污染未知，护送者拥有反占卜与水路撤离。", "高", ["track", "access", "occult"], ["ev-returned-ship", "ev-sealed-cargo"], "仪式会得到完整的材料冗余。"),
  ];
  if (stage === 2) return [
    crisis("f2-evacuate", 2, "east", "转移不可见人口", "工棚名册上的人被集中到三条封闭街道，官方疏散通知刻意绕开这里。", "公开行动会引起王室警觉，秘密行动则无法覆盖所有人。", "高", ["protect", "social", "official"], ["ev-population", "ev-victim-register"], "受害者会留在雾霾最先覆盖的区域。"),
    crisis("f2-valves", 2, "south", "控制调压阀组", "三座调压站可以切断东区管线，但需要在十分钟内同步操作。", "错误顺序会造成爆炸，并提前触发敌方计划。", "致命", ["build", "access", "force"], ["ev-gas-map", "ev-valve"], "煤气释放无法从物理层面减弱。"),
    crisis("f2-banquet", 2, "empress", "撕开上流掩护", "封闭晚宴的最后一名仆役愿意交出名单，但要求先保护家人。", "魔女教派正在用灾祸象征定位泄密者。", "高", ["social", "covert", "document"], ["ev-mirror-guest", "ev-banquet-list"], "魔女教派仍能借贵族身份自由调动资源。"),
  ];
  if (stage === 3) return [
    crisis("f3-rescue", 3, "east", "在雾中维持救援走廊", "东区钟声停下后，人群开始沿错误方向涌向煤气更浓的街道。", "污染、踩踏和敌方阻断同时发生。", "致命", ["protect", "social", "access"], ["ev-victim-register", "ev-population"], "平民伤亡会在一个小时内失去控制。"),
    crisis("f3-shutdown", 3, "south", "关闭煤气主管线", "备用阀组已经启动，只有进入地下总控室才能彻底停机。", "总控室存在仪式守卫与爆炸风险。", "致命", ["build", "force", "covert"], ["ev-valve", "ev-engineer-order"], "大雾霾将保持原定浓度与覆盖范围。"),
    crisis("f3-witch", 3, "west", "切断灾祸仪式支点", "香水残留指向一处临时仪式室，它正在把疾病与绝望写入雾中。", "直接接触会承受精神污染与诅咒。", "致命", ["occult", "force", "reveal"], ["ev-perfume", "ev-banquet-list"], "即使煤气减少，非凡灾祸仍会继续扩大。"),
  ];
  return [
    crisis("f4-core", 4, "east", "进入核心仪式区域", "地下空间已经成为人口、煤气、灾祸象征与高位力量的交点。", "任何正面介入都可能引来天使层次的回应。", "致命", ["occult", "force", "reality"], ["ev-ritual-site", "ev-population", "ev-perfume"], "核心目标将按残余条件完成。"),
    crisis("f4-proof", 4, "government", "让真相无法再次被抹去", "政府区的证据副本、报社印版与教会档案必须同时送出。", "王室将动用行政权力、伪证和武装人员收回材料。", "高", ["document", "official", "social"], ["ev-engineer-order", "ev-banquet-list", "ev-population"], "即使组织存活，历史也会把灾难重新写成普通雾霾。"),
    crisis("f4-home", 4, "cherwood", "守住组织与撤离名单", "据点收容着伤员、证据和成员家属，也已经被敌方反调查锁定。", "留下会分散终局力量，放弃则可能失去组织的一切。", "高", ["protect", "build", "covert"], ["ev-victim-register"], "组织可能在胜利前夜分裂或覆灭。"),
  ];
}

export function createFinaleCampaign(): FinaleCampaign {
  return { stage: 1, stageTitle: STAGES[0].title, stageBrief: STAGES[0].brief, crises: crisesFor(1), reports: [], momentum: 0, enemyProgress: 72, rescued: 0, casualties: 0, exposedTruth: 0 };
}

export function chooseFinaleDoctrine(game: GameState, doctrine: FinaleDoctrine) {
  if (game.ending.phase !== "finale" || !game.ending.campaign) return game;
  return { ...game, ending: { ...game.ending, route: doctrine, campaign: { ...game.ending.campaign, doctrine } } };
}

export function assignFinaleResource(game: GameState, crisisId: string, kind: "member" | "faction" | "facility", id: string) {
  const campaign = game.ending.campaign;
  if (!campaign || game.ending.phase !== "finale") return game;
  const key = kind === "member" ? "assignedMemberId" : kind === "faction" ? "assignedFactionId" : "assignedFacilityId";
  const crises = campaign.crises.map((item) => {
    const cleared = id && item.id !== crisisId && item[key] === id ? { ...item, [key]: undefined } : item;
    return item.id === crisisId ? { ...cleared, [key]: id || undefined } : cleared;
  });
  return { ...game, ending: { ...game.ending, campaign: { ...campaign, crises } } };
}

export function autoDeployFinale(game: GameState) {
  const campaign = game.ending.campaign;
  if (!campaign) return game;
  const memberIds = ["player", ...game.members.filter((item) => item.status !== "阵亡" && !item.injury).map((item) => item.id)];
  const factionIds = game.factions.filter((item) => item.trust >= 35).map((item) => item.id);
  const facilityIds = game.facilities.filter((item) => item.status === "运转中").map((item) => item.id);
  const usedMembers = new Set<string>();
  const usedFactions = new Set<string>();
  const usedFacilities = new Set<string>();
  const crises = campaign.crises.map((item) => {
    const assignedMemberId = memberIds.filter((id) => !usedMembers.has(id)).sort((a, b) => memberPower(game, { ...item, assignedMemberId: b }) - memberPower(game, { ...item, assignedMemberId: a }))[0];
    const assignedFactionId = factionIds.filter((id) => !usedFactions.has(id)).sort((a, b) => allyPower(game, { ...item, assignedFactionId: b }) - allyPower(game, { ...item, assignedFactionId: a }))[0];
    const assignedFacilityId = facilityIds.filter((id) => !usedFacilities.has(id)).sort((a, b) => facilityPower(game, { ...item, assignedFacilityId: b }) - facilityPower(game, { ...item, assignedFacilityId: a }))[0];
    if (assignedMemberId) usedMembers.add(assignedMemberId);
    if (assignedFactionId) usedFactions.add(assignedFactionId);
    if (assignedFacilityId) usedFacilities.add(assignedFacilityId);
    return { ...item, assignedMemberId, assignedFactionId, assignedFacilityId };
  });
  return { ...game, ending: { ...game.ending, campaign: { ...campaign, crises } } };
}

function memberPower(game: GameState, item: FinaleCrisis) {
  if (item.assignedMemberId === "player") return 24 + (9 - game.currentSequence) * 7 + Math.floor(game.playerCondition.health / 10) - Math.floor(game.playerCondition.pollution / 8);
  const member = game.members.find((entry) => entry.id === item.assignedMemberId);
  if (!member) return 0;
  const text = `${member.specialty}${member.role}`;
  const specialties: Record<string, RegExp> = { protect: /急救|撤离|保护|尸检/, social: /关系|审讯|联络|礼仪/, track: /跟踪|追踪|船运/, document: /账目|档案|语言|记录/, build: /工程|机械|管理/, covert: /身份|侍女|隐蔽|假/, access: /撤离|船运|路线/, occult: /灵体|仪式|神秘/, force: /格斗|战斗|陷阱/ };
  const matches = item.tags.filter((tag) => specialties[tag]?.test(text)).length;
  return 8 + Math.floor(member.loyalty / 6) + matches * 8 + (member.pathway ? 8 : 0) - Math.floor(member.fatigue / 10);
}

function allyPower(game: GameState, item: FinaleCrisis) {
  const faction = game.factions.find((entry) => entry.id === item.assignedFactionId);
  if (!faction || faction.trust < 35) return 0;
  const specialties: Record<string, RegExp> = { "night-church": /occult|protect|reveal/, "steam-church": /build|document|force/, police: /official|protect|social/, press: /document|official|social/, "black-market": /access|covert|track/ };
  const fit = item.tags.some((tag) => specialties[faction.id]?.test(tag)) ? 10 : 3;
  return fit + Math.floor((faction.trust + faction.leverage) / 7);
}

function facilityPower(game: GameState, item: FinaleCrisis) {
  const facility = game.facilities.find((entry) => entry.id === item.assignedFacilityId && entry.status === "运转中");
  if (!facility) return 0;
  const specialties: Record<string, RegExp> = { archive: /document|reveal/, ritual: /occult|reality/, vault: /protect|occult/, meeting: /official|social/, quarters: /protect/, workshop: /build|force/ };
  const fit = item.tags.some((tag) => specialties[facility.id]?.test(tag)) ? 9 : 2;
  return fit + facility.level * 4;
}

function canonPower(game: GameState, item: FinaleCrisis) {
  let power = 0;
  if (game.canonActors.find((actor) => actor.id === "klein")?.location === "贝克兰德" && item.tags.some((tag) => /occult|reveal|covert/.test(tag))) power += 8;
  if (game.canonActors.find((actor) => actor.id === "audrey")?.state.includes("神秘学") && item.tags.some((tag) => /social|protect/.test(tag))) power += 6;
  return power;
}

function canonContributors(game: GameState, item: FinaleCrisis) {
  const names: string[] = [];
  if (game.canonActors.find((actor) => actor.id === "klein")?.location === "贝克兰德" && item.tags.some((tag) => /occult|reveal|covert/.test(tag))) names.push("夏洛克·莫里亚蒂");
  if (game.canonActors.find((actor) => actor.id === "audrey")?.state.includes("神秘学") && item.tags.some((tag) => /social|protect/.test(tag))) names.push("奥黛丽·霍尔");
  return names;
}

function doctrinePower(doctrine: FinaleDoctrine | undefined, item: FinaleCrisis) {
  if (doctrine === "阻止" && item.tags.some((tag) => /force|occult|build/.test(tag))) return 10;
  if (doctrine === "改变" && item.tags.some((tag) => /access|reality|covert/.test(tag))) return 10;
  if (doctrine === "利用" && item.tags.some((tag) => /occult|reality|document/.test(tag))) return 10;
  if (doctrine === "逃离" && item.tags.some((tag) => /protect|access|covert/.test(tag))) return 10;
  return 2;
}

function completeCampaign(game: GameState, campaign: FinaleCampaign) {
  const doctrine = campaign.doctrine!;
  const score = campaign.momentum + Math.floor(campaign.rescued / 400) + campaign.exposedTruth - campaign.enemyProgress - Math.floor(campaign.casualties / 300) + game.pivots.reduce((sum, item) => sum + item.magnitude, 0);
  const tier = score >= 80 ? "decisive" : score >= 25 ? "costly" : "failed";
  const titles: Record<FinaleDoctrine, [string, string, string]> = {
    阻止: ["没有降临的大雾", "被撕开的雾幕", "迟到的警报"], 改变: ["雾向无人之地", "被改写的灾难", "偏转失控"], 利用: ["从灾难中夺火", "带血的晋身阶", "觊觎者的代价"], 逃离: ["带走一座城的名单", "离城列车", "身后的灰雾"],
  };
  const index = tier === "decisive" ? 0 : tier === "costly" ? 1 : 2;
  const aliveMembers = game.members.filter((item) => item.status !== "阵亡");
  const title = titles[doctrine][index];
  return { ...game, ending: { phase: "ended" as const, route: doctrine, title, campaign, epilogue: [`四个阶段的部署最终汇聚成同一个结果：${campaign.rescued}人被带出危险区域，组织记录到${campaign.casualties}名无法挽回的死者。`, tier === "decisive" ? "核心计划失去继续完成的条件，原定历史在所有关键节点上断裂。" : tier === "costly" ? "大雾仍然降临，却不再拥有原定的规模、受害者与政治结果。" : "组织没能压倒更高层的计划，但保存下来的证据和幸存者让真相没有彻底消失。", `原著人物沿自己的目标介入，盟友也只兑现了各自愿意承担的部分；没有任何人因为玩家是主角而停止行动。`], grades: { organization: game.stability >= 45 ? "存续并完成余波重组" : "在余波中分裂", members: `${aliveMembers.length}/${game.members.length}名核心成员幸存`, advancement: `序列${game.currentSequence}·${PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)?.name}`, relations: game.factions.filter((item) => item.trust >= 35).length >= 2 ? "形成战后合作网" : "仍然孤立", history: tier === "decisive" ? "决定性偏转" : tier === "costly" ? "明确偏转" : "带有证人的局部偏转" }, sandboxUnlocked: true }, deviation: Math.min(100, game.deviation + (tier === "decisive" ? 22 : tier === "costly" ? 12 : 5)), timeline: game.timeline.map((event) => event.id === "tl-great-smog" ? { ...event, status: tier === "decisive" ? "diverted" as const : "resolved" as const, summary: `${title}：四阶段终局已经完成。` } : event) };
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
  let factions = game.factions.map((item) => ({ ...item }));
  let canonActors = game.canonActors.map((item) => ({ ...item }));
  const results: FinaleReport["results"] = [];
  let fatalSituation = game.fatalSituation;
  const crises = campaign.crises.map((item) => {
    const evidencePower = item.evidenceIds.filter((id) => game.evidenceNodes.find((entry) => entry.id === id)?.discovered && !game.evidenceNodes.find((entry) => entry.id === id)?.compromised).length * 11;
    const playerLinks = game.evidenceLinks.filter((link) => link.id.startsWith("player-link") && link.discovered).length * 3;
    const preparation = memberPower(game, item) + allyPower(game, item) + facilityPower(game, item) + canonPower(game, item) + doctrinePower(campaign.doctrine, item) + evidencePower + playerLinks;
    const difficulty = item.risk === "致命" ? 68 : 54;
    const roll = hash(`${game.week}:${campaign.stage}:${item.id}:${item.assignedMemberId}`) % 24;
    const total = preparation + roll - difficulty;
    const outcome: FinaleCrisis["outcome"] = total >= 30 ? "成功" : total >= 8 ? "部分成功" : "失败";
    const district = DISTRICTS.find((entry) => entry.id === item.districtId)?.name;
    const executor = item.assignedMemberId === "player" ? "负责人亲自带队" : game.members.find((entry) => entry.id === item.assignedMemberId)?.name ?? "未记录的执行者";
    const ally = game.factions.find((entry) => entry.id === item.assignedFactionId)?.name;
    const facility = game.facilities.find((entry) => entry.id === item.assignedFacilityId)?.name;
    const evidenceNames = item.evidenceIds.filter((id) => game.evidenceNodes.some((entry) => entry.id === id && entry.discovered && !entry.compromised)).map((id) => game.evidenceNodes.find((entry) => entry.id === id)?.title).filter(Boolean);
    const canonNames = canonContributors(game, item);
    const preparationText = [`由${executor}执行`, ally ? `${ally}兑现支援` : "没有外部势力承诺支援", facility ? `调用${facility}` : "不调用据点设施", evidenceNames.length ? `现场依据为${evidenceNames.join("、")}` : "此前没有取得与本项直接对应的证据"].join("；");
    const independentText = canonNames.length ? `与此同时，${canonNames.join("与")}出于自己的目标采取了独立行动，间接改变了现场压力。` : "没有可确认的原著人物介入；城市的其他行动者仍在视野之外。";
    const detail = outcome === "成功" ? `${preparationText}。${district}的主要目标得到保全，撤离线在敌方合围前关闭。${independentText}` : outcome === "部分成功" ? `${preparationText}。${district}只保住了一部分目标，组织留下伤员或让敌方带走了仍能利用的资源。${independentText}` : `${preparationText}。部署被压倒：${item.consequence}${independentText}`;
    results.push({ crisisId: item.id, title: item.title, outcome, detail });
    if (outcome === "成功") { momentum += 16; enemyProgress = Math.max(0, enemyProgress - 11); if (item.tags.includes("protect")) rescued += 1800 + roll * 35; if (item.tags.includes("document")) exposedTruth += 12; }
    else if (outcome === "部分成功") { momentum += 5; enemyProgress = Math.max(0, enemyProgress - 3); casualties += item.tags.includes("protect") ? 280 : 80; if (item.tags.includes("protect")) rescued += 620; if (item.tags.includes("document")) exposedTruth += 5; }
    else { enemyProgress = Math.min(100, enemyProgress + 9); casualties += item.tags.includes("protect") ? 950 : 210; }
    if (item.assignedMemberId === "player" && item.risk === "致命" && outcome !== "成功") fatalSituation = { id: `fatal-finale-${campaign.stage}-${item.id}`, actionId: `finale-${item.id}`, title: `${district}的撤离窗口正在闭合`, threat: item.threat, knownThreats: [item.scene, item.consequence, `阶段检定结果：${outcome}`], stage: "decision", odds: { retreat: 78 + Math.floor(game.secrecy / 10), help: 55 + Math.floor(allyPower(game, item) / 2), continue: 28 + (9 - game.currentSequence) * 6 } };
    if (item.assignedMemberId && item.assignedMemberId !== "player" && item.risk === "致命" && outcome !== "成功") members = members.map((member) => member.id === item.assignedMemberId ? { ...member, injury: outcome === "失败" && hash(`${item.id}:death`) % 100 < 18 ? "阵亡" : "严重灵性创伤", status: outcome === "失败" && hash(`${item.id}:death`) % 100 < 18 ? "阵亡" : "受伤休养", fatigue: 100 } : member);
    if (item.assignedFacilityId && outcome === "失败" && hash(`${item.id}:facility`) % 100 < 42) facilities = facilities.map((entry) => entry.id === item.assignedFacilityId ? { ...entry, status: "受损" as const, risk: `在“${item.title}”中暴露或损坏，需要战后修复。` } : entry);
    if (item.assignedFactionId) factions = factions.map((entry) => entry.id === item.assignedFactionId ? { ...entry, leverage: Math.max(0, entry.leverage - 3), suspicion: Math.min(100, entry.suspicion + (outcome === "失败" ? 5 : 2)), lastMove: `${entry.name}在“${item.title}”中${outcome === "成功" ? "兑现了有限支援" : outcome === "部分成功" ? "只完成了部分承诺" : "撤回了剩余人员"}。` } : entry);
    for (const canonName of canonNames) canonActors = canonActors.map((actor) => actor.name.includes(canonName.split("·")[0]) || actor.publicIdentity.includes(canonName) ? { ...actor, awareness: actor.awareness === "未知" ? "间接听闻" as const : actor.awareness, lastMove: `在${district}附近沿自己的目标行动；他只看见了组织部署造成的局部结果。` } : actor);
    return { ...item, outcome };
  });
  const paragraphs = results.map((result) => `${result.title}：${result.detail} 结算为“${result.outcome}”，它已经改变下一阶段可承受的压力。`);
  const report: FinaleReport = { stage: campaign.stage, title: STAGES[campaign.stage - 1].title, summary: `${results.filter((item) => item.outcome === "成功").length}项成功，${results.filter((item) => item.outcome === "部分成功").length}项部分成功，${results.filter((item) => item.outcome === "失败").length}项失败。`, paragraphs, results };
  const chapter: ChronicleChapter = { id: `finale-chapter-${campaign.stage}-${Date.now()}`, week: game.week, date: game.date, title: `大雾霾终局 · ${report.title}`, source: "local", sections: [{ heading: STAGES[campaign.stage - 1].title, paragraphs: [STAGES[campaign.stage - 1].brief, ...paragraphs] }, { heading: "城市没有等待命令", paragraphs: [`敌方计划剩余压力${enemyProgress}，组织终局势头${momentum}。目前已有${rescued}人离开危险区，${casualties}人的死亡被写入不可删除的名单。`] }], results: [], summary: report.summary };
  const updatedCampaign: FinaleCampaign = { ...campaign, crises, reports: [report, ...campaign.reports], momentum, enemyProgress, rescued, casualties, exposedTruth };
  const facts: WorldFact[] = [...game.facts, { id: `finale-fact-${campaign.stage}`, subject: `大雾霾终局第${campaign.stage}阶段`, statement: report.summary, certainty: "确认", source: "终局作战记录", week: game.week }];
  const nextWeek = campaign.stage < 4 ? Math.min(24, game.week + 1) : game.week;
  const timeline = game.timeline.map((event) => {
    if (event.id === "tl-smog-eve" && campaign.stage >= 1 && campaign.stage < 3) return { ...event, status: "active" as const, revealed: true, summary: `${report.title}：组织与敌对势力正在争夺大雾降临前的最后条件。` };
    if (event.id === "tl-smog-eve" && campaign.stage >= 3) return { ...event, status: "resolved" as const, revealed: true };
    if (event.id === "tl-great-smog" && campaign.stage >= 3) return { ...event, status: "active" as const, revealed: true, summary: `${report.title}：大雾霾已经进入现实，所有部署开始以伤亡和历史偏转结算。` };
    return event;
  });
  const updated = { ...game, week: nextWeek, date: finaleDate(nextWeek), timeline, members, facilities, factions, canonActors, fatalSituation, chronicle: [chapter, ...game.chronicle], facts, ending: { ...game.ending, campaign: updatedCampaign } };
  if (campaign.stage === 4) return completeCampaign(updated, updatedCampaign);
  const nextStage = (campaign.stage + 1) as 2 | 3 | 4;
  return { ...updated, ending: { ...updated.ending, campaign: { ...updatedCampaign, stage: nextStage, stageTitle: STAGES[nextStage - 1].title, stageBrief: STAGES[nextStage - 1].brief, crises: crisesFor(nextStage) } } };
}
