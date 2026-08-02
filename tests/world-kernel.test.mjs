import assert from "node:assert/strict";
import test from "node:test";

import { applyWorldTurn, createWorldKernel, projectWorldForAudience } from "../app/world-kernel.ts";
import { createInitialGame } from "../app/game-model.ts";

test("a new campaign begins with a persistent anchored world, not an empty weekly summary shell", () => {
  const game = createInitialGame("spectator");
  assert.equal(game.version, 13);
  assert.equal(game.worldKernel.canon.mode, "anchored");
  assert.ok(game.worldKernel.projects.length >= game.factions.length + game.timeline.length);
  assert.ok(game.worldKernel.actors.some((actor) => actor.id === "klein" && actor.locationId === "tingen"));
});

test("an AI world turn advances independent plans even when the player issued no orders", () => {
  const initial = createWorldKernel({
    week: 1,
    date: "1349年6月30日",
    factions: [{ id: "press", name: "晚报消息网", plan: "调查失踪人口", progress: 10 }],
    actors: [{ id: "reporter", name: "社会版记者", locationId: "east", agenda: "找到能刊登的事实" }],
    locations: [{ id: "east", name: "东区", risk: 70 }],
    timeline: [{ id: "smog", title: "雾霾前夜", scheduledWeek: 22, status: "upcoming" }],
  });

  const next = applyWorldTurn(initial, {
    week: 1,
    playerIssuedNoOrders: true,
    actorUpdates: [{ actorId: "reporter", locationId: "east", shortTermGoal: "核对三家工厂的缺勤名单", lastAction: "从互助会取得两份互相矛盾的名单" }],
    projectUpdates: [{ projectId: "faction:press", progressDelta: 5, stage: "核验", nextMilestone: "找到第二个独立来源" }],
    locationUpdates: [{ locationId: "east", riskDelta: 2, condition: "便衣开始询问失踪者家属" }],
    events: [{ id: "event-press-list", title: "两份名单", detail: "记者取得相互矛盾的工厂缺勤名单。", locationId: "east", actorIds: ["reporter"], factionIds: ["press"], causeIds: [], visibility: "world" }],
    observations: [{ id: "obs-rumour", eventId: "event-press-list", channel: "街谈", text: "东区有人在高价收购旧工人名册。", visibility: "public", holderIds: [] }],
  });

  assert.equal(next.projects.find((item) => item.id === "faction:press")?.progress, 15);
  assert.equal(next.actors.find((item) => item.id === "reporter")?.lastAction, "从互助会取得两份互相矛盾的名单");
  assert.equal(next.locations.find((item) => item.id === "east")?.risk, 72);
  assert.equal(next.events.at(-1)?.id, "event-press-list");
  assert.equal(projectWorldForAudience(next, { kind: "player", holderId: "player" }).events.length, 0);
  assert.equal(projectWorldForAudience(next, { kind: "player", holderId: "player" }).observations[0].id, "obs-rumour");
});

test("the persistent world can introduce a newly relevant actor and causal project without making them player knowledge", () => {
  const initial = createWorldKernel({ week: 3, date: "1349年7月14日", factions: [], actors: [], locations: [{ id: "dock", name: "码头区", risk: 60 }], timeline: [] });
  const next = applyWorldTurn(initial, {
    week: 3,
    playerIssuedNoOrders: true,
    newActors: [{ id: "dock-clerk", name: "港务书记员", locationId: "dock", agenda: "保住职位", shortTermGoal: "补齐缺失货单", condition: "惶恐" }],
    newProjects: [{ id: "emergent:missing-cargo", ownerId: "dock-clerk", title: "缺失货单", stage: "掩盖", progress: 8, momentum: 1, secrecy: 70, nextMilestone: "找到替代签章", blockers: [], status: "active" }],
    actorUpdates: [], projectUpdates: [], locationUpdates: [],
    events: [
      { id: "e1", title: "货单缺页", detail: "书记员发现货单被人抽走。", locationId: "dock", actorIds: ["dock-clerk"], factionIds: [], causeIds: [], visibility: "world" },
      { id: "e2", title: "临时补页", detail: "书记员决定伪造一份临时补页。", locationId: "dock", actorIds: ["dock-clerk"], factionIds: [], causeIds: ["e1"], visibility: "world" },
      { id: "e3", title: "错误签章", detail: "伪造补页使用了过期签章。", locationId: "dock", actorIds: ["dock-clerk"], factionIds: [], causeIds: ["e2"], visibility: "world" },
    ],
    observations: [],
  });
  assert.equal(next.actors.find((item) => item.id === "dock-clerk")?.shortTermGoal, "补齐缺失货单");
  assert.equal(next.projects.find((item) => item.id === "emergent:missing-cargo")?.stage, "掩盖");
  assert.equal(projectWorldForAudience(next, { kind: "player", holderId: "player" }).events.length, 0);
});
