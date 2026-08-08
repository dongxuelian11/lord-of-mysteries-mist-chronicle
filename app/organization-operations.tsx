"use client";

import { Building2, ShieldAlert, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import type { GameState } from "./game-model";

type Props = {
  game: GameState;
  onTransform: (action: "rename" | "move" | "legalize" | "satellite" | "split" | "merge" | "rebuild", value: string) => void;
  onMemberEvent: (memberId: string) => void;
};

const FACTION_LABELS: Record<string, string> = { official: "官方体系", local: "地方利益网络", hidden: "隐秘非凡势力" };

export default function OrganizationOperations({ game, onMemberEvent }: Props) {
  const management = game.management;
  const activeBranches = management.branches.filter((branch) => branch.status !== "lost");
  const strongestHostility = management.factionHostility.slice().sort((left, right) => right.hostility - left.hostility)[0];
  const favorable = management.reputation.score >= management.exposure;

  return <section className="organization-operations complete-card">
    <header><div><small>组织经营态势</small><strong>议会定方向，下属按职务持续执行</strong></div><span className={favorable ? "positive" : "negative"}>{favorable ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{favorable ? "影响正在积累" : "痕迹正在反噬"}</span></header>
    <div className="management-resource-strip" aria-label="组织三项基础资源"><article><small>普通人力</small><strong>{management.resources.manpower}</strong><span>宏观调配；提拔后永久减一</span></article><article><small>金钱</small><strong>£{management.resources.money}</strong><span>行动、维持与掩护成本</span></article><article><small>非凡材料</small><strong>{management.resources.extraordinaryMaterials}</strong><span>魔药、仪式与封印物维护</span></article></div>
    <div className="management-office-grid" aria-label="四项治理职责">{management.offices.map((office) => { const incumbent = game.members.find((member) => member.id === office.incumbentId); const report = management.lastGovernanceReport?.offices.find((item) => item.officeId === office.id); return <article key={office.id}><small>{office.name}{report ? ` · 贡献${report.effective}` : ""}</small><strong>{incumbent?.name ?? "尚未任命"}</strong><span>{report?.availability === "away" ? "本周外出，治理效能降至30%" : report?.effect ?? office.responsibility}</span></article>; })}</div>
    <div className="management-state-row"><span>声望：{management.reputation.tier} · {management.reputation.score}</span><span>暴露：{management.exposure} · {management.exposureEvidence.length}条可追查证据</span><span>分部：{activeBranches.length}</span><span>配方：{management.formulas.filter((formula) => formula.status === "verified").length}已验证 / {management.formulas.length}总记录</span><span>封印物：{management.sealedArtifacts.length}</span></div>
    {management.lastConsequenceReport && <details className="management-consequence-report" open><summary>本周态势值产生的实际影响</summary>{management.lastConsequenceReport.effects.map((effect) => <p key={effect}>{effect}</p>)}</details>}

    <div className="management-causality-grid">
      <article><header><ShieldAlert size={14} /><strong>当前主要反制</strong></header>{strongestHostility ? <><b>{FACTION_LABELS[strongestHostility.factionId] ?? strongestHostility.factionId} · 敌意 {strongestHostility.hostility}</b><p>{strongestHostility.responseStyle}</p><small>怨恨{strongestHostility.grievance} · 利益冲突{strongestHostility.interestConflict} · 威胁判断{strongestHostility.perceivedThreat}</small></> : <p>尚无势力形成明确敌意档案。</p>}</article>
      <article><header><Building2 size={14} /><strong>分部回报</strong></header>{activeBranches.length ? activeBranches.map((branch) => <p key={branch.id}><b>{branch.name}</b><span>{branch.status} · 人力{branch.stationedManpower} · {branch.policy}</span></p>) : <p>尚未建立分部。先在地图争夺战略点，把区块控制力提升到60。</p>}</article>
      <article><header><ShieldAlert size={14} /><strong>暴露来源</strong></header>{management.exposureEvidence.filter((item) => item.expiresWeek === undefined || item.expiresWeek >= game.week).slice(-3).map((evidence) => <p key={evidence.id}><b>{evidence.kind} · {evidence.severity}</b><span>{evidence.summary}</span></p>)}{!management.exposureEvidence.length && <p>目前没有可追查证据；高风险与非凡行动会留下具体痕迹。</p>}</article>
    </div>

    {game.members.some((member) => member.personalEventState === "active") && <div className="member-events"><header><UsersRound size={14} /><strong>需要负责人裁决的人物事务</strong></header>{game.members.filter((member) => member.personalEventState === "active").map((member) => <article key={member.id}><div><strong>{member.name}</strong><p>{member.personalEvent}</p></div><button onClick={() => onMemberEvent(member.id)}>通过对话处理</button></article>)}</div>}
  </section>;
}
