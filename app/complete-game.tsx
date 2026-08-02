"use client";

import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, BookOpen, Boxes, Building2, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock3, CloudFog, Command, Eye, FileKey, FlaskConical,
  Gavel, GitBranch, Hammer, Landmark, Lightbulb, ListTodo, LockKeyhole, MapPin, Menu, MessageSquareText, PackageSearch,
  Search, Send, Settings, ShieldAlert, Sparkles, TrendingUp,
  UsersRound, WandSparkles, X, Zap,
} from "lucide-react";
import {
  ActionContract, ADVANCEMENT_RITUALS, ChronicleChapter, createInitialGame, DISTRICTS, Facility, GameState, PATHWAYS,
  AbilityContext, AbilityUseRecord, PathwayId, RiskLevel, ViewId,
} from "./game-model";
import {
  advanceSequence, availableAbilities, canAdvance, generateAiWorldDelta, generateLiteraryChapter, generateNpcDialogue,
  connectEvidence, enterSandbox, interpretIntentWithAi, localContract, resolveFatalSituation,
  resolveWeek, scheduleContract, transformOrganization,
} from "./game-engine";
import { assignFinaleResource, autoDeployFinale, chooseFinaleDoctrine, resolveFinalePhase } from "./finale-system";
import InvestigationBoard from "./investigation-board";
import OrganizationOperations from "./organization-operations";
import GreatSmogFinale from "./great-smog-finale";
import AiSettings from "./ai-settings";
import { AiConfig, DEEPSEEK_FLASH_PRESET, testModelConnection } from "./ai-client";
import WeeklyCouncil from "./weekly-council";
import OpeningPrologue from "./opening-prologue";
import AbilityConsole from "./ability-console";
import { continueAbilityScene, generateAbilityDraft, generateSceneResponse, resolveImmediateAbility } from "./ability-system";

const SAVE_KEY = "mist-chronicle-complete-v11";
const LEGACY_SAVE_KEYS = ["mist-chronicle-complete-v10", "mist-chronicle-complete-v9", "mist-chronicle-complete-v8", "mist-chronicle-complete-v7", "mist-chronicle-complete-v6", "mist-chronicle-complete-v5"];
const AI_KEY = "mist-chronicle-save-v3-ai";
const AI_SESSION_KEY = "mist-chronicle-session-ai-key";
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const NAV_ITEMS: { id: ViewId; label: string; icon: typeof Command }[] = [
  { id: "intent", label: "集会", icon: Command },
  { id: "organization", label: "组织", icon: Building2 },
  { id: "progression", label: "自身", icon: WandSparkles },
];

function riskClass(risk: RiskLevel) { return risk === "致命" ? "fatal" : risk === "高" ? "high" : risk === "中" ? "medium" : "low"; }

function editableContractField(contract: ActionContract, setContract: (value: ActionContract) => void, key: keyof ActionContract, label: string, wide = false) {
  const value = contract[key];
  if (typeof value !== "string") return null;
  return <label className={wide ? "contract-field wide" : "contract-field"}><span>{label}</span><textarea value={value} onChange={(event) => setContract({ ...contract, [key]: event.target.value })} /></label>;
}

