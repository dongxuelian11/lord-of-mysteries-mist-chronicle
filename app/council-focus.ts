import type { GameState } from "./game-model";
import { relevantCouncilMembers } from "./council-system.ts";
import { projectWorldForAudience } from "./world-kernel.ts";

export type CouncilMatterKind = "strategy" | "world-pressure" | "organization-exception";

export type CouncilAttentionState = "new" | "needs-ruling" | "deferred" | "partially-completed" | "interrupted";
export type CouncilStrategyImpact = "advancing" | "deferred" | "interrupted";
export type CouncilProposalPosture = "minimal" | "balanced" | "substantial";

export type CouncilProposalView = {
  id: string;
  kind: "recommended" | "alternative";
  advisorId: string;
  advisorName: string;
  stance: string;
  basis: string;
  text: string;
  resourcePosture: CouncilProposalPosture;
  resourceLabel: string;
  risk: string;
  consultWhen: string;
};

export type CouncilMatterView = {
  id: string;
  kind: CouncilMatterKind;
  sourceRef: string;
  title: string;
  whatHappened: string;
  whyNow: string;
  pastDecision: string;
  attentionState: CouncilAttentionState;
  causalNote: string;
  strategyImpact?: CouncilStrategyImpact;
  strategyNote?: string;
  recommendedOwnerId?: string;
  recommendation: string;
  alternative: string;
  proposals: CouncilProposalView[];
  delegationRisk: string;
  interventionRisk: string;
  neglectOutcome: string;
  districtId?: string;
  discussionSeed: string;
  decisionSeed: string;
  urgency: number;
};

type CouncilMatterSeed = Omit<CouncilMatterView, "proposals">;

function officeOwner(game: GameState, officeId: string) {
  const office = game.management.offices.find((item) => item.id === officeId);
  return office?.incumbentId ?? office?.actingMemberId;
}

function firstAvailableOwner(game: GameState) {
  return game.management.offices
    .map((office) => office.incumbentId ?? office.actingMemberId)
    .find((id): id is string => Boolean(id)) ?? game.members.find((member) => member.status !== "阵亡")?.id;
}

function ownerName(game: GameState, ownerId?: string) {
  return game.members.find((member) => member.id === ownerId)?.name ?? "最合适的负责人";
}

function directiveTitle(game: GameState, actionId?: string) {
  if (!actionId) return undefined;
  const result = game.chronicle
    .flatMap((chapter) => chapter.results)
    .find((item) => item.id === actionId || item.contract.id === actionId);
  return result?.title ?? game.schedule.find((action) => action.id === actionId)?.title;
}

function visibleEventTitles(game: GameState, eventIds: string[] = []) {
  const requested = new Set(eventIds);
  const kernelTitles = projectWorldForAudience(game.worldKernel, { kind: "player", holderId: "player" }).events
    .filter((event) => requested.has(event.id))
    .map((event) => event.title);
  const ledgerTitles = game.worldLedger.events
    .filter((event) => requested.has(event.id))
    .filter((event) => event.audience.visibility === "public" || event.audience.visibility === "player" || event.audience.holderRefs.includes("player"))
    .map((event) => event.summary);
  return [...new Set([...kernelTitles, ...ledgerTitles].map((title) => title.trim()).filter(Boolean))].slice(0, 3);
}

function issueAttentionState(issue: GameState["organizationIssues"][number]): CouncilAttentionState {
  if (issue.directiveState === "awaiting-authorization") return "needs-ruling";
  return issue.directiveState ?? "new";
}

function issueStrategyImpact(issue: GameState["organizationIssues"][number]): CouncilStrategyImpact | undefined {
  if (!issue.strategyIntentId) return undefined;
  if (issue.directiveState === "deferred") return "deferred";
  if (issue.directiveState === "awaiting-authorization" || issue.directiveState === "interrupted") return "interrupted";
  return "advancing";
}

