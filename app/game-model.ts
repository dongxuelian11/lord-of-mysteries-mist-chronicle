export type PathwayId = "seer" | "spectator" | "apprentice" | "hunter" | "mystery";
export type ViewId = "intent" | "investigation" | "city" | "organization" | "progression" | "archive";
export type RiskLevel = "低" | "中" | "高" | "致命";
export type EvidenceCertainty = "传闻" | "推断" | "可信证据" | "已确认";

export type Ability = {
  id: string;
  name: string;
  verb: string;
  description: string;
  cost: number;
  risk: string;
  passive?: boolean;
  ruleTags?: string[];
};

export type Sequence = {
  rank: number;
  name: string;
  capabilities: string[];
  acting: string;
};

export type Pathway = {
  id: PathwayId;
  name: string;
  color: string;
  sequences: Sequence[];
  startingAbilities: Ability[];
};

export type Member = {
  id: string;
  name: string;
  role: string;
  pathway?: string;
  sequence?: number;
  specialty: string;
  loyalty: number;
  trust?: number;
  interest?: number;
  ideology?: number;
  fatigue: number;
  status: string;
  background?: string;
  core?: string;
  voice?: string;
  arc?: string;
};

export type District = {
  id: string;
  name: string;
  subtitle: string;
  background: string;
  danger: number;
  intel: number;
  x: number;
  y: number;
  size: "small" | "medium" | "large";
  landmarks: string[];
  opportunity: string;
  warning: string;
};

export type Material = {
  id: string;
  name: string;
  kind: "主材料" | "辅助材料" | "仪式条件";
  obtained: boolean;
  known: boolean;
  source: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: "材料" | "封印物" | "证据" | "仪式器具" | "身份文件";
  quantity: number;
  location: string;
  keeper: string;
  risk: string;
};

export type Facility = {
  id: string;
  name: string;
  type: string;
  description: string;
  level: number;
  status: "运转中" | "闲置" | "建设中" | "受损";
  assignedMemberId?: string;
  project?: string;
  progress?: number;
  benefits: string[];
  verbs?: string[];
  maintenance?: number;
  risk: string;
};

export type Department = {
  id: string;
  name: string;
  leadMemberId: string;
  mandate: string;
  autonomy: number;
  budget: number;
  status: string;
  weeklyVerb?: string;
};

export type EvidenceNode = {
  id: string;
  caseId: string;
  label: string;
  kind: "人物" | "地点" | "物证" | "证词" | "记录" | "异常" | "推断";
  summary: string;
  certainty: EvidenceCertainty;
  discovered: boolean;
  source: string;
  tags: string[];
  weekDiscovered?: number;
};

export type EvidenceLink = {
  id: string;
  from: string;
  to: string;
  label: string;
  discovered: boolean;
};

export type Opportunity = {
  id: string;
  caseId: string;
  title: string;
  description: string;
  districtId: string;
  risk: RiskLevel;
  requirements: string[];
  suggestedIntent: string;
  rewardPreview: string;
  state: "locked" | "available" | "resolved" | "expired";
};

export type FactionState = {
  id: string;
  name: string;
  kind: "教会" | "密教" | "王室" | "官方" | "灰色势力";
  publicGoal: string;
  currentPlan: string;
  trust: number;
  interest: number;
  suspicion: number;
  leverage: number;
  planProgress: number;
  visibility: "未知" | "传闻" | "已接触" | "持续往来";
  lastMove: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  scheduledWeek: number;
  kind: "历史锚点" | "可变事件" | "终局";
  status: "upcoming" | "active" | "diverted" | "resolved";
  summary: string;
  revealed: boolean;
  pressure: number;
};

export type EconomyLedger = {
  week: number;
  coverIncome: number;
  contractIncome: number;
  facilityCost: number;
  departmentCost: number;
  actionCost: number;
  balance: number;
};

export type WorldMove = {
  id: string;
  factionId: string;
  title: string;
  detail: string;
  week: number;
  visibility: "迹象" | "获知" | "确认";
};

export type PressureMission = {
  id: string;
  title: string;
  premise: string;
  deadline: number;
  urgency: number;
  progress: number;
  consequence: string;
  hints: string[];
  state: "active" | "resolved" | "failed";
};

export type PlayerIntent = {
  id: string;
  text: string;
  pinned: boolean;
  state: "active" | "paused" | "completed";
};

export type ActionContract = {
  id: string;
  rawIntent: string;
  title: string;
  kind: "调查" | "交涉" | "研究" | "建设" | "招募" | "仪式" | "休整" | "自由行动";
  target: string;
  desiredOutcome: string;
  approach: string;
  leaderId: string;
  memberIds: string[];
  districtId: string;
  abilityIds: string[];
  facilityId?: string;
  days: number;
  budget: number;
  risk: RiskLevel;
  knownFacts: string;
  hypothesis: string;
  unknowns: string;
  redLines: string;
  retreat: string;
  focus: boolean;
  opportunityId?: string;
  methodTags?: string[];
};

export type ScheduledAction = ActionContract & { status: "planned" | "resolved"; startDay: number };

export type ActionResult = {
  id: string;
  title: string;
  outcome: "成功" | "部分成功" | "受阻";
  contract: ActionContract;
  findings: string[];
  consequence: string;
  abilityEffects: string[];
  digestionGain: number;
  missionProgress: number;
  resourceChanges: { money: number; secrecy: number; stability: number; influence: number };
  reasons?: string[];
  unlockedEvidenceIds?: string[];
  unlockedOpportunityIds?: string[];
  futureChanges?: string[];
};

export type ChronicleChapter = {
  id: string;
  week: number;
  date: string;
  title: string;
  source: "local" | "ai";
  sections: { heading: string; paragraphs: string[] }[];
  results: ActionResult[];
  summary: string;
};

