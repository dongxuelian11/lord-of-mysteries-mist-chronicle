"use client";

import { useMemo, useState } from "react";
import { ArchiveRestore, BriefcaseBusiness, Building2, FlaskConical, Search, ShieldAlert, UserRoundCog, UsersRound } from "lucide-react";
import type { GameState } from "./game-model";
import {
  activeScreeningManpower,
  allocateManpower,
  assignGovernanceOffice,
  commandBranchResponse,
  configureSealedArtifact,
  duplicateVerifiedFormula,
  establishBranch,
  exchangeFormulaCopy,
  researchFormula,
  selectPromotionCandidate,
  startCandidateScreening,
  updateBranchAssignment,
  type BranchPolicy,
  type ManpowerAllocation,
  type OrganizationManagementState,
} from "./organization-management";

const ALLOCATION_LABELS: Record<keyof ManpowerAllocation, string> = {
  headquarters: "本部与内务",
  intelligence: "情报探查",
  resources: "资源经营",
  security: "安全与行动",
  branches: "分部驻扎",
};

const POLICY_LABELS: Record<BranchPolicy, string> = {
  money: "经营资金",
  manpower: "发展人脉",
  extraordinaryMaterials: "搜集非凡材料",
  intelligence: "持续提供情报",
  "stabilize-control": "巩固区域控制",
};

type Props = {
  game: GameState;
  onChange: (management: OrganizationManagementState, message: string) => void;
  onPromote: (candidateId: string, formulaId: string, costs: { money: number; extraordinaryMaterials: number }) => void;
  onAdvanceMember: (memberId: string, formulaId: string) => void;
  onPropose: (intent: string, districtId?: string) => void;
};

