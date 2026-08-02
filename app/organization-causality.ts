import type { ActionResult, Department, DepartmentReport, GameState, Member, OrganizationIssue } from "./game-model.ts";

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(value))); }

function actionTouches(result: ActionResult, pattern: RegExp) {
  return pattern.test(`${result.title} ${result.contract.rawIntent} ${result.contract.desiredOutcome} ${result.contract.approach}`);
}

function departmentLoad(department: Department, results: ActionResult[]) {
  const pattern = department.id === "field" ? /调查|追踪|外勤|异常|证据|撤离|现场|监视/ : /组织|账|档案|材料|招募|设施|掩护|预算|仪式/;
  return results.filter((result) => actionTouches(result, pattern)).length;
}

function resultForMember(member: Member, results: ActionResult[]) {
  return results.find((result) => result.contract.memberIds.includes(member.id));
}

function makeIssue(input: Omit<OrganizationIssue, "id" | "state">): OrganizationIssue {
  return { ...input, id: `org-issue-${input.category}-${input.sourceId}-${input.weekCreated}`, state: "待裁决" };
}

export function advanceOrganizationCausality(game: GameState, results: ActionResult[], nextWeek: number) {
  const reports: DepartmentReport[] = [];
  const issues = game.organizationIssues.map((issue) => {
    const sourceName = game.departments.find((item) => item.id === issue.sourceId)?.name ?? game.members.find((item) => item.id === issue.sourceId)?.name ?? game.recruitPool.find((item) => item.id === issue.sourceId)?.name ?? "";
    const handled = results.some((result) => result.outcome !== "受阻" && (result.contract.rawIntent.includes(issue.title) || Boolean(sourceName && result.contract.rawIntent.includes(sourceName))));
    if (handled) return { ...issue, state: "已处理" as const };
    return issue.state === "待裁决" && nextWeek > issue.deadline ? { ...issue, state: "已逾期" as const } : issue;
  });

  const departments = game.departments.map((department) => {
    const load = departmentLoad(department, results);
    const failed = results.filter((result) => result.outcome === "受阻" && result.contract.memberIds.some((id) => department.memberIds?.includes(id))).length;
    const staffing = Math.max(1, department.memberIds?.length ?? 1);
    const capacity = clamp((department.capacity ?? 50) + Math.floor((department.budget - 10) / 4) + staffing - load * 4 - failed * 5);
    const backlog = clamp((department.backlog ?? 20) + load * 8 + failed * 7 - Math.floor(capacity / 18));
    const exposure = clamp((department.exposure ?? 10) + results.filter((result) => result.resourceChanges.secrecy < 0 && result.contract.memberIds.some((id) => department.memberIds?.includes(id))).length * 4 - (load === 0 ? 1 : 0));
    const cohesion = clamp((department.cohesion ?? 60) + (failed ? -failed * 2 : load ? 1 : 0) - ((department.tensions?.length ?? 0) > 0 ? 1 : 0));
    const requiresDecision = backlog >= 65 || exposure >= 55 || cohesion <= 35;
    const headline = requiresDecision
      ? backlog >= 65 ? `${department.name}积压已逼近失去响应能力的边缘` : exposure >= 55 ? `${department.name}的行动轨迹正在被外界拼合` : `${department.name}内部协作出现持续裂缝`
      : load ? `${department.name}承接${load}项决议，仍在授权范围内运转` : `${department.name}按常设命令维持本周基础工作`;
    const detail = `负责人依照“${department.standingOrder ?? department.mandate}”处理事务。当前能力${capacity}、积压${backlog}、凝聚${cohesion}、暴露${exposure}。`;
    const consequence = requiresDecision ? `若到第${nextWeek + 1}周仍不调整授权、预算或优先级，问题将转化为成员压力与组织暴露。` : "没有需要会长立即拍板的越权事项。";
    reports.push({ id: `department-report-${department.id}-${nextWeek}`, week: nextWeek, departmentId: department.id, headline, detail, consequence, requiresDecision });
    if (requiresDecision && !issues.some((issue) => issue.sourceId === department.id && issue.state === "待裁决")) {
      issues.push(makeIssue({ weekCreated: nextWeek, category: "部门", sourceId: department.id, title: headline, summary: `${detail} ${consequence}`, urgency: Math.max(backlog, exposure, 100 - cohesion), deadline: nextWeek + 1, signals: [headline, consequence] }));
    }
    return { ...department, capacity, backlog, exposure, cohesion, lastReport: headline };
  });

  const members = game.members.map((member) => {
    const result = resultForMember(member, results);
    const ignoredIssue = issues.some((issue) => issue.category === "成员" && issue.sourceId === member.id && issue.state === "已逾期");
    const pressure = clamp((member.personalPressure ?? 8) + (result ? result.outcome === "受阻" ? 8 : result.outcome === "部分成功" ? 3 : -2 : 1) + (member.fatigue >= 70 ? 5 : 0) + (ignoredIssue ? 8 : 0));
    const signals = [...(member.personalEventSignals ?? [])];
    let state = member.personalEventState ?? "dormant";
    let deadline = member.personalEventDeadline;
    if (pressure >= 45 && state === "dormant") {
      state = "active";
      deadline = nextWeek + 2;
      signals.push(member.personalEvent ?? `${member.name}开始回避与自身经历有关的话题。`);
    }
    if (state === "active" && deadline && nextWeek >= deadline && !issues.some((issue) => issue.category === "成员" && issue.sourceId === member.id && issue.state === "待裁决")) {
      issues.push(makeIssue({ weekCreated: nextWeek, category: "成员", sourceId: member.id, title: `${member.name}请求一次明确答复`, summary: `${member.personalEvent ?? "个人压力已经影响履职"}。这不是额外任务，而是过去数周选择形成的关系后果。`, urgency: pressure, deadline: nextWeek + 1, signals: signals.slice(-3) }));
    }
    return { ...member, personalPressure: pressure, personalEventState: state, personalEventDeadline: deadline, personalEventSignals: signals.slice(-6) };
  });

  const recruitPool = game.recruitPool.map((candidate) => {
    const related = results.find((result) => actionTouches(result, new RegExp(candidate.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
    const existingIssue = issues.find((issue) => issue.category === "招募" && issue.sourceId === candidate.id && issue.state === "待裁决");
    let momentum = clamp((candidate.relationshipMomentum ?? 0) + (related ? related.outcome === "成功" ? 18 : related.outcome === "部分成功" ? 9 : -7 : (candidate.relationshipMomentum ?? 0) !== 0 ? -2 : 0), -100, 100);
    let trust = clamp((candidate.trust ?? candidate.loyalty) + (related ? related.outcome === "成功" ? 5 : related.outcome === "部分成功" ? 2 : -3 : 0));
    let stage = candidate.relationshipStage ?? "接触";
    const stages: NonNullable<Member["relationshipStage"]>[] = ["接触", "临时合作", "长期盟友或线人", "正式成员"];
    const index = stages.indexOf(stage);
    if (related?.outcome === "成功" && momentum >= 30 + index * 12 && index < 2) {
      stage = stages[index + 1]; momentum = 5; trust = clamp(trust + 4);
    }
    if (momentum <= -25 && !existingIssue) {
      issues.push(makeIssue({ weekCreated: nextWeek, category: "招募", sourceId: candidate.id, title: `${candidate.name}正在重新评估与组织的往来`, summary: "此前的承诺、风险或冷落已经积累到转折点。若继续不回应，对方可能中断接触，甚至把组织视作威胁。", urgency: clamp(Math.abs(momentum) + 30), deadline: nextWeek + 1, signals: [candidate.personalEvent ?? "对方不再主动提供消息", `关系动量 ${momentum}`] }));
    }
    return { ...candidate, relationshipMomentum: momentum, trust, relationshipStage: stage, lastRelationshipChangeWeek: related ? nextWeek : candidate.lastRelationshipChangeWeek };
  });

  return {
    departments,
    departmentReports: [...reports, ...game.departmentReports].slice(0, 80),
    organizationIssues: issues.slice(-60),
    members,
    recruitPool,
  };
}
