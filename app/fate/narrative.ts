// 命运叙事校验：文学可以离谱，但不得推翻命运合同。
import type { AbilityOutcomeContract } from "../abilities/types.ts";
import type { FateAberrationContract } from "./types.ts";

const TROUBLE_MARKERS = /麻烦|债务|误会|暴露|异常|竟然|却被|但是|然而|麻烦|代价|欠|追查|名单|档案|注视|影子|谎言|混乱/;
const LONG_TERM_MARKERS = /数周|长期|档案|组织|债务|误会|登记|名单|目光|偏转|投影|通缉|悬赏|绰号|遗产|承诺|回函|回执/;

export function validateFateNarrative(
  abilityContract: AbilityOutcomeContract,
  fateContract: FateAberrationContract,
  narrative: string
): { violations: string[] } {
  const violations: string[] = [];
  const text = String(narrative ?? "");
  if (!fateContract.triggered) return { violations };

  if (fateContract.polarity === "boon" && /彻底失败|完全失控|一败涂地/.test(text) && !TROUBLE_MARKERS.test(text)) {
    violations.push("boon-written-as-disaster");
  }
  if (fateContract.polarity === "disaster" && /大获成功|完美无缺|毫无代价/.test(text) && !TROUBLE_MARKERS.test(text)) {
    violations.push("disaster-written-as-pure");
  }
  if (fateContract.twist === "cursed-boon" && !TROUBLE_MARKERS.test(text)) {
    violations.push("cursed-boon-missing-trouble");
  }
  if (fateContract.twist === "fortunate-disaster" && /彻底失败|完全落空/ .test(text) && !/意外|反而|却|线索|机会|更大的/.test(text)) {
    violations.push("fortunate-disaster-written-as-failure");
  }
  if (fateContract.twist === "full-disaster" && !TROUBLE_MARKERS.test(text)) {
    violations.push("full-disaster-missing-consequence");
  }
  if (fateContract.severity && fateContract.severity >= 3 && !LONG_TERM_MARKERS.test(text)) {
    violations.push("severity3-plus-missing-long-term-consequence");
  }
  if (
    fateContract.beliefProposals.some((proposal) => proposal.secrecy === "secret") &&
    /人尽皆知|全城都知道|所有人都知道/.test(text)
  ) {
    violations.push("secret-belief-leaked-to-everyone");
  }
  if (fateContract.recoveryHooks.length && !/可以|还能|仍有|还有|机会|收场|补救/.test(text)) {
    violations.push("recovery-hook-not-visible");
  }
  return { violations };
}

export function deterministicFateNarrative(fateContract: FateAberrationContract, abilityName: string): string {
  if (!fateContract.triggered) return "";
  const premise = fateContract.narrativePremise ?? "";
  const effects = fateContract.immediateEffects.map((item) => item.description).join("；");
  const hook = fateContract.recoveryHooks[0];
  const hookText = hook ? `这不是绝路：${hook.title}——${hook.detail}` : "局面仍可收拾。";
  return `${abilityName}触发了命运异常「${fateContract.templateTitle ?? ""}」（${fateContract.severity}级）。${premise}${effects ? ` ${effects}` : ""} ${hookText}`;
}
