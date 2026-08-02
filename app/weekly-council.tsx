"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Command,
  FileText, Gavel, Map, MessageSquareText, Pin, Plus, ShieldAlert, Sparkles, Target,
  UsersRound, WandSparkles, X,
} from "lucide-react";
import CityMapWorkspace from "./city-map-workspace";
import { COUNCIL_PORTFOLIOS, portfolioOwner, portfoliosForMember } from "./council-system";
import { AbilityContext, ChronicleChapter, DISTRICTS, GameState, PATHWAYS, ViewId } from "./game-model";

type CouncilStage = "reports" | "agenda" | "discussion" | "orders";

type Props = {
  game: GameState;
  intentText: string;
  selectedDistrictId: string;
  contractLoading: boolean;
  generationStage: string;
  decisionSignal: number;
  latestChapter?: ChronicleChapter;
  onIntentText: (value: string) => void;
  onDistrict: (value: string) => void;
  onInspectDistrict: (districtId: string) => void;
  onPrepare: () => void;
  onRemoveAction: (id: string) => void;
  onEndWeek: () => void;
  onQuestionMember: (memberId: string, seed?: string) => void;
  onReadChapter: (chapter: ChronicleChapter) => void;
  onUseSuggestion: (text: string, districtId?: string) => void;
  onView: (view: ViewId) => void;
  onUseAbility: (context: AbilityContext, prompt: string) => void;
  onStartDiscussion: (text: string) => Promise<string | null>;
  onSummarizeTopic: (topicId: string) => Promise<void>;
  onPinTopic: (topicId: string) => void;
};

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const COUNCIL_STAGE_COPY: Record<CouncilStage, { title: string; detail: string }> = {
  reports: { title: "上周述职", detail: "结果与余波正在宣读" },
  agenda: { title: "治理议题", detail: "职责、城市与异常正在过桌" },
  discussion: { title: "自由讨论", detail: "议长开放内部发言" },
  orders: { title: "形成决议", detail: "等待议长最终拍板" },
};
function riskClass(risk: string) { return risk === "致命" ? "fatal" : risk === "高" ? "high" : risk === "中" ? "medium" : "low"; }

function sourceLabel(game: GameState, memberId: string) {
  const portfolios = portfoliosForMember(game, memberId);
  return portfolios.length ? portfolios.map((item) => item.shortName).join(" · ") : "内部主管";
}

