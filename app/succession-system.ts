import { type GameState, materialsFor, PATHWAYS } from "./game-model.ts";

export function continueAsSuccessor(game: GameState, memberId: string): GameState {
  if (game.playerCondition.alive || game.ending.phase !== "ended") throw new Error("只有负责人死亡后才能启动继任程序");
  const successor = game.members.find((member) => member.id === memberId && member.status !== "阵亡" && member.pathway && Number.isInteger(member.sequence));
  if (!successor) throw new Error("这名成员无法作为非凡者继任负责人");
  const pathway = Object.values(PATHWAYS).find((item) => item.name === successor.pathway);
  if (!pathway) throw new Error("继任者途径尚未通过知识库索引，不能接管玩家视角");
  const remainingMembers = game.members.filter((member) => member.id !== memberId);
  const replacementId = remainingMembers.find((member) => member.status !== "阵亡")?.id;
  const priorLeader = game.playerName || game.playerAddress;
  return {
    ...game,
    playerName: successor.name,
    playerAddress: "新任会长",
    pathwayId: pathway.id,
    currentSequence: successor.sequence!,
    digestion: 15,
    formulaKnowledge: 0,
    materials: materialsFor(pathway.id, Math.max(0, successor.sequence! - 1)),
    spirituality: Math.max(10, 18 + (9 - successor.sequence!) * 3),
    spiritualityMax: Math.max(18, 18 + (9 - successor.sequence!) * 3),
    mentalLoad: 18,
    playerCondition: { alive: true, health: successor.injury ? 55 : 82, pollution: 6, injuries: successor.injury ? [successor.injury] : [] },
    members: remainingMembers,
    dialogueThreads: game.dialogueThreads.filter((thread) => thread.memberId !== memberId),
    knownAliases: [...new Set([...game.knownAliases, successor.name])],
    stability: Math.max(10, game.stability - 12),
    ending: { phase: "running", title: `${successor.name}接过议会席位`, sandboxUnlocked: false },
    management: {
      ...game.management,
      offices: game.management.offices.map((office) => office.incumbentId === memberId ? { ...office, incumbentId: replacementId } : office),
      branches: game.management.branches.map((branch) => branch.supervisorId === memberId ? { ...branch, status: "threatened" as const, warningRefs: [...branch.warningRefs, `succession:${game.week}:${memberId}`] } : branch),
    },
    facts: [...game.facts, { id: `succession-${game.week}-${memberId}`, subject: "组织继任", statement: `${priorLeader}死亡后，${successor.name}由玩家选择接过议会席位；组织与世界没有重置。`, certainty: "确认", source: "议会继任记录", week: game.week }],
  };
}
