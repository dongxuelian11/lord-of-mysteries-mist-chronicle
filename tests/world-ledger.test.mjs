import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import {
  appendWorldLedgerEvents,
  appendWorldLedgerCompensation,
  commitWorldLedgerWeek,
  createWorldLedger,
  createWorldLedgerBranch,
  ledgerChecksum,
  migrateWorldLedger,
  projectLedgerState,
  recordWorldLedgerPhase,
  replayWorldLedger,
  runWorldLedgerCounterfactual,
  verifyWorldLedger,
} from "../app/world-ledger.ts";
import { adjudicateWorldActionProposals } from "../app/world-actions.ts";
import { applyWorldTurn, createWorldKernel, projectWorldForAudience } from "../app/world-kernel.ts";

test("the append-only ledger snapshots and replays authoritative world state", () => {
  const game = createInitialGame("spectator");
  let ledger = createWorldLedger(game);
  ledger = appendWorldLedgerEvents(ledger, [{
    id: "proposal:1:test",
    week: 1,
    phase: "player-actions",
    kind: "action-proposed",
    summary: "test proposal",
    actorIds: ["player"],
    factionIds: [],
    witnessRefs: ["player"],
    causeEventIds: [],
    audience: { visibility: "player", holderRefs: ["player"] },
    payload: { intent: "inspect" },
  }]);
  ledger = recordWorldLedgerPhase(ledger, 1, "player-actions", "actions settled", { count: 1 });
  const next = { ...game, week: 2, date: "1349-02-01" };
  ledger = commitWorldLedgerWeek(ledger, next);

  const verification = verifyWorldLedger(ledger);
  assert.equal(verification.ok, true, verification.issues.join("\n"));
  assert.equal(replayWorldLedger(ledger)?.week, 2);
  assert.deepEqual(replayWorldLedger(ledger, { useSnapshots: true }), replayWorldLedger(ledger, { useSnapshots: false }));
  assert.equal(ledger.events.filter((event) => event.kind === "week-committed").length, 1);
});

