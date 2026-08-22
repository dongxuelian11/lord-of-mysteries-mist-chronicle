// 渲染端 RAG 客户端：优先走 Electron IPC 桥（检索在 Main/Worker 中执行），
// 无桥时回退到旧版同步检索。返回结果在渲染端再次应用可见性边界。
import { retrieveLoreContext as legacyRetrieve } from "../lore-knowledge";
import { filterChunk } from "./permissions";
import { buildEvidenceContext } from "./context-builder";
import type {
  CanonKnowledgeHorizon,
  CanonLayer,
  SourceGrade,
  Visibility,
} from "./types";
import type { LegacyLoreRecord } from "./index";
import type { RetrievalReceipt } from "../world-authority-closure";
import { tryRecordRuntimeTrace, type RuntimeTraceContext } from "../runtime-trace.ts";

export type RagBridgeAudience = {
  kind: "world-simulation-internal" | "player-facing-narrator" | "player-known" | "actor-private" | "faction-private" | "world" | "player" | "actor" | "faction";
  knownLoreIds: string[];
  topicGrants: string[];
};

export function normalizeRagAudienceKind(kind: RagBridgeAudience["kind"]): "world" | "player" | "actor" | "faction" {
  if (kind === "world-simulation-internal") return "world";
  if (kind === "player-facing-narrator" || kind === "player-known") return "player";
  if (kind === "actor-private") return "actor";
  if (kind === "faction-private") return "faction";
  return kind;
}

export type RagBridgeSearchRequest = {
  query: string;
  audience: RagBridgeAudience;
  week?: number;
  gameDate?: string;
  maxSpoilerScope?: "none" | "volume1" | "volume2" | "volume3" | "volume4" | "volume5" | "volume6" | "volume7" | "all";
  allowedVolumes?: number[];
  horizon?: CanonKnowledgeHorizon;
  limit?: number;
  maxChars?: number;
  trace?: Pick<RuntimeTraceContext, "traceId" | "requestId" | "turnId" | "modelTraceId">;
};

export type RagBridgeChunk = {
  id: string;
  documentId?: string;
  title: string;
  content: string;
  visibility: Visibility;
  topics: string[];
  sourceId: string;
  sourceGrade: SourceGrade;
  canonLayer: CanonLayer;
  sourceLocator?: string;
  work?: "LOTM" | "COI";
  volumeNumber?: number;
  absoluteChapter?: number;
  identityIds?: string[];
  eventId?: string;
};

export type RagBridgeResponse = {
  available: boolean;
  records: RagBridgeChunk[];
  context: string;
  indexVersion?: string;
  error?: string;
};

export type RagBridge = {
  search(request: RagBridgeSearchRequest): Promise<RagBridgeResponse>;
  listChunkIds(): Promise<string[]>;
  status(): Promise<{ available: boolean; chunks: number; indexVersion?: string }>;
};

declare global {
  interface Window {
    mistRag?: RagBridge;
  }
}

function bridge(): RagBridge | undefined {
  return typeof window !== "undefined" ? window.mistRag : undefined;
}

export function toLegacy(records: RagBridgeChunk[]): LegacyLoreRecord[] {
  return records.map((record) => ({
    id: record.id,
    title: record.title,
    content: record.content,
    visibility: record.visibility,
    topics: record.topics,
    sourceIds: [record.sourceId],
    sourceGrade: record.sourceGrade,
    canon: record.canonLayer,
  }));
}

const FUTURE_EVENT_KEYWORDS: [string, number][] = [["大雾霾", 5]];
const IDENTITY_KEYWORDS: [string, string[]][] = [
  ["周明瑞", ["周明瑞", "Zhou Mingrui"]],
  ["夏洛克·莫里亚蒂", ["夏洛克·莫里亚蒂", "Sherlock Moriarty"]],
  ["格尔曼·斯帕罗", ["格尔曼·斯帕罗", "Gehrman Sparrow"]],
  ["道恩·唐泰斯", ["道恩·唐泰斯", "Dwayne Dantes"]],
  ["梅林·赫尔墨斯", ["梅林·赫尔墨斯", "Merlin Hermes"]],
];

