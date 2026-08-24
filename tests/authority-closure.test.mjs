import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("turn-scoped retrieval receipt only whitelists chunks returned by this retrieval", async () => {
  const { retrieveLoreContextAsync } = await loadRuntimeModule("app/rag/client.ts");
  const originalWindow = globalThis.window;
  globalThis.window = {
    mistRag: {
      search: async () => ({
        available: true,
        indexVersion: "index-test-v2",
        records: [
          { id: "lore-a", title: "A", content: "A", visibility: "world", topics: [], sourceId: "a", sourceGrade: "A", canonLayer: "canon" },
          { id: "lore-b", title: "B", content: "B", visibility: "world", topics: [], sourceId: "b", sourceGrade: "A", canonLayer: "canon" },
        ],
        context: "ignored worker context",
        authority: { kind: "world-simulation-internal", principalRef: "world", knownLoreIds: [], topicGrants: [], maxSpoilerScope: "all", limit: 8, maxChars: 2000 },
      }),
      listChunkIds: async () => ["lore-a", "lore-b", "lore-c"],
      status: async () => ({ available: true, chunks: 3, indexVersion: "index-test-v2" }),
    },
  };
  try {
    const result = await retrieveLoreContextAsync([], {
      query: "本轮证据",
      audience: { kind: "world-simulation-internal", knownLoreIds: [], topicGrants: [] },
      limit: 8,
      maxChars: 2000,
    });
    assert.deepEqual(result.receipt.chunkIds, ["lore-a", "lore-b"]);
    assert.equal(result.receipt.indexVersion, "index-test-v2");
    assert.match(result.receipt.requestId, /^rag:/);
    assert.match(result.receipt.queryHash, /^[0-9a-f]{64}$/);
    assert.match(result.receipt.filterHash, /^[0-9a-f]{64}$/);
    assert.match(result.receipt.contextHash, /^[0-9a-f]{64}$/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("persistent emergent sidecars are rejected without current-turn proposal, event, observation, and claim", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "平静周", body: "城市维持日常秩序。", reliability: "公开事实" },
      { channel: "街谈", headline: "照常营业", body: "商铺照常开门。", reliability: "单一消息" },
    ],
    worldSummary: { atmosphere: "本周没有经授权的突发变化。" },
    emergentLead: { title: "无来源线索", description: "模型试图直接写入证据与机会。" },
    kernelDelta: { events: [], observations: [], knowledge: [], actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [] },
  }, {
    game,
    resolvingWeek: game.week,
    playerIssuedNoOrders: true,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set(),
    proposalBoundaries: new Map(),
  }), /SIDECAR_AUTHORITY_REJECTED/);
});

