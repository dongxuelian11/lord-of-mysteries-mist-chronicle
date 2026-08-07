// Ability Baseline 独立自由能力探针：24 个开发者未预注册方案。
// 验收原则：合理/创新/未预注册方案能进入规则裁剪；明显越界必须拒绝；不追求 ACCEPT 比例。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runBaselineProbes() {
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

  const probes = [
    { id: "info-item-affected", expected: "NOT_REJECT", plan: { objective: "判断这件物品是否近期被异常力量影响", abilityIds: ["spirit-vision"], method: "用灵视查看物品上的残留痕迹", proposedEffects: ["判断异常影响"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "info-plus-tool", expected: "NOT_REJECT", plan: { objective: "拆开结构取出里面的东西", abilityIds: ["spirit-vision"], method: "先灵视寻找薄弱点，再用普通工具破坏结构", proposedEffects: ["寻找薄弱点"], usedItems: ["撬棍"], usedKnowledge: [], risks: [] } },
    { id: "environment-rope", expected: "NOT_REJECT", plan: { objective: "阻断追兵", abilityIds: ["fire-shaping"], method: "用火焰烧断绳索，使重物坠落", proposedEffects: ["烧断绳索"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "indirect-attack", expected: "NOT_REJECT", plan: { objective: "让敌人失去行动能力", abilityIds: ["fire-shaping"], method: "用火焰烧断支撑物，让环境造成结果", proposedEffects: ["烧断支撑物"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "multi-combo", expected: "NOT_REJECT", plan: { objective: "绕到敌人另一侧", abilityIds: ["deep-hypnosis", "short-teleport"], method: "先制造干扰吸引注意，再利用移动能力绕到另一侧", proposedEffects: ["制造干扰并移动"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "prop-mirror", expected: "NOT_REJECT", plan: { objective: "观察拐角后的情况", abilityIds: ["spirit-vision"], method: "利用现场镜子反射配合灵视", proposedEffects: ["观察拐角"], usedItems: ["镜子"], usedKnowledge: [], risks: [] } },
    { id: "infiltrate", expected: "NOT_REJECT", plan: { objective: "穿过灯火通明的走廊", abilityIds: ["paper-substitute"], method: "用隐匿混入人群穿过走廊", proposedEffects: ["隐藏自己"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "escape", expected: "NOT_REJECT", plan: { objective: "从二楼逃走", abilityIds: ["flame-jump"], method: "用移动能力跳出窗外沿排水管下滑", proposedEffects: ["移动逃离"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "combat-prep", expected: "NOT_REJECT", plan: { objective: "让下一击更致命", abilityIds: ["fire-shaping"], method: "用火焰预热武器", proposedEffects: ["预热武器"], usedItems: ["短刀"], usedKnowledge: [], risks: [] } },
    { id: "non-combat-creative", expected: "NOT_REJECT", plan: { objective: "决定今晚去哪里吃饭", abilityIds: ["divination"], method: "用占卜选一家店", proposedEffects: ["选择方向"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "deception-attention", expected: "NOT_REJECT", plan: { objective: "让守卫以为我刚离开", abilityIds: ["deep-hypnosis"], method: "用精神影响误导守卫注意力", proposedEffects: ["误导注意"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "divination-lying", expected: "NOT_REJECT", plan: { objective: "判断目标是否在说谎", abilityIds: ["divination"], method: "围绕目标的话占卜", proposedEffects: ["判断真伪"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "mobility-creative", expected: "NOT_REJECT", plan: { objective: "把纸条塞进目标口袋", abilityIds: ["short-teleport"], method: "用传送把纸条放进目标口袋", proposedEffects: ["转移纸条"], usedItems: ["纸条"], usedKnowledge: [], risks: [] } },
    { id: "medium-present", expected: "NOT_REJECT", plan: { objective: "追踪目标", abilityIds: ["divination"], method: "用占卜追踪，携带随身物品作媒介", proposedEffects: ["追踪位置"], usedItems: ["随身物品"], usedKnowledge: [], risks: [] } },
    { id: "medium-missing", expected: "REQUIRES_PREPARATION", plan: { objective: "追踪目标", abilityIds: ["divination"], method: "用占卜追踪，但没带媒介", proposedEffects: ["追踪位置"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "preparation-needed", expected: "REQUIRES_PREPARATION", plan: { objective: "净化房间", abilityIds: ["ritual-design"], method: "布置净化仪式，但材料还没准备", proposedEffects: ["净化房间"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "vague-command", expected: "REQUIRES_CLARIFICATION", plan: { objective: "处理一下这个情况", abilityIds: ["spirit-vision"], method: "随便用一下，你看着办", proposedEffects: ["处理情况"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "cross-domain-kill", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "杀死敌人", abilityIds: ["spirit-vision"], method: "用灵视直接杀死敌人", proposedEffects: ["直接杀死"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "world-rule-rewrite", expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "让所有警察从世界上消失", abilityIds: ["divination"], method: "让所有警察消失", proposedEffects: ["让所有警察消失"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "boundary-observe-then-attack", expected: "NOT_REJECT", plan: { objective: "击倒守卫", abilityIds: ["spirit-vision"], method: "灵视观察弱点，然后用普通武器攻击", proposedEffects: ["观察弱点"], usedItems: ["短棍"], usedKnowledge: [], risks: [] } },
    { id: "boundary-environment", expected: "NOT_REJECT", plan: { objective: "让敌人坠落", abilityIds: ["fire-shaping"], method: "火焰烧断支撑物，让环境造成结果", proposedEffects: ["烧断支撑物"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "boundary-teammate", expected: "NOT_REJECT", plan: { objective: "让队友完成攻击", abilityIds: ["deep-hypnosis"], method: "控制能力让敌人失衡，由队友完成攻击", proposedEffects: ["让敌人失衡"], usedItems: [], usedKnowledge: [], risks: [] } },
    { id: "risks-declared", expected: "ACCEPT_WITH_LIMITS", plan: { objective: "打开保险柜", abilityIds: ["fire-shaping"], method: "用火焰塑形加热锁栓", proposedEffects: ["加热锁栓"], usedItems: [], usedKnowledge: [], risks: ["反噬", "失控"] } },
    { id: "risks-empty-world-risk", expected: "ACCEPT_WITH_LIMITS", plan: { objective: "强行撬开保险柜", abilityIds: ["fire-shaping"], method: "灵性所剩无几，还是要用火焰塑形", proposedEffects: ["加热锁栓"], usedItems: [], usedKnowledge: [], risks: [] } },
  ];

  const failures = [];
  const results = {};
  let accepted = 0;
  let rejected = 0;
  for (const probe of probes) {
    const probeContext = { ...context, spirituality: probe.id === "risks-empty-world-risk" ? 18 : context.spirituality };
    const envelope = generation.evaluateAbilityPlan(probe.plan, probeContext);
    results[probe.id] = envelope.verdict;
    if (probe.expected === "REJECT_OUTSIDE_ABILITY_DOMAIN") {
      if (envelope.verdict !== "REJECT_OUTSIDE_ABILITY_DOMAIN") failures.push(`${probe.id}:expected-reject:${envelope.verdict}`);
      rejected += 1;
    } else if (probe.expected === "REQUIRES_PREPARATION" || probe.expected === "REQUIRES_CLARIFICATION") {
      if (envelope.verdict !== probe.expected) failures.push(`${probe.id}:expected-${probe.expected}:${envelope.verdict}`);
      accepted += 1;
    } else {
      if (envelope.verdict === "REJECT_OUTSIDE_ABILITY_DOMAIN") failures.push(`${probe.id}:unexpected-reject`);
      accepted += 1;
    }
    if (probe.expected === "ACCEPT_WITH_LIMITS" && envelope.verdict !== "ACCEPT_WITH_LIMITS") {
      failures.push(`${probe.id}:expected-with-limits:${envelope.verdict}`);
    }
    // 确定性：同输入重复评估一致。
    const again = generation.evaluateAbilityPlan(probe.plan, probeContext);
    if (again.verdict !== envelope.verdict) failures.push(`${probe.id}:non-deterministic`);
    if (generation.validateEnvelope(envelope).length) failures.push(`${probe.id}:envelope-invalid`);
  }
  if (accepted === probes.length) failures.push("all-accepted");
  if (rejected === probes.length) failures.push("all-rejected");

  return { failures, count: probes.length, accepted, rejected, results };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runBaselineProbes();
  console.log("[ability:baseline:probes]");
  console.log(`  探针=${result.count} 接受=${result.accepted} 拒绝=${result.rejected}`);
  console.log(`  ${JSON.stringify(result.results)}`);
  if (result.failures.length) console.log(`  失败：${result.failures.slice(0, 12).join("; ")}`);
  const pass = result.failures.length === 0;
  console.log(`[ability:baseline:probes] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
