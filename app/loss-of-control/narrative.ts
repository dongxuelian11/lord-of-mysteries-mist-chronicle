// 失控叙事校验：文学可以夸张，但不得推翻合同阶段与症状。
import type { LossOfControlContract } from "./types.ts";

export function validateControlNarrative(contract: LossOfControlContract, narrative: string): { violations: string[] } {
  const violations: string[] = [];
  const text = String(narrative ?? "");
  if (!contract.triggered) return { violations };
  if (contract.stageAfter === "stable" && /失控|发疯|暴走/.test(text)) violations.push("stable-written-as-loss");
  if ((contract.stageAfter === "partial-loss" || contract.stageAfter === "contained-loss") && /完全没事|毫无异常/.test(text)) {
    violations.push("loss-written-as-normal");
  }
  if (contract.stageAfter === "contained-loss" && !/监护|治疗|压制|恢复|休息/.test(text)) {
    violations.push("contained-loss-missing-recovery");
  }
  if (contract.symptoms.length && !contract.symptoms.some((symptom) => text.includes(symptom.slice(0, 6)))) {
    violations.push("symptoms-not-visible");
  }
  return { violations };
}

export function deterministicControlNarrative(contract: LossOfControlContract, actorName: string): string {
  if (!contract.triggered) return "";
  const symptomText = contract.symptoms.join("；");
  const recovery = contract.recoveryPlanProposals[0]
    ? `必须执行恢复计划：${contract.recoveryPlanProposals[0].objective}`
    : "需要通过休整与治疗降低风险";
  return `${actorName}进入失控阶段「${contract.stageAfter}」。${symptomText} ${recovery}。`;
}
