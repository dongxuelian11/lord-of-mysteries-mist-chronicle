import { CouncilTopic, CouncilTopicMessage, DISTRICTS, GameState, Member } from "./game-model";

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
  { id: "intelligence", name: "情报与档案", shortName: "情报", mandate: "线索归档、证据链、消息来源与可信度", keywords: /情报|线索|证据|档案|报告|消息|名单|记录|已确认|联系|来源/, preferredMembers: ["ines", "elsa", "gareth", "asher"] },
  { id: "finance", name: "财务与后勤", shortName: "财务", mandate: "资金、采购、运输、身份文件与设施维护", keywords: /资金|预算|采购|账|物资|后勤|设施|建设|据点/, preferredMembers: ["cedric", "victor", "edith", "ollie"] },
  { id: "security", name: "安保与反侦察", shortName: "安保", mandate: "暴露、监视、内鬼、保密等级与据点防御", keywords: /监视|暴露|内鬼|保密|安全|防御|警察|教会/, preferredMembers: ["mara", "gareth", "rowan", "cedric"] },
  { id: "mysticism", name: "神秘事务", shortName: "神秘", mandate: "仪式、材料、封印物、污染、灵界与梦境", keywords: /仪式|材料|封印物|挂坠|异常|污染|灵界|梦境|非凡|序列|晋升/, preferredMembers: ["rowan", "edith", "asher", "elsa"] },
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

function topicTerms(text: string) {
  const stop = new Set(["我们", "这个", "那个", "如何", "什么", "现在", "应该", "需要", "进行", "一下", "关于", "是否"]);
  return [...new Set((text.match(/[\u4e00-\u9fff]{2,6}/g) ?? []).flatMap((chunk) => {
    const result: string[] = [];
    for (let size = Math.min(4, chunk.length); size >= 2; size -= 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) result.push(chunk.slice(index, index + size));
    }
    return result;
  }).filter((term) => !stop.has(term)))];
}

function topicEvidence(game: GameState, topic: string) {
  const terms = topicTerms(topic);
  const explicitSubjects = [...new Set(game.facts.map((fact) => fact.subject).filter((subject) => topic.includes(subject)))];
  const district = DISTRICTS.find((item) => topic.includes(item.name) || item.landmarks.some((landmark) => topic.includes(landmark)));
  const facts = game.facts
    .map((fact, index) => {
      const searchable = `${fact.subject}${fact.statement}${fact.source}`;
      const matchedTerms = terms.filter((term) => searchable.includes(term));
      const score = matchedTerms.reduce((total, term) => total + term.length * term.length, 0)
        + (topic.includes(fact.subject) ? 120 : 0)
        + (fact.certainty === "确认" ? 8 : 0);
      return { fact, score, index };
    })
    .filter((item) => item.score > 0 && (explicitSubjects.length === 0 || explicitSubjects.includes(item.fact.subject)))
    .sort((a, b) => b.score - a.score || b.fact.week - a.fact.week || b.index - a.index)
    .slice(0, 3)
    .map((item) => item.fact);
  const results = game.chronicle.flatMap((chapter) => chapter.results.map((result) => ({ ...result, week: chapter.week }))).filter((result) => terms.some((term) => `${result.title}${result.outcome}${result.findings.join("")}`.includes(term))).slice(0, 2);
  const scheduled = game.schedule.filter((action) => terms.some((term) => `${action.title}${action.rawIntent}${action.desiredOutcome}`.includes(term))).slice(0, 2);
  const lines = [
    ...facts.map((fact) => `第${fact.week}周·${fact.source}：${fact.statement}`),
    ...results.flatMap((result) => result.findings.slice(0, 1).map((finding) => `第${result.week}周行动回报：${finding}`)),
    ...scheduled.map((action) => `本周已排定：${action.title}（${action.risk}风险）`),
  ];
  if (district) lines.push(`${district.name}区域档案：${district.warning}；可利用条件是${district.opportunity}`);
  return lines.slice(0, 3);
}

