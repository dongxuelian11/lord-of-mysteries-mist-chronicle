import type { ActionResult } from "./game-model.ts";

export type ParticipationScenePhase = "approach" | "contact" | "crisis" | "resolution";

export type ParticipationSceneTurn = {
  id: string;
  phase: ParticipationScenePhase;
  playerIntent: string;
  narrative: string;
  positionChange: number;
  dangerChange: number;
};

export type ParticipationScene = {
  id: string;
  chapterId: string;
  actionId: string;
  week: number;
  title: string;
  districtId: string;
  mode: "mission" | "combat";
  phase: ParticipationScenePhase;
  status: "awaiting-player" | "resolving" | "complete";
  objective: string;
  knownThreats: string;
  redLines: string;
  retreat: string;
  position: number;
  danger: number;
  prompt: string;
  turns: ParticipationSceneTurn[];
  lockedResolution: {
    outcome: ActionResult["outcome"];
    findings: string[];
    consequence: string;
    resourceChanges: ActionResult["resourceChanges"];
  };
};

const hash = (value: string) => {
  let output = 2166136261;
  for (const character of value) output = Math.imul(output ^ character.charCodeAt(0), 16777619);
  return output >>> 0;
};

const phasePrompt: Record<ParticipationScenePhase, string> = {
  approach: "你已经抵达现场。描述你如何接近目标、观察环境或布置第一步。",
  contact: "局面已经回应你的行动。你要如何接触目标、调动同伴或使用能力？",
  crisis: "关键阻力已经出现。写下你的应对、战术、撤离条件或任何自由命令。",
  resolution: "事实已经锁定。确认现场收尾，随后继续世界推演。",
};

export function createParticipationScene(chapterId: string, week: number, result: ActionResult): ParticipationScene {
  const contract = result.contract;
  const combat = ["高", "致命"].includes(contract.risk) || /战斗|袭击|伏击|追杀|交火|制服|武装/.test(`${contract.rawIntent} ${contract.approach}`);
  return {
    id: `participation:${result.id}`,
    chapterId,
    actionId: result.id,
    week,
    title: result.title,
    districtId: contract.districtId,
    mode: combat ? "combat" : "mission",
    phase: "approach",
    status: "awaiting-player",
    objective: contract.desiredOutcome || contract.target,
    knownThreats: contract.unknowns,
    redLines: contract.redLines,
    retreat: contract.retreat,
    position: 50,
    danger: combat ? 42 : 24,
    prompt: phasePrompt.approach,
    turns: [],
    lockedResolution: {
      outcome: result.outcome,
      findings: result.findings,
      consequence: result.consequence,
      resourceChanges: result.resourceChanges,
    },
  };
}

export function resolveParticipationSceneTurn(scene: ParticipationScene, playerIntent: string, narrative: string): ParticipationScene {
  const intent = playerIntent.trim();
  if (!intent) throw new Error("请输入你在现场采取的行动");
  if (scene.status === "complete") return scene;
  const index = scene.turns.length;
  const cautious = /观察|等待|掩护|撤|隐蔽|侦查|确认|试探|防御|保护/.test(intent);
  const forceful = /攻击|冲锋|追击|强行|引爆|开枪|斩|制服/.test(intent);
  const positionChange = (hash(`${scene.id}:${index}:${intent}`) % 9) - 3 + (cautious ? 2 : 0) + (forceful ? 1 : 0);
  const dangerChange = (hash(`${intent}:${scene.id}:danger`) % 7) - 2 + (forceful ? 3 : 0) - (cautious ? 2 : 0);
  const phases: ParticipationScenePhase[] = ["approach", "contact", "crisis", "resolution"];
  const nextPhase = phases[Math.min(phases.length - 1, index + 1)];
  const complete = nextPhase === "resolution";
  const turn: ParticipationSceneTurn = {
    id: `${scene.id}:turn:${index + 1}`,
    phase: scene.phase,
    playerIntent: intent,
    narrative,
    positionChange,
    dangerChange,
  };
  return {
    ...scene,
    phase: nextPhase,
    status: complete ? "complete" : "awaiting-player",
    position: Math.max(0, Math.min(100, scene.position + positionChange)),
    danger: Math.max(0, Math.min(100, scene.danger + dangerChange)),
    prompt: phasePrompt[nextPhase],
    turns: [...scene.turns, turn],
  };
}

export function participationSceneModelView(scene: ParticipationScene) {
  return {
    id: scene.id,
    title: scene.title,
    districtId: scene.districtId,
    mode: scene.mode,
    phase: scene.phase,
    objective: scene.objective,
    knownThreats: scene.knownThreats,
    redLines: scene.redLines,
    retreat: scene.retreat,
    position: scene.position,
    danger: scene.danger,
    turns: scene.turns,
  };
}
