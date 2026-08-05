"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Command,
  FileText, Gavel, Map as MapIcon, MessageSquareText, Newspaper, Pin, Plus, RadioTower, ShieldAlert, Sparkles, Target,
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
  onFormDecision: (topicId: string) => void;
  decisionLoading: boolean;
  onAddRouteHypothesis: (fromDistrictId: string, toDistrictId: string, statement: string) => void;
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
  const [showScribeGuide, setShowScribeGuide] = useState(() => game.week === 1 && game.prologueComplete && typeof window !== "undefined" && window.localStorage.getItem("mist-chronicle-scribe-guide") !== "1");
  const activeMission = game.missions.find((mission) => mission.state === "active");
  const currentSequence = PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)!;
  const formalCouncil = game.members.filter((member) => member.pathway).slice(0, 8);
  const supervisors = game.members.filter((member) => !member.pathway);
  const activeTopic = game.councilTopics.find((item) => item.id === activeTopicId) ?? game.councilTopics[0];
  const pinnedTopics = game.councilTopics.filter((item) => item.pinned).slice(0, 3);
  const latestDiscussionTopic = game.councilTopics.find((topic) => topic.messages.length > 0);
  const activeStageCopy = COUNCIL_STAGE_COPY[stage];
  const reportWeek = latestChapter?.week ?? Math.max(1, game.week - 1);
  const worldSnapshot = game.worldSnapshots?.find((snapshot) => snapshot.week === reportWeek);
  const worldSignals = (game.worldSignals ?? []).filter((signal) => signal.week === reportWeek).slice(0, 6);
  const urgentOrganizationIssues = game.organizationIssues.filter((issue) => issue.state === "待裁决" || issue.state === "已逾期").sort((a, b) => b.urgency - a.urgency).slice(0, 3);
  const currentDepartmentReports = game.departmentReports.filter((report) => report.week === game.week).slice(0, 6);
  const bringToDecision = (text: string, districtId?: string) => { props.onUseSuggestion(text, districtId); setStage("orders"); };
  const dismissGuide = () => { setShowScribeGuide(false); if (typeof window !== "undefined") window.localStorage.setItem("mist-chronicle-scribe-guide", "1"); };

  const governanceOwners = useMemo(() => {
    const grouped = new Map<string, { member: GameState["members"][number]; portfolios: typeof COUNCIL_PORTFOLIOS }>();
    for (const portfolio of COUNCIL_PORTFOLIOS) {
      const member = portfolioOwner(game, portfolio);
      if (!member) continue;
      const entry = grouped.get(member.id) ?? { member, portfolios: [] };
      entry.portfolios.push(portfolio);
      grouped.set(member.id, entry);
    }
    return [...grouped.values()]
      .sort((a, b) => Number(b.member.personalEventState === "active") - Number(a.member.personalEventState === "active") || b.portfolios.length - a.portfolios.length)
      .slice(0, 4);
  }, [game]);
  const freshMapSignals = (game.worldSignals ?? []).filter((signal) => signal.week === reportWeek && signal.districtId).length
    + (game.worldKernel?.observations ?? []).filter((observation) => observation.week === reportWeek && (observation.visibility === "player" || observation.holderIds.includes("player"))).length;

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
    {showScribeGuide && <aside className="scribe-guide" role="note"><header><BookOpen size={16} /><strong>书记员引导 · 第一周怎么玩</strong><button onClick={dismissGuide} aria-label="关闭引导"><X size={15} /></button></header><ol><li>在「形成决议」写一句命令，确认契约后写入本周日程</li><li>在「自由讨论」提出问题，让最相关的成员回应</li><li>随时用右下角能力盘发动非凡能力</li><li>即使不下命令也可以直接闭会，世界仍会继续前进</li></ol><footer><button onClick={dismissGuide}>知道了</button><button onClick={dismissGuide}>跳过引导</button></footer></aside>}
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
      <div className="table-docket"><MapIcon size={14} /><span>{activeStageCopy.title}</span><b>{stage === "orders" ? `${game.schedule.length}项待确认` : activeStageCopy.detail}</b></div>
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
      {latestChapter ? <><p className="report-summary">{latestChapter.summary}</p>{worldSnapshot && <section className="world-opening-report"><header><RadioTower size={15} /><span><small>独立世界推演 · 第{worldSnapshot.week}周</small><strong>密议室之外，城市同样度过了一周</strong></span></header><p>{worldSnapshot.atmosphere}</p>{worldSnapshot.changes.length > 0 && <div>{worldSnapshot.changes.slice(0, 4).map((change) => <span key={change}>{change}</span>)}</div>}</section>}{worldSignals.length > 0 && <section className="council-news-desk"><header><Newspaper size={15} /><span><strong>送上议桌的报纸与传闻</strong><small>消息来源决定可信度；它们不是自动生成的任务。</small></span></header><div>{worldSignals.map((signal) => <article key={signal.id}><header><span>{signal.channel}</span><b>{signal.reliability}</b></header><strong>{signal.headline}</strong><p>{signal.body}</p></article>)}</div></section>}<div className="spoken-reports">{latestChapter.results.map((result) => <article key={result.id}><header><span className={`risk-dot ${riskClass(result.contract.risk)}`} /><div><strong>{result.title}</strong><small>{result.contract.rawIntent}</small></div><b>{result.outcome}</b></header><p>{result.consequence}</p><ul>{result.findings.map((finding) => <li key={finding}><CheckCircle2 size={13} />{finding}</li>)}</ul>{result.futureChanges?.[0] && <footer><ArrowRight size={13} /><span>余波：{result.futureChanges[0]}</span></footer>}</article>)}</div>{latestChapter.results.length === 0 && <div className="no-order-world"><RadioTower size={20} /><p>上周没有形成组织决议，但世界状态、势力计划和公开消息仍已完成结算。</p></div>}</> : <div className="first-council"><Gavel size={25} /><div><strong>没有上一周可以述职。</strong><p>书记员会先宣读组织接到的第一项压力。它会带你走通第一周：下命令、确认契约、讨论、用能力、闭会推演。压力只是起点，不是预设道路。</p></div></div>}
      <footer className="panel-advance"><span>报告只说明发生了什么，不替你决定接下来做什么。</span><button onClick={() => setStage("agenda")}>进入治理议题 <ArrowRight size={15} /></button></footer>
    </section>}

    {stage === "agenda" && <section className={`council-panel agenda-panel governance-panel ${activeMission ? "has-pressure" : "no-pressure"}`}>
      {activeMission && <article className="council-pressure"><header><span><ShieldAlert size={15} />必须知情的压力</span><b>{activeMission.deadline}周后越过临界点</b></header><h2>{activeMission.title}</h2><p>{activeMission.premise}</p><div><span><i style={{ width: `${activeMission.progress}%` }} /></span><strong>{activeMission.progress}%</strong></div><footer><small>若不处理</small><p>{activeMission.consequence}</p></footer></article>}
      <section className="governance-briefing">
        <header><div><p>本周议桌</p><h2>先听主责席，再从地图决定方向</h2></div><span>{activeMission ? "1项临界压力" : "无临界压力"} · {governanceOwners.length}名主责席 · {freshMapSignals}项地图新动静</span></header>
        {urgentOrganizationIssues.length > 0 && <section className="leadership-docket"><header><Gavel size={14} /><span><strong>必须由会长决定</strong><small>只列已经越过部门授权边界的事项</small></span></header>{urgentOrganizationIssues.map((issue) => <article key={issue.id}><div><span>{issue.category} · 紧迫{issue.urgency}</span><strong>{issue.title}</strong><p>{issue.summary}</p></div><button onClick={() => bringToDecision(`处理“${issue.title}”。我要求组织采取的方向是：`)}><Gavel size={13} />拍板</button></article>)}</section>}
        {currentDepartmentReports.length > 0 && <details className="department-briefs"><summary><span>部门一句话述职</span><small>{currentDepartmentReports.length}份 · 无需决定的默认折叠</small></summary>{currentDepartmentReports.map((report) => <article key={report.id}><header><strong>{game.departments.find((item) => item.id === report.departmentId)?.name}</strong>{report.requiresDecision && <b>需裁决</b>}</header><p>{report.headline}</p><details><summary>查看依据与后果</summary><p>{report.detail}</p><small>{report.consequence}</small></details></article>)}</details>}
        <div className="governance-owners">{governanceOwners.map(({ member, portfolios }) => {
          const personal = member.personalEventState === "active" && member.personalEvent;
          const prompt = `从你负责的${portfolios.map((item) => item.name).join("、")}中，只挑本周最需要我知情的一件事说起。不要使用固定汇报格式；说明消息从哪里来、哪里仍不确定，以及是否需要我拍板。`;
          return <button key={member.id} title="进入负责人的治理对话" aria-label={`进入${member.name}负责人的治理对话`} onClick={() => props.onQuestionMember(member.id, prompt)}><i>{member.name.slice(0, 1)}</i><span><strong>{member.name}</strong><small>{personal || `${portfolios.length}项职责由此席汇总`}</small><em>{portfolios.map((item) => item.shortName).join(" · ")}</em></span><MessageSquareText size={15} /></button>;
        })}</div>
        <details className="portfolio-index"><summary><span>八项职责索引</span><small>需要时展开；同一负责人只出现一次</small></summary><div>{COUNCIL_PORTFOLIOS.map((portfolio) => { const owner = portfolioOwner(game, portfolio); return <button key={portfolio.id} onClick={() => owner && props.onQuestionMember(owner.id, `请只围绕${portfolio.name}回答：先说本周新增事实与来源，再说未知，最后说明是否需要我拍板。`)}><span><strong>{portfolio.name}</strong><small>{portfolio.mandate}</small></span><b>{owner?.name ?? "待任命"}</b></button>; })}</div></details>
      </section>
      <CityMapWorkspace game={game} selectedDistrictId={props.selectedDistrictId} onDistrict={props.onDistrict} onOpenDiscussion={(seed) => { setDiscussionText(seed); void startDiscussion(seed); }} onFormDirection={(seed, districtId) => bringToDecision(seed, districtId)} onUseAbility={props.onUseAbility} onAddHypothesis={props.onAddRouteHypothesis} />
      <footer className="panel-advance"><span>议题只负责暴露问题；你可以全部搁置并提出自己的方向。</span><button onClick={() => setStage("discussion")}>进入自由讨论 <ArrowRight size={15} /></button></footer>
    </section>}

    {stage === "discussion" && <section className="council-panel discussion-panel">
      <header className="discussion-head"><div><p>议长自由发言</p><h2>把任何内部治理问题放到桌面上</h2><span>最多三名最相关的内部成员回应；外部人士不会出现，讨论也不会自动形成命令。</span></div><MessageSquareText size={24} /></header>
      <div className="discussion-composer"><textarea value={discussionText} onChange={(event) => setDiscussionText(event.target.value)} placeholder="例如：我们是否正在过度依赖东区唯一的消息来源？请人事、行动和情报负责人分别说明依据。" maxLength={900} /><footer><span>可以点名负责人，也可以只提出问题。</span><button onClick={() => void startDiscussion()} disabled={!discussionText.trim() || discussionLoading}>{discussionLoading ? <><Sparkles size={15} />成员正在整理职责内事实</> : <><Plus size={15} />开始自由讨论</>}</button></footer></div>
      {game.councilTopics.length > 0 && <div className="topic-workspace">
        <aside className="topic-list"><header><strong>议题档案</strong><small>最多钉住3项</small></header>{game.councilTopics.map((topic) => <button key={topic.id} className={activeTopic?.id === topic.id ? "active" : ""} onClick={() => setActiveTopicId(topic.id)}><span><strong>{topic.title}</strong><small>第{topic.week}周 · {topic.messages.length - 1}项回应</small></span>{topic.pinned && <Pin size={12} />}</button>)}</aside>
        {activeTopic && <article className="topic-thread"><header><div><small>内部自由讨论</small><h3>{activeTopic.title}</h3></div><button onClick={() => props.onPinTopic(activeTopic.id)} className={activeTopic.pinned ? "active" : ""}><Pin size={13} />{activeTopic.pinned ? "已钉在桌面" : "钉在桌面"}</button></header><div className="topic-messages">{activeTopic.messages.map((message) => { const member = game.members.find((item) => item.id === message.speakerId); return <div key={message.id} className={message.speakerId === "player" ? "player" : "member"}><header><strong>{message.speakerId === "player" ? game.playerAddress : member?.name ?? "内部成员"}</strong>{message.stance && <span>{message.stance}</span>}</header><p>{message.text}</p>{member && <button onClick={() => props.onQuestionMember(member.id, `继续刚才关于“${activeTopic.title}”的讨论。请只展开你有依据的部分。`)}>点名追问</button>}</div>; })}</div>
          <footer className="topic-actions"><button onClick={() => void props.onSummarizeTopic(activeTopic.id)}><FileText size={14} />一键整理意见</button><button onClick={() => props.onUseAbility({ kind: "council", targetId: activeTopic.id, label: `自由讨论：${activeTopic.title}` }, `我在不打断讨论的情况下自由使用选定能力。目标、范围、公开或隐蔽方式以我随后输入为准，不得替换我的手段。`)}><WandSparkles size={14} />使用能力</button><button className="primary" onClick={() => props.onFormDecision(activeTopic.id)} disabled={!activeTopic.messages.length || props.decisionLoading}><Gavel size={14} />{props.decisionLoading ? "书记员正在整理…" : "由书记员根据讨论形成决议"}</button></footer>
          {activeTopic.summary && <section className="discussion-summary"><header><FileText size={14} /><strong>书记员整理</strong><small>中立摘录，不是系统推荐</small></header>{([['facts','已确认事实'],['consensus','一致意见'],['disagreements','主要分歧'],['risks','风险'],['directions','提出方向'],['unanswered','未回答问题']] as const).map(([key, label]) => activeTopic.summary?.[key].length ? <div key={key}><strong>{label}</strong>{activeTopic.summary[key].map((item) => <p key={item}>{item}</p>)}</div> : null)}</section>}
        </article>}
      </div>}
      {!game.councilTopics.length && <div className="empty-discussion"><MessageSquareText size={24} /><p>桌面上还没有自由议题。你不必等待成员给出选项。</p></div>}
      {pinnedTopics.length > 0 && <footer className="pinned-topics"><span><Pin size={12} />持续关注</span>{pinnedTopics.map((item) => <button key={item.id} onClick={() => setActiveTopicId(item.id)}>{item.title}</button>)}</footer>}
    </section>}

    {stage === "orders" && <section className="council-panel orders-panel">
      <header className="free-order-heading"><div><p>轮到{game.playerAddress}拍板</p><h2>你希望组织朝什么方向推进？</h2><span>直接写目标、手段、限制与停止条件；也可以让书记员根据桌面的自由讨论整理一份草稿。</span></div>{latestDiscussionTopic ? <button className="complete-secondary" onClick={() => props.onFormDecision(latestDiscussionTopic.id)} disabled={props.decisionLoading}>{props.decisionLoading ? "书记员正在整理…" : "从最近讨论生成决议"}</button> : <Command size={24} />}</header>
      <article className="council-composer"><textarea value={props.intentText} onChange={(event) => props.onIntentText(event.target.value)} placeholder="例如：先核对失踪工人的共同活动地点。不要接触教会，不盘问诊所；若对方察觉调查，立刻中止。" maxLength={1200} /><div className="intent-context-row"><span>空间上下文：{DISTRICTS.find((item) => item.id === props.selectedDistrictId)?.name}</span><span>{props.intentText.length}/1200</span></div><footer><span><Gavel size={13} />只整理你的原意，不生成预设道路</span><button className="complete-primary" onClick={props.onPrepare} disabled={!props.intentText.trim() || props.contractLoading}>{props.contractLoading ? <><Sparkles size={15} />负责人正在复述</> : <>形成行动契约 <ArrowRight size={16} /></>}</button></footer></article>
      <article className="decision-ledger"><header><span><CalendarDays size={15} /><strong>本周已拍板的决议</strong></span><small>{game.schedule.length}项 · 不设僵硬行动次数</small></header>{game.schedule.length ? <div>{game.schedule.map((action) => <article key={action.id}><span className={`schedule-risk ${riskClass(action.risk)}`}>{action.risk}</span><div><strong>{action.title}</strong><p>{DISTRICTS.find((district) => district.id === action.districtId)?.name} · {action.days}天 · £{action.budget}</p></div><button onClick={() => props.onRemoveAction(action.id)} aria-label="撤回这项决议"><X size={15} /></button></article>)}</div> : <div className="empty-decision"><Gavel size={21} /><span>没有决议也可以散会；世界仍会自行前进。</span></div>}<div className="week-strip">{DAY_NAMES.map((day, index) => <div key={day}><span>{day}</span>{game.schedule.filter((action) => index + 1 >= action.startDay && index + 1 < action.startDay + action.days).map((action) => <i key={action.id} className={riskClass(action.risk)} />)}</div>)}</div><footer><div><span><CircleDollarSign size={13} />£{game.money}</span><span><Sparkles size={13} />{game.spirituality}/{game.spiritualityMax}</span><span><Target size={13} />偏转 {game.deviation.toFixed(1)}%</span></div><button className="adjourn-button" onClick={props.onEndWeek} disabled={Boolean(props.generationStage) || Boolean(game.fatalSituation) || game.ending.phase !== "running"}><Gavel size={15} />{props.generationStage || (game.schedule.length ? "闭会并进入推演" : "无决议闭会，世界继续")}</button></footer></article>
    </section>}

    <aside className="council-side-notes"><button onClick={() => props.onView("progression")} disabled={Boolean(props.generationStage)}><WandSparkles size={15} /><span><small>自身与非凡能力</small><strong>序列{game.currentSequence} · 消化{game.digestion}%</strong></span><ChevronRight size={14} /></button><button onClick={() => props.onView("organization")} disabled={Boolean(props.generationStage)}><UsersRound size={15} /><span><small>组织状态</small><strong>{game.members.length}名具名成员 · 稳定{game.stability}</strong></span><ChevronRight size={14} /></button><button onClick={() => props.onView("archive")} disabled={Boolean(props.generationStage)}><BookOpen size={15} /><span><small>会议纪事</small><strong>{game.chronicle.length}篇周报可反复阅读</strong></span><ChevronRight size={14} /></button></aside>
  </div>;
}
