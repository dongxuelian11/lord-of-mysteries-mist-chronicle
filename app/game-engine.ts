import {
  ActionContract,
  DISTRICTS,
  GameState,
  materialsFor,
  PATHWAYS,
  WorldFact,
} from "./game-model";
import { stableTextHash } from "./stable-id.ts";
import { callModel as invokeModel, type AiConfig } from "./ai-client";
import { type LegacyLoreRecord } from "./rag";
import { retrieveLoreContextAsync } from "./rag/client";
import {
  memoryPromptBlockWithIds,
  submitMemoryDelivery,
  narratorAudience,
} from "./memory/index";
export type LoreRecord = LegacyLoreRecord;
import { advanceAdvancementStage, createAdvancementProcess } from "./progression-system";
import { participationSceneModelView, type ParticipationScene } from "./participation-scene.ts";
import { highSequenceAdvancementRequirement, incorporateAdvancementAsset } from "./high-sequence-ledger.ts";
import { advanceCampaignWorld } from "./campaign-world.ts";
import { extractJson } from "./model-output.ts";
import { advancementRetrospective } from "./chronicle-causality.ts";
import { hash } from "./game-engine/week-resolution.ts";
import { knowledgeHorizon, knownLoreIds } from "./game-engine/dialogue-orchestration.ts";
export type { AiConfig } from "./ai-client";
export { actionTextBoundaryIssue } from "./action-boundaries.ts";
export { interpretIntentWithAi, localContract } from "./game-engine/action-contracts.ts";
export { resolveWeek, actionDomain, availableAbilities } from "./game-engine/week-resolution.ts";
export { generateAiWorldDelta } from "./game-engine/world-turn-orchestrator.ts";
export { generateNpcDialogue } from "./game-engine/dialogue-orchestration.ts";
export type { NpcDialogueResult } from "./game-engine/dialogue-orchestration.ts";
export const callModel = invokeModel;

export async function generateParticipationSceneBeat(config: AiConfig, game: GameState, scene: ParticipationScene, intent: string) {
  const finalBeat = scene.phase === "crisis";
  const visibleResolution = finalBeat ? scene.lockedResolution : undefined;
  const response = await callModel(config,
    "你是《灰雾纪事》的玩家亲历场景叙事器。规则引擎已经在后台锁定事实，你只能把玩家刚输入的自由行动转成连续、具体、有限视角的小说现场。不得替玩家补充未输入的关键决定，不得提前泄露后台结算；只有收到visibleResolution时才能在当前段落末尾写出行动结果。必须遵守红线与撤退条件。不要输出列表、数值、系统提示或JSON。模型失败必须直接报错，禁止降级文本。",
    `场景：${JSON.stringify(participationSceneModelView(scene))}\n玩家行动：${intent}\n${visibleResolution ? `本段结束时必须忠实呈现已锁定结果：${JSON.stringify(visibleResolution)}` : "本段只推进现场并留下新的可操作局面，不宣布最终成败。"}\n用140至320字写当前一段。`,
    { task: "participation-scene", maxTokens: 1100, temperature: scene.mode === "combat" ? .82 : .74 },
  );
  if (!response.trim()) throw new Error("亲历场景模型没有返回正文");
  return response.trim().slice(0, 1800);
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
  return stableTextHash(JSON.stringify({
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
  }));
}

function nextActionOrdinal(game: GameState) {
  return game.schedule.reduce((maximum, action, index) => Math.max(maximum, action.actionOrdinal ?? index + 1), 0) + 1;
}

function authoritativeActionId(game: GameState, contract: ActionContract, ordinal: number) {
  return `action:${game.week}:${ordinal}:${actionIdentityHash(contract)}`;
}

async function loreForPlayer(records: LoreRecord[], game: GameState, query: string, maxChars = 5_000) {
  return retrieveLoreContextAsync(records, {
    query,
    audience: { kind: "player-facing-narrator", principalRef: "player", purpose: "player-narrator", knownLoreIds: knownLoreIds(game, "player"), topicGrants: [] },
    limit: 12,
    maxChars,
    week: game.week,
    gameDate: game.date,
    horizon: knowledgeHorizon(game, false),
  });
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


export { generateLiteraryChapter } from "./literary-generation-service.ts";
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
  const raw = extractJson(await callModel(config, "你为原创维多利亚神秘主义互动小说《灰雾纪事》写玩家进入存档时看到的当前现状。它必须像小说真正开始的一页，不是教程、任务清单、系统摘要或模板化周报。使用有限视角、具体物件、声音、天气、人物动作与消息来源，让玩家理解此刻身在何处、世界刚发生了什么、什么压力正在逼近以及自己可以自由行动。不要替玩家决定情绪或选择，不泄露角色未知的幕后真相，不复制任何现成小说句子。只返回JSON。", `写一个标题、日期行和3至6个自然段。段落可以长短不一，不要使用“当前状况/你的目标/建议行动”之类标签。返回{"title":"小说式标题","dateline":"日期与地点","paragraphs":["完整段落"]}。\n${JSON.stringify(payload)}`, { task: "situation-brief", json: true, maxTokens: 3200, temperature: .92 }));
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
