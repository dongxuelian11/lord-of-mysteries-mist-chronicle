export type AudienceProjectionCore = {
  audienceRef(audience: unknown): string;
  canSee(visibility: string, holderIds: string[] | undefined, holderRefs: string[] | undefined, audience: unknown): boolean;
  deriveAllowedLocationIds(input: {
    locations: unknown[];
    currentLocationId?: string;
    visibleEvents: unknown[];
    ownedProjects?: unknown[];
  }): string[];
  holderIncludes(holderIds: string[] | undefined, holderRefs: string[] | undefined, reference: string, legacyId: string): boolean;
  projectWorldForAudience(kernel: unknown, audience: unknown, hashFn?: (value: string) => string): unknown;
  selectKnowledge(knowledge: unknown[], maximum?: number): { records: unknown[]; ids: string[] };
};

declare global {
  var __GMZZ_AUDIENCE_PROJECTION__: AudienceProjectionCore | undefined;
}
