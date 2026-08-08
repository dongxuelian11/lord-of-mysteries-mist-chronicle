export type AuthoredStrategicPointKind = "authority" | "market" | "community" | "occult" | "security" | "transport" | "information";

export type AuthoredStrategicPointSeed = {
  name: string;
  kind: AuthoredStrategicPointKind;
  weight: 1 | 2 | 3 | 4;
  loreStatus: "verified" | "requires-runtime-verification";
  loreEvidenceIds?: string[];
};

export type AuthoredBlockSeed = {
  name: string;
  weight: 1 | 2 | 3;
  points: [AuthoredStrategicPointSeed, AuthoredStrategicPointSeed, AuthoredStrategicPointSeed];
};

export type AuthoredDistrictSeed = {
  id: string;
  name: string;
  weight: 3 | 4;
  rivals: [string, string, string];
  loreEvidenceIds: string[];
  blocks: [AuthoredBlockSeed, AuthoredBlockSeed, AuthoredBlockSeed, AuthoredBlockSeed, AuthoredBlockSeed];
};

const point = (name: string, kind: AuthoredStrategicPointKind, weight: 1 | 2 | 3 | 4, verified = false, loreEvidenceIds?: string[]): AuthoredStrategicPointSeed => ({ name, kind, weight, loreStatus: verified ? "verified" : "requires-runtime-verification", loreEvidenceIds });
const block = (name: string, weight: 1 | 2 | 3, points: AuthoredBlockSeed["points"]): AuthoredBlockSeed => ({ name, weight, points });

/**
 * Stable desktop-map topology: 10 districts × 5 blocks × 3 strategic points.
 * Canonical landmarks are marked verified. Local streets, offices and networks are
 * authored play spaces constrained by the district evidence and stay explicitly
 * marked for runtime verification instead of pretending to be novel canon.
 */
