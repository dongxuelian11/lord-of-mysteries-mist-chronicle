import { AiConfig, callModel } from "./ai-client";
import { relevantCouncilMembers } from "./council-system";
import { CouncilTopic, CouncilTopicMessage, GameState } from "./game-model";

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("议事记录没有形成可用结构");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

export async function generateCouncilReplies(config: AiConfig, game: GameState, topicText: string): Promise<CouncilTopicMessage[]> {
  const members = relevantCouncilMembers(game, topicText, 3);
  const payload = {
    leader: { name: game.playerName, address: game.playerAddress },
    topic: topicText,
    speakers: members.map((member) => ({ id: member.id, name: member.name, role: member.role, specialty: member.specialty, background: member.background, core: member.core, voice: member.voice, trust: member.trust ?? member.loyalty })),
    knownFacts: game.facts.slice(-18),
    currentWorld: game.worldSnapshots?.[0] ?? null,
    recentSignals: game.worldSignals?.slice(0, 10) ?? [],
    worldBible: config.worldBible?.trim().slice(0, 16000) || null,
    lastWeek: game.chronicle[0] ? { summary: game.chronicle[0].summary, results: game.chronicle[0].results.map((item) => ({ title: item.title, outcome: item.outcome, findings: item.findings })) } : null,
    activePressure: game.missions.find((item) => item.state === "active") ?? null,
    scheduled: game.schedule.map((item) => ({ title: item.title, rawIntent: item.rawIntent, risk: item.risk })),
  };
  const raw = extractJson(await callModel(config, `你正在模拟一个维多利亚神秘组织的内部最高议会。这里只允许已经列出的内部成员发言，绝不引入候选人、盟友、证人、教会人员或其他外部人士。组织领导人拥有最终决定权，成员必须尊重其身份，但尊敬通过称谓、停顿、措辞和服从最终决议自然表现，不要让每个人反复说“请您示下”或“由您拍板”。每名成员只能使用本人职责范围、下属已经汇报的信息与游戏已知事实；来源差异应自然写进叙述，不得使用“亲历/下属报告/个人推断/未知”四段式标签，也不要说“我分几点讲”。允许人物沉默、短答、误判、记起旧事、彼此补充或礼貌地不同意。不要生成任务卡，不要自动形成决议，不得泄露隐藏真相。文风采用克制的神秘悬疑、具体动作和有限视角，不复刻任何现成文本。只返回JSON。`, `围绕玩家此刻提出的问题，让一至三名最相关的内部成员自由回应。人数、顺序和长度由内容决定；简单问题可以只有一名成员一句话，复杂问题可以形成自然交锋。不要机械复述议题。返回：{"replies":[{"speakerId":"已有成员id","text":"自然发言与动作","stance":"赞成|保留|反对|信息不足|涉及私情"}]}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 3000, temperature: .96 }));
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
