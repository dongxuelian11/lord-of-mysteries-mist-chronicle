// 动态记忆固定长期场景评测：第 1–50 周 + 权限/衰减/原子性验收。
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

export async function runMemoryEval() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const {
    emptyMemoryState,
    deriveMemory,
    buildMemoryIndexes,
    buildSceneMemory,
    eventActivation,
    rehearseBelief,
    visibleBeliefs,
  } = memoryModule;
  const registry = {
    characterIds: new Set(["player", "mara", "rowan", "ines", "cedric", "audrey"]),
    organizationIds: new Set(),
  };
  const failures = [];
  let memory = emptyMemoryState();

  // 固定路线
  const steps = [
    { week: 1, seeds: [{ kind: "commitment", id: "c-w1", type: "promise", debtorId: "player", creditorId: "mara", participantIds: ["player", "mara"], summary: "承诺保护证人并按时交换情报", createdWeek: 1, dueWeek: 18, sourceEventId: "w1-promise", importance: 0.85, secrecy: "restricted" }] },
    { week: 3, seeds: [{ kind: "event", sourceEventId: "w3-rescue", week: 3, type: "rescue", summary: "玩家救助了玛拉", participantIds: ["player", "mara"], observerIds: ["rowan"], locationId: "cherwood", importance: 0.9, emotionalWeight: 0.8, tags: ["rescue", "relationship"] }, { kind: "relationship", sourceEventId: "w3-rescue", fromCharacterId: "mara", toCharacterId: "player", dimension: "trust", delta: 20, summary: "救命之恩", createdWeek: 3, decayPolicy: "none" }] },
    { week: 5, seeds: [{ kind: "belief", characterId: "cedric", subjectId: "org-funds", claimType: "rumor", claim: "组织资金链已经断裂", confidence: 0.7, truthStatus: "false", learnedFrom: { type: "rumor", sourceId: "w5-rumor" }, validFromWeek: 5, secrecy: "restricted", importance: 0.5 }] },
    { week: 8, seeds: [{ kind: "event", sourceEventId: "w8-betrayal", week: 8, type: "betrayal", summary: "伊内斯背叛了组织", participantIds: ["ines", "player"], observerIds: ["mara"], importance: 0.95, emotionalWeight: 0.9, tags: ["betrayal", "relationship"] }, { kind: "relationship", sourceEventId: "w8-betrayal", fromCharacterId: "player", toCharacterId: "ines", dimension: "resentment", delta: -30, summary: "重大背叛", createdWeek: 8, decayPolicy: "none" }, { kind: "belief", characterId: "mara", subjectId: "ines-loyalty", claimType: "observation", claim: "伊内斯不可信任", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "w8-betrayal" }, validFromWeek: 8, secrecy: "restricted", importance: 0.8 }] },
    { week: 10, seeds: [{ kind: "event", sourceEventId: "w10-identity", week: 10, type: "identity-reveal", summary: "玛拉得知了会长的秘密身份", participantIds: ["player", "mara"], observerIds: ["mara"], importance: 0.9, emotionalWeight: 0.7, tags: ["identity-reveal", "secret"] }, { kind: "belief", characterId: "mara", subjectId: "leader-identity", claimType: "secret", claim: "会长就是那位传说中的冒险家", confidence: 0.95, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "w10-identity" }, validFromWeek: 10, secrecy: "secret", importance: 0.9 }] },
    { week: 12, seeds: [{ kind: "plan", id: "p-12", ownerId: "player", participantIds: ["player", "mara", "rowan"], title: "长期反制计划", objective: "瓦解背叛者的情报网", currentStep: "收集名单", createdWeek: 12, status: "active", secrecy: "restricted", importance: 0.8 }] },
    { week: 15, seeds: [{ kind: "belief", characterId: "cedric", subjectId: "org-funds", claimType: "rumor", claim: "账目复核证明资金链正常", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "report", sourceId: "w15-audit" }, validFromWeek: 15, secrecy: "public", importance: 0.6 }] },
    { week: 18, seeds: [{ kind: "commitment", id: "c-w1", type: "promise", debtorId: "player", creditorId: "mara", participantIds: ["player", "mara"], summary: "承诺保护证人并按时交换情报", createdWeek: 1, dueWeek: 18, status: "fulfilled", sourceEventId: "w1-promise", resolvedByEventId: "w18-action", importance: 0.85, secrecy: "restricted" }] },
  ];
  for (const step of steps) {
    const result = deriveMemory(memory, step.seeds, registry);
    memory = result.state;
  }

  for (const week of [20, 30, 50]) {
    // 世界事实仍存在
    assert(memory.events.some((event) => event.sourceEventId === "w3-rescue"), `w${week}: 救助事实丢失`, failures);
    assert(memory.events.some((event) => event.sourceEventId === "w8-betrayal"), `w${week}: 背叛事实丢失`, failures);
    assert(memory.events.some((event) => event.sourceEventId === "w10-identity"), `w${week}: 身份揭露事实丢失`, failures);
    // 正确角色记得
    const maraBeliefs = visibleBeliefs(memory, "mara", "actor");
    assert(maraBeliefs.some((belief) => belief.subjectId === "ines-loyalty"), `w${week}: 玛拉记得背叛认知`, failures);
    assert(maraBeliefs.some((belief) => belief.subjectId === "leader-identity"), `w${week}: 玛拉记得秘密身份`, failures);
    // 无关角色不知道
    const rowanBeliefs = visibleBeliefs(memory, "rowan", "actor");
    assert(!rowanBeliefs.some((belief) => belief.subjectId === "leader-identity"), `w${week}: 罗文不应知道秘密身份`, failures);
    // 错误信念被纠正但历史可追溯
    const cedricBeliefs = memory.beliefs.filter((belief) => belief.characterId === "cedric" && belief.subjectId === "org-funds");
    assert(cedricBeliefs.some((belief) => belief.truthStatus === "false" && !belief.active), `w${week}: 旧错误信念应保留但失效`, failures);
    assert(cedricBeliefs.some((belief) => belief.truthStatus === "true" && belief.active), `w${week}: 新正确信念应有效`, failures);
    // 背叛与救助仍是关系原因（不衰减）
    const betrayal = memory.relationshipCauses.find((cause) => cause.sourceEventId === "w8-betrayal");
    assert(betrayal?.active !== false, `w${week}: 背叛原因仍存在`, failures);
    const rescue = memory.relationshipCauses.find((cause) => cause.sourceEventId === "w3-rescue");
    assert(rescue?.active !== false, `w${week}: 救助原因仍存在`, failures);
    // 已完成承诺不再作为未完成项
    const commitment = memory.commitments.find((item) => item.id === "c-w1");
    assert(commitment?.status === "fulfilled", `w${week}: 承诺应已履行`, failures);
    // 长期计划状态正确
    assert(memory.plans.find((plan) => plan.id === "p-12")?.status === "active", `w${week}: 计划应保持 active`, failures);
    // 秘密身份只对授权角色可见
    const rowanContext = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: week, actorId: "rowan" });
    assert(!rowanContext.worldFacts.some((ref) => ref.id.includes("w10-identity")), `w${week}: 罗文上下文不得含身份揭露事件`, failures);
    const maraContext = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: week, actorId: "mara" });
    assert(maraContext.worldFacts.some((ref) => ref.id.includes("w10-identity")), `w${week}: 玛拉上下文应含身份揭露事件`, failures);
    assert(maraContext.totalCharacters <= 3000, `w${week}: 上下文预算有界`, failures);
  }

  // 三种视角差异
  const observerContext = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "mara" });
  const rumorContext = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "cedric" });
  const unknownContext = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "rowan" });
  assert(observerContext.worldFacts.some((ref) => ref.id.includes("w10-identity")), "视角：亲眼观察者知道身份", failures);
  assert(!rumorContext.worldFacts.some((ref) => ref.id.includes("w10-identity")), "视角：传闻者不知道身份", failures);
  assert(!unknownContext.worldFacts.some((ref) => ref.id.includes("w10-identity")), "视角：完全不知道者无身份记忆", failures);

  // 衰减
  const ordinarySeed = { kind: "event", sourceEventId: "w2-chat", week: 2, type: "chat", summary: "普通闲聊", participantIds: ["player", "ines"], importance: 0.25, emotionalWeight: 0.1, tags: ["chat"] };
  const { state: decayState } = deriveMemory(memory, [ordinarySeed], registry);
  const ordinaryEvent = decayState.events.find((event) => event.sourceEventId === "w2-chat");
  const rescueEvent = decayState.events.find((event) => event.sourceEventId === "w3-rescue");
  assert(eventActivation(ordinaryEvent, 50) < eventActivation(rescueEvent, 50), "衰减：闲聊激活度低于救命之恩", failures);
  assert(eventActivation(rescueEvent, 50) >= 0.55, "衰减：救命之恩保持 active", failures);
  assert(eventActivation(ordinaryEvent, 50) < 0.35, "衰减：普通闲聊进入 dormant", failures);
  // 地点唤起
  const cued = eventActivation(ordinaryEvent, 50, 1, 0);
  assert(cued > eventActivation(ordinaryEvent, 50, 0, 0), "唤起：地点/线索提高激活度", failures);
  // 事实未被删除
  assert(decayState.events.some((event) => event.sourceEventId === "w2-chat"), "衰减：事实本身未删除", failures);
  // rehearse
  const maraSecret = memory.beliefs.find((belief) => belief.subjectId === "leader-identity");
  const rehearsed = rehearseBelief(memory, maraSecret.id, 50);
  const updatedAudience = rehearsed.audienceStates.find(
    (item) => item.memoryId === maraSecret.id && item.audienceKind === "actor" && item.actorId === "mara"
  );
  assert(updatedAudience.recallCount === 1, "rehearse：recallCount 增加", failures);
  assert(updatedAudience.lastRecalledWeek === 50, "rehearse：lastRecalledWeek 更新", failures);
  // 确定性
  const again = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "mara" });
  const again2 = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "mara" });
  assert(
    JSON.stringify(again.worldFacts.map((ref) => ref.id)) === JSON.stringify(again2.worldFacts.map((ref) => ref.id)),
    "确定性：相同输入相同输出",
    failures
  );

  // 大规模历史下上下文有界（不包含全部历史）
  const largeSeeds = Array.from({ length: 50 }, (_, index) => ({
    kind: "event",
    sourceEventId: `bulk-${index}`,
    week: 1 + index,
    type: "chat",
    summary: `第 ${index + 1} 条普通事件`,
    participantIds: ["player", "mara"],
    observerIds: [],
    importance: 0.2,
    emotionalWeight: 0.1,
    tags: ["chat"],
  }));
  const { state: largeState } = deriveMemory(memory, largeSeeds, registry);
  const largeContext = buildSceneMemory({ sceneType: "dialogue", state: largeState, indexes: buildMemoryIndexes(largeState), currentWeek: 60, actorId: "mara" });
  assert(largeContext.worldFacts.length < largeState.events.length, "上下文不得包含全部历史（大规模下）", failures);
  assert(largeContext.totalCharacters <= 3000, "大规模下上下文预算有界", failures);
  // 原子性：重复派生不重复写入
  const duplicate = deriveMemory(memory, steps.flatMap((step) => step.seeds), registry);
  assert(duplicate.state.events.length === memory.events.length, "原子性：重放不重复写入事件", failures);
  assert(duplicate.state.beliefs.length === memory.beliefs.length, "原子性：重放不重复写入信念", failures);
  // 存档往返
  const serialized = JSON.parse(JSON.stringify(memory));
  assert(serialized.events.length === memory.events.length && serialized.beliefs.length === memory.beliefs.length, "存档往返：记忆完整", failures);

  // 权限泄漏
  const worldContext = buildSceneMemory({ sceneType: "world", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50 });
  const playerContext = buildSceneMemory({ sceneType: "player", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "player" });
  const inesContext = buildSceneMemory({ sceneType: "dialogue", state: memory, indexes: buildMemoryIndexes(memory), currentWeek: 50, actorId: "ines" });
  const leak =
    (inesContext.actorBeliefs.some((ref) => ref.id.includes("leader-identity")) ? 1 : 0) +
    (inesContext.worldFacts.some((ref) => ref.id.includes("w10-identity")) ? 1 : 0);
  assert(leak === 0, "权限：伊内斯不得看到玛拉的秘密身份记忆", failures);
  assert(worldContext.actorBeliefs.length >= 1, "世界视图可读信念", failures);
  assert(playerContext.activePlans.length >= 1, "玩家视图包含自己的长期计划", failures);

  return { memory, failures };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runMemoryEval();
  console.log("[memory:eval]");
  console.log(`  记忆规模: events=${result.memory.events.length} beliefs=${result.memory.beliefs.length} commitments=${result.memory.commitments.length} relationships=${result.memory.relationshipCauses.length} plans=${result.memory.plans.length}`);
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项:`);
    for (const failure of result.failures.slice(0, 20)) console.log(`  - ${failure}`);
  } else {
    console.log("  第 20/30/50 周检查、三角色视角、衰减、确定性、原子性、权限泄漏全部通过");
  }
  const pass = result.failures.length === 0;
  console.log(`[memory:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
