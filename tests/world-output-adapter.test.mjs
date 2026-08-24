import assert from "node:assert/strict";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

async function fixture() {
  const { createInitialGame } = await loadRuntimeModule("app/game-model.ts");
  const { adaptWorldAdjudication } = await loadRuntimeModule("app/world-output-adapter.ts");
  const game = createInitialGame("seer");
  const allowedProposalId = "proposal:allowed:8";
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
        { id: "temporary-cause", title: "已知行动发生", detail: "一项可追溯行动进入世界账本。", actorIds: [knownActor.id, "actor:unknown"], factionIds: [knownFaction.id, "faction:unknown"], locationId: "east", visibility: "actors", sourceProposalIds: [allowedProposalId] },
        { id: "temporary-result", title: "行动产生余波", detail: "第二项事件保留真实存在的因果引用。", causeIds: ["temporary-cause"], locationId: "east", visibility: "public", sourceProposalIds: [allowedProposalId] },
      ],
      observations: [
        { eventId: "temporary-result", channel: "内部观察", text: "角色与势力共同见证了余波。", visibility: "actors", holderIds: [knownActor.id, knownFaction.id] },
        { eventId: "missing-event", channel: "无来源", text: "这条观察不得挂接到不存在的事件。", visibility: "actors" },
      ],
      knowledge: [
        { subject: "余波", statement: "只有获准的知识库来源可以进入权威知识。", truth: "likely", visibility: "actors", holderIds: [knownFaction.id], loreRecordIds: ["lore-allowed", "lore-denied"], sourceEventId: "temporary-result" },
      ],
      actorUpdates: [{ actorId: "actor:unknown", lastAction: "不得进入结果", sourceProposalIds: [allowedProposalId] }],
      projectUpdates: [{ projectId: "project:unknown", progressDelta: 99, sourceProposalIds: [allowedProposalId] }],
      canon: { mode: "diverging", deviationDelta: 99, pivotEventIds: ["temporary-result"] },
    },
  };
  const adapt = (value = raw, runtimeAuthority = {}) => {
    const defaultBoundary = {
      proposalId: allowedProposalId,
      participantRefs: [`actor:${knownActor.id}`, `faction:${knownFaction.id}`],
      targetRefs: ["location:east", ...(runtimeAuthority.extraTargetRefs ?? [])],
      holderRefs: [`actor:${knownActor.id}`, `faction:${knownFaction.id}`],
      commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
      causeEventIds: [],
      redLines: ["不得惊动目标"], mustEscalateWhen: [], retreatCondition: "身份暴露时撤退",
    };
    const proposalBoundaries = new Map([[allowedProposalId, defaultBoundary], ...(runtimeAuthority.extraProposalBoundaries ?? new Map())]);
    return adaptWorldAdjudication(value, {
      game,
      resolvingWeek: 8,
      playerIssuedNoOrders: true,
      allowedLoreIds: new Set(["lore-allowed"]),
      allowedProposalIds: new Set(proposalBoundaries.keys()),
      proposalBoundaries,
      formulaProposalAuthorizations: runtimeAuthority.formulaProposalAuthorizations ?? new Map(),
    });
  };
  return { game, raw, knownActor, knownFaction, allowedProposalId, adapt };
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
  assert.ok(first.kernelDelta.events.every((event) => /^world-event:[0-9a-f]{64}$/.test(event.id)));
  assert.deepEqual(first.kernelDelta.events[0].actorIds, [knownActor.id]);
  assert.deepEqual(first.kernelDelta.events[0].factionIds, [knownFaction.id]);
  assert.equal(first.kernelDelta.events[1].locationId, "east");
  assert.deepEqual(first.kernelDelta.events[1].causeIds, [first.kernelDelta.events[0].id]);
  assert.equal(first.kernelDelta.observations.length, 1);
  assert.deepEqual(first.ruleSignals, [], "unprovenanced public prose remains presentation-only");
  assert.ok(first.kernelDelta.observations.filter((item) => item.id.startsWith("observation:")).every((item) => /^observation:[0-9a-f]{64}$/.test(item.id)));
  assert.ok(first.kernelDelta.observations.every((item) => item.text !== "这条观察不得挂接到不存在的事件。"));
  assert.ok(first.kernelDelta.observations[0].holderRefs.includes(`actor:${knownActor.id}`));
  assert.ok(first.kernelDelta.observations[0].holderRefs.includes(`faction:${knownFaction.id}`));
  assert.deepEqual(first.kernelDelta.knowledge[0].loreRecordIds, ["lore-allowed"]);
  assert.equal(first.kernelDelta.knowledge[0].sourceEventId, first.kernelDelta.events[1].id);
  assert.equal(first.kernelDelta.knowledgeGrants.length, 1);
  assert.equal(first.kernelDelta.knowledgeGrants[0].knowledgeId, first.kernelDelta.knowledge[0].id);
  assert.equal(first.kernelDelta.knowledgeGrants[0].holderRef, `faction:${knownFaction.id}`);
  assert.equal(first.kernelDelta.knowledgeGrants[0].sourceObservationId, first.kernelDelta.observations[0].id);
  assert.equal(first.kernelDelta.actorUpdates.length, 0);
  assert.ok(first.kernelDelta.projectUpdates.every((item) => item.projectId !== "project:unknown"));
  assert.equal(first.kernelDelta.canon.mode, "anchored");
  assert.equal(first.kernelDelta.canon.deviationDelta, 8);
  assert.deepEqual(first.kernelDelta.canon.pivotEventIds, []);
});

