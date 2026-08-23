import type { GameState, OrganizationIssue } from "./game-model.ts";

export type AttentionApprovalStatus = "confirmed" | "needs-review" | "paused";
export type AttentionScope = "department" | "branch";

export type AttentionAutomationApproval = {
  id: string;
  label: string;
  scope: AttentionScope;
  status: AttentionApprovalStatus;
  confirmedWeek: number;
  lastRunWeek: number;
  runCount: number;
  sourceRefs: string[];
  reviewReason?: string;
};

export type AttentionSimulationState = {
  version: 1;
  approvals: AttentionAutomationApproval[];
  focusRefs: string[];
  reopenedRefs: string[];
  lastWeek: number;
  backgroundSummaries: string[];
};

export type AttentionAutomationCandidate = {
  id: string;
  label: string;
  scope: AttentionScope;
  sourceRefs: string[];
  ready: boolean;
  reason: string;
};

export type AttentionPlayerItem = {
  id: string;
  label: string;
  mode: "自动运行" | "需要你关注" | "已暂停";
  detail: string;
  focused: boolean;
  reopenable: true;
};

export type AttentionPlayerProjection = {
  notice: string;
  items: AttentionPlayerItem[];
  confirmedCount: number;
  focusedCount: number;
  backgroundSummaries: string[];
};

type AttentionAdvanceInput = {
  week: number;
  organizationIssues?: Pick<OrganizationIssue, "sourceId" | "category" | "state" | "urgency">[];
};

const ISSUE_STATES = new Set(["待裁决", "已逾期"]);

function boundedText(value: unknown, fallback: string, max = 120) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function boundedInteger(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

function uniqueStrings(value: unknown, max = 12) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))].slice(0, max)
    : [];
}

function normalizeApproval(value: unknown): AttentionAutomationApproval | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AttentionAutomationApproval>;
  if (typeof source.id !== "string" || !source.id.trim()) return null;
  const status: AttentionApprovalStatus = source.status === "needs-review" || source.status === "paused" ? source.status : "confirmed";
  const scope: AttentionScope = source.scope === "branch" ? "branch" : "department";
  return {
    id: source.id.trim().slice(0, 120),
    label: boundedText(source.label, "已确认的常设流程"),
    scope,
    status,
    confirmedWeek: boundedInteger(source.confirmedWeek, 0, 0, 100000),
    lastRunWeek: boundedInteger(source.lastRunWeek, 0, 0, 100000),
    runCount: boundedInteger(source.runCount, 0, 0, 100000),
    sourceRefs: uniqueStrings(source.sourceRefs),
    ...(typeof source.reviewReason === "string" && source.reviewReason.trim() ? { reviewReason: source.reviewReason.trim().slice(0, 180) } : {}),
  };
}

export function createInitialAttentionSimulationState(): AttentionSimulationState {
  return {
    version: 1,
    approvals: [],
    focusRefs: [],
    reopenedRefs: [],
    lastWeek: 0,
    backgroundSummaries: [],
  };
}

export function ensureAttentionSimulationState(value: unknown): AttentionSimulationState {
  if (!value || typeof value !== "object") return createInitialAttentionSimulationState();
  const source = value as Partial<AttentionSimulationState>;
  const approvals = Array.isArray(source.approvals)
    ? source.approvals.map(normalizeApproval).filter((item): item is AttentionAutomationApproval => Boolean(item))
    : [];
  return {
    version: 1,
    approvals,
    focusRefs: uniqueStrings(source.focusRefs, 32),
    reopenedRefs: uniqueStrings(source.reopenedRefs, 48),
    lastWeek: boundedInteger(source.lastWeek, 0, 0, 100000),
    backgroundSummaries: uniqueStrings(source.backgroundSummaries, 8).map((summary) => summary.slice(0, 180)),
  };
}

