"use client";

import { useMemo, useState } from "react";
import { Eye, Layers3, MapPin, MessageSquareText, Route, Search, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { AbilityContext, DISTRICTS, GameState } from "./game-model";

type MapLayer = "network" | "factions" | "anomalies" | "city" | "risk" | "occult";

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: "network", label: "组织网络" }, { id: "factions", label: "已知势力" }, { id: "anomalies", label: "异常案件" },
  { id: "city", label: "城市运行" }, { id: "risk", label: "风险暴露" }, { id: "occult", label: "神秘空间" },
];

const EXTRA_LOCATIONS: Record<string, [string, string][]> = {
  north: [["知识与蒸汽博物馆", "公开机构"], ["河畔出版街", "消息网络"]],
  empress: [["伯爵宅邸群", "受限住宅"], ["仆役后门巷", "人员通道"]],
  west: [["慈善晚宴会馆", "社交场所"], ["律师事务街", "身份渠道"]],
  hillston: [["保险契约库", "受控档案"], ["交易所后巷", "灰色渠道"]],
  cherwood: [["旧剧院街", "公共场所"], ["事务所后巷", "组织锚点"]],
  government: [["公共工程档案处", "官方档案"], ["议员俱乐部侧门", "受限社交"]],
  east: [["临时招工棚", "人口节点"], ["烟囱巷救济点", "基层网络"]],
  bridge: [["南岸换乘场", "交通节点"], ["拱桥下层通道", "隐蔽路线"]],
  south: [["夜间义诊站", "救助网络"], ["洗衣工会会所", "社区节点"]],
  dock: [["检疫泊位", "受控港区"], ["潮痕仓库群", "灰色货运"]],
};

const ROUTE_NOTES: Record<string, { outward: string; returnPath: string; exposure: string }> = {
  north: { outward: "乔伍德—西区—北区的公共马车线，约55分钟", returnPath: "沿大学街向西撤入出版社街，再换乘有轨车", exposure: "教会与大学门房会记录反复来访者" },
  empress: { outward: "乔伍德—希尔斯顿—皇后区的换乘线，约50分钟", returnPath: "不走原门，借仆役后巷退向希尔斯顿区", exposure: "贵族宅邸的访客名册会留下身份痕迹" },
  west: { outward: "从事务所沿剧院街向西步行，约25分钟", returnPath: "沿律师街进入两处公开营业场所后分散返回", exposure: "教会、律师与私人侦探的视线彼此重叠" },
  hillston: { outward: "沿商业马车环线直达银行街，约30分钟", returnPath: "穿过大型百货，从西侧公共出口离开", exposure: "银行与交易所保安会核对时间和着装" },
  cherwood: { outward: "据点周边步行圈，5至18分钟", returnPath: "事务所后巷与旧剧院街均可返回据点", exposure: "同一面孔频繁活动会暴露组织的固定锚点" },
  government: { outward: "乔伍德—希尔斯顿—政府区公车线，约40分钟", returnPath: "从市政厅南侧进入桥区交通网", exposure: "证件、申请与查档都会形成可检索记录" },
  east: { outward: "先至桥区换乘，再从招工市场进入东区，约65分钟", returnPath: "沿烟囱巷向南退至诊所网络，避免原路返回", exposure: "帮派、工头与便衣会注意不属于本地的人" },
  bridge: { outward: "从乔伍德沿南向马车线直达总站，约35分钟", returnPath: "通过旧货市场更换交通工具后返回", exposure: "换乘点人多但黑市会记住打听特殊货物的人" },
  south: { outward: "经桥区南岸换乘场进入，约55分钟", returnPath: "借诊所与洗衣工会的社区通道向西撤离", exposure: "外来者容易被紧密的社区关系识别" },
  dock: { outward: "经桥区货运线抵达港务外围，约75分钟", returnPath: "优先走水手区公共码头，必要时改走水路", exposure: "海关、走私者与港务雇员同时记录货物动向" },
};

function publicLocationIntel(name: string, type: string) {
  const entrances = /档案|图书馆|博物馆|事务/.test(name) ? "公开柜台、工作人员入口和闭馆后的货运门"
    : /教堂|会馆|俱乐部|沙龙|宅邸|宫殿/.test(name) ? "正门受身份约束，服务人员与固定供应商另有出入口"
      : /工厂|仓库|泊位|货运|煤气/.test(name) ? "人员、货物和夜班交接分别使用不同通道"
        : /市场|酒吧|旅馆|百货|药房/.test(name) ? "营业时段人流足以掩护观察，但熟客网络会记住生面孔"
          : "公开道路可抵达，侧巷与服务门构成第二条离开路线";
  const observable = /档案|图书馆|事务|律师|保险/.test(`${name}${type}`) ? "登记时间、签章、经手人和纸张来源"
    : /交通|马车|栈桥|泊位|货运/.test(`${name}${type}`) ? "车次、停留点、装卸时间与最终去向"
      : /社区|诊所|工会|救济|招工/.test(`${name}${type}`) ? "人员姓名、缺勤、病例与互助关系"
        : /教堂|宅邸|会馆|俱乐部|沙龙/.test(`${name}${type}`) ? "访客时段、供应清单和服务人员证词"
          : "出入频率、灯光、声音与周边营业规律";
  return { entrances, observable };
}