export default function OrganizationManagementConsole({ game, onChange, onPromote, onAdvanceMember, onPropose }: Props) {
  const management = game.management;
  const [allocation, setAllocation] = useState<ManpowerAllocation>({ ...management.manpowerAllocation });
  const [screeningManpower, setScreeningManpower] = useState(3);
  const [screeningMoney, setScreeningMoney] = useState(30);
  const [candidateId, setCandidateId] = useState("");
  const [formulaId, setFormulaId] = useState("");
  const [advancementFormulaByMember, setAdvancementFormulaByMember] = useState<Record<string, string>>({});
  const [artifactCustodianById, setArtifactCustodianById] = useState<Record<string, string>>({});
  const controlledBlocks = useMemo(() => management.map.districts.flatMap((district) => district.blocks
    .filter((block) => block.control >= 60)
    .map((block) => ({ district, block }))), [management.map]);
  const [branchTarget, setBranchTarget] = useState("");
  const [branchSupervisor, setBranchSupervisor] = useState("");
  const [branchManpower, setBranchManpower] = useState(4);
  const [branchPolicy, setBranchPolicy] = useState<BranchPolicy>("intelligence");
  const selectedFormula = management.formulas.find((formula) => formula.id === formulaId && formula.status === "verified");
  const promotionCost = selectedFormula
    ? { money: 45 + Math.max(0, 9 - selectedFormula.sequence) * 35, extraordinaryMaterials: 2 + Math.max(0, 9 - selectedFormula.sequence) * 2 }
    : { money: 0, extraordinaryMaterials: 0 };

  function commit(run: () => OrganizationManagementState, message: string) {
    try { onChange(run(), message); }
    catch (error) { onChange(management, error instanceof Error ? error.message : "这项管理命令无法执行"); }
  }

  return <section className="management-console complete-card" aria-labelledby="management-console-title">
    <header className="section-heading"><span><BriefcaseBusiness size={16} /><strong id="management-console-title">组织管理台</strong></span><small>只处理资源、人员和分部；复杂行动回到议会用自由命令下达</small></header>

    <div className="management-console-grid">
      <article className="management-command-card">
        <header><UsersRound size={15} /><strong>人力调配</strong><small>{Object.values(allocation).reduce((sum, value) => sum + value, 0)} / {management.resources.manpower}</small></header>
        <div className="management-allocation-list">{(Object.keys(ALLOCATION_LABELS) as (keyof ManpowerAllocation)[]).map((key) => <label key={key}><span>{ALLOCATION_LABELS[key]}</span><input type="number" min="0" max={management.resources.manpower} value={allocation[key]} onChange={(event) => setAllocation((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
        <button onClick={() => commit(() => allocateManpower(management, allocation), "人力调配已更新；新配置会影响下一次周结算")}>确认调配</button>
      </article>

      <article className="management-command-card">
        <header><FlaskConical size={15} /><strong>配方研究与流通</strong><small>线索 → 核验 → 提拔 / 交换</small></header>
        {management.formulas.length ? <div className="managed-beyonder-list">{management.formulas.map((formula) => <article key={formula.id}><div><strong>{formula.name}</strong><span>序列{formula.sequence} · {formula.status} · 进度 {formula.researchProgress ?? formula.reliability}% · 副本 {formula.duplicateCopies ?? 0}</span><small>{formula.loreEvidenceIds.length ? `知识库证据 ${formula.loreEvidenceIds.join("、")}` : "缺少知识库证据：研究最多推进到99，不能用于晋升"}</small></div><footer>{formula.status !== "verified" ? <button onClick={() => commit(() => researchFormula(management, formula.id, { money: 25, extraordinaryMaterials: 1 }), `已投入 £25 与 1 份材料研究“${formula.name}”`)}>投入研究</button> : <><button onClick={() => commit(() => duplicateVerifiedFormula(management, formula.id), `已制作“${formula.name}”的安全交易副本`)}>制作副本</button><button disabled={(formula.duplicateCopies ?? 0) < 1} onClick={() => commit(() => exchangeFormulaCopy(management, formula.id), `配方副本已交换为资金与材料`)}>交换副本</button></>}</footer></article>)}</div> : <p className="management-inline-status">尚无配方档案。情报或材料分部每三周会尝试带回一条调查线索。</p>}
      </article>

      <article className="management-command-card">
        <header><ArchiveRestore size={15} /><strong>封印物收容</strong><small>收益伴随持续费用与事故风险</small></header>
        {management.sealedArtifacts.length ? <div className="managed-beyonder-list">{management.sealedArtifacts.map((artifact) => <article key={artifact.id}><div><strong>{artifact.name} · {artifact.status ?? "unidentified"}</strong><span>维持 £{artifact.weeklyMoneyCost ?? artifact.containmentCost}/周 · 风险 {artifact.risk ?? 35}</span><small>{artifact.dangerSummary}</small></div><footer><select value={artifactCustodianById[artifact.id] ?? artifact.custodianId ?? ""} onChange={(event) => setArtifactCustodianById((current) => ({ ...current, [artifact.id]: event.target.value }))}><option value="">不指定保管人</option>{game.members.filter((member) => member.status !== "阵亡").map((member) => <option key={member.id} value={member.id}>{member.name} · 序列{member.sequence}</option>)}</select><button onClick={() => commit(() => configureSealedArtifact(management, artifact.id, { contained: true, custodianId: artifactCustodianById[artifact.id] ?? artifact.custodianId }), `${artifact.name}已进入正式收容`)}>收容 / 调整保管</button></footer></article>)}</div> : <p className="management-inline-status">库存中的封印物会在周结算时进入收容台账；未鉴定物不会自动提供收益。</p>}
      </article>

      <article className="management-command-card">
        <header><UserRoundCog size={15} /><strong>四项职务</strong><small>同一成员只能主管一项</small></header>
        <div className="management-office-controls">{management.offices.map((office) => <label key={office.id}><span>{office.name}</span><select value={office.incumbentId ?? ""} onChange={(event) => commit(() => assignGovernanceOffice(management, office.id, event.target.value), `${office.name}负责人已调整`)}><option value="">尚未任命</option>{game.members.filter((member) => member.status !== "阵亡").map((member) => <option value={member.id} key={member.id}>{member.name} · 序列{member.sequence ?? "?"}</option>)}</select></label>)}</div>
      </article>

      <article className="management-command-card">
        <header><Search size={15} /><strong>筛选提拔对象</strong><small>占用一周，不永久消耗人力</small></header>
        {management.screeningProjects.some((project) => project.status === "active") ? <p className="management-inline-status">正在筛选中：占用本部 {activeScreeningManpower(management)} 人，下周提交具名档案。</p> : <div className="management-screening-controls"><label><span>调用本部人力</span><input type="number" min="3" max="5" value={screeningManpower} onChange={(event) => setScreeningManpower(Number(event.target.value))} /></label><label><span>核验经费</span><input type="number" min="20" step="5" value={screeningMoney} onChange={(event) => setScreeningMoney(Number(event.target.value))} /></label><button onClick={() => commit(() => startCandidateScreening(management, { week: game.week, manpower: screeningManpower, moneyCost: screeningMoney }), "筛选项目已启动；事实将在下周结算后产生")}>启动筛选</button></div>}
        <div className="management-candidate-list">{management.candidates.filter((candidate) => candidate.status === "screened" || candidate.status === "selected").map((candidate) => <button className={candidate.status === "selected" ? "selected" : ""} key={candidate.id} onClick={() => { setCandidateId(candidate.id); commit(() => selectPromotionCandidate(management, candidate.id), `已选中 ${candidate.name}，尚未服用魔药`); }}><strong>{candidate.name}</strong><span>{candidate.background} · {candidate.aptitude}</span><small>{candidate.predicamentTrait}</small></button>)}</div>
        {candidateId && <div className="management-promotion"><select value={formulaId} onChange={(event) => setFormulaId(event.target.value)}><option value="">选择已验证的序列9配方</option>{management.formulas.filter((formula) => formula.status === "verified" && formula.sequence === 9).map((formula) => <option value={formula.id} key={formula.id}>{formula.name} · 序列{formula.sequence}</option>)}</select><button disabled={!selectedFormula || selectedFormula.sequence !== 9} onClick={() => onPromote(candidateId, formulaId, promotionCost)}><FlaskConical size={13} />提拔 · £{promotionCost.money} / 材料{promotionCost.extraordinaryMaterials}</button></div>}
        {!management.formulas.some((formula) => formula.status === "verified") && <button className="management-text-action" onClick={() => onPropose("命令情报负责人整理现有线索，寻找并核验一份适合提拔基层成员的序列9魔药配方；所有配方内容必须由知识库验证后才能入账。")}>向议会提出“搜集并核验配方”</button>}
        {(management.beyonderDevelopment ?? []).length > 0 && <div className="managed-beyonder-list"><header><FlaskConical size={13} /><strong>成员消化与失控监护</strong></header>{management.beyonderDevelopment.map((record) => { const member = game.members.find((item) => item.id === record.memberId); const targetSequence = record.sequence - 1; const formulas = management.formulas.filter((formula) => formula.pathwayId === record.pathwayId && formula.sequence === targetSequence && formula.status === "verified" && formula.loreEvidenceIds.length > 0); return <article key={record.memberId}><div><strong>{member?.name ?? record.memberId} · 序列{record.sequence}</strong><span>消化 {record.digestion}% · 监护 {record.supervision} · 失控风险 {record.instability}</span><small>{record.status === "ready" ? "已准备好；是否晋升由玩家决定" : record.status === "unstable" ? "晋升冻结：先加强监护或安排休养" : "由内务负责人持续监护，每周自动推进消化"}</small></div>{record.status === "ready" && targetSequence >= 0 && <footer><select value={advancementFormulaByMember[record.memberId] ?? ""} onChange={(event) => setAdvancementFormulaByMember((current) => ({ ...current, [record.memberId]: event.target.value }))}><option value="">选择序列{targetSequence}已验证配方</option>{formulas.map((formula) => <option key={formula.id} value={formula.id}>{formula.name}</option>)}</select><button disabled={!advancementFormulaByMember[record.memberId]} onClick={() => onAdvanceMember(record.memberId, advancementFormulaByMember[record.memberId])}>批准晋升</button></footer>}</article>; })}</div>}
      </article>

      <article className="management-command-card">
        <header><Building2 size={15} /><strong>建立分部</strong><small>区块控制力达到 60 后开放</small></header>
        {controlledBlocks.length ? <div className="management-branch-controls"><select value={branchTarget} onChange={(event) => setBranchTarget(event.target.value)}><option value="">选择受控区块</option>{controlledBlocks.map(({ district, block }) => <option key={block.id} value={`${district.id}:${block.id}`}>{district.name} · {block.name}（{block.control}）</option>)}</select><select value={branchSupervisor} onChange={(event) => setBranchSupervisor(event.target.value)}><option value="">选择分部主管</option>{game.members.filter((member) => member.pathway && member.status !== "阵亡").map((member) => <option key={member.id} value={member.id}>{member.name} · 序列{member.sequence}</option>)}</select><label><span>驻扎人力</span><input type="number" min="4" value={branchManpower} onChange={(event) => setBranchManpower(Number(event.target.value))} /></label><select value={branchPolicy} onChange={(event) => setBranchPolicy(event.target.value as BranchPolicy)}>{(Object.keys(POLICY_LABELS) as BranchPolicy[]).map((policy) => <option value={policy} key={policy}>{POLICY_LABELS[policy]}</option>)}</select><button onClick={() => { const [districtId, blockId] = branchTarget.split(":"); commit(() => establishBranch(management, { districtId, blockId, supervisorId: branchSupervisor, stationedManpower: branchManpower, policy: branchPolicy }), "分部筹建命令已下达；下周完成初步驻扎"); }}>下达筹建命令</button></div> : <p className="management-inline-status"><ShieldAlert size={13} />尚无控制力达到 60 的区块。先在议会针对战略点部署行动。</p>}
        {management.branches.filter((branch) => branch.status !== "lost").length > 0 && <div className="branch-management-list">{management.branches.filter((branch) => branch.status !== "lost").map((branch) => { const district = management.map.districts.find((item) => item.id === branch.districtId); const block = district?.blocks.find((item) => item.id === branch.blockId); return <article key={branch.id}><header><span><strong>{branch.name}</strong><small>{district?.name} · {block?.name} · 控制{block?.control ?? 0}</small></span><b className={branch.status}>{branch.status}</b></header><div><label><span>主管</span><select value={branch.supervisorId} disabled={branch.status === "evacuating"} onChange={(event) => commit(() => updateBranchAssignment(management, branch.id, { supervisorId: event.target.value }), "分部主管与交接费用已更新")} >{game.members.filter((member) => member.pathway && member.status !== "阵亡").map((member) => <option key={member.id} value={member.id}>{member.name} · 序列{member.sequence}</option>)}</select></label><label><span>方针</span><select value={branch.policy} disabled={branch.status === "evacuating"} onChange={(event) => commit(() => updateBranchAssignment(management, branch.id, { policy: event.target.value as BranchPolicy }), "分部经营方针已更新")}>{(Object.keys(POLICY_LABELS) as BranchPolicy[]).map((policy) => <option value={policy} key={policy}>{POLICY_LABELS[policy]}</option>)}</select></label></div><footer><span>驻扎人力 {branch.stationedManpower} · 控制支援 {branch.controlSupport}</span>{branch.status === "threatened" && <><button onClick={() => commit(() => commandBranchResponse(management, branch.id, "reinforce", game.week), "增援已送出，将提高分部控制支援")}>增援 £45</button><button onClick={() => commit(() => commandBranchResponse(management, branch.id, "restore", game.week), "分部已恢复运作")}>恢复 £30</button></>}<button disabled={branch.status === "evacuating"} onClick={() => commit(() => commandBranchResponse(management, branch.id, "evacuate", game.week), "分部进入撤离状态；下周释放主管与驻扎人力")}>{branch.status === "evacuating" ? "撤离中" : "启动撤离"}</button></footer></article>; })}</div>}
      </article>
    </div>
  </section>;
}
