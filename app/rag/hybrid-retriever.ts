// 混合检索主流程：标准化 → 别名展开 → 实体识别 → 意图/时间识别 →
// 权限预过滤 → 词法 → 向量 → RRF 融合 → 去重/多样性 → 邻居/父级扩展 → 预算。
// search() 支持可选向量与 LLM 重排；searchSync() 是确定性的纯词法同步路径，
// 供旧版同步调用点使用。
import { buildAliasIndex, type AliasIndex } from "./alias-index";
import { DEFAULT_RAG_CONFIG, type RagConfig } from "./config";
import {
  analyzeQuery,
  detectQueryIntent,
  isEntityIntent,
  type AnalyzedQuery,
} from "./query-analyzer";
import { lexicalSearch } from "./lexical-retriever";
import { filterChunk } from "./permissions";
import { llmRerank, type Reranker } from "./reranker";
import type {
  LoreChunk,
  RagFilters,
  RagQuery,
  RagResult,
  RagTrace,
  RuntimeIndex,
} from "./types";
import { VectorRetriever } from "./vector-retriever";

export type HybridRetrieverOptions = {
  runtimeIndex?: RuntimeIndex | null;
  chunks?: LoreChunk[];
  inverted?: Record<string, { df: number; p: { chunkIndex: number; tf: number; fields: number }[] }>;
  config?: Partial<RagConfig>;
  aliasIndex?: AliasIndex;
  vectorRetriever?: VectorRetriever;
  reranker?: Reranker;
};

const RRF_K = 60;

type RankedItem = { index: number; score: number; chunk: LoreChunk };

function buildFilters(query: RagQuery): RagFilters {
  const fanKeywords = /同人|Mod|MUD|跑团|游戏机制|community|粉丝|扩展|模组|fan/i;
  const defaultLayers: RagFilters["canonLayers"] = [
    "canon-primary",
    "canon",
    "official-reference",
    "canon-adaptation",
    "community-reference",
    "community",
  ];
  const includeFan =
    query.filters?.includeFanDerived === true || fanKeywords.test(query.text ?? "");
  return {
    audience: query.filters?.audience ?? {
      kind: "world",
      knownLoreIds: [],
      topicGrants: [],
    },
    maxSpoilerScope: query.filters?.maxSpoilerScope ?? "all",
    gameDate: query.filters?.gameDate,
    week: query.filters?.week,
    allowedVolumes: query.filters?.allowedVolumes,
    horizon: query.filters?.horizon,
    worldBranch: query.filters?.worldBranch,
    canonLayers:
      query.filters?.canonLayers ??
      (includeFan ? [...defaultLayers, "fan-derived", "game-original"] : defaultLayers),
    visibility: query.filters?.visibility,
    sources: query.filters?.sources,
  };
}

export class HybridRetriever {
  private readonly chunks: LoreChunk[];
  private readonly inverted: Record<
    string,
    { df: number; p: { chunkIndex: number; tf: number; fields: number }[] }
  >;
  private readonly config: RagConfig;
  private readonly aliasIndex: AliasIndex;
  private readonly vectorRetriever?: VectorRetriever;
  private readonly reranker?: Reranker;
  private readonly vectorsAvailable: boolean;

