import { describe, expect, it } from "vitest";
import { createInitialGame } from "../../app/game-model.ts";
import {
  actionDomain,
  localContract,
  scheduleContract,
} from "../../app/game-engine.ts";
import {
  applyWorldTurn,
  createWorldKernel,
  createWorldTurnTransaction,
  projectWorldForAudience,
} from "../../app/world-kernel.ts";
import { validateMutationClaim } from "../../app/world-authority-closure.ts";
import { adaptWorldAdjudication } from "../../app/world-output-adapter.ts";
import { parseIntentContract } from "../../app/nlp/intent-contract.ts";
import nlpGold from "../fixtures/nlp/intent-contract-cases.json";
import * as autonomousInference from "../../electron/autonomous-inference.cjs";
import * as worldPrompt from "../../electron/world-prompt.cjs";
import { createInferenceScheduler } from "../../electron/inference-scheduler.cjs";
import { summarizeProvenance as summarizeRuntimeProvenance } from "../../electron/persistence-provenance.cjs";
import {
  assertTaskCapability,
  estimateTokenBudget,
  getProviderCapability,
  getTaskCapability,
  inferProviderId,
  normalizeProviderEndpoint,
  resolveInferenceCapability,
} from "../../app/ai-provider-capabilities.ts";

function emptyDelta(week: number) {
  return {
    week,
    executableProposalIds: [],
    playerIssuedNoOrders: true,
    actorUpdates: [],
    factionUpdates: [],
    projectUpdates: [],
    locationUpdates: [],
    events: [],
    observations: [],
    knowledge: [],
    knowledgeGrants: [],
    mutationClaims: [],
    canon: { mode: "anchored" as const, deviationDelta: 0, pivotEventIds: [] },
  };
}

