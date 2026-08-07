// 叙事一致性：合同不可被叙事推翻；失败/反噬不可写成成功。
import type { AbilityOutcomeContract } from "./types.ts";

export function validateNarrative(
  contract: AbilityOutcomeContract,
  narrative: string
): { violations: string[] } {
  const violations: string[] = [];
  const text = String(narrative ?? "");
  if (
    (contract.result === "failure" || contract.result === "backlash" || contract.result === "fail-with-progress") &&
    /成功|完成了|达成了|得手/.test(text)
  ) {
    violations.push("failure-written-as-success");
  }
  if (contract.result === "failure" && /反噬|失控|污染/.test(text)) {
    violations.push("failure-added-backlash");
  }
  if (contract.committedCosts.length && /未消耗|没有代价|毫无损耗/.test(text)) {
    violations.push("cost-ignored");
  }
  if (contract.blockedEffects.length && /被阻断|无效|失败/.test(text) === false && /效果|成功/.test(text)) {
    violations.push("blocked-effect-mentioned");
  }
  return { violations };
}

export function deterministicNarrative(contract: AbilityOutcomeContract, abilityName: string): string {
  const map: Record<string, string> = {
    "critical-success": `${abilityName}以超出预期的清晰度完成，获得额外合法优势。`,
    success: `${abilityName}按契约完成主要目标，代价照常支付。`,
    "partial-success": `${abilityName}只完成部分目标，效果较弱或信息模糊。`,
    "fail-with-progress": `${abilityName}未完成主要目标，但留下可继续追查的线索与识别。`,
    failure: `${abilityName}没有产生主要效果，尝试成本照常支付。`,
    backlash: `${abilityName}失控并引发反噬，结果不能写成成功。`,
  };
  return map[contract.result] ?? `${abilityName}结算为${contract.result}。`;
}
