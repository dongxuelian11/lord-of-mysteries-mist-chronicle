// 动态记忆审计：重复、孤立引用、冲突事实、无效角色、失效承诺、Trace 上限等。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function auditState(memory, registry, currentWeek, traceCount) {
  const findings = [];
  const eventIds = new Set(memory.events.map((event) => event.id));
  const beliefKeys = new Map();
  const relationshipKeys = new Set();

  for (const event of memory.events) {
    for (const id of [...event.participantIds, ...event.observerIds]) {
      if (registry.characterIds.size && !registry.characterIds.has(id) && id !== "player") {
        findings.push(`invalid-character:${event.id}:${id}`);
      }
    }
    for (const cause of event.causeEventIds) {
      if (!eventIds.has(`mem:event:${cause}`)) findings.push(`orphan-cause:${event.id}:${cause}`);
    }
    for (const consequence of event.consequenceEventIds) {
      if (!eventIds.has(`mem:event:${consequence}`)) findings.push(`orphan-consequence:${event.id}:${consequence}`);
    }
  }
  for (const belief of memory.beliefs) {
    const key = `${belief.characterId}|${belief.claimType}|${belief.subjectId}`;
    if (belief.active && beliefKeys.has(key)) findings.push(`duplicate-active-belief:${key}`);
    beliefKeys.set(key, belief.id);
    if (!belief.learnedFrom?.sourceId) findings.push(`belief-without-source:${belief.id}`);
    if (registry.characterIds.size && !registry.characterIds.has(belief.characterId) && belief.characterId !== "player") {
      findings.push(`invalid-character-belief:${belief.id}`);
    }
  }
  // 互斥有效世界事实（同角色同主体同时存在 true 与 false 的 active belief）
  const bySubject = new Map();
  for (const belief of memory.beliefs) {
    if (!belief.active) continue;
    const key = `${belief.characterId}|${belief.subjectId}`;
    const list = bySubject.get(key) ?? [];
    list.push(belief);
    bySubject.set(key, list);
  }
  for (const list of bySubject.values()) {
    if (list.some((item) => item.truthStatus === "true") && list.some((item) => item.truthStatus === "false")) {
      findings.push(`conflicting-active-belief:${list[0].characterId}:${list[0].subjectId}`);
    }
  }
  for (const commitment of memory.commitments) {
    for (const id of commitment.participantIds) {
      if (registry.characterIds.size && !registry.characterIds.has(id) && id !== "player") {
        findings.push(`invalid-character-commitment:${commitment.id}:${id}`);
      }
    }
    if (commitment.status === "active" && commitment.dueWeek !== undefined && commitment.dueWeek < currentWeek) {
      findings.push(`expired-active-commitment:${commitment.id}`);
    }
  }
  for (const cause of memory.relationshipCauses) {
    const key = `${cause.sourceEventId}|${cause.fromCharacterId}|${cause.toCharacterId}|${cause.dimension}`;
    if (relationshipKeys.has(key)) findings.push(`duplicate-relationship:${key}`);
    relationshipKeys.add(key);
    if (cause.delta < -100 || cause.delta > 100) findings.push(`relationship-delta-range:${cause.id}`);
  }
  for (const plan of memory.plans) {
    if (["completed", "failed", "abandoned"].includes(plan.status) && plan.dueWeek === undefined && plan.sourceEventIds.length === 0) {
      findings.push(`terminal-plan-without-evidence:${plan.id}`);
    }
  }
  if (traceCount > 64) findings.push("trace-over-limit");
  return findings;
}

export async function runMemoryAudit() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const { emptyMemoryState, deriveMemory, memoryTraceCount } = memoryModule;
  const registry = {
    characterIds: new Set(["player", "mara", "rowan", "ines", "cedric", "audrey"]),
    organizationIds: new Set(),
  };
  const seeds = [
    { kind: "event", sourceEventId: "e-1", week: 1, type: "rescue", summary: "救助", participantIds: ["player", "rowan"], observerIds: ["ines"] },
    { kind: "event", sourceEventId: "e-1", week: 1, type: "rescue", summary: "重复", participantIds: ["player", "rowan"], observerIds: ["ines"] },
    { kind: "belief", characterId: "cedric", subjectId: "funds", claimType: "rumor", claim: "资金链断裂", confidence: 0.6, truthStatus: "false", learnedFrom: { type: "rumor", sourceId: "e-1" }, validFromWeek: 5 },
    { kind: "belief", characterId: "cedric", subjectId: "funds", claimType: "rumor", claim: "资金链断裂", confidence: 0.6, truthStatus: "false", learnedFrom: { type: "rumor", sourceId: "e-1" }, validFromWeek: 5 },
    { kind: "commitment", id: "c-1", type: "promise", participantIds: ["player", "mara"], summary: "保护证人", createdWeek: 1, dueWeek: 18, sourceEventId: "e-1" },
    { kind: "relationship", sourceEventId: "e-1", fromCharacterId: "player", toCharacterId: "rowan", dimension: "trust", delta: 12, summary: "救助", createdWeek: 3, decayPolicy: "none" },
    { kind: "plan", id: "p-1", ownerId: "player", participantIds: ["mara"], title: "长期计划", objective: "目标", currentStep: "步骤", createdWeek: 12, status: "active" },
    { kind: "commitment", id: "c-1", type: "promise", participantIds: ["player", "mara"], summary: "保护证人", createdWeek: 1, dueWeek: 18, status: "fulfilled", sourceEventId: "e-1", resolvedByEventId: "action-1" },
  ];
  const { state } = deriveMemory(emptyMemoryState(), seeds, registry);
  const findings = auditState(state, registry, 50, memoryTraceCount());
  return { state, findings, counts: { events: state.events.length, beliefs: state.beliefs.length, commitments: state.commitments.length, relationships: state.relationshipCauses.length, plans: state.plans.length } };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runMemoryAudit();
  console.log("[memory:audit]");
  console.log(`  计数: ${JSON.stringify(result.counts)}`);
  if (result.findings.length) {
    console.log(`  发现 ${result.findings.length} 项：${result.findings.slice(0, 12).join(", ")}`);
  } else {
    console.log("  未发现重复记忆、孤立引用、互斥事实、无效角色或失效承诺");
  }
  const pass =
    result.findings.length === 0 &&
    result.counts.events === 1 &&
    result.counts.beliefs === 1 &&
    result.counts.commitments === 1 &&
    result.counts.relationships === 1 &&
    result.counts.plans === 1;
  console.log(`[memory:audit] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
