import { PATHWAY_SEQUENCE_LEDGER } from "./pathway-sequence-ledger.ts";
import { STANDARD_PATHWAY_IDS, type StandardPathwayId } from "./pathway-catalog.ts";

export type HighAssetHolderRef = "unlocated" | "player" | `actor:${string}` | `faction:${string}` | `location:${string}`;
export type HighAssetState = "unlocated" | "held" | "incorporated" | "contested" | "sealed";

export type HighSequenceCharacteristic = {
  id: string;
  pathwayId: StandardPathwayId;
  sequence: 1 | 2 | 3 | 4;
  sequenceName: string;
  holderRef: HighAssetHolderRef;
  state: HighAssetState;
  locationId?: string;
  acquiredWeek?: number;
  sourceEventIds: string[];
  loreEvidenceIds: string[];
};

export type UniqueHighAsset = {
  id: string;
  kind: "uniqueness" | "sefirot";
  name: string;
  pathwayIds: StandardPathwayId[];
  holderRef: HighAssetHolderRef;
  state: HighAssetState;
  locationId?: string;
  acquiredWeek?: number;
  sourceEventIds: string[];
  loreEvidenceIds: string[];
};

export type HighSequenceLedgerEvent = {
  id: string;
  week: number;
  assetId: string;
  action: "located" | "claimed" | "transferred" | "incorporated" | "contested" | "sealed";
  fromHolderRef?: HighAssetHolderRef;
  toHolderRef?: HighAssetHolderRef;
  sourceEventId: string;
};

export type HighSequenceLedger = {
  version: 1;
  characteristics: HighSequenceCharacteristic[];
  uniquenesses: UniqueHighAsset[];
  sefirot: UniqueHighAsset[];
  events: HighSequenceLedgerEvent[];
};

const SEFIROT_EVIDENCE_ID = "lotm-05-001";

export function createHighSequenceLedger(): HighSequenceLedger {
  const uniquenesses = STANDARD_PATHWAY_IDS.map((pathwayId) => {
    const dossier = PATHWAY_SEQUENCE_LEDGER[pathwayId];
    const sequenceZero = dossier.sequences.find((item) => item.sequence === 0)!;
    return {
      id: `uniqueness:${pathwayId}`,
      kind: "uniqueness" as const,
      name: `${sequenceZero.name}途径唯一性`,
      pathwayIds: [pathwayId],
      holderRef: "unlocated" as const,
      state: "unlocated" as const,
      sourceEventIds: [],
      loreEvidenceIds: [dossier.sequenceEvidenceId, "lotm-03-009"],
    };
  });
  const sefirotByName = new Map<string, StandardPathwayId[]>();
  for (const pathwayId of STANDARD_PATHWAY_IDS) {
    const name = PATHWAY_SEQUENCE_LEDGER[pathwayId].sefirot;
    sefirotByName.set(name, [...(sefirotByName.get(name) ?? []), pathwayId]);
  }
  const sefirot = [...sefirotByName].map(([name, pathwayIds]) => ({
    id: `sefirot:${pathwayIds.join("+")}`,
    kind: "sefirot" as const,
    name,
    pathwayIds,
    holderRef: "unlocated" as const,
    state: "unlocated" as const,
    sourceEventIds: [],
    loreEvidenceIds: [SEFIROT_EVIDENCE_ID, "lotm-03-011"],
  }));
  return { version: 1, characteristics: [], uniquenesses, sefirot, events: [] };
}

export function ensureHighSequenceLedger(value?: Partial<HighSequenceLedger> | null): HighSequenceLedger {
  const fresh = createHighSequenceLedger();
  if (!value || value.version !== 1) return fresh;
  const uniquenessById = new Map((value.uniquenesses ?? []).map((item) => [item.id, item]));
  const sefirotById = new Map((value.sefirot ?? []).map((item) => [item.id, item]));
  return {
    version: 1,
    characteristics: Array.isArray(value.characteristics) ? value.characteristics.filter((item) => STANDARD_PATHWAY_IDS.includes(item.pathwayId) && [1, 2, 3, 4].includes(item.sequence)) : [],
    uniquenesses: fresh.uniquenesses.map((item) => ({ ...item, ...uniquenessById.get(item.id), id: item.id, kind: "uniqueness" })),
    sefirot: fresh.sefirot.map((item) => ({ ...item, ...sefirotById.get(item.id), id: item.id, kind: "sefirot" })),
    events: Array.isArray(value.events) ? value.events.slice(-600) : [],
  };
}

function ledgerEvent(week: number, assetId: string, action: HighSequenceLedgerEvent["action"], sourceEventId: string, fromHolderRef?: HighAssetHolderRef, toHolderRef?: HighAssetHolderRef): HighSequenceLedgerEvent {
  return { id: `high-ledger:${week}:${assetId}:${action}:${sourceEventId}`, week, assetId, action, sourceEventId, fromHolderRef, toHolderRef };
}

