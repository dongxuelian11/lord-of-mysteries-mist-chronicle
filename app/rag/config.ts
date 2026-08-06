// RAG 运行时配置：默认不依赖任何 embedding 服务，可随时降级为纯词法检索。
import type { RuntimeIndex } from "./types";

export type EmbeddingConfig = {
  endpoint: string;
  model: string;
  apiKey?: string;
};

export type RagConfig = {
  embedding?: EmbeddingConfig;
  enableLlmRerank: boolean;
  defaultLimit: number;
  defaultMaxChars: number;
  neighborWindow: number;
  maxChunksPerDocument: number;
};

export const DEFAULT_RAG_CONFIG: RagConfig = {
  enableLlmRerank: false,
  defaultLimit: 12,
  defaultMaxChars: 6000,
  neighborWindow: 1,
  maxChunksPerDocument: 3,
};

export function parseEmbeddingConfig(input?: {
  endpoint?: string;
  model?: string;
  apiKey?: string;
}): EmbeddingConfig | undefined {
  if (!input?.endpoint || !input.model) return undefined;
  return {
    endpoint: input.endpoint.replace(/\/+$/, ""),
    model: input.model,
    apiKey: input.apiKey,
  };
}

export function runtimeIndexHasData(index: RuntimeIndex | null): index is RuntimeIndex {
  return Boolean(index && index.chunks.length > 0);
}
