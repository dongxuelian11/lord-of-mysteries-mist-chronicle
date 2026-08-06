// RAG worker 检索实现（纯 JS，与 app/rag 的 TS 运行时保持同算法，
// 由 tests/rag-parity.test.mjs 锁定一致性）。
import { DOMAIN_ENTITIES } from "./domain-aliases.mjs";
import { tokenize } from "./text.mjs";

const RRF_K = 60;
const K1 = 1.4;
const B = 0.75;
const FIELD_WEIGHTS = [1, 5, 4, 3, 2];
const SPOILER_ORDER = {
  none: 0,
  volume1: 1,
  volume2: 2,
  volume3: 3,
  volume4: 4,
  volume5: 5,
  volume6: 6,
  volume7: 7,
  all: 8,
};
const ENTITY_INTENTS = new Set([
  "identity",
  "relationship",
  "organization",
  "location",
  "artifact",
  "pathway",
]);

const INTENT_RULES = [
  ["identity", [/身份|真名|别名|化身|马甲|是谁|周明瑞|格尔曼|夏洛克|道恩|梅林|愚者先生/i]],
  ["experience", [/经历|生平|过往|故事|做过什么|遭遇/i]],
  ["relationship", [/关系|认识|朋友|恋人|老师|学生|导师|成员|结盟/i]],
  ["pathway", [/途径|序列|魔药|晋升|扮演|能力|非凡者|仪式/i]],
  ["organization", [/组织|教会|协会|家族|机构|塔罗会|值夜者|学派/i]],
  ["location", [/地点|城市|首都|位于|在哪里|地区|王国|大陆/i]],
  ["artifact", [/封印物|物品|道具|编号|0-0|2-0|日记/i]],
  ["timeline", [/时间线|历史|纪年|哪一年|第[一二三四五]部|第四纪|第五纪/i]],
  ["world-truth", [/真相|幕后|宇宙|源质|真值|世界真值/i]],
];

const CONCEPT_TRANSLATIONS = {
  占卜: "divination",
  占卜家: "Seer",
  魔药: "potion",
  扮演: "acting",
  晋升: "advancement",
  仪式: "ritual",
  教会: "church",
  组织: "organization",
  首都: "capital",
  王国: "kingdom",
  序列: "sequence",
  能力: "ability",
  身份: "identity",
  真实身份: "true identity",
  塔罗: "tarot",
  灰雾: "gray fog",
  源堡: "Sefirah Castle",
  封印物: "sealed artifact",
  失控: "corruption",
  尊名: "honorific name",
  灵性: "spirituality",
  学徒: "Apprentice",
  魔术师: "Magician",
  读心者: "Reader",
  催眠师: "Hypnotist",
  无面人: "Faceless",
  小丑: "Clown",
  黑夜: "Evernight",
  风暴: "Storm",
  蒸汽: "Steam",
  月亮: "Moon",
  正义: "Justice",
  愚者: "Fool",
  世界: "World",
  贝克兰德: "Backlund",
  廷根: "Tingen",
  鲁恩: "Loen",
  东区: "East Borough",
  码头: "Dock",
  值夜者: "Nighthawks",
  塔罗会: "Tarot Club",
  日记: "diary",
  罗塞尔: "Roselle",
  阿蒙: "Amon",
  克莱恩: "Klein",
  奥黛丽: "Audrey",
  阿尔杰: "Alger",
  伦纳德: "Leonard",
  埃姆林: "Emlyn",
  休: "Xio",
  帕列斯: "Pallez",
  第四纪: "Fourth Epoch",
  第五纪: "Fifth Epoch",
  序列9: "Sequence 9",
  序列8: "Sequence 8",
  序列7: "Sequence 7",
  序列6: "Sequence 6",
  序列5: "Sequence 5",
  序列4: "Sequence 4",
  序列3: "Sequence 3",
  序列2: "Sequence 2",
  序列1: "Sequence 1",
  序列0: "Sequence 0",
};

