import { callModel, type AiConfig } from "./ai-client.ts";
import { LORE_RECORDS } from "./generated-lore-compendium.ts";
import { PATHWAY_OPENING_DOSSIERS, STANDARD_PATHWAY_IDS, type StandardPathwayId } from "./pathway-catalog.ts";
import { stableTextHash } from "./stable-id.ts";

export type OriginDifficulty = {
  sourceAccess: number;
  pursuit: number;
  pollution: number;
  survival: number;
  organizationValue: number;
  advancementScarcity: number;
};

export type OriginTrait = {
  id: string;
  name: string;
  kind: "advantage" | "burden" | "experience";
  description: string;
  triggers: string[];
  effects: {
    manpower?: number;
    money?: number;
    extraordinaryMaterials?: number;
    exposure?: number;
    reputation?: number;
    digestion?: number;
    instability?: number;
  };
};

export type PathwayOriginScenario = {
  id: string;
  pathwayId: StandardPathwayId;
  kind: "fixed" | "dynamic";
  title: string;
  summary: string;
  startingSequence: 7 | 8 | 9;
  source: string;
  contact: string;
  enemy: string;
  firstCrisis: string;
  startingLocation: { districtId: string; blockId: string; label: string };
  resources: { manpower: number; money: number; extraordinaryMaterials: number };
  exposure: number;
  reputation: number;
  hostility: { factionId: string; delta: number; cause: string }[];
  difficulty: OriginDifficulty;
  traits: [OriginTrait, OriginTrait];
  loreEvidenceIds: string[];
};

type OriginSeed = Omit<PathwayOriginScenario, "id" | "pathwayId" | "kind" | "difficulty" | "traits" | "loreEvidenceIds"> & {
  advantage: { name: string; description: string; triggers: string[]; effects: OriginTrait["effects"] };
  burden: { name: string; description: string; triggers: string[]; effects: OriginTrait["effects"] };
  evidence?: string[];
};

const PATHWAY_EVIDENCE = Object.fromEntries(STANDARD_PATHWAY_IDS.map((id, index) => [id, `lotm-04-${String(index + 2).padStart(3, "0")}`])) as Record<StandardPathwayId, string>;

const DIFFICULTY: Record<StandardPathwayId, OriginDifficulty> = {
  seer: { sourceAccess: 3, pursuit: 3, pollution: 4, survival: 3, organizationValue: 5, advancementScarcity: 4 },
  apprentice: { sourceAccess: 4, pursuit: 5, pollution: 5, survival: 2, organizationValue: 5, advancementScarcity: 5 },
  error: { sourceAccess: 5, pursuit: 5, pollution: 5, survival: 2, organizationValue: 4, advancementScarcity: 5 },
  spectator: { sourceAccess: 3, pursuit: 4, pollution: 4, survival: 4, organizationValue: 5, advancementScarcity: 4 },
  tyrant: { sourceAccess: 2, pursuit: 3, pollution: 3, survival: 4, organizationValue: 4, advancementScarcity: 3 },
  sun: { sourceAccess: 4, pursuit: 4, pollution: 3, survival: 4, organizationValue: 4, advancementScarcity: 4 },
  "white-tower": { sourceAccess: 4, pursuit: 3, pollution: 3, survival: 4, organizationValue: 5, advancementScarcity: 4 },
  "hanged-man": { sourceAccess: 3, pursuit: 5, pollution: 5, survival: 1, organizationValue: 3, advancementScarcity: 4 },
  moon: { sourceAccess: 4, pursuit: 4, pollution: 4, survival: 3, organizationValue: 5, advancementScarcity: 4 },
  mother: { sourceAccess: 3, pursuit: 3, pollution: 4, survival: 4, organizationValue: 5, advancementScarcity: 3 },
  death: { sourceAccess: 4, pursuit: 4, pollution: 4, survival: 3, organizationValue: 4, advancementScarcity: 4 },
  darkness: { sourceAccess: 4, pursuit: 3, pollution: 3, survival: 5, organizationValue: 5, advancementScarcity: 4 },
  "twilight-giant": { sourceAccess: 3, pursuit: 3, pollution: 2, survival: 5, organizationValue: 4, advancementScarcity: 3 },
  hunter: { sourceAccess: 3, pursuit: 4, pollution: 3, survival: 4, organizationValue: 5, advancementScarcity: 3 },
  demoness: { sourceAccess: 3, pursuit: 5, pollution: 5, survival: 2, organizationValue: 4, advancementScarcity: 4 },
  "black-emperor": { sourceAccess: 4, pursuit: 4, pollution: 3, survival: 4, organizationValue: 5, advancementScarcity: 4 },
  justiciar: { sourceAccess: 5, pursuit: 5, pollution: 2, survival: 4, organizationValue: 5, advancementScarcity: 5 },
  paragon: { sourceAccess: 4, pursuit: 3, pollution: 3, survival: 4, organizationValue: 5, advancementScarcity: 4 },
  mystery: { sourceAccess: 3, pursuit: 4, pollution: 5, survival: 2, organizationValue: 5, advancementScarcity: 4 },
  chained: { sourceAccess: 4, pursuit: 5, pollution: 5, survival: 2, organizationValue: 3, advancementScarcity: 4 },
  abyss: { sourceAccess: 5, pursuit: 5, pollution: 5, survival: 1, organizationValue: 2, advancementScarcity: 5 },
  "wheel-of-fortune": { sourceAccess: 5, pursuit: 4, pollution: 4, survival: 3, organizationValue: 4, advancementScarcity: 5 },
};

const location = (districtId: string, block: number, label: string) => ({ districtId, blockId: `${districtId}-block-${block}`, label });
const hostility = (factionId: string, delta: number, cause: string) => [{ factionId, delta, cause }];

