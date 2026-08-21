/**
 * Deterministic evidence and mutation-authority primitives for a world turn.
 *
 * This module deliberately has no model, UI, or persistence dependency. The
 * adapter builds claims from model output and this validator decides whether a
 * claim can enter the authoritative WorldKernel delta.
 */

export type RetrievalReceipt = {
  requestId: string;
  indexVersion: string;
  audienceRef: string;
  queryHash: string;
  filterHash: string;
  chunkIds: string[];
  contextHash: string;
};

export type ResourceDelta = {
  money?: number;
  manpower?: number;
  extraordinaryMaterials?: number;
  spirituality?: number;
};

export type MutationEffectKind =
  | "actor-state"
  | "faction-state"
  | "location-state"
  | "project-progress"
  | "knowledge"
  | "event";

export type MutationClaim = {
  proposalId: string;
  effectKind: MutationEffectKind;
  subjectRef: string;
  targetRefs: string[];
  resourceImpact?: ResourceDelta;
  sourceEventId?: string;
};

export type ExecutionPlanScope = {
  proposalId: string;
  participantRefs?: string[];
  targetRefs?: string[];
  holderRefs?: string[];
  commitments?: ResourceDelta;
  causeEventIds?: string[];
  /** Legacy callers that only supplied authorization boundaries remain readable. */
  legacyScope?: boolean;
};

export type MutationEventEvidence = {
  id: string;
  locationId?: string;
  actorIds?: string[];
  factionIds?: string[];
  sourceProposalIds?: string[];
};

export type MutationObservationEvidence = {
  id: string;
  eventId: string;
  visibility?: string;
  holderIds?: string[];
  holderRefs?: string[];
};

export type MutationValidationContext = {
  events: readonly MutationEventEvidence[];
  observations: readonly MutationObservationEvidence[];
  allowedLoreIds?: ReadonlySet<string>;
  /** Event ids normalized from the current world-adjudication response. */
  currentTurnEventIds?: ReadonlySet<string>;
};

export type MutationValidationResult = {
  ok: boolean;
  code?: "UNRELATED_PROPOSAL_MUTATION_REJECTED" | "MUTATION_EVIDENCE_REJECTED" | "MUTATION_RESOURCE_REJECTED";
  reasons: string[];
  escalation: boolean;
};

const EFFECT_KINDS = new Set<MutationEffectKind>([
  "actor-state",
  "faction-state",
  "location-state",
  "project-progress",
  "knowledge",
  "event",
]);