export function claimHighSequenceCharacteristic(ledger: HighSequenceLedger, input: {
  pathwayId: StandardPathwayId;
  sequence: 1 | 2 | 3 | 4;
  holderRef: Exclude<HighAssetHolderRef, "unlocated">;
  week: number;
  sourceEventId: string;
  locationId?: string;
}) {
  const sequenceName = PATHWAY_SEQUENCE_LEDGER[input.pathwayId].sequences.find((item) => item.sequence === input.sequence)!.name;
  const sameSource = ledger.characteristics.find((item) => item.sourceEventIds.includes(input.sourceEventId));
  if (sameSource) return ledger;
  if (input.sequence === 1 && ledger.characteristics.filter((item) => item.pathwayId === input.pathwayId && item.sequence === 1).length >= 3) {
    throw new Error(`${PATHWAY_SEQUENCE_LEDGER[input.pathwayId].pathwayName}途径的三份序列1特性均已登记，不能凭空生成第四份。`);
  }
  const ordinal = ledger.characteristics.filter((item) => item.pathwayId === input.pathwayId && item.sequence === input.sequence).length + 1;
  const asset: HighSequenceCharacteristic = {
    id: `characteristic:${input.pathwayId}:${input.sequence}:${ordinal}`,
    pathwayId: input.pathwayId,
    sequence: input.sequence,
    sequenceName,
    holderRef: input.holderRef,
    state: "held",
    locationId: input.locationId,
    acquiredWeek: input.week,
    sourceEventIds: [input.sourceEventId],
    loreEvidenceIds: [PATHWAY_SEQUENCE_LEDGER[input.pathwayId].sequenceEvidenceId, "lotm-03-003", "lotm-03-004", "lotm-03-005"],
  };
  return { ...ledger, characteristics: [...ledger.characteristics, asset], events: [...ledger.events, ledgerEvent(input.week, asset.id, "claimed", input.sourceEventId, "unlocated", input.holderRef)].slice(-600) };
}

function claimUniqueAsset(ledger: HighSequenceLedger, kind: "uniqueness" | "sefirot", assetId: string, holderRef: Exclude<HighAssetHolderRef, "unlocated">, week: number, sourceEventId: string) {
  const collection = kind === "uniqueness" ? ledger.uniquenesses : ledger.sefirot;
  const asset = collection.find((item) => item.id === assetId);
  if (!asset) throw new Error(`高位账本中不存在${assetId}`);
  if (asset.sourceEventIds.includes(sourceEventId) && asset.holderRef === holderRef) return ledger;
  if (asset.holderRef !== "unlocated" && asset.holderRef !== holderRef && asset.state !== "contested") {
    throw new Error(`${asset.name}已由${asset.holderRef}持有；必须先通过世界行动形成转移或争夺结果。`);
  }
  const updated = { ...asset, holderRef, state: "held" as const, acquiredWeek: week, sourceEventIds: [...new Set([...asset.sourceEventIds, sourceEventId])] };
  const nextCollection = collection.map((item) => item.id === assetId ? updated : item);
  const event = ledgerEvent(week, assetId, "claimed", sourceEventId, asset.holderRef, holderRef);
  return kind === "uniqueness" ? { ...ledger, uniquenesses: nextCollection, events: [...ledger.events, event].slice(-600) } : { ...ledger, sefirot: nextCollection, events: [...ledger.events, event].slice(-600) };
}

export function claimPathwayUniqueness(ledger: HighSequenceLedger, pathwayId: StandardPathwayId, holderRef: Exclude<HighAssetHolderRef, "unlocated">, week: number, sourceEventId: string) {
  return claimUniqueAsset(ledger, "uniqueness", `uniqueness:${pathwayId}`, holderRef, week, sourceEventId);
}

export function claimPathwaySefirot(ledger: HighSequenceLedger, pathwayId: StandardPathwayId, holderRef: Exclude<HighAssetHolderRef, "unlocated">, week: number, sourceEventId: string) {
  const asset = ledger.sefirot.find((item) => item.pathwayIds.includes(pathwayId));
  if (!asset) throw new Error("知识库没有为该途径登记源质分组。 ");
  return claimUniqueAsset(ledger, "sefirot", asset.id, holderRef, week, sourceEventId);
}

