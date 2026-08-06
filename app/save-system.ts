import type { GameState } from "./game-model.ts";

export const ACTIVE_SAVE_KEY = "mist-chronicle-complete-v15";
export const RECOVERY_KEY = "mist-chronicle-recovery-v15";
export const SAVE_SCHEMA_VERSION = 15;

export type SaveEnvelope = {
  format: "mist-chronicle-save";
  schemaVersion: 15;
  exportedAt: string;
  loreVersion: string;
  knowledgePermission: { unlockedRecords: number; highestSequence: number };
  checksum: string;
  game: GameState;
};

export type RecoveryCheckpoint = {
  id: string;
  reason: "week" | "import" | "history-branch" | "finale" | "sequence";
  createdAt: string;
  game: GameState;
};

const DEFAULT_HORIZON = {
  work: "LOTM" as const,
  maxVolume: 1,
  maxAbsoluteChapter: 195,
  allowedEventIds: [],
  revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
  worldlineMode: "canon-aligned" as const,
};

// 旧存档迁移：没有知识边界时补上保守默认（第一卷边界，不自动获得全书知识）。
export function ensureKnowledgeHorizon(game: {
  worldKernel?: { canon?: Record<string, unknown> | null };
}): void {
  const canon = game.worldKernel?.canon;
  if (!canon || !canon.knowledgeHorizon) {
    const nextCanon = {
      ...(canon ?? { mode: "anchored", deviation: 0, pivotEventIds: [] }),
      knowledgeHorizon: { ...DEFAULT_HORIZON },
    };
    if (game.worldKernel) {
      (game.worldKernel as { canon: unknown }).canon = nextCanon;
    }
  }
}

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createSaveEnvelope(game: GameState): SaveEnvelope {
  const payload = JSON.stringify(game);
  return {
    format: "mist-chronicle-save",
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    loreVersion: "LOTM_Worldbuilding_Compendium_2026-08-02",
    knowledgePermission: { unlockedRecords: game.facts.length + game.evidenceNodes.filter((item) => item.discovered).length, highestSequence: game.currentSequence },
    checksum: stableHash(payload),
    game,
  };
}

export function parseSaveEnvelope(raw: string) {
  const value = JSON.parse(raw) as Partial<SaveEnvelope>;
  if (value.format !== "mist-chronicle-save" || value.schemaVersion !== SAVE_SCHEMA_VERSION || !value.game) throw new Error("这不是当前版本的《灰雾纪事》存档文件");
  if (stableHash(JSON.stringify(value.game)) !== value.checksum) throw new Error("存档校验失败：文件不完整或被修改");
  if (!value.game.prologueComplete || !value.game.worldKernel || !Array.isArray(value.game.chronicle)) throw new Error("存档缺少世界状态或开局记录，未覆盖当前游戏");
  ensureKnowledgeHorizon(value.game);
  return value as SaveEnvelope;
}

export function savePreview(envelope: SaveEnvelope) {
  return {
    organization: envelope.game.organizationName,
    leader: envelope.game.playerName,
    week: envelope.game.week,
    date: envelope.game.date,
    pathway: envelope.game.pathwayId,
    sequence: envelope.game.currentSequence,
    chapters: envelope.game.chronicle.length,
    exportedAt: envelope.exportedAt,
  };
}

export function downloadSave(game: GameState, prefix = "灰雾纪事") {
  const envelope = createSaveEnvelope(game);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${prefix}-第${game.week}周-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createRecoveryCheckpoint(game: GameState, reason: RecoveryCheckpoint["reason"]) {
  const current = readRecoveryCheckpoints();
  const checkpoint: RecoveryCheckpoint = { id: `recovery-${Date.now()}`, reason, createdAt: new Date().toISOString(), game };
  window.localStorage.setItem(RECOVERY_KEY, JSON.stringify([checkpoint, ...current].slice(0, 3)));
}

export function readRecoveryCheckpoints(): RecoveryCheckpoint[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECOVERY_KEY) ?? "[]") as RecoveryCheckpoint[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.game?.worldKernel).slice(0, 3) : [];
  } catch {
    return [];
  }
}
