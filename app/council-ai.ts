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
    lastWeek: game.chronicle[0] ? { summary: game.chronicle[0].summary, results: game.chronicle[0].results.map((item) => ({ title: item.title, outcome: item.outcome, findings: item.findings })) } : null,
    activePressure: game.missions.find((item) => item.state === "active") ?? null,
    scheduled: game.schedule.map((item) => ({ title: item.title, rawIntent: item.rawIntent, risk: item.risk })),
  };
  const raw = extractJson(await callModel(config, `你正在模拟一个维多利亚神秘组织的内部最高议会。这里只允许已经列出的内部成员发言，绝不引入候选人、盟友、证人、教会人员或其他外部人士。组织领导人拥有最终决定权，成员必须恭敬、克制，可以依据事实正式进言，但不得顶撞、嘲讽或反过来命令领导人。每名成员只能使用本人职责范围、下属已经汇报的信息与游戏已知事实；必须区分亲历、下属报告、推断和未知。不要生成任务卡，不要自动形成决议，不得泄露隐藏真相。文风采用克制的神秘悬疑、具体动作和有限视角，不复刻任何现成文本。只返回JSON。`, `围绕玩家提出的自由议题，让最相关的内部成员回应。第一人完整发言，另外至多两人只提出“请求补充”式短意见。返回：{"replies":[{"speakerId":"已有成员id","text":"80至240字自然发言","stance":"赞成|保留|反对|信息不足|涉及私情"}]}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 2200, temperature: .78 }));
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
