"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BookOpen, ChevronRight, Command, Gavel, Map as MapIcon,
  MessageSquareText, Pin, RadioTower, ShieldAlert, Sparkles, Target, UsersRound, X,
} from "lucide-react";
import BacklundControlMap from "./backlund-control-map";
import { buildCouncilMatters } from "./council-focus";
import { COUNCIL_PORTFOLIOS, portfolioOwner } from "./council-system";
import { AbilityContext, ChronicleChapter, DISTRICTS, GameState, ViewId } from "./game-model";

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
  onPrepare: () => void;
  onRemoveAction: (id: string) => void;
  onEndWeek: () => void;
  onQuestionMember: (memberId: string, seed?: string) => void;
  onOpenOrganization: () => void;
  onReadChapter: (chapter: ChronicleChapter) => void;
  onUseSuggestion: (text: string, districtId?: string) => void;
  onView: (view: ViewId) => void;
  onUseAbility: (context: AbilityContext, prompt: string) => void;
  onStartDiscussion: (text: string) => Promise<string | null>;
  onSummarizeTopic: (topicId: string) => Promise<void>;
  onPinTopic: (topicId: string) => void;
  onFormDecision: (topicId: string) => void;
  decisionLoading: boolean;
};

function riskClass(risk: string) {
  return risk === "致命" ? "fatal" : risk === "高" ? "high" : risk === "中" ? "medium" : "low";
}

type CouncilMatter = ReturnType<typeof buildCouncilMatters>[number];

function matterKindLabel(matter: CouncilMatter) {
  if (matter.attentionState === "needs-ruling") return "等待追加授权";
  if (matter.attentionState === "deferred") return "目标暂缓";
  if (matter.attentionState === "partially-completed") return "已有进展，尚未完成";
  if (matter.attentionState === "interrupted") return "已经停下";
  return matter.kind === "strategy" ? "当前主战略" : matter.kind === "world-pressure" ? "世界压力" : "组织异常";
}

function proposalKindLabel(kind: CouncilMatter["proposals"][number]["kind"]) {
  return kind === "recommended" ? "推荐方案" : "替代视角";
}

function echoLanguage(result: ChronicleChapter["results"][number]) {
  if (result.executionStatus === "awaiting-authorization" || result.executionStatus === "escalation-required") {
    return { label: "等待裁定", detail: "负责人按你的边界停下了，没有擅自执行。", future: "是否继续，将由你重新决定目标、投入与授权边界。" };
  }
  if (result.executionStatus === "deferred") {
    return { label: "目标保留", detail: "当前条件不足以安全展开，负责人保留了目标，没有把等待伪装成进展。", future: "条件改变后继续；需要改变边界时才会重新请示。" };
  }
  if (result.executionStatus === "partially-completed") {
    return { label: "部分完成", detail: "行动已经造成真实变化，但目标尚未全部完成。", future: "已发生的后果会保留，剩余目标需要继续判断。" };
  }
  if (result.executionStatus === "interrupted") {
    return { label: "已经停下", detail: "行动触及红线或停止条件后中止；已经发生的变化仍然有效。", future: "若要继续，必须重新确认授权边界。" };
  }
  return { label: result.outcome, detail: result.consequence, future: result.futureChanges?.[0] };
}

function receiptEcho(result: ChronicleChapter["results"][number]) {
  if (!result.causalReceipts) return [];
  return [
    result.causalReceipts.people[0]?.summary,
    result.causalReceipts.resources[0]?.summary,
    result.causalReceipts.locations[0]?.summary,
    result.causalReceipts.knowledge[0]?.summary,
    result.causalReceipts.relationships[0]?.summary,
    result.causalReceipts.futureCauses[0]?.summary,
  ].filter((item): item is string => Boolean(item)).slice(0, 4);
}

