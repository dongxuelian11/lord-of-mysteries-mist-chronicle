// 动态长期记忆公开入口。
export * from "./types.ts";
export * from "./config.ts";
export { buildMemoryIndexes, emptyMemoryState, type MemoryIndexes } from "./indexer.ts";
export {
  deriveMemory,
  deriveMemoryFromWorldState,
  deriveLocalMemory,
  markMemoryPresented,
  markMemoryRecalled,
  submitMemoryDelivery,
  beliefPropositionKey,
  ensureAudienceStates,
  audienceKey,
  type MemoryReceiptDescriptor,
} from "./derive.ts";
export {
  activationScore,
  recallState,
  eventActivation,
  beliefActivation,
  rehearseBelief,
  eventNeverDecays,
} from "./decay.ts";
export {
  visibleEvents,
  visibleBeliefs,
  visibleCommitments,
  visibleRelationshipCauses,
  visiblePlans,
  type MemoryAudience,
} from "./permissions.ts";
export { buildSceneMemory, type SceneMemoryRequest } from "./retriever.ts";
export { recordMemoryTrace, recentMemoryTraces, memoryTraceCount } from "./trace.ts";
export {
  renderDynamicMemoryContext,
  memoryContextIds,
  memoryPromptBlock,
  memoryPromptBlockWithIds,
} from "./prompt.ts";
export {
  actorAudience,
  playerAudience,
  narratorAudience,
  worldSystemAudience,
  runAcceptedModelCall,
} from "./receipts.ts";