export default function CompleteGame() {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewId>("intent");
  const [intentText, setIntentText] = useState("");
  const [selectedDistrictId, setSelectedDistrictId] = useState("cherwood");
  const [abilityPanelOpen, setAbilityPanelOpen] = useState(false);
  const [abilityContext, setAbilityContext] = useState<AbilityContext>({ kind: "council", label: "每周密议室" });
  const [abilitySelectedId, setAbilitySelectedId] = useState("");
  const [abilityAssistId, setAbilityAssistId] = useState("");
  const [abilityIntent, setAbilityIntent] = useState("");
  const [abilityLoading, setAbilityLoading] = useState(false);
  const [abilityResult, setAbilityResult] = useState<AbilityUseRecord | null>(null);
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
  const [aiConfig, setAiConfig] = useState<AiConfig>({ ...DEEPSEEK_FLASH_PRESET });
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [connectionState, setConnectionState] = useState<{ status: "idle" | "testing" | "success" | "error"; message: string }>({ status: "idle", message: "" });
  const [draftPathway, setDraftPathway] = useState<PathwayId>("seer");
  const [toast, setToast] = useState("");
  const [councilDecisionSignal, setCouncilDecisionSignal] = useState(0);
  const [chatMemberId, setChatMemberId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dialogueDecisionLoading, setDialogueDecisionLoading] = useState(false);
  const [chatContext, setChatContext] = useState<"council" | "private">("council");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(SAVE_KEY);
      const legacySaved = LEGACY_SAVE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      const savedAi = window.localStorage.getItem(AI_KEY);
      if (saved) {
        try { const value = JSON.parse(saved) as GameState; if (value.version === 11) setGame(value); }
        catch { window.localStorage.removeItem(SAVE_KEY); }
      } else if (legacySaved) {
        try {
          const legacy = JSON.parse(legacySaved) as Partial<GameState>;
          const abilityFields = { version: 11, spirituality: Math.max(12, legacy.spirituality ?? 12), spiritualityMax: 18, mentalLoad: 0, lastMeditationWeek: 0, abilityJournal: [], hiddenWorldFacts: createInitialGame(legacy.pathwayId ?? "seer").hiddenWorldFacts, activeAbilityScene: null };
          if (legacy.version === 10) setGame({ ...(legacy as GameState), ...abilityFields });
          else if (legacy.version === 9) setGame({ ...(legacy as GameState), ...abilityFields, prologueComplete: true, playerName: "无名负责人", playerAddress: "会长阁下", nameExposure: 4, knownAliases: [] });
          else if (legacy.version === 8) setGame({ ...(legacy as GameState), ...abilityFields, prologueComplete: true, playerName: "无名负责人", playerAddress: "会长阁下", nameExposure: 4, knownAliases: [], dialogueThreads: [], councilRecords: [{ week: legacy.week ?? 1, status: "convened", decisions: [] }] });
          else if ([5, 6, 7].includes(legacy.version ?? 0) && Array.isArray(legacy.chronicle)) setGame((current) => ({ ...current, chronicle: legacy.chronicle!.map((chapter) => ({ ...chapter, id: `legacy-${chapter.id}`, title: `旧历史分支 · ${chapter.title}` })) }));
        } catch { /* 旧存档只用于读取纪事，损坏时不影响新游戏。 */ }
      }
      if (savedAi) {
        try {
          const value = JSON.parse(savedAi) as Partial<AiConfig> & { rememberKey?: boolean };
          const sessionKey = window.sessionStorage.getItem(AI_SESSION_KEY) ?? "";
          setAiConfig({ ...DEEPSEEK_FLASH_PRESET, ...value, provider: value.provider ?? (value.endpoint?.includes("api.deepseek.com") ? "deepseek" : "compatible"), apiKey: value.apiKey || sessionKey });
          setRememberApiKey(Boolean(value.rememberKey && value.apiKey));
        }
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
  const aiReady = Boolean(aiConfig.endpoint.trim() && aiConfig.apiKey.trim() && aiConfig.model.trim());
  const latestChapter = game.chronicle[0];

  async function prepareContract() {
    const freeIntent = intentText.trim();
    if (!freeIntent || contractLoading) return;
    setContractLoading(true); setGenerationError("");
    const args = { intent: freeIntent, game, leaderId: "organization", districtId: selectedDistrictId, abilityIds: [] as string[] };
    try {
      const next = aiReady ? await interpretIntentWithAi(aiConfig, args) : localContract(args);
      setContract(next);
    } catch (error) {
      setContract(localContract(args));
      setGenerationError(`${error instanceof Error ? error.message : "模型解析失败"}；已使用本地保守解释。`);
    } finally { setContractLoading(false); }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setContract(null); setSelectedDistrictDetail(null); setSelectedFacility(null); setSelectedChapter(null); setShowSettings(false); setChatMemberId(null); }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.shiftKey && !chatMemberId && view === "intent") { event.preventDefault(); void prepareContract(); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  function confirmContract() {
    if (!contract) return;
    try {
      const scheduled = scheduleContract(game, contract);
      setGame((current) => ({
        ...current,
        schedule: [...current.schedule.map((item) => contract.focus ? { ...item, focus: false } : item), scheduled],
        councilRecords: current.councilRecords.map((record) => record.week === current.week ? { ...record, decisions: [...record.decisions, { id: `decision-${scheduled.id}`, title: scheduled.title, rawIntent: scheduled.rawIntent, proposerId: "player", status: "scheduled" }] } : record),
      }));
      setContract(null); setIntentText("");
      setToast(`已排入${DAY_NAMES[scheduled.startDay - 1]}，持续${scheduled.days}天`);
    } catch (error) { setToast(error instanceof Error ? error.message : "无法加入日程"); }
  }

  function removeAction(id: string) { setGame((current) => ({ ...current, schedule: current.schedule.filter((item) => item.id !== id), councilRecords: current.councilRecords.map((record) => record.week === current.week ? { ...record, decisions: record.decisions.filter((decision) => decision.id !== `decision-${id}`) } : record) })); }

  async function endWeek() {
    if (generationStage) return;
    if (game.fatalSituation || game.ending.phase === "finale" || game.ending.phase === "ended") return;
    const resolved = resolveWeek(game);
    setCouncilDecisionSignal(0);
    const councilState: GameState = {
      ...resolved.state,
      councilRecords: [
        ...resolved.state.councilRecords.map((record) => record.week === game.week ? { ...record, status: "adjourned" as const, decisions: record.decisions.map((decision) => ({ ...decision, status: "resolved" as const })) } : record),
        ...(resolved.state.councilRecords.some((record) => record.week === resolved.state.week) ? [] : [{ week: resolved.state.week, status: "convened" as const, decisions: [] }]),
      ],
    };
    setGame(councilState); setTurnChapter(resolved.chapter); setView("intent"); setGenerationError("");
    if (!aiReady || !resolved.chapter.results.length) return;
    try {
      const simulatedState = await generateAiWorldDelta(aiConfig, councilState, resolved.chapter, setGenerationStage);
      const enrichedChapter = simulatedState.chronicle.find((chapter) => chapter.id === resolved.chapter.id) ?? resolved.chapter;
      const literary = await generateLiteraryChapter(aiConfig, simulatedState, enrichedChapter, setGenerationStage);
      setTurnChapter(literary);
      setGame({ ...simulatedState, chronicle: simulatedState.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter) });
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

  async function resolveFinaleStage() {
    if (generationStage) return;
    const next = resolveFinalePhase(game);
    if (next === game) { setToast("三项并发危机都必须指派执行者"); return; }
    const localChapter = next.chronicle[0];
    setGame(next); setTurnChapter(localChapter); setGenerationError("");
    if (next.ending.phase === "ended") setView("ending");
    if (!aiReady || !localChapter || localChapter.id === game.chronicle[0]?.id) return;
    try {
      const literary = await generateLiteraryChapter(aiConfig, next, localChapter, setGenerationStage);
      setTurnChapter(literary);
      setGame((current) => ({ ...current, chronicle: current.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter) }));
    } catch (error) {
      setGenerationError(`${error instanceof Error ? error.message : "终局文学模式失败"}；本地战报已经保留。`);
    } finally { setGenerationStage(""); }
  }

  function applyOrganizationChange(action: "rename" | "move" | "legalize" | "satellite" | "split" | "merge" | "rebuild", value: string) {
    const next = transformOrganization(game, action, value);
    if (next === game) { setToast(action === "legalize" ? "合法化需要官方或教会信任35、组织影响25" : action === "merge" ? "合并需要至少一个信任55的盟友" : "资金、目标或组织条件尚不满足"); return; }
    setGame(next); setToast("组织形态已改变；成员、资金、据点与关系按规则重新结算");
  }

  function applySuggestion(text: string, districtId = selectedDistrictId) { setIntentText(text); setSelectedDistrictId(districtId); setCouncilDecisionSignal((value) => value + 1); setView("intent"); window.scrollTo({ top: 0, behavior: "smooth" }); }

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
    setGame(createInitialGame(draftPathway)); setSelectedRank(9); setAbilityPanelOpen(false); setAbilityResult(null); setCouncilDecisionSignal(0); setShowSettings(false); setView("intent"); setToast("新的历史分支已经建立");
  }

  function completePrologue(name: string, address: string, pathwayId: PathwayId) {
    setGame((current) => {
      const base = current.pathwayId === pathwayId ? current : createInitialGame(pathwayId);
      return {
      ...base,
      prologueComplete: true,
      playerName: name,
      playerAddress: address,
      knownAliases: [name],
      facts: [...base.facts, { id: `fact-player-name-${Date.now()}`, subject: "组织负责人", statement: `${name}以“${address}”的称谓主持组织第一次正式密议。`, certainty: "确认", source: "密议室会议记录", week: base.week }],
    };
    });
    setSelectedRank(9);
    setToast(`成员已经落座，等待${address}主持会议`);
  }

  function saveSettings() {
    const stored = { ...aiConfig, apiKey: rememberApiKey ? aiConfig.apiKey : "", rememberKey: rememberApiKey };
    window.localStorage.setItem(AI_KEY, JSON.stringify(stored));
    if (rememberApiKey) window.sessionStorage.removeItem(AI_SESSION_KEY); else window.sessionStorage.setItem(AI_SESSION_KEY, aiConfig.apiKey);
    setShowSettings(false); setToast(aiReady ? `${aiConfig.model} 已启用` : "已切换为离线试玩模式");
  }

  async function testConnection() {
    if (!aiReady || connectionState.status === "testing") return;
    setConnectionState({ status: "testing", message: "正在发送最小测试请求，不会消耗游戏回合" });
    try {
      const result = await testModelConnection(aiConfig);
      setConnectionState({ status: "success", message: `${aiConfig.model} 已回应 · ${result.latencyMs}ms` });
    } catch (error) { setConnectionState({ status: "error", message: error instanceof Error ? error.message : "连接测试失败" }); }
  }

  function defaultAbilityContext(): AbilityContext {
    if (view === "organization") return { kind: "organization", label: `${game.organizationName}主据点` };
    if (view === "progression") return { kind: "self", label: game.playerName || "组织负责人" };
    return { kind: "council", label: "每周密议室" };
  }

  function openAbility(context = defaultAbilityContext(), abilityId = "", prompt = "") {
    const preferred = abilities.find((item) => item.id === abilityId) ?? abilities.find((item) => !item.passive) ?? abilities[0];
    setAbilityContext(context);
    setAbilitySelectedId(preferred?.id ?? "");
    setAbilityAssistId("");
    setAbilityIntent(prompt);
    setAbilityResult(null);
    setAbilityPanelOpen(true);
  }

  async function castAbility() {
    const ability = abilities.find((item) => item.id === abilitySelectedId) ?? abilities.find((item) => !item.passive) ?? abilities[0];
    const intent = abilityIntent.trim();
    if (!ability || !intent || abilityLoading) return;
    setAbilityLoading(true);
    try {
      const assistant = game.members.find((item) => item.id === abilityAssistId && item.pathway);
      const effectiveIntent = assistant ? `${intent}\n在场协同：${assistant.name}以其${assistant.pathway}途径能力提供辅助观察，但不得替负责人越过能力边界。` : intent;
      const draft = aiReady ? await generateAbilityDraft(aiConfig, game, ability, effectiveIntent, abilityContext) : undefined;
      const resolved = resolveImmediateAbility(game, ability, intent, abilityContext, draft);
      let next = resolved.state;
      if (assistant) {
        resolved.record.observation += `\n\n${assistant.name}依照命令进行了交叉观察，并把能够确认的部分与个人判断分开汇报。`;
        next = { ...next, members: next.members.map((item) => item.id === assistant.id ? { ...item, fatigue: Math.min(100, item.fatigue + 3) } : item) };
      }
      if (abilityContext.targetId && !/未发现|没有确认|没有察觉/.test(resolved.record.detection)) {
        next = { ...next, members: next.members.map((item) => item.id === abilityContext.targetId ? { ...item, trust: Math.max(0, (item.trust ?? item.loyalty) - 2) } : item) };
      }
      if (abilityContext.kind === "dialogue" && abilityContext.targetId) {
        next = {
          ...next,
          dialogueThreads: next.dialogueThreads.map((thread) => thread.memberId === abilityContext.targetId ? {
            ...thread,
            messages: [...thread.messages, { id: `dialogue-${resolved.record.id}`, role: "ability" as const, text: `${resolved.record.observation}\n判断（${resolved.record.confidence}）：${resolved.record.interpretation}`, week: next.week, context: chatContext, mood: `${ability.name} · ${resolved.record.detection}` }],
            lastUpdatedWeek: next.week,
          } : thread),
        };
      }
      setGame(next);
      setAbilityResult(resolved.record);
      setAbilityPanelOpen(false);
      setAbilityIntent("");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "能力反馈未能稳定成形");
    } finally { setAbilityLoading(false); }
  }

  async function deepenAbilityScene(intent: string) {
    if (abilityLoading) return;
    setAbilityLoading(true);
    try {
      const response = aiReady ? await generateSceneResponse(aiConfig, game, intent) : undefined;
      setGame((current) => continueAbilityScene(current, intent, response));
    } catch (error) { setToast(error instanceof Error ? error.message : "深层场景暂时失去回应"); }
    finally { setAbilityLoading(false); }
  }

  function passiveInsight(memberId: string) {
    if (game.pathwayId === "spectator") return "被动观察：对方的礼貌是真实的，但有一个词让他的身体反应比回答快了半拍。你可以集中观察，确认情绪来源。";
    if (game.pathwayId === "seer") return "危险直觉：这场谈话本身没有迫近威胁，但某个未说出口的名字与据点外的注视短暂重合。";
    if (game.pathwayId === "apprentice") return "空间直觉：门外走廊与窗边都是正常边界；桌后墙体有一处适合作为紧急撤离方向的薄弱点。";
    if (game.pathwayId === "hunter") return "猎人直觉：对方选择的座位同时看得见门与窗。这是长期习惯，不是今天临时产生的戒备。";
    const member = game.members.find((item) => item.id === memberId);
    return `神秘学辨识：${member?.name ?? "对方"}身上没有正在运转的明显仪式，但衣物边缘沾有极淡的灵性材料粉末。`;
  }

  function meditate() {
    if (game.lastMeditationWeek === game.week) { setToast("本周已经进行过一次有效冥想；继续勉强入静只会增加疲劳"); return; }
    setGame((current) => ({ ...current, spirituality: Math.min(current.spiritualityMax, current.spirituality + 4), mentalLoad: Math.max(0, current.mentalLoad - 6), lastMeditationWeek: current.week }));
    setToast("短暂冥想完成：灵性恢复4点，精神负荷降低6点");
  }

  function openMemberChat(memberId: string, seed = "", context: "council" | "private" = "council") {
    const member = game.members.find((item) => item.id === memberId)!;
    setChatMemberId(memberId); setChatContext(context); setChatInput(seed);
    setGame((current) => {
      if (current.dialogueThreads.some((item) => item.memberId === memberId)) return current;
      const pressure = current.missions.find((item) => item.state === "active");
      const opener = context === "council"
        ? `${member.name}起身向你致意，随后才重新落座。“${current.playerAddress}，我已经准备好汇报。您可以问上周的结果，也可以让我陈述这周最值得警惕的事。”`
        : `${member.name}关上门，在你对面的椅子坐下。“这里没有书记员，${current.playerAddress}。请您直说。”`;
      return { ...current, dialogueThreads: [...current.dialogueThreads, { memberId, messages: [{ id: `dialogue-${Date.now()}-open`, role: "member", text: pressure ? `${opener}他把写着“${pressure.title}”的纸页推开了半寸。` : opener, week: current.week, context, mood: "审慎" }], memories: [], lastMood: "审慎", lastUpdatedWeek: current.week }] };
    });
  }

  async function sendChat() {
    const text = chatInput.trim();
    const member = game.members.find((item) => item.id === chatMemberId);
    if (!text || !member || chatLoading) return;
    const playerMessage = { id: `dialogue-${Date.now()}-player`, role: "player" as const, text, week: game.week, context: chatContext };
    setGame((current) => ({ ...current, dialogueThreads: current.dialogueThreads.map((thread) => thread.memberId === member.id ? { ...thread, messages: [...thread.messages, playerMessage], lastUpdatedWeek: current.week } : thread) }));
    setChatInput(""); setChatLoading(true);
    try {
      const fallback = member.id === "mara"
        ? { reply: `玛拉将手从地图上收回，微微欠身。“${game.playerAddress}，请允许我补充一项风险。若目标只写成‘查清楚’，外勤会无法判断何时撤离。我建议保留两条撤退路线，也不要把名单上的人当作诱饵。最后如何决定，由您拍板。”`, mood: "郑重进言", memory: `${game.playerAddress}愿意在会上听取撤退条件。`, trustDelta: 0, proposal: null }
        : member.id === "cedric"
          ? { reply: `塞德里克合上账本，语气依旧恭谨。“${game.playerAddress}，这项方向可以执行。不过在写入记录前，我恳请您给出资金与身份文件的上限，也说明失败后是否允许我们中止。若您坚持维持原案，我会服从，只会把预计代价如实记在旁注里。”`, mood: "恭谨陈情", memory: `${game.playerAddress}要求成员如实陈述命令成本。`, trustDelta: 0, proposal: null }
          : member.id === "ines"
            ? { reply: `伊妮丝先向你点头，才提起昨晚那封匿名来信。“${game.playerAddress}，我愿意照您的方向追问。只是每一个被写下的名词，也会向对方暴露我们知道多少。若您准许，我会保留目标不变，只把问题换成更安全的说法。”`, mood: "谨慎请示", memory: `${game.playerAddress}曾在会上询问敏感目标。`, trustDelta: 0, proposal: null }
            : { reply: `罗文低头致意。“${game.playerAddress}，如果这是命令，我会遵从其中不违背禁忌的部分。若您是在征询，我恳请先把推测与亲眼所见分开。异常不会因为我们叫对了名字就更容易处理，但您的最终判断，我会准确执行。”`, mood: "肃然提醒", memory: `${game.playerAddress}愿意讨论非凡风险的边界。`, trustDelta: 0, proposal: null };
      const result = aiReady ? await generateNpcDialogue(aiConfig, game, member.id, text, chatContext) : fallback;
      setGame((current) => ({
        ...current,
        members: current.members.map((item) => item.id === member.id ? { ...item, trust: Math.max(0, Math.min(100, (item.trust ?? item.loyalty) + result.trustDelta)) } : item),
        dialogueThreads: current.dialogueThreads.map((thread) => thread.memberId === member.id ? {
          ...thread,
          messages: [...thread.messages, { id: `dialogue-${Date.now()}-member`, role: "member", text: result.reply, week: current.week, context: chatContext, mood: result.mood }],
          memories: result.memory && !thread.memories.includes(result.memory) ? [...thread.memories, result.memory].slice(-8) : thread.memories,
          lastMood: result.mood,
          lastUpdatedWeek: current.week,
        } : thread),
      }));
    } catch {
      setGame((current) => ({ ...current, dialogueThreads: current.dialogueThreads.map((thread) => thread.memberId === member.id ? { ...thread, messages: [...thread.messages, { id: `dialogue-${Date.now()}-error`, role: "member", text: "油灯的火苗跳了一下，话语没能抵达记录端。没有新的事实或关系变化被写入；你可以原样重试。", week: current.week, context: chatContext, mood: "中断" }] } : thread) }));
    }
    finally { setChatLoading(false); }
  }

  async function formDialogueDecision() {
    const member = game.members.find((item) => item.id === chatMemberId);
    const thread = game.dialogueThreads.find((item) => item.memberId === chatMemberId);
    const previous = thread?.messages.slice().reverse().find((message) => message.role === "player")?.text ?? "";
    const decisionText = chatInput.trim() || previous;
    if (!member || !decisionText || dialogueDecisionLoading) { setToast("请先说清希望形成决议的做法与目标"); return; }
    setDialogueDecisionLoading(true);
    try {
      const args = { intent: decisionText, game, leaderId: "organization", districtId: selectedDistrictId, abilityIds: [] as string[] };
      const interpreted = aiReady ? await interpretIntentWithAi(aiConfig, args) : localContract(args);
      const scheduled = scheduleContract(game, interpreted);
      const restatement = aiReady
        ? await generateNpcDialogue(aiConfig, game, member.id, `【正式决议】${game.playerAddress}已经按以下原意拍板：“${decisionText}”。请先称呼${game.playerAddress}，再准确复述目标、方法、预期结果与底线；不得替负责人改变原意，也不要再提出新提案。`, "council")
        : { reply: `${member.name}起身，向你郑重致意。“遵照您的决议，${game.playerAddress}：${decisionText}。组织会依照这段原意分工执行；我会把目标、方法和底线一并写入本周记录，不作擅自增删。”`, mood: "领命复述", memory: `${game.playerAddress}将“${decisionText.slice(0, 80)}”确认为正式决议。`, trustDelta: 1 };
      const now = Date.now();
      setGame((current) => ({
        ...current,
        schedule: [...current.schedule.map((item) => interpreted.focus ? { ...item, focus: false } : item), scheduled],
        councilRecords: current.councilRecords.map((record) => record.week === current.week ? { ...record, decisions: [...record.decisions, { id: `decision-${scheduled.id}`, title: scheduled.title, rawIntent: scheduled.rawIntent, proposerId: "player", status: "scheduled" }] } : record),
        members: current.members.map((item) => item.id === member.id ? { ...item, trust: Math.min(100, (item.trust ?? item.loyalty) + restatement.trustDelta) } : item),
        dialogueThreads: current.dialogueThreads.map((item) => item.memberId === member.id ? { ...item, messages: [...item.messages, ...(chatInput.trim() ? [{ id: `dialogue-${now}-decision`, role: "player" as const, text: decisionText, week: current.week, context: "council" as const }] : []), { id: `dialogue-${now}-restate`, role: "member", text: restatement.reply, week: current.week, context: "council", mood: restatement.mood }], memories: restatement.memory && !item.memories.includes(restatement.memory) ? [...item.memories, restatement.memory].slice(-8) : item.memories, lastMood: restatement.mood, lastUpdatedWeek: current.week } : item),
      }));
      setChatInput("");
      setToast(`${member.name}已复述并将决议写入本周记录`);
    } catch (error) { setToast(error instanceof Error ? error.message : "这项决议暂时无法写入本周记录"); }
    finally { setDialogueDecisionLoading(false); }
  }

  return <main className="complete-game-shell">
    <a className="complete-skip-link" href="#complete-content">跳到主要内容</a>
    <div className="complete-ambient" aria-hidden="true" />
    <header className="complete-topbar">
      <button className="mobile-menu-button" onClick={() => setShowMobileNav((value) => !value)} aria-label="打开导航"><Menu size={19} /></button>
      <div className="complete-brand"><div><Eye size={19} /></div><span><small>BEYONDER ORGANIZATION SIMULATION</small><strong>灰雾纪事</strong></span></div>
      <div className="complete-date"><small>第 {game.week} 周 · {game.playerAddress}</small><strong>{game.date}</strong><span>历史偏转 {game.deviation.toFixed(1)}%</span></div>
      <div className="top-resources">
        <span><CircleDollarSign size={14} /><small>资金</small><strong>£{game.money}</strong></span>
        <span><LockKeyhole size={14} /><small>隐秘</small><strong>{game.secrecy}</strong></span>
        <span><Sparkles size={14} /><small>灵性</small><strong>{game.spirituality}/{game.spiritualityMax}</strong></span>
      </div>
      <button className="complete-icon-button" onClick={() => setShowSettings(true)} aria-label="游戏与AI设置"><Settings size={18} /></button>
    </header>

    <nav className={`complete-sidebar ${showMobileNav ? "open" : ""}`} aria-label="游戏主导航">
      {NAV_ITEMS.map((item) => { const Icon = item.icon; const badge = item.id === "progression" ? game.currentSequence : null; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setShowMobileNav(false); }}><Icon size={18} /><span>{item.label}</span>{badge !== null && <i>{badge}</i>}</button>; })}
      <div className="sidebar-spacer" />
      <button onClick={() => setShowSettings(true)}><Settings size={18} /><span>设置</span></button>
    </nav>

    <section className="complete-content" id="complete-content">
      {!aiReady && <button className="offline-banner" onClick={() => setShowSettings(true)}><ShieldAlert size={15} /><span><strong>离线试玩模式</strong><small>规则、晋升和建设可用；配置模型后开放完整自由解析、动态世界与文学叙事。</small></span><ChevronRight size={15} /></button>}

      {view === "intent" && <WeeklyCouncil key={councilDecisionSignal} game={game} intentText={intentText} selectedDistrictId={selectedDistrictId} contractLoading={contractLoading} generationStage={generationStage} decisionSignal={councilDecisionSignal} latestChapter={latestChapter} onIntentText={setIntentText} onDistrict={setSelectedDistrictId} onInspectDistrict={setSelectedDistrictDetail} onPrepare={() => void prepareContract()} onRemoveAction={removeAction} onEndWeek={() => void endWeek()} onQuestionMember={(memberId, seed) => openMemberChat(memberId, seed, "council")} onReadChapter={setSelectedChapter} onUseSuggestion={(text, districtId) => { applySuggestion(text, districtId); }} onView={setView} />}

      {view === "investigation" && <InvestigationBoard game={game} onConnectEvidence={(from, to, label) => setGame((current) => connectEvidence(current, from, to, label))} onUseOpportunity={(opportunity) => { setIntentText(opportunity.suggestedIntent); setSelectedDistrictId(opportunity.districtId); setView("intent"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}

      {view === "city" && <div className="city-page page-enter">
        <header className="page-title row"><div><p>贝克兰德 · 城市情报图</p><h1>地图提供空间，议桌决定行动</h1><span>点击区域查看背景与已知痕迹；选中地点后可以把任何调查意图带回每周密议，不必沿着现有线索走。</span></div><button className="complete-secondary" onClick={() => setView("intent")}><Command size={15} />回到每周密议</button></header>
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
        <section className="roster complete-card"><header className="section-heading"><span><UsersRound size={15} /><strong>核心成员</strong></span><small>成员有自己的晋升意志、疲劳与忠诚</small></header><div>{game.members.map((member) => <article key={member.id}><div className="member-monogram">{member.name.slice(0, 1)}</div><h3>{member.name}</h3><p>{member.role}{member.pathway ? ` · 序列${member.sequence} ${member.pathway}` : " · 普通人"}</p><dl><div><dt>专长</dt><dd>{member.specialty}</dd></div><div><dt>忠诚</dt><dd>{member.loyalty}</dd></div><div><dt>疲劳</dt><dd>{member.fatigue}</dd></div></dl><div className="member-context-actions"><button onClick={() => openMemberChat(member.id)}>档案与对话 <ChevronRight size={13} /></button><button onClick={() => openAbility({ kind: "organization", targetId: member.id, label: member.name }, "", `我在组织日常环境中使用能力观察${member.name}最近的精神状态、异常影响与未说出口的压力；不进行强制干涉。`)}><WandSparkles size={13} />即时感知</button></div></article>)}</div></section>
        <section className="recruit-pool complete-card"><header className="section-heading"><span><UsersRound size={15} /><strong>固定人物池与关系阶梯</strong></span><small>接触 → 临时合作 → 长期盟友或线人 → 正式成员</small></header><div>{game.recruitPool.map((member) => <article key={member.id}><header><div className="member-monogram">{member.name.slice(0, 1)}</div><span><strong>{member.name}</strong><small>{member.role}</small></span><b>{member.relationshipStage}</b></header><p>{member.background}</p><footer><span>{member.specialty}</span><button onClick={() => applySuggestion(`与${member.name}推进关系。先回应其当前关切并提供可验证的合作条件，不强迫其加入组织。`, member.id === "sylvie" ? "empress" : member.id === "ollie" ? "dock" : member.id === "elsa" ? "north" : member.id === "nora" ? "south" : "bridge")}>安排接触 <ArrowRight size={13} /></button></footer></article>)}</div></section>
      </div>}

      {view === "progression" && <div className="progression-page page-enter">
        <header className="page-title row"><div><p>{game.playerName} · 自身与非凡能力</p><h1>{pathway.name}途径</h1><span>这里处理你本人要做的事：自由使用能力、管理灵性与污染，并筹备晋升。组织总体方向请回到集会决定。</span></div><div className="current-rank-seal"><small>当前</small><strong>{game.currentSequence}</strong><span>{currentSequence.name}</span></div></header>
        <section className="self-action-console complete-card immediate-ability-home">
          <header><div><p>即时非凡交互</p><h2>能力不是周行动</h2><span>在任何界面发动能力都会立即返回观察、专业判断、未知项与察觉反馈。这里用于查看能力全貌与历史感知记录。</span></div><aside><small>当前状态</small><strong>{game.spirituality}/{game.spiritualityMax}</strong><span>精神负荷 {game.mentalLoad} · 污染 {game.playerCondition.pollution}</span></aside></header>
          <div className="self-ability-pills">{abilities.map((ability) => <button key={ability.id} onClick={() => openAbility({ kind: "self", label: game.playerName || "组织负责人" }, ability.id, `我集中使用${ability.name}，观察自身、当前环境与近期异常留下的影响；只获取信息，不进行额外干涉。`)}><span><strong>{ability.name}</strong><small>{ability.verb}</small></span><b>{ability.passive ? "集中1灵性" : `${ability.cost}灵性`}</b></button>)}</div>
          <footer><span>本周已经即时使用 {game.abilityJournal.filter((item) => item.week === game.week).length} 次；普通使用不推进日期。</span><div className="self-ability-actions"><button onClick={meditate} disabled={game.lastMeditationWeek === game.week || game.spirituality === game.spiritualityMax}>短暂冥想 · 恢复4</button><button className="complete-primary" onClick={() => openAbility({ kind: "self", label: game.playerName || "组织负责人" })}><WandSparkles size={15} />自由发动能力</button></div></footer>
          {game.abilityJournal.length > 0 && <div className="ability-history"><header><strong>最近的感知记录</strong><small>结果会进入AI上下文与世界事实账本</small></header>{game.abilityJournal.slice(0, 5).map((record) => <article key={record.id}><span>{record.abilityName}</span><div><strong>{record.context.label}</strong><p>{record.interpretation}</p></div><b>{record.confidence}</b></article>)}</div>}
        </section>
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

    {game.ending.phase === "finale" && <GreatSmogFinale game={game} busy={Boolean(generationStage)} onDoctrine={(doctrine) => setGame((current) => chooseFinaleDoctrine(current, doctrine))} onAssign={(crisisId, kind, id) => setGame((current) => assignFinaleResource(current, crisisId, kind, id))} onAutoDeploy={() => setGame((current) => autoDeployFinale(current))} onResolve={() => void resolveFinaleStage()} />}

    {game.fatalSituation && <div className="complete-sheet-backdrop fatal-backdrop"><section className="fatal-sheet" role="alertdialog" aria-modal="true" aria-labelledby="fatal-title"><header><ShieldAlert size={24} /><small>明确的高危局面</small><h2 id="fatal-title">{game.fatalSituation.title}</h2><p>{game.fatalSituation.threat}</p></header><div className="known-threats"><strong>目前已知</strong>{game.fatalSituation.knownThreats.map((threat) => <p key={threat}>{threat}</p>)}</div><div className="fatal-choices"><button onClick={() => chooseFatal("retreat")}><strong>立即撤退</strong><span>安全阈值 {game.fatalSituation.odds.retreat}%</span><small>放弃现场成果，优先保命。</small></button><button onClick={() => chooseFatal("help")}><strong>请求支援</strong><span>安全阈值 {game.fatalSituation.odds.help}%</span><small>消耗关系并暴露部分情报。</small></button><button className="continue" onClick={() => chooseFatal("continue")}><strong>继续深入</strong><span>安全阈值 {game.fatalSituation.odds.continue}%</span><small>可能获得更多成果；失败可导致死亡并结束本局。</small></button></div><footer>死亡只会在你选择后由最终检定产生；叙事模型无权越过这一步。</footer></section></div>}

    {contract && <div className="complete-sheet-backdrop" onMouseDown={() => setContract(null)}><section className="complete-sheet contract-sheet" role="dialog" aria-modal="true" aria-labelledby="contract-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>议桌对发言的规则化理解</p><h2 id="contract-title">{contract.title}</h2></div><button onClick={() => setContract(null)} aria-label="关闭"><X size={17} /></button></header>{generationError && <div className="inline-warning"><ShieldAlert size={14} />{generationError}</div>}<div className="contract-summary"><span className={`risk-chip ${riskClass(contract.risk)}`}>{contract.risk}风险</span><span><Clock3 size={12} />{contract.days}天</span><span><CircleDollarSign size={12} />£{contract.budget}</span><span><MapPin size={12} />{DISTRICTS.find((district) => district.id === contract.districtId)?.name}</span></div><div className="contract-fields">{editableContractField(contract, setContract, "desiredOutcome", "核心目标", true)}{editableContractField(contract, setContract, "approach", "执行方法", true)}{editableContractField(contract, setContract, "knownFacts", "角色已知事实")}{editableContractField(contract, setContract, "hypothesis", "玩家提出的假设")}{editableContractField(contract, setContract, "unknowns", "仍未知")}{editableContractField(contract, setContract, "redLines", "禁止事项")}{editableContractField(contract, setContract, "retreat", "撤退条件", true)}</div><label className="focus-toggle"><button className={contract.focus ? "on" : ""} onClick={() => setContract({ ...contract, focus: !contract.focus })}><i /></button><span><strong>本回合重点叙事</strong><small>{contract.focus ? "本周小说章节将以此为重点场景" : "这项行动将在次要报告中呈现"}</small></span></label><footer><button className="complete-secondary" onClick={() => setContract(null)}><ArrowLeft size={14} />返回议桌修改</button><button className="complete-primary" onClick={confirmContract}><span>负责人拍板，写入本周决议</span><CalendarDays size={16} /></button></footer></section></div>}

    {selectedDistrictDetail && (() => { const district = DISTRICTS.find((item) => item.id === selectedDistrictDetail)!; return <div className="complete-sheet-backdrop drawer-backdrop" onMouseDown={() => setSelectedDistrictDetail(null)}><aside className="complete-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedDistrictDetail(null)}><X size={17} /></button><header><p>区域档案</p><h2>{district.name}</h2><span>{district.subtitle}</span></header><div className="district-risk-row"><span>已知风险 <strong>{district.danger}</strong></span><span>情报基础 <strong>{district.intel}</strong></span></div><section><h3><Landmark size={14} />背景</h3><p>{district.background}</p></section><section><h3><MapPin size={14} />重要地点</h3><div className="landmark-chips">{district.landmarks.map((landmark) => <span key={landmark}>{landmark}</span>)}</div></section><section className="opportunity-block"><div><strong>可利用条件</strong><p>{district.opportunity}</p></div><div><strong>已知警告</strong><p>{district.warning}</p></div></section><section><h3><WandSparkles size={14} />现场使用非凡能力</h3><button className="context-ability-button" onClick={() => openAbility({ kind: "district", targetId: district.id, label: district.name }, "", `我从${district.name}当前可见的环境开始使用能力，寻找与${district.opportunity}有关的异常；不把推断当作事实，并保持撤离方向。`)}><WandSparkles size={14} />立即感知，不加入周日程</button></section><section><h3><Lightbulb size={14} />只是提示，不是任务</h3><div className="district-actions"><button onClick={() => { setSelectedDistrictDetail(null); applySuggestion(`先熟悉${district.name}的关键人物、公开机构与安全撤离路线，建立基础情报地图。`, district.id); }}>建立区域情报</button><button onClick={() => { setSelectedDistrictDetail(null); setSelectedDistrictId(district.id); setIntentText(""); setView("intent"); }}>在这里形成总体决议</button></div></section></aside></div>; })()}

    {selectedFacility && <div className="complete-sheet-backdrop drawer-backdrop" onMouseDown={() => setSelectedFacility(null)}><aside className="complete-drawer facility-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedFacility(null)}><X size={17} /></button><header><p>{selectedFacility.type}设施 · Lv.{selectedFacility.level}</p><h2>{selectedFacility.name}</h2><span>{selectedFacility.status}</span></header><section><p>{selectedFacility.description}</p></section><section><h3><TrendingUp size={14} />当前功能</h3>{selectedFacility.benefits.map((benefit) => <p className="facility-benefit" key={benefit}><CheckCircle2 size={13} />{benefit}</p>)}</section><section><h3><ShieldAlert size={14} />运行风险</h3><p>{selectedFacility.risk}</p></section><button className="context-ability-button" onClick={() => openAbility({ kind: "organization", targetId: selectedFacility.id, label: selectedFacility.name }, "", `我使用能力检查${selectedFacility.name}近期留下的异常、污染与人为隐瞒，只观察并记录，不触碰未知联系。`)}><WandSparkles size={14} />立即检查灵性与异常痕迹</button><label className="facility-assignment"><span>负责成员</span><select value={selectedFacility.assignedMemberId ?? ""} onChange={(event) => updateFacilityAssignment(event.target.value)}><option value="">暂不指派</option>{game.members.map((member) => <option key={member.id} value={member.id}>{member.name} · 疲劳{member.fatigue}</option>)}</select></label><button className="complete-primary" onClick={() => { const target = selectedFacility.name; setSelectedFacility(null); applySuggestion(`升级${target}，优先提高隐蔽性与事故隔离能力，同时控制维护费用。`, "cherwood"); }}><Hammer size={15} />提出升级方案</button></aside></div>}

    {(turnChapter || selectedChapter) && <div className="complete-reader-backdrop" onMouseDown={() => { if (!generationStage) { setTurnChapter(null); setSelectedChapter(null); } }}><section className="complete-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title" onMouseDown={(event) => event.stopPropagation()}><header className="reader-commandbar"><div><small>第 {(turnChapter ?? selectedChapter)!.week} 周 · {(turnChapter ?? selectedChapter)!.date}</small><span>{(turnChapter ?? selectedChapter)!.source === "ai" ? "文学模式" : "本地事实版"}</span></div><div><button onClick={() => setReaderScale((value) => Math.max(.9, value - .1))}>A−</button><button onClick={() => setReaderScale(1)}>A</button><button onClick={() => setReaderScale((value) => Math.min(1.25, value + .1))}>A＋</button><button onClick={() => { if (!generationStage) { setTurnChapter(null); setSelectedChapter(null); } }}><X size={16} /></button></div></header>{generationStage && <div className="reader-generation"><Sparkles size={15} /><span><strong>规则事实已经锁定</strong><small>{generationStage}；完成后章节会自动更新。</small></span><i /><i /><i /></div>}{generationError && <div className="inline-warning reader-warning"><ShieldAlert size={14} />{generationError}</div>}<article className="reader-page" style={{ "--reader-scale": readerScale } as React.CSSProperties}><div className="folio"><span>灰雾纪事</span><i /><span>W{String((turnChapter ?? selectedChapter)!.week).padStart(2, "0")}</span></div><h1 id="reader-title">{(turnChapter ?? selectedChapter)!.title}</h1>{(turnChapter ?? selectedChapter)!.sections.map((section, index) => <section key={`${section.heading}-${index}`}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>)}</section>)}<div className="reader-end"><CloudFog size={18} /><span>本章完</span></div></article>{(turnChapter ?? selectedChapter)!.results.length > 0 && <details className="reader-appendix"><summary><span><ListTodo size={15} />行动、证据与规则附录</span><small>{(turnChapter ?? selectedChapter)!.summary}</small></summary><div>{(turnChapter ?? selectedChapter)!.results.map((result) => <article key={result.id}><header><strong>{result.title}</strong><b className={result.outcome}>{result.outcome}</b></header><p>{result.contract.rawIntent}</p><ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul><footer><span>消化 +{result.digestionGain}</span><span>任务推进 +{result.missionProgress}%</span><span>资金 {result.resourceChanges.money}</span></footer></article>)}</div></details>}<footer className="reader-actions"><button onClick={() => { setTurnChapter(null); setSelectedChapter(null); setView("archive"); }}><Archive size={14} />进入纪事档案</button><button className="complete-primary compact" onClick={() => { setTurnChapter(null); setSelectedChapter(null); }} disabled={Boolean(generationStage)}>{game.ending.phase === "finale" ? "返回终局作战桌" : game.ending.phase === "ended" ? "查看最终结局" : `继续第 ${game.week} 周`} <ArrowRight size={15} /></button></footer></section></div>}

    {showSettings && <div className="complete-sheet-backdrop" onMouseDown={() => setShowSettings(false)}><section className="complete-sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>本机配置</p><h2 id="settings-title">AI推演与新游戏</h2></div><button onClick={() => setShowSettings(false)} aria-label="关闭设置"><X size={17} /></button></header><AiSettings config={aiConfig} rememberKey={rememberApiKey} connection={connectionState} draftPathway={draftPathway} onChange={(patch) => { setAiConfig((current) => ({ ...current, ...patch })); setConnectionState({ status: "idle", message: "配置已改变，请重新测试" }); }} onRememberKey={setRememberApiKey} onTest={() => void testConnection()} onSave={saveSettings} onPathway={setDraftPathway} onNewGame={startNewGame} /></section></div>}

    {chatMemberId && (() => {
      const member = game.members.find((item) => item.id === chatMemberId)!;
      const thread = game.dialogueThreads.find((item) => item.memberId === chatMemberId);
      const hasDecisionText = Boolean(chatInput.trim() || thread?.messages.some((message) => message.role === "player"));
      return <div className="complete-sheet-backdrop council-dialogue-backdrop" onMouseDown={() => setChatMemberId(null)}>
        <section className="complete-sheet character-sheet living-dialogue" role="dialog" aria-modal="true" aria-labelledby="character-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="sheet-grabber" />
          <header><div><p>{chatContext === "council" ? "议桌发言" : "私下谈话"} · {member.role}</p><h2 id="character-title">{member.name}</h2><span>当前态度：{thread?.lastMood ?? "审慎"} · 信任 {member.trust ?? member.loyalty} · 疲劳 {member.fatigue}</span></div><button onClick={() => setChatMemberId(null)} aria-label="结束点名"><X size={17} /></button></header>
          <details className="character-dossier"><summary>查看人物档案与长期关系记忆</summary><div className="character-core"><div><small>背景</small><p>{member.background}</p></div><div><small>性格核心</small><p>{member.core}</p></div><div><small>成长矛盾</small><p>{member.arc}</p></div></div>{thread?.memories.length ? <ul>{thread.memories.map((memory) => <li key={memory}>{memory}</li>)}</ul> : <p>还没有形成值得长期记住的关系事实。</p>}</details>
          <div className="dialogue-rule"><MessageSquareText size={14} /><span><strong>这是自由对话，不是关键词菜单</strong><small>成员会尊重你的领导身份，也会以正式方式陈述异议、隐瞒、误判或请求澄清；普通谈话不会自动消耗行动。</small></span></div>
          <p className="passive-insight"><strong>{PATHWAYS[game.pathwayId].startingAbilities.find((item) => item.passive)?.name ?? "非凡直觉"}</strong>：{passiveInsight(member.id)}</p>
          <div className="character-dialogue" aria-live="polite">{thread?.messages.map((message) => <p key={message.id} className={message.role}><strong>{message.role === "player" ? game.playerAddress : message.role === "ability" ? "非凡感知" : member.name}</strong><span>{message.text}</span>{message.mood && <small>{message.mood}</small>}</p>)}{chatLoading && <p className="member pending"><strong>{member.name}</strong><span>油灯安静地烧着。他正在斟酌怎样准确而恭敬地回应……</span></p>}</div>
          <div className="dialogue-ability-strip"><span><WandSparkles size={13} />即时使用，不打断谈话</span>{abilities.slice(0, 3).map((ability) => <button key={ability.id} onClick={() => openAbility({ kind: "dialogue", targetId: member.id, label: member.name }, ability.id, `我在不惊动${member.name}的前提下使用${ability.name}，重点观察刚才谈话中的矛盾、情绪变化或非自然影响；只记录可感知现象。`)}><Eye size={12} />{ability.name}</button>)}</div>
          <label className="chat-input"><span>直接说任何话。Enter发送，Shift+Enter换行；你也可以把输入框中的最终说法直接形成决议。</span><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder={`向${member.name}询问、解释或写下你希望他复述的最终决议……`} maxLength={1200} /><button className="complete-secondary" onClick={() => void sendChat()} disabled={!chatInput.trim() || chatLoading}><Send size={15} />继续交谈</button></label>
          <footer className="dialogue-decision-bar"><span><Gavel size={14} /><b>领导决议</b><small>按你的原话写入本周计划，并由{member.name}尊敬地复述确认。</small></span><button className="complete-primary" onClick={() => void formDialogueDecision()} disabled={!hasDecisionText || dialogueDecisionLoading || chatLoading}>{dialogueDecisionLoading ? "正在整理并复述" : "按我的方式形成决议"}</button></footer>
        </section>
      </div>;
    })()}

    <AbilityConsole game={game} abilities={abilities} open={abilityPanelOpen} context={abilityContext} selectedId={abilitySelectedId} assistId={abilityAssistId} intent={abilityIntent} loading={abilityLoading} result={abilityResult} onOpen={() => openAbility()} onClose={() => { setAbilityPanelOpen(false); setAbilityResult(null); }} onSelect={setAbilitySelectedId} onAssist={setAbilityAssistId} onIntent={setAbilityIntent} onUse={() => void castAbility()} onContinueScene={(intent) => void deepenAbilityScene(intent)} onExitScene={() => setGame((current) => ({ ...current, activeAbilityScene: null }))} />

    {hydrated && !game.prologueComplete && <OpeningPrologue game={game} onBegin={completePrologue} />}

    {toast && <div className="complete-toast"><CheckCircle2 size={15} />{toast}</div>}
  </main>;
}