function nonEmpty(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function hasReference(allowed: ReadonlySet<string>, reference: string, allowWorldWildcard = false) {
  if (allowWorldWildcard && allowed.has("world:world")) return true;
  if (allowed.has(reference)) return true;
  // District and location are the same world scope at different API layers.
  if (reference.startsWith("location:") && allowed.has(`district:${reference.slice("location:".length)}`)) return true;
  if (reference.startsWith("district:") && allowed.has(`location:${reference.slice("district:".length)}`)) return true;
  return false;
}

function result(code: MutationValidationResult["code"], reasons: string[], escalation = true): MutationValidationResult {
  return { ok: false, code, reasons, escalation };
}

function validateResources(claim: MutationClaim, scope: ExecutionPlanScope): MutationValidationResult | null {
  if (!claim.resourceImpact) return null;
  const commitments = scope.commitments ?? {};
  const reasons: string[] = [];
  for (const key of ["money", "manpower", "extraordinaryMaterials", "spirituality"] as const) {
    const value = claim.resourceImpact[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      reasons.push(`资源影响 ${key} 不是有限数值`);
      continue;
    }
    const approved = commitments[key];
    if (approved !== undefined && Number.isFinite(approved) && Math.abs(value) > Math.max(0, approved)) {
      reasons.push(`资源影响 ${key} 超过已批准投入`);
    }
  }
  return reasons.length ? result("MUTATION_RESOURCE_REJECTED", reasons) : null;
}

function loreIdsFromClaim(claim: MutationClaim) {
  return claim.targetRefs.flatMap((reference) => {
    if (reference.startsWith("lore:")) return [reference.slice("lore:".length)];
    if (reference.startsWith("knowledge:")) return [];
    return [];
  });
}

/**
 * Check one semantic mutation claim against the exact executable plan scope.
 * Missing scope is accepted only for old callers; all production executable
 * plans now provide participant/target/holder refs through game-engine.
 */
export function validateMutationClaim(
  claim: MutationClaim,
  scope: ExecutionPlanScope,
  context: MutationValidationContext,
): MutationValidationResult {
  const reasons: string[] = [];
  if (!claim || typeof claim !== "object") return result("UNRELATED_PROPOSAL_MUTATION_REJECTED", ["mutation claim 为空"]);
  if (claim.proposalId !== scope.proposalId) reasons.push("mutation claim 未绑定当前提案");
  if (!EFFECT_KINDS.has(claim.effectKind)) reasons.push("mutation effectKind 未注册");
  if (!claim.subjectRef?.trim()) reasons.push("mutation subjectRef 为空");
  const targetRefs = nonEmpty(claim.targetRefs);
  if (!targetRefs.length && claim.effectKind !== "event") reasons.push("mutation targetRefs 为空");
  if (reasons.length) return result("UNRELATED_PROPOSAL_MUTATION_REJECTED", reasons);

  const participants = nonEmpty(scope.participantRefs);
  const targets = nonEmpty(scope.targetRefs);
  const holders = nonEmpty(scope.holderRefs);
  const hasScope = participants.length > 0 || targets.length > 0 || holders.length > 0;
  const allowed = new Set([...participants, ...targets, ...holders]);
  if (hasScope && !scope.legacyScope) {
    const claimRefs = [claim.subjectRef, ...targetRefs];
    const allowWorldWildcard = claim.effectKind === "event" || claim.effectKind === "location-state" || claim.effectKind === "knowledge";
    const related = claimRefs.some((reference) => hasReference(allowed, reference, allowWorldWildcard));
    const collateralEventWithoutDeclaredTarget = claim.effectKind === "event" && targets.length === 0;
    if (!related && !collateralEventWithoutDeclaredTarget) {
      return result("UNRELATED_PROPOSAL_MUTATION_REJECTED", [
        `${claim.effectKind} 的 subject/target 不在 ExecutionPlan 参与者、目标或持有者范围内`,
      ]);
    }
  }

  const resourceFailure = validateResources(claim, scope);
  if (resourceFailure) return resourceFailure;

  const events = context.events;
  const observations = context.observations;
  const sourceEvent = claim.sourceEventId ? events.find((event) => event.id === claim.sourceEventId) : undefined;
  if (claim.sourceEventId && context.currentTurnEventIds) {
    if (!context.currentTurnEventIds.has(claim.sourceEventId)) {
      return result("MUTATION_EVIDENCE_REJECTED", ["mutation claim 不能复用历史事件作为本轮证据"]);
    }
    if (sourceEvent && !sourceEvent.sourceProposalIds?.includes(claim.proposalId)) {
      return result("MUTATION_EVIDENCE_REJECTED", ["mutation claim 的来源事件未绑定当前提案"]);
    }
  }
  if (claim.effectKind === "location-state") {
    if (!claim.sourceEventId || !sourceEvent) {
      if (hasReference(allowed, "world:world", true)) return { ok: true, reasons: [], escalation: false };
      return result("MUTATION_EVIDENCE_REJECTED", ["地点变化必须绑定本轮已存在的 sourceEventId"]);
    }
    const locationId = claim.subjectRef.startsWith("location:") ? claim.subjectRef.slice("location:".length) : "";
    if (!locationId || sourceEvent.locationId !== locationId) {
      return result("MUTATION_EVIDENCE_REJECTED", ["地点变化的 sourceEventId 未证明同一地点"]);
    }
  }
  if (claim.effectKind === "knowledge") {
    if (!claim.sourceEventId || !sourceEvent) {
      return result("MUTATION_EVIDENCE_REJECTED", ["知识变化必须绑定来源事件"]);
    }
    if (!observations.some((observation) => observation.eventId === claim.sourceEventId)) {
      return result("MUTATION_EVIDENCE_REJECTED", ["知识变化缺少同一来源事件的观察证据"]);
    }
    const allowedLoreIds = context.allowedLoreIds;
    if (allowedLoreIds) {
      const unretrieved = loreIdsFromClaim(claim).filter((id) => !allowedLoreIds.has(id));
      if (unretrieved.length) {
        return result("MUTATION_EVIDENCE_REJECTED", [`引用了本轮未检索的 lore：${unretrieved.join("、")}`]);
      }
    }
  }
  if (claim.sourceEventId && !sourceEvent) {
    return result("MUTATION_EVIDENCE_REJECTED", [`sourceEventId 不存在：${claim.sourceEventId}`]);
  }
  if (claim.effectKind === "event" && hasScope && !scope.legacyScope) {
    const eventTargets = [claim.subjectRef, ...targetRefs];
    if (!eventTargets.some((reference) => hasReference(allowed, reference, true))) {
      return result("UNRELATED_PROPOSAL_MUTATION_REJECTED", ["事件的参与主体与目标均不属于提案范围"]);
    }
  }
  return { ok: true, reasons: [], escalation: false };
}

export function assertMutationClaim(
  claim: MutationClaim,
  scope: ExecutionPlanScope,
  context: MutationValidationContext,
) {
  const checked = validateMutationClaim(claim, scope, context);
  if (!checked.ok) throw new Error(`${checked.code ?? "MUTATION_REJECTED"}: ${checked.reasons.join("；")}`);
  return checked;
}
