// 方案评估：把 AI 的自由方案裁剪到能力领域内，而不是发明永久效果类型。
import { buildEnvelope } from "./envelope.ts";
import { validateAbilityPlan } from "./validator.ts";
import type { EffectPrimitive } from "../abilities/types.ts";
import type { AbilityPlanContext, AbilityPlanEnvelope, ProposedAbilityPlan } from "./types.ts";

const FAMILY_KEYWORDS: Record<string, string[]> = {
  perception: ["观察", "感知", "看见", "察觉", "灵视", "查看", "辨认"],
  divination: ["占卜", "预知", "判断", "推算", "启示", "方位", "预示"],
  concealment: ["隐匿", "隐藏", "伪装", "消失", "遮蔽", "掩盖"],
  deception: ["欺骗", "误导", "冒充", "伪造", "撒谎"],
  mental: ["精神", "暗示", "催眠", "影响", "忽略", "情绪", "记忆", "意志"],
  control: ["控制", "操控", "束缚", "命令", "牵线", "接管"],
  mobility: ["移动", "传送", "跳跃", "转移", "逃脱", "闪现", "瞬移"],
  physical: ["战斗", "攻击", "力量", "火焰", "加热", "塑形", "打击", "焚烧"],
  protection: ["保护", "防御", "替身", "转移伤害", "屏障", "抵挡"],
  binding: ["封印", "禁锢", "锁定"],
  curse: ["诅咒", "厄运", "灾祸"],
  ritual: ["仪式", "祭", "布置", "法阵"],
  summoning: ["召唤", "灵体", "驱使", "请神"],
  tracking: ["追踪", "脚印", "痕迹", "气味", "线索"],
  creation: ["创造", "制作", "锻造", "加工"],
  transformation: ["变形", "变身", "改变形态"],
};

const PRIMITIVE_WORDS: Record<string, string[]> = {
  DETECT: ["观察", "看见", "察觉", "查看", "感知"],
  REVEAL: ["看见", "揭示", "显现", "灵视"],
  INFER: ["判断", "推算", "占卜", "启示", "预示", "分析"],
  CONCEAL: ["隐藏", "隐匿", "遮蔽", "掩盖", "消失"],
  DECEIVE: ["误导", "欺骗", "冒充", "伪造"],
  INFLUENCE: ["影响", "忽略", "暗示", "情绪", "意志", "催眠"],
  CONTROL: ["控制", "操控", "命令", "接管", "束缚"],
  MOVE: ["移动", "传送", "转移", "闪现", "瞬移", "跳跃"],
  DAMAGE: ["攻击", "破坏", "打击", "焚烧"],
  PROTECT: ["保护", "防御", "抵挡", "屏障"],
  BIND: ["束缚", "封印", "禁锢", "锁定"],
  TRACE: ["追踪", "脚印", "痕迹", "气味"],
  SUMMON: ["召唤", "灵体", "驱使"],
  RITUAL_EFFECT: ["仪式", "祭", "法阵"],
  TRANSFORM: ["变形", "变身", "改变形态", "塑形", "锻造"],
  RESOURCE_CHANGE: ["制造", "创造", "加热", "加工"],
  HEAL: ["治疗", "治愈", "恢复伤势"],
  CREATE_LINK: ["联系", "连接"],
  BREAK_LINK: ["断开", "切断"],
};

const BANNED_PATTERNS: RegExp[] = [
  /无限(金币|资源|钱|财富)/,
  /成为神|直接封神/,
  /控制天使|命令天使/,
  /杀死(所有|全部)|让(所有|全部).*(消失|死亡)/,
  /重写世界规则|改变世界规则/,
  /永久(新)?能力|获得新途径/,
  /复活(死者|死人)/,
  /让所有警察|所有警察/,
];

const CLARIFICATION_PATTERNS: RegExp[] = [
  /随便|都行|你决定|试试看|不确定|或许|或者|怎样都|看着办/,
];

const PREPARATION_MISSING_PATTERNS: RegExp[] = [
  /没带|没有(媒介|材料|纸人|物品)|忘记准备|现场没有|缺少材料|缺少媒介/,
];

const RISK_PATTERNS: RegExp[] = [
  /强行|不惜代价|硬来|顶着反噬|拼了/,
];