const ORIGIN_SEEDS: Record<StandardPathwayId, [OriginSeed, OriginSeed]> = {
  seer: [
    { title: "占卜俱乐部的失踪会员", summary: "你从一名失踪占卜师留下的笔记与材料中完成晋升，并继承了他的最后一批委托。", startingSequence: 9, source: "民间占卜俱乐部的可靠笔记与遗留特性", contact: "北区占卜俱乐部的一名谨慎管理员", enemy: "正倒查失踪者交际圈的秘密组织观察者", firstCrisis: "一份已经应验一半的死亡占卜写着你的组织地址。", startingLocation: location("north", 1, "霍伊大学街区"), resources: { manpower: 22, money: 390, extraordinaryMaterials: 7 }, exposure: 5, reputation: 2, hostility: hostility("night-church", 4, "未登记的占卜活动"), advantage: { name: "预先准备", description: "对明确目标进行侦察或风险评估时更容易发现撤退线。", triggers: ["占卜", "侦察", "撤退"], effects: { digestion: 8 } }, burden: { name: "反向注视", description: "对高位或被遮蔽对象反复占卜会迅速增加暴露与不稳定。", triggers: ["高位存在", "连续占卜"], effects: { exposure: 6, instability: 7 } }, evidence: ["lotm-03-005"] },
    { title: "小丑留下的第二张脸", summary: "你已是序列8小丑；前任导师死亡后，官方与隐秘传承都在寻找他未交出的物品。", startingSequence: 8, source: "民间传承的完整序列8魔药与监督记录", contact: "桥区一名只用暗号联络的旧同伴", enemy: "秘密结社留下的追索者", firstCrisis: "导师的旧暗号本周重新出现在报纸广告栏。", startingLocation: location("bridge", 3, "旧货市场区"), resources: { manpower: 20, money: 350, extraordinaryMaterials: 8 }, exposure: 11, reputation: 0, hostility: hostility("black-market", 10, "继承了未结清的神秘交易"), advantage: { name: "危险直觉", description: "突发行动与近身危机中更容易保全核心人员。", triggers: ["伏击", "撤离", "伪装"], effects: { digestion: 12 } }, burden: { name: "遗物争夺", description: "旧传承会周期性引来索债与试探。", triggers: ["黑市", "遗物", "旧暗号"], effects: { exposure: 10, money: -30 } }, evidence: ["lotm-03-003", "lotm-03-005"] },
  ],
  apprentice: [
    { title: "亚伯拉罕旁支的封门人", summary: "你以序列8戏法大师身份替一支衰落家族维持安全屋；力量更强，但满月与血脉旧债同时存在。", startingSequence: 8, source: "亚伯拉罕旁支提供并监督服用的序列9与序列8魔药", contact: "一名不敢在满月露面的亚伯拉罕旁支", enemy: "沿家族遗物与空间痕迹搜猎的高序列威胁", firstCrisis: "下一次满月前，一扇已经封死的门从内侧响了三次。", startingLocation: location("cherwood", 5, "地下聚会街区"), resources: { manpower: 18, money: 360, extraordinaryMaterials: 9 }, exposure: 12, reputation: 0, hostility: hostility("night-church", 7, "危险空间异常进入官方视野"), advantage: { name: "戏法与退路", description: "跨区撤离、隐蔽运输和据点脱离获得稳定优势。", triggers: ["撤离", "运输", "潜入"], effects: { digestion: 12, extraordinaryMaterials: 1 } }, burden: { name: "满月呓语", description: "满月及亚伯拉罕遗产会带来高位污染、失眠和定位风险。", triggers: ["满月", "星空", "亚伯拉罕遗物"], effects: { exposure: 12, instability: 14 } }, evidence: ["lotm-07-013", "lotm-03-007"] },
    { title: "没有寄件人的旅行箱", summary: "一只空间异常的旅行箱给了你序列9学徒的材料，也把原主人未完成的路线留给了你。", startingSequence: 9, source: "经验证的异常旅行箱与其夹层记录", contact: "码头区一名熟悉海外包裹的报关员", enemy: "寻找旅行箱的未知家族代理人", firstCrisis: "旅行箱内侧出现了一个并不存在于贝克兰德的地址。", startingLocation: location("dock", 5, "海外货栈区"), resources: { manpower: 24, money: 430, extraordinaryMaterials: 7 }, exposure: 8, reputation: 1, hostility: hostility("black-market", 7, "拒绝交出异常货物"), advantage: { name: "边界感", description: "寻找入口、漏洞与安全路线时获得额外可靠信息。", triggers: ["入口", "路线", "封锁"], effects: { digestion: 7 } }, burden: { name: "未知坐标", description: "涉及星空、陌生坐标与远距离召唤时污染风险极高。", triggers: ["星空", "远距离旅行", "陌生坐标"], effects: { exposure: 9, instability: 11 } }, evidence: ["lotm-03-005", "lotm-03-007"] },
  ],
  error: [
    { title: "索罗亚斯德旧账的抄写员", summary: "你从一份被多次篡改的家族账本中取得魔药，但有人能辨认账本真正缺失的那一页。", startingSequence: 9, source: "隐秘家族遗留账本与一次有见证的魔药交易", contact: "桥区旧货市场的密码账房", enemy: "疑似掌握寄生线索的神秘追索者", firstCrisis: "组织账本出现了一笔无人写下却完全合规的支出。", startingLocation: location("bridge", 3, "旧货市场区"), resources: { manpower: 21, money: 470, extraordinaryMaterials: 6 }, exposure: 10, reputation: -2, hostility: hostility("black-market", 12, "截走了一份隐秘家族遗产"), advantage: { name: "漏洞嗅觉", description: "交易、审计和反渗透中更容易发现不一致。", triggers: ["账目", "反渗透", "规则漏洞"], effects: { money: 60, digestion: 7 } }, burden: { name: "身份疑云", description: "关键人员更容易怀疑记忆、身份与记录是否遭到篡改。", triggers: ["身份", "记忆", "寄生"], effects: { exposure: 8, instability: 8 } }, evidence: ["lotm-07-013", "lotm-03-005"] },
    { title: "诈骗师的自首书", summary: "你以序列8诈骗师身份拿走一封未递交的自首书；警察、受害者和旧同伙都可能沿它找到你。", startingSequence: 8, source: "地下网络中经两名见证人确认的序列8遗留特性", contact: "政府区一名负责失物档案的小书记员", enemy: "被诈骗师背叛的旧团伙", firstCrisis: "自首书中的一名死者今天在警察厅完成了登记。", startingLocation: location("government", 4, "档案街区"), resources: { manpower: 19, money: 520, extraordinaryMaterials: 5 }, exposure: 14, reputation: -5, hostility: hostility("police", 15, "持有刑案关键证物"), advantage: { name: "可信谎言", description: "合法掩护和谈判中可暂时降低对方警觉，但不会改写事实。", triggers: ["交涉", "掩护身份", "诱导"], effects: { reputation: 5, digestion: 10 } }, burden: { name: "被偷走的过去", description: "旧同伙掌握足以破坏公开身份的真实证据。", triggers: ["警察", "旧同伙", "公开声誉"], effects: { exposure: 13, reputation: -8 } }, evidence: ["lotm-11-004"] },
  ],
  spectator: [
    { title: "心理学沙龙的退席者", summary: "你从贵族心理学沙龙接触观众魔药，并在发现成员被筛选后带着记录退出。", startingSequence: 9, source: "心理学研究圈提供的观众魔药与观察训练", contact: "西区一名仍愿意通风报信的医生", enemy: "心理炼金会外围观察员", firstCrisis: "你的一名新下属收到内容完全贴合其隐秘恐惧的邀请函。", startingLocation: location("west", 4, "沙龙街区"), resources: { manpower: 25, money: 450, extraordinaryMaterials: 5 }, exposure: 7, reputation: 8, hostility: hostility("press", 5, "掌握贵族沙龙的不当筛选记录"), advantage: { name: "人员画像", description: "筛选普通人、任命职务与谈判时提高匹配度。", triggers: ["筛选", "任命", "谈判"], effects: { manpower: 2, digestion: 8 } }, burden: { name: "被观察者", description: "心理干预留下的模式会让专业对手更快建立你的画像。", triggers: ["催眠", "贵族沙龙", "心理对抗"], effects: { exposure: 8, instability: 5 } }, evidence: ["lotm-07-005", "lotm-11-002"] },
    { title: "读心者的诊疗档案", summary: "你已是序列8读心者，继承了一批不能公开的诊疗档案，也继承了病人与医生之间的责任。", startingSequence: 8, source: "受监督的心理学组织晋升与完整诊疗记录", contact: "一名要求匿名的贵族病人", enemy: "想回收档案的心理学组织", firstCrisis: "一名档案中的病人开始公开说出从未被记录的梦境。", startingLocation: location("west", 3, "私人诊所区"), resources: { manpower: 23, money: 500, extraordinaryMaterials: 6 }, exposure: 11, reputation: 10, hostility: hostility("press", 9, "诊疗秘密可能成为公共丑闻"), advantage: { name: "可信任的倾听者", description: "内部关系稳定与候选人筛选获得明显优势。", triggers: ["内务", "谈话", "忠诚"], effects: { manpower: 3, reputation: 6, digestion: 11 } }, burden: { name: "诊疗义务", description: "利用病人隐私谋利会造成严重声望、关系和失控代价。", triggers: ["病人隐私", "操纵", "泄密"], effects: { reputation: -12, instability: 8 } }, evidence: ["lotm-07-005"] },
  ],
  tyrant: [
    { title: "风暴教会的退役水手", summary: "你在远航事故后以水手身份退役，保留了码头关系，也被要求继续报告海上异常。", startingSequence: 9, source: "风暴教会外围监督下服用的水手魔药", contact: "码头区一名风暴教会外围执事", enemy: "走私网络中的旧船主", firstCrisis: "旧船主带回一件会让海水逆流的货物，并声称你欠他一次。", startingLocation: location("dock", 3, "水手酒吧区"), resources: { manpower: 27, money: 390, extraordinaryMaterials: 5 }, exposure: 6, reputation: 7, hostility: hostility("black-market", 9, "拒绝替旧船主走私"), advantage: { name: "码头威望", description: "码头人力、远航消息与护送行动更有效。", triggers: ["码头", "护送", "远航"], effects: { manpower: 4, reputation: 4 } }, burden: { name: "暴怒旧伤", description: "受到挑衅或指挥失利时更容易积累疲劳与不稳定。", triggers: ["挑衅", "失败", "正面冲突"], effects: { instability: 7 } }, evidence: ["lotm-07-001", "lotm-11-001"] },
    { title: "沉船上的暴怒之民", summary: "你是序列8暴怒之民，一场沉船给了你力量和幸存者，也留下了官方尚未结案的死亡名单。", startingSequence: 8, source: "沉船幸存者共同见证的序列8遗留特性", contact: "三名依靠你活下来的水手", enemy: "试图掩盖沉船货单的承运商", firstCrisis: "海关仓库出现一只与沉船同编号的箱子。", startingLocation: location("dock", 2, "海关仓库区"), resources: { manpower: 28, money: 330, extraordinaryMaterials: 8 }, exposure: 12, reputation: 6, hostility: hostility("royal-project", 10, "掌握敏感海运货单"), advantage: { name: "风暴幸存者", description: "恶劣环境、群体撤离与护卫任务更可靠。", triggers: ["恶劣天气", "撤离", "护卫"], effects: { manpower: 3, digestion: 10 } }, burden: { name: "未结沉船案", description: "海关与承运链会持续试探组织掌握的证据。", triggers: ["海关", "货单", "沉船"], effects: { exposure: 10, money: -20 } }, evidence: ["lotm-08-007", "lotm-11-001"] },
  ],
  sun: [
    { title: "海外传教站的歌颂者", summary: "你从永恒烈阳影响区返回鲁恩，序列9力量真实，但公开使用会立刻引起本地教会关注。", startingSequence: 9, source: "海外教区授予的歌颂者魔药", contact: "一名随商船入境的海外教友", enemy: "把你视为越界传教者的本地宗教观察者", firstCrisis: "一位被你净化过的病人出现在黑夜教会的询问名单上。", startingLocation: location("dock", 5, "海外货栈区"), resources: { manpower: 25, money: 360, extraordinaryMaterials: 7 }, exposure: 9, reputation: 5, hostility: hostility("night-church", 10, "未经许可的异教途径活动"), advantage: { name: "鼓舞者", description: "组织士气、防护与公开救援更容易获得支持。", triggers: ["公开救援", "士气", "净化"], effects: { reputation: 8, digestion: 7 } }, burden: { name: "异乡信仰", description: "公开使用能力会迅速触发宗教与官方审查。", triggers: ["公开能力", "教会", "净化"], effects: { exposure: 10 } }, evidence: ["lotm-07-001", "lotm-11-004"] },
    { title: "被封存的祈光人", summary: "你以序列8祈光人身份被秘密转运到贝克兰德；封存手续不完整，力量来源与政治交换纠缠。", startingSequence: 8, source: "教会外交交换中得到的完整晋升与监督", contact: "政府区一名知晓移交文书缺口的翻译", enemy: "希望追回你的海外教区代理人", firstCrisis: "移交文书的另一份副本在议会外围被人兜售。", startingLocation: location("government", 1, "议会外围"), resources: { manpower: 20, money: 510, extraordinaryMaterials: 6 }, exposure: 14, reputation: 4, hostility: hostility("police", 12, "身份移交文件存在缺口"), advantage: { name: "净化训练", description: "低层次污染处置和据点防护成本下降。", triggers: ["污染", "据点防护", "仪式"], effects: { extraordinaryMaterials: 2, digestion: 10 } }, burden: { name: "外交把柄", description: "官方与海外势力都能用身份文件施压。", triggers: ["官方", "海外势力", "身份文件"], effects: { exposure: 12, reputation: -5 } }, evidence: ["lotm-11-004"] },
  ],
  "white-tower": [
    { title: "霍伊大学的禁书助理", summary: "你在整理神秘学借阅记录时获得阅读者魔药，也抄下了不该离开档案室的索引。", startingSequence: 9, source: "知识与智慧之神教会外围学者提供的魔药", contact: "霍伊大学一名谨慎的古典学教授", enemy: "追查索引去向的档案审查员", firstCrisis: "索引指向的一本书今天被登记为从未入藏。", startingLocation: location("north", 1, "霍伊大学街区"), resources: { manpower: 20, money: 430, extraordinaryMaterials: 6 }, exposure: 7, reputation: 9, hostility: hostility("night-church", 4, "跨教会神秘知识流动"), advantage: { name: "档案方法", description: "配方核验、档案研究和情报交叉验证更高效。", triggers: ["档案", "配方", "研究"], effects: { reputation: 4, digestion: 8 } }, burden: { name: "禁书索引", description: "继续追索被封锁条目会吸引学术与教会审查。", triggers: ["禁书", "索引", "预言"], effects: { exposure: 8 } }, evidence: ["lotm-11-004"] },
    { title: "推理学员的错误结论", summary: "你已晋升序列8，却因一次结构严密的误判害死了线人；纠正它是开局的第一项债务。", startingSequence: 8, source: "学术传承中完成的序列8晋升", contact: "仍愿意提供原始材料的死者家属", enemy: "利用错误结论获利的报社消息商", firstCrisis: "被你排除的嫌疑人主动送来一份新证据。", startingLocation: location("north", 3, "出版社街区"), resources: { manpower: 19, money: 400, extraordinaryMaterials: 7 }, exposure: 10, reputation: -4, hostility: hostility("press", 11, "错误结论被消息商利用"), advantage: { name: "反证习惯", description: "复杂方案与情报结论更容易暴露前提缺口。", triggers: ["方案评估", "推理", "交叉验证"], effects: { digestion: 11 } }, burden: { name: "严密的误判", description: "单一来源或缺失材料会放大自信，错误公开后声望损失更重。", triggers: ["单一来源", "公开结论", "证据不足"], effects: { reputation: -10, instability: 5 } }, evidence: ["lotm-03-006", "lotm-11-001"] },
  ],
  "hanged-man": [
    { title: "从极光会仪式中逃走的人", summary: "你在一次危险祈求中成为秘祈人并逃离；力量来源清晰，污染联系也真实存在。", startingSequence: 9, source: "极光会外围仪式形成的非凡特性", contact: "同一仪式中唯一仍清醒的幸存者", enemy: "极光会外围布道者", firstCrisis: "幸存者开始用你在仪式里听见的声音说话。", startingLocation: location("east", 1, "废弃纺织厂区"), resources: { manpower: 18, money: 300, extraordinaryMaterials: 10 }, exposure: 14, reputation: -6, hostility: hostility("aurora-order", 22, "脱离仪式并带走幸存者"), advantage: { name: "污染识别", description: "识别危险祈求、阴影异常和邪教渗透时更敏锐。", triggers: ["邪教", "祈求", "阴影"], effects: { extraordinaryMaterials: 2, digestion: 6 } }, burden: { name: "倾听余响", description: "祈求、献祭和真实造物主相关内容会直接提高失控风险。", triggers: ["祈求", "献祭", "真实造物主"], effects: { exposure: 12, instability: 16 } }, evidence: ["lotm-07-003", "lotm-03-007"] },
    { title: "被切断的秘密祈祷室", summary: "你接管一处已经清空的祈祷室及其序列9魔药，组织物资较多，却不知道谁主动切断了联系。", startingSequence: 9, source: "废弃祈祷室中封存的完整魔药与记录", contact: "拒绝说明原身份的东区看守人", enemy: "尚未确认身份的祈祷室原属组织", firstCrisis: "祈祷室每晚都会多出一支刚燃尽的蜡烛。", startingLocation: location("east", 1, "废弃纺织厂区"), resources: { manpower: 22, money: 350, extraordinaryMaterials: 12 }, exposure: 12, reputation: -3, hostility: hostility("aurora-order", 18, "占用其废弃仪式据点"), advantage: { name: "危险遗产", description: "开局拥有较多非凡材料和一处可研究的仪式场。", triggers: ["仪式研究", "非凡材料", "据点"], effects: { extraordinaryMaterials: 4 } }, burden: { name: "未断的联系", description: "仪式场可能仍是高位污染与旧组织的信标。", triggers: ["仪式场", "倾听", "秘密祈祷"], effects: { exposure: 14, instability: 14 } }, evidence: ["lotm-07-003", "lotm-03-007"] },
  ],
  moon: [
    { title: "生命学派药师的代理人", summary: "你替一名无法公开露面的药师经营材料渠道，序列9来源可靠，却被卷入学派内部的命运争端。", startingSequence: 9, source: "生命学派支系提供并核验的药师魔药", contact: "桥区一名流浪药师", enemy: "追查同批材料的神秘买家", firstCrisis: "一批只在满月变色的草药被送到了错误地址。", startingLocation: location("south", 3, "廉价药房街"), resources: { manpower: 24, money: 420, extraordinaryMaterials: 9 }, exposure: 7, reputation: 6, hostility: hostility("black-market", 7, "争夺稀缺药材渠道"), advantage: { name: "药剂供给", description: "医疗、材料辨识和普通人恢复更加稳定。", triggers: ["医疗", "药材", "恢复"], effects: { manpower: 2, extraordinaryMaterials: 2 } }, burden: { name: "月相牵引", description: "满月、血液与异常生命材料会增加污染和追踪风险。", triggers: ["满月", "血液", "异常生命"], effects: { exposure: 7, instability: 8 } }, evidence: ["lotm-07-008"] },
    { title: "血族诊所的驯兽师", summary: "你已是序列8驯兽师，在一间由血族间接控制的诊所工作；离开意味着失去保护并带走秘密。", startingSequence: 8, source: "血族控制渠道提供的序列8晋升", contact: "西区一名态度傲慢但守约的血族医生", enemy: "认为你违反服务期限的血族代理人", firstCrisis: "诊所名册上出现一名已经死亡三年的病人。", startingLocation: location("west", 3, "私人诊所区"), resources: { manpower: 25, money: 470, extraordinaryMaterials: 8 }, exposure: 10, reputation: 8, hostility: hostility("night-church", 7, "血族活动进入教会视野"), advantage: { name: "生命照料", description: "人员恢复、动物侦察与材料培育更有效。", triggers: ["治疗", "动物", "培育"], effects: { manpower: 3, digestion: 10 } }, burden: { name: "血族契约", description: "拒绝合理旧约会损害材料供给，服从则会增加外部控制。", triggers: ["血族", "旧约", "药材"], effects: { money: -30, exposure: 8 } }, evidence: ["lotm-07-008", "lotm-07-013"] },
  ],
  mother: [
    { title: "丰收教堂的外围医师", summary: "你在西区救济网络学习并成为耕种者，拥有基层信任，也必须解释为何另建组织。", startingSequence: 9, source: "大地母神教会外围的正规低序列培养", contact: "丰收教堂一名负责救济的神职人员", enemy: "试图利用救济名册筛选劳工的承包商", firstCrisis: "一批免费种子在东区长出了不合季节的花。", startingLocation: location("west", 1, "丰收教堂街区"), resources: { manpower: 30, money: 350, extraordinaryMaterials: 6 }, exposure: 4, reputation: 12, hostility: hostility("royal-project", 6, "阻断秘密工程的劳工筛选"), advantage: { name: "基层生长", description: "普通人招募、恢复与据点自给更有优势。", triggers: ["招募", "救济", "据点供给"], effects: { manpower: 6, reputation: 5 } }, burden: { name: "教会问责", description: "伤害平民或滥用生命材料会立刻损害教会关系。", triggers: ["平民伤亡", "生命实验", "救济"], effects: { reputation: -12, exposure: 5 } }, evidence: ["lotm-07-001", "lotm-11-002"] },
    { title: "东区温室的医师", summary: "你以序列8医师身份维持一座秘密温室；更高的生产力伴随异常繁殖和工厂方面的觊觎。", startingSequence: 8, source: "民间生命炼金传承与温室产出的序列8材料", contact: "东区工人互助会的登记员", enemy: "希望接管温室的秘密工程承包人", firstCrisis: "温室地下传来第二套根系生长的声音。", startingLocation: location("east", 1, "废弃纺织厂区"), resources: { manpower: 29, money: 300, extraordinaryMaterials: 10 }, exposure: 9, reputation: 9, hostility: hostility("royal-project", 13, "争夺异常温室资源"), advantage: { name: "活体生产", description: "据点、药材和普通人恢复获得持续收益。", triggers: ["温室", "生产", "治疗"], effects: { manpower: 4, extraordinaryMaterials: 3, digestion: 9 } }, burden: { name: "繁殖失衡", description: "未经核验扩大异常生命会制造污染和区域性事件。", triggers: ["扩产", "异常生命", "地下根系"], effects: { exposure: 9, instability: 9 } }, evidence: ["lotm-03-007", "lotm-11-001"] },
  ],
  death: [
    { title: "医院停尸房的收尸人", summary: "你在官方忽略的异常死亡中成为收尸人，掌握一批死者记录与家属关系。", startingSequence: 9, source: "南大陆遗留特性与医院外围监督", contact: "南区医院的一名夜班看守", enemy: "清理死亡记录的未知代理人", firstCrisis: "一具已经领走的尸体再次出现在停尸房登记簿。", startingLocation: location("south", 1, "慈善诊所区"), resources: { manpower: 23, money: 360, extraordinaryMaterials: 8 }, exposure: 7, reputation: 3, hostility: hostility("police", 8, "掌握未结异常死亡记录"), advantage: { name: "死者档案", description: "尸检、亡灵事件与失踪人口调查更可靠。", triggers: ["尸体", "亡灵", "失踪"], effects: { extraordinaryMaterials: 1, digestion: 8 } }, burden: { name: "阴冷牵连", description: "长期接触亡者会增加精神负荷并吸引灵体事件。", triggers: ["通灵", "墓园", "连续尸检"], effects: { instability: 8, exposure: 5 } }, evidence: ["lotm-03-003", "lotm-11-002"] },
    { title: "掘墓人的失窃墓穴", summary: "你是序列8掘墓人，一座本应封闭的墓穴被打开，失窃的东西可能正沿聚合定律回来。", startingSequence: 8, source: "墓园守护传承的序列8晋升", contact: "北区墓园一名守密的老管理员", enemy: "盗取高价值遗骸的地下团伙", firstCrisis: "失窃墓穴旁出现了只向城内延伸的湿脚印。", startingLocation: location("north", 4, "博物馆街区"), resources: { manpower: 21, money: 380, extraordinaryMaterials: 10 }, exposure: 11, reputation: 1, hostility: hostility("black-market", 13, "追查地下遗骸交易"), advantage: { name: "墓园守望", description: "处理亡灵、地下空间与遗骸材料时降低意外。", triggers: ["墓穴", "亡灵", "遗骸"], effects: { extraordinaryMaterials: 2, digestion: 11 } }, burden: { name: "失窃遗骸", description: "遗骸相关势力会沿聚合与交易链反向接近组织。", triggers: ["遗骸", "黑市", "聚合"], effects: { exposure: 11, instability: 7 } }, evidence: ["lotm-03-003", "lotm-03-005"] },
  ],
  darkness: [
    { title: "值夜者的外围线人", summary: "你在黑夜教会外围成为不眠者，拥有官方安全常识，却不再享有完整保护。", startingSequence: 9, source: "黑夜教会外围监督的正规不眠者魔药", contact: "圣赛缪尔教堂一名谨慎的值夜者联络人", enemy: "被你识破过的夜间邪教线人", firstCrisis: "联络人连续三夜没有出现，暗号却每天更新。", startingLocation: location("north", 2, "圣赛缪尔街区"), resources: { manpower: 26, money: 400, extraordinaryMaterials: 5 }, exposure: 3, reputation: 10, hostility: hostility("aurora-order", 10, "破坏其夜间布道渠道"), advantage: { name: "守夜训练", description: "本部警戒、夜间行动与梦境预警更稳定。", triggers: ["夜间", "梦境", "据点防卫"], effects: { manpower: 2, reputation: 4 } }, burden: { name: "官方边界", description: "隐瞒重大污染或主动越过教会红线会迅速失去信任。", triggers: ["教会", "隐瞒污染", "禁忌仪式"], effects: { reputation: -10, exposure: 7 } }, evidence: ["lotm-07-001", "lotm-11-004"] },
    { title: "午夜诗人的未归小队", summary: "你以序列8午夜诗人身份离开一次失败行动，三名同伴未归，官方档案却写着全部死亡。", startingSequence: 8, source: "教会战术小队内完成的序列8晋升", contact: "仍私下核对行动档案的前队友", enemy: "推动结案的教会内部未知人物", firstCrisis: "一名已被宣告死亡的同伴寄来一张空白明信片。", startingLocation: location("north", 2, "圣赛缪尔街区"), resources: { manpower: 22, money: 440, extraordinaryMaterials: 7 }, exposure: 8, reputation: 7, hostility: hostility("night-church", 6, "私查已封存行动"), advantage: { name: "夜间指挥", description: "夜间多人员行动、安抚与撤离更可靠。", triggers: ["夜间行动", "安抚", "撤离"], effects: { digestion: 11, manpower: 2 } }, burden: { name: "未归名单", description: "追查小队真相会触碰官方隐秘与梦境风险。", triggers: ["旧队友", "封存档案", "梦境"], effects: { exposure: 9, instability: 6 } }, evidence: ["lotm-11-004"] },
  ],
  "twilight-giant": [
    { title: "退伍军人的战士魔药", summary: "你在南大陆服役时正规成为战士，回国后用退伍金和旧部建立组织。", startingSequence: 9, source: "军队非凡小队监督下的战士魔药", contact: "仍在军需系统工作的旧部", enemy: "曾命令你掩盖平民伤亡的前上级", firstCrisis: "前上级要求你接收一批没有清单的军需物资。", startingLocation: location("south", 4, "工匠住宅区"), resources: { manpower: 31, money: 390, extraordinaryMaterials: 5 }, exposure: 5, reputation: 7, hostility: hostility("royal-project", 8, "拒绝继续服从旧军令"), advantage: { name: "队列纪律", description: "本部防卫、训练与护送能使用更多普通人力。", triggers: ["训练", "护送", "防卫"], effects: { manpower: 6, reputation: 3 } }, burden: { name: "旧军令", description: "前上级掌握战时记录，并会用合法命令外壳施压。", triggers: ["军方", "旧档案", "命令"], effects: { exposure: 7, money: -20 } }, evidence: ["lotm-11-004"] },
    { title: "武器大师的停职令", summary: "你以罕见的序列7武器大师身份停职离队；强大正面战力换来官方追踪、旧伤与明确政治债。", startingSequence: 7, source: "正规军事体系内连续晋升至序列7的完整记录", contact: "一支仍认可你的退役小队", enemy: "掌握停职与武器失踪案的军方调查官", firstCrisis: "一件登记在你名下的非凡武器出现在东区命案现场。", startingLocation: location("government", 5, "司法街区"), resources: { manpower: 24, money: 300, extraordinaryMaterials: 5 }, exposure: 22, reputation: 4, hostility: hostility("police", 22, "重大军械案件的核心嫌疑"), advantage: { name: "中序列教官", description: "正面战斗、训练和本部防卫拥有显著优势。", triggers: ["战斗", "训练", "防卫"], effects: { manpower: 4, digestion: 8 } }, burden: { name: "停职追查", description: "序列7身份、军械案与旧伤使亲自行动更少却更受关注。", triggers: ["公开战斗", "军械", "官方"], effects: { exposure: 18, instability: 12, money: -60 } }, evidence: ["lotm-03-005", "lotm-11-004"] },
  ],
  hunter: [
    { title: "南大陆侦察兵", summary: "你以猎人身份退役，带回追踪经验、几名旧识和一份不愿交给军方的地形记录。", startingSequence: 9, source: "军队侦察单位监督下的猎人魔药", contact: "东区临时招工市场中的退伍联络人", enemy: "寻找地形记录的军方承包商", firstCrisis: "记录中的一个秘密补给点出现在贝克兰德货单上。", startingLocation: location("east", 4, "临时招工区"), resources: { manpower: 29, money: 360, extraordinaryMaterials: 6 }, exposure: 7, reputation: 5, hostility: hostility("royal-project", 10, "持有秘密工程关联记录"), advantage: { name: "猎场规划", description: "区域侦察、追踪和战略点行动获得优势。", triggers: ["地图", "追踪", "战略点"], effects: { manpower: 3, digestion: 8 } }, burden: { name: "战争惯性", description: "把组织冲突升级成战争会提高敌意与失控。", triggers: ["挑衅", "战争", "报复"], effects: { exposure: 6, instability: 6 } }, evidence: ["lotm-07-011", "lotm-11-004"] },
    { title: "挑衅者的决斗债", summary: "你已是序列8挑衅者，一次受人设计的决斗给了你名声，也让死者背后的组织盯上你。", startingSequence: 8, source: "因蒂斯佣兵渠道的序列8晋升", contact: "报社体育版的一名决斗消息人", enemy: "铁血十字会外围招募者", firstCrisis: "死者的挑战书被重新刊登，落款日期是明天。", startingLocation: location("cherwood", 2, "剧院街区"), resources: { manpower: 25, money: 420, extraordinaryMaterials: 7 }, exposure: 15, reputation: 10, hostility: hostility("press", 12, "决斗事件持续发酵"), advantage: { name: "冲突节奏", description: "多方对峙与行动指挥更容易迫使对手暴露意图。", triggers: ["对峙", "挑衅", "行动指挥"], effects: { digestion: 11, reputation: 4 } }, burden: { name: "公开决斗债", description: "名声会吸引挑战者，失控的挑衅会使敌意增长更快。", triggers: ["公开冲突", "挑战", "报纸"], effects: { exposure: 12, instability: 7 } }, evidence: ["lotm-07-011"] },
  ],
  demoness: [
    { title: "刺客名单上的漏网者", summary: "你从一名死去刺客身上取得序列9特性，并发现其名单里也有自己的旧身份。", startingSequence: 9, source: "经隔离处理的刺客遗留特性", contact: "桥区一名知道尸体来源的清道夫", enemy: "魔女教派外围联络人", firstCrisis: "名单上的另一个名字今天主动登门。", startingLocation: location("bridge", 4, "短租公寓区"), resources: { manpower: 19, money: 410, extraordinaryMaterials: 9 }, exposure: 14, reputation: -5, hostility: hostility("witch-sect", 22, "持有并研究刺客名单"), advantage: { name: "反跟踪", description: "潜入、撤离与识别秘密监视获得优势。", triggers: ["跟踪", "潜入", "秘密监视"], effects: { digestion: 7 } }, burden: { name: "教派猎杀", description: "暴露真实身份或刺客来源会引发直接清理。", triggers: ["真实身份", "名单", "魔女教派"], effects: { exposure: 16, instability: 8 } }, evidence: ["lotm-07-010", "lotm-03-003"] },
    { title: "教唆者的双重身份", summary: "你已是序列8教唆者，依靠两套公开身份维持生存；任何一套崩塌都会牵连另一套。", startingSequence: 8, source: "脱离魔女教派者提供的序列8晋升", contact: "皇后区一名掌握假身份文书的女仆", enemy: "负责回收叛离者的教派成员", firstCrisis: "两套身份同时收到同一场私人宴会的邀请。", startingLocation: location("empress", 2, "皇后花园街区"), resources: { manpower: 18, money: 540, extraordinaryMaterials: 6 }, exposure: 18, reputation: 4, hostility: hostility("witch-sect", 28, "脱离教派并保有秘密身份"), advantage: { name: "双重社会面", description: "秘密社交、身份掩护与反渗透更灵活。", triggers: ["社交", "假身份", "渗透"], effects: { money: 70, digestion: 10 } }, burden: { name: "身份交叉", description: "公开曝光、亲密关系与官方核查可能让两套人生同时崩塌。", triggers: ["公开曝光", "官方核查", "亲密关系"], effects: { exposure: 17, reputation: -8 } }, evidence: ["lotm-07-010", "lotm-11-002"] },
  ],
  "black-emperor": [
    { title: "破产律师的秘密委托", summary: "你靠一份不能公开的政治委托成为律师途径非凡者，并继承了委托人的债权与敌人。", startingSequence: 9, source: "贵族遗产中经核验的律师魔药", contact: "西区一名被排挤出合伙所的律师", enemy: "希望销毁委托档案的王室工程代理人", firstCrisis: "委托人死亡后，三份互相矛盾的遗嘱同时生效。", startingLocation: location("west", 2, "律师街区"), resources: { manpower: 22, money: 560, extraordinaryMaterials: 5 }, exposure: 8, reputation: 7, hostility: hostility("royal-project", 13, "掌握敏感政治委托"), advantage: { name: "法律外壳", description: "组织合法化、合同与公开交涉更有利。", triggers: ["合同", "合法身份", "交涉"], effects: { money: 80, reputation: 6 } }, burden: { name: "扭曲诱惑", description: "反复利用规则漏洞会积累失信与制度反制。", triggers: ["规则漏洞", "贿赂", "欺骗"], effects: { reputation: -9, instability: 6 } }, evidence: ["lotm-11-004"] },
    { title: "野蛮人的议会把柄", summary: "你以序列8野蛮人身份替一名议员处理过秘密冲突；你握有把柄，对方也握有你的行动证据。", startingSequence: 8, source: "政治掮客提供的序列8完整晋升", contact: "政府区一名议员助理", enemy: "同一议员的秘密安全顾问", firstCrisis: "议员要求组织在一周内让一名证人改口。", startingLocation: location("government", 1, "议会外围"), resources: { manpower: 25, money: 620, extraordinaryMaterials: 4 }, exposure: 13, reputation: 11, hostility: hostility("royal-project", 16, "双方持有政治把柄"), advantage: { name: "政治杠杆", description: "官方交涉与资源动员更强，但每次使用都会留下关系债。", triggers: ["议会", "官方", "资源动员"], effects: { money: 100, reputation: 7 } }, burden: { name: "相互把柄", description: "拒绝委托、公开冲突或证人失控会迅速提高敌意。", triggers: ["议员", "证人", "拒绝委托"], effects: { exposure: 13, reputation: -7 } }, evidence: ["lotm-11-004"] },
  ],
  justiciar: [
    { title: "治安法庭的秘密仲裁人", summary: "你在处理不可公开案件时成为仲裁人；力量来源正规，但晋升链被司法与军警严密控制。", startingSequence: 9, source: "鲁恩司法体系秘密编制的仲裁人魔药", contact: "政府区一名仍认可你的书记官", enemy: "要求收回全部档案的警察厅督察", firstCrisis: "一份由你签署但从未审理过的裁决书正在执行。", startingLocation: location("government", 5, "司法街区"), resources: { manpower: 27, money: 460, extraordinaryMaterials: 4 }, exposure: 8, reputation: 12, hostility: hostility("police", 10, "离开编制并保留秘密案卷"), advantage: { name: "制度威信", description: "内部纪律、审计、看押与官方交涉更稳定。", triggers: ["纪律", "审计", "看押"], effects: { manpower: 3, reputation: 8 } }, burden: { name: "受控晋升链", description: "后续配方与材料被王室、军警和贵族严密掌握。", triggers: ["晋升", "司法", "军警"], effects: { exposure: 7, extraordinaryMaterials: -1 } }, evidence: ["lotm-11-004", "lotm-07-013"] },
    { title: "审讯者的停职档案", summary: "你以罕见序列7审讯者身份停职，能显著强化组织治理，却被官方视为必须控制的危险资产。", startingSequence: 7, source: "司法或军警体系内连续晋升至序列7的完整记录", contact: "一名拒绝销毁原始口供的前同僚", enemy: "警察厅内部调查组", firstCrisis: "一名你审讯过的囚犯在严密看守下留下了指向你的供词。", startingLocation: location("government", 5, "司法街区"), resources: { manpower: 23, money: 380, extraordinaryMaterials: 4 }, exposure: 24, reputation: 8, hostility: hostility("police", 26, "中序列人员脱离官方控制"), advantage: { name: "中序列裁决", description: "内部制度、俘虏管理和正式命令获得显著优势。", triggers: ["制度", "审讯", "正式命令"], effects: { manpower: 4, reputation: 6 } }, burden: { name: "国家资产", description: "官方会持续施压、监控或回收你；公开使用能力会立刻升级回应。", triggers: ["公开能力", "警察厅", "政府区"], effects: { exposure: 20, money: -50, instability: 8 } }, evidence: ["lotm-03-005", "lotm-11-004"] },
  ],
  paragon: [
    { title: "机械之心的外包鉴定员", summary: "你作为通识者替蒸汽教会鉴定普通机械，因一件异常装置的归属争议离开。", startingSequence: 9, source: "蒸汽教会外围技术人员的正规晋升", contact: "希尔斯顿区一名工厂工程师", enemy: "要求交还异常装置图纸的机械之心人员", firstCrisis: "图纸上的一枚齿轮今天在现实装置里多转了一圈。", startingLocation: location("hillston", 4, "百货街区"), resources: { manpower: 23, money: 500, extraordinaryMaterials: 7 }, exposure: 6, reputation: 10, hostility: hostility("steam-church", 8, "异常图纸归属争议"), advantage: { name: "工程底盘", description: "设施、装备、生产与鉴定投入获得更高产出。", triggers: ["设施", "装备", "生产"], effects: { money: 60, extraordinaryMaterials: 2 } }, burden: { name: "技术审查", description: "异常造物和未报备技术会引起机械之心审查。", triggers: ["异常造物", "工厂", "图纸"], effects: { exposure: 8 } }, evidence: ["lotm-07-001", "lotm-11-001"] },
    { title: "考古学家的赝品仓库", summary: "你以序列8考古学家身份继承一仓库真假混杂的遗物；识别力是优势，所有权争议是代价。", startingSequence: 8, source: "大学与教会联合考察队的序列8晋升", contact: "北区博物馆的一名库房管理员", enemy: "持有部分遗物所有权文件的收藏商", firstCrisis: "一件已判定为赝品的器物开始出现在不同货架。", startingLocation: location("north", 4, "博物馆街区"), resources: { manpower: 20, money: 420, extraordinaryMaterials: 11 }, exposure: 10, reputation: 8, hostility: hostility("black-market", 12, "争夺未登记遗物"), advantage: { name: "遗物鉴定", description: "材料、封印物与战略点设施的鉴定更可靠。", triggers: ["遗物", "封印物", "设施"], effects: { extraordinaryMaterials: 4, digestion: 10 } }, burden: { name: "所有权迷宫", description: "出售或使用遗物可能触发收藏家、教会与黑市的多方索赔。", triggers: ["出售遗物", "黑市", "公开展品"], effects: { exposure: 10, money: -30 } }, evidence: ["lotm-10-001", "lotm-11-003"] },
  ],
  mystery: [
    { title: "摩斯苦修会的退信", summary: "你从被退回的神秘学函授材料中成为窥秘人；知识真实，隐匿贤者的主动灌输也真实。", startingSequence: 9, source: "摩斯苦修会旧成员留下的完整魔药与课程", contact: "北区一名拒绝再阅读星象记录的学者", enemy: "追索课程去向的苦修会成员", firstCrisis: "一封没有文字的退信在夜里开始自行讲课。", startingLocation: location("north", 1, "霍伊大学街区"), resources: { manpower: 19, money: 390, extraordinaryMaterials: 10 }, exposure: 10, reputation: 3, hostility: hostility("night-church", 6, "危险知识载体未受监管"), advantage: { name: "神秘学底稿", description: "配方、仪式与异常物品核验获得优势。", triggers: ["配方", "仪式", "鉴定"], effects: { extraordinaryMaterials: 3, digestion: 6 } }, burden: { name: "知识灌输", description: "隐匿贤者会主动投送知识；阅读与追索都可能成为污染入口。", triggers: ["未知知识", "星象", "隐匿贤者"], effects: { exposure: 10, instability: 15 } }, evidence: ["lotm-07-007", "lotm-03-007"] },
    { title: "格斗学者的封口协议", summary: "你以序列8格斗学者身份从一次知识污染事故幸存，身体与知识都更强，却必须定期接受审查。", startingSequence: 8, source: "受监督的摩斯苦修会支系晋升", contact: "负责评估你精神状态的私人医生", enemy: "试图重新激活污染载体的隐秘研究者", firstCrisis: "封口协议上的禁用词出现在今日晚报标题里。", startingLocation: location("cherwood", 1, "鸦羽事务所街区"), resources: { manpower: 21, money: 430, extraordinaryMaterials: 9 }, exposure: 14, reputation: 2, hostility: hostility("press", 8, "污染相关词汇进入公开传播"), advantage: { name: "知识与体术", description: "研究人员在危险现场的生存与鉴定能力更好。", triggers: ["危险鉴定", "现场研究", "近身自保"], effects: { digestion: 10, extraordinaryMaterials: 2 } }, burden: { name: "高位知识污染", description: "接触未验证知识时，序列优势不能抵消主动灌输与失控。", triggers: ["未知知识", "主动灌输", "预言"], effects: { exposure: 12, instability: 16 } }, evidence: ["lotm-07-007", "lotm-03-007"] },
  ],
  chained: [
    { title: "玫瑰学派追杀中的囚犯", summary: "你因诅咒成为囚犯并逃离玫瑰学派控制；克制是生存方式，不是背景装饰。", startingSequence: 9, source: "南大陆诅咒事件中析出的囚犯特性", contact: "一名帮助你保持清醒的节制派线人", enemy: "玫瑰学派放纵派追索者", firstCrisis: "一件束缚你的旧器具被送进桥区黑市。", startingLocation: location("bridge", 3, "旧货市场区"), resources: { manpower: 18, money: 320, extraordinaryMaterials: 10 }, exposure: 15, reputation: -4, hostility: hostility("black-market", 9, "追查诅咒器具交易"), advantage: { name: "欲望克制", description: "危险看押、污染承受和撤离时更不易崩溃。", triggers: ["看押", "污染", "恐惧"], effects: { digestion: 7 } }, burden: { name: "异种诅咒", description: "纵欲、满月与玫瑰学派仪式会加剧身体和精神异化。", triggers: ["满月", "纵欲", "玫瑰学派"], effects: { exposure: 12, instability: 15 } }, evidence: ["lotm-07-009", "lotm-03-007"] },
    { title: "疯子的节制誓约", summary: "你已是序列8疯子，依靠一套严格誓约保持自我；能力更强，每次破戒都是真实风险。", startingSequence: 8, source: "节制派监督下完成的序列8晋升", contact: "南区一名了解节制仪式的药师", enemy: "试图诱使你失控的放纵派信徒", firstCrisis: "誓约中唯一禁止进入的地址发来一封求救信。", startingLocation: location("south", 3, "廉价药房街"), resources: { manpower: 20, money: 350, extraordinaryMaterials: 9 }, exposure: 13, reputation: 0, hostility: hostility("aurora-order", 7, "邪教渠道试图利用其诅咒"), advantage: { name: "节制誓约", description: "遵守自定边界时获得稳定与行动可靠性。", triggers: ["克制", "撤退条件", "看押"], effects: { digestion: 12 } }, burden: { name: "破戒代价", description: "违背明确誓约会显著提高不稳定与失控风险。", triggers: ["违背誓约", "放纵", "诱导"], effects: { instability: 18, exposure: 8 } }, evidence: ["lotm-07-009", "lotm-03-006"] },
  ],
  abyss: [
    { title: "恶魔家族的逃亡证人", summary: "你因一件恶魔家族遗物成为罪犯途径非凡者；它能感知恶意，也在放大你自己的恶意。", startingSequence: 9, source: "恶魔家族遗物中析出的低序列特性", contact: "掌握家族货运记录的码头书记员", enemy: "追索遗物的恶魔家族代理人", firstCrisis: "你感知到组织内部出现了明确杀意，却无法确认对象。", startingLocation: location("dock", 5, "海外货栈区"), resources: { manpower: 16, money: 480, extraordinaryMaterials: 10 }, exposure: 18, reputation: -10, hostility: hostility("black-market", 18, "截留恶魔家族货物"), advantage: { name: "恶意预警", description: "近距离伏击、背叛与地下威胁更早显露。", triggers: ["恶意", "伏击", "地下交易"], effects: { digestion: 5 } }, burden: { name: "欲望侵蚀", description: "残酷、滥杀和以恐惧统治会快速侵蚀人格并触发失控。", triggers: ["滥杀", "恐惧统治", "恶魔家族"], effects: { instability: 18, reputation: -15, exposure: 12 } }, evidence: ["lotm-07-013", "lotm-03-007"] },
    { title: "冷血者实验的幸存者", summary: "你以序列8折翼天使身份逃离一次家族实验；序列优势无法抵消持续的道德与失控压力。", startingSequence: 8, source: "恶魔家族实验中被强制服用的序列8魔药", contact: "东区一名替你藏匿伤口的医生", enemy: "负责回收实验体的家族执行者", firstCrisis: "实验编号被写在组织本部门外，没有脚印。", startingLocation: location("east", 2, "廉租屋区"), resources: { manpower: 15, money: 400, extraordinaryMaterials: 12 }, exposure: 23, reputation: -12, hostility: hostility("police", 14, "与多起暴力案件特征相似"), advantage: { name: "极端生存", description: "危险环境和近身反制能力极强。", triggers: ["近身战斗", "追杀", "重伤"], effects: { digestion: 9 } }, burden: { name: "实验烙印", description: "家族可沿烙印追踪；主动伤害无辜会触发更重失控结算。", triggers: ["无辜伤亡", "家族追踪", "实验编号"], effects: { exposure: 18, instability: 20, reputation: -18 } }, evidence: ["lotm-03-005", "lotm-03-007"] },
  ],
  "wheel-of-fortune": [
    { title: "生命学派的异常儿童", summary: "你从小就有无法控制的命运预感，后来被生命学派确认并引导成为怪物途径非凡者。", startingSequence: 9, source: "生命学派监督的怪物魔药与长期观察", contact: "一名只在危机前出现的生命学派占卜者", enemy: "追逐同一命运节点的未知高序列代理人", firstCrisis: "你连续梦见组织本部在三个不同日期被同一辆马车撞毁。", startingLocation: location("west", 5, "慈善机构区"), resources: { manpower: 24, money: 410, extraordinaryMaterials: 6 }, exposure: 8, reputation: 1, hostility: hostility("black-market", 5, "命运情报引发地下买家关注"), advantage: { name: "危险预感", description: "重大决策可能得到不确定但有价值的风险提示。", triggers: ["重大决策", "危机", "路线选择"], effects: { digestion: 6 } }, burden: { name: "不可控征兆", description: "预感无法指定内容，强行追逐幸运会积累灾祸。", triggers: ["赌博", "追逐幸运", "反复占卜"], effects: { instability: 10, exposure: 6 } }, evidence: ["lotm-07-008", "lotm-03-005"] },
    { title: "机器的错误概率", summary: "你已是序列8机器，一份长期概率记录证明有人正系统性改变你周围的偶然。", startingSequence: 8, source: "生命学派分支提供的序列8晋升", contact: "希尔斯顿区一名精算师", enemy: "未知命运力量的代理人", firstCrisis: "过去一年从未出现的概率今天连续发生了七次。", startingLocation: location("hillston", 3, "保险街区"), resources: { manpower: 22, money: 560, extraordinaryMaterials: 5 }, exposure: 11, reputation: 5, hostility: hostility("press", 6, "异常概率事件成为公开谈资"), advantage: { name: "概率记录", description: "资源风险、项目失败和区域异动更容易被提前识别。", triggers: ["项目风险", "资源", "异常概率"], effects: { money: 60, digestion: 10 } }, burden: { name: "命运收束", description: "高价值决策会吸引命运对手，幸运不能被当成可消费资源。", triggers: ["重大收益", "命运", "连续幸运"], effects: { exposure: 10, instability: 10 } }, evidence: ["lotm-03-005"] },
  ],
};