function knownMarker(game: GameState, districtId: string, label: string) {
  const evidence = game.evidenceNodes.find((item) => item.discovered && (item.summary.includes(label) || item.label.includes(label)));
  if (evidence) return evidence.certainty;
  return game.discoveredDistrictIds.includes(districtId) ? "已知地点" : "轮廓未明";
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
  const [layer, setLayer] = useState<MapLayer>("network");
  const [query, setQuery] = useState("");
  const district = DISTRICTS.find((item) => item.id === props.selectedDistrictId) ?? DISTRICTS[0];
  const [selectedLocation, setSelectedLocation] = useState(district.landmarks[0]);
  const locations = useMemo(() => [...district.landmarks.map((name, index) => [name, index === 0 ? "主要地标" : "固定地点"] as [string, string]), ...(EXTRA_LOCATIONS[district.id] ?? [])], [district]);
  const activeLocation = locations.find(([name]) => name === selectedLocation)?.[0] ?? locations[0]?.[0] ?? district.name;
  const activeType = locations.find(([name]) => name === activeLocation)?.[1] ?? "固定地点";
  const knownEvidence = props.game.evidenceNodes.filter((item) => item.discovered && (item.summary.includes(activeLocation) || item.label.includes(activeLocation) || item.tags.some((tag) => activeLocation.includes(tag)))).slice(0, 3);
  const publicIntel = publicLocationIntel(activeLocation, activeType);
  const route = ROUTE_NOTES[district.id];

  function chooseDistrict(id: string) {
    const next = DISTRICTS.find((item) => item.id === id) ?? DISTRICTS[0];
    props.onDistrict(id);
    setSelectedLocation(next.landmarks[0]);
  }

  return <section className="city-workspace">
    <header className="city-workspace-head">
      <div><p>议桌城市测绘图</p><h2>贝克兰德 · 已知空间</h2><span>地点提供事实与距离，最后方向仍由你在议会中决定。</span></div>
      <label className="map-query"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="让情报负责人整理一个空间问题……" /><button disabled={!query.trim()} onClick={() => props.onOpenDiscussion(`请情报负责人依据现有地图和档案整理：${query.trim()}。必须区分确认、推断与未知。`)}>带入讨论</button></label>
    </header>
    <nav className="map-layers" aria-label="地图图层">{LAYERS.map((item) => <button key={item.id} className={layer === item.id ? "active" : ""} onClick={() => setLayer(item.id)}><Layers3 size={13} />{item.label}</button>)}</nav>
    <div className={`map-workbench layer-${layer}`}>
      <div className="engraved-map" aria-label="贝克兰德行政区地图">
        <div className="map-paper-grain" /><div className="map-thames" />
        {DISTRICTS.map((item) => <button key={item.id} className={`engraved-district ${item.id === district.id ? "selected" : ""} ${item.danger >= 65 ? "danger" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => chooseDistrict(item.id)}><span>{item.name}</span><small>{layer === "risk" ? `${item.danger} 风险` : layer === "network" ? `${props.game.discoveredDistrictIds.includes(item.id) ? "已有记录" : "尚无网络"}` : item.subtitle}</small></button>)}
        <div className="map-scale"><Route size={13} />跨区行动会结算路线、时间与暴露</div>
      </div>
      <aside className="district-workspace">
        <header><span><MapPin size={15} /></span><div><small>{district.subtitle}</small><h3>{district.name}</h3></div><b className={district.danger >= 65 ? "danger" : ""}>{district.danger} 风险</b></header>
        <p>{district.background}</p>
        <div className="location-grid">{locations.map(([name, type]) => <button key={name} className={activeLocation === name ? "active" : ""} onClick={() => setSelectedLocation(name)}><span>{name}</span><small>{type} · {knownMarker(props.game, district.id, name)}</small></button>)}</div>
        <article className="location-brief"><header><strong>{activeLocation}</strong><span>{layer === "occult" ? "神秘锚点尚待确认" : `${activeType} · 地点档案`}</span></header><p><b>已确认：</b>{knownEvidence.length ? knownEvidence.map((item) => `${item.label}——${item.summary}`).join("；") : `${activeLocation}的公开用途属于“${activeType}”；可观察入口包括${publicIntel.entrances}。`}</p><p><b>可核验：</b>无需预设阴谋即可检查{publicIntel.observable}。这些结果只能形成地点证据，不能直接证明幕后主体。</p><div className="route-brief"><span><Route size={13} /><strong>去程</strong>{route.outward}</span><span><Route size={13} /><strong>撤离</strong>{route.returnPath}</span><span><ShieldAlert size={13} /><strong>暴露</strong>{route.exposure}</span></div><footer><span><Eye size={12} />地点情报与区域推断已分开记录</span><span><ShieldAlert size={12} />{district.warning}</span></footer></article>
        <div className="map-actions">
          <button onClick={() => props.onUseAbility({ kind: "district", targetId: `${district.id}:${activeLocation}`, label: `${district.name}·${activeLocation}` }, `我以${activeLocation}为明确空间目标，自由使用选定能力；只采用我随后指定的手段，不得擅自改用仪式、吊坠或其他封印物。`)}><Sparkles size={14} />立即使用能力</button>
          <button onClick={() => props.onOpenDiscussion(`围绕${district.name}的${activeLocation}展开内部自由讨论。地点档案显示可核验${publicIntel.observable}；去程为${route.outward}，预备撤离为${route.returnPath}。请区分事实、推断与未知，并指出是否值得投入本周资源。`)}><MessageSquareText size={14} />自由讨论</button>
          <button className="primary" onClick={() => props.onFormDirection(`以${district.name}·${activeLocation}为主要空间落点；先核验${publicIntel.observable}。采用${route.outward}，若${route.exposure}导致警戒升高，则沿${route.returnPath}撤离。`, district.id)}><UsersRound size={14} />形成行动方向</button>
        </div>
      </aside>
    </div>
  </section>;
}
