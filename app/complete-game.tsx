"use client";

import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, BookOpen, Boxes, Building2, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock3, CloudFog, Command, Eye, FileKey, FlaskConical,
  GitBranch, Hammer, Landmark, Lightbulb, ListTodo, LockKeyhole, Map, MapPin, Menu, PackageSearch,
  Plus, RotateCcw, Search, Send, Settings, ShieldAlert, Sparkles, Target, TrendingUp,
  UsersRound, WandSparkles, X, Zap,
} from "lucide-react";
import {
  ActionContract, ADVANCEMENT_RITUALS, ChronicleChapter, createInitialGame, DISTRICTS, Facility, GameState, PATHWAYS,
  PathwayId, PlayerIntent, RiskLevel, ViewId,
} from "./game-model";
import {
  advanceSequence, AiConfig, availableAbilities, callModel, canAdvance, generateAiWorldDelta, generateLiteraryChapter,
  connectEvidence, enterSandbox, interpretIntentWithAi, localContract, resolveFatalSituation, resolveFinale,
  resolveWeek, scheduleContract, transformOrganization,
} from "./game-engine";
import InvestigationBoard from "./investigation-board";
import OrganizationOperations from "./organization-operations";

const SAVE_KEY = "mist-chronicle-complete-v7";
const LEGACY_SAVE_KEYS = ["mist-chronicle-complete-v6", "mist-chronicle-complete-v5"];
const AI_KEY = "mist-chronicle-save-v3-ai";
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const NAV_ITEMS: { id: ViewId; label: string; icon: typeof Command }[] = [
  { id: "intent", label: "意图", icon: Command },
  { id: "investigation", label: "调查", icon: GitBranch },
  { id: "city", label: "城市", icon: Map },
  { id: "organization", label: "组织", icon: Building2 },
  { id: "progression", label: "晋升", icon: WandSparkles },
  { id: "archive", label: "纪事", icon: Archive },
  { id: "ending", label: "结局", icon: CloudFog },
];

function riskClass(risk: RiskLevel) { return risk === "致命" ? "fatal" : risk === "高" ? "high" : risk === "中" ? "medium" : "low"; }

function memberName(game: GameState, id: string) {
  return id === "player" ? "你 · 组织负责人" : game.members.find((member) => member.id === id)?.name ?? "未知成员";
}

function editableContractField(contract: ActionContract, setContract: (value: ActionContract) => void, key: keyof ActionContract, label: string, wide = false) {
  const value = contract[key];
  if (typeof value !== "string") return null;
  return <label className={wide ? "contract-field wide" : "contract-field"}><span>{label}</span><textarea value={value} onChange={(event) => setContract({ ...contract, [key]: event.target.value })} /></label>;
}