// Less exceptional pathways share the same authored structure but retain distinct sources,
// factions and causal burdens. Keeping these entries explicit makes future KB corrections local.
Object.assign(ORIGIN_SEEDS, {
  // Entries above intentionally cover every pathway except the four compact civic/industrial cases below.
});

function buildScenario(pathwayId: StandardPathwayId, seed: OriginSeed, index: number): PathwayOriginScenario {
  return {
    id: `${pathwayId}-origin-${index + 1}`,
    pathwayId,
    kind: "fixed",
    title: seed.title,
    summary: seed.summary,
    startingSequence: seed.startingSequence,
    source: seed.source,
    contact: seed.contact,
    enemy: seed.enemy,
    firstCrisis: seed.firstCrisis,
    startingLocation: seed.startingLocation,
    resources: seed.resources,
    exposure: seed.exposure,
    reputation: seed.reputation,
    hostility: seed.hostility,
    difficulty: DIFFICULTY[pathwayId],
    traits: [
      { id: `${pathwayId}-advantage-${index + 1}`, name: seed.advantage.name, kind: "advantage", description: seed.advantage.description, triggers: seed.advantage.triggers, effects: seed.advantage.effects },
      { id: `${pathwayId}-burden-${index + 1}`, name: seed.burden.name, kind: "burden", description: seed.burden.description, triggers: seed.burden.triggers, effects: seed.burden.effects },
    ],
    loreEvidenceIds: [...new Set([PATHWAY_EVIDENCE[pathwayId], "lotm-03-001", "lotm-03-006", "lotm-03-007", "lotm-08-007", ...(seed.evidence ?? [])])],
  };
}