test("only a public signal bound to its current-turn event and claim can affect rule state", async () => {
  const { raw, allowedProposalId, adapt } = await fixture();
  const sourced = structuredClone(raw);
  sourced.publicSignals[0].sourceProposalId = allowedProposalId;
  sourced.publicSignals[0].sourceEventId = "temporary-result";
  sourced.publicSignals[0].sourceObservation = sourced.publicSignals[0].body;
  const result = adapt(sourced);
  assert.deepEqual(result.ruleSignals.map((signal) => signal.id), [result.publicSignals[0].id]);
  assert.ok(result.kernelDelta.observations.some((observation) => observation.eventId === result.kernelDelta.events[1].id && observation.text === sourced.publicSignals[0].body));
  assert.ok(result.kernelDelta.mutationClaims.some((claim) => claim.effectKind === "location-state" && claim.subjectRef === "location:east" && claim.sourceEventId === result.kernelDelta.events[1].id));
});

test("a valid event for one actor cannot authorize a persistent sidecar mutation for another member", async () => {
  const { game, raw, allowedProposalId, adapt } = await fixture();
  const malicious = structuredClone(raw);
  const unrelatedMember = game.members[0];
  malicious.kernelDelta.observations[0].visibility = "public";
  malicious.organizationDelta = {
    memberDevelopments: [{
      memberId: unrelatedMember.id,
      observation: "模型试图借别人的事件修改该成员。",
      cause: "无关来源",
      sourceProposalId: allowedProposalId,
      sourceEventId: "temporary-result",
      sourceObservation: malicious.kernelDelta.observations[0].text,
    }],
  };
  assert.throws(() => adapt(malicious), /SIDECAR_AUTHORITY_REJECTED/);
});

test("a recruitable contact is canonically bound to the same actor and observation", async () => {
  const { game, raw, knownActor, allowedProposalId, adapt } = await fixture();
  const otherActor = game.worldKernel.actors.find((actor) => actor.id !== knownActor.id);
  assert.ok(otherActor);
  const candidate = structuredClone(raw);
  const sourceObservation = "调查者在东区当面确认了这名联系人。";
  candidate.kernelDelta.observations.push({
    eventId: "temporary-cause",
    channel: "现场",
    text: sourceObservation,
    visibility: "player",
    holderIds: ["player"],
  });
  candidate.organizationDelta = {
    newRecruitableNpc: {
      actorId: knownActor.id,
      name: otherActor.name,
      role: "可疑身份",
      background: "模型自行编造的背景",
      contactReason: "模型自行编造的接触原因",
      secret: "模型自行编造的秘密",
      sourceProposalId: allowedProposalId,
      sourceEventId: "temporary-cause",
      sourceObservation,
    },
  };

  const accepted = adapt(candidate).organizationDelta.newRecruitableNpc;
  assert.equal(accepted.actorId, knownActor.id);
  assert.equal(accepted.name, knownActor.name);
  assert.notEqual(accepted.name, otherActor.name);
  assert.equal(accepted.background, sourceObservation);
  assert.equal(accepted.contactReason, sourceObservation);
  assert.equal(accepted.secret, "尚未确认");

  const missingActor = structuredClone(candidate);
  delete missingActor.organizationDelta.newRecruitableNpc.actorId;
  assert.throws(() => adapt(missingActor), /必须绑定已解析的同一 actor/);

  const borrowedEvent = structuredClone(candidate);
  borrowedEvent.organizationDelta.newRecruitableNpc.actorId = otherActor.id;
  assert.throws(() => adapt(borrowedEvent), /SIDECAR_AUTHORITY_REJECTED/);
});

