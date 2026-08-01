"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, CircleDot, Eye, FileKey, GitBranch, Link2, LockKeyhole, RadioTower, ShieldAlert, UserRound } from "lucide-react";
import { GameState, Opportunity } from "./game-model";

type Props = {
  game: GameState;
  onUseOpportunity: (opportunity: Opportunity) => void;
  onConnectEvidence: (from: string, to: string, label: string) => void;
};

const certaintyOrder = { "已确认": 4, "可信证据": 3, "推断": 2, "传闻": 1 } as const;

export default function InvestigationBoard({ game, onUseOpportunity, onConnectEvidence }: Props) {
  const [caseId, setCaseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const discoveredAll = useMemo(() => game.evidenceNodes.filter((item) => item.discovered).sort((a, b) => certaintyOrder[b.certainty] - certaintyOrder[a.certainty]), [game.evidenceNodes]);
  const discovered = caseId === "all" ? discoveredAll : discoveredAll.filter((item) => item.caseId === caseId);
  const available = game.opportunities.filter((item) => item.state === "available" && (caseId === "all" || item.caseId === caseId));
  const locked = game.opportunities.filter((item) => item.state === "locked" && (caseId === "all" || item.caseId === caseId));
  const nextEvent = game.timeline.filter((item) => item.status === "upcoming").sort((a, b) => a.scheduledWeek - b.scheduledWeek)[0];
  const visibleFactions = game.factions.filter((item) => item.visibility !== "未知" || item.suspicion >= 25 || item.interest >= 25);

  return <div className="investigation-page page-enter">
    <header className="page-title row"><div><p>调查板 · 多案件因果网</p><h1>证据会打开道路，也会过期、遭到篡改</h1><span>隐藏真相仍不可见。你可以自由跨案件调查，也可以亲手标注两个已知节点之间的假设联系。</span></div><div className="investigation-counts"><span><strong>{discoveredAll.filter((item) => !item.compromised).length}</strong><small>有效证据</small></span><span><strong>{available.length}</strong><small>可行动机会</small></span><span><strong>{nextEvent ? Math.max(0, nextEvent.scheduledWeek - game.week) : "—"}</strong><small>周至下一窗口</small></span></div></header>

    <section className="case-switcher complete-card" aria-label="案件筛选"><button className={caseId === "all" ? "active" : ""} onClick={() => setCaseId("all")}><strong>全部调查</strong><small>{discoveredAll.length}条已知</small></button>{game.cases.map((item) => <button key={item.id} className={caseId === item.id ? "active" : ""} onClick={() => setCaseId(item.id)}><strong>{item.title}</strong><small>{item.state === "resolved" ? "已结案" : `${item.discoveredCount}/${item.totalCount} · 压力${item.pressure}`}</small></button>)}</section>

    {caseId !== "all" && (() => { const item = game.cases.find((entry) => entry.id === caseId)!; return <section className="investigation-focus complete-card"><header><GitBranch size={17} /><div><small>{item.state} · 当前案件</small><strong>{item.title}</strong></div><span>{item.discoveredCount}/{item.totalCount} 已显露</span></header><p>{item.premise}</p><footer><ShieldAlert size={13} />{item.stakes}</footer></section>; })()}

    <div className="investigation-grid">
      <section className="evidence-board complete-card"><header className="section-heading"><span><FileKey size={16} /><strong>证据与联系</strong></span><small>{discovered.length}个可见节点</small></header><div className="evidence-node-grid">{discovered.map((node) => {
        const links = game.evidenceLinks.filter((link) => link.discovered && (link.from === node.id || link.to === node.id));
        return <article key={node.id} className={`evidence-node certainty-${node.certainty} ${node.compromised ? "compromised" : ""}`}><header><b>{node.kind}</b><span>{node.compromised ? "已受损" : node.certainty}</span></header><h3>{node.label}</h3><p>{node.summary}</p><footer>{node.expiresWeek && !node.compromised && <span><CalendarClock size={10} />第{node.expiresWeek}周后需重新核验</span>}{links.length ? links.map((link) => { const otherId = link.from === node.id ? link.to : link.from; const other = game.evidenceNodes.find((item) => item.id === otherId); return <span key={link.id}><CircleDot size={10} />{link.label}：{other?.label}</span>; }) : <span><CircleDot size={10} />暂未与其他证据形成可靠连接</span>}</footer></article>;
      })}</div>{discovered.length >= 2 && <div className="manual-link"><header><Link2 size={14} /><strong>建立玩家假设连接</strong><small>连接不会自动证明结论，但会保留你的推理</small></header><select value={from} onChange={(event) => setFrom(event.target.value)}><option value="">选择起点</option>{discovered.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select value={to} onChange={(event) => setTo(event.target.value)}><option value="">选择终点</option>{discovered.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="例如：同一承包人、时间重合、灵性频率相似" /><button onClick={() => { onConnectEvidence(from, to, linkLabel); setLinkLabel(""); }} disabled={!from || !to || from === to || !linkLabel.trim()}>写入调查板</button></div>}</section>

      <aside className="opportunity-board complete-card"><header className="section-heading"><span><Eye size={16} /><strong>由证据开放的可能性</strong></span><small>不是必做任务</small></header><div className="opportunity-list">{available.map((item) => <article key={item.id} className="available"><header><span>{item.risk}风险</span><b>可以行动</b></header><h3>{item.title}</h3><p>{item.description}</p><small>可能获得：{item.rewardPreview}</small><button onClick={() => onUseOpportunity(item)}>以此为起点制定行动 <ArrowRight size={14} /></button></article>)}{locked.map((item) => { const missing = item.requirements.filter((id) => !game.evidenceNodes.find((node) => node.id === id)?.discovered); return <article key={item.id} className="locked"><header><span>{item.risk}风险</span><b><LockKeyhole size={11} />还缺{missing.length}项证据</b></header><h3>{item.title}</h3><p>{item.description}</p><small>缺口：{missing.map((id) => game.evidenceNodes.find((node) => node.id === id)?.kind ?? "未知来源").join("、")}</small></article>; })}</div></aside>
    </div>

    <section className="timeline-board complete-card"><header className="section-heading"><span><CalendarClock size={16} /><strong>原著时间轴与历史偏转点</strong></span><small>当前第{game.week}周 · 偏转{game.deviation.toFixed(1)}%</small></header><div>{game.timeline.filter((item) => item.revealed).map((event) => <article key={event.id} className={event.status}><span>W{String(event.scheduledWeek).padStart(2, "0")}</span><i /><div><small>{event.kind} · {event.status === "active" ? "正在发生" : event.status === "resolved" ? "已经结算" : event.status === "diverted" ? "因果分支已改变" : "尚未发生"}</small><strong>{event.title}</strong><p>{event.summary}</p></div></article>)}</div>{game.pivots.length > 0 && <div className="pivot-list">{game.pivots.map((pivot) => <article key={pivot.id}><GitBranch size={15} /><div><small>第{pivot.week}周 · 偏转强度 +{pivot.magnitude}</small><strong>{pivot.title}</strong><p>{pivot.cause}</p><ul>{pivot.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul></div></article>)}</div>}</section>

    <section className="canon-board complete-card"><header className="section-heading"><span><UserRound size={16} /><strong>原著人物的自主轨迹</strong></span><small>不是普通招募槽位，也不会等待玩家</small></header><div>{game.canonActors.map((actor) => <article key={actor.id}><header><strong>{actor.name}</strong><span>{actor.location} · {actor.awareness}</span></header><small>{actor.publicIdentity}</small><p>{actor.state}</p><footer>{actor.lastMove}</footer></article>)}</div></section>

    <div className="world-state-grid"><section className="faction-board complete-card"><header className="section-heading"><span><RadioTower size={16} /><strong>已知势力态势</strong></span><small>它们有自己的计划</small></header>{visibleFactions.map((faction) => <article key={faction.id}><div><strong>{faction.name}</strong><small>{faction.kind} · {faction.visibility}</small></div><p>{faction.lastMove}</p><span className={faction.suspicion >= 45 ? "danger" : faction.trust >= 35 ? "good" : "watch"}>{faction.suspicion >= 45 ? <><ShieldAlert size={12} />正在反调查</> : faction.trust >= 35 ? <><CheckCircle2 size={12} />愿意合作</> : "态度仍不明确"}</span></article>)}</section><section className="world-move-board complete-card"><header className="section-heading"><span><RadioTower size={16} /><strong>世界没有等待你</strong></span><small>最近势力行动</small></header>{game.worldMoves.length ? game.worldMoves.slice(0, 10).map((move) => <article key={move.id}><header><strong>{move.title}</strong><b>{move.visibility}</b></header><p>{move.detail}</p><small>第{move.week}周</small></article>) : <div className="empty-state"><RadioTower size={23} /><p>结束第一周后，势力的自主行动会记录在这里。</p></div>}</section></div>
  </div>;
}