function minimalWorldOutput() {
  return {
    worldSummary: { atmosphere: "城市表面仍维持秩序。", undercurrents: [] },
    publicSignals: [
      { channel: "报纸", headline: "东区交通调整", body: "市政部门公布了短期交通安排。", reliability: "公开事实", cityId: "backlund", districtId: "east" },
      { channel: "街谈", headline: "煤行重新核价", body: "几家煤行正在核对公开报价。", reliability: "单一消息", cityId: "backlund", districtId: "east" },
    ],
    actionReports: [],
    factionMoves: [],
    canonMoves: [],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: {},
    kernelDelta: {
      newActors: [],
      newFactions: [],
      newProjects: [],
      actorUpdates: [],
      factionUpdates: [],
      projectUpdates: [],
      locationUpdates: [],
      events: [],
      observations: [],
      knowledge: [],
      mutationClaims: [],
      canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

describe("source-aware authority coverage", () => {
  it("executes provider capability boundaries and conservative token accounting", async () => {
    expect(inferProviderId({ endpoint: "https://api.deepseek.com/v1" })).toBe("deepseek");
    expect(inferProviderId({ provider: "compatible" })).toBe("compatible");
    expect(normalizeProviderEndpoint({ provider: "deepseek", endpoint: "https://attacker.invalid" }).url).toBe("https://api.deepseek.com/chat/completions");
    expect(normalizeProviderEndpoint({ provider: "compatible", endpoint: "http://127.0.0.1:8787/v1" }).url).toBe("http://127.0.0.1:8787/v1/chat/completions");
    expect(getProviderCapability("deepseek").endpointPolicy).toBe("official");
    expect(getTaskCapability("world-adjudication").structuredOutput).toBe("json-object");
    expect(resolveInferenceCapability({ provider: "deepseek" }, "world-adjudication").taskCapability.streaming).toBe(false);
    assertTaskCapability("world-adjudication", { json: true, stream: false });
    expect(() => assertTaskCapability("world-adjudication", { json: false })).toThrow(/json-required/);
    expect(() => assertTaskCapability("world-adjudication", { json: true, stream: true })).toThrow(/streaming-forbidden/);
    expect(estimateTokenBudget("中文文本", "compatible")).toMatchObject({ tokens: 2, accuracy: "estimated" });
    expect(() => getProviderCapability("unknown")).toThrow(/provider-not-supported/);
    expect(() => getTaskCapability("unknown")).toThrow(/task-not-supported/);
    expect(() => normalizeProviderEndpoint({ provider: "compatible", endpoint: "https://remote.invalid" })).toThrow(/endpoint-not-allowed/);
    const scheduler = createInferenceScheduler({ sleep: async () => undefined, jitter: () => 0 });
    await expect(scheduler.run({ provider: "deepseek", task: "connection-test", idempotencyKey: "coverage:scheduler" }, () => "ok")).resolves.toBe("ok");
    const provenanceInput = {
      originId: "origin:coverage",
      transactions: [{ turnId: "world:1", resolvingWeek: 1 }],
      durableTurns: [{ turnId: "world:1", resolvingWeek: 1 }],
      receipts: [{ turnId: "world:1", requestId: "receipt:coverage" }],
    } as unknown as Parameters<typeof summarizeRuntimeProvenance>[0];
    expect(summarizeRuntimeProvenance(provenanceInput).provenanceStatus).toBe("durable-turn");
  });

  it("executes game-engine contract and world-kernel transaction paths", () => {
    const game = createInitialGame("seer");
    const contract = localContract({
      intent: "调查东区煤气管线异常，若身份暴露立即撤退",
      game,
      leaderId: "organization",
      districtId: "east",
      abilityIds: [],
    });
    const scheduled = scheduleContract({ ...game, schedule: [] }, contract);
    expect(actionDomain(contract)).toBe("investigation");
    expect(scheduled.execution.status).toBe("planned");

    const seededKernel = createWorldKernel({
      week: game.week,
      date: game.date,
      actors: game.worldKernel.actors.map(({ id, name, locationId, agenda, condition, lastAction }) => ({ id, name, locationId, agenda, state: condition, lastAction })),
      factions: game.worldKernel.factions.map(({ id, name, posture, suspicion }) => ({ id, name, plan: posture, progress: 0, suspicion })),
      locations: game.worldKernel.locations.map(({ id, name, risk }) => ({ id, name, risk })),
      timeline: [],
    });
    const delta = emptyDelta(seededKernel.lastResolvedWeek + 1);
    const transaction = createWorldTurnTransaction(seededKernel, delta, "coverage:world-turn");
    const committed = applyWorldTurn(seededKernel, { ...delta, transaction }, { recordTrace: false });
    expect(committed.committedTransactions[0].turnId).toBe("coverage:world-turn");
    expect(projectWorldForAudience(committed, { kind: "player", holderId: "player" }).projectionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("executes mutation closure and normalized world output paths", () => {
    const game = createInitialGame("seer");
    const actor = game.worldKernel.actors[0];
    const scope = {
      proposalId: "proposal:coverage:1",
      participantRefs: [`actor:${actor.id}`],
      targetRefs: ["location:east"],
      holderRefs: [`actor:${actor.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
    };
    const closure = validateMutationClaim(
      { proposalId: scope.proposalId, effectKind: "location-state", subjectRef: "location:east", targetRefs: [`actor:${actor.id}`], sourceEventId: "event:coverage" },
      scope,
      {
        events: [{ id: "event:coverage", locationId: "east", actorIds: [actor.id], factionIds: [], sourceProposalIds: [scope.proposalId] }],
        observations: [],
        currentTurnEventIds: new Set(["event:coverage"]),
      },
    );
    expect(closure.ok).toBe(true);

    const adapted = adaptWorldAdjudication(minimalWorldOutput(), {
      game,
      resolvingWeek: game.week,
      playerIssuedNoOrders: true,
      allowedLoreIds: new Set(),
      allowedProposalIds: new Set(),
      proposalBoundaries: new Map(),
    });
    expect(adapted.kernelDelta.events).toEqual([]);
    expect(adapted.publicSignals).toHaveLength(2);
  });

  it("executes sourced public-signal provenance and quiet-week branches", () => {
    const game = createInitialGame("seer");
    const proposalId = "proposal:coverage:public-signal";
    const eventId = "event:coverage:public-signal";
    const body = "市政部门公布了东区临时交通安排。";
    const raw = {
      worldSummary: { atmosphere: "城市表面仍维持秩序。", undercurrents: [] },
      publicSignals: [{ channel: "报纸", headline: "东区交通调整", body, reliability: "公开事实", districtId: "east", sourceProposalId: proposalId, sourceEventId: eventId, sourceObservation: body }],
      actionReports: [], factionMoves: [], canonMoves: [], emergentPressure: null, emergentLead: null,
      organizationDelta: {},
      kernelDelta: {
        newActors: [], newFactions: [], newProjects: [], actorUpdates: [], factionUpdates: [], projectUpdates: [], locationUpdates: [],
        events: [{ id: eventId, title: "东区交通调整", detail: body, locationId: "east", actorIds: [], factionIds: [], causeIds: [], visibility: "public", sourceProposalIds: [proposalId] }],
        observations: [{ eventId, channel: "报纸", text: body, visibility: "public", holderIds: [], perceivedRefs: [], acquisitionKind: "propagation" }],
        knowledge: [], mutationClaims: [], canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
      },
    };
    const options = {
      game,
      resolvingWeek: game.week,
      playerIssuedNoOrders: true,
      allowedLoreIds: new Set<string>(),
      allowedProposalIds: new Set([proposalId]),
      proposalBoundaries: new Map([[proposalId, {
        proposalId,
        participantRefs: ["organization"],
        targetRefs: ["location:east"],
        holderRefs: ["organization"],
        commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
        redLines: [], mustEscalateWhen: [], retreatCondition: "条件不再成立时等待",
      }]]),
      requireSourcedPublicSignals: true,
    } as const;
    const adapted = adaptWorldAdjudication(raw, options);
    expect(adapted.ruleSignals).toHaveLength(1);
    expect(adapted.kernelDelta.mutationClaims.some((claim) => claim.effectKind === "event")).toBe(true);
    expect(adapted.kernelDelta.observations.some((observation) => observation.text === body)).toBe(true);

    const quiet = adaptWorldAdjudication({ ...minimalWorldOutput(), publicSignals: [] }, {
      ...options,
      allowedProposalIds: new Set<string>(),
      proposalBoundaries: new Map(),
    });
    expect(quiet.publicSignals).toHaveLength(0);

    expect(() => adaptWorldAdjudication({ ...raw, publicSignals: [{ ...raw.publicSignals[0], sourceEventId: "event:missing" }] }, options)).toThrow(/PUBLIC_SIGNAL_PROVENANCE_REJECTED/);
    expect(() => adaptWorldAdjudication({ ...minimalWorldOutput(), publicSignals: Array.from({ length: 5 }, () => ({ headline: "超出上限", body: "不应被静默截断" })) }, options)).toThrow(/PUBLIC_SIGNAL_LIMIT_REJECTED/);
  });

  it("executes Main prompt and autonomous projection contracts", () => {
    const game = createInitialGame("seer");
    const durable = worldPrompt.buildDurableWorldPayload(
      { unifiedActionPlans: [], chapter: [] },
      game,
      { week: game.week, gameDate: game.date, baseRevision: game.worldKernel.revision },
      game,
    );
    const prompt = worldPrompt.buildMainWorldPrompt(durable);
    expect(prompt).toContain("unifiedActionPlans");
    expect(worldPrompt.worldQueryFromDurableGame(game)).toContain(game.date);

    const profile = game.worldAgents.profiles.find((candidate) => candidate.ref.startsWith("actor:"));
    expect(profile).toBeDefined();
    const projection = autonomousInference.autonomousProjection(game, profile!.ref, game.week);
    expect(projection.agent.ref).toBe(profile!.ref);
    const proposal = autonomousInference.canonicalProposal({ proposal: {
      planningWeek: game.week,
      agentRef: profile!.ref,
      disposition: "wait",
      intent: "保持观察",
      rationale: "当前没有足以改变方向的新状态。",
      targetRefs: [],
      requiredKnowledgeIds: [],
      usedMemoryIds: [],
    } }, projection);
    expect(proposal.projectionHash).toBe(projection.projectionHash);
  });

  it("executes the source-aware NLP contract across the hand-reviewed fixture", () => {
    expect(nlpGold.cases).toHaveLength(160);
    for (const item of nlpGold.cases) {
      const parsed = parseIntentContract(item.text);
      expect(parsed.schemaVersion).toBe("intent-contract-v1");
      expect(parsed.fields.kind.evidence.every((span) => item.text.slice(span.start, span.end) === span.text)).toBe(true);
      expect(parsed.fields.authorizationScope.state).toMatch(/present|negated|ambiguous|absent/);
    }
    const game = createInitialGame("seer");
    const colloquialNegation = ["别调查红房子。", "请勿进入地下室。", "不想调查红房子。"];
    for (const text of colloquialNegation) {
      const parsed = parseIntentContract(text);
      expect(parsed.fields.kind.state).toBe("negated");
      expect(localContract({ intent: text, game, leaderId: "organization", districtId: "east", abilityIds: [] }).kind).toBe("自由行动");
    }
    const alternative = parseIntentContract("调查红房子或者蓝桥。");
    expect(alternative.fields.target.state).toBe("ambiguous");
    expect(parseIntentContract("向红房子或者蓝桥报告。").fields.target.state).toBe("ambiguous");
    expect(localContract({ intent: "调查红房子或者蓝桥。", game, leaderId: "organization", districtId: "east", abilityIds: [] }).target).toBe("待确认目标");
  });
});
