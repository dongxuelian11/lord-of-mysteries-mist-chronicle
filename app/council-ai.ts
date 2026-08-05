import { AiConfig, callModel } from "./ai-client";
import { relevantCouncilMembers } from "./council-system";
import { CouncilTopic, CouncilTopicMessage, GameState } from "./game-model";
import { retrieveLoreContext } from "./lore-knowledge";

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("议事记录没有形成可用结构");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

export async function generateCouncilReplies(config: AiConfig, game: GameState, topicText: string): Promise<CouncilTopicMessage[]> {
  const { LORE_RECORDS } = await import("./generated-lore-compendium");
  const members = relevantCouncilMembers(game, topicText, 3);
  const speakerLore = Object.fromEntries(members.map((member) => {
    const knownLoreIds = [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes(member.id)).flatMap((node) => node.loreRecordIds ?? []))];
    const specialty = `${member.role} ${member.specialty} ${member.background ?? ""}`;
    const topicGrants = [...(member.pathway ? ["pathways", "beyonder-system"] : []), ...(/神秘|仪式|封印|灵界|梦境|非凡/.test(specialty) ? ["rituals", "spirit-world", "sealed-artifacts"] : []), ...(/情报|调查|警|外交|教会/.test(specialty) ? ["factions"] : [])];
    return [member.id, retrieveLoreContext(LORE_RECORDS, { query: `${topicText} ${specialty}`, audience: { kind: "actor", knownLoreIds, topicGrants }, limit: 8, maxChars: 3200 }).context];
  }));
  const payload = {
    leader: { name: game.playerName, address: game.playerAddress },
    topic: topicText,
    speakers: members.map((member) => ({ id: member.id, name: member.name, role: member.role, specialty: member.specialty, background: member.background, core: member.core, voice: member.voice, trust: member.trust ?? member.loyalty })),
    knownFacts: game.facts.slice(-18),
    currentWorld: game.worldSnapshots?.[0] ? { week: game.worldSnapshots[0].week, date: game.worldSnapshots[0].date, atmosphere: game.worldSnapshots[0].atmosphere, changes: game.worldSnapshots[0].changes } : null,
    recentSignals: game.worldSignals?.slice(0, 10) ?? [],
    speakerAuthorizedLore: speakerLore,
    authorizedKnowledge: Object.fromEntries(members.map((member) => [member.id, (game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes(member.id)).slice(-12)])),
    lastWeek: game.chronicle[0] ? { summary: game.chronicle[0].summary, results: game.chronicle[0].results.map((item) => ({ title: item.title, outcome: item.outcome, findings: item.findings })) } : null,
    activePressure: game.missions.find((item) => item.state === "active") ?? null,
    scheduled: game.schedule.map((item) => ({ title: item.title, rawIntent: item.rawIntent, risk: item.risk })),
  };
  const raw = extractJson(await callModel(config, `你正在模拟一个维多利亚神秘组织的内部最高议会。这里只允许已经列出的内部成员发言，绝不引入候选人、盟友、证人、教会人员或其他外部人士。组织领导人拥有最终决定权，成员必须尊重其身份，但尊敬通过称谓、停顿、措辞和服从最终决议自然表现，不要让每个人反复说“请您示下”或“由您拍板”。每名成员只能使用本人职责范围、下属已经汇报的信息、authorizedKnowledge以及speakerAuthorizedLore中以本人id标注的内容；严禁让一名成员读取另一名成员的授权资料。来源差异应自然写进叙述，不得使用“亲历/下属报告/个人推断/未知”四段式标签，也不要说“我分几点讲”。允许人物沉默、短答、误判、记起旧事、彼此补充或礼貌地不同意。不要生成任务卡，不要自动形成决议，不得泄露隐藏真相。文风采用克制的神秘悬疑、具体动作和有限视角，不复刻任何现成文本。只返回JSON。`, `围绕玩家此刻提出的问题，让一至三名最相关的内部成员自由回应。人数、顺序和长度由内容决定；简单问题可以只有一名成员一句话，复杂问题可以形成自然交锋。不要机械复述议题。返回：{"replies":[{"speakerId":"已有成员id","text":"自然发言与动作","stance":"赞成|保留|反对|信息不足|涉及私情"}]}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 3000, temperature: .96 }));
  const allowed = new Set(members.map((item) => item.id));
  const replies = Array.isArray(raw.replies) ? raw.replies : [];
  return replies.slice(0, 3).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const speakerId = String(value.speakerId ?? "");
    const text = String(value.text ?? "").trim();
    if (!allowed.has(speakerId) || !text) return [];
    const stance = ["赞成", "保留", "反对", "信息不足", "涉及私情"].includes(String(value.stance)) ? value.stance as CouncilTopicMessage["stance"] : "保留";
    return [{ id: `council-reply-${Date.now()}-${index}`, speakerId, text: text.slice(0, 800), stance }];
  });
}

export async function generateCouncilSummary(config: AiConfig, game: GameState, topic: CouncilTopic) {
  const raw = extractJson(await callModel(config, `你是组织内部议会的书记员。只做中立整理，不推荐方案、不替领导形成决议、不推断未说出口的秘密。每一项必须能追溯到已有发言或已知事实。只返回JSON。`, `整理议题并返回{"facts":[],"consensus":[],"disagreements":[],"risks":[],"directions":[],"unanswered":[]}，每组0至4条，每条不超过80字。\n${JSON.stringify({ topic, members: game.members.map((item) => ({ id: item.id, name: item.name })), knownFacts: game.facts.slice(-16) })}`, { json: true, maxTokens: 1600, temperature: .25 }));
  const list = (key: string) => Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 120)).slice(0, 4) : [];
  return { facts: list("facts"), consensus: list("consensus"), disagreements: list("disagreements"), risks: list("risks"), directions: list("directions"), unanswered: list("unanswered") };
}

export async function generateDecisionDraft(config: AiConfig, game: GameState, topic: CouncilTopic): Promise<string> {
  const payload = {
    week: topic.week,
    topicTitle: topic.title,
    organization: game.organizationName,
    date: game.date,
    messages: topic.messages.map((message) => {
      const member = game.members.find((item) => item.id === message.speakerId);
      return {
        speaker: message.speakerId === "player" ? game.playerAddress : member?.name ?? "内部成员",
        role: message.speakerId === "player" ? "议长" : member?.role ?? "内部成员",
        stance: message.stance ?? null,
        text: message.text,
      };
    }),
    summary: topic.summary ?? null,
    currentWeek: game.week,
  };
  const raw = extractJson(await callModel(config, `你是《灰雾纪事》组织议会的书记员。你的职责是把讨论整理成一段可以交给负责人确认的决议原话。只能依据这份讨论记录本身：发言者的观点、明确提出的限制、成员职责与讨论摘要；不得引入讨论之外的案件、物品或世界背景，不得替负责人决定人格或长期信念。讨论中出现的所有“不要/不得/避免/不接触…”限制必须原样保留为决议红线，一条都不能丢。决议必须包含：核心目标、执行方法、尽量从发言者中指定负责人、明确红线（用“不要/不得/避免…”表达）、撤退条件（用“若…则…”表达）。写成连贯的一段话，像议长口述的命令，不使用列表标签。`, `阅读以下讨论记录，整理成一段可直接执行的决议文本，供负责人确认。\n${JSON.stringify(payload)}\n\n返回：{"decision":"一段连贯的决议原话"}`, { json: true, maxTokens: 1400, temperature: .4 }));
  const decision = typeof raw.decision === "string" ? raw.decision.trim() : "";
  if (!decision) throw new Error("书记员没有形成决议文本；原始讨论保持不变");
  return decision.slice(0, 1400);
}
