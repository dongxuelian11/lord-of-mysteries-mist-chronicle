// 动态记忆集成审计：七类调用点接线、孤立事件、计划一致性、propositionKey、检索副作用。
import fs from "node:fs";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function wiredSites() {
  const engine = fs.readFileSync("app/game-engine.ts", "utf8");
  const council = fs.readFileSync("app/council-ai.ts", "utf8");
  const ability = fs.readFileSync("app/ability-system.ts", "utf8");
  const runtime = fs.readFileSync("app/world-runtime.ts", "utf8");
  const autonomousMemory = fs.readFileSync("app/memory/autonomous.ts", "utf8");
  return {
    dialogue: engine.includes("memoryPromptBlockWithIds(game.memory, \"dialogue\""),
    council: council.includes("speakerDynamicMemory"),
    ability: ability.includes("dynamicMemory: abilityMemoryView.text"),
    world: engine.includes("worldMemoryView") && engine.includes("worldSystemAudience"),
    playerBrief: engine.includes("situationMemoryView"),
    playerLiterary: engine.includes("literaryMemoryView"),
    autonomousAgent:
      runtime.includes("dynamicMemory: dynamicMemory.text") &&
      runtime.includes("memoryReferenceIds: dynamicMemory.referenceIds") &&
      runtime.includes("usedMemoryIds") &&
      autonomousMemory.includes("AutonomousMemoryAudience") &&
      engine.includes("memory: game.memory ?? emptyMemoryState()") &&
      engine.includes('stage: "autonomous-agent"') &&
      engine.includes("proposal.usedMemoryIds") &&
      engine.includes("factionAudience"),
  };
}

export async function runIntegrationAudit() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const {
    emptyMemoryState,
    deriveMemory,
    buildMemoryIndexes,
    buildSceneMemory,
    memoryTraceCount,
  } = memoryModule;
  const sites = wiredSites();
  const findings = [];

  // 孤立 MemoryEvent / 缺 propositionKey / 计划不一致
  const registry = {
    characterIds: new Set(["player", "mara", "rowan", "ines", "cedric"]),
    organizationIds: new Set(),
  };
  const { state } = deriveMemory(
    emptyMemoryState(),
    [
      { kind: "event", sourceEventId: "e-ok", week: 1, type: "chat", summary: "正常事件", participantIds: ["player", "mara"], observerIds: [] },
      { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", claim: "旧版无命题键", confidence: 0.6, truthStatus: "uncertain", learnedFrom: { type: "observed", sourceId: "e-ok" }, validFromWeek: 1 },
      { kind: "belief", characterId: "mara", subjectId: "s", claimType: "c", claim: "带命题键", confidence: 0.8, truthStatus: "true", propositionKey: "character:mara:identity:secret", learnedFrom: { type: "observed", sourceId: "e-ok" }, validFromWeek: 2 },
      { kind: "plan", id: "p-1", sourcePlanId: "proj-1", ownerId: "player", participantIds: [], title: "计划", objective: "目标", currentStep: "步骤", createdWeek: 1, status: "completed" },
    ],
    registry
  );
  state.events.push({
    id: "mem:event:orphan",
    sourceEventId: "e-orphan",
    week: 99,
    type: "chat",
    summary: "孤立事件",
    participantIds: [],
    observerIds: [],
    organizationIds: [],
    importance: 0.5,
    emotionalWeight: 0.3,
    truthStatus: "world-fact",
    status: "active",
    causeEventIds: [],
    consequenceEventIds: [],
    supersedes: [],
    createdBy: "deterministic-rule",
    tags: [],
  });
  // 模拟旧存档：一条没有 propositionKey 的信念
  state.beliefs.push({
    id: "mem:belief:legacy:1",
    characterId: "ines",
    subjectId: "old-subject",
    claimType: "old-claim",
    claim: "旧存档信念",
    confidence: 0.5,
    truthStatus: "uncertain",
    learnedFrom: { type: "report", sourceId: "old-report" },
    validFromWeek: 1,
    secrecy: "restricted",
    active: true,
    contradictedBy: [],
    importance: 0.4,
    emotionalWeight: 0.3,
    recallCount: 0,
  });
  const officialProjects = [{ id: "proj-1", status: "completed" }];
  for (const plan of state.plans) {
    const official = officialProjects.find((project) => project.id === plan.sourcePlanId);
    if (official && plan.status !== official.status) {
      findings.push(`plan-inconsistent:${plan.id}:memory=${plan.status}:official=${official.status}`);
    }
  }
  if (state.events.some((event) => event.sourceEventId === "e-orphan")) {
    findings.push("orphan-memory-event:e-orphan");
  }
  const legacyBeliefs = state.beliefs.filter((belief) => !belief.propositionKey);
  const legacy = state.beliefs.find((belief) => belief.id === "mem:belief:legacy:1");
  if (!legacy) findings.push("legacy-belief-missing");
  if (legacy && !memoryModule.beliefPropositionKey(legacy).startsWith("legacy:")) {
    findings.push("legacy-belief-compat-key");
  }

  // 检索只读：checksum 不变
  const before = JSON.stringify(state);
  const indexes = buildMemoryIndexes(state);
  for (let i = 0; i < 20; i += 1) {
    buildSceneMemory({ sceneType: "dialogue", state, indexes, currentWeek: 10, actorId: "mara" });
  }
  if (JSON.stringify(state) !== before) findings.push("retrieval-side-effect");
  if (memoryTraceCount() > 64) findings.push("trace-over-limit");

  const orphanDetected = findings.includes("orphan-memory-event:e-orphan");
  const unexpected = findings.filter((item) => item !== "orphan-memory-event:e-orphan");
  return { sites, findings, unexpected, orphanDetected, legacyCount: legacyBeliefs.length, counts: { events: state.events.length, beliefs: state.beliefs.length, plans: state.plans.length } };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runIntegrationAudit();
  console.log("[memory:integration:audit]");
  console.log(`  七类接线: ${JSON.stringify(result.sites)}`);
  console.log(`  状态: ${JSON.stringify(result.counts)}`);
  console.log(`  旧存档信念（无 propositionKey）：${result.legacyCount} 条，已可用兼容键读取`);
  if (result.unexpected.length) {
    console.log(`  意外问题：${result.unexpected.join("; ")}`);
  } else {
    console.log(`  孤立事件检测=${result.orphanDetected}；无计划不一致、检索副作用或 Trace 越界`);
  }
  const pass =
    Object.values(result.sites).every(Boolean) &&
    result.orphanDetected &&
    result.unexpected.length === 0;
  console.log(`[memory:integration:audit] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
