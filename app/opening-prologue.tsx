"use client";

import { useMemo, useState } from "react";
import { Anchor, ArrowLeft, ArrowRight, Check, Eye, Feather, KeyRound, Landmark, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { FIXED_RECRUIT_POOL, GameState, INITIAL_MEMBERS, PATHWAYS, PathwayId, PlayerOrigin } from "./game-model";

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
const ALL_CANDIDATES = [...INITIAL_MEMBERS, ...FIXED_RECRUIT_POOL];

export default function OpeningPrologue({ game, onBegin }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(game.playerName);
  const [address, setAddress] = useState(game.playerAddress || "会长阁下");
  const [pathwayId, setPathwayId] = useState<PathwayId>(game.pathwayId);
  const [identityId, setIdentityId] = useState("investigator");
  const [experienceId, setExperienceId] = useState("mutual-aid");
  const [experienceDetail, setExperienceDetail] = useState("");
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [memberIds, setMemberIds] = useState(INITIAL_MEMBERS.map((item) => item.id));
  const identity = IDENTITIES.find((item) => item.id === identityId)!;
  const experience = EXPERIENCES.find((item) => item.id === experienceId)!;
  const sequence = PATHWAYS[pathwayId].sequences.find((item) => item.rank === game.currentSequence)!;
  const selectedMembers = ALL_CANDIDATES.filter((item) => memberIds.includes(item.id));
  const extraordinaryCount = selectedMembers.filter((item) => item.pathway).length;
  const valid = name.trim().length >= 2 && address.trim().length >= 2 && memberIds.length === 4 && extraordinaryCount === 1;
  const symbolCandidates = useMemo(() => {
    const seed = IDENTITIES.findIndex((item) => item.id === identityId) + EXPERIENCES.findIndex((item) => item.id === experienceId) + Object.keys(PATHWAYS).indexOf(pathwayId);
    return [SYMBOLS[seed % SYMBOLS.length], SYMBOLS[(seed + 2) % SYMBOLS.length], SYMBOLS[(seed + 4) % SYMBOLS.length]];
  }, [identityId, experienceId, pathwayId]);

  function toggleMember(id: string) {
    setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current);
  }

  function finish() {
    if (!valid) return;
    onBegin(name.trim(), address.trim(), pathwayId, { identityId, identityLabel: identity.label, experienceId, experienceLabel: experience.label, experienceDetail: experienceDetail.trim(), symbol, foundingMemberIds: memberIds });
  }

  return <div className="prologue-backdrop">
    <section className="origin-builder" role="dialog" aria-modal="true" aria-labelledby="prologue-title">
      <aside className="origin-symbol-card">
        <div className="symbol-orbit"><span /><i /><b /></div>
        <small>人物象征档案</small><div className="symbol-glyph" aria-hidden="true"><Eye size={52} /><KeyRound size={34} /></div><h2>{symbol}</h2>
        <dl><div><dt>姓名</dt><dd>{name || "尚未留下"}</dd></div><div><dt>身份</dt><dd>{identity.label}</dd></div><div><dt>经历</dt><dd>{experience.label}</dd></div><div><dt>途径</dt><dd>序列9 · {sequence.name}</dd></div></dl>
        <div className="founder-marks">{selectedMembers.map((member) => <span key={member.id} title={member.name}>{member.name.slice(0, 1)}</span>)}</div>
        <p>这是捏人界面的象征构图，不是塔罗牌，也不是世界内的神秘物品。</p>
      </aside>
      <div className="origin-content">
        <header><p>1349年6月30日 · 贝克兰德</p><h1 id="prologue-title">在第一场密议前，写下你是谁</h1><span>廷根的一名年轻人刚从死亡中醒来。数百里外，你的组织还不知道历史已经开始转动。</span></header>
        <nav className="origin-steps">{["身份", "经历", "途径", "班底", "入席"].map((label, index) => <button key={label} className={step === index ? "active" : step > index ? "done" : ""} onClick={() => setStep(index)}><span>{step > index ? <Check size={12} /> : index + 1}</span>{label}</button>)}</nav>

        {step === 0 && <section className="origin-step"><div className="step-heading"><Landmark size={18} /><div><h2>你以什么身份生活在贝克兰德？</h2><p>身份决定掩护、接触面、责任与旧关系，不只提供数值。</p></div></div><div className="origin-choice-grid">{IDENTITIES.map((item) => <button key={item.id} className={identityId === item.id ? "selected" : ""} onClick={() => setIdentityId(item.id)}><strong>{item.label}</strong><p>{item.detail}</p><small>优势：{item.boon}</small><em>代价：{item.debt}</em></button>)}</div></section>}
        {step === 1 && <section className="origin-step"><div className="step-heading"><Feather size={18} /><div><h2>什么经历把你带到这里？</h2><p>系统会持续承认这段过去；强背景同时带来债务、追捕或责任。</p></div></div><div className="experience-list">{EXPERIENCES.map((item) => <button key={item.id} className={experienceId === item.id ? "selected" : ""} onClick={() => setExperienceId(item.id)}><strong>{item.label}</strong><p>{item.detail}</p></button>)}</div><label className="free-background"><span>补充你自己的具体经历</span><textarea value={experienceDetail} onChange={(event) => setExperienceDetail(event.target.value)} placeholder="例如：曾在南大陆做过三年战地医生，但隐瞒了一名幸存者的真实身份。" maxLength={320} /></label></section>}
        {step === 2 && <section className="origin-step"><div className="step-heading"><Sparkles size={18} /><div><h2>选择你的非凡途径</h2><p>你以序列9开局；所有高序列都存在，但必须经过消化、配方、材料与仪式。</p></div></div><div className="pathway-origin-grid">{Object.values(PATHWAYS).map((pathway) => <button key={pathway.id} className={pathwayId === pathway.id ? "selected" : ""} onClick={() => setPathwayId(pathway.id)}><span style={{ background: pathway.color }} /><strong>{pathway.name}</strong><small>序列9 · {pathway.sequences.find((item) => item.rank === 9)?.name}</small><p>{pathway.startingAbilities.map((item) => item.name).join(" · ")}</p></button>)}</div><div className="symbol-picker"><span>从背景组合得到的象征构图</span>{symbolCandidates.map((item) => <button key={item} className={symbol === item ? "selected" : ""} onClick={() => setSymbol(item)}>{item}</button>)}</div></section>}
        {step === 3 && <section className="origin-step team-step"><div className="step-heading"><UsersRound size={18} /><div><h2>选择3名普通成员与1名低序列非凡者</h2><p>十二人全部可见。团队没有“最佳答案”，但必须只有一名初始非凡者。</p></div><b className={memberIds.length === 4 && extraordinaryCount === 1 ? "valid" : ""}>{memberIds.length}/4 · 非凡者 {extraordinaryCount}/1</b></div><div className="founder-grid">{ALL_CANDIDATES.map((member) => <button key={member.id} className={memberIds.includes(member.id) ? "selected" : ""} onClick={() => toggleMember(member.id)}><header><span>{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>{member.role}{member.pathway ? ` · 序列${member.sequence} ${member.pathway}` : " · 普通人"}</small></div>{memberIds.includes(member.id) && <Check size={14} />}</header><p>{member.specialty}</p><small>{member.core}</small></button>)}</div></section>}
        {step === 4 && <section className="origin-step final-origin"><div className="step-heading"><ShieldAlert size={18} /><div><h2>雨夜留下了第一项压力</h2><p>陌生信使、黑玻璃挂坠和补写的工人名单已经送到据点。你可以调查、利用、移交或完全另寻方向。</p></div></div><div className="opening-story"><p>挂坠被锁在地下储藏间。那里没有第二扇门，它却连续两夜在凌晨三点传出敲门声。名单最后三行使用不同墨水，三名工人都来自东区，也都已经失踪。</p><p>你们没有教会许可，也尚未进入官方重点监控。最高议会目前只有一名初始非凡者有资格入席；三名普通创始成员将作为内部主管在外圈述职。</p></div><div className="identity-fields"><label><span>姓名或长期化名</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：亚瑟·莫里亚蒂" maxLength={32} /></label><label><span>内部正式称谓</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="例如：会长阁下" maxLength={24} /></label></div><div className="origin-review"><span><Anchor size={14} />{identity.label}</span><span><Feather size={14} />{experience.label}</span><span><Sparkles size={14} />{PATHWAYS[pathwayId].name}</span><span><UsersRound size={14} />{selectedMembers.map((item) => item.name).join("、")}</span></div></section>}

        <footer className="origin-footer"><button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft size={15} />上一步</button><span>{!valid && step === 4 ? "请填写姓名，并选择3名普通成员与1名非凡者" : "选择会改变开局关系、资源与专属剧情"}</span>{step < 4 ? <button className="primary" onClick={() => setStep((value) => Math.min(4, value + 1))}>继续 <ArrowRight size={15} /></button> : <button className="primary" onClick={finish} disabled={!valid}>推门入席 <ArrowRight size={16} /></button>}</footer>
      </div>
    </section>
  </div>;
}
