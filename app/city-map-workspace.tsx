"use client";

import { useMemo, useState } from "react";
import { Archive, Check, Eye, FileSearch, Layers3, MapPin, MessageSquareText, Newspaper, Pin, Play, Route, Search, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { AbilityContext, DISTRICTS, GameState } from "./game-model";
import { buildSpatialIntelligence, DISTRICT_EDGES, DISTRICT_LOCATIONS, estimateRoute, mapHistoryWeeks } from "./spatial-intelligence";

type MapLayer = "network" | "factions" | "anomalies" | "city" | "risk" | "occult";
type ProjectionKind = "observation" | "signal" | "evidence" | "order";
type MapProjection = {
  id: string;
  districtId: string;
  kind: ProjectionKind;
  title: string;
  detail: string;
  source: string;
  week: number;
  factionName?: string;
  occult?: boolean;
};

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: "network", label: "组织网络" }, { id: "factions", label: "已知势力" }, { id: "anomalies", label: "异常案件" },
  { id: "city", label: "城市运行" }, { id: "risk", label: "风险暴露" }, { id: "occult", label: "神秘空间" },
];

function publicLocationIntel(name: string, type: string) {
  const entrances = /档案|图书馆|博物馆|事务/.test(name) ? "公开柜台、工作人员入口和闭馆后的货运门"
    : /教堂|会馆|俱乐部|沙龙|宅邸|宫殿/.test(name) ? "正门受身份约束，服务人员与固定供应商另有出入口"
      : /工厂|仓库|泊位|货运|煤气/.test(name) ? "人员、货物和夜班交接分别使用不同通道"
        : /市场|酒吧|旅馆|百货|药房/.test(name) ? "营业时段人流足以掩护观察，但熟客网络会记住生面孔"
          : "公开道路可抵达，侧巷与服务门构成第二条离开路线";
  const observable = /档案|图书馆|事务|律师|保险/.test(`${name}${type}`) ? "登记时间、签章、经手人与纸张来源"
    : /交通|马车|栈桥|泊位|货运/.test(`${name}${type}`) ? "车次、停留点、装卸时间与最终去向"
      : /社区|诊所|工会|救济|招工/.test(`${name}${type}`) ? "人员姓名、缺勤、病例与互助关系"
        : /教堂|宅邸|会馆|俱乐部|沙龙/.test(`${name}${type}`) ? "访客时段、供应清单和服务人员证词"
          : "出入频率、灯光、声音与周边营业规律";
  return { entrances, observable };
}

function inferDistrictId(text: string) {
  return DISTRICTS.find((district) => text.includes(district.id) || text.includes(district.name) || district.landmarks.some((landmark) => text.includes(landmark)))?.id;
}

function mentionedDistrictIds(text: string) {
  return DISTRICTS.filter((district) => text.includes(district.name) || district.landmarks.some((landmark) => text.includes(landmark))).map((district) => district.id);
}

function knownMarker(game: GameState, districtId: string, label: string) {
  const evidence = game.evidenceNodes.find((item) => item.discovered && (item.summary.includes(label) || item.label.includes(label)));
  if (evidence) return evidence.certainty;
  return game.discoveredDistrictIds.includes(districtId) ? "已知地点" : "轮廓未明";
}

function projectionMatchesLayer(projection: MapProjection, layer: MapLayer) {
  if (layer === "network") return projection.kind === "order" || projection.kind === "evidence";
  if (layer === "factions") return Boolean(projection.factionName);
  if (layer === "anomalies") return projection.occult || projection.kind === "evidence";
  if (layer === "city") return projection.kind === "signal" || projection.kind === "observation";
  if (layer === "occult") return Boolean(projection.occult);
  return true;
}

function projectionLabel(kind: ProjectionKind) {
  return kind === "order" ? "本周决议" : kind === "evidence" ? "已知证据" : kind === "signal" ? "城市消息" : "现场回声";
}

function districtPolygonPoints(item: { x: number; y: number }, index: number) {
  const rx = 7.5 + (index * 3) % 5;
  const ry = 5.5 + (index * 5) % 4;
  const points: string[] = [];
  for (let angle = 0; angle < 360; angle += 45) {
    const rad = angle * Math.PI / 180;
    const wobble = 0.82 + ((index * 7 + angle) % 5) / 14;
    points.push(`${(item.x + Math.cos(rad) * rx * wobble).toFixed(2)},${(item.y + Math.sin(rad) * ry * wobble).toFixed(2)}`);
  }
  return points.join(" ");
}

