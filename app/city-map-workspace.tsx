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
  const knownEvidence = props.game.evidenceNodes.filter((item) => item.discovered && (item.summary.includes(district.name) || item.source.includes(district.name))).slice(0, 3);

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
        <article className="location-brief"><header><strong>{activeLocation}</strong><span>{layer === "occult" ? "神秘锚点尚待确认" : "当前议题落点"}</span></header><p>{knownEvidence.length ? knownEvidence.map((item) => item.summary).join("；") : `组织目前只掌握${activeLocation}的公开用途与常规出入方式。更深处的关系、异常和封锁仍需验证。`}</p><footer><span><Eye size={12} />情报不会超出组织已知范围</span><span><ShieldAlert size={12} />{district.warning}</span></footer></article>
        <div className="map-actions">
          <button onClick={() => props.onUseAbility({ kind: "district", targetId: `${district.id}:${activeLocation}`, label: `${district.name}·${activeLocation}` }, `我以${activeLocation}为明确空间目标，自由使用选定能力；只采用我随后指定的手段，不得擅自改用仪式、吊坠或其他封印物。`)}><Sparkles size={14} />立即使用能力</button>
          <button onClick={() => props.onOpenDiscussion(`围绕${district.name}的${activeLocation}展开内部自由讨论。请先说明组织已经确认的事实、信息来源与当前缺口，不要预设行动路线。`)}><MessageSquareText size={14} />自由讨论</button>
          <button className="primary" onClick={() => props.onFormDirection(`以${district.name}·${activeLocation}为主要空间落点。`, district.id)}><UsersRound size={14} />形成行动方向</button>
        </div>
      </aside>
    </div>
  </section>;
}