export type WorldFact = {
  id: string;
  subject: string;
  statement: string;
  certainty: "传闻" | "线索" | "可信" | "确认";
  source: string;
  week: number;
};

export type GameState = {
  version: number;
  week: number;
  date: string;
  pathwayId: PathwayId;
  currentSequence: number;
  digestion: number;
  spirituality: number;
  spiritualityMax: number;
  formulaKnowledge: number;
  materials: Material[];
  organizationName: string;
  coverIdentity: string;
  charter: string;
  money: number;
  secrecy: number;
  stability: number;
  influence: number;
  deviation: number;
  members: Member[];
  facilities: Facility[];
  departments: Department[];
  inventory: InventoryItem[];
  missions: PressureMission[];
  playerIntents: PlayerIntent[];
  schedule: ScheduledAction[];
  facts: WorldFact[];
  chronicle: ChronicleChapter[];
  discoveredDistrictIds: string[];
  evidenceNodes: EvidenceNode[];
  evidenceLinks: EvidenceLink[];
  opportunities: Opportunity[];
  factions: FactionState[];
  timeline: TimelineEvent[];
  worldMoves: WorldMove[];
  economyHistory: EconomyLedger[];
  organizationConditions: string[];
};

const seq = (rank: number, name: string, capabilities: string[], acting: string): Sequence => ({ rank, name, capabilities, acting });