function issueCausalContext(game: GameState, issue: GameState["organizationIssues"][number]) {
  const actionTitle = directiveTitle(game, issue.originActionId);
  const strategy = issue.strategyIntentId ? game.playerIntents.find((intent) => intent.id === issue.strategyIntentId) : undefined;
  const events = visibleEventTitles(game, issue.causeEventIds);
  const parts: string[] = [];
  if (actionTitle) parts.push(`这项变化源自你此前的指令“${actionTitle}”。`);
  if (strategy) parts.push(`它正在影响主战略“${strategy.text}”。`);
  if (events.length) parts.push(`目前可确认的起因包括：${events.join("；")}。`);
  if (!parts.length) parts.push(`它来自组织内部的“${issue.category}”因果线；现有记录还不能把它可靠归因到某一项决定。`);
  return {
    causalNote: parts.join(""),
    strategyNote: strategy ? `主战略“${strategy.text}”${issue.directiveState === "deferred" ? "因此暂缓" : issue.directiveState === "awaiting-authorization" || issue.directiveState === "interrupted" ? "因此停在当前边界" : "仍在推进，但已经产生未完成的后果"}。` : undefined,
  };
}

function proposalAdvisors(game: GameState, matter: Pick<CouncilMatterView, "title" | "recommendedOwnerId">) {
  const available = game.members.filter((member) => member.status !== "阵亡" && member.status !== "尚未接触");
  const relevant = relevantCouncilMembers(game, matter.title, 4).filter((member) => available.some((candidate) => candidate.id === member.id));
  const recommended = available.find((member) => member.id === matter.recommendedOwnerId);
  const ordered = [recommended, ...relevant, ...available].filter((member): member is GameState["members"][number] => Boolean(member));
  const unique = new Map(ordered.map((member) => [member.id, member]));
  return [...unique.values()].slice(0, 3);
}

function advisorStance(member: GameState["members"][number]) {
  if ((member.ideology ?? 50) >= 75) return "先守住原则，再求进展";
  if ((member.interest ?? 50) >= 70) return "重视交换与长期关系";
  if ((member.trust ?? member.loyalty) < 40) return "先验证承诺，再扩大投入";
  return "重视可复盘的稳步推进";
}

function advisorBasis(member: GameState["members"][number]) {
  return `${member.role}，专长是${member.specialty}；${member.core ?? "倾向从职责范围判断风险"}`;
}

function postureLabel(posture: CouncilProposalPosture) {
  return posture === "minimal" ? "最低限度投入" : posture === "substantial" ? "充分投入" : "平衡投入";
}

function proposalBoundary(matter: Pick<CouncilMatterView, "attentionState">) {
  if (matter.attentionState === "needs-ruling") return "若要扩大授权、改变目标或接触新对象，必须重新请示。";
  if (matter.attentionState === "interrupted") return "若要重新推进，必须先确认停止条件已经解除并重新请示。";
  return "若出现身份暴露、不可逆伤亡或判断基础改变，必须停止并请示。";
}

function proposalModeText(matter: CouncilMatterSeed, advisorName: string, mode: "recommended" | "observe" | "advance") {
  const boundary = proposalBoundary(matter);
  if (mode === "recommended") return `${advisorName}主张：${matter.recommendation} 先完成一项可验证的阶段变化，${boundary}`;
  if (mode === "observe") return `${advisorName}倾向先收束：只建立一条可复核的证据回路，保持隐蔽，不直接接触目标；${boundary}`;
  return `${advisorName}认为可以主动推进：把目标压缩成一次可中止的处理，由最熟悉现场的人负责；${boundary}`;
}

function proposalRisk(matter: CouncilMatterSeed, mode: "recommended" | "observe" | "advance") {
  if (mode === "recommended") return matter.delegationRisk;
  if (mode === "observe") return "可能错过短暂机会，但不会把未知强行写成事实。";
  return matter.interventionRisk;
}

function proposalForAdvisor(args: {
  matter: CouncilMatterSeed;
  advisor: GameState["members"][number];
  index: number;
  postures: CouncilProposalPosture[];
}): CouncilProposalView {
  const { matter, advisor, index, postures } = args;
  const modes = ["recommended", "observe", "advance"] as const;
  const mode = modes[index] ?? "observe";
  const resourcePosture = postures[index] ?? "minimal";
  return {
    id: `${matter.id}:proposal:${mode}`,
    kind: index === 0 ? "recommended" : "alternative",
    advisorId: advisor.id,
    advisorName: advisor.name,
    stance: advisorStance(advisor),
    basis: advisorBasis(advisor),
    text: proposalModeText(matter, advisor.name, mode),
    resourcePosture,
    resourceLabel: postureLabel(resourcePosture),
    risk: proposalRisk(matter, mode),
    consultWhen: proposalBoundary(matter),
  };
}

