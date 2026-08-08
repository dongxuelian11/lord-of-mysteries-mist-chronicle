export type OrganizationResourcePool = {
  manpower: number;
  money: number;
  extraordinaryMaterials: number;
};

export type ManpowerAllocation = {
  headquarters: number;
  intelligence: number;
  resources: number;
  security: number;
  branches: number;
};

export type GovernanceOfficeId = "internal-affairs" | "resources" | "intelligence" | "operations";

export type GovernanceOffice = {
  id: GovernanceOfficeId;
  name: string;
  responsibility: string;
  incumbentId?: string;
  actingMemberId?: string;
};

export type GovernanceMemberProfile = {
  id: string;
  name: string;
  pathway?: string;
  sequence?: number;
  specialty: string;
  fatigue: number;
  status: string;
};

export type GovernanceContribution = {
  officeId: GovernanceOfficeId;
  incumbentId?: string;
  incumbentName?: string;
  base: number;
  effective: number;
  availability: "vacant" | "present" | "away" | "unavailable";
  effect: string;
};

export type GovernanceReport = {
  week: number;
  offices: GovernanceContribution[];
};

export type FormulaRecord = {
  id: string;
  pathwayId: string;
  sequence: number;
  name: string;
  status: "lead" | "fragment" | "verifying" | "verified";
  reliability: number;
  sourceRefs: string[];
  loreEvidenceIds: string[];
  researchProgress?: number;
  duplicateCopies?: number;
};

export type SealedArtifactRecord = {
  id: string;
  name: string;
  effectSummary: string;
  dangerSummary: string;
  containmentCost: number;
  custodianId?: string;
  locationId: string;
  loreEvidenceIds: string[];
  status?: "unidentified" | "contained" | "assigned" | "unstable";
  weeklyMoneyCost?: number;
  weeklyMaterialCost?: number;
  benefit?: StrategicPointYield;
  risk?: number;
};

export type CandidateRecord = {
  id: string;
  name: string;
  background: string;
  aptitude: string;
  sourceTrait: string;
  experienceTrait: string;
  predicamentTrait: string;
  screenedWeek: number;
  status: "screened" | "selected" | "promoted" | "departed";
};

export type BeyonderDevelopmentStatus = "adapting" | "digesting" | "ready" | "unstable";

export type BeyonderDevelopmentRecord = {
  memberId: string;
  pathwayId: string;
  sequence: number;
  formulaId: string;
  digestion: number;
  instability: number;
  supervision: number;
  status: BeyonderDevelopmentStatus;
  lastUpdateWeek: number;
  log: string[];
};

export type ScreeningProject = {
  id: string;
  startedWeek: number;
  dueWeek: number;
  manpower: number;
  moneyCost: number;
  status: "active" | "completed" | "cancelled";
  candidateIds: string[];
};

export type ExposureEvidence = {
  id: string;
  kind: "witness" | "record" | "occult-residue" | "money-trail" | "captured-agent" | "public-rumor";
  summary: string;
  severity: number;
  locationId: string;
  detectableByFactionIds: string[];
  createdWeek: number;
  expiresWeek?: number;
};

export type ReputationState = {
  tier: "unknown" | "local-name" | "recognized" | "renowned" | "legendary";
  score: number;
  tags: Record<string, number>;
  propagationRefs: string[];
};

export type FactionHostilityState = {
  factionId: string;
  grievance: number;
  interestConflict: number;
  ideologyConflict: number;
  perceivedThreat: number;
  leverageAgainstPlayer: number;
  hostility: number;
  responseStyle: string;
  lastCauseRefs: string[];
};

export type ControlFoundations = {
  official: number;
  economic: number;
  social: number;
  occult: number;
  force: number;
};

export type StrategicPointYield = Partial<Record<"money" | "manpower" | "extraordinaryMaterials" | "intelligence" | "control", number>>;

export type StrategicPointState = {
  id: string;
  name: string;
  kind: "authority" | "market" | "community" | "occult" | "security" | "transport" | "information";
  weight: number;
  influenceByFaction: Record<string, number>;
  controllerId?: string;
  contested: boolean;
  foundations: ControlFoundations;
  weeklyYield: StrategicPointYield;
  intelligenceIds: string[];
  loreStatus: "verified" | "local-fiction" | "requires-runtime-verification";
  loreEvidenceIds: string[];
};

export type BacklundBlockState = {
  id: string;
  districtId: string;
  name: string;
  weight: number;
  control: number;
  strategicPoints: StrategicPointState[];
};

export type BacklundDistrictState = {
  id: string;
  name: string;
  weight: number;
  control: number;
  blocks: BacklundBlockState[];
};

export type BacklundMapState = {
  cityId: "backlund";
  playerFactionId: string;
  districts: BacklundDistrictState[];
  lastRecalculatedWeek: number;
};

export type BranchPolicy = "money" | "manpower" | "extraordinaryMaterials" | "intelligence" | "stabilize-control";

export type BranchRecord = {
  id: string;
  name: string;
  districtId: string;
  blockId: string;
  supervisorId: string;
  stationedManpower: number;
  stationedBeyonderIds: string[];
  policy: BranchPolicy;
  status: "forming" | "active" | "threatened" | "evacuating" | "lost";
  controlSupport: number;
  warningRefs: string[];
  lastStatusChangeWeek?: number;
};

export type OrganizationManagementState = {
  version: 2;
  resources: OrganizationResourcePool;
  manpowerAllocation: ManpowerAllocation;
  offices: GovernanceOffice[];
  formulas: FormulaRecord[];
  sealedArtifacts: SealedArtifactRecord[];
  candidates: CandidateRecord[];
  beyonderDevelopment: BeyonderDevelopmentRecord[];
  screeningProjects: ScreeningProject[];
  exposureEvidence: ExposureEvidence[];
  exposure: number;
  reputation: ReputationState;
  factionHostility: FactionHostilityState[];
  branches: BranchRecord[];
  map: BacklundMapState;
  highSequenceLedgerRefs: string[];
  lastGovernanceReport?: GovernanceReport;
  lastConsequenceReport?: {
    week: number;
    controlNetworkBonus: number;
    recruitmentBonus: number;
    exposurePenalty: number;
    counteractionTier: "watching" | "obstructing" | "striking" | "eradication";
    effects: string[];
  };
};

export const BACKLUND_FACTION_CATALOG = [
  { id: "night-church", name: "黑夜教会", responseStyle: "值夜者调查、教会警告与隐秘收容", loreEvidenceIds: ["lotm-06-001", "lotm-07-001", "lotm-11-004"] },
  { id: "steam-church", name: "蒸汽与机械之神教会", responseStyle: "机械之心审查、技术封锁与工业设施接管", loreEvidenceIds: ["lotm-06-001", "lotm-07-001", "lotm-11-001"] },
  { id: "royal-project", name: "王室特别工程集团", responseStyle: "行政施压、承包链切割与秘密工程反制", loreEvidenceIds: ["lotm-08-007", "lotm-11-004"] },
  { id: "witch-sect", name: "魔女教派", responseStyle: "身份渗透、灾祸制造与知情者清理", loreEvidenceIds: ["lotm-07-010"] },
  { id: "aurora-order", name: "极光会外围", responseStyle: "布道渗透、污染诱导与非凡袭击", loreEvidenceIds: ["lotm-07-003"] },
  { id: "police", name: "贝克兰德警察厅", responseStyle: "治安调查、传唤、查封与舆论定性", loreEvidenceIds: ["lotm-08-007", "lotm-11-004"] },
  { id: "press", name: "晚报消息网", responseStyle: "消息封锁、舆论交易与公开曝光", loreEvidenceIds: ["lotm-08-007", "lotm-11-001"] },
  { id: "black-market", name: "桥区非凡黑市", responseStyle: "抬价断供、收买中间人与雇佣暴力", loreEvidenceIds: ["lotm-08-007", "lotm-11-002"] },
] as const;

export type BacklundFactionId = typeof BACKLUND_FACTION_CATALOG[number]["id"];

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));

