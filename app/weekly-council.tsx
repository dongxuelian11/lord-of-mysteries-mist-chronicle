"use client";

import { useState } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign,
  Command, Eye, Gavel, MapPin, MessageSquareText, Plus, ShieldAlert,
  Sparkles, Target, UsersRound, WandSparkles, X, Zap,
} from "lucide-react";
import { Ability, ChronicleChapter, DISTRICTS, GameState, PATHWAYS, ViewId } from "./game-model";

type CouncilStage = "reports" | "agenda" | "orders";

type Props = {
  game: GameState;
  abilities: Ability[];
  intentText: string;
  selectedDistrictId: string;
  selectedLeaderId: string;
  selectedAbilityIds: string[];
  contractLoading: boolean;
  generationStage: string;
  decisionSignal: number;
  latestChapter?: ChronicleChapter;
  onIntentText: (value: string) => void;
  onDistrict: (value: string) => void;
  onLeader: (value: string) => void;
  onAbilityIds: (value: string[]) => void;
  onPrepare: () => void;
  onRemoveAction: (id: string) => void;
  onEndWeek: () => void;
  onQuestionMember: (memberId: string, seed?: string) => void;
  onReadChapter: (chapter: ChronicleChapter) => void;
  onUseSuggestion: (text: string, districtId?: string) => void;
  onView: (view: ViewId) => void;
};

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function riskClass(risk: string) { return risk === "致命" ? "fatal" : risk === "高" ? "high" : risk === "中" ? "medium" : "low"; }

function memberIssue(game: GameState, memberId: string) {
  const member = game.members.find((item) => item.id === memberId)!;
  const pressure = game.missions.find((item) => item.state === "active");
  if (member.personalEvent && member.personalEventState === "active") return {
    title: member.personalEvent,
    detail: `${member.name}没有把这件事写进例行报告。他希望先听清组织愿意承担什么，再决定交出多少信息。`,
    prompt: `关于“${member.personalEvent}”，把你已经确认的事实、你的顾虑和你希望组织承担的代价分别说清楚。`,
  };
  if (member.id === "mara") return { title: "外勤路线与撤离窗口", detail: pressure ? `玛拉认为“${pressure.title}”仍缺少一条不惊动对方的撤退路线。` : "玛拉希望在下一次外勤前重做安全屋与撤退路线。", prompt: "从外勤角度看，本周最值得查什么？不要迎合我，也说清你拒绝执行什么。" };
  if (member.id === "cedric") return { title: "预算、身份与据点暴露", detail: `塞德里克把账本压在手边：现有资金£${game.money}，隐秘度${game.secrecy}，他认为每一道命令都应该说明代价由谁承担。`, prompt: "审查现在的组织状况，指出我最可能低估的成本，并提出你认为可持续的做法。" };
  if (member.id === "ines") return { title: "消息源正在试探组织", detail: "伊妮丝收到两封口径互相矛盾的匿名信。她不确定这是机会、诱饵，还是有人在测量组织的反应速度。", prompt: "说说你的消息源最近怎样变化。哪些是事实，哪些只是你的直觉？" };
  return { title: "灵性痕迹与封印安全", detail: `罗文昨夜重新检查了仪式室。他不赞成仅凭安静就判断封印安全，尤其在负责人当前污染为${game.playerCondition.pollution}时。`, prompt: "从非凡者角度说明据点里最危险的灵性迹象。你可以反对我亲自出动。" };
}