function buildMatterProposals(game: GameState, matter: CouncilMatterSeed): CouncilProposalView[] {
  const advisors = proposalAdvisors(game, matter);
  const postures: CouncilProposalPosture[] = matter.attentionState === "needs-ruling" ? ["minimal", "minimal", "balanced"] : ["balanced", "minimal", "substantial"];
  return advisors.map((advisor, index) => proposalForAdvisor({ matter, advisor, index, postures }));
}

function enrichMatterProposals(game: GameState, matter: CouncilMatterSeed): CouncilMatterView {
  const proposals = buildMatterProposals(game, matter);
  return {
    ...matter,
    proposals,
    recommendation: proposals[0]?.text ?? matter.recommendation,
    alternative: proposals[1]?.text ?? matter.alternative,
  };
}

function strategyMatter(game: GameState): CouncilMatterSeed {
  const intent = game.playerIntents.find((item) => item.state === "active" && item.pinned)
    ?? game.playerIntents.find((item) => item.state === "active");
  const ownerId = firstAvailableOwner(game);
  const title = intent?.text ?? "确定组织本轮最想改变的局面";
  const happened = intent
    ? "这项长期方向仍在推进，但本轮尚未形成新的首领指令。"
    : "组织正在运行，但还没有一项由你明确保持的长期方向。";
  return {
    id: intent?.id ?? `strategy:${game.week}:uncommitted`,
    kind: "strategy",
    sourceRef: intent ? `player-intent:${intent.id}` : `week:${game.week}`,
    title,
    whatHappened: happened,
    whyNow: "若首领只处理眼前压力，组织的成长会被外部事件牵着走。",
    pastDecision: intent ? "来自你仍在维持的主战略。" : "尚未关联既往决议；本轮可以第一次明确长期方向。",
    attentionState: "new",
    causalNote: intent ? `这是你仍在维持的主战略“${title}”。` : "这项方向尚未关联既往决议；本轮可以第一次明确长期目标。",
    strategyImpact: "advancing",
    strategyNote: intent ? `主战略“${title}”仍在推进。` : undefined,
    recommendedOwnerId: ownerId,
    recommendation: `先让${ownerName(game, ownerId)}提出一个本轮可验证、不会吞没全部组织注意力的推进方案。`,
    alternative: "暂不新增行动，要求负责人只收集足以改变判断的新证据。",
    delegationRisk: "负责人可能把长期方向缩成便于执行、却偏离原意的局部任务。",
    interventionRisk: "你亲自介入会强化这一方向，但可能让其他压力失去首领注意。",
    neglectOutcome: "外部压力将继续替组织决定优先级，长期战略只会留在口号里。",
    discussionSeed: `围绕主战略“${title}”提出本轮方案：先说明新增事实与未知，再给出一个推荐方案、一个真正不同的替代方案、所需资源和必须请示的边界。`,
    decisionSeed: `本轮继续推进“${title}”。请由合适负责人统筹，先完成一个可验证的阶段目标；不得为了短期进展越过组织原则，遇到会改变长期方向的情况必须请示。`,
    urgency: intent?.pinned ? 78 : 62,
  };
}

