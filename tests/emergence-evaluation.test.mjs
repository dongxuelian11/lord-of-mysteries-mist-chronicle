import assert from "node:assert/strict";
import test from "node:test";

import { evaluateEmergenceRuns } from "../app/emergence-evaluation.ts";

function run(modelId, options = {}) {
  const repeated = options.repeated ?? false;
  const privacyViolation = options.privacyViolation ?? false;
  return {
    schemaVersion: 1,
    evidenceKind: "automated-simulation",
    modelId,
    seed: "eval-seed-1",
    weeks: [1, 2, 3, 4].map((week) => ({
      week,
      decisions: [
        {
          agentRef: "actor:reporter",
          intent: repeated ? "继续观察" : ["核验名单", "比较印章", "保护消息源", "改走旧桥"][week - 1],
          disposition: week === 1 ? "observe" : "act",
          rationale: `依据 source-${week} 与长期计划推进`,
          reflection: { summary: repeated ? "本周没有新的可感知变化，继续维持当前目标" : `第${week}周反思 source-${week}`, sourceRefs: [`source-${week}`] },
          usedMemoryIds: [`source-${week}`],
          planId: "plan:reporter",
          planTransition: week === 3 ? "rerouted" : week === 4 ? "completed" : "continued",
        },
        {
          agentRef: "faction:press",
          intent: repeated ? "继续观察" : ["转移联络点", "分散档案", "交换消息", "暂停高风险渠道"][week - 1],
          disposition: "act",
          rationale: `依据 faction-source-${week}`,
          reflection: { summary: repeated ? "本周没有新的可感知变化，继续维持当前目标" : `势力反思 faction-source-${week}`, sourceRefs: [`faction-source-${week}`] },
          usedMemoryIds: [`faction-source-${week}`],
          planId: "plan:press",
          planTransition: week === 4 ? "abandoned" : "continued",
        },
      ],
      events: [
        { id: `event-${week}`, summary: `第${week}周发生具体变化`, meaningful: !(options.meaningless && week === 4), domains: week === 1 ? ["social"] : week === 2 ? ["economic"] : week === 3 ? ["faction"] : ["world"], causeIds: week === 1 ? [] : [`event-${week - 1}`] },
      ],
      relationshipChanges: [{ sourceRef: "actor:reporter", targetRef: "faction:press", delta: week % 2 ? 2 : -1, causeIds: [`event-${week}`] }],
      state: { social: week * 2, economic: week * 3, faction: week * 4, world: week * 5 },
      privacyViolations: privacyViolation && week === 2 ? [{ agentRef: "actor:reporter", memoryId: "press-secret", ownerRef: "faction:press" }] : [],
    })),
  };
}

test("automated emergence evaluation covers continuity, privacy, reflection, causality, diversity, plans, state change, and quality ratios", () => {
  const report = evaluateEmergenceRuns([run("model-a"), run("model-b", { repeated: true, privacyViolation: true, meaningless: true })]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.evidenceKind, "automated-simulation");
  assert.equal(report.humanPlaytestCompleted, false);
  assert.equal(report.runs.length, 2);

  const good = report.runs.find((item) => item.modelId === "model-a");
  const weak = report.runs.find((item) => item.modelId === "model-b");
  for (const key of [
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
  ]) assert.equal(typeof good.metrics[key], "number", key);

  assert.equal(good.metrics.privateKnowledgeIsolation, 1);
  assert.ok(good.metrics.reflectionDecisionInfluence >= 0.99);
  assert.equal(good.metrics.relationshipCausalCoverage, 1);
  assert.equal(good.metrics.stateDomainCoverage, 1);
  assert.equal(good.metrics.meaninglessEventRate, 0);
  assert.ok(good.metrics.actionDiversity > weak.metrics.actionDiversity);
  assert.ok(good.metrics.actionRepetitionRate < weak.metrics.actionRepetitionRate);
  assert.ok(good.metrics.templatedReflectionRate < weak.metrics.templatedReflectionRate);
  assert.ok(weak.metrics.privateKnowledgeIsolation < 1);
  assert.ok(weak.metrics.meaninglessEventRate > 0);
  assert.equal(report.crossModel.length, 1);
  assert.equal(report.crossModel[0].models.length, 2);
  assert.ok(report.thresholds.every((threshold) => typeof threshold.pass === "boolean"));
  assert.match(report.disclaimer, /不能替代真人|真人体验/);
});

test("evaluation rejects records that claim to be human evidence", () => {
  const invalid = run("model-a");
  invalid.evidenceKind = "human-playtest";
  assert.throws(() => evaluateEmergenceRuns([invalid]), /自动评测只接受 automated-simulation/);
});
