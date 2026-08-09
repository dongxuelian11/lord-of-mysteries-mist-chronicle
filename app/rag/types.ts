// 灰雾纪事 · RAG V2 统一知识模型
export type CanonLayer =
  | "canon"
  | "canon-primary"
  | "canon-adaptation"
  | "official-reference"
  | "community-reference"
  | "community"
  | "fan-derived"
  | "game-original"
  | "disputed"
  | "unknown";

export type SourceType =
  | "novel"
  | "wiki"
  | "subtitle"
  | "game"
  | "reference"
  | "structured"
  | "other";

export type Visibility = "public" | "restricted" | "secret" | "cosmic";
export type SpoilerScope =
  | "none"
  | "volume1"
  | "volume2"
  | "volume3"
  | "volume4"
  | "volume5"
  | "volume6"
  | "volume7"
  | "all";
export type SourceGrade = "A" | "B" | "C" | "D";

// 原著知识边界：每个存档/请求必须明确当前允许看到的小说卷章范围。
export type CanonKnowledgeHorizon = {
  work: "LOTM" | "COI";
  maxVolume: number | null;
  maxAbsoluteChapter: number | null;
  allowedEventIds: string[];
  revealedIdentityIds: string[];
  worldlineMode: "canon-aligned" | "canon-diverged" | "post-canon" | "custom";
};

export type EntityType =
  | "character"
  | "pathway"
  | "sequence"
  | "organization"
  | "location"
  | "item"
  | "sealed-artifact"
  | "event"
  | "ritual"
  | "deity"
  | "era"
  | "concept";

export type TimelineSpan = {
  from?: string;
  to?: string;
  week?: number;
  volume?: number;
  era?: string;
};

export type EntityMention = {
  type: EntityType;
  name: string;
  aliases?: string[];
};

export type RelationRef = {
  subject: string;
  predicate: string;
  object: string;
  layer?: CanonLayer;
};

export type LoreDocument = {
  id: string;
  title: string;
  summary?: string;
  sourceId: string;
  sourceType: SourceType;
  sourceRepo: string;
  sourceCommit: string;
  sourcePath: string;
  sourceLocator: string;
  language: string;
  canonLayer: CanonLayer;
  sourceGrade: SourceGrade;
  updatedAt: string;
  contentHash: string;
  chunkIds: string[];
};

export type LoreChunk = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  summary?: string;
  sourceId: string;
  sourceType: SourceType;
  sourceRepo: string;
  sourceCommit: string;
  sourcePath: string;
  sourceLocator: string;
  language: string;
  canonLayer: CanonLayer;
  sourceGrade: SourceGrade;
  visibility: Visibility;
  spoilerScope: SpoilerScope;
  timeline?: TimelineSpan;
  work?: "LOTM" | "COI";
  volumeNumber?: number;
  volumeTitle?: string;
  chapterNumberWithinVolume?: number;
  absoluteChapter?: number;
  chapterTitle?: string;
  sceneNumber?: number;
  timelineStage?: string;
  identityIds?: string[];
  eventId?: string;
  topics: string[];
  entities: EntityMention[];
  aliases: string[];
  relations: RelationRef[];
  parentChunkId?: string;
  previousChunkId?: string;
  nextChunkId?: string;
  contentHash: string;
  updatedAt: string;
};

export type RagAudienceKind = "world" | "player" | "actor" | "faction";

export type RagAudience = {
  kind: RagAudienceKind;
  knownLoreIds: string[];
  topicGrants: string[];
};

export type RagFilters = {
  audience: RagAudience;
  gameDate?: string;
  week?: number;
  maxSpoilerScope: SpoilerScope;
  allowedVolumes?: number[];
  horizon?: CanonKnowledgeHorizon;
  worldBranch?: string;
  canonLayers?: CanonLayer[];
  includeFanDerived?: boolean;
  sources?: string[];
  visibility?: Visibility[];
};

export type RagQuery = {
  text: string;
  filters?: Partial<RagFilters>;
  limit?: number;
  maxChars?: number;
  includeNeighbors?: boolean;
  expandParents?: boolean;
};

export type DetectedEntity = {
  type: EntityType;
  name: string;
  canonical: string;
};

export type RagTrace = {
  query: string;
  normalizedQuery: string;
  detectedEntities: DetectedEntity[];
  filters: Record<string, unknown>;
  lexicalCandidates: number;
  vectorCandidates: number;
  fusedScores: { id: string; score: number }[];
  rejectedCandidates: { id: string; reason: string }[];
  selectedChunks: string[];
  sourceIds: string[];
  latencyMs: number;
  contextSize: number;
  fallbackMode: "hybrid" | "lexical-only";
};

export type RagResult = {
  chunks: LoreChunk[];
  context: string;
  trace: RagTrace;
  fallback: boolean;
};

export type EvidenceItem = {
  id: string;
  source: string;
  grade: SourceGrade;
  layer: CanonLayer;
  text: string;
  locator: string;
};

export type ConflictItem = {
  subject: string;
  claims: string[];
  layers: CanonLayer[];
};

export type ContextPackage = {
  purpose: string;
  role?: string;
  authorizedFacts: string[];
  evidence: EvidenceItem[];
  conflicts: ConflictItem[];
  unknowns: string[];
  forbiddenInference: string[];
  budget: { used: number; max: number };
  insufficient: boolean;
};

export type RuntimeIndex = {
  meta: {
    version: number;
    builtAt: string;
    chunks: number;
    documents: number;
    embeddingModel?: string;
  };
  chunks: LoreChunk[];
  inverted: Record<
    string,
    { df: number; p: { chunkIndex: number; tf: number; fields: number }[] }
  >;
  aliasMap: Record<string, { canonical: string; type: EntityType }>;
  vectors?: Record<string, number[]>;
};
