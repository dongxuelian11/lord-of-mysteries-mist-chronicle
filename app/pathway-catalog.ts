/**
 * 1349 opening pathway catalogue.
 *
 * Sequence names are the stable lore index. Concrete effects, potion recipes,
 * rituals and historical availability must still be retrieved from the RAG
 * knowledge layer before they become world facts.
 */
export const STANDARD_PATHWAY_IDS = [
  "seer", "apprentice", "error", "spectator", "tyrant", "sun", "white-tower",
  "hanged-man", "moon", "mother", "death", "darkness", "twilight-giant",
  "hunter", "demoness", "black-emperor", "justiciar", "paragon", "mystery",
  "chained", "abyss", "wheel-of-fortune",
] as const;

export type StandardPathwayId = (typeof STANDARD_PATHWAY_IDS)[number];

export type PathwayHighGroup = {
  sefirot: string;
  aboveSequence: string;
};

/**
 * Minimal high-sequence grouping kept in the public runtime catalogue.
 *
 * The private lore compendium remains authoritative when present, while this
 * derived index lets clean source builds preserve the 22-pathway/9-sefirot
 * rules without bundling the full private corpus.
 */
export const PATHWAY_HIGH_GROUPS: Record<StandardPathwayId, PathwayHighGroup> = {
  seer: { sefirot: "源堡", aboveSequence: "诡秘之主" },
  apprentice: { sefirot: "源堡", aboveSequence: "诡秘之主" },
  error: { sefirot: "源堡", aboveSequence: "诡秘之主" },
  spectator: { sefirot: "混沌海", aboveSequence: "上帝/全知全能者" },
  tyrant: { sefirot: "混沌海", aboveSequence: "上帝/全知全能者" },
  sun: { sefirot: "混沌海", aboveSequence: "上帝/全知全能者" },
  "white-tower": { sefirot: "混沌海", aboveSequence: "上帝/全知全能者" },
  "hanged-man": { sefirot: "混沌海", aboveSequence: "上帝/全知全能者" },
  moon: { sefirot: "母巢", aboveSequence: "生命系旧日（女神之源）" },
  mother: { sefirot: "母巢", aboveSequence: "生命系旧日（女神之源）" },
  death: { sefirot: "永暗之河", aboveSequence: "永恒之暗" },
  darkness: { sefirot: "永暗之河", aboveSequence: "永恒之暗" },
  "twilight-giant": { sefirot: "永暗之河", aboveSequence: "永恒之暗" },
  hunter: { sefirot: "灾祸之城", aboveSequence: "毁灭天灾" },
  demoness: { sefirot: "灾祸之城", aboveSequence: "毁灭天灾" },
  "black-emperor": { sefirot: "失序之国", aboveSequence: "失序者/秩序阴影" },
  justiciar: { sefirot: "失序之国", aboveSequence: "失序者/秩序阴影" },
  paragon: { sefirot: "知识荒野", aboveSequence: "知识之妖" },
  mystery: { sefirot: "知识荒野", aboveSequence: "知识之妖" },
  chained: { sefirot: "暗影世界", aboveSequence: "恶魔之父" },
  abyss: { sefirot: "暗影世界", aboveSequence: "恶魔之父" },
  "wheel-of-fortune": { sefirot: "光之钥", aboveSequence: "光之钥/命运化身" },
};

export type OpeningAbilityProfile = {
  id: string;
  name: string;
  verb: string;
  description: string;
  risk: string;
  passive?: boolean;
};

export type PathwayOpeningDossier = {
  id: StandardPathwayId;
  name: string;
  color: string;
  sequences: readonly string[];
  managementContribution: string;
  personalStyle: string;
  knownRisk: string;
  plausibleSource: string;
  openingAbilities: readonly OpeningAbilityProfile[];
  loreQueries: readonly string[];
};