export const PATHWAYS: Record<PathwayId, Pathway> = {
  seer: {
    id: "seer", name: "占卜家", color: "#b7a36f",
    sequences: [
      seq(9, "占卜家", ["灵视：观察灵体、情绪颜色与污染残留", "占卜：借媒介获得象征性方向", "危险直觉：被动感知迫近风险"], "提供启示而非替人决定命运"),
      seq(8, "小丑", ["身体控制：精确掌握平衡、表情与肌肉", "纸牌武器：将轻薄物体转化为致命投射物", "危险预感强化"], "用笑容承受命运的荒诞"),
      seq(7, "魔术师", ["伤害转移", "火焰跳跃", "空气弹与纸人替身"], "在准备与表演中创造不可能"),
      seq(6, "无面人", ["改变容貌、体型与声线", "复制目标的外在习惯", "强化人物观察"], "记住自己是谁，再成为别人"),
      seq(5, "秘偶大师", ["控制灵体之线", "将目标转化为秘偶", "共享秘偶感官与能力"], "让舞台上的每根线都有目的"),
      seq(4, "诡法师", ["秘偶位置互换", "群体诡术", "隐秘操纵与异常复活能力"], "以诡异而非蛮力解决难题"),
      seq(3, "古代学者", ["从历史孔隙借取力量", "召唤历史投影", "藏身历史迷雾"], "见证历史，并承担知识重量"),
      seq(2, "奇迹师", ["积累与实现愿望", "大范围奇迹", "以往奇迹增强后续能力"], "先实现微小愿望，再承载奇迹"),
      seq(1, "诡秘侍者", ["嫁接概念与位置", "重组灵体之线", "制造诡秘领域"], "侍奉诡秘，同时保持自我锚点"),
      seq(0, "愚者", ["愚弄时间、历史与规则认知", "掌控秘偶、历史与奇迹权柄", "建立神国与回应祈祷"], "成为象征本身"),
    ],
    startingAbilities: [
      { id: "spirit-vision", name: "灵视", verb: "观察灵性痕迹", description: "查看目标周围的灵性颜色、残留和非自然影响；不能直接读出幕后真相。", cost: 1, risk: "长时间开启会造成头痛，并可能与未知存在对视。" },
      { id: "divination", name: "媒介占卜", verb: "占卜方向", description: "针对一个清晰问题获得象征与危险倾向，答案受信息与反占卜干扰。", cost: 2, risk: "问题越接近高位存在，错误指引与反向注视越明显。" },
      { id: "danger-sense", name: "危险直觉", verb: "感知危险", description: "在现场自动提示迫近危险，但不说明来源。", cost: 0, risk: "被动能力；极端污染可能制造假警报。", passive: true },
    ],
  },
  spectator: {
    id: "spectator", name: "观众", color: "#8fb4a1",
    sequences: [
      seq(9, "观众", ["观察微表情与行为矛盾", "建立心理画像", "保持旁观状态"], "观察舞台，但不贸然登台"),
      seq(8, "读心者", ["读取表层思绪倾向", "捕捉情绪来源", "强化语言暗示"], "理解思想而不把推测当事实"),
      seq(7, "心理医生", ["心理治疗", "制造心理暗示", "稳定或诱发情绪"], "治疗心灵，也认识操控的边界"),
      seq(6, "催眠师", ["深层催眠", "植入行为暗示", "读取被封闭的记忆线索"], "让目标相信选择来自自己"),
      seq(5, "梦境行者", ["进入梦境", "塑造梦境场景", "借梦境追踪心理创伤"], "穿行梦境而不迷失现实"),
      seq(4, "操纵师", ["操纵群体情绪", "编织人格状态", "制造心理瘟疫"], "把社会当作心灵的整体"),
      seq(3, "织梦人", ["编织共享梦境", "让虚构心理体验影响现实", "重建心灵结构"], "让梦有逻辑，让现实产生裂缝"),
      seq(2, "洞察者", ["洞察规则漏洞与真实动机", "抵抗欺诈和精神污染", "看穿集体潜意识"], "看见真相却不被真相支配"),
      seq(1, "作家", ["书写合理发展的未来", "让人物按性格走向结局", "影响时代心理潮流"], "故事必须合理，人物必须真实"),
      seq(0, "空想家", ["空想事物进入现实", "塑造心灵世界与人格", "掌控观众途径权柄"], "想象世界，并承担它成为现实的代价"),
    ],
    startingAbilities: [
      { id: "observe", name: "行为观察", verb: "建立心理画像", description: "通过言行、微表情与环境关系标记矛盾和情绪变化。", cost: 0, risk: "只能得到推断；把推断当事实会造成严重误判。", passive: true },
      { id: "empathy-probe", name: "情绪探针", verb: "确认情绪来源", description: "集中感知一名目标的主导情绪和压力方向。", cost: 1, risk: "强烈情绪可能反向影响使用者。" },
      { id: "guided-talk", name: "引导式谈话", verb: "引导对方开口", description: "利用心理画像组织问题，降低防御但不能强制吐露秘密。", cost: 1, risk: "被察觉后会永久损害信任。" },
    ],
  },
  apprentice: {
    id: "apprentice", name: "学徒", color: "#8da7c4",
    sequences: [
      seq(9, "学徒", ["识别门与边界", "穿越普通障碍", "空间直觉"], "寻找门，也尊重门后的未知"),
      seq(8, "戏法大师", ["多种微型法术", "制造光、雾、滑倒与震慑", "灵活组合戏法"], "用有限手段解决无限局面"),
      seq(7, "占星人", ["观测星象与命运趋势", "辨识空间坐标", "提升预言抗性"], "在星空中确认自己的位置"),
      seq(6, "记录官", ["记录并复现非凡能力", "分析能力结构", "有限保存法术"], "记录力量而不误以为拥有它"),
      seq(5, "旅行家", ["灵界穿梭", "短距离传送", "建立远程逃生路线"], "永远准备下一段旅途"),
      seq(4, "秘法师", ["隐藏空间坐标", "放逐与封锁", "制造空间囚笼"], "保守秘密，也成为秘密"),
      seq(3, "漫游者", ["漫游星界与宇宙", "远距离定位", "适应异域规则"], "不断远行，却保留归途"),
      seq(2, "旅法师", ["在不同世界与规则间行走", "复制大范围空间现象", "建立稳定通道"], "理解每个世界的边界"),
      seq(1, "星之匙", ["开启概念与权柄之门", "定位任何已知坐标", "封闭神秘通道"], "成为钥匙，也选择哪些门不应开启"),
      seq(0, "门", ["掌控空间、封印与漫游权柄", "同时存在于多处坐标", "开启或关闭世界边界"], "成为所有远方的入口"),
    ],
    startingAbilities: [
      { id: "door-sense", name: "门径感知", verb: "寻找隐蔽入口", description: "感知建筑中的空腔、薄弱边界、隐藏门和可撤离路线。", cost: 1, risk: "异常空间可能伪装成出口。" },
      { id: "open-lock", name: "开锁术", verb: "穿越普通封锁", description: "短暂干涉普通门锁、窗栓和简单机械结构。", cost: 1, risk: "会留下可被神秘学追踪的空间扰动。" },
      { id: "spatial-instinct", name: "空间直觉", verb: "记忆路线", description: "自动建立行进路线与相对方位感。", cost: 0, risk: "在灵界或扭曲空间中只提供倾向。", passive: true },
    ],
  },
  hunter: {
    id: "hunter", name: "猎人", color: "#c47c68",
    sequences: [
      seq(9, "猎人", ["追踪目标", "布置陷阱", "野外生存与弱点判断"], "耐心寻找猎物留下的必然痕迹"),
      seq(8, "挑衅者", ["精准激怒目标", "诱导错误决策", "辨识心理弱点"], "控制自己的怒火，点燃别人的怒火"),
      seq(7, "纵火家", ["制造和操纵火焰", "火焰武器", "耐受高温"], "让火焰服务于计划而非冲动"),
      seq(6, "阴谋家", ["多层计划", "发现组织漏洞", "利用冲突与误导"], "让每个偶然都成为计划的一部分"),
      seq(5, "收割者", ["大范围致命攻击", "把握战场节奏", "收割受伤目标"], "等待决定战局的一击"),
      seq(4, "铁血骑士", ["军团连接", "共享力量与伤害", "战争纪律"], "个人成为军队，军队成为个人"),
      seq(3, "战争主教", ["鼓舞与支配军队", "放大战争情绪", "建立战争领域"], "让信念在战争中传递"),
      seq(2, "天气术士", ["操纵大范围天气", "制造灾害级战场", "以环境压制敌人"], "把天候纳入战略"),
      seq(1, "征服者", ["征服概念与群体意志", "强制建立统治秩序", "压制敌对权柄"], "征服之后仍能治理"),
      seq(0, "红祭司", ["掌控战争、火焰与纷争权柄", "发动神战级冲突", "统合军团与国家"], "成为战争本身"),
    ],
    startingAbilities: [
      { id: "track", name: "痕迹追踪", verb: "追踪目标", description: "从脚印、气味、纤维和行为规律拼出目标路线。", cost: 0, risk: "强大猎物可能故意留下误导。" },
      { id: "trap", name: "快速陷阱", verb: "布置陷阱", description: "利用现场材料制造预警、阻滞或捕获装置。", cost: 1, risk: "仓促陷阱可能伤及无关人员并提高暴露。" },
      { id: "weakness", name: "弱点判断", verb: "识别薄弱点", description: "观察目标行动后标记一个战术弱点。", cost: 1, risk: "需要持续观察；判断期间容易错失撤退窗口。" },
    ],
  },
  mystery: {
    id: "mystery", name: "窥秘人", color: "#a48ac1",
    sequences: [
      seq(9, "窥秘人", ["神秘学知识", "辨识符号与污染", "灵性仪式基础"], "追逐知识，也敬畏知识的代价"),
      seq(8, "格斗学者", ["将知识转化为战斗技术", "快速分析敌人结构", "强化身体控制"], "知识必须经受现实检验"),
      seq(7, "巫师", ["施展多类巫术", "操纵灵性材料", "诅咒与反诅咒"], "让知识形成可重复的法术"),
      seq(6, "卷轴教授", ["制作非凡卷轴", "封存法术", "解析与复制仪式结构"], "记录危险知识并限制使用条件"),
      seq(5, "星象师", ["借星象施法", "预判宏观变化", "建立星光仪式"], "在星辰变化中寻找秩序"),
      seq(4, "神秘学家", ["创造复杂神秘学效果", "知识实体化", "削弱未知现象"], "定义未知，但不傲慢地穷尽未知"),
      seq(3, "预言大师", ["高精度预言", "读取知识河流", "干扰其他预言"], "预见未来仍为选择负责"),
      seq(2, "贤者", ["赋予知识生命", "制造知识生物", "让信息直接产生现实影响"], "知识应被传承而非占有"),
      seq(1, "知识皇帝", ["统治知识秩序", "宣告信息真伪", "压制错误与秘密"], "为知识建立秩序"),
      seq(0, "隐者", ["掌控知识、神秘与信息权柄", "让隐藏知识显现或消失", "建立知识神国"], "成为秘密与答案的边界"),
    ],
    startingAbilities: [
      { id: "identify", name: "神秘鉴定", verb: "鉴定异常", description: "辨识材料、符号、灵性残留和常见污染类型。", cost: 1, risk: "主动读取未知知识可能建立危险联系。" },
      { id: "ritual-design", name: "仪式设计", verb: "设计基础仪式", description: "根据目标选择象征、材料、时间和隔离措施。", cost: 1, risk: "错误对应会招来与目标无关的回应。" },
      { id: "occult-memory", name: "神秘记忆", verb: "检索神秘知识", description: "快速回忆已学知识并发现符号间的对应。", cost: 0, risk: "只覆盖角色真正掌握的知识。", passive: true },
    ],
  },
};

