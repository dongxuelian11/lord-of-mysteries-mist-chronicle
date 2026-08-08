import {
  BACKLUND_FACTION_CATALOG,
  deriveFactionHostility,
  recalculateBacklundControl,
  type BacklundMapState,
  type FactionHostilityState,
  type OrganizationManagementState,
  type StrategicPointState,
} from "./organization-management.ts";
import type { WorldKernel } from "./world-kernel.ts";

export type FactionStrategyAction = "expand" | "contest" | "fortify" | "sabotage";
export type FactionOrderStatus = "accepted" | "limited" | "rejected";

export type FactionStrategicProfile = {
  factionId: string;
  doctrine: "official" | "commercial" | "occult" | "adaptive";
  objective: string;
  resourcePool: number;
  intelligence: number;
  riskTolerance: number;
  lastOrderId?: string;
  updatedWeek: number;
};

export type FactionStrategicOrder = {
  id: string;
  week: number;
  factionId: string;
  action: FactionStrategyAction;
  districtId: string;
  blockId: string;
  pointId: string;
  strength: number;
  resourceCost: number;
  rationale: string;
};

export type FactionOrderReview = {
  orderId: string;
  status: FactionOrderStatus;
  reasons: string[];
  approvedStrength: number;
};

export type FactionOrderOutcome = {
  orderId: string;
  factionId: string;
  pointId: string;
  action: FactionStrategyAction;
  status: FactionOrderStatus;
  influenceBefore: number;
  influenceAfter: number;
  playerInfluenceBefore: number;
  playerInfluenceAfter: number;
  competingOrderIds: string[];
  detection: "trace" | "identified" | "confirmed";
};

export type FactionDiplomacyEdge = {
  id: string;
  sourceFactionId: string;
  targetFactionId: string;
  stance: "neutral" | "watching" | "competitive" | "hostile";
  pressure: number;
  lastChangeWeek: number;
  causeOrderIds: string[];
};

export type FactionStrategyRound = {
  week: number;
  orderIds: string[];
  contestedPointIds: string[];
  summary: string;
};

export type FactionStrategyState = {
  version: 2;
  profiles: FactionStrategicProfile[];
  diplomacy: FactionDiplomacyEdge[];
  orders: FactionStrategicOrder[];
  reviews: FactionOrderReview[];
  outcomes: FactionOrderOutcome[];
  rounds: FactionStrategyRound[];
  lastResolvedWeek: number;
};

export type FactionStrategyResolution = {
  state: FactionStrategyState;
  map: BacklundMapState;
  orders: FactionStrategicOrder[];
  reviews: FactionOrderReview[];
  outcomes: FactionOrderOutcome[];
  hostilities: FactionHostilityState[];
  signals: Array<{ id: string; factionId?: string; districtId: string; blockId: string; pointId: string; visibility: "trace" | "identified" | "confirmed"; summary: string }>;
};

export type PlayerVisibleFactionInfluence = {
  key: string;
  factionId?: string;
  influence: number;
  known: boolean;
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, Math.round(value)));

function stableNumber(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function normalizeInfluence(influence: Record<string, number>) {
  const entries = Object.entries(influence).map(([id, value]) => [id, Math.max(0, value)] as const);
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  let assigned = 0;
  return Object.fromEntries(entries.map(([id, value], index) => {
    const normalized = index === entries.length - 1 ? 100 - assigned : Math.round(value / total * 100);
    assigned += normalized;
    return [id, Math.max(0, normalized)];
  }));
}

function doctrineFor(factionId: string): FactionStrategicProfile["doctrine"] {
  if (["night-church", "steam-church", "royal-project", "police"].includes(factionId)) return "official";
  if (["press", "black-market"].includes(factionId)) return "commercial";
  if (["witch-sect", "aurora-order"].includes(factionId)) return "occult";
  return "adaptive";
}

function objectiveFor(factionId: string, worldKernel: WorldKernel) {
  const defaults: Record<string, string> = {
    "night-church": "维持黑夜教会在首都的神秘秩序与收容权",
    "steam-church": "控制工业事故、机械设施与技术性非凡威胁",
    "royal-project": "掩护王室特别工程所需的人口、物资和行政通道",
    "witch-sect": "隐蔽渗透上层社交网络并保护灾祸仪式链",
    "aurora-order": "争夺被忽视者、地下聚会和污染性神秘节点",
    police: "维持公开治安并限制未登记组织扩张",
    press: "控制可出售的消息、舆论窗口和消息来源",
    "black-market": "垄断配方、材料与危险物品的隐秘流通",
  };
  return worldKernel.factions.find((faction) => faction.id === factionId)?.posture
    ?? defaults[factionId]
    ?? "扩大在贝克兰德的持续影响";
}

function mapFactionIds(map: BacklundMapState) {
  return [...new Set(map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints.flatMap((point) => Object.keys(point.influenceByFaction)))))]
    .filter((id) => id !== map.playerFactionId);
}