function issueForCandidate(game: GameState, candidate: AttentionAutomationCandidate) {
  return (game.organizationIssues ?? []).find((issue) => {
    if (!ISSUE_STATES.has(issue.state) || issue.urgency < 70) return false;
    return candidate.sourceRefs.includes(issue.sourceId)
      || candidate.scope === "department" && issue.category === "部门" && issue.sourceId === candidate.id.replace("department:", "")
      || candidate.scope === "branch" && issue.category === "资源" && issue.sourceId === candidate.id.replace("branch:", "");
  });
}

function departmentCandidate(game: GameState, department: GameState["departments"][number]): AttentionAutomationCandidate {
  const id = `department:${department.id}`;
  const issue = issueForCandidate(game, { id, label: department.name, scope: "department", sourceRefs: [department.id], ready: true, reason: "" });
  const stable = Boolean(department.standingOrder?.trim())
    && (department.capacity ?? 0) >= 42
    && (department.cohesion ?? 0) >= 45
    && (department.exposure ?? 100) < 45
    && (department.backlog ?? 100) < 60;
  return {
    id,
    label: `${department.name}的常设命令`,
    scope: "department",
    sourceRefs: [department.id],
    ready: stable && !issue,
    reason: issue ? "有一项与这项常设命令有关的异常，需要你先判断" : stable ? "已经连续按同一边界运转，可以交给负责人继续处理" : "还没有稳定到可以收拢为自动运行",
  };
}

function branchCandidate(game: GameState, branch: NonNullable<GameState["management"]>["branches"][number]): AttentionAutomationCandidate {
  const district = game.management.map.districts.find((item) => item.id === branch.districtId);
  const id = `branch:${branch.id}`;
  const issue = issueForCandidate(game, { id, label: branch.name, scope: "branch", sourceRefs: [branch.id, branch.districtId], ready: true, reason: "" });
  const stable = branch.status === "active" && (district?.control ?? 0) >= 60 && (branch.warningRefs?.length ?? 0) === 0;
  return {
    id,
    label: `${branch.name}的常设方针`,
    scope: "branch",
    sourceRefs: [branch.id, branch.districtId],
    ready: stable && !issue,
    reason: issue ? "分部附近出现了需要你判断的异常" : stable ? "分部已能按既定方针自行处理常规事务" : "分部仍在成形或需要处理警讯",
  };
}

export function attentionAutomationCandidates(game: GameState): AttentionAutomationCandidate[] {
  return [
    ...game.departments.map((department) => departmentCandidate(game, department)),
    ...(game.management?.branches ?? []).filter((branch) => branch.status !== "lost").map((branch) => branchCandidate(game, branch)),
  ];
}

function hasApproval(state: AttentionSimulationState, id: string) {
  return state.approvals.some((approval) => approval.id === id);
}

export function confirmAttentionAutomation(
  current: AttentionSimulationState | undefined,
  candidate: AttentionAutomationCandidate,
  week: number,
): AttentionSimulationState {
  if (!candidate.ready) throw new Error(candidate.reason);
  const state = ensureAttentionSimulationState(current);
  if (hasApproval(state, candidate.id)) {
    return {
      ...state,
      approvals: state.approvals.map((approval) => approval.id === candidate.id ? { ...approval, status: "confirmed", reviewReason: undefined } : approval),
      reopenedRefs: [...new Set([...state.reopenedRefs, candidate.id])],
    };
  }
  const approval: AttentionAutomationApproval = {
    id: candidate.id,
    label: candidate.label,
    scope: candidate.scope,
    status: "confirmed",
    confirmedWeek: Math.max(0, week),
    lastRunWeek: 0,
    runCount: 0,
    sourceRefs: candidate.sourceRefs,
  };
  return {
    ...state,
    approvals: [...state.approvals, approval],
    reopenedRefs: [...new Set([...state.reopenedRefs, candidate.id])],
  };
}

export function pauseAttentionAutomation(current: AttentionSimulationState | undefined, id: string, reason = "先处理这项异常") {
  const state = ensureAttentionSimulationState(current);
  if (!hasApproval(state, id)) return state;
  return {
    ...state,
    approvals: state.approvals.map((approval) => approval.id === id ? { ...approval, status: "paused" as const, reviewReason: reason.slice(0, 180) } : approval),
    focusRefs: [...new Set([...state.focusRefs, id])],
  };
}

