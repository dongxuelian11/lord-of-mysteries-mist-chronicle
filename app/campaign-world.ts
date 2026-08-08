import type { StandardPathwayId } from "./pathway-catalog.ts";
import { PATHWAY_SEQUENCE_LEDGER } from "./pathway-sequence-ledger.ts";

export type CampaignCityId = "backlund" | "tingen" | "bayam" | "bansy" | "silver-city" | "trier" | "cordu";
export type CampaignStageId = "backlund-founding" | "great-smog" | "intercity-network" | "continental-conflict" | "apocalypse-prelude" | "divine-era" | "post-deity-world";

export type CampaignStrategicSector = {
  id: string;
  name: string;
  value: number;
  intelligence: number;
  control: number;
  pressure: number;
  controllerRef: "player" | "local" | "contested" | "unknown";
  tags: string[];
};

export type CampaignCityState = {
  id: CampaignCityId;
  name: string;
  region: string;
  summary: string;
  status: "known" | "contacted" | "foothold" | "branch" | "stronghold";
  playerControl: number;
  intelligence: number;
  localPressure: number;
  committedManpower: number;
  resourceYield: { manpower: number; money: number; extraordinaryMaterials: number; intelligence: number };
  sectors: CampaignStrategicSector[];
  loreEvidenceIds: string[];
  lastEvent: string;
};

export type HistoricalEpoch = {
  id: string;
  name: string;
  summary: string;
  loreEvidenceIds: string[];
};

export type CampaignStage = {
  id: CampaignStageId;
  title: string;
  status: "locked" | "active" | "completed";
  startedWeek?: number;
  completedWeek?: number;
  objective: string;
  worldEffect: string;
  loreEvidenceIds: string[];
};

export type PostDeityWorldState = {
  active: boolean;
  deifiedWeek?: number;
  weeksSinceDeification: number;
  anchorStrength: number;
  humanity: number;
  prayerBacklog: number;
  authorityPressure: number;
  outerDeityPressure: number;
  protectedCityIds: CampaignCityId[];
  divineProjects: { id: string; title: string; progress: number; risk: number; status: "active" | "completed" | "failed" }[];
  lastReckoning: string;
};

export type CampaignWorldState = {
  version: 1;
  activeCityId: CampaignCityId;
  cities: CampaignCityState[];
  historicalEpochs: HistoricalEpoch[];
  stages: CampaignStage[];
  currentStageId: CampaignStageId;
  postDeity: PostDeityWorldState;
  events: { id: string; week: number; cityId?: CampaignCityId; stageId: CampaignStageId; summary: string; loreEvidenceIds: string[] }[];
};

export function projectCampaignWorldForSimulation(state: CampaignWorldState, activeCityId: CampaignCityId = "backlund") {
  const city = state.cities.find((item) => item.id === activeCityId) ?? state.cities.find((item) => item.id === state.activeCityId) ?? state.cities[0];
  const relevantStageIds = new Set<CampaignStageId>([state.currentStageId, "great-smog"]);
  return {
    version: state.version,
    activeCityId: city?.id ?? activeCityId,
    city: city ?? null,
    stages: state.stages.filter((stage) => stage.status === "active" || relevantStageIds.has(stage.id)),
    currentStageId: state.currentStageId,
    postDeity: state.postDeity.active ? state.postDeity : { active: false, weeksSinceDeification: 0 },
    recentEvents: state.events.filter((event) => !event.cityId || event.cityId === city?.id).slice(-20),
    coldCityCount: Math.max(0, state.cities.length - (city ? 1 : 0)),
  };
}

const sector = (id: string, name: string, value: number, tags: string[]): CampaignStrategicSector => ({ id, name, value, intelligence: 0, control: 0, pressure: 35 + value, controllerRef: "unknown", tags });