function portfolioAdvice(portfolioId: string, game: GameState, topic: string) {
  const district = DISTRICTS.find((item) => topic.includes(item.name) || item.landmarks.some((landmark) => topic.includes(landmark)));
  if (portfolioId === "operations") return `行动上建议先做一次不接触目标的外围核验${district ? `：从${district.name}的公开入口进入，保留两条撤离方向` : "，记录接触对象、退路与停止条件"}；出现跟踪、仪式痕迹或成员失联便中止。`;
  if (portfolioId === "intelligence") return "情报上应把‘亲历、下属回报、推断’分栏归档，先找第二个独立来源交叉验证，再决定是否升级为可指控证据。";
  if (portfolioId === "security") return "安保上不建议第一步惊动教会或目标本人；先检查据点是否被反向注视，并为外勤设定暗号、失联时限和撤离接应。";
  if (portfolioId === "recruitment") return `人事上先确认谁具备所需专长与可承受的疲劳额度；目前${game.members.filter((member) => member.fatigue < 55).length}名核心成员尚可承担新职责，但正式吸纳仍需经过接触与临时合作。`;
  if (portfolioId === "mysticism") return "神秘学上先区分普通异常、非凡残留与污染；任何封印物或仪式都必须写明激活条件、负面效果和停止方式。";
  if (portfolioId === "diplomacy") return "对外口径只陈述已经取得的事实，不越级指控幕后主体；若要接触官方，应同时准备证据来源和组织为何知情的解释。";
  if (portfolioId === "finance") return `后勤可先批准小额试探，不暴露组织全貌；现有资金${game.money}，必须为撤离、治疗与身份更换保留余量。`;
  return "城市网络可以先用公开交通、街区关系与外围线人确认活动规律，避免核心成员在同一地点重复露面。";
}

export function createLocalCouncilReplies(game: GameState, topic: string): CouncilTopicMessage[] {
  const evidence = topicEvidence(game, topic);
  return relevantCouncilMembers(game, topic, 3).map((member, index) => {
    const portfolio = portfoliosForMember(game, member.id).find((item) => item.keywords.test(topic)) ?? portfoliosForMember(game, member.id)[0] ?? COUNCIL_PORTFOLIOS[index];
    const evidenceText = evidence[index];
    const prefix = index === 0 ? `${game.playerAddress}，我直接回答这项议题。` : `${member.name}等主责席说完，才向你欠身补充。`;
    const known = evidenceText ? `现有记录能落到纸面的一项是：${evidenceText}` : "档案中还没有与这项说法直接对应的已证实记录；现在只能提出核验方法，不能替您宣布结论。";
    return {
      id: `council-reply-${Date.now()}-${index}`,
      speakerId: member.id,
      stance: evidenceText ? (index === 0 ? "赞成" : "保留") : "信息不足",
      text: `${prefix}${known}${portfolioAdvice(portfolio.id, game, topic)}`,
    };
  });
}

function firstSentence(text: string) {
  return text.split(/(?<=[。！？])/)[0]?.trim().slice(0, 120) || text.slice(0, 120);
}

export function localCouncilSummary(topic: CouncilTopic, game?: GameState) {
  const memberMessages = topic.messages.filter((item) => item.speakerId !== "player");
  const playerMessage = topic.messages.find((item) => item.speakerId === "player");
  const speaker = (message: CouncilTopicMessage) => game?.members.find((member) => member.id === message.speakerId)?.name ?? "议席成员";
  const tagged = (message: CouncilTopicMessage) => `${speaker(message)}：${firstSentence(message.text)}`;
  return {
    facts: memberMessages.filter((item) => /现有记录|事实|回报|档案|第\d+周/.test(item.text)).slice(0, 3).map(tagged),
    consensus: memberMessages.filter((item) => item.stance === "赞成").map(tagged).slice(0, 2),
    disagreements: memberMessages.filter((item) => item.stance === "反对" || item.stance === "保留").map(tagged).slice(0, 3),
    risks: memberMessages.filter((item) => /风险|危险|暴露|停止|失联|污染|撤离/.test(item.text)).map(tagged).slice(0, 3),
    directions: memberMessages.filter((item) => /建议|先|应当|可以/.test(item.text)).map(tagged).slice(0, 3),
    unanswered: memberMessages.some((item) => item.stance === "信息不足") ? [`“${playerMessage?.text.slice(0, 54) ?? topic.title}”仍缺少与说法直接对应的已证实记录。`] : ["第二个独立来源是否支持当前判断？"],
  };
}

export function appendCouncilReplies(topic: CouncilTopic, replies: CouncilTopicMessage[]) {
  return { ...topic, messages: [...topic.messages, ...replies], summary: undefined };
}
