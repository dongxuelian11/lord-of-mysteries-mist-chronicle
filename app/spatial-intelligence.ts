import {
  DISTRICTS,
  type GameState,
  type SpatialConflict,
  type SpatialRouteClaim,
  type SpatialSource,
} from "./game-model.ts";
import { projectWorldForAudience } from "./world-kernel.ts";

export type DistrictEdge = {
  id: string;
  from: string;
  to: string;
  minutes: [number, number];
  modes: ("步行" | "公共马车" | "有轨车" | "货运" | "水路")[];
};

export const DISTRICT_EDGES: DistrictEdge[] = [
  { id: "north-west", from: "north", to: "west", minutes: [18, 32], modes: ["公共马车", "有轨车"] },
  { id: "north-empress", from: "north", to: "empress", minutes: [15, 28], modes: ["公共马车"] },
  { id: "west-hillston", from: "west", to: "hillston", minutes: [12, 24], modes: ["步行", "公共马车"] },
  { id: "empress-hillston", from: "empress", to: "hillston", minutes: [14, 26], modes: ["公共马车"] },
  { id: "west-cherwood", from: "west", to: "cherwood", minutes: [16, 29], modes: ["步行", "公共马车"] },
  { id: "hillston-cherwood", from: "hillston", to: "cherwood", minutes: [15, 27], modes: ["公共马车", "有轨车"] },
  { id: "hillston-government", from: "hillston", to: "government", minutes: [12, 22], modes: ["公共马车"] },
  { id: "cherwood-government", from: "cherwood", to: "government", minutes: [18, 34], modes: ["公共马车", "有轨车"] },
  { id: "cherwood-east", from: "cherwood", to: "east", minutes: [28, 52], modes: ["有轨车", "公共马车"] },
  { id: "government-east", from: "government", to: "east", minutes: [24, 46], modes: ["有轨车"] },
  { id: "cherwood-bridge", from: "cherwood", to: "bridge", minutes: [19, 37], modes: ["有轨车", "公共马车"] },
  { id: "east-bridge", from: "east", to: "bridge", minutes: [16, 31], modes: ["步行", "有轨车"] },
  { id: "bridge-south", from: "bridge", to: "south", minutes: [17, 34], modes: ["有轨车", "公共马车"] },
  { id: "bridge-dock", from: "bridge", to: "dock", minutes: [29, 55], modes: ["货运", "有轨车", "水路"] },
  { id: "south-dock", from: "south", to: "dock", minutes: [22, 45], modes: ["货运", "水路"] },
];

export const DISTRICT_LOCATIONS: Record<string, { name: string; kind: string }[]> = {
  north: [{ name: "知识与蒸汽博物馆", kind: "公开机构" }, { name: "河畔出版社", kind: "消息网络" }],
  empress: [{ name: "伯爵宅邸群", kind: "受限住宅" }, { name: "仆役后门巷", kind: "人员通道" }],
  west: [{ name: "慈善晚宴会馆", kind: "社交场所" }, { name: "律师事务街", kind: "身份渠道" }],
  hillston: [{ name: "保险契约库", kind: "受控档案" }, { name: "交易所后巷", kind: "灰色渠道" }],
  cherwood: [{ name: "旧剧院街", kind: "公共场所" }, { name: "事务所后巷", kind: "组织锚点" }],
  government: [{ name: "公共工程档案厅", kind: "官方档案" }, { name: "议员俱乐部侧门", kind: "受限社交" }],
  east: [{ name: "临时招工棚", kind: "人口节点" }, { name: "烟囱巷救济点", kind: "基层网络" }],
  bridge: [{ name: "南岸换乘场", kind: "交通节点" }, { name: "拱桥下层通道", kind: "隐蔽路线" }],
  south: [{ name: "夜间义诊站", kind: "救助网络" }, { name: "洗衣工会会所", kind: "社区节点" }],
  dock: [{ name: "检疫泊位", kind: "受控港区" }, { name: "潮痕仓库群", kind: "灰色货运" }],
};

const districtById = new Map(DISTRICTS.map((district) => [district.id, district]));

function mentionedDistricts(text: string) {
  return DISTRICTS.filter((district) => text.includes(district.name) || district.landmarks.some((landmark) => text.includes(landmark))).map((district) => district.id);
}

