// 可选 LLM 重排：默认关闭；只允许调整顺序，禁止改写知识内容。
import type { LoreChunk } from "./types";

export type RerankRequest = {
  query: string;
  candidates: { index: number; chunk: LoreChunk }[];
};

export type Reranker = {
  rerank: (request: RerankRequest) => Promise<number[]>;
};

export async function llmRerank(
  reranker: Reranker | undefined,
  query: string,
  candidates: { index: number; chunk: LoreChunk }[]
): Promise<number[]> {
  if (!reranker || candidates.length < 2) {
    return candidates.map((item) => item.index);
  }
  try {
    const ordered = await reranker.rerank({ query, candidates });
    const valid = ordered.filter((index) =>
      candidates.some((item) => item.index === index)
    );
    const rest = candidates
      .map((item) => item.index)
      .filter((index) => !valid.includes(index));
    return [...new Set([...valid, ...rest])];
  } catch {
    return candidates.map((item) => item.index);
  }
}
