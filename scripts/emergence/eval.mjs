import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { evaluateEmergenceRuns } from "../../app/emergence-evaluation.ts";

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function syntheticRun(modelId) {
  const actorIntents = ["verify roster", "compare seal", "protect source", "change route"];
  const factionIntents = ["move contact", "split archive", "exchange lead", "pause channel"];
  return {
    schemaVersion: 1,
    evidenceKind: "automated-simulation",
    modelId,
    seed: "framework-self-check-only",
    weeks: [1, 2, 3, 4].map((week) => ({
      week,
      decisions: [
        {
          agentRef: "actor:evaluator",
          intent: actorIntents[week - 1],
          disposition: "act",
          rationale: `uses actor-source-${week}`,
          reflection: { summary: `actor conclusion ${week}`, sourceRefs: [`actor-source-${week}`] },
          usedMemoryIds: [`actor-source-${week}`],
          planId: "plan:actor-evaluator",
          planTransition: week === 4 ? "completed" : week === 3 ? "rerouted" : "continued",
        },
        {
          agentRef: "faction:evaluator",
          intent: factionIntents[week - 1],
          disposition: "act",
          rationale: `uses faction-source-${week}`,
          reflection: { summary: `faction conclusion ${week}`, sourceRefs: [`faction-source-${week}`] },
          usedMemoryIds: [`faction-source-${week}`],
          planId: "plan:faction-evaluator",
          planTransition: week === 4 ? "completed" : "continued",
        },
      ],
      events: [{
        id: `event-${week}`,
        summary: `specific framework fixture event ${week}`,
        meaningful: true,
        domains: [["social"], ["economic"], ["faction"], ["world"]][week - 1],
        causeIds: week === 1 ? [] : [`event-${week - 1}`],
      }],
      relationshipChanges: [{
        sourceRef: "actor:evaluator",
        targetRef: "faction:evaluator",
        delta: week % 2 === 0 ? -1 : 1,
        causeIds: [`event-${week}`],
      }],
      state: { social: week, economic: week * 2, faction: week * 3, world: week * 4 },
      privacyViolations: [],
    })),
  };
}

async function loadRuns(inputPath) {
  if (!inputPath) return [syntheticRun("fixture-model-a"), syntheticRun("fixture-model-b")];
  const resolved = path.resolve(process.cwd(), inputPath);
  const parsed = JSON.parse(await readFile(resolved, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.runs;
}

const inputPath = argumentValue("input");
const outputPath = argumentValue("output");
const runs = await loadRuns(inputPath);
const report = evaluateEmergenceRuns(runs);
const passed = report.thresholds.every((threshold) => threshold.pass);

if (outputPath) {
  const resolved = path.resolve(process.cwd(), outputPath);
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[emergence-eval] report=${resolved}`);
}

console.log(`[emergence-eval] source=${inputPath ? path.resolve(process.cwd(), inputPath) : "synthetic-framework-fixture"}`);
console.log(`[emergence-eval] runs=${report.runs.length} crossModel=${report.crossModel.length} thresholds=${report.thresholds.length}`);
for (const run of report.runs) {
  const failed = report.thresholds.filter((threshold) => threshold.modelId === run.modelId && !threshold.pass);
  console.log(`[emergence-eval] ${run.modelId} weeks=${run.weekCount} decisions=${run.decisionCount} events=${run.eventCount} failed=${failed.map((item) => item.metric).join(",") || "none"}`);
}
if (!inputPath) console.log("[emergence-eval] 注意：默认合成夹具只验证评测框架，不能作为产品质量或真人体验证据。");
console.log(report.disclaimer);
console.log(`RESULT=${passed ? "PASS" : "FAIL"}`);
if (!passed) process.exitCode = 1;
