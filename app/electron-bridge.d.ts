export {};

type MistCredentialResult = {
  available: boolean;
  configured?: boolean;
  persistent?: boolean;
  cleared?: boolean;
  error?: string;
};

type MistPersistenceResult = {
  available: boolean;
  fatal?: boolean;
  value?: string | null;
  saved?: boolean;
  removed?: boolean;
  durable?: boolean;
  replayed?: boolean;
  corrupt?: boolean;
  quarantineId?: string;
  originId?: string | null;
  turnId?: string | null;
  stateRevision?: number;
  checksum?: string;
  records?: Array<{ quarantineId: string; originalKey: string; error: string; quarantinedAt: string; storedChecksum: string; calculatedChecksum: string }>;
  traces?: Array<Record<string, unknown>>;
  quarantined?: boolean;
  error?: string;
};

declare global {
  interface Window {
    mistCredentials?: {
      status(): Promise<MistCredentialResult>;
      set(apiKey: string, persist: boolean): Promise<MistCredentialResult>;
      clear(): Promise<MistCredentialResult>;
    };
    mistInference?: {
      request(task: {
        task: string;
        config: { provider?: string; endpoint: string; model: string; timeoutMs?: number };
        system: string;
        user: string;
        options?: { json?: boolean; maxTokens?: number; temperature?: number };
      }): Promise<{ ok: boolean; content?: string; usage?: { inputTokens: number | null; outputTokens: number | null }; retrieval?: { receipt: import("./world-authority-closure").RetrievalReceipt; selectedCount: number; rejectedCount: number; authority: { turnId: string; baseRevision: number; week?: number; gameDate?: string; payloadHash?: string } }; error?: string; attemptStarted?: boolean }>;
      requestAutonomous(task: {
        task: "autonomous-planning";
        config: { provider?: string; endpoint: string; model: string; timeoutMs?: number };
        autonomousRequest: { principalRef: string; planningWeek: number; baseRevision: number; attempt: number };
      }): Promise<{ ok: boolean; content?: string; usage?: { inputTokens: number | null; outputTokens: number | null }; retrieval?: { receipt: import("./world-authority-closure").RetrievalReceipt; selectedCount: number; rejectedCount: number }; error?: string }>;
      lockWorld(request: { turnId: string; baseRevision: number }): Promise<{ ok: boolean; snapshotHash?: string; originId?: string; turnId?: string; baseRevision?: number; replayed?: boolean; error?: string }>;
      stageWorld(request: { turnId: string; baseRevision: number; resolution: import("./game-model").GameState }): Promise<{ ok: boolean; resolutionHash?: string; originId?: string; turnId?: string; baseRevision?: number; replayed?: boolean; error?: string }>;
      finalizeWorld(request: { turnId: string; baseRevision: number; manifest: Record<string, unknown> }): Promise<{ ok: boolean; manifestHash?: string; manifest?: Record<string, unknown>; originId?: string; turnId?: string; baseRevision?: number; replayed?: boolean; error?: string }>;
      prepareWorld(request: { payload: unknown; turnId: string; baseRevision: number; maxChars?: number }): Promise<{ ok: boolean; ticket?: string; payloadHash?: string; originId?: string; turnId?: string; baseRevision?: number; attempt?: number; retryEpoch?: boolean; error?: string }>;
      statusWorld(request: { ticket: string }): Promise<{ ok: boolean; ticket?: string; payloadHash?: string; originId?: string; turnId?: string; baseRevision?: number; attempt?: number; exhausted?: boolean; error?: string }>;
      requestWorld(task: {
        task: "world-adjudication";
        config: { provider?: string; endpoint: string; model: string; timeoutMs?: number };
        options?: { json?: boolean; maxTokens?: number; temperature?: number };
        worldRequest: { ticket: string; attempt: number };
      }): Promise<{ ok: boolean; content?: string; usage?: { inputTokens: number | null; outputTokens: number | null }; retrieval?: { receipt: import("./world-authority-closure").RetrievalReceipt; selectedCount: number; rejectedCount: number; authority: { turnId: string; baseRevision: number; week?: number; gameDate?: string; payloadHash?: string } }; error?: string; attemptStarted?: boolean }>;
    };
    mistPersistence?: {
      get(key: string): Promise<MistPersistenceResult>;
      appendRecovery(key: string, checkpoint: unknown, maxEntries?: number): Promise<MistPersistenceResult>;
      commitTurn(key: string, payload: string, traces?: Array<Record<string, unknown>>): Promise<MistPersistenceResult>;
      runtimeTraces(originId: string, limit?: number): Promise<MistPersistenceResult>;
      listQuarantine(key: string): Promise<MistPersistenceResult>;
      replaceWithRecovery(activeKey: string, payload: string, recoveryKey: string, checkpoint: unknown, maxEntries?: number): Promise<MistPersistenceResult>;
      quarantine(key: string, reason: string): Promise<MistPersistenceResult>;
    };
    mistRuntimeTrace?: {
      record(trace: Record<string, unknown>): Promise<MistPersistenceResult>;
    };
  }
}