test("exact prompt evidence excludes retrieved records that do not fit the final prompt", async () => {
  const { retrieveLoreContextAsync } = await loadRuntimeModule("app/rag/client.ts");
  const originalWindow = globalThis.window;
  globalThis.window = {
    mistRag: {
      search: async () => ({
        available: true,
        indexVersion: "index-exact-v1",
        records: [
          { id: "lore-a", title: "A", content: "甲".repeat(60), visibility: "public", topics: [], sourceId: "a", sourceGrade: "A", canonLayer: "canon" },
          { id: "lore-b", title: "B", content: "乙".repeat(60), visibility: "public", topics: [], sourceId: "b", sourceGrade: "A", canonLayer: "canon" },
          { id: "lore-c", title: "C", content: "丙".repeat(60), visibility: "public", topics: [], sourceId: "c", sourceGrade: "A", canonLayer: "canon" },
        ],
        context: "worker context must not be trusted",
        authority: { kind: "actor-private", principalRef: "actor:member-a", knownLoreIds: [], topicGrants: [], horizon: { work: "LOTM", maxVolume: 1, maxAbsoluteChapter: 195, allowedEventIds: [], revealedIdentityIds: [], worldlineMode: "canon-aligned" }, maxSpoilerScope: "all", limit: 3, maxChars: 90 },
      }),
      listChunkIds: async () => ["lore-a", "lore-b", "lore-c"],
      status: async () => ({ available: true, chunks: 3, indexVersion: "index-exact-v1" }),
    },
  };
  try {
    const result = await retrieveLoreContextAsync([], {
      query: "截断证据",
      audience: { kind: "actor-private", principalRef: "actor:member-a", knownLoreIds: [], topicGrants: [] },
      limit: 3,
      maxChars: 90,
    });
    assert.deepEqual(result.records.map((record) => record.id), ["lore-a"]);
    assert.deepEqual(result.receipt.chunkIds, ["lore-a"]);
    assert.deepEqual(result.promptEvidence.omittedRecordIds, ["lore-b", "lore-c"]);
    assert.equal(result.receipt.audienceRef, "actor:member-a");
    assert.match(result.receipt.queryHash, /^[0-9a-f]{64}$/);
    assert.match(result.receipt.filterHash, /^[0-9a-f]{64}$/);
    assert.match(result.receipt.contextHash, /^[0-9a-f]{64}$/);
    assert.equal(result.promptEvidence.entries[0].promptText, result.context);
    assert.equal(result.context.includes("乙"), false);
    assert.equal(result.context.includes("丙"), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("mutation claim rejects a valid proposal attached to an unrelated subject", async () => {
  const { validateMutationClaim } = await loadRuntimeModule("app/world-authority-closure.ts");
  const scope = {
    proposalId: "proposal:investigate-dock",
    participantRefs: ["actor:investigator"],
    targetRefs: ["location:dock"],
    holderRefs: ["actor:investigator"],
    commitments: { money: 20, manpower: 1, extraordinaryMaterials: 0, spirituality: 0 },
    causeEventIds: [],
  };
  const result = validateMutationClaim({
    proposalId: scope.proposalId,
    effectKind: "faction-state",
    subjectRef: "faction:church",
    targetRefs: ["faction:church"],
    resourceImpact: { money: 5 },
  }, scope, { events: [], observations: [] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "UNRELATED_PROPOSAL_MUTATION_REJECTED");
  const accepted = validateMutationClaim({
    proposalId: scope.proposalId,
    effectKind: "actor-state",
    subjectRef: "actor:investigator",
    targetRefs: ["location:dock"],
  }, scope, { events: [], observations: [] });
  assert.equal(accepted.ok, true);
});

test("mutation claim treats an omitted resource commitment as zero authority", async () => {
  const { validateMutationClaim } = await loadRuntimeModule("app/world-authority-closure.ts");
  const proposalId = "proposal:observe-dock";
  const result = validateMutationClaim({
    proposalId,
    effectKind: "actor-state",
    subjectRef: "actor:investigator",
    targetRefs: ["location:dock"],
    resourceImpact: { money: 1 },
  }, {
    proposalId,
    participantRefs: ["actor:investigator"],
    targetRefs: ["location:dock"],
    holderRefs: ["actor:investigator"],
  }, { events: [], observations: [] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MUTATION_RESOURCE_REJECTED");
});

test("location mutation requires a same-turn sourced event", async () => {
  const { validateMutationClaim } = await loadRuntimeModule("app/world-authority-closure.ts");
  const scope = {
    proposalId: "proposal:investigate-dock",
    participantRefs: ["actor:investigator"],
    targetRefs: ["location:dock"],
    holderRefs: ["actor:investigator"],
    commitments: { money: 20, manpower: 1, extraordinaryMaterials: 0, spirituality: 0 },
    causeEventIds: [],
  };
  const result = validateMutationClaim({
    proposalId: scope.proposalId,
    effectKind: "location-state",
    subjectRef: "location:dock",
    targetRefs: ["location:dock"],
  }, scope, { events: [], observations: [] });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /sourceEventId|事件/);
});

test("world wildcard text cannot bypass same-turn location evidence", async () => {
  const { validateMutationClaim } = await loadRuntimeModule("app/world-authority-closure.ts");
  const proposalId = "proposal:ambient-dock";
  const result = validateMutationClaim({
    proposalId,
    effectKind: "location-state",
    subjectRef: "location:dock",
    targetRefs: ["location:dock"],
  }, {
    proposalId,
    participantRefs: ["actor:investigator"],
    targetRefs: ["world:world"],
    holderRefs: ["actor:investigator"],
  }, { events: [], observations: [] });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /ExecutionPlan|sourceEventId|事件/);
});

test("ambient event authority requires an explicit capability instead of world wildcard text", async () => {
  const { validateMutationClaim } = await loadRuntimeModule("app/world-authority-closure.ts");
  const proposalId = "proposal:publish-notice";
  const claim = {
    proposalId,
    effectKind: "event",
    subjectRef: "event:public-notice",
    targetRefs: [],
  };
  const baseScope = {
    proposalId,
    participantRefs: ["actor:editor"],
    targetRefs: ["world:world"],
    holderRefs: ["actor:editor"],
  };
  const rejected = validateMutationClaim(claim, baseScope, { events: [], observations: [] });
  assert.equal(rejected.ok, false);
  const accepted = validateMutationClaim(claim, {
    ...baseScope,
    targetRefs: [],
    capabilities: ["CREATE_PUBLIC_EVENT"],
  }, { events: [], observations: [] });
  assert.equal(accepted.ok, true);
});

test("location mutation rejects a historical event even when the location matches", async () => {
  const { validateMutationClaim } = await loadRuntimeModule("app/world-authority-closure.ts");
  const proposalId = "proposal:investigate-dock";
  const result = validateMutationClaim({
    proposalId,
    effectKind: "location-state",
    subjectRef: "location:dock",
    targetRefs: ["location:dock"],
    sourceEventId: "historical-event",
  }, {
    proposalId,
    participantRefs: ["actor:investigator"],
    targetRefs: ["location:dock"],
    holderRefs: ["actor:investigator"],
    commitments: { money: 20, manpower: 1, extraordinaryMaterials: 0, spirituality: 0 },
    causeEventIds: [],
  }, {
    events: [{ id: "historical-event", locationId: "dock", sourceProposalIds: [proposalId] }],
    observations: [],
    currentTurnEventIds: new Set(["current-event"]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MUTATION_EVIDENCE_REJECTED");
  assert.match(result.reasons.join(" "), /历史事件|本轮/);
});

test("adapter rejects an unrelated mutation even when the proposal ID is executable", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  const faction = game.worldKernel.factions[0];
  const raw = {
    publicSignals: [
      { channel: "报纸", headline: "码头调整", body: "码头临时调整了夜间装卸安排。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区照常", body: "东区的商铺仍按日常时间营业。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "码头秩序出现一处可见调整。" },
    kernelDelta: {
      events: [{ id: "dock-event", title: "码头盘点", detail: "调查者完成码头货物盘点。", locationId: "dock", actorIds: [actor.id], factionIds: [], visibility: "world", sourceProposalIds: [proposalId] }],
      locationUpdates: [{ locationId: "dock", riskDelta: 1, sourceProposalIds: [proposalId] }],
      factionUpdates: [{ factionId: faction.id, resourcesDelta: 5, sourceProposalIds: [proposalId] }],
      actorUpdates: [], projectUpdates: [], observations: [], knowledge: [],
    },
  };
  assert.throws(() => adaptWorldAdjudication(raw, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(["lore-a"]),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:dock"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 20, manpower: 1, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "身份暴露时撤退",
    }]]),
    retrievalReceipt: { requestId: "rag:test", indexVersion: "index-test-v2", audienceRef: "world", queryHash: "aaaaaaaa", filterHash: "bbbbbbbb", chunkIds: ["lore-a"], contextHash: "cccccccc" },
}), /UNRELATED_PROPOSAL_MUTATION_REJECTED/);
});

test("adapter rejects new faction creation without a same-turn capability event", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "新势力出现", body: "码头出现了一个新的组织。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区照常", body: "东区的商铺仍按日常时间营业。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "一个新的组织进入了码头局势。" },
    kernelDelta: {
      newFactions: [{ id: "new-faction", name: "新势力", posture: "试探码头秩序", sourceProposalIds: [proposalId] }],
      events: [], observations: [], knowledge: [], actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:dock"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  }), /MUTATION_CREATION_CAPABILITY_REJECTED/);
});

test("adapter accepts new faction creation only when a same-turn event anchors it to authorized scope", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  const result = adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "新势力出现", body: "码头调查确认了一个此前未被追踪的组织。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区照常", body: "东区的商铺仍按日常时间营业。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "调查者在获批地点确认了新组织的存在。" },
    kernelDelta: {
      newFactions: [{ id: "new-faction", name: "新势力", posture: "试探码头秩序", sourceProposalIds: [proposalId] }],
      events: [{ id: "new-faction-seen", title: "确认新势力", detail: "调查者在码头确认该组织值得持续追踪。", locationId: "dock", actorIds: [actor.id], factionIds: ["new-faction"], visibility: "world", sourceProposalIds: [proposalId] }],
      observations: [], knowledge: [], actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:dock"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  });
  assert.equal(result.kernelDelta.newFactions.length, 1);
  const claim = result.kernelDelta.mutationClaims.find((item) => item.subjectRef === "faction:new-faction");
  assert.ok(claim);
  assert.equal(claim.sourceEventId, result.kernelDelta.events[0].id);
  assert.ok(claim.targetRefs.includes("location:dock"));
});

test("adapter rejects a world event that lists itself as a cause", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "码头核验", body: "码头核验产生了一条事件记录。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区照常", body: "东区仍保持日常秩序。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "事件不能以自身作为前因。" },
    kernelDelta: {
      events: [{ id: "self-caused", title: "自因事件", detail: "该事件错误地把自己列为原因。", locationId: "dock", actorIds: [actor.id], factionIds: [], causeIds: ["self-caused"], visibility: "world", sourceProposalIds: [proposalId] }],
      observations: [], knowledge: [], actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`], targetRefs: ["location:dock"], holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  }), /MUTATION_CAUSALITY_REJECTED/);
});

test("adapter rejects an event cause that never existed in history or the current turn", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "码头核验", body: "码头核验产生了一条事件记录。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区照常", body: "东区仍保持日常秩序。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "未知原因不能被静默删除后继续提交。" },
    kernelDelta: {
      events: [{ id: "orphan-effect", title: "孤立事件", detail: "该事件引用了从未存在的原因。", locationId: "dock", actorIds: [actor.id], factionIds: [], causeIds: ["never-existed"], visibility: "world", sourceProposalIds: [proposalId] }],
      observations: [], knowledge: [], actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`], targetRefs: ["location:dock"], holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  }), /MUTATION_CAUSALITY_REJECTED.*never-existed/);
});

