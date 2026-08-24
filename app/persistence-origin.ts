import { stableTextHash } from "./stable-id.ts";

/** Collision-free identity for the durable (save, ledger branch) tuple. */
export function stablePersistenceOriginId(saveId: string, branchId: string) {
  const save = saveId.trim();
  const branch = branchId.trim();
  if (!save || !branch) throw new Error("durable-turn-origin-missing");
  return `origin:v2:${stableTextHash(JSON.stringify([save, branch]))}`;
}