function detectIntent(query) {
  for (const [intent, patterns] of INTENT_RULES) {
    if (patterns.some((pattern) => pattern.test(query))) return intent;
  }
  return "general";
}

function detectYear(query) {
  const match = query.match(/\b(1[3-5]\d{2})\b/);
  return match ? match[1] : undefined;
}

function buildAliasIndex(chunks, aliasMap = {}) {
  const byAlias = new Map();
  const add = (alias, entry) => {
    const key = String(alias ?? "").trim().toLowerCase();
    if (!key || key.length < 2 || byAlias.has(key)) return;
    byAlias.set(key, entry);
  };
  for (const entity of DOMAIN_ENTITIES) {
    const entry = { canonical: entity.canonical, type: entity.type, englishNames: entity.englishNames ?? [], related: entity.related ?? [] };
    add(entity.canonical, entry);
    for (const alias of entity.aliases) add(alias, entry);
  }
  for (const [alias, value] of Object.entries(aliasMap ?? {})) {
    add(alias, { canonical: value.canonical, type: value.type, englishNames: [], related: [] });
  }
  for (const chunk of chunks) {
    for (const alias of chunk.aliases ?? []) {
      add(alias, { canonical: chunk.title, type: "concept", englishNames: [], related: [] });
    }
    for (const entity of chunk.entities ?? []) {
      add(entity.name, { canonical: entity.name, type: entity.type, englishNames: entity.aliases ?? [], related: entity.aliases ?? [] });
      for (const alias of entity.aliases ?? []) {
        add(alias, { canonical: entity.name, type: entity.type, englishNames: [], related: [] });
      }
    }
  }
  return byAlias;
}

