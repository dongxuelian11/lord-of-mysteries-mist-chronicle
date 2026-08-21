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
    assert.match(result.receipt.queryHash, /^[0-9a-f]{8}$/);
    assert.match(result.receipt.filterHash, /^[0-9a-f]{8}$/);
    assert.match(result.receipt.contextHash, /^[0-9a-f]{8}$/);
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
