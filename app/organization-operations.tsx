"use client";

import { Building2, CircleDollarSign, ShieldAlert, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import { GameState } from "./game-model";

export default function OrganizationOperations({ game }: { game: GameState }) {
  const latest = game.economyHistory[0];
  const projectedIncome = 48 + Math.floor(game.influence / 5);
  const facilityCost = game.facilities.filter((item) => item.status === "运转中").reduce((sum, item) => sum + (item.maintenance ?? Math.max(2, item.level * 3)), 0);
  const departmentCost = game.departments.reduce((sum, item) => sum + item.budget, 0);
  const forecast = projectedIncome - facilityCost - departmentCost;
  return <section className="organization-operations complete-card">
    <header><div><small>组织经营态势</small><strong>每项资产都产生能力、成本与风险</strong></div><span className={forecast >= 0 ? "positive" : "negative"}>{forecast >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}下周基础结余 {forecast >= 0 ? "+" : ""}£{forecast}</span></header>
    <div className="operation-metrics"><article><CircleDollarSign size={15} /><span><small>掩护业务收入</small><strong>£{projectedIncome}/周</strong></span></article><article><Building2 size={15} /><span><small>设施维护</small><strong>£{facilityCost}/周</strong></span></article><article><UsersRound size={15} /><span><small>部门预算</small><strong>£{departmentCost}/周</strong></span></article><article><CircleDollarSign size={15} /><span><small>当前现金</small><strong>£{game.money}</strong></span></article></div>
    <div className="organization-condition-list">{game.organizationConditions.map((condition) => <span key={condition}><ShieldAlert size={12} />{condition}</span>)}</div>
    {latest && <footer><span>上周账目</span><p>掩护收入 £{latest.coverIncome} + 委托收入 £{latest.contractIncome} − 行动 £{latest.actionCost} − 设施 £{latest.facilityCost} − 部门 £{latest.departmentCost}</p><strong>期末 £{latest.balance}</strong></footer>}
    <div className="member-alignment"><header><UsersRound size={14} /><strong>成员留下的理由</strong><small>命令与章程会分别改变信任、利益和理念</small></header>{game.members.map((member) => <article key={member.id}><span>{member.name}</span><label>信任 <b>{member.trust ?? member.loyalty}</b></label><label>利益 <b>{member.interest ?? member.loyalty}</b></label><label>理念 <b>{member.ideology ?? member.loyalty}</b></label></article>)}</div>
  </section>;
}
