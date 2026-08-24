"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Building2, Eye, MapPin, MessageSquareText, ShieldAlert, Swords } from "lucide-react";
import type { GameState } from "./game-model";
import { projectFactionInfluenceForPlayer } from "./faction-strategy";

type Props = {
  game: GameState;
  selectedDistrictId: string;
  onDistrict: (districtId: string) => void;
  onOpenDiscussion: (seed: string) => void;
  onFormDirection: (seed: string, districtId: string) => void;
};

const FOUNDATION_LABELS = {
  official: "官方",
  economic: "经济",
  social: "社会",
  occult: "神秘",
  force: "武力",
} as const;

const FACTION_LABELS: Record<string, string> = {
  player: "我方组织",
  official: "官方势力",
  local: "本地势力",
  hidden: "隐秘势力",
};

export default function BacklundControlMap(props: Props) {
  const map = props.game.management.map;
  const district = map.districts.find((item) => item.id === props.selectedDistrictId) ?? map.districts[0];
  const [blockId, setBlockId] = useState(district.blocks[0]?.id ?? "");
  const [pointId, setPointId] = useState(district.blocks[0]?.strategicPoints[0]?.id ?? "");

  const block = district.blocks.find((item) => item.id === blockId) ?? district.blocks[0];
  const point = block?.strategicPoints.find((item) => item.id === pointId) ?? block?.strategicPoints[0];
  const rankedInfluence = useMemo(
    () => point ? projectFactionInfluenceForPlayer(point, props.game.factionStrategy, map.playerFactionId) : [],
    [map.playerFactionId, point, props.game.factionStrategy],
  );
  const knownController = point?.controllerId === map.playerFactionId
    || rankedInfluence.some((entry) => entry.factionId === point?.controllerId);
  const controllerLabel = !point?.controllerId
    ? "多方争夺"
    : point.controllerId === map.playerFactionId
      ? "我方控制"
      : knownController
        ? `${FACTION_LABELS[point.controllerId] ?? point.controllerId}控制`
        : "未知势力控制";
  const intelligenceCount = block?.strategicPoints.reduce((sum, item) => sum + item.intelligenceIds.length, 0) ?? 0;
  const blockBranch = props.game.management.branches.find((branch) => branch.blockId === block?.id && branch.status !== "lost");
  const branchSupervisor = props.game.members.find((member) => member.id === blockBranch?.supervisorId);

  return <div className="backlund-control-map">
    <aside className="control-districts" aria-label="贝克兰德区域">
      <header><small>城市总览</small><strong>区域控制持续变化</strong></header>
      {map.districts.map((item) => <button key={item.id} className={item.id === district.id ? "selected" : ""} onClick={() => props.onDistrict(item.id)}>
        <span><strong>{item.name}</strong><small>{item.blocks.length} 个区块</small></span><b>{item.control}%</b>
        <i className="progress-track" aria-hidden="true"><svg className="progress-fill" viewBox="0 0 100 1" focusable="false"><rect width={Math.max(0, Math.min(100, item.control))} height="1" /></svg></i>
      </button>)}
    </aside>

    <main className="control-blocks">
      <header><div><small>{district.name}</small><h3>争夺区块与战略点</h3></div><span>区域控制 {district.control}%</span></header>
      <div className="block-grid">
        {district.blocks.map((item) => <button key={item.id} className={item.id === block?.id ? "selected" : ""} onClick={() => { setBlockId(item.id); setPointId(item.strategicPoints[0]?.id ?? ""); }}>
          <MapPin size={14} /><span><strong>{item.name}</strong><small>权重 {item.weight} · {item.strategicPoints.filter((entry) => entry.contested).length} 处争夺中</small></span><b>{item.control}%</b>
        </button>)}
      </div>
      {block && <section className="strategic-point-list">
        <header><strong>{block.name}</strong><small>{intelligenceCount ? `${intelligenceCount} 条已定位情报` : "尚无已定位情报"}</small></header>
        {block.strategicPoints.map((item) => <button key={item.id} className={item.id === point?.id ? "selected" : ""} onClick={() => setPointId(item.id)}>
          {item.kind === "security" ? <Swords size={14} /> : item.kind === "authority" ? <Building2 size={14} /> : <Eye size={14} />}
          <span><strong>{item.name}</strong><small>{item.id === point?.id ? controllerLabel : item.controllerId === map.playerFactionId ? "我方控制" : item.controllerId ? "控制者待确认" : "多方争夺"} · 权重 {item.weight}</small></span>
          <b>{item.influenceByFaction[map.playerFactionId] ?? 0}%</b>
        </button>)}
      </section>}
    </main>

    <aside className="control-point-dossier">
      {point ? <>
        <header><small>战略点档案</small><h3>{point.name}</h3><span className={point.contested ? "contested" : "controlled"}>{point.contested ? "争夺中" : controllerLabel}</span></header>
        <section><strong>多方影响</strong>{rankedInfluence.map((entry) => <div className="influence-row" key={entry.key}><span>{entry.known && entry.factionId ? FACTION_LABELS[entry.factionId] ?? entry.factionId : "未知势力活动"}</span><i className="progress-track" aria-hidden="true"><svg className="progress-fill" viewBox="0 0 100 1" focusable="false"><rect width={Math.max(0, Math.min(100, entry.influence))} height="1" /></svg></i><b>{entry.influence}%</b></div>)}</section>
        <section><strong>控制基础</strong><div className="foundation-grid">{Object.entries(point.foundations).map(([key, value]) => <span key={key}><small>{FOUNDATION_LABELS[key as keyof typeof FOUNDATION_LABELS]}</small><b>{value}</b></span>)}</div></section>
        <section className="point-yield"><strong>持续作用</strong>{Object.entries(point.weeklyYield).map(([key, value]) => <p key={key}>{key} <b>+{value}/周</b></p>)}</section>
        {blockBranch && <section className="map-branch-dossier"><strong>{blockBranch.name} · {blockBranch.status}</strong><p>主管：{branchSupervisor?.name ?? "待任命"} · 驻扎人力 {blockBranch.stationedManpower} · 方针 {blockBranch.policy}</p><small>主管驻守期间不能承担总部正式行动；分部受威胁时产出下降，连续失去控制会断联。</small><div><button onClick={() => props.onOpenDiscussion(`讨论${blockBranch.name}当前状态：${blockBranch.status}。评估当地控制、主管负担、人力投入与其他势力反击，再决定增援、调整方针或撤离。`)}>讨论分部</button><button onClick={() => props.onFormDirection(`针对${blockBranch.name}下令：根据${block.name}当前控制力与分部状态${blockBranch.status}，提出增援、恢复、换任主管或撤离方案；不得忽略驻扎人力和总部削弱。`, district.id)}>形成处置</button></div></section>}
        <div className="lore-status"><ShieldAlert size={13} /><span>{point.loreStatus === "verified" ? "知识库已确认" : point.loreStatus === "local-fiction" ? "不冲突的地方性节点；规则仍受知识库约束" : "进入行动前必须完成知识库核验"}</span></div>
        <footer><button onClick={() => props.onOpenDiscussion(`讨论${point.name}：现有影响、可用情报、其他势力反击方式，以及是否值得投入本周人力。`)}><MessageSquareText size={14} />召集相关负责人</button><button className="primary" onClick={() => props.onFormDirection(`针对${district.name}的${block.name}·${point.name}形成部署。目标是提高可持续控制，而不是只完成一次行动；列明投入的人力、负责人、暴露证据、撤退条件和其他势力可能的反击。`, district.id)}>形成部署 <ArrowRight size={14} /></button></footer>
      </> : <p>选择一个战略点查看档案。</p>}
    </aside>
  </div>;
}