  constructor(options: HybridRetrieverOptions = {}) {
    this.chunks = options.chunks ?? options.runtimeIndex?.chunks ?? [];
    this.inverted =
      options.inverted ?? options.runtimeIndex?.inverted ?? {};
    this.config = { ...DEFAULT_RAG_CONFIG, ...options.config };
    this.aliasIndex =
      options.aliasIndex ??
      buildAliasIndex(options.runtimeIndex, this.chunks);
    this.vectorRetriever = options.vectorRetriever;
    this.reranker = options.reranker;
    this.vectorsAvailable = Boolean(
      options.runtimeIndex?.vectors &&
        Object.keys(options.runtimeIndex.vectors).length > 0
    );
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  allChunkIds(): string[] {
    return this.chunks.map((chunk) => chunk.id);
  }

  async search(query: RagQuery): Promise<RagResult> {
    const startedAt = Date.now();
    const filters = buildFilters(query);
    const analyzed = analyzeQuery(query.text, this.aliasIndex);
    const prepared = this.prepare(query, filters, analyzed);
    let vector: { index: number; score: number }[] = [];
    if (this.vectorRetriever?.available) {
      vector = await this.vectorRetriever.search(
        analyzed.expanded,
        this.chunks,
        prepared.allowedIndexes,
        prepared.lexicalLimit
      );
    }
    let rerankOrder: number[] | undefined;
    if (this.reranker && prepared.lexical.length) {
      const candidates = prepared.lexical.map((item) => ({
        index: item.index,
        chunk: this.chunks[item.index],
      }));
      rerankOrder = await llmRerank(this.reranker, query.text, candidates);
    }
    return this.finalize(
      query,
      filters,
      analyzed,
      prepared,
      vector,
      rerankOrder,
      startedAt
    );
  }

  searchSync(query: RagQuery): RagResult {
    const startedAt = Date.now();
    const filters = buildFilters(query);
    const analyzed = analyzeQuery(query.text, this.aliasIndex);
    const prepared = this.prepare(query, filters, analyzed);
    return this.finalize(
      query,
      filters,
      analyzed,
      prepared,
      [],
      undefined,
      startedAt
    );
  }

  private prepare(
    query: RagQuery,
    filters: RagFilters,
    analyzed: AnalyzedQuery
  ): {
    allowedIndexes: Set<number>;
    rejected: { id: string; reason: string }[];
    lexical: { index: number; score: number }[];
    lexicalLimit: number;
    limit: number;
    maxChars: number;
  } {
    const limit = Math.max(1, Math.min(32, query.limit ?? this.config.defaultLimit));
    const maxChars = Math.max(
      240,
      Math.min(24_000, query.maxChars ?? this.config.defaultMaxChars)
    );
    const knownIds = new Set(filters.audience.knownLoreIds);
    const allowedIndexes = new Set<number>();
    const rejected: { id: string; reason: string }[] = [];
    this.chunks.forEach((chunk, index) => {
      if (
        filters.sources?.length &&
        !filters.sources.includes(chunk.sourceId)
      ) {
        return;
      }
      const decision = filterChunk(chunk, filters, knownIds);
      if (decision.ok) allowedIndexes.add(index);
      else rejected.push({ id: chunk.id, reason: decision.reason ?? "denied" });
    });
    const lexicalLimit = Math.max(20, limit * 3);
    const lexical = lexicalSearch(
      analyzed,
      this.chunks,
      this.inverted,
      lexicalLimit,
      allowedIndexes
    );
    return { allowedIndexes, rejected, lexical, lexicalLimit, limit, maxChars };
  }

  private finalize(
    query: RagQuery,
    filters: RagFilters,
    analyzed: AnalyzedQuery,
    prepared: ReturnType<HybridRetriever["prepare"]>,
    vector: { index: number; score: number }[],
    rerankOrder: number[] | undefined,
    startedAt: number
  ): RagResult {
    const { allowedIndexes, rejected, lexical, limit, maxChars } = prepared;
    const fused = new Map<number, number>();
    const maxLexical = lexical.length ? lexical[0].score : 0;
    const maxVector = vector.length ? vector[0].score : 0;
    lexical.forEach((item, rank) => {
      const normalized = maxLexical > 0 ? item.score / maxLexical : 0;
      fused.set(
        item.index,
        (fused.get(item.index) ?? 0) +
          1 / (RRF_K + rank) +
          0.35 * normalized
      );
    });
    vector.forEach((item, rank) => {
      const normalized = maxVector > 0 ? item.score / maxVector : 0;
      fused.set(
        item.index,
        (fused.get(item.index) ?? 0) +
          1 / (RRF_K + rank) +
          0.35 * normalized
      );
    });

    let ranked: RankedItem[] = [...fused.entries()]
      .map(([index, score]) => {
        const chunk = this.chunks[index];
        const intent = detectQueryIntent(query.text);
        const entityNames = analyzed.entities.map((entity) =>
          entity.canonical.toLowerCase()
        );
        const title = chunk.title.toLowerCase();
        const entityHit = entityNames.some(
          (name) =>
            title.includes(name) ||
            (chunk.entities ?? []).some(
              (entity) =>
                entity.name.toLowerCase().includes(name) ||
                (entity.aliases ?? []).some((alias) =>
                  alias.toLowerCase().includes(name)
                )
            ) ||
            (chunk.aliases ?? []).some((alias) =>
              alias.toLowerCase().includes(name)
            )
        );
        const exactTitleHit = entityNames.some((name) => title.includes(name));
        let intentBoost = 1;
        if (entityHit) intentBoost += 0.7;
        if (exactTitleHit) intentBoost += 0.5;
        if (
          isEntityIntent(intent) &&
          (chunk.sourceType === "structured" || chunk.sourceType === "wiki")
        ) {
          intentBoost += 0.35;
        }
        if (
          intent === "world-truth" &&
          (chunk.canonLayer === "canon" || chunk.canonLayer === "game-original")
        ) {
          intentBoost += 0.4;
        }
        if (
          intent === "pathway" &&
          (chunk.topics ?? []).some((topic) =>
            ["pathways", "sequences", "abilities"].includes(topic)
          )
        ) {
          intentBoost += 0.4;
        }
        if (
          analyzed.year &&
          ((chunk.timeline?.from?.includes(analyzed.year) ??
            chunk.timeline?.to?.includes(analyzed.year)) ||
            chunk.timeline?.era?.includes(analyzed.year))
        ) {
          intentBoost += 0.6;
        }
        const layerBoost =
          chunk.canonLayer === "canon-primary"
            ? 2.4
            : chunk.canonLayer === "official-reference"
              ? 1.8
              : chunk.canonLayer === "canon-adaptation"
                ? 1.3
                : chunk.canonLayer === "canon"
            ? 1.6
            : chunk.canonLayer === "game-original"
              ? 0.7
              : chunk.canonLayer === "community" ||
                  chunk.canonLayer === "community-reference"
                ? 0.9
                : chunk.canonLayer === "fan-derived"
                  ? 0.7
                  : chunk.canonLayer === "disputed"
                    ? 0.6
                    : 0.8;
        return { index, score: score * layerBoost * intentBoost, chunk };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index);

    if (rerankOrder) {
      const byIndex = new Map(ranked.map((item) => [item.index, item]));
      ranked = rerankOrder
        .map((index) => byIndex.get(index))
        .filter((item): item is RankedItem => Boolean(item));
    }

    const seenHash = new Set<string>();
    const seenDocument = new Map<string, number>();
    const selected: RankedItem[] = [];
    for (const item of ranked) {
      if (selected.length >= limit) break;
      if (seenHash.has(item.chunk.contentHash)) continue;
      const documentCount = seenDocument.get(item.chunk.documentId) ?? 0;
      if (documentCount >= this.config.maxChunksPerDocument) continue;
      seenHash.add(item.chunk.contentHash);
      seenDocument.set(item.chunk.documentId, documentCount + 1);
      selected.push(item);
    }

    const byId = new Map(this.chunks.map((chunk, index) => [chunk.id, index]));
    const expanded: RankedItem[] = [...selected];
    const expandedIds = new Set(selected.map((item) => item.chunk.id));
    const knownIds = new Set(filters.audience.knownLoreIds);
    const addIfAllowed = (chunkId: string | undefined, baseScore: number) => {
      if (!chunkId || expandedIds.has(chunkId)) return;
      const index = byId.get(chunkId);
      if (index === undefined) return;
      const chunk = this.chunks[index];
      if (!filterChunk(chunk, filters, knownIds).ok) return;
      if (seenHash.has(chunk.contentHash)) return;
      expandedIds.add(chunkId);
      expanded.push({ index, score: baseScore * 0.55, chunk });
    };
    if (query.includeNeighbors !== false) {
      const window = this.config.neighborWindow;
      for (const item of [...selected]) {
        let current = item.chunk;
        for (let i = 0; i < window; i += 1) {
          if (!current.previousChunkId) break;
          current = this.chunks[byId.get(current.previousChunkId) ?? -1] ?? current;
          addIfAllowed(current.id, item.score);
          if (!current.previousChunkId) break;
        }
        current = item.chunk;
        for (let i = 0; i < window; i += 1) {
          if (!current.nextChunkId) break;
          current = this.chunks[byId.get(current.nextChunkId) ?? -1] ?? current;
          addIfAllowed(current.id, item.score);
          if (!current.nextChunkId) break;
        }
      }
    }
    if (query.expandParents) {
      for (const item of [...selected]) {
        addIfAllowed(item.chunk.parentChunkId, item.score);
      }
    }
    // 多实体覆盖：对未被选中片段覆盖的实体追加实体定向检索
    if (analyzed.entities.length >= 1) {
      const anchorScore = expanded.length
        ? expanded[Math.min(4, expanded.length - 1)].score * 0.5
        : 0.01;
      const covered = new Set<string>();
      for (const item of expanded) {
        const text = `${item.chunk.title ?? ""} ${item.chunk.content ?? ""}`.toLowerCase();
        for (const entity of analyzed.entities) {
          const names = [
            entity.canonical,
            ...(this.aliasIndex.byAlias.get(entity.name.toLowerCase())?.englishNames ?? []),
          ];
          if (names.some((name) => name.length > 1 && text.includes(name.toLowerCase()))) {
            covered.add(entity.name.toLowerCase());
          }
        }
      }
      const targets: typeof analyzed.entities = [];
      for (const entity of analyzed.entities) {
        const entry = this.aliasIndex.byAlias.get(entity.name.toLowerCase());
        targets.push(entity);
        for (const related of entry?.related ?? []) {
          const relatedEntry = this.aliasIndex.byAlias.get(
            String(related).toLowerCase()
          );
          if (relatedEntry) {
            targets.push({
              canonical: relatedEntry.canonical,
              name: related,
              type: relatedEntry.type,
            });
          }
        }
      }
      for (const entity of targets) {
        if (covered.has(entity.name.toLowerCase())) continue;
        const names = [
          entity.canonical,
          ...(this.aliasIndex.byAlias.get(entity.name.toLowerCase())?.englishNames ?? []),
          entity.name,
        ];
        const entityTerms = tokenizeNames(names);
        const entityQuery = names.join(" ");
        const mini = lexicalSearch(
          {
            original: entityQuery,
            normalized: entityQuery.toLowerCase(),
            expanded: entityQuery,
            terms: entityTerms,
            entities: [],
          },
          this.chunks,
          this.inverted,
          3,
          allowedIndexes
        );
        for (const item of mini) {
          addIfAllowed(this.chunks[item.index].id, anchorScore);
        }
      }
    }
    expanded.sort((a, b) => b.score - a.score || a.index - b.index);

    const finalChunks: LoreChunk[] = [];
    const lines: string[] = [];
    let used = 0;
    for (const item of expanded) {
      const chunk = item.chunk;
      const citation = `${chunk.sourceId}·${chunk.sourceGrade}·${chunk.canonLayer}`;
      const line = `[${citation}] ${chunk.title}：${chunk.content.trim()}`;
      if (used + line.length > maxChars && lines.length) break;
      finalChunks.push(chunk);
      lines.push(line);
      used += line.length + 1;
    }

    const trace: RagTrace = {
      query: query.text,
      normalizedQuery: analyzed.normalized,
      detectedEntities: analyzed.entities,
      filters: {
        audience: filters.audience.kind,
        week: filters.week,
        maxSpoilerScope: filters.maxSpoilerScope,
        allowedVolumes: filters.allowedVolumes,
        canonLayers: filters.canonLayers,
      },
      lexicalCandidates: lexical.length,
      vectorCandidates: vector.length,
      fusedScores: [...fused.entries()]
        .slice(0, 12)
        .map(([index, score]) => ({
          id: this.chunks[index].id,
          score: Number(score.toFixed(4)),
        })),
      rejectedCandidates: rejected.slice(0, 24),
      selectedChunks: finalChunks.map((chunk) => chunk.id),
      sourceIds: [...new Set(finalChunks.map((chunk) => chunk.sourceId))],
      latencyMs: Date.now() - startedAt,
      contextSize: used,
      fallbackMode: vector.length ? "hybrid" : "lexical-only",
    };

    return {
      chunks: finalChunks,
      context: lines.join("\n"),
      trace,
      fallback:
        trace.fallbackMode === "lexical-only" && this.vectorsAvailable,
    };
  }
}

export function createHybridRetriever(
  options: HybridRetrieverOptions
): HybridRetriever {
  return new HybridRetriever(options);
}

function tokenizeNames(values: string[]): string[] {
  return [
    ...new Set(
      values
        .join(" ")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter((term) => term.length > 1)
    ),
  ];
}