function stableNumber(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function strategicPointController(influenceByFaction: Record<string, number>) {
  const ranked = Object.entries(influenceByFaction).sort((left, right) => right[1] - left[1]);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  if (!leader || leader[1] < 60 || leader[1] - (runnerUp?.[1] ?? 0) < 5) return undefined;
  return leader[0];
}

function normalizeInfluence(influence: Record<string, number>) {
  const nonNegative = Object.fromEntries(Object.entries(influence).map(([key, value]) => [key, Math.max(0, value)]));
  const total = Object.values(nonNegative).reduce((sum, value) => sum + value, 0) || 1;
  const entries = Object.entries(nonNegative);
  const normalized: Record<string, number> = {};
  let assigned = 0;
  entries.forEach(([key, value], index) => {
    const next = index === entries.length - 1 ? 100 - assigned : Math.round((value / total) * 100);
    normalized[key] = Math.max(0, next);
    assigned += normalized[key];
  });
  return normalized;
}

export function recalculateBacklundControl(map: BacklundMapState, week = map.lastRecalculatedWeek): BacklundMapState {
  const districts = map.districts.map((district) => {
    const blocks = district.blocks.map((block) => {
      const strategicPoints = block.strategicPoints.map((point) => {
        const influenceByFaction = normalizeInfluence(point.influenceByFaction);
        const controllerId = strategicPointController(influenceByFaction);
        return { ...point, influenceByFaction, controllerId, contested: !controllerId };
      });
      const totalWeight = strategicPoints.reduce((sum, point) => sum + point.weight, 0) || 1;
      const control = strategicPoints.reduce((sum, point) => sum + (point.influenceByFaction[map.playerFactionId] ?? 0) * point.weight, 0) / totalWeight;
      return { ...block, control: Math.round(control), strategicPoints };
    });
    const totalWeight = blocks.reduce((sum, block) => sum + block.weight, 0) || 1;
    const control = blocks.reduce((sum, block) => sum + block.control * block.weight, 0) / totalWeight;
    return { ...district, control: Math.round(control), blocks };
  });
  return { ...map, districts, lastRecalculatedWeek: week };
}

export function attachIntelligenceToBacklundMap(
  map: BacklundMapState,
  reports: { id: string; districtId?: string; text: string }[],
): BacklundMapState {
  let districts = map.districts;
  for (const report of reports) {
    if (!report.districtId) continue;
    const district = districts.find((item) => item.id === report.districtId);
    if (!district) continue;
    const block = district.blocks.find((item) => report.text.includes(item.name)) ?? district.blocks[stableNumber(`${report.id}:block-intel`) % district.blocks.length];
    const point = block.strategicPoints.find((item) => report.text.includes(item.name)) ?? block.strategicPoints[stableNumber(`${report.id}:point-intel`) % block.strategicPoints.length];
    districts = districts.map((entry) => entry.id !== district.id ? entry : {
      ...entry,
      blocks: entry.blocks.map((candidate) => candidate.id !== block.id ? candidate : {
        ...candidate,
        strategicPoints: candidate.strategicPoints.map((candidatePoint) => candidatePoint.id !== point.id ? candidatePoint : { ...candidatePoint, intelligenceIds: [...new Set([...candidatePoint.intelligenceIds, report.id])].slice(-24) }),
      }),
    });
  }
  return { ...map, districts };
}

const DISTRICT_SEEDS = [
  ["north", "北区", ["霍伊大学街区", "圣赛缪尔街区", "出版社街区", "博物馆街区", "北站街区", "学院住宅区"]],
  ["empress", "皇后区", ["王宫外围", "皇后花园街区", "西宅邸区", "东宅邸区", "使馆街区", "贵族供应区"]],
  ["west", "西区", ["丰收教堂街区", "律师街区", "私人诊所区", "沙龙街区", "中产住宅区", "慈善机构区"]],
  ["hillston", "希尔斯顿区", ["证券街区", "银行街区", "保险街区", "百货街区", "商会街区", "仓单交易区"]],
  ["cherwood", "乔伍德区", ["鸦羽事务所街区", "剧院街区", "中产住宅区", "小工坊区", "地下聚会街区", "南北交通街区"]],
  ["government", "政府区", ["议会外围", "市政厅街区", "公务员俱乐部区", "档案街区", "公共工程区", "司法街区"]],
  ["east", "东区", ["废弃纺织厂区", "廉租屋区", "煤气工厂区", "临时招工区", "河岸棚户区", "工人市场区"]],
  ["bridge", "桥区", ["大桥北口", "马车总站区", "旧货市场区", "短租公寓区", "河运换乘区", "灰色仓储区"]],
  ["south", "南区", ["慈善诊所区", "工人互助会区", "廉价药房街", "工匠住宅区", "小型工厂区", "南郊入口"]],
  ["dock", "码头区", ["货运栈桥区", "海关仓库区", "水手酒吧区", "船坞维修区", "海外货栈区", "走私河汊区"]],
] as const;

const DISTRICT_ANCHORS: Record<string, string[]> = {
  north: ["霍伊大学学术档案网", "圣赛缪尔教堂外围联络线", "大学图书馆借阅与抄录网"],
  empress: ["王室宫殿供应商名册", "皇后花园仆役通行线", "贵族宅邸沙龙邀请网"],
  west: ["丰收教堂救济登记网", "律师街合法身份渠道", "私人沙龙引荐网络"],
  hillston: ["证券交易所异常委托簿", "银行街票据清算网", "大型百货采购渠道"],
  cherwood: ["鸦羽事务所本部警戒圈", "剧院街后台消息网", "地下聚会点引荐链"],
  government: ["王国议会请愿与议程线", "市政厅公共工程档案", "公务员俱乐部私下消息网"],
  east: ["废弃纺织厂地下出入口", "廉价旅馆流动人口名册", "煤气工厂调压与检修网"],
  bridge: ["贝克兰德大桥检查岗", "马车总站夜班调度簿", "旧货市场隐秘交易圈"],
  south: ["慈善诊所病例网", "工人互助会联络簿", "廉价药房材料采购线"],
  dock: ["货运栈桥装卸班组", "海关仓库报关档案", "水手酒吧远洋消息网"],
};

const DISTRICT_LORE: Record<string, string[]> = {
  north: ["lotm-08-007", "lotm-06-001", "lotm-07-001"],
  empress: ["lotm-08-007", "lotm-11-004"],
  west: ["lotm-08-007", "lotm-06-001", "lotm-11-002"],
  hillston: ["lotm-08-007", "lotm-11-001", "lotm-11-003"],
  cherwood: ["lotm-08-007", "lotm-11-002"],
  government: ["lotm-08-007", "lotm-11-004"],
  east: ["lotm-08-007", "lotm-11-001", "lotm-11-002"],
  bridge: ["lotm-08-007", "lotm-11-001", "lotm-11-002"],
  south: ["lotm-08-007", "lotm-11-002"],
  dock: ["lotm-08-007", "lotm-11-001"],
};

const DISTRICT_FACTIONS: Record<string, BacklundFactionId[]> = {
  north: ["night-church", "press", "police"],
  empress: ["royal-project", "witch-sect", "police"],
  west: ["night-church", "press", "police"],
  hillston: ["royal-project", "steam-church", "press"],
  cherwood: ["police", "press", "aurora-order"],
  government: ["royal-project", "police", "night-church"],
  east: ["royal-project", "witch-sect", "aurora-order"],
  bridge: ["black-market", "police", "press"],
  south: ["night-church", "aurora-order", "police"],
  dock: ["black-market", "steam-church", "royal-project"],
};

const STRATEGIC_POINT_KINDS: StrategicPointState["kind"][] = ["information", "transport", "community", "market", "security", "occult", "authority"];

function createStrategicPoint(districtId: string, blockId: string, blockName: string, blockIndex: number, index: number): StrategicPointState {
  const seed = stableNumber(`${districtId}:${blockId}:${index}`);
  const player = 5 + seed % 9;
  const kind = STRATEGIC_POINT_KINDS[(seed + index) % STRATEGIC_POINT_KINDS.length];
  const rivals = DISTRICT_FACTIONS[districtId] ?? ["police", "press", "black-market"];
  const influenceByFaction: Record<string, number> = { player };
  const rivalTotal = 100 - player;
  const first = 34 + (seed >>> 4) % 10;
  const second = 27 + (seed >>> 8) % 9;
  influenceByFaction[rivals[0]] = first;
  influenceByFaction[rivals[1]] = second;
  influenceByFaction[rivals[2]] = rivalTotal - first - second;
  const roleLabels: Record<StrategicPointState["kind"], string> = {
    authority: "许可与档案渠道", market: "采购与资金渠道", community: "居民与雇工网络",
    occult: "隐秘仪式场", security: "巡查与武装岗哨", transport: "人货转运通道", information: "报讯与监听网",
  };
  const anchor = index === 0 && blockIndex < 3 ? DISTRICT_ANCHORS[districtId]?.[blockIndex] : undefined;
  return {
    id: `${blockId}-point-${index + 1}`,
    name: anchor ?? `${blockName}·${roleLabels[kind]}`,
    kind,
    weight: index === 0 ? 3 : index === 1 ? 2 : 1,
    influenceByFaction,
    contested: true,
    foundations: {
      official: kind === "authority" ? 45 : 12,
      economic: kind === "market" ? 45 : 15,
      social: kind === "community" ? 45 : 18,
      occult: kind === "occult" ? 45 : 8,
      force: kind === "security" ? 45 : 12,
    },
    weeklyYield: kind === "market" ? { money: 4 } : kind === "community" ? { manpower: 1 } : kind === "occult" ? { extraordinaryMaterials: 1 } : { intelligence: 2 },
    intelligenceIds: [],
    loreStatus: anchor ? "verified" : "local-fiction",
    loreEvidenceIds: [...(DISTRICT_LORE[districtId] ?? ["lotm-08-007"]), `local:${blockId}`],
  };
}

export function createInitialBacklundMap(): BacklundMapState {
  const map: BacklundMapState = {
    cityId: "backlund",
    playerFactionId: "player",
    lastRecalculatedWeek: 1,
    districts: DISTRICT_SEEDS.map(([districtId, districtName, blockNames], districtIndex) => ({
      id: districtId,
      name: districtName,
      weight: districtId === "government" || districtId === "east" || districtId === "dock" ? 4 : 3,
      control: 0,
      blocks: blockNames.map((blockName, blockIndex) => {
        const blockId = `${districtId}-block-${blockIndex + 1}`;
        return {
          id: blockId,
          districtId,
          name: blockName,
          weight: 1 + ((districtIndex + blockIndex) % 3),
          control: 0,
          strategicPoints: [0, 1, 2].map((pointIndex) => createStrategicPoint(districtId, blockId, blockName, blockIndex, pointIndex)),
        };
      }),
    })),
  };
  return recalculateBacklundControl(map, 1);
}

export function createInitialOrganizationManagement(): OrganizationManagementState {
  return {
    version: 2,
    resources: { manpower: 24, money: 420, extraordinaryMaterials: 6 },
    manpowerAllocation: { headquarters: 10, intelligence: 4, resources: 4, security: 6, branches: 0 },
    offices: [
      { id: "internal-affairs", name: "内务", responsibility: "人力、筛选、关系、稳定与晋升" },
      { id: "resources", name: "资源", responsibility: "金钱、材料、设施、装备与封印物" },
      { id: "intelligence", name: "情报", responsibility: "地图情报、配方验证、神秘研究与势力关系" },
      { id: "operations", name: "行动", responsibility: "外勤、本部安全、分部与控制争夺" },
    ],
    formulas: [],
    sealedArtifacts: [],
    candidates: [],
    beyonderDevelopment: [],
    screeningProjects: [],
    exposureEvidence: [],
    exposure: 0,
    reputation: { tier: "unknown", score: 0, tags: { 隐秘: 10 }, propagationRefs: [] },
    factionHostility: BACKLUND_FACTION_CATALOG.map((faction, index) => deriveFactionHostility({
      factionId: faction.id,
      grievance: index < 2 ? 4 : 7,
      interestConflict: 8 + index * 3,
      ideologyConflict: faction.id === "witch-sect" || faction.id === "aurora-order" ? 34 : 12,
      perceivedThreat: 6 + index,
      leverageAgainstPlayer: faction.id === "police" || faction.id === "press" ? 12 : 4,
      responseStyle: faction.responseStyle,
      lastCauseRefs: ["opening:unregistered-organization"],
    })),
    branches: [],
    map: createInitialBacklundMap(),
    highSequenceLedgerRefs: [],
  };
}

export function migrateOrganizationManagementState(current?: Partial<OrganizationManagementState> | null): OrganizationManagementState {
  const fresh = createInitialOrganizationManagement();
  if (!current || !current.resources || !current.map) return fresh;
  const oldPointById = new Map(current.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints.map((point) => [point.id, point] as const))));
  const hasLegacyFactionIds = [...oldPointById.values()].some((point) => ["official", "local", "hidden"].some((id) => id in point.influenceByFaction));
  const map = recalculateBacklundControl({
    ...fresh.map,
    lastRecalculatedWeek: current.map.lastRecalculatedWeek ?? fresh.map.lastRecalculatedWeek,
    districts: fresh.map.districts.map((district) => {
      const oldDistrict = current.map?.districts.find((item) => item.id === district.id);
      return {
        ...district,
        weight: oldDistrict?.weight ?? district.weight,
        blocks: district.blocks.map((block) => {
          const oldBlock = oldDistrict?.blocks.find((item) => item.id === block.id);
          return {
            ...block,
            weight: oldBlock?.weight ?? block.weight,
            strategicPoints: block.strategicPoints.map((point) => {
              const oldPoint = oldPointById.get(point.id);
              if (!oldPoint) return point;
              const playerInfluence = clamp(oldPoint.influenceByFaction.player ?? point.influenceByFaction.player);
              const influenceByFaction = hasLegacyFactionIds
                ? (() => {
                    const rivals = Object.entries(point.influenceByFaction).filter(([id]) => id !== "player");
                    const rivalTotal = rivals.reduce((sum, [, value]) => sum + value, 0) || 1;
                    let assigned = playerInfluence;
                    const rebuilt: Record<string, number> = { player: playerInfluence };
                    rivals.forEach(([id, value], index) => {
                      const amount = index === rivals.length - 1 ? 100 - assigned : Math.round(value / rivalTotal * (100 - playerInfluence));
                      rebuilt[id] = amount;
                      assigned += amount;
                    });
                    return rebuilt;
                  })()
                : normalizeInfluence({ ...point.influenceByFaction, ...oldPoint.influenceByFaction });
              return {
                ...point,
                influenceByFaction,
                foundations: { ...point.foundations, ...oldPoint.foundations },
                intelligenceIds: [...new Set([...(oldPoint.intelligenceIds ?? []), ...point.intelligenceIds])].slice(-30),
              };
            }),
          };
        }),
      };
    }),
  }, current.map.lastRecalculatedWeek ?? 1);
  const realHostility = new Map((current.factionHostility ?? []).filter((item) => BACKLUND_FACTION_CATALOG.some((faction) => faction.id === item.factionId)).map((item) => [item.factionId, item]));
  return {
    ...fresh,
    ...current,
    version: 2,
    resources: { ...fresh.resources, ...current.resources },
    manpowerAllocation: { ...fresh.manpowerAllocation, ...current.manpowerAllocation },
    offices: Array.isArray(current.offices) ? current.offices : fresh.offices,
    formulas: Array.isArray(current.formulas) ? current.formulas : [],
    sealedArtifacts: Array.isArray(current.sealedArtifacts) ? current.sealedArtifacts : [],
    candidates: Array.isArray(current.candidates) ? current.candidates : [],
    beyonderDevelopment: Array.isArray(current.beyonderDevelopment) ? current.beyonderDevelopment : [],
    screeningProjects: Array.isArray(current.screeningProjects) ? current.screeningProjects : [],
    exposureEvidence: Array.isArray(current.exposureEvidence) ? current.exposureEvidence : [],
    factionHostility: fresh.factionHostility.map((relation) => realHostility.get(relation.factionId) ?? relation),
    branches: Array.isArray(current.branches) ? current.branches : [],
    highSequenceLedgerRefs: Array.isArray(current.highSequenceLedgerRefs) ? current.highSequenceLedgerRefs : [],
    map,
  };
}

