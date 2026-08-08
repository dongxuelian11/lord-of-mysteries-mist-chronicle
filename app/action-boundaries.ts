import type { ActionContract, GameState } from "./game-model";

export function actionTextBoundaryIssue(text: string, game: GameState, contract: ActionContract) {
  const source = `${contract.rawIntent}；${contract.redLines}`;
  const actorNames = contract.leaderId === "player"
    ? [game.playerName, game.playerAddress]
    : contract.leaderId === "organization"
      ? game.members.map((member) => member.name)
      : [game.members.find((member) => member.id === contract.leaderId)?.name];
  const actors = [...new Set(actorNames.filter(Boolean).flatMap((name) => [String(name), ...String(name).split("·").filter((part) => part.length >= 2)]))].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!actors.length) return null;
  const actor = `(?:${actors.join("|")})`;
  // “没有接触/未进入/不使用挂坠”等否定式合规表述不应触发红线。
  const safeText = text.replace(/(?:没有|未|不曾|从未|避免|不|不再)[^，。；]{0,6}(?:接触|询问|盘问|审问|逼问|交谈|拜访|触碰|拿起|使用|发动|启用|解封|进入|走进|潜入|钻进|调查|追踪|跟踪|尾随|前往|调取|抄录)/g, " ");
  const clauses = safeText.split(/[。！？；\n]/).map((part) => part.trim()).filter(Boolean);
  const near = (verbs: string) => clauses.some((clause) => new RegExp(`(?:${actor})[^。！？；\\n]{0,72}(?:${verbs})|(?:${verbs})[^。！？；\\n]{0,48}(?:${actor})`).test(clause));
  if (/只(?:整理|汇总|比对|核对)[^。；]*(?:报纸|通告|公开|记录|资料|消息|传闻)/.test(source) && near("前往|进入|走进|询问|拜访|接触|盘问|跟踪|潜入|调取|抄录")) return "正文越过了只整理既有公开来源的行动范围";
  if (/不(?:主动)?接触|不询问|不盘问/.test(source) && near("接触|询问|盘问|审问|逼问|交谈|拜访")) return "正文越过了不接触、不询问或不盘问的明确红线";
  if (/不(?:使用|用|触碰|发动)[^。；]*(?:封印物|挂坠)|(?:封印物|挂坠)[^。；]*不(?:使用|用|触碰|发动)/.test(source) && near("触碰|拿起|使用|发动|启用|解封")) return "正文越过了不使用封印物或挂坠的明确红线";
  if (/不(?:进入|潜入)/.test(source) && near("进入|走进|潜入|钻进")) return "正文越过了不得进入目标地点的明确红线";
  if (/不(?:调查|追踪|跟踪)/.test(source) && near("调查|追踪|跟踪|尾随")) return "正文越过了不得调查或追踪的明确红线";
  return null;
}
