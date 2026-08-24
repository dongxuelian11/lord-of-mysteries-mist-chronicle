import { sha256Hex } from "./sha256.ts";

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

/** Stable SHA-256 identity for persisted entities and replay keys. */
export function stableTextHash(value: string): string {
  return sha256Hex(value);
}

export function stableEntityId(prefix: string, ...parts: unknown[]): string {
  return `${prefix}:${stableTextHash(parts.map(canonicalPart).join("|"))}`;
}
