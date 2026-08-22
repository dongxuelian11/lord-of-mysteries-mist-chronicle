export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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
