export type EmergenceEvidenceKind = "automated-simulation";

export type EmergencePlanTransition = "continued" | "completed" | "abandoned" | "rerouted";

export type EmergenceDecisionRecord = {
  agentRef: string;
  intent: string;
  disposition: string;
  rationale: string;
  reflection?: {
    summary: string;
    sourceRefs: string[];
  };
  usedMemoryIds?: string[];
  planId?: string;
  planTransition?: EmergencePlanTransition;
};

export type EmergenceEventRecord = {
  id: string;
  summary: string;
  meaningful: boolean;
  domains: Array<"social" | "economic" | "faction" | "world">;
  causeIds: string[];
};

export type EmergenceRelationshipChange = {
  sourceRef: string;
  targetRef: string;
  delta: number;
  causeIds: string[];
};

export type EmergencePrivacyViolation = {
  agentRef: string;
  memoryId: string;
  ownerRef: string;
};

export type EmergenceWeekRecord = {
  week: number;
  decisions: EmergenceDecisionRecord[];
  events: EmergenceEventRecord[];
  relationshipChanges: EmergenceRelationshipChange[];
  state: Partial<Record<"social" | "economic" | "faction" | "world", string | number | boolean>>;
  privacyViolations: EmergencePrivacyViolation[];
};

export type EmergenceRun = {
  schemaVersion: 1;
  evidenceKind: EmergenceEvidenceKind;
  modelId: string;
  seed: string;
  weeks: EmergenceWeekRecord[];
};

export type EmergenceMetrics = {
  behavioralContinuity: number;
  privateKnowledgeIsolation: number;
  reflectionDecisionInfluence: number;
  relationshipCausalCoverage: number;
  actionDiversity: number;
  actionRepetitionRate: number;
  planCompletionRate: number;
  planAbandonmentRate: number;
  planRerouteRate: number;
  stateDomainCoverage: number;
  meaninglessEventRate: number;
  templatedReflectionRate: number;
};

export type EmergenceRunResult = {
  modelId: string;
  seed: string;
  weekCount: number;
  decisionCount: number;
  eventCount: number;
  metrics: EmergenceMetrics;
};

export type EmergenceThresholdResult = {
  modelId: string;
  metric: keyof EmergenceMetrics;
  operator: ">=" | "<=";
  target: number;
  actual: number;
  pass: boolean;
};

export type EmergenceCrossModelResult = {
  models: [string, string];
  metricDeltas: EmergenceMetrics;
};

export type EmergenceEvaluationReport = {
  schemaVersion: 1;
  evidenceKind: EmergenceEvidenceKind;
  humanPlaytestCompleted: false;
  generatedAt: string;
  runs: EmergenceRunResult[];
  crossModel: EmergenceCrossModelResult[];
  thresholds: EmergenceThresholdResult[];
  disclaimer: string;
};

const DOMAINS = ["social", "economic", "faction", "world"] as const;
const METRIC_KEYS: Array<keyof EmergenceMetrics> = [
  "behavioralContinuity",
  "privateKnowledgeIsolation",
  "reflectionDecisionInfluence",
  "relationshipCausalCoverage",
  "actionDiversity",
  "actionRepetitionRate",
  "planCompletionRate",
  "planAbandonmentRate",
  "planRerouteRate",
  "stateDomainCoverage",
  "meaninglessEventRate",
  "templatedReflectionRate",
];

const THRESHOLDS: Array<{
  metric: keyof EmergenceMetrics;
  operator: ">=" | "<=";
  target: number;
}> = [
  { metric: "behavioralContinuity", operator: ">=", target: 0.45 },
  { metric: "privateKnowledgeIsolation", operator: ">=", target: 1 },
  { metric: "reflectionDecisionInfluence", operator: ">=", target: 0.6 },
  { metric: "relationshipCausalCoverage", operator: ">=", target: 0.95 },
  { metric: "actionDiversity", operator: ">=", target: 0.45 },
  { metric: "actionRepetitionRate", operator: "<=", target: 0.4 },
  { metric: "stateDomainCoverage", operator: ">=", target: 0.75 },
  { metric: "meaninglessEventRate", operator: "<=", target: 0.15 },
  { metric: "templatedReflectionRate", operator: "<=", target: 0.25 },
];

