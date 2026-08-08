"use client";

import { useEffect, useMemo, useState } from "react";
import { Anchor, ArrowLeft, ArrowRight, Check, Eye, Feather, KeyRound, Landmark, LoaderCircle, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import type { AiConfig } from "./ai-client.ts";
import { GameState, ORGANIZATION_KINDS, PATHWAYS, type PathwayId, type PlayerOrigin } from "./game-model.ts";
import { buildOpeningCandidatePool } from "./opening-candidates.ts";
import { PATHWAY_OPENING_DOSSIERS } from "./pathway-catalog.ts";
import { difficultyLabel, generateDynamicPathwayOrigin, getPathwayOrigins, type OriginTrait, type PathwayOriginScenario } from "./pathway-origins.ts";

type Props = {
  game: GameState;
  aiConfig: AiConfig;
  onBegin: (name: string, address: string, pathwayId: PathwayId, origin: PlayerOrigin) => void;
};

const IDENTITIES = [
  { id: "investigator", label: "私人调查经营者", detail: "以合法委托、失物寻回与背景核查掩护组织。", orgKind: "detective" },
  { id: "doctor", label: "社区医生", detail: "通过诊所、病例与慈善网络接触城市基层。", orgKind: "charity" },
  { id: "journalist", label: "报社撰稿人", detail: "依靠采访、剪报与匿名消息进入城市公共议题。", orgKind: "detective" },
  { id: "merchant", label: "进出口商人", detail: "以仓储、货单和码头渠道支撑组织的经济外壳。", orgKind: "trading" },
  { id: "scholar", label: "私人档案研究者", detail: "以翻译、民俗与文献代查掩盖知识追索。", orgKind: "archive" },
  { id: "noble", label: "贵族旁支", detail: "拥有进入上流社会的姓氏，也背负家族义务。", orgKind: "sect" },
] as const;

const EXPERIENCES: { id: string; label: string; detail: string; trait: OriginTrait }[] = [
  { id: "mutual-aid", label: "东区失踪案的经办人", detail: "你替互助会寻找过一名没有进入警察记录的失踪女工。", trait: { id: "experience-mutual-aid", name: "基层互助经验", kind: "experience", description: "涉及普通人招募、东区社区和失踪人口时更容易获得基层信任。", triggers: ["普通人招募", "东区", "失踪人口"], effects: { manpower: 2, reputation: 3 } } },
  { id: "south-war", label: "南大陆战地归来者", detail: "你见过军队、佣兵和教会医院怎样处理无法公开的伤口。", trait: { id: "experience-south-war", name: "战地撤离经验", kind: "experience", description: "伤员处置、危险撤离和多人员行动更可靠，但旧战友可能带来债务。", triggers: ["伤员", "撤离", "南大陆"], effects: { manpower: 2, exposure: 3 } } },
  { id: "church-periphery", label: "教会外围协作者", detail: "你接受过保密训练，也知道官方程序会把哪些人挡在门外。", trait: { id: "experience-church-periphery", name: "官方程序常识", kind: "experience", description: "涉及教会、警察与封存程序时更能判断边界。", triggers: ["教会", "警察", "封存"], effects: { reputation: 4, exposure: -2 } } },
  { id: "bankrupt-house", label: "破产家族继承人", detail: "你继承了债务、旧关系和一份来源可疑的财产清单。", trait: { id: "experience-bankrupt-house", name: "旧家族账本", kind: "experience", description: "开局资金与上流关系更好，但债权人会持续索取回报。", triggers: ["贵族", "债务", "遗产"], effects: { money: 80, exposure: 4 } } },
  { id: "sea-return", label: "五海归来者", detail: "你带回海图、口音和几位不愿在白天拜访的旧识。", trait: { id: "experience-sea-return", name: "五海航路", kind: "experience", description: "码头、海外材料与跨区撤离更有优势。", triggers: ["码头", "海外", "航路"], effects: { money: 40, extraordinaryMaterials: 1 } } },
  { id: "safah-past", label: "源堡苏醒的过去之人", detail: "你记得另一个时代的生活碎片，却不知道完整的原著真相。", trait: { id: "experience-safah-past", name: "时代错位", kind: "experience", description: "管理与现代知识提供少量优势，但异常认知可能引来高位注意。", triggers: ["现代管理", "时代知识", "高位注视"], effects: { money: 30, exposure: 6, instability: 5 } } },
];

const SYMBOLS = ["钥匙与封蜡", "闭合的眼与雾线", "渡鸦羽与铜环", "断桥与北辰", "空椅与双重门", "无字书页与锚"];
const DIFFICULTY_FIELDS: [keyof PathwayOriginScenario["difficulty"], string][] = [
  ["sourceAccess", "来源"], ["pursuit", "追索"], ["pollution", "污染"], ["survival", "生存"], ["organizationValue", "经营"], ["advancementScarcity", "晋升"],
];

export default function OpeningPrologue({ game, aiConfig, onBegin }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(game.playerName);
  const [address, setAddress] = useState(game.playerAddress || "会长阁下");
  const [pathwayId, setPathwayId] = useState<PathwayId>(game.pathwayId);
  const fixedOrigins = getPathwayOrigins(pathwayId);
  const [origin, setOrigin] = useState<PathwayOriginScenario>(fixedOrigins[0]);
  const [dynamicOrigin, setDynamicOrigin] = useState<PathwayOriginScenario>();
  const [dynamicPrompt, setDynamicPrompt] = useState("");
  const [dynamicStatus, setDynamicStatus] = useState<"idle" | "loading" | "error">("idle");
  const [dynamicError, setDynamicError] = useState("");
  const [identityId, setIdentityId] = useState("investigator");
  const [experienceId, setExperienceId] = useState("mutual-aid");
  const [experienceDetail, setExperienceDetail] = useState("");
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [memberIds, setMemberIds] = useState(["opening-ada", "opening-silas", "opening-miriam", "opening-jonas"]);
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [orgName, setOrgName] = useState("鸦羽侦探事务所");
  const [orgKind, setOrgKind] = useState("detective");
  const [orgCharter, setOrgCharter] = useState("保护组织成员与无辜者；证据不足时不公开指控；未知高位威胁下优先撤退。");
  const identity = IDENTITIES.find((item) => item.id === identityId)!;
  const experience = EXPERIENCES.find((item) => item.id === experienceId)!;
  const orgKindInfo = ORGANIZATION_KINDS.find((item) => item.id === orgKind)!;
  const candidatePool = useMemo(() => buildOpeningCandidatePool({ playerPathwayId: pathwayId, originScenarioId: origin.id, originStartingSequence: origin.startingSequence, identityId, experienceId }), [pathwayId, origin.id, origin.startingSequence, identityId, experienceId]);
  const selectedMembers = candidatePool.filter((item) => memberIds.includes(item.id));
  const valid = name.trim().length >= 2 && address.trim().length >= 2 && gender.trim().length >= 1 && age.trim().length >= 1 && orgName.trim().length >= 2 && memberIds.length === 4 && selectedMembers.every((member) => member.pathway);
  const sequence = PATHWAYS[pathwayId].sequences.find((item) => item.rank === origin.startingSequence)!;
  const origins = dynamicOrigin && dynamicOrigin.pathwayId === pathwayId ? [...fixedOrigins, dynamicOrigin] : fixedOrigins;

  useEffect(() => {
    setOrigin(getPathwayOrigins(pathwayId)[0]);
    setDynamicOrigin(undefined);
    setDynamicStatus("idle");
    setMemberIds(["opening-ada", "opening-silas", "opening-miriam", "opening-jonas"]);
  }, [pathwayId]);

  const symbolCandidates = useMemo(() => {
    const seed = IDENTITIES.findIndex((item) => item.id === identityId) + EXPERIENCES.findIndex((item) => item.id === experienceId) + Object.keys(PATHWAYS).indexOf(pathwayId);
    return [SYMBOLS[seed % SYMBOLS.length], SYMBOLS[(seed + 2) % SYMBOLS.length], SYMBOLS[(seed + 4) % SYMBOLS.length]];
  }, [identityId, experienceId, pathwayId]);

  function chooseIdentity(id: string) {
    const nextIdentity = IDENTITIES.find((item) => item.id === id)!;
    const nextKind = ORGANIZATION_KINDS.find((item) => item.id === nextIdentity.orgKind)!;
    setIdentityId(id);
    setOrgKind(nextIdentity.orgKind);
    if (!orgName.trim() || ORGANIZATION_KINDS.some((item) => item.defaultName === orgName)) setOrgName(nextKind.defaultName);
  }

  function toggleMember(id: string) {
    setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current);
  }

  async function generateOrigin() {
    setDynamicStatus("loading");
    setDynamicError("");
    try {
      const generated = await generateDynamicPathwayOrigin(aiConfig, pathwayId, dynamicPrompt);
      setDynamicOrigin(generated);
      setOrigin(generated);
      setDynamicStatus("idle");
    } catch (error) {
      setDynamicStatus("error");
      setDynamicError(error instanceof Error ? error.message : "动态出身生成失败");
    }
  }

  function finish() {
    if (!valid) return;
    onBegin(name.trim(), address.trim(), pathwayId, {
      identityId,
      identityLabel: identity.label,
      experienceId,
      experienceLabel: experience.label,
      experienceDetail: experienceDetail.trim(),
      symbol,
      foundingMemberIds: memberIds,
      foundingMembers: selectedMembers,
      startingSequence: origin.startingSequence,
      pathwayOriginId: origin.id,
      pathwayOriginTitle: origin.title,
      pathwayOrigin: origin,
      traits: [origin.traits[0], origin.traits[1], experience.trait],
      gender: gender.trim(),
      age: age.trim(),
      organizationName: orgName.trim(),
      organizationKind: orgKind,
      organizationKindLabel: orgKindInfo.name,
      organizationCharter: orgCharter.trim(),
    });
  }

  return <div className="prologue-backdrop">
    <section className="origin-builder" role="dialog" aria-modal="true" aria-labelledby="prologue-title">
      <aside className="origin-symbol-card">
        <div className="symbol-orbit"><span /><i /><b /></div>
        <small>议会建立档案</small><div className="symbol-glyph" aria-hidden="true"><Eye size={52} /><KeyRound size={34} /></div><h2>{symbol}</h2>
        <dl><div><dt>姓名</dt><dd>{name || "尚未留下"}</dd></div><div><dt>途径</dt><dd>序列{origin.startingSequence} · {sequence.name}</dd></div><div><dt>来源</dt><dd>{origin.title}</dd></div><div><dt>身份</dt><dd>{identity.label}</dd></div><div><dt>组织</dt><dd>{orgName || "尚未命名"}</dd></div><div><dt>起点</dt><dd>{origin.startingLocation.label}</dd></div></dl>
        <div className="founder-marks">{selectedMembers.map((member) => <span key={member.id} title={member.name}>{member.name.slice(0, 1)}</span>)}</div>
        <p>序列、资源、关系与第一场危机由知识库约束的出身共同决定。</p>
      </aside>
      <div className="origin-content">
        <header><p>1349年6月30日 · 贝克兰德</p><h1 id="prologue-title">在第一场密议前，确定组织从哪里开始</h1><span>选择不是数值难度，而是一条会持续产生盟友、敌人、污染、债务与经营机会的历史分支。</span></header>
        <nav className="origin-steps">{["途径", "来源", "身份", "班底", "入席"].map((label, index) => <button key={label} className={step === index ? "active" : step > index ? "done" : ""} onClick={() => setStep(index)}><span>{step > index ? <Check size={12} /> : index + 1}</span>{label}</button>)}</nav>

        {step === 0 && <section className="origin-step"><div className="step-heading"><Sparkles size={18} /><div><h2>先选择非凡途径</h2><p>22 条途径会改变来源难度、污染方式、外部追索、经营价值与晋升稀缺度；玩家不直接选择序列。</p></div></div><div className="pathway-origin-grid">{Object.values(PATHWAYS).map((pathway) => { const dossier = PATHWAY_OPENING_DOSSIERS[pathway.id]; const difficulty = getPathwayOrigins(pathway.id)[0].difficulty; return <button key={pathway.id} className={pathwayId === pathway.id ? "selected" : ""} onClick={() => setPathwayId(pathway.id)}><span style={{ background: pathway.color }} /><strong>{pathway.name}</strong><small>经营 {difficultyLabel(difficulty.organizationValue)} · 污染 {difficultyLabel(difficulty.pollution)}</small><p>{dossier.managementContribution}</p><em>{dossier.knownRisk}</em></button>; })}</div></section>}

        {step === 1 && <section className="origin-step"><div className="step-heading"><ShieldAlert size={18} /><div><h2>选择这条途径如何落到你身上</h2><p>两套固定来源已经过知识账本校验；动态来源由 AI 在同一知识边界内生成，失败会直接报错，不会降级成通用背景。</p></div></div><div className="founding-situation-grid">{origins.map((item) => <button key={item.id} className={origin.id === item.id ? "selected" : ""} onClick={() => setOrigin(item)}><strong>{item.title} · 序列{item.startingSequence}</strong><p>{item.summary}</p><small>优势：{item.traits[0].name}｜{item.traits[0].description}</small><em>负担：{item.traits[1].name}｜{item.traits[1].description}</em><small>起点：{item.startingLocation.label} · 人力{item.resources.manpower} / 金钱{item.resources.money} / 材料{item.resources.extraordinaryMaterials}</small></button>)}</div><div className="origin-difficulty" aria-label="途径开局难度">{DIFFICULTY_FIELDS.map(([key, label]) => <span key={key}><b>{label}</b>{difficultyLabel(origin.difficulty[key])}</span>)}</div><label className="free-background"><span>动态来源补充（可选）</span><textarea value={dynamicPrompt} onChange={(event) => setDynamicPrompt(event.target.value)} placeholder="例如：我希望角色与报社、某个衰落家族或南大陆经历有关。AI 会自行决定合理序列与代价。" maxLength={320} /></label><button className="primary" onClick={() => void generateOrigin()} disabled={dynamicStatus === "loading"}>{dynamicStatus === "loading" ? <><LoaderCircle className="spin" size={15} />知识库约束生成中</> : "生成第三套动态来源"}</button>{dynamicStatus === "error" && <p className="founding-pressure"><b>生成失败：</b>{dynamicError}</p>}<p className="founding-pressure"><b>第一场危机：</b>{origin.firstCrisis}</p></section>}

        {step === 2 && <section className="origin-step"><div className="step-heading"><Landmark size={18} /><div><h2>确定公开身份与个人经历</h2><p>公开身份同时确定组织掩护类型；个人经历形成第三个可触发特质。最终只有三项特质，不堆叠无效标签。</p></div></div><div className="origin-choice-grid">{IDENTITIES.map((item) => <button key={item.id} className={identityId === item.id ? "selected" : ""} onClick={() => chooseIdentity(item.id)}><strong>{item.label}</strong><p>{item.detail}</p></button>)}</div><div className="experience-list">{EXPERIENCES.map((item) => <button key={item.id} className={experienceId === item.id ? "selected" : ""} onClick={() => setExperienceId(item.id)}><strong>{item.label}</strong><p>{item.detail}</p><small>特质：{item.trait.name}｜{item.trait.description}</small></button>)}</div><label className="free-background"><span>补充自己的具体经历</span><textarea value={experienceDetail} onChange={(event) => setExperienceDetail(event.target.value)} placeholder="这段文字会写进世界事实，但不会绕过知识库或免费增加序列。" maxLength={320} /></label><div className="origin-personal-fields"><div className="gender-row"><span>性别</span>{["男", "女", "不便透露"].map((option) => <button key={option} className={gender === option ? "selected" : ""} onClick={() => setGender(option)}>{option}</button>)}</div><label className="age-field"><span>年龄</span><input value={age} onChange={(event) => setAge(event.target.value)} placeholder="例如：27" maxLength={8} /></label></div><label className="org-name-field"><span>组织名称 · {orgKindInfo.name}</span><input value={orgName} onChange={(event) => setOrgName(event.target.value)} maxLength={24} /></label><label className="org-charter-field"><span>一句话章程</span><textarea value={orgCharter} onChange={(event) => setOrgCharter(event.target.value)} maxLength={160} /></label><div className="symbol-picker"><span>议会档案象征</span>{symbolCandidates.map((item) => <button key={item} className={symbol === item ? "selected" : ""} onClick={() => setSymbol(item)}>{item}</button>)}</div></section>}

        {step === 3 && <section className="origin-step team-step"><div className="step-heading"><UsersRound size={18} /><div><h2>从 8 名来源相关的非凡者中选择 4 名入席</h2><p>候选人的途径组合、序列负担和当前困境由你的途径来源与公开身份共同生成。</p></div><b className={memberIds.length === 4 ? "valid" : ""}>{memberIds.length}/4</b></div><div className="founder-grid">{candidatePool.map((member) => <button key={member.id} className={memberIds.includes(member.id) ? "selected" : ""} onClick={() => toggleMember(member.id)}><header><span>{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>{member.role} · 序列{member.sequence} {member.pathway}</small></div>{memberIds.includes(member.id) && <Check size={14} />}</header><p>{member.specialty}</p><small>{member.core}</small></button>)}</div></section>}

        {step === 4 && <section className="origin-step final-origin"><div className="step-heading"><ShieldAlert size={18} /><div><h2>入席前确认</h2><p>开局后，第一场危机、三项特质、资源、关系与地图起点都会成为持续世界事实。</p></div></div><div className="opening-story"><p>你通过议会桌上的下属对话、报告与地图经营组织。没有每周行动配额；你只需表达目标，后台会按人员、资源、风险与世界状态安排执行。</p><p>普通人以人力宏观管理；筛选成功者可在同一回合由内务负责人提交，并在你确认魔药后立即成为具名非凡者。</p></div><div className="identity-fields"><label><span>姓名或长期化名</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：亚瑟·莫里亚蒂" maxLength={32} /></label><label><span>内部正式称谓</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="例如：会长阁下" maxLength={24} /></label></div><div className="origin-review"><span><Sparkles size={14} />{PATHWAYS[pathwayId].name} · 序列{origin.startingSequence} {sequence.name}</span><span><ShieldAlert size={14} />{origin.title}</span><span><Anchor size={14} />{identity.label}</span><span><Feather size={14} />{experience.trait.name}</span><span><UsersRound size={14} />{selectedMembers.map((item) => item.name).join("、")}</span><span><Landmark size={14} />{orgName} · {origin.startingLocation.label}</span></div><div className="founding-situation-grid">{[...origin.traits, experience.trait].map((trait) => <div key={trait.id}><strong>{trait.kind === "burden" ? "负担" : "特质"} · {trait.name}</strong><p>{trait.description}</p><small>触发：{trait.triggers.join("、")}</small></div>)}</div></section>}

        <footer className="origin-footer"><button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft size={15} />上一步</button><span>{!valid && step === 4 ? "请填写姓名、性别与年龄，并选择4名具名非凡者" : "所有选择都会进入长期世界因果"}</span>{step < 4 ? <button className="primary" onClick={() => setStep((value) => Math.min(4, value + 1))}>继续 <ArrowRight size={15} /></button> : <button className="primary" onClick={finish} disabled={!valid}>推门入席 <ArrowRight size={16} /></button>}</footer>
      </div>
    </section>
  </div>;
}
