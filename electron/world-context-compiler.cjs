"use strict";

const crypto = require("node:crypto");

const DEFAULT_MAX_CONTEXT_BYTES = 48 * 1024;
const MAX_CAUSE_DEPTH = 4;
const PRINCIPALS = new Set(["player", "organization", "canon", "world"]);
const ENTITY_KINDS = new Set(["actor", "faction", "location", "project", "event", "observation", "knowledge"]);

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stableSerialize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize).sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function idOf(value) {
  const id = text(value?.id);
  return id && id.length <= 256 ? id : "";
}

function weekOf(value) {
  const week = Number(value?.week ?? value?.updatedWeek ?? value?.acquiredWeek);
  return Number.isFinite(week) ? week : 0;
}

function ref(kind, id) {
  return `${kind}:${id}`;
}

function pathForKind(kind) {
  if (kind === "event") return "events";
  if (kind === "knowledge") return "knowledge";
  return `${kind}s`;
}

function valuesOf(value) {
  return Array.isArray(value) ? value : [];
}

function buildRecords(adjudicatorWorld) {
  const records = [];
  for (const kind of ["actor", "faction", "location", "project", "event", "observation", "knowledge"]) {
    const field = pathForKind(kind);
    for (const item of valuesOf(adjudicatorWorld?.[field])) {
      const id = idOf(item);
      if (!id) continue;
      records.push({ kind, id, ref: ref(kind, id), value: clone(item) });
    }
  }
  records.sort((left, right) => left.ref.localeCompare(right.ref));
  const byRef = new Map(records.map((item) => [item.ref, item]));
  const byEventId = new Map(records.filter((item) => item.kind === "event").map((item) => [item.id, item]));
  return { records, byRef, byEventId };
}

function resolveReference(raw, indexes, { allowEvent = true } = {}) {
  const value = text(raw);
  if (!value) throw new Error("WORLD_CONTEXT_EMPTY_REFERENCE");
  if (PRINCIPALS.has(value)) return { principal: value };
  if (indexes.byRef.has(value)) return indexes.byRef.get(value);
  if (allowEvent && indexes.byEventId.has(value)) return indexes.byEventId.get(value);
  if (allowEvent && value.startsWith("event:") && indexes.byEventId.has(value.slice("event:".length))) return indexes.byEventId.get(value.slice("event:".length));
  throw new Error(`WORLD_CONTEXT_UNKNOWN_REFERENCE: ${value}`);
}

function resolveEntityReference(raw, indexes) {
  return resolveReference(raw, indexes, { allowEvent: false });
}

function referencesFromPlan(item, executionPlan, indexes) {
  const refs = [];
  const add = (value, eventAllowed = false) => {
    const resolved = resolveReference(value, indexes, { allowEvent: eventAllowed });
    if (!resolved.principal) refs.push(resolved);
  };
  for (const value of [...valuesOf(executionPlan.participantRefs), ...valuesOf(executionPlan.targetRefs), ...valuesOf(executionPlan.holderRefs)]) add(value, false);
  for (const value of [...valuesOf(executionPlan.causeEventIds), ...valuesOf(item?.causeEventIds)]) add(value, true);
  if (item?.sourceEventId !== undefined || executionPlan.sourceEventId !== undefined) add(item?.sourceEventId ?? executionPlan.sourceEventId, true);
  return refs;
}

function addReference(reference, state, distance, reason) {
  if (reference.principal) return;
  const current = state.distance.get(reference.ref);
  if (current !== undefined && current <= distance) return;
  state.distance.set(reference.ref, distance);
  state.required.set(reference.ref, reason);
  state.queue.push({ record: reference, distance });
}

function locationReference(value, indexes) {
  const locationId = text(value);
  if (!locationId) return null;
  const normalized = locationId.startsWith("location:") ? locationId : `location:${locationId}`;
  return resolveEntityReference(normalized, indexes);
}

