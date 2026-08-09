import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

async function fixture() {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const knownActor = game.worldKernel.actors[0];
  const knownFaction = game.worldKernel.factions[0];
  const raw = {
    factionMoves: [
      { factionId: game.factions[0].id, title: "合法行动", detail: "势力改变了一处联络安排。", visibility: "获知" },
      { factionId: "hidden-unknown", title: "未知行动", detail: "不得进入结果。", visibility: "确认" },
    ],
    canonMoves: [{ actorId: game.canonActors[0].id, awareness: "注意" }],
    publicSignals: [
      { channel: "报纸", headline: "东区调整夜间交通", body: "市政部门公布了三天的夜间交通调整安排。", reliability: "公开事实", districtId: "east", cityId: "backlund", relatedFactionId: game.factions[0].id },
      { channel: "非法频道", headline: "市场传出煤价变化", body: "几家煤行正在重新核对下周的公开报价。", reliability: "无效可信度", districtId: "unknown", cityId: "unknown", relatedFactionId: "unknown" },
    ],
    worldSummary: { atmosphere: "街道仍然繁忙，但报童和煤行都在谈论新的交通安排。", undercurrents: ["一条有限暗流", "x".repeat(400)] },
    kernelDelta: {
      events: [
        { id: "temporary-cause", title: "已知行动发生", detail: "一项可追溯行动进入世界账本。", actorIds: [knownActor.id, "actor:unknown"], factionIds: [knownFaction.id, "faction:unknown"], locationId: "east", visibility: "actors" },
        { id: "temporary-result", title: "行动产生余波", detail: "第二项事件只保留真实存在的因果引用。", causeIds: ["temporary-cause", "missing-cause"], locationId: "unknown", visibility: "public" },
      ],
      observations: [
        { eventId: "temporary-result", channel: "内部观察", text: "角色与势力共同见证了余波。", visibility: "actors", holderIds: [knownActor.id, knownFaction.id] },
        { eventId: "missing-event", channel: "无来源", text: "这条观察不得挂接到不存在的事件。", visibility: "actors" },
      ],
      knowledge: [
        { subject: "余波", statement: "只有获准的知识库来源可以进入权威知识。", truth: "likely", visibility: "actors", holderIds: [knownFaction.id], loreRecordIds: ["lore-allowed", "lore-denied"], sourceEventId: "temporary-result" },
      ],
      actorUpdates: [{ actorId: "actor:unknown", lastAction: "不得进入结果" }],
      projectUpdates: [{ projectId: "project:unknown", progressDelta: 99 }],
      canon: { mode: "diverging", deviationDelta: 99, pivotEventIds: ["temporary-result"] },
    },
  };
  const adapt = (value = raw) => adaptWorldAdjudication(value, {
    game,
    resolvingWeek: 8,
    playerIssuedNoOrders: true,
    allowedLoreIds: new Set(["lore-allowed"]),
  });
  return { game, raw, knownActor, knownFaction, adapt };
}

test("world output adapter returns one deterministic, authority-safe adjudication result", async () => {
  const { game, raw, knownActor, knownFaction, adapt } = await fixture();
  const first = adapt(raw);
  const second = adapt(structuredClone(raw));
  assert.deepEqual(second, first);
  assert.equal(first.worldMoves.length, 1);
  assert.equal(first.worldMoves[0].factionId, game.factions[0].id);
  assert.equal(first.worldMoves[0].visibility, "获知");
  assert.equal(first.publicSignals.length, 2);
  assert.equal(first.publicSignals[1].channel, "街谈");
  assert.equal(first.publicSignals[1].reliability, "单一消息");
  assert.equal(first.publicSignals[1].districtId, undefined);
  assert.equal(first.publicSignals[1].cityId, undefined);
  assert.equal(first.publicSignals[1].relatedFactionId, undefined);
  assert.ok(first.publicSignals.every((signal) => signal.week === 8 && signal.id.startsWith("ai-signal-8-")));
  assert.equal(first.undercurrents[1].length, 260);
  assert.equal(first.kernelDelta.week, 8);
  assert.equal(first.kernelDelta.playerIssuedNoOrders, true);
  assert.equal(first.kernelDelta.events.length, 2);
  assert.deepEqual(first.kernelDelta.events[0].actorIds, [knownActor.id]);
  assert.deepEqual(first.kernelDelta.events[0].factionIds, [knownFaction.id]);
  assert.equal(first.kernelDelta.events[1].locationId, undefined);
  assert.deepEqual(first.kernelDelta.events[1].causeIds, [first.kernelDelta.events[0].id]);
  assert.equal(first.kernelDelta.observations.length, 3);
  assert.ok(first.kernelDelta.observations.every((item) => item.text !== "这条观察不得挂接到不存在的事件。"));
  assert.ok(first.kernelDelta.observations[0].holderRefs.includes(`actor:${knownActor.id}`));
  assert.ok(first.kernelDelta.observations[0].holderRefs.includes(`faction:${knownFaction.id}`));
  assert.deepEqual(first.kernelDelta.knowledge[0].loreRecordIds, ["lore-allowed"]);
  assert.equal(first.kernelDelta.knowledge[0].sourceEventId, first.kernelDelta.events[1].id);
  assert.equal(first.kernelDelta.actorUpdates.length, 0);
  assert.ok(first.kernelDelta.projectUpdates.every((item) => item.projectId !== "project:unknown"));
  assert.equal(first.kernelDelta.canon.mode, "anchored");
  assert.equal(first.kernelDelta.canon.deviationDelta, 8);
  assert.deepEqual(first.kernelDelta.canon.pivotEventIds, []);
});

test("world output adapter preserves transactional rejection for incomplete public output", async () => {
  const { raw, adapt } = await fixture();
  assert.throws(
    () => adapt({ ...raw, publicSignals: raw.publicSignals.slice(0, 1) }),
    /2条公开消息/,
  );
  assert.throws(
    () => adapt({ ...raw, worldSummary: {} }),
    /城市气氛/,
  );
});