function boundedRatio(numerator: number, denominator: number, emptyValue = 0): number {
  if (denominator <= 0) return emptyValue;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function isTemplatedReflection(summary: string): boolean {
  const normalized = normalizedText(summary);
  return [
    /本周没有新的可感知变化/,
    /继续维持当前目标/,
    /本周有\d+项新事件/,
    /没有新的认知变化/,
  ].some((pattern) => pattern.test(normalized));
}

function validateRun(value: EmergenceRun, index: number): void {
  if (value?.evidenceKind !== "automated-simulation") {
    throw new Error(`自动评测只接受 automated-simulation 证据（第 ${index + 1} 项）`);
  }
  if (value.schemaVersion !== 1) throw new Error(`不支持的自动评测 schemaVersion（第 ${index + 1} 项）`);
  if (!value.modelId?.trim() || !value.seed?.trim() || !Array.isArray(value.weeks)) {
    throw new Error(`自动评测记录缺少 modelId、seed 或 weeks（第 ${index + 1} 项）`);
  }
}

function evaluateRun(run: EmergenceRun): EmergenceRunResult {
  const weeks = [...run.weeks].sort((left, right) => left.week - right.week);
  const decisions = weeks.flatMap((week) => week.decisions ?? []);
  const events = weeks.flatMap((week) => week.events ?? []);
  const relationshipChanges = weeks.flatMap((week) => week.relationshipChanges ?? []);
  const violations = weeks.flatMap((week) => week.privacyViolations ?? []);
  const knownEventIds = new Set(events.map((event) => event.id));

  const decisionsByAgent = new Map<string, EmergenceDecisionRecord[]>();
  for (const decision of decisions) {
    const current = decisionsByAgent.get(decision.agentRef) ?? [];
    current.push(decision);
    decisionsByAgent.set(decision.agentRef, current);
  }
  let continuityOpportunities = 0;
  let continuousDecisions = 0;
  for (const agentDecisions of decisionsByAgent.values()) {
    for (let index = 1; index < agentDecisions.length; index += 1) {
      continuityOpportunities += 1;
      const previous = agentDecisions[index - 1];
      const current = agentDecisions[index];
      const samePlan = Boolean(previous.planId && current.planId && previous.planId === current.planId);
      const intentContinues = normalizedText(previous.intent) === normalizedText(current.intent)
        && current.disposition !== "rest";
      if (samePlan || intentContinues) continuousDecisions += 1;
    }
  }

  const reflectedDecisions = decisions.filter((decision) => {
    const cited = new Set(decision.reflection?.sourceRefs ?? []);
    return (decision.usedMemoryIds ?? []).some((memoryId) => cited.has(memoryId));
  }).length;
  const causallyGroundedRelationships = relationshipChanges.filter((change) =>
    change.causeIds.length > 0 && change.causeIds.every((causeId) => knownEventIds.has(causeId)),
  ).length;

  const normalizedIntents = decisions.map((decision) => normalizedText(decision.intent)).filter(Boolean);
  const uniqueIntentCount = new Set(normalizedIntents).size;
  const distinctPlanIds = new Set(decisions.map((decision) => decision.planId).filter((value): value is string => Boolean(value)));
  const plansByTransition = (transition: EmergencePlanTransition) => new Set(
    decisions.filter((decision) => decision.planId && decision.planTransition === transition).map((decision) => decision.planId as string),
  ).size;

  const changedDomains = new Set<(typeof DOMAINS)[number]>();
  for (let index = 1; index < weeks.length; index += 1) {
    for (const domain of DOMAINS) {
      if (weeks[index - 1].state?.[domain] !== weeks[index].state?.[domain]) changedDomains.add(domain);
    }
  }
  for (const event of events) for (const domain of event.domains ?? []) changedDomains.add(domain);

  const reflectionSummaries = decisions
    .map((decision) => decision.reflection?.summary ?? "")
    .filter(Boolean);
  const reflectionCounts = new Map<string, number>();
  for (const summary of reflectionSummaries) {
    const normalized = normalizedText(summary);
    reflectionCounts.set(normalized, (reflectionCounts.get(normalized) ?? 0) + 1);
  }
  const templatedReflections = reflectionSummaries.filter((summary) => {
    const normalized = normalizedText(summary);
    return isTemplatedReflection(summary) || (reflectionCounts.get(normalized) ?? 0) > 1;
  }).length;

  const metrics: EmergenceMetrics = {
    behavioralContinuity: boundedRatio(continuousDecisions, continuityOpportunities, 1),
    privateKnowledgeIsolation: boundedRatio(decisions.length - violations.length, decisions.length, violations.length === 0 ? 1 : 0),
    reflectionDecisionInfluence: boundedRatio(reflectedDecisions, decisions.length),
    relationshipCausalCoverage: boundedRatio(causallyGroundedRelationships, relationshipChanges.length, 1),
    actionDiversity: boundedRatio(uniqueIntentCount, normalizedIntents.length),
    actionRepetitionRate: boundedRatio(normalizedIntents.length - uniqueIntentCount, normalizedIntents.length),
    planCompletionRate: boundedRatio(plansByTransition("completed"), distinctPlanIds.size),
    planAbandonmentRate: boundedRatio(plansByTransition("abandoned"), distinctPlanIds.size),
    planRerouteRate: boundedRatio(plansByTransition("rerouted"), distinctPlanIds.size),
    stateDomainCoverage: boundedRatio(changedDomains.size, DOMAINS.length),
    meaninglessEventRate: boundedRatio(events.filter((event) => !event.meaningful).length, events.length),
    templatedReflectionRate: boundedRatio(templatedReflections, reflectionSummaries.length),
  };

  return {
    modelId: run.modelId,
    seed: run.seed,
    weekCount: weeks.length,
    decisionCount: decisions.length,
    eventCount: events.length,
    metrics,
  };
}

function compareModels(runs: EmergenceRunResult[]): EmergenceCrossModelResult[] {
  const comparisons: EmergenceCrossModelResult[] = [];
  for (let leftIndex = 0; leftIndex < runs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < runs.length; rightIndex += 1) {
      const left = runs[leftIndex];
      const right = runs[rightIndex];
      comparisons.push({
        models: [left.modelId, right.modelId],
        metricDeltas: Object.fromEntries(
          METRIC_KEYS.map((metric) => [metric, left.metrics[metric] - right.metrics[metric]]),
        ) as EmergenceMetrics,
      });
    }
  }
  return comparisons;
}

export function evaluateEmergenceRuns(input: EmergenceRun[]): EmergenceEvaluationReport {
  if (!Array.isArray(input) || input.length === 0) throw new Error("自动评测至少需要一条 automated-simulation 记录");
  input.forEach(validateRun);
  const runs = input.map(evaluateRun);
  const thresholds = runs.flatMap((run) => THRESHOLDS.map((threshold): EmergenceThresholdResult => ({
    modelId: run.modelId,
    metric: threshold.metric,
    operator: threshold.operator,
    target: threshold.target,
    actual: run.metrics[threshold.metric],
    pass: threshold.operator === ">="
      ? run.metrics[threshold.metric] >= threshold.target
      : run.metrics[threshold.metric] <= threshold.target,
  })));

  return {
    schemaVersion: 1,
    evidenceKind: "automated-simulation",
    humanPlaytestCompleted: false,
    generatedAt: new Date().toISOString(),
    runs,
    crossModel: compareModels(runs),
    thresholds,
    disclaimer: "自动模拟指标只能发现连续性、隔离与涌现结构风险，不能替代真人体验，也不能证明游戏好玩。",
  };
}