test("adapter normalizes temporary event ids in explicit mutation claims", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  const result = adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "码头核验", body: "码头的核验已经完成。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区照常", body: "东区的商铺仍按日常时间营业。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "码头的风险有了可核对的变化。" },
    kernelDelta: {
      mutationClaims: [{ proposalId, effectKind: "location-state", subjectRef: "location:dock", targetRefs: ["location:dock"], sourceEventId: "temporary-event" }],
      events: [{ id: "temporary-event", title: "码头核验", detail: "调查者完成了码头核验。", locationId: "dock", actorIds: [actor.id], factionIds: [], causeIds: [], visibility: "world", sourceProposalIds: [proposalId] }],
      locationUpdates: [{ locationId: "dock", riskDelta: 1, sourceProposalIds: [proposalId] }],
      observations: [], knowledge: [], actorUpdates: [], factionUpdates: [], projectUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:dock"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  });
  assert.equal(result.kernelDelta.events.length, 1);
  assert.notEqual(result.kernelDelta.events[0].id, "temporary-event");
  const claim = result.kernelDelta.mutationClaims.find((item) => item.effectKind === "location-state");
  assert.ok(claim);
  assert.equal(claim.sourceEventId, result.kernelDelta.events[0].id);
});

test("adapter rejects an explicit claim that hides the actual mutation target", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  assert.ok(game.worldKernel.locations.some((location) => location.id === "dock"));
  assert.ok(game.worldKernel.locations.some((location) => location.id === "east"));

  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "码头调查", body: "码头调查仍在原授权范围内推进。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区异动", body: "东区出现了未经授权的人物转移。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "模型声明调查码头，却试图把调查者移动到东区。" },
    kernelDelta: {
      mutationClaims: [{
        proposalId,
        effectKind: "actor-state",
        subjectRef: `actor:${actor.id}`,
        targetRefs: ["location:dock"],
      }],
      actorUpdates: [{ actorId: actor.id, locationId: "east", sourceProposalIds: [proposalId] }],
      events: [], observations: [], knowledge: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:dock"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  }), /UNRELATED_PROPOSAL_MUTATION_REJECTED|actual mutation|实际变化/);
});