export function assignGovernanceOffice(state: OrganizationManagementState, officeId: GovernanceOfficeId, memberId?: string): OrganizationManagementState {
  if (!state.offices.some((office) => office.id === officeId)) throw new Error("找不到该治理职务");
  return {
    ...state,
    offices: state.offices.map((office) => {
      if (memberId && office.id !== officeId && office.incumbentId === memberId) return { ...office, incumbentId: undefined };
      return office.id === officeId ? { ...office, incumbentId: memberId || undefined } : office;
    }),
  };
}

export function researchFormula(
  state: OrganizationManagementState,
  formulaId: string,
  investment: { money: number; extraordinaryMaterials: number },
): OrganizationManagementState {
  const formula = state.formulas.find((item) => item.id === formulaId);
  if (!formula) throw new Error("找不到该配方档案");
  if (formula.status === "verified") throw new Error("该配方已经完成知识库核验");
  if (investment.money < 20 || investment.extraordinaryMaterials < 1) throw new Error("一次配方研究至少需要 £20 与 1 份非凡材料");
  if (state.resources.money < investment.money || state.resources.extraordinaryMaterials < investment.extraordinaryMaterials) throw new Error("配方研究资源不足");
  const gain = Math.min(45, Math.floor(investment.money / 4) + investment.extraordinaryMaterials * 14);
  const progress = clamp((formula.researchProgress ?? formula.reliability) + gain);
  const verified = progress >= 100 && formula.loreEvidenceIds.length > 0;
  return {
    ...state,
    resources: {
      ...state.resources,
      money: state.resources.money - investment.money,
      extraordinaryMaterials: state.resources.extraordinaryMaterials - investment.extraordinaryMaterials,
    },
    formulas: state.formulas.map((item) => item.id !== formulaId ? item : {
      ...item,
      researchProgress: verified ? 100 : Math.min(progress, item.loreEvidenceIds.length ? 100 : 99),
      reliability: verified ? 100 : Math.min(95, Math.max(item.reliability, Math.floor(progress * .9))),
      status: verified ? "verified" as const : progress >= 70 ? "verifying" as const : progress >= 35 ? "fragment" as const : "lead" as const,
      sourceRefs: [...new Set([...item.sourceRefs, `organization-research:${investment.money}:${investment.extraordinaryMaterials}`])].slice(-20),
    }),
  };
}

export function duplicateVerifiedFormula(state: OrganizationManagementState, formulaId: string): OrganizationManagementState {
  const formula = state.formulas.find((item) => item.id === formulaId);
  if (!formula || formula.status !== "verified" || formula.loreEvidenceIds.length === 0) throw new Error("只有具备知识库证据的已验证配方才能制作交易副本");
  if (state.resources.money < 30 || state.resources.extraordinaryMaterials < 1) throw new Error("制作安全副本需要 £30 与 1 份非凡材料");
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money - 30, extraordinaryMaterials: state.resources.extraordinaryMaterials - 1 },
    formulas: state.formulas.map((item) => item.id === formulaId ? { ...item, duplicateCopies: (item.duplicateCopies ?? 0) + 1 } : item),
  };
}

