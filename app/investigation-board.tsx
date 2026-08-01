"use client";

import { ArrowRight, CalendarClock, CheckCircle2, CircleDot, Eye, FileKey, GitBranch, LockKeyhole, RadioTower, ShieldAlert } from "lucide-react";
import { GameState, Opportunity } from "./game-model";

type Props = {
  game: GameState;
  onUseOpportunity: (opportunity: Opportunity) => void;
};

const certaintyOrder = { "已确认": 4, "可信证据": 3, "推断": 2, "传闻": 1 } as const;

export default function InvestigationBoard({ game, onUseOpportunity }: Props) {
  const discovered = game.evidenceNodes.filter((item) => item.discovered).sort((a, b) => certaintyOrder[b.certainty] - certaintyOrder[a.certainty]);
  const available = game.opportunities.filter((item) => item.state === "available");
  const locked = game.opportunities.filter((item) => item.state === "locked");
  const nextEvent = game.timeline.filter((item) => item.status === "upcoming").sort((a, b) => a.scheduledWeek - b.scheduledWeek)[0];
  const visibleFactions = game.factions.filter((item) => item.visibility !== "未知" || item.suspicion >= 25 || item.interest >= 25);

  return <div className="investigation-page page-enter">
    <header className="page-title row"><div><p>调查板 · 显性证据层</p><h1>你已经知道什么，它又打开了什么？</h1><span>连接只来自已经获得的证据。隐藏真相、未接触人物和敌方计划不会提前显示。</span></div><div className="investigation-counts"><span><strong>{discovered.length}</strong><small>已发现节点</small></span><span><strong>{available.length}</strong><small>可行动机会</small></span><span><strong>{nextEvent ? Math.max(0, nextEvent.scheduledWeek - game.week) : "—"}</strong><small>周至下一窗口</small></span></div></header>

    <section className="investigation-focus complete-card"><header><GitBranch size={17} /><div><small>当前核心调查</small><strong>黑玻璃挂坠与不可见人口</strong></div><span>{Math.round(discovered.length / game.evidenceNodes.length * 100)}% 已显露</span></header><p>这不是一条要求按顺序完成的任务链。你可以从物证、账目、人物、地点、教会或非凡手段中的任何一端继续接近真相。</p></section>

    <div className="investigation-grid">
      <section className="evidence-board complete-card"><header className="section-heading"><span><FileKey size={16} /><strong>证据与联系</strong></span><small>{discovered.length}/{game.evidenceNodes.length} 节点</small></header><div className="evidence-node-grid">{discovered.map((node) => {
        const links = game.evidenceLinks.filter((link) => link.discovered && (link.from === node.id || link.to === node.id));
        return <article key={node.id} className={`evidence-node certainty-${node.certainty}`}><header><b>{node.kind}</b><span>{node.certainty}</span></header><h3>{node.label}</h3><p>{node.summary}</p><footer>{links.length ? links.map((link) => { const otherId = link.from === node.id ? link.to : link.from; const other = game.evidenceNodes.find((item) => item.id === otherId); return <span key={link.id}><CircleDot size={10} />{link.label}：{other?.label}</span>; }) : <span><CircleDot size={10} />暂未与其他证据形成可靠连接</span>}</footer></article>;
      })}</div></section>

      <aside className="opportunity-board complete-card"><header className="section-heading"><span><Eye size={16} /><strong>新开放的可能性</strong></span><small>成功必须改变未来</small></header><div className="opportunity-list">{available.map((item) => <article key={item.id} className="available"><header><span>{item.risk}风险</span><b>可以行动</b></header><h3>{item.title}</h3><p>{item.description}</p><small>可能获得：{item.rewardPreview}</small><button onClick={() => onUseOpportunity(item)}>以此为起点制定行动 <ArrowRight size={14} /></button></article>)}{locked.map((item) => { const missing = item.requirements.filter((id) => !game.evidenceNodes.find((node) => node.id === id)?.discovered); return <article key={item.id} className="locked"><header><span>{item.risk}风险</span><b><LockKeyhole size={11} />还缺{missing.length}项证据</b></header><h3>{item.title}</h3><p>{item.description}</p><small>缺口：{missing.map((id) => game.evidenceNodes.find((node) => node.id === id)?.kind ?? "未知来源").join("、")}</small></article>; })}</div></aside>
    </div>

    <section className="timeline-board complete-card"><header className="section-heading"><span><CalendarClock size={16} /><strong>原著时间轴与偏转窗口</strong></span><small>当前第{game.week}周 · 偏转{game.deviation.toFixed(1)}%</small></header><div>{game.timeline.filter((item) => item.revealed).map((event) => <article key={event.id} className={event.status}><span>W{String(event.scheduledWeek).padStart(2, "0")}</span><i /><div><small>{event.kind} · {event.status === "active" ? "正在发生" : event.status === "resolved" ? "已经结算" : event.status === "diverted" ? "已经偏转" : "尚未发生"}</small><strong>{event.title}</strong><p>{event.summary}</p></div></article>)}</div></section>

    <div className="world-state-grid"><section className="faction-board complete-card"><header className="section-heading"><span><RadioTower size={16} /><strong>已知势力态势</strong></span><small>完整数值对玩家隐藏</small></header>{visibleFactions.map((faction) => <article key={faction.id}><div><strong>{faction.name}</strong><small>{faction.kind} · {faction.visibility}</small></div><p>{faction.lastMove}</p><span className={faction.suspicion >= 45 ? "danger" : faction.trust >= 35 ? "good" : "watch"}>{faction.suspicion >= 45 ? <><ShieldAlert size={12} />明显警惕你</> : faction.trust >= 35 ? <><CheckCircle2 size={12} />愿意合作</> : "态度仍不明确"}</span></article>)}</section><section className="world-move-board complete-card"><header className="section-heading"><span><RadioTower size={16} /><strong>世界没有等待你</strong></span><small>最近势力行动</small></header>{game.worldMoves.length ? game.worldMoves.slice(0, 8).map((move) => <article key={move.id}><header><strong>{move.title}</strong><b>{move.visibility}</b></header><p>{move.detail}</p><small>第{move.week}周</small></article>) : <div className="empty-state"><RadioTower size={23} /><p>结束第一周后，势力的自主行动会记录在这里。</p></div>}</section></div>
  </div>;
}
