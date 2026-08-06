// 向量检索：embedding 与聊天模型解耦；未配置或失败时静默降级，绝不阻断游戏。
import type { LoreChunk } from "./types";

export type EmbeddingProvider = {
  embed: (texts: string[]) => Promise<number[][]>;
};

export type VectorRetrieverOptions = {
  vectors: Record<string, number[]>;
  provider?: EmbeddingProvider;
  queryCache?: Map<string, number[]>;
};

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export class VectorRetriever {
  private readonly vectors: Record<string, number[]>;
  private readonly provider?: EmbeddingProvider;
  private readonly queryCache: Map<string, number[]>;

  constructor(options: VectorRetrieverOptions) {
    this.vectors = options.vectors;
    this.provider = options.provider;
    this.queryCache = options.queryCache ?? new Map();
  }

  get available(): boolean {
    return Boolean(this.provider && Object.keys(this.vectors).length > 0);
  }

  async search(
    query: string,
    chunks: LoreChunk[],
    allowedIndexes: Set<number>,
    limit: number
  ): Promise<{ index: number; score: number }[]> {
    if (!this.available) return [];
    try {
      const key = query.trim().toLowerCase();
      let queryVector = this.queryCache.get(key);
      if (!queryVector) {
        const batch = await this.provider!.embed([key]);
        queryVector = batch[0];
        if (!queryVector) return [];
        this.queryCache.set(key, queryVector);
      }
      const results: { index: number; score: number }[] = [];
      chunks.forEach((chunk, index) => {
        if (!allowedIndexes.has(index)) return;
        const vector = this.vectors[chunk.id];
        if (!vector) return;
        results.push({ index, score: cosine(queryVector!, vector) });
      });
      return results
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit);
    } catch {
      return [];
    }
  }
}

export function openAiCompatibleEmbeddingProvider(config: {
  endpoint: string;
  model: string;
  apiKey?: string;
}): EmbeddingProvider {
  return {
    embed: async (texts) => {
      const response = await fetch(`${config.endpoint}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: config.model, input: texts }),
      });
      if (!response.ok) throw new Error(`embedding http ${response.status}`);
      const data = (await response.json()) as { data: { embedding: number[] }[] };
      return data.data.map((item) => item.embedding);
    },
  };
}
