import type { GameState, ScheduledAction } from "./game-model.ts";
import { startCandidateScreening } from "./organization-management.ts";
import { stableEntityId } from "./stable-id.ts";

export type DialogueContext = "council" | "private";

export type DialogueModelResult = {
  reply: string;
  mood: string;
  memory: string | null;
  trustDelta: number;
  managementAction: null | { kind: "screen-candidates"; manpower: number; moneyCost: number };
};

export type ScreeningAction = NonNullable<DialogueModelResult["managementAction"]>;

function asksForCandidateScreening(text: string) {
  return /(筛选|挑选|物色|举荐|推荐|提交|给我).{0,12}(候选|人选|基层|普通人)|(?:候选|人选).{0,12}(筛选|名单|档案|提拔)/.test(text);
}

export function ensureDialogueThread(game: GameState, memberId: string): GameState {
  if (game.dialogueThreads.some((item) => item.memberId === memberId)) return game;
  return { ...game, dialogueThreads: [...game.dialogueThreads, { memberId, messages: [], memories: [], lastMood: "等待发言", lastUpdatedWeek: game.week }] };
}

export function appendPlayerDialogue(game: GameState, memberId: string, text: string, context: DialogueContext): GameState {
  return {
    ...game,
    dialogueThreads: game.dialogueThreads.map((thread) => thread.memberId === memberId ? {
      ...thread,
      messages: [...thread.messages, {
        id: stableEntityId("dialogue-message", game.week, memberId, thread.messages.length + 1, "player", text),
        role: "player" as const,
        text,
        week: game.week,
        context,
      }],
      lastUpdatedWeek: game.week,
    } : thread),
  };
}

export function chooseDialogueScreeningAction(game: GameState, memberId: string, text: string, modelAction: DialogueModelResult["managementAction"]): ScreeningAction | null {
  if (modelAction) return modelAction;
  const isInternalAffairs = game.management.offices.some((office) => office.id === "internal-affairs" && (office.incumbentId === memberId || office.actingMemberId === memberId));
  if (!isInternalAffairs || !asksForCandidateScreening(text)) return null;
  return {
    kind: "screen-candidates",
    manpower: game.management.manpowerAllocation.headquarters >= 5 ? 5 : 3,
    moneyCost: game.management.resources.money >= 45 ? 45 : 20,
  };
}

export function applyDialogueModelResult(game: GameState, memberId: string, result: DialogueModelResult, context: DialogueContext, screeningAction: ScreeningAction | null) {
  let management = game.management;
  let dossierMessage = "";
  let screeningError = "";
  if (screeningAction) {
    try {
      const previousCandidateIds = new Set(management.candidates.map((candidate) => candidate.id));
      management = startCandidateScreening(management, { week: game.week, manpower: screeningAction.manpower, moneyCost: screeningAction.moneyCost });
      const submitted = management.candidates.filter((candidate) => !previousCandidateIds.has(candidate.id));
      dossierMessage = submitted.length
        ? `内务档案已当场送达：${submitted.map((candidate) => `${candidate.name}（${candidate.background}，${candidate.aptitude}）`).join("；")}。本次核验调用${screeningAction.manpower}名本部人力并支出£${screeningAction.moneyCost}，是否提拔仍由你决定。`
        : "内务档案没有产生新的可用人选。";
    } catch (error) {
      screeningError = error instanceof Error ? error.message : "候选档案未能完成核验";
      dossierMessage = `内务执行未能入账：${screeningError}`;
    }
  }
  return {
    screeningError,
    game: {
      ...game,
      management,
      money: management.resources.money,
      members: game.members.map((item) => item.id === memberId ? { ...item, trust: Math.max(0, Math.min(100, (item.trust ?? item.loyalty) + result.trustDelta)) } : item),
      dialogueThreads: game.dialogueThreads.map((thread) => thread.memberId === memberId ? {
        ...thread,
        messages: [
          ...thread.messages,
          { id: stableEntityId("dialogue-message", game.week, memberId, thread.messages.length + 1, "member", result.reply), role: "member" as const, text: result.reply, week: game.week, context, mood: result.mood },
          ...(dossierMessage ? [{ id: stableEntityId("dialogue-message", game.week, memberId, thread.messages.length + 2, "dossier", dossierMessage), role: "member" as const, text: dossierMessage, week: game.week, context, mood: screeningError ? "执行受阻" : "档案已呈交" }] : []),
        ],
        memories: result.memory && !thread.memories.includes(result.memory) ? [...thread.memories, result.memory].slice(-8) : thread.memories,
        lastMood: result.mood,
        lastUpdatedWeek: game.week,
      } : thread),
    },
  };
}

export function applyDialogueDecision(game: GameState, memberId: string, decisionText: string, includePlayerMessage: boolean, scheduled: ScheduledAction, restatement: DialogueModelResult, now: number): GameState {
  return {
    ...game,
    schedule: [...game.schedule.map((item) => scheduled.focus ? { ...item, focus: false } : item), scheduled],
    councilRecords: game.councilRecords.map((record) => record.week === game.week ? { ...record, decisions: [...record.decisions, { id: `decision-${scheduled.id}`, title: scheduled.title, rawIntent: scheduled.rawIntent, proposerId: "player", status: "scheduled" }] } : record),
    members: game.members.map((item) => item.id === memberId ? { ...item, trust: Math.min(100, (item.trust ?? item.loyalty) + restatement.trustDelta) } : item),
    dialogueThreads: game.dialogueThreads.map((item) => item.memberId === memberId ? {
      ...item,
      messages: [
        ...item.messages,
        ...(includePlayerMessage ? [{ id: `dialogue-${now}-decision`, role: "player" as const, text: decisionText, week: game.week, context: "council" as const }] : []),
        { id: `dialogue-${now}-restate`, role: "member" as const, text: restatement.reply, week: game.week, context: "council" as const, mood: restatement.mood },
      ],
      memories: restatement.memory && !item.memories.includes(restatement.memory) ? [...item.memories, restatement.memory].slice(-8) : item.memories,
      lastMood: restatement.mood,
      lastUpdatedWeek: game.week,
    } : item),
  };
}