function missionMatter(game: GameState, mission: GameState["missions"][number]): CouncilMatterSeed {
  const ownerId = officeOwner(game, "operations") ?? officeOwner(game, "intelligence") ?? firstAvailableOwner(game);
  return {
    id: mission.id,
    kind: "world-pressure",
    sourceRef: `mission:${mission.id}`,
    title: mission.title,
    whatHappened: mission.premise,
    whyNow: `压力已推进到 ${mission.progress}%，预计在 ${mission.deadline} 周内形成不可忽视的后果。`,
    pastDecision: "现有记录尚不能把它可靠归因到某一项既往决议；负责人必须先说明已知因果，不能猜测。",
    attentionState: "new",
    causalNote: "现有记录尚不能把它可靠归因到某一项既往决议；负责人必须先说明已知因果，不能猜测。",
    recommendedOwnerId: ownerId,
    recommendation: `由${ownerName(game, ownerId)}先压缩未知范围，提交一项带停止条件的处理方案。`,
    alternative: "保持隐蔽观察，只在出现直接伤亡、身份暴露或关键机会窗口时升级请示。",
    delegationRisk: "委派可能错过只能由首领识别的非凡征兆，也可能在情报不足时过度执行。",
    interventionRisk: "你亲临现场会承担直接污染、身份暴露与无法兼顾组织全局的风险。",
    neglectOutcome: mission.consequence,
    discussionSeed: `只围绕“${mission.title}”汇报：发生了什么、为什么现在必须判断、与哪些既往决议有关；给出推荐方案、替代方案、投入与请示边界。不得把未知说成事实。`,
    decisionSeed: `处理“${mission.title}”：先核验${mission.hints[0] ?? "最关键的未知"}，由负责人自主安排人员与时机；若出现身份暴露、不可逆伤亡或判断基础改变，立即中止并请示。`,
    urgency: mission.urgency,
  };
}

function issueOwner(game: GameState, category: GameState["organizationIssues"][number]["category"]) {
  const officeId = category === "资源" ? "resources" : category === "招募" || category === "成员" ? "internal-affairs" : "operations";
  return officeOwner(game, officeId) ?? firstAvailableOwner(game);
}

function issueMatter(game: GameState, issue: GameState["organizationIssues"][number]): CouncilMatterSeed {
  const ownerId = issueOwner(game, issue.category);
  const attentionState = issueAttentionState(issue);
  const causalContext = issueCausalContext(game, issue);
  const whatHappened = attentionState === "needs-ruling"
    ? "负责人按你的边界停下了，没有擅自执行。"
    : attentionState === "deferred"
      ? "负责人保留了目标，但当前条件不足以安全展开；行动尚未产生新的结果。"
      : attentionState === "partially-completed"
        ? "行动已经产生一部分真实变化，但目标尚未完成；已经发生的后果不会撤回。"
        : attentionState === "interrupted"
          ? "行动开始后触及你设定的红线或停止条件，负责人已经停下；已经发生的变化仍然有效。"
          : issue.summary;
  const whyNow = attentionState === "needs-ruling"
    ? "继续推进需要你决定扩大授权、缩小目标与投入，或维持原边界并放弃。"
    : attentionState === "deferred"
      ? "现有条件无法让负责人在原授权内稳妥继续；只有需要改变目标或边界时才交回议会。"
      : attentionState === "partially-completed"
        ? "已完成部分与未完成目标正在产生不同后果，需要你决定继续、收束还是停止。"
        : attentionState === "interrupted"
          ? "停止条件已经生效；若要继续，就必须由你重新确认目标、投入与授权边界。"
          : issue.state === "已逾期" ? "负责人授权已经不足以消化这项异常，它正在产生额外后果。" : `最迟应在第 ${issue.deadline} 周前获得首领边界。`;
  const recommendation = attentionState === "needs-ruling"
    ? `让${ownerName(game, ownerId)}先缩小目标或投入，并说明需要你追加哪一项授权。`
    : attentionState === "deferred"
      ? `让${ownerName(game, ownerId)}保留目标，只在条件满足或需要改变边界时重新请示。`
      : attentionState === "partially-completed"
        ? `让${ownerName(game, ownerId)}先确认已经发生的变化，再提出完成剩余目标的最小方案。`
        : attentionState === "interrupted"
          ? `让${ownerName(game, ownerId)}先隔离已经产生的风险，再说明是否值得重新授权。`
          : `由${ownerName(game, ownerId)}提出恢复常态的最小方案，并明确哪些决定仍可自行处理。`;
  return {
    id: issue.id,
    kind: "organization-exception",
    sourceRef: `organization-issue:${issue.id}`,
    title: issue.title,
    whatHappened,
    whyNow,
    pastDecision: causalContext.causalNote,
    attentionState,
    causalNote: causalContext.causalNote,
    strategyImpact: issueStrategyImpact(issue),
    strategyNote: causalContext.strategyNote,
    recommendedOwnerId: ownerId,
    recommendation,
    alternative: attentionState === "needs-ruling" ? "维持原有边界，接受这次行动无法继续。" : "冻结相关工作，接受短期损失，先隔离会继续扩大的风险。",
    delegationRisk: "若授权仍然模糊，负责人可能只消除表面症状，异常会换一种形式返回。",
    interventionRisk: "你直接接管会暂时加快处置，但可能破坏已经形成的责任边界。",
    neglectOutcome: attentionState === "new" ? issue.signals[0] ?? "异常会继续积累，并在下一轮挤占本应留给长期战略的注意力。" : "未完成目标仍会留在世界中；如果它需要首领判断，会再次成为大事。",
    discussionSeed: `就组织异常“${issue.title}”提出处置：说明成因、受影响的人与资源、推荐方案、替代方案，以及恢复自动运行前必须满足的条件。`,
    decisionSeed: `处置“${issue.title}”：由${ownerName(game, ownerId)}负责恢复稳定，使用必要但克制的组织资源；若原因判断改变、代价不可逆或影响扩散，必须重新请示。`,
    urgency: issue.urgency + (issue.state === "已逾期" ? 12 : 0),
  };
}