export const DISTRICTS: District[] = [
  { id: "north", name: "北区", subtitle: "大学与教会", background: "大学、出版社与教会总部共同维持秩序。知识容易获得，秘密也更容易进入官方档案。", danger: 34, intel: 45, x: 20, y: 17, size: "large", landmarks: ["霍伊大学", "圣赛缪尔教堂", "大学图书馆"], opportunity: "档案研究、学者关系与官方知识。", warning: "未经许可的仪式会迅速引来值夜者。" },
  { id: "empress", name: "皇后区", subtitle: "王室与大贵族", background: "宫殿、花园与世袭宅邸形成封闭世界，真正的信息沿仆役和供应商网络流动。", danger: 53, intel: 19, x: 42, y: 16, size: "medium", landmarks: ["王室宫殿", "皇后花园", "贵族宅邸群"], opportunity: "贵族线人、王室项目与上流资源。", warning: "身份审查严格，一次异常就可能永久封闭渠道。" },
  { id: "west", name: "西区", subtitle: "教会与上流社交", background: "律师、医生、富商和中小贵族聚居，慈善晚宴与私人沙龙是交换利益的舞台。", danger: 41, intel: 36, x: 16, y: 39, size: "large", landmarks: ["丰收教堂", "律师街", "私人沙龙"], opportunity: "合法化、委托和社会关系。", warning: "多个势力同时监视陌生组织。" },
  { id: "hillston", name: "希尔斯顿区", subtitle: "银行与证券", background: "账簿与保险合同掩盖权力流向，异常交易往往比尸体更早暴露阴谋。", danger: 38, intel: 51, x: 46, y: 38, size: "medium", landmarks: ["证券交易所", "银行街", "大型百货"], opportunity: "资金追踪、商业掩护和采购。", warning: "贸然查账会触发法律与商业反制。" },
  { id: "cherwood", name: "乔伍德区", subtitle: "组织主据点", background: "中产住宅、剧院和小型事务所混杂，是不显眼地经营秘密组织的理想位置。", danger: 25, intel: 63, x: 31, y: 53, size: "medium", landmarks: ["鸦羽事务所", "剧院街", "地下聚会点"], opportunity: "建设、休整、研究和内部管理。", warning: "频繁的灵性活动会把危险带到家门口。" },
  { id: "government", name: "政府区", subtitle: "议会与行政机关", background: "秘密由印章、程序和利益共同体保护。人口、煤炭与公共工程记录都在这里留下纸面痕迹。", danger: 50, intel: 31, x: 59, y: 50, size: "small", landmarks: ["王国议会", "市政厅", "公务员俱乐部"], opportunity: "政策、采购与人口记录。", warning: "证据不足的指控会摧毁组织可信度。" },
  { id: "east", name: "东区", subtitle: "工厂与失踪人口", background: "烟尘、廉租屋和昼夜不停的工厂吞没大量人口，也让人口交易与秘密工程得到遮蔽。", danger: 74, intel: 39, x: 78, y: 35, size: "large", landmarks: ["废弃纺织厂", "廉价旅馆", "煤气工厂"], opportunity: "工人证词、帮派关系和被忽视的异常。", warning: "治安、疾病与非凡污染往往同时存在。" },
  { id: "bridge", name: "桥区", subtitle: "交通与灰色交易", background: "车站、旧货市场和短租公寓承接不断流动的人与货，线索来得快也消失得快。", danger: 61, intel: 50, x: 47, y: 69, size: "medium", landmarks: ["贝克兰德大桥", "马车总站", "旧货市场"], opportunity: "追踪、采购和跨区线人。", warning: "错过时间窗口后很难再次定位目标。" },
  { id: "south", name: "南区", subtitle: "工人社区与诊所", background: "工匠家庭、互助会和小型诊所构成紧密社区，异常常以疾病与家庭悲剧最先出现。", danger: 55, intel: 43, x: 67, y: 79, size: "medium", landmarks: ["慈善诊所", "工人互助会", "廉价药房街"], opportunity: "救助声望、病例和社区网络。", warning: "大规模异常会迅速压垮救助资源。" },
  { id: "dock", name: "码头区", subtitle: "仓库、船运与走私", background: "五海与殖民地的船只把材料、移民和未知事物带进首都，港务制度早已被多方侵蚀。", danger: 69, intel: 54, x: 83, y: 72, size: "large", landmarks: ["货运栈桥", "海关仓库", "水手酒吧"], opportunity: "海外材料、航运记录和黑市渠道。", warning: "封闭货舱与海外非凡者带来未知风险。" },
];

