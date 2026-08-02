import { CouncilTopic, CouncilTopicMessage, GameState, Member } from "./game-model";

export type CouncilPortfolio = {
  id: string;
  name: string;
  shortName: string;
  mandate: string;
  keywords: RegExp;
  preferredMembers: string[];
};

export const COUNCIL_PORTFOLIOS: CouncilPortfolio[] = [
  { id: "recruitment", name: "内部人事与招募", shortName: "人事", mandate: "成员状态、候选人、忠诚、内部冲突与任用", keywords: /招募|新人|成员|忠诚|冲突|任命|席位|下属|失踪人员/, preferredMembers: ["ines", "sylvie", "gareth", "nora"] },
  { id: "operations", name: "行动与调查", shortName: "行动", mandate: "外勤、调查、撤离、现场安全与任务进度", keywords: /调查|外勤|追踪|撤离|潜入|现场|任务|路线/, preferredMembers: ["mara", "gareth", "ollie", "rowan"] },
  { id: "intelligence", name: "情报与档案", shortName: "情报", mandate: "线索归档、证据链、消息来源与可信度", keywords: /情报|线索|证据|档案|报告|消息|名单|记录/, preferredMembers: ["ines", "elsa", "gareth", "asher"] },
  { id: "finance", name: "财务与后勤", shortName: "财务", mandate: "资金、采购、运输、身份文件与设施维护", keywords: /资金|预算|采购|账|物资|后勤|设施|建设|据点/, preferredMembers: ["cedric", "victor", "edith", "ollie"] },
  { id: "security", name: "安保与反侦察", shortName: "安保", mandate: "暴露、监视、内鬼、保密等级与据点防御", keywords: /监视|暴露|内鬼|保密|安全|防御|警察|教会/, preferredMembers: ["mara", "gareth", "rowan", "cedric"] },
  { id: "mysticism", name: "神秘事务", shortName: "神秘", mandate: "仪式、材料、封印物、污染、灵界与梦境", keywords: /仪式|材料|封印物|污染|灵界|梦境|非凡|序列|晋升/, preferredMembers: ["rowan", "edith", "asher", "elsa"] },
  { id: "diplomacy", name: "外交与关系", shortName: "外交", mandate: "教会、官方、贵族、密教、盟友与公开信誉", keywords: /外交|教会|官方|贵族|密教|盟友|谈判|举报|信誉/, preferredMembers: ["ines", "sylvie", "victor", "cedric"] },
  { id: "network", name: "城市网络", shortName: "网络", mandate: "街区关系、外围团体、交通、救助与社会影响", keywords: /街区|地图|东区|西区|北区|南区|码头|桥区|人口|救助|交通/, preferredMembers: ["mara", "nora", "ollie", "sylvie"] },
];

function scoreMember(member: Member, portfolio: CouncilPortfolio) {
  const preferred = portfolio.preferredMembers.indexOf(member.id);
  if (preferred >= 0) return 100 - preferred * 8;
  let score = 0;
  if (portfolio.keywords.test(`${member.role}${member.specialty}${member.background ?? ""}`)) score += 50;
  score += (member.trust ?? member.loyalty) / 5;
  return score;
}

export function portfolioOwner(game: GameState, portfolio: CouncilPortfolio) {
  return [...game.members].sort((a, b) => scoreMember(b, portfolio) - scoreMember(a, portfolio))[0];
}

export function portfoliosForMember(game: GameState, memberId: string) {
  return COUNCIL_PORTFOLIOS.filter((portfolio) => portfolioOwner(game, portfolio)?.id === memberId);
}

export function relevantCouncilMembers(game: GameState, topic: string, limit = 3) {
  const portfolios = COUNCIL_PORTFOLIOS.filter((item) => item.keywords.test(topic));
  const selected = (portfolios.length ? portfolios : COUNCIL_PORTFOLIOS.slice(0, 3))
    .map((item) => portfolioOwner(game, item))
    .filter((member): member is Member => Boolean(member));
  return [...new Map(selected.map((member) => [member.id, member])).values()].slice(0, limit);
}

function firstSentence(text: string) {
  return text.split(/(?<=[。！？])/)[0]?.trim().slice(0, 120) || text.slice(0, 120);
}

export function localCouncilSummary(topic: CouncilTopic) {
  const memberMessages = topic.messages.filter((item) => item.speakerId !== "player");
  const playerMessage = topic.messages.find((item) => item.speakerId === "player");
  return {
    facts: memberMessages.slice(0, 3).map((item) => firstSentence(item.text)),
    consensus: memberMessages.filter((item) => item.stance === "赞成").map((item) => firstSentence(item.text)).slice(0, 2),
    disagreements: memberMessages.filter((item) => item.stance === "反对" || item.stance === "保留").map((item) => firstSentence(item.text)).slice(0, 3),
    risks: memberMessages.filter((item) => /风险|危险|暴露|代价|不足|失联/.test(item.text)).map((item) => firstSentence(item.text)).slice(0, 3),
    directions: playerMessage ? [`围绕“${playerMessage.text.slice(0, 80)}”继续形成由玩家拍板的方案。`] : [],
    unanswered: ["哪些内容已经得到独立来源交叉验证？", "若情况恶化，停止条件与撤离边界是什么？"],
  };
}

export function appendCouncilReplies(topic: CouncilTopic, replies: CouncilTopicMessage[]) {
  return { ...topic, messages: [...topic.messages, ...replies], summary: undefined };
}