// 家族标准原语：用于判断“领域内”而不是“动作名是否预注册”。
const FAMILY_CANONICAL_PRIMITIVES: Record<string, string[]> = {
  perception: ["DETECT", "REVEAL", "INFER"],
  divination: ["REVEAL", "INFER"],
  concealment: ["CONCEAL", "DECEIVE"],
  deception: ["DECEIVE", "INFLUENCE"],
  mental: ["INFLUENCE", "CONTROL", "CREATE_CONDITION"],
  control: ["CONTROL", "BIND"],
  mobility: ["MOVE"],
  physical: ["DAMAGE", "TRANSFORM", "RESOURCE_CHANGE"],
  protection: ["PROTECT", "HEAL", "REMOVE_CONDITION"],
  binding: ["BIND", "BREAK_LINK"],
  curse: ["CREATE_CONDITION", "RESOURCE_CHANGE"],
  ritual: ["RITUAL_EFFECT", "SUMMON"],
  summoning: ["SUMMON", "CREATE_LINK"],
  tracking: ["TRACE", "REVEAL"],
  creation: ["TRANSFORM", "RESOURCE_CHANGE", "CREATE_LINK"],
  transformation: ["TRANSFORM"],
};

function familiesForText(text: string): string[] {
  const matched = new Set<string>();
  for (const [family, keywords] of Object.entries(FAMILY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) matched.add(family);
  }
  return [...matched];
}

function primitivesForText(text: string): string[] {
  const matched = new Set<string>();
  for (const [primitive, words] of Object.entries(PRIMITIVE_WORDS)) {
    if (words.some((word) => text.includes(word))) matched.add(primitive);
  }
  return [...matched];
}

