// 自然语言意图解析：确定性匹配，模型仅辅助表达；不直接改变世界状态。
import type { AbilityDefinition, AbilityIntent } from "./types.ts";
import { stableEntityId } from "../stable-id.ts";

export function parseAbilityIntent(
  text: string,
  definitions: AbilityDefinition[],
  actorId: string,
  actionId?: string
): AbilityIntent {
  const normalized = text.trim();
  const matched = definitions
    .filter((definition) => normalized.includes(definition.name))
    .sort((left, right) => right.name.length - left.name.length);
  const requestedAbilityIds = matched.length ? [matched[0].id] : [];
  if (!requestedAbilityIds.length) {
    // 目的关键词回退：确定性选择，不猜测模糊语义
    const fallback: [RegExp, string][] = [
      [/占卜|预言|卦|卜/, "divination"],
      [/位置|下落|在哪里|寻找|联系/, "divination"],
      [/追查|追踪|踪迹|脚印/, "track"],
      [/隐藏|伪装|遮蔽/, "paper-substitute"],
      [/催眠|暗示|影响/, "deep-hypnosis"],
      [/传送|穿梭|撤离/, "short-teleport"],
    ];
    const matchedFallback = fallback.find(([pattern]) => pattern.test(normalized));
    if (matchedFallback) requestedAbilityIds.push(matchedFallback[1]);
  }
  const mediumRefs: string[] = [];
  const materialRefs: string[] = [];
  const preparationRefs: string[] = [];
  if (/纸人|纸偶|替代物|傀儡/.test(normalized)) mediumRefs.push("medium:paper-substitute");
  if (/火焰|烛火|壁炉/.test(normalized)) mediumRefs.push("medium:flame");
  if (/挂坠|封印物|物品|随身/.test(normalized)) mediumRefs.push("medium:artifact");
  if (/纸牌|薄片/.test(normalized)) materialRefs.push("material:card");
  if (/材料|仪式材料/.test(normalized)) materialRefs.push("material:ritual");
  if (/视线|看到|直视/.test(normalized)) preparationRefs.push("sight-confirmed");
  if (/已知|调查过|情报/.test(normalized)) preparationRefs.push("knowledge:confirmed");
  if (/真名/.test(normalized)) preparationRefs.push("knowledge:true-name");
  if (/准备|预设/.test(normalized)) preparationRefs.push("prep:declared");
  return {
    actionId: actionId ?? stableEntityId("ability-action", actorId, normalized),
    actorId,
    objective: normalized.slice(0, 200),
    requestedAbilityIds,
    targetRefs: [],
    method: normalized.slice(0, 200),
    preparationRefs: [...new Set(preparationRefs)],
    mediumRefs: [...new Set(mediumRefs)],
    materialRefs: [...new Set(materialRefs)],
    acceptableRisks: /接受|承受/.test(normalized) ? ["exposure"] : [],
    retreatConditions: /撤退|退出|中止/.test(normalized) ? ["on-detection"] : [],
  };
}

export function abilityIntentNeedsClarification(intent: AbilityIntent): boolean {
  return intent.requestedAbilityIds.length === 0 || intent.objective.length === 0;
}