const CITY_SEEDS: Omit<CampaignCityState, "status" | "playerControl" | "intelligence" | "localPressure" | "committedManpower" | "resourceYield" | "lastEvent">[] = [
  { id: "backlund", name: "贝克兰德", region: "鲁恩王国", summary: "贵族、议会、三大教会、工业与贫民区并存的希望之都。", loreEvidenceIds: ["lotm-08-007", "lotm-11-004"], sectors: [sector("backlund-council", "议会与行政档案", 16, ["official", "document"]), sector("backlund-churches", "三大教会网络", 18, ["church", "occult"]), sector("backlund-industry", "工厂与煤气管网", 15, ["industry", "manpower"]), sector("backlund-docks", "码头与海外物流", 13, ["trade", "materials"]), sector("backlund-underclass", "东区与工人社区", 14, ["social", "reputation"]) ] },
  { id: "tingen", name: "廷根", region: "鲁恩王国", summary: "大学、值夜者、地下交易与普通中产生活交叠的神秘入口。", loreEvidenceIds: ["lotm-08-006"], sectors: [sector("tingen-university", "大学与历史档案", 10, ["knowledge"]), sector("tingen-nighthawks", "值夜者辖区", 13, ["church", "security"]), sector("tingen-market", "地下交易渠道", 9, ["materials", "covert"]), sector("tingen-residences", "中产社区", 8, ["social", "cover"]) ] },
  { id: "bayam", name: "拜亚姆", region: "罗思德群岛", summary: "殖民秩序、海盗、反抗军、风暴教会与海上贸易交汇。", loreEvidenceIds: ["lotm-08-008"], sectors: [sector("bayam-port", "殖民港务", 14, ["trade", "official"]), sector("bayam-resistance", "反抗军网络", 12, ["manpower", "covert"]), sector("bayam-church", "风暴教会航线", 14, ["church", "sea"]), sector("bayam-pirates", "海盗与黑市", 13, ["materials", "intel"]) ] },
  { id: "bansy", name: "班西", region: "苏尼亚海航线", summary: "受灾祸之城力量渗透的异常港口，控制收益高但污染压力极重。", loreEvidenceIds: ["lotm-08-009", "lotm-05-001"], sectors: [sector("bansy-port", "异常港务", 12, ["trade", "danger"]), sector("bansy-ritual", "灾祸仪式遗痕", 18, ["occult", "sefirot"]), sector("bansy-residents", "幸存者与地方关系", 10, ["social", "protect"]), sector("bansy-route", "隐秘海路", 15, ["access", "covert"]) ] },
  { id: "silver-city", name: "白银城", region: "神弃之地", summary: "依靠严格探索制度和怪物材料，在无光环境中延续文明的人类城邦。", loreEvidenceIds: ["lotm-08-003", "lotm-08-010"], sectors: [sector("silver-wall", "城墙与探索队", 17, ["security", "manpower"]), sector("silver-materials", "怪物材料仓", 16, ["materials"]), sector("silver-council", "六人议事团传统", 14, ["governance"]), sector("silver-faith", "造物主信仰锚点", 18, ["anchor", "church"]) ] },
  { id: "trier", name: "特里尔", region: "因蒂斯共和国", summary: "艺术、革命、工业与欲望之都，地下叠压第四纪遗迹、封印与镜中异常。", loreEvidenceIds: ["lotm-08-011", "lotm-13-006"], sectors: [sector("trier-government", "共和国政治圈", 15, ["official", "revolution"]), sector("trier-industry", "工业与技术网络", 14, ["industry", "money"]), sector("trier-underground", "地下特里尔", 20, ["history", "occult"]), sector("trier-mirror", "镜中异常节点", 18, ["mirror", "danger"]), sector("trier-arts", "艺术与社交网络", 11, ["reputation", "social"]) ] },
  { id: "cordu", name: "科尔杜", region: "因蒂斯边境", summary: "循环、梦境与仪式灾难使这里成为外神恩赐渗透的前哨。", loreEvidenceIds: ["lotm-08-012", "lotm-14-001"], sectors: [sector("cordu-village", "村庄关系网", 8, ["social"]), sector("cordu-dream", "循环与梦境", 18, ["dream", "fate"]), sector("cordu-ritual", "仪式灾难核心", 20, ["outer-deity", "occult"]), sector("cordu-border", "边境交通线", 10, ["access", "intel"]) ] },
];

const HISTORICAL_EPOCHS: HistoricalEpoch[] = [
  { id: "epoch-1", name: "史前与第一纪 · 混沌纪元", summary: "旧日地球毁灭性重构，现实、灵界、星界、权柄与源质逐步分离。", loreEvidenceIds: ["lotm-02-002"] },
  { id: "epoch-2", name: "第二纪 · 黑暗纪元", summary: "古神与非人种族统治，疯狂、混合途径与神弃之地格局形成。", loreEvidenceIds: ["lotm-02-003"] },
  { id: "epoch-3", name: "第三纪 · 灾变纪元", summary: "远古太阳神神系兴衰、灾变与诸多高位遗产奠定后世冲突。", loreEvidenceIds: ["lotm-02-004"] },
  { id: "epoch-4", name: "第四纪 · 众神纪元", summary: "所罗门、图铎、特伦索斯特与冥皇等帝国及四皇之战留下遍布世界的遗迹与债务。", loreEvidenceIds: ["lotm-02-005"] },
  { id: "epoch-5", name: "第五纪 · 黑铁纪元", summary: "教会、国家、工业化与殖民秩序共同运行，1349年的主线由此开始。", loreEvidenceIds: ["lotm-02-006"] },
];