test("adapter rejects an actual mutation when only one claim reference overlaps the proposal scope", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];

  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "码头调查", body: "码头调查仍在原授权范围内推进。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "东区异动", body: "东区出现了未经授权的人物转移。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "实际变化包含一个合法参与者和一个未获授权地点。" },
    kernelDelta: {
      actorUpdates: [{ actorId: actor.id, locationId: "east", sourceProposalIds: [proposalId] }],
      events: [], observations: [], knowledge: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  }, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, {
      proposalId,
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:dock"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
    }]]),
  }), /UNRELATED_PROPOSAL_MUTATION_REJECTED/);
});

test("adapter rejects a lore ID that exists in the corpus but is absent from this turn receipt", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const proposalId = "proposal:investigate-dock";
  const actor = game.worldKernel.actors[0];
  const base = {
    publicSignals: [
      { channel: "报纸", headline: "证据整理", body: "调查人员开始整理一批新证据。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "街区平静", body: "街区没有出现超出日常的变化。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "调查工作在有限范围内推进。" },
    kernelDelta: {
      events: [{ id: "evidence-event", title: "调查记录", detail: "调查者留下可复核的记录。", locationId: "dock", actorIds: [actor.id], factionIds: [], visibility: "world", sourceProposalIds: [proposalId] }],
      observations: [{ eventId: "evidence-event", channel: "调查", text: "记录已被调查者确认。", visibility: "actors", holderIds: [actor.id] }],
      knowledge: [{ subject: "记录", statement: "一条新的知识记录。", truth: "likely", visibility: "actors", holderIds: [actor.id], loreRecordIds: ["lore-c"], sourceEventId: "evidence-event" }],
      actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    },
  };
  assert.throws(() => adaptWorldAdjudication(base, {
    game,
    resolvingWeek: 1,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(["lore-a", "lore-b"]),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, { proposalId, participantRefs: [`actor:${actor.id}`], targetRefs: ["location:dock"], holderRefs: [`actor:${actor.id}`], commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 }, causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退" }]]),
    retrievalReceipt: { requestId: "rag:test", indexVersion: "index-test-v2", audienceRef: "world", queryHash: "aaaaaaaa", filterHash: "bbbbbbbb", chunkIds: ["lore-a", "lore-b"], contextHash: "cccccccc" },
  }), /UNRETRIEVED_LORE_REFERENCE_REJECTED/);
});