test("action proposals are reviewed deterministically before outcomes are resolved", () => {
  const base = {
    week: 4,
    proposer: { kind: "player", id: "player" },
    actionType: "investigate",
    intent: "verify manifests",
    method: "observe from public ground",
    target: { kind: "district", id: "east" },
    participantIds: ["alice"],
    requiredKnowledgeIds: [],
    commitments: { money: 10, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
    timeWindow: { startDay: 1, days: 2 },
    redLines: ["do not trespass"],
    retreatCondition: "withdraw when noticed",
    visibility: "actors",
    holderRefs: ["actor:alice"],
  };
  const context = {
    week: 4,
    moneyAvailable: 100,
    debtFloor: -80,
    manpowerAvailable: 10,
    extraordinaryMaterialsAvailable: 5,
    actorIds: new Set(["alice"]),
    factionIds: new Set(),
    districtIds: new Set(["east"]),
    unavailableActorIds: new Set(),
    actorKnowledge: new Map([["alice", new Set()]]),
  };
  const proposals = [
    { ...base, id: "proposal-low", priority: 10 },
    { ...base, id: "proposal-high", priority: 20 },
  ];
  const first = adjudicateWorldActionProposals(proposals, context);
  const second = adjudicateWorldActionProposals(proposals, context);
  assert.deepEqual(first, second);
  assert.equal(first[0].proposal.id, "proposal-high");
  assert.equal(first[0].review.status, "accepted");
  assert.equal(first[1].review.status, "rejected");
  assert.match(first[1].review.reasons.join(" "), /争用/);
});

test("private perceptions are isolated between actors, factions, and the player", () => {
  const initial = createWorldKernel({
    week: 1,
    date: "1349-01-01",
    factions: [{ id: "press", name: "Press", plan: "investigate", progress: 1 }],
    actors: [{ id: "reporter", name: "Reporter", locationId: "east", agenda: "learn" }],
    locations: [{ id: "east", name: "East", risk: 50 }],
    timeline: [],
  });
  const next = applyWorldTurn(initial, {
    week: 1,
    playerIssuedNoOrders: true,
    actorUpdates: [],
    projectUpdates: [],
    locationUpdates: [],
    events: [{ id: "private-event", title: "Private", detail: "Only one side saw this", locationId: "east", actorIds: ["reporter"], factionIds: ["press"], causeIds: [], visibility: "actors", witnessRefs: ["actor:reporter", "faction:press"] }],
    observations: [{ id: "private-observation", eventId: "private-event", channel: "report", text: "private detail", visibility: "actors", holderIds: [], holderRefs: ["faction:press"] }],
    knowledge: [{ id: "private-knowledge", subject: "manifest", statement: "altered", truth: "confirmed", visibility: "actors", holderIds: [], holderRefs: ["faction:press"] }],
  });

  assert.equal(projectWorldForAudience(next, { kind: "faction", holderId: "press" }).knowledge.length, 1);
  assert.equal(projectWorldForAudience(next, { kind: "actor", holderId: "reporter" }).knowledge.length, 0);
  assert.equal(projectWorldForAudience(next, { kind: "player", holderId: "player" }).events.length, 0);
  assert.equal(projectWorldForAudience(next, { kind: "faction", holderId: "press" }).events.length, 1);
});

test("authoritative events rebuild from zero and match snapshot-accelerated replay", () => {
  const game = createInitialGame("spectator");
  let ledger = createWorldLedger(game);
  const next = {
    ...game,
    week: game.week + 1,
    date: "1349-07-07",
    money: game.money + 37,
    secrecy: game.secrecy - 3,
    members: game.members.map((member, index) => index === 0 ? { ...member, fatigue: member.fatigue + 4 } : member),
  };
  ledger = commitWorldLedgerWeek(ledger, next);
  const fromZero = replayWorldLedger({ ...ledger, snapshots: [] }, { useSnapshots: false });
  const accelerated = replayWorldLedger(ledger, { useSnapshots: true });
  assert.deepEqual(fromZero, accelerated);
  assert.deepEqual(fromZero, replayWorldLedger(ledger, { useSnapshots: false }));
  assert.equal(fromZero.resources.money, next.money);
  assert.equal(fromZero.members.find((member) => member.id === next.members[0].id).fatigue, next.members[0].fatigue);
  assert.ok(ledger.events.some((event) => event.kind === "projection-patched"));
  assert.ok(ledger.events.filter((event) => event.kind === "week-committed").every((event) => !("projection" in event.payload)));
});

test("long-running ledgers keep bounded checkpoint snapshots while retaining full replay history", () => {
  const game = createInitialGame("spectator");
  let ledger = createWorldLedger(game);
  let current = game;
  for (let week = 2; week <= 42; week += 1) {
    current = { ...current, week, date: `1349-week-${week}`, money: game.money + week * 3 };
    ledger = commitWorldLedgerWeek(ledger, current);
  }

  assert.ok(ledger.snapshots.length <= 6, `expected bounded snapshots, received ${ledger.snapshots.length}`);
  assert.ok(ledger.snapshotArchive?.archivedCount > 0);
  assert.equal(ledger.events.filter((event) => event.kind === "week-committed").length, 41);
  assert.deepEqual(replayWorldLedger(ledger, { useSnapshots: true }), replayWorldLedger(ledger, { useSnapshots: false }));
  assert.equal(replayWorldLedger(ledger, { throughWeek: 17, useSnapshots: true }).week, 17);
  assert.equal(verifyWorldLedger(ledger).ok, true, verifyWorldLedger(ledger).issues.join("\n"));
});

test("ordinary authoritative event reducers advance action, world, knowledge, and phase state", () => {
  const game = createInitialGame("spectator");
  let ledger = createWorldLedger(game);
  const firstSequence = ledger.nextSequence;
  ledger = appendWorldLedgerEvents(ledger, [
    { id: "proposal:reduce", week: 2, phase: "player-actions", kind: "action-proposed", summary: "inspect", actorIds: ["player"], factionIds: [], witnessRefs: ["player"], causeEventIds: [], audience: { visibility: "player", holderRefs: ["player"] }, payload: { actionId: "action:reduce", intent: "inspect manifests" } },
    { id: "review:reduce", week: 2, phase: "player-actions", kind: "action-reviewed", summary: "accepted", actorIds: ["player"], factionIds: [], witnessRefs: ["player"], causeEventIds: ["proposal:reduce"], audience: { visibility: "player", holderRefs: ["player"] }, payload: { actionId: "action:reduce", status: "accepted", reasons: ["within budget"] } },
    { id: "outcome:reduce", week: 2, phase: "consequences", kind: "action-resolved", summary: "found discrepancy", actorIds: ["player"], factionIds: [], witnessRefs: ["player"], causeEventIds: ["review:reduce"], audience: { visibility: "player", holderRefs: ["player"] }, payload: { actionId: "action:reduce", outcome: "success" } },
    { id: "world:reduce", week: 2, phase: "autonomous-actors", kind: "world-event-recorded", summary: "dock closes", actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [], audience: { visibility: "world", holderRefs: [] }, payload: {} },
    { id: "delivery:reduce", week: 2, phase: "autonomous-actors", kind: "knowledge-delivered", summary: "manifest altered", actorIds: [], factionIds: [], witnessRefs: ["actor:reporter"], causeEventIds: ["world:reduce"], audience: { visibility: "actors", holderRefs: ["actor:reporter"] }, payload: { knowledgeId: "knowledge:reduce" } },
    { id: "phase:reduce", week: 2, phase: "narrative-ready", kind: "phase-completed", summary: "ready", actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [], audience: { visibility: "world", holderRefs: [] }, payload: {} },
  ]);
  const proposed = replayWorldLedger(ledger, firstSequence);
  const reviewed = replayWorldLedger(ledger, firstSequence + 1);
  const complete = replayWorldLedger(ledger, { throughWeek: 2, useSnapshots: false });
  assert.equal(proposed.actions.find((action) => action.id === "action:reduce").status, "proposed");
  assert.equal(reviewed.actions.find((action) => action.id === "action:reduce").status, "accepted");
  assert.equal(complete.actions.find((action) => action.id === "action:reduce").status, "resolved");
  assert.ok(complete.worldEventIds.includes("world:reduce"));
  assert.ok(complete.knowledgeIds.includes("knowledge:reduce"));
  assert.ok(complete.completedPhases.some((phase) => phase.week === 2 && phase.phase === "narrative-ready"));
});

test("branching and counterfactual events are isolated from the immutable parent", () => {
  const game = createInitialGame("spectator");
  let parent = createWorldLedger(game);
  parent = commitWorldLedgerWeek(parent, { ...game, week: 2, money: game.money + 10 });
  const parentBefore = JSON.stringify(parent);
  const forkAt = parent.events.at(-1).sequence;
  const branch = createWorldLedgerBranch(parent, forkAt, "branch:test");
  const result = runWorldLedgerCounterfactual(branch, branch.events.at(-1).sequence, [{
    id: "counterfactual:money",
    week: 3,
    phase: "economy",
    kind: "projection-patched",
    summary: "counterfactual windfall",
    actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [],
    audience: { visibility: "world", holderRefs: [] },
    payload: { patch: { resources: { money: 999 } } },
  }], "branch:counterfactual");
  assert.equal(JSON.stringify(parent), parentBefore);
  assert.equal(branch.parentBranchId, parent.branchId);
  assert.equal(branch.forkedAtSequence, forkAt);
  assert.equal(result.projection.resources.money, 999);
  assert.notEqual(result.ledger.branchId, parent.branchId);
  assert.equal(replayWorldLedger(parent).resources.money, game.money + 10);
});

test("undo appends a compensation event instead of rewriting history", () => {
  const game = createInitialGame("spectator");
  let ledger = createWorldLedger(game);
  ledger = appendWorldLedgerEvents(ledger, [{
    id: "patch:spend",
    week: 2,
    phase: "economy",
    kind: "projection-patched",
    summary: "spend funds",
    actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [],
    audience: { visibility: "world", holderRefs: [] },
    payload: { patch: { resources: { money: game.money - 50 } } },
  }]);
  const eventCount = ledger.events.length;
  const historyBefore = JSON.stringify(ledger.events);
  ledger = appendWorldLedgerCompensation(ledger, {
    week: 2,
    phase: "economy",
    summary: "refund invalid spend",
    compensatesEventIds: ["patch:spend"],
    inversePatch: { resources: { money: game.money } },
  });
  assert.equal(ledger.events.length, eventCount + 1);
  assert.equal(ledger.events.at(-1).kind, "compensation-applied");
  assert.equal(JSON.stringify(ledger.events.slice(0, eventCount)), historyBefore);
  assert.equal(replayWorldLedger(ledger).resources.money, game.money);
});

test("event hash chains detect tampering", () => {
  const game = createInitialGame("spectator");
  const ledger = commitWorldLedgerWeek(createWorldLedger(game), { ...game, week: 2 });
  const tampered = JSON.parse(JSON.stringify(ledger));
  tampered.events[0].payload.projection.resources.money += 1;
  const verified = verifyWorldLedger(tampered);
  assert.equal(verified.ok, false);
  assert.ok(verified.issues.some((issue) => /哈希|hash/i.test(issue)));
});

test("legacy V1 ledgers migrate without losing their authoritative projection", () => {
  const game = createInitialGame("spectator");
  const projection = projectLedgerState({ ...game, week: 7, date: "1349-08-01", money: game.money + 77 });
  const legacy = {
    version: 1,
    nextSequence: 2,
    events: [{
      id: "legacy-week-7", sequence: 1, week: 7, phase: "narrative-ready", kind: "week-committed", summary: "legacy commit",
      actorIds: [], factionIds: [], witnessRefs: [], causeEventIds: [], audience: { visibility: "world", holderRefs: [] },
      payload: { projection, checksum: ledgerChecksum(projection) },
    }],
    snapshots: [{ id: "legacy-snapshot", week: 7, afterSequence: 1, checksum: ledgerChecksum(projection), projection }],
  };
  const migrated = migrateWorldLedger(legacy, game);
  assert.equal(migrated.version, 2);
  assert.deepEqual(replayWorldLedger(migrated), projection);
  assert.equal(verifyWorldLedger(migrated).ok, true);
  assert.ok(migrated.events.every((event) => event.schemaVersion === 1 && typeof event.hash === "string"));
  assert.ok(migrated.events.filter((event) => event.kind === "week-committed").every((event) => !("projection" in event.payload)));
});