export function focusAttention(current: AttentionSimulationState | undefined, id: string) {
  const state = ensureAttentionSimulationState(current);
  return {
    ...state,
    focusRefs: [...new Set([...state.focusRefs, id])],
    reopenedRefs: [...new Set([...state.reopenedRefs, id])],
  };
}

export function reopenAttention(current: AttentionSimulationState | undefined, ref: string) {
  const state = ensureAttentionSimulationState(current);
  const normalized = ref.trim().slice(0, 120);
  if (!normalized) return state;
  return {
    ...state,
    focusRefs: [...new Set([...state.focusRefs, normalized])],
    reopenedRefs: [...new Set([...state.reopenedRefs, normalized])],
  };
}

export function releaseAttention(current: AttentionSimulationState | undefined, id: string) {
  const state = ensureAttentionSimulationState(current);
  return { ...state, focusRefs: state.focusRefs.filter((ref) => ref !== id) };
}

export function advanceAttentionSimulation(current: AttentionSimulationState | undefined, input: AttentionAdvanceInput): AttentionSimulationState {
  const state = ensureAttentionSimulationState(current);
  if (input.week <= state.lastWeek) return state;
  const issues = input.organizationIssues ?? [];
  const approvals = state.approvals.map((approval) => {
    if (approval.status !== "confirmed") return approval;
    const issue = issues.find((candidate) => ISSUE_STATES.has(candidate.state) && candidate.urgency >= 70 && approval.sourceRefs.includes(candidate.sourceId));
    if (issue) {
      return {
        ...approval,
        status: "needs-review" as const,
        reviewReason: "负责人遇到与你授权范围有关的异常，已停下等待判断",
      };
    }
    return { ...approval, lastRunWeek: input.week, runCount: approval.runCount + 1, reviewReason: undefined };
  });
  const ran = approvals.filter((approval) => approval.status === "confirmed" && approval.lastRunWeek === input.week).map((approval) => `${approval.label}继续按已确认的边界处理常规事务。`);
  return {
    ...state,
    approvals,
    lastWeek: input.week,
    reopenedRefs: [...new Set([...state.reopenedRefs, ...approvals.map((approval) => approval.id)])],
    backgroundSummaries: [...ran, ...state.backgroundSummaries].slice(0, 8),
  };
}

export function projectAttentionForPlayer(game: GameState): AttentionPlayerProjection {
  const state = ensureAttentionSimulationState(game.attentionSimulation);
  const items = state.approvals.map((approval) => {
    const focused = state.focusRefs.includes(approval.id);
    const mode = approval.status === "needs-review" ? "需要你关注" as const : approval.status === "paused" ? "已暂停" as const : "自动运行" as const;
    const detail = focused
      ? "已重新展开负责人、相关地点与情报；你可以把新的决定写回议桌。"
      : mode === "自动运行"
        ? "你不关注时，负责人按已确认边界继续处理；真正的异常会回到三件大事。"
        : approval.reviewReason ?? "这项流程不会自行扩大范围，等待你重新判断。";
    return { id: approval.id, label: approval.label, mode, detail, focused, reopenable: true as const };
  });
  return {
    notice: state.approvals.length
      ? "世界不会因为你暂时移开注意力而停止；只有你确认过的成熟流程会在原授权内自动运行。关注只改变展开粒度，不提供数值加成，也不会改写已发生的结果。"
      : "尚未确认任何流程自动运行。负责人仍按现有授权处理日常事务，异常会进入三件大事，成熟后再由你决定是否收拢。",
    items,
    confirmedCount: state.approvals.filter((approval) => approval.status === "confirmed").length,
    focusedCount: state.focusRefs.length,
    backgroundSummaries: state.backgroundSummaries.slice(0, 3),
  };
}