export function createFactionStrategyState(management: OrganizationManagementState, worldKernel: WorldKernel): FactionStrategyState {
  const pointCount = management.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints)).length || 1;
  const profiles = mapFactionIds(management.map).map((factionId) => {
    const totalInfluence = management.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints)).reduce((sum, point) => sum + (point.influenceByFaction[factionId] ?? 0), 0);
    const worldFaction = worldKernel.factions.find((faction) => faction.id === factionId);
    return {
      factionId,
      doctrine: doctrineFor(factionId),
      objective: objectiveFor(factionId, worldKernel),
      resourcePool: clamp(worldFaction?.resources ?? 55),
      intelligence: clamp(totalInfluence / pointCount + (worldFaction?.suspicion ?? 0) / 3),
      riskTolerance: clamp(35 + stableNumber(factionId) % 46),
      updatedWeek: management.map.lastRecalculatedWeek,
    };
  });
  return { version: 2, profiles, diplomacy: [], orders: [], reviews: [], outcomes: [], rounds: [], lastResolvedWeek: 0 };
}

export function ensureFactionStrategyState(state: FactionStrategyState | undefined, management: OrganizationManagementState, worldKernel: WorldKernel) {
  const current = state && Array.isArray(state.profiles) ? { ...state, version: 2 as const } : createFactionStrategyState(management, worldKernel);
  const profileById = new Map(current.profiles.map((profile) => [profile.factionId, profile]));
  for (const seeded of createFactionStrategyState(management, worldKernel).profiles) if (!profileById.has(seeded.factionId)) profileById.set(seeded.factionId, seeded);
  const validIds = new Set(mapFactionIds(management.map));
  return {
    ...current,
    profiles: [...profileById.values()].filter((profile) => validIds.has(profile.factionId)),
  };
}

type PointLocation = { districtId: string; blockId: string; point: StrategicPointState };

function allPoints(map: BacklundMapState): PointLocation[] {
  return map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints.map((point) => ({ districtId: district.id, blockId: block.id, point }))));
}

export function projectFactionInfluenceForPlayer(
  point: StrategicPointState,
  state: FactionStrategyState,
  playerFactionId: string,
): PlayerVisibleFactionInfluence[] {
  const knownFactionIds = new Set(
    state.outcomes
      .filter((outcome) => outcome.pointId === point.id && outcome.detection && outcome.detection !== "trace")
      .map((outcome) => outcome.factionId),
  );
  const visible: PlayerVisibleFactionInfluence[] = [];
  let unknownInfluence = 0;
  for (const [factionId, influence] of Object.entries(point.influenceByFaction)) {
    if (factionId === playerFactionId || knownFactionIds.has(factionId)) {
      visible.push({ key: factionId, factionId, influence, known: true });
    } else {
      unknownInfluence += influence;
    }
  }
  if (unknownInfluence > 0) visible.push({ key: "unknown", influence: unknownInfluence, known: false });
  return visible.sort((left, right) => right.influence - left.influence || left.key.localeCompare(right.key));
}

function preferredKinds(doctrine: FactionStrategicProfile["doctrine"]): StrategicPointState["kind"][] {
  if (doctrine === "official") return ["authority", "security", "information"];
  if (doctrine === "commercial") return ["market", "transport", "community"];
  if (doctrine === "occult") return ["occult", "information", "community"];
  return ["information", "transport", "market", "authority", "community", "occult", "security"];
}