export function evaluateAbilityPlan(plan: ProposedAbilityPlan, context: AbilityPlanContext): AbilityPlanEnvelope {
  const baseErrors = validateAbilityPlan(plan);
  if (baseErrors.length) {
    return buildEnvelope({
      verdict: "REQUIRES_CLARIFICATION",
      reasons: baseErrors,
      clarificationQuestions: ["请补充：你想达成什么目标、用什么手段、调用哪项能力？"],
    });
  }

  const joined = `${plan.objective} ${plan.method} ${plan.proposedEffects.join(" ")}`;
  const banned = BANNED_PATTERNS.find((pattern) => pattern.test(joined));
  if (banned) {
    return buildEnvelope({
      verdict: "REJECT_OUTSIDE_ABILITY_DOMAIN",
      reasons: [`方案触及能力领域之外：${banned.source}`],
      limits: ["不得突破能力领域边界，也不得把未预注册动作当作拒绝理由——但此方案确实越界。"],
    });
  }

  const clarification = CLARIFICATION_PATTERNS.find((pattern) => pattern.test(joined));
  if (clarification || !plan.objective.trim() || !plan.method.trim()) {
    return buildEnvelope({
      verdict: "REQUIRES_CLARIFICATION",
      reasons: ["意图过于模糊或自相矛盾"],
      clarificationQuestions: [
        "请明确：目标是什么？使用哪项能力？现场有哪些可用物品？",
        "请说明可接受的风险边界（例如是否接受被察觉、是否可中途撤退）。",
      ],
    });
  }

  const ownedIds = new Set(context.ownedAbilities.map((ability) => ability.id));
  const requested = (plan.abilityIds ?? []).filter((id) => ownedIds.has(id));
  const coveredFamilies = new Set<string>();
  for (const ability of context.ownedAbilities) {
    if (requested.includes(ability.id)) coveredFamilies.add(ability.family);
  }
  for (const family of familiesForText(joined)) coveredFamilies.add(family);

  const missingPrep = PREPARATION_MISSING_PATTERNS.some((pattern) => pattern.test(joined));
  const needsMaterial = context.ownedAbilities.some(
    (ability) => requested.includes(ability.id) && ability.gameParameters?.materialRequired
  );
  const needsKnowledge = context.ownedAbilities.some(
    (ability) => requested.includes(ability.id) && ability.gameParameters?.knowledgeRequired
  );
  if (
    missingPrep ||
    (needsMaterial && !plan.usedItems.length) ||
    (needsKnowledge && !plan.usedKnowledge.length)
  ) {
    const requiredPreparations: string[] = [];
    if (needsMaterial && !plan.usedItems.length) requiredPreparations.push("准备仪式或施法材料");
    if (needsKnowledge && !plan.usedKnowledge.length) requiredPreparations.push("掌握真名或目标身份信息");
    if (missingPrep) requiredPreparations.push("补齐方案中提到的准备条件");
    return buildEnvelope({
      verdict: "REQUIRES_PREPARATION",
      reasons: ["方案缺少必要的媒介、材料或知识准备"],
      requiredPreparations,
      clarificationQuestions: ["是否先执行准备行动，或改用当前可用的替代手段？"],
    });
  }

  const effectPrimitives = new Set<string>();
  for (const effect of plan.proposedEffects) {
    for (const primitive of primitivesForText(effect)) effectPrimitives.add(primitive);
  }
  for (const primitive of primitivesForText(joined)) effectPrimitives.add(primitive);

  const canonicalPrimitives = new Set<string>();
  for (const ability of context.ownedAbilities) {
    if (coveredFamilies.has(ability.family) || requested.includes(ability.id)) {
      for (const effect of ability.effects) canonicalPrimitives.add(effect.primitive);
    }
  }
  for (const family of coveredFamilies) {
    for (const primitive of FAMILY_CANONICAL_PRIMITIVES[family] ?? []) canonicalPrimitives.add(primitive);
  }

  const effectPrimitivesOnly = new Set<string>();
  for (const effect of plan.proposedEffects) {
    for (const primitive of primitivesForText(effect)) effectPrimitivesOnly.add(primitive);
  }
  const inDomain = effectPrimitivesOnly.size > 0 && [...effectPrimitivesOnly].every((primitive) => canonicalPrimitives.has(primitive));
  const forced = RISK_PATTERNS.some((pattern) => pattern.test(joined));
  const risky = forced || context.spirituality <= 25 || context.occupiedConcentrationSlots >= context.concentrationSlots;
  const novel = plan.proposedEffects.some((effect) => {
    const primitives = primitivesForText(effect);
    return primitives.length === 0 || primitives.some((primitive) => !canonicalPrimitives.has(primitive));
  });

  if (coveredFamilies.size === 0 && requested.length === 0) {
    return buildEnvelope({
      verdict: "REJECT_OUTSIDE_ABILITY_DOMAIN",
      reasons: ["方案没有命中任何已拥有能力的领域，也没有调用具体能力"],
      limits: ["先声明使用哪项能力，或提供与能力领域相符的手段。"],
    });
  }

  if (!inDomain && novel) {
    const improvised = plan.proposedEffects[0] ?? "合理但未预注册的现场化效果";
    if (risky) {
      return buildEnvelope({
        verdict: "ACCEPT_WITH_LIMITS",
        reasons: ["方案属于能力领域内的创新用法，但伴随明显风险"],
        limits: ["效果按即兴发挥处理，强度受限；反噬与失控风险计入结算", "不得制造永久效果、无限资源或领域外后果"],
        suggestedEffects: [...effectPrimitives] as EffectPrimitive[],
        improvisedEffect: improvised,
        riskAdjustment: (forced ? 6 : 0) + (context.spirituality <= 25 ? 4 : 0),
      });
    }
    return buildEnvelope({
      verdict: "ACCEPT_AS_IMPROVISED_EFFECT",
      reasons: ["能力领域内、但未预注册的即兴用法"],
      limits: ["即兴效果只生效一次，强度不高于能力定义上限", "不建立新的永久效果类型"],
      suggestedEffects: [...effectPrimitives] as EffectPrimitive[],
      improvisedEffect: improvised,
      riskAdjustment: 2,
    });
  }

  if (risky) {
    return buildEnvelope({
      verdict: "ACCEPT_WITH_LIMITS",
      reasons: ["方案在能力领域内，但风险偏高"],
      limits: ["灵性/专注/污染边界照常生效；强行施展会把命运与失控风险计入结算"],
      suggestedEffects: [...effectPrimitives] as EffectPrimitive[],
      riskAdjustment: (forced ? 6 : 0) + (context.spirituality <= 25 ? 4 : 0),
    });
  }

  return buildEnvelope({
    verdict: "ACCEPT",
    reasons: ["方案落在已拥有能力的领域内"],
    suggestedEffects: [...effectPrimitives] as EffectPrimitive[],
  });
}