function reportMatter(game: GameState, report: GameState["departmentReports"][number]): CouncilMatterSeed {
  const ownerId = firstAvailableOwner(game);
  return {
    id: report.id,
    kind: "organization-exception",
    sourceRef: `department-report:${report.id}`,
    title: report.headline,
    whatHappened: report.detail,
    whyNow: report.consequence,
    pastDecision: "这是既有授权运行后浮出的例外，不是需要逐项审阅的部门日报。",
    attentionState: "new",
    causalNote: "这是既有授权运行后浮出的例外；现有记录没有把它归因到某一项单独决定。",
    recommendedOwnerId: ownerId,
    recommendation: `让${ownerName(game, ownerId)}说明是否只需调整授权边界，避免把日常工作重新交回首领。`,
    alternative: "继续按原授权运行一轮，但要求异常扩大时立即请示。",
    delegationRisk: "继续委派可能让异常跨过当前临界线。",
    interventionRisk: "直接接管会把本可自动运行的工作重新变成首领微操。",
    neglectOutcome: report.consequence,
    discussionSeed: `只处理例外“${report.headline}”：说明它为何超出既有授权、推荐如何修正边界，以及何时可以重新自动运行。`,
    decisionSeed: `调整“${report.headline}”的授权边界：负责人继续执行日常工作，只在后果扩大、资源越线或需要不可逆决定时请示。`,
    urgency: 48,
  };
}

export function buildCouncilMatters(game: GameState): CouncilMatterView[] {
  const strategy = strategyMatter(game);
  const pressures = [
    ...game.missions.filter((mission) => mission.state === "active").map((mission) => missionMatter(game, mission)),
    ...game.organizationIssues
      .filter((issue) => issue.state === "待裁决" || issue.state === "已逾期")
      .map((issue) => issueMatter(game, issue)),
    ...game.departmentReports
      .filter((report) => report.week === game.week && report.requiresDecision)
      .map((report) => reportMatter(game, report)),
  ].sort((left, right) => right.urgency - left.urgency || left.id.localeCompare(right.id));

  const survivalCrisis = Boolean(game.fatalSituation) || game.ending.phase === "major-event" || game.ending.phase === "finale";
  if (survivalCrisis && pressures.length >= 3) {
    return pressures.slice(0, 3).map((matter) => enrichMatterProposals(game, {
      ...matter,
      pastDecision: `${matter.pastDecision} 生存危机暂时中断了长期方向“${strategy.title}”。`,
      causalNote: `${matter.causalNote} 生存危机暂时中断了长期方向“${strategy.title}”。`,
      strategyImpact: "interrupted",
      strategyNote: `生存危机暂时中断了长期方向“${strategy.title}”；本轮三项压力因此占满首领注意力。`,
    }));
  }

  return [strategy, ...pressures.slice(0, 2)].slice(0, 3).map((matter) => enrichMatterProposals(game, matter));
}