export function highSequenceAdvancementRequirement(ledger: HighSequenceLedger, pathwayId: StandardPathwayId, targetSequence: number, holderRef: HighAssetHolderRef = "player") {
  if (targetSequence > 4) return { satisfied: true, missing: [] as string[] };
  const characteristics = ledger.characteristics.filter((item) => item.pathwayId === pathwayId && item.sequence === Math.max(1, targetSequence) && item.holderRef === holderRef);
  if (targetSequence >= 1) return { satisfied: characteristics.length >= 1, missing: characteristics.length ? [] : [`序列${targetSequence}非凡特性`] };
  const sequenceOneCount = ledger.characteristics.filter((item) => item.pathwayId === pathwayId && item.sequence === 1 && item.holderRef === holderRef).length;
  const uniqueness = ledger.uniquenesses.find((item) => item.pathwayIds.includes(pathwayId) && item.holderRef === holderRef);
  const missing = [...(sequenceOneCount >= 3 ? [] : [`序列1非凡特性 ${sequenceOneCount}/3`]), ...(uniqueness ? [] : ["对应途径唯一性"])];
  return { satisfied: missing.length === 0, missing };
}

export function incorporateAdvancementAsset(ledger: HighSequenceLedger, pathwayId: StandardPathwayId, targetSequence: number, holderRef: HighAssetHolderRef, week: number) {
  if (targetSequence > 4) return ledger;
  if (targetSequence === 0) {
    const ids = new Set([
      ...ledger.characteristics.filter((item) => item.pathwayId === pathwayId && item.sequence === 1 && item.holderRef === holderRef).slice(0, 3).map((item) => item.id),
      ...ledger.uniquenesses.filter((item) => item.pathwayIds.includes(pathwayId) && item.holderRef === holderRef).map((item) => item.id),
    ]);
    return {
      ...ledger,
      characteristics: ledger.characteristics.map((item) => ids.has(item.id) ? { ...item, state: "incorporated" as const } : item),
      uniquenesses: ledger.uniquenesses.map((item) => ids.has(item.id) ? { ...item, state: "incorporated" as const } : item),
      events: [...ledger.events, ...[...ids].map((id) => ledgerEvent(week, id, "incorporated", `advancement:${pathwayId}:0`, holderRef, holderRef))].slice(-600),
    };
  }
  const asset = ledger.characteristics.find((item) => item.pathwayId === pathwayId && item.sequence === targetSequence && item.holderRef === holderRef && item.state !== "incorporated");
  if (!asset) return ledger;
  return {
    ...ledger,
    characteristics: ledger.characteristics.map((item) => item.id === asset.id ? { ...item, state: "incorporated" as const } : item),
    events: [...ledger.events, ledgerEvent(week, asset.id, "incorporated", `advancement:${pathwayId}:${targetSequence}`, holderRef, holderRef)].slice(-600),
  };
}

export function applyHighSequenceActionResults(ledger: HighSequenceLedger, pathwayId: StandardPathwayId, inputs: { id: string; outcome: string; text: string; locationId?: string }[], week: number) {
  let next = ensureHighSequenceLedger(ledger);
  for (const input of inputs) {
    if (input.outcome !== "成功") continue;
    const names = PATHWAY_SEQUENCE_LEDGER[pathwayId].sequences;
    const explicitSequence = input.text.match(/序列\s*([0-4])/i)?.[1];
    const namedSequence = names.find((item) => input.text.includes(item.name) && item.sequence <= 4);
    const sequence = explicitSequence === undefined ? namedSequence?.sequence : Number(explicitSequence);
    if (/唯一性/.test(input.text)) {
      next = claimPathwayUniqueness(next, pathwayId, "player", week, input.id);
      continue;
    }
    if (/源质|源堡|混沌海|永暗之河|灾祸之城|失序之国|知识荒野|母巢|暗影世界|光之钥/.test(input.text)) {
      next = claimPathwaySefirot(next, pathwayId, "player", week, input.id);
      continue;
    }
    if (/非凡特性|高序列特性|特性/.test(input.text) && sequence !== undefined && sequence >= 1 && sequence <= 4) {
      next = claimHighSequenceCharacteristic(next, { pathwayId, sequence: sequence as 1 | 2 | 3 | 4, holderRef: "player", week, sourceEventId: input.id, locationId: input.locationId });
    }
  }
  return next;
}

export function validateHighSequenceLedger(ledger: HighSequenceLedger) {
  const issues: string[] = [];
  const ids = [...ledger.characteristics, ...ledger.uniquenesses, ...ledger.sefirot].map((item) => item.id);
  if (new Set(ids).size !== ids.length) issues.push("duplicate-asset-id");
  for (const pathwayId of STANDARD_PATHWAY_IDS) {
    if (ledger.uniquenesses.filter((item) => item.pathwayIds.includes(pathwayId)).length !== 1) issues.push(`${pathwayId}:uniqueness-count`);
    if (ledger.characteristics.filter((item) => item.pathwayId === pathwayId && item.sequence === 1).length > 3) issues.push(`${pathwayId}:sequence-one-overflow`);
  }
  if (ledger.sefirot.length !== 9) issues.push("sefirot-count");
  return { ok: issues.length === 0, issues };
}
