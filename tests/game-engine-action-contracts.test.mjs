import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

function projectContract(contract) {
  return {
    title: contract.title,
    kind: contract.kind,
    target: contract.target,
    leaderId: contract.leaderId,
    memberIds: contract.memberIds,
    executionMode: contract.executionMode,
    ...(contract.facilityId ? { facilityId: contract.facilityId } : {}),
    days: contract.days,
    budget: contract.budget,
    resourceCommitment: contract.resourceCommitment,
    authorization: contract.authorization,
    risk: contract.risk,
    redLines: contract.redLines,
    retreat: contract.retreat,
    methodTags: contract.methodTags,
  };
}

test("game-engine action contract characterization", async () => {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  let game = model.createInitialGame("seer");
  game = {
    ...game,
    playerName: "会长",
    money: 500,
    management: {
      ...(game.management ?? {}),
      resources: { money: 500, manpower: 12, extraordinaryMaterials: 5 },
    },
  };

  const cases = [
    {
      intent: "调查东区仓库，低调进行，预算20镑，派2名人力；发现身份暴露立即撤退。",
      expected: {
        title: "调查 · 东区仓库",
        kind: "调查",
        target: "东区仓库",
        leaderId: "cedric",
        memberIds: ["cedric"],
        executionMode: "delegated",
        days: 2,
        budget: 20,
        resourceCommitment: { posture: "minimal", money: 20, manpower: 2, extraordinaryMaterials: 0 },
        authorization: {
          scope: "bounded",
          redLines: ["不伤害无关者", "不把未经验证的假设当作公开指控"],
          mustEscalateWhen: ["需要突破红线、扩大资源投入或改变核心目标时必须请示", "出现超出队伍层次的威胁、身份暴露或撤退条件时必须请示"],
          retreatCondition: "发现身份暴露立即撤退",
        },
        risk: "中",
        redLines: "不伤害无关者；不把未经验证的假设当作公开指控",
        retreat: "发现身份暴露立即撤退",
        methodTags: ["open"],
      },
    },
    {
      intent: "只整理本周已经持有的公开报纸，不接触任何人，不投入人力；逐项请示。",
      expected: {
        title: "自由行动 · 本周已经持有的公开报纸",
        kind: "自由行动",
        target: "本周已经持有的公开报纸",
        leaderId: "ines",
        memberIds: ["ines"],
        executionMode: "delegated",
        days: 2,
        budget: 18,
        resourceCommitment: { posture: "minimal", money: 18, manpower: 0, extraordinaryMaterials: 0 },
        authorization: {
          scope: "strict",
          redLines: ["只整理本周已经持有的公开报纸", "不接触任何人", "不伤害无关者", "不把未经验证的假设当作公开指控", "不投入人力"],
          mustEscalateWhen: ["逐项请示", "改变目标、手段、执行者或资源投入前必须请示", "接触未授权对象或触及任何红线前必须请示"],
          retreatCondition: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        },
        risk: "中",
        redLines: "只整理本周已经持有的公开报纸；不接触任何人；不伤害无关者；不把未经验证的假设当作公开指控；不投入人力",
        retreat: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        methodTags: ["document"],
      },
    },
    {
      intent: "修建一座新的安全屋，大量投入，预算150镑，增派4名基层人手；不得触碰无关者。",
      expected: {
        title: "建设 · 一座新的安全屋",
        kind: "建设",
        target: "一座新的安全屋",
        leaderId: "cedric",
        memberIds: ["cedric"],
        executionMode: "delegated",
        facilityId: "workshop",
        days: 5,
        budget: 150,
        resourceCommitment: { posture: "substantial", money: 150, manpower: 4, extraordinaryMaterials: 0 },
        authorization: {
          scope: "strict",
          redLines: ["不得触碰无关者", "不伤害无关者", "不把未经验证的假设当作公开指控"],
          mustEscalateWhen: ["需要突破红线、扩大资源投入或改变核心目标时必须请示", "出现超出队伍层次的威胁、身份暴露或撤退条件时必须请示"],
          retreatCondition: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        },
        risk: "高",
        redLines: "不得触碰无关者；不伤害无关者；不把未经验证的假设当作公开指控",
        retreat: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        methodTags: ["open"],
      },
    },
    {
      intent: "研究神秘材料，不使用任何材料，最低限度投入，未经批准不得改变目标。",
      expected: {
        title: "研究 · 神秘材料",
        kind: "研究",
        target: "神秘材料",
        leaderId: "mara",
        memberIds: ["mara"],
        executionMode: "delegated",
        facilityId: "archive",
        days: 3,
        budget: 15,
        resourceCommitment: { posture: "minimal", money: 15, manpower: 1, extraordinaryMaterials: 0 },
        authorization: {
          scope: "strict",
          redLines: ["不使用任何材料", "未经批准不得改变目标", "不伤害无关者", "不把未经验证的假设当作公开指控"],
          mustEscalateWhen: ["研究神秘材料，不使用任何材料，最低限度投入，未经批准不得改变目标", "改变目标、手段、执行者或资源投入前必须请示", "接触未授权对象或触及任何红线前必须请示"],
          retreatCondition: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        },
        risk: "高",
        redLines: "不使用任何材料；未经批准不得改变目标；不伤害无关者；不把未经验证的假设当作公开指控",
        retreat: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        methodTags: ["open"],
      },
    },
    {
      intent: "招募候选人，广泛授权，自行决定，出现暴露就中止。",
      expected: {
        title: "招募 · 候选人",
        kind: "招募",
        target: "候选人",
        leaderId: "mara",
        memberIds: ["mara"],
        executionMode: "delegated",
        days: 2,
        budget: 18,
        resourceCommitment: { posture: "balanced", money: 18, manpower: 2, extraordinaryMaterials: 0 },
        authorization: {
          scope: "broad",
          redLines: ["不伤害无关者", "不把未经验证的假设当作公开指控"],
          mustEscalateWhen: ["触及任何红线、改变核心目标或出现撤退条件时必须请示"],
          retreatCondition: "出现暴露就中止",
        },
        risk: "高",
        redLines: "不伤害无关者；不把未经验证的假设当作公开指控",
        retreat: "出现暴露就中止",
        methodTags: ["open"],
      },
    },
    {
      intent: "调查“码头旧仓库”，不要追踪，不惊动目标。",
      expected: {
        title: "调查 · 码头旧仓库",
        kind: "调查",
        target: "码头旧仓库",
        leaderId: "mara",
        memberIds: ["mara"],
        executionMode: "delegated",
        days: 2,
        budget: 10,
        resourceCommitment: { posture: "minimal", money: 10, manpower: 1, extraordinaryMaterials: 0 },
        authorization: {
          scope: "bounded",
          redLines: ["不要追踪", "不伤害无关者", "不把未经验证的假设当作公开指控"],
          mustEscalateWhen: ["需要突破红线、扩大资源投入或改变核心目标时必须请示", "出现超出队伍层次的威胁、身份暴露或撤退条件时必须请示"],
          retreatCondition: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        },
        risk: "高",
        redLines: "不要追踪；不伤害无关者；不把未经验证的假设当作公开指控",
        retreat: "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
        methodTags: ["track"],
      },
    },
  ];

  for (const { intent, expected } of cases) {
    const contract = engine.localContract({ intent, game, leaderId: "organization", districtId: "east", abilityIds: [] });
    assert.deepEqual(projectContract(contract), expected, intent);
  }
});