function analyze(query, aliasIndex) {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  const entities = [];
  const seen = new Set();
  let scan = normalized;
  while (scan.length) {
    let matched = false;
    for (let length = Math.min(scan.length, 12); length >= 2; length -= 1) {
      const slice = scan.slice(0, length);
      const entry = aliasIndex.get(slice.toLowerCase());
      if (entry && !seen.has(entry.canonical.toLowerCase())) {
        seen.add(entry.canonical.toLowerCase());
        entities.push({ type: entry.type, name: slice, canonical: entry.canonical });
        scan = scan.slice(length);
        matched = true;
        break;
      }
    }
    if (!matched) scan = scan.slice(1);
  }
  const pieces = [];
  const related = [];
  const englishTerms = [];
  let rest = normalized;
  while (rest.length) {
    let matched = false;
    for (let length = Math.min(rest.length, 12); length >= 2; length -= 1) {
      const slice = rest.slice(0, length);
      const entry = aliasIndex.get(slice.toLowerCase());
      if (entry) {
        pieces.push(entry.canonical);
        for (const term of entry.related ?? []) {
          if (related.length >= 4) break;
          related.push(term);
        }
        for (const english of entry.englishNames ?? []) {
          if (englishTerms.length >= 4) break;
          englishTerms.push(english);
        }
        rest = rest.slice(length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      pieces.push(rest[0]);
      rest = rest.slice(1);
    }
  }
  const conceptTerms = [];
  for (const term of tokenize(normalized)) {
    const translation = CONCEPT_TRANSLATIONS[term];
    if (translation && !conceptTerms.includes(translation)) conceptTerms.push(translation);
  }
  const expanded = [...pieces, ...related, ...englishTerms, ...conceptTerms.slice(0, 8)].join(" ");
  return {
    normalized,
    expanded,
    terms: tokenize(`${normalized} ${expanded}`),
    entities,
    year: detectYear(normalized),
  };
}

export function filterChunk(chunk, filters, knownIds) {
  if (filters.horizon) {
    const horizon = filters.horizon;
    if (chunk.work && horizon.work && chunk.work !== horizon.work) {
      return { ok: false, reason: "cross-work" };
    }
  }
  if (filters.audience.kind === "world" || filters.audience.kind === "world-simulation-internal") {
    return { ok: true };
  }
  if (filters.horizon) {
    const horizon = filters.horizon;
    if (
      horizon.maxVolume != null &&
      chunk.volumeNumber !== undefined &&
      chunk.volumeNumber > horizon.maxVolume
    ) {
      return { ok: false, reason: "future-volume" };
    }
    if (
      horizon.maxAbsoluteChapter != null &&
      chunk.absoluteChapter !== undefined &&
      chunk.absoluteChapter > horizon.maxAbsoluteChapter
    ) {
      return { ok: false, reason: "future-chapter" };
    }
    if (
      chunk.eventId &&
      Array.isArray(horizon.allowedEventIds) &&
      horizon.allowedEventIds.length &&
      !horizon.allowedEventIds.includes(chunk.eventId)
    ) {
      return { ok: false, reason: "event-not-allowed" };
    }
    if (
      Array.isArray(chunk.identityIds) &&
      chunk.identityIds.length &&
      !chunk.identityIds.every((identity) =>
        (horizon.revealedIdentityIds ?? []).includes(identity)
      )
    ) {
      return { ok: false, reason: "identity" };
    }
  }
  const visibility = chunk.visibility ?? "public";
  if (visibility === "public") {
    // public 在 player-known/player-facing/actor 下可见
  } else if (
    knownIds.has(chunk.id) ||
    knownIds.has(chunk.documentId) ||
    knownIds.has(chunk.title) ||
    knownIds.has(chunk.sourceLocator)
  ) {
    // 已授权
  } else if (visibility === "restricted") {
    if (!(chunk.topics ?? []).some((topic) => filters.audience.topicGrants.includes(topic))) {
      return { ok: false, reason: "topic-grant" };
    }
  } else {
    return { ok: false, reason: `visibility:${visibility}` };
  }
  const maxSpoiler = filters.maxSpoilerScope ?? "all";
  if ((SPOILER_ORDER[chunk.spoilerScope ?? "all"] ?? 3) > (SPOILER_ORDER[maxSpoiler] ?? 3)) {
    return { ok: false, reason: "spoiler" };
  }
  if (
    filters.allowedVolumes?.length &&
    chunk.timeline?.volume !== undefined &&
    !filters.allowedVolumes.includes(chunk.timeline.volume)
  ) {
    return { ok: false, reason: "volume" };
  }
  if (
    filters.week !== undefined &&
    chunk.timeline?.week !== undefined &&
    chunk.timeline.week > filters.week
  ) {
    return { ok: false, reason: "future-week" };
  }
  return { ok: true };
}

function fieldScore(fields, fieldIndex) {
  return fields & (1 << fieldIndex) ? FIELD_WEIGHTS[fieldIndex] : 0;
}

export function lexicalSearch(analyzed, chunks, inverted, limit, allowedIndexes) {
  if (!chunks.length) return [];
  const avgLen = chunks.reduce((sum, c) => sum + (c.content?.length ?? 0), 0) / chunks.length || 1;
  const total = chunks.length;
  const scores = new Map();
  for (const term of analyzed.terms) {
    const entry = inverted[term];
    if (!entry || !entry.df) continue;
    const idf = Math.log(1 + (total - entry.df + 0.5) / (entry.df + 0.5));
    for (const posting of entry.p) {
      if (!allowedIndexes.has(posting.chunkIndex)) continue;
      const chunk = chunks[posting.chunkIndex];
      const lengthNorm = 1 - B + B * ((chunk.content?.length ?? 0) / avgLen);
      const tf = (posting.tf * (K1 + 1)) / (posting.tf + K1 * lengthNorm);
      let field = 0;
      for (let f = 0; f < FIELD_WEIGHTS.length; f += 1) field += fieldScore(posting.fields, f);
      scores.set(posting.chunkIndex, (scores.get(posting.chunkIndex) ?? 0) + idf * tf * (0.6 + field));
    }
  }
  return [...scores.entries()]
    .map(([index, score]) => ({ index, score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

export class JsHybridRetriever {
  constructor({ chunks = [], inverted = {}, aliasMap = {}, vectors = {}, config = {} }) {
    this.chunks = chunks;
    this.inverted = inverted;
    this.aliasIndex = buildAliasIndex(chunks, aliasMap);
    this.vectors = vectors;
    this.config = {
      defaultLimit: 12,
      defaultMaxChars: 6000,
      neighborWindow: 1,
      maxChunksPerDocument: 3,
      ...config,
    };
  }

  allChunkIds() {
    return this.chunks.map((c) => c.id);
  }

  searchSync(query) {
    const startedAt = Date.now();
    const fanKeywords = /同人|Mod|MUD|跑团|游戏机制|community|粉丝|扩展|模组|fan/i;
    const defaultLayers = [
      "canon-primary",
      "canon",
      "official-reference",
      "canon-adaptation",
      "community-reference",
      "community",
    ];
    const includeFan =
      query.filters?.includeFanDerived === true ||
      fanKeywords.test(query.text ?? "");
    const filters = {
      audience: query.filters?.audience ?? { kind: "world-simulation-internal", knownLoreIds: [], topicGrants: [] },
      maxSpoilerScope: query.filters?.maxSpoilerScope ?? "all",
      week: query.filters?.week,
      gameDate: query.filters?.gameDate,
      allowedVolumes: query.filters?.allowedVolumes,
      horizon: query.filters?.horizon,
      canonLayers:
        query.filters?.canonLayers ??
        (includeFan ? [...defaultLayers, "fan-derived", "game-original"] : defaultLayers),
      sources: query.filters?.sources,
    };
    const analyzed = analyze(query.text ?? "", this.aliasIndex);
    const knownIds = new Set(filters.audience.knownLoreIds ?? []);
    const limit = Math.max(1, Math.min(32, query.limit ?? this.config.defaultLimit));
    const maxChars = Math.max(240, Math.min(24000, query.maxChars ?? this.config.defaultMaxChars));
    const allowedIndexes = new Set();
    const rejected = [];
    this.chunks.forEach((chunk, index) => {
      if (
        filters.sources?.length &&
        !filters.sources.includes(chunk.sourceId)
      ) {
        return;
      }
      if (filters.canonLayers?.length && !filters.canonLayers.includes(chunk.canonLayer)) {
        rejected.push({ id: chunk.id, reason: "canon-layer" });
        return;
      }
      const decision = filterChunk(chunk, filters, knownIds);
      if (decision.ok) allowedIndexes.add(index);
      else rejected.push({ id: chunk.id, reason: decision.reason });
    });
    const lexicalLimit = Math.max(20, limit * 3);
    const lexical = lexicalSearch(analyzed, this.chunks, this.inverted, lexicalLimit, allowedIndexes);
    const fused = new Map();
    const maxLexical = lexical.length ? lexical[0].score : 0;
    lexical.forEach((item, rank) => {
      fused.set(item.index, 1 / (RRF_K + rank) + 0.35 * (maxLexical > 0 ? item.score / maxLexical : 0));
    });
    const intent = detectIntent(query.text ?? "");
    const year = detectYear(query.text ?? "");
    let ranked = [...fused.entries()]
      .map(([index, score]) => {
        const chunk = this.chunks[index];
        const entityNames = analyzed.entities.map((entity) =>
          entity.canonical.toLowerCase()
        );
        const title = (chunk.title ?? "").toLowerCase();
        const entityHit = entityNames.some(
          (name) =>
            title.includes(name) ||
            (chunk.entities ?? []).some(
              (entity) =>
                (entity.name ?? "").toLowerCase().includes(name) ||
                (entity.aliases ?? []).some((alias) =>
                  (alias ?? "").toLowerCase().includes(name)
                )
            ) ||
            (chunk.aliases ?? []).some((alias) =>
              (alias ?? "").toLowerCase().includes(name)
            )
        );
        const exactTitleHit = entityNames.some((name) => title.includes(name));
        let intentBoost = 1;
        if (entityHit) intentBoost += 0.7;
        if (exactTitleHit) intentBoost += 0.5;
        if (
          ENTITY_INTENTS.has(intent) &&
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
          year &&
          ((chunk.timeline?.from?.includes(year) ??
            chunk.timeline?.to?.includes(year)) ||
            chunk.timeline?.era?.includes(year))
        ) {
          intentBoost += 0.6;
        }
        const boost =
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
        return { index, score: score * boost * intentBoost, chunk };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const seenHash = new Set();
    const seenDocument = new Map();
    const selected = [];
    for (const item of ranked) {
      if (selected.length >= limit) break;
      if (seenHash.has(item.chunk.contentHash)) continue;
      const count = seenDocument.get(item.chunk.documentId) ?? 0;
      if (count >= this.config.maxChunksPerDocument) continue;
      seenHash.add(item.chunk.contentHash);
      seenDocument.set(item.chunk.documentId, count + 1);
      selected.push(item);
    }
    const byId = new Map(this.chunks.map((c, i) => [c.id, i]));
    const expanded = [...selected];
    const expandedIds = new Set(selected.map((i) => i.chunk.id));
    const addIfAllowed = (chunkId, baseScore) => {
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
        }
        current = item.chunk;
        for (let i = 0; i < window; i += 1) {
          if (!current.nextChunkId) break;
          current = this.chunks[byId.get(current.nextChunkId) ?? -1] ?? current;
          addIfAllowed(current.id, item.score);
        }
      }
    }
    if (query.expandParents) {
      for (const item of [...selected]) addIfAllowed(item.chunk.parentChunkId, item.score);
    }
    // 多实体覆盖：对查询中未被选中片段覆盖的实体，追加实体定向检索结果
    if (analyzed.entities.length >= 1) {
      const anchorScore = expanded.length
        ? expanded[Math.min(4, expanded.length - 1)].score * 0.5
        : 0.01;
      const covered = new Set();
      for (const item of expanded) {
        const text = `${item.chunk.title ?? ""} ${item.chunk.content ?? ""}`.toLowerCase();
        for (const entity of analyzed.entities) {
          const names = [
            entity.canonical,
            ...(this.aliasIndex.get(entity.name.toLowerCase())?.englishNames ?? []),
          ];
          if (names.some((name) => name.length > 1 && text.includes(name.toLowerCase()))) {
            covered.add(entity.name.toLowerCase());
          }
        }
      }
      const targets = [];
      for (const entity of analyzed.entities) {
        const entry = this.aliasIndex.get(entity.name.toLowerCase());
        targets.push(entity);
        for (const related of entry?.related ?? []) {
          const relatedEntry = this.aliasIndex.get(String(related).toLowerCase());
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
          ...(this.aliasIndex.get(entity.name.toLowerCase())?.englishNames ?? []),
          entity.name,
        ];
        const entityTerms = [
          ...new Set(
            names
              .join(" ")
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, " ")
              .split(/\s+/)
              .filter((term) => term.length > 1)
          ),
        ];
        const mini = lexicalSearch(
          { terms: entityTerms, entities: [] },
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
    const finalChunks = [];
    const lines = [];
    let used = 0;
    for (const item of expanded) {
      const chunk = item.chunk;
      const citation = `${chunk.sourceId}·${chunk.sourceGrade}·${chunk.canonLayer}`;
      const line = `[${citation}] ${chunk.title}：${(chunk.content ?? "").trim()}`;
      if (used + line.length > maxChars && lines.length) break;
      finalChunks.push(chunk);
      lines.push(line);
      used += line.length + 1;
    }
    return {
      chunks: finalChunks,
      context: lines.join("\n"),
      trace: {
        query: query.text,
        normalizedQuery: analyzed.normalized,
        detectedEntities: analyzed.entities,
        filters,
        lexicalCandidates: lexical.length,
        vectorCandidates: 0,
        rejectedCandidates: rejected.slice(0, 24),
        selectedChunks: finalChunks.map((c) => c.id),
        sourceIds: [...new Set(finalChunks.map((c) => c.sourceId))],
        latencyMs: Date.now() - startedAt,
        contextSize: used,
        fallbackMode: "lexical-only",
      },
      fallback: true,
    };
  }
}
