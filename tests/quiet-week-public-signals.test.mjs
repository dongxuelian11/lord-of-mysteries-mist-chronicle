import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

const require = createRequire(import.meta.url);
const QUIET_WEEK_MODEL_SIGNAL_MINIMUM = 0;
const FABRICATED_PUBLIC_SIGNAL_COUNT = 0;

after(() => closeRuntimeServer());

test("Main world prompt declares a zero-to-four public signal contract without fabrication", () => {
  const { buildMainWorldPrompt } = require("../electron/world-prompt.cjs");
  const prompt = buildMainWorldPrompt({ unifiedActionPlans: [], worldContext: {} });
  assert.match(prompt, /0至4条/);
  assert.match(prompt, /无公开事实.*\[\]/);
  assert.match(prompt, /(?:禁止|不得)为了凑数/);
  assert.doesNotMatch(prompt, /必须返回 2 至 4 条/);
});

test("quiet week can submit with an explicit empty public signal array", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const { worldEnvelopeIssue } = await loadRuntimeModule("app/world-envelope.ts");
  const game = createInitialGame("seer");
  const raw = {
    worldSummary: { atmosphere: "细雨整周没有停，城市按原有秩序运转。", undercurrents: [] },
    publicSignals: [],
    factionMoves: [],
    actionReports: [],
    kernelDelta: {},
  };
  assert.equal(worldEnvelopeIssue(raw, game, true, []), null);
  const result = adaptWorldAdjudication(raw, {
    game,
    resolvingWeek: game.week,
    playerIssuedNoOrders: true,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set(),
    proposalBoundaries: new Map(),
  });
  assert.equal(result.publicSignals.length, QUIET_WEEK_MODEL_SIGNAL_MINIMUM);
  assert.equal(result.publicSignals.length, FABRICATED_PUBLIC_SIGNAL_COUNT);
  assert.deepEqual(result.publicSignals, []);
  assert.deepEqual(result.ruleSignals, []);
});

test("public facts require current-turn source binding instead of presentation-only prose", async () => {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const locationId = game.worldKernel.locations[0].id;
  const proposalId = "proposal:current";
  const raw = {
    worldSummary: { atmosphere: "码头的秩序出现可核验变化。", undercurrents: [] },
    publicSignals: [{ headline: "码头调整", body: "码头公开调整夜间装卸安排。" }],
    factionMoves: [],
    actionReports: [],
    kernelDelta: {
      events: [{ id: "event-current", title: "码头调整", detail: "夜间装卸安排发生变化。", locationId, actorIds: [], factionIds: [], sourceProposalIds: [proposalId] }],
    },
  };
  assert.throws(() => adaptWorldAdjudication(raw, {
    game,
    resolvingWeek: game.week,
    playerIssuedNoOrders: true,
    allowedLoreIds: new Set(),
    allowedProposalIds: new Set([proposalId]),
    proposalBoundaries: new Map([[proposalId, { participantRefs: [], targetRefs: [`location:${locationId}`], holderRefs: [], commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 }, redLines: [], mustEscalateWhen: [], retreatCondition: "" }]]),
    requireSourcedPublicSignals: true,
  }), /PUBLIC_SIGNAL_PROVENANCE_REJECTED|来源|绑定|mutation claim/i);
});
