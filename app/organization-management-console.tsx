"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, BookKey, Building2, ChevronRight, CircleDollarSign, FlaskConical,
  Gem, MapPinned, MessageSquareText, ShieldAlert, Sparkles, UserRoundCog, UsersRound, X,
} from "lucide-react";
import type { GameState } from "./game-model";
import {
  assignGovernanceOffice,
  BACKLUND_FACTION_CATALOG,
  selectPromotionCandidate,
  type OrganizationManagementState,
} from "./organization-management";
import {
  attentionAutomationCandidates,
  confirmAttentionAutomation,
  focusAttention,
  projectAttentionForPlayer,
  type AttentionSimulationState,
} from "./attention-simulation";

type Props = {
  game: GameState;
  onChange: (management: OrganizationManagementState, message: string) => void;
  onAttentionChange: (attentionSimulation: AttentionSimulationState, message: string) => void;
  onPromote: (candidateId: string, formulaId: string, costs: { money: number; extraordinaryMaterials: number }) => void;
  onAdvanceMember: (memberId: string, formulaId: string) => void;
  onPropose: (intent: string, districtId?: string) => void;
  onTalk: (memberId: string, seed?: string) => void;
  onClose?: () => void;
};

function reputationLabel(score: number) {
  if (score >= 75) return "声名远播";
  if (score >= 50) return "广受承认";
  if (score >= 25) return "地方有名";
  return "尚未成名";
}

function exposureLabel(exposure: number) {
  if (exposure >= 70) return "身份链濒临暴露";
  if (exposure >= 45) return "多方正在交叉核验";
  if (exposure >= 20) return "已留下可追查痕迹";
  return "痕迹仍较分散";
}

function pressureLabel(score: number) {
  if (score >= 75) return "正在形成直接反制";
  if (score >= 45) return "已经出现持续盯防";
  if (score >= 20) return "留下零散摩擦";
  return "尚未形成明确反制";
}

function controlLabel(control: number) {
  if (control >= 75) return "稳固优势";
  if (control >= 50) return "局部优势";
  if (control >= 25) return "正在建立";
  return "尚未形成网络";
}