function ownerReference(value, indexes) {
  const ownerId = text(value);
  if (!ownerId || PRINCIPALS.has(ownerId)) return ownerId ? { principal: ownerId } : null;
  if (indexes.byRef.has(ownerId)) return indexes.byRef.get(ownerId);
  for (const kind of ["actor", "faction", "project"]) {
    if (indexes.byRef.has(`${kind}:${ownerId}`)) return indexes.byRef.get(`${kind}:${ownerId}`);
  }
  throw new Error(`WORLD_CONTEXT_UNKNOWN_REFERENCE: ${ownerId}`);
}

function expandRequired(state, indexes) {
  while (state.queue.length) {
    const current = state.queue.shift();
    const value = current.record.value;
    const distance = current.distance + 1;
    if (current.record.kind === "actor" || current.record.kind === "faction") {
      const location = locationReference(value.locationId, indexes);
      if (location) addReference(location, state, distance, "entity-location");
    } else if (current.record.kind === "project") {
      const owner = ownerReference(value.ownerId, indexes);
      if (owner) addReference(owner, state, distance, "project-owner");
      const location = locationReference(value.locationId, indexes);
      if (location) addReference(location, state, distance, "project-location");
    } else if (current.record.kind === "event") {
      const actorIds = valuesOf(value.actorIds);
      for (const actorId of actorIds) addReference(resolveEntityReference(`actor:${actorId}`, indexes), state, distance, "event-actor");
      for (const factionId of valuesOf(value.factionIds)) addReference(resolveEntityReference(`faction:${factionId}`, indexes), state, distance, "event-faction");
      const location = locationReference(value.locationId, indexes);
      if (location) addReference(location, state, distance, "event-location");
      if (current.distance < MAX_CAUSE_DEPTH) {
        for (const causeId of valuesOf(value.causeIds)) addReference(resolveReference(causeId, indexes, { allowEvent: true }), state, distance, "causal-ancestor");
      }
    }
  }
  for (const record of indexes.records) {
    if (record.kind === "observation" && state.required.has(`event:${text(record.value.eventId)}`)) {
      addReference(record, state, 1, "event-observation");
    }
    if (record.kind === "knowledge" && state.required.has(`event:${text(record.value.sourceEventId)}`)) {
      addReference(record, state, 1, "event-knowledge");
    }
  }
}

function normalizedPlans(input, indexes, state) {
  const plans = valuesOf(input?.unifiedActionPlans).flatMap((item) => {
    const candidate = recordOf(item);
    const executionPlan = recordOf(candidate?.executionPlan);
    if (!executionPlan || executionPlan.executable !== true) return [];
    const proposalId = text(executionPlan.proposalId ?? candidate?.proposalId);
    if (!proposalId) throw new Error("WORLD_CONTEXT_INVALID_EXECUTABLE_PLAN");
    const refs = referencesFromPlan(candidate, executionPlan, indexes);
    for (const record of refs) addReference(record, state, 0, "must-include-plan-reference");
    return [{
      source: text(candidate?.source) || "unknown",
      ...(text(candidate?.actionId) ? { actionId: text(candidate.actionId) } : {}),
      ...(text(candidate?.agentRef) ? { agentRef: text(candidate.agentRef) } : {}),
      proposalId,
      executionPlan: clone(executionPlan),
    }];
  });
  return plans.sort((left, right) => left.proposalId.localeCompare(right.proposalId));
}

function sortRecords(records) {
  return [...records].sort((left, right) => weekOf(right.value) - weekOf(left.value) || left.ref.localeCompare(right.ref));
}

function groupSelected(records) {
  const output = { actors: [], factions: [], locations: [], projects: [], events: [], observations: [], knowledge: [] };
  for (const record of sortRecords(records)) output[pathForKind(record.kind)].push(clone(record.value));
  return output;
}

function contextBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function makeReceipt({ inputHash, commit, tree, budgetBytes, allRecords, selected, reasons }) {
  const includedIds = [...selected].map((record) => record.ref).sort();
  const omittedIds = allRecords.filter((record) => !selected.has(record)).map((record) => record.ref).sort();
  return {
    commit: text(commit) || "unknown",
    tree: text(tree) || "unknown",
    budgetBytes,
    includedIds,
    omittedIds,
    reasons: Object.fromEntries(omittedIds.map((id) => [id, reasons.get(id) || "background-omitted"])),
    inputHash,
    mustIncludeTruncation: 0,
  };
}