function planOrder(profile: FactionStrategicProfile, map: BacklundMapState, hostility: FactionHostilityState | undefined, week: number): FactionStrategicOrder {
  const preferences = preferredKinds(profile.doctrine);
  const points = allPoints(map);
  const target = points.slice().sort((left, right) => {
    const score = (entry: PointLocation) => {
      const playerInfluence = entry.point.influenceByFaction[map.playerFactionId] ?? 0;
      const ownInfluence = entry.point.influenceByFaction[profile.factionId] ?? 0;
      const preference = preferences.includes(entry.point.kind) ? 35 - preferences.indexOf(entry.point.kind) * 5 : 0;
      const playerControl = entry.point.controllerId === map.playerFactionId ? 45 : 0;
      const ownControlPenalty = entry.point.controllerId === profile.factionId ? -25 : 0;
      return playerInfluence * 1.4 + preference + playerControl + entry.point.weight * 8 + ownInfluence * .25 + ownControlPenalty + stableNumber(`${week}:${profile.factionId}:${entry.point.id}`) % 9;
    };
    return score(right) - score(left) || left.point.id.localeCompare(right.point.id);
  })[0];
  const hostilityValue = hostility?.hostility ?? 10;
  const action: FactionStrategyAction = target.point.controllerId === profile.factionId
    ? "fortify"
    : profile.doctrine === "occult" && hostilityValue >= 70
      ? "sabotage"
      : (target.point.influenceByFaction[map.playerFactionId] ?? 0) >= 35 || hostilityValue >= 45
        ? "contest"
        : "expand";
  const requestedStrength = 5 + Math.floor(profile.resourcePool / 15) + Math.floor(hostilityValue / 20) + stableNumber(`${profile.factionId}:${week}:strength`) % 4;
  const strength = clamp(requestedStrength, 4, 20);
  return {
    id: `strategy:${week}:${profile.factionId}:${target.point.id}`,
    week,
    factionId: profile.factionId,
    action,
    districtId: target.districtId,
    blockId: target.blockId,
    pointId: target.point.id,
    strength,
    resourceCost: Math.max(2, Math.ceil(strength / 2)),
    rationale: `${profile.objective}；依据${profile.doctrine}路线选择${target.point.name}`,
  };
}

export function reviewFactionStrategicOrder(order: FactionStrategicOrder, state: FactionStrategyState, map: BacklundMapState): FactionOrderReview {
  const reasons: string[] = [];
  const profile = state.profiles.find((candidate) => candidate.factionId === order.factionId);
  const location = allPoints(map).find((candidate) => candidate.point.id === order.pointId && candidate.districtId === order.districtId && candidate.blockId === order.blockId);
  if (!profile) reasons.push("势力没有持久战略档案");
  if (!location) reasons.push("目标战略点不存在或位置不一致");
  if (order.factionId === map.playerFactionId) reasons.push("玩家组织不能伪装成自治敌对势力");
  if (order.resourceCost > (profile?.resourcePool ?? 0)) reasons.push("行动成本超过势力本周资源池");
  if (order.strength <= 0) reasons.push("行动强度必须大于零");
  const maximum = order.action === "sabotage" ? 14 : 18;
  const approvedStrength = clamp(order.strength, 0, maximum);
  return {
    orderId: order.id,
    status: reasons.length ? "rejected" : approvedStrength < order.strength ? "limited" : "accepted",
    reasons,
    approvedStrength,
  };
}

function relationStance(pressure: number): FactionDiplomacyEdge["stance"] {
  if (pressure >= 70) return "hostile";
  if (pressure >= 40) return "competitive";
  if (pressure >= 15) return "watching";
  return "neutral";
}