export function estimateRoute(game: GameState, from: string, to: string) {
  if (from === to) return { districtIds: [from], minutes: [5, 18] as [number, number], modes: ["步行"] as string[] };
  const queue: { id: string; min: number; max: number; path: string[]; modes: string[] }[] = [{ id: from, min: 0, max: 0, path: [from], modes: [] }];
  const seen = new Map<string, number>();
  while (queue.length) {
    queue.sort((a, b) => a.min - b.min);
    const current = queue.shift()!;
    if (current.id === to) {
      const targetRisk = projectWorldForAudience(game.worldKernel, { kind: "player", holderId: "player" })
        .locations.find((location) => location.id === to)?.perceivedRisk ?? districtById.get(to)?.danger ?? 30;
      const pressure = Math.max(0, Math.round((targetRisk - 35) / 10));
      const pathwayFactor = game.pathwayId === "apprentice" && game.currentSequence <= 7 ? .55 : game.pathwayId === "hunter" ? .9 : 1;
      return {
        districtIds: current.path,
        minutes: [Math.max(4, Math.round(current.min * pathwayFactor)), Math.max(8, Math.round((current.max + pressure * 4) * pathwayFactor))] as [number, number],
        modes: [...new Set(current.modes)],
      };
    }
    if ((seen.get(current.id) ?? Infinity) <= current.min) continue;
    seen.set(current.id, current.min);
    for (const edge of DISTRICT_EDGES.filter((item) => item.from === current.id || item.to === current.id)) {
      const next = edge.from === current.id ? edge.to : edge.from;
      queue.push({ id: next, min: current.min + edge.minutes[0], max: current.max + edge.minutes[1], path: [...current.path, next], modes: [...current.modes, ...edge.modes] });
    }
  }
  return { districtIds: [from, to], minutes: [60, 120] as [number, number], modes: ["路线未核验"] };
}

function reliabilityForSignal(value: string): SpatialSource["reliability"] {
  if (/公开事实|确认|已确认/.test(value)) return "确认";
  if (/多源|可信/.test(value)) return "高";
  if (/异常感知|推断/.test(value)) return "中";
  return "低";
}