export function exchangeFormulaCopy(state: OrganizationManagementState, formulaId: string): OrganizationManagementState {
  const formula = state.formulas.find((item) => item.id === formulaId);
  if (!formula || (formula.duplicateCopies ?? 0) < 1) throw new Error("没有可交换的已验证配方副本");
  const value = 45 + Math.max(0, 9 - formula.sequence) * 30;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money + value, extraordinaryMaterials: state.resources.extraordinaryMaterials + (formula.sequence <= 7 ? 2 : 1) },
    formulas: state.formulas.map((item) => item.id === formulaId ? { ...item, duplicateCopies: (item.duplicateCopies ?? 0) - 1, sourceRefs: [...item.sourceRefs, "formula-exchange"].slice(-20) } : item),
  };
}

export function syncSealedArtifactsFromInventory(
  state: OrganizationManagementState,
  inventory: Array<{ id: string; name: string; category: string; location: string; keeper: string; risk: string }>,
): OrganizationManagementState {
  const existing = new Set(state.sealedArtifacts.map((item) => item.id));
  const discovered = inventory.filter((item) => item.category === "封印物" && !existing.has(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    effectSummary: "效果尚待知识库证据与隔离实验共同核验",
    dangerSummary: item.risk,
    containmentCost: 2,
    custodianId: item.keeper && item.keeper !== "无人" ? item.keeper : undefined,
    locationId: item.location,
    loreEvidenceIds: [],
    status: "unidentified" as const,
    weeklyMoneyCost: 6,
    weeklyMaterialCost: 0,
    risk: 35,
  }));
  return discovered.length ? { ...state, sealedArtifacts: [...state.sealedArtifacts, ...discovered] } : state;
}

export function configureSealedArtifact(
  state: OrganizationManagementState,
  artifactId: string,
  input: { custodianId?: string; contained: boolean },
): OrganizationManagementState {
  const artifact = state.sealedArtifacts.find((item) => item.id === artifactId);
  if (!artifact) throw new Error("找不到该封印物档案");
  if (input.contained && state.resources.money < artifact.containmentCost) throw new Error("封印物收容经费不足");
  return {
    ...state,
    resources: input.contained ? { ...state.resources, money: state.resources.money - artifact.containmentCost } : state.resources,
    sealedArtifacts: state.sealedArtifacts.map((item) => item.id !== artifactId ? item : {
      ...item,
      custodianId: input.custodianId || undefined,
      status: input.contained ? (input.custodianId ? "assigned" as const : "contained" as const) : "unidentified" as const,
    }),
  };
}

const OFFICE_SPECIALTY: Record<GovernanceOfficeId, RegExp> = {
  "internal-affairs": /人事|管理|沟通|医疗|社区|秩序|审讯|心理/,
  resources: /账目|财务|采购|材料|机械|工程|建设|黑市|船运/,
  intelligence: /情报|报业|档案|占卜|灵视|仪式|古文献|语言|神秘/,
  operations: /外勤|调查|跟踪|战斗|安全|治安|撤离|反跟踪|急救/,
};

export function deriveGovernanceContributions(
  state: OrganizationManagementState,
  members: GovernanceMemberProfile[],
  scheduledMemberIds: string[] = [],
): GovernanceContribution[] {
  const away = new Set(scheduledMemberIds);
  return state.offices.map((office) => {
    const incumbent = members.find((member) => member.id === office.incumbentId);
    if (!incumbent) return { officeId: office.id, incumbentId: office.incumbentId, base: 0, effective: 0, availability: "vacant" as const, effect: "职务空缺，本周不产生治理贡献" };
    const unavailable = /阵亡|失踪|重伤|受伤休养|被俘/.test(incumbent.status);
    const sequenceWeight = incumbent.pathway && incumbent.sequence !== undefined ? Math.max(2, 11 - incumbent.sequence) * 2 : 4;
    const specialtyBonus = OFFICE_SPECIALTY[office.id].test(incumbent.specialty) ? 5 : 0;
    const base = Math.max(1, 5 + sequenceWeight + specialtyBonus - Math.floor(incumbent.fatigue / 14));
    const availability = unavailable ? "unavailable" as const : away.has(incumbent.id) ? "away" as const : "present" as const;
    const effective = availability === "unavailable" ? 0 : availability === "away" ? Math.max(1, Math.floor(base * .3)) : base;
    const effect = availability === "away" ? "负责人执行正式行动，仅保留遥控与交接贡献" : availability === "unavailable" ? "负责人无法履职" : "负责人在本部完整履职";
    return { officeId: office.id, incumbentId: incumbent.id, incumbentName: incumbent.name, base, effective, availability, effect };
  });
}

export function selectPromotionCandidate(state: OrganizationManagementState, candidateId: string): OrganizationManagementState {
  const candidate = state.candidates.find((item) => item.id === candidateId && item.status === "screened");
  if (!candidate) throw new Error("候选人不在可选名单中");
  return {
    ...state,
    candidates: state.candidates.map((item) => item.id === candidateId
      ? { ...item, status: "selected" }
      : item.status === "selected" ? { ...item, status: "screened" } : item),
  };
}

export function activeScreeningManpower(state: OrganizationManagementState) {
  return state.screeningProjects.filter((project) => project.status === "active").reduce((sum, project) => sum + project.manpower, 0);
}

export function startCandidateScreening(
  state: OrganizationManagementState,
  args: { week: number; manpower: number; moneyCost: number },
): OrganizationManagementState {
  if (!Number.isInteger(args.manpower) || args.manpower < 3 || args.manpower > 5) throw new Error("一次筛选需要投入 3—5 名人力");
  if (!Number.isInteger(args.moneyCost) || args.moneyCost < 20) throw new Error("筛选经费至少为 £20");
  if (state.resources.money < args.moneyCost) throw new Error("筛选经费不足");
  const availableHeadquarters = state.manpowerAllocation.headquarters - activeScreeningManpower(state);
  if (availableHeadquarters < args.manpower) throw new Error(`本部可调用人力不足：筛选需要 ${args.manpower}，当前可调用 ${Math.max(0, availableHeadquarters)}`);
  if (state.screeningProjects.some((project) => project.status === "active")) throw new Error("内务部门已有一项候选人筛选正在进行");
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money - args.moneyCost },
    screeningProjects: [...state.screeningProjects, {
      id: `screening-${args.week}-${state.screeningProjects.length + 1}`,
      startedWeek: args.week,
      dueWeek: args.week + 1,
      manpower: args.manpower,
      moneyCost: args.moneyCost,
      status: "active",
      candidateIds: [],
    }],
  };
}

const CANDIDATE_NAMES = ["伊芙琳·哈特", "托马斯·里德", "艾达·柯林斯", "乔纳森·韦尔", "露西·莫顿", "亨利·贝克", "玛莎·格林", "埃德温·克劳"];
const CANDIDATE_BACKGROUNDS = ["账房学徒", "码头调度员", "慈善诊所助手", "报社校对员", "退役警员", "铁路文书"];
const CANDIDATE_APTITUDES = ["记忆与归档", "人群沟通", "风险辨识", "追踪与反跟踪", "财务核验", "灵性敏感"];

function candidatesForProject(project: ScreeningProject, week: number, reputationBonus = 0): CandidateRecord[] {
  const count = (project.manpower >= 5 ? 3 : 2) + reputationBonus;
  return Array.from({ length: count }, (_, index) => {
    const seed = stableNumber(`${project.id}:${week}:${index}`);
    return {
      id: `${project.id}-candidate-${index + 1}`,
      name: CANDIDATE_NAMES[seed % CANDIDATE_NAMES.length],
      background: CANDIDATE_BACKGROUNDS[(seed >>> 4) % CANDIDATE_BACKGROUNDS.length],
      aptitude: CANDIDATE_APTITUDES[(seed >>> 8) % CANDIDATE_APTITUDES.length],
      sourceTrait: "组织基层档案完整，可追溯其来源与担保关系",
      experienceTrait: project.moneyCost >= 45 ? "经过多轮交叉核验，抗压表现较稳定" : "通过基础访谈与履历核验",
      predicamentTrait: seed % 2 ? "背负家庭经济压力，忠诚需要长期经营" : "对神秘世界抱有强烈好奇，需防止冒进",
      screenedWeek: week,
      status: "screened" as const,
    };
  });
}

