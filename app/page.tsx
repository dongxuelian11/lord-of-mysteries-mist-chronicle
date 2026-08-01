"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Building2,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudFog,
  Command,
  Compass,
  Eye,
  LayoutDashboard,
  Lightbulb,
  MapPin,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Undo2,
  UsersRound,
  Zap,
  X,
  XCircle,
} from "lucide-react";

type PathwayId = "seer" | "spectator" | "apprentice" | "hunter" | "mystery";
type OrganizationId = "agency" | "salon" | "clinic" | "caravan";
type ViewId = "situation" | "organization" | "archive";

type Member = {
  id: string;
  name: string;
  role: string;
  sequence: string;
  specialty: string;
  status: "空闲" | "执行中" | "休养";
  trust: number;
};

type District = {
  id: string;
  name: string;
  subtitle: string;
  danger: number;
  influence: number;
  intel: number;
  tone: string;
  x: number;
  y: number;
  size: "small" | "medium" | "large";
  background: string;
  landmarks: string[];
  opportunity: string;
  warning: string;
};

type Incident = {
  id: string;
  districtId: string;
  title: string;
  summary: string;
  progress: number;
  urgency: number;
  confidence: "传闻" | "线索" | "可信证据" | "已确认";
  faction: string;
  deadline: number;
  clues: string[];
  revealedClues: number;
  status: "active" | "resolved";
};

type Order = {
  id: string;
  type: string;
  memberId: string;
  districtId: string;
  brief: string;
  useAbility: boolean;
};

type ChronicleEntry = {
  id: string;
  week: number;
  title: string;
  text: string;
  tone: "good" | "warn" | "neutral";
};

type TurnResult = {
  id: string;
  memberName: string;
  actionType: string;
  districtName: string;
  success: boolean;
  score: number;
  threshold: number;
  detail: string;
  progressDelta: number;
  newClue?: string;
  abilityName?: string;
  abilityEffect?: string;
  sceneTitle: string;
  orderBrief: string;
  incidentTitle?: string;
  narrative: string[];
  testimony?: { speaker: string; words: string };
  findings: string[];
  consequence: string;
  followUp: string;
};

type TurnReport = {
  week: number;
  date: string;
  headline: string;
  summary: string;
  results: TurnResult[];
  deltas: { money: number; intel: number; concealment: number; stability: number };
  prelude: string[];
  worldMoves: { title: string; districtName: string; text: string; severity: "watch" | "danger" }[];
  closing: string;
};

type GameState = {
  week: number;
  date: string;
  pathway: PathwayId;
  organization: OrganizationId;
  actionPoints: number;
  money: number;
  intel: number;
  concealment: number;
  stability: number;
  spirituality: number;
  members: Member[];
  districts: District[];
  incidents: Incident[];
  orders: Order[];
  chronicle: ChronicleEntry[];
};

const STORAGE_KEY = "mist-chronicle-save-v3";
const PLAYER_MEMBER_ID = "player";

const ACTION_PROFILES: Record<string, { base: number; progress: number; intel: number; cost: number; exposure: number; label: string }> = {
  调查: { base: 7, progress: 21, intel: 7, cost: 12, exposure: 2, label: "推进证据链，可能解锁新线索" },
  交涉: { base: 3, progress: 13, intel: 4, cost: 20, exposure: 3, label: "争取证人、盟友或临时通行" },
  研究: { base: 10, progress: 17, intel: 8, cost: 10, exposure: 0, label: "验证材料、配方与神秘学痕迹" },
  采购: { base: 5, progress: 8, intel: 2, cost: 35, exposure: 2, label: "获取任务物资与黑市渠道" },
  仪式: { base: -2, progress: 25, intel: 9, cost: 24, exposure: 6, label: "高收益、高暴露的神秘学手段" },
  休整: { base: 18, progress: 2, intel: 0, cost: 6, exposure: -3, label: "恢复稳定并降低组织暴露" },
};

type Pathway = {
  name: string;
  sequence: string;
  ability: string;
  note: string;
  activeName: string;
  activeDescription: string;
  favoredActions: string[];
  thresholdBonus: number;
  progressBonus: number;
  intelBonus: number;
  exposureModifier: number;
};

const PATHWAYS: Record<PathwayId, Pathway> = {
  seer: { name: "占卜家", sequence: "序列9", ability: "灵视 · 占卜", note: "擅长预警、追索与仪式准备", activeName: "梦境占卜", activeDescription: "在行动前举行简短占卜，避开错误方向并看见关键象征。", favoredActions: ["调查", "仪式"], thresholdBonus: 22, progressBonus: 9, intelBonus: 3, exposureModifier: 0 },
  spectator: { name: "观众", sequence: "序列9", ability: "观察 · 读心倾向", note: "擅长识人、交涉与心理干预", activeName: "心理画像", activeDescription: "读取细微表情与情绪变化，判断证词、动机和谈判底线。", favoredActions: ["交涉", "调查"], thresholdBonus: 21, progressBonus: 7, intelBonus: 4, exposureModifier: -2 },
  apprentice: { name: "学徒", sequence: "序列9", ability: "开门 · 灵性直觉", note: "擅长潜入、脱身与空间探索", activeName: "无锁之门", activeDescription: "借助灵性直觉寻找隐蔽入口，为队伍建立安全的潜入与撤离路线。", favoredActions: ["调查", "采购"], thresholdBonus: 19, progressBonus: 11, intelBonus: 2, exposureModifier: -1 },
  hunter: { name: "猎人", sequence: "序列9", ability: "追踪 · 陷阱", note: "擅长侦察、伏击与正面冲突", activeName: "猎物标记", activeDescription: "从现场痕迹锁定目标行动轨迹，快速推进追踪，但容易惊动猎物。", favoredActions: ["调查", "采购"], thresholdBonus: 24, progressBonus: 12, intelBonus: 2, exposureModifier: 2 },
  mystery: { name: "窥秘人", sequence: "序列9", ability: "神秘学识 · 仪式", note: "擅长研究、鉴定与污染辨识", activeName: "神秘鉴定", activeDescription: "辨识材料、符号与灵性残留，分离伪造信息和真实污染。", favoredActions: ["研究", "仪式"], thresholdBonus: 23, progressBonus: 10, intelBonus: 5, exposureModifier: 1 },
};

const ORGANIZATIONS: Record<OrganizationId, { name: string; cover: string; perk: string }> = {
  agency: { name: "鸦羽侦探事务所", cover: "私人调查与失物寻回", perk: "合法委托与警务关系" },
  salon: { name: "银灯神秘学沙龙", cover: "贵族神秘学交流会", perk: "上流社交与知识交易" },
  clinic: { name: "圣槲慈善诊所", cover: "东区平价诊疗", perk: "底层影响与异常病例" },
  caravan: { name: "灰鲸地下商队", cover: "旧货与海外香料贸易", perk: "采购、走私与黑市渠道" },
};

const INITIAL_MEMBERS: Member[] = [
  { id: "mara", name: "玛拉·维恩", role: "外勤调查员", sequence: "普通人", specialty: "跟踪与街头关系", status: "空闲", trust: 72 },
  { id: "cedric", name: "塞德里克·霍尔", role: "账房兼掩护人", sequence: "普通人", specialty: "账目与身份文书", status: "空闲", trust: 64 },
  { id: "ines", name: "伊妮丝·科尔", role: "情报联络员", sequence: "普通人", specialty: "报业与贵族传闻", status: "空闲", trust: 59 },
  { id: "rowan", name: "罗文·布莱克", role: "非凡顾问", sequence: "序列9 · 收尸人", specialty: "灵体与死亡痕迹", status: "空闲", trust: 67 },
];

const INITIAL_DISTRICTS: District[] = [
  { id: "north", name: "北区", subtitle: "大学与圣赛缪尔", danger: 30, influence: 16, intel: 38, tone: "safe", x: 21, y: 15, size: "large", background: "贝克兰德的学术与宗教中心。大学、出版社和黑夜教会总部让这里秩序井然，也意味着每一次神秘学活动都可能落入官方视线。", landmarks: ["霍伊大学", "圣赛缪尔教堂", "贝克兰德技术大学"], opportunity: "适合查阅档案、接触学者，并借教会秩序压制异常。", warning: "教会值夜者反应迅速；公开举行仪式极易被记录。" },
  { id: "empress", name: "皇后区", subtitle: "王室与大贵族", danger: 44, influence: 8, intel: 18, tone: "gold", x: 43, y: 18, size: "medium", background: "宫殿、花园与世袭贵族宅邸构成封闭世界。信息很少流向街头，但仆役、马车夫与宴会供应商维持着一条隐秘的消息网络。", landmarks: ["王室宫殿", "皇后花园", "贵族宅邸群"], opportunity: "可建立贵族线人，获取王室项目和上流婚姻网络情报。", warning: "身份核验严格；一次失礼就会永久关闭多条关系线。" },
  { id: "west", name: "西区", subtitle: "教会与上流社交", danger: 38, influence: 11, intel: 22, tone: "gold", x: 16, y: 39, size: "large", background: "律师、医生、富商与中小贵族聚居的体面城区。慈善晚宴和私人沙龙是利益交换场，也是隐秘组织寻找新人的温床。", landmarks: ["律师事务所街", "贵族沙龙", "丰收教堂"], opportunity: "交涉收益高，容易接触委托人与合法化渠道。", warning: "多方势力互相监视，来历不明者很难长期伪装。" },
  { id: "hillston", name: "希尔斯顿区", subtitle: "商业与证券", danger: 35, influence: 20, intel: 34, tone: "safe", x: 46, y: 39, size: "medium", background: "银行、证券所、保险公司和大型百货集中于此。纸面数字掩盖着真正的权力流向，异常交易往往比尸体更早暴露阴谋。", landmarks: ["贝克兰德证券交易所", "银行街", "大型百货"], opportunity: "适合追查资金、采购专业物资和建立商业掩护。", warning: "调查账目需要证据或内线；贸然查账会触发法律反制。" },
  { id: "cherwood", name: "乔伍德区", subtitle: "组织据点所在", danger: 24, influence: 42, intel: 56, tone: "safe", x: 31, y: 53, size: "medium", background: "中产住宅、剧院与小型事务所混杂，既不贫穷也不过分显眼。你的组织以合法生意为掩护，在一栋临街建筑中建立了第一个据点。", landmarks: ["组织主据点", "剧院街", "地下非凡者聚会"], opportunity: "休整、研究和内部建设更安全，情报网络已有初步根基。", warning: "据点周边行动过于频繁，会把危险直接引向核心成员。" },
  { id: "queen", name: "皇后大道", subtitle: "政府与议会", danger: 48, influence: 9, intel: 20, tone: "gold", x: 59, y: 51, size: "small", background: "王国行政机关、议会办公室与公务员俱乐部沿大道分布。这里的秘密很少由邪教徒守卫，更多被印章、程序和沉默的利益共同体保护。", landmarks: ["王国议会", "市政厅", "公务员俱乐部"], opportunity: "能够获取政策、人口迁移与政府采购记录。", warning: "指控重要人物需要完整证据链，否则组织可信度会迅速崩塌。" },
  { id: "east", name: "东区", subtitle: "工厂与失踪人口", danger: 72, influence: 18, intel: 31, tone: "danger", x: 77, y: 35, size: "large", background: "烟尘、廉价出租屋和昼夜不停的工厂吞没了大量人口。贫困让失踪变得寻常，也为人口交易、邪教招募与秘密工程提供遮蔽。", landmarks: ["废弃纺织厂", "廉价旅馆区", "大型煤气工厂"], opportunity: "容易接触工人、帮派和被官方忽视的目击者。", warning: "治安恶劣且污染来源复杂；外勤失败可能引来帮派或官方盘查。" },
  { id: "bridge", name: "贝克兰德桥区", subtitle: "交通与灰色交易", danger: 59, influence: 15, intel: 41, tone: "danger", x: 47, y: 68, size: "medium", background: "南北交通、廉价市场与短租公寓汇聚于桥区。人和货物不断流动，使这里成为跟踪目标、交换赃物和摆脱追兵的天然舞台。", landmarks: ["贝克兰德大桥", "公共马车总站", "旧货市场"], opportunity: "追踪与采购效率较高，也能接触跨区流动的线人。", warning: "线索流动快、过期也快；错过时间窗口后很难重新定位目标。" },
  { id: "south", name: "南区", subtitle: "工人住宅与诊所", danger: 52, influence: 23, intel: 36, tone: "safe", x: 67, y: 78, size: "medium", background: "工匠、码头家庭和小型诊所形成紧密社区。居民对官方缺乏信任，却会记住真正提供帮助的人。异常常首先以疾病、事故和家庭悲剧出现。", landmarks: ["慈善诊所", "工人互助会", "廉价药房街"], opportunity: "救助行动能积累长期声望，并发现污染的早期症状。", warning: "资源有限；任何大规模异常都会迅速压垮当地救助网络。" },
  { id: "dock", name: "码头区", subtitle: "仓库、船运与走私", danger: 66, influence: 12, intel: 45, tone: "danger", x: 83, y: 72, size: "large", background: "来自五海与殖民地的船只把货物、移民和未知事物带进首都。港务文件看似严密，实际上被公司、帮派和走私者共同侵蚀。", landmarks: ["因蒂斯货运栈桥", "海关仓库", "水手酒吧"], opportunity: "可获得海外材料、航运记录与黑市渠道。", warning: "封闭货舱和海外非凡者带来未知风险，撤离路线必须提前准备。" },
];