export default function WeeklyCouncil(props: Props) {
  const { game, latestChapter } = props;
  const [stage, setStage] = useState<CouncilStage>(props.decisionSignal > 0 ? "orders" : latestChapter ? "reports" : "agenda");
  const activeMission = game.missions.find((mission) => mission.state === "active");
  const currentSequence = PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)!;
  const unresolvedProposals = game.dialogueThreads.flatMap((thread) => thread.proposal?.status === "open" ? [thread.proposal] : []);
  const bringToDecision = (text: string, districtId?: string) => { props.onUseSuggestion(text, districtId); setStage("orders"); };

  return <div className="council-page page-enter">
    <header className="council-masthead">
      <div><p>第 {game.week} 周 · {game.date}</p><h1>每周密议</h1><span>上周的一切在桌上留下痕迹；这周做什么，由你问、由他们答、最后由你拍板。</span></div>
      <div className="council-rule"><Eye size={17} /><span><strong>AI 议事原则</strong><small>没有预设正确路线。成员可以反对、隐瞒、误判或提出自己的方案。</small></span></div>
    </header>

    <section className="council-room" aria-label="组织每周集会现场">
      <div className="council-haze" aria-hidden="true" />
      <div className="council-table" aria-hidden="true"><span /><i /><b /></div>
      <div className="chair player-chair"><span>主持席</span><strong>你</strong><small>序列{game.currentSequence} · {currentSequence.name}</small></div>
      {game.members.map((member, index) => {
        const thread = game.dialogueThreads.find((item) => item.memberId === member.id);
        return <button key={member.id} className={`council-seat seat-${index + 1}`} onClick={() => props.onQuestionMember(member.id)} aria-label={`点名${member.name}发言`}>
          <i>{member.name.slice(0, 1)}</i><span><strong>{member.name}</strong><small>{thread?.lastMood ?? member.role}</small></span>{thread?.proposal?.status === "open" && <b>有提案</b>}
        </button>;
      })}
      <div className="room-caption"><span>密议室 · 门已反锁</span><i /><span>{game.schedule.length} 项决议待执行</span></div>
    </section>

    <nav className="council-stages" aria-label="集会议程阶段">
      <button className={stage === "reports" ? "active" : ""} onClick={() => setStage("reports")}><span>01</span><div><strong>上周述职</strong><small>结果、证据与余波</small></div></button>
      <button className={stage === "agenda" ? "active" : ""} onClick={() => setStage("agenda")}><span>02</span><div><strong>本周议题</strong><small>成员意见与当前压力</small></div></button>
      <button className={stage === "orders" ? "active" : ""} onClick={() => setStage("orders")}><span>03</span><div><strong>形成决议</strong><small>自由发言并下达命令</small></div></button>
    </nav>

    {stage === "reports" && <section className="council-panel reports-panel">
      <header><div><p>书记员已展开上周记录</p><h2>{latestChapter?.title ?? "第一次集会"}</h2></div>{latestChapter && <button onClick={() => props.onReadChapter(latestChapter)}><BookOpen size={15} />重读小说章节</button>}</header>
      {latestChapter ? <>
        <p className="report-summary">{latestChapter.summary}</p>
        <div className="spoken-reports">{latestChapter.results.map((result) => <article key={result.id}>
          <header><span className={`risk-dot ${riskClass(result.contract.risk)}`} /><div><strong>{result.title}</strong><small>{result.contract.rawIntent}</small></div><b>{result.outcome}</b></header>
          <p>{result.consequence}</p>
          <ul>{result.findings.map((finding) => <li key={finding}><CheckCircle2 size={13} />{finding}</li>)}</ul>
          {result.futureChanges?.[0] && <footer><ArrowRight size={13} /><span>余波：{result.futureChanges[0]}</span></footer>}
        </article>)}</div>
      </> : <div className="first-council"><Gavel size={25} /><div><strong>这是组织第一次正式周会。</strong><p>没有上一周可供述职。黑玻璃挂坠、补写的工人名单和失踪信使已经摆在桌上；它们是压力，不是规定路线。</p></div></div>}
      <footer className="panel-advance"><span>听完不等于接受他们的判断。</span><button onClick={() => setStage("agenda")}>进入本周议题 <ArrowRight size={15} /></button></footer>
    </section>}

    {stage === "agenda" && <section className="council-panel agenda-panel">
      {activeMission && <article className="council-pressure">
        <header><span><ShieldAlert size={15} />必须知情的压力</span><b>{activeMission.deadline}周后越过临界点</b></header>
        <h2>{activeMission.title}</h2><p>{activeMission.premise}</p>
        <div><span><i style={{ width: `${activeMission.progress}%` }} /></span><strong>{activeMission.progress}%</strong></div>
        <footer><small>若不处理</small><p>{activeMission.consequence}</p></footer>
        <details><summary>查看成员整理的切入点（可以全部忽略）</summary><div>{activeMission.hints.slice(0, 4).map((hint) => <button key={hint} onClick={() => bringToDecision(hint)}>{hint}<Plus size={12} /></button>)}</div></details>
      </article>}
      <div className="member-agendas">{game.members.map((member) => {
        const issue = memberIssue(game, member.id);
        return <article key={member.id}>
          <header><i>{member.name.slice(0, 1)}</i><span><small>{member.name}提出</small><strong>{issue.title}</strong></span></header>
          <p>{issue.detail}</p>
          <button onClick={() => props.onQuestionMember(member.id, issue.prompt)}><MessageSquareText size={14} />点名追问，允许他自由回答</button>
        </article>;
      })}</div>
      {unresolvedProposals.length > 0 && <div className="npc-proposals"><header><Sparkles size={14} /><strong>谈话中形成的成员提案</strong></header>{unresolvedProposals.map((proposal) => <article key={proposal.id}><div><strong>{proposal.title}</strong><p>{proposal.rationale}</p></div><button onClick={() => bringToDecision(proposal.intent, proposal.districtId)}>带到决议席 <ChevronRight size={14} /></button></article>)}</div>}
      <footer className="panel-advance"><span>议题只负责暴露问题，不负责替你选择。</span><button onClick={() => setStage("orders")}>开始形成决议 <ArrowRight size={15} /></button></footer>
    </section>}

    {stage === "orders" && <section className="council-panel orders-panel">
      <header className="free-order-heading"><div><p>轮到负责人发言</p><h2>你准备让组织做什么？</h2><span>直接说目标、方法、对象、能力和底线。不是选项题，也不要求沿着现有案件走。</span></div><Command size={24} /></header>
      <article className="council-composer">
        <textarea value={props.intentText} onChange={(event) => props.onIntentText(event.target.value)} placeholder="例如：先不碰挂坠。我想让塞德里克以保险审计为名，查最近三个月所有临时工伤亡赔付；只看公开账目，不接触王室承包人。" maxLength={700} />
        <div className="intent-context-row">
          <label><MapPin size={13} /><select value={props.selectedDistrictId} onChange={(event) => props.onDistrict(event.target.value)}>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>
          <label><UsersRound size={13} /><select value={props.selectedLeaderId} onChange={(event) => { props.onLeader(event.target.value); if (event.target.value !== "player") props.onAbilityIds([]); }}><option value="player">你 · 亲自出动</option>{game.members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>
          <span>{props.intentText.length}/700</span>
        </div>
        {props.selectedLeaderId === "player" && <div className="ability-picker council-abilities"><div><Zap size={14} /><span><strong>在决议中声明非凡能力</strong><small>成员会讨论使用方式；只有拍板后才消耗灵性</small></span></div><div className="ability-pills">{props.abilities.map((ability) => <button key={ability.id} className={props.selectedAbilityIds.includes(ability.id) ? "selected" : ""} disabled={ability.passive || ability.cost > game.spirituality} onClick={() => props.onAbilityIds(props.selectedAbilityIds.includes(ability.id) ? props.selectedAbilityIds.filter((id) => id !== ability.id) : [...props.selectedAbilityIds, ability.id])}><span>{ability.name}</span><small>{ability.passive ? "被动" : `${ability.cost}灵性`}</small></button>)}</div></div>}
        <footer><span><Gavel size={13} />规则会先解释可执行性、风险与撤退线</span><button className="complete-primary" onClick={props.onPrepare} disabled={!props.intentText.trim() || props.contractLoading}>{props.contractLoading ? <><Sparkles size={15} />成员正在理解命令</> : <>提交议桌审议 <ArrowRight size={16} /></>}</button></footer>
      </article>

      <article className="decision-ledger">
        <header><span><CalendarDays size={15} /><strong>本周已拍板的决议</strong></span><small>{game.schedule.length} 项 · 可以并行，但人员不能重叠</small></header>
        {game.schedule.length ? <div>{game.schedule.map((action) => <article key={action.id}><span className={`schedule-risk ${riskClass(action.risk)}`}>{action.risk}</span><div><strong>{action.title}{action.focus && <em>重点叙事</em>}</strong><p>{action.leaderId === "player" ? "你 · 亲自出动" : game.members.find((member) => member.id === action.leaderId)?.name} · {DAY_NAMES[action.startDay - 1]}起 · {action.days}天 · £{action.budget}</p></div><button onClick={() => props.onRemoveAction(action.id)} aria-label="撤回这项决议"><X size={15} /></button></article>)}</div> : <div className="empty-decision"><Gavel size={21} /><span>还没有拍板任何命令。你可以让这一周保持低调，世界仍会自行前进。</span></div>}
        <div className="week-strip">{DAY_NAMES.map((day, index) => <div key={day}><span>{day}</span>{game.schedule.filter((action) => index + 1 >= action.startDay && index + 1 < action.startDay + action.days).map((action) => <i key={action.id} className={riskClass(action.risk)} />)}</div>)}</div>
        <footer><div><span><CircleDollarSign size={13} />£{game.money}</span><span><Sparkles size={13} />{game.spirituality}/{game.spiritualityMax}</span><span><Target size={13} />偏转 {game.deviation.toFixed(1)}%</span></div><button className="adjourn-button" onClick={props.onEndWeek} disabled={Boolean(props.generationStage) || Boolean(game.fatalSituation) || game.ending.phase === "finale" || game.ending.phase === "ended"}><Gavel size={15} />{props.generationStage || (game.schedule.length ? "散会并执行本周决议" : "无决议散会，让世界前进")}</button></footer>
      </article>
    </section>}

    <aside className="council-side-notes">
      <button onClick={() => props.onView("progression")}><WandSparkles size={15} /><span><small>负责人晋升</small><strong>序列{game.currentSequence} · 消化{game.digestion}%</strong></span><ChevronRight size={14} /></button>
      <button onClick={() => props.onView("organization")}><UsersRound size={15} /><span><small>组织状态</small><strong>{game.members.length}名成员 · 稳定{game.stability}</strong></span><ChevronRight size={14} /></button>
      <button onClick={() => props.onView("city")}><MapPin size={15} /><span><small>离开议桌</small><strong>查看贝克兰德地图</strong></span><ChevronRight size={14} /></button>
    </aside>
  </div>;
}
