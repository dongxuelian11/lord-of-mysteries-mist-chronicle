import { sha256Hex } from "./sha256.ts";

function legacyTextChecksum(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stableJsonChecksum(value: unknown) {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") throw new TypeError("value-is-not-json-serializable");
  return sha256Hex(serialized);
}

export function matchesLegacyJsonChecksum(value: unknown, checksum: unknown) {
  if (typeof checksum !== "string" || !/^[0-9a-f]{8}$/i.test(checksum)) return false;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" && legacyTextChecksum(serialized) === checksum.toLowerCase();
  } catch { return false; }
}

export function matchesJsonChecksum(value: unknown, checksum: unknown) {
  if (typeof checksum !== "string") return false;
  try {
    return stableJsonChecksum(value) === checksum;
  } catch {
    return false;
  }
}