export const PATHWAY_ORIGINS = Object.fromEntries(STANDARD_PATHWAY_IDS.map((pathwayId) => [pathwayId, ORIGIN_SEEDS[pathwayId].map((seed, index) => buildScenario(pathwayId, seed, index))])) as Record<StandardPathwayId, [PathwayOriginScenario, PathwayOriginScenario]>;

export function getPathwayOrigins(pathwayId: StandardPathwayId) {
  return PATHWAY_ORIGINS[pathwayId];
}

export function difficultyLabel(value: number) {
  return value <= 1 ? "低" : value === 2 ? "较低" : value === 3 ? "中" : value === 4 ? "高" : "极高";
}

const LORE_IDS = new Set(LORE_RECORDS.map((record) => record.id));

function parseJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("动态出身模型没有返回 JSON 对象");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

export function validateDynamicPathwayOrigin(value: unknown, pathwayId: StandardPathwayId): PathwayOriginScenario {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("动态出身不是对象");
  const raw = value as Record<string, unknown>;
  const text = (key: string, max = 240) => {
    const result = typeof raw[key] === "string" ? raw[key].trim().slice(0, max) : "";
    if (!result) throw new Error(`动态出身缺少 ${key}`);
    return result;
  };
  const startingSequence = Number(raw.startingSequence);
  if (![7, 8, 9].includes(startingSequence)) throw new Error("动态出身序列必须为7、8或9");
  const evidence = Array.isArray(raw.loreEvidenceIds) ? raw.loreEvidenceIds.map(String).filter((id) => LORE_IDS.has(id)) : [];
  if (!evidence.includes(PATHWAY_EVIDENCE[pathwayId])) throw new Error("动态出身没有引用对应途径的知识库账本");
  const specialBurden = typeof raw.specialBurden === "string" ? raw.specialBurden.trim().slice(0, 240) : "";
  if (startingSequence === 7 && specialBurden.length < 20) throw new Error("序列7动态出身必须有不可忽略的特殊负担");
  const resourcesRaw = raw.resources && typeof raw.resources === "object" ? raw.resources as Record<string, unknown> : {};
  const resources = {
    manpower: Math.max(12, Math.min(34, Number(resourcesRaw.manpower) || 22)),
    money: Math.max(220, Math.min(680, Number(resourcesRaw.money) || 400)),
    extraordinaryMaterials: Math.max(3, Math.min(14, Number(resourcesRaw.extraordinaryMaterials) || 7)),
  };
  const districtIds = new Set(["north", "empress", "west", "hillston", "cherwood", "government", "east", "bridge", "south", "dock"]);
  const districtId = typeof raw.districtId === "string" && districtIds.has(raw.districtId) ? raw.districtId : "cherwood";
  const blockNumber = Math.max(1, Math.min(5, Number(raw.blockNumber) || 1));
  const advantageName = text("advantageName", 32);
  const advantage = text("advantage");
  const burdenName = text("burdenName", 32);
  const burden = specialBurden || text("burden");
  const factionIds = new Set(["night-church", "steam-church", "royal-project", "witch-sect", "aurora-order", "police", "press", "black-market"]);
  const hostileFactionId = typeof raw.hostileFactionId === "string" && factionIds.has(raw.hostileFactionId) ? raw.hostileFactionId : "police";
  const identity = stableTextHash(JSON.stringify({
    pathwayId,
    title: text("title", 48),
    summary: text("summary", 280),
    startingSequence,
    source: text("source"),
    contact: text("contact"),
    enemy: text("enemy"),
    firstCrisis: text("firstCrisis"),
    districtId,
    blockNumber,
    resources,
    exposure: Math.max(0, Math.min(30, Number(raw.exposure) || 8)),
    reputation: Math.max(-15, Math.min(18, Number(raw.reputation) || 0)),
    hostileFactionId,
    evidence: [...new Set(evidence)].sort(),
  }));
  return {
    id: `${pathwayId}-dynamic-${identity}`,
    pathwayId,
    kind: "dynamic",
    title: text("title", 48),
    summary: text("summary", 280),
    startingSequence: startingSequence as 7 | 8 | 9,
    source: text("source"),
    contact: text("contact"),
    enemy: text("enemy"),
    firstCrisis: text("firstCrisis"),
    startingLocation: { districtId, blockId: `${districtId}-block-${blockNumber}`, label: text("locationLabel", 48) },
    resources,
    exposure: Math.max(0, Math.min(30, Number(raw.exposure) || 8)),
    reputation: Math.max(-15, Math.min(18, Number(raw.reputation) || 0)),
    hostility: [{ factionId: hostileFactionId, delta: Math.max(4, Math.min(30, Number(raw.hostilityDelta) || 10)), cause: text("hostilityCause") }],
    difficulty: DIFFICULTY[pathwayId],
    traits: [
      { id: `${pathwayId}-dynamic-advantage`, name: advantageName, kind: "advantage", description: advantage, triggers: Array.isArray(raw.advantageTriggers) ? raw.advantageTriggers.map(String).slice(0, 3) : [advantageName], effects: { digestion: startingSequence === 7 ? 6 : 8 } },
      { id: `${pathwayId}-dynamic-burden`, name: burdenName, kind: "burden", description: burden, triggers: Array.isArray(raw.burdenTriggers) ? raw.burdenTriggers.map(String).slice(0, 3) : [burdenName], effects: { exposure: startingSequence === 7 ? 18 : 9, instability: startingSequence === 7 ? 15 : 9 } },
    ],
    loreEvidenceIds: [...new Set([PATHWAY_EVIDENCE[pathwayId], "lotm-03-006", "lotm-03-007", "lotm-08-007", ...evidence])],
  };
}

