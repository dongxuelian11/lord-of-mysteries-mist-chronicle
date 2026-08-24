import { callModel, type AiConfig } from "../ai-client";
import type { GameState } from "../game-model";
import type { LegacyLoreRecord } from "../rag";
import { retrieveLoreContextAsync } from "../rag/client";
import {
  actorAudience,
  markMemoryPresented,
  memoryPromptBlockWithIds,
  submitMemoryDelivery,
} from "../memory/index";
import { projectWorldForAudience } from "../world-kernel";
import { extractJson } from "../model-output.ts";

type LoreRecord = LegacyLoreRecord;

export function knownLoreIds(game: GameState, holderId: string) {
  const holderRef = holderId === "player" ? "player" : "actor:" + holderId;
  return [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes(holderId) || node.holderRefs?.includes(holderRef)).flatMap((node) => node.loreRecordIds ?? []))];
}

export function knowledgeHorizon(game: GameState, wider = false) {
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
    worldlineMode: canon?.mode === "diverging" ? ("canon-diverged" as const) : ("canon-aligned" as const),
  };
}

async function loreForActor(records: LoreRecord[], game: GameState, member: GameState["members"][number], query: string, maxChars = 5_000) {
  const specialty = [member.role, member.specialty, member.background ?? ""].join(" ");
  const topicGrants = [
    ...(member.pathway ? ["pathways", "beyonder-system"] : []),
    ...(/神秘|仪式|封印|灵界|梦境|非凡/.test(specialty) ? ["rituals", "spirit-world", "sealed-artifacts"] : []),
    ...(/情报|调查|警|外交|教会/.test(specialty) ? ["factions"] : []),
  ];
  return retrieveLoreContextAsync(records, {
    query,
    audience: { kind: "actor-private", principalRef: `actor:${member.id}`, purpose: "actor-dialogue", knownLoreIds: knownLoreIds(game, member.id), topicGrants },
    limit: 12,
    maxChars,
    week: game.week,
    gameDate: game.date,
    horizon: knowledgeHorizon(game, false),
  });
}

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