test("a same-turn actor can become the recruitable contact only through its own creation event", async () => {
  const { raw, knownActor, allowedProposalId, adapt } = await fixture();
  const candidate = structuredClone(raw);
  const actorId = "same-turn-contact";
  const sourceObservation = "调查者在东区现场确认了新联系人的身份与接触意愿。";
  candidate.kernelDelta.newActors = [{
    id: actorId,
    name: "新联系人",
    locationId: "east",
    agenda: "观察东区局势",
    shortTermGoal: "建立有限联络",
    condition: "谨慎",
    sourceProposalIds: [allowedProposalId],
  }];
  candidate.kernelDelta.events[0].actorIds = [knownActor.id, actorId];
  candidate.kernelDelta.observations.push({
    eventId: "temporary-cause",
    channel: "现场",
    text: sourceObservation,
    visibility: "player",
    holderIds: ["player"],
  });
  candidate.organizationDelta = { newRecruitableNpc: {
    actorId,
    name: "伪造姓名",
    role: "有限联系人",
    background: "不得采用的模型背景",
    contactReason: "不得采用的模型理由",
    secret: "不得采用的模型秘密",
    sourceProposalId: allowedProposalId,
    sourceEventId: "temporary-cause",
    sourceObservation,
  } };

  const accepted = adapt(candidate).organizationDelta.newRecruitableNpc;
  assert.equal(accepted.actorId, actorId);
  assert.equal(accepted.name, "新联系人");
  assert.equal(accepted.background, sourceObservation);

  const borrowed = structuredClone(candidate);
  borrowed.kernelDelta.events[0].actorIds = [knownActor.id];
  assert.throws(() => adapt(borrowed), /MUTATION_CREATION_CAPABILITY_REJECTED|SIDECAR_AUTHORITY_REJECTED/);
});

test("a different proposal cannot borrow a same-turn actor's created-ref for recruitment", async () => {
  const { raw, knownActor, allowedProposalId, adapt } = await fixture();
  const actorId = "proposal-a-contact";
  const otherProposalId = "proposal:other:8";
  const sourceObservation = "另一项行动只是在东区看见了这名新角色。";
  const candidate = structuredClone(raw);
  candidate.kernelDelta.newActors = [{
    id: actorId,
    name: "由提案甲创建的角色",
    locationId: "east",
    agenda: "观察",
    shortTermGoal: "等待",
    condition: "谨慎",
    sourceProposalIds: [allowedProposalId],
  }];
  candidate.kernelDelta.events[0].actorIds = [knownActor.id, actorId];
  candidate.kernelDelta.events.push({
    id: "proposal-b-sighting",
    title: "另一行动看见新角色",
    detail: "提案乙在东区看见了提案甲刚创建的角色，但没有取得该角色的 mutation scope。",
    actorIds: [knownActor.id, actorId],
    factionIds: [],
    locationId: "east",
    visibility: "player",
    sourceProposalIds: [otherProposalId],
  });
  candidate.kernelDelta.observations.push({
    eventId: "proposal-b-sighting",
    channel: "现场",
    text: sourceObservation,
    visibility: "player",
    holderIds: ["player"],
  });
  candidate.organizationDelta = { newRecruitableNpc: {
    actorId,
    name: "越权招募",
    role: "联系人",
    background: "越权",
    contactReason: "越权",
    secret: "越权",
    sourceProposalId: otherProposalId,
    sourceEventId: "proposal-b-sighting",
    sourceObservation,
  } };
  const otherBoundary = {
    proposalId: otherProposalId,
    participantRefs: [`actor:${knownActor.id}`],
    targetRefs: ["location:east"],
    holderRefs: [`actor:${knownActor.id}`],
    commitments: { money: 0, manpower: 0, extraordinaryMaterials: 0, spirituality: 0 },
    causeEventIds: [], redLines: [], mustEscalateWhen: [], retreatCondition: "撤退",
  };

  assert.throws(
    () => adapt(candidate, { extraProposalBoundaries: new Map([[otherProposalId, otherBoundary]]) }),
    /SIDECAR_AUTHORITY_REJECTED/,
  );
});

