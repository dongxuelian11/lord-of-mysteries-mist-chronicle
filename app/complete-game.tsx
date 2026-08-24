"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, CloudFog, Command, Eye, FileKey, FlaskConical,
  Gavel, GitBranch, ListTodo, LockKeyhole, MapPin, Menu, MessageSquareText,
  Search, Send, Settings, ShieldAlert, Sparkles,
  UsersRound, WandSparkles, X, Zap,
} from "lucide-react";
import {
  ActionContract, ADVANCEMENT_RITUALS, ChronicleChapter, createInitialGame, DISTRICTS, FIXED_RECRUIT_POOL, GameState, INITIAL_MEMBERS, materialsFor, organizationKindById, PATHWAYS,
  Ability, AbilityContext, AbilityUseRecord, PathwayId, PlayerOrigin, RiskLevel, ViewId,
} from "./game-model";
import {
  advanceSequence, availableAbilities, beginAdvancement, canAdvance, generateAiWorldDelta, generateLiteraryChapter, generateNpcDialogue, generateSituationBrief, progressAdvancement,
  generateParticipationSceneBeat,
  enterSandbox, interpretIntentWithAi, resolveFatalSituation,
  resolveWeek, scheduleContract, SituationBrief,
} from "./game-engine";
import { assignFinaleResource, autoDeployFinale, chooseFinaleDoctrine, refreshFinaleFronts, resolveFinalePhase } from "./finale-system";
import OrganizationManagementConsole from "./organization-management-console";
import { advanceManagedBeyonder, promoteCandidate, recalculateBacklundControl, type OrganizationManagementState } from "./organization-management";
import GreatSmogFinale from "./great-smog-finale";
import AiSettings from "./ai-settings";
import { AiConfig, DEEPSEEK_FLASH_PRESET, isLoopbackInferenceEndpoint, testModelConnection, userFacingModelError } from "./ai-client";
import WeeklyCouncil from "./weekly-council";
import OpeningPrologue from "./opening-prologue";
import AbilityConsole from "./ability-console";
import { SituationOpening, TitleScreen } from "./title-screen";
import { abilityForFreeIntent, continueAbilityScene, generateAbilityDraft, generateSceneResponse, resolveImmediateAbility } from "./ability-system";
import { generateCouncilReplies, generateCouncilSummary, generateDecisionDraft } from "./council-ai";
import { actingPrinciplesFor, advancementStatus } from "./progression-system";
import { abilitiesFor } from "./pathway-abilities";
import { createRecoveryCheckpointAsync, downloadSave, normalizeStoredGame, parseSaveEnvelope, readRecoveryCheckpointsAsync, savePreview, type RecoveryCheckpoint } from "./save-system";
import { continueAsSuccessor } from "./succession-system";
import ParticipationSceneOverlay from "./participation-scene-overlay";
import { createParticipationScene, resolveParticipationSceneTurn } from "./participation-scene";
import { stableEntityId, stableTextHash } from "./stable-id";
import { branchRecoveredGame, clearAiSessionKey, loadGameSession, persistActiveGame, persistActiveGameAsync, replaceActiveGameWithRecoveryAsync, saveAiSessionSettings, stageAiCredential } from "./game-session-controller";
import { appendPlayerDialogue, applyDialogueDecision, applyDialogueModelResult, chooseDialogueScreeningAction, ensureDialogueThread } from "./dialogue-session-controller";
import type { AttentionSimulationState } from "./attention-simulation.ts";

const DEV_MODE = typeof window !== "undefined" && window.localStorage.getItem("mist-chronicle-dev-mode") === "1";

const NAV_ITEMS: { id: ViewId; label: string; icon: typeof Command }[] = [
  { id: "intent", label: "议会", icon: Command },
  { id: "archive", label: "纪事", icon: BookOpen },
];

function riskClass(risk: RiskLevel) { return risk === "致命" ? "fatal" : risk === "高" ? "high" : risk === "中" ? "medium" : "low"; }

function resourceCommitmentLabel(contract: ActionContract) {
  const posture = { minimal: "克制投入", balanced: "常规投入", substantial: "重点投入", "all-in": "全力投入" }[contract.resourceCommitment.posture];
  const kinds = [contract.resourceCommitment.money > 0 ? "资金" : "", contract.resourceCommitment.manpower > 0 ? "人力" : "", contract.resourceCommitment.extraordinaryMaterials > 0 ? "非凡材料" : ""].filter(Boolean);
  return `${posture}${kinds.length ? ` · ${kinds.join("、")}` : " · 不额外调用资源"}`;
}

function authorizationLabel(contract: ActionContract) {
  const scope = { strict: "严格授权", bounded: "有界授权", broad: "广泛授权" }[contract.authorization.scope];
  return `${scope} · ${contract.authorization.mustEscalateWhen.length}类情况必须请示`;
}

const PERSISTENCE_FATAL_MESSAGE = "本机存档数据库无法打开；为避免覆盖旧状态，已阻止需要持久化的推进。请修复数据库后重试。";
const PERSISTENCE_QUARANTINE_MESSAGE = "旧存档无法升级，已安全隔离；你可以开始新局，并在恢复记录中查看旧状态。";

function persistenceFailureMessage(code: string) {
  if (code === "active-save-quarantine-failed") return "旧存档无法升级，且未能安全隔离；为避免覆盖原记录，已阻止推进。请先备份或修复本机存储。";
  if (/persistence-(?:record|recovery)-corrupt/.test(code)) return "存档记录校验失败；为避免覆盖可恢复数据，已阻止推进。请检查隔离与恢复记录。";
  return PERSISTENCE_FATAL_MESSAGE;
}

function displayError(error: unknown, fallback: string) {
  return error instanceof Error ? userFacingModelError(error.message) : fallback;
}

async function lockDesktopWorldTurn(game: GameState, resolvingWeek: number) {
  if (typeof window === "undefined" || typeof window.mistInference?.requestWorld !== "function") return;
  if (typeof window.mistInference.lockWorld !== "function") throw new Error("WORLD_INFERENCE_LOCK_UNAVAILABLE");
  const locked = await window.mistInference.lockWorld({ turnId: `world:${resolvingWeek}`, baseRevision: game.worldKernel.revision });
  if (!locked.ok || typeof locked.snapshotHash !== "string" || !/^[0-9a-f]{64}$/.test(locked.snapshotHash)) throw new Error(locked.error ?? "WORLD_INFERENCE_LOCK_FAILED");
}

async function stageDesktopWorldTurn(game: GameState, resolvingWeek: number) {
  if (typeof window === "undefined" || typeof window.mistInference?.requestWorld !== "function") return;
  if (typeof window.mistInference.stageWorld !== "function") throw new Error("WORLD_INFERENCE_RESOLUTION_UNAVAILABLE");
  const staged = await window.mistInference.stageWorld({ turnId: `world:${resolvingWeek}`, baseRevision: game.worldKernel.revision, resolution: game });
  if (!staged.ok || typeof staged.resolutionHash !== "string" || !/^[0-9a-f]{64}$/.test(staged.resolutionHash)) throw new Error(staged.error ?? "WORLD_INFERENCE_RESOLUTION_FAILED");
}

function editableContractField(contract: ActionContract, setContract: (value: ActionContract) => void, key: keyof ActionContract, label: string, wide = false) {
  const value = contract[key];
  if (typeof value !== "string") return null;
  return <label className={wide ? "contract-field wide" : "contract-field"}><span>{label}</span><textarea value={value} onChange={(event) => setContract({ ...contract, [key]: event.target.value })} /></label>;
}