export const BACKLUND_AUTHORED_DISTRICTS: AuthoredDistrictSeed[] = [
  {
    id: "north", name: "北区", weight: 3, rivals: ["night-church", "press", "police"], loreEvidenceIds: ["lotm-08-007", "lotm-06-001", "lotm-07-001"],
    blocks: [
      block("霍伊大学街区", 3, [point("霍伊大学主档案馆", "information", 4, true), point("古典学讲堂联络网", "community", 2), point("大学地下标本库", "occult", 3)]),
      block("圣赛缪尔街区", 3, [point("圣赛缪尔教堂外围联络线", "authority", 4, true), point("教堂广场巡逻哨", "security", 3), point("夜间忏悔消息链", "information", 2)]),
      block("出版社街区", 2, [point("北区报刊总发行站", "information", 3), point("铅字工坊排版室", "market", 2), point("匿名广告投递箱", "information", 2)]),
      block("博物馆街区", 2, [point("王国博物馆库房入口", "authority", 3), point("私人收藏品鉴会", "market", 2), point("古物修复工作室", "occult", 2)]),
      block("北站街区", 2, [point("北站行李托运台", "transport", 3), point("长途列车时刻室", "information", 2), point("铁路警务值班所", "security", 2)]),
    ],
  },
  {
    id: "empress", name: "皇后区", weight: 3, rivals: ["royal-project", "witch-sect", "police"], loreEvidenceIds: ["lotm-08-007", "lotm-11-004", "lotm-11-002"],
    blocks: [
      block("王宫外围", 3, [point("王宫供应商审核处", "authority", 4, true), point("宫门仪仗换岗线", "security", 3), point("王室马车调度册", "transport", 2)]),
      block("皇后花园街区", 2, [point("皇后花园仆役通行线", "information", 3, true), point("花房稀有植物账册", "occult", 2), point("园丁与车夫互助圈", "community", 2)]),
      block("西宅邸区", 3, [point("世袭贵族管家联席会", "community", 3), point("私人宴会请柬印房", "information", 2), point("宅邸地下酒窖通道", "transport", 2)]),
      block("使馆街区", 3, [point("外国使团递函处", "authority", 4), point("外交随员沙龙", "information", 3), point("使馆马车安全线", "security", 2)]),
      block("贵族供应区", 2, [point("高级布匹订货会", "market", 3), point("银器与徽章工坊", "market", 2), point("宅邸采购人消息链", "information", 2)]),
    ],
  },
  {
    id: "west", name: "西区", weight: 3, rivals: ["night-church", "press", "police"], loreEvidenceIds: ["lotm-08-007", "lotm-06-001", "lotm-11-002"],
    blocks: [
      block("丰收教堂街区", 3, [point("丰收教堂救济登记网", "community", 4, true), point("慈善厨房粮食账簿", "market", 2), point("教区家庭探访线", "information", 3)]),
      block("律师街区", 3, [point("律师街合法身份渠道", "authority", 4, true), point("公证文书保管所", "information", 3), point("诉讼掮客咖啡室", "market", 2)]),
      block("私人诊所区", 2, [point("西区联合病历柜", "information", 3), point("夜间出诊马车队", "transport", 2), point("药剂师采购联盟", "market", 3)]),
      block("沙龙街区", 3, [point("贵族私人沙龙引荐网", "community", 4, true), point("心理学读书会会客室", "occult", 3), point("晚宴仆役耳目链", "information", 2)]),
      block("慈善机构区", 2, [point("孤儿院人口名册", "information", 3), point("济贫委员会募款处", "authority", 2), point("志愿护理员网络", "community", 3)]),
    ],
  },
  {
    id: "hillston", name: "希尔斯顿区", weight: 3, rivals: ["royal-project", "steam-church", "press"], loreEvidenceIds: ["lotm-08-007", "lotm-11-001", "lotm-11-003"],
    blocks: [
      block("证券街区", 3, [point("证券交易所异常委托簿", "information", 4, true), point("经纪人午间消息圈", "community", 2), point("停牌公告印发室", "authority", 3)]),
      block("银行街区", 3, [point("银行街票据清算网", "market", 4, true), point("夜间金库押运线", "security", 3), point("大额汇票核验台", "information", 3)]),
      block("保险街区", 2, [point("海运保险事故档案", "information", 3), point("精算师概率研究会", "occult", 2), point("理赔调查员联络处", "community", 2)]),
      block("百货街区", 2, [point("大型百货采购渠道", "market", 4, true), point("进口商品验货间", "information", 2), point("地下锅炉与货梯网", "transport", 2)]),
      block("商会街区", 3, [point("贝克兰德商会表决厅", "authority", 4), point("承包商联合报价簿", "market", 3), point("商会秘书私函网", "information", 2)]),
    ],
  },
  {
    id: "cherwood", name: "乔伍德区", weight: 3, rivals: ["police", "press", "aurora-order"], loreEvidenceIds: ["lotm-08-007", "lotm-11-002", "lotm-11-005"],
    blocks: [
      block("鸦羽事务所街区", 3, [point("鸦羽事务所本部警戒圈", "security", 4, true), point("本部合法委托登记簿", "information", 3), point("后巷紧急撤离门", "transport", 3)]),
      block("剧院街区", 2, [point("剧院街后台消息网", "information", 3, true), point("演员与化妆师互助圈", "community", 2), point("道具仓库暗门", "transport", 2)]),
      block("小工坊区", 2, [point("钟表匠精密加工台", "market", 3), point("印刷工坊夜班线", "information", 2), point("煤气检修工联络簿", "community", 2)]),
      block("地下聚会街区", 3, [point("隐秘聚会引荐链", "occult", 4, true), point("租赁会客室钥匙网", "market", 2), point("便衣巡查观察点", "security", 3)]),
      block("南北交通街区", 2, [point("乔伍德马车换乘场", "transport", 4), point("跨区包裹代收站", "information", 2), point("夜班车夫休息会", "community", 2)]),
    ],
  },
  {
    id: "government", name: "政府区", weight: 4, rivals: ["royal-project", "police", "night-church"], loreEvidenceIds: ["lotm-08-007", "lotm-11-004", "lotm-11-005"],
    blocks: [
      block("议会外围", 3, [point("王国议会请愿与议程线", "authority", 4, true), point("议员助理私人递函网", "information", 3), point("议会马车安检岗", "security", 3)]),
      block("市政厅街区", 3, [point("市政厅人口登记处", "authority", 4), point("城市预算抄录室", "information", 3), point("公务员午餐俱乐部", "community", 2)]),
      block("档案街区", 3, [point("王国行政档案总库", "information", 4), point("封存案卷借调窗口", "authority", 3), point("销毁文书转运车", "transport", 2)]),
      block("公共工程区", 3, [point("市政厅公共工程档案", "information", 4, true), point("煤气管网审批处", "authority", 3), point("工程承包人等候厅", "market", 3)]),
      block("司法街区", 3, [point("治安法庭秘密案卷室", "authority", 4), point("警察厅证物移交线", "security", 3), point("书记官口供校验网", "information", 3)]),
    ],
  },
  {
    id: "east", name: "东区", weight: 4, rivals: ["royal-project", "witch-sect", "aurora-order"], loreEvidenceIds: ["lotm-08-007", "lotm-11-001", "lotm-11-002"],
    blocks: [
      block("废弃纺织厂区", 3, [point("废弃纺织厂地下出入口", "occult", 4, true), point("旧锅炉房隐蔽仓位", "market", 2), point("厂房屋顶观察线", "security", 2)]),
      block("廉租屋区", 3, [point("廉价旅馆流动人口名册", "information", 4, true), point("房东与收租人网络", "community", 3), point("连排屋后巷通路", "transport", 2)]),
      block("煤气工厂区", 3, [point("煤气工厂调压与检修网", "authority", 4, true), point("夜班炉工互保名单", "community", 2), point("地下主管道闸室", "security", 3)]),
      block("临时招工区", 2, [point("临时招工黑板", "information", 3), point("工头现金结算桌", "market", 2), point("退伍劳工联络点", "community", 3)]),
      block("河岸棚户区", 3, [point("河岸无证渡船线", "transport", 3), point("棚户区接生婆网络", "community", 3), point("排污渠异常观察口", "occult", 3)]),
    ],
  },
  {
    id: "bridge", name: "桥区", weight: 3, rivals: ["black-market", "police", "press"], loreEvidenceIds: ["lotm-08-007", "lotm-11-001", "lotm-11-002"],
    blocks: [
      block("大桥北口", 3, [point("贝克兰德大桥检查岗", "security", 4, true), point("过桥货车登记亭", "information", 3), point("桥下维修栈道", "transport", 2)]),
      block("马车总站区", 3, [point("马车总站夜班调度簿", "information", 4, true), point("车夫换班休息会", "community", 2), point("无牌马车停靠巷", "transport", 3)]),
      block("旧货市场区", 3, [point("旧货市场隐秘交易圈", "market", 4, true), point("遗物来历鉴定摊", "occult", 3), point("市场巡警眼线网", "security", 2)]),
      block("短租公寓区", 2, [point("短租房客登记册", "information", 3), point("房间钥匙转借网", "transport", 2), point("清道夫匿名委托点", "community", 2)]),
      block("河运换乘区", 3, [point("河运驳船调度台", "transport", 4), point("货物转签账房", "market", 3), point("水警夜巡停泊点", "security", 2)]),
    ],
  },
  {
    id: "south", name: "南区", weight: 3, rivals: ["night-church", "aurora-order", "police"], loreEvidenceIds: ["lotm-08-007", "lotm-11-002", "lotm-07-001"],
    blocks: [
      block("慈善诊所区", 3, [point("慈善诊所病例网", "information", 4, true), point("夜间急救马车线", "transport", 3), point("药品捐赠登记处", "market", 2)]),
      block("工人互助会区", 3, [point("工人互助会联络簿", "community", 4, true), point("罢工救济金暗账", "market", 3), point("工伤证言保管箱", "information", 3)]),
      block("廉价药房街", 2, [point("廉价药房材料采购线", "market", 4, true), point("游医夜间问诊点", "community", 2), point("异常处方留档柜", "occult", 3)]),
      block("工匠住宅区", 2, [point("工匠家庭互保网络", "community", 3), point("家庭作坊订单簿", "market", 2), point("屋顶烟道观察线", "information", 2)]),
      block("小型工厂区", 3, [point("小厂主联合采购会", "market", 3), point("工厂消防巡查线", "security", 3), point("失踪工人考勤档案", "information", 4)]),
    ],
  },
  {
    id: "dock", name: "码头区", weight: 4, rivals: ["black-market", "steam-church", "royal-project"], loreEvidenceIds: ["lotm-08-007", "lotm-11-001", "lotm-11-003"],
    blocks: [
      block("货运栈桥区", 3, [point("货运栈桥装卸班组", "community", 4, true), point("泊位到港时刻板", "information", 3), point("重货吊机控制台", "transport", 2)]),
      block("海关仓库区", 3, [point("海关仓库报关档案", "authority", 4, true), point("扣押货物封存间", "security", 3), point("报关代理人消息网", "information", 3)]),
      block("水手酒吧区", 2, [point("水手酒吧远洋消息网", "information", 4, true), point("船员临时招募桌", "community", 3), point("酒窖走私交割口", "market", 2)]),
      block("船坞维修区", 3, [point("船坞维修工名册", "community", 3), point("蒸汽部件采购库", "market", 3), point("废船隐蔽检查舱", "occult", 3)]),
      block("海外货栈区", 3, [point("海外货栈租赁账簿", "market", 4), point("异国包裹检疫台", "authority", 3), point("河汊无灯转运线", "transport", 3)]),
    ],
  },
];

