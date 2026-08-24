import assert from "node:assert/strict";
import test from "node:test";
import { compileWorldContext } from "../electron/world-context-compiler.cjs";

function worldFixture() {
  const actors = Array.from({ length: 140 }, (_, index) => ({
    id: `actor-${index}`,
    name: `主体${index}`,
    locationId: `location-${index % 4}`,
    agenda: `议程${index}`,
    shortTermGoal: `短期目标${index}`,
    updatedWeek: index % 9,
  }));
  const locations = Array.from({ length: 4 }, (_, index) => ({
    id: `location-${index}`,
    name: `地点${index}`,
    risk: index,
    updatedWeek: index,
  }));
  const projects = Array.from({ length: 140 }, (_, index) => ({
    id: `project-${index}`,
    ownerId: `actor-${index}`,
    locationId: `location-${index % 4}`,
    title: `项目${index}`,
    stage: "推进",
    progress: index,
    updatedWeek: index % 9,
  }));
  const events = Array.from({ length: 140 }, (_, index) => ({
    id: `event-${index}`,
    week: index,
    title: `事件${index}`,
    detail: `事件详情${index}`,
    locationId: `location-${index % 4}`,
    actorIds: [`actor-${index}`],
    factionIds: [],
    causeIds: index > 0 ? [`event-${index - 1}`] : [],
    visibility: "world",
  }));
  const observations = [{ id: "observation-129", eventId: "event-129", channel: "现场", text: "本轮可验证的观察。", visibility: "player" }];
  const knowledge = [{ id: "knowledge-129", subject: "actor-129", statement: "主体出现在本轮来源事件中。", sourceEventId: "event-129", visibility: "player" }];
  return {
    adjudicatorWorld: {
      currentWeek: 10,
      currentDate: "1349年7月1日",
      revision: 4,
      actors,
      factions: [],
      locations,
      projects,
      events,
      observations,
      knowledge,
      proposals: [],
    },
    unifiedActionPlans: [{
      source: "leader",
      proposalId: "proposal:target-129",
      executionPlan: {
        proposalId: "proposal:target-129",
        executable: true,
        participantRefs: ["actor:actor-1"],
        targetRefs: ["project:project-129"],
        holderRefs: [],
        causeEventIds: ["event-129"],
        commitments: { money: 0, manpower: 1, extraordinaryMaterials: 0 },
      },
    }],
  };
}

test("causal closure includes a target at index 129 and its four-level event ancestors", () => {
  const result = compileWorldContext(worldFixture(), { maxBytes: 64 * 1024, commit: "a".repeat(40), tree: "b".repeat(40) });
  assert.ok(result.adjudicatorWorld.projects.some((item) => item.id === "project-129"));
  assert.ok(result.adjudicatorWorld.actors.some((item) => item.id === "actor-129"));
  for (const id of ["event-129", "event-128", "event-127", "event-126", "event-125"]) {
    assert.ok(result.adjudicatorWorld.events.some((item) => item.id === id), `missing ${id}`);
  }
  assert.ok(result.adjudicatorWorld.observations.some((item) => item.id === "observation-129"));
  assert.ok(result.adjudicatorWorld.knowledge.some((item) => item.id === "knowledge-129"));
  assert.deepEqual(result.omissionReceipt.mustIncludeTruncation, 0);
});

test("must-include overflow fails closed instead of truncating the required set", () => {
  const input = worldFixture();
  input.adjudicatorWorld.projects[129].title = "x".repeat(20_000);
  assert.throws(
    () => compileWorldContext(input, { maxBytes: 1_024 }),
    /WORLD_CONTEXT_REQUIRED_SET_OVERFLOW/,
  );
});

test("context selection and omission receipt are stable when source arrays are reordered", () => {
  const input = worldFixture();
  const reversed = structuredClone(input);
  reversed.adjudicatorWorld.actors.reverse();
  reversed.adjudicatorWorld.projects.reverse();
  reversed.adjudicatorWorld.events.reverse();
  const first = compileWorldContext(input, { maxBytes: 64 * 1024, commit: "a".repeat(40), tree: "b".repeat(40) });
  const second = compileWorldContext(reversed, { maxBytes: 64 * 1024, commit: "a".repeat(40), tree: "b".repeat(40) });
  assert.deepEqual(second, first);
});

test("unknown executable references fail closed", () => {
  const input = worldFixture();
  input.unifiedActionPlans[0].executionPlan.targetRefs = ["actor:missing-actor"];
  assert.throws(
    () => compileWorldContext(input),
    /WORLD_CONTEXT_UNKNOWN_REFERENCE: actor:missing-actor/,
  );
});