export default function CompleteGame() {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);
  const [hydrated, setHydrated] = useState(false);
  const [entry, setEntry] = useState<"title" | "game">("title");
  const [hasSave, setHasSave] = useState(false);
  const [situationBrief, setSituationBrief] = useState<SituationBrief | null>(null);
  const [situationLoading, setSituationLoading] = useState(false);
  const situationDismissed = useRef(false);
  const worldTurnInFlight = useRef(false);
  const [view, setView] = useState<ViewId>("intent");
  const [intentText, setIntentText] = useState("");
  const [selectedDistrictId, setSelectedDistrictId] = useState("cherwood");
  const [abilityPanelOpen, setAbilityPanelOpen] = useState(false);
  const [abilityContext, setAbilityContext] = useState<AbilityContext>({ kind: "council", label: "每周密议室" });
  const [abilitySelectedId, setAbilitySelectedId] = useState("");
  const [abilitySupportIds, setAbilitySupportIds] = useState<string[]>([]);
  const [abilityAssistId, setAbilityAssistId] = useState("");
  const [abilityIntent, setAbilityIntent] = useState("");
  const [abilityLoading, setAbilityLoading] = useState(false);
  const [abilityError, setAbilityError] = useState("");
  const [abilityResult, setAbilityResult] = useState<AbilityUseRecord | null>(null);
  const [contract, setContract] = useState<ActionContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [selectedRank, setSelectedRank] = useState(9);
  const [selectedChapter, setSelectedChapter] = useState<ChronicleChapter | null>(null);
  const [turnChapter, setTurnChapter] = useState<ChronicleChapter | null>(null);
  const [generationStage, setGenerationStage] = useState("");
  const [streamPreview, setStreamPreview] = useState("");
  const [turnStages, setTurnStages] = useState<{ name: string; ms: number; status: "ok" | "error" }[]>([]);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [autoExecuteDecision, setAutoExecuteDecision] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("mist-chronicle-auto-decision") === "1");
  const [generationError, setGenerationError] = useState("");
  const [readerScale, setReaderScale] = useState(1.08);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>({ ...DEEPSEEK_FLASH_PRESET });
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false);
  const [credentialConfigured, setCredentialConfigured] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [recoveryOptions, setRecoveryOptions] = useState<RecoveryCheckpoint[]>([]);
  const [connectionState, setConnectionState] = useState<{ status: "idle" | "testing" | "success" | "error"; message: string }>({ status: "idle", message: "" });
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [draftPathway, setDraftPathway] = useState<PathwayId>("seer");
  const [toast, setToast] = useState("");
  const [councilDecisionSignal, setCouncilDecisionSignal] = useState(0);
  const [chatMemberId, setChatMemberId] = useState<string | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dialogueDecisionLoading, setDialogueDecisionLoading] = useState(false);
  const [chatContext, setChatContext] = useState<"council" | "private">("council");
  const [showOrganizationLedger, setShowOrganizationLedger] = useState(false);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [participationError, setParticipationError] = useState("");
  const activeChatMessageCount = chatMemberId ? game.dialogueThreads.find((thread) => thread.memberId === chatMemberId)?.messages.length ?? 0 : 0;

  useEffect(() => {
    const element = chatMessagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chatMemberId, activeChatMessageCount, chatLoading]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => { void (async () => {
      const loaded = await loadGameSession();
      if (cancelled) return;
      if (loaded.game) setGame(loaded.game);
      setHasSave(loaded.hasSave);
      setSecureStorageAvailable(loaded.secureStorageAvailable);
      setCredentialConfigured(loaded.credentialConfigured);
      if (loaded.aiConfig) setAiConfig(loaded.aiConfig);
      setRememberApiKey(loaded.rememberApiKey);
      if (loaded.persistenceError) {
        const message = persistenceFailureMessage(loaded.persistenceError);
        setPersistenceError(message);
        setToast(message);
      }
      if (loaded.persistenceWarning === "active-save-migration-rejected") setToast(PERSISTENCE_QUARANTINE_MESSAGE);
      try {
        const recoveries = await readRecoveryCheckpointsAsync();
        if (!cancelled) setRecoveryOptions(recoveries);
      } catch {
        if (!loaded.persistenceError) {
          setPersistenceError(PERSISTENCE_FATAL_MESSAGE);
          setToast(PERSISTENCE_FATAL_MESSAGE);
        }
      }
      setHydrated(true);
    })(); }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!hydrated || !game.prologueComplete) return;
    void persistActiveGame(game).catch(() => {
      setPersistenceError(PERSISTENCE_FATAL_MESSAGE);
      setGenerationError(PERSISTENCE_FATAL_MESSAGE);
      setToast(PERSISTENCE_FATAL_MESSAGE);
    });
  }, [game, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3600); return () => window.clearTimeout(timer); }, [toast]);
  const pathway = PATHWAYS[game.pathwayId];
  const currentSequence = pathway.sequences.find((sequence) => sequence.rank === game.currentSequence)!;
  const nextSequence = pathway.sequences.find((sequence) => sequence.rank === game.currentSequence - 1);
  const abilities = availableAbilities(game);
  const desktopInference = typeof window !== "undefined" && Boolean(window.mistInference && window.mistCredentials);
  const provider = aiConfig.provider ?? "deepseek";
  const aiReady = Boolean(aiConfig.endpoint.trim() && aiConfig.model.trim() && (
    desktopInference
      ? provider === "compatible"
        ? isLoopbackInferenceEndpoint(aiConfig.endpoint)
        : credentialConfigured || aiConfig.apiKey.trim()
      : aiConfig.apiKey.trim()
  ));
  const latestChapter = game.chronicle[0];

  function blockPersistence() {
    setPersistenceError(PERSISTENCE_FATAL_MESSAGE);
    setGenerationError(PERSISTENCE_FATAL_MESSAGE);
    setToast(PERSISTENCE_FATAL_MESSAGE);
  }

  function ensurePersistenceReady() {
    if (!persistenceError) return true;
    setGenerationError(persistenceError);
    setToast(persistenceError);
    return false;
  }

  function isCurrentGame(expected: GameState, message = "局面在异步处理期间发生了变化；本次结果已取消，请从当前局面重新发起。") {
    if (gameRef.current === expected) return true;
    setGenerationError(message);
    return false;
  }

  async function prepareContract() {
    const freeIntent = intentText.trim();
    if (!freeIntent || contractLoading) return;
    if (!aiReady) { setShowSettings(true); setToast("自由决议必须先连接 AI；本地规则不会代替模型理解你的意图"); return; }
    setContractLoading(true); setGenerationError("");
    const playerExplicitlyJoins = /我亲自|亲自参与|亲自前往|由我带队/.test(freeIntent);
    const leaderId = playerExplicitlyJoins ? "player" : "organization";
    const args = { intent: freeIntent, game, leaderId, districtId: selectedDistrictId, abilityIds: [] as string[] };
    try {
      const next = await interpretIntentWithAi(aiConfig, args);
      setContract(next);
    } catch (error) {
      setGenerationError(`${displayError(error, "模型解析失败")}；没有写入任何机械替代决议，请检查后重试。`);
    } finally { setContractLoading(false); }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setContract(null); setSelectedChapter(null); setShowSettings(false); setShowOrganizationLedger(false); setChatMemberId(null); }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.shiftKey && !chatMemberId && view === "intent") { event.preventDefault(); void prepareContract(); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  function commitContract(contract: ActionContract) {
    try {
      const scheduled = scheduleContract(game, contract);
      setGame((current) => {
        const sourceIssue = contract.sourceIssueId
          ? current.organizationIssues.find((issue) => issue.id === contract.sourceIssueId)
          : undefined;
        const replacedActionId = sourceIssue?.directiveState === "awaiting-authorization"
          ? sourceIssue.originActionId
          : undefined;
        const retainedSchedule = current.schedule
          .filter((item) => item.id !== replacedActionId)
          .map((item) => contract.focus ? { ...item, focus: false } : item);
        return {
          ...current,
          schedule: [...retainedSchedule, scheduled],
          organizationIssues: current.organizationIssues.map((issue) => issue.id === sourceIssue?.id
            ? { ...issue, state: "已处理" as const }
            : issue),
          councilRecords: current.councilRecords.map((record) => record.week === current.week ? { ...record, decisions: [...record.decisions, { id: `decision-${scheduled.id}`, title: scheduled.title, rawIntent: scheduled.rawIntent, proposerId: "player", status: "scheduled" }] } : record),
        };
      });
      setToast("首领指令已经交给负责人；时机、人员与资源冲突将在闭会后统一裁定");
    } catch (error) { setToast(error instanceof Error ? error.message : "无法加入日程"); }
  }

  function confirmContract() {
    if (!contract) return;
    commitContract(contract);
    setContract(null); setIntentText("");
  }

  async function formDecisionFromDiscussion(topicId: string) {
    const topic = game.councilTopics.find((item) => item.id === topicId);
    if (!topic || decisionLoading) return;
    if (!topic.messages.length) { setToast("这个议题还没有讨论内容，先让成员发言"); return; }
    if (!aiReady) { setShowSettings(true); setToast("由书记员整理决议需要连接 AI 模型"); return; }
    setDecisionLoading(true); setGenerationError("");
    try {
      const draft = await generateDecisionDraft(aiConfig, game, topic);
      const args = { intent: draft, game, leaderId: "organization" as const, districtId: selectedDistrictId, abilityIds: [] as string[] };
      const contract = await interpretIntentWithAi(aiConfig, args);
      if (autoExecuteDecision) {
        commitContract(contract);
        setToast("已根据讨论自动写入本周决议");
      } else {
        setContract(contract);
        setToast("书记员已根据讨论整理出决议草稿，请确认后拍板");
      }
    } catch (error) {
      setGenerationError(`${displayError(error, "决议整理失败")}；原始讨论没有改变。`);
    } finally { setDecisionLoading(false); }
  }

  function removeAction(id: string) { setGame((current) => ({ ...current, schedule: current.schedule.filter((item) => item.id !== id), councilRecords: current.councilRecords.map((record) => record.week === current.week ? { ...record, decisions: record.decisions.filter((decision) => decision.id !== `decision-${id}`) } : record) })); }

  async function finishWeekGeneration(councilState: GameState, resolvedChapter: ChronicleChapter, sourceGame: GameState) {
    setGenerationError("");
    setTurnChapter(resolvedChapter);
    setStreamPreview("");
    setView("intent");
    let simulatedState: GameState;
    const worldStartedAt = performance.now();
    try {
      await lockDesktopWorldTurn(councilState, resolvedChapter.week);
      await stageDesktopWorldTurn(councilState, resolvedChapter.week);
      simulatedState = await generateAiWorldDelta(aiConfig, councilState, resolvedChapter, setGenerationStage, (token) => setStreamPreview((prev) => `${prev}${token}`.slice(-6000)));
      setTurnStages([{ name: "世界推演", ms: Math.round(performance.now() - worldStartedAt), status: "ok" }]);
    } catch (error) {
      setTurnStages([{ name: "世界推演", ms: Math.round(performance.now() - worldStartedAt), status: "error" }]);
      setGenerationError(`${displayError(error, "世界回应中断")}；本周尚未走完，你可以检查连接后从同一局面继续，已经发生的事不会被重掷。`);
      setGenerationStage("");
      setStreamPreview("");
      return;
    }
    if (!isCurrentGame(sourceGame, "本周局面在世界推演期间发生了变化；世界结果没有落地，请从当前局面重新发起。")) {
      setGenerationStage("");
      setStreamPreview("");
      return;
    }
    const enrichedChapter = simulatedState.chronicle.find((chapter) => chapter.id === resolvedChapter.id) ?? resolvedChapter;
    try {
      await persistActiveGameAsync(simulatedState);
    } catch {
      blockPersistence();
      setGenerationStage("");
      setStreamPreview("");
      return;
    }
    setCouncilDecisionSignal(0);
    setTurnChapter(enrichedChapter);
    gameRef.current = simulatedState;
    setGame(simulatedState);
    const literaryStartedAt = performance.now();
    try {
      const literary = await generateLiteraryChapter(aiConfig, simulatedState, enrichedChapter, setGenerationStage, (token) => setStreamPreview((prev) => `${prev}${token}`.slice(-6000)));
      if (!isCurrentGame(simulatedState, "世界事实已经保存，但界面局面在文学生成期间发生了变化；文学结果没有覆盖当前状态。")) return;
      setTurnStages((prev) => [...prev, { name: "文学章节", ms: Math.round(performance.now() - literaryStartedAt), status: "ok" }]);
      setTurnChapter(literary);
      setGame((current) => ({ ...current, chronicle: current.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter) }));
    } catch (error) {
      setTurnStages((prev) => [...prev, { name: "文学章节", ms: Math.round(performance.now() - literaryStartedAt), status: "error" }]);
      setGenerationError(`${displayError(error, "文学章节生成失败")}；世界事实与本周结算已经安全保存，可稍后只重试文学章节。`);
    } finally { setGenerationStage(""); setStreamPreview(""); }
  }

  async function endWeek() {
    if (generationStage || worldTurnInFlight.current) return;
    if (game.fatalSituation || game.ending.phase === "major-event" || game.ending.phase === "finale" || game.ending.phase === "ended") return;
    if (!ensurePersistenceReady()) return;
    if (!aiReady) {
      setGenerationError("请先连接人物与叙事模型；世界必须完成自己的回应后，这一周才能结束。");
      setToast("尚未配置模型，世界推演没有开始");
      setShowSettings(true);
      return;
    }
    worldTurnInFlight.current = true;
    try {
      const sourceGame = game;
      try {
        await createRecoveryCheckpointAsync(sourceGame, "week");
      } catch {
        blockPersistence();
        return;
      }
      if (gameRef.current !== sourceGame) {
        setGenerationError("本周局面在保存恢复点期间发生了变化；本次结算已取消，请从当前局面重新发起。");
        return;
      }
      try {
        await lockDesktopWorldTurn(sourceGame, sourceGame.worldKernel.currentWeek);
      } catch (error) {
        setGenerationError(`${displayError(error, "世界权威快照锁定失败")}；本周尚未结算，当前局面没有改变。`);
        return;
      }
      const resolved = resolveWeek(sourceGame);
      const councilState: GameState = {
        ...resolved.state,
        councilRecords: [
          ...resolved.state.councilRecords.map((record) => record.week === game.week ? { ...record, status: "adjourned" as const, decisions: record.decisions.map((decision) => ({ ...decision, status: "resolved" as const })) } : record),
          ...(resolved.state.councilRecords.some((record) => record.week === resolved.state.week) ? [] : [{ week: resolved.state.week, status: "convened" as const, decisions: [] }]),
        ],
      };
      try {
        await stageDesktopWorldTurn(councilState, resolved.chapter.week);
      } catch (error) {
        setGenerationError(`${displayError(error, "本周规则结果冻结失败")}；本周尚未进入世界推演，当前局面没有改变。`);
        return;
      }
      const playerResult = resolved.chapter.results.find((result) => ["executed", "limited", "partially-completed", "interrupted"].includes(result.executionStatus ?? "") && (result.contract.leaderId === "player" || result.contract.executionMode === "player-led"));
      if (playerResult) {
        setGenerationError("");
        setTurnChapter(null);
        setView("intent");
        setGame({ ...councilState, activeParticipationScene: createParticipationScene(resolved.chapter.id, game.week, playerResult) });
        setToast("局面的结局已经定下，不会因重试改变；亲历场景结束前，你还不知道最终结果");
        return;
      }
      await finishWeekGeneration(councilState, resolved.chapter, sourceGame);
    } finally {
      worldTurnInFlight.current = false;
    }
  }

  async function continueParticipationScene(intent: string) {
    const scene = game.activeParticipationScene;
    if (!scene || scene.status === "complete" || participationLoading) return;
    const sourceGame = game;
    setParticipationLoading(true);
    setParticipationError("");
    try {
      const narrative = await generateParticipationSceneBeat(aiConfig, sourceGame, scene, intent);
      if (!isCurrentGame(sourceGame, "亲历场景期间局面发生了变化；本次回应没有覆盖当前状态。")) return;
      setGame((current) => current.activeParticipationScene ? { ...current, activeParticipationScene: resolveParticipationSceneTurn(current.activeParticipationScene, intent, narrative) } : current);
    } catch (error) {
      setParticipationError(`${displayError(error, "亲历场景生成失败")}；这是模型接入错误，没有生成降级文本，也没有重掷事实。`);
    } finally { setParticipationLoading(false); }
  }

  async function resumeAfterParticipation() {
    const scene = game.activeParticipationScene;
    if (!scene || scene.status !== "complete" || generationStage || worldTurnInFlight.current) return;
    if (!ensurePersistenceReady()) return;
    const chapter = game.chronicle.find((item) => item.id === scene.chapterId);
    if (!chapter) { setParticipationError("已锁定章节不存在，无法继续世界推演"); return; }
    const sourceGame = game;
    const resumed = { ...sourceGame, activeParticipationScene: null };
    worldTurnInFlight.current = true;
    try {
      await finishWeekGeneration(resumed, chapter, sourceGame);
    } finally {
      worldTurnInFlight.current = false;
    }
  }

  async function retryLiteraryChapter(chapter: ChronicleChapter) {
    if (!aiReady || generationStage) return;
    const sourceGame = game;
    setGenerationError("");
    setStreamPreview("");
    setTurnChapter(chapter);
    setSelectedChapter(null);
    const retryStartedAt = performance.now();
    try {
      const literarySeed = chapter.source === "ai" ? { ...chapter, source: "local" as const, sections: [] } : chapter;
      const literary = await generateLiteraryChapter(aiConfig, sourceGame, literarySeed, setGenerationStage, (token) => setStreamPreview((prev) => `${prev}${token}`.slice(-6000)));
      if (!isCurrentGame(sourceGame, "文学补写期间局面发生了变化；文学结果没有覆盖当前状态。")) return;
      setTurnStages([{ name: "文学章节补写", ms: Math.round(performance.now() - retryStartedAt), status: "ok" }]);
      setTurnChapter(literary);
      setGame((current) => ({ ...current, chronicle: current.chronicle.map((item) => item.id === literary.id ? literary : item) }));
      setToast(`第${chapter.week}周文学章节已经补写并存档`);
    } catch (error) {
      setTurnStages([{ name: "文学章节补写", ms: Math.round(performance.now() - retryStartedAt), status: "error" }]);
      setGenerationError(`${displayError(error, "文学章节生成失败")}；世界事实没有回滚，也不会重复结算。`);
    } finally { setGenerationStage(""); setStreamPreview(""); }
  }

  function chooseFatal(choice: "retreat" | "help" | "continue") {
    const next = resolveFatalSituation(game, choice);
    setGame(next);
    if (!next.playerCondition.alive) { setTurnChapter(null); setView("ending"); }
    setToast(next.playerCondition.alive ? "致命处境已由规则引擎完成最终检定" : "负责人死亡，本局结束");
  }

  function chooseSuccessor(memberId: string) {
    try {
      const next = continueAsSuccessor(game, memberId);
      setGame(next);
      setTurnChapter(null);
      setView("intent");
      setToast(`${next.playerName}已接过议会席位；原有组织、地图、敌意与世界历史全部保留`);
    } catch (error) { setToast(error instanceof Error ? error.message : "继任程序无法完成"); }
  }

  async function resolveFinaleStage() {
    if (generationStage || worldTurnInFlight.current) return;
    if (!ensurePersistenceReady()) return;
    if (!aiReady) { setShowSettings(true); setToast("先连接人物与叙事模型，再继续终局世界回应"); return; }
    const sourceGame = game;
    const pendingFinale = sourceGame.pendingFinaleWorldTurn;
    const next = pendingFinale ? sourceGame : resolveFinalePhase(sourceGame);
    if (!pendingFinale && next === sourceGame) { setToast("三项并发危机都必须指派执行者"); return; }
    worldTurnInFlight.current = true;
    let finaleWorldFailed = true;
    let finaleLiteraryStartedAt = 0;
    const finaleWorldStartedAt = performance.now();
    try {
      if (!pendingFinale && sourceGame.ending.campaign?.stage === 1 && !sourceGame.ending.campaign.reports.length) {
        try {
          await createRecoveryCheckpointAsync(sourceGame, "finale");
        } catch {
          blockPersistence();
          return;
        }
      }
      if (gameRef.current !== sourceGame) {
        setGenerationError("终局局面在保存恢复点期间发生了变化；本次结算已取消，请从当前局面重新发起。");
        return;
      }
      const localChapter = pendingFinale
        ? next.chronicle.find((chapter) => chapter.id === pendingFinale.chapterId)
        : next.chronicle[0];
      if (!localChapter) throw new Error("待处理的终局规则战报不存在");
      await lockDesktopWorldTurn(sourceGame, localChapter.week);
      const pendingState: GameState = pendingFinale ? next : {
        ...next,
        pendingFinaleWorldTurn: {
          turnId: `world:${localChapter.week}`,
          chapterId: localChapter.id,
          baseRevision: sourceGame.worldKernel.revision,
        },
      };
      await stageDesktopWorldTurn(pendingState, localChapter.week);
      setStreamPreview("");
      try {
        await persistActiveGameAsync(pendingState);
      } catch {
        blockPersistence();
        return;
      }
      gameRef.current = pendingState;
      setGame(pendingState); setTurnChapter(localChapter); setGenerationError("");
      const worldSimulated = await generateAiWorldDelta(aiConfig, pendingState, localChapter, setGenerationStage, (token) => setStreamPreview((prev) => `${prev}${token}`.slice(-6000)));
      if (!isCurrentGame(pendingState, "终局局面在世界推演期间发生了变化；世界结果没有落地，请从当前局面重新发起。")) return;
      const simulated = { ...refreshFinaleFronts(worldSimulated), pendingFinaleWorldTurn: undefined };
      const enrichedChapter = simulated.chronicle.find((chapter) => chapter.id === localChapter.id) ?? localChapter;
      try {
        await persistActiveGameAsync(simulated);
      } catch {
        blockPersistence();
        return;
      }
      finaleWorldFailed = false;
      setTurnStages([{ name: "重大事件世界推演", ms: Math.round(performance.now() - finaleWorldStartedAt), status: "ok" }]);
      gameRef.current = simulated;
      setGame(simulated); setTurnChapter(enrichedChapter);
      if (simulated.ending.phase === "ended") setView("ending");
      finaleLiteraryStartedAt = performance.now();
      const literary = await generateLiteraryChapter(aiConfig, simulated, enrichedChapter, setGenerationStage, (token) => setStreamPreview((prev) => `${prev}${token}`.slice(-6000)));
      if (!isCurrentGame(simulated, "终局世界事实已经保存，但界面局面在文学生成期间发生了变化；文学结果没有覆盖当前状态。")) return;
      setTurnStages((prev) => [...prev, { name: "重大事件文学章节", ms: Math.round(performance.now() - finaleLiteraryStartedAt), status: "ok" }]);
      setTurnChapter(literary);
      setGame((current) => ({ ...current, chronicle: current.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter), ending: current.ending.phase === "ended" ? { ...current.ending, epilogue: literary.sections.flatMap((section) => section.paragraphs) } : current.ending }));
    } catch (error) {
      const stageMs = Math.round(performance.now() - (finaleWorldFailed ? finaleWorldStartedAt : finaleLiteraryStartedAt));
      setTurnStages((prev) => [...prev, { name: finaleWorldFailed ? "重大事件世界推演" : "重大事件文学章节", ms: stageMs, status: "error" }]);
      setGenerationError(`${displayError(error, "重大事件世界推演或文学模式失败")}；规则战报已经保留，失败阶段不会伪造本地替代世界。`);
    } finally {
      worldTurnInFlight.current = false;
      setGenerationStage("");
      setStreamPreview("");
    }
  }

  function applyManagementChange(management: OrganizationManagementState, message: string) {
    setGame((current) => ({ ...current, management, money: management.resources.money }));
    setToast(message);
  }

  function applyAttentionChange(attentionSimulation: AttentionSimulationState, message: string) {
    setGame((current) => ({ ...current, attentionSimulation }));
    setToast(message);
  }

  function promoteOrganizationCandidate(candidateId: string, formulaId: string, costs: { money: number; extraordinaryMaterials: number }) {
    try {
      const candidate = game.management.candidates.find((item) => item.id === candidateId);
      const formula = game.management.formulas.find((item) => item.id === formulaId && item.status === "verified");
      if (!candidate || !formula) throw new Error("候选人或已验证配方不存在");
      const management = promoteCandidate(game.management, candidateId, formulaId, costs);
      const memberId = `promoted-${candidate.id}`;
      const pathway = PATHWAYS[formula.pathwayId as PathwayId];
      setGame((current) => ({
        ...current,
        management,
        money: management.resources.money,
        members: [...current.members, {
          id: memberId,
          name: candidate.name,
          role: "新晋外勤成员",
          pathway: pathway.name,
          sequence: formula.sequence,
          specialty: candidate.aptitude,
          loyalty: 56,
          trust: 45,
          interest: 50,
          ideology: 50,
          fatigue: 12,
          status: "适应魔药中",
          background: `${candidate.background}；${candidate.sourceTrait}`,
          core: candidate.experienceTrait,
          personalEvent: candidate.predicamentTrait,
          personalEventState: "dormant",
        }],
        dialogueThreads: [...current.dialogueThreads, { memberId, messages: [], memories: [candidate.background, candidate.predicamentTrait], lastMood: "紧张而郑重", lastUpdatedWeek: current.week }],
      }));
      setToast(`${candidate.name}已从基层人力转化为具名的序列${formula.sequence}非凡者；魔药适应风险会继续进入周结算`);
    } catch (error) { setToast(error instanceof Error ? error.message : "提拔失败"); }
  }

  function advanceOrganizationMember(memberId: string, formulaId: string) {
    try {
      const management = advanceManagedBeyonder(game.management, memberId, formulaId, game.week);
      const development = management.beyonderDevelopment.find((item) => item.memberId === memberId)!;
      setGame((current) => ({
        ...current,
        management,
        money: management.resources.money,
        members: current.members.map((member) => member.id === memberId ? { ...member, sequence: development.sequence, status: "适应魔药中", fatigue: Math.min(100, member.fatigue + 12) } : member),
      }));
      setToast(`成员已晋升序列${development.sequence}；资源已结算并重新进入监护期`);
    } catch (error) { setToast(error instanceof Error ? error.message : "成员晋升失败"); }
  }

  function applySuggestion(text: string, districtId = selectedDistrictId) { setIntentText(text); setSelectedDistrictId(districtId); setCouncilDecisionSignal((value) => value + 1); setView("intent"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function startCouncilDiscussion(text: string) {
    const raw = text.trim();
    if (!raw) return null;
    if (!aiReady) { setShowSettings(true); setToast("自由讨论需要先连接AI模型；离线规则不会伪装成人物发言"); return null; }
    const topicOrdinal = game.councilTopics.filter((topic) => topic.week === game.week).length + 1;
    const topicId = `council-topic:${game.week}:${topicOrdinal}:${stableTextHash(raw)}`;
    let replies: Awaited<ReturnType<typeof generateCouncilReplies>> = [];
    try { replies = await generateCouncilReplies(aiConfig, game, raw, topicId); }
    catch (error) { setToast(error instanceof Error ? error.message : "成员没有形成可用回应"); return null; }
    setGame((current) => ({
      ...current,
      councilTopics: [{
        id: topicId,
        week: current.week,
        title: raw.replace(/^请|围绕|关于/, "").slice(0, 42),
        pinned: false,
        status: "open" as const,
        messages: [{ id: stableEntityId("council-message", topicId, "player", 1, raw), speakerId: "player", text: raw }, ...replies],
      }, ...current.councilTopics].slice(0, 30),
    }));
    return topicId;
  }

  async function summarizeCouncilTopic(topicId: string) {
    const topic = game.councilTopics.find((item) => item.id === topicId);
    if (!topic) return;
    if (!aiReady) { setShowSettings(true); setToast("一键整理需要AI阅读这次真实讨论，不会使用本地摘要模板"); return; }
    try {
      const summary = await generateCouncilSummary(aiConfig, game, topic);
      setGame((current) => ({ ...current, councilTopics: current.councilTopics.map((item) => item.id === topicId ? { ...item, summary } : item) }));
      setToast("书记员已把事实、分歧、风险和未答问题整理在同一页");
    } catch (error) { setToast(error instanceof Error ? error.message : "讨论整理中断；原始发言仍完整保留"); }
  }

  function pinCouncilTopic(topicId: string) {
    setGame((current) => {
      const target = current.councilTopics.find((item) => item.id === topicId);
      if (!target) return current;
      const pinnedCount = current.councilTopics.filter((item) => item.pinned).length;
      if (!target.pinned && pinnedCount >= 3) { setToast("桌面最多钉住3项持续议题"); return current; }
      return { ...current, councilTopics: current.councilTopics.map((item) => item.id === topicId ? { ...item, pinned: !item.pinned } : item) };
    });
  }

  async function attemptAdvance() {
    if (!ensurePersistenceReady()) return;
    try {
      const sourceGame = game;
      if (sourceGame.prologueComplete) {
        try {
          await createRecoveryCheckpointAsync(sourceGame, "sequence");
        } catch {
          blockPersistence();
          return;
        }
      }
      if (gameRef.current !== sourceGame) {
        setToast("局面在保存恢复点期间发生了变化，请重新确认晋升");
        return;
      }
      const next = canAdvance(sourceGame) ? advanceSequence(sourceGame) : sourceGame.advancementProcess ? progressAdvancement(sourceGame) : beginAdvancement(sourceGame);
      setGame(next); setSelectedRank(next.currentSequence);
      setToast(canAdvance(sourceGame) ? `晋升完成：序列${next.currentSequence} · ${PATHWAYS[next.pathwayId].sequences.find((item) => item.rank === next.currentSequence)?.name}` : `晋升档案推进：${advancementStatus(next)}`);
    }
    catch (error) { setToast(error instanceof Error ? error.message : "尚不能晋升"); }
  }

  async function openSituation(next: GameState) {
    situationDismissed.current = false;
    setSituationBrief({ title: "城市正在醒来", dateline: `${next.date} · 贝克兰德 · ${next.organizationName}`, paragraphs: [] });
    setSituationLoading(true);
    if (!aiReady) { setSituationLoading(false); setSituationBrief(null); setShowSettings(true); return; }
    try { const generated = await generateSituationBrief(aiConfig, next); if (!situationDismissed.current) setSituationBrief(generated); }
    catch (error) { setSituationBrief(null); setGenerationError(`${displayError(error, "AI 局势生成失败")}；请检查接口后重新进入。`); }
    finally { setSituationLoading(false); }
  }

  async function ensureModelConnection() {
    if (!aiReady) { setShowSettings(true); setToast("请先配置 AI 模型"); return false; }
    if (connectionVerified) return true;
    if (connectionState.status === "testing") return false;
    setConnectionState({ status: "testing", message: "进入游戏前正在验证模型连接…" });
    try {
      const preflight = { ...aiConfig, timeoutMs: Math.min(15_000, aiConfig.timeoutMs ?? 15_000) };
      const result = await testModelConnection(preflight);
      setConnectionState({ status: "success", message: `${aiConfig.model} 已回应 · ${result.latencyMs}ms` });
      setConnectionVerified(true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型连接失败";
      setConnectionState({ status: "error", message });
      setGenerationError(message);
      setShowSettings(true);
      setToast(message);
      return false;
    }
  }

  async function continueSavedGame() {
    if (!(await ensureModelConnection())) return;
    setEntry("game"); setView("intent"); setShowSettings(false);
    void openSituation(game);
  }

  async function importSave(file: File) {
    try {
      const envelope = parseSaveEnvelope(await file.text());
      const preview = savePreview(envelope);
      const confirmed = window.confirm(`导入预览\n\n${preview.organization} · ${preview.leader}\n第${preview.week}周 · ${preview.date}\n序列${preview.sequence} · ${preview.chapters}篇纪事\n\n确认后将覆盖当前唯一存档；现存游戏会先写入隐藏恢复点。`);
      if (!confirmed) return;
      if (!ensurePersistenceReady()) return;
      const sourceGame = game;
      if (gameRef.current !== sourceGame) {
        setToast("当前局面在导入确认期间发生了变化，导入已取消");
        return;
      }
      const next = branchRecoveredGame(normalizeStoredGame(envelope.game), "import");
      try {
        await replaceActiveGameWithRecoveryAsync(sourceGame, next, "import");
      } catch {
        blockPersistence();
        return;
      }
      setGame(next); setHasSave(true); setEntry("title"); setToast("存档校验通过并已导入；仍从标题页进入游戏");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "导入失败；当前存档没有被覆盖");
    }
  }

  async function restoreRecovery(checkpoint: RecoveryCheckpoint) {
    const confirmed = window.confirm(`恢复第${checkpoint.game.week}周的安全存档？当前局面不会在确认完成前改变。`);
    if (!confirmed) return;
    const sourceGame = game;
    const next = branchRecoveredGame(normalizeStoredGame(checkpoint.game), checkpoint.id);
    try {
      if (hasSave && sourceGame.prologueComplete) await replaceActiveGameWithRecoveryAsync(sourceGame, next, "history-branch");
      else await persistActiveGameAsync(next);
      setGame(next);
      setHasSave(true);
      setPersistenceError("");
      setRecoveryOptions(await readRecoveryCheckpointsAsync());
      setToast(`已恢复到第${next.week}周；请从标题页继续`);
    } catch {
      blockPersistence();
    }
  }

  async function startNewGame() {
    if (!ensurePersistenceReady()) return;
    if (!aiReady) { setShowSettings(true); setToast("先连接人物与叙事模型，再开始一部全新的纪事"); return; }
    if (!(await ensureModelConnection())) return;
    const next = createInitialGame(draftPathway);
    setGame(next); setEntry("game"); setSituationBrief(null); setSelectedRank(9); setAbilityPanelOpen(false); setAbilityResult(null); setCouncilDecisionSignal(0); setShowSettings(false); setView("intent"); setToast("全新游戏已经建立");
  }

  function completePrologue(name: string, address: string, pathwayId: PathwayId, origin: PlayerOrigin) {
    if (!ensurePersistenceReady()) return;
    const base = game.pathwayId === pathwayId && game.playerOrigin.organizationKind === origin.organizationKind ? game : createInitialGame(pathwayId, origin);
    const kind = organizationKindById(origin.organizationKind);
    const scenario = origin.pathwayOrigin;
    const traitEffects = (origin.traits ?? []).reduce((total, trait) => ({
      manpower: total.manpower + (trait.effects.manpower ?? 0),
      money: total.money + (trait.effects.money ?? 0),
      extraordinaryMaterials: total.extraordinaryMaterials + (trait.effects.extraordinaryMaterials ?? 0),
      exposure: total.exposure + (trait.effects.exposure ?? 0),
      reputation: total.reputation + (trait.effects.reputation ?? 0),
      digestion: total.digestion + (trait.effects.digestion ?? 0),
      instability: total.instability + (trait.effects.instability ?? 0),
    }), { manpower: 0, money: 0, extraordinaryMaterials: 0, exposure: 0, reputation: 0, digestion: 0, instability: 0 });
    const resources = {
      manpower: Math.max(12, (scenario?.resources.manpower ?? 24) + traitEffects.manpower),
      money: Math.max(0, (scenario?.resources.money ?? 420) + traitEffects.money),
      extraordinaryMaterials: Math.max(0, (scenario?.resources.extraordinaryMaterials ?? 6) + traitEffects.extraordinaryMaterials),
    };
    const exposure = Math.max(0, Math.min(100, (scenario?.exposure ?? 0) + traitEffects.exposure));
    const reputationScore = Math.max(-20, Math.min(100, (scenario?.reputation ?? 0) + traitEffects.reputation));
    const openingMap = scenario ? recalculateBacklundControl({
      ...base.management.map,
      districts: base.management.map.districts.map((district) => district.id !== scenario.startingLocation.districtId ? district : ({
        ...district,
        blocks: district.blocks.map((block) => block.id !== scenario.startingLocation.blockId ? block : ({
          ...block,
          strategicPoints: block.strategicPoints.map((point, index) => index ? point : ({ ...point, influenceByFaction: { ...point.influenceByFaction, player: (point.influenceByFaction.player ?? 0) + 22 } })),
        })),
      })),
    }, base.week) : base.management.map;
    const allCandidates = origin.foundingMembers?.length ? origin.foundingMembers : [...INITIAL_MEMBERS, ...FIXED_RECRUIT_POOL];
    const chosen = allCandidates.filter((member) => origin.foundingMemberIds.includes(member.id)).map((member) => ({ ...member, status: "可安排", relationshipStage: "正式成员" as const }));
    const reserve = FIXED_RECRUIT_POOL.map((member) => ({ ...member, status: "尚未接触", relationshipStage: "接触" as const }));
    const fieldLead = chosen.find((member) => /追踪|调查|警|码头|路线/.test(`${member.specialty}${member.role}`)) ?? chosen[0];
    const supportLead = chosen.find((member) => member.id !== fieldLead?.id && /账|档案|机械|研究|身份/.test(`${member.specialty}${member.role}`)) ?? chosen.find((member) => member.id !== fieldLead?.id) ?? chosen[0];
    const next: GameState = {
      ...base,
      prologueComplete: true,
      playerName: name,
      playerAddress: address,
      playerOrigin: origin,
      currentSequence: origin.startingSequence ?? 9,
      digestion: Math.min(70, (origin.startingSequence === 7 ? 8 : origin.startingSequence === 8 ? 18 : base.digestion) + traitEffects.digestion),
      materials: materialsFor(pathwayId, Math.max(0, (origin.startingSequence ?? 9) - 1)),
      organizationName: origin.organizationName || kind.cover,
      coverIdentity: kind.cover,
      charter: origin.organizationCharter || base.charter,
      knownAliases: [name],
      members: chosen,
      recruitPool: reserve,
      management: {
        ...base.management,
        resources,
        manpowerAllocation: { headquarters: Math.max(1, resources.manpower - 14), intelligence: 4, resources: 4, security: 6, branches: 0 },
        formulas: scenario ? [{ id: `origin-formula-${pathwayId}-9`, pathwayId, sequence: 9, name: `${PATHWAYS[pathwayId].sequences.find((item) => item.rank === 9)?.name}配方`, status: "verified", reliability: 100, sourceRefs: [`origin:${scenario.id}`], loreEvidenceIds: scenario.loreEvidenceIds }] : [],
        exposureEvidence: scenario && exposure > 0 ? [{ id: `origin-exposure-${scenario.id}`, kind: "record", summary: `${scenario.enemy}可沿“${scenario.title}”留下的来源、关系或记录追查组织。`, severity: Math.max(4, exposure), locationId: scenario.startingLocation.districtId, detectableByFactionIds: scenario.hostility.map((item) => item.factionId), createdWeek: base.week }] : [],
        exposure,
        reputation: { tier: reputationScore >= 55 ? "recognized" : reputationScore >= 10 ? "local-name" : "unknown", score: reputationScore, tags: { [origin.traits?.[0]?.name ?? "隐秘"]: Math.max(1, reputationScore) }, propagationRefs: scenario ? [`origin:${scenario.id}`] : [] },
        factionHostility: base.management.factionHostility.map((relation) => {
          const change = scenario?.hostility.find((item) => item.factionId === relation.factionId);
          return !change ? relation : { ...relation, grievance: relation.grievance + change.delta, perceivedThreat: relation.perceivedThreat + Math.ceil(change.delta / 2), hostility: Math.min(100, relation.hostility + change.delta), lastCauseRefs: [...relation.lastCauseRefs, `origin:${scenario?.id}`] };
        }),
        map: openingMap,
        offices: base.management.offices.map((office, index) => ({ ...office, incumbentId: chosen[index]?.id })),
        beyonderDevelopment: chosen.filter((member) => member.pathway && member.sequence !== undefined).map((member) => ({
          memberId: member.id,
          pathwayId: Object.entries(PATHWAYS).find(([, candidatePathway]) => candidatePathway.name === member.pathway)?.[0] ?? "seer",
          sequence: member.sequence!,
          formulaId: `opening-${member.id}-formula`,
          digestion: member.sequence === 9 ? 35 : member.sequence === 8 ? 22 : 10,
          instability: member.sequence === 7 ? 28 : member.sequence === 8 ? 18 : 10,
          supervision: 55,
          status: "digesting" as const,
          lastUpdateWeek: base.week,
          log: [`创立档案确认其序列${member.sequence}来源；后续晋升仍需知识库证据核验的新配方。`],
        })),
      },
      money: resources.money,
      instability: Math.min(100, base.instability + traitEffects.instability + (origin.startingSequence === 7 ? 12 : origin.startingSequence === 8 ? 5 : 0)),
      playerCondition: { ...base.playerCondition, pollution: Math.min(100, base.playerCondition.pollution + Math.ceil((scenario?.difficulty.pollution ?? 1) / 2) + Math.floor(traitEffects.instability / 5)) },
      organizationProfile: { ...base.organizationProfile, headquartersDistrictId: scenario?.startingLocation.districtId ?? base.organizationProfile.headquartersDistrictId },
      discoveredDistrictIds: [...new Set([...base.discoveredDistrictIds, scenario?.startingLocation.districtId ?? "cherwood"])],
      missions: base.missions.map((mission, index) => index === 0 && scenario ? { ...mission, title: scenario.firstCrisis.slice(0, 42), premise: `${scenario.summary} ${scenario.firstCrisis}`, consequence: `${scenario.enemy}与开局来源会根据你的处置继续行动。`, urgency: Math.min(92, 62 + scenario.exposure) } : mission),
      facilities: base.facilities.map((facility) => ({ ...facility, assignedMemberId: chosen.some((member) => member.id === facility.assignedMemberId) ? facility.assignedMemberId : undefined })),
      departments: base.departments.map((department) => ({ ...department, leadMemberId: department.id === "field" ? fieldLead?.id ?? chosen[0].id : supportLead?.id ?? chosen[0].id, memberIds: department.id === "field" ? chosen.filter((member) => /追踪|调查|灵体|警|路线|急救/.test(`${member.specialty}${member.role}`)).map((member) => member.id) : chosen.filter((member) => !/追踪|调查|灵体|警|路线|急救/.test(`${member.specialty}${member.role}`)).map((member) => member.id) })),
      facts: [...base.facts,
        { id: "fact:opening:player-name", subject: "组织负责人", statement: `${name}以“${address}”的称谓主持组织第一次正式密议。`, certainty: "确认" as const, source: "密议室会议记录", week: base.week },
        { id: "fact:opening:player-origin", subject: "组织负责人", statement: `公开身份为${origin.identityLabel}；关键经历是${origin.experienceLabel}${origin.experienceDetail ? `：${origin.experienceDetail}` : ""}。`, certainty: "确认" as const, source: "创立档案", week: base.week },
        { id: "fact:opening:player-persona", subject: "组织负责人", statement: `性别${origin.gender || "未公开"}，年龄${origin.age || "未公开"}。`, certainty: "确认" as const, source: "创立档案", week: base.week },
        { id: "fact:opening:organization", subject: "组织", statement: `组织定名为“${origin.organizationName || kind.cover}”，类型为${origin.organizationKindLabel}；章程：${origin.organizationCharter || base.charter}。`, certainty: "确认" as const, source: "创立档案", week: base.week },
        ...(scenario ? [
          { id: `fact:opening:origin-source:${scenario.id}`, subject: "组织负责人", statement: `非凡来源为“${scenario.title}”：${scenario.source}。可靠联系人是${scenario.contact}；主要追索者是${scenario.enemy}。`, certainty: "确认" as const, source: `创立档案·${scenario.loreEvidenceIds.join("/")}`, week: base.week },
          { id: `fact:opening:origin-crisis:${scenario.id}`, subject: "组织", statement: `第一场危机：${scenario.firstCrisis}`, certainty: "确认" as const, source: "创立档案", week: base.week },
          ...(origin.traits ?? []).map((trait) => ({ id: `fact:opening:trait:${trait.id}`, subject: "组织负责人", statement: `${trait.kind === "burden" ? "负担" : "特质"}“${trait.name}”：${trait.description} 触发条件：${trait.triggers.join("、")}。`, certainty: "确认" as const, source: "人物特质档案", week: base.week })),
        ] : []),
      ],
    };
    setGame(next);
    setHasSave(true);
    setSelectedRank(origin.startingSequence ?? 9);
    void openSituation(next);
  }

  async function saveSettings() {
    const { remembered, credentialConfigured: configured } = await saveAiSessionSettings(aiConfig, rememberApiKey, secureStorageAvailable);
    setRememberApiKey(remembered);
    setCredentialConfigured(configured);
    if (desktopInference) setAiConfig((current) => ({ ...current, apiKey: "" }));
    setConnectionVerified(false);
    setShowSettings(false);
    setToast(!rememberApiKey || remembered
      ? (aiReady ? `${aiConfig.model} 已启用` : "模型配置尚未完成，世界推演保持暂停")
      : "系统安全存储不可用；密钥仅保留到本次会话结束");
  }

  async function clearSavedKey() {
    await clearAiSessionKey(aiConfig);
    setAiConfig((current) => ({ ...current, apiKey: "" }));
    setCredentialConfigured(false);
    setRememberApiKey(false);
    setConnectionVerified(false);
    setConnectionState({ status: "idle", message: "已清除本机保存的密钥" });
    setToast("已清除保存的 API Key");
  }

  async function testConnection() {
    if (!aiReady || connectionState.status === "testing") return;
    setConnectionState({ status: "testing", message: "正在发送最小测试请求，不会消耗游戏回合" });
    try {
      const staged = await stageAiCredential(aiConfig, rememberApiKey, secureStorageAvailable);
      if (desktopInference && provider === "deepseek" && !staged.configured) throw new Error(staged.error ?? "MODEL_CREDENTIAL_UNAVAILABLE");
      if (desktopInference) {
        setCredentialConfigured(Boolean(staged.configured));
        setAiConfig((current) => ({ ...current, apiKey: "" }));
      }
      const result = await testModelConnection(desktopInference ? { ...aiConfig, apiKey: "" } : aiConfig);
      setConnectionState({ status: "success", message: `${aiConfig.model} 已回应 · ${result.latencyMs}ms` });
      setConnectionVerified(true);
    } catch (error) { setConnectionState({ status: "error", message: error instanceof Error ? error.message : "连接测试失败" }); }
  }

  function defaultAbilityContext(): AbilityContext {
    if (view === "progression") return { kind: "self", label: game.playerName || "组织负责人" };
    return { kind: "council", label: "每周密议室" };
  }

  function openAbility(context = defaultAbilityContext(), abilityId = "", prompt = "") {
    const preferred = abilities.find((item) => item.id === abilityId) ?? abilities.find((item) => !item.passive) ?? abilities[0];
    setAbilityContext(context);
    setAbilitySelectedId(!abilityId || abilityId === "free-intent" ? "free-intent" : preferred?.id ?? "free-intent");
    setAbilityAssistId("");
    setAbilitySupportIds([]);
    setAbilityIntent(prompt);
    setAbilityError("");
    setAbilityResult(null);
    setAbilityPanelOpen(true);
  }

  async function castAbility() {
    const intent = abilityIntent.trim();
    if (!intent || abilityLoading) return;
    if (!aiReady) { setAbilityError("非凡能力反馈必须由 AI 根据你的自由意图与现场状态生成；请先连接模型。"); setShowSettings(true); return; }
    setAbilityError("");
    setAbilityLoading(true);
    try {
      const coreAbility = abilitySelectedId === "free-intent" ? abilityForFreeIntent(game, intent) : abilities.find((item) => item.id === abilitySelectedId) ?? abilityForFreeIntent(game, intent);
      const supportAbilities = abilities.filter((item) => abilitySupportIds.includes(item.id) && item.id !== coreAbility.id).slice(0, 3);
      const ability: Ability = supportAbilities.length ? {
        ...coreAbility,
        id: `${coreAbility.id}+${supportAbilities.map((item) => item.id).join("+")}`,
        name: `${coreAbility.name} · ${supportAbilities.map((item) => item.name).join(" / ")}`,
        description: `${coreAbility.description} 辅助能力：${supportAbilities.map((item) => `${item.name}（${item.description}）`).join("；")}`,
        cost: coreAbility.cost + supportAbilities.reduce((sum, item) => sum + (item.passive ? 1 : item.cost), 0),
        ruleTags: [...new Set([...(coreAbility.ruleTags ?? []), ...supportAbilities.flatMap((item) => item.ruleTags ?? [])])],
        constraints: [...new Set([...(coreAbility.constraints ?? []), ...supportAbilities.flatMap((item) => item.constraints ?? [])])],
        risk: `${coreAbility.risk} 叠加${supportAbilities.length}项辅助能力会增加灵性协调负担与现场痕迹。`,
        sceneLayer: coreAbility.sceneLayer ?? supportAbilities.find((item) => item.sceneLayer)?.sceneLayer,
      } : coreAbility;
      const assistant = game.members.find((item) => item.id === abilityAssistId && item.pathway);
      const effectiveIntent = assistant ? `${intent}\n在场协同：${assistant.name}以其${assistant.pathway}途径能力提供辅助观察，但不得替负责人越过能力边界。` : intent;
      const draft = await generateAbilityDraft(aiConfig, game, ability, effectiveIntent, abilityContext);
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
      setAbilityIntent(""); setAbilitySupportIds([]);
    } catch (error) {
      setAbilityError(error instanceof Error ? error.message : "能力反馈未能稳定成形；请补充对象、手段或停止条件后再试。");
    } finally { setAbilityLoading(false); }
  }

  async function deepenAbilityScene(intent: string) {
    if (abilityLoading) return;
    if (!aiReady) { setShowSettings(true); setToast("灵界与梦境场景需要 AI 持续生成"); return; }
    setAbilityLoading(true);
    try {
      const response = await generateSceneResponse(aiConfig, game, intent);
      setGame((current) => continueAbilityScene(current, intent, response));
    } catch (error) { setToast(error instanceof Error ? error.message : "深层场景暂时失去回应"); }
    finally { setAbilityLoading(false); }
  }

  function meditate() {
    if (game.lastMeditationWeek === game.week) { setToast("本周已经进行过一次有效冥想；继续勉强入静只会增加疲劳"); return; }
    setGame((current) => ({ ...current, spirituality: Math.min(current.spiritualityMax, current.spirituality + 4), mentalLoad: Math.max(0, current.mentalLoad - 6), lastMeditationWeek: current.week }));
    setToast("短暂冥想完成：灵性恢复4点，精神负荷降低6点");
  }

  function openMemberChat(memberId: string, seed = "", context: "council" | "private" = "council") {
    window.scrollTo({ top: 0, behavior: "auto" });
    setChatMemberId(memberId); setChatContext(context); setChatInput(seed);
    setGame((current) => ensureDialogueThread(current, memberId));
  }

  async function sendChat() {
    const text = chatInput.trim();
    const member = game.members.find((item) => item.id === chatMemberId);
    if (!text || !member || chatLoading) return;
    if (!aiReady) { setShowSettings(true); setToast("自由人物对话需要先连接AI模型；游戏不会再用固定台词冒充回应"); return; }
    setGame((current) => appendPlayerDialogue(current, member.id, text, chatContext));
    setChatInput(""); setChatLoading(true);
    try {
      const result = await generateNpcDialogue(aiConfig, game, member.id, text, chatContext);
      const screeningAction = chooseDialogueScreeningAction(game, member.id, text, result.managementAction);
      let screeningError = "";
      setGame((current) => {
        const applied = applyDialogueModelResult(current, member.id, result, chatContext, screeningAction);
        screeningError = applied.screeningError;
        return applied.game;
      });
      if (screeningAction) setToast(screeningError || "候选档案已在本回合送达，可在组织账簿中决定是否提拔");
    } catch (error) { setToast(`${error instanceof Error ? error.message : "人物回应生成失败"}；没有伪造人物台词，也没有改变关系。`); }
    finally { setChatLoading(false); }
  }

  async function formDialogueDecision() {
    const member = game.members.find((item) => item.id === chatMemberId);
    const thread = game.dialogueThreads.find((item) => item.memberId === chatMemberId);
    const previous = thread?.messages.slice().reverse().find((message) => message.role === "player")?.text ?? "";
    const decisionText = chatInput.trim() || previous;
    if (!member || !decisionText || dialogueDecisionLoading) { setToast("请先说清希望形成决议的做法与目标"); return; }
    if (!aiReady) { setShowSettings(true); setToast("人物复述与自由决议必须由 AI 生成"); return; }
    setDialogueDecisionLoading(true);
    try {
      const args = { intent: decisionText, game, leaderId: "organization", districtId: selectedDistrictId, abilityIds: [] as string[] };
      const interpreted = await interpretIntentWithAi(aiConfig, args);
      const scheduled = scheduleContract(game, interpreted);
      const restatement = await generateNpcDialogue(aiConfig, game, member.id, `【正式决议】${game.playerAddress}已经按以下原意拍板：“${decisionText}”。自然地确认你理解的执行方向与不能越过的边界；保持对负责人的尊重，但不要套用固定领命句式。`, "council");
      const now = Date.now();
      setGame((current) => applyDialogueDecision(current, member.id, decisionText, Boolean(chatInput.trim()), scheduled, restatement, now));
      setChatInput("");
      setToast(`${member.name}已复述并将决议写入本周记录`);
    } catch (error) { setToast(error instanceof Error ? error.message : "这项决议暂时无法写入本周记录"); }
    finally { setDialogueDecisionLoading(false); }
  }

  const activeReaderChapter = turnChapter ?? selectedChapter;
  const readerChapterCommitted = Boolean(activeReaderChapter && game.chronicle.some((chapter) => chapter.id === activeReaderChapter.id));

  if (entry === "title") return <>
    <TitleScreen hydrated={hydrated} hasSave={hasSave} save={game} onContinue={continueSavedGame} onNewGame={startNewGame} onSettings={() => setShowSettings(true)} onExport={() => downloadSave(game)} onImport={(file) => void importSave(file)} />
    {persistenceError && <div className="inline-warning persistence-warning" role="alert"><ShieldAlert size={15} /><span>{persistenceError}</span><button onClick={() => setShowSettings(true)}>检查数据库</button></div>}
    {recoveryOptions.length > 0 && <section className="inline-warning persistence-warning recovery-options" aria-labelledby="recovery-options-title"><Archive size={15} /><span><strong id="recovery-options-title">可恢复的安全存档</strong><small>选择较早的安全节点后，当前局面才会被替换。</small></span>{recoveryOptions.map((checkpoint) => <button key={checkpoint.id} onClick={() => void restoreRecovery(checkpoint)}>恢复第{checkpoint.game.week}周</button>)}</section>}
    {showSettings && <div className="complete-sheet-backdrop title-settings-backdrop" onMouseDown={() => setShowSettings(false)}><section className="complete-sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="title-settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>本地配置</p><h2 id="title-settings-title">模型、世界推演与设定资料</h2></div><button onClick={() => setShowSettings(false)} aria-label="关闭设置"><X size={17} /></button></header><AiSettings config={aiConfig} rememberKey={rememberApiKey} secureStorageAvailable={secureStorageAvailable} credentialConfigured={credentialConfigured} connection={connectionState} turnStages={turnStages} showDiagnostics={DEV_MODE} autoDecision={autoExecuteDecision} onAutoDecision={(value) => { setAutoExecuteDecision(value); window.localStorage.setItem("mist-chronicle-auto-decision", value ? "1" : "0"); }} draftPathway={draftPathway} onChange={(patch) => { setAiConfig((current) => ({ ...current, ...patch })); setConnectionState({ status: "idle", message: "配置已改变，请重新测试" }); setConnectionVerified(false); }} onRememberKey={setRememberApiKey} onTest={() => void testConnection()} onSave={() => void saveSettings()} onClearKey={() => void clearSavedKey()} onPathway={setDraftPathway} onNewGame={startNewGame} /></section></div>}
  </>;

  if (hydrated && !game.prologueComplete) return <main className="complete-game-shell prologue-only">
    {persistenceError && <div className="inline-warning persistence-warning" role="alert"><ShieldAlert size={15} /><span>{persistenceError}</span><button onClick={() => setShowSettings(true)}>检查数据库</button></div>}
    <OpeningPrologue game={game} aiConfig={aiConfig} onBegin={completePrologue} />
  </main>;

  return <main className="complete-game-shell">
    <a className="complete-skip-link" href="#complete-content">跳到主要内容</a>
    <div className="complete-ambient" aria-hidden="true" />
    <header className="complete-topbar">
      <button className="mobile-menu-button" onClick={() => setShowMobileNav((value) => !value)} aria-label="打开导航"><Menu size={19} /></button>
      <div className="complete-brand"><div><Eye size={19} /></div><span><small>BEYONDER ORGANIZATION SIMULATION</small><strong>灰雾纪事</strong></span></div>
      <div className="complete-date"><small>第 {game.week} 周 · {game.playerAddress}</small><strong>{game.date}</strong><span>历史偏转 {game.deviation.toFixed(1)}%</span></div>
      <div className="top-resources">
        <span><UsersRound size={14} /><small>人力</small><strong>{game.management.resources.manpower}</strong></span>
        <span><CircleDollarSign size={14} /><small>金钱</small><strong>£{game.management.resources.money}</strong></span>
        <span><Sparkles size={14} /><small>非凡材料</small><strong>{game.management.resources.extraordinaryMaterials}</strong></span>
      </div>
      <button className="complete-icon-button" onClick={() => { if (generationStage) { setToast("世界推演进行中，请等待完成"); return; } setShowSettings(true); }} aria-label="游戏与AI设置"><Settings size={18} /></button>
    </header>

    <nav className={`complete-sidebar ${showMobileNav ? "open" : ""}`} aria-label="游戏主导航">
      {NAV_ITEMS.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => { if (generationStage) { setToast("世界推演进行中，请等待当前阶段完成"); return; } setView(item.id); setShowMobileNav(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Icon size={18} /><span>{item.label}</span></button>; })}
      <div className="sidebar-spacer" />
      <button onClick={() => { if (generationStage) { setToast("世界推演进行中，请等待完成"); return; } setShowSettings(true); }}><Settings size={18} /><span>设置</span></button>
    </nav>

    <section className="complete-content" id="complete-content" key={view}>
      {persistenceError && <div className="inline-warning persistence-warning" role="alert"><ShieldAlert size={15} /><span>{persistenceError}</span><button onClick={() => setShowSettings(true)}>检查数据库</button></div>}
      {game.pendingFinaleWorldTurn && <button className="offline-banner" onClick={() => void resolveFinaleStage()}><ShieldAlert size={15} /><span><strong>终局规则战报已锁定，世界回应尚未完成</strong><small>继续时会复用同一阶段、同一行动范围和已锁定结果，不会推进到下一阶段或重掷。</small></span><ChevronRight size={15} /></button>}
      {!aiReady && <button className="offline-banner" onClick={() => setShowSettings(true)}><ShieldAlert size={15} /><span><strong>世界回应已暂停</strong><small>连接人物与叙事模型后，成员才能回应自由决议，城市也才能走向下一周。</small></span><ChevronRight size={15} /></button>}
      {generationError && !contract && !turnChapter && <div className="inline-warning world-generation-warning" role="alert"><ShieldAlert size={15} /><span>{generationError}</span><button onClick={() => setShowSettings(true)}>检查模型</button></div>}

      {view === "intent" && <WeeklyCouncil key={`${game.week}:${councilDecisionSignal}`} game={game} intentText={intentText} selectedDistrictId={selectedDistrictId} contractLoading={contractLoading} generationStage={generationStage} decisionSignal={councilDecisionSignal} latestChapter={latestChapter} onIntentText={setIntentText} onDistrict={setSelectedDistrictId} onPrepare={() => void prepareContract()} onRemoveAction={removeAction} onEndWeek={() => void endWeek()} onQuestionMember={(memberId, seed) => openMemberChat(memberId, seed, "council")} onOpenOrganization={() => { window.scrollTo({ top: 0, behavior: "auto" }); setShowOrganizationLedger(true); }} onReadChapter={setSelectedChapter} onUseSuggestion={(text, districtId) => { applySuggestion(text, districtId); }} onView={setView} onUseAbility={(context, prompt) => openAbility(context, "free-intent", prompt)} onStartDiscussion={startCouncilDiscussion} onSummarizeTopic={summarizeCouncilTopic} onPinTopic={pinCouncilTopic} onFormDecision={(topicId) => void formDecisionFromDiscussion(topicId)} decisionLoading={decisionLoading} />}


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
            {(() => { const sequence = pathway.sequences.find((item) => item.rank === selectedRank)!; const sequenceAbilities = abilitiesFor(pathway.id, sequence.rank).filter((ability) => ability.unlockRank === sequence.rank); return <>
              <article className="sequence-hero complete-card"><p>序列 {sequence.rank}</p><h2>{sequence.name}</h2><span>{sequence.acting}</span><div>{sequence.capabilities.map((capability) => <p key={capability}><Zap size={14} />{capability}</p>)}</div></article>
              <article className="ability-manual complete-card"><header className="section-heading"><span><BookOpen size={15} /><strong>能力规则预览</strong></span><small>序列{sequence.rank}新增 · 规则边界先于AI叙事</small></header><div>{sequenceAbilities.map((ability) => <article key={ability.id}><header><span>{ability.name}</span><b>{ability.authorityTier ?? (ability.passive ? "被动" : `${ability.cost} 灵性`)}</b></header><strong>{ability.verb}</strong><p>{ability.description}</p>{ability.authorityTier && <><small>权柄前提：{ability.requirements?.join("；")}</small><small>现实后果：{ability.consequences?.join("；")}</small></>}<footer><ShieldAlert size={12} />{ability.risk}</footer></article>)}</div></article>
              {selectedRank === game.currentSequence && <article className="ability-manual complete-card"><header className="section-heading"><span><BookOpen size={15} /><strong>当前能力手册</strong></span><small>能力是自由指令中的具体动词</small></header><div>{abilities.map((ability) => <article key={ability.id}><header><span>{ability.name}</span><b>{ability.passive ? "被动" : `${ability.cost} 灵性`}</b></header><strong>{ability.verb}</strong><p>{ability.description}</p><footer><ShieldAlert size={12} />{ability.risk}</footer></article>)}</div></article>}
            </>; })()}
          </section>
          <aside className="advancement-panel complete-card">
            <header><FlaskConical size={16} /><span><small>下一序列</small><strong>{nextSequence ? `序列${nextSequence.rank} · ${nextSequence.name}` : "序列顶点"}</strong></span></header>
            {nextSequence ? <>
              <div className="advancement-meter"><div><span>魔药消化</span><strong>{game.digestion}%</strong></div><span><i style={{ width: `${game.digestion}%` }} /></span><p>{currentSequence.acting}</p></div>
              <details className="acting-principles" open><summary>扮演原则与真实经历</summary><div>{actingPrinciplesFor(game).map((principle) => <article key={principle}><strong>{principle}</strong><small>{game.actingMarks.filter((mark) => mark.sequence === game.currentSequence && mark.principle === principle).reduce((sum, mark) => sum + mark.gain, 0)} 点理解</small></article>)}</div>{game.actingMarks.filter((mark) => mark.sequence === game.currentSequence).slice(-3).reverse().map((mark) => <p key={mark.id}><b>第{mark.week}周 +{mark.gain}</b>{mark.evidence}{mark.repeated ? " · 相似经历收益递减" : ""}</p>)}</details>
              <div className="advancement-meter"><div><span>配方知识</span><strong>{game.formulaKnowledge}%</strong></div><span><i style={{ width: `${game.formulaKnowledge}%` }} /></span><p>{game.formulaKnowledge >= 100 ? "完整配方已核验，材料清单可以用于行动契约。" : "需要研究、交易或从其他势力获取更多配方知识。"}</p></div>
               <div className="advancement-meter"><div><span>仪式准备</span><strong>{game.ritualReadiness}%</strong></div><span><i style={{ width: `${game.ritualReadiness}%` }} /></span><p>{ADVANCEMENT_RITUALS[game.pathwayId]?.[nextSequence.rank] ?? "仪式条件尚未由知识库证据确认。必须先获取并验证，系统不会自动编造。"}</p><button className="ritual-plan" onClick={() => applySuggestion(`为晋升序列${nextSequence.rank}·${nextSequence.name}核验并准备仪式：${ADVANCEMENT_RITUALS[game.pathwayId]?.[nextSequence.rank] ?? "先从可靠来源取得仪式条件并完成知识库核验"}。先拆分条件、验证安全措施，不在条件不足时服食魔药。`, "cherwood")}>把仪式写入自由行动</button></div>
              <div className={`instability-strip ${game.instability >= 55 ? "danger" : ""}`}><span>失控风险</span><strong>{game.instability}/100</strong><small>{game.instability >= 70 ? "当前禁止晋升：先处理污染、锚点或精神状态。" : "晋升和高位能力会提高风险，休整与成员关系可提供锚点。"}</small></div>
              <div className="material-list"><header><span>晋升材料</span><small>{game.materials.filter((item) => item.obtained).length}/{game.materials.length}</small></header>{game.materials.map((material) => <button key={material.id} onClick={() => !material.obtained && applySuggestion(`寻找并取得${material.known ? material.name : `序列${nextSequence.rank}配方中缺失的${material.kind}`}。必须记录来源、真伪、纯度、鲜度、污染和追踪风险；不接受来源不明的替代品。`, material.source.includes("码头") ? "dock" : material.source.includes("北区") || material.source.includes("大学") ? "north" : "bridge")}><span className={material.obtained ? "done" : material.known ? "known" : "unknown"}>{material.obtained ? <Check size={13} /> : material.known ? <Search size={13} /> : <LockKeyhole size={13} />}</span><div><strong>{material.known ? material.name : "尚未确认的材料"}</strong><small>{material.kind} · {material.obtained ? `${material.authenticity} · 纯度${material.purity} · 鲜度${material.freshness} · 污染${material.contamination}` : material.source}</small>{material.obtained && <small>{material.storage} · 追踪风险{material.traceRisk} · {material.provenance}</small>}</div><ChevronRight size={13} /></button>)}</div>
              {game.advancementProcess && <details className="advancement-process" open><summary>晋升档案 · {game.advancementProcess.stage}</summary><div className="advancement-stages">{["配方核验", "魔药调制", "仪式执行", "精神稳定", "可以晋升"].map((stage) => <span key={stage} className={stage === game.advancementProcess?.stage ? "current" : ""}>{stage}</span>)}</div>{game.advancementProcess.log.slice().reverse().map((entry) => <p key={entry}>{entry}</p>)}{game.advancementProcess.flaws.map((flaw) => <p className="flaw" key={flaw}>疑点：{flaw}</p>)}</details>}
              <button className="complete-primary advance-button" onClick={attemptAdvance} disabled={!game.advancementProcess && game.digestion < 100}>{canAdvance(game) ? <><Sparkles size={16} />服食魔药并举行最终晋升</> : game.advancementProcess ? `推进：${game.advancementProcess.stage}` : game.digestion >= 100 ? "建立晋升档案" : "继续消化当前魔药"}</button>
            </> : <p className="sequence-apex">你已经抵达这条途径的序列顶点。此后的问题不再是材料，而是锚点、权柄与世界的回应。</p>}
          </aside>
        </div>
      </div>}

      {view === "ending" && <div className="ending-page page-enter">
        <header className="ending-hero"><CloudFog size={28} /><p>本局结算</p><h1>{game.ending.title ?? "终局尚未完成"}</h1><span>{game.ending.route ? `你的选择：${game.ending.route}` : "负责人的故事在这里停止。"}</span></header>
        {game.ending.epilogue && <article className="ending-prose complete-card">{game.ending.epilogue.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</article>}
        {game.ending.grades && <section className="ending-grades">{Object.entries({ organization: "组织存续", members: "成员命运", advancement: "非凡晋升", relations: "势力关系", history: "历史偏转" }).map(([key, label]) => <article className="complete-card" key={key}><small>{label}</small><strong>{game.ending.grades![key as keyof typeof game.ending.grades]}</strong></article>)}</section>}
        {!game.playerCondition.alive && game.members.some((member) => member.status !== "阵亡" && member.pathway) && <section className="succession-choice complete-card"><header><GitBranch size={16} /><div><strong>组织仍可能继续</strong><small>选择一名存活的非凡者成为新玩家角色，或让本局在此结束。</small></div></header><div>{game.members.filter((member) => member.status !== "阵亡" && member.pathway).map((member) => <button key={member.id} onClick={() => chooseSuccessor(member.id)}><strong>{member.name}</strong><span>序列{member.sequence} · {member.pathway}</span><small>{member.specialty}</small></button>)}</div></section>}
        <div className="ending-actions"><button onClick={() => setView("archive")}><BookOpen size={15} />重读整局纪事</button>{!game.playerCondition.alive && <button onClick={() => void startNewGame()}><Sparkles size={15} />放弃继任，重新开始</button>}{game.ending.sandboxUnlocked && game.ending.phase !== "sandbox" && <button className="complete-primary" onClick={() => { setGame((current) => enterSandbox(current)); setView("intent"); }}><GitBranch size={15} />进入无限沙盒</button>}{game.ending.phase === "sandbox" && <button className="complete-primary" onClick={() => setView("intent")}><Command size={15} />继续书写偏转世界</button>}</div>
      </div>}

      {view === "archive" && <div className="archive-page page-enter">
        <header className="page-title"><p>不可回头的历史</p><h1>事实、资产与正式纪事</h1><span>每周纪事都会永久保存在这里。你可以重读，但不能让后来的叙述改写已经发生的事实。</span></header>
        <div className="archive-grid"><section className="chronicle-index complete-card"><header className="section-heading"><span><BookOpen size={15} /><strong>每周小说纪事</strong></span><small>{game.chronicle.length}章 · 可反复阅读</small></header>{game.chronicle.length ? game.chronicle.map((chapter, index) => <button key={chapter.id} className={index === 0 ? "latest" : ""} onClick={() => setSelectedChapter(chapter)} aria-label={`重读第${chapter.week}周：${chapter.title}`}><span>W{String(chapter.week).padStart(2, "0")}</span><div><strong>{chapter.title}</strong><small>{chapter.date} · {chapter.source === "ai" ? "文学模式" : "本地事实版"}</small></div><b>{index === 0 ? "最新" : "重读"}</b><ChevronRight size={14} /></button>) : <div className="empty-state"><BookOpen size={24} /><p>结束第一周后，每周小说总结都会永久保存到这里。</p></div>}</section><section className="fact-ledger complete-card"><header className="section-heading"><span><FileKey size={15} /><strong>世界事实</strong></span><small>{game.facts.length}条</small></header>{game.facts.slice().reverse().map((fact) => <article key={fact.id}><b className={fact.certainty}>{fact.certainty}</b><div><strong>{fact.subject}</strong><p>{fact.statement}</p><small>{fact.source} · 第{fact.week}周</small></div></article>)}</section></div>
      </div>}
    </section>

    {DEV_MODE && streamPreview && <div className="reader-stream-overlay" role="status" aria-live="polite"><div><Sparkles size={14} />模型正在生成，完成后自动排版</div><pre>{streamPreview}</pre></div>}

    {(game.ending.phase === "major-event" || game.ending.phase === "finale" || game.pendingFinaleWorldTurn) && <GreatSmogFinale game={game} busy={Boolean(generationStage)} locked={Boolean(game.pendingFinaleWorldTurn)} onDoctrine={(doctrine) => setGame((current) => current.pendingFinaleWorldTurn ? current : chooseFinaleDoctrine(current, doctrine))} onAssign={(crisisId, kind, id) => setGame((current) => current.pendingFinaleWorldTurn ? current : assignFinaleResource(current, crisisId, kind, id))} onAutoDeploy={() => setGame((current) => current.pendingFinaleWorldTurn ? current : autoDeployFinale(current))} onResolve={() => void resolveFinaleStage()} />}

    {game.fatalSituation && <div className="complete-sheet-backdrop fatal-backdrop"><section className="fatal-sheet" role="alertdialog" aria-modal="true" aria-labelledby="fatal-title"><header><ShieldAlert size={24} /><small>明确的高危局面</small><h2 id="fatal-title">{game.fatalSituation.title}</h2><p>{game.fatalSituation.threat}</p></header><div className="known-threats"><strong>目前已知</strong>{game.fatalSituation.knownThreats.map((threat) => <p key={threat}>{threat}</p>)}</div><div className="fatal-choices"><button onClick={() => chooseFatal("retreat")}><strong>立即撤退</strong><span>安全阈值 {game.fatalSituation.odds.retreat}%</span><small>放弃现场成果，优先保命。</small></button><button onClick={() => chooseFatal("help")}><strong>请求支援</strong><span>安全阈值 {game.fatalSituation.odds.help}%</span><small>消耗关系并暴露部分情报。</small></button><button className="continue" onClick={() => chooseFatal("continue")}><strong>继续深入</strong><span>安全阈值 {game.fatalSituation.odds.continue}%</span><small>可能获得更多成果；失败可导致死亡并结束本局。</small></button></div><footer>死亡只会在你选择后由最终检定产生；叙事模型无权越过这一步。</footer></section></div>}

    {contract && <div className="complete-sheet-backdrop" onMouseDown={() => setContract(null)}><section className="complete-sheet contract-sheet" role="dialog" aria-modal="true" aria-labelledby="contract-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>负责人对首领指令的复述</p><h2 id="contract-title">{contract.title}</h2></div><button onClick={() => setContract(null)} aria-label="关闭"><X size={17} /></button></header>{generationError && <div className="inline-warning"><ShieldAlert size={14} />{generationError}</div>}<div className="contract-summary"><span className={`risk-chip ${riskClass(contract.risk)}`}>{contract.risk}风险</span><span><UsersRound size={12} />{contract.executionMode === "player-led" || contract.leaderId === "player" ? "你亲自介入" : `委派给${game.members.find((member) => member.id === contract.leaderId)?.name ?? "组织负责人"}`}</span><span><MapPin size={12} />{DISTRICTS.find((district) => district.id === contract.districtId)?.name}</span><span><CircleDollarSign size={12} />{resourceCommitmentLabel(contract)}</span><span><ShieldAlert size={12} />{authorizationLabel(contract)}</span></div><div className="contract-fields">{editableContractField(contract, setContract, "desiredOutcome", "要改变的结果", true)}{editableContractField(contract, setContract, "approach", "执行方向与投入尺度", true)}{editableContractField(contract, setContract, "unknowns", "必须先核验的未知")}{editableContractField(contract, setContract, "redLines", "授权边界与禁止事项")}{editableContractField(contract, setContract, "retreat", "必须中止或重新请示的条件", true)}</div><footer><button className="complete-secondary" onClick={() => setContract(null)}><ArrowLeft size={14} />返回议桌修改</button><button className="complete-primary" onClick={confirmContract}><span>确认授权，写入本轮指令</span><Gavel size={16} /></button></footer></section></div>}


    {activeReaderChapter && <div className="complete-reader-backdrop" onMouseDown={() => { if (!generationStage) { setTurnChapter(null); setSelectedChapter(null); } }}><section className="complete-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title" onMouseDown={(event) => event.stopPropagation()}><header className="reader-commandbar"><div><small>第 {activeReaderChapter.week} 周 · {activeReaderChapter.date}</small><span>{activeReaderChapter.source === "ai" ? "文学模式" : readerChapterCommitted ? "世界事实已保存 · 待补写文学章节" : "本周尚未结算 · 可原样重试"}</span></div><div><button onClick={() => setReaderScale((value) => Math.max(.9, value - .1))}>A−</button><button onClick={() => setReaderScale(1)}>A</button><button onClick={() => setReaderScale((value) => Math.min(1.25, value + .1))}>A＋</button><button onClick={() => { if (!generationStage) { setTurnChapter(null); setSelectedChapter(null); } }}><X size={16} /></button></div></header>{generationStage && <div className="reader-generation"><Sparkles size={15} /><span><strong>{activeReaderChapter.source === "ai" ? "文学章节正在校订" : "世界事实正在安全结算"}</strong><small>{generationStage}；完成的阶段不会因后续失败而重复。</small></span><i /><i /><i /></div>}{generationError && <div className="inline-warning reader-warning"><ShieldAlert size={14} />{generationError}</div>}<article className="reader-page" style={{ "--reader-scale": readerScale } as React.CSSProperties}><div className="folio"><span>灰雾纪事</span><i /><span>W{String(activeReaderChapter.week).padStart(2, "0")}</span></div><h1 id="reader-title">{activeReaderChapter.title}</h1>{activeReaderChapter.sections.map((section, index) => <section key={`${section.heading}-${index}`}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>)}</section>)}<div className="reader-end"><CloudFog size={18} /><span>本章完</span></div></article>{activeReaderChapter.results.length > 0 && <details className="reader-appendix"><summary><span><ListTodo size={15} />行动、证据与规则附录</span><small>{activeReaderChapter.summary}</small></summary><div>{activeReaderChapter.results.map((result) => <article key={result.id}><header><strong>{result.title}</strong><b className={result.outcome}>{result.outcome}</b></header><p>{result.contract.rawIntent}</p><ul>{result.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul><footer><span>消化 +{result.digestionGain}</span><span>任务推进 +{result.missionProgress}%</span><span>资金 {result.resourceChanges.money}</span></footer></article>)}</div></details>}<footer className="reader-actions"><button onClick={() => { if (generationStage) return; setTurnChapter(null); setSelectedChapter(null); setView("archive"); }} disabled={Boolean(generationStage)}><Archive size={14} />进入纪事档案</button>{readerChapterCommitted && aiReady && <button className="reader-retry-literary" onClick={() => void retryLiteraryChapter(activeReaderChapter)} disabled={Boolean(generationStage)}><Sparkles size={14} />{activeReaderChapter.source === "ai" ? "安全重写文学章节" : "只补写文学章节"}</button>}<button className="complete-primary compact" onClick={() => { setTurnChapter(null); setSelectedChapter(null); }} disabled={Boolean(generationStage)}>{game.ending.phase === "finale" ? "返回终局作战桌" : game.ending.phase === "ended" ? "查看最终结局" : `继续第 ${game.week} 周`} <ArrowRight size={15} /></button></footer></section></div>}

    {showSettings && <div className="complete-sheet-backdrop" onMouseDown={() => setShowSettings(false)}><section className="complete-sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header><div><p>本机配置</p><h2 id="settings-title">AI推演与新游戏</h2></div><button onClick={() => setShowSettings(false)} aria-label="关闭设置"><X size={17} /></button></header><AiSettings config={aiConfig} rememberKey={rememberApiKey} secureStorageAvailable={secureStorageAvailable} credentialConfigured={credentialConfigured} connection={connectionState} turnStages={turnStages} showDiagnostics={DEV_MODE} autoDecision={autoExecuteDecision} onAutoDecision={(value) => { setAutoExecuteDecision(value); window.localStorage.setItem("mist-chronicle-auto-decision", value ? "1" : "0"); }} draftPathway={draftPathway} onChange={(patch) => { setAiConfig((current) => ({ ...current, ...patch })); setConnectionState({ status: "idle", message: "配置已改变，请重新测试" }); setConnectionVerified(false); }} onRememberKey={setRememberApiKey} onTest={() => void testConnection()} onSave={() => void saveSettings()} onClearKey={() => void clearSavedKey()} onPathway={setDraftPathway} onNewGame={startNewGame} /></section></div>}

    {showOrganizationLedger && <div className="organization-ledger-backdrop" onMouseDown={() => setShowOrganizationLedger(false)}><div className="organization-ledger-modal" role="dialog" aria-modal="true" aria-label="组织经营账簿" onMouseDown={(event) => event.stopPropagation()}><OrganizationManagementConsole game={game} onChange={applyManagementChange} onAttentionChange={applyAttentionChange} onPromote={promoteOrganizationCandidate} onAdvanceMember={advanceOrganizationMember} onPropose={(intent, districtId) => applySuggestion(intent, districtId ?? selectedDistrictId)} onTalk={(memberId, seed) => { setShowOrganizationLedger(false); openMemberChat(memberId, seed, "council"); }} onClose={() => setShowOrganizationLedger(false)} /></div></div>}

    {chatMemberId && (() => {
      const member = game.members.find((item) => item.id === chatMemberId)!;
      const thread = game.dialogueThreads.find((item) => item.memberId === chatMemberId);
      const hasDecisionText = Boolean(chatInput.trim() || thread?.messages.some((message) => message.role === "player"));
      return <div className="complete-sheet-backdrop council-dialogue-backdrop" onMouseDown={() => setChatMemberId(null)}>
        <section className="complete-sheet character-sheet living-dialogue" role="dialog" aria-modal="true" aria-labelledby="character-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="sheet-grabber" />
          <header><div><p>{chatContext === "council" ? "议桌发言" : "私下谈话"} · {member.role}</p><h2 id="character-title">{member.name}</h2><span>当前态度：{thread?.lastMood ?? "审慎"} · 信任 {member.trust ?? member.loyalty} · 疲劳 {member.fatigue}</span></div><button onClick={() => setChatMemberId(null)} aria-label="结束点名"><X size={17} /></button></header>
          <details className="character-dossier"><summary>查看人物档案与长期关系记忆</summary><div className="character-core"><div><small>背景</small><p>{member.background}</p></div><div><small>性格核心</small><p>{member.core}</p></div><div><small>成长矛盾</small><p>{member.arc}</p></div></div>{thread?.memories.length ? <ul>{thread.memories.map((memory) => <li key={memory}>{memory}</li>)}</ul> : <p>还没有形成值得长期记住的关系事实。</p>}</details>
          <aside className="dialogue-compact-hint"><MessageSquareText size={13} /><span>直接交谈，不消耗行动；成员会依据职责、关系与已知事实回应，也可能保留意见或请求澄清。</span></aside>
          <div className="character-dialogue" ref={chatMessagesRef} aria-live="polite">{thread?.messages.map((message) => <p key={message.id} className={message.role}><strong>{message.role === "player" ? game.playerAddress : message.role === "ability" ? "非凡感知" : member.name}</strong><span>{message.text}</span>{message.mood && <small>{message.mood}</small>}</p>)}{chatLoading && <p className="member pending"><strong>{member.name}</strong><span>油灯安静地烧着。他正在斟酌怎样准确而恭敬地回应……</span></p>}</div>
          <div className="dialogue-ability-strip"><span><WandSparkles size={13} />能力与仪式标签 · 点击加入自由命令</span>{abilities.slice(0, 5).map((ability) => <button key={ability.id} onClick={() => setChatInput((current) => `${current}${current.trim() ? "；" : ""}使用${ability.name}：`)} title={ability.description}><Eye size={12} />{ability.name}</button>)}</div>
          <label className="chat-input"><span>直接说任何话。Enter发送，Shift+Enter换行；你也可以把输入框中的最终说法直接形成决议。</span><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder={`向${member.name}询问、解释或写下你希望他复述的最终决议……`} maxLength={1200} /><button className="complete-secondary" onClick={() => void sendChat()} disabled={!chatInput.trim() || chatLoading}><Send size={15} />继续交谈</button></label>
          <footer className="dialogue-decision-bar"><span><Gavel size={14} /><b>领导决议</b><small>按你的原话写入本周计划，并由{member.name}尊敬地复述确认。</small></span><button className="complete-primary" onClick={() => void formDialogueDecision()} disabled={!hasDecisionText || dialogueDecisionLoading || chatLoading}>{dialogueDecisionLoading ? "正在整理并复述" : "按我的方式形成决议"}</button></footer>
        </section>
      </div>;
    })()}

    {game.activeParticipationScene && <ParticipationSceneOverlay scene={game.activeParticipationScene} loading={participationLoading} error={participationError} onDecision={(intent) => void continueParticipationScene(intent)} onResume={() => void resumeAfterParticipation()} />}

    <AbilityConsole game={game} abilities={abilities} open={abilityPanelOpen} context={abilityContext} selectedId={abilitySelectedId} supportIds={abilitySupportIds} assistId={abilityAssistId} intent={abilityIntent} loading={abilityLoading} error={abilityError} result={abilityResult} onOpen={() => openAbility()} onClose={() => { setAbilityPanelOpen(false); setAbilityResult(null); setAbilityError(""); setAbilitySupportIds([]); }} onSelect={(id) => { setAbilitySelectedId(id); setAbilitySupportIds([]); setAbilityError(""); }} onToggleSupport={(id) => setAbilitySupportIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current)} onAssist={setAbilityAssistId} onIntent={(value) => { setAbilityIntent(value); if (abilityError) setAbilityError(""); }} onUse={() => void castAbility()} onContinueScene={(intent) => void deepenAbilityScene(intent)} onExitScene={() => setGame((current) => ({ ...current, activeAbilityScene: null }))} />

    {situationBrief && game.prologueComplete && <SituationOpening brief={situationBrief} loading={situationLoading} onEnter={() => { situationDismissed.current = true; setSituationBrief(null); }} />}

    {toast && <div className="complete-toast"><CheckCircle2 size={15} />{toast}</div>}
  </main>;
}