export function buildSpatialIntelligence(game: GameState, playbackWeek = game.week) {
  const sources: SpatialSource[] = [];
  const routes: SpatialRouteClaim[] = [];
  const visibleThrough = Math.min(playbackWeek, game.week);
  const playerWorldView = projectWorldForAudience(game.worldKernel, { kind: "player", holderId: "player" });
  const addRoute = (route: Omit<SpatialRouteClaim, "conflictIds">) => routes.push({ ...route, conflictIds: [] });

  for (const observation of playerWorldView.observations) {
    if (observation.week > visibleThrough) continue;
    const event = playerWorldView.events.find((item) => item.id === observation.eventId);
    const ids = mentionedDistricts(observation.text);
    if (event?.locationId && !ids.includes(event.locationId)) ids.push(event.locationId);
    const sourceId = `observation:${observation.id}`;
    sources.push({ id: sourceId, label: observation.channel, kind: observation.channel === "神秘征兆" ? "非凡感知" : "现场观察", week: observation.week, reliability: "中" });
    if (ids.length >= 2) {
      const estimate = estimateRoute(game, ids[0], ids[1]);
      addRoute({ id: `route:${observation.id}`, fromDistrictId: ids[0], toDistrictId: ids[1], subject: event?.title ?? observation.channel, purpose: observation.text, earliestMinutes: estimate.minutes[0], latestMinutes: estimate.minutes[1], week: observation.week, moment: 2, status: "较可信", sourceIds: [sourceId], visibility: "player" });
    }
  }

  for (const signal of game.worldSignals ?? []) {
    if (signal.week > visibleThrough) continue;
    const ids = mentionedDistricts(`${signal.headline}${signal.body}`);
    if (signal.districtId && !ids.includes(signal.districtId)) ids.push(signal.districtId);
    const sourceId = `signal:${signal.id}`;
    sources.push({ id: sourceId, label: `${signal.channel} · ${signal.headline}`, kind: signal.channel === "报纸" ? "报纸" : signal.channel === "官方通告" ? "官方记录" : signal.channel === "街谈" ? "街谈" : signal.channel === "神秘征兆" ? "非凡感知" : "现场观察", week: signal.week, reliability: reliabilityForSignal(signal.reliability) });
    if (ids.length >= 2) {
      const estimate = estimateRoute(game, ids[0], ids[1]);
      addRoute({ id: `route:${signal.id}`, fromDistrictId: ids[0], toDistrictId: ids[1], subject: signal.headline, purpose: signal.body, earliestMinutes: estimate.minutes[0], latestMinutes: estimate.minutes[1], week: signal.week, moment: 1, status: reliabilityForSignal(signal.reliability) === "确认" ? "已确认" : "较可信", sourceIds: [sourceId], visibility: "player" });
    }
  }

  for (const action of game.schedule) {
    if (action.status !== "planned" || game.week > visibleThrough) continue;
    const estimate = estimateRoute(game, game.organizationProfile.headquartersDistrictId, action.districtId);
    const sourceId = `order:${action.id}`;
    sources.push({ id: sourceId, label: `第${game.week}周决议 · ${action.title}`, kind: "组织命令", week: game.week, reliability: "确认" });
    addRoute({ id: `route:order:${action.id}`, fromDistrictId: game.organizationProfile.headquartersDistrictId, toDistrictId: action.districtId, subject: action.title, purpose: action.desiredOutcome || action.rawIntent, earliestMinutes: estimate.minutes[0], latestMinutes: estimate.minutes[1], week: game.week, moment: Math.max(1, action.startDay), status: "已确认", sourceIds: [sourceId], visibility: "player" });
  }

  for (const hypothesis of game.routeHypotheses ?? []) {
    if (hypothesis.createdWeek > visibleThrough || hypothesis.status === "已证伪") continue;
    const estimate = estimateRoute(game, hypothesis.fromDistrictId, hypothesis.toDistrictId);
    const sourceId = `hypothesis:${hypothesis.id}`;
    sources.push({ id: sourceId, label: "玩家在议桌上的空间假设", kind: "组织命令", week: hypothesis.createdWeek, reliability: "低" });
    addRoute({ id: `route:hypothesis:${hypothesis.id}`, fromDistrictId: hypothesis.fromDistrictId, toDistrictId: hypothesis.toDistrictId, subject: "玩家假设", purpose: hypothesis.statement, earliestMinutes: estimate.minutes[0], latestMinutes: estimate.minutes[1], week: hypothesis.createdWeek, moment: 0, status: "玩家假设", sourceIds: [sourceId], visibility: "player" });
  }

  const conflicts: SpatialConflict[] = [];
  const grouped = new Map<string, SpatialRouteClaim[]>();
  for (const route of routes.filter((item) => item.status !== "玩家假设")) {
    const key = [route.fromDistrictId, route.toDistrictId].sort().join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), route]);
  }
  for (const [key, claims] of grouped) {
    if (claims.length < 2) continue;
    const purposes = new Set(claims.map((claim) => claim.purpose.slice(0, 28)));
    const timeSpread = Math.max(...claims.map((claim) => claim.latestMinutes)) - Math.min(...claims.map((claim) => claim.earliestMinutes));
    if (purposes.size < 2 && timeSpread < 25) continue;
    const conflict: SpatialConflict = { id: `conflict:${key}:${visibleThrough}`, title: `${districtById.get(claims[0].fromDistrictId)?.name}—${districtById.get(claims[0].toDistrictId)?.name}来源不一致`, routeIds: claims.map((claim) => claim.id), sourceIds: claims.flatMap((claim) => claim.sourceIds), question: "移动目的、经过时间或观察对象无法由现有来源同时成立，需要新的核验。", status: "未解决", week: Math.max(...claims.map((claim) => claim.week)) };
    conflicts.push(conflict);
    for (const claim of claims) { claim.status = "有冲突"; claim.conflictIds.push(conflict.id); }
  }

  return {
    routes: routes.sort((a, b) => b.week - a.week || b.moment - a.moment),
    sources: [...new Map(sources.map((source) => [source.id, source])).values()],
    conflicts: conflicts.sort((a, b) => b.week - a.week),
  };
}

export function mapHistoryWeeks(game: GameState) {
  const weeks = new Set<number>([1, game.week]);
  game.worldSnapshots?.forEach((snapshot) => weeks.add(snapshot.week));
  game.worldSignals?.forEach((signal) => weeks.add(signal.week));
  game.worldKernel?.observations.forEach((observation) => weeks.add(observation.week));
  game.chronicle.forEach((chapter) => weeks.add(chapter.week));
  return [...weeks].filter((week) => week <= game.week).sort((a, b) => a - b);
}