export default function WeeklyCouncil(props: Props) {
  const { game, latestChapter } = props;
  const matters = useMemo(() => buildCouncilMatters(game), [game]);
  const [selectedMatterId, setSelectedMatterId] = useState(matters[0]?.id ?? "");
  const [discussionText, setDiscussionText] = useState("");
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState(game.councilTopics.find((item) => item.status === "open")?.id ?? "");
  const [mapOpen, setMapOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const selectedMatter = matters.find((matter) => matter.id === selectedMatterId) ?? matters[0];
  const activeTopic = game.councilTopics.find((item) => item.id === activeTopicId) ?? game.councilTopics[0];
  const latestDiscussionTopic = game.councilTopics.find((topic) => topic.messages.length > 0);
  const playerLed = /我亲自|亲自参与|亲自前往|由我带队/.test(props.intentText);
  const reportWeek = latestChapter?.week ?? Math.max(1, game.week - 1);
  const worldSnapshot = game.worldSnapshots?.find((snapshot) => snapshot.week === reportWeek);
  const visibleSignals = (game.worldSignals ?? []).filter((signal) => signal.week === reportWeek).slice(0, 3);
  const strategyNotices = [...new Set(matters
    .filter((matter) => matter.strategyImpact === "deferred" || matter.strategyImpact === "interrupted")
    .map((matter) => matter.strategyNote)
    .filter((note): note is string => Boolean(note)))];

  const governanceOwners = useMemo(() => {
    const grouped = new Map<string, { member: GameState["members"][number]; portfolios: typeof COUNCIL_PORTFOLIOS }>();
    for (const portfolio of COUNCIL_PORTFOLIOS) {
      const member = portfolioOwner(game, portfolio);
      if (!member) continue;
      const entry = grouped.get(member.id) ?? { member, portfolios: [] };
      entry.portfolios.push(portfolio);
      grouped.set(member.id, entry);
    }
    return [...grouped.values()].sort((left, right) => right.portfolios.length - left.portfolios.length).slice(0, 4);
  }, [game]);

  useEffect(() => {
    if (props.decisionSignal > 0) textareaRef.current?.focus();
  }, [props.decisionSignal]);

  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [activeTopic?.id, activeTopic?.messages.length]);

  function selectExecutionMode(mode: "delegated" | "player-led") {
    const withoutMarker = props.intentText.replace(/^我亲自参与这项行动[：:]\s*/, "");
    props.onIntentText(mode === "player-led" ? `我亲自参与这项行动：${withoutMarker}` : withoutMarker);
  }

  async function startDiscussion(seed?: string) {
    const text = (seed ?? discussionText).trim();
    if (!text || discussionLoading) return;
    setDiscussionLoading(true);
    const id = await props.onStartDiscussion(text);
    if (id) setActiveTopicId(id);
    setDiscussionText("");
    setDiscussionLoading(false);
  }

  function useMatterDirection() {
    if (!selectedMatter) return;
    props.onUseSuggestion(selectedMatter.proposals[0]?.text ?? selectedMatter.decisionSeed, selectedMatter.districtId ?? props.selectedDistrictId);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function writeProposalToComposer(proposal: CouncilMatter["proposals"][number]) {
    props.onUseSuggestion(proposal.text, selectedMatter?.districtId ?? props.selectedDistrictId);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return <div className={`council-page council-focus-page page-enter ${props.generationStage ? "council-simulating" : ""}`}>
    <header className="council-masthead">
      <div><p>第 {game.week} 周 · {game.date}</p><h1>{game.playerAddress}主持的最高议会</h1><span>先看必须由你判断的三件大事，再决定组织要改变什么、交给谁、授权到哪里。</span></div>
      <div className="council-rule"><UsersRound size={17} /><span><strong>{governanceOwners.length} 名负责人在席</strong><small>日常事务继续自行运行 · 异常才送上议桌</small></span></div>
    </header>

    {latestChapter && <section className="council-echo" aria-labelledby="last-echo-title">
      <header><div><RadioTower size={16} /><span><small>上一轮回响</small><strong id="last-echo-title">{latestChapter.title}</strong></span></div><button onClick={() => props.onReadChapter(latestChapter)}><BookOpen size={14} />阅读完整纪事</button></header>
      <p>{latestChapter.summary}</p>
      <div className="echo-changes">
        {latestChapter.results.slice(0, 3).map((result) => { const echo = echoLanguage(result); const receipts = receiptEcho(result); return <article key={result.id}><b>{echo.label}</b><span><strong>{result.title}</strong><small>{echo.detail}</small>{receipts.map((item) => <small className="causal-receipt" key={item}>{item}</small>)}{echo.future && <em>仍会继续：{echo.future}</em>}</span></article>; })}
        {latestChapter.results.length === 0 && <article><b>世界</b><span><strong>你没有下令，城市也没有停下</strong><small>{worldSnapshot?.atmosphere ?? "负责人、分部与外部势力都按既有目标继续行动。"}</small></span></article>}
      </div>
    </section>}

    <section className="great-matters" aria-labelledby="great-matters-title">
      <header><div><p>本轮注意力</p><h2 id="great-matters-title">三件大事</h2><span>最多三件；普通汇报、日程和琐碎变化不会占据首领席位。</span></div><button onClick={() => setMapOpen(true)}><MapIcon size={15} />展开贝克兰德地图</button></header>
      {strategyNotices.length > 0 && <div className="strategy-impact-notice" role="status"><Target size={15} /><span><strong>长期方向的回响</strong>{strategyNotices.map((note) => <small key={note}>{note}</small>)}</span></div>}
      <div className="matter-layout">
        <div className="matter-list" role="list">
          {matters.map((matter, index) => <button key={matter.id} type="button" role="listitem" className={matter.id === selectedMatter?.id ? "active" : ""} onClick={() => setSelectedMatterId(matter.id)}>
            <span>{index + 1}</span><div><small>{matterKindLabel(matter)}</small><strong>{matter.title}</strong><p>{matter.whatHappened}</p></div><ChevronRight size={16} />
          </button>)}
        </div>
        {selectedMatter && <article className="matter-briefing">
          <header><span className={`matter-kind ${selectedMatter.kind} ${selectedMatter.attentionState}`}>{matterKindLabel(selectedMatter)}</span><b>紧迫度：{selectedMatter.urgency >= 80 ? "必须现在判断" : selectedMatter.urgency >= 60 ? "本轮应定方向" : "可以观察"}</b></header>
          <h3>{selectedMatter.title}</h3>
          <dl>
            <div><dt>为什么现在出现</dt><dd>{selectedMatter.whyNow}</dd></div>
            <div><dt>已知因果</dt><dd>{selectedMatter.causalNote}</dd></div>
          </dl>
          <div className="matter-proposals" aria-label="干部提出的可编辑方案">
            <header><strong>干部提出的可编辑方案</strong><span>写入输入框后仍可删改，不会直接执行。</span></header>
            {selectedMatter.proposals.map((proposal) => <article key={proposal.id} className={proposal.kind}>
              <header><span className="proposal-kind">{proposalKindLabel(proposal.kind)}</span><strong>{proposal.advisorName}</strong><em>{proposal.stance}</em></header>
              <p>{proposal.text}</p>
              <small>依据：{proposal.basis}</small>
              <div><span>投入：{proposal.resourceLabel}</span><span>主要风险：{proposal.risk}</span><span>请示：{proposal.consultWhen}</span></div>
              <button onClick={() => writeProposalToComposer(proposal)}>写入可编辑指令</button>
            </article>)}
          </div>
          <div className="matter-risks"><span><strong>委派风险</strong>{selectedMatter.delegationRisk}</span><span><strong>亲历风险</strong>{selectedMatter.interventionRisk}</span><span><strong>不处理</strong>{selectedMatter.neglectOutcome}</span></div>
          <footer>
            {selectedMatter.recommendedOwnerId && <button onClick={() => props.onQuestionMember(selectedMatter.recommendedOwnerId!, selectedMatter.discussionSeed)}><MessageSquareText size={14} />追问推荐负责人</button>}
            <button onClick={() => void startDiscussion(selectedMatter.discussionSeed)} disabled={discussionLoading}><UsersRound size={14} />听取不同意见</button>
            <button className="primary" onClick={useMatterDirection}><ArrowRight size={14} />把推荐写入指令</button>
          </footer>
        </article>}
      </div>
    </section>

    <section className="council-advisers" aria-labelledby="advisers-title">
      <header><div><p>四名负责人</p><h2 id="advisers-title">先问人，再改方案</h2></div><span>每个人只从自己掌握的事实和立场发言。</span></header>
      <div>{governanceOwners.map(({ member, portfolios }) => <button key={member.id} onClick={() => props.onQuestionMember(member.id, selectedMatter?.discussionSeed)}><i>{member.name.slice(0, 1)}</i><span><small>{portfolios.map((item) => item.shortName).join(" · ")}</small><strong>{member.name}</strong><em>{member.personalEventState === "active" ? member.personalEvent : "可就当前大事提出方案"}</em></span><MessageSquareText size={15} /></button>)}</div>
    </section>

    {activeTopic && <section className="council-conversation" aria-labelledby="conversation-title">
      <header><div><p>干部讨论</p><h2 id="conversation-title">{activeTopic.title}</h2></div><button onClick={() => props.onPinTopic(activeTopic.id)} className={activeTopic.pinned ? "active" : ""}><Pin size={13} />{activeTopic.pinned ? "持续关注" : "钉在议桌"}</button></header>
      <div className="topic-messages" ref={messagesRef}>{activeTopic.messages.slice(-8).map((message) => { const member = game.members.find((item) => item.id === message.speakerId); return <div key={message.id} className={message.speakerId === "player" ? "player" : "member"}><header><strong>{message.speakerId === "player" ? game.playerAddress : member?.name ?? "内部成员"}</strong>{message.stance && <span>{message.stance}</span>}</header><p>{message.text}</p>{member && <button onClick={() => props.onQuestionMember(member.id, `继续围绕“${activeTopic.title}”说明你的依据、方案与请示边界。`)}>点名追问</button>}</div>; })}</div>
      <footer><button onClick={() => void props.onSummarizeTopic(activeTopic.id)}>整理事实与分歧</button><button className="primary" onClick={() => props.onFormDecision(activeTopic.id)} disabled={!activeTopic.messages.length || props.decisionLoading}>{props.decisionLoading ? "正在整理…" : "将讨论整理成可编辑指令"}</button></footer>
    </section>}

    <section className="leader-direction" aria-labelledby="leader-direction-title">
      <header className="free-order-heading"><div><p>轮到{game.playerAddress}拍板</p><h2 id="leader-direction-title">你要改变什么，授权到哪里？</h2><span>直接采用、修改、组合或否决干部意见。写目标、负责人、投入尺度、禁止事项和何时必须请示；不需要管理日历与排班。</span></div>{latestDiscussionTopic ? <button onClick={() => props.onFormDecision(latestDiscussionTopic.id)} disabled={props.decisionLoading}>从讨论整理草稿</button> : <Command size={24} />}</header>
      <article className="council-composer">
        <div className="execution-mode" role="group" aria-label="介入方式"><button className={!playerLed ? "active" : ""} onClick={() => selectExecutionMode("delegated")}><strong>委派并授权</strong><small>负责人自行安排时机、人员和资源冲突；触及你的边界时请示</small></button><button className={playerLed ? "active" : ""} onClick={() => selectExecutionMode("player-led")}><strong>我亲自介入</strong><small>由你承担现场风险，并进入连续自由指令场景</small></button></div>
        <textarea ref={textareaRef} value={props.intentText} onChange={(event) => props.onIntentText(event.target.value)} placeholder="例如：由情报负责人统筹核对失踪者的共同活动地点，动用少量可靠人手和必要经费。不得接触教会；若对方察觉调查或出现污染征兆，立刻中止并请示。" maxLength={1200} />
        <div className="intent-context-row"><span><Target size={12} />当前地图上下文：{DISTRICTS.find((item) => item.id === props.selectedDistrictId)?.name}</span><span>{props.intentText.length}/1200</span></div>
        <footer><span><Gavel size={13} />AI 只复述并结构化你的授权，不替你选择道路</span><button className="complete-primary" onClick={props.onPrepare} disabled={!props.intentText.trim() || props.contractLoading}>{props.contractLoading ? <><Sparkles size={15} />负责人正在复述</> : <>检查理解并写入决议 <ArrowRight size={16} /></>}</button></footer>
      </article>
    </section>

    <section className="directive-ledger" aria-labelledby="directive-ledger-title">
      <header><div><p>已经拍板</p><h2 id="directive-ledger-title">本轮首领指令</h2></div><span>{game.schedule.length} 项 · 数量不限，冲突由负责人和世界共同回应</span></header>
      {game.schedule.length ? <div>{game.schedule.map((action) => <article key={action.id}><span className={`schedule-risk ${riskClass(action.risk)}`}>{action.risk}</span><div><strong>{action.title}</strong><p>{action.executionMode === "player-led" || action.leaderId === "player" ? "你将亲自介入" : `委派给${game.members.find((member) => member.id === action.leaderId)?.name ?? "组织负责人"}`} · {DISTRICTS.find((district) => district.id === action.districtId)?.name}</p><small>{action.redLines ? `授权边界：${action.redLines}` : `停止条件：${action.retreat}`}</small></div><button onClick={() => props.onRemoveAction(action.id)} aria-label="撤回尚未闭会的指令"><X size={15} /></button></article>)}</div> : <div className="empty-decision"><Gavel size={21} /><span>没有新指令也可以闭会；世界仍会沿既有因果继续运行。</span></div>}
      <footer><span><ShieldAlert size={13} />闭会后结果不可重掷，历史不会回到决定之前。</span><button className="adjourn-button" onClick={props.onEndWeek} disabled={Boolean(props.generationStage) || Boolean(game.fatalSituation) || game.ending.phase !== "running"}><Gavel size={15} />{props.generationStage ? "世界正在回应…" : "闭会，等待世界回应"}</button></footer>
    </section>

    {visibleSignals.length > 0 && <details className="council-known-signals"><summary>本轮可知但尚未升级为大事的消息（{visibleSignals.length}）</summary>{visibleSignals.map((signal) => <article key={signal.id}><span>{signal.channel} · {signal.reliability}</span><strong>{signal.headline}</strong><p>{signal.body}</p></article>)}</details>}

    <aside className="council-side-notes"><button onClick={props.onOpenOrganization} disabled={Boolean(props.generationStage)}><UsersRound size={15} /><span><small>二级视图</small><strong>组织总账</strong></span><ChevronRight size={14} /></button><button onClick={() => props.onView("archive")} disabled={Boolean(props.generationStage)}><BookOpen size={15} /><span><small>不可回头的历史</small><strong>{game.chronicle.length} 篇纪事</strong></span><ChevronRight size={14} /></button><button onClick={() => setMapOpen(true)} disabled={Boolean(props.generationStage)}><MapIcon size={15} /><span><small>影响对象与地点</small><strong>贝克兰德地图</strong></span><ChevronRight size={14} /></button></aside>

    {mapOpen && <div className="council-map-backdrop" onMouseDown={() => setMapOpen(false)}><section className="council-map-modal" role="dialog" aria-modal="true" aria-label="贝克兰德城市地图" onMouseDown={(event) => event.stopPropagation()}><header><div><p>议桌城市测绘图</p><h2>贝克兰德 · 选择要影响的局面</h2><span>地图提供地点、人物和已知关系；控制只会因真实行动与各方回应而改变。</span></div><button onClick={() => setMapOpen(false)} aria-label="关闭地图"><X size={18} /></button></header><BacklundControlMap game={game} selectedDistrictId={props.selectedDistrictId} onDistrict={props.onDistrict} onOpenDiscussion={(seed) => { setMapOpen(false); void startDiscussion(seed); }} onFormDirection={(seed, districtId) => { setMapOpen(false); props.onUseSuggestion(seed, districtId); window.setTimeout(() => textareaRef.current?.focus(), 0); }} /></section></div>}
  </div>;
}