type Props = {
  game: GameState;
  selectedDistrictId: string;
  onDistrict: (id: string) => void;
  onOpenDiscussion: (seed: string) => void;
  onFormDirection: (seed: string, districtId: string) => void;
  onUseAbility: (context: AbilityContext, prompt: string) => void;
  onAddHypothesis: (fromDistrictId: string, toDistrictId: string, statement: string) => void;
};

export default function CityMapWorkspace(props: Props) {
  const [layer, setLayer] = useState<MapLayer>("city");
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedProjectionId, setSelectedProjectionId] = useState("");
  const historyWeeks = useMemo(() => mapHistoryWeeks(props.game), [props.game]);
  const [playbackWeek, setPlaybackWeek] = useState(props.game.week);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [hypothesisFrom, setHypothesisFrom] = useState(props.game.organizationProfile.headquartersDistrictId);
  const [hypothesisTo, setHypothesisTo] = useState(props.selectedDistrictId);
  const [hypothesisText, setHypothesisText] = useState("");
  const [contextIds, setContextIds] = useState<string[]>([]);
  const district = DISTRICTS.find((item) => item.id === props.selectedDistrictId) ?? DISTRICTS[0];
  const [selectedLocation, setSelectedLocation] = useState(district.landmarks[0]);
  const [locationFocus, setLocationFocus] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const locations = useMemo(() => [...district.landmarks.map((name, index) => [name, index === 0 ? "主要地标" : "固定地点"] as [string, string]), ...(DISTRICT_LOCATIONS[district.id] ?? []).map((item) => [item.name, item.kind] as [string, string])], [district]);
  const activeLocation = locations.find(([name]) => name === selectedLocation)?.[0] ?? locations[0]?.[0] ?? district.name;
  const activeType = locations.find(([name]) => name === activeLocation)?.[1] ?? "固定地点";
  const publicIntel = publicLocationIntel(activeLocation, activeType);
  const playbackSnapshot = showHistory ? props.game.worldSnapshots.find((item) => item.week === playbackWeek) : undefined;
  const displayedRisk = (districtId: string) => playbackSnapshot?.districtStates?.find((item) => item.districtId === districtId)?.risk ?? props.game.worldKernel?.locations.find((item) => item.id === districtId)?.risk ?? DISTRICTS.find((item) => item.id === districtId)?.danger ?? 0;
  const spatial = useMemo(() => buildSpatialIntelligence(props.game, showHistory ? playbackWeek : props.game.week), [playbackWeek, props.game, showHistory]);
  const activeRoutes = useMemo(() => spatial.routes.filter((route) => route.fromDistrictId === district.id || route.toDistrictId === district.id).slice(0, 5), [district.id, spatial.routes]);
  const selectedRoute = activeRoutes.find((route) => route.id === selectedRouteId) ?? activeRoutes[0];
  const selectedRouteSources = selectedRoute ? spatial.sources.filter((source) => selectedRoute.sourceIds.includes(source.id)) : [];
  const selectedRouteConflict = selectedRoute?.conflictIds.length ? spatial.conflicts.find((conflict) => selectedRoute.conflictIds.includes(conflict.id)) : undefined;
  const mapRoutes = spatial.routes.slice(0, 5);

  const projections = useMemo<MapProjection[]>(() => {
    const kernel = props.game.worldKernel;
    const result: MapProjection[] = [];
    for (const observation of kernel?.observations ?? []) {
      if (observation.visibility !== "player" && observation.visibility !== "public" && !observation.holderIds.includes("player") && !observation.holderRefs?.includes("player")) continue;
      const event = kernel.events.find((item) => item.id === observation.eventId);
      if (!event?.locationId || !DISTRICTS.some((item) => item.id === event.locationId)) continue;
      const districtIds = mentionedDistrictIds(observation.text);
      for (const districtId of districtIds.length ? districtIds : [event.locationId]) result.push({ id: `observation:${observation.id}:${districtId}`, districtId, kind: "observation", title: observation.channel, detail: observation.text, source: observation.channel, week: observation.week, occult: observation.channel === "神秘征兆" });
    }
    for (const signal of props.game.worldSignals ?? []) {
      if (!signal.districtId || !DISTRICTS.some((item) => item.id === signal.districtId)) continue;
      const faction = signal.relatedFactionId ? props.game.factions.find((item) => item.id === signal.relatedFactionId && item.visibility !== "未知") : undefined;
      const districtIds = mentionedDistrictIds(`${signal.headline}${signal.body}`);
      for (const districtId of districtIds.length ? districtIds : [signal.districtId]) result.push({ id: `signal:${signal.id}:${districtId}`, districtId, kind: "signal", title: signal.headline, detail: signal.body, source: `${signal.channel} · ${signal.reliability}`, week: signal.week, factionName: faction?.name, occult: signal.channel === "神秘征兆" });
    }
    for (const evidence of props.game.evidenceNodes.filter((item) => item.discovered)) {
      const districtId = inferDistrictId(`${evidence.label}${evidence.summary}${evidence.source}${evidence.tags.join(" ")}`);
      if (!districtId) continue;
      result.push({ id: `evidence:${evidence.id}`, districtId, kind: "evidence", title: evidence.label, detail: evidence.summary, source: `${evidence.source} · ${evidence.certainty}`, week: evidence.weekDiscovered ?? 1, occult: evidence.kind === "异常" || evidence.tags.some((tag) => /灵性|污染|仪式|魔女|神秘/.test(tag)) });
    }
    for (const action of props.game.schedule) {
      if (!DISTRICTS.some((item) => item.id === action.districtId)) continue;
      result.push({ id: `order:${action.id}`, districtId: action.districtId, kind: "order", title: action.title, detail: action.desiredOutcome || action.rawIntent, source: `${action.risk}风险 · 已列入本周决议`, week: props.game.week, occult: action.kind === "仪式" || action.abilityIds.length > 0 });
    }
    return [...new Map(result.map((item) => [item.id, item])).values()].sort((a, b) => b.week - a.week).slice(0, 80);
  }, [props.game]);

  const latestWorldWeek = Math.max(1, props.game.worldSnapshots?.[0]?.week ?? props.game.week - 1);
  const visibleProjections = useMemo(() => projections.filter((item) => showHistory ? item.week <= playbackWeek : item.kind === "evidence" || item.kind === "order" || item.week >= latestWorldWeek), [latestWorldWeek, playbackWeek, projections, showHistory]);
  const layerProjections = useMemo(() => visibleProjections.filter((item) => projectionMatchesLayer(item, layer)), [layer, visibleProjections]);
  const districtProjections = layerProjections.filter((item) => item.districtId === district.id);
  const selectedProjection = districtProjections.find((item) => item.id === selectedProjectionId) ?? districtProjections[0];
  const knownEvidence = props.game.evidenceNodes.filter((item) => item.discovered && (item.summary.includes(activeLocation) || item.label.includes(activeLocation) || item.tags.some((tag) => activeLocation.includes(tag)))).slice(0, 3);

  function layerSummary(id: string) {
    const count = layerProjections.filter((item) => item.districtId === id).length;
    if (layer === "risk") return `${displayedRisk(id)} 风险 · ${count}项动静`;
    return count ? `${count}项可读动静` : "本层暂无消息";
  }

  function chooseDistrict(id: string, projectionId?: string) {
    const next = DISTRICTS.find((item) => item.id === id) ?? DISTRICTS[0];
    props.onDistrict(id); setLocationFocus(null); setDrawerOpen(true);
    setSelectedLocation(next.landmarks[0]);
    setSelectedProjectionId(projectionId ?? layerProjections.find((item) => item.districtId === id)?.id ?? "");
  }

  return <section className="city-workspace">
    <header className="city-workspace-head">
      <div><p>议桌城市测绘图 · 动态世界投射</p><h2>贝克兰德 · 第{props.game.week}周态势</h2><span>只显示组织已经看到、听到或亲自安排的内容；点击地图动静可追溯时间与来源。</span></div>
      <label className="map-query"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="让情报负责人整理一个空间问题……" /><button disabled={!query.trim()} onClick={() => props.onOpenDiscussion(`请情报负责人依据现有地图、消息和档案整理：${query.trim()}。必须区分确认、推断与未知。`)}>带入讨论</button></label>
    </header>
    <nav className="map-layers" aria-label="地图图层">{LAYERS.map((item) => <button key={item.id} className={layer === item.id ? "active" : ""} onClick={() => setLayer(item.id)}><Layers3 size={13} />{item.label}</button>)}</nav>
    <div className="map-legend" aria-label="地图投射图例"><span><Newspaper size={12} />城市消息</span><span><Eye size={12} />观察回声</span><span><FileSearch size={12} />证据</span><span><UsersRound size={12} />本周决议</span><span><i className="legend-subloc" />区域地点</span><button className={showHistory ? "active" : ""} aria-pressed={showHistory} onClick={() => { setShowHistory((value) => !value); setPlaybackWeek(props.game.week); }}><Archive size={12} />{showHistory ? "退出历史播放" : "历史播放"}</button><b>{layerProjections.length}项{showHistory ? `截至第${playbackWeek}周` : "近期投射"}</b></div>
    {showHistory && <div className="map-history-player"><Play size={13} /><strong>组织当时知道的贝克兰德</strong><input type="range" min={0} max={Math.max(0, historyWeeks.length - 1)} value={Math.max(0, historyWeeks.indexOf(playbackWeek))} onChange={(event) => setPlaybackWeek(historyWeeks[Number(event.target.value)] ?? props.game.week)} /><span>第 {playbackWeek} 周</span><small>后来的证据不会倒灌进旧周视野</small></div>}
    <div className={`map-workbench layer-${layer}`}>
      <div className="engraved-map" aria-label="贝克兰德行政区与动态世界投射">
        <div className="map-paper-grain" /><div className="map-thames" />
        <svg className="map-vector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="map-river" d="M -8 62 C 18 58, 30 70, 52 64 S 84 56, 108 66" /><g className="map-roads">{DISTRICT_EDGES.map((edge) => { const from = DISTRICTS.find((item) => item.id === edge.from); const to = DISTRICTS.find((item) => item.id === edge.to); if (!from || !to) return null; return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />; })}</g><g className="map-regions">{DISTRICTS.map((item, index) => <polygon key={item.id} points={districtPolygonPoints(item, index)} />)}</g></svg>
        <div className="known-route-layer" aria-label="已知路线">{mapRoutes.map((route) => { const from = DISTRICTS.find((item) => item.id === route.fromDistrictId); const to = DISTRICTS.find((item) => item.id === route.toDistrictId); if (!from || !to) return null; const dx = to.x - from.x; const dy = to.y - from.y; const width = Math.sqrt(dx * dx + dy * dy); const angle = Math.atan2(dy, dx) * 180 / Math.PI; return <button key={route.id} className={`known-route ${route.status === "有冲突" ? "conflicted" : route.status === "玩家假设" ? "hypothesis" : ""} ${selectedRoute?.id === route.id ? "selected" : ""}`} style={{ left: `${from.x + 4}%`, top: `${from.y + 3}%`, width: `${width}%`, transform: `rotate(${angle}deg)` }} title={`${route.subject} · ${route.earliestMinutes}—${route.latestMinutes}分钟`} onClick={() => { setSelectedRouteId(route.id); chooseDistrict(route.toDistrictId); }}><i /><span>{route.status}</span></button>; })}</div>
        {DISTRICTS.map((item) => { const liveRisk = displayedRisk(item.id); return <button key={item.id} className={`engraved-district ${item.id === district.id ? "selected" : ""} ${liveRisk >= 65 ? "danger" : ""}`} style={{ left: `${Math.min(88, item.x)}%`, top: `${Math.min(86, item.y)}%` }} onClick={() => chooseDistrict(item.id)}><span>{item.name}</span><small>{layerSummary(item.id)}</small></button>; })}
        {DISTRICTS.map((item) => { const subs = DISTRICT_LOCATIONS[item.id] ?? []; if (!subs.length) return null; return subs.map((sub, index) => { const dx = index === 0 ? -11 : 11; const dy = index === 0 ? 7 : 11; const active = item.id === district.id && activeLocation === sub.name; return <button key={`${item.id}-${sub.name}`} data-side={index === 0 ? "left" : "right"} className={`map-sublocation ${active ? "selected" : ""} ${item.id === district.id ? "in-focus" : ""}`} style={{ left: `${Math.max(10, Math.min(90, item.x + dx))}%`, top: `${Math.max(10, Math.min(82, item.y + dy))}%` }} onClick={() => { chooseDistrict(item.id); setSelectedLocation(sub.name); setLocationFocus(sub.name); }} title={`${sub.name} · ${sub.kind}`}><span>{sub.name.slice(0, 2)}</span><b>{sub.name}</b><small>{sub.kind}</small></button>; }); })}
        {DISTRICTS.map((item) => { const items = layerProjections.filter((projection) => projection.districtId === item.id); if (!items.length) return null; const latest = items[0]; return <button key={`projection-${item.id}`} className={`map-projection-marker kind-${latest.kind} ${item.id === district.id ? "selected" : ""}`} style={{ left: `${Math.min(90, item.x + 8)}%`, top: `${Math.max(10, item.y - 7)}%` }} onClick={() => chooseDistrict(item.id, latest.id)} aria-label={`${item.name}有${items.length}项${LAYERS.find((entry) => entry.id === layer)?.label}动静：${latest.title}`} title={`${latest.title} · 第${latest.week}周`}><span>{latest.kind === "order" ? <UsersRound size={13} /> : latest.kind === "evidence" ? <FileSearch size={13} /> : latest.kind === "signal" ? <Newspaper size={13} /> : <Eye size={13} />}</span><b>{items.length}</b></button>; })}
        <div className="map-scale"><Route size={13} />动态标记只代表已知投射，不代表幕后全貌</div>
        <div className="map-compass" aria-hidden="true"><span>N</span><i /><b /></div>{!drawerOpen && <button className="map-drawer-toggle" onClick={() => setDrawerOpen(true)}>区域详情</button>}
      </div>
      <aside className={`district-workspace ${drawerOpen ? "open" : ""}`}>
        <header><span><MapPin size={15} /></span><div><small>{district.subtitle}</small><h3>{district.name}</h3></div><b className={displayedRisk(district.id) >= 65 ? "danger" : ""}>{displayedRisk(district.id)} 风险</b><button className="drawer-collapse" onClick={() => setDrawerOpen(false)}>收起</button></header>{locationFocus && <div className="location-breadcrumb"><button onClick={() => setLocationFocus(null)}><span>←</span>返回 {district.name}</button><strong>{locationFocus}</strong></div>}
        <p>{district.background}</p>
        {!locationFocus && <details className="drawer-details"><summary><strong>最近动静</strong><small>按图层与周数</small></summary><section className="map-projection-feed"><header><strong>{showHistory ? "本图层的历史档案" : "最近一周的已知动静"}</strong><small>{districtProjections.length ? `${districtProjections.length}项 · 最近第${districtProjections[0].week}周` : "没有可显示记录"}</small></header>{districtProjections.length ? <div>{districtProjections.slice(0, 6).map((projection) => <button key={projection.id} className={selectedProjection?.id === projection.id ? "active" : ""} onClick={() => setSelectedProjectionId(projection.id)}><span><b>{projectionLabel(projection.kind)}</b><small>第{projection.week}周 · {projection.source}</small></span><strong>{projection.title}</strong><p>{projection.detail}</p>{projection.factionName && <em>已知关联：{projection.factionName}</em>}</button>)}</div> : <p className="empty-projections">这一图层暂时没有组织可知的变化。世界仍在运行，只是尚未留下能送上议桌的来源。</p>}</section></details>}<details className="location-dossier" open={Boolean(locationFocus)}><summary><span>地点档案</span><small>地点与路线分开记账 · {locations.length}个固定地点</small></summary><div className="location-grid">{locations.map(([name, type]) => <button key={name} className={activeLocation === name ? "active" : ""} onClick={() => { setSelectedLocation(name); setLocationFocus(name); }}><span>{name}</span><small>{type} · {knownMarker(props.game, district.id, name)}</small></button>)}</div><article className="location-brief"><header><strong>{activeLocation}</strong><span>{activeType} · 地点档案</span></header><p><b>已确认：</b>{knownEvidence.length ? knownEvidence.map((item) => `${item.label}——${item.summary}`).join("；") : `${activeLocation}的公开用途属于“${activeType}”；可观察入口包括${publicIntel.entrances}。`}</p><p><b>可核验：</b>可以检查{publicIntel.observable}。地点事实本身不能直接证明幕后主体。</p></article></details>
        {!locationFocus && <><details className="drawer-details"><summary><strong>路线与来源冲突</strong><small>最多展开5条活跃路线</small></summary><section className="route-intelligence"><header><div><Route size={14} /><strong>路线、时间与来源冲突</strong></div><small>最多展开5条活跃路线</small></header>{activeRoutes.length ? <div className="route-claim-list">{activeRoutes.map((route) => <button key={route.id} className={`${selectedRoute?.id === route.id ? "active" : ""} ${route.status === "有冲突" ? "conflicted" : ""}`} onClick={() => setSelectedRouteId(route.id)}><span>{DISTRICTS.find((item) => item.id === route.fromDistrictId)?.name} → {DISTRICTS.find((item) => item.id === route.toDistrictId)?.name}</span><strong>{route.subject}</strong><small>{route.earliestMinutes}—{route.latestMinutes}分钟 · 第{route.week}周 · {route.status}</small></button>)}</div> : <p className="empty-projections">当前没有来源足以画成行动路线。世界中的秘密移动不会因为地图空白而自动暴露。</p>}{selectedRoute && <article className="route-source-card"><p>{selectedRoute.purpose}</p><div>{selectedRouteSources.map((source) => <span key={source.id}><b>{source.reliability}</b>{source.label} · 第{source.week}周</span>)}</div>{selectedRouteConflict && <p className="route-conflict"><ShieldAlert size={13} /><strong>{selectedRouteConflict.title}</strong>{selectedRouteConflict.question}</p>}<button onClick={() => setContextIds((current) => current.includes(selectedRoute.id) ? current.filter((id) => id !== selectedRoute.id) : [...current, selectedRoute.id].slice(-4))}>{contextIds.includes(selectedRoute.id) ? <Check size={13} /> : <Pin size={13} />}{contextIds.includes(selectedRoute.id) ? "已放入空间篮" : "放入空间篮"}</button></article>}</section></details>
        <details className="route-hypothesis"><summary><Route size={13} />提出一条玩家假设路线</summary><div><select value={hypothesisFrom} onChange={(event) => setHypothesisFrom(event.target.value)}>{DISTRICTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>→</span><select value={hypothesisTo} onChange={(event) => setHypothesisTo(event.target.value)}>{DISTRICTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><textarea value={hypothesisText} onChange={(event) => setHypothesisText(event.target.value)} placeholder="写下你怀疑谁、为何移动，以及希望核验什么。地图不会把它当成事实。" /><small>规则基线：约{estimateRoute(props.game, hypothesisFrom, hypothesisTo).minutes.join("—")}分钟；异常能力、封锁和污染可能改变区间。</small><button disabled={!hypothesisText.trim() || hypothesisFrom === hypothesisTo} onClick={() => { props.onAddHypothesis(hypothesisFrom, hypothesisTo, hypothesisText.trim()); setHypothesisText(""); }}>记录为“玩家假设”</button></details></>}<details className="drawer-details"><summary><strong>空间情报篮</strong></summary><div className="map-context-basket"><header><span><Pin size={13} />空间情报篮</span><b>{contextIds.length}/4</b></header><p>{contextIds.length ? activeRoutes.filter((route) => contextIds.includes(route.id)).map((route) => route.subject).join("；") : "从路线档案中钉住需要一起讨论的空间事实。"}</p><div><button disabled={!spatial.routes.length && !spatial.conflicts.length} onClick={() => props.onOpenDiscussion(`请一键整理当前地图情报。只依据第${showHistory ? playbackWeek : props.game.week}周以前可知的${spatial.routes.length}条路线与${spatial.conflicts.length}项来源冲突，分别列出已确认、相互冲突、关键缺口和可用的核验手段；不要自动形成任务。`)}>一键整理空间情报</button><button disabled={!contextIds.length} onClick={() => props.onFormDirection(`围绕以下已钉住的空间情报形成一个总体推进方向：${activeRoutes.filter((route) => contextIds.includes(route.id)).map((route) => `${route.subject}（${route.purpose}）`).join("；")}。我要实现的是：`, district.id)}>带入决议</button></div></div></details>
        <div className="map-actions">
          <button onClick={() => props.onUseAbility({ kind: "district", targetId: `${district.id}:${activeLocation}`, label: `${district.name}·${activeLocation}` }, `我以${activeLocation}为明确空间目标，自由使用选定能力；只采用我随后指定的手段，不得擅自改用仪式、吊坠或其他封印物。`)}><Sparkles size={14} />立即使用能力</button>
          <button onClick={() => props.onOpenDiscussion(`围绕${district.name}${selectedProjection ? `的“${selectedProjection.title}”` : `的${activeLocation}`}展开内部自由讨论。请依据地图中标注的来源与时间，区分事实、推断与未知，并指出是否值得投入本周资源。`)}><MessageSquareText size={14} />带入内部讨论</button>
          <button className="primary" onClick={() => props.onFormDirection(`以${district.name}·${activeLocation}为主要空间落点。我要实现的是：`, district.id)}><UsersRound size={14} />以此处形成行动方向</button>
        </div>
      </aside>
    </div>
  </section>;
}