const STAGE_SEEDS: Omit<CampaignStage, "status" | "startedWeek" | "completedWeek">[] = [
  { id: "backlund-founding", title: "贝克兰德奠基", objective: "建立组织、控制关键战略点并形成第一套稳定资源循环。", worldEffect: "世界以贝克兰德为中心运行，其他城市保持可调查但未驻扎状态。", loreEvidenceIds: ["lotm-08-007"] },
  { id: "great-smog", title: "贝克兰德大雾霾", objective: "在多前线重大事件中保护人员、改变历史并保存组织。", worldEffect: "它只是第一个重大阶段；结算后世界回到长期推演。", loreEvidenceIds: ["lotm-11-002"] },
  { id: "intercity-network", title: "跨城组织网络", objective: "在其他城市建立情报节点、分部与资源互助链。", worldEffect: "总部从单城组织成长为跨地区势力，分部持续产出并承受地方反击。", loreEvidenceIds: ["lotm-08-001", "lotm-08-005"] },
  { id: "continental-conflict", title: "大陆与海上博弈", objective: "在教会、国家、隐秘组织、海上势力与高序列者之间维持多方战略。", worldEffect: "城市控制、国家关系、战争与神战投影开始彼此联动。", loreEvidenceIds: ["lotm-07-001", "lotm-08-001", "lotm-08-002"] },
  { id: "apocalypse-prelude", title: "末日前奏", objective: "统筹源质、真神、旧日候选者与外神代理人的世界级压力。", worldEffect: "所有城市进入同一末日时钟，但每条世界线仍由既有行动改变。", loreEvidenceIds: ["lotm-01-006", "lotm-05-006"] },
  { id: "divine-era", title: "成神与神国治理", objective: "完成序列0晋升，治理锚、祈祷、教义、神国与同级权柄冲突。", worldEffect: "游戏不会在成神时结束；组织转化为全球和星界治理结构。", loreEvidenceIds: ["lotm-03-009", "lotm-03-010"] },
  { id: "post-deity-world", title: "成神后世界", objective: "在维持人性的同时回应凡人、保护文明并参与旧日层面的长期博弈。", worldEffect: "每周继续结算城市、信徒、外神压力、神战余波和新历史。", loreEvidenceIds: ["lotm-03-011", "lotm-05-005", "lotm-14-006"] },
];

export function createCampaignWorldState(): CampaignWorldState {
  return {
    version: 1,
    activeCityId: "backlund",
    cities: CITY_SEEDS.map((city) => ({ ...city, status: city.id === "backlund" ? "foothold" : "known", playerControl: city.id === "backlund" ? 12 : 0, intelligence: city.id === "backlund" ? 38 : 5, localPressure: city.id === "backlund" ? 42 : 55, committedManpower: city.id === "backlund" ? 8 : 0, resourceYield: { manpower: 0, money: 0, extraordinaryMaterials: 0, intelligence: city.id === "backlund" ? 2 : 0 }, lastEvent: city.id === "backlund" ? "组织在乔伍德区建立了第一处议事据点。" : "只有公开地理资料，尚未建立当地联系。" })),
    historicalEpochs: HISTORICAL_EPOCHS,
    stages: STAGE_SEEDS.map((stage, index) => ({ ...stage, status: index === 0 ? "active" : "locked", startedWeek: index === 0 ? 1 : undefined })),
    currentStageId: "backlund-founding",
    postDeity: { active: false, weeksSinceDeification: 0, anchorStrength: 0, humanity: 100, prayerBacklog: 0, authorityPressure: 0, outerDeityPressure: 28, protectedCityIds: [], divineProjects: [], lastReckoning: "尚未进入神国治理。" },
    events: [],
  };
}