const INITIAL_INCIDENTS: Incident[] = [
  {
    id: "missing-workers",
    districtId: "east",
    title: "煤气灯下的失踪者",
    summary: "三名码头工人在一周内失踪。警察认为他们只是逃债，但最后出现地点都靠近废弃纺织厂。",
    progress: 18,
    urgency: 68,
    confidence: "线索",
    faction: "未知 · 疑似人口贩运",
    deadline: 3,
    clues: ["三名失踪者都在周四夜班后离开", "纺织厂附近出现甜腻草药气味", "一辆无牌马车固定在凌晨三点出现", "车夫与某个王室承包商存在资金往来"],
    revealedClues: 0,
    status: "active",
  },
  {
    id: "black-market-formula",
    districtId: "cherwood",
    title: "被涂改的魔药配方",
    summary: "黑市掮客正在出售一张来历不明的低序列配方，其中两种辅料被人为替换。",
    progress: 35,
    urgency: 42,
    confidence: "传闻",
    faction: "地下非凡者聚会",
    deadline: 5,
    clues: ["配方墨水来自海上贸易商", "被替换的辅料会显著增加失控概率", "卖家曾在极光会外围活动", "原始配方仍藏在乔伍德区某处"],
    revealedClues: 1,
    status: "active",
  },
  {
    id: "noble-salon",
    districtId: "west",
    title: "西区的午夜沙龙",
    summary: "一场只对受邀者开放的神秘学聚会正在寻找新的占卜师，邀请函上带有微弱灵性。",
    progress: 10,
    urgency: 35,
    confidence: "线索",
    faction: "贵族神秘学圈",
    deadline: 6,
    clues: ["邀请函只在月相改变时显现地址", "主持人正在寻找真正的占卜家", "参与者中混有教会观察员", "沙龙收藏着一件可疑的罗塞尔遗物"],
    revealedClues: 0,
    status: "active",
  },
  {
    id: "university-dreams", districtId: "north", title: "大学里的共同梦境",
    summary: "五名历史系学生连续梦见同一座倒悬陵墓，其中一人醒来后开始书写无法辨认的赫密斯语。",
    progress: 12, urgency: 51, confidence: "传闻", faction: "霍伊大学", deadline: 4,
    clues: ["梦境都始于校史馆地下室", "学生曾共同翻阅第四纪手稿", "手稿缺少的页面出现在黑市", "梦境坐标指向北区一座封闭墓园"], revealedClues: 0, status: "active",
  },
  {
    id: "parliament-whisper", districtId: "queen", title: "议会走廊里的耳语",
    summary: "两名书记员声称在深夜听见空会议室中有人讨论贫民迁移计划，随后一人突然辞职。",
    progress: 8, urgency: 57, confidence: "传闻", faction: "政府内部", deadline: 5,
    clues: ["辞职书记员并未离开贝克兰德", "会议记录被人以合法权限调取", "迁移名单集中指向东区", "名单上的人口与秘密工程存在关联"], revealedClues: 0, status: "active",
  },
  {
    id: "bridge-ghost", districtId: "bridge", title: "桥墩下的无声乘客",
    summary: "末班公共马车连续三夜多出一名没有影子的乘客，车夫却坚持车上人数从未变化。",
    progress: 22, urgency: 46, confidence: "线索", faction: "灵界异常", deadline: 4,
    clues: ["乘客只在驶过第三座桥时出现", "车票印着已停运十年的线路", "桥下残留不属于死者的灵性", "异常与一件被转运的封印物有关"], revealedClues: 0, status: "active",
  },
  {
    id: "south-fever", districtId: "south", title: "没有高烧的热病",
    summary: "南区诊所接收了七名不断声称身体燃烧的病人，但体温与血液检查全部正常。",
    progress: 16, urgency: 63, confidence: "线索", faction: "未知污染", deadline: 3,
    clues: ["患者都购买过同一种廉价止痛药", "药粉中混入微量非凡材料", "供货商使用伪造的海关文件", "污染源来自码头区的密封货箱"], revealedClues: 0, status: "active",
  },
  {
    id: "sealed-cargo", districtId: "dock", title: "拒绝卸货的密封货舱",
    summary: "一艘因蒂斯货轮进港后，船员集体拒绝打开底层货舱；港务官收到命令要求绕过检查。",
    progress: 14, urgency: 71, confidence: "线索", faction: "海外贸易公司", deadline: 2,
    clues: ["货单上的香料重量与吃水线不符", "夜间有人从货舱内部敲击三短两长", "绕检命令来自政府采购部门", "货物与南区异常药品属于同一批次"], revealedClues: 0, status: "active",
  },
];

function createInitialState(pathway: PathwayId = "seer", organization: OrganizationId = "agency"): GameState {
  const moneyBonus = organization === "caravan" ? 80 : organization === "salon" ? 35 : 0;
  const intelBonus = organization === "agency" ? 8 : organization === "clinic" ? 5 : 0;
  return {
    week: 1,
    date: "1349年6月28日",
    pathway,
    organization,
    actionPoints: 3,
    money: 420 + moneyBonus,
    intel: 24 + intelBonus,
    concealment: 86,
    stability: 92,
    spirituality: 3,
    members: INITIAL_MEMBERS.map((member) => ({ ...member })),
    districts: INITIAL_DISTRICTS.map((district) => ({ ...district })),
    incidents: INITIAL_INCIDENTS.map((incident) => ({ ...incident })),
    orders: [],
    chronicle: [
      {
        id: "opening",
        week: 1,
        title: "灰雾之下，历史开始转动",
        text: "廷根传来一则不起眼的自杀案消息。与此同时，你在贝克兰德的组织完成了第一次正式集会。",
        tone: "neutral",
      },
    ],
  };
}

function normalizeGameState(saved: GameState): GameState {
  return {
    ...saved,
    spirituality: typeof saved.spirituality === "number" ? saved.spirituality : 3,
    districts: INITIAL_DISTRICTS.map((district) => ({
      ...district,
      ...(saved.districts?.find((item) => item.id === district.id) ?? {}),
      background: district.background,
      landmarks: district.landmarks,
      opportunity: district.opportunity,
      warning: district.warning,
    })),
    orders: (saved.orders ?? []).map((order) => ({ ...order, useAbility: order.useAbility ?? false })),
  };
}

function numberHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function nextDate(week: number) {
  const date = new Date(Date.UTC(1349, 5, 28));
  date.setUTCDate(date.getUTCDate() + week * 7);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function confidenceFromProgress(progress: number): Incident["confidence"] {
  if (progress >= 85) return "已确认";
  if (progress >= 55) return "可信证据";
  if (progress >= 20) return "线索";
  return "传闻";
}

function calculateThreshold(member: Member, district: District, actionType: string, briefText: string, abilityBonus = 0) {
  const profile = ACTION_PROFILES[actionType] ?? ACTION_PROFILES.调查;
  const preparation = Math.min(18, Math.floor(briefText.trim().length / 12));
  const memberBonus = member.sequence === "普通人" ? 8 : 15;
  return Math.max(18, Math.min(95, 48 + profile.base + preparation + memberBonus + abilityBonus - Math.floor(district.danger / 4)));
}

function abilityResolutionText(pathway: Pathway, actionType: string) {
  const favored = pathway.favoredActions.includes(actionType);
  return favored
    ? `${pathway.activeName}与这次行动高度契合，显著修正了判断并推进证据链。`
    : `${pathway.activeName}提供了有限辅助，但并非处理这类问题的最佳手段。`;
}

function actionDetail(actionType: string, success: boolean, memberName: string, districtName: string) {
  const details: Record<string, [string, string]> = {
    调查: [`${memberName}完成了现场走访与交叉核对，排除了一条误导信息。`, `${memberName}的跟踪被临时巡警打断，只带回了零散口供。`],
    交涉: [`${memberName}找到了对方真正关心的筹码，换得一次持续合作。`, `${memberName}没有暴露底线，但对方拒绝在缺少担保时继续谈判。`],
    研究: [`${memberName}在档案与神秘学痕迹之间建立了新的对应关系。`, `${memberName}确认现有样本受到干扰，需要更多材料才能得出结论。`],
    采购: [`${memberName}绕开常规市场，从可靠渠道获得了所需物资。`, `${memberName}发现卖方临时抬价并试图追查买家身份，只能中止交易。`],
    仪式: [`${memberName}维持住仪式边界，从灵界反馈中截获了有效指向。`, `${memberName}及时切断仪式避免污染，但灵性波动已经引起未知注视。`],
    休整: [`${memberName}完成据点检查与心理疏导，组织重新恢复秩序。`, `${memberName}虽然没有完全恢复，但及时发现了一处安全流程漏洞。`],
  };
  const [good, bad] = details[actionType] ?? details.调查;
  return `${districtName}：${success ? good : bad}`;
}

const DISTRICT_SCENES: Record<string, string> = {
  north: "雨水沿着大学区的尖顶和黑色铁栏缓慢淌下，远处圣赛缪尔教堂的钟声被雾切成了几段",
  empress: "修剪整齐的树篱后只有车轮压过湿石路的轻响，贵族宅邸的窗帘在白昼也闭得严密",
  west: "煤气灯尚未熄灭，送奶车与擦得发亮的私人马车已经在体面的街道上交错而过",
  hillston: "证券所开门前，银行街已经满是抱着文件袋的职员，油墨、雨伞与焦躁混合成一种商业区特有的气味",
  cherwood: "剧院后巷残留着昨夜的酒气，事务所门前的铜牌被晨雾蒙上一层薄白",
  queen: "政府大楼的长窗逐一亮起，穿黑外套的公务员在门廊下交换点头，却很少真正看向彼此",
  east: "工厂汽笛穿过低垂的烟云，狭窄街巷里挤满赶早班的工人，廉价煤烟让每张脸都显得灰暗",
  bridge: "塔索克河拍打着发黑的桥墩，公共马车碾过桥面时，栏杆会传来细微而持续的震颤",
  south: "诊所门外已经排起短队，潮湿衣物、药粉和煮得过久的燕麦粥气味挤在同一条街上",
  dock: "潮水托起一排沉默的货船，起重机的铁链在雾中碰撞，声音像从很远的地方传来",
};

const INCIDENT_VOICES: Record<string, { speaker: string; open: string; guarded: string }> = {
  "missing-workers": { speaker: "失踪工人的姐姐艾达", open: "他把这周的工钱留在了桌上。一个打算逃债的人，不会连母亲的药钱都提前分好。", guarded: "我已经和警察说过一次。他们只问他欠了多少酒钱，没问那辆马车。" },
  "black-market-formula": { speaker: "戴灰手套的黑市掮客", open: "写下这张配方的人懂规矩，改动它的人更懂——他知道怎样让买家活到喝下第二瓶。", guarded: "配方是真的，价钱也是真的。至于谁改过它，那不是几镑钞票能买的问题。" },
  "noble-salon": { speaker: "负责收取邀请函的老门房", open: "每位客人都戴面具，可真正需要遮住脸的那几位，反而从不戴。", guarded: "先生，西区每天都有聚会。把好奇心当成门票的人，通常回不到第二次。" },
  "university-dreams": { speaker: "霍伊大学历史系助教", open: "他们醒来后写出的符号并不相同，可把纸叠在一起，线条恰好组成一扇门。", guarded: "学生只是考试前过度紧张。校方不希望外人把梦话写进报纸。" },
  "parliament-whisper": { speaker: "拒绝留下姓名的抄写员", open: "那间会议室没有点灯。我听见他们逐户念出名字，就像在核对一批货物。", guarded: "我什么也没听见。若你还想问，请先告诉我，明天是谁来保护我的妻子。" },
  "bridge-ghost": { speaker: "末班公共马车的车夫", open: "过第三座桥时车厢会沉一下。不是有人上车，更像是有什么东西终于想起了自己的重量。", guarded: "乘客一直是六个。公司登记簿上也是六个。你最好别让我因为第七个丢了饭碗。" },
  "south-fever": { speaker: "圣槲诊所的值夜护士", open: "他们都说骨头里有火，可皮肤冷得像刚从河里捞起来。我洗过药杯，水面浮着银色的粉。", guarded: "病人需要休息，不需要神秘学家围着他们猜谜。除非你能先弄来干净的药。" },
  "sealed-cargo": { speaker: "码头理货员佩斯", open: "货单写着香料，吃水却像装了铅。昨夜舱里有人敲了五下，船长立刻让我们都下船。", guarded: "我只负责数箱子。港务官说不用开舱，那它就不该在我的眼睛里打开。" },
};

const ACTION_PROCESS: Record<string, { success: string; failure: string }> = {
  调查: { success: "你们没有急着追逐最显眼的传闻，而是将时间、路线和证词分别记录，再寻找它们无法彼此解释的部分。到傍晚时，一处原本像是疏忽的矛盾开始显出人为安排的轮廓。", failure: "最初的两条线索都通向了容易查证、却毫无价值的人。等到队伍意识到有人刻意投放这些说法时，负责望风的成员已经发现同一顶灰呢礼帽在街角出现了第三次。" },
  交涉: { success: "谈话没有从问题开始，而是从对方真正害怕失去的东西开始。承诺、沉默和一份没有署名的担保被依次放上桌面，对方终于允许自己说出官方记录之外的那部分事实。", failure: "对方听完条件后没有立刻拒绝，只把茶杯向外推了半寸。这个细微动作已经说明谈判结束；继续施压只会让背后的势力知道组织掌握了多少。" },
  研究: { success: "档案被按年代、墨迹和纸张来源重新排列，灵性残留则单独封存在盐圈内。几个看似无关的细节在深夜形成对应：这不是偶然污染，而是有人熟悉流程后留下的可控误差。", failure: "样本之间存在相互矛盾的灵性反应。继续强行归纳只会得到一个漂亮而危险的错误结论，负责研究的人最终烧掉了受污染的试纸，保住了其余材料。" },
  采购: { success: "采购没有经过公开柜台。三次换车、两张临时票据和一名只收旧金币的中间人之后，所需物资被拆成普通货物送回据点，没有留下完整的买家记录。", failure: "卖方临时更换了交货地点，还多带来两名不说话的护卫。这更像一次身份确认而非交易，队伍在付出少量定金后主动切断联系。" },
  仪式: { success: "蜡烛的火焰在第三段祷文结束后同时偏向同一方向。灵界没有给出答案，只以气味、色彩和一段不属于任何人的记忆作出回应；这些象征足以排除大部分错误路径。", failure: "仪式进行到一半，镜面中的倒影比现实慢了一次呼吸。主持者立刻破坏核心符号并撒盐熄灭烛火，避免了进一步接触，却无法确定注视是否已经从另一侧投来。" },
  休整: { success: "一周没有英雄式的行动。门锁被重新检查，暗号被替换，成员轮流睡了几个完整的夜晚。正是在这种平静里，两处可能导致据点暴露的习惯被及时纠正。", failure: "疲惫并未因为停止外勤就立刻消失。一次关于经费的小争执拖得太久，直到负责人把每个人的职责重新写在纸上，会议才恢复秩序。" },
};

const WORLD_SIGNS: Record<string, string> = {
  "missing-workers": "东区又有一间廉价公寓在清晨被发现空置。房东坚持租客连夜离城，邻居却说楼梯整晚没有响过。",
  "black-market-formula": "地下聚会中，那张配方的报价被提高了一倍。卖家开始询问最近有哪些组织在打听墨水来源。",
  "noble-salon": "西区沙龙更换了下一次聚会地点，一名原本答应牵线的仆役突然被主人送往乡下。",
  "university-dreams": "第六名学生报告了相同梦境。校方封闭了校史馆地下室，并对外宣称正在维修水管。",
  "parliament-whisper": "涉及贫民迁移的文件被重新编号，原本可以公开查阅的附件进入了内部流转程序。",
  "bridge-ghost": "末班马车公司悄悄换掉了涉事车夫，但没有停运那条线路。第三座桥下出现一束来历不明的白花。",
  "south-fever": "南区诊所新增两名症状相同的病人，廉价药房则在天亮前搬空了后仓。",
  "sealed-cargo": "港务处签发了临时放行文书。那艘货轮尚未卸货，却已有两辆封闭马车在仓库外等待。",
};

function buildNarrativeResult(args: {
  week: number;
  order: Order;
  member: Member;
  district: District;
  incident?: Incident;
  success: boolean;
  progressDelta: number;
  newClue?: string;
  abilityName?: string;
  abilityEffect?: string;
}) {
  const { week, order, member, district, incident, success, progressDelta, newClue, abilityName, abilityEffect } = args;
  const actor = member.id === PLAYER_MEMBER_ID ? "你" : member.name;
  const voice = incident ? INCIDENT_VOICES[incident.id] : undefined;
  const process = ACTION_PROCESS[order.type] ?? ACTION_PROCESS.调查;
  const nextProgress = incident ? Math.min(100, incident.progress + progressDelta) : 0;
  const nextThreshold = [25, 50, 75, 95].find((value) => value > nextProgress);
  const sceneTitles: Record<string, string> = { 调查: "雾中的走访", 交涉: "关门后的谈判", 研究: "灯下的档案", 采购: "没有收据的交易", 仪式: "灵界边缘", 休整: "据点的长夜" };
  const narrative = [
    `本周第${Math.min(6, (week % 5) + 1)}日清晨，${DISTRICT_SCENES[district.id] ?? district.background}。${actor}带着一份没有组织抬头的行动摘要进入${district.name}，其余成员按约定保持了两条街的距离。`,
    `行动严格围绕你写下的指令展开：“${order.brief}”这段话决定了队伍先接触谁、哪些问题不能问，以及在什么迹象出现时必须撤退。${member.specialty}成为本次行动最可靠的支点。`,
    success ? process.success : process.failure,
    newClue
      ? `临近收队时，一项可以被复核的事实终于从杂乱细节中浮现：${newClue}。它被单独誊写、编号并封入档案袋，没有人在现场尝试解释它的全部含义。`
      : success
        ? `行动取得了实质进展，但现有材料仍不足以形成新的可靠结论。队伍带回了时间记录、路线草图和证词摘要；它们会保留在证据链中，等待下一次交叉验证。`
        : `最终带回据点的只有部分记录和一份被迫中止的接触名单。失败没有被粉饰成发现，但至少确认了对手会对哪些问题产生反应。`,
    abilityName && abilityEffect ? `在最关键的节点，${actor}动用了${abilityName}。${abilityEffect}灵性的介入改变了行动结果，也在精神上留下了需要休息才能消退的疲惫。` : "",
  ].filter(Boolean);
  const findings = incident ? [
    newClue ? `新增可靠证据：${newClue}` : `本次未跨过新的线索阈值，既有进度已经保存`,
    `“${incident.title}”证据链预计由 ${incident.progress}% 推进至 ${nextProgress}%`,
    `已识别相关方：${incident.faction}；当前可信度：${confidenceFromProgress(nextProgress)}`,
  ] : ["完成基础街区踏查，暂未锁定具体异常事件", `建立了${district.name}的基础接触记录与撤离路线`];
  const consequence = success
    ? order.type === "仪式" ? "仪式带来了高价值指向，也制造了可被其他非凡者察觉的灵性波动。" : "行动维持在可控范围内；对手尚不能确认组织身份，但已经有人注意到新的调查者出现。"
    : order.type === "休整" ? "内部矛盾没有扩大，却暴露出成员在长期压力下的疲惫。" : "行动受阻使当地关系变得更谨慎，下一次接触需要更好的掩护或新的中间人。";
  const followUp = newClue
    ? `围绕“${newClue}”设计下一条指令：寻找独立证人、文件或实物进行交叉验证。`
    : incident && nextThreshold
      ? `证据链距离下一次可靠突破还差 ${nextThreshold - nextProgress}%；优先更换调查方法或让擅长${order.type}的成员继续跟进。`
      : incident ? "证据链已经接近完整，应考虑向可信势力提交材料、设局利用，或准备直接干预。" : `继续探索${district.name}，或等待新传闻将基础情报转化为正式事件。`;
  return {
    sceneTitle: `${sceneTitles[order.type] ?? "一次行动"} · ${incident?.title ?? district.name}`,
    narrative,
    testimony: voice ? { speaker: voice.speaker, words: success ? voice.open : voice.guarded } : undefined,
    findings,
    consequence,
    followUp,
  };
}

function worldMovementFor(incident: Incident, district: District) {
  const nextDeadline = Math.max(0, incident.deadline - 1);
  return {
    title: nextDeadline === 0 ? `${incident.title}越过临界点` : `${incident.title}仍在发展`,
    districtName: district.name,
    text: WORLD_SIGNS[incident.id] ?? `${incident.summary}由于没有受到干预，相关人员正在改变原有安排。`,
    severity: (nextDeadline === 0 || incident.urgency >= 65 ? "danger" : "watch") as "watch" | "danger",
  };
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewId>("situation");
  const [selectedDistrictId, setSelectedDistrictId] = useState("east");
  const [selectedMemberId, setSelectedMemberId] = useState("mara");
  const [actionType, setActionType] = useState("调查");
  const [brief, setBrief] = useState("暗中接触失踪工人的家属，核对他们最后出现的时间与地点。不要惊动警察。");
  const [abilityArmed, setAbilityArmed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [newGameStep, setNewGameStep] = useState(1);
  const [draftPathway, setDraftPathway] = useState<PathwayId>("seer");
  const [draftOrganization, setDraftOrganization] = useState<OrganizationId>("agency");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [toast, setToast] = useState("");
  const [undoOrderId, setUndoOrderId] = useState<string | null>(null);
  const [turnReport, setTurnReport] = useState<TurnReport | null>(null);
  const [showDistrictDetail, setShowDistrictDetail] = useState(false);
  const [showOrderComposer, setShowOrderComposer] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const savedAi = window.localStorage.getItem(`${STORAGE_KEY}-ai`);
      if (saved) {
        try {
          setGame(normalizeGameState(JSON.parse(saved) as GameState));
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      if (savedAi) {
        try {
          const config = JSON.parse(savedAi) as { endpoint?: string; apiKey?: string; model?: string };
          setEndpoint(config.endpoint ?? "");
          setApiKey(config.apiKey ?? "");
          setModel(config.model ?? "");
        } catch {
          window.localStorage.removeItem(`${STORAGE_KEY}-ai`);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast("");
      setUndoOrderId(null);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowSettings(false);
        setShowNewGame(false);
        setShowDistrictDetail(false);
        setShowOrderComposer(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) resolveWeek();
        else queueOrder();
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.target === document.body) {
        if (event.key === "1") setView("situation");
        if (event.key === "2") setView("organization");
        if (event.key === "3") setView("archive");
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  const selectedDistrict = game.districts.find((district) => district.id === selectedDistrictId) ?? game.districts[0];
  const districtIncidents = game.incidents.filter((incident) => incident.districtId === selectedDistrict.id);
  const selectedIncident = districtIncidents.find((incident) => incident.status === "active") ?? districtIncidents[0];
  const pathway = PATHWAYS[game.pathway];
  const organization = ORGANIZATIONS[game.organization];
  const playerMember: Member = {
    id: PLAYER_MEMBER_ID,
    name: "你 · 组织负责人",
    role: `${pathway.name} / 亲自带队`,
    sequence: `${pathway.sequence} · ${pathway.name}`,
    specialty: pathway.note,
    status: "空闲",
    trust: 100,
  };
  const operatives = [playerMember, ...game.members];
  const availableMembers = operatives.filter((member) => !game.orders.some((order) => order.memberId === member.id));
  const selectedMember = operatives.find((member) => member.id === selectedMemberId) ?? operatives[0];
  const activeMemberId = availableMembers.some((member) => member.id === selectedMemberId)
    ? selectedMemberId
    : availableMembers[0]?.id ?? "";
  const activeMember = game.members.find((member) => member.id === activeMemberId) ?? selectedMember;
  const canUseAbility = activeMemberId === PLAYER_MEMBER_ID && game.spirituality > 0;
  const abilityIsActive = abilityArmed && canUseAbility;
  const activeIncidents = game.incidents.filter((incident) => incident.status === "active");
  const urgentIncident = [...activeIncidents].sort((a, b) => a.deadline - b.deadline || b.urgency - a.urgency)[0];
  const missingWorkersIncident = activeIncidents.find((incident) => incident.id === "missing-workers");
  const formulaIncident = activeIncidents.find((incident) => incident.id === "black-market-formula");
  const conspiracyIncidentIds = ["missing-workers", "south-fever", "sealed-cargo", "parliament-whisper"];
  const conspiracyProgress = Math.round(
    game.incidents.filter((incident) => conspiracyIncidentIds.includes(incident.id)).reduce((sum, incident) => sum + incident.progress, 0) / conspiracyIncidentIds.length,
  );

  const situationScore = useMemo(() => {
    return Math.round((game.intel + game.concealment + game.stability) / 3);
  }, [game.intel, game.concealment, game.stability]);

  const planForecast = useMemo(() => {
    const profile = ACTION_PROFILES[actionType] ?? ACTION_PROFILES.调查;
    const favoredAbility = pathway.favoredActions.includes(actionType);
    const abilityBonus = abilityIsActive ? (favoredAbility ? pathway.thresholdBonus : Math.floor(pathway.thresholdBonus / 2)) : 0;
    const threshold = calculateThreshold(activeMember, selectedDistrict, actionType, brief, abilityBonus);
    return {
      threshold,
      risk: threshold >= 70 ? "较稳妥" : threshold >= 52 ? "存在风险" : "高风险",
      profile,
      progress: profile.progress + (abilityIsActive ? pathway.progressBonus : 0),
      abilityBonus,
    };
  }, [abilityIsActive, actionType, activeMember, brief, pathway, selectedDistrict]);

  function queueOrder() {
    if (!brief.trim() || game.actionPoints <= 0 || !activeMemberId) return;
    const order: Order = {
      id: `order-${Date.now()}`,
      type: actionType,
      memberId: activeMemberId,
      districtId: selectedDistrict.id,
      brief: brief.trim(),
      useAbility: abilityIsActive,
    };
    setGame((current) => ({
      ...current,
      actionPoints: current.actionPoints - 1,
      spirituality: abilityIsActive ? Math.max(0, current.spirituality - 1) : current.spirituality,
      orders: [...current.orders, order],
    }));
    setBrief("");
    setAbilityArmed(false);
    setUndoOrderId(order.id);
    setToast("指令已加入本周计划");
  }

  function removeOrder(orderId: string) {
    const removedOrder = game.orders.find((order) => order.id === orderId);
    setGame((current) => ({
      ...current,
      actionPoints: Math.min(3, current.actionPoints + 1),
      spirituality: removedOrder?.useAbility ? Math.min(3, current.spirituality + 1) : current.spirituality,
      orders: current.orders.filter((order) => order.id !== orderId),
    }));
    if (undoOrderId === orderId) setUndoOrderId(null);
  }

  function prepareSuggestedAction(incident: Incident, nextAction: string, suggestedBrief: string) {
    setSelectedDistrictId(incident.districtId);
    setActionType(nextAction);
    setBrief(suggestedBrief);
    setView("situation");
    setShowDistrictDetail(false);
    setShowOrderComposer(true);
  }

  function resolveWeek() {
    const orders = game.orders;
    const entries: ChronicleEntry[] = [];
    const results: TurnResult[] = [];
    let moneyDelta = -18;
    let intelDelta = 0;
    let concealmentDelta = 0;
    let stabilityDelta = 0;
    const progressByIncident: Record<string, number> = {};
    const revealedByIncident: Record<string, number> = Object.fromEntries(game.incidents.map((incident) => [incident.id, incident.revealedClues]));

    if (orders.length === 0) {
      entries.push({
        id: `quiet-${game.week}`,
        week: game.week,
        title: "谨慎的一周",
        text: "组织没有执行重点行动。成员维持日常掩护，街巷中的暗流仍在继续。",
        tone: "neutral",
      });
      concealmentDelta += 3;
      stabilityDelta += 2;
    }

    orders.forEach((order, index) => {
      const member = operatives.find((item) => item.id === order.memberId) ?? selectedMember;
      const district = game.districts.find((item) => item.id === order.districtId) ?? selectedDistrict;
      const incident = game.incidents.find((item) => item.districtId === order.districtId && item.status === "active");
      const profile = ACTION_PROFILES[order.type] ?? ACTION_PROFILES.调查;
      const abilityUsed = order.useAbility && member.id === PLAYER_MEMBER_ID;
      const favoredAbility = pathway.favoredActions.includes(order.type);
      const abilityBonus = abilityUsed ? (favoredAbility ? pathway.thresholdBonus : Math.floor(pathway.thresholdBonus / 2)) : 0;
      const roll = numberHash(`${game.week}:${order.memberId}:${order.districtId}:${order.type}:${order.brief}`) % 100;
      const threshold = calculateThreshold(member, district, order.type, order.brief, abilityBonus);
      const success = roll < threshold;
      const baseProgress = profile.progress + (abilityUsed ? pathway.progressBonus : 0);
      const progressDelta = incident ? (success ? baseProgress : Math.max(2, Math.floor(baseProgress * .3))) : 0;
      let newClue: string | undefined;

      moneyDelta -= profile.cost;
      intelDelta += success ? profile.intel + (abilityUsed ? pathway.intelBonus : 0) : Math.min(2, profile.intel);
      const exposure = profile.exposure + (abilityUsed ? pathway.exposureModifier : 0);
      concealmentDelta -= success ? exposure : exposure + 2;
      stabilityDelta += order.type === "休整" ? (success ? 5 : 2) : success ? 0 : order.type === "仪式" ? -4 : -2;
      if (incident) {
        const previousProgress = incident.progress + (progressByIncident[incident.id] ?? 0);
        const nextProgress = Math.min(100, previousProgress + progressDelta);
        progressByIncident[incident.id] = (progressByIncident[incident.id] ?? 0) + progressDelta;
        const unlockedCount = [25, 50, 75, 95].filter((thresholdValue) => thresholdValue <= nextProgress).length;
        const previousRevealed = revealedByIncident[incident.id] ?? 0;
        if (unlockedCount > previousRevealed) {
          newClue = incident.clues[unlockedCount - 1];
          revealedByIncident[incident.id] = unlockedCount;
        }
      }

      const baseDetail = actionDetail(order.type, success, member.name, district.name);
      const abilityEffect = abilityUsed ? abilityResolutionText(pathway, order.type) : undefined;
      const detail = abilityEffect ? `${baseDetail} ${abilityEffect}` : baseDetail;
      const narrativeResult = buildNarrativeResult({
        week: game.week,
        order,
        member,
        district,
        incident,
        success,
        progressDelta,
        newClue,
        abilityName: abilityUsed ? pathway.activeName : undefined,
        abilityEffect,
      });
      results.push({
        id: order.id,
        memberName: member.name,
        actionType: order.type,
        districtName: district.name,
        success,
        score: roll,
        threshold,
        detail,
        progressDelta,
        newClue,
        abilityName: abilityUsed ? pathway.activeName : undefined,
        abilityEffect,
        orderBrief: order.brief,
        incidentTitle: incident?.title,
        ...narrativeResult,
      });

      entries.push({
        id: `week-${game.week}-${index}`,
        week: game.week,
        title: `${member.name} · ${order.type}${success ? "取得进展" : "遭遇阻力"}`,
        text: newClue ? `${detail} 新线索：${newClue}` : detail,
        tone: success ? "good" : "warn",
      });
    });

    const nextWeek = game.week + 1;
    const discoveredClues = results.filter((result) => result.newClue).length;
    const successfulActions = results.filter((result) => result.success).length;
    const worldMoves = game.incidents
      .filter((incident) => incident.status === "active" && !progressByIncident[incident.id])
      .sort((a, b) => a.deadline - b.deadline || b.urgency - a.urgency)
      .slice(0, 3)
      .map((incident) => worldMovementFor(incident, game.districts.find((district) => district.id === incident.districtId) ?? selectedDistrict));
    const prelude = orders.length > 0 ? [
      `贝克兰德的这一周从一场持续到午后的冷雨开始。雾沿塔索克河向城区内部推进，报童仍在街角高喊着与普通人生活有关的消息，没有一张报纸知道你的组织在同一时间送出了 ${orders.length} 份秘密指令。`,
      `每份指令只交给对应的执行者。暗号、备用会面地点和最晚返回时间被分别写在不同纸条上，阅后投入壁炉。到周末，${successfulActions}支队伍带回了可以继续使用的结果，${orders.length - successfulActions}项行动则留下了必须正视的代价。`,
    ] : [
      "这一周，组织没有派出重点行动。乔伍德区据点的窗帘按时拉开，账簿、委托和日常来客让一切看上去正常得近乎乏味。",
      "然而贝克兰德不会因为你的沉默而停下。货物继续入港，名单继续被誊写，失踪者的床铺被新的租客占据；没有进入档案的事情，仍在雾后自行发展。",
    ];
    const closing = discoveredClues > 0
      ? `周日深夜，${discoveredClues}份新证据被锁进据点内侧的铁柜。成员们没有庆祝——每一条得到确认的线索，都让那些原本可以被称为巧合的事件更像一项长期安排。`
      : successfulActions > 0
        ? "周日的复盘会议持续了一个小时。没有足以改变局势的单一发现，但地图上的铅笔线比上周更清楚；组织至少知道下一次应该把手伸向哪里。"
        : "周日夜里，壁炉中的火提前熄灭。没有人受伤，也没有人失踪，可桌上那些没有得到回答的问题显得比一周前更加沉重。";
    setGame((current) => ({
      ...current,
      week: nextWeek,
      date: nextDate(nextWeek - 1),
      actionPoints: 3,
      money: Math.max(0, current.money + moneyDelta),
      intel: Math.min(100, Math.max(0, current.intel + intelDelta)),
      concealment: Math.min(100, Math.max(0, current.concealment + concealmentDelta)),
      stability: Math.min(100, Math.max(0, current.stability + stabilityDelta)),
      spirituality: Math.min(3, current.spirituality + 1),
      orders: [],
      incidents: current.incidents.map((incident) => {
        const wasAddressed = Boolean(progressByIncident[incident.id]);
        const progress = Math.min(100, incident.progress + (progressByIncident[incident.id] ?? 0));
        const deadline = incident.status === "resolved" ? incident.deadline : Math.max(0, incident.deadline - 1);
        return {
          ...incident,
          progress,
          deadline,
          urgency: incident.status === "resolved" ? incident.urgency : Math.min(100, Math.max(0, incident.urgency + (wasAddressed ? -3 : deadline === 0 ? 10 : 4))),
          confidence: confidenceFromProgress(progress),
          revealedClues: Math.max(incident.revealedClues, revealedByIncident[incident.id] ?? 0),
          status: progress >= 100 ? "resolved" : incident.status,
        };
      }),
      chronicle: [...entries, ...current.chronicle].slice(0, 40),
    }));
    setTurnReport({
      week: game.week,
      date: game.date,
      headline: discoveredClues > 0 ? `发现 ${discoveredClues} 条关键线索` : successfulActions > 0 ? `${successfulActions} 项行动取得进展` : "世界在沉默中继续运转",
      summary: orders.length === 0
        ? "组织选择保持低调。隐秘度与稳定有所恢复，但所有未处理事件的紧迫度都在上升。"
        : `本周执行${orders.length}项重点行动，${successfulActions}项成功。${discoveredClues > 0 ? "新的证据已经写入调查档案。" : "尚未跨过新的证据阈值，但已有进度会被保留。"}`,
      results,
      deltas: { money: moneyDelta, intel: intelDelta, concealment: concealmentDelta, stability: stabilityDelta },
      prelude,
      worldMoves,
      closing,
    });
    setToast(`第${game.week}周结算完成`);
  }

  function startNewGame() {
    setGame(createInitialState(draftPathway, draftOrganization));
    setSelectedDistrictId("east");
    setShowNewGame(false);
    setNewGameStep(1);
    setToast("新的历史分支已经建立");
  }

  function saveAiSettings() {
    window.localStorage.setItem(`${STORAGE_KEY}-ai`, JSON.stringify({ endpoint, apiKey, model }));
    setShowSettings(false);
    setToast(endpoint && model ? "模型配置已保存在本机" : "已启用离线叙事模式");
  }

  return (
    <main className="game-shell">
      <a className="skip-link" href="#game-content">跳到主要内容</a>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Eye size={20} strokeWidth={1.5} /></div>
          <div>
            <p className="eyebrow">诡秘之主 · 同人推演原型</p>
            <h1>灰雾纪事</h1>
          </div>
        </div>
        <div className="date-block">
          <span>第 {game.week} 周</span>
          <strong>{game.date}</strong>
          <small>世界线偏转：0.7%</small>
        </div>
        <div className="header-actions">
          <button className="icon-button has-tooltip" onClick={() => { setNewGameStep(1); setShowNewGame(true); }} aria-label="建立新的历史分支" data-tooltip="新游戏">
            <RotateCcw size={17} />
          </button>
          <button className="icon-button has-tooltip" onClick={() => setShowSettings(true)} aria-label="模型与游戏设置" data-tooltip="设置">
            <Settings size={17} />
          </button>
        </div>
      </header>

      <nav className="section-tabs" aria-label="主要页面">
        <button className={view === "situation" ? "active" : ""} onClick={() => setView("situation")}>
          <LayoutDashboard size={16} /><span>局势</span><kbd>1</kbd>
        </button>
        <button className={view === "organization" ? "active" : ""} onClick={() => setView("organization")}>
          <UsersRound size={16} /><span>组织</span><kbd>2</kbd>
        </button>
        <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>
          <Archive size={16} /><span>档案</span><kbd>3</kbd>
        </button>
        <span className="autosave"><i /> 已保存到本机</span>
        <span className="shortcut-hint"><Command size={12} /> Enter 下达指令</span>
      </nav>

      {view === "situation" && (
        <div className="command-grid map-first-grid" id="game-content">
          <section className="panel mission-control" aria-labelledby="mission-title">
            <div className="mission-context">
              <p className="eyebrow icon-eyebrow"><Compass size={12} /> 当前状况 · 原著时间线尚未偏转</p>
              <h2 id="mission-title">廷根的故事刚刚开始，你拥有一段提前布局的时间</h2>
              <p>克莱恩·莫雷蒂于今晨苏醒，尚未抵达贝克兰德。你的无许可组织已经在首都站稳脚跟，却同时捕捉到人口失踪、异常药品与可疑货运三条彼此呼应的暗线。现在的任务不是“知道原著答案”，而是把怀疑变成能够影响教会与政府的证据。</p>
              <div className="stage-tags"><span>发展阶段：秘密立足</span><span>行动点：{game.actionPoints} / 3</span><span>活跃异常：{activeIncidents.length}</span></div>
            </div>

            <div className="objective-board">
              <div className="primary-objective">
                <div className="objective-title"><Target size={16} /><span><small>本局主目标</small><strong>在大雾霾前揭开人口阴谋</strong></span></div>
                <p>串联东区失踪者、南区异常药品、码头密封货物与政府迁移记录，取得足以采取行动的证据。</p>
                <div className="objective-progress"><span><i style={{ width: `${conspiracyProgress}%` }} /></span><strong>{conspiracyProgress}%</strong></div>
              </div>
              <div className="urgent-objective">
                <span className="objective-kicker">最近期限</span>
                {urgentIncident ? (
                  <>
                    <strong>{urgentIncident.title}</strong>
                    <small>{urgentIncident.deadline} 周后恶化 · 风险 {urgentIncident.urgency}</small>
                  </>
                ) : <strong>当前公开异常已全部处理</strong>}
              </div>
            </div>

            <div className="next-actions">
              <div className="next-actions-heading"><BookOpen size={14} /><span><strong>行动建议</strong><small>点击即可填入行动计划</small></span></div>
              {urgentIncident && (
                <button onClick={() => prepareSuggestedAction(urgentIncident, "调查", `先确认“${urgentIncident.title}”中最可靠的目击记录，标记风险来源并准备安全撤离路线。`)}>
                  <b>01</b><span><strong>处理最近期限</strong><small>{urgentIncident.title} · {urgentIncident.deadline}周</small></span><ChevronRight size={15} />
                </button>
              )}
              {missingWorkersIncident && (
                <button onClick={() => prepareSuggestedAction(missingWorkersIncident, "调查", "暗中接触失踪工人的家属，核对最后出现的时间、地点与共同联系人，不惊动警察。") }>
                  <b>02</b><span><strong>推进主线证据</strong><small>从东区人口失踪切入</small></span><ChevronRight size={15} />
                </button>
              )}
              {formulaIncident && (
                <button onClick={() => prepareSuggestedAction(formulaIncident, "研究", "比对被涂改配方的墨水、材料与原始抄本，确认它是否是陷阱并追查来源。") }>
                  <b>03</b><span><strong>获取晋升资源线</strong><small>研究被涂改的魔药配方</small></span><ChevronRight size={15} />
                </button>
              )}
            </div>
          </section>

          <section className="panel map-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">城市态势</p>
                <h2>贝克兰德</h2>
              </div>
              <div className="map-heading-actions"><span className="map-hint"><MapPin size={12} /> 点击城区查看档案</span><span className="weather"><CloudFog size={13} /> 薄雾 · 12°C</span></div>
            </div>

            <div className="map-field detailed-map" aria-label="贝克兰德十城区交互地图">
              <div className="map-shade" />
              {game.districts.map((district) => {
                const activeCases = game.incidents.filter((incident) => incident.districtId === district.id && incident.status === "active").length;
                return (
                  <button
                    key={district.id}
                    style={{ left: `${district.x}%`, top: `${district.y}%` } as React.CSSProperties}
                    className={`district map-district ${district.size} ${district.tone} ${selectedDistrict.id === district.id ? "selected" : ""}`}
                    onClick={() => { setSelectedDistrictId(district.id); setShowDistrictDetail(true); }}
                    aria-label={`${district.name}，危险${district.danger}，${activeCases}件调查事件`}
                  >
                    <span className="district-pulse" />
                    <strong>{district.name}</strong>
                    {activeCases > 0 && <small>{activeCases} 件调查</small>}
                  </button>
                );
              })}
              <span className="map-river-label">塔索克河</span>
              <span className="map-compass">N<br />↑</span>
              <div className="map-legend">
                <span><i className="legend-safe" /> 可控</span>
                <span><i className="legend-watch" /> 关注</span>
                <span><i className="legend-danger" /> 高危</span>
              </div>
            </div>

            <div className="district-summary">
              <div>
                <p className="eyebrow">当前区域</p>
                <h3><MapPin size={14} /> {selectedDistrict.name}</h3>
                <small>{selectedDistrict.subtitle}</small>
              </div>
              <div className="mini-stat"><span>危险</span><strong>{selectedDistrict.danger}</strong></div>
              <div className="mini-stat"><span>影响</span><strong>{selectedDistrict.influence}</strong></div>
              <div className="mini-stat"><span>情报</span><strong>{selectedDistrict.intel}</strong></div>
            </div>
            <div className="district-background">
              <div className="district-lore">
                <span className="lore-heading"><BookOpen size={13} /> 区域背景</span>
                <p>{selectedDistrict.background}</p>
                <div className="landmark-list">{selectedDistrict.landmarks.map((landmark) => <span key={landmark}>{landmark}</span>)}</div>
              </div>
              <div className="district-intel-note opportunity"><strong>可利用</strong><p>{selectedDistrict.opportunity}</p></div>
              <div className="district-intel-note warning"><strong>注意</strong><p>{selectedDistrict.warning}</p></div>
            </div>
          </section>

          <section className="center-stack">
            <article className="panel incident-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow icon-eyebrow"><ShieldAlert size={12} /> 本周焦点 · {selectedIncident?.confidence ?? "未知"}</p>
                  <h2>{selectedIncident?.title ?? "暂无线索"}</h2>
                </div>
                <span className={`risk-badge ${(selectedIncident?.urgency ?? 0) > 60 ? "high" : "medium"}`}>
                  风险 {selectedIncident?.urgency ?? 0}
                </span>
              </div>
              <p className="incident-copy">{selectedIncident?.summary ?? "这个城区暂时没有进入组织视野的异常。"}</p>
              <div className="evidence-track">
                <div className="track-label"><span>证据链</span><strong>{selectedIncident?.progress ?? 0}%</strong></div>
                <div className="track"><i style={{ width: `${selectedIncident?.progress ?? 0}%` }} /></div>
              </div>
              <div className="clue-row">
                <span>相关方：{selectedIncident?.faction ?? "尚未识别"}</span>
                <span>可信度：{selectedIncident?.confidence ?? "未知"}</span>
                <span>剩余窗口：{selectedIncident?.deadline ?? "—"} 周</span>
              </div>
              {selectedIncident && (
                <div className="revealed-clues">
                  <div className="clues-heading"><Lightbulb size={14} /><span>已掌握线索</span><strong>{selectedIncident.revealedClues} / {selectedIncident.clues.length}</strong></div>
                  {selectedIncident.revealedClues > 0 ? (
                    selectedIncident.clues.slice(0, selectedIncident.revealedClues).map((clue, index) => <p key={clue}><i>0{index + 1}</i>{clue}</p>)
                  ) : (
                    <p className="unknown-clue"><i>?</i>推进调查至25%即可获得第一条可靠线索</p>
                  )}
                </div>
              )}
              <button className="disclosure-button" onClick={() => setView("archive")}>
                查看证据与事件记录 <ChevronRight size={15} />
              </button>
            </article>

            <article className="panel order-panel" id="order-composer">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">重点指令</p>
                  <h2>安排本周行动</h2>
                </div>
                <div className="action-points" aria-label={`剩余${game.actionPoints}个行动点`}>
                  {[0, 1, 2].map((point) => <i key={point} className={point < game.actionPoints ? "filled" : ""} />)}
                </div>
              </div>

              <div className="order-controls">
                <label>
                  <span>行动类型</span>
                  <select value={actionType} onChange={(event) => setActionType(event.target.value)}>
                    {Object.keys(ACTION_PROFILES).map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>执行成员</span>
                  <select value={activeMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} disabled={!availableMembers.length}>
                    {availableMembers.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}
                  </select>
                </label>
              </div>
              <div className={`plan-forecast ${planForecast.threshold >= 70 ? "good" : planForecast.threshold >= 52 ? "warn" : "danger"}`}>
                <div><Search size={15} /><span>{planForecast.profile.label}</span></div>
                <dl>
                  <div><dt>预估成功</dt><dd>{planForecast.threshold}% · {planForecast.risk}</dd></div>
                  <div><dt>预计推进</dt><dd>成功 +{planForecast.progress}%</dd></div>
                  <div><dt>行动成本</dt><dd>£ {planForecast.profile.cost}</dd></div>
                </dl>
              </div>
              <div className={`ability-control ${abilityIsActive ? "armed" : ""} ${!canUseAbility ? "locked" : ""}`}>
                <div className="ability-icon"><Zap size={18} /></div>
                <div className="ability-copy">
                  <div><span>途径主动能力</span><strong>{pathway.activeName}</strong></div>
                  <p>{pathway.activeDescription}</p>
                  <small>擅长：{pathway.favoredActions.join(" / ")} · 本周灵性 {game.spirituality} / 3</small>
                </div>
                {activeMemberId === PLAYER_MEMBER_ID ? (
                  <button
                    className="ability-toggle"
                    onClick={() => setAbilityArmed((current) => !current)}
                    disabled={!canUseAbility}
                    aria-pressed={abilityIsActive}
                  >
                    {abilityIsActive ? "已启用" : game.spirituality > 0 ? "消耗1灵性" : "灵性耗尽"}
                  </button>
                ) : (
                  <button
                    className="ability-toggle"
                    onClick={() => { setSelectedMemberId(PLAYER_MEMBER_ID); setAbilityArmed(true); }}
                    disabled={!availableMembers.some((member) => member.id === PLAYER_MEMBER_ID) || game.spirituality <= 0}
                  >负责人亲自出动</button>
                )}
              </div>
              <label className="brief-field">
                <span>具体计划</span>
                <textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="描述目标、方法、底线和撤退条件……"
                  maxLength={280}
                />
                <small>{brief.length}/280 · 计划越具体，准备加成越高</small>
              </label>
              <button className="primary-button" onClick={queueOrder} disabled={!brief.trim() || game.actionPoints <= 0 || !availableMembers.length}>
                <span className="button-label">下达指令 <small>消耗1行动点</small></span>
                <ArrowRight size={17} />
              </button>
            </article>

            {game.orders.length > 0 && (
              <article className="panel queue-panel">
                <p className="eyebrow">待执行计划</p>
                {game.orders.map((order, index) => {
                  const member = operatives.find((item) => item.id === order.memberId);
                  return (
                    <div className="queued-order" key={order.id}>
                      <span className="queue-index">0{index + 1}</span>
                      <div><strong>{order.type} · {member?.name}{order.useAbility ? ` · ${pathway.activeName}` : ""}</strong><p>{order.brief}</p></div>
                      <button onClick={() => removeOrder(order.id)} aria-label="撤销指令"><X size={15} /></button>
                    </div>
                  );
                })}
              </article>
            )}
          </section>

          <aside className="right-stack">
            <section className="panel map-objective-card">
              <p className="eyebrow icon-eyebrow"><Compass size={12} /> 当前阶段 · 秘密立足</p>
              <h2>提前布局贝克兰德</h2>
              <p>克莱恩刚在廷根苏醒。你需要把人口失踪、异常药品和可疑货运串成能够影响官方的证据。</p>
              <div className="map-goal-row"><span><Target size={14} /> 大雾霾阴谋</span><strong>{conspiracyProgress}%</strong></div>
              <div className="objective-progress"><span><i style={{ width: `${conspiracyProgress}%` }} /></span></div>
              {urgentIncident && <button className="urgent-map-action" onClick={() => { setSelectedDistrictId(urgentIncident.districtId); setShowDistrictDetail(true); }}><span><small>最近期限 · {urgentIncident.deadline}周</small><strong>{urgentIncident.title}</strong></span><ChevronRight size={16} /></button>}
            </section>

            <section className="panel organization-card">
              <div className="organization-seal">鸦</div>
              <p className="eyebrow icon-eyebrow"><Building2 size={12} /> 当前组织</p>
              <h2>{organization.name}</h2>
              <p className="muted">{organization.cover}</p>
              <div className="resource-list">
                <div><span>可用资金</span><strong>£ {game.money}</strong></div>
                <div><span>情报储备</span><strong>{game.intel}</strong></div>
                <div><span>隐秘度</span><strong>{game.concealment}</strong></div>
                <div><span>组织稳定</span><strong>{game.stability}</strong></div>
                <div><span>负责人灵性</span><strong>{game.spirituality} / 3</strong></div>
              </div>
              <div className="situation-ring" style={{ "--score": `${situationScore * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{situationScore}</strong><span>综合态势</span></div>
              </div>
            </section>

            <section className="panel player-card">
              <div className="panel-heading compact">
                <div><p className="eyebrow">负责人</p><h2>无名的记录者</h2></div>
                <span className="sequence-badge">{pathway.sequence}</span>
              </div>
              <div className="pathway-line"><span>{pathway.name}</span><strong>{pathway.ability}</strong></div>
              <p className="muted">{pathway.note}</p>
              <div className="player-ability-summary"><Zap size={14} /><span><small>可用能力</small><strong>{pathway.activeName}</strong></span></div>
              <button className="secondary-button" onClick={() => { setSelectedMemberId(PLAYER_MEMBER_ID); setAbilityArmed(true); setShowOrderComposer(true); }} disabled={game.spirituality <= 0 || !availableMembers.some((member) => member.id === PLAYER_MEMBER_ID)}>亲自带队并启用能力</button>
            </section>

            <button className="open-orders-button" onClick={() => setShowOrderComposer(true)}>
              <span><small>本周行动</small><strong>{game.orders.length > 0 ? `已安排 ${game.orders.length} / 3` : "尚未安排指令"}</strong></span><ArrowRight size={18} />
            </button>

            <button className="turn-button" onClick={resolveWeek}>
              <span><small>世界将同步推进 · ⇧⌘ Enter</small>结束本周</span>
              <ArrowRight size={22} />
            </button>
          </aside>
        </div>
      )}

      {showDistrictDetail && view === "situation" && (
        <div className="district-drawer-backdrop" role="presentation" onMouseDown={() => setShowDistrictDetail(false)}>
          <aside className="district-drawer" role="dialog" aria-modal="true" aria-labelledby="district-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowDistrictDetail(false)} aria-label="关闭区域档案"><X size={18} /></button>
            <header className="district-drawer-header">
              <p className="eyebrow"><MapPin size={11} /> 区域档案</p>
              <h2 id="district-drawer-title">{selectedDistrict.name}</h2>
              <span>{selectedDistrict.subtitle}</span>
              <div className="drawer-stats">
                <div><small>危险</small><strong>{selectedDistrict.danger}</strong></div>
                <div><small>影响</small><strong>{selectedDistrict.influence}</strong></div>
                <div><small>情报</small><strong>{selectedDistrict.intel}</strong></div>
                <div><small>进行中</small><strong>{districtIncidents.filter((incident) => incident.status === "active").length}</strong></div>
              </div>
            </header>

            <section className="drawer-lore">
              <h3><BookOpen size={14} /> 区域背景</h3>
              <p>{selectedDistrict.background}</p>
              <div className="landmark-list">{selectedDistrict.landmarks.map((landmark) => <span key={landmark}>{landmark}</span>)}</div>
              <div className="drawer-notes"><p><strong>可利用</strong>{selectedDistrict.opportunity}</p><p><strong>注意</strong>{selectedDistrict.warning}</p></div>
            </section>

            <section className="drawer-cases">
              <div className="drawer-section-heading"><span><ShieldAlert size={14} /> 区域线索</span><small>{districtIncidents.length} 件档案</small></div>
              {districtIncidents.length > 0 ? districtIncidents.map((incident) => (
                <article className="drawer-case" key={incident.id}>
                  <div className="drawer-case-title"><span><small>{incident.confidence} · {incident.faction}</small><strong>{incident.title}</strong></span><b className={incident.urgency > 60 ? "high" : ""}>风险 {incident.urgency}</b></div>
                  <p>{incident.summary}</p>
                  <div className="case-progress"><span><i style={{ width: `${incident.progress}%` }} /></span><strong>{incident.progress}%</strong><small>剩余 {incident.deadline} 周</small></div>
                  <div className="drawer-clues">
                    {incident.revealedClues > 0 ? incident.clues.slice(0, incident.revealedClues).map((clue, index) => <p key={clue}><i>0{index + 1}</i>{clue}</p>) : <p className="unknown-clue"><i>?</i>尚无可靠线索，调查推进至25%后揭示</p>}
                  </div>
                  {incident.status === "active" && <div className="case-actions"><button onClick={() => prepareSuggestedAction(incident, "调查", `围绕“${incident.title}”核对目击记录与现场痕迹，优先确认最可靠的线索，并准备撤离路线。`)}>安排调查</button><button onClick={() => prepareSuggestedAction(incident, "研究", `整理“${incident.title}”现有材料，使用档案和神秘学知识验证异常来源。`)}>研究材料</button></div>}
                </article>
              )) : (
                <div className="empty-district-case"><Search size={20} /><p>组织尚未在这里发现公开异常。你仍可主动探索，建立当地情报来源。</p><button onClick={() => { setActionType("调查"); setBrief(`派人熟悉${selectedDistrict.name}的街区、重要人物与异常传闻，建立基础情报地图。`); setShowDistrictDetail(false); setShowOrderComposer(true); }}>探索该区</button></div>
              )}
            </section>
            <button className="drawer-archive-link" onClick={() => { setShowDistrictDetail(false); setView("archive"); }}><Archive size={14} /> 查看全部调查档案</button>
          </aside>
        </div>
      )}

      {showOrderComposer && view === "situation" && (
        <div className="modal-backdrop order-sheet-backdrop" role="presentation" onMouseDown={() => setShowOrderComposer(false)}>
          <section className="modal order-sheet" role="dialog" aria-modal="true" aria-labelledby="order-sheet-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowOrderComposer(false)} aria-label="关闭行动编排"><X size={18} /></button>
            <div className="order-sheet-header">
              <p className="eyebrow">重点指令 · {selectedDistrict.name}</p>
              <h2 id="order-sheet-title">安排本周行动</h2>
              <div className="action-points" aria-label={`剩余${game.actionPoints}个行动点`}>{[0, 1, 2].map((point) => <i key={point} className={point < game.actionPoints ? "filled" : ""} />)}</div>
            </div>
            <div className="order-controls">
              <label><span>行动类型</span><select value={actionType} onChange={(event) => setActionType(event.target.value)}>{Object.keys(ACTION_PROFILES).map((type) => <option key={type}>{type}</option>)}</select></label>
              <label><span>执行成员</span><select value={activeMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} disabled={!availableMembers.length}>{availableMembers.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}</select></label>
            </div>
            <div className={`plan-forecast ${planForecast.threshold >= 70 ? "good" : planForecast.threshold >= 52 ? "warn" : "danger"}`}>
              <div><Search size={15} /><span>{planForecast.profile.label}</span></div>
              <dl><div><dt>预估成功</dt><dd>{planForecast.threshold}% · {planForecast.risk}</dd></div><div><dt>预计推进</dt><dd>成功 +{planForecast.progress}%</dd></div><div><dt>行动成本</dt><dd>£ {planForecast.profile.cost}</dd></div></dl>
            </div>
            <div className={`ability-control ${abilityIsActive ? "armed" : ""} ${!canUseAbility ? "locked" : ""}`}>
              <div className="ability-icon"><Zap size={18} /></div>
              <div className="ability-copy"><div><span>途径主动能力</span><strong>{pathway.activeName}</strong></div><p>{pathway.activeDescription}</p><small>擅长：{pathway.favoredActions.join(" / ")} · 灵性 {game.spirituality} / 3</small></div>
              {activeMemberId === PLAYER_MEMBER_ID ? <button className="ability-toggle" onClick={() => setAbilityArmed((current) => !current)} disabled={!canUseAbility} aria-pressed={abilityIsActive}>{abilityIsActive ? "已启用" : game.spirituality > 0 ? "消耗1灵性" : "灵性耗尽"}</button> : <button className="ability-toggle" onClick={() => { setSelectedMemberId(PLAYER_MEMBER_ID); setAbilityArmed(true); }} disabled={!availableMembers.some((member) => member.id === PLAYER_MEMBER_ID) || game.spirituality <= 0}>负责人亲自出动</button>}
            </div>
            <label className="brief-field"><span>具体计划</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="描述目标、方法、底线和撤退条件……" maxLength={280} /><small>{brief.length}/280 · 计划越具体，准备加成越高</small></label>
            <button className="primary-button" onClick={queueOrder} disabled={!brief.trim() || game.actionPoints <= 0 || !availableMembers.length}><span className="button-label">下达指令 <small>消耗1行动点</small></span><ArrowRight size={17} /></button>
            {game.orders.length > 0 && <div className="order-sheet-queue"><div className="drawer-section-heading"><span>待执行计划</span><small>{game.orders.length} / 3</small></div>{game.orders.map((order, index) => { const member = operatives.find((item) => item.id === order.memberId); return <div className="queued-order" key={order.id}><span className="queue-index">0{index + 1}</span><div><strong>{order.type} · {member?.name}{order.useAbility ? ` · ${pathway.activeName}` : ""}</strong><p>{order.brief}</p></div><button onClick={() => removeOrder(order.id)} aria-label="撤销指令"><X size={15} /></button></div>; })}</div>}
          </section>
        </div>
      )}

      {view === "organization" && (
        <div className="secondary-view">
          <section className="panel roster-panel">
            <div className="panel-heading"><div><p className="eyebrow">核心成员</p><h2>{organization.name}</h2></div><span className="weather">4 / 6 席位</span></div>
            <div className="member-grid">
              {game.members.map((member) => (
                <article className="member-card" key={member.id}>
                  <div className="member-avatar">{member.name.slice(0, 1)}</div>
                  <div className="member-info"><h3>{member.name}</h3><p>{member.role}</p></div>
                  <span className="member-sequence">{member.sequence}</span>
                  <div className="member-detail"><span>专长</span><strong>{member.specialty}</strong></div>
                  <div className="member-detail"><span>关系判断</span><strong>{member.trust >= 70 ? "信任" : member.trust >= 60 ? "合作稳定" : "有所保留"}</strong></div>
                  <button className="text-button">查看档案与对话 →</button>
                </article>
              ))}
            </div>
          </section>
          <aside className="panel doctrine-panel">
            <p className="eyebrow">长期政策</p>
            <h2>谨慎调查</h2>
            <p>成员优先保全身份，遇到未知非凡者时不主动交战，并在午夜前返回据点。</p>
            <div className="doctrine-item"><span>撤退阈值</span><strong>中等风险</strong></div>
            <div className="doctrine-item"><span>情报共享</span><strong>核心成员</strong></div>
            <div className="doctrine-item"><span>对教会态度</span><strong>保持距离</strong></div>
            <button className="secondary-button">调整组织政策</button>
          </aside>
        </div>
      )}

      {view === "archive" && (
        <div className="secondary-view archive-view">
          <section className="panel chronicle-panel">
            <div className="panel-heading"><div><p className="eyebrow">世界记忆</p><h2>组织编年史</h2></div><span className="weather">{game.chronicle.length} 条记录</span></div>
            <div className="timeline">
              {game.chronicle.map((entry) => (
                <article key={entry.id} className={`timeline-entry ${entry.tone}`}>
                  <span className="timeline-week">W{entry.week}</span>
                  <div><h3>{entry.title}</h3><p>{entry.text}</p></div>
                </article>
              ))}
            </div>
          </section>
          <aside className="panel evidence-index">
            <p className="eyebrow">证据索引</p>
            <h2>当前调查</h2>
            {game.incidents.map((incident) => (
              <button key={incident.id} onClick={() => { setSelectedDistrictId(incident.districtId); setView("situation"); }}>
                <span>{incident.confidence}</span>
                <strong>{incident.title}</strong>
                <small>{incident.progress}%</small>
              </button>
            ))}
          </aside>
        </div>
      )}

      {turnReport && (
        <div className="modal-backdrop report-backdrop" role="presentation" onMouseDown={() => setTurnReport(null)}>
          <section className="modal turn-report-modal" role="dialog" aria-modal="true" aria-labelledby="turn-report-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setTurnReport(null)} aria-label="关闭结算报告"><X size={18} /></button>
            <header className="report-header">
              <span className="report-week">第 {turnReport.week} 周 · {turnReport.date}</span>
              <p className="eyebrow">组织行动结算</p>
              <h2 id="turn-report-title">{turnReport.headline}</h2>
              <p>{turnReport.summary}</p>
            </header>

            <div className="report-prologue">
              {turnReport.prelude.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>

            <div className="result-list narrative-results">
              {turnReport.results.length > 0 ? turnReport.results.map((result, index) => (
                <article className={`narrative-chapter ${result.success ? "success" : "failure"}`} key={result.id}>
                  <div className="chapter-marker"><span>指令 {String(index + 1).padStart(2, "0")}</span><i /> <b>{result.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{result.success ? "行动取得进展" : "行动遭遇阻力"}</b></div>
                  <h3>{result.sceneTitle}</h3>
                  <div className="chapter-meta"><span>{result.districtName}</span><span>{result.memberName} · {result.actionType}</span>{result.incidentTitle && <span>档案：{result.incidentTitle}</span>}</div>
                  <blockquote className="issued-order"><small>你下达的指令</small><p>{result.orderBrief}</p></blockquote>
                  <div className="chapter-prose">{result.narrative.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                  {result.testimony && <blockquote className="testimony"><span>现场证言 · {result.testimony.speaker}</span><p>“{result.testimony.words}”</p></blockquote>}
                  <section className="finding-dossier">
                    <h4><Lightbulb size={14} /> 带回据点的可靠信息</h4>
                    <ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
                  </section>
                  {result.abilityName && <div className="ability-result"><Zap size={14} /><span><b>{result.abilityName} 已生效</b>{result.abilityEffect}</span></div>}
                  {result.newClue && <div className="new-clue"><Lightbulb size={15} /><span><b>新证据已归档</b>{result.newClue}</span></div>}
                  <div className="chapter-outcome"><div><small>显性后果</small><p>{result.consequence}</p></div><div><small>建议追查</small><p>{result.followUp}</p></div></div>
                  <details className="rules-appendix"><summary>查看规则检定</summary><div><span>检定掷值 <strong>{result.score}</strong></span><span>成功阈值 <strong>{result.threshold}</strong></span><span>证据推进 <strong>+{result.progressDelta}%</strong></span></div></details>
                </article>
              )) : (
                <div className="quiet-result"><CloudFog size={24} /><p>本周没有重点行动。组织保住了表面的平静，而城市替你写下了这一周的其余部分。</p></div>
              )}
            </div>

            {turnReport.worldMoves.length > 0 && <section className="world-movements">
              <div className="world-movements-heading"><Eye size={15} /><span><small>没有等待你的城市</small><h3>未受干预的暗流</h3></span></div>
              {turnReport.worldMoves.map((movement) => <article className={movement.severity} key={movement.title}><div><span>{movement.districtName}</span><strong>{movement.title}</strong></div><p>{movement.text}</p></article>)}
            </section>}

            <div className="report-closing"><span>本周终记</span><p>{turnReport.closing}</p></div>

            <section className="turn-ledger">
              <div className="turn-ledger-heading"><span>组织账目附录</span><small>数值只解释后果，不替代叙事</small></div>
              <div className="delta-grid" aria-label="本周资源变化">
                {([[
                  "资金", turnReport.deltas.money, "£"],
                  ["情报", turnReport.deltas.intel, ""],
                  ["隐秘度", turnReport.deltas.concealment, ""],
                  ["稳定", turnReport.deltas.stability, ""],
                ] as const).map(([label, value, prefix]) => (
                  <div key={label} className={value >= 0 ? "positive" : "negative"}><span>{label}</span><strong>{value >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{prefix}{value > 0 ? `+${value}` : value}</strong></div>
                ))}
              </div>
            </section>

            <footer className="report-actions">
              <button className="back-button" onClick={() => { setTurnReport(null); setView("archive"); }}><Archive size={16} /> 查看全部档案</button>
              <button className="primary-button compact-button" onClick={() => setTurnReport(null)}><span className="button-label">进入第 {game.week} 周</span><ArrowRight size={17} /></button>
            </footer>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettings(false)} aria-label="关闭"><X size={18} /></button>
            <div className="modal-icon"><Settings size={20} /></div>
            <p className="eyebrow">本机配置</p>
            <h2 id="settings-title">AI叙事接口</h2>
            <p className="modal-copy">不填写也可以游玩。模型只负责人物对话与叙事表达，规则结算始终留在本地。</p>
            <div className={`connection-status ${endpoint && model ? "configured" : "offline"}`}>
              <i />
              <span>{endpoint && model ? "已配置自定义模型" : "当前使用离线叙事"}</span>
              <small>{endpoint && model ? model : "稳定且不产生调用费用"}</small>
            </div>
            <label><span>OpenAI兼容端点</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1" /></label>
            <label><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model-name" /></label>
            <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在本机" /></label>
            <button className="primary-button" onClick={saveAiSettings}><span className="button-label">保存设置</span><Check size={17} /></button>
            <small className="security-note">当前切片使用离线模板叙事；下一阶段接通实际请求与结构化校验。</small>
          </section>
        </div>
      )}

      {showNewGame && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowNewGame(false)}>
          <section className="modal new-game-modal" role="dialog" aria-modal="true" aria-labelledby="new-game-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowNewGame(false)} aria-label="关闭"><X size={18} /></button>
            <div className="wizard-header">
              <div>
                <p className="eyebrow">建立新的历史分支</p>
                <h2 id="new-game-title">{newGameStep === 1 ? "选择非凡途径" : newGameStep === 2 ? "选择组织掩护" : "确认开局"}</h2>
              </div>
              <div className="step-indicator" aria-label={`第${newGameStep}步，共3步`}>
                {[1, 2, 3].map((step) => <i key={step} className={step <= newGameStep ? "active" : ""} />)}
              </div>
            </div>

            {newGameStep === 1 && (
              <div className="choice-list pathway-choices">
                {(Object.entries(PATHWAYS) as [PathwayId, (typeof PATHWAYS)[PathwayId]][]).map(([id, item]) => (
                  <button key={id} className={draftPathway === id ? "selected-choice" : ""} onClick={() => setDraftPathway(id)}>
                    <span className="choice-symbol"><Sparkles size={18} /></span>
                    <span><strong>{item.name}</strong><small>{item.note}</small></span>
                    <i className="choice-check">{draftPathway === id && <Check size={14} />}</i>
                  </button>
                ))}
              </div>
            )}

            {newGameStep === 2 && (
              <div className="choice-list organization-choices">
                {(Object.entries(ORGANIZATIONS) as [OrganizationId, (typeof ORGANIZATIONS)[OrganizationId]][]).map(([id, item]) => (
                  <button key={id} className={draftOrganization === id ? "selected-choice" : ""} onClick={() => setDraftOrganization(id)}>
                    <span className="choice-symbol"><Building2 size={18} /></span>
                    <span><strong>{item.name}</strong><small>{item.perk}</small></span>
                    <i className="choice-check">{draftOrganization === id && <Check size={14} />}</i>
                  </button>
                ))}
              </div>
            )}

            {newGameStep === 3 && (
              <div className="opening-summary">
                <div className="summary-art" role="img" aria-label="雾都贝克兰德中的秘密组织" />
                <div className="summary-copy">
                  <span>1349年6月28日 · 贝克兰德</span>
                  <h3>{ORGANIZATIONS[draftOrganization].name}</h3>
                  <p>你将以{PATHWAYS[draftPathway].sequence}「{PATHWAYS[draftPathway].name}」的身份，带领四名成员进入尚未偏转的原著时间线。</p>
                  <dl>
                    <div><dt>非凡能力</dt><dd>{PATHWAYS[draftPathway].ability}</dd></div>
                    <div><dt>组织优势</dt><dd>{ORGANIZATIONS[draftOrganization].perk}</dd></div>
                    <div><dt>开局难度</dt><dd>标准 · 可随时读档</dd></div>
                  </dl>
                </div>
              </div>
            )}

            <div className="wizard-actions">
              {newGameStep > 1 ? (
                <button className="back-button" onClick={() => setNewGameStep((step) => step - 1)}><ChevronLeft size={17} /> 返回</button>
              ) : <span />}
              {newGameStep < 3 ? (
                <button className="primary-button compact-button" onClick={() => setNewGameStep((step) => step + 1)}><span className="button-label">继续</span><ChevronRight size={17} /></button>
              ) : (
                <button className="primary-button compact-button" onClick={startNewGame}><span className="button-label">进入贝克兰德</span><ArrowRight size={17} /></button>
              )}
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span><Check size={15} /> {toast}</span>
          {undoOrderId && <button onClick={() => { removeOrder(undoOrderId); setToast("已撤销本周指令"); }}><Undo2 size={14} /> 撤销</button>}
        </div>
      )}
    </main>
  );
}
