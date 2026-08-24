import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { verifyWorldLedger } from "../app/world-ledger.ts";

let moduleServer;

async function loadGameModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  const engine = await moduleServer.ssrLoadModule("/app/game-engine.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  const memory = await moduleServer.ssrLoadModule("/app/memory/index.ts");
  return { engine, model, memory };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

function worldEnvelope(game, chapter) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations.some((location) => location.id === "east")
    ? "east"
    : game.worldKernel.locations[0].id;
  const firstProposalId = `proposal:agent:${chapter.week}:faction:${firstFaction.id}`;
  const secondProposalId = `proposal:agent:${chapter.week}:faction:${secondFaction.id}`;
  return {
    worldSummary: {
      atmosphere: "清晨的报童比往常更早穿过街口，几处工厂同时收紧门禁，而警察厅开始逐户核对近期失踪人口。",
      changes: ["工厂收紧门禁", "警察厅核对失踪人口", "码头货运延迟"],
      undercurrents: ["两个互不相识的办事人正在追查同一本名册"],
    },
    publicSignals: [
      { channel: "报纸", headline: "东区工厂临时停工", body: "三家工厂以锅炉检修为由临时停工，工人被要求在门外等待新的排班通知。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅核对失踪人口", body: "辖区警察开始询问近期离开住所却没有向房东说明去向的住客。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "码头货运延迟", body: "两班原定清晨入港的货船被要求停在外港，卸货时间没有得到解释。", reliability: "多源传闻", districtId: "dock" },
    ],
    actionReports: [],
    factionMoves: [
      { factionId: firstFaction.id, title: "转移联络点", detail: "该势力撤掉一处已使用多周的联络点，并把文书分散交给三名信使。", visibility: "迹象", suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: "核对旧档案", detail: "该势力调取旧人口档案，与近期慈善救济名册进行交叉核对。", visibility: "获知", suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: { departmentDevelopments: [], memberDevelopments: [], recruitDevelopments: [], governanceIssues: [], newRecruitableNpc: null },
    kernelDelta: {
      newActors: [], newFactions: [], newProjects: [], actorUpdates: [],
      factionUpdates: [{ factionId: firstFaction.id, posture: "以内核状态为唯一权威", resourcesDelta: 0, suspicionDelta: 4, lastAction: "内核记录的实际行动", sourceProposalIds: [firstProposalId] }],
      projectUpdates: [{ projectId: game.worldKernel.projects[0].id, progressDelta: 2, stage: "继续推进", nextMilestone: "取得下一项可核验结果", blockers: [], status: "active", sourceProposalIds: [firstProposalId] }],
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: "街口出现更多巡警", sourceProposalIds: [firstProposalId] }],
      events: [
        { id: `event-${chapter.week}-a`, title: "临时停工", detail: "东区三家工厂同时关闭侧门。", locationId: "east", actorIds: [], factionIds: [firstFaction.id], causeIds: [], visibility: "world", sourceProposalIds: [firstProposalId] },
        { id: `event-${chapter.week}-b`, title: "人口核对", detail: "警察厅开始整理失踪人口登记。", locationId: "cherwood", actorIds: [], factionIds: [secondFaction.id], causeIds: [], visibility: "public", sourceProposalIds: [secondProposalId] },
        { id: `event-${chapter.week}-c`, title: "外港等待", detail: "两艘货船被留在外港等待检查。", locationId: "dock", actorIds: [], factionIds: [], causeIds: [], visibility: "public", sourceProposalIds: [firstProposalId] },
      ],
      observations: [], knowledge: [], canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

function bindPublicSignalsForFixture(envelope) {
  const kernel = envelope.kernelDelta && typeof envelope.kernelDelta === "object" ? envelope.kernelDelta : {};
  const events = Array.isArray(kernel.events) ? kernel.events : [];
  const signals = Array.isArray(envelope.publicSignals) ? envelope.publicSignals : [];
  kernel.observations = Array.isArray(kernel.observations) ? kernel.observations : [];
  kernel.mutationClaims = Array.isArray(kernel.mutationClaims) ? kernel.mutationClaims : [];
  for (const [index, signal] of signals.entries()) {
    if (!signal || typeof signal !== "object" || !events.length) continue;
    const event = events[index % events.length];
    const proposalId = Array.isArray(event.sourceProposalIds) ? event.sourceProposalIds.map(String).find(Boolean) : "";
    if (!proposalId || !event.id) continue;
    signal.sourceProposalId ??= proposalId;
    signal.sourceEventId ??= event.id;
    signal.sourceObservation ??= signal.body;
    if (event.locationId) signal.districtId = event.locationId;
    if (!kernel.observations.some((observation) => observation.eventId === event.id && observation.text === signal.body)) {
      kernel.observations.push({ eventId: event.id, channel: signal.channel, text: signal.body, visibility: "public", holderIds: [], perceivedRefs: [], acquisitionKind: "propagation" });
    }
  }
  envelope.kernelDelta = kernel;
  return envelope;
}

function worldModelFetch(envelope) {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    if (user.includes("为这个主体独立形成同一周起点上的提案")) {
      const agentRef = user.match(/"ref":"([^"]+)"/)?.[1] ?? "actor:unknown";
      const planningWeek = Number(user.match(/"planningWeek":(\d+)/)?.[1] ?? 1);
      const payloadStart = user.lastIndexOf("\n{");
      const payload = payloadStart >= 0 ? JSON.parse(user.slice(payloadStart + 1)) : {};
      const usedMemoryIds = payload.projection?.memoryReferenceIds?.slice(0, 1) ?? [];
      const allowedLocations = (payload.projection?.agent?.allowedTargetRefs ?? payload.projection?.allowedTargetRefs ?? [])
        .filter((ref) => typeof ref === "string" && ref.startsWith("location:"));
      const proposal = {
        planningWeek,
        agentRef,
        disposition: "act",
        intent: "推进既定安排并处理本周可见地点中的具体事务。",
        rationale: "本测试世界增量包含地点事件，因此提案必须先明确授权这些地点。",
        targetRefs: allowedLocations,
        requiredKnowledgeIds: [],
        usedMemoryIds,
      };
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ proposal }) } }] }) };
    }
    bindPublicSignalsForFixture(envelope);
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }) };
  };
}