test("an existing department is ordinary proposal scope, never a model-created subject", async () => {
  const { game, raw, knownActor, allowedProposalId, adapt } = await fixture();
  const department = game.departments[0];
  department.leadMemberId = knownActor.id;
  const candidate = structuredClone(raw);
  candidate.kernelDelta.observations.push({ eventId: "temporary-cause", channel: "现场", text: "负责人在现场确认了部门交接变化。", visibility: "player", holderIds: ["player"] });
  candidate.organizationDelta = { departmentDevelopments: [{
    departmentId: department.id,
    report: "部门交接出现可观察变化。",
    cause: "本轮行动",
    sourceProposalId: allowedProposalId,
    sourceEventId: "temporary-cause",
    sourceObservation: "负责人在现场确认了部门交接变化。",
  }] };

  assert.throws(() => adapt(candidate), /SIDECAR_AUTHORITY_REJECTED/);
  const accepted = adapt(candidate, { extraTargetRefs: [`department:${department.id}`] });
  assert.ok(accepted.kernelDelta.mutationClaims.some((claim) => claim.subjectRef === `department:${department.id}`));
});

test("an existing formula requires the same successful proposal action and exact formula scope", async () => {
  const { game, raw, allowedProposalId, adapt } = await fixture();
  const formulaId = "formula-seer-9";
  game.management.formulas.push({ id: formulaId, pathwayId: "seer", sequence: 9, name: "占卜家配方", status: "lead", reliability: 20, sourceRefs: [], loreEvidenceIds: [] });
  const candidate = structuredClone(raw);
  candidate.kernelDelta.observations[0].visibility = "player";
  candidate.organizationDelta = { formulaDiscoveries: [{
    pathwayId: "seer",
    sequence: 9,
    status: "fragment",
    reliability: 50,
    sourceRefs: ["action:formula"],
    loreEvidenceIds: [],
    sourceProposalId: allowedProposalId,
    sourceEventId: "temporary-result",
    sourceObservation: candidate.kernelDelta.observations[0].text,
  }] };
  const formulaAuthority = new Map([[allowedProposalId, { actionId: "action:formula" }]]);

  assert.throws(() => adapt(candidate, { formulaProposalAuthorizations: formulaAuthority }), /SIDECAR_AUTHORITY_REJECTED/);
  assert.throws(() => adapt(candidate, {
    extraTargetRefs: [`knowledge:${formulaId}`],
    formulaProposalAuthorizations: new Map([[allowedProposalId, { actionId: "action:other" }]]),
  }), /同一提案的成功配方行动/);
  const accepted = adapt(candidate, { extraTargetRefs: [`knowledge:${formulaId}`], formulaProposalAuthorizations: formulaAuthority });
  assert.ok(accepted.kernelDelta.mutationClaims.some((claim) => claim.subjectRef === `knowledge:${formulaId}`));

  const outOfRange = structuredClone(candidate);
  outOfRange.organizationDelta.formulaDiscoveries[0].sequence = 999;
  assert.throws(() => adapt(outOfRange, { formulaProposalAuthorizations: formulaAuthority }), /途径或序列无效/);
});

test("sidecar validation and application share one canonical district identity", async () => {
  const { raw, allowedProposalId, adapt } = await fixture();
  const candidate = structuredClone(raw);
  candidate.kernelDelta.observations[0].visibility = "player";
  candidate.emergentLead = {
    districtId: "east ",
    label: "  规范化线索  ",
    summary: "  来源事件只授权东区。  ",
    source: "现场",
    tags: ["track"],
    followUp: "核验",
    sourceProposalId: allowedProposalId,
    sourceEventId: "temporary-result",
    sourceObservation: candidate.kernelDelta.observations[0].text,
  };
  const accepted = adapt(candidate);
  assert.equal(accepted.emergentLead.districtId, "east");
  assert.equal(accepted.emergentLead.label, "规范化线索");
  assert.equal(accepted.emergentLead.summary, "来源事件只授权东区。");
});

test("private knowledge holders require a matching persisted acquisition grant", async () => {
  const { game, raw, knownActor, adapt } = await fixture();
  const unobservedActor = game.worldKernel.actors.find((actor) => actor.id !== knownActor.id);
  assert.ok(unobservedActor);
  const malicious = structuredClone(raw);
  malicious.kernelDelta.knowledge[0].holderIds = [unobservedActor.id];
  assert.throws(() => adapt(malicious), /KnowledgeGrant/);
});

