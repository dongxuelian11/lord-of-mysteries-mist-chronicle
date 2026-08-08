"use client";

import { useMemo, useState } from "react";
import { Anchor, ArrowLeft, ArrowRight, Check, Eye, Feather, KeyRound, Landmark, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { FOUNDING_SITUATIONS, GameState, ORGANIZATION_KINDS, PATHWAYS, PathwayId, PlayerOrigin } from "./game-model";
import { buildOpeningCandidatePool } from "./opening-candidates";
import { PATHWAY_OPENING_DOSSIERS } from "./pathway-catalog";

type Props = {
  game: GameState;
  onBegin: (name: string, address: string, pathwayId: PathwayId, origin: PlayerOrigin) => void;
};

const IDENTITIES = [
  { id: "investigator", label: "私人调查事务所经营者", detail: "合法委托、失物寻回与背景核查提供稳定掩护。", boon: "容易接触案件与委托人", debt: "每个异常行动都可能污染公开声誉" },
  { id: "doctor", label: "社区医生", detail: "以诊所和慈善病例进入南区与东区家庭。", boon: "医疗、病例与基层信任", debt: "病人和组织安全经常发生冲突" },
  { id: "journalist", label: "报社撰稿人", detail: "依靠采访、剪报和匿名消息追逐城市暗面。", boon: "公开信息与社会议题", debt: "消息来源会反过来试探你" },
  { id: "merchant", label: "进出口商人", detail: "仓储、货单与海外渠道构成组织的经济外壳。", boon: "材料、资金和码头关系", debt: "旧合同与灰色客户不会消失" },
  { id: "scholar", label: "神秘学研究者", detail: "以翻译、民俗与古文献研究掩盖知识追索。", boon: "档案、仪式语言和大学关系", debt: "知识更容易进入教会视野" },
  { id: "noble", label: "贵族旁支", detail: "拥有体面姓氏，却没有足以免除义务的权力。", boon: "上流社交与合法身份", debt: "家族会要求回报，并监督你的选择" },
];

const EXPERIENCES = [
  { id: "mutual-aid", label: "处理过东区失踪案", detail: "你曾替互助会寻找一名没有进入警察记录的失踪女工。" },
  { id: "south-war", label: "南大陆战地经历", detail: "你见过殖民军、佣兵和教会医院怎样处理无法公开的伤口。" },
  { id: "church-periphery", label: "教会外围协作者", detail: "你接受过基础保密训练，也知道官方程序会把哪些人挡在门外。" },
  { id: "bankrupt-house", label: "破产家族的继承人", detail: "你继承了债务、旧关系和一份来源可疑的财产清单。" },
  { id: "sea-return", label: "五海归来者", detail: "你带回口音、海图和几位不愿在白天拜访的旧识。" },
  { id: "safah-past", label: "源堡苏醒的过去之人", detail: "你记得另一个时代的生活碎片，但不知道完整原著真相；某些高位存在可能注意这种不协调。" },
];

const SYMBOLS = ["钥匙与封蜡", "闭合的眼与雾线", "渡鸦羽与铜环", "断桥与北辰", "空椅与双重门", "无字书页与锚"];
export default function OpeningPrologue({ game, onBegin }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(game.playerName);
  const [address, setAddress] = useState(game.playerAddress || "会长阁下");
  const [pathwayId, setPathwayId] = useState<PathwayId>(game.pathwayId);
  const [startingSequence, setStartingSequence] = useState<8 | 9>(9);
  const [identityId, setIdentityId] = useState("investigator");
  const [experienceId, setExperienceId] = useState("mutual-aid");
  const [experienceDetail, setExperienceDetail] = useState("");
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [memberIds, setMemberIds] = useState(["opening-ada", "opening-silas", "opening-miriam", "opening-jonas"]);
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [orgName, setOrgName] = useState("鸦羽侦探事务所");
  const [orgKind, setOrgKind] = useState("detective");
  const [foundingSituationId, setFoundingSituationId] = useState<"scratch" | "remnant" | "patronage">("scratch");
  const [orgCharter, setOrgCharter] = useState("保护组织成员与无辜者；证据不足时不公开指控；未知高位威胁下优先撤退。");
  const identity = IDENTITIES.find((item) => item.id === identityId)!;
  const experience = EXPERIENCES.find((item) => item.id === experienceId)!;
  const orgKindInfo = ORGANIZATION_KINDS.find((item) => item.id === orgKind)!;
  const foundingSituation = FOUNDING_SITUATIONS.find((item) => item.id === foundingSituationId)!;
  const candidatePool = useMemo(() => buildOpeningCandidatePool({ playerPathwayId: pathwayId, identityId, experienceId }), [pathwayId, identityId, experienceId]);
  const sequence = PATHWAYS[pathwayId].sequences.find((item) => item.rank === startingSequence)!;
  const selectedMembers = candidatePool.filter((item) => memberIds.includes(item.id));
  const extraordinaryCount = selectedMembers.filter((item) => item.pathway).length;
  const valid = name.trim().length >= 2 && address.trim().length >= 2 && gender.trim().length >= 1 && orgName.trim().length >= 2 && memberIds.length === 4 && extraordinaryCount === 4;
  const symbolCandidates = useMemo(() => {
    const seed = IDENTITIES.findIndex((item) => item.id === identityId) + EXPERIENCES.findIndex((item) => item.id === experienceId) + Object.keys(PATHWAYS).indexOf(pathwayId);
    return [SYMBOLS[seed % SYMBOLS.length], SYMBOLS[(seed + 2) % SYMBOLS.length], SYMBOLS[(seed + 4) % SYMBOLS.length]];
  }, [identityId, experienceId, pathwayId]);

  function toggleMember(id: string) {
    setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current);
  }

  function selectOrgKind(id: string) {
    const next = ORGANIZATION_KINDS.find((item) => item.id === id)!;
    setOrgKind(id);
    if (orgName === orgKindInfo.defaultName) setOrgName(next.defaultName);
  }

  function finish() {
    if (!valid) return;
    onBegin(name.trim(), address.trim(), pathwayId, { identityId, identityLabel: identity.label, experienceId, experienceLabel: experience.label, experienceDetail: experienceDetail.trim(), symbol, foundingMemberIds: memberIds, foundingMembers: selectedMembers, startingSequence, gender: gender.trim(), age: age.trim(), organizationName: orgName.trim(), organizationKind: orgKind, organizationKindLabel: orgKindInfo.name, organizationCharter: orgCharter.trim(), foundingSituationId });
  }

  return <div className="prologue-backdrop">
    <section className="origin-builder" role="dialog" aria-modal="true" aria-labelledby="prologue-title">
      <aside className="origin-symbol-card">
        <div className="symbol-orbit"><span /><i /><b /></div>
        <small>人物象征档案</small><div className="symbol-glyph" aria-hidden="true"><Eye size={52} /><KeyRound size={34} /></div><h2>{symbol}</h2>
        <dl><div><dt>姓名</dt><dd>{name || "尚未留下"}</dd></div><div><dt>身份</dt><dd>{identity.label}</dd></div><div><dt>经历</dt><dd>{experience.label}</dd></div><div><dt>途径</dt><dd>序列{startingSequence} · {sequence.name}</dd></div><div><dt>性别 · 年龄</dt><dd>{gender || "未填"} · {age || "未填"}</dd></div><div><dt>组织</dt><dd>{orgName || "尚未命名"}</dd></div></dl>
        <div className="founder-marks">{selectedMembers.map((member) => <span key={member.id} title={member.name}>{member.name.slice(0, 1)}</span>)}</div>
        <p>这是捏人界面的象征构图，不是塔罗牌，也不是世界内的神秘物品。</p>
      </aside>
      <div className="origin-content">
        <header><p>1349年6月30日 · 贝克兰德</p><h1 id="prologue-title">在第一场密议前，写下你是谁</h1><span>廷根的一名年轻人刚从死亡中醒来。数百里外，你的组织还不知道历史已经开始转动。</span></header>
        <nav className="origin-steps">{["身份", "经历", "途径", "班底", "入席"].map((label, index) => <button key={label} className={step === index ? "active" : step > index ? "done" : ""} onClick={() => setStep(index)}><span>{step > index ? <Check size={12} /> : index + 1}</span>{label}</button>)}</nav>

        {step === 0 && <section className="origin-step"><div className="step-heading"><Landmark size={18} /><div><h2>你以什么身份生活在贝克兰德？</h2><p>身份决定掩护、接触面、责任与旧关系；性别与年龄会影响称呼和首章细节。</p></div></div><div className="origin-choice-grid">{IDENTITIES.map((item) => <button key={item.id} className={identityId === item.id ? "selected" : ""} onClick={() => setIdentityId(item.id)}><strong>{item.label}</strong><p>{item.detail}</p><small>优势：{item.boon}</small><em>代价：{item.debt}</em></button>)}</div><div className="origin-personal-fields"><div className="gender-row"><span>性别</span>{["男", "女", "不便透露"].map((option) => <button key={option} className={gender === option ? "selected" : ""} onClick={() => setGender(option)}>{option}</button>)}</div><label className="age-field"><span>年龄</span><input value={age} onChange={(event) => setAge(event.target.value)} placeholder="例如：27" maxLength={8} /></label></div></section>}
        {step === 1 && <section className="origin-step"><div className="step-heading"><Feather size={18} /><div><h2>什么经历把你带到这里？</h2><p>系统会持续承认这段过去；强背景同时带来债务、追捕或责任。</p></div></div><div className="experience-list">{EXPERIENCES.map((item) => <button key={item.id} className={experienceId === item.id ? "selected" : ""} onClick={() => setExperienceId(item.id)}><strong>{item.label}</strong><p>{item.detail}</p></button>)}</div><label className="free-background"><span>补充你自己的具体经历</span><textarea value={experienceDetail} onChange={(event) => setExperienceDetail(event.target.value)} placeholder="例如：曾在南大陆做过三年战地医生，但隐瞒了一名幸存者的真实身份。" maxLength={320} /></label></section>}
        {step === 2 && <section className="origin-step"><div className="step-heading"><Sparkles size={18} /><div><h2>选择你的非凡途径</h2><p>22 条标准途径均可开局；具体能力、污染和来源受知识库约束。</p></div></div><div className="pathway-origin-grid">{Object.values(PATHWAYS).map((pathway) => <button key={pathway.id} className={pathwayId === pathway.id ? "selected" : ""} onClick={() => setPathwayId(pathway.id)}><span style={{ background: pathway.color }} /><strong>{pathway.name}</strong><small>序列9 · {pathway.sequences.find((item) => item.rank === 9)?.name}</small><p>{PATHWAY_OPENING_DOSSIERS[pathway.id].managementContribution}</p><em>{PATHWAY_OPENING_DOSSIERS[pathway.id].knownRisk}</em></button>)}</div><div className="symbol-picker"><span>开局层次</span><button className={startingSequence === 9 ? "selected" : ""} onClick={() => setStartingSequence(9)}>序列9 · 正常开局</button><button className={startingSequence === 8 ? "selected" : ""} onClick={() => setStartingSequence(8)}>序列8 · 带着既有负担</button></div><div className="symbol-picker"><span>从背景组合得到的象征构图</span>{symbolCandidates.map((item) => <button key={item} className={symbol === item ? "selected" : ""} onClick={() => setSymbol(item)}>{item}</button>)}</div></section>}
        {step === 3 && <section className="origin-step team-step"><div className="step-heading"><UsersRound size={18} /><div><h2>从 8 名具名非凡者中选择 4 名下属</h2><p>每人都有来源、经历与当前困境；特殊经历可能带来一名负担更重的序列7候选。</p></div><b className={memberIds.length === 4 && extraordinaryCount === 4 ? "valid" : ""}>{memberIds.length}/4 · 非凡者 {extraordinaryCount}/4</b></div><div className="founder-grid">{candidatePool.map((member) => <button key={member.id} className={memberIds.includes(member.id) ? "selected" : ""} onClick={() => toggleMember(member.id)}><header><span>{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>{member.role} · 序列{member.sequence} {member.pathway}</small></div>{memberIds.includes(member.id) && <Check size={14} />}</header><p>{member.specialty}</p><small>{member.core}</small></button>)}</div><div className="origin-organization"><div className="step-heading"><Landmark size={18} /><div><h2>给组织一个名字与定性</h2><p>类型决定第一项压力与开局基调；名字与章程会写进世界事实。</p></div></div><label className="org-name-field"><span>组织名称</span><input value={orgName} onChange={(event) => setOrgName(event.target.value)} placeholder="例如：鸦羽侦探事务所" maxLength={24} /></label><div className="org-kind-grid">{ORGANIZATION_KINDS.map((kind) => <button key={kind.id} className={orgKind === kind.id ? "selected" : ""} onClick={() => selectOrgKind(kind.id)}><strong>{kind.name}</strong><p>{kind.description}</p><small>优势：{kind.boon}</small><em>代价：{kind.debt}</em></button>)}</div><label className="org-charter-field"><span>一句话章程（可自由改写）</span><textarea value={orgCharter} onChange={(event) => setOrgCharter(event.target.value)} placeholder="组织存在的理由与底线…" maxLength={160} /></label></div></section>}
        {step === 3 && <section className="origin-step founding-situation-step"><div className="step-heading"><ShieldAlert size={18} /><div><h2>组织是在什么局面下成立的？</h2><p>这不是背景文案：它会直接改变开局资源、暴露、声望、势力关系与第一项压力。</p></div></div><div className="founding-situation-grid">{FOUNDING_SITUATIONS.map((situation) => <button key={situation.id} className={foundingSituationId === situation.id ? "selected" : ""} onClick={() => setFoundingSituationId(situation.id)}><strong>{situation.name}</strong><p>{situation.description}</p><small>优势：{situation.boon}</small><em>代价：{situation.debt}</em></button>)}</div><p className="founding-pressure"><b>{foundingSituation.name}的开局压力：</b>{foundingSituation.openingPressure}</p></section>}
        {step === 4 && <section className="origin-step final-origin"><div className="step-heading"><ShieldAlert size={18} /><div><h2>入席前，书记员会宣读第一项压力</h2><p>它会根据身份、经历、途径、四名下属与组织类型生成，并开启四周组织奠基引导。</p></div></div><div className="opening-story"><p>你将通过议会桌上的报告、地图与自由命令分配三种资源、任命四项治理职责，并决定本周唯一的亲自行程。</p><p>四名具名非凡者全部入席；另有 24 点普通人力作为基层资源，由组织宏观分配。</p></div><div className="identity-fields"><label><span>姓名或长期化名</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：亚瑟·莫里亚蒂" maxLength={32} /></label><label><span>内部正式称谓</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="例如：会长阁下" maxLength={24} /></label></div><div className="origin-review"><span><Anchor size={14} />{identity.label}</span><span><Feather size={14} />{experience.label}</span><span><Sparkles size={14} />序列{startingSequence} · {PATHWAYS[pathwayId].name}</span><span><UsersRound size={14} />{selectedMembers.map((item) => item.name).join("、")}</span><span><Landmark size={14} />{orgName} · {orgKindInfo.name}</span><span><ShieldAlert size={14} />{gender || "未填性别"} · {age || "未填年龄"}</span></div></section>}

        <footer className="origin-footer"><button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft size={15} />上一步</button><span>{!valid && step === 4 ? "请填写姓名，并选择4名具名非凡者" : "选择会改变开局关系、资源与专属剧情"}</span>{step < 4 ? <button className="primary" onClick={() => setStep((value) => Math.min(4, value + 1))}>继续 <ArrowRight size={15} /></button> : <button className="primary" onClick={finish} disabled={!valid}>推门入席 <ArrowRight size={16} /></button>}</footer>
      </div>
    </section>
  </div>;
}