export function ensureCampaignWorldState(value?: Partial<CampaignWorldState> | null): CampaignWorldState {
  const fresh = createCampaignWorldState();
  if (!value || value.version !== 1) return fresh;
  const cityById = new Map((value.cities ?? []).map((city) => [city.id, city]));
  const stageById = new Map((value.stages ?? []).map((stage) => [stage.id, stage]));
  return {
    ...fresh,
    ...value,
    version: 1,
    cities: fresh.cities.map((city) => ({ ...city, ...cityById.get(city.id), id: city.id, loreEvidenceIds: city.loreEvidenceIds, sectors: cityById.get(city.id)?.sectors?.length ? cityById.get(city.id)!.sectors : city.sectors })),
    historicalEpochs: HISTORICAL_EPOCHS,
    stages: fresh.stages.map((stage) => ({ ...stage, ...stageById.get(stage.id), id: stage.id, loreEvidenceIds: stage.loreEvidenceIds })),
    postDeity: { ...fresh.postDeity, ...(value.postDeity ?? {}) },
    events: Array.isArray(value.events) ? value.events.slice(-300) : [],
  };
}

function cityMention(text: string) {
  return CITY_SEEDS.find((city) => text.includes(city.name));
}

export function applyCampaignActionResults(state: CampaignWorldState, inputs: { id: string; outcome: string; text: string }[], week: number) {
  let next = ensureCampaignWorldState(state);
  for (const input of inputs) {
    if (input.outcome === "受阻" || input.outcome === "失败") continue;
    const citySeed = cityMention(input.text);
    if (!citySeed) continue;
    const establish = /分部|据点|驻扎|办事处|长期联络/.test(input.text);
    const investigate = /调查|情报|报纸|占卜|探查|联系/.test(input.text);
    next = {
      ...next,
      cities: next.cities.map((city) => city.id !== citySeed.id ? city : {
        ...city,
        status: establish ? (city.status === "branch" || city.status === "stronghold" ? city.status : "branch") : city.status === "known" ? "contacted" : city.status,
        playerControl: Math.min(100, city.playerControl + (establish ? 12 : 4)),
        intelligence: Math.min(100, city.intelligence + (investigate ? 14 : 5)),
        localPressure: Math.min(100, city.localPressure + (establish ? 8 : 2)),
        committedManpower: city.committedManpower + (establish && city.status !== "branch" && city.status !== "stronghold" ? 6 : 0),
        resourceYield: establish ? { manpower: 0, money: 6, extraordinaryMaterials: /材料|遗迹|怪物|黑市/.test(input.text) ? 2 : 1, intelligence: 5 } : city.resourceYield,
        lastEvent: `${input.outcome}：${input.text.slice(0, 120)}`,
      }),
      events: [...next.events, { id: `campaign:${week}:${input.id}`, week, cityId: citySeed.id, stageId: next.currentStageId, summary: `${citySeed.name}：${input.outcome}，${input.text.slice(0, 140)}`, loreEvidenceIds: citySeed.loreEvidenceIds }].slice(-300),
    };
  }
  return next;
}

function desiredStage(state: CampaignWorldState, input: { week: number; currentSequence: number; smogResolved: boolean }) {
  if (input.currentSequence === 0 && state.postDeity.active) return "post-deity-world" as const;
  if (input.currentSequence === 0) return "divine-era" as const;
  if (input.currentSequence <= 2) return "apocalypse-prelude" as const;
  const activeCities = state.cities.filter((city) => ["foothold", "branch", "stronghold"].includes(city.status)).length;
  if (input.currentSequence <= 4 && activeCities >= 3) return "continental-conflict" as const;
  if (input.smogResolved || state.cities.some((city) => city.id !== "backlund" && ["foothold", "branch", "stronghold"].includes(city.status))) return "intercity-network" as const;
  if (input.week >= 21) return "great-smog" as const;
  return "backlund-founding" as const;
}

