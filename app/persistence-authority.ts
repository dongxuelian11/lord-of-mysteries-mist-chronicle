export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AsyncKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type ActiveSaveRecord = {
  key: string;
  raw: string;
  legacy: boolean;
};

export type ActiveSaveAuthority = {
  read(): ActiveSaveRecord | undefined;
  write(raw: string): void;
  clear(): void;
};

export type AsyncActiveSaveAuthority = {
  read(): Promise<ActiveSaveRecord | undefined>;
  write(raw: string): Promise<void>;
  clear(): Promise<void>;
};

export function createActiveSaveAuthority(
  storage: KeyValueStore,
  activeKey: string,
  legacyKeys: readonly string[] = [],
): ActiveSaveAuthority {
  return {
    read() {
      const current = storage.getItem(activeKey);
      if (current) {
        return { key: activeKey, raw: current, legacy: false };
      }

      for (const key of legacyKeys) {
        const raw = storage.getItem(key);
        if (raw) {
          return { key, raw, legacy: true };
        }
      }

      return undefined;
    },
    write(raw) {
      storage.setItem(activeKey, raw);
    },
    clear() {
      storage.removeItem(activeKey);
    },
  };
}

export function createAsyncActiveSaveAuthority(
  storage: AsyncKeyValueStore,
  activeKey: string,
  legacyKeys: readonly string[] = [],
): AsyncActiveSaveAuthority {
  return {
    async read() {
      const current = await storage.getItem(activeKey);
      if (current) return { key: activeKey, raw: current, legacy: false };

      for (const key of legacyKeys) {
        const raw = await storage.getItem(key);
        if (raw) return { key, raw, legacy: true };
      }

      return undefined;
    },
    async write(raw) {
      await storage.setItem(activeKey, raw);
    },
    async clear() {
      await storage.removeItem(activeKey);
    },
  };
}
