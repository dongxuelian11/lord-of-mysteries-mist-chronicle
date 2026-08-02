"use client";

import { useMemo, useState } from "react";
import { Archive, Eye, FileSearch, Layers3, MapPin, MessageSquareText, Newspaper, Route, Search, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { AbilityContext, DISTRICTS, GameState } from "./game-model";

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

const EXTRA_LOCATIONS: Record<string, [string, string][]> = {
  north: [["知识与蒸汽博物馆", "公开机构"], ["河畔出版社", "消息网络"]],
  empress: [["伯爵宅邸群", "受限住宅"], ["仆役后门巷", "人员通道"]],
  west: [["慈善晚宴会馆", "社交场所"], ["律师事务街", "身份渠道"]],
  hillston: [["保险契约库", "受控档案"], ["交易所后巷", "灰色渠道"]],
  cherwood: [["旧剧院街", "公共场所"], ["事务所后巷", "组织锚点"]],
  government: [["公共工程档案厅", "官方档案"], ["议员俱乐部侧门", "受限社交"]],
  east: [["临时招工棚", "人口节点"], ["烟囱巷救济点", "基层网络"]],
  bridge: [["南岸换乘场", "交通节点"], ["拱桥下层通道", "隐蔽路线"]],
  south: [["夜间义诊站", "救助网络"], ["洗衣工会会所", "社区节点"]],
  dock: [["检疫泊位", "受控港区"], ["潮痕仓库群", "灰色货运"]],
};

const ROUTE_NOTES: Record<string, { outward: string; returnPath: string; exposure: string }> = {
  north: { outward: "乔伍德—西区—北区的公共马车线，约45分钟", returnPath: "沿大学街向西撤入出版社街，再换乘有轨车", exposure: "教会与大学门房会记录反复来访者" },
  empress: { outward: "乔伍德—希尔斯顿—皇后区的换乘线，约50分钟", returnPath: "不走原门，借仆役后巷退向希尔斯顿区", exposure: "贵族宅邸的访客名册会留下身份痕迹" },
  west: { outward: "从事务所沿剧院街向西步行，约25分钟", returnPath: "沿律师街进入两处公开营业场所后分散返回", exposure: "教会、律师与私人侦探的视线彼此重叠" },
  hillston: { outward: "沿商业马车环线直达银行街，约30分钟", returnPath: "穿过大型百货，从西侧公共出口离开", exposure: "银行与交易所保安会核对时间和着装" },
  cherwood: { outward: "据点周边步行圈，5至18分钟", returnPath: "事务所后巷与旧剧院街均可返回据点", exposure: "同一面孔频繁活动会暴露组织的固定锚点" },
  government: { outward: "乔伍德—希尔斯顿—政府区公交线，约40分钟", returnPath: "从市政厅南侧进入桥区交通网", exposure: "证件、申请与查档都会形成可检索记录" },
  east: { outward: "先至桥区换乘，再从招工市场进入东区，约65分钟", returnPath: "沿烟囱巷向南退至诊所网络，避免原路返回", exposure: "帮派、工头与便衣会注意不属于本地的人" },
  bridge: { outward: "从乔伍德沿南向马车线直达总站，约35分钟", returnPath: "通过旧货市场更换交通工具后返回", exposure: "换乘点人多，但黑市会记住打听特殊货物的人" },
  south: { outward: "经桥区南岸换乘场进入，约55分钟", returnPath: "借诊所与洗衣工会的社区通道向西撤离", exposure: "外来者容易被紧密的社区关系识别" },
  dock: { outward: "经桥区货运线抵达港务外围，约75分钟", returnPath: "优先走水手区公共码头，必要时改走水路", exposure: "海关、走私者与港务雇员同时记录货物动向" },
};

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

type Props = {
  game: GameState;
  selectedDistrictId: string;
  onDistrict: (id: string) => void;
  onOpenDiscussion: (seed: string) => void;
  onFormDirection: (seed: string, districtId: string) => void;
  onUseAbility: (context: AbilityContext, prompt: string) => void;
};

export default function CityMapWorkspace(props: Props) {
  const [layer, setLayer] = useState<MapLayer>("city");
  const [showHistory, setShowHistory] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedProjectionId, setSelectedProjectionId] = useState("");
  const district = DISTRICTS.find((item) => item.id === props.selectedDistrictId) ?? DISTRICTS[0];
  const [selectedLocation, setSelectedLocation] = useState(district.landmarks[0]);
  const locations = useMemo(() => [...district.landmarks.map((name, index) => [name, index === 0 ? "主要地标" : "固定地点"] as [string, string]), ...(EXTRA_LOCATIONS[district.id] ?? [])], [district]);
  const activeLocation = locations.find(([name]) => name === selectedLocation)?.[0] ?? locations[0]?.[0] ?? district.name;
  const activeType = locations.find(([name]) => name === activeLocation)?.[1] ?? "固定地点";
  const publicIntel = publicLocationIntel(activeLocation, activeType);
  const route = ROUTE_NOTES[district.id];
  const liveLocation = props.game.worldKernel?.locations.find((item) => item.id === district.id);

  const projections = useMemo<MapProjection[]>(() => {
    const kernel = props.game.worldKernel;
    const result: MapProjection[] = [];
    for (const observation of kernel?.observations ?? []) {
      if (observation.visibility !== "player" && !observation.holderIds.includes("player")) continue;
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
  const visibleProjections = useMemo(() => projections.filter((item) => showHistory || item.kind === "evidence" || item.kind === "order" || item.week >= latestWorldWeek), [latestWorldWeek, projections, showHistory]);
  const layerProjections = useMemo(() => visibleProjections.filter((item) => projectionMatchesLayer(item, layer)), [layer, visibleProjections]);
  const districtProjections = layerProjections.filter((item) => item.districtId === district.id);
  const selectedProjection = districtProjections.find((item) => item.id === selectedProjectionId) ?? districtProjections[0];
  const knownEvidence = props.game.evidenceNodes.filter((item) => item.discovered && (item.summary.includes(activeLocation) || item.label.includes(activeLocation) || item.tags.some((tag) => activeLocation.includes(tag)))).slice(0, 3);

  function layerSummary(id: string) {
    const count = layerProjections.filter((item) => item.districtId === id).length;
    const location = props.game.worldKernel?.locations.find((item) => item.id === id);
    if (layer === "risk") return `${location?.risk ?? DISTRICTS.find((item) => item.id === id)?.danger ?? 0} 风险 · ${count}项动静`;
    return count ? `${count}项可读动静` : "本层暂无消息";
  }

  function chooseDistrict(id: string, projectionId?: string) {
    const next = DISTRICTS.find((item) => item.id === id) ?? DISTRICTS[0];
    props.onDistrict(id);
    setSelectedLocation(next.landmarks[0]);
    setSelectedProjectionId(projectionId ?? layerProjections.find((item) => item.districtId === id)?.id ?? "");
  }

  return <section className="city-workspace">
    <header className="city-workspace-head">
      <div><p>议桌城市测绘图 · 动态世界投射</p><h2>贝克兰德 · 第{props.game.week}周态势</h2><span>只显示组织已经看到、听到或亲自安排的内容；点击地图动静可追溯时间与来源。</span></div>
      <label className="map-query"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="让情报负责人整理一个空间问题……" /><button disabled={!query.trim()} onClick={() => props.onOpenDiscussion(`请情报负责人依据现有地图、消息和档案整理：${query.trim()}。必须区分确认、推断与未知。`)}>带入讨论</button></label>
    </header>
    <nav className="map-layers" aria-label="地图图层">{LAYERS.map((item) => <button key={item.id} className={layer === item.id ? "active" : ""} onClick={() => setLayer(item.id)}><Layers3 size={13} />{item.label}</button>)}</nav>
    <div className="map-legend" aria-label="地图投射图例"><span><Newspaper size={12} />城市消息</span><span><Eye size={12} />观察回声</span><span><FileSearch size={12} />证据</span><span><UsersRound size={12} />本周决议</span><button className={showHistory ? "active" : ""} aria-pressed={showHistory} onClick={() => setShowHistory((value) => !value)}><Archive size={12} />{showHistory ? "收起历史" : "查看历史"}</button><b>{layerProjections.length}项{showHistory ? "历史投射" : "近期投射"}</b></div>
    <div className={`map-workbench layer-${layer}`}>
      <div className="engraved-map" aria-label="贝克兰德行政区与动态世界投射">
        <div className="map-paper-grain" /><div className="map-thames" />
        {DISTRICTS.map((item) => { const liveRisk = props.game.worldKernel?.locations.find((entry) => entry.id === item.id)?.risk ?? item.danger; return <button key={item.id} className={`engraved-district ${item.id === district.id ? "selected" : ""} ${liveRisk >= 65 ? "danger" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => chooseDistrict(item.id)}><span>{item.name}</span><small>{layerSummary(item.id)}</small></button>; })}
        {DISTRICTS.map((item) => { const items = layerProjections.filter((projection) => projection.districtId === item.id); if (!items.length) return null; const latest = items[0]; return <button key={`projection-${item.id}`} className={`map-projection-marker kind-${latest.kind} ${item.id === district.id ? "selected" : ""}`} style={{ left: `${Math.min(92, item.x + 8)}%`, top: `${Math.max(8, item.y - 7)}%` }} onClick={() => chooseDistrict(item.id, latest.id)} aria-label={`${item.name}有${items.length}项${LAYERS.find((entry) => entry.id === layer)?.label}动静：${latest.title}`} title={`${latest.title} · 第${latest.week}周`}><span>{latest.kind === "order" ? <UsersRound size={13} /> : latest.kind === "evidence" ? <FileSearch size={13} /> : latest.kind === "signal" ? <Newspaper size={13} /> : <Eye size={13} />}</span><b>{items.length}</b></button>; })}
        <div className="map-scale"><Route size={13} />动态标记只代表已知投射，不代表幕后全貌</div>
      </div>
      <aside className="district-workspace">
        <header><span><MapPin size={15} /></span><div><small>{district.subtitle}</small><h3>{district.name}</h3></div><b className={(liveLocation?.risk ?? district.danger) >= 65 ? "danger" : ""}>{liveLocation?.risk ?? district.danger} 风险</b></header>
        <p>{district.background}</p>
        <section className="map-projection-feed"><header><strong>{showHistory ? "本图层的历史档案" : "最近一周的已知动静"}</strong><small>{districtProjections.length ? `${districtProjections.length}项 · 最近第${districtProjections[0].week}周` : "没有可显示记录"}</small></header>{districtProjections.length ? <div>{districtProjections.slice(0, 6).map((projection) => <button key={projection.id} className={selectedProjection?.id === projection.id ? "active" : ""} onClick={() => setSelectedProjectionId(projection.id)}><span><b>{projectionLabel(projection.kind)}</b><small>第{projection.week}周 · {projection.source}</small></span><strong>{projection.title}</strong><p>{projection.detail}</p>{projection.factionName && <em>已知关联：{projection.factionName}</em>}</button>)}</div> : <p className="empty-projections">这一图层暂时没有组织可知的变化。世界仍在运行，只是尚未留下能送上议桌的来源。</p>}</section>
        <details className="location-dossier"><summary><span>地点档案与往返路线</span><small>地点情报与区域推断已分开记录 · {locations.length}个固定地点</small></summary><div className="location-grid">{locations.map(([name, type]) => <button key={name} className={activeLocation === name ? "active" : ""} onClick={() => setSelectedLocation(name)}><span>{name}</span><small>{type} · {knownMarker(props.game, district.id, name)}</small></button>)}</div><article className="location-brief"><header><strong>{activeLocation}</strong><span>{activeType} · 地点档案</span></header><p><b>已确认：</b>{knownEvidence.length ? knownEvidence.map((item) => `${item.label}——${item.summary}`).join("；") : `${activeLocation}的公开用途属于“${activeType}”；可观察入口包括${publicIntel.entrances}。`}</p><p><b>可核验：</b>无需预设阴谋即可检查{publicIntel.observable}。这些结果只能形成地点证据，不能直接证明幕后主体。</p><div className="route-brief"><span><Route size={13} /><strong>去程</strong>{route.outward}</span><span><Route size={13} /><strong>撤离</strong>{route.returnPath}</span><span><ShieldAlert size={13} /><strong>暴露</strong>{route.exposure}</span></div></article></details>
        <div className="map-actions">
          <button onClick={() => props.onUseAbility({ kind: "district", targetId: `${district.id}:${activeLocation}`, label: `${district.name}·${activeLocation}` }, `我以${activeLocation}为明确空间目标，自由使用选定能力；只采用我随后指定的手段，不得擅自改用仪式、吊坠或其他封印物。`)}><Sparkles size={14} />立即使用能力</button>
          <button onClick={() => props.onOpenDiscussion(`围绕${district.name}${selectedProjection ? `的“${selectedProjection.title}”` : `的${activeLocation}`}展开内部自由讨论。请依据地图中标注的来源与时间，区分事实、推断与未知，并指出是否值得投入本周资源。`)}><MessageSquareText size={14} />带入内部讨论</button>
          <button className="primary" onClick={() => props.onFormDirection(`以${district.name}·${activeLocation}为主要空间落点。我要实现的是：`, district.id)}><UsersRound size={14} />以此处形成行动方向</button>
        </div>
      </aside>
    </div>
  </section>;
}
