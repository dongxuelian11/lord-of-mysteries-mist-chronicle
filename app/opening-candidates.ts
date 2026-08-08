import type { Member, PathwayId } from "./game-model.ts";
import { PATHWAY_OPENING_DOSSIERS, STANDARD_PATHWAY_IDS } from "./pathway-catalog.ts";

const CANDIDATE_SEEDS = [
  { id: "opening-ada", name: "艾达·赫伯特", role: "内务候选", source: "一次被官方草草结案的非凡事故幸存者", experience: "曾在救济机构登记失踪人口", predicament: "仍要供养不知其真实身份的家人", voice: "先问谁会承担代价，再讨论效率" },
  { id: "opening-silas", name: "赛拉斯·格林", role: "资源候选", source: "从破产收藏家手中接过了带来源证明的魔药", experience: "替三家商行清理过无法入账的货物", predicament: "旧债主掌握其第一次非凡行动的证据", voice: "习惯把风险换算成期限和账目" },
  { id: "opening-miriam", name: "米丽娅姆·凯恩", role: "情报候选", source: "经可靠引路人介绍进入低序列圈子", experience: "维护过报社、仆役与码头三条消息渠道", predicament: "一名消息源正被官方势力秘密审查", voice: "明确区分传闻、推断和已核实事实" },
  { id: "opening-jonas", name: "乔纳斯·里德", role: "行动候选", source: "在南大陆服役期间接受了紧急晋升", experience: "带领小队从一次非凡伏击中撤离", predicament: "晋升过快留下尚未完全消化的负担", voice: "先给撤退线，再给行动方案" },
  { id: "opening-elise", name: "伊莉丝·沃德", role: "研究候选", source: "通过一份有双重来源证据的家族笔记完成晋升", experience: "在大学档案中核对过相互矛盾的第四纪记录", predicament: "导师正在追查被她复制的一页目录", voice: "没有来源就不会把猜测写进结论" },
  { id: "opening-bennet", name: "班尼特·肖", role: "安全候选", source: "受教会外围人员监督完成低序列晋升", experience: "负责过三处危险物品的转运与隔离", predicament: "拒绝交出一件可能牵连无辜者的证物", voice: "偏好清晰命令与可执行的停止条件" },
  { id: "opening-nadine", name: "娜丁·贝克", role: "社区候选", source: "因救治一名非凡者而获得配方与材料回报", experience: "在东区组织过疾病救助和工人互助", predicament: "她保护的人群正在被某个组织筛查", voice: "总会追问计划对普通人意味着什么" },
  { id: "opening-oswin", name: "奥斯温·费尔", role: "外联候选", source: "从五海归来时继承了同伴留下的非凡特性", experience: "熟悉港口、灰色交易和跨区撤离", predicament: "同伴的死亡原因仍可能沿特性追来", voice: "用航线、风向和退港时间解释局势" },
] as const;

function hashSeed(value: string) {
  let hash = 0;
  for (const character of value) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function buildOpeningCandidatePool(args: {
  playerPathwayId: PathwayId;
  identityId: string;
  experienceId: string;
}): Member[] {
  const offset = hashSeed(`${args.playerPathwayId}:${args.identityId}:${args.experienceId}`) % STANDARD_PATHWAY_IDS.length;
  const experiencedBackground = ["south-war", "church-periphery", "safah-past"].includes(args.experienceId);
  return CANDIDATE_SEEDS.map((seed, index) => {
    const pathwayId = STANDARD_PATHWAY_IDS[(offset + index * 3) % STANDARD_PATHWAY_IDS.length];
    const pathway = PATHWAY_OPENING_DOSSIERS[pathwayId];
    const sequence = experiencedBackground && index === 3 ? 7 : index === 1 ? 8 : 9;
    return {
      id: seed.id,
      name: seed.name,
      role: seed.role,
      pathway: pathway.name,
      sequence,
      specialty: pathway.managementContribution,
      loyalty: 48 + (index % 4) * 5,
      trust: 42 + (index % 3) * 6,
      interest: 55 + (index % 5) * 4,
      ideology: 50 + (index % 4) * 7,
      fatigue: sequence === 7 ? 24 : sequence === 8 ? 16 : 8 + index,
      status: "候选入席",
      background: `${seed.source}；${seed.experience}；${seed.predicament}。`,
      core: `来源特质：${seed.source}｜经历特质：${seed.experience}｜困境特质：${seed.predicament}`,
      voice: seed.voice,
      arc: seed.predicament,
      secret: sequence === 7 ? "其序列7经历与负担必须在知识库检索和开局世界事实锁定后才能展开。" : "其未公开经历必须经关系与情报逐步揭示。",
      personalEvent: seed.predicament,
      personalEventState: "dormant",
      relationshipStage: "正式成员",
      relationshipMomentum: 0,
      personalPressure: sequence === 7 ? 28 : 10,
      personalEventSignals: [],
      promises: [],
      lastRelationshipChangeWeek: 0,
    };
  });
}