export function establishBranch(
  state: OrganizationManagementState,
  args: { districtId: string; blockId: string; supervisorId: string; stationedManpower: number; policy: BranchPolicy; name?: string },
): OrganizationManagementState {
  const district = state.map.districts.find((item) => item.id === args.districtId);
  const block = district?.blocks.find((item) => item.id === args.blockId);
  if (!district || !block) throw new Error("找不到计划驻扎的区块");
  if (block.control < 60) throw new Error(`区块控制力仅 ${block.control}，达到 60 才能建立分部`);
  if (!args.supervisorId) throw new Error("必须任命一名非凡者主管分部");
  if (!Number.isInteger(args.stationedManpower) || args.stationedManpower < 4) throw new Error("分部至少需要 4 名基层人力");
  if (state.branches.some((branch) => branch.blockId === args.blockId && branch.status !== "lost")) throw new Error("该区块已有组织分部");
  const committed = state.branches.filter((branch) => branch.status !== "lost").reduce((sum, branch) => sum + branch.stationedManpower, 0);
  if (committed + args.stationedManpower > state.manpowerAllocation.branches) throw new Error("分部人力额度不足，请先调整人力分配");
  const setupCost = 80 + args.stationedManpower * 12;
  if (state.resources.money < setupCost) throw new Error(`建立分部需要 £${setupCost}`);
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money - setupCost },
    branches: [...state.branches, {
      id: `branch-${args.blockId}-${state.branches.length + 1}`,
      name: args.name?.trim() || `${block.name}分部`,
      districtId: district.id,
      blockId: block.id,
      supervisorId: args.supervisorId,
      stationedManpower: args.stationedManpower,
      stationedBeyonderIds: [args.supervisorId],
      policy: args.policy,
      status: "forming",
      controlSupport: Math.max(3, Math.floor(args.stationedManpower / 2)),
      warningRefs: [],
      lastStatusChangeWeek: state.map.lastRecalculatedWeek,
    }],
  };
}

export function updateBranchAssignment(
  state: OrganizationManagementState,
  branchId: string,
  changes: { supervisorId?: string; stationedManpower?: number; policy?: BranchPolicy },
): OrganizationManagementState {
  const branch = state.branches.find((item) => item.id === branchId && item.status !== "lost" && item.status !== "evacuating");
  if (!branch) throw new Error("该分部已经撤离或不存在");
  const supervisorId = changes.supervisorId ?? branch.supervisorId;
  const stationedManpower = changes.stationedManpower ?? branch.stationedManpower;
  if (!supervisorId) throw new Error("分部必须保留一名非凡者主管");
  if (!Number.isInteger(stationedManpower) || stationedManpower < 4) throw new Error("分部至少需要 4 名基层人力");
  const otherCommitted = state.branches.filter((item) => item.id !== branchId && item.status !== "lost").reduce((sum, item) => sum + item.stationedManpower, 0);
  if (otherCommitted + stationedManpower > state.manpowerAllocation.branches) throw new Error("分部人力额度不足，请先调整宏观人力分配");
  const reassignmentCost = supervisorId !== branch.supervisorId || stationedManpower !== branch.stationedManpower ? 18 : 0;
  if (state.resources.money < reassignmentCost) throw new Error(`调整分部需要 £${reassignmentCost} 交接与交通费用`);
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money - reassignmentCost },
    branches: state.branches.map((item) => item.id !== branchId ? item : { ...item, supervisorId, stationedBeyonderIds: [supervisorId], stationedManpower, policy: changes.policy ?? item.policy }),
  };
}

export function commandBranchResponse(state: OrganizationManagementState, branchId: string, response: "reinforce" | "restore" | "evacuate", week: number): OrganizationManagementState {
  const branch = state.branches.find((item) => item.id === branchId && item.status !== "lost");
  if (!branch) throw new Error("找不到可管理的分部");
  if (response === "evacuate") return { ...state, branches: state.branches.map((item) => item.id === branchId ? { ...item, status: "evacuating", lastStatusChangeWeek: week, warningRefs: [...item.warningRefs, `evacuation:week:${week}`].slice(-12) } : item) };
  if (branch.status !== "threatened") throw new Error("只有受威胁分部需要增援或恢复");
  const cost = response === "reinforce" ? 45 : 30;
  if (state.resources.money < cost) throw new Error(`${response === "reinforce" ? "增援" : "恢复"}分部需要 £${cost}`);
  if (response === "restore") {
    const block = state.map.districts.find((district) => district.id === branch.districtId)?.blocks.find((item) => item.id === branch.blockId);
    if (!block || block.control < 45) throw new Error("区块控制力恢复到 45 后才能重新启用分部");
  }
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money - cost },
    branches: state.branches.map((item) => item.id !== branchId ? item : response === "reinforce"
      ? { ...item, controlSupport: item.controlSupport + 4, warningRefs: [...item.warningRefs, `reinforced:week:${week}`].slice(-12) }
      : { ...item, status: "active", lastStatusChangeWeek: week, warningRefs: [...item.warningRefs, `restored:week:${week}`].slice(-12) }),
  };
}

export function allocateManpower(state: OrganizationManagementState, allocation: ManpowerAllocation): OrganizationManagementState {
  const total = Object.values(allocation).reduce((sum, value) => sum + value, 0);
  if (Object.values(allocation).some((value) => !Number.isInteger(value) || value < 0)) throw new Error("人力分配必须是非负整数");
  if (total > state.resources.manpower) throw new Error(`人力不足：需要 ${total}，现有 ${state.resources.manpower}`);
  return { ...state, manpowerAllocation: { ...allocation } };
}

export function promoteCandidate(
  state: OrganizationManagementState,
  candidateId: string,
  formulaId: string,
  costs: { money: number; extraordinaryMaterials: number },
): OrganizationManagementState {
  const candidate = state.candidates.find((item) => item.id === candidateId && item.status === "selected");
  if (!candidate) throw new Error("候选人尚未被选中，不能提拔");
  const formula = state.formulas.find((item) => item.id === formulaId && item.status === "verified");
  if (!formula) throw new Error("配方尚未验证，不能调制魔药");
  if (formula.sequence !== 9) throw new Error("基层普通人首次提拔只能服用序列9魔药；更高序列必须在具名成员成长档案中逐阶晋升");
  if (state.resources.manpower < 1) throw new Error("没有可永久转化的基层人力");
  if (state.resources.money < costs.money || state.resources.extraordinaryMaterials < costs.extraordinaryMaterials) throw new Error("提拔资源不足");
  const allocation = { ...state.manpowerAllocation };
  const source = (Object.keys(allocation) as (keyof ManpowerAllocation)[])
    .filter((key) => allocation[key] > 0)
    .sort((left, right) => (left === "headquarters" ? -1 : right === "headquarters" ? 1 : allocation[right] - allocation[left]))[0];
  if (source) allocation[source] -= 1;
  const memberId = `promoted-${candidate.id}`;
  return {
    ...state,
    resources: {
      manpower: state.resources.manpower - 1,
      money: state.resources.money - costs.money,
      extraordinaryMaterials: state.resources.extraordinaryMaterials - costs.extraordinaryMaterials,
    },
    manpowerAllocation: allocation,
    candidates: state.candidates.map((item) => item.id === candidateId ? { ...item, status: "promoted" } : item),
    beyonderDevelopment: [...(state.beyonderDevelopment ?? []), {
      memberId,
      pathwayId: formula.pathwayId,
      sequence: formula.sequence,
      formulaId: formula.id,
      digestion: 0,
      instability: 10 + Math.max(0, 9 - formula.sequence) * 6,
      supervision: 40,
      status: "adapting",
      lastUpdateWeek: candidate.screenedWeek,
      log: [`使用有知识库证据的${formula.name}完成提拔；进入魔药适应与监护期。`],
    }],
  };
}

export function managedAdvancementCost(targetSequence: number) {
  const depth = Math.max(0, 9 - targetSequence);
  return { money: 70 + depth * 55, extraordinaryMaterials: 3 + depth * 2 };
}

export function advanceManagedBeyonder(state: OrganizationManagementState, memberId: string, formulaId: string, week: number): OrganizationManagementState {
  const record = (state.beyonderDevelopment ?? []).find((item) => item.memberId === memberId);
  if (!record) throw new Error("找不到该成员的非凡成长档案");
  if (record.status !== "ready" || record.digestion < 100) throw new Error("该成员尚未完成消化与稳定监护");
  if (record.sequence <= 0) throw new Error("该成员已经抵达途径顶点");
  const targetSequence = record.sequence - 1;
  const formula = state.formulas.find((item) => item.id === formulaId && item.pathwayId === record.pathwayId && item.sequence === targetSequence && item.status === "verified" && item.loreEvidenceIds.length > 0);
  if (!formula) throw new Error(`需要一份经知识库证据核验的序列${targetSequence}同途径配方`);
  if (record.supervision < 60 || record.instability >= 60) throw new Error("监护强度不足或失控风险过高，不能安排晋升");
  const costs = managedAdvancementCost(targetSequence);
  if (state.resources.money < costs.money || state.resources.extraordinaryMaterials < costs.extraordinaryMaterials) throw new Error(`晋升需要 £${costs.money} 与 ${costs.extraordinaryMaterials} 份非凡材料`);
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money - costs.money, extraordinaryMaterials: state.resources.extraordinaryMaterials - costs.extraordinaryMaterials },
    beyonderDevelopment: state.beyonderDevelopment.map((item) => item.memberId !== memberId ? item : {
      ...item,
      sequence: targetSequence,
      formulaId,
      digestion: 0,
      instability: clamp(item.instability + 12 + Math.max(0, 9 - targetSequence) * 2),
      supervision: Math.max(20, item.supervision - 15),
      status: "adapting",
      lastUpdateWeek: week,
      log: [...item.log, `第${week}周：消耗 £${costs.money} 与 ${costs.extraordinaryMaterials} 份非凡材料，晋升序列${targetSequence}；重新进入适应监护。`].slice(-20),
    }),
  };
}