export function advanceCampaignWorld(state: CampaignWorldState, input: { week: number; currentSequence: number; pathwayId: StandardPathwayId; smogResolved: boolean }) {
  let next = ensureCampaignWorldState(state);
  const cities = next.cities.map((city) => {
    if (city.status !== "branch" && city.status !== "stronghold" && city.id !== "backlund") return { ...city, localPressure: Math.min(100, city.localPressure + (input.week % 3 === 0 ? 1 : 0)) };
    const counterPressure = Math.max(1, Math.round(city.localPressure / 22));
    const control = Math.max(0, Math.min(100, city.playerControl + Math.round(city.intelligence / 30) - counterPressure));
    const status = control >= 70 ? "stronghold" as const : city.status;
    const sectors = city.sectors.map((item, index) => index === input.week % city.sectors.length ? { ...item, pressure: Math.min(100, item.pressure + counterPressure), control: Math.max(0, Math.min(100, item.control + (city.intelligence >= 45 ? 2 : 0) - (item.pressure >= 70 ? 2 : 0))), controllerRef: item.control >= 55 ? "player" as const : item.control >= 30 ? "contested" as const : item.controllerRef } : item);
    return { ...city, status, playerControl: control, sectors, lastEvent: `${city.name}的地方势力本周施加${counterPressure}点反制压力；分部并未因建立而停止竞争。` };
  });
  next = { ...next, cities };
  const stageId = desiredStage(next, input);
  if (stageId !== next.currentStageId) {
    next = {
      ...next,
      currentStageId: stageId,
      stages: next.stages.map((stage) => stage.id === next.currentStageId ? { ...stage, status: "completed", completedWeek: input.week } : stage.id === stageId ? { ...stage, status: "active", startedWeek: stage.startedWeek ?? input.week } : stage),
      events: [...next.events, { id: `campaign-stage:${input.week}:${stageId}`, week: input.week, stageId, summary: `世界进入“${STAGE_SEEDS.find((stage) => stage.id === stageId)?.title}”阶段。`, loreEvidenceIds: STAGE_SEEDS.find((stage) => stage.id === stageId)?.loreEvidenceIds ?? [] }].slice(-300),
    };
  }
  if (input.currentSequence === 0) {
    const post = next.postDeity;
    const active = true;
    const weeksSinceDeification = post.active ? post.weeksSinceDeification + 1 : 0;
    const anchorGain = Math.min(5, next.cities.filter((city) => city.status === "stronghold").length + 1);
    next = {
      ...next,
      postDeity: {
        ...post,
        active,
        deifiedWeek: post.deifiedWeek ?? input.week,
        weeksSinceDeification,
        anchorStrength: Math.min(100, post.anchorStrength + anchorGain),
        humanity: Math.max(0, Math.min(100, post.humanity - Math.max(0, post.authorityPressure - post.anchorStrength) / 20)),
        prayerBacklog: Math.max(0, post.prayerBacklog + 4 + next.cities.filter((city) => city.status === "branch" || city.status === "stronghold").length - Math.floor(post.anchorStrength / 18)),
        authorityPressure: Math.min(100, post.authorityPressure + 3),
        outerDeityPressure: Math.min(100, post.outerDeityPressure + (input.week % 4 === 0 ? 2 : 0)),
        protectedCityIds: next.cities.filter((city) => city.status === "stronghold").map((city) => city.id),
        lastReckoning: `${PATHWAY_SEQUENCE_LEDGER[input.pathwayId].aboveSequence}方向的聚合压力持续存在；本周仍需在祈祷、锚、城市与外神威胁之间分配注意力。`,
      },
    };
  }
  return next;
}

export function campaignWeeklyYield(state: CampaignWorldState) {
  return state.cities.filter((city) => city.status === "branch" || city.status === "stronghold").reduce((sum, city) => ({
    manpower: sum.manpower + city.resourceYield.manpower,
    money: sum.money + city.resourceYield.money,
    extraordinaryMaterials: sum.extraordinaryMaterials + city.resourceYield.extraordinaryMaterials,
    intelligence: sum.intelligence + city.resourceYield.intelligence,
  }), { manpower: 0, money: 0, extraordinaryMaterials: 0, intelligence: 0 });
}

export function applyCampaignSignals(state: CampaignWorldState, signals: { id: string; cityId?: string; headline: string; body: string }[], week: number) {
  let next = ensureCampaignWorldState(state);
  for (const signal of signals) {
    const city = next.cities.find((item) => item.id === signal.cityId);
    if (!city) continue;
    next = {
      ...next,
      cities: next.cities.map((item) => item.id === city.id ? { ...item, intelligence: Math.min(100, item.intelligence + 2), status: item.status === "known" ? "contacted" : item.status, lastEvent: `${signal.headline}：${signal.body.slice(0, 100)}` } : item),
      events: [...next.events, { id: `campaign-signal:${signal.id}`, week, cityId: city.id, stageId: next.currentStageId, summary: `${signal.headline}：${signal.body.slice(0, 140)}`, loreEvidenceIds: city.loreEvidenceIds }].slice(-300),
    };
  }
  return next;
}