const RANK_EIGHT_RECIPES: Record<PathwayId, Material[]> = {
  seer: [
    { id: "seer-main-1", name: "成年角影豹的完整脑垂体", kind: "主材料", obtained: false, known: true, source: "东区地下兽材商或组织狩猎" },
    { id: "seer-main-2", name: "双面笑蛾的结晶粉末", kind: "主材料", obtained: false, known: true, source: "北区标本馆、神秘学聚会" },
    { id: "seer-aux-1", name: "纯水与金薄荷精油", kind: "辅助材料", obtained: true, known: true, source: "组织库存" },
  ],
  spectator: [
    { id: "spectator-main-1", name: "镜眼狐的虹膜", kind: "主材料", obtained: false, known: true, source: "西区收藏家或南区走私医生" },
    { id: "spectator-main-2", name: "心语树的空心果实", kind: "主材料", obtained: false, known: true, source: "海外植物商、教会封存库" },
    { id: "spectator-aux-1", name: "蒸馏酒与安神花粉", kind: "辅助材料", obtained: true, known: true, source: "组织库存" },
  ],
  apprentice: [
    { id: "apprentice-main-1", name: "穿墙灵鼠的脊髓结晶", kind: "主材料", obtained: false, known: true, source: "桥区旧货市场、灵界陷阱" },
    { id: "apprentice-main-2", name: "无门房间的银色尘埃", kind: "主材料", obtained: false, known: true, source: "异常建筑调查" },
    { id: "apprentice-aux-1", name: "盐、银屑与七种香草", kind: "辅助材料", obtained: true, known: true, source: "组织库存" },
  ],
  hunter: [
    { id: "hunter-main-1", name: "赤冠猎蜥的完整嗅囊", kind: "主材料", obtained: false, known: true, source: "码头进口兽材、郊外狩猎" },
    { id: "hunter-main-2", name: "挑衅鸟的舌骨", kind: "主材料", obtained: false, known: true, source: "贵族猎场或地下拍卖" },
    { id: "hunter-aux-1", name: "烈酒、黑胡椒与硝石", kind: "辅助材料", obtained: true, known: true, source: "组织库存" },
  ],
  mystery: [
    { id: "mystery-main-1", name: "石肤学猿的额骨结晶", kind: "主材料", obtained: false, known: true, source: "大学标本馆、海外货轮" },
    { id: "mystery-main-2", name: "知识甲虫的完整鞘翅", kind: "主材料", obtained: false, known: true, source: "神秘学家交易、仪式召唤" },
    { id: "mystery-aux-1", name: "水银、山毛榉汁与格斗家血液", kind: "辅助材料", obtained: true, known: true, source: "组织库存" },
  ],
};

export function materialsFor(pathwayId: PathwayId, targetRank: number): Material[] {
  if (targetRank === 8) return RANK_EIGHT_RECIPES[pathwayId].map((item) => ({ ...item }));
  const pathway = PATHWAYS[pathwayId];
  const target = pathway.sequences.find((item) => item.rank === targetRank) ?? pathway.sequences[pathway.sequences.length - 1];
  return [
    { id: `${pathwayId}-${targetRank}-main-a`, name: `${target.name}对应主材料·甲`, kind: "主材料", obtained: false, known: false, source: "需要获得完整配方后确认" },
    { id: `${pathwayId}-${targetRank}-main-b`, name: `${target.name}对应主材料·乙`, kind: "主材料", obtained: false, known: false, source: "需要获得完整配方后确认" },
    { id: `${pathwayId}-${targetRank}-aux`, name: `${target.name}辅助材料组`, kind: "辅助材料", obtained: false, known: false, source: "需要获得完整配方后确认" },
  ];
}

export const INITIAL_MEMBERS: Member[] = [
  { id: "mara", name: "玛拉·维恩", role: "外勤调查员", specialty: "跟踪、街头关系与撤离", loyalty: 70, trust: 72, interest: 55, ideology: 84, fatigue: 8, status: "可安排", background: "东区长大，曾替一家律师事务所寻找失踪债务人。", core: "务实、保护弱者、厌恶没有撤退计划的英雄主义。", voice: "短句，先报告事实，再表达担忧。", arc: "正在判断这个组织是否值得长期托付。" },
  { id: "cedric", name: "塞德里克·霍尔", role: "账房与掩护人", specialty: "账目、身份文件与工程管理", loyalty: 66, trust: 65, interest: 68, ideology: 66, fatigue: 12, status: "可安排", background: "破产商人的次子，熟悉银行、保险与合法身份的缝隙。", core: "秩序、可持续与体面；害怕组织因冲动一起毁掉。", voice: "礼貌而精确，习惯用成本和期限表达反对。", arc: "财务压力正在迫使他重新衡量忠诚与安全。" },
  { id: "ines", name: "伊妮丝·科尔", role: "情报联络员", specialty: "报业、贵族传闻与关系维护", loyalty: 63, trust: 59, interest: 71, ideology: 58, fatigue: 6, status: "可安排", background: "曾为晚报整理社会版匿名来信，保留着一批不愿见光的消息源。", core: "好奇、谨慎、重视交换对等；不会无条件交出全部信息。", voice: "喜欢用旁人的故事暗示自己的判断。", arc: "她仍保留一条没有向组织登记的消息渠道。" },
  { id: "rowan", name: "罗文·布莱克", role: "非凡顾问", pathway: "收尸人", sequence: 9, specialty: "灵体、死亡痕迹与尸检", loyalty: 65, trust: 67, interest: 52, ideology: 76, fatigue: 15, status: "可安排", background: "在教会外围做过尸体搬运，因一次未经许可的通灵离开。", core: "敬畏死亡、反感滥用灵体、愿意承担脏活。", voice: "低声、克制，很少使用比喻。", arc: "黑玻璃挂坠让他想起那次导致离职的通灵。" },
];

