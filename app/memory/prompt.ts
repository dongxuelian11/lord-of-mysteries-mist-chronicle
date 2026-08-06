// 动态记忆 Prompt 渲染：带标签的结构化上下文，供六类正式调用点接入。
import { buildMemoryIndexes } from "./indexer.ts";
import { buildSceneMemory } from "./retriever.ts";
import type { DynamicMemoryContext, DynamicMemoryState, SceneType } from "./types.ts";

function refLine(ref: { id: string; kind: string; week: number; summary: string; confidence?: number }): string {
  const confidence = ref.confidence !== undefined ? ` (置信度${Math.round(ref.confidence * 100)}%)` : "";
  return `- [${ref.kind}:${ref.week}] ${ref.id}：${ref.summary}${confidence}`;
}

export function renderDynamicMemoryContext(context: DynamicMemoryContext): string {
  const lines: string[] = ["[DYNAMIC MEMORY]"];
  lines.push("[WORLD FACTS]");
  lines.push(...context.worldFacts.map(refLine));
  lines.push("[ACTOR BELIEFS]");
  lines.push(...context.actorBeliefs.map(refLine));
  lines.push("[UNCERTAINTIES]");
  lines.push(...context.uncertainties.map(refLine));
  lines.push("[CONTRADICTIONS]");
  lines.push(...context.contradictions.map(refLine));
  lines.push("[ACTIVE COMMITMENTS]");
  lines.push(...context.commitments.map(refLine));
  lines.push("[RELATIONSHIP CAUSES]");
  lines.push(...context.relationshipCauses.map(refLine));
  lines.push("[ACTIVE PLANS]");
  lines.push(...context.activePlans.map(refLine));
  lines.push("[FORBIDDEN INFERENCES]");
  lines.push(...context.forbiddenInferences.map((item) => `- ${item}`));
  return lines.join("\n");
}

export function memoryContextIds(context: DynamicMemoryContext): string[] {
  return [
    ...context.worldFacts,
    ...context.actorBeliefs,
    ...context.commitments,
    ...context.relationshipCauses,
    ...context.activePlans,
    ...context.uncertainties,
    ...context.contradictions,
  ].map((ref) => ref.id);
}

export function memoryPromptBlock(
  state: DynamicMemoryState,
  sceneType: SceneType,
  actorId?: string,
  currentWeek?: number
): string {
  if (!state || !state.events) return "";
  const context = buildSceneMemory({
    sceneType,
    state,
    indexes: buildMemoryIndexes(state),
    currentWeek: currentWeek ?? Math.max(0, ...state.events.map((event) => event.week)) + 1,
    actorId,
  });
  return renderDynamicMemoryContext(context);
}

export function memoryPromptBlockWithIds(
  state: DynamicMemoryState,
  sceneType: SceneType,
  actorId?: string,
  currentWeek?: number
): { text: string; ids: string[] } {
  if (!state || !state.events) return { text: "", ids: [] };
  const context = buildSceneMemory({
    sceneType,
    state,
    indexes: buildMemoryIndexes(state),
    currentWeek: currentWeek ?? Math.max(0, ...state.events.map((event) => event.week)) + 1,
    actorId,
  });
  return { text: renderDynamicMemoryContext(context), ids: memoryContextIds(context) };
}