function buildContext({ input, plans, allRecords, selected, reasons, inputHash, commit, tree, budgetBytes }) {
  const receipt = makeReceipt({ inputHash, commit, tree, budgetBytes, allRecords, selected, reasons });
  return {
    version: 1,
    budgetBytes,
    executionPlans: plans,
    adjudicatorWorld: {
      currentWeek: Number(input?.adjudicatorWorld?.currentWeek) || 0,
      currentDate: text(input?.adjudicatorWorld?.currentDate),
      revision: Number(input?.adjudicatorWorld?.revision) || 0,
      ...groupSelected([...selected]),
    },
    omissionReceipt: receipt,
  };
}

function canonicalDigestInput(input, plans, allRecords) {
  return canonicalize({
    adjudicatorWorld: {
      currentWeek: input?.adjudicatorWorld?.currentWeek,
      currentDate: input?.adjudicatorWorld?.currentDate,
      revision: input?.adjudicatorWorld?.revision,
    },
    executionPlans: plans,
    records: allRecords.map((record) => ({ kind: record.kind, id: record.id, value: record.value })),
  });
}

function compileWorldContext(input, options = {}) {
  const source = recordOf(input);
  if (!source) throw new Error("WORLD_CONTEXT_INPUT_INVALID");
  const budgetBytes = Number.isInteger(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_CONTEXT_BYTES;
  const indexes = buildRecords(recordOf(source.adjudicatorWorld) ?? {});
  const state = { required: new Map(), distance: new Map(), queue: [] };
  const plans = normalizedPlans(source, indexes, state);
  expandRequired(state, indexes);
  const required = new Set([...state.required.keys()].map((key) => indexes.byRef.get(key)).filter(Boolean));
  const allRecords = indexes.records;
  const digest = sha256(stableSerialize(canonicalDigestInput(source, plans, allRecords)));
  const reasons = new Map(state.required);
  let selected = new Set(required);
  let result = buildContext({ input: source, plans, allRecords, selected, reasons, inputHash: digest, commit: options.commit ?? source.commit, tree: options.tree ?? source.tree, budgetBytes });
  if (contextBytes(result) > budgetBytes) throw new Error("WORLD_CONTEXT_REQUIRED_SET_OVERFLOW");

  const background = allRecords
    .filter((record) => !selected.has(record))
    .sort((left, right) => (state.distance.get(left.ref) ?? 999) - (state.distance.get(right.ref) ?? 999) || weekOf(right.value) - weekOf(left.value) || left.ref.localeCompare(right.ref));
  for (const candidate of background) {
    const trial = new Set(selected);
    trial.add(candidate);
    const trialResult = buildContext({ input: source, plans, allRecords, selected: trial, reasons, inputHash: digest, commit: options.commit ?? source.commit, tree: options.tree ?? source.tree, budgetBytes });
    if (contextBytes(trialResult) <= budgetBytes) selected = trial;
    else reasons.set(candidate.ref, "background-budget");
  }
  result = buildContext({ input: source, plans, allRecords, selected, reasons, inputHash: digest, commit: options.commit ?? source.commit, tree: options.tree ?? source.tree, budgetBytes });
  while (contextBytes(result) > budgetBytes) {
    const removable = [...selected].filter((record) => !state.required.has(record.ref)).sort((left, right) => state.distance.get(right.ref) - state.distance.get(left.ref) || weekOf(left.value) - weekOf(right.value) || right.ref.localeCompare(left.ref))[0];
    if (!removable) throw new Error("WORLD_CONTEXT_REQUIRED_SET_OVERFLOW");
    selected.delete(removable);
    reasons.set(removable.ref, "background-receipt-budget");
    result = buildContext({ input: source, plans, allRecords, selected, reasons, inputHash: digest, commit: options.commit ?? source.commit, tree: options.tree ?? source.tree, budgetBytes });
  }
  return result;
}

module.exports = {
  DEFAULT_MAX_CONTEXT_BYTES,
  MAX_CAUSE_DEPTH,
  compileWorldContext,
};