export const INITIAL_FACILITIES: Facility[] = [
  { id: "meeting", name: "密议室", type: "指挥", description: "隔音墙、城市地图和分离保存的行动档案。", level: 1, status: "运转中", assignedMemberId: "cedric", benefits: ["同时规划4项行动", "行动契约保密"], verbs: ["协调并行行动", "召开紧急会议"], maintenance: 3, risk: "成员会议频繁时容易形成固定出入规律。" },
  { id: "archive", name: "证据档案室", type: "情报", description: "保存证词、报纸剪报、配方抄本与世界事实。", level: 1, status: "运转中", assignedMemberId: "ines", benefits: ["交叉验证线索", "研究配方知识"], verbs: ["交叉验证证据", "逆向研究配方"], maintenance: 4, risk: "据点失守会暴露全部调查对象。" },
  { id: "ritual", name: "简易仪式室", type: "神秘", description: "以盐线、铜钉和双层窗帘隔离的基础仪式空间。", level: 1, status: "运转中", assignedMemberId: "rowan", benefits: ["进行序列9仪式", "降低基础仪式污染"], verbs: ["隔离鉴定", "举行低序列仪式"], maintenance: 5, risk: "连续使用会积累可被感知的灵性波动。" },
  { id: "vault", name: "封印储藏间", type: "安全", description: "地下小室，能够短期保存低危材料和受污染物。", level: 1, status: "运转中", benefits: ["保存3件危险资产", "延缓材料失活"], verbs: ["封存危险物", "切断低级联系"], maintenance: 4, risk: "缺少专职看守，无法容纳高危封印物。" },
  { id: "workshop", name: "空置后室", type: "待建设", description: "可改造成炼金实验室、医疗室、训练场或自定义设施。", level: 0, status: "闲置", benefits: ["可启动自由建设项目"], verbs: ["启动模块建设"], maintenance: 0, risk: "当前没有产出。" },
  { id: "quarters", name: "成员休息室", type: "生活", description: "四张床、储物柜与从不对外开启的后门。", level: 1, status: "运转中", benefits: ["缓解疲劳", "处理成员事件"], verbs: ["安排休养", "处理成员冲突"], maintenance: 3, risk: "空间拥挤，组织扩大前必须寻找新据点。" },
];

export const INITIAL_EVIDENCE: EvidenceNode[] = [
  { id: "ev-locket", caseId: "black-knock", label: "黑玻璃挂坠", kind: "物证", summary: "雨夜送达据点，每晚三点传出敲门声。", certainty: "已确认", discovered: true, source: "据点共同记录", tags: ["挂坠", "异常", "灵性"] },
  { id: "ev-worker-list", caseId: "black-knock", label: "补写的工人名单", kind: "记录", summary: "名单最后三行由不同墨水补写，三人都来自东区临时工棚。", certainty: "已确认", discovered: true, source: "伊妮丝初检", tags: ["名单", "工人", "东区"] },
  { id: "ev-missing-courier", caseId: "black-knock", label: "失踪信使", kind: "人物", summary: "送件者离开事务所后没有回到雇佣马车。", certainty: "可信证据", discovered: true, source: "街口车夫证词", tags: ["信使", "马车", "失踪"] },
  { id: "ev-resonance", caseId: "black-knock", label: "门径共鸣", kind: "异常", summary: "挂坠不是在发声，而是在与某个封闭空间建立周期性联系。", certainty: "推断", discovered: false, source: "等待灵性鉴定", tags: ["挂坠", "鉴定", "污染", "门"] },
  { id: "ev-ink", caseId: "black-knock", label: "政府采购墨水", kind: "物证", summary: "补写名单的耐潮墨水只供应政府承包商和港务仓库。", certainty: "可信证据", discovered: false, source: "等待账目交叉验证", tags: ["名单", "墨水", "政府", "采购"] },
  { id: "ev-carriage", caseId: "black-knock", label: "凌晨货运马车", kind: "记录", summary: "同一辆无牌马车每逢周四从东区驶向码头封闭仓库。", certainty: "可信证据", discovered: false, source: "等待追踪", tags: ["马车", "东区", "码头", "人口"] },
  { id: "ev-factory", caseId: "black-knock", label: "废弃纺织厂地下层", kind: "地点", summary: "厂房地面近期承受过大量人员与仪式材料的搬运。", certainty: "推断", discovered: false, source: "等待现场调查", tags: ["工厂", "东区", "人口", "仪式"] },
  { id: "ev-population", caseId: "great-smog", label: "异常人口流向", kind: "推断", summary: "失踪、临时招工与政府迁移记录正在指向同一批不可见人口。", certainty: "推断", discovered: false, source: "需要三个独立来源", tags: ["人口", "王室", "大雾霾", "阴谋"] },
];

export const INITIAL_EVIDENCE_LINKS: EvidenceLink[] = [
  { id: "link-delivery", from: "ev-locket", to: "ev-missing-courier", label: "由其送达", discovered: true },
  { id: "link-list-courier", from: "ev-worker-list", to: "ev-missing-courier", label: "同一封套", discovered: true },
  { id: "link-locket-resonance", from: "ev-locket", to: "ev-resonance", label: "周期性联系", discovered: false },
  { id: "link-list-ink", from: "ev-worker-list", to: "ev-ink", label: "补写墨水", discovered: false },
  { id: "link-courier-carriage", from: "ev-missing-courier", to: "ev-carriage", label: "最后行踪", discovered: false },
  { id: "link-carriage-factory", from: "ev-carriage", to: "ev-factory", label: "固定停靠", discovered: false },
  { id: "link-factory-population", from: "ev-factory", to: "ev-population", label: "人员来源", discovered: false },
  { id: "link-ink-population", from: "ev-ink", to: "ev-population", label: "行政掩护", discovered: false },
];

