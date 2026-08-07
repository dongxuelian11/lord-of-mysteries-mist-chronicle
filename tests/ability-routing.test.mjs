import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

let moduleServer;

async function loadModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  const ability = await moduleServer.ssrLoadModule("/app/ability-system.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  return { ability, model };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

test("free intent routing honors explicit ability names in full sentences", async () => {
  const { ability, model } = await loadModules();
  const game = model.createInitialGame("seer");
  assert.equal(ability.abilityForFreeIntent(game, "我用占卜看看这个挂坠的来历").id, "divination");
  assert.equal(ability.abilityForFreeIntent(game, "用灵视观察这个房间").id, "spirit-vision");
});

test("explicit ability name beats generic purpose words", async () => {
  const { ability, model } = await loadModules();
  const game = model.createInitialGame("seer");
  assert.equal(ability.abilityForFreeIntent(game, "用占卜影响他的情绪").id, "divination");
});

test("generic intent falls back to lowest-cost non-passive ability on ties", async () => {
  const { ability, model } = await loadModules();
  const game = model.createInitialGame("seer");
  assert.equal(ability.abilityForFreeIntent(game, "随便看看周围有没有异常").id, "spirit-vision");
});

test("perception purpose words prefer the perception-mode ability", async () => {
  const { ability, model } = await loadModules();
  const game = model.createInitialGame("seer");
  assert.equal(ability.abilityForFreeIntent(game, "查看这间屋子的情绪颜色").id, "spirit-vision");
});

test("legacy unregistered ability path produces deterministic record ids", async () => {
  const { ability, model } = await loadModules();
  const game = model.createInitialGame("seer");
  const custom = {
    id: "custom-probe",
    name: "自定义探测",
    verb: "探测",
    description: "测试用自定义能力",
    cost: 1,
    risk: "低",
    ruleTags: ["reveal"],
    mode: "感知",
    scope: "近距离",
    duration: "瞬时",
    contexts: ["self"],
    unlockRank: 9,
  };
  const draft = {
    observation: "看见了残留痕迹",
    interpretation: "推测有人来过",
    confidence: "中等",
    unknown: "无",
    detection: "未察觉",
    mentalLoad: 1,
  };
  const first = ability.resolveImmediateAbility(game, custom, "用自定义探测查看房间", { kind: "self", label: "房间" }, draft);
  const second = ability.resolveImmediateAbility(game, custom, "用自定义探测查看房间", { kind: "self", label: "房间" }, draft);
  assert.equal(first.record.id, second.record.id);
  assert.ok(!/Date|NaN/.test(first.record.id), "record id must not depend on clock");
});
