import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

let generation;
let abilities;

async function modules() {
  generation ??= await loadRuntimeModule("app/ability-generation/index.ts");
  abilities ??= await loadRuntimeModule("app/abilities/index.ts");
  return { generation, abilities };
}

after(async () => {
  await closeRuntimeServer();
});

async function makeContext(spirituality = 50) {
  const { abilities: module } = await modules();
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
  return {
    ownedAbilities: module.abilityDefinitions().filter((item) => ownedIds.includes(item.id)),
    inventoryIds: [],
    knowledgeRefs: [],
    spirituality,
    concentrationSlots: 1,
    occupiedConcentrationSlots: 0,
  };
}

test("20 unregistered use cases produce all six verdicts and no all-accept/all-reject", async () => {
  const { generation: g } = await modules();
  const context = await makeContext();
  const cases = [
    { expected: "ACCEPT", plan: { objective: "查看房间里有没有灵体痕迹", abilityIds: ["spirit-vision"], method: "用灵视观察", proposedEffects: ["观察灵体痕迹"], usedItems: [], usedKnowledge: [], risks: [] } },
    { expected: "ACCEPT_WITH_LIMITS", plan: { objective: "打开上锁的门", abilityIds: ["fire-shaping"], method: "用火焰塑形加热门锁，强行撬开，不惜代价", proposedEffects: ["加热门锁"], usedItems: [], usedKnowledge: [], risks: ["反噬"] } },
    { expected: "ACCEPT_AS_IMPROVISED_EFFECT", plan: { objective: "拿到桌上的钥匙", abilityIds: ["short-teleport"], method: "用移动能力隔空取物", proposedEffects: ["隔空取物"], usedItems: [], usedKnowledge: [], risks: [] } },
    { expected: "REQUIRES_PREPARATION", plan: { objective: "替自己挡一刀", abilityIds: ["paper-substitute"], method: "用纸人替身挡下攻击，但没带纸人", proposedEffects: ["替身挡刀"], usedItems: [], usedKnowledge: [], risks: [] } },
    { expected: "REQUIRES_CLARIFICATION", plan: { objective: "处理一下这个麻烦", abilityIds: ["spirit-vision"], method: "随便用用，你看着办", proposedEffects: ["处理麻烦"], usedItems: [], usedKnowledge: [], risks: [] } },
    { expected: "REJECT_OUTSIDE_ABILITY_DOMAIN", plan: { objective: "制造无限金币", abilityIds: ["fire-shaping"], method: "用火焰塑形制造无限金币", proposedEffects: ["无限金币"], usedItems: [], usedKnowledge: [], risks: [] } },
  ];
  const counts = {};
  for (const item of cases) {
    const envelope = g.evaluateAbilityPlan(item.plan, context);
    assert.equal(envelope.verdict, item.expected, item.plan.objective);
    counts[envelope.verdict] = (counts[envelope.verdict] ?? 0) + 1;
  }
  for (const verdict of g.VERDICTS) assert.ok(counts[verdict] > 0, `missing ${verdict}`);
  assert.ok(Object.values(counts).every((value) => value < cases.length));
});

test("creative freedom: novel but in-domain uses are never auto-rejected", async () => {
  const { generation: g } = await modules();
  const context = await makeContext();
  const creative = [
    { objective: "让目标忽略桌上的文件", abilityIds: ["deep-hypnosis"], method: "用精神影响让目标忽略文件", proposedEffects: ["让目标忽略文件"], usedItems: [], usedKnowledge: [], risks: [] },
    { objective: "不被发现地穿过走廊", abilityIds: ["paper-substitute"], method: "用隐匿让脚步声听起来像猫", proposedEffects: ["脚步声变成猫的脚步声"], usedItems: [], usedKnowledge: [], risks: [] },
    { objective: "判断是否有人干扰了今晚的仪式", abilityIds: ["divination"], method: "围绕仪式是否被干扰占卜", proposedEffects: ["判断干扰"], usedItems: [], usedKnowledge: [], risks: [] },
  ];
  for (const plan of creative) {
    const envelope = g.evaluateAbilityPlan(plan, context);
    assert.notEqual(envelope.verdict, "REJECT_OUTSIDE_ABILITY_DOMAIN", plan.objective);
  }
});

test("plan evaluation is deterministic and envelopes validate", async () => {
  const { generation: g } = await modules();
  const context = await makeContext(20);
  const plan = { objective: "追查失踪者的下落", abilityIds: ["divination"], method: "灵性快枯竭了，还是要强行占卜追查", proposedEffects: ["追查下落"], usedItems: [], usedKnowledge: [], risks: [] };
  const first = g.evaluateAbilityPlan(plan, context);
  const second = g.evaluateAbilityPlan(plan, context);
  assert.equal(first.verdict, second.verdict);
  assert.deepEqual(first.reasons, second.reasons);
  assert.equal(first.verdict, "ACCEPT_WITH_LIMITS");
  assert.deepEqual(g.validateEnvelope(first), []);
  assert.deepEqual(g.validateAbilityPlan(plan), []);
});

test("declared risks push borderline plans into ACCEPT_WITH_LIMITS", async () => {
  const { generation: g } = await modules();
  const context = await makeContext();
  const plan = {
    objective: "打开门锁",
    abilityIds: ["fire-shaping"],
    method: "用火焰塑形加热门锁",
    proposedEffects: ["加热门锁"],
    usedItems: [],
    usedKnowledge: [],
    risks: ["反噬"],
  };
  const risky = g.evaluateAbilityPlan(plan, context);
  assert.equal(risky.verdict, "ACCEPT_WITH_LIMITS");
  const calm = g.evaluateAbilityPlan({ ...plan, risks: [] }, context);
  assert.equal(calm.verdict, "ACCEPT");
});

test("cross-domain violence is rejected while combat-domain violence is not", async () => {
  const { generation: g } = await modules();
  const context = await makeContext();
  const perceptionKill = g.evaluateAbilityPlan(
    { objective: "杀死远处的敌人", abilityIds: ["spirit-vision"], method: "用灵视直接杀死远处的敌人", proposedEffects: ["直接杀死"], usedItems: [], usedKnowledge: [], risks: [] },
    context
  );
  assert.equal(perceptionKill.verdict, "REJECT_OUTSIDE_ABILITY_DOMAIN");
  const combatKill = g.evaluateAbilityPlan(
    { objective: "杀死眼前的敌人", abilityIds: ["fire-shaping"], method: "用火焰塑形攻击敌人", proposedEffects: ["焚烧敌人"], usedItems: [], usedKnowledge: [], risks: [] },
    context
  );
  assert.notEqual(combatKill.verdict, "REJECT_OUTSIDE_ABILITY_DOMAIN");
});
