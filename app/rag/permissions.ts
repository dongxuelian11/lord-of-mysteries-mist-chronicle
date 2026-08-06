// 权限与剧透过滤：任何候选在进入最终上下文前都必须通过这里。
import type { LoreChunk, RagFilters } from "./types";

export type PermissionDecision = {
  ok: boolean;
  reason?: string;
};

const VISIBILITY_ORDER: Record<string, number> = {
  public: 0,
  restricted: 1,
  secret: 2,
  cosmic: 3,
};

const SPOILER_ORDER: Record<string, number> = {
  none: 0,
  volume1: 1,
  volume2: 2,
  volume3: 3,
  volume4: 4,
  volume5: 5,
  volume6: 6,
  volume7: 7,
  all: 8,
};

function horizonDecision(
  chunk: LoreChunk,
  horizon: NonNullable<RagFilters["horizon"]>
): PermissionDecision | null {
  if (chunk.work && horizon.work && chunk.work !== horizon.work) {
    return { ok: false, reason: "cross-work" };
  }
  if (
    horizon.maxVolume !== null &&
    horizon.maxVolume !== undefined &&
    chunk.volumeNumber !== undefined &&
    chunk.volumeNumber > horizon.maxVolume
  ) {
    return { ok: false, reason: "future-volume" };
  }
  if (
    horizon.maxAbsoluteChapter !== null &&
    horizon.maxAbsoluteChapter !== undefined &&
    chunk.absoluteChapter !== undefined &&
    chunk.absoluteChapter > horizon.maxAbsoluteChapter
  ) {
    return { ok: false, reason: "future-chapter" };
  }
  if (
    chunk.eventId &&
    horizon.allowedEventIds.length &&
    !horizon.allowedEventIds.includes(chunk.eventId)
  ) {
    return { ok: false, reason: "event-not-allowed" };
  }
  if (
    chunk.identityIds?.length &&
    !chunk.identityIds.every((identity) =>
      horizon.revealedIdentityIds.includes(identity)
    )
  ) {
    return { ok: false, reason: "identity" };
  }
  return null;
}

function crossWorkDecision(
  chunk: LoreChunk,
  horizon: NonNullable<RagFilters["horizon"]>
): PermissionDecision | null {
  if (chunk.work && horizon.work && chunk.work !== horizon.work) {
    return { ok: false, reason: "cross-work" };
  }
  return null;
}

export function canSeeVisibility(
  visibility: string,
  filters: RagFilters,
  knownIds: Set<string>,
  chunk: LoreChunk
): PermissionDecision {
  const audience = filters.audience;
  if (audience.kind === "world") return { ok: true };
  if (visibility === "public") return { ok: true };
  if (
    knownIds.has(chunk.id) ||
    knownIds.has(chunk.documentId) ||
    knownIds.has(chunk.title) ||
    knownIds.has(chunk.sourceLocator)
  ) {
    return { ok: true };
  }
  if (visibility === "cosmic") return { ok: false, reason: "visibility:cosmic" };
  if (visibility === "restricted") {
    const grant = chunk.topics.some((topic) => audience.topicGrants.includes(topic));
    return grant ? { ok: true } : { ok: false, reason: "topic-grant" };
  }
  return { ok: false, reason: "visibility:secret" };
}

export function filterChunk(
  chunk: LoreChunk,
  filters: RagFilters,
  knownIds: Set<string>
): PermissionDecision {
  if (filters.visibility && !filters.visibility.includes(chunk.visibility)) {
    return { ok: false, reason: "visibility-filter" };
  }
  if (filters.canonLayers && !filters.canonLayers.includes(chunk.canonLayer)) {
    return { ok: false, reason: "canon-layer" };
  }
  const visibility = canSeeVisibility(chunk.visibility, filters, knownIds, chunk);
  if (!visibility.ok) return visibility;

  if (filters.horizon) {
    const crossWork = crossWorkDecision(chunk, filters.horizon);
    if (crossWork) return crossWork;
  }
  if (filters.audience.kind === "world") return { ok: true };

  const maxSpoiler = filters.maxSpoilerScope ?? "all";
  if (SPOILER_ORDER[chunk.spoilerScope] > SPOILER_ORDER[maxSpoiler]) {
    return { ok: false, reason: "spoiler" };
  }
  if (filters.horizon) {
    const horizon = horizonDecision(chunk, filters.horizon);
    if (horizon) return horizon;
  }
  if (
    filters.allowedVolumes?.length &&
    chunk.timeline?.volume !== undefined &&
    !filters.allowedVolumes.includes(chunk.timeline.volume)
  ) {
    return { ok: false, reason: "volume" };
  }
  if (
    filters.week !== undefined &&
    chunk.timeline?.week !== undefined &&
    chunk.timeline.week > filters.week
  ) {
    return { ok: false, reason: "future-week" };
  }
  if (
    filters.allowedVolumes?.length &&
    chunk.spoilerScope === "none" &&
    chunk.timeline?.volume === undefined
  ) {
    return { ok: true };
  }
  return { ok: true };
}

export function visibleRank(chunk: LoreChunk): number {
  return VISIBILITY_ORDER[chunk.visibility] ?? 3;
}
