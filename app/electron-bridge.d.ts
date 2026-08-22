export {};

type MistCredentialResult = {
  available: boolean;
  apiKey?: string;
  saved?: boolean;
  cleared?: boolean;
  error?: string;
};

type MistPersistenceResult = {
  available: boolean;
  fatal?: boolean;
  value?: string | null;
  saved?: boolean;
  removed?: boolean;
  error?: string;
};

declare global {
  interface Window {
    mistCredentials?: {
      load(): Promise<MistCredentialResult>;
      save(apiKey: string): Promise<MistCredentialResult>;
      clear(): Promise<MistCredentialResult>;
    };
    mistPersistence?: {
      get(key: string): Promise<MistPersistenceResult>;
      set(key: string, payload: string): Promise<MistPersistenceResult>;
      remove(key: string): Promise<MistPersistenceResult>;
      appendRecovery(key: string, checkpoint: unknown, maxEntries?: number): Promise<MistPersistenceResult>;
    };
  }
}