test("closing a council week commits an independently advanced world snapshot", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, resolveWeek } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const resolved = resolveWeek(game);
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(envelope);
  try {
    const committed = await generateAiWorldDelta(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      resolved.state,
      resolved.chapter,
      () => {},
    );
    assert.equal(committed.worldSnapshots[0].week, resolved.chapter.week);
    assert.equal(committed.worldSnapshots[0].eventIds.length, 3);
    assert.ok(committed.worldKernel.events.some((event) => event.title === "临时停工"));
    assert.equal(committed.worldSignals.length, 3);
    assert.ok(committed.worldLedger.events.some((event) => event.kind === "week-committed"));
    assert.equal(committed.worldLedger.snapshots.length, 1, "weekly commits before the checkpoint interval must not duplicate full projections");
    assert.equal(committed.worldLedger.events.filter((event) => event.kind === "week-committed").at(-1).week, committed.week);
    assert.equal(verifyWorldLedger(committed.worldLedger).ok, true, verifyWorldLedger(committed.worldLedger).issues.join("\n"));
    assert.equal(committed.worldAgents.lastPlannedWeek, resolved.chapter.week);
    assert.ok(committed.worldAgents.profiles.length >= committed.worldKernel.actors.length + committed.worldKernel.factions.length);
    assert.equal(committed.factionStrategy.lastResolvedWeek, resolved.chapter.week);
    assert.ok(committed.factionStrategy.outcomes.length > 0);
    assert.equal(committed.factions[0].currentPlan, "以内核状态为唯一权威");
    assert.equal(committed.factions[0].lastMove, "内核记录的实际行动");
    assert.equal(committed.factions[0].suspicion, committed.worldKernel.factions.find((item) => item.id === committed.factions[0].id).suspicion);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("autonomous memory is delivered to each explicit audience only after the world week commits", async () => {
  const { engine, model, memory } = await loadGameModules();
  const game = model.createInitialGame("spectator");
  const resolved = engine.resolveWeek(game);
  const actorRef = resolved.state.worldAgents.activeAgentRefs.find((ref) => ref.startsWith("actor:"));
  const factionRef = resolved.state.worldAgents.activeAgentRefs.find((ref) => ref.startsWith("faction:"));
  assert.ok(actorRef);
  assert.ok(factionRef);
  const actorId = actorRef.slice("actor:".length);
  const factionId = factionRef.slice("faction:".length);
  resolved.state.memory = memory.deriveMemory(resolved.state.memory, [
    { kind: "belief", characterId: actorId, subjectId: "private-route", claimType: "route", claim: "角色私有路线只经旧桥", confidence: 0.8, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "actor-private-source" }, validFromWeek: resolved.chapter.week - 1, secrecy: "secret" },
    { kind: "event", sourceEventId: "faction-private-source", week: resolved.chapter.week - 1, type: "briefing", summary: "势力内部决定分散档案", participantIds: [], observerIds: [], organizationIds: [factionId] },
  ]).state;
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.kernelDelta.events[0].factionIds = [factionId];
  envelope.kernelDelta.events[0].sourceProposalIds = [`proposal:agent:${resolved.chapter.week}:faction:${factionId}`];
  envelope.kernelDelta.locationUpdates[0].sourceProposalIds = [`proposal:agent:${resolved.chapter.week}:faction:${factionId}`];
  const captured = [];
  const baseFetch = worldModelFetch(envelope);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    if (user.includes("为这个主体独立形成同一周起点上的提案")) {
      const start = user.lastIndexOf("\n{");
      if (start >= 0) captured.push(JSON.parse(user.slice(start + 1)));
    }
    return baseFetch(url, init);
  };
  try {
    const committed = await engine.generateAiWorldDelta(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      resolved.state,
      resolved.chapter,
      () => {},
    );
    const actorProjection = captured.find((item) => item.projection?.agent?.ref === actorRef)?.projection;
    const factionProjection = captured.find((item) => item.projection?.agent?.ref === factionRef)?.projection;
    assert.ok(actorProjection.dynamicMemory.includes("角色私有路线只经旧桥"));
    assert.ok(!actorProjection.dynamicMemory.includes("势力内部决定分散档案"));
    assert.deepEqual(actorProjection.memoryAudience, { kind: "actor", actorId });
    assert.ok(factionProjection.dynamicMemory.includes("势力内部决定分散档案"));
    assert.ok(!factionProjection.dynamicMemory.includes("角色私有路线只经旧桥"));
    assert.deepEqual(factionProjection.memoryAudience, { kind: "faction", factionId });

    for (const [ref, kind, id] of [[actorRef, "actor", actorId], [factionRef, "faction", factionId]]) {
      const actionId = `autonomous-agent:${resolved.chapter.week}:${ref}`;
      const receipts = committed.memory.receipts.filter((receipt) => receipt.actionId === actionId);
      assert.deepEqual(receipts.map((receipt) => receipt.kind).sort(), ["delivered", "presented", "recalled"]);
      assert.ok(receipts.every((receipt) => receipt.audience.kind === kind));
      assert.ok(receipts.every((receipt) => (kind === "actor" ? receipt.audience.actorId : receipt.audience.factionId) === id));
      const proposalEvent = committed.worldLedger.events.find((event) => event.id === `autonomous-proposal:${resolved.chapter.week}:${ref}`);
      const projection = kind === "actor" ? actorProjection : factionProjection;
      assert.ok(proposalEvent);
      assert.deepEqual(proposalEvent.payload.usedMemoryIds, projection.memoryReferenceIds.slice(0, 1));
      const usedMemoryId = proposalEvent.payload.usedMemoryIds[0];
      assert.ok(usedMemoryId);
      const activation = committed.memory.audienceStates.find((item) => item.memoryId === usedMemoryId
        && item.audienceKind === kind
        && (kind === "actor" ? item.actorId === id : item.factionId === id));
      assert.equal(activation?.lastRecalledWeek, resolved.chapter.week);
      assert.equal(activation?.recallCount, 1);
      if (kind === "faction") {
        const outcomeEvent = committed.worldLedger.events.find((event) => event.kind === "world-event-recorded" && event.factionIds.includes(id));
        assert.ok(outcomeEvent);
        assert.ok(outcomeEvent.causeEventIds.includes(proposalEvent.id));
        assert.deepEqual(outcomeEvent.payload.usedMemoryIds, projection.memoryReferenceIds.slice(0, 1));
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("a quiet week commits with a fixed newspaper and no fabricated world events", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, resolveWeek } = engine;
  const game = model.createInitialGame("spectator");
  const resolved = resolveWeek(game);
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.worldSummary = { atmosphere: "细雨整周没有停，报童照常沿煤气灯下的街道叫卖，城里没有出现足以惊动议会的新变化。", changes: ["煤价保持稳定", "东区有轨马车调整末班时间"], undercurrents: [] };
  envelope.publicSignals = [
    { channel: "报纸", headline: "本周煤价保持稳定", body: "几家主要煤行公布了相同的零售报价，暂未出现冬季前常见的抢购。", reliability: "公开事实", districtId: "east" },
    { channel: "官方通告", headline: "有轨马车调整末班时间", body: "东区两条线路因夜间检修提前半小时收车，调整仅持续三日。", reliability: "公开事实", districtId: "east" },
  ];
  envelope.factionMoves = [];
  envelope.canonMoves = [];
  envelope.kernelDelta.projectUpdates = [];
  envelope.kernelDelta.locationUpdates = [];
  envelope.kernelDelta.events = [];
  envelope.publicSignals = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(envelope);
  try {
    const committed = await generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    assert.equal(committed.worldSnapshots[0].eventIds.length, 0);
    assert.equal(committed.worldSignals.length, 0, "quiet week must not fabricate world signals for a local newspaper surface");
    assert.ok(committed.worldLedger.events.some((event) => event.kind === "week-committed"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("repeated public news is repaired locally without rerunning world adjudication", async () => {
  const { engine, model } = await loadGameModules();
  const game = model.createInitialGame("spectator");
  const resolved = engine.resolveWeek(game);
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  resolved.state.worldSignals = envelope.publicSignals.map((signal, index) => ({
    ...signal,
    id: `prior-signal-${index}`,
    week: Math.max(0, resolved.state.week - 1),
  }));
  const repairedSignals = [
    { channel: "报纸", headline: "皇后区慈善厨房延长开放时间", body: "三处慈善厨房本周将在晚间多开放一小时，登记处提醒领取者携带原有凭证。", reliability: "公开事实", districtId: "queens" },
    { channel: "行业消息", headline: "北区钟表行调整学徒考试", body: "钟表匠协会把本季学徒考试移至周六上午，报名费用与考核章程维持不变。", reliability: "公开事实", districtId: "north" },
  ];
  const baseFetch = worldModelFetch(envelope);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let adjudicatorCalls = 0;
  let publicSignalRepairCalls = 0;
  globalThis.window = globalThis;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    if (user.includes("本周世界事实已经完成裁决并被冻结")) {
      publicSignalRepairCalls += 1;
      const repaired = bindPublicSignalsForFixture({
        ...envelope,
        publicSignals: structuredClone(repairedSignals),
        kernelDelta: structuredClone(envelope.kernelDelta),
      });
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ publicSignals: repaired.publicSignals }) } }] }) };
    }
    if (!user.includes("为这个主体独立形成同一周起点上的提案")) adjudicatorCalls += 1;
    return baseFetch(url, init);
  };
  try {
    const committed = await engine.generateAiWorldDelta(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      resolved.state,
      resolved.chapter,
      () => {},
    );
    assert.equal(adjudicatorCalls, 1, "accepted world facts must not be adjudicated again");
    assert.equal(publicSignalRepairCalls, 1);
    assert.deepEqual(committed.worldSignals.slice(0, 2).map((signal) => signal.headline), repairedSignals.map((signal) => signal.headline));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("one agent failing twice degrades privately while peers and the week still commit", async () => {
  const { engine, model, memory } = await loadGameModules();
  const { generateAiWorldDelta, resolveWeek } = engine;
  const game = model.createInitialGame("spectator");
  const resolved = resolveWeek(game);
  const actorId = resolved.state.worldAgents.activeAgentRefs.find((ref) => ref.startsWith("actor:"))?.slice("actor:".length);
  resolved.state.memory = memory.deriveMemory(resolved.state.memory, [
    { kind: "belief", characterId: actorId, subjectId: "failed-turn", claimType: "test", claim: "失败事务不得写回此记忆的投递状态", confidence: 0.7, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "failed-source" }, validFromWeek: resolved.chapter.week - 1, secrecy: "secret" },
  ]).state;
  const memoryBefore = JSON.stringify(resolved.state.memory);
  const agentsBefore = JSON.stringify(resolved.state.worldAgents);
  const failedRef = resolved.state.worldAgents.activeAgentRefs.find((ref) => ref.startsWith("actor:"))
    ?? resolved.state.worldAgents.activeAgentRefs[0];
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let adjudicatorCalls = 0;
  globalThis.window = globalThis;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    if (!user.includes("为这个主体独立形成同一周起点上的提案")) {
      adjudicatorCalls += 1;
      bindPublicSignalsForFixture(envelope);
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }) };
    }
    const agentRef = user.match(/"ref":"([^"]+)"/)?.[1] ?? "actor:unknown";
    const planningWeek = Number(user.match(/"planningWeek":(\d+)/)?.[1] ?? resolved.chapter.week);
    let content;
    if (agentRef === failedRef) {
      content = JSON.stringify({ proposal: { agentRef, planningWeek } });
    } else {
      const payloadStart = user.lastIndexOf("\n{");
      const payload = payloadStart >= 0 ? JSON.parse(user.slice(payloadStart + 1)) : {};
      const allowedLocations = (payload.projection?.agent?.allowedTargetRefs ?? [])
        .filter((ref) => typeof ref === "string" && ref.startsWith("location:"));
      content = JSON.stringify({ proposal: { planningWeek, agentRef, disposition: "act", intent: "推进可见地点中的既定事务。", rationale: "测试世界增量需要明确地点授权。", targetRefs: allowedLocations, requiredKnowledgeIds: [] } });
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  };
  try {
    const committed = await generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    assert.equal(adjudicatorCalls, 1);
    assert.ok(committed.worldLedger.events.some((event) => event.kind === "week-committed"));
    assert.equal(committed.worldSnapshots[0].week, resolved.chapter.week);
    const degraded = committed.worldLedger.events.find((event) => event.id === `autonomous-proposal:${resolved.chapter.week}:${failedRef}`);
    assert.equal(degraded?.payload.planningSource, "deterministic-fallback");
    assert.match(degraded?.payload.planningIssue, /disposition|依据|意图/);
    assert.ok(committed.worldLedger.events.some((event) => event.kind === "action-proposed" && event.payload.planningSource === "model"));
    assert.equal(JSON.stringify(resolved.state.memory), memoryBefore);
    assert.equal(JSON.stringify(resolved.state.worldAgents), agentsBefore);
    assert.equal(resolved.state.memory.receipts.some((receipt) => receipt.stage === "autonomous-agent"), false);
    assert.ok(committed.memory.receipts.some((receipt) => receipt.stage === "autonomous-agent"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("AI organization prose without a subject-scoped event fails closed before numeric consequences", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, resolveWeek } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const resolved = resolveWeek(game);
  const department = resolved.state.departments[0];
  const member = resolved.state.members[0];
  const candidate = resolved.state.recruitPool[0];
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  const organizationSourceEvent = envelope.kernelDelta.events[1];
  const organizationSourceProposalId = organizationSourceEvent.sourceProposalIds[0];
  const organizationSourceObservation = "会长从公开通告中确认警察厅正在整理近期失踪人口登记。";
  envelope.kernelDelta.observations = [{
    eventId: organizationSourceEvent.id,
    channel: "官方通告",
    text: organizationSourceObservation,
    visibility: "player",
    holderIds: ["player"],
  }];
  const authority = { sourceProposalId: organizationSourceProposalId, sourceEventId: organizationSourceEvent.id, sourceObservation: organizationSourceObservation };
  envelope.organizationDelta = {
    departmentDevelopments: [{ departmentId: department.id, report: "负责人发现本周交接记录出现两次迟到，但尚未越过授权边界。", cause: "本周部门运转", capacityDelta: -5, cohesionDelta: -4, exposureDelta: 5, backlogDelta: 8, ...authority }],
    memberDevelopments: [{ memberId: member.id, observation: "他在散会后独自核对了两遍门锁。", cause: "本周压力", pressureDelta: 7, trustDelta: -2, ...authority }],
    recruitDevelopments: [{ memberId: candidate.id, observation: "候选人推迟了下一次见面。", momentumDelta: -8, trustDelta: -2, ...authority }],
    governanceIssues: [], newRecruitableNpc: null,
  };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(envelope);
  try {
    await assert.rejects(
      generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {}),
      /SIDECAR_AUTHORITY_REJECTED/,
    );
    assert.equal(resolved.state.departments.find((item) => item.id === department.id).capacity, department.capacity);
    assert.equal(resolved.state.members.find((item) => item.id === member.id).personalPressure, member.personalPressure);
    assert.equal(resolved.state.recruitPool.find((item) => item.id === candidate.id).relationshipMomentum, candidate.relationshipMomentum);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("AI action reports replace provisional rule notes with world-specific observations", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const contract = localContract({ intent: "让外勤组在雨夜观察旧剧院侧门的出入规律，只记录可以复核的时间与衣着，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const result = resolved.chapter.results[0];
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.actionReports = [{
    actionId: result.id,
    fieldReport: "雨从九点后逐渐变密。执行者始终留在街对面的有轨马车候车棚，没有进入剧院。",
    observableFacts: ["九点十七分，一名戴灰呢帽的人从侧门离开。", "十点零四分，同一把缺少一根伞骨的黑伞再次出现在侧门。"],
    followUp: "可以核对附近车夫是否在相同时间搭载过持黑伞的乘客。",
  }];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(envelope);
  try {
    const committed = await generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    const committedResult = committed.chronicle.find((chapter) => chapter.id === resolved.chapter.id).results[0];
    assert.deepEqual(committedResult.findings, envelope.actionReports[0].observableFacts);
    assert.match(committedResult.reasons.join(" "), /有轨马车候车棚/);
    assert.ok(committedResult.futureChanges.includes(envelope.actionReports[0].followUp));
    assert.ok(committed.evidenceNodes.some((node) => node.summary.includes("缺少一根伞骨")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("a sourced authorization boundary interrupts only the executed fragment and writes six causal receipt groups", async () => {
  const { engine, model } = await loadGameModules();
  let game = model.createInitialGame("spectator");
  const contract = engine.localContract({
    intent: "让伊妮丝与东区联络人交涉，只确认失踪者是否经过旧剧院；一旦身份掩护失效就撤退，不得继续接触。",
    game,
    leaderId: "organization",
    districtId: "east",
    abilityIds: [],
  });
  game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
  const resolved = engine.resolveWeek(game);
  const result = resolved.chapter.results[0];
  assert.ok(result.executionPlan?.executable);
  const proposalId = result.executionPlan.proposalId;
  const boundary = result.executionPlan.authorization.retreatCondition;
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.actionReports = [{
    actionId: result.id,
    fieldReport: "联络人第二次改变暗号后，伊妮丝结束交谈并按原路线撤离，没有继续试探。",
    observableFacts: ["联络点在同一次会面中两次改变约定暗号。", "伊妮丝在第二次暗号变化后立即结束交谈并离开。"],
    followUp: "在不接触联络人的前提下核验暗号变化是否已经扩散。",
  }];
  envelope.kernelDelta.events.push({
    id: "player-interruption",
    title: "联络点察觉异常",
    detail: "联络人连续两次改变约定暗号，伊妮丝确认身份掩护已经失效。",
    locationId: "east",
    actorIds: [contract.leaderId],
    factionIds: [],
    causeIds: [],
    visibility: "player",
    witnessRefs: ["player", `actor:${contract.leaderId}`],
    sourceProposalIds: [proposalId],
  });
  envelope.kernelDelta.events.push({
    id: "hidden-player-consequence",
    title: "幕后追踪开始",
    detail: "一名未被辨认的观察者开始追查联络人的旧关系。",
    locationId: "east",
    actorIds: [],
    factionIds: [],
    causeIds: ["player-interruption"],
    visibility: "world",
    sourceProposalIds: [proposalId],
  });
  envelope.kernelDelta.locationUpdates[0] = { locationId: "east", riskDelta: 2, stabilityDelta: 0, publicMood: "不安", condition: "联络点开始更换暗号", sourceProposalIds: [proposalId] };
  envelope.kernelDelta.observations.push({ eventId: "player-interruption", channel: "负责人述职", text: "身份掩护失效后，负责人按约定停止接触。", visibility: "player", holderIds: ["player"], acquisitionKind: "communication" });
  envelope.kernelDelta.knowledge.push({ subject: "东区联络点", statement: "联络点已经察觉到异常接触。", truth: "confirmed", visibility: "player", holderIds: ["player"], sourceEventId: "player-interruption", loreRecordIds: [] });
  envelope.kernelDelta.directiveInterruptions = [{ proposalId, sourceEventId: "player-interruption", triggeredBoundary: boundary, reason: "身份掩护失效，负责人按撤退条件停止接触。", completedFraction: 0.4 }];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(envelope);
  try {
    const committed = await engine.generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    const committedResult = committed.chronicle.find((item) => item.id === resolved.chapter.id).results[0];
    assert.equal(committedResult.executionStatus, "interrupted");
    assert.equal(committedResult.executionPlan.disposition, "interrupted");
    assert.ok(committed.schedule.some((action) => action.id === result.id && action.status === "interrupted"));
    assert.ok(committed.money > resolved.state.money, "the unused money commitment must be refunded");
    assert.ok(committed.organizationIssues.some((issue) => issue.originActionId === result.id && issue.directiveState === "interrupted"));
    assert.deepEqual(Object.keys(committedResult.causalReceipts).sort(), ["futureCauses", "knowledge", "locations", "people", "relationships", "resources"]);
    assert.ok(Object.values(committedResult.causalReceipts).every((receipts) => receipts.length > 0));
    assert.ok(committedResult.causalReceipts.knowledge.some((receipt) => receipt.summary.includes("察觉")));
    assert.ok(!Object.values(committedResult.causalReceipts).flat().some((receipt) => receipt.summary.includes("幕后追踪")));
    assert.ok(committed.worldLedger.events.some((event) => event.kind === "action-progressed" && event.payload.toStatus === "interrupted"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("the player can issue multiple goals without a per-person or weekly action quota", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, scheduleContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("seer");
  const first = localContract({ intent: "整理公开报纸", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  const occupied = { ...game, schedule: [scheduleContract(game, first)] };
  const second = localContract({ intent: "继续核对另一份报纸", game: occupied, leaderId: first.leaderId, districtId: "east", abilityIds: [] });
  assert.equal(scheduleContract(occupied, second).status, "planned");

  const playerFirst = localContract({ intent: "我亲自查看街区", game, leaderId: "player", districtId: "cherwood", abilityIds: [] });
  const playerGame = { ...game, schedule: [scheduleContract(game, playerFirst)] };
  const playerSecond = localContract({ intent: "我亲自参加另一项行动", game: playerGame, leaderId: "player", districtId: "east", abilityIds: [] });
  assert.equal(scheduleContract(playerGame, playerSecond).status, "planned");
  assert.equal(playerFirst.executionMode, "player-led");
});

test("a branch supervisor command is accepted and left to background scheduling", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, scheduleContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("seer");
  const supervisor = game.members.find((member) => member.pathway) ?? game.members[0];
  const withBranch = { ...game, management: { ...game.management, branches: [{ id: "branch", name: "测试分部", districtId: "cherwood", blockId: "block", supervisorId: supervisor.id, stationedManpower: 4, stationedBeyonderIds: [supervisor.id], policy: "intelligence", status: "active", controlSupport: 3, warningRefs: [] }] } };
  const contract = localContract({ intent: `让${supervisor.name}核对公开档案`, game: withBranch, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  assert.equal(scheduleContract(withBranch, contract).status, "planned");
});

test("player scope and explicit bans survive contract parsing and reject narrative overreach", async () => {
  const { engine, model } = await loadGameModules();
  const { actionTextBoundaryIssue, localContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const contract = localContract({
    intent: "请情报负责人只整理本周报纸与公开失踪记录，比较来源矛盾，不接触任何人，也不使用黑玻璃挂坠。",
    game,
    leaderId: "organization",
    districtId: "cherwood",
    abilityIds: [],
  });
  assert.match(contract.redLines, /不接触任何人/);
  assert.match(contract.redLines, /不使用黑玻璃挂坠/);
  assert.equal(contract.leaderId, "ines");
  assert.match(actionTextBoundaryIssue("伊妮丝前往档案室询问书记员，并触碰黑玻璃挂坠。", game, contract), /越过/);
  assert.equal(actionTextBoundaryIssue("伊妮丝在事务所内比对两份公开报纸和警察厅通告。", game, contract), null);
});

test("negated compliant phrasing does not trigger red-line rejection", async () => {
  const { engine, model } = await loadGameModules();
  const { actionTextBoundaryIssue, localContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const contract = localContract({ intent: "只整理本周报纸与公开失踪记录，不接触任何人，也不使用黑玻璃挂坠。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  assert.equal(actionTextBoundaryIssue("伊妮丝没有接触任何人，没有使用黑玻璃挂坠，只留在事务所内比对公开报纸。", game, contract), null);
  assert.equal(actionTextBoundaryIssue("伊妮丝未进入任何档案室，只在门外记录了出入时间。", game, contract), null);
  assert.equal(actionTextBoundaryIssue("伊妮丝在事务所内比对公开报纸。另一版报纸称嫌疑人曾接触码头工人。", game, contract), null);
  assert.ok(actionTextBoundaryIssue("伊妮丝前往档案室询问书记员，并触碰黑玻璃挂坠。", game, contract));
});

test("a witnessRef without an actual player observation cannot enter a player directive", async () => {
  const { engine, model } = await loadGameModules();
  const game = model.createInitialGame("spectator");
  game.worldKernel = {
    ...game.worldKernel,
    events: [...game.worldKernel.events, {
      id: "hidden-witness-only",
      week: game.week,
      title: "隐秘接头",
      detail: "幕后势力完成了一次不为玩家所知的接头。",
      actorIds: [],
      factionIds: [],
      causeIds: [],
      visibility: "world",
      witnessRefs: ["player"],
    }],
  };
  const contract = engine.localContract({
    intent: "调查隐秘接头",
    game,
    leaderId: "organization",
    districtId: "cherwood",
    abilityIds: [],
  });
  assert.equal(contract.causeEventIds.includes("hidden-witness-only"), false);
});

test("a decision draft naming a member routes leadership to that member and dedupes red lines", async () => {
  const { engine, model } = await loadGameModules();
  const { interpretIntentWithAi } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "调查 · 公开报纸",
      kind: "调查",
      target: "公开报纸",
      desiredOutcome: "查明登记变化",
      approach: "只整理公开资料",
      days: 2,
      budget: 18,
      risk: "低",
      knownFacts: "",
      hypothesis: "",
      unknowns: "",
      redLines: "红线：不得接触任何人；不得接触任何人",
      retreat: "若被注意则立即中止",
    }) } }] }),
  });
  try {
    const contract = await interpretIntentWithAi(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      { intent: "让伊妮丝·科尔只整理公开报纸与失踪记录，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] },
    );
    assert.equal(contract.leaderId, "ines");
    const touched = contract.redLines.split(/[；;]/).filter((part) => part.includes("不得接触任何人"));
    assert.equal(touched.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("the world turn refuses an AI field report that crosses the player's red lines", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const contract = localContract({ intent: "请情报负责人只整理本周报纸与公开失踪记录，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.actionReports = [{ actionId: resolved.chapter.results[0].id, fieldReport: "伊妮丝进入档案室询问书记员，并抄走了一份内部名册。", observableFacts: ["书记员确认三人参加过夜班。", "内部名册记录了一处夜班集合点。"], followUp: "继续盘问工头。" }];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(envelope);
  try {
    await assert.rejects(() => generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {}), /越过|局部修复/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("an overreaching action report is repaired alone while adjudicated world facts stay frozen", async () => {
  const { engine, model } = await loadGameModules();
  let game = model.createInitialGame("spectator");
  const contract = engine.localContract({ intent: "请情报负责人只整理本周报纸与公开失踪记录，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
  const resolved = engine.resolveWeek(game);
  const result = resolved.chapter.results[0];
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.actionReports = [{ actionId: result.id, fieldReport: "伊妮丝进入档案室询问书记员。", observableFacts: ["书记员提供一张名册。", "她抄录了其中地址。"], followUp: "继续盘问工头。" }];
  const baseFetch = worldModelFetch(envelope);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let adjudicatorCalls = 0;
  let reportRepairCalls = 0;
  globalThis.window = globalThis;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    if (user.includes("这份行动报告必须在不重算世界")) {
      reportRepairCalls += 1;
      const actionReport = {
        actionId: result.id,
        fieldReport: "伊妮丝全程留在组织据点，只比对已经持有的公开报纸与警察厅通告。",
        observableFacts: ["三份报纸对同一失踪日期的记载相差一天。", "公开通告中的姓名拼写与报纸版本存在一处差异。"],
        followUp: "下一周可继续核对组织已经持有的公开材料。",
      };
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actionReport }) } }] }) };
    }
    if (!user.includes("为这个主体独立形成同一周起点上的提案")) adjudicatorCalls += 1;
    return baseFetch(url, init);
  };
  try {
    const committed = await engine.generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    const committedResult = committed.chronicle.find((item) => item.id === resolved.chapter.id).results[0];
    assert.equal(adjudicatorCalls, 1);
    assert.equal(reportRepairCalls, 1);
    assert.match(committedResult.reasons.join(" "), /全程留在组织据点/);
    assert.doesNotMatch(committedResult.reasons.join(" "), /询问书记员/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("literary continuity rewrites only an overreaching paragraph", async () => {
  const { engine, model } = await loadGameModules();
  let game = model.createInitialGame("spectator");
  const contract = engine.localContract({ intent: "请情报负责人只整理本周报纸与公开失踪记录，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
  const resolved = engine.resolveWeek(game);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let writerCalls = 0;
  let paragraphRepairCalls = 0;
  globalThis.window = globalThis;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    const content = user.includes("只重写这一段")
      ? (paragraphRepairCalls += 1, { paragraph: "伊妮丝留在组织据点，把已经持有的三份报纸按日期排开，逐项标记公开记载之间的差异。" })
      : (writerCalls += 1, { title: "纸面差异", sections: [{ heading: "煤气灯下", paragraphs: ["会长在议事桌旁等待。", "伊妮丝前往警察厅询问书记员，并抄录了一份内部名册。"] }] });
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }) };
  };
  try {
    const chapter = await engine.generateLiteraryChapter(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model", quality: "balanced" },
      resolved.state,
      resolved.chapter,
      () => {},
    );
    assert.equal(writerCalls, 1);
    assert.equal(paragraphRepairCalls, 1);
    assert.equal(chapter.sections[0].paragraphs[0], "会长在议事桌旁等待。");
    assert.match(chapter.sections[0].paragraphs[1], /留在组织据点/);
    assert.doesNotMatch(chapter.sections[0].paragraphs.join(" "), /询问书记员|内部名册/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("the local rules ledger does not invent narrative evidence before AI world adjudication", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("seer");
  const contract = localContract({ intent: "调查一名从未在预设案件中出现过的钟表匠，确认他每周三去了哪里。", game, leaderId: "organization", districtId: "west", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const findings = resolved.chapter.results[0].findings;
  assert.ok(findings.every((item) => item.startsWith("[规则结算]")));
  assert.doesNotMatch(findings.join(" "), /固定停留点|人员或物流联系|改变说法|反调查开始|档案员核对了登记时间/);
});

test("an action advances only the pressure mission it actually addresses", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("seer");
  game.missions.push({ id: "unrelated-gala", title: "迟到的宴会请柬", premise: "一张没有署名的宴会请柬被送到公开事务所。", deadline: 4, urgency: 40, progress: 11, consequence: "邀请人会转而接触其他组织。", hints: ["核对请柬火漆", "询问宴会承办人"], state: "active" });
  const openingMission = game.missions.find((item) => item.state === "active");
  const beforeFirst = openingMission.progress;
  const beforeUnrelated = game.missions.find((item) => item.id === "unrelated-gala").progress;
  const contract = localContract({ intent: "核对名单上的地址是否真实，只做公开登记比对，不进入室内。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  assert.ok(resolved.state.missions.find((item) => item.id === openingMission.id).progress > beforeFirst);
  assert.equal(resolved.state.missions.find((item) => item.id === "unrelated-gala").progress, beforeUnrelated);
});