export default function OrganizationManagementConsole({ game, onChange, onAttentionChange, onPromote, onAdvanceMember, onPropose, onTalk, onClose }: Props) {
  const management = game.management;
  const [formulaByCandidate, setFormulaByCandidate] = useState<Record<string, string>>({});
  const [formulaByMember, setFormulaByMember] = useState<Record<string, string>>({});
  const promotionCandidates = management.candidates.filter((candidate) => candidate.status === "screened" || candidate.status === "selected");
  const verifiedSequenceNine = management.formulas.filter((formula) => formula.status === "verified" && formula.sequence === 9);
  const mostHostile = [...management.factionHostility].sort((left, right) => right.hostility - left.hostility)[0];
  const hostileName = BACKLUND_FACTION_CATALOG.find((faction) => faction.id === mostHostile?.factionId)?.name ?? mostHostile?.factionId ?? "尚无明确敌手";
  const bestDistrict = [...management.map.districts].sort((left, right) => right.control - left.control)[0];
  const activeBranches = management.branches.filter((branch) => branch.status !== "lost");
  const internalAffairs = management.offices.find((office) => office.id === "internal-affairs");
  const internalAffairsId = internalAffairs?.incumbentId ?? internalAffairs?.actingMemberId;
  const readyMembers = management.beyonderDevelopment.filter((record) => record.status === "ready");
  const currentEffects = management.lastConsequenceReport?.effects.slice(0, 3) ?? [];
  const allocatedManpower = Object.values(management.manpowerAllocation).reduce((sum, value) => sum + value, 0);
  const unallocatedManpower = Math.max(0, management.resources.manpower - allocatedManpower);
  const attentionProjection = projectAttentionForPlayer(game);
  const attentionCandidates = attentionAutomationCandidates(game);
  const attentionState = game.attentionSimulation;

  const controlledPoints = useMemo(() => management.map.districts.reduce((sum, district) => sum + district.blocks.reduce((blockSum, block) => blockSum + block.strategicPoints.filter((point) => (point.influenceByFaction.player ?? 0) >= 50).length, 0), 0), [management.map]);

  function commit(run: () => OrganizationManagementState, message: string) {
    try { onChange(run(), message); }
    catch (error) { onChange(management, error instanceof Error ? error.message : "这项管理命令无法执行"); }
  }

  function commitAttention(run: () => AttentionSimulationState, message: string) {
    try { onAttentionChange(run(), message); }
    catch (error) {
      onAttentionChange(attentionState ?? { version: 1, approvals: [], focusRefs: [], reopenedRefs: [], lastWeek: 0, backgroundSummaries: [] }, error instanceof Error ? error.message : "注意力设置无法执行");
    }
  }

  function requestCandidates() {
    if (!internalAffairsId) return;
    onTalk(internalAffairsId, "请从现有基层人力中筛选本回合适合提拔为非凡者的人选。你自行决定需要调用多少本部人力和核验经费，当场把具名档案交给我；不要拖到下一周。");
  }

  return <section className="organization-ledger" aria-labelledby="organization-ledger-title">
    <header className="organization-ledger-head">
      <div><p>议桌内页 · 组织经营账簿</p><h2 id="organization-ledger-title">{game.organizationName}</h2><span>只看资源、负责人和需要你决定的异常；日常执行由四名负责人自行处理。</span></div>
      {onClose && <button className="ledger-close" onClick={onClose} aria-label="合上组织账簿"><X size={18} /></button>}
    </header>

    <div className="ledger-resource-strip" aria-label="三项基础资源">
      <article><UsersRound size={18} /><span><small>基层人力</small><strong>{management.resources.manpower}</strong><em>{unallocatedManpower ? `${unallocatedManpower}人尚未编组` : "已全部编入本部、业务或分部"}</em></span></article>
      <article><CircleDollarSign size={18} /><span><small>可用资金</small><strong>£{management.resources.money}</strong><em>筛选、分部、收容与行动共用</em></span></article>
      <article><Gem size={18} /><span><small>非凡材料</small><strong>{management.resources.extraordinaryMaterials}</strong><em>提拔、晋升与神秘资产共用</em></span></article>
    </div>

    <section className="ledger-attention" aria-label="注意力驱动运行">
      <header><Sparkles size={16} /><div><strong>注意力决定展开粒度</strong><small>世界始终运行；你只在需要时重新展开人物、地点与情报。</small></div></header>
      <p>{attentionProjection.notice}</p>
      {attentionCandidates.some((candidate) => candidate.ready && !attentionProjection.items.some((item) => item.id === candidate.id)) && <div className="ledger-attention-candidates"><strong>已稳定的工作方式</strong>{attentionCandidates.filter((candidate) => candidate.ready && !attentionProjection.items.some((item) => item.id === candidate.id)).slice(0, 3).map((candidate) => <article key={candidate.id}><span><b>{candidate.label}</b><small>{candidate.reason}</small></span><button onClick={() => commitAttention(() => confirmAttentionAutomation(attentionState, candidate, game.week), "已确认：这项成熟流程会在原授权内自动运行")}>确认自动运行</button></article>)}</div>}
      {attentionProjection.backgroundSummaries.length > 0 && <div className="ledger-attention-summaries"><strong>你没有关注时，世界留下的简短回响</strong>{attentionProjection.backgroundSummaries.map((summary) => <span key={summary}>{summary}</span>)}</div>}
      {attentionProjection.items.length > 0 && <div className="ledger-attention-items">{attentionProjection.items.slice(0, 4).map((item) => {
        const candidate = attentionCandidates.find((option) => option.id === item.id);
        const resumable = item.mode !== "自动运行" && Boolean(candidate?.ready);
        return <article key={item.id} className={item.mode === "需要你关注" ? "needs-review" : item.focused ? "focused" : ""}><span><b>{item.label}</b><small>{item.mode} · {item.detail}</small></span><button onClick={() => commitAttention(() => resumable && candidate ? confirmAttentionAutomation(attentionState, candidate, game.week) : focusAttention(attentionState, item.id), resumable ? "已恢复：这项流程会在原授权内继续自动运行" : item.mode === "自动运行" ? "已重新展开这项工作方式；现在可以查看负责人、地点与情报" : "已把这项异常重新放回你的注意力范围")}>{resumable ? "确认继续自动运行" : item.focused ? "已展开" : "重新展开"}</button></article>;
      })}</div>}
      <small className="ledger-attention-footnote">关注不会提供数值加成，也不会让你回到过去改写结果；已确认的边界才会自动运行，异常会回到三件大事。</small>
    </section>

    <section className="ledger-causal-row" aria-label="会持续产生后果的组织状态">
      <article><header><Sparkles size={14} /><strong>组织声望</strong></header><p>{reputationLabel(management.reputation.score)}</p><small>提高合作质量与筛选档案数量，也会传播组织名号。</small></article>
      <article className={management.exposure >= 45 ? "warning" : ""}><header><ShieldAlert size={14} /><strong>暴露边界</strong></header><p>{exposureLabel(management.exposure)}</p><small>{management.exposureEvidence.length ? "已有可追查证据影响敌方侦测。" : "尚未形成可追查证据。"}</small></article>
      <article className={(mostHostile?.hostility ?? 0) >= 50 ? "danger" : ""}><header><AlertTriangle size={14} /><strong>外部压力（敌意）</strong></header><p>{hostileName}</p><small>{pressureLabel(mostHostile?.hostility ?? 0)} · {mostHostile?.responseStyle ?? "暂未形成明确反制方式"}</small></article>
      <article><header><MapPinned size={14} /><strong>控制网络</strong></header><p>{bestDistrict?.name ?? "贝克兰德"}</p><small>{controlLabel(bestDistrict?.control ?? 0)}；{controlledPoints ? "已有战略点响应组织影响。" : "尚无战略点形成稳定优势。"}</small></article>
    </section>

    {currentEffects.length > 0 && <aside className="ledger-live-effects"><strong>这些数值本周实际造成了：</strong>{currentEffects.map((effect) => <span key={effect}>{effect}</span>)}</aside>}

    <div className="ledger-main-grid">
      <section className="ledger-offices">
        <header><div><UserRoundCog size={16} /><span><strong>四名负责人</strong><small>改人、问话、授权；没有五层部门菜单</small></span></div></header>
        <div>{management.offices.map((office) => {
          const incumbentId = office.incumbentId ?? office.actingMemberId ?? "";
          const incumbent = game.members.find((member) => member.id === incumbentId);
          return <article key={office.id}>
            <div className="office-seal">{office.name.slice(0, 1)}</div>
            <span><small>{office.name}负责人</small><strong>{incumbent?.name ?? "尚未任命"}</strong><p>{office.responsibility}</p></span>
            <button disabled={!incumbent} onClick={() => incumbent && onTalk(incumbent.id, `只从你负责的“${office.name}”事务中，告诉我本回合最值得注意的一件事；说明依据、未知和是否需要我决定。`)}><MessageSquareText size={13} />交谈</button>
            <label><span>调整人选</span><select value={incumbentId} onChange={(event) => commit(() => assignGovernanceOffice(management, office.id, event.target.value), `${office.name}负责人已调整；治理贡献会在结算时按序列、专长、疲劳和在岗情况重算`)}><option value="">空缺</option>{game.members.filter((member) => member.status !== "阵亡").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.pathway ? `序列${member.sequence}` : "普通人"}</option>)}</select></label>
          </article>;
        })}</div>
      </section>

      <details className="ledger-detail ledger-promotion-detail">
        <summary><FlaskConical size={16} /><span><strong>需要时处理：提拔普通人为非凡者</strong><small>打开后筛选人选、选择已核验配方并确认实际投入</small></span><ChevronRight size={15} /></summary>
        <section className="ledger-promotion">
          <header><div><FlaskConical size={16} /><span><strong>提拔普通人为非凡者</strong><small>当回合筛选，当回合决定；只消耗实际资源</small></span></div><button onClick={requestCandidates} disabled={!internalAffairsId}><MessageSquareText size={13} />向内务负责人索取人选</button></header>
          {!internalAffairsId && <p className="ledger-empty"><ShieldAlert size={14} />先在左侧任命内务负责人，才能通过对话筛选基层人选。</p>}
          {internalAffairsId && promotionCandidates.length === 0 && <p className="ledger-empty">账簿上还没有待定人选。与内务负责人交谈并提出筛选要求，档案会在本回合直接送达。</p>}
          {promotionCandidates.length > 0 && <div className="ledger-candidates">{promotionCandidates.map((candidate) => {
            const formulaId = formulaByCandidate[candidate.id] ?? "";
            const formula = verifiedSequenceNine.find((item) => item.id === formulaId);
            const cost = formula ? { money: 45, extraordinaryMaterials: 2 } : { money: 0, extraordinaryMaterials: 0 };
            return <article key={candidate.id} className={candidate.status === "selected" ? "selected" : ""}>
              <button className="candidate-profile" onClick={() => commit(() => selectPromotionCandidate(management, candidate.id), `${candidate.name}已进入提拔待定名单，尚未服用魔药`)}><span><strong>{candidate.name}</strong><small>{candidate.background} · {candidate.aptitude}</small></span><ChevronRight size={14} /></button>
              <p>{candidate.predicamentTrait}</p>
              <footer><select aria-label={`为${candidate.name}选择配方`} value={formulaId} onChange={(event) => setFormulaByCandidate((current) => ({ ...current, [candidate.id]: event.target.value }))}><option value="">选择已核验序列9配方</option>{verifiedSequenceNine.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={candidate.status !== "selected" || !formula} onClick={() => onPromote(candidate.id, formulaId, cost)}>提拔 · £{cost.money} / 材料{cost.extraordinaryMaterials}</button></footer>
            </article>;
          })}</div>}
          {!verifiedSequenceNine.length && <button className="ledger-direction" onClick={() => { onClose?.(); onPropose("命令情报负责人搜集并核验一份适合提拔基层成员的序列9魔药配方。配方内容和晋升条件必须经过知识库验证；先回报来源、代价和可能争夺者。", bestDistrict?.id); }}><BookKey size={14} />把“搜集并核验配方”带回议桌</button>}
        </section>
      </details>
    </div>

    <details className="ledger-detail ledger-assets-detail">
      <summary><BookKey size={16} /><span><strong>按需展开：配方、封印物与分部</strong><small>只有需要使用或处理异常时才展开详细资产</small></span><ChevronRight size={15} /></summary>
      <section className="ledger-assets">
        <article><header><BookKey size={15} /><strong>非凡配方</strong><b>{management.formulas.length}</b></header>{management.formulas.slice(0, 4).map((formula) => <p key={formula.id}><span>{formula.name}</span><small>序列{formula.sequence} · {formula.status === "verified" ? "已核验，可使用" : formula.status === "fragment" ? "残片" : formula.status === "lead" ? "线索" : `核验${formula.researchProgress ?? formula.reliability}%`}</small></p>)}{!management.formulas.length && <small>尚无配方档案；请向情报负责人下达搜集方向。</small>}</article>
        <article><header><Gem size={15} /><strong>封印物</strong><b>{management.sealedArtifacts.length}</b></header>{management.sealedArtifacts.slice(0, 3).map((artifact) => <p key={artifact.id}><span>{artifact.name}</span><small>{artifact.status ?? "未鉴定"} · 风险{artifact.risk ?? 35} · £{artifact.weeklyMoneyCost ?? artifact.containmentCost}/周</small></p>)}{!management.sealedArtifacts.length && <small>尚无需要持续收容的封印物。</small>}</article>
        <article><header><Building2 size={15} /><strong>分部</strong><b>{activeBranches.length}</b></header>{activeBranches.slice(0, 3).map((branch) => { const district = management.map.districts.find((item) => item.id === branch.districtId); const block = district?.blocks.find((item) => item.id === branch.blockId); return <p key={branch.id}><span>{branch.name}</span><small>{district?.name} · {block?.name} · {branch.status} · 驻扎{branch.stationedManpower}人</small></p>; })}{!activeBranches.length && <small>控制区块达到60后，可在地图中选择主管并建立自治分部。</small>}</article>
      </section>
    </details>

    {readyMembers.length > 0 && <details className="ledger-ready"><summary>有 {readyMembers.length} 名成员已完成消化，可决定是否晋升</summary>{readyMembers.map((record) => { const member = game.members.find((item) => item.id === record.memberId); const targetSequence = record.sequence - 1; const formulas = management.formulas.filter((formula) => formula.pathwayId === record.pathwayId && formula.sequence === targetSequence && formula.status === "verified"); return <article key={record.memberId}><span><strong>{member?.name ?? record.memberId}</strong><small>目标序列{targetSequence} · 当前失控风险{record.instability}</small></span><select value={formulaByMember[record.memberId] ?? ""} onChange={(event) => setFormulaByMember((current) => ({ ...current, [record.memberId]: event.target.value }))}><option value="">选择已核验配方</option>{formulas.map((formula) => <option key={formula.id} value={formula.id}>{formula.name}</option>)}</select><button disabled={!formulaByMember[record.memberId]} onClick={() => onAdvanceMember(record.memberId, formulaByMember[record.memberId])}>批准晋升</button></article>; })}</details>}
  </section>;
}
