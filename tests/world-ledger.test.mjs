import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import {
  appendWorldLedgerEvents,
  commitWorldLedgerWeek,
  createWorldLedger,
  ledgerChecksum,
  recordWorldLedgerPhase,
  replayWorldLedger,
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
  assert.equal(ledger.snapshots.at(-1).checksum, ledgerChecksum(replayWorldLedger(ledger)));
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
