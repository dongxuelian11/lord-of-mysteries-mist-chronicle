// 渲染端 RAG 客户端：优先走 Electron IPC 桥（检索在 Main/Worker 中执行），
// 无桥时回退到旧版同步检索。返回结果在渲染端再次应用可见性边界。
import { retrieveLoreContext as legacyRetrieve } from "../lore-knowledge";
import { filterChunk } from "./permissions";
import type { CanonKnowledgeHorizon } from "./types";
import type { LegacyLoreRecord } from "./index";

export type RagBridgeAudience = {
  kind: "world-simulation-internal" | "player-facing-narrator" | "player-known" | "actor-private" | "world" | "player" | "actor";
  knownLoreIds: string[];
  topicGrants: string[];
};

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
};

export type RagBridgeChunk = {
  id: string;
  documentId?: string;
  title: string;
  content: string;
  visibility: string;
  topics: string[];
  sourceId: string;
  sourceGrade: string;
  canonLayer: string;
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
  error?: string;
};

export type RagBridge = {
  search(request: RagBridgeSearchRequest): Promise<RagBridgeResponse>;
  listChunkIds(): Promise<string[]>;
  status(): Promise<{ available: boolean; chunks: number }>;
};

declare global {
  interface Window {
    mistRag?: RagBridge;
  }
}

function bridge(): RagBridge | undefined {
  return typeof window !== "undefined" ? window.mistRag : undefined;
}

function toLegacy(records: RagBridgeChunk[]): LegacyLoreRecord[] {
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

function reFilter(
  records: RagBridgeChunk[],
  request: RagBridgeSearchRequest
): RagBridgeChunk[] {
  const filters = {
    audience: {
      kind: request.audience.kind === "world-simulation-internal" ? "world" : request.audience.kind === "player-facing-narrator" || request.audience.kind === "player-known" ? "player" : request.audience.kind === "actor-private" ? "actor" : request.audience.kind,
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
        language: "zh-CN",
        canonLayer: (record.canonLayer as LegacyLoreRecord["canon"]) ?? "canon",
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
  }
): Promise<{ records: LegacyLoreRecord[]; context: string }> {
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
        return {
          records: toLegacy(filtered),
          context: response.context,
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
  return legacyRetrieve(
    safeRecords,
    {
      query: request.query,
      audience: {
        kind:
          request.audience.kind === "world-simulation-internal"
            ? "world"
            : request.audience.kind === "player-facing-narrator" ||
                request.audience.kind === "player-known"
              ? "player"
              : request.audience.kind === "actor-private"
                ? "actor"
                : request.audience.kind,
        knownLoreIds: request.audience.knownLoreIds,
        topicGrants: request.audience.topicGrants,
      },
      limit: request.limit,
      maxChars: request.maxChars,
      week: request.week,
      gameDate: request.gameDate,
      maxSpoilerScope:
        request.maxSpoilerScope ??
        (request.audience.kind === "player-facing-narrator"
          ? "volume1"
          : undefined),
      allowedVolumes: request.allowedVolumes,
    }
  );
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