export const INITIAL_OPPORTUNITIES: Opportunity[] = [
  { id: "op-identify-locket", caseId: "black-knock", title: "安全鉴定挂坠", description: "在隔离条件下确认敲门声的性质和联系方向。", districtId: "cherwood", risk: "中", requirements: ["ev-locket"], suggestedIntent: "在仪式室隔离黑玻璃挂坠，使用适合的非凡能力鉴定敲门声的性质；若出现未知注视立即切断联系。", rewardPreview: "确认异常机制，开放反向追踪或封闭仪式", state: "available" },
  { id: "op-trace-ink", caseId: "black-knock", title: "追查名单墨水", description: "从公开采购和港务账目寻找补写者留下的行政痕迹。", districtId: "government", risk: "低", requirements: ["ev-worker-list"], suggestedIntent: "追查工人名单最后三行使用的墨水，从公开采购、印刷商和港务仓库三个来源交叉验证。", rewardPreview: "获得政府承包链证据", state: "available" },
  { id: "op-follow-carriage", caseId: "black-knock", title: "追踪信使末路", description: "沿车夫、路口和夜间货运记录寻找送件者离开后的路线。", districtId: "bridge", risk: "中", requirements: ["ev-missing-courier"], suggestedIntent: "从街口车夫开始追踪失踪信使，核对路口、夜间马车和货运站记录，并预设两条撤离路线。", rewardPreview: "定位凌晨货运马车", state: "available" },
  { id: "op-inspect-factory", caseId: "black-knock", title: "进入废弃纺织厂", description: "确认失踪工人与地下空间的实际联系。", districtId: "east", risk: "高", requirements: ["ev-carriage", "ev-ink"], suggestedIntent: "在凌晨货运窗口潜入废弃纺织厂，只确认地下层用途、人员数量和撤离路线，不与未知非凡者正面冲突。", rewardPreview: "连接人口问题与秘密工程", state: "locked" },
  { id: "op-church-briefing", caseId: "great-smog", title: "向教会提交可核验简报", description: "以证据而非剧透争取一次非正式调查。", districtId: "north", risk: "中", requirements: ["ev-resonance", "ev-ink", "ev-carriage"], suggestedIntent: "整理挂坠共鸣、政府采购墨水与夜间货运三项证据，向可信教会人员申请非正式核验，不直接指控王室。", rewardPreview: "提高教会警觉，获得有限官方协助", state: "locked" },
];

export const INITIAL_FACTIONS: FactionState[] = [
  { id: "night-church", name: "黑夜教会", kind: "教会", publicGoal: "维持首都神秘秩序", currentPlan: "观察非法非凡组织与异常人口报告", trust: 8, interest: 18, suspicion: 20, leverage: 0, planProgress: 12, visibility: "传闻", lastMove: "值夜者正在汇总东区失踪案。" },
  { id: "steam-church", name: "蒸汽与机械之神教会", kind: "教会", publicGoal: "保护工业与技术秩序", currentPlan: "审查煤气、港务与大型工程事故", trust: 4, interest: 12, suspicion: 15, leverage: 0, planProgress: 8, visibility: "传闻", lastMove: "机械之心接管了一份异常设备事故档案。" },
  { id: "royal-project", name: "王室特别工程集团", kind: "王室", publicGoal: "推进保密公共工程", currentPlan: "集中材料、人口与行政掩护", trust: 0, interest: 5, suspicion: 6, leverage: 0, planProgress: 18, visibility: "未知", lastMove: "一批不公开招标的物资完成转运。" },
  { id: "witch-sect", name: "魔女教派", kind: "密教", publicGoal: "身份与目的均未公开", currentPlan: "提供仪式支持并清理知情者", trust: 0, interest: 4, suspicion: 4, leverage: 0, planProgress: 14, visibility: "未知", lastMove: "一名使用假身份的女子在东区更换住所。" },
  { id: "aurora-order", name: "极光会外围", kind: "密教", publicGoal: "散播末日与救赎言论", currentPlan: "争夺被忽视的异常与失踪者", trust: 0, interest: 10, suspicion: 8, leverage: 0, planProgress: 7, visibility: "传闻", lastMove: "地下聚会出现新的布道者。" },
  { id: "police", name: "贝克兰德警察厅", kind: "官方", publicGoal: "控制治安与舆论", currentPlan: "把失踪人口归入普通治安案件", trust: 10, interest: 8, suspicion: 12, leverage: 0, planProgress: 10, visibility: "已接触", lastMove: "警察要求事务所补交执业文件。" },
  { id: "press", name: "晚报消息网", kind: "灰色势力", publicGoal: "用新闻换取生存和影响", currentPlan: "收集东区事故与上流丑闻", trust: 22, interest: 28, suspicion: 5, leverage: 8, planProgress: 16, visibility: "已接触", lastMove: "一名社会版编辑压下了工人失踪短讯。" },
  { id: "black-market", name: "桥区非凡黑市", kind: "灰色势力", publicGoal: "维持隐秘交易", currentPlan: "垄断配方、材料和危险物品流向", trust: 8, interest: 24, suspicion: 10, leverage: 4, planProgress: 13, visibility: "已接触", lastMove: "有人开始询问黑玻璃制品的买家。" },
];