const ability = (
  id: string,
  name: string,
  verb: string,
  description: string,
  risk: string,
  passive = false,
): OpeningAbilityProfile => ({ id, name, verb, description, risk, passive });

const dossier = (
  id: StandardPathwayId,
  name: string,
  color: string,
  sequences: readonly string[],
  managementContribution: string,
  personalStyle: string,
  knownRisk: string,
  plausibleSource: string,
  openingAbilities: readonly OpeningAbilityProfile[],
): PathwayOpeningDossier => ({
  id,
  name,
  color,
  sequences,
  managementContribution,
  personalStyle,
  knownRisk,
  plausibleSource,
  openingAbilities,
  loreQueries: [`${name}途径 序列9至0 名称 能力`, `${name}途径 污染 失控 扮演`, `${name}途径 1349年 贝克兰德 配方 来源 势力`],
});

export const PATHWAY_OPENING_DOSSIERS: Record<StandardPathwayId, PathwayOpeningDossier> = {
  seer: dossier("seer", "占卜家", "#B7A36F", ["占卜家", "小丑", "魔术师", "无面人", "秘偶大师", "诡法师", "古代学者", "奇迹师", "诡秘侍者", "愚者"], "预警风险、验证情报、为行动准备退路。", "用占卜与准备处理未知，不把启示误当确定事实。", "接近高位存在的占卜可能招来反向注视。", "占卜俱乐部、民间神秘学圈或隐秘传承。", [ability("spirit-vision", "灵视", "观察灵性痕迹", "观察灵体、情绪色彩与异常残留。", "未知存在可能沿注视反向感知。"), ability("divination", "媒介占卜", "取得象征启示", "围绕明确问题取得方向与危险倾向。", "答案受信息、干扰与问题层次限制。")]),
  apprentice: dossier("apprentice", "学徒", "#8DA7C4", ["学徒", "戏法大师", "占星人", "记录官", "旅行家", "秘法师", "漫游者", "旅法师", "星之匙", "门"], "渗透、撤离、运输与跨区联络。", "寻找边界和归路，用灵活手段避开正面冲突。", "亚伯拉罕家族血脉与相关物品可能受满月呓语和高序列污染牵连。", "亚伯拉罕支系、隐秘传承或受污染的相关物品。", [ability("door-sense", "门径感知", "寻找隐蔽入口", "感知薄弱边界、隐藏门和撤离路线。", "异常空间可能伪装成出口。"), ability("open-lock", "开锁术", "穿越普通封锁", "干涉普通门锁、窗栓与简单机械结构。", "会留下可追踪的空间扰动。")]),
  error: dossier("error", "偷盗者", "#8C8170", ["偷盗者", "诈骗师", "解密学者", "盗火人", "窃梦家", "寄生者", "欺瞒导师", "命运木马", "时之虫", "错误"], "反渗透、秘密获取与利用制度漏洞。", "观察目标并拿走可被拿走之物，避免正面交锋。", "偷窃对象与层次越高，反噬、追踪和身份风险越大。", "隐秘家族、盗贼网络或来历不明的非凡遗产。", [ability("error-theft", "非凡偷盗", "窃取随身物品", "以超常手法窃取近距离、可触及的小型物品。", "失败会立刻暴露意图，不能越层窃取抽象事物。"), ability("error-hands", "灵巧手法", "完成精密操作", "强化手指灵活与动作隐蔽性。", "不等于自动绕过监视或封印。", true)]),
  spectator: dossier("spectator", "观众", "#8FB4A1", ["观众", "读心者", "心理医生", "催眠师", "梦境行者", "操纵师", "织梦人", "洞察者", "作家", "空想家"], "人员筛选、谈判、忠诚与组织稳定。", "保持旁观，区分事实、推断和情绪。", "过度干预会破坏人格、信任与自身旁观位置。", "心理学研究圈、贵族神秘学圈或相关隐秘组织。", [ability("observe", "行为观察", "建立心理画像", "从言行与微表情识别情绪和行为矛盾。", "画像是推断，不能当作事实。", true), ability("guided-talk", "引导式谈话", "降低语言防御", "按心理画像调整提问顺序。", "被察觉会损害信任。")]),
  tyrant: dossier("tyrant", "水手", "#47778B", ["水手", "暴怒之民", "航海家", "风眷者", "海洋歌者", "灾难主祭", "海王", "天灾", "雷神", "暴君"], "码头渠道、护卫、远航与恶劣环境行动。", "以强健身体和海上经验突破环境阻碍。", "力量与愤怒相互强化，鲁莽冲突会加速失控。", "风暴教会外围、海员圈或海上遗物。", [ability("sailor-body", "水手体魄", "抵抗恶劣环境", "强化平衡、力量、耐力与水下行动。", "不能替代氧气、治疗或专业航海知识。", true), ability("weather-instinct", "天气直觉", "感知天气变化", "从气压、水汽和灵性征兆判断短期天气倾向。", "非自然天气会产生误导。")]),
  sun: dossier("sun", "歌颂者", "#D2B85D", ["歌颂者", "祈光人", "太阳神官", "公证人", "光之祭司", "无暗者", "正义导师", "逐光者", "纯白天使", "太阳"], "士气、净化、防护与公开合法形象。", "以赞美、勇气和光明维持队伍。", "对邪恶与净化的简单化判断可能造成盲目和冲突。", "永恒烈阳教会影响区、海外传承或封存物。", [ability("bard-inspire", "歌声鼓舞", "振奋同伴", "通过歌声短暂提升小队勇气与协作。", "无法抹除真实恐惧来源。"), ability("sun-constitution", "光明体魄", "抵抗阴冷与疾病", "获得优于常人的体魄和对阴冷环境的抵抗。", "并不免疫毒素、污染或重伤。", true)]),
  "white-tower": dossier("white-tower", "阅读者", "#B4B2A8", ["阅读者", "推理学员", "守知者", "博学者", "秘术导师", "预言家", "洞悉者", "智天使", "全知之眼", "白塔"], "档案、研究、方案评估与跨领域培训。", "快速学习并用明确证据完成推理。", "知识广度不等于事实完整，错误前提会导出严密的错误结论。", "知识与智慧之神教会、大学或学术传承。", [ability("reader-memory", "强化阅读", "快速掌握文本", "提高阅读、记忆和整理普通知识的效率。", "不能凭空理解缺失背景或受封锁知识。", true), ability("reader-reason", "逻辑推演", "检查论证缺口", "找出材料中的矛盾、跳步和待验证前提。", "结论仍受输入材料真实性限制。")]),
  "hanged-man": dossier("hanged-man", "秘祈人", "#5C4A55", ["秘祈人", "倾听者", "隐修士", "蔷薇主教", "牧羊人", "黑骑士", "三首圣堂", "秽语长老", "暗天使", "倒吊人"], "危险知识、牺牲型方案与对敌方能力的研究。", "在阴影与隐秘仪式中获取力量。", "倾听与祈求可能直接建立对邪异高位存在的污染联系。", "隐秘教团、危险仪式或受污染遗产；开局负担极高。", [ability("secret-supplicant-ritual", "隐秘仪式知识", "辨认危险祈求", "识别基础献祭、祈求和邪异象征。", "理解错误对象本身就可能建立联系。"), ability("shadow-sense", "阴影感知", "察觉阴影异常", "发现近处阴影中的异常活动与残留。", "凝视异常阴影可能被其反向察觉。")]),
  moon: dossier("moon", "药师", "#A55B67", ["药师", "驯兽师", "吸血鬼", "魔药教授", "深红学者", "巫王", "召唤大师", "创生者", "美神", "月亮"], "医疗、材料培育、药剂与生物资源。", "观察生命状态，用药物和配方进行精确干预。", "血液、月相和高位生命污染会影响判断与药剂。", "药师家族、生命学派或民间药剂传承。", [ability("apothecary-diagnose", "药理诊断", "判断身体异常", "结合气味、肤色和反应判断常见疾病与药物影响。", "不能替代未知污染的知识库验证。"), ability("apothecary-compound", "药剂调配", "制作普通药剂", "提高草药、解毒剂和恢复药剂的制作稳定性。", "错误材料会把副作用一并放大。")]),
  mother: dossier("mother", "耕种者", "#6F8055", ["耕种者", "医师", "丰收祭司", "生物学家", "德鲁伊", "古代炼金师", "抬棺人", "荒芜主人", "自然行者", "母亲"], "食物、药材、人口恢复和据点自给。", "照料土地与生命，使资源稳定生长。", "畸变生命、繁殖失衡与地母相关高位影响不可忽视。", "大地母神教会影响区、农庄或生命炼金传承。", [ability("planter-vigor", "耕作者体魄", "承担长期劳作", "强化耐力、恢复与对常见病害的抵抗。", "并不抵抗非凡污染。", true), ability("crop-sense", "作物感知", "判断生长状态", "快速判断植物、土壤和常见病害。", "异常物种必须先做知识库核验。")]),
  death: dossier("death", "收尸人", "#66717A", ["收尸人", "掘墓人", "通灵者", "死灵导师", "看门人", "不死者", "摆渡人", "死亡执政官", "苍白皇帝", "死神"], "尸检、灵体事件、伤亡处置与地下情报。", "直面死亡并维持对死者的尊重。", "长期接触死亡与灵体会带来阴冷、亡者牵连和人格偏移。", "墓园、医院、教会外围或南大陆相关遗产。", [ability("corpse-collector-cold", "死亡耐受", "抵抗尸气与阴冷", "提高对尸体、阴冷环境和普通疾病的承受。", "不能抵抗高层次亡灵和污染。", true), ability("death-trace", "死亡痕迹", "检查死亡残留", "从尸体和现场辨认死亡时间与异常灵性痕迹。", "不能直接获知凶手身份或完整死因。")]),
  darkness: dossier("darkness", "不眠者", "#555C76", ["不眠者", "午夜诗人", "梦魇", "安魂师", "灵巫", "守夜人", "恐惧主教", "隐秘之仆", "厄难骑士", "黑暗"], "夜间值守、梦境防线、隐秘与精神安抚。", "在黑夜中保持清醒并保护他人睡眠。", "睡眠剥夺、梦境侵蚀和对隐秘的依赖会损伤锚点。", "黑夜教会外围、值夜者关系或夜间异常事件。", [ability("sleepless", "不眠体质", "减少睡眠需求", "在有限时期内以较少睡眠保持清醒。", "疲劳仍会累积，不能无限替代休息。", true), ability("night-vision", "夜视", "在低光环境观察", "提升黑暗环境中的视觉和听觉。", "非凡黑暗仍可能遮蔽感官。", true)]),
  "twilight-giant": dossier("twilight-giant", "战士", "#8B765F", ["战士", "格斗家", "武器大师", "黎明骑士", "守护者", "猎魔者", "银骑士", "荣耀者", "神明之手", "黄昏巨人"], "本部防卫、训练、护送与正面战斗。", "以纪律、体魄和武器保护阵线。", "把力量等同正确会导致刚愎、牺牲过度和失控。", "军队、教会外围、佣兵或古老战士传承。", [ability("warrior-body", "战士体魄", "强化正面行动", "获得明显优于常人的力量、耐力与协调。", "无法无视枪械、重伤与非凡攻击。", true), ability("warrior-weapon", "武器基础", "快速掌握武器", "提高对常见冷兵器和防御动作的适应。", "不等同于后续序列的武器大师能力。", true)]),
  hunter: dossier("hunter", "猎人", "#C47C68", ["猎人", "挑衅者", "纵火家", "阴谋家", "收割者", "铁血骑士", "战争主教", "天气术士", "征服者", "红祭司"], "行动指挥、追踪、战术与区域冲突。", "寻找弱点、设置陷阱并掌握冲突节奏。", "挑衅、战争和愤怒会反向塑造使用者与组织。", "军队、佣兵、猎人或因蒂斯相关渠道。", [ability("track", "痕迹追踪", "追踪目标", "从环境痕迹拼出目标路线。", "强大猎物可能故意误导。"), ability("trap", "快速陷阱", "布置陷阱", "利用现场材料制造预警或阻滞。", "仓促布置可能伤及无关者并提高暴露。")]),
  demoness: dossier("demoness", "刺客", "#9C536A", ["刺客", "教唆者", "女巫", "欢愉", "痛苦", "绝望", "不老", "灾难", "末日", "魔女"], "潜入、反跟踪、秘密清除与高风险社交。", "隐藏自身并精准攻击薄弱处。", "性别变化、情绪与灾难倾向是途径真实代价，不得处理成单纯外观奖励。", "隐秘教派、刺客网络或危险遗产。", [ability("assassin-stealth", "刺客潜行", "隐藏行动痕迹", "降低移动声响并利用视线死角接近目标。", "不能在无掩体或被锁定后自动消失。"), ability("assassin-strike", "致命判断", "识别身体弱点", "观察后判断普通生物的脆弱部位。", "对未知构造与高序列目标可能严重误判。")]),
  "black-emperor": dossier("black-emperor", "律师", "#4C4658", ["律师", "野蛮人", "贿赂者", "腐化男爵", "混乱导师", "堕落伯爵", "狂乱法师", "熵之公爵", "弑序亲王", "黑皇帝"], "法律掩护、谈判、交易和利用敌方制度矛盾。", "寻找规则中的漏洞，并迫使对手承认表述。", "持续扭曲秩序会制造腐化、失信和更高层次反制。", "律师圈、贵族遗产、政治秘密或相关隐秘势力。", [ability("lawyer-eloquence", "规则辩论", "迫使澄清表述", "在正式交涉中寻找歧义并要求对方明确条件。", "不能让虚假陈述自动成为事实。"), ability("lawyer-loophole", "漏洞观察", "发现规则冲突", "识别合同、命令或流程中可利用的不一致。", "漏洞可能是诱饵，使用会留下法律和关系后果。")]),
  justiciar: dossier("justiciar", "仲裁人", "#87909A", ["仲裁人", "治安官", "审讯者", "法官", "惩戒骑士", "律令法师", "混乱猎手", "平衡者", "秩序之手", "审判者"], "纪律、审计、治安、俘虏与组织制度。", "明确规则、判断违约并维护可执行秩序。", "把秩序绝对化会压制真实情境，并招致规避与反抗。", "司法、军警、鲁恩贵族或相关封存遗产。", [ability("arbiter-authority", "仲裁威仪", "强化正式命令", "在已有职责与秩序中提高合理命令的执行力。", "不能凭空取得合法权力，也不能强令自毁。"), ability("arbiter-judgment", "违约判断", "识别明确违令", "根据已知规则判断一次行为是否构成违令或违约。", "规则不完整时结论同样不完整。")]),
  paragon: dossier("paragon", "通识者", "#9A876B", ["通识者", "考古学家", "鉴定师", "机械专家", "天文学家", "炼金术士", "奥秘学者", "知识导师", "启蒙者", "完美者"], "设施、工程、装备、鉴定和生产效率。", "理解工具和结构，把知识转为可靠产物。", "危险造物、过度理性化和知识来源污染会反噬组织。", "蒸汽教会、工厂、大学或工匠传承。", [ability("savant-learning", "通识学习", "快速理解技术", "提高普通科学、机械与工艺知识的学习效率。", "不能自动掌握神秘知识。", true), ability("savant-device", "机械分析", "判断装置结构", "检查普通机械的功能、损坏与改造痕迹。", "异常装置必须经知识库验证后才能定性。")]),
  mystery: dossier("mystery", "窥秘人", "#A48AC1", ["窥秘人", "格斗学者", "巫师", "卷轴教授", "星象师", "神秘学家", "预言大师", "贤者", "知识皇帝", "隐者"], "神秘研究、配方验证、仪式与异常鉴定。", "先识别再使用，让知识接受可重复验证。", "隐匿贤者会主动灌输知识；知识追逐和高位污染是开局核心压力。", "摩斯苦修会、要素黎明关系、民间神秘学或受污染知识载体。", [ability("identify", "神秘鉴定", "鉴定异常", "辨识材料、符号、灵性残留和常见污染类型。", "主动读取未知知识可能建立危险联系。"), ability("occult-memory", "神秘记忆", "检索已知知识", "快速回忆真正学过的神秘学对应。", "只覆盖角色实际掌握的知识。", true)]),
  chained: dossier("chained", "囚犯", "#6F5960", ["囚犯", "疯子", "狼人", "活尸", "怨魂", "木偶", "沉默门徒", "古代邪物", "神孽", "被缚者"], "危险环境生存、看押、近战和承受污染。", "承认欲望与束缚，用自我克制维持边界。", "诅咒、欲望和身体异化会逐级加深；玫瑰学派背景尤其危险。", "诅咒受害者、南大陆传承或玫瑰学派相关事件。", [ability("prisoner-body", "囚犯体魄", "承受束缚与伤害", "强化身体、耐受与挣脱普通束缚的能力。", "受伤和污染仍会真实累积。", true), ability("prisoner-restraint", "欲望克制", "压制即时冲动", "短暂提高对恐惧、愤怒和冲动的自控。", "压制不是消除，事后必须恢复和处理。")]),
  abyss: dossier("abyss", "罪犯", "#5B3D3D", ["罪犯", "折翼天使", "连环杀手", "恶魔", "欲望使徒", "魔鬼", "呓语者", "鲜血大公", "污秽君王", "深渊"], "识别恶意、地下威慑和极高风险反制。", "理解犯罪与恶意如何寻找机会。", "这是高道德与失控风险开局；欲望和恶意会持续侵蚀人格，不能浪漫化。", "危险罪犯、恶魔家族遗产或被污染的非凡物品。", [ability("criminal-danger", "恶意直觉", "感知迫近恶意", "察觉近距离针对自身的明确恶意倾向。", "不能读取计划，强烈环境恐惧会误导。", true), ability("criminal-body", "犯罪者体魄", "执行危险动作", "提升力量、敏捷与对伤痛的忍耐。", "能力不会免除伤害、证据和道德后果。", true)]),
  "wheel-of-fortune": dossier("wheel-of-fortune", "怪物", "#8D9A80", ["怪物", "机器", "幸运者", "灾祸教士", "赢家", "厄运法师", "混乱行者", "先知", "巨蛇", "命运之轮"], "风险预警、机会发现和重大行动保险。", "感受命运的不协调，并在不确定中选择较安全方向。", "命运感知不受意志完全控制；追逐幸运可能积累灾祸与异常关注。", "生命学派、先天异常、流浪占卜者或偶然获得的遗产。", [ability("monster-premonition", "命运预感", "感知不协调", "以片段直觉感受近期危险或机会。", "无法指定内容或证明来源，预感可能令人失眠。", true), ability("monster-spirit", "高灵感", "察觉灵性异常", "更容易察觉附近不自然的灵性变化。", "也更容易被异常反向触及。", true)]),
};

export const CORE_IMPLEMENTED_PATHWAYS = ["seer", "spectator", "apprentice", "hunter", "mystery"] as const;

export function isStandardPathwayId(value: string): value is StandardPathwayId {
  return (STANDARD_PATHWAY_IDS as readonly string[]).includes(value);
}
