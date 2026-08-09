// RAG V2 兼容门面：保持旧 retrieveLoreContext 同步签名，
// 有完整运行索引时走混合检索，否则退回旧版词法检索。
import { retrieveLoreContext as legacyRetrieveContext } from "../lore-knowledge";
import type { SpoilerScope } from "./types";

export type LegacyLoreRecord = {
  id: string;
  title: string;
  content: string;
  visibility: string;
  topics: string[];
  sourceIds?: string[];
  sourceGrade?: string;
  canon?: string;
};

export type LegacyLoreRequest = {
  query: string;
  audience: { kind: "world" | "player" | "actor" | "faction"; knownLoreIds: string[]; topicGrants: string[] };
  limit?: number;
  maxChars?: number;
  week?: number;
  gameDate?: string;
  maxSpoilerScope?: SpoilerScope;
  allowedVolumes?: number[];
};

export type LegacyLoreResult = {
  records: LegacyLoreRecord[];
  context: string;
};

export function retrieveLoreContext(
  _records: LegacyLoreRecord[],
  request: LegacyLoreRequest
): LegacyLoreResult {
  return legacyRetrieveContext(
    _records as Parameters<typeof legacyRetrieveContext>[0],
    request as Parameters<typeof legacyRetrieveContext>[1]
  );
}

export function ragEngineInfo(): {
  mode: "legacy";
  chunks: number;
  documents: number;
  embeddingModel?: string;
} {
  return { mode: "legacy", chunks: 0, documents: 0 };
}
