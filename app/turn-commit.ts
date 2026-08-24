import type { GameState } from "./game-model.ts";
import { applyWorldTurn, createWorldTurnTransaction, type WorldKernel, type WorldTurnDelta } from "./world-kernel.ts";
import { tryRecordRuntimeTrace } from "./runtime-trace.ts";

export type TurnCommitContext = {
  /** Detached state. Derivations may mutate it locally without touching the caller. */
  baseGame: GameState;
  /** The only WorldKernel instance that may be returned by this commit. */
  worldKernel: WorldKernel;
};

export type TurnCommitRequest = {
  baseGame: GameState;
  delta: WorldTurnDelta;
  turnId: string;
  deriveNextGame: (context: TurnCommitContext) => GameState | Promise<GameState>;
};

/**
 * The single atomic boundary for a model-driven world turn.
 *
 * The caller can normalize and validate model output before entering this
 * function, but every authoritative GameState write must be derived inside the
 * callback from the detached base and the kernel committed here. A rejected
 * kernel delta or a late sidecar failure therefore leaves the caller's state
 * untouched.
 */
export async function commitWorldTurn(request: TurnCommitRequest): Promise<GameState> {
  const startedAt = Date.now();
  const isolatedBase = structuredClone(request.baseGame);
  const transaction = createWorldTurnTransaction(isolatedBase.worldKernel, request.delta, request.turnId);
  const trace = (outcome: "PASS" | "FAILED", commitStatus: "PENDING" | "REJECTED", rejectionReasons: string[] = []) => tryRecordRuntimeTrace({
    traceId: `turn:${request.turnId}`,
    operation: "turn",
    requestId: request.delta.retrievalReceipt?.requestId,
    turnId: request.turnId,
    retrievalId: request.delta.retrievalReceipt?.requestId,
    latencyMs: Date.now() - startedAt,
    inputTokens: null,
    outputTokens: null,
    firstTokenLatencyMs: null,
    repairCount: 0,
    rejectionReasons,
    outcome,
    commitStatus,
  });
  try {
    const appliedKernel = applyWorldTurn(isolatedBase.worldKernel, { ...request.delta, transaction }, { recordTrace: false });
    const committedKernel = {
      ...appliedKernel,
      currentWeek: isolatedBase.week,
      currentDate: isolatedBase.date,
    };
    const candidate = await request.deriveNextGame({ baseGame: isolatedBase, worldKernel: committedKernel });
    if (!candidate || typeof candidate !== "object") {
      throw new Error("TURN_COMMIT_CANDIDATE_REJECTED: deriveNextGame 未返回 GameState");
    }
    if (candidate === request.baseGame) {
      throw new Error("TURN_COMMIT_CANDIDATE_REJECTED: 不得返回或修改调用者的原始 GameState");
    }
    if (candidate.worldKernel !== committedKernel) {
      throw new Error("TURN_COMMIT_CANDIDATE_REJECTED: sidecar 结果必须引用本次唯一提交的 WorldKernel");
    }
    const committed = candidate.worldKernel.committedTransactions.find((item) => item.turnId === request.turnId);
    if (!committed || committed.inputHash !== transaction.inputHash) {
      throw new Error("TURN_COMMIT_CANDIDATE_REJECTED: WorldKernel 缺少本次事务回执");
    }
    // This is an isolated in-memory candidate only. Durable commit/replay
    // status is owned by Main after the SQLite transaction acknowledges.
    trace("PASS", "PENDING");
    return candidate;
  } catch (error) {
    trace("FAILED", "REJECTED", [error instanceof Error && error.message.startsWith("TURN_") ? error.message.split(":", 1)[0] : "TURN_COMMIT_REJECTED"]);
    throw error;
  }
}