export const INITIAL_TIMELINE: TimelineEvent[] = [
  { id: "tl-awakening", title: "廷根的苏醒者", scheduledWeek: 1, kind: "历史锚点", status: "active", summary: "远方一名本不属于这个时代的人从死亡中醒来；贝克兰德暂时无人知晓。", revealed: true, pressure: 5 },
  { id: "tl-tingen-shadow", title: "廷根阴影加深", scheduledWeek: 6, kind: "可变事件", status: "upcoming", summary: "廷根的隐秘冲突将逼近灾变窗口。玩家只能通过极少数远方情报察觉。", revealed: false, pressure: 18 },
  { id: "tl-detective-arrival", title: "一位侦探抵达贝克兰德", scheduledWeek: 10, kind: "历史锚点", status: "upcoming", summary: "如果历史没有严重偏转，一名新的私人侦探会进入首都。", revealed: false, pressure: 12 },
  { id: "tl-population", title: "不可见人口开始汇聚", scheduledWeek: 14, kind: "可变事件", status: "upcoming", summary: "招工、迁移、失踪和收容记录将逐渐出现同一方向。", revealed: false, pressure: 36 },
  { id: "tl-procurement", title: "王室采购进入加速期", scheduledWeek: 18, kind: "可变事件", status: "upcoming", summary: "材料、煤气设施和封闭仓库的调度会明显增多。", revealed: false, pressure: 55 },
  { id: "tl-smog-eve", title: "雾霾前夜", scheduledWeek: 22, kind: "可变事件", status: "upcoming", summary: "相关势力完成最后准备，玩家的证据、盟友与破坏成果开始决定事件形态。", revealed: false, pressure: 78 },
  { id: "tl-great-smog", title: "贝克兰德大雾霾", scheduledWeek: 24, kind: "终局", status: "upcoming", summary: "终局事件可能被阻止、削弱、转移、利用或按原历史爆发。", revealed: true, pressure: 92 },
];

export function createInitialGame(pathwayId: PathwayId = "seer"): GameState {
  return {
    version: 6,
    week: 1,
    date: "1349年6月30日",
    pathwayId,
    currentSequence: 9,
    digestion: 34,
    spirituality: 6,
    spiritualityMax: 6,
    formulaKnowledge: 100,
    materials: materialsFor(pathwayId, 8),
    organizationName: "鸦羽侦探事务所",
    coverIdentity: "私人调查、失物寻回与商业背景核查",
    charter: "保护组织成员与无辜者；证据不足时不公开指控；未知高位威胁下优先撤退。",
    money: 420,
    secrecy: 78,
    stability: 71,
    influence: 12,
    deviation: .7,
    members: INITIAL_MEMBERS.map((item) => ({ ...item })),
    facilities: INITIAL_FACILITIES.map((item) => ({ ...item })),
    departments: [
      { id: "field", name: "外勤与调查", leadMemberId: "mara", mandate: "验证异常、建立撤离路线，不与未知非凡者正面冲突。", autonomy: 42, budget: 14, status: "2人编制", weeklyVerb: "自动核验一项已发现线索的外围信息" },
      { id: "support", name: "档案与后勤", leadMemberId: "cedric", mandate: "维持合法掩护、管理资产与建设项目。", autonomy: 35, budget: 11, status: "2人编制", weeklyVerb: "维持掩护收入并降低设施事故概率" },
    ],
    inventory: [
      { id: "black-locket", name: "渗水的黑玻璃挂坠", category: "封印物", quantity: 1, location: "封印储藏间", keeper: "罗文·布莱克", risk: "每晚三点传出敲门声；来源未知。" },
      { id: "worker-list", name: "被雨水浸透的工人名单", category: "证据", quantity: 1, location: "证据档案室", keeper: "伊妮丝·科尔", risk: "名单最后三行使用不同墨水补写。" },
      { id: "ritual-kit", name: "基础仪式器具箱", category: "仪式器具", quantity: 1, location: "简易仪式室", keeper: "罗文·布莱克", risk: "低" },
      { id: "cover-papers", name: "事务所合法身份文件", category: "身份文件", quantity: 1, location: "密议室暗柜", keeper: "塞德里克·霍尔", risk: "一旦丢失，主据点掩护将立刻失效。" },
    ],
    missions: [{
      id: "first-knock", title: "凌晨三点的敲门声", premise: "一名陌生信使把黑玻璃挂坠和工人名单塞进事务所门缝后失踪。挂坠在没有门的储藏间里连续两夜传出敲门声。", deadline: 3, urgency: 72, progress: 8, consequence: "若继续放任，挂坠中的联系可能跨过封印，并让送件者背后的势力定位据点。", hints: ["调查名单上的工人", "对挂坠进行安全鉴定", "追踪信使的来路", "把物品转交教会或另一势力", "迁移、摧毁或利用这件物品"], state: "active",
    }],
    playerIntents: [{ id: "intent-advancement", text: `完成${PATHWAYS[pathwayId].sequences.find((item) => item.rank === 8)?.name}的消化与材料准备`, pinned: true, state: "active" }],
    schedule: [],
    facts: [
      { id: "fact-arrival", subject: "黑玻璃挂坠", statement: "由身份不明的信使在雨夜送至事务所，信使随后失踪。", certainty: "确认", source: "据点门房记录", week: 1 },
      { id: "fact-knock", subject: "黑玻璃挂坠", statement: "连续两夜在凌晨三点传出类似敲门的声音，储藏间没有第二个出入口。", certainty: "确认", source: "成员共同证词", week: 1 },
    ],
    chronicle: [],
    discoveredDistrictIds: ["cherwood", "east", "bridge", "north", "dock"],
    evidenceNodes: INITIAL_EVIDENCE.map((item) => ({ ...item, tags: [...item.tags] })),
    evidenceLinks: INITIAL_EVIDENCE_LINKS.map((item) => ({ ...item })),
    opportunities: INITIAL_OPPORTUNITIES.map((item) => ({ ...item, requirements: [...item.requirements] })),
    factions: INITIAL_FACTIONS.map((item) => ({ ...item })),
    timeline: INITIAL_TIMELINE.map((item) => ({ ...item })),
    worldMoves: [],
    economyHistory: [],
    organizationConditions: ["未获许可", "掩护业务稳定", "成员仍在观察负责人"],
  };
}