function updateDiplomacy(previous: FactionDiplomacyEdge[], orders: FactionStrategicOrder[], reviews: FactionOrderReview[], map: BacklundMapState, week: number, hostilities: FactionHostilityState[]) {
  const byId = new Map(previous.map((edge) => [edge.id, { ...edge, causeOrderIds: [...edge.causeOrderIds] }]));
  for (const relation of hostilities) {
    const id = `${relation.factionId}->${map.playerFactionId}`;
    const existing = byId.get(id);
    byId.set(id, {
      id,
      sourceFactionId: relation.factionId,
      targetFactionId: map.playerFactionId,
      stance: relationStance(relation.hostility),
      pressure: relation.hostility,
      lastChangeWeek: week,
      causeOrderIds: existing?.causeOrderIds ?? [],
    });
  }
  const approved = orders.filter((order) => reviews.find((review) => review.orderId === order.id)?.status !== "rejected");
  for (const order of approved) {
    const affected = [map.playerFactionId, ...approved.filter((other) => other.pointId === order.pointId && other.factionId !== order.factionId).map((other) => other.factionId)];
    for (const targetFactionId of affected) {
      const id = `${order.factionId}->${targetFactionId}`;
      const existing = byId.get(id) ?? { id, sourceFactionId: order.factionId, targetFactionId, stance: "neutral" as const, pressure: 0, lastChangeWeek: week, causeOrderIds: [] };
      const pressure = clamp(existing.pressure + (order.action === "sabotage" ? 12 : order.action === "contest" ? 7 : 3));
      byId.set(id, { ...existing, pressure, stance: relationStance(pressure), lastChangeWeek: week, causeOrderIds: [...new Set([...existing.causeOrderIds, order.id])].slice(-20) });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function detectOrderForPlayer(order: FactionStrategicOrder, map: BacklundMapState, playerIntelligence: number) {
  const location = allPoints(map).find((candidate) => candidate.point.id === order.pointId);
  if (!location) return "trace" as const;
  const point = location.point;
  const localPresence = point.influenceByFaction[map.playerFactionId] ?? 0;
  const localSources = point.intelligenceIds.length * 4 + (point.weeklyYield.intelligence ?? 0) * 6;
  const concealment = order.action === "sabotage" ? 10 : order.action === "fortify" ? 4 : 0;
  const detection = playerIntelligence + localPresence * .35 + localSources - concealment;
  return detection >= 65 ? "confirmed" as const : detection >= 35 ? "identified" as const : "trace" as const;
}

export function resolveFactionStrategyRound(
  state: FactionStrategyState,
  map: BacklundMapState,
  hostilities: FactionHostilityState[],
  worldKernel: WorldKernel,
  week: number,
  playerIntelligence = 0,
): FactionStrategyResolution {
  const current = ensureFactionStrategyState(state, { map } as OrganizationManagementState, worldKernel);
  if (current.lastResolvedWeek >= week) return { state: current, map, orders: [], reviews: [], outcomes: [], hostilities, signals: [] };
  const orders = current.profiles.map((profile) => planOrder(profile, map, hostilities.find((hostility) => hostility.factionId === profile.factionId), week));
  const reviews = orders.map((order) => reviewFactionStrategicOrder(order, current, map));
  const pointOrders = new Map<string, FactionStrategicOrder[]>();
  for (const order of orders) if (reviews.find((review) => review.orderId === order.id)?.status !== "rejected") pointOrders.set(order.pointId, [...(pointOrders.get(order.pointId) ?? []), order]);
  const beforeByPoint = new Map(allPoints(map).map(({ point }) => [point.id, { ...point.influenceByFaction }]));
  const districts = map.districts.map((district) => ({
    ...district,
    blocks: district.blocks.map((block) => ({
      ...block,
      strategicPoints: block.strategicPoints.map((point) => {
        const competing = pointOrders.get(point.id) ?? [];
        if (!competing.length) return point;
        const influence = { ...point.influenceByFaction };
        for (const order of competing.slice().sort((left, right) => left.id.localeCompare(right.id))) {
          const strength = reviews.find((review) => review.orderId === order.id)?.approvedStrength ?? 0;
          if (order.action === "sabotage") {
            influence[map.playerFactionId] = Math.max(0, (influence[map.playerFactionId] ?? 0) - strength * .8);
            influence[order.factionId] = (influence[order.factionId] ?? 0) + strength * .4;
          } else if (order.action === "contest") {
            const rival = Object.entries(influence).filter(([id]) => id !== order.factionId).sort((left, right) => right[1] - left[1])[0]?.[0] ?? map.playerFactionId;
            influence[rival] = Math.max(0, (influence[rival] ?? 0) - strength * .55);
            influence[order.factionId] = (influence[order.factionId] ?? 0) + strength;
          } else {
            influence[order.factionId] = (influence[order.factionId] ?? 0) + strength * (order.action === "fortify" ? 1.15 : 1);
          }
        }
        return { ...point, influenceByFaction: normalizeInfluence(influence) };
      }),
    })),
  }));
  const resolvedMap = recalculateBacklundControl({ ...map, districts }, week);
  const afterByPoint = new Map(allPoints(resolvedMap).map(({ point }) => [point.id, point.influenceByFaction]));
  const outcomes = orders.map((order) => {
    const review = reviews.find((candidate) => candidate.orderId === order.id)!;
    const before = beforeByPoint.get(order.pointId) ?? {};
    const after = afterByPoint.get(order.pointId) ?? before;
    return {
      orderId: order.id,
      factionId: order.factionId,
      pointId: order.pointId,
      action: order.action,
      status: review.status,
      influenceBefore: before[order.factionId] ?? 0,
      influenceAfter: after[order.factionId] ?? 0,
      playerInfluenceBefore: before[map.playerFactionId] ?? 0,
      playerInfluenceAfter: after[map.playerFactionId] ?? 0,
      competingOrderIds: (pointOrders.get(order.pointId) ?? []).filter((candidate) => candidate.id !== order.id).map((candidate) => candidate.id),
      detection: detectOrderForPlayer(order, resolvedMap, playerIntelligence),
    } satisfies FactionOrderOutcome;
  });
  const profiles = current.profiles.map((profile) => {
    const order = orders.find((candidate) => candidate.factionId === profile.factionId)!;
    const review = reviews.find((candidate) => candidate.orderId === order.id)!;
    return { ...profile, resourcePool: clamp(profile.resourcePool - (review.status === "rejected" ? 0 : order.resourceCost) + 3), lastOrderId: order.id, updatedWeek: week };
  });
  const outcomeByFaction = new Map(outcomes.map((outcome) => [outcome.factionId, outcome]));
  const hostilityById = new Map(hostilities.map((relation) => [relation.factionId, relation]));
  const unifiedHostilities = BACKLUND_FACTION_CATALOG.map((faction) => {
    const previous = hostilityById.get(faction.id) ?? deriveFactionHostility({ factionId: faction.id, grievance: 0, interestConflict: 8, ideologyConflict: 8, perceivedThreat: 5, leverageAgainstPlayer: 0, responseStyle: faction.responseStyle, lastCauseRefs: [] });
    const outcome = outcomeByFaction.get(faction.id);
    if (!outcome || outcome.status === "rejected") return previous;
    const attackedPlayer = outcome.action === "sabotage" || (outcome.action === "contest" && outcome.playerInfluenceBefore > 0);
    const playerResistance = Math.max(0, outcome.playerInfluenceBefore - outcome.playerInfluenceAfter);
    return deriveFactionHostility({
      ...previous,
      grievance: clamp(previous.grievance + (attackedPlayer ? 2 : -1)),
      interestConflict: clamp(previous.interestConflict + (outcome.playerInfluenceBefore >= 25 ? 2 : 0)),
      perceivedThreat: clamp(previous.perceivedThreat + (outcome.playerInfluenceBefore >= 35 ? 3 : 0) + (playerResistance <= 0 ? -1 : 0)),
      leverageAgainstPlayer: clamp(previous.leverageAgainstPlayer + (outcome.detection === "trace" ? 2 : -1)),
      lastCauseRefs: [...previous.lastCauseRefs, outcome.orderId].slice(-20),
    });
  });
  const contestedPointIds = [...pointOrders.entries()].filter(([, entries]) => entries.length > 1).map(([pointId]) => pointId);
  const round = { week, orderIds: orders.map((order) => order.id), contestedPointIds, summary: `${orders.length}个势力提交战略行动，${contestedPointIds.length}个战略点发生多方冲突。` };
  const nextState: FactionStrategyState = {
    version: 2,
    profiles,
    diplomacy: updateDiplomacy(current.diplomacy, orders, reviews, map, week, unifiedHostilities),
    orders: [...current.orders, ...orders].slice(-240),
    reviews: [...current.reviews, ...reviews].slice(-240),
    outcomes: [...current.outcomes, ...outcomes].slice(-240),
    rounds: [...current.rounds, round].slice(-80),
    lastResolvedWeek: week,
  };
  const signals = outcomes.filter((outcome) => outcome.status !== "rejected").map((outcome) => {
    const order = orders.find((candidate) => candidate.id === outcome.orderId)!;
    const visibility = outcome.detection;
    return {
      id: `strategy-signal:${week}:${outcome.orderId}`,
      ...(visibility === "trace" ? {} : { factionId: outcome.factionId }),
      districtId: order.districtId,
      blockId: order.blockId,
      pointId: outcome.pointId,
      visibility,
      summary: visibility === "trace" ? `战略点${outcome.pointId}出现新的组织活动痕迹。` : `${outcome.factionId}在${outcome.pointId}采取${outcome.action}行动，影响由${outcome.influenceBefore}变化为${outcome.influenceAfter}。`,
    };
  });
  const signalIdsByPoint = new Map<string, string[]>();
  for (const signal of signals) signalIdsByPoint.set(signal.pointId, [...(signalIdsByPoint.get(signal.pointId) ?? []), signal.id]);
  const observedMap = {
    ...resolvedMap,
    districts: resolvedMap.districts.map((district) => ({
      ...district,
      blocks: district.blocks.map((block) => ({
        ...block,
        strategicPoints: block.strategicPoints.map((point) => ({
          ...point,
          intelligenceIds: [...new Set([...point.intelligenceIds, ...(signalIdsByPoint.get(point.id) ?? [])])].slice(-30),
        })),
      })),
    })),
  };
  return { state: nextState, map: observedMap, orders, reviews, outcomes, hostilities: unifiedHostilities, signals };
}
