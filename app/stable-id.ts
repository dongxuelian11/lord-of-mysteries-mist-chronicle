function canonicalPart(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalPart).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalPart(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Stable, non-cryptographic hash for persisted entity identity and replay keys. */
export function stableTextHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stableEntityId(prefix: string, ...parts: unknown[]): string {
  return `${prefix}:${stableTextHash(parts.map(canonicalPart).join("|"))}`;
}