test("adapter rejects knowledge that reuses a historical event and proposal", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  game.worldKernel.events = [{
    id: "historical-event",
    week: 1,
    title: "历史事件",
    detail: "上一周已结算的事件。",
    actorIds: [],
    factionIds: [],
    causeIds: [],
    visibility: "world",
    sourceProposalIds: ["old-proposal"],
  }];
  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "本周消息", body: "本周消息保持可见。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "本周街谈", body: "本周街谈保持可见。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "本周世界仍在运转。" },
    kernelDelta: {
      events: [],
      observations: [{ eventId: "historical-event", channel: "调查", text: "模型伪造了本周观察。", visibility: "public" }],
      knowledge: [{ subject: "旧事件", statement: "不应由历史事件直接生成本周知识。", truth: "likely", visibility: "public", loreRecordIds: ["lore-a"], sourceEventId: "historical-event" }],
    },
  }, {
    game,
    resolvingWeek: 2,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(["lore-a"]),
    allowedProposalIds: new Set(["new-proposal"]),
    proposalBoundaries: new Map(),
    retrievalReceipt: { requestId: "rag:test", indexVersion: "index-test-v2", audienceRef: "world", queryHash: "aaaaaaaa", filterHash: "bbbbbbbb", chunkIds: ["lore-a"], contextHash: "cccccccc" },
}), /本轮事件|历史事件/);
});

