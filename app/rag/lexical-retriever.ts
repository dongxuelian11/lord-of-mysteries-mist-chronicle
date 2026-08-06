// 词法检索：基于构建期倒排索引的 BM25 风格打分 + 字段加权。
// 不依赖任何外部服务，是混合检索的确定性底座。
import type { LoreChunk } from "./types";
import type { AnalyzedQuery } from "./query-analyzer";

const K1 = 1.4;
const B = 0.75;
const FIELD_WEIGHTS = [1, 5, 4, 3, 2]; // content/title/alias/entity/topic

type Posting = { chunkIndex: number; tf: number; fields: number };

function fieldScore(fields: number, fieldIndex: number): number {
  return fields & (1 << fieldIndex) ? FIELD_WEIGHTS[fieldIndex] : 0;
}

export function lexicalSearch(
  query: AnalyzedQuery,
  chunks: LoreChunk[],
  inverted: Record<string, { df: number; p: Posting[] }>,
  limit: number,
  allowedIndexes: Set<number>
): { index: number; score: number }[] {
  if (chunks.length === 0) return [];
  const avgLen = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length || 1;
  const total = chunks.length;
  const scores = new Map<number, number>();
  const seenTerms = new Set<string>();

  for (const term of query.terms) {
    if (seenTerms.has(term)) continue;
    seenTerms.add(term);
    const entry = inverted[term];
    if (!entry || entry.df === 0) continue;
    const idf = Math.log(1 + (total - entry.df + 0.5) / (entry.df + 0.5));
    for (const posting of entry.p) {
      if (!allowedIndexes.has(posting.chunkIndex)) continue;
      const chunk = chunks[posting.chunkIndex];
      const lengthNorm = 1 - B + B * (chunk.content.length / avgLen);
      const tf = (posting.tf * (K1 + 1)) / (posting.tf + K1 * lengthNorm);
      let field = 0;
      for (let f = 0; f < FIELD_WEIGHTS.length; f += 1) field += fieldScore(posting.fields, f);
      scores.set(
        posting.chunkIndex,
        (scores.get(posting.chunkIndex) ?? 0) + idf * tf * (0.6 + field)
      );
    }
  }
  return [...scores.entries()]
    .map(([index, score]) => ({ index, score }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);
}

export function buildInvertedFromChunks(chunks: LoreChunk[]): Record<
  string,
  { df: number; p: Posting[] }
> {
  const inverted: Record<string, { df: number; p: Posting[] }> = {};
  const terms = (value: string) =>
    [...new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((t) => t.length > 1))];
  const hanBigrams = (value: string) => {
    const han = [...value.toLowerCase().replace(/[^\p{Script=Han}]/gu, "")];
    const out: string[] = [];
    for (let i = 0; i < han.length - 1; i += 1) out.push(`${han[i]}${han[i + 1]}`);
    return out;
  };
  chunks.forEach((chunk, chunkIndex) => {
    const fields = [
      terms(chunk.content),
      terms(chunk.title),
      terms((chunk.aliases ?? []).join(" ")),
      terms((chunk.entities ?? []).map((e) => `${e.name} ${(e.aliases ?? []).join(" ")}`).join(" ")),
      terms((chunk.topics ?? []).join(" ")),
    ];
    const all = new Map<string, { tf: number; fields: number }>();
    const add = (term: string, fieldIndex: number) => {
      if (!term) return;
      const entry = all.get(term) ?? { tf: 0, fields: 0 };
      entry.tf += 1;
      entry.fields |= 1 << fieldIndex;
      all.set(term, entry);
    };
    for (let f = 0; f < fields.length; f += 1) {
      for (const term of fields[f]) add(term, f);
    }
    for (const term of hanBigrams(chunk.content)) {
      const entry = all.get(term) ?? { tf: 0, fields: 0 };
      entry.tf += 1;
      entry.fields |= 1;
      all.set(term, entry);
    }
    for (const [term, value] of all) {
      const entry = inverted[term] ?? { df: 0, p: [] };
      entry.df += 1;
      entry.p.push({ chunkIndex, tf: value.tf, fields: value.fields });
      inverted[term] = entry;
    }
  });
  return inverted;
}