export function deriveExposure(evidence: ExposureEvidence[], week: number) {
  return Math.round(clamp(evidence
    .filter((item) => item.expiresWeek === undefined || item.expiresWeek >= week)
    .reduce((sum, item) => sum + clamp(item.severity, 0, 25), 0)));
}

export function deriveFactionHostility(input: Omit<FactionHostilityState, "hostility">): FactionHostilityState {
  const hostility = clamp(
    input.grievance * 0.28
    + input.interestConflict * 0.24
    + input.ideologyConflict * 0.16
    + input.perceivedThreat * 0.24
    - input.leverageAgainstPlayer * 0.08,
  );
  return { ...input, hostility: Math.round(hostility) };
}

export function reputationTier(score: number): ReputationState["tier"] {
  if (score >= 80) return "legendary";
  if (score >= 55) return "renowned";
  if (score >= 30) return "recognized";
  if (score >= 12) return "local-name";
  return "unknown";
}

export function hostilityTier(hostility: number): "watching" | "obstructing" | "striking" | "eradication" {
  if (hostility >= 75) return "eradication";
  if (hostility >= 50) return "striking";
  if (hostility >= 25) return "obstructing";
  return "watching";
}

export function applyFactionCounteraction(
  map: BacklundMapState,
  args: { districtId: string; blockId: string; pointId: string; factionId: string; pressure: number; week: number },
): BacklundMapState {
  const pressure = clamp(args.pressure, 1, 30);
  const districts = map.districts.map((district) => district.id !== args.districtId ? district : {
    ...district,
    blocks: district.blocks.map((block) => block.id !== args.blockId ? block : {
      ...block,
      strategicPoints: block.strategicPoints.map((point) => {
        if (point.id !== args.pointId) return point;
        return {
          ...point,
          influenceByFaction: normalizeInfluence({
            ...point.influenceByFaction,
            [map.playerFactionId]: Math.max(0, (point.influenceByFaction[map.playerFactionId] ?? 0) - pressure * 0.65),
            [args.factionId]: (point.influenceByFaction[args.factionId] ?? 0) + pressure,
          }),
        };
      }),
    }),
  });
  return recalculateBacklundControl({ ...map, districts }, args.week);
}

export function applyPlayerControlAction(
  map: BacklundMapState,
  args: { actionId: string; districtId: string; outcome: "成功" | "部分成功" | "受阻"; summary: string; methodTags: string[]; capacity: number; week: number },
): { map: BacklundMapState; target?: { districtName: string; blockName: string; pointName: string; gain: number } } {
  if (args.outcome === "受阻") return { map };
  const district = map.districts.find((item) => item.id === args.districtId);
  if (!district) return { map };
  const block = district.blocks.find((item) => args.summary.includes(item.name)) ?? district.blocks[stableNumber(`${args.actionId}:block`) % district.blocks.length];
  const desiredKinds: StrategicPointState["kind"][] = args.methodTags.includes("occult") ? ["occult"]
    : args.methodTags.includes("social") ? ["community"]
      : args.methodTags.includes("official") || args.methodTags.includes("document") ? ["authority", "information"]
        : args.methodTags.includes("force") ? ["security"]
          : ["information", "transport", "market"];
  const point = block.strategicPoints.find((item) => args.summary.includes(item.name))
    ?? block.strategicPoints.find((item) => desiredKinds.includes(item.kind))
    ?? block.strategicPoints[stableNumber(`${args.actionId}:point`) % block.strategicPoints.length];
  const gain = (args.outcome === "成功" ? 11 : 6) + Math.min(6, Math.floor(args.capacity / 4));
  const foundationKey: keyof ControlFoundations = point.kind === "authority" ? "official" : point.kind === "market" ? "economic" : point.kind === "community" ? "social" : point.kind === "occult" ? "occult" : "force";
  const districts = map.districts.map((entry) => entry.id !== district.id ? entry : {
    ...entry,
    blocks: entry.blocks.map((candidate) => candidate.id !== block.id ? candidate : {
      ...candidate,
      strategicPoints: candidate.strategicPoints.map((candidatePoint) => candidatePoint.id !== point.id ? candidatePoint : {
        ...candidatePoint,
        influenceByFaction: normalizeInfluence({ ...candidatePoint.influenceByFaction, [map.playerFactionId]: (candidatePoint.influenceByFaction[map.playerFactionId] ?? 0) + gain }),
        foundations: { ...candidatePoint.foundations, [foundationKey]: clamp(candidatePoint.foundations[foundationKey] + Math.ceil(gain / 3)) },
      }),
    }),
  });
  return { map: recalculateBacklundControl({ ...map, districts }, args.week), target: { districtName: district.name, blockName: block.name, pointName: point.name, gain } };
}