export default function WeeklyCouncil(props: Props) {
  const { game, latestChapter } = props;
  const [stage, setStage] = useState<CouncilStage>(props.decisionSignal > 0 ? "orders" : latestChapter ? "reports" : "agenda");
  const [discussionText, setDiscussionText] = useState("");
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState(game.councilTopics.find((item) => item.status === "open")?.id ?? "");
  const activeMission = game.missions.find((mission) => mission.state === "active");
  const currentSequence = PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)!;
  const formalCouncil = game.members.filter((member) => member.pathway).slice(0, 8);
  const supervisors = game.members.filter((member) => !member.pathway);
  const activeTopic = game.councilTopics.find((item) => item.id === activeTopicId) ?? game.councilTopics[0];
  const pinnedTopics = game.councilTopics.filter((item) => item.pinned).slice(0, 3);
  const activeStageCopy = COUNCIL_STAGE_COPY[stage];
  const bringToDecision = (text: string, districtId?: string) => { props.onUseSuggestion(text, districtId); setStage("orders"); };

  const memberAgendas = useMemo(() => game.members.slice(0, 4).map((member) => {
    const owned = portfoliosForMember(game, member.id);
    const role = owned[0];
    return {
      member,
      title: member.personalEventState === "active" && member.personalEvent ? member.personalEvent : `${role?.name ?? member.role}本周汇报`,
      detail: role ? `${member.name}对${role.mandate}负有汇总责任；内容包括亲历、下属报告、推断和仍未回报的事项。` : `${member.name}负责整理与其专长有关的内部事务。`,
      prompt: `请以${role?.name ?? member.role}负责人的身份汇报本周情况。把亲历、下属报告、个人推断与未知分别说清，并指出最需要我拍板的问题。`,
    };
  }), [game]);

  async function startDiscussion(seed?: string) {
    const text = (seed ?? discussionText).trim();
    if (!text || discussionLoading) return;
    setDiscussionLoading(true);
    const id = await props.onStartDiscussion(text);
    if (id) setActiveTopicId(id);
    setDiscussionText("");
    setStage("discussion");
    setDiscussionLoading(false);
  }

  return <div className={`council-page page-enter ${props.generationStage ? "council-simulating" : ""}`}>
    <header className="council-masthead">
      <div><p>第 {game.week} 周 · {game.date}</p><h1>{game.playerAddress}主持的最高议会</h1><span>内圈席位只属于非凡者；内部主管在外圈述职。所有事务由明确负责人汇总，最后方向只由你拍板。</span></div>
      <div className="council-rule"><UsersRound size={17} /><span><strong>{formalCouncil.length}/8 正式参席</strong><small>{supervisors.length}名内部主管列席 · 外部人士不得进入会议</small></span></div>
    </header>

    <section className="council-room council-enter-motion" aria-label="组织内部最高议会">
      <div className="council-haze" aria-hidden="true" />
      <div className="council-session-state"><Gavel size={15} /><span>第 {game.week} 周 · 最高议会</span><strong>{activeStageCopy.title}进行中</strong></div>
      <div className="council-table refined" aria-hidden="true"><span /><i /><b /><em /></div>
      <div className="chair player-chair"><span>议长席</span><strong>{game.playerName || "你"}</strong><small>{game.playerAddress} · 序列{game.currentSequence} {currentSequence.name}</small></div>
      {Array.from({ length: 8 }, (_, index) => {
        const member = formalCouncil[index];
        return member ? <button key={member.id} className={`council-seat inner-seat seat-${index + 1}`} onClick={() => props.onQuestionMember(member.id)} aria-label={`点名${member.name}发言`}><i>{member.name.slice(0, 1)}</i><span><strong>{member.name}</strong><small>正式参席 · {sourceLabel(game, member.id)}</small></span></button>
          : <div key={`empty-${index}`} className={`council-seat inner-seat empty seat-${index + 1}`}><i>{index + 1}</i><span><strong>空席</strong><small>等待非凡者任命</small></span></div>;
      })}
      <div className="outer-supervisors"><span className="supervisor-rail-label">内部主管列席 · 受议长问询</span>{supervisors.slice(0, 4).map((member) => <button key={member.id} onClick={() => props.onQuestionMember(member.id)}><i>{member.name.slice(0, 1)}</i><span><strong>{member.name}</strong><small>{sourceLabel(game, member.id)}主管</small></span></button>)}</div>
      <div className="table-docket"><Map size={14} /><span>{activeStageCopy.title}</span><b>{stage === "orders" ? `${game.schedule.length}项待确认` : activeStageCopy.detail}</b></div>
      <div className="room-caption"><span>密议室 · 门已反锁</span><i /><span>外部人士不得入内</span></div>
    </section>

    <nav className="council-stages" aria-label="集会议程">
      <button className={stage === "reports" ? "active" : ""} onClick={() => setStage("reports")}><span>01</span><div><strong>上周述职</strong><small>结果与余波</small></div></button>
      <button className={stage === "agenda" ? "active" : ""} onClick={() => setStage("agenda")}><span>02</span><div><strong>治理议题</strong><small>职责与城市</small></div></button>
      <button className={stage === "discussion" ? "active" : ""} onClick={() => setStage("discussion")}><span>03</span><div><strong>自由讨论</strong><small>{game.councilTopics.length}项议题</small></div></button>
      <button className={stage === "orders" ? "active" : ""} onClick={() => setStage("orders")}><span>04</span><div><strong>形成决议</strong><small>自由发言并拍板</small></div></button>
    </nav>

    {stage === "reports" && <section className="council-panel reports-panel">
      <header><div><p>书记员已展开上周记录</p><h2>{latestChapter?.title ?? "第一次内部集会"}</h2></div>{latestChapter && <button onClick={() => props.onReadChapter(latestChapter)}><BookOpen size={15} />重读小说章节</button>}</header>
      {latestChapter ? <><p className="report-summary">{latestChapter.summary}</p><div className="spoken-reports">{latestChapter.results.map((result) => <article key={result.id}><header><span className={`risk-dot ${riskClass(result.contract.risk)}`} /><div><strong>{result.title}</strong><small>{result.contract.rawIntent}</small></div><b>{result.outcome}</b></header><p>{result.consequence}</p><ul>{result.findings.map((finding) => <li key={finding}><CheckCircle2 size={13} />{finding}</li>)}</ul>{result.futureChanges?.[0] && <footer><ArrowRight size={13} /><span>余波：{result.futureChanges[0]}</span></footer>}</article>)}</div></> : <div className="first-council"><Gavel size={25} /><div><strong>没有上一周可以述职。</strong><p>黑玻璃挂坠、补写的工人名单和失踪信使已经摆在桌上。它们是最初压力，不是预设道路。</p></div></div>}
      <footer className="panel-advance"><span>报告只说明发生了什么，不替你决定接下来做什么。</span><button onClick={() => setStage("agenda")}>进入治理议题 <ArrowRight size={15} /></button></footer>
    </section>}

    {stage === "agenda" && <section className="council-panel agenda-panel governance-panel">
      {activeMission && <article className="council-pressure"><header><span><ShieldAlert size={15} />必须知情的压力</span><b>{activeMission.deadline}周后越过临界点</b></header><h2>{activeMission.title}</h2><p>{activeMission.premise}</p><div><span><i style={{ width: `${activeMission.progress}%` }} /></span><strong>{activeMission.progress}%</strong></div><footer><small>若不处理</small><p>{activeMission.consequence}</p></footer></article>}
      <section className="portfolio-board"><header><div><p>职责不是菜单，而是组织的问责路径</p><h2>八项治理领域</h2></div><small>点击负责人进入其持续部门对话</small></header><div>{COUNCIL_PORTFOLIOS.map((portfolio) => { const owner = portfolioOwner(game, portfolio); return <button key={portfolio.id} onClick={() => owner && props.onQuestionMember(owner.id, `请汇报${portfolio.name}。即使具体事务由下属执行，也请说明最后一次回报、信息来源和您尚不确定的部分。`)}><span><strong>{portfolio.name}</strong><small>{portfolio.mandate}</small></span><b>{owner?.name ?? "待任命"}<em>{owner?.pathway ? "参席" : "主管"}</em></b></button>; })}</div></section>
      <div className="member-agendas">{memberAgendas.map(({ member, title, detail, prompt }) => <article key={member.id}><header><i>{member.name.slice(0, 1)}</i><span><small>{sourceLabel(game, member.id)}负责人</small><strong>{title}</strong></span></header><p>{detail}</p><button onClick={() => props.onQuestionMember(member.id, prompt)}><MessageSquareText size={14} />进入负责人的治理对话</button></article>)}</div>
      <CityMapWorkspace game={game} selectedDistrictId={props.selectedDistrictId} onDistrict={props.onDistrict} onOpenDiscussion={(seed) => { setDiscussionText(seed); void startDiscussion(seed); }} onFormDirection={(seed, districtId) => bringToDecision(seed, districtId)} onUseAbility={props.onUseAbility} />
      <footer className="panel-advance"><span>议题只负责暴露问题；你可以全部搁置并提出自己的方向。</span><button onClick={() => setStage("discussion")}>进入自由讨论 <ArrowRight size={15} /></button></footer>
    </section>}

    {stage === "discussion" && <section className="council-panel discussion-panel">
      <header className="discussion-head"><div><p>议长自由发言</p><h2>把任何内部治理问题放到桌面上</h2><span>最多三名最相关的内部成员回应；外部人士不会出现，讨论也不会自动形成命令。</span></div><MessageSquareText size={24} /></header>
      <div className="discussion-composer"><textarea value={discussionText} onChange={(event) => setDiscussionText(event.target.value)} placeholder="例如：我们是否正在过度依赖东区唯一的消息来源？请人事、行动和情报负责人分别说明依据。" maxLength={900} /><footer><span>可以点名负责人，也可以只提出问题。</span><button onClick={() => void startDiscussion()} disabled={!discussionText.trim() || discussionLoading}>{discussionLoading ? <><Sparkles size={15} />成员正在整理职责内事实</> : <><Plus size={15} />开始自由讨论</>}</button></footer></div>
      {game.councilTopics.length > 0 && <div className="topic-workspace">
        <aside className="topic-list"><header><strong>议题档案</strong><small>最多钉住3项</small></header>{game.councilTopics.map((topic) => <button key={topic.id} className={activeTopic?.id === topic.id ? "active" : ""} onClick={() => setActiveTopicId(topic.id)}><span><strong>{topic.title}</strong><small>第{topic.week}周 · {topic.messages.length - 1}项回应</small></span>{topic.pinned && <Pin size={12} />}</button>)}</aside>
        {activeTopic && <article className="topic-thread"><header><div><small>内部自由讨论</small><h3>{activeTopic.title}</h3></div><button onClick={() => props.onPinTopic(activeTopic.id)} className={activeTopic.pinned ? "active" : ""}><Pin size={13} />{activeTopic.pinned ? "已钉在桌面" : "钉在桌面"}</button></header><div className="topic-messages">{activeTopic.messages.map((message) => { const member = game.members.find((item) => item.id === message.speakerId); return <div key={message.id} className={message.speakerId === "player" ? "player" : "member"}><header><strong>{message.speakerId === "player" ? game.playerAddress : member?.name ?? "内部成员"}</strong>{message.stance && <span>{message.stance}</span>}</header><p>{message.text}</p>{member && <button onClick={() => props.onQuestionMember(member.id, `继续刚才关于“${activeTopic.title}”的讨论。请只展开你有依据的部分。`)}>点名追问</button>}</div>; })}</div>
          <footer className="topic-actions"><button onClick={() => void props.onSummarizeTopic(activeTopic.id)}><FileText size={14} />一键整理意见</button><button onClick={() => props.onUseAbility({ kind: "council", targetId: activeTopic.id, label: `自由讨论：${activeTopic.title}` }, `我在不打断讨论的情况下自由使用选定能力。目标、范围、公开或隐蔽方式以我随后输入为准，不得替换我的手段。`)}><WandSparkles size={14} />使用能力</button><button className="primary" onClick={() => bringToDecision(`根据内部议题“${activeTopic.title}”形成决议。我的最终方向是：`)}><Gavel size={14} />形成决议</button></footer>
          {activeTopic.summary && <section className="discussion-summary"><header><FileText size={14} /><strong>书记员整理</strong><small>中立摘录，不是系统推荐</small></header>{([['facts','已确认事实'],['consensus','一致意见'],['disagreements','主要分歧'],['risks','风险'],['directions','提出方向'],['unanswered','未回答问题']] as const).map(([key, label]) => activeTopic.summary?.[key].length ? <div key={key}><strong>{label}</strong>{activeTopic.summary[key].map((item) => <p key={item}>{item}</p>)}</div> : null)}</section>}
        </article>}
      </div>}
      {!game.councilTopics.length && <div className="empty-discussion"><MessageSquareText size={24} /><p>桌面上还没有自由议题。你不必等待成员给出选项。</p></div>}
      {pinnedTopics.length > 0 && <footer className="pinned-topics"><span><Pin size={12} />持续关注</span>{pinnedTopics.map((item) => <button key={item.id} onClick={() => setActiveTopicId(item.id)}>{item.title}</button>)}</footer>}
    </section>}

    {stage === "orders" && <section className="council-panel orders-panel">
      <header className="free-order-heading"><div><p>轮到{game.playerAddress}拍板</p><h2>你希望组织朝什么方向推进？</h2><span>直接写目标、手段、限制与停止条件。负责人会复述原意，组织再依据职责分工。</span></div><Command size={24} /></header>
      <article className="council-composer"><textarea value={props.intentText} onChange={(event) => props.onIntentText(event.target.value)} placeholder="例如：先核对失踪工人的共同活动地点。不要接触教会，不盘问诊所；若对方察觉调查，立刻中止。" maxLength={1200} /><div className="intent-context-row"><span>空间上下文：{DISTRICTS.find((item) => item.id === props.selectedDistrictId)?.name}</span><span>{props.intentText.length}/1200</span></div><footer><span><Gavel size={13} />只整理你的原意，不生成预设道路</span><button className="complete-primary" onClick={props.onPrepare} disabled={!props.intentText.trim() || props.contractLoading}>{props.contractLoading ? <><Sparkles size={15} />负责人正在复述</> : <>形成行动契约 <ArrowRight size={16} /></>}</button></footer></article>
      <article className="decision-ledger"><header><span><CalendarDays size={15} /><strong>本周已拍板的决议</strong></span><small>{game.schedule.length}项 · 不设僵硬行动次数</small></header>{game.schedule.length ? <div>{game.schedule.map((action) => <article key={action.id}><span className={`schedule-risk ${riskClass(action.risk)}`}>{action.risk}</span><div><strong>{action.title}</strong><p>{DISTRICTS.find((district) => district.id === action.districtId)?.name} · {action.days}天 · £{action.budget}</p></div><button onClick={() => props.onRemoveAction(action.id)} aria-label="撤回这项决议"><X size={15} /></button></article>)}</div> : <div className="empty-decision"><Gavel size={21} /><span>没有决议也可以散会；世界仍会自行前进。</span></div>}<div className="week-strip">{DAY_NAMES.map((day, index) => <div key={day}><span>{day}</span>{game.schedule.filter((action) => index + 1 >= action.startDay && index + 1 < action.startDay + action.days).map((action) => <i key={action.id} className={riskClass(action.risk)} />)}</div>)}</div><footer><div><span><CircleDollarSign size={13} />£{game.money}</span><span><Sparkles size={13} />{game.spirituality}/{game.spiritualityMax}</span><span><Target size={13} />偏转 {game.deviation.toFixed(1)}%</span></div><button className="adjourn-button" onClick={props.onEndWeek} disabled={Boolean(props.generationStage) || Boolean(game.fatalSituation) || game.ending.phase !== "running"}><Gavel size={15} />{props.generationStage || (game.schedule.length ? "闭会并进入推演" : "无决议闭会，世界继续")}</button></footer></article>
    </section>}

    <aside className="council-side-notes"><button onClick={() => props.onView("progression")}><WandSparkles size={15} /><span><small>自身与非凡能力</small><strong>序列{game.currentSequence} · 消化{game.digestion}%</strong></span><ChevronRight size={14} /></button><button onClick={() => props.onView("organization")}><UsersRound size={15} /><span><small>组织状态</small><strong>{game.members.length}名具名成员 · 稳定{game.stability}</strong></span><ChevronRight size={14} /></button><button onClick={() => props.onView("archive")}><BookOpen size={15} /><span><small>会议纪事</small><strong>{game.chronicle.length}篇周报可反复阅读</strong></span><ChevronRight size={14} /></button></aside>
  </div>;
}