test("adapter rejects historical knowledge evidence even without a retrieval receipt", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  game.worldKernel.events = [{
    id: "historical-event",
    week: 1,
    title: "历史事件",
    detail: "上一周已结算的事件。",
    actorIds: [],
    factionIds: [],
    causeIds: [],
    visibility: "world",
    sourceProposalIds: ["old-proposal"],
  }];
  assert.throws(() => adaptWorldAdjudication({
    publicSignals: [
      { channel: "报纸", headline: "本周消息", body: "本周消息保持可见。", reliability: "公开事实", districtId: "dock" },
      { channel: "街谈", headline: "本周街谈", body: "本周街谈保持可见。", reliability: "单一消息", districtId: "east" },
    ],
    worldSummary: { atmosphere: "本周世界仍在运转。" },
    kernelDelta: {
      events: [],
      observations: [{ eventId: "historical-event", channel: "调查", text: "模型伪造了本周观察。", visibility: "public" }],
      knowledge: [{ subject: "旧事件", statement: "不应由历史事件直接生成本周知识。", truth: "likely", visibility: "public", loreRecordIds: ["lore-a"], sourceEventId: "historical-event" }],
    },
  }, {
    game,
    resolvingWeek: 2,
    playerIssuedNoOrders: false,
    allowedLoreIds: new Set(["lore-a"]),
    allowedProposalIds: new Set(["new-proposal"]),
    proposalBoundaries: new Map(),
  }), /本轮事件|历史事件/);
});

test("receipt and mutation claims are committed with the turn and replay without a second write", async () => {
  const { createWorldKernel, createWorldTurnTransaction, applyWorldTurn } = await loadRuntimeModule("app/world-kernel.ts");
  const kernel = createWorldKernel({ week: 1, date: "1349年1月1日", factions: [], actors: [], locations: [{ id: "dock", name: "码头", risk: 20 }], timeline: [] });
  const delta = {
    week: 1,
    playerIssuedNoOrders: false,
    retrievalReceipt: { requestId: "rag:test", indexVersion: "index-test-v2", audienceRef: "world", queryHash: "aaaaaaaa", filterHash: "bbbbbbbb", chunkIds: ["lore-a"], contextHash: "cccccccc" },
    mutationClaims: [{ proposalId: "proposal:investigate-dock", effectKind: "location-state", subjectRef: "location:dock", targetRefs: ["location:dock"], sourceEventId: "turn-event" }],
    actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
    events: [{ id: "turn-event", title: "已核验", detail: "本轮核验完成。", locationId: "dock", actorIds: [], factionIds: [], causeIds: [], visibility: "world", sourceProposalIds: ["proposal:investigate-dock"] }],
    observations: [], knowledge: [],
  };
  const committed = applyWorldTurn(kernel, { ...delta, transaction: createWorldTurnTransaction(kernel, delta, "world:1") });
  assert.deepEqual(committed.retrievalReceipts[0].chunkIds, ["lore-a"]);
  assert.equal(committed.mutationClaims[0].effectKind, "location-state");
  const replay = applyWorldTurn(committed, { ...delta, transaction: committed.committedTransactions[0] });
  assert.strictEqual(replay, committed);
});