test("world output adapter drops new entities whose persistent references do not resolve", async () => {
  const { raw, knownActor, allowedProposalId, adapt } = await fixture();
  const malformed = structuredClone(raw);
  malformed.kernelDelta.newActors = [
    { id: "valid-new-actor", name: "合法新角色", locationId: "east", agenda: "调查", shortTermGoal: "观察", condition: "正常", sourceProposalIds: [allowedProposalId] },
    { id: "orphan-new-actor", name: "孤立新角色", locationId: "missing-location", agenda: "调查", shortTermGoal: "观察", condition: "正常", sourceProposalIds: [allowedProposalId] },
  ];
  malformed.kernelDelta.newProjects = [
    { id: "valid-new-project", ownerId: "valid-new-actor", title: "合法项目", stage: "形成", progress: 0, momentum: 1, secrecy: 50, nextMilestone: "下一步", blockers: [], status: "active", sourceProposalIds: [allowedProposalId] },
    { id: "orphan-new-project", ownerId: "missing-owner", title: "孤立项目", stage: "形成", progress: 0, momentum: 1, secrecy: 50, nextMilestone: "下一步", blockers: [], status: "active", sourceProposalIds: [allowedProposalId] },
  ];
  malformed.kernelDelta.actorUpdates = [{ actorId: knownActor.id, locationId: "missing-location", lastAction: "无效移动", sourceProposalIds: [allowedProposalId] }];
  malformed.kernelDelta.events.push({
    id: "new-actor-encountered",
    title: "新角色进入视野",
    detail: "调查者在东区确认该角色值得持续追踪。",
    actorIds: [knownActor.id, "valid-new-actor"],
    factionIds: [],
    locationId: "east",
    visibility: "world",
    sourceProposalIds: [allowedProposalId],
  });
  const result = adapt(malformed);
  assert.deepEqual(result.kernelDelta.newActors.map((actor) => actor.id), ["valid-new-actor"]);
  assert.deepEqual(result.kernelDelta.newProjects.map((project) => project.id), ["valid-new-project"]);
  assert.equal(result.kernelDelta.actorUpdates[0].locationId, undefined);
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

test("world mutations without an executable proposal source are removed before kernel commit", async () => {
  const { raw, knownActor, allowedProposalId, adapt } = await fixture();
  const malicious = structuredClone(raw);
  malicious.kernelDelta.events.push({
    id: "rejected-event",
    title: "拒绝提案伪造的事件",
    detail: "这项变化不得进入世界。",
    actorIds: [knownActor.id],
    factionIds: [],
    visibility: "player",
    sourceProposalIds: ["proposal:rejected:8"],
  });
  malicious.kernelDelta.actorUpdates.push({
    actorId: knownActor.id,
    lastAction: "由拒绝提案制造的变化",
    sourceProposalIds: ["proposal:rejected:8"],
  });
  malicious.kernelDelta.locationUpdates = [{
    locationId: "east",
    riskDelta: 8,
    sourceProposalIds: [],
  }];
  malicious.kernelDelta.projectUpdates.push({
    projectId: "project:unknown",
    progressDelta: 5,
    sourceProposalIds: [allowedProposalId, "proposal:rejected:8"],
  });
  const result = adapt(malicious);
  assert.ok(!result.kernelDelta.events.some((event) => event.title === "拒绝提案伪造的事件"));
  assert.ok(!result.kernelDelta.actorUpdates.some((update) => update.lastAction === "由拒绝提案制造的变化"));
  assert.equal(result.kernelDelta.locationUpdates.length, 0);
  assert.ok(result.kernelDelta.events.every((event) => event.sourceProposalIds.every((id) => id === allowedProposalId)));
});

test("directive interruption requires a real sourced event and an exact authorization boundary", async () => {
  const { raw, allowedProposalId, adapt } = await fixture();
  const interrupted = structuredClone(raw);
  interrupted.kernelDelta.directiveInterruptions = [
    { proposalId: allowedProposalId, sourceEventId: "temporary-result", triggeredBoundary: "身份暴露时撤退", reason: "身份掩护已经失效，负责人按约定撤离。", completedFraction: 0.4 },
    { proposalId: allowedProposalId, sourceEventId: "temporary-result", triggeredBoundary: "模型自行增加的边界", reason: "不得接受。", completedFraction: 0.5 },
    { proposalId: "proposal:rejected:8", sourceEventId: "temporary-result", triggeredBoundary: "身份暴露时撤退", reason: "不得接受。", completedFraction: 0.5 },
  ];
  const result = adapt(interrupted);
  assert.equal(result.kernelDelta.directiveInterruptions.length, 1);
  assert.equal(result.kernelDelta.directiveInterruptions[0].proposalId, allowedProposalId);
  assert.equal(result.kernelDelta.directiveInterruptions[0].completedFraction, 0.4);
  assert.ok(result.kernelDelta.events.some((event) => event.id === result.kernelDelta.directiveInterruptions[0].sourceEventId));
});