function legacyHorizonOk(record: { title: string; content: string }, horizon: CanonKnowledgeHorizon) {
  const text = `${record.title ?? ""} ${record.content ?? ""}`;
  for (const [identity, names] of IDENTITY_KEYWORDS) {
    if (
      !horizon.revealedIdentityIds.includes(identity) &&
      names.some((name) => text.includes(name))
    ) {
      return false;
    }
  }
  for (const [keyword, volume] of FUTURE_EVENT_KEYWORDS) {
    if (text.includes(keyword) && (horizon.maxVolume ?? 0) < volume) return false;
  }
  return true;
}

export function reFilter(
  records: RagBridgeChunk[],
  request: RagBridgeSearchRequest
): RagBridgeChunk[] {
  const filters = {
    audience: {
      kind: normalizeRagAudienceKind(request.audience.kind),
      knownLoreIds: request.audience.knownLoreIds,
      topicGrants: request.audience.topicGrants,
    },
    maxSpoilerScope: request.maxSpoilerScope ?? "all",
    week: request.week,
    gameDate: request.gameDate,
    allowedVolumes: request.allowedVolumes,
    horizon: request.horizon,
  };
  const knownIds = new Set(request.audience.knownLoreIds);
  return records.filter((record) =>
    filterChunk(
      {
        ...record,
        documentId: record.documentId ?? record.id,
        sourceType: "structured",
        sourceRepo: "",
        sourceCommit: "",
        sourcePath: "",
        sourceLocator: record.sourceLocator ?? record.sourceId,
        language: "zh-CN",
        canonLayer: record.canonLayer ?? "canon",
        spoilerScope: "all",
        work: record.work,
        volumeNumber: record.volumeNumber,
        absoluteChapter: record.absoluteChapter,
        identityIds: record.identityIds,
        eventId: record.eventId,
        entities: [],
        aliases: [],
        relations: [],
        contentHash: record.id,
        updatedAt: "",
      },
      filters,
      knownIds
    ).ok
  );
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashText(value: string): string {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return (output >>> 0).toString(16).padStart(8, "0");
}

function retrievalReceipt(
  request: {
    query: string;
    audience: RagBridgeAudience;
    week?: number;
    gameDate?: string;
    maxSpoilerScope?: RagBridgeSearchRequest["maxSpoilerScope"];
    allowedVolumes?: number[];
    horizon?: CanonKnowledgeHorizon;
    limit?: number;
    maxChars?: number;
  },
  records: LegacyLoreRecord[],
  context: string,
  indexVersion: string,
): RetrievalReceipt {
  const queryHash = hashText(request.query.trim());
  const effectiveSpoilerScope = request.maxSpoilerScope
    ?? (request.audience.kind === "player-facing-narrator" ? "volume1" : undefined);
  const filterHash = hashText(stableSerialize({
    audience: {
      kind: normalizeRagAudienceKind(request.audience.kind),
      knownLoreIds: [...request.audience.knownLoreIds].sort(),
      topicGrants: [...request.audience.topicGrants].sort(),
    },
    week: request.week,
    gameDate: request.gameDate,
    maxSpoilerScope: effectiveSpoilerScope,
    allowedVolumes: request.allowedVolumes ? [...request.allowedVolumes].sort((left, right) => left - right) : undefined,
    horizon: request.horizon,
    limit: request.limit,
    maxChars: request.maxChars,
  }));
  const contextHash = hashText(context);
  const chunkIds = [...new Set(records.map((record) => record.id).filter(Boolean))];
  return {
    requestId: `rag:${queryHash}:${filterHash}:${contextHash}`,
    indexVersion: indexVersion.trim() || "legacy-v1",
    audienceRef: normalizeRagAudienceKind(request.audience.kind),
    queryHash,
    filterHash,
    chunkIds,
    contextHash,
  };
}

function recordRetrievalRuntimeTrace(
  receipt: RetrievalReceipt,
  request: { trace?: Pick<RuntimeTraceContext, "traceId" | "requestId" | "turnId" | "modelTraceId"> },
  startedAt: number,
  mode: "bridge" | "legacy",
  rejectedCount: number,
) {
  tryRecordRuntimeTrace({
    traceId: request.trace?.traceId ?? `retrieval:${receipt.requestId}`,
    operation: "retrieval",
    requestId: request.trace?.requestId ?? receipt.requestId,
    turnId: request.trace?.turnId,
    retrievalId: receipt.requestId,
    modelTraceId: request.trace?.modelTraceId,
    retrievalMode: mode,
    retrievalSelectedCount: receipt.chunkIds.length,
    retrievalRejectedCount: rejectedCount,
    latencyMs: Date.now() - startedAt,
    inputTokens: null,
    outputTokens: null,
    firstTokenLatencyMs: null,
    repairCount: 0,
    rejectionReasons: [],
    outcome: "PASS",
    commitStatus: "NOT_APPLICABLE",
  });
}

export async function retrieveLoreContextAsync(
  records: LegacyLoreRecord[],
  request: {
    query: string;
    audience: RagBridgeAudience;
    week?: number;
    gameDate?: string;
    maxSpoilerScope?: RagBridgeSearchRequest["maxSpoilerScope"];
    allowedVolumes?: number[];
    horizon?: CanonKnowledgeHorizon;
    limit?: number;
    maxChars?: number;
    trace?: Pick<RuntimeTraceContext, "traceId" | "requestId" | "turnId" | "modelTraceId">;
  }
): Promise<{ records: LegacyLoreRecord[]; context: string; receipt: RetrievalReceipt }> {
  const startedAt = Date.now();
  const rag = bridge();
  if (rag) {
    try {
      const response = await rag.search({
        query: request.query,
        audience: request.audience,
        week: request.week,
        gameDate: request.gameDate,
        maxSpoilerScope:
          request.maxSpoilerScope ??
          (request.audience.kind === "player-facing-narrator"
            ? "volume1"
            : undefined),
        allowedVolumes: request.allowedVolumes,
        horizon: request.horizon,
        limit: request.limit,
        maxChars: request.maxChars,
      });
      if (response.available && !response.error) {
        const filtered = reFilter(response.records, {
          query: request.query,
          audience: request.audience,
          week: request.week,
          gameDate: request.gameDate,
          maxSpoilerScope:
            request.maxSpoilerScope ??
            (request.audience.kind === "player-facing-narrator"
              ? "volume1"
              : undefined),
          allowedVolumes: request.allowedVolumes,
          horizon: request.horizon,
          limit: request.limit,
          maxChars: request.maxChars,
        });
        // records 与 context 一致性：始终基于最终授权记录重建上下文，
        // 绝不沿用 Worker 生成的旧 context（其中可能含二次过滤剔除的切片）。
        const context = buildEvidenceContext(filtered, request.maxChars ?? 12_000);
        let indexVersion = response.indexVersion;
        if (!indexVersion) {
          try {
            indexVersion = (await rag.status()).indexVersion;
          } catch {
            indexVersion = undefined;
          }
        }
        const receipt = retrievalReceipt(request, toLegacy(filtered), context, indexVersion ?? "bridge-unknown");
        recordRetrievalRuntimeTrace(receipt, request, startedAt, "bridge", Math.max(0, response.records.length - filtered.length));
        return {
          records: toLegacy(filtered),
          context,
          receipt,
        };
      }
    } catch {
      // 桥失败回退旧版
    }
  }
  const safeRecords = request.horizon
    ? (records as Parameters<typeof legacyRetrieve>[0]).filter((record) =>
        legacyHorizonOk(record, request.horizon as CanonKnowledgeHorizon)
      )
    : (records as Parameters<typeof legacyRetrieve>[0]);
  const legacyResult = legacyRetrieve(
    safeRecords,
    {
      query: request.query,
      audience: {
        kind: normalizeRagAudienceKind(request.audience.kind),
        knownLoreIds: request.audience.knownLoreIds,
        topicGrants: request.audience.topicGrants,
      },
      limit: request.limit,
      maxChars: request.maxChars,
    }
  );
  const receipt = retrievalReceipt(request, legacyResult.records, legacyResult.context, "legacy-v1");
  recordRetrievalRuntimeTrace(receipt, request, startedAt, "legacy", 0);
  return {
    ...legacyResult,
    receipt,
  };
}

export async function listRuntimeChunkIds(): Promise<string[]> {
  const rag = bridge();
  if (!rag) return [];
  try {
    return await rag.listChunkIds();
  } catch {
    return [];
  }
}

export function ragBridgeAvailable(): boolean {
  return Boolean(bridge());
}
