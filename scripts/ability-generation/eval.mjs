// 生成式能力评测：20 个开发者未预注册的自由用法，六种包络判定都要出现。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runGenerativeAbilityEval() {
  const generation = await loadRuntimeModule("app/ability-generation/index.ts");
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const definitions = abilities.abilityDefinitions();
  const ownedIds = [
    "spirit-vision",
    "divination",
    "paper-substitute",
    "flame-jump",
    "deep-hypnosis",
    "short-teleport",
    "track",
    "ritual-design",
    "fire-shaping",
  ];
  const context = {
    ownedAbilities: definitions.filter((item) => ownedIds.includes(item.id)),
    inventoryIds: [],
    knowledgeRefs: [],
    spirituality: 50,
    concentrationSlots: 1,
    occupiedConcentrationSlots: 0,
  };
  const cases = [
    { name: "observe-spirit-traces", expected: "ACCEPT", plan: { objective: "查看房间里有没有灵体痕迹", abilityIds: ["spirit-vision"], method: "用灵视观察", proposedEffects: ["观察灵体痕迹"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "divination-safety", expected: "ACCEPT", plan: { objective: "判断今晚行动是否安全", abilityIds: ["divination"], method: "围绕今晚行动占卜", proposedEffects: ["判断行动风险"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "fire-heat-lock-forced", expected: "ACCEPT_WITH_LIMITS", plan: { objective: "打开上锁的门", abilityIds: ["fire-shaping"], method: "用火焰塑形加热门锁，强行撬开，不惜代价", proposedEffects: ["加热门锁"], usedItems: [], usedKnowledge: [], risks: ["反噬"] } },
    { name: "mental-ignore-file-risky", expected: "ACCEPT_WITH_LIMITS", plan: { objective: "让目标不注意到桌上的文件", abilityIds: ["deep-hypnosis"], method: "用精神影响让目标忽略文件，顶着反噬做", proposedEffects: ["让目标忽略文件"], usedItems: [], usedKnowledge: [], risks: ["反噬"] } },
    { name: "mobility-psychic-grab", expected: "ACCEPT_AS_IMPROVISED_EFFECT", plan: { objective: "拿到桌上的钥匙", abilityIds: ["short-teleport"], method: "用移动能力隔空取物", proposedEffects: ["隔空取物"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "conceal-cat-footsteps", expected: "ACCEPT_AS_IMPROVISED_EFFECT", plan: { objective: "不被发现地穿过走廊", abilityIds: ["paper-substitute"], method: "用隐匿让脚步声听起来像猫", proposedEffects: ["脚步声变成猫的脚步声"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "paper-substitute-no-medium", expected: "REQUIRES_PREPARATION", plan: { objective: "替自己挡一刀", abilityIds: ["paper-substitute"], method: "用纸人替身挡下攻击，但没带纸人", proposedEffects: ["替身挡刀"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "divination-no-medium", expected: "REQUIRES_PREPARATION", plan: { objective: "追踪目标位置", abilityIds: ["divination"], method: "用占卜追查，但没有媒介", proposedEffects: ["追踪位置"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "vague-anything", expected: "REQUIRES_CLARIFICATION", plan: { objective: "处理一下这个麻烦", abilityIds: ["spirit-vision"], method: "随便用用，你看着办", proposedEffects: ["处理麻烦"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "perception-erase-police", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "让所有警察忘记我的存在", abilityIds: ["spirit-vision"], method: "用灵视让所有警察忘记", proposedEffects: ["让所有警察忘记"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "fire-infinite-coins", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "制造无限金币", abilityIds: ["fire-shaping"], method: "用火焰塑形制造无限金币", proposedEffects: ["无限金币"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "divination-tamper-check", expected: "ACCEPT", plan: { objective: "判断是否有人干扰了今晚的仪式", abilityIds: ["divination"], method: "围绕仪式是否被干扰占卜", proposedEffects: ["判断干扰"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "divination-exhausted", expected: "ACCEPT_WITH_LIMITS", plan: { objective: "追查失踪者的下落", abilityIds: ["divination"], method: "灵性快枯竭了，还是要强行占卜追查", proposedEffects: ["追查下落"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "mental-forget-words", expected: "ACCEPT_AS_IMPROVISED_EFFECT", plan: { objective: "让目标不记得自己说过什么", abilityIds: ["deep-hypnosis"], method: "用精神影响让目标五秒后忘记说过的话", proposedEffects: ["忘记自己说过的话"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "ritual-summon-no-material", expected: "REQUIRES_PREPARATION", plan: { objective: "召唤灵体", abilityIds: ["ritual-design"], method: "布置仪式召唤灵体，但没有材料", proposedEffects: ["召唤灵体"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "vague-try", expected: "REQUIRES_CLARIFICATION", plan: { objective: "随便试试这个能力", abilityIds: ["track"], method: "或许有用，试试看", proposedEffects: ["试试"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "track-footprints", expected: "ACCEPT", plan: { objective: "沿着脚印找到他", abilityIds: ["track"], method: "追踪地上的脚印", proposedEffects: ["追踪脚印"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "divination-rewrite-rules", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "重写世界规则", abilityIds: ["divination"], method: "用占卜重写世界规则", proposedEffects: ["重写世界规则"], usedItems: [], usedKnowledge: [], risks: [] } },
    { name: "conceal-forced-infiltrate", expected: "ACCEPT_WITH_LIMITS", plan: { objective: "潜入会场", abilityIds: ["paper-substitute"], method: "用隐匿潜入会场，强行硬来", proposedEffects: ["隐藏自己"], usedItems: [], usedKnowledge: [], risks: ["暴露"] } },
    { name: "fire-burn-lock", expected: "ACCEPT", plan: { objective: "打开门锁", abilityIds: ["fire-shaping"], method: "用火焰塑形焚烧门锁", proposedEffects: ["焚烧门锁"], usedItems: [], usedKnowledge: [], risks: [] } },
  ];

  const failures = [];
  const verdictCounts = {};
  for (const item of cases) {
    const envelope = generation.evaluateAbilityPlan(item.plan, { ...context, spirituality: item.name === "divination-exhausted" ? 20 : 50 });
    if (envelope.verdict !== item.expected) {
      failures.push(`${item.name}: expected=${item.expected} actual=${envelope.verdict}`);
    }
    verdictCounts[envelope.verdict] = (verdictCounts[envelope.verdict] ?? 0) + 1;
    const errors = generation.validateEnvelope(envelope);
    if (errors.length) failures.push(`${item.name}:envelope-invalid:${errors.join(";")}`);
    const again = generation.evaluateAbilityPlan(item.plan, { ...context, spirituality: item.name === "divination-exhausted" ? 20 : 50 });
    if (again.verdict !== envelope.verdict || again.reasons.join("|") !== envelope.reasons.join("|")) failures.push(`${item.name}:non-deterministic`);
  }

  const allSix = generation.VERDICTS.every((verdict) => (verdictCounts[verdict] ?? 0) > 0);
  if (!allSix) failures.push(`missing-verdict:${generation.VERDICTS.filter((v) => !verdictCounts[v]).join(",")}`);
  const accepted = (verdictCounts.ACCEPT ?? 0) + (verdictCounts.ACCEPT_WITH_LIMITS ?? 0) + (verdictCounts.ACCEPT_AS_IMPROVISED_EFFECT ?? 0);
  const rejected = verdictCounts.REJECT_OUTSIDE_ABILITY_DOMAIN ?? 0;
  if (accepted === cases.length) failures.push("all-accepted");
  if (rejected === cases.length) failures.push("all-rejected");

  // 自由方案专项：15 类“开发者未预注册”用法，确认合理方案可进入规则裁剪、明显越界才拒绝。
  const freeformCases = [
    { category: "单能力创造性应用", reject: false, plan: { objective: "把铁栏杆弯曲出缺口", abilityIds: ["fire-shaping"], method: "用火焰塑形把铁栏杆加热到能弯曲，不直接攻击", proposedEffects: ["弯曲铁栏杆"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "多能力组合", reject: false, plan: { objective: "确认目标方位后接近", abilityIds: ["divination", "short-teleport"], method: "先用占卜确认方位，再传送过去", proposedEffects: ["确认方位并移动"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "环境利用", reject: false, plan: { objective: "混入人群离开现场", abilityIds: ["paper-substitute"], method: "用隐匿借雨声掩盖脚步", proposedEffects: ["隐藏自己"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "道具+能力", reject: false, plan: { objective: "锁定目标位置", abilityIds: ["divination"], method: "用随身怀表作锚点配合占卜", proposedEffects: ["锁定位置"], usedItems: ["怀表"], usedKnowledge: [], risks: [] } },
    { category: "信息能力", reject: false, plan: { objective: "判断谁来过这间房", abilityIds: ["spirit-vision"], method: "查看残留情绪", proposedEffects: ["判断来者"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "隐蔽", reject: false, plan: { objective: "不被守卫发现", abilityIds: ["paper-substitute"], method: "隐藏声音和注意力", proposedEffects: ["隐藏声音与注意力"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "移动", reject: false, plan: { objective: "翻过围墙", abilityIds: ["flame-jump"], method: "用移动能力翻墙，不惊动守卫", proposedEffects: ["移动翻墙"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "战斗", reject: false, plan: { objective: "封住走廊阻止追兵", abilityIds: ["fire-shaping"], method: "制造火墙", proposedEffects: ["制造火墙"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "非战斗", reject: false, plan: { objective: "让受惊的证人开口", abilityIds: ["deep-hypnosis"], method: "安抚情绪并引导说话", proposedEffects: ["安抚并引导"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "间接作用", reject: false, plan: { objective: "之后能找到这个人", abilityIds: ["track"], method: "在目标物品上留记号，之后沿记号找人", proposedEffects: ["留下记号并追踪"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "需要准备", expected: "REQUIRES_PREPARATION", plan: { objective: "召唤灵体", abilityIds: ["ritual-design"], method: "布置仪式，但没带材料", proposedEffects: ["召唤灵体"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "缺失媒介", expected: "REQUIRES_PREPARATION", plan: { objective: "替自己挡一刀", abilityIds: ["paper-substitute"], method: "用纸人替身，但没有纸人", proposedEffects: ["替身挡刀"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "模糊指令", expected: "REQUIRES_CLARIFICATION", plan: { objective: "处理一下现场", abilityIds: ["spirit-vision"], method: "随便看看，你决定", proposedEffects: ["处理现场"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "明确越界", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "杀死远处的敌人", abilityIds: ["spirit-vision"], method: "用灵视直接杀死远处的敌人", proposedEffects: ["直接杀死"], usedItems: [], usedKnowledge: [], risks: [] } },
    { category: "世界规则重写", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "让白天和黑夜颠倒", abilityIds: ["divination"], method: "用占卜重写世界规则", proposedEffects: ["重写世界规则"], usedItems: [], usedKnowledge: [], risks: [] } },
  ];
  const expectedForCategory = Object.fromEntries(freeformCases.map((item) => [item.category, item.expected ?? "NOT_REJECT"]));
  let freeformAccepted = 0;
  let freeformRejected = 0;
  const freeformResults = {};
  for (const item of freeformCases) {
    const envelope = generation.evaluateAbilityPlan(item.plan, context);
    freeformResults[item.category] = envelope.verdict;
    const expected = expectedForCategory[item.category];
    if (expected === "REJECT_OUTSIDE_ABILITY_DOMAIN") {
      if (envelope.verdict !== "REJECT_OUTSIDE_ABILITY_DOMAIN") failures.push(`freeform:${item.category}:expected-reject:${envelope.verdict}`);
      freeformRejected += 1;
    } else if (expected === "REQUIRES_PREPARATION" || expected === "REQUIRES_CLARIFICATION") {
      if (envelope.verdict !== expected) failures.push(`freeform:${item.category}:expected-${expected}:${envelope.verdict}`);
      freeformAccepted += 1;
    } else {
      if (envelope.verdict === "REJECT_OUTSIDE_ABILITY_DOMAIN") failures.push(`freeform:${item.category}:unexpected-reject`);
      freeformAccepted += 1;
    }
  }
  if (freeformAccepted === freeformCases.length) failures.push("freeform-all-accepted");
  if (freeformRejected === freeformCases.length) failures.push("freeform-all-rejected");

  return { failures, count: cases.length, verdictCounts, freeformCount: freeformCases.length, freeformAccepted, freeformRejected, freeformResults };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runGenerativeAbilityEval();
  console.log("[ability:generative]");
  console.log(`  用例=${result.count} 判定分布=${JSON.stringify(result.verdictCounts)}`);
  console.log(`  自由方案专项=${result.freeformCount} 类：接受=${result.freeformAccepted} 拒绝=${result.freeformRejected}`);
  console.log(`  ${JSON.stringify(result.freeformResults)}`);
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项：${result.failures.slice(0, 12).join("; ")}`);
  } else {
    console.log("  六种包络判定全部出现，无全收/全拒，确定性一致");
  }
  const pass = result.failures.length === 0;
  console.log(`[ability:generative] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