export async function generateNpcDialogue(config: AiConfig, game: GameState, memberId: string, playerText: string, context: "council" | "private" = "council"): Promise<NpcDialogueResult> {
  const member = game.members.find((item) => item.id === memberId);
  if (!member) throw new Error("没有找到这名成员");
  const governanceOffice = game.management.offices.find((office) => office.incumbentId === memberId || office.actingMemberId === memberId);
  const { LORE_RECORDS } = await import("../generated-lore-compendium");
  const lore = await loreForActor(LORE_RECORDS, game, member, playerText + " " + member.role + " " + member.specialty + " " + game.date);
  const thread = game.dialogueThreads.find((item) => item.memberId === memberId);
  const currentPressure = game.missions.find((item) => item.state === "active");
  const dialogueMemoryView = memoryPromptBlockWithIds(game.memory, "dialogue", memberId, game.week);
  const memberWorldView = game.worldKernel
    ? projectWorldForAudience(game.worldKernel, { kind: "actor", holderId: memberId })
    : null;
  const system = [
    "你正在扮演原创人物" + member.name + "，参加维多利亚神秘组织的" + (context === "council" ? "每周密议" : "私下谈话") + "。组织领导人是" + (game.playerName || "尚未登记姓名的负责人") + "，正式场合应自然地称其为“" + (game.playerAddress || "会长阁下") + "”，但不要每一段都重复称呼。你不是菜单、助手或任务发布器，而是一个有局限、有利益、有情绪、有当下注意力的人。",
    "固定背景：" + (member.background ?? "未登记"),
    "性格核心：" + (member.core ?? "谨慎"),
    "说话习惯：" + (member.voice ?? "自然交谈"),
    "当前成长矛盾：" + (member.arc ?? "仍在观察组织"),
    "隐藏事实（只用于潜台词，除非现有关系与游戏证据足以支持，绝对不得直接泄露）：" + (member.secret ?? "无"),
    "关系：信任" + (member.trust ?? member.loyalty) + "（越高越直率，越低越试探）、利益" + member.interest + "、理念" + member.ideology + "、疲劳" + member.fatigue + "、关系阶段" + (member.relationshipStage ?? "正式成员") + "。关系阶段与信任直接决定称呼、亲疏和话里藏话的程度：信任低时多保留、试探、谈条件；信任高时可以直说、提异议、甚至开简短玩笑。当前个人事件：" + (member.personalEvent ?? "无") + "（状态：" + (member.personalEventState ?? "dormant") + "）。你尊重组织层级：可以保留意见、请求澄清、陈述风险、婉拒违背原则的命令，但必须保持克制而正式，不得无礼顶撞、讥讽、贬低或反过来命令负责人；只有进入明确背叛或敌对状态后才可破例。只能使用人物可能知道的事实，不能读取原著幕后真相，不能替规则宣布行动成功、资源变化或人物死亡。",
    "严格避免模板腔：禁止“请您示下”“由您拍板”“一切听从安排”“我建议您三思”这类收尾套话；禁止“关于这件事/依我看/总的来说”这类标签式开场；禁止每条回复都以称呼开头；禁止用“首先/其次/最后”或“我分几点讲”组织回答；禁止机械复述玩家原话。信息来源要自然地藏在动作、回忆、引语和措辞中；若问题很简单，一句话即可。只返回严格JSON。",
  ].join("\n");
  const payload = {
    week: game.week,
    playerSaid: playerText,
    recentConversation: thread?.messages.slice(-12).map((item) => ({ role: item.role, text: item.text, context: item.context })) ?? [],
    lastingMemories: thread?.memories.slice(-6) ?? [],
    currentPressure: currentPressure ? { title: currentPressure.title, premise: currentPressure.premise, consequence: currentPressure.consequence } : null,
    lastWeek: game.chronicle[0] ? { results: game.chronicle[0].results
      .filter((item) => item.contract.leaderId === member.id || item.contract.memberIds.includes(member.id))
      .map((item) => ({ title: item.title, outcome: item.outcome, findings: item.findings })) } : null,
    authorizedWorldView: memberWorldView ? {
      events: memberWorldView.events.slice(-8),
      observations: memberWorldView.observations.slice(-12),
      knowledge: memberWorldView.knowledge.slice(-12),
    } : null,
    recentSignals: game.worldSignals?.slice(0, 8) ?? [],
    authorizedLore: lore.context || null,
    loreRecordIds: lore.records.map((item) => item.id),
    dynamicMemory: dialogueMemoryView.text,
    scheduledOrders: game.schedule
      .filter((item) => item.leaderId === member.id || item.memberIds.includes(member.id))
      .map((item) => ({ title: item.title, leaderId: item.leaderId, risk: item.risk })),
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
  const instruction = [
    "像真实人物一样回应此刻这一句话。长度完全服从内容：可以20字，也可以在复杂问题中达到500字；不要为满足格式凭空扩写。普通谈话不要生成任务或提案卡。如果近期有该成员职责范围内的新信号、记忆、个人事件或上周结果，尽量自然引用其中一条具体内容，避免空泛表态；没有就不硬凑。只有当此人确实担任内务负责人、玩家明确要求筛选或提交可提拔的基层人选、且本周尚未筛选时，才返回managementAction；人力取3到5，经费至少20且不得超过现有资金，投入越高档案越充分。其他情况必须为null。返回：{\"reply\":\"自然动作与口语组成的回应，不包含分类标签\",\"mood\":\"不超过8字的当前状态\",\"memory\":\"真正值得以后记住的关系事实或null\",\"trustDelta\":-2到2,\"managementAction\":null或{\"kind\":\"screen-candidates\",\"manpower\":3到5,\"moneyCost\":20以上}}。",
    JSON.stringify(payload),
  ].join("\n");
  const raw = extractJson(await callModel(config, system, instruction, { task: "npc-dialogue", json: true, maxTokens: 1900, temperature: .96 }));
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
    actionId: "dialogue:" + memberId + ":" + game.week,
    modelCallId: "dialogue:" + memberId + ":" + game.week + ":" + playerText.slice(0, 40),
    stage: "dialogue",
    audience: actorAudience(memberId, true),
    memoryIds: dialogueMemoryView.ids,
    week: game.week,
  });
  game.memory = markMemoryPresented(game.memory, {
    actionId: "dialogue:" + memberId + ":" + game.week,
    modelCallId: "dialogue:" + memberId + ":" + game.week + ":" + playerText.slice(0, 40),
    stage: "dialogue",
    audience: actorAudience(memberId, true),
    memoryIds: dialogueMemoryView.ids,
    week: game.week,
  });
  return { reply, mood, memory, trustDelta, proposal: null, managementAction };
}