export async function generateDynamicPathwayOrigin(config: AiConfig, pathwayId: StandardPathwayId, playerBackground: string) {
  const dossier = PATHWAY_OPENING_DOSSIERS[pathwayId];
  const lore = LORE_RECORDS.filter((record) => [PATHWAY_EVIDENCE[pathwayId], "lotm-03-001", "lotm-03-006", "lotm-03-007", "lotm-03-005", "lotm-08-007", "lotm-11-002", "lotm-11-004"].includes(record.id));
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await callModel(config, "你为《灰雾纪事》生成知识库约束的贝克兰德开局出身。不得改变途径，不得让玩家选择序列。序列9最常见，序列8必须有既有经历与债务，序列7只允许极少数来源可信的特殊背景，并必须附带足以改变长期玩法的追捕、污染、官方控制、旧伤或政治债。只返回JSON。", `为${dossier.name}途径生成一个与两套固定出身不同的动态出身。玩家补充背景：${playerBackground || "未补充"}\n知识依据：${JSON.stringify(lore.map((record) => ({ id: record.id, title: record.title, content: record.content.slice(0, 520) })))}\n返回字段：title,summary,startingSequence,source,contact,enemy,firstCrisis,districtId,blockNumber,locationLabel,resources:{manpower,money,extraordinaryMaterials},exposure,reputation,hostileFactionId,hostilityDelta,hostilityCause,advantageName,advantage,advantageTriggers,burdenName,burden,burdenTriggers,specialBurden,loreEvidenceIds。`, { task: "dynamic-origin", json: true, maxTokens: 2200, temperature: attempt ? 0.55 : 0.82 });
      return validateDynamicPathwayOrigin(parseJsonObject(raw), pathwayId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("动态出身生成失败");
    }
  }
  throw lastError ?? new Error("动态出身生成失败");
}
