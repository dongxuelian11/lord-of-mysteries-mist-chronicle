import assert from "node:assert/strict";
import test from "node:test";

import {
  createParticipationScene,
  participationSceneModelView,
  resolveParticipationSceneTurn,
} from "../app/participation-scene.ts";

const result = {
  id: "result-player-led",
  title: "夜查东区煤气工厂",
  outcome: "部分成功",
  contract: {
    id: "action-player-led",
    rawIntent: "我亲自带队进入煤气工厂",
    title: "夜查东区煤气工厂",
    kind: "调查",
    target: "煤气工厂",
    desiredOutcome: "确认异常管线",
    approach: "隐蔽接近，遭遇武装守卫时先寻找掩体",
    leaderId: "player",
    memberIds: [],
    executionMode: "player-led",
    districtId: "east",
    abilityIds: [],
    days: 2,
    budget: 20,
    risk: "高",
    knownFacts: "旧图纸存在改道",
    hypothesis: "有人集中输送煤气",
    unknowns: "守卫数量未知",
    redLines: "不得启动设备",
    retreat: "遭遇高序列征兆立即撤退",
    focus: true,
  },
  findings: ["确认一条异常管线"],
  consequence: "守卫开始提高警戒",
  abilityEffects: [],
  digestionGain: 1,
  missionProgress: 8,
  resourceChanges: { money: -20, secrecy: -2, stability: 0, influence: 1 },
};

test("player-led high-risk action creates a locked combat scene without exposing its result to intermediate model context", () => {
  const scene = createParticipationScene("chapter-1", 4, result);
  assert.equal(scene.mode, "combat");
  assert.equal(scene.status, "awaiting-player");
  assert.equal(scene.lockedResolution.outcome, "部分成功");
  assert.equal("lockedResolution" in participationSceneModelView(scene), false);
});

test("participation scene pauses for three free decisions and then reaches a resumable resolution", () => {
  let scene = createParticipationScene("chapter-1", 4, result);
  scene = resolveParticipationSceneTurn(scene, "贴着外墙观察巡逻间隔", "雨声遮住了脚步，巡逻灯从墙角移开。");
  assert.equal(scene.phase, "contact");
  assert.equal(scene.status, "awaiting-player");
  scene = resolveParticipationSceneTurn(scene, "让同伴掩护，我翻过矮墙", "你落在管线阴影里，守卫尚未发现入口变化。");
  assert.equal(scene.phase, "crisis");
  scene = resolveParticipationSceneTurn(scene, "记录阀门编号后沿预定路线撤退", "最后一页编号被雨水打湿，你们在警铃响起前离开。");
  assert.equal(scene.phase, "resolution");
  assert.equal(scene.status, "complete");
  assert.equal(scene.turns.length, 3);
});