export default function CompleteGame() {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewId>("intent");
  const [intentText, setIntentText] = useState("我想先用灵视检查黑玻璃挂坠，再查名单上最后三名工人的住址；如果发现未知注视，立即切断接触并求援。");
  const [selectedDistrictId, setSelectedDistrictId] = useState("cherwood");
  const [selectedLeaderId, setSelectedLeaderId] = useState("player");
  const [selectedAbilityIds, setSelectedAbilityIds] = useState<string[]>([]);
  const [contract, setContract] = useState<ActionContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [selectedDistrictDetail, setSelectedDistrictDetail] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedRank, setSelectedRank] = useState(9);
  const [selectedChapter, setSelectedChapter] = useState<ChronicleChapter | null>(null);
  const [turnChapter, setTurnChapter] = useState<ChronicleChapter | null>(null);
  const [generationStage, setGenerationStage] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [readerScale, setReaderScale] = useState(1.08);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [draftPathway, setDraftPathway] = useState<PathwayId>("seer");
  const [intentDraft, setIntentDraft] = useState("");
  const [toast, setToast] = useState("");
  const [chatMemberId, setChatMemberId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "player" | "member"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(SAVE_KEY);
      const legacySaved = LEGACY_SAVE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      const savedAi = window.localStorage.getItem(AI_KEY);
      if (saved) {
        try { const value = JSON.parse(saved) as GameState; if (value.version === 7) setGame(value); }
        catch { window.localStorage.removeItem(SAVE_KEY); }
      } else if (legacySaved) {
        try {
          const legacy = JSON.parse(legacySaved) as Partial<GameState>;
          if ([5, 6].includes(legacy.version ?? 0) && Array.isArray(legacy.chronicle)) setGame((current) => ({ ...current, chronicle: legacy.chronicle!.map((chapter) => ({ ...chapter, id: `legacy-${chapter.id}`, title: `旧历史分支 · ${chapter.title}` })) }));
        } catch { /* 旧存档只用于读取纪事，损坏时不影响新游戏。 */ }
      }
      if (savedAi) {
        try { const value = JSON.parse(savedAi) as Partial<AiConfig>; setEndpoint(value.endpoint ?? ""); setApiKey(value.apiKey ?? ""); setModel(value.model ?? ""); }
        catch { window.localStorage.removeItem(AI_KEY); }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { if (hydrated) window.localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }, [game, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3600); return () => window.clearTimeout(timer); }, [toast]);
  const pathway = PATHWAYS[game.pathwayId];
  const currentSequence = pathway.sequences.find((sequence) => sequence.rank === game.currentSequence)!;
  const nextSequence = pathway.sequences.find((sequence) => sequence.rank === game.currentSequence - 1);
  const abilities = availableAbilities(game);
  const aiReady = Boolean(endpoint.trim() && apiKey.trim() && model.trim());
  const activeMission = game.missions.find((mission) => mission.state === "active");
  const latestChapter = game.chronicle[0];

  async function prepareContract() {
    if (!intentText.trim() || contractLoading) return;
    const selectedAbilityCost = abilities
      .filter((ability) => selectedAbilityIds.includes(ability.id) && !ability.passive)
      .reduce((sum, ability) => sum + ability.cost, 0);
    if (selectedLeaderId === "player" && selectedAbilityCost > game.spirituality) {
      setToast(`所选能力需要 ${selectedAbilityCost} 点灵性，当前只有 ${game.spirituality} 点。请减少能力，或先恢复灵性。`);
      return;
    }
    setContractLoading(true); setGenerationError("");
    const args = { intent: intentText.trim(), game, leaderId: selectedLeaderId, districtId: selectedDistrictId, abilityIds: selectedLeaderId === "player" ? selectedAbilityIds : [] };
    try {
      const next = aiReady ? await interpretIntentWithAi({ endpoint, apiKey, model }, args) : localContract(args);
      setContract(next);
    } catch (error) {
      setContract(localContract(args));
      setGenerationError(`${error instanceof Error ? error.message : "模型解析失败"}；已使用本地保守解释。`);
    } finally { setContractLoading(false); }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setContract(null); setSelectedDistrictDetail(null); setSelectedFacility(null); setSelectedChapter(null); setShowSettings(false); setChatMemberId(null); }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.shiftKey && !chatMemberId) { event.preventDefault(); void prepareContract(); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  function confirmContract() {
    if (!contract) return;
    try {
      const scheduled = scheduleContract(game, contract);
      setGame((current) => ({ ...current, schedule: [...current.schedule.map((item) => contract.focus ? { ...item, focus: false } : item), scheduled] }));
      setContract(null); setIntentText(""); setSelectedAbilityIds([]);
      setToast(`已排入${DAY_NAMES[scheduled.startDay - 1]}，持续${scheduled.days}天`);
    } catch (error) { setToast(error instanceof Error ? error.message : "无法加入日程"); }
  }

  function removeAction(id: string) { setGame((current) => ({ ...current, schedule: current.schedule.filter((item) => item.id !== id) })); }

  async function endWeek() {
    if (generationStage) return;
    if (game.fatalSituation || game.ending.phase === "finale" || game.ending.phase === "ended") return;
    const resolved = resolveWeek(game);
    setGame(resolved.state); setTurnChapter(resolved.chapter); setView("investigation"); setGenerationError("");
    if (!aiReady || !resolved.chapter.results.length) return;
    try {
      const literary = await generateLiteraryChapter({ endpoint, apiKey, model }, resolved.state, resolved.chapter, setGenerationStage);
      setTurnChapter(literary);
      const narratedState = { ...resolved.state, chronicle: resolved.state.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter) };
      const simulatedState = await generateAiWorldDelta({ endpoint, apiKey, model }, narratedState, literary, setGenerationStage);
      setGame((current) => ({ ...current, factions: simulatedState.factions, canonActors: simulatedState.canonActors, missions: simulatedState.missions, worldMoves: simulatedState.worldMoves, chronicle: current.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter) }));
    } catch (error) {
      setGenerationError(`${error instanceof Error ? error.message : "文学模式失败"}；本地事实章节已保留。`);
    } finally { setGenerationStage(""); }
  }

  function chooseFatal(choice: "retreat" | "help" | "continue") {
    const next = resolveFatalSituation(game, choice);
    setGame(next);
    if (!next.playerCondition.alive) { setTurnChapter(null); setView("ending"); }
    setToast(next.playerCondition.alive ? "致命处境已由规则引擎完成最终检定" : "负责人死亡，本局结束");
  }

  function chooseFinale(route: "阻止" | "利用" | "改变" | "逃离") {
    setGame((current) => resolveFinale(current, route));
    setTurnChapter(null);
    setView("ending");
  }

  function applyOrganizationChange(action: "rename" | "move" | "legalize" | "satellite" | "split" | "merge" | "rebuild", value: string) {
    const next = transformOrganization(game, action, value);
    if (next === game) { setToast(action === "legalize" ? "合法化需要官方或教会信任35、组织影响25" : action === "merge" ? "合并需要至少一个信任55的盟友" : "资金、目标或组织条件尚不满足"); return; }
    setGame(next); setToast("组织形态已改变；成员、资金、据点与关系按规则重新结算");
  }

  function applySuggestion(text: string, districtId = selectedDistrictId) { setIntentText(text); setSelectedDistrictId(districtId); setView("intent"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function addPlayerIntent() {
    if (!intentDraft.trim()) return;
    const next: PlayerIntent = { id: `intent-${Date.now()}`, text: intentDraft.trim(), pinned: false, state: "active" };
    setGame((current) => ({ ...current, playerIntents: [...current.playerIntents, next] })); setIntentDraft("");
  }

  function updateFacilityAssignment(memberId: string) {
    if (!selectedFacility) return;
    setGame((current) => ({ ...current, facilities: current.facilities.map((facility) => facility.id === selectedFacility.id ? { ...facility, assignedMemberId: memberId || undefined } : facility) }));
    setSelectedFacility({ ...selectedFacility, assignedMemberId: memberId || undefined });
  }

  function attemptAdvance() {
    try { const next = advanceSequence(game); setGame(next); setSelectedRank(next.currentSequence); setToast(`晋升完成：序列${next.currentSequence} · ${PATHWAYS[next.pathwayId].sequences.find((item) => item.rank === next.currentSequence)?.name}`); }
    catch (error) { setToast(error instanceof Error ? error.message : "尚不能晋升"); }
  }

  function startNewGame() {
    setGame(createInitialGame(draftPathway)); setSelectedRank(9); setSelectedAbilityIds([]); setShowSettings(false); setView("intent"); setToast("新的历史分支已经建立");
  }

  function saveSettings() {
    window.localStorage.setItem(AI_KEY, JSON.stringify({ endpoint, apiKey, model })); setShowSettings(false); setToast(aiReady ? "文学与自由推演接口已保存" : "已切换为离线试玩模式");
  }

  function openMemberChat(memberId: string) {
    const member = game.members.find((item) => item.id === memberId)!;
    setChatMemberId(memberId);
    setChatMessages([{ role: "member", text: `${member.name}关上门，在你对面的椅子坐下。“我有时间。你想先谈哪件事？”` }]);
    setChatInput("");
  }

  async function sendChat() {
    const text = chatInput.trim();
    const member = game.members.find((item) => item.id === chatMemberId);
    if (!text || !member || chatLoading) return;
    if (/加入|背叛|交出秘密|说服|威胁|催眠|招募|交易|承诺|命令/.test(text)) {
      setChatMemberId(null);
      applySuggestion(`与${member.name}进行一次会产生现实后果的谈话：${text}。不擅自改变其立场，先明确条件与关系风险。`, "cherwood");
      setToast("这段谈话会改变人物立场，已转为正式行动契约");
      return;
    }
    setChatMessages((current) => [...current, { role: "player", text }]); setChatInput(""); setChatLoading(true);
    try {
      const reply = aiReady ? await callModel({ endpoint, apiKey, model }, `你扮演${member.name}。固定背景：${member.background}。性格核心：${member.core}。说话习惯：${member.voice}。当前人物弧线：${member.arc}。忠诚${member.loyalty}，疲劳${member.fatigue}。只讨论角色已知事实，不泄露隐藏真相，不无条件服从，不替玩家做决定。用100字以内自然中文回答。`, `玩家说：${text}\n可知事实：${JSON.stringify(game.facts.slice(-12))}`) : `“我只能先说我亲眼确认的部分。”${member.name}停顿片刻，随后围绕自己的职责说明了当前担忧；更深的请求需要一次正式谈话。`;
      setChatMessages((current) => [...current, { role: "member", text: reply }]);
    } catch { setChatMessages((current) => [...current, { role: "member", text: "“接口没有回应。”对话没有写入任何新的世界事实，你可以稍后重试。" }]); }
    finally { setChatLoading(false); }
  }

  return <main className="complete-game-shell">
    <a className="complete-skip-link" href="#complete-content">跳到主要内容</a>
    <div className="complete-ambient" aria-hidden="true" />
    <header className="complete-topbar">
      <button className="mobile-menu-button" onClick={() => setShowMobileNav((value) => !value)} aria-label="打开导航"><Menu size={19} /></button>
      <div className="complete-brand"><div><Eye size={19} /></div><span><small>BEYONDER ORGANIZATION SIMULATION</small><strong>灰雾纪事</strong></span></div>
      <div className="complete-date"><small>第 {game.week} 周</small><strong>{game.date}</strong><span>历史偏转 {game.deviation.toFixed(1)}%</span></div>
      <div className="top-resources">
        <span><CircleDollarSign size={14} /><small>资金</small><strong>£{game.money}</strong></span>
        <span><LockKeyhole size={14} /><small>隐秘</small><strong>{game.secrecy}</strong></span>
        <span><Sparkles size={14} /><small>灵性</small><strong>{game.spirituality}/{game.spiritualityMax}</strong></span>
      </div>
      <button className="complete-icon-button" onClick={() => setShowSettings(true)} aria-label="游戏与AI设置"><Settings size={18} /></button>
    </header>

    <nav className={`complete-sidebar ${showMobileNav ? "open" : ""}`} aria-label="游戏主导航">
      {NAV_ITEMS.filter((item) => item.id !== "ending" || game.ending.phase !== "running").map((item) => { const Icon = item.icon; const badge = item.id === "progression" ? game.currentSequence : item.id === "investigation" ? game.opportunities.filter((opportunity) => opportunity.state === "available").length : null; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setShowMobileNav(false); }}><Icon size={18} /><span>{item.label}</span>{badge !== null && <i>{badge}</i>}</button>; })}
      <div className="sidebar-spacer" />
      <button onClick={() => setShowSettings(true)}><Settings size={18} /><span>设置</span></button>
    </nav>

    <section className="complete-content" id="complete-content">
      {!aiReady && <button className="offline-banner" onClick={() => setShowSettings(true)}><ShieldAlert size={15} /><span><strong>离线试玩模式</strong><small>规则、晋升和建设可用；配置模型后开放完整自由解析、动态世界与文学叙事。</small></span><ChevronRight size={15} /></button>}

      {view === "intent" && <div className="intent-layout page-enter">
        <section className="intent-main">
          <header className="page-title"><p>自由行动工作台</p><h1>你想让组织做什么？</h1><span>不必先选择任务。写下目标、方法、能力和底线，系统只负责把它变成可执行契约。</span></header>
          <article className="intent-composer complete-card">
            <textarea value={intentText} onChange={(event) => setIntentText(event.target.value)} placeholder="例如：我想调查西区一家突然停业的诊所，先查老板的公开记录，再让伊妮丝接触附近报童……" maxLength={520} />
            <div className="intent-context-row">
              <label><MapPin size={13} /><select value={selectedDistrictId} onChange={(event) => setSelectedDistrictId(event.target.value)}>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>
              <label><UsersRound size={13} /><select value={selectedLeaderId} onChange={(event) => { setSelectedLeaderId(event.target.value); if (event.target.value !== "player") setSelectedAbilityIds([]); }}><option value="player">你 · 亲自出动</option>{game.members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>
              <span className="intent-count">{intentText.length}/520</span>
            </div>
            {selectedLeaderId === "player" && <div className="ability-picker"><div><Zap size={14} /><span><strong>明确调用非凡能力</strong><small>AI不会替你擅自消耗灵性</small></span></div><div className="ability-pills">{abilities.map((ability) => <button key={ability.id} className={selectedAbilityIds.includes(ability.id) ? "selected" : ""} disabled={ability.passive || ability.cost > game.spirituality} onClick={() => setSelectedAbilityIds((current) => current.includes(ability.id) ? current.filter((id) => id !== ability.id) : [...current, ability.id])}><span>{ability.name}</span><small>{ability.passive ? "被动" : `${ability.cost}灵性`}</small></button>)}</div></div>}
            <footer><span><Command size={13} /> ⌘ Enter</span><button className="complete-primary" onClick={() => void prepareContract()} disabled={!intentText.trim() || contractLoading}>{contractLoading ? <><Sparkles size={16} />正在理解意图</> : <><span>生成行动契约</span><ArrowRight size={17} /></>}</button></footer>
          </article>

          {activeMission && <article className="pressure-card complete-card">
            <header><span><ShieldAlert size={15} /> 当前主要压力</span><b>{activeMission.deadline}周后越过临界点</b></header>
            <h2>{activeMission.title}</h2><p>{activeMission.premise}</p>
            <div className="pressure-progress"><span><i style={{ width: `${activeMission.progress}%` }} /></span><strong>{activeMission.progress}%</strong></div>
            <div className="pressure-consequence"><small>放任后果</small><p>{activeMission.consequence}</p></div>
            <div className="hint-row">{activeMission.hints.slice(0, 4).map((hint) => <button key={hint} onClick={() => applySuggestion(hint)}>{hint}<Plus size={12} /></button>)}</div>
          </article>}

          <article className="weekly-schedule complete-card">
            <header className="section-heading"><span><CalendarDays size={15} /><strong>本周日程</strong></span><small>人员和设施可以并行，但同一资源不能重叠占用</small></header>
            <div className="calendar-strip">{DAY_NAMES.map((day, index) => <div key={day}><span>{day}</span>{game.schedule.filter((action) => index + 1 >= action.startDay && index + 1 < action.startDay + action.days).map((action) => <i key={action.id} className={riskClass(action.risk)} title={action.title} />)}</div>)}</div>
            <div className="schedule-list">{game.schedule.length ? game.schedule.map((action) => <article key={action.id}><span className={`schedule-risk ${riskClass(action.risk)}`}>{action.risk}</span><div><strong>{action.title}{action.focus && <em>重点叙事</em>}</strong><p>{memberName(game, action.leaderId)} · {DAY_NAMES[action.startDay - 1]}起 · {action.days}天 · £{action.budget}</p></div><button onClick={() => removeAction(action.id)} aria-label="移除计划"><X size={15} /></button></article>) : <div className="empty-state"><CalendarDays size={22} /><p>本周还没有正式行动。你可以自由安排，也可以让组织保持低调。</p></div>}</div>
            <footer><span>生命 {game.playerCondition.health} · 污染 {game.playerCondition.pollution} · 预计周末维护费 £16</span><button className="complete-primary compact" onClick={() => void endWeek()} disabled={Boolean(generationStage) || Boolean(game.fatalSituation) || game.ending.phase === "finale" || game.ending.phase === "ended"}><span>{generationStage || (game.fatalSituation ? "先处理致命处境" : game.ending.phase === "finale" ? "进入终局决断" : game.ending.phase === "sandbox" ? "推进沙盒世界一周" : "结束本周并结算")}</span><ArrowRight size={16} /></button></footer>
          </article>
        </section>

        <aside className="intent-rail">
          <article className="leader-card complete-card"><p>组织负责人</p><div className="leader-sequence"><span>{game.currentSequence}</span><div><small>{pathway.name}途径</small><strong>{currentSequence.name}</strong></div></div><div className="digestion-mini"><span><i style={{ width: `${game.digestion}%` }} /></span><strong>{game.digestion}%</strong></div><p>{currentSequence.acting}</p><button onClick={() => setView("progression")}>查看能力与晋升 <ChevronRight size={14} /></button></article>
          {latestChapter && <article className="latest-chronicle complete-card"><header><BookOpen size={15} /><span><small>上一周小说总结</small><strong>{latestChapter.title}</strong></span></header><p>{latestChapter.summary}</p><button onClick={() => setSelectedChapter(latestChapter)}><BookOpen size={14} />重新阅读完整章节</button><button className="all-chronicles" onClick={() => setView("archive")}>查看全部周目纪事 <ChevronRight size={13} /></button></article>}
          <article className="intent-ledger complete-card"><header><span><Target size={14} /> 我的意图</span><small>由你定义重要性</small></header>{game.playerIntents.map((intent) => <div key={intent.id}><button className={intent.pinned ? "pinned" : ""} onClick={() => setGame((current) => ({ ...current, playerIntents: current.playerIntents.map((item) => item.id === intent.id ? { ...item, pinned: !item.pinned } : item) }))}><Target size={12} /></button><span>{intent.text}</span><button onClick={() => applySuggestion(intent.text)}><ArrowRight size={13} /></button></div>)}<label><input value={intentDraft} onChange={(event) => setIntentDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPlayerIntent(); }} placeholder="写下一个长期意图" /><button onClick={addPlayerIntent}><Plus size={14} /></button></label></article>
          <article className="organization-glance complete-card"><header><Building2 size={14} /><span>{game.organizationName}</span></header><dl><div><dt>成员</dt><dd>{game.members.length + 1}</dd></div><div><dt>设施</dt><dd>{game.facilities.filter((facility) => facility.status === "运转中").length}</dd></div><div><dt>影响</dt><dd>{game.influence}</dd></div><div><dt>稳定</dt><dd>{game.stability}</dd></div></dl><button onClick={() => setView("organization")}>进入组织管理 <ChevronRight size={14} /></button></article>
        </aside>
      </div>}

      {view === "investigation" && <InvestigationBoard game={game} onConnectEvidence={(from, to, label) => setGame((current) => connectEvidence(current, from, to, label))} onUseOpportunity={(opportunity) => { setIntentText(opportunity.suggestedIntent); setSelectedDistrictId(opportunity.districtId); setView("intent"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}

      {view === "city" && <div className="city-page page-enter">
        <header className="page-title row"><div><p>贝克兰德 · 城市情报图</p><h1>地图提供线索，但不替你决定道路</h1><span>点击任何区域查看背景。你也可以忽略所有提示，直接回到意图工作台调查其他目标。</span></div><button className="complete-secondary" onClick={() => setView("intent")}><Command size={15} />自由输入意图</button></header>
        <section className="complete-city-map complete-card"><div className="map-veil" /><div className="map-river" />{DISTRICTS.map((district) => <button key={district.id} className={`complete-district ${district.size} ${district.danger >= 65 ? "danger" : ""} ${game.discoveredDistrictIds.includes(district.id) ? "known" : "unknown"}`} style={{ left: `${district.x}%`, top: `${district.y}%` }} onClick={() => setSelectedDistrictDetail(district.id)}><span>{district.name}</span><small>{district.subtitle}</small><i>{district.danger}</i></button>)}</section>
        <div className="city-legend"><span><i className="safe" />相对稳定</span><span><i className="watch" />多方关注</span><span><i className="danger" />高风险</span><small>风险是已知威胁估计，不代表区域中没有未知危险。</small></div>
      </div>}

      {view === "organization" && <div className="organization-page page-enter">
        <header className="page-title row"><div><p>地点 · 人员 · 制度</p><h1>{game.organizationName}</h1><span>{game.coverIdentity}</span></div><button className="complete-primary compact" onClick={() => applySuggestion("把空置后室改造成一间隐蔽的炼金实验室，优先隔绝气味与灵性波动。", "cherwood")}><Hammer size={15} />提出建设方案</button></header>
        <OrganizationOperations game={game} onTransform={applyOrganizationChange} onMemberEvent={(memberId) => { const member = game.members.find((item) => item.id === memberId); if (member) applySuggestion(`与${member.name}处理其个人事件：${member.personalEvent}。先听取诉求，再决定组织承担多少风险。`, "cherwood"); }} />
        <div className="organization-grid">
          <section className="hq-card complete-card"><header className="section-heading"><span><Building2 size={15} /><strong>乔伍德主据点</strong></span><small>临街三层事务所 · 地下一层</small></header><div className="floor-plan">{game.facilities.map((facility) => <button key={facility.id} className={`room room-${facility.id} ${facility.status === "闲置" ? "idle" : ""}`} onClick={() => setSelectedFacility(facility)}><span>{facility.name}</span><small>{facility.type} · Lv.{facility.level}</small>{facility.assignedMemberId && <i>{game.members.find((member) => member.id === facility.assignedMemberId)?.name.slice(0, 1)}</i>}</button>)}</div><footer><span><ShieldAlert size={13} />据点风险</span><p>固定出入规律与连续仪式正在积累可观察痕迹。扩张前应建设外围安全屋。</p></footer></section>
          <aside className="organization-side">
            <article className="charter-card complete-card"><header><FileKey size={14} /><strong>组织章程</strong></header><textarea value={game.charter} onChange={(event) => setGame((current) => ({ ...current, charter: event.target.value }))} /><small>成员会依据章程判断服从、冲突与去留。修改长期原则会影响忠诚。</small></article>
            <article className="asset-summary complete-card"><header><Boxes size={14} /><strong>非凡资产</strong><button onClick={() => setView("archive")}>全部</button></header>{game.inventory.slice(0, 5).map((item) => <div key={item.id}><span><PackageSearch size={13} /></span><p><strong>{item.name}</strong><small>{item.category} · {item.location}</small></p><b>×{item.quantity}</b></div>)}</article>
          </aside>
        </div>
        <section className="departments complete-card"><header className="section-heading"><span><UsersRound size={15} /><strong>部门授权</strong></span><small>扩大自主权提高效率，也会增加隐瞒与派系风险</small></header><div>{game.departments.map((department) => <article key={department.id}><header><span>{department.name}</span><b>{department.status}</b></header><p>{department.mandate}</p><label><span>自主权 {department.autonomy}%</span><input type="range" min="0" max="100" value={department.autonomy} onChange={(event) => setGame((current) => ({ ...current, departments: current.departments.map((item) => item.id === department.id ? { ...item, autonomy: Number(event.target.value) } : item) }))} /></label><footer><span>负责人：{game.members.find((member) => member.id === department.leadMemberId)?.name}</span><span>预算 £{department.budget}/周</span></footer></article>)}</div></section>
        <section className="roster complete-card"><header className="section-heading"><span><UsersRound size={15} /><strong>核心成员</strong></span><small>成员有自己的晋升意志、疲劳与忠诚</small></header><div>{game.members.map((member) => <article key={member.id}><div className="member-monogram">{member.name.slice(0, 1)}</div><h3>{member.name}</h3><p>{member.role}{member.pathway ? ` · 序列${member.sequence} ${member.pathway}` : " · 普通人"}</p><dl><div><dt>专长</dt><dd>{member.specialty}</dd></div><div><dt>忠诚</dt><dd>{member.loyalty}</dd></div><div><dt>疲劳</dt><dd>{member.fatigue}</dd></div></dl><button onClick={() => openMemberChat(member.id)}>档案与自由对话 <ChevronRight size={13} /></button></article>)}</div></section>
        <section className="recruit-pool complete-card"><header className="section-heading"><span><UsersRound size={15} /><strong>固定人物池与关系阶梯</strong></span><small>接触 → 临时合作 → 长期盟友或线人 → 正式成员</small></header><div>{game.recruitPool.map((member) => <article key={member.id}><header><div className="member-monogram">{member.name.slice(0, 1)}</div><span><strong>{member.name}</strong><small>{member.role}</small></span><b>{member.relationshipStage}</b></header><p>{member.background}</p><footer><span>{member.specialty}</span><button onClick={() => applySuggestion(`与${member.name}推进关系。先回应其当前关切并提供可验证的合作条件，不强迫其加入组织。`, member.id === "sylvie" ? "empress" : member.id === "ollie" ? "dock" : member.id === "elsa" ? "north" : member.id === "nora" ? "south" : "bridge")}>安排接触 <ArrowRight size={13} /></button></footer></article>)}</div></section>
      </div>}

      {view === "progression" && <div className="progression-page page-enter">
        <header className="page-title row"><div><p>非凡途径 · 完整序列阶梯</p><h1>{pathway.name}途径</h1><span>序列提升会扩大你能够干预的世界尺度，而不是只增加成功率。</span></div><div className="current-rank-seal"><small>当前</small><strong>{game.currentSequence}</strong><span>{currentSequence.name}</span></div></header>
        <div className="progression-grid">
          <aside className="sequence-ladder complete-card">{pathway.sequences.map((sequence) => <button key={sequence.rank} className={`${sequence.rank === game.currentSequence ? "current" : ""} ${sequence.rank === selectedRank ? "selected" : ""} ${sequence.rank < game.currentSequence ? "future" : ""}`} onClick={() => setSelectedRank(sequence.rank)}><span>{sequence.rank}</span><div><strong>{sequence.name}</strong><small>{sequence.rank === game.currentSequence ? "当前序列" : sequence.rank < game.currentSequence ? "尚未晋升" : "已经历"}</small></div><i /></button>)}</aside>
          <section className="sequence-detail">
            {(() => { const sequence = pathway.sequences.find((item) => item.rank === selectedRank)!; return <>
              <article className="sequence-hero complete-card"><p>序列 {sequence.rank}</p><h2>{sequence.name}</h2><span>{sequence.acting}</span><div>{sequence.capabilities.map((capability) => <p key={capability}><Zap size={14} />{capability}</p>)}</div></article>
              {selectedRank === game.currentSequence && <article className="ability-manual complete-card"><header className="section-heading"><span><BookOpen size={15} /><strong>当前能力手册</strong></span><small>能力是自由指令中的具体动词</small></header><div>{abilities.map((ability) => <article key={ability.id}><header><span>{ability.name}</span><b>{ability.passive ? "被动" : `${ability.cost} 灵性`}</b></header><strong>{ability.verb}</strong><p>{ability.description}</p><footer><ShieldAlert size={12} />{ability.risk}</footer></article>)}</div></article>}
            </>; })()}
          </section>
          <aside className="advancement-panel complete-card">
            <header><FlaskConical size={16} /><span><small>下一序列</small><strong>{nextSequence ? `序列${nextSequence.rank} · ${nextSequence.name}` : "序列顶点"}</strong></span></header>
            {nextSequence ? <>
              <div className="advancement-meter"><div><span>魔药消化</span><strong>{game.digestion}%</strong></div><span><i style={{ width: `${game.digestion}%` }} /></span><p>{currentSequence.acting}</p></div>
              <div className="advancement-meter"><div><span>配方知识</span><strong>{game.formulaKnowledge}%</strong></div><span><i style={{ width: `${game.formulaKnowledge}%` }} /></span><p>{game.formulaKnowledge >= 100 ? "完整配方已核验，材料清单可以用于行动契约。" : "需要研究、交易或从其他势力获取更多配方知识。"}</p></div>
              <div className="advancement-meter"><div><span>仪式准备</span><strong>{game.ritualReadiness}%</strong></div><span><i style={{ width: `${game.ritualReadiness}%` }} /></span><p>{ADVANCEMENT_RITUALS[game.pathwayId][nextSequence.rank]}</p><button className="ritual-plan" onClick={() => applySuggestion(`为晋升序列${nextSequence.rank}·${nextSequence.name}准备并执行仪式：${ADVANCEMENT_RITUALS[game.pathwayId][nextSequence.rank]}。先拆分条件、验证安全措施，不在条件不足时服食魔药。`, "cherwood")}>把仪式写入自由行动</button></div>
              <div className={`instability-strip ${game.instability >= 55 ? "danger" : ""}`}><span>失控风险</span><strong>{game.instability}/100</strong><small>{game.instability >= 70 ? "当前禁止晋升：先处理污染、锚点或精神状态。" : "晋升和高位能力会提高风险，休整与成员关系可提供锚点。"}</small></div>
              <div className="material-list"><header><span>晋升材料</span><small>{game.materials.filter((item) => item.obtained).length}/{game.materials.length}</small></header>{game.materials.map((material) => <button key={material.id} onClick={() => !material.obtained && applySuggestion(`寻找并取得${material.known ? material.name : `序列${nextSequence.rank}配方中缺失的${material.kind}`}。先验证真伪，不接受来源不明的替代品。`, material.source.includes("码头") ? "dock" : material.source.includes("北区") || material.source.includes("大学") ? "north" : "bridge")} disabled={material.obtained}><span className={material.obtained ? "done" : material.known ? "known" : "unknown"}>{material.obtained ? <Check size={13} /> : material.known ? <Search size={13} /> : <LockKeyhole size={13} />}</span><div><strong>{material.known ? material.name : "尚未确认的材料"}</strong><small>{material.kind} · {material.obtained ? "已入库" : material.source}</small></div><ChevronRight size={13} /></button>)}</div>
              <button className="complete-primary advance-button" onClick={attemptAdvance} disabled={!canAdvance(game)}>{canAdvance(game) ? <><Sparkles size={16} />举行晋升</> : "尚未满足晋升条件"}</button>
            </> : <p className="sequence-apex">你已经抵达这条途径的序列顶点。此后的问题不再是材料，而是锚点、权柄与世界的回应。</p>}
          </aside>
        </div>
      </div>}

      {view === "ending" && <div className="ending-page page-enter">
        <header className="ending-hero"><CloudFog size={28} /><p>本局结算</p><h1>{game.ending.title ?? "终局尚未完成"}</h1><span>{game.ending.route ? `你的选择：${game.ending.route}` : "负责人的故事在这里停止。"}</span></header>
        {game.ending.epilogue && <article className="ending-prose complete-card">{game.ending.epilogue.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</article>}
        {game.ending.grades && <section className="ending-grades">{Object.entries({ organization: "组织存续", members: "成员命运", advancement: "非凡晋升", relations: "势力关系", history: "历史偏转" }).map(([key, label]) => <article className="complete-card" key={key}><small>{label}</small><strong>{game.ending.grades![key as keyof typeof game.ending.grades]}</strong></article>)}</section>}
        <div className="ending-actions"><button onClick={() => setView("archive")}><BookOpen size={15} />重读整局纪事</button>{game.ending.sandboxUnlocked && game.ending.phase !== "sandbox" && <button className="complete-primary" onClick={() => { setGame((current) => enterSandbox(current)); setView("intent"); }}><GitBranch size={15} />进入无限沙盒</button>}{game.ending.phase === "sandbox" && <button className="complete-primary" onClick={() => setView("intent")}><Command size={15} />继续书写偏转世界</button>}</div>
      </div>}

      {view === "archive" && <div className="archive-page page-enter">
        <header className="page-title"><p>权威世界账本</p><h1>事实、资产与正式纪事</h1><span>每周小说总结都会永久保存在这里。点击任意章节即可反复阅读；小说不能反向覆盖已经结算的事实。</span></header>
        <div className="archive-grid"><section className="chronicle-index complete-card"><header className="section-heading"><span><BookOpen size={15} /><strong>每周小说纪事</strong></span><small>{game.chronicle.length}章 · 可反复阅读</small></header>{game.chronicle.length ? game.chronicle.map((chapter, index) => <button key={chapter.id} className={index === 0 ? "latest" : ""} onClick={() => setSelectedChapter(chapter)} aria-label={`重读第${chapter.week}周：${chapter.title}`}><span>W{String(chapter.week).padStart(2, "0")}</span><div><strong>{chapter.title}</strong><small>{chapter.date} · {chapter.source === "ai" ? "文学模式" : "本地事实版"}</small></div><b>{index === 0 ? "最新" : "重读"}</b><ChevronRight size={14} /></button>) : <div className="empty-state"><BookOpen size={24} /><p>结束第一周后，每周小说总结都会永久保存到这里。</p></div>}</section><section className="fact-ledger complete-card"><header className="section-heading"><span><FileKey size={15} /><strong>世界事实</strong></span><small>{game.facts.length}条</small></header>{game.facts.slice().reverse().map((fact) => <article key={fact.id}><b className={fact.certainty}>{fact.certainty}</b><div><strong>{fact.subject}</strong><p>{fact.statement}</p><small>{fact.source} · 第{fact.week}周</small></div></article>)}</section></div>
      </div>}
    </section>

    {game.ending.phase === "finale" && <div className="complete-sheet-backdrop finale-backdrop"><section className="finale-sheet" role="dialog" aria-modal="true" aria-labelledby="finale-title"><header><small>第24周 · 原著级终局</small><h2 id="finale-title">贝克兰德大雾霾</h2><p>规则已经根据证据、盟友、组织状态与历史偏转锁定当前世界。请选择组织在这场事件中的立场；AI不能替你决定。</p></header><div className="finale-intel"><span>有效证据 <strong>{game.evidenceNodes.filter((item) => item.discovered && !item.compromised).length}</strong></span><span>历史偏转 <strong>{game.deviation.toFixed(1)}%</strong></span><span>盟友 <strong>{game.factions.filter((item) => item.trust >= 35).length}</strong></span><span>生命/污染 <strong>{game.playerCondition.health}/{game.playerCondition.pollution}</strong></span></div><div className="finale-routes">{([[
      "阻止", "把证据与盟友集中到核心仪式，正面打断灾难。"], ["改变", "改变人口、煤气或材料的汇合，让灾难偏离原定形态。"], ["利用", "从崩解仪式中夺取资源与晋升机会，承担最高污染。"], ["逃离", "保存组织、证据与尽可能多的受害者名单，离开首都。"]] as const).map(([route, description]) => <button key={route} onClick={() => chooseFinale(route)}><strong>{route}</strong><p>{description}</p><ArrowRight size={15} /></button>)}</div></section></div>}

    {game.fatalSituation && <div className="complete-sheet-backdrop fatal-backdrop"><section className="fatal-sheet" role="alertdialog" aria-modal="true" aria-labelledby="fatal-title"><header><ShieldAlert size={24} /><small>明确的高危局面</small><h2 id="fatal-title">{game.fatalSituation.title}</h2><p>{game.fatalSituation.threat}</p></header><div className="known-threats"><strong>目前已知</strong>{game.fatalSituation.knownThreats.map((threat) => <p key={threat}>{threat}</p>)}</div><div className="fatal-choices"><button onClick={() => chooseFatal("retreat")}><strong>立即撤退</strong><span>安全阈值 {game.fatalSituation.odds.retreat}%</span><small>放弃现场成果，优先保命。</small></button><button onClick={() => chooseFatal("help")}><strong>请求支援</strong><span>安全阈值 {game.fatalSituation.odds.help}%</span><small>消耗关系并暴露部分情报。</small></button><button className="continue" onClick={() => chooseFatal("continue")}><strong>继续深入</strong><span>安全阈值 {game.fatalSituation.odds.continue}%</span><small>可能获得更多成果；失败可导致死亡并结束本局。</small></button></div><footer>死亡只会在你选择后由最终检定产生；叙事模型无权越过这一步。</footer></section></div>}

    {contract && <div className="complete-sheet-backdrop" onMouseDown={() => setContract(null)}><section className="complete-sheet contract-sheet" role="dialog" aria-modal="true" aria-labelledby="contract-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>组织对命令的理解</p><h2 id="contract-title">{contract.title}</h2></div><button onClick={() => setContract(null)} aria-label="关闭"><X size={17} /></button></header>{generationError && <div className="inline-warning"><ShieldAlert size={14} />{generationError}</div>}<div className="contract-summary"><span className={`risk-chip ${riskClass(contract.risk)}`}>{contract.risk}风险</span><span><Clock3 size={12} />{contract.days}天</span><span><CircleDollarSign size={12} />£{contract.budget}</span><span><MapPin size={12} />{DISTRICTS.find((district) => district.id === contract.districtId)?.name}</span></div><div className="contract-fields">{editableContractField(contract, setContract, "desiredOutcome", "核心目标", true)}{editableContractField(contract, setContract, "approach", "执行方法", true)}{editableContractField(contract, setContract, "knownFacts", "角色已知事实")}{editableContractField(contract, setContract, "hypothesis", "玩家提出的假设")}{editableContractField(contract, setContract, "unknowns", "仍未知")}{editableContractField(contract, setContract, "redLines", "禁止事项")}{editableContractField(contract, setContract, "retreat", "撤退条件", true)}</div><label className="focus-toggle"><button className={contract.focus ? "on" : ""} onClick={() => setContract({ ...contract, focus: !contract.focus })}><i /></button><span><strong>本回合重点叙事</strong><small>{contract.focus ? "本周小说章节将以此为重点场景" : "这项行动将在次要报告中呈现"}</small></span></label><footer><button className="complete-secondary" onClick={() => setContract(null)}><ArrowLeft size={14} />返回修改意图</button><button className="complete-primary" onClick={confirmContract}><span>确认并排入日程</span><CalendarDays size={16} /></button></footer></section></div>}

    {selectedDistrictDetail && (() => { const district = DISTRICTS.find((item) => item.id === selectedDistrictDetail)!; return <div className="complete-sheet-backdrop drawer-backdrop" onMouseDown={() => setSelectedDistrictDetail(null)}><aside className="complete-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedDistrictDetail(null)}><X size={17} /></button><header><p>区域档案</p><h2>{district.name}</h2><span>{district.subtitle}</span></header><div className="district-risk-row"><span>已知风险 <strong>{district.danger}</strong></span><span>情报基础 <strong>{district.intel}</strong></span></div><section><h3><Landmark size={14} />背景</h3><p>{district.background}</p></section><section><h3><MapPin size={14} />重要地点</h3><div className="landmark-chips">{district.landmarks.map((landmark) => <span key={landmark}>{landmark}</span>)}</div></section><section className="opportunity-block"><div><strong>可利用条件</strong><p>{district.opportunity}</p></div><div><strong>已知警告</strong><p>{district.warning}</p></div></section><section><h3><Lightbulb size={14} />只是提示，不是任务</h3><div className="district-actions"><button onClick={() => { setSelectedDistrictDetail(null); applySuggestion(`先熟悉${district.name}的关键人物、公开机构与安全撤离路线，建立基础情报地图。`, district.id); }}>建立区域情报</button><button onClick={() => { setSelectedDistrictDetail(null); setSelectedDistrictId(district.id); setIntentText(""); setView("intent"); }}>在这里自由行动</button></div></section></aside></div>; })()}

    {selectedFacility && <div className="complete-sheet-backdrop drawer-backdrop" onMouseDown={() => setSelectedFacility(null)}><aside className="complete-drawer facility-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedFacility(null)}><X size={17} /></button><header><p>{selectedFacility.type}设施 · Lv.{selectedFacility.level}</p><h2>{selectedFacility.name}</h2><span>{selectedFacility.status}</span></header><section><p>{selectedFacility.description}</p></section><section><h3><TrendingUp size={14} />当前功能</h3>{selectedFacility.benefits.map((benefit) => <p className="facility-benefit" key={benefit}><CheckCircle2 size={13} />{benefit}</p>)}</section><section><h3><ShieldAlert size={14} />运行风险</h3><p>{selectedFacility.risk}</p></section><label className="facility-assignment"><span>负责成员</span><select value={selectedFacility.assignedMemberId ?? ""} onChange={(event) => updateFacilityAssignment(event.target.value)}><option value="">暂不指派</option>{game.members.map((member) => <option key={member.id} value={member.id}>{member.name} · 疲劳{member.fatigue}</option>)}</select></label><button className="complete-primary" onClick={() => { const target = selectedFacility.name; setSelectedFacility(null); applySuggestion(`升级${target}，优先提高隐蔽性与事故隔离能力，同时控制维护费用。`, "cherwood"); }}><Hammer size={15} />提出升级方案</button></aside></div>}

    {(turnChapter || selectedChapter) && <div className="complete-reader-backdrop" onMouseDown={() => { if (!generationStage) { setTurnChapter(null); setSelectedChapter(null); } }}><section className="complete-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title" onMouseDown={(event) => event.stopPropagation()}><header className="reader-commandbar"><div><small>第 {(turnChapter ?? selectedChapter)!.week} 周 · {(turnChapter ?? selectedChapter)!.date}</small><span>{(turnChapter ?? selectedChapter)!.source === "ai" ? "文学模式" : "本地事实版"}</span></div><div><button onClick={() => setReaderScale((value) => Math.max(.9, value - .1))}>A−</button><button onClick={() => setReaderScale(1)}>A</button><button onClick={() => setReaderScale((value) => Math.min(1.25, value + .1))}>A＋</button><button onClick={() => { if (!generationStage) { setTurnChapter(null); setSelectedChapter(null); } }}><X size={16} /></button></div></header>{generationStage && <div className="reader-generation"><Sparkles size={15} /><span><strong>规则事实已经锁定</strong><small>{generationStage}；完成后章节会自动更新。</small></span><i /><i /><i /></div>}{generationError && <div className="inline-warning reader-warning"><ShieldAlert size={14} />{generationError}</div>}<article className="reader-page" style={{ "--reader-scale": readerScale } as React.CSSProperties}><div className="folio"><span>灰雾纪事</span><i /><span>W{String((turnChapter ?? selectedChapter)!.week).padStart(2, "0")}</span></div><h1 id="reader-title">{(turnChapter ?? selectedChapter)!.title}</h1>{(turnChapter ?? selectedChapter)!.sections.map((section, index) => <section key={`${section.heading}-${index}`}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>)}</section>)}<div className="reader-end"><CloudFog size={18} /><span>本章完</span></div></article>{(turnChapter ?? selectedChapter)!.results.length > 0 && <details className="reader-appendix"><summary><span><ListTodo size={15} />行动、证据与规则附录</span><small>{(turnChapter ?? selectedChapter)!.summary}</small></summary><div>{(turnChapter ?? selectedChapter)!.results.map((result) => <article key={result.id}><header><strong>{result.title}</strong><b className={result.outcome}>{result.outcome}</b></header><p>{result.contract.rawIntent}</p><ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul><footer><span>消化 +{result.digestionGain}</span><span>任务推进 +{result.missionProgress}%</span><span>资金 {result.resourceChanges.money}</span></footer></article>)}</div></details>}<footer className="reader-actions"><button onClick={() => { setTurnChapter(null); setSelectedChapter(null); setView("archive"); }}><Archive size={14} />进入纪事档案</button><button className="complete-primary compact" onClick={() => { setTurnChapter(null); setSelectedChapter(null); }} disabled={Boolean(generationStage)}>继续第 {game.week} 周 <ArrowRight size={15} /></button></footer></section></div>}

    {showSettings && <div className="complete-sheet-backdrop" onMouseDown={() => setShowSettings(false)}><section className="complete-sheet settings-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>本机配置</p><h2>AI推演与新游戏</h2></div><button onClick={() => setShowSettings(false)}><X size={17} /></button></header><div className={`ai-mode-card ${aiReady ? "ready" : "offline"}`}><Sparkles size={18} /><span><strong>{aiReady ? "完整AI推演已配置" : "当前为离线试玩"}</strong><small>{aiReady ? `${model} · 自由契约与三阶段文学模式` : "配置后开放动态世界、自由对话与小说生成"}</small></span></div><label><span>OpenAI兼容端点</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1" /></label><label><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model-name" /></label><label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在本浏览器" /></label><small className="settings-note">规则、世界事实和存档留在本地；密钥由浏览器直接发送到你的模型端点。接口需允许浏览器跨域请求。</small><button className="complete-primary" onClick={saveSettings}><Check size={15} />保存接口设置</button><div className="settings-divider"><span>建立新历史分支</span></div><div className="pathway-choice">{Object.values(PATHWAYS).map((item) => <button key={item.id} className={draftPathway === item.id ? "selected" : ""} onClick={() => setDraftPathway(item.id)}><span>{item.name}</span><small>序列9 · {item.sequences[0].name}</small></button>)}</div><button className="danger-reset" onClick={startNewGame}><RotateCcw size={14} />以所选途径开始新游戏</button></section></div>}

    {chatMemberId && (() => {
      const member = game.members.find((item) => item.id === chatMemberId)!;
      return <div className="complete-sheet-backdrop" onMouseDown={() => setChatMemberId(null)}><section className="complete-sheet character-sheet" role="dialog" aria-modal="true" aria-labelledby="character-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>{member.role} · 忠诚 {member.loyalty} · 疲劳 {member.fatigue}</p><h2 id="character-title">与{member.name}交谈</h2></div><button onClick={() => setChatMemberId(null)} aria-label="关闭对话"><X size={17} /></button></header><div className="character-core"><div><small>固定背景</small><p>{member.background}</p></div><div><small>性格核心</small><p>{member.core}</p></div><div><small>个人成长</small><p>{member.arc}</p></div></div><div className="character-dialogue" aria-live="polite">{chatMessages.map((message, index) => <p key={`${message.role}-${index}`} className={message.role}><strong>{message.role === "player" ? "你" : member.name}</strong><span>{message.text}</span></p>)}{chatLoading && <p className="member pending"><strong>{member.name}</strong><span>她在斟酌怎样回答……</span></p>}</div><label className="chat-input"><span>普通交谈不消耗行动；涉及承诺、命令、招募或秘密时会转为正式行动契约。</span><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder={`询问${member.name}的看法，或谈谈你正在担忧的事……`} maxLength={500} /><button className="complete-primary" onClick={() => void sendChat()} disabled={!chatInput.trim() || chatLoading}><Send size={15} />发送</button></label></section></div>;
    })()}

    {toast && <div className="complete-toast"><CheckCircle2 size={15} />{toast}</div>}
  </main>;
}