export function advanceOrganizationManagementWeek(
  state: OrganizationManagementState,
  args: {
    week: number;
    legacyMoney: number;
    actionSummaries: string[];
    actions?: { actionId: string; districtId: string; outcome: "成功" | "部分成功" | "受阻"; summary: string; methodTags: string[] }[];
    governanceMembers?: GovernanceMemberProfile[];
    scheduledMemberIds?: string[];
    strategicCompetition?: boolean;
    knownPathwayIds?: string[];
  },
): { state: OrganizationManagementState; events: string[] } {
  let map = state.map;
  let formulas = state.formulas;
  let sealedArtifacts = state.sealedArtifacts;
  const events: string[] = [];
  const actionText = args.actionSummaries.join(" ");
  const preControlledPoints = state.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints)).filter((point) => point.controllerId === state.map.playerFactionId);
  const networkDistricts = state.map.districts.filter((district) => district.control >= 20).length;
  const networkBlocks = state.map.districts.flatMap((district) => district.blocks).filter((block) => block.control >= 35).length;
  const controlNetworkBonus = Math.min(12, networkDistricts * 2 + Math.floor(networkBlocks / 2));
  const exposurePenalty = Math.floor(state.exposure / 12);
  const governanceReport: GovernanceReport = {
    week: args.week,
    offices: deriveGovernanceContributions(state, args.governanceMembers ?? [], args.scheduledMemberIds ?? []),
  };
  const officeScore = (officeId: GovernanceOfficeId) => governanceReport.offices.find((office) => office.officeId === officeId)?.effective ?? 0;
  const intelligenceGovernance = officeScore("intelligence");
  const operationsGovernance = officeScore("operations");
  const internalGovernance = officeScore("internal-affairs");
  const beyonderDevelopment = (state.beyonderDevelopment ?? []).map((record) => {
    if (record.lastUpdateWeek >= args.week) return record;
    const supervision = clamp(28 + internalGovernance * 4 - Math.floor(record.instability / 5));
    const digestionGain = Math.max(5, 10 + Math.floor(internalGovernance / 4) - Math.floor(record.sequence / 3));
    const digestion = clamp(record.digestion + digestionGain);
    const instability = clamp(record.instability + (supervision >= 60 ? -3 : supervision >= 40 ? 1 : 5));
    const status: BeyonderDevelopmentStatus = instability >= 60 ? "unstable" : digestion >= 100 ? "ready" : record.status === "adapting" && digestion < 25 ? "adapting" : "digesting";
    return {
      ...record,
      digestion,
      instability,
      supervision,
      status,
      lastUpdateWeek: args.week,
      log: [...record.log, `第${args.week}周：消化+${digestionGain}，监护${supervision}，失控风险${instability}。`].slice(-20),
    };
  });
  const newlyReady = beyonderDevelopment.filter((record) => record.status === "ready" && state.beyonderDevelopment?.find((item) => item.memberId === record.memberId)?.status !== "ready");
  const newlyUnstable = beyonderDevelopment.filter((record) => record.status === "unstable" && state.beyonderDevelopment?.find((item) => item.memberId === record.memberId)?.status !== "unstable");
  if (newlyReady.length) events.push(`${newlyReady.length}名受监护成员已完成当前魔药消化，可以由玩家决定是否筹备下一序列。`);
  if (newlyUnstable.length) events.push(`${newlyUnstable.length}名成员的失控风险越过监护线；晋升已冻结，需要加强内务、休养或安排专门处置。`);

  for (const action of args.actions ?? []) {
    const applied = applyPlayerControlAction(map, { ...action, capacity: Math.max(0, state.manpowerAllocation.intelligence + state.manpowerAllocation.security + Math.floor(intelligenceGovernance / 3) + controlNetworkBonus - exposurePenalty), week: args.week });
    map = applied.map;
    if (applied.target) events.push(`${applied.target.districtName}·${applied.target.blockName}的部署落在${applied.target.pointName}，我方影响获得约 ${applied.target.gain} 点行动推动；最终控制仍取决于多方占比。`);
  }

  const newEvidence: ExposureEvidence[] = [];
  if (/潜入|偷窃|绑架|暗杀|纵火|袭击|伪造/.test(actionText)) {
    newEvidence.push({ id: `exposure-record-${args.week}`, kind: "record", summary: "高风险行动留下了可被追查的人员与记录痕迹。", severity: 8, locationId: "backlund", detectableByFactionIds: ["police", "night-church", "press"], createdWeek: args.week, expiresWeek: args.week + 5 });
  }
  if (/仪式|占卜|灵视|非凡|魔药|封印物/.test(actionText)) {
    newEvidence.push({ id: `exposure-occult-${args.week}`, kind: "occult-residue", summary: "本周非凡行动留下了尚未清理的灵性残留。", severity: 6, locationId: "backlund", detectableByFactionIds: ["night-church", "steam-church", "aurora-order", "witch-sect"], createdWeek: args.week, expiresWeek: args.week + 3 });
  }

  const completedCandidates = state.screeningProjects
    .filter((project) => project.status === "active" && project.dueWeek <= args.week)
    .flatMap((project) => candidatesForProject(project, args.week, state.reputation.score >= 55 ? 2 : state.reputation.score >= 30 ? 1 : 0));
  const screeningProjects = state.screeningProjects.map((project) => project.status === "active" && project.dueWeek <= args.week
    ? { ...project, status: "completed" as const, candidateIds: completedCandidates.filter((candidate) => candidate.id.startsWith(`${project.id}-`)).map((candidate) => candidate.id) }
    : project);
  if (completedCandidates.length) events.push(`内务部门完成候选人筛选，提交了 ${completedCandidates.length} 份具名档案；是否提拔仍由玩家决定。`);

  const mostHostile = state.factionHostility.slice().sort((left, right) => right.hostility - left.hostility)[0];
  const counterFactionId = mostHostile?.factionId ?? "aurora-order";
  const currentHostilityTier = hostilityTier(mostHostile?.hostility ?? 0);
  const tierPressure = currentHostilityTier === "eradication" ? 9 : currentHostilityTier === "striking" ? 5 : currentHostilityTier === "obstructing" ? 2 : 0;
  const counterPressure = Math.max(1, 3 + Math.floor((mostHostile?.hostility ?? 20) / 12) + tierPressure - Math.floor(operationsGovernance / 8));
  let branches = state.branches.map((existingBranch) => {
    if (existingBranch.status === "evacuating" && (existingBranch.lastStatusChangeWeek ?? 0) < args.week) {
      events.push(`${existingBranch.name}完成撤离，主管与驻扎人力不再被该分部占用；当地情报网和持续产出同时中断。`);
      return { ...existingBranch, status: "lost" as const, lastStatusChangeWeek: args.week };
    }
    const branch = existingBranch.status === "forming" ? { ...existingBranch, status: "active" as const, lastStatusChangeWeek: args.week } : existingBranch;
    if (existingBranch.status === "forming") events.push(`${existingBranch.name}完成初步驻扎，开始自主提供资源与区域情报。`);
    if (branch.status !== "active" && branch.status !== "threatened") return branch;
    const district = map.districts.find((item) => item.id === branch.districtId);
    const block = district?.blocks.find((item) => item.id === branch.blockId);
    const point = block?.strategicPoints[stableNumber(`${branch.id}:${args.week}`) % (block?.strategicPoints.length || 1)];
    if (point) {
      if (branch.policy === "stabilize-control") {
        const support = applyPlayerControlAction(map, { actionId: `branch-support-${branch.id}-${args.week}`, districtId: district!.id, outcome: "部分成功", summary: `${block!.name} ${point.name}`, methodTags: [], capacity: branch.controlSupport, week: args.week });
        map = support.map;
        events.push(`${branch.name}将本周资源用于巩固${point.name}，在其他势力反击前先维持当地控制基础。`);
      }
      if (branch.policy === "intelligence") {
        const reportId = `branch-intel-${branch.id}-${args.week}`;
        map = attachIntelligenceToBacklundMap(map, [{ id: reportId, districtId: district!.id, text: `${block!.name} ${point.name} 分部例行情报` }]);
        events.push(`${branch.name}送回一份定位到${block!.name}·${point.name}的持续情报，已经标记在地图上。`);
      }
      const pressure = counterPressure + stableNumber(`${args.week}:${branch.id}:counter`) % 6;
      if (!args.strategicCompetition) {
        map = applyFactionCounteraction(map, { districtId: district!.id, blockId: block!.id, pointId: point.id, factionId: counterFactionId, pressure, week: args.week });
        events.push(`${branch.name}所在的${block!.name}遭到${counterFactionId}势力反制（${mostHostile?.responseStyle ?? "隐秘施压"}），我方在${point.name}的影响正在波动。`);
      }
    }
    return branch;
  });

  if (!branches.length && !args.strategicCompetition) {
    const district = map.districts[stableNumber(`district:${args.week}`) % map.districts.length];
    const block = district.blocks[stableNumber(`block:${args.week}`) % district.blocks.length];
    const point = block.strategicPoints[stableNumber(`point:${args.week}`) % block.strategicPoints.length];
    map = applyFactionCounteraction(map, { districtId: district.id, blockId: block.id, pointId: point.id, factionId: counterFactionId, pressure: counterPressure + args.week % 4, week: args.week });
    events.push(`${district.name}的${point.name}出现新的势力活动；未建立分部也不会令城市停止博弈。`);
  }

  const unsupportedControlled = preControlledPoints.filter((point) => !state.branches.some((branch) => branch.status !== "lost" && branch.blockId && state.map.districts.some((district) => district.blocks.some((block) => block.id === branch.blockId && block.strategicPoints.some((item) => item.id === point.id)))));
  if (unsupportedControlled.length && !args.strategicCompetition) {
    const target = unsupportedControlled[stableNumber(`unsupported-control:${args.week}`) % unsupportedControlled.length];
    const location = map.districts.flatMap((district) => district.blocks.map((block) => ({ district, block }))).find(({ block }) => block.strategicPoints.some((point) => point.id === target.id));
    if (location) {
      map = applyFactionCounteraction(map, { districtId: location.district.id, blockId: location.block.id, pointId: target.id, factionId: counterFactionId, pressure: Math.max(2, counterPressure - 2), week: args.week });
      events.push(`${location.district.name}·${target.name}缺少分部支撑，既有控制受到${counterFactionId}势力持续蚕食。`);
    }
  }

  const branchYield = branches.filter((branch) => branch.status === "active" || branch.status === "threatened").reduce((total, branch) => {
    const rate = branch.status === "active" ? 1 : .5;
    if (branch.policy === "money") total.money += Math.floor(12 * rate);
    else if (branch.policy === "manpower") total.manpower += branch.status === "active" ? 1 : 0;
    else if (branch.policy === "extraordinaryMaterials") total.extraordinaryMaterials += branch.status === "active" ? 1 : 0;
    return total;
  }, { money: 0, manpower: 0, extraordinaryMaterials: 0 });

  const activeResearchBranches = branches.filter((branch) => branch.status === "active" && (branch.policy === "intelligence" || branch.policy === "extraordinaryMaterials"));
  const pathwayIds = [...new Set((args.knownPathwayIds ?? []).filter(Boolean))];
  if (activeResearchBranches.length && pathwayIds.length && args.week % 3 === 0) {
    const pathwayId = pathwayIds[stableNumber(`formula-lead:${args.week}`) % pathwayIds.length];
    const formulaId = `formula-lead:${pathwayId}:9`;
    if (!formulas.some((formula) => formula.id === formulaId || (formula.pathwayId === pathwayId && formula.sequence === 9))) {
      formulas = [...formulas, {
        id: formulaId,
        pathwayId,
        sequence: 9,
        name: `${pathwayId}途径序列9配方调查档案`,
        status: "lead",
        reliability: 12,
        researchProgress: 12,
        duplicateCopies: 0,
        sourceRefs: activeResearchBranches.map((branch) => `branch:${branch.id}:week:${args.week}`),
        loreEvidenceIds: [],
      }];
      events.push(`${activeResearchBranches[0].name}送回一份序列9配方调查档案；它只是线索，必须补齐知识库证据并投入材料核验后才能用于提拔。`);
    }
  }

  const controlledPoints = map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints)).filter((point) => point.controllerId === map.playerFactionId);
  const controlYield = controlledPoints.reduce((total, point) => {
    total.money += point.weeklyYield.money ?? 0;
    total.manpower += point.weeklyYield.manpower ?? 0;
    total.extraordinaryMaterials += point.weeklyYield.extraordinaryMaterials ?? 0;
    total.intelligence += point.weeklyYield.intelligence ?? 0;
    return total;
  }, { money: 0, manpower: 0, extraordinaryMaterials: 0, intelligence: 0 });

  const passiveResearch = activeResearchBranches.length * 5 + Math.floor(controlYield.intelligence / 2) + Math.floor(intelligenceGovernance / 5);
  if (passiveResearch > 0) {
    const target = formulas.find((formula) => formula.status !== "verified");
    if (target) {
      const progress = Math.min(target.loreEvidenceIds.length ? 100 : 99, (target.researchProgress ?? target.reliability) + passiveResearch);
      const verified = progress >= 100 && target.loreEvidenceIds.length > 0;
      formulas = formulas.map((formula) => formula.id !== target.id ? formula : {
        ...formula,
        researchProgress: progress,
        reliability: verified ? 100 : Math.min(95, Math.max(formula.reliability, Math.floor(progress * .9))),
        status: verified ? "verified" as const : progress >= 70 ? "verifying" as const : progress >= 35 ? "fragment" as const : "lead" as const,
      });
      events.push(`分部与地图情报为“${target.name}”增加 ${passiveResearch} 点核验进度${target.loreEvidenceIds.length ? "" : "；缺少知识库证据，进度最多停在99"}。`);
    }
  }

  const maintainedArtifacts = sealedArtifacts.filter((artifact) => artifact.status === "contained" || artifact.status === "assigned");
  const artifactMoneyCost = maintainedArtifacts.reduce((sum, artifact) => sum + (artifact.weeklyMoneyCost ?? artifact.containmentCost), 0);
  const artifactMaterialCost = maintainedArtifacts.reduce((sum, artifact) => sum + (artifact.weeklyMaterialCost ?? 0), 0);
  const artifactsFunded = args.legacyMoney + branchYield.money + controlYield.money >= artifactMoneyCost
    && state.resources.extraordinaryMaterials + branchYield.extraordinaryMaterials + controlYield.extraordinaryMaterials >= artifactMaterialCost;
  const artifactYield = artifactsFunded ? maintainedArtifacts.reduce((total, artifact) => {
    total.money += artifact.benefit?.money ?? 0;
    total.manpower += artifact.benefit?.manpower ?? 0;
    total.extraordinaryMaterials += artifact.benefit?.extraordinaryMaterials ?? 0;
    total.intelligence += artifact.benefit?.intelligence ?? 0;
    return total;
  }, { money: 0, manpower: 0, extraordinaryMaterials: 0, intelligence: 0 }) : { money: 0, manpower: 0, extraordinaryMaterials: 0, intelligence: 0 };
  if (!artifactsFunded && maintainedArtifacts.length) {
    sealedArtifacts = sealedArtifacts.map((artifact) => maintainedArtifacts.some((item) => item.id === artifact.id) ? { ...artifact, status: "unstable" as const, risk: clamp((artifact.risk ?? 35) + 15) } : artifact);
    events.push(`封印物维持费用不足，${maintainedArtifacts.length}件已收容资产转为不稳定状态；其收益暂停并提高事故风险。`);
  } else if (maintainedArtifacts.length) {
    events.push(`${maintainedArtifacts.length}件封印物完成本周收容，消耗 £${artifactMoneyCost} 与材料 ${artifactMaterialCost}，提供的组织效益已经结算。`);
  }

  const exposureEvidence = [...state.exposureEvidence, ...newEvidence].slice(-80);
  const exposure = deriveExposure(exposureEvidence, args.week);
  const factionHostility = state.factionHostility.map((relation) => {
    const detectableEvidence = newEvidence.filter((evidence) => evidence.detectableByFactionIds.includes(relation.factionId));
    const evidenceLeverage = Math.ceil(detectableEvidence.reduce((sum, evidence) => sum + evidence.severity, 0) / 8);
    return deriveFactionHostility({
      ...relation,
      grievance: clamp(relation.grievance + (detectableEvidence.length ? detectableEvidence.length * 2 : -1)),
      perceivedThreat: clamp(relation.perceivedThreat + Math.ceil(exposure / 25) + Math.floor(state.reputation.score / 30) + Math.floor(preControlledPoints.length / 4)),
      leverageAgainstPlayer: clamp(relation.leverageAgainstPlayer + evidenceLeverage),
      lastCauseRefs: [...relation.lastCauseRefs, ...detectableEvidence.map((evidence) => evidence.id)].slice(-20),
    });
  });

  const reputationScore = Math.round(clamp(
    state.reputation.score
    + controlledPoints.length
    + branches.filter((branch) => branch.status === "active").length * 2
    + state.candidates.filter((candidate) => candidate.status === "promoted").length
    - Math.floor(exposure / 35),
  ));
  const reputation: ReputationState = {
    ...state.reputation,
    score: reputationScore,
    tier: reputationTier(reputationScore),
    propagationRefs: [...state.reputation.propagationRefs, ...controlledPoints.slice(0, 3).map((point) => `control:${point.id}:week:${args.week}`)].slice(-40),
  };
  const reputationIncome = reputation.tier === "legendary" ? 20 : reputation.tier === "renowned" ? 12 : reputation.tier === "recognized" ? 6 : reputation.tier === "local-name" ? 2 : 0;
  const governanceMoney = Math.floor(officeScore("resources") / 2);
  const governanceMaterials = officeScore("resources") >= 18 ? 1 : 0;
  const governanceReputation = Math.floor(officeScore("internal-affairs") / 10);
  const exposureCost = exposure >= 60 ? 24 : exposure >= 35 ? 12 : exposure >= 18 ? 5 : 0;
  if (controlledPoints.length) events.push(`组织掌握 ${controlledPoints.length} 个战略点，本周获得 £${controlYield.money}、人力 ${controlYield.manpower}、非凡材料 ${controlYield.extraordinaryMaterials}，并收拢 ${controlYield.intelligence} 条区域情报。`);
  if (reputationIncome) events.push(`声望达到 ${reputation.tier}，公开与半公开关系网带来 £${reputationIncome}；更高声望也会提高敌对势力对组织威胁的判断。`);
  if (exposureCost) events.push(`暴露度 ${exposure} 触发审查、清理痕迹与更换掩护身份，本周额外支出 £${exposureCost}。`);
  if ((mostHostile?.hostility ?? 0) >= 55) events.push(`${counterFactionId}敌意达到 ${mostHostile.hostility}，其反击方式已从观察升级为“${mostHostile.responseStyle}”。`);
  if (governanceReport.offices.length) events.push(`四项治理本周实际贡献：${governanceReport.offices.map((office) => `${state.offices.find((item) => item.id === office.officeId)?.name}${office.effective}${office.availability === "away" ? "（外出）" : ""}`).join("、")}。`);

  branches = branches.map((branch) => {
    const block = map.districts.find((district) => district.id === branch.districtId)?.blocks.find((item) => item.id === branch.blockId);
    if (!block || branch.status === "lost" || branch.status === "evacuating") return branch;
    const controlWarnings = branch.warningRefs.filter((ref) => ref.startsWith(`control:${block.id}:`)).length;
    if (block.control < 10 && branch.status === "threatened" && controlWarnings >= 2) {
      events.push(`${branch.name}在连续失去当地控制后被迫断联，分部资产与情报网均告损失。`);
      return { ...branch, status: "lost" as const, lastStatusChangeWeek: args.week, warningRefs: [...branch.warningRefs, `lost:week:${args.week}`].slice(-12) };
    }
    if (block.control < 25) return { ...branch, status: "threatened" as const, lastStatusChangeWeek: branch.status === "threatened" ? branch.lastStatusChangeWeek : args.week, warningRefs: [...branch.warningRefs, `control:${block.id}:${block.control}:week:${args.week}`].slice(-12) };
    return branch.status === "threatened" && block.control >= 45 ? { ...branch, status: "active" as const, lastStatusChangeWeek: args.week } : branch;
  });

  if (newEvidence.length) events.push(`本周形成 ${newEvidence.length} 条可追查证据，暴露度由具体证人、记录或灵性残留推导为 ${exposure}。`);
  const recruitmentBonus = state.reputation.score >= 55 ? 2 : state.reputation.score >= 30 ? 1 : 0;
  const consequenceEffects = [
    controlNetworkBonus ? `控制网为区域部署提供 +${controlNetworkBonus} 容量；无分部支撑的战略点会自然遭到蚕食。` : "尚未形成跨区控制网，部署只依赖本周人力与职务贡献。",
    recruitmentBonus ? `声望令每次筛选多出现 ${recruitmentBonus} 名候选人，但同时抬高各势力的威胁判断。` : "声望尚不足以扩大可靠候选池。",
    exposurePenalty ? `暴露造成 -${exposurePenalty} 隐秘部署容量，并触发 £${exposureCost} 审查与掩护成本。` : "当前暴露尚未形成部署惩罚。",
    `最高敌意处于${currentHostilityTier}档，反制基础压力增加 ${tierPressure}。`,
  ];
  return {
    state: {
      ...state,
      resources: {
        manpower: state.resources.manpower + branchYield.manpower + controlYield.manpower + artifactYield.manpower,
        money: args.legacyMoney + branchYield.money + controlYield.money + artifactYield.money + reputationIncome + governanceMoney - exposureCost - (artifactsFunded ? artifactMoneyCost : 0),
        extraordinaryMaterials: state.resources.extraordinaryMaterials + branchYield.extraordinaryMaterials + controlYield.extraordinaryMaterials + artifactYield.extraordinaryMaterials + governanceMaterials - (artifactsFunded ? artifactMaterialCost : 0),
      },
      exposureEvidence,
      exposure,
      factionHostility,
      reputation: { ...reputation, score: clamp(reputation.score + governanceReputation), tier: reputationTier(clamp(reputation.score + governanceReputation)) },
      branches,
      formulas,
      sealedArtifacts,
      candidates: [...state.candidates, ...completedCandidates],
      beyonderDevelopment,
      screeningProjects,
      map,
      lastGovernanceReport: governanceReport,
      lastConsequenceReport: { week: args.week, controlNetworkBonus, recruitmentBonus, exposurePenalty, counteractionTier: currentHostilityTier, effects: consequenceEffects },
    },
    events,
  };
}
