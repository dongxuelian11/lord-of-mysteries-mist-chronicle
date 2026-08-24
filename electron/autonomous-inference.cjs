"use strict";

const { deriveAutonomousRagWorkerRequestForGame } = require("./runtime-authority.cjs");
const { assertNoVerbatimLoreLeak, exactPromptEvidence, receiptFor } = require("./rag-evidence.cjs");

const AUTONOMOUS_SYSTEM = "你正在扮演《灰雾纪事》持续世界中的一个独立主体。你只能依据本次由主进程从持久存档生成的自身投影、私有记忆摘要和已授权知识做本周计划；不得假设知道其他主体的私密提案或世界真相。你只提出意图，不决定成功，不修改资源和事实。允许行动、延续、观察、隐藏、休整或等待；没有状态驱动的理由时应自然等待。只返回严格JSON。";
const DISPOSITIONS = new Set(["act", "continue", "observe", "hide", "rest", "wait"]);
const TARGET_REF_PATTERN = /^(actor|faction|location|project):[^\s:][^\s]*$|^(player|organization)$/;

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function strings(values, maximum, maximumLength = 256) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => Boolean(value) && value.length <= maximumLength))].slice(0, maximum);
}

function shortText(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function holderCanSee(value, principalRef) {
  if (!value || typeof value !== "object") return false;
  if (value.visibility === "public") return true;
  if (Array.isArray(value.holderRefs) && value.holderRefs.length > 0) return value.holderRefs.includes(principalRef);
  const entityId = principalRef.slice(principalRef.indexOf(":") + 1);
  return Array.isArray(value.holderIds) && value.holderIds.includes(entityId);
}

function involved(ids, raw, canonical) {
  return Array.isArray(ids) && (ids.includes(raw) || ids.includes(canonical));
}

function relevanceTerms(value) {
  const normalized = String(value ?? "").toLowerCase();
  const terms = new Set(normalized.match(/[a-z0-9:_-]{3,}|[\u4e00-\u9fff]{2,8}/g) ?? []);
  for (const chunk of normalized.match(/[\u4e00-\u9fff]{3,12}/g) ?? []) {
    for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) terms.add(chunk.slice(index, index + size));
    }
  }
  return terms;
}

function signalRelevance(item, signals) {
  const query = relevanceTerms([signals.objective, signals.nextAction, ...(signals.relationshipRefs ?? [])].filter(Boolean).join(" "));
  if (!query.size) return 0;
  const memory = relevanceTerms(`${item.summary} ${(item.tags ?? []).join(" ")}`);
  let matches = 0;
  for (const term of query) if (memory.has(term)) matches += 1;
  return Math.min(1, matches / Math.max(1, Math.min(4, query.size)));
}

function renderMemory(items) {
  const groups = [
    ["WORLD FACTS", "event"],
    ["ACTOR BELIEFS", "belief"],
    ["UNCERTAINTIES", "uncertainty"],
    ["ACTIVE COMMITMENTS", "commitment"],
    ["RELATIONSHIP CAUSES", "relationship"],
    ["ACTIVE PLANS", "plan"],
  ];
  const lines = ["[DYNAMIC MEMORY]"];
  for (const [title, kind] of groups) {
    lines.push(`[${title}]`);
    const selected = kind === "uncertainty"
      ? items.filter((item) => item.kind === "belief" && (item.status === "uncertain" || item.status === "unknown" || Number(item.confidence ?? 1) < 0.6))
      : items.filter((item) => item.kind === kind);
    for (const item of selected) {
      const confidence = item.confidence !== undefined ? ` (置信度${Math.round(item.confidence * 100)}%)` : "";
      lines.push(`- [${item.kind}:${item.week}] ${item.id}：${item.summary}${confidence}`);
    }
  }
  lines.push("[CONTRADICTIONS]");
  lines.push("[FORBIDDEN INFERENCES]");
  lines.push("- 不得推断其他主体未向本受众公开的信念、承诺、关系或计划。");
  lines.push("- 记忆是主体的认知来源，不等于世界真相；不确定信念必须保留不确定性。");
  return lines.join("\n");
}

function autonomousMemoryProjection(state, principalRef, currentWeek, signals) {
  const memory = recordOf(state);
  const raw = principalRef.slice(principalRef.indexOf(":") + 1);
  const isActor = principalRef.startsWith("actor:");
  const candidates = [];
  const add = (item) => candidates.push({ ...item, summary: shortText(item.summary, 220), tags: strings(item.tags, 32) });
  for (const event of Array.isArray(memory?.events) ? memory.events : []) {
    if (event?.status !== "active") continue;
    const visible = isActor
      ? involved(event.participantIds, raw, principalRef) || involved(event.observerIds, raw, principalRef)
      : (event.organizationIds ?? []).includes(raw) || (event.organizationIds ?? []).includes(principalRef) || (event.participantIds ?? []).includes(principalRef) || (event.observerIds ?? []).includes(principalRef);
    if (visible) add({ id: event.id, kind: "event", week: event.week, importance: event.importance, summary: event.summary, sourceEventId: event.sourceEventId, tags: [...(event.tags ?? []), ...(event.participantIds ?? []), ...(event.observerIds ?? [])], status: event.status });
  }
  for (const belief of Array.isArray(memory?.beliefs) ? memory.beliefs : []) {
    if (!belief?.active || (isActor ? belief.characterId !== raw && belief.characterId !== principalRef : belief.characterId !== principalRef)) continue;
    add({ id: belief.id, kind: "belief", week: belief.validFromWeek, importance: belief.importance, summary: belief.claim, confidence: belief.confidence, sourceEventId: belief.learnedFrom?.sourceId, tags: [belief.claimType, belief.subjectId], status: belief.truthStatus });
  }
  for (const commitment of Array.isArray(memory?.commitments) ? memory.commitments : []) {
    if (commitment?.status !== "active" || (isActor ? !involved(commitment.participantIds, raw, principalRef) : !(commitment.participantIds ?? []).includes(principalRef))) continue;
    add({ id: commitment.id, kind: "commitment", week: commitment.createdWeek, importance: commitment.importance, summary: commitment.summary, sourceEventId: commitment.sourceEventId, tags: [commitment.type, ...(commitment.participantIds ?? [])], status: commitment.status, dueWeek: commitment.dueWeek });
  }
  for (const cause of Array.isArray(memory?.relationshipCauses) ? memory.relationshipCauses : []) {
    if (!cause?.active) continue;
    const refs = [cause.fromCharacterId, cause.toCharacterId];
    if (!(isActor ? refs.some((id) => id === raw || id === principalRef) : refs.includes(principalRef))) continue;
    add({ id: cause.id, kind: "relationship", week: cause.createdWeek, importance: Math.min(1, Math.abs(Number(cause.delta) || 0) / 20 + 0.3), summary: cause.summary, sourceEventId: cause.sourceEventId, tags: [cause.dimension, ...refs], status: Number(cause.delta) >= 0 ? "positive" : "negative" });
  }
  for (const plan of Array.isArray(memory?.plans) ? memory.plans : []) {
    if (!plan || !["active", "blocked"].includes(plan.status)) continue;
    const visible = isActor
      ? plan.ownerId === raw || plan.ownerId === principalRef || involved(plan.participantIds, raw, principalRef)
      : plan.ownerId === raw || plan.ownerId === principalRef || (plan.participantIds ?? []).includes(principalRef);
    if (visible) add({ id: plan.id, kind: "plan", week: plan.createdWeek, importance: plan.importance, summary: `${plan.title}：${plan.objective}；当前步骤：${plan.currentStep}`, sourceEventId: plan.sourceEventIds?.[0], tags: [plan.title, plan.status, plan.ownerId, ...(plan.participantIds ?? [])], status: plan.status, dueWeek: plan.dueWeek });
  }
  const ranked = candidates.map((item) => {
    const age = Math.max(0, currentWeek - Number(item.week || 0));
    let priority = Number(item.importance || 0) + Math.max(0, 1 - age / 24) * 0.35 + signalRelevance(item, signals) * 2;
    if (item.kind === "commitment" && item.dueWeek !== undefined) priority += item.dueWeek <= currentWeek ? 4 : item.dueWeek <= currentWeek + 2 ? 3 : item.dueWeek <= currentWeek + 5 ? 1 : 0;
    if (item.kind === "plan") {
      if (item.status === "blocked") priority += 2.5;
      if (item.dueWeek !== undefined && item.dueWeek <= currentWeek + 2) priority += 2;
    }
    return { item, priority };
  }).sort((left, right) => right.priority - left.priority || Number(right.item.week) - Number(left.item.week) || String(left.item.id).localeCompare(String(right.item.id)));
  const selected = [];
  const selectedIds = new Set();
  const trySelect = (candidate) => {
    if (!candidate || selected.length >= 12 || selectedIds.has(candidate.id)) return;
    if (renderMemory([...selected, candidate]).length > 2_800) return;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  };
  for (const kind of ["commitment", "plan", "relationship", "belief", "event"]) trySelect(ranked.find((candidate) => candidate.item.kind === kind)?.item);
  for (const candidate of ranked) trySelect(candidate.item);
  return {
    text: renderMemory(selected),
    referenceIds: selected.map((item) => item.id),
    sourceEventIds: [...new Set(selected.map((item) => item.sourceEventId).filter(Boolean))],
  };
}

function autonomousProjection(game, principalRef, planningWeek) {
  const kernel = recordOf(game.worldKernel) ?? {};
  const profiles = Array.isArray(game.worldAgents?.profiles) ? game.worldAgents.profiles : [];
  const profile = profiles.find((candidate) => candidate?.ref === principalRef);
  if (!profile) throw new Error("autonomous-profile-missing");
  const entityId = principalRef.slice(principalRef.indexOf(":") + 1);
  const actors = Array.isArray(kernel.actors) ? kernel.actors : [];
  const factions = Array.isArray(kernel.factions) ? kernel.factions : [];
  const projects = Array.isArray(kernel.projects) ? kernel.projects : [];
  const locations = Array.isArray(kernel.locations) ? kernel.locations : [];
  const observations = (Array.isArray(kernel.observations) ? kernel.observations : []).filter((item) => holderCanSee(item, principalRef));
  const observableEventIds = new Set(observations.map((item) => item?.eventId).filter((value) => typeof value === "string"));
  const events = (Array.isArray(kernel.events) ? kernel.events : []).filter((item) => item?.visibility === "public" || observableEventIds.has(item?.id));
  const knowledge = (Array.isArray(kernel.knowledge) ? kernel.knowledge : []).filter((item) => holderCanSee(item, principalRef));
  const relationships = (Array.isArray(game.worldAgents?.socialTies) ? game.worldAgents.socialTies : [])
    .filter((tie) => tie?.sourceRef === principalRef)
    .map((tie) => ({ targetRef: tie.targetRef, familiarity: tie.familiarity, tension: tie.tension, leverage: tie.leverage }));
  const actorIds = new Set(actors.map((actor) => actor?.id).filter((value) => typeof value === "string"));
  const factionIds = new Set(factions.map((faction) => faction?.id).filter((value) => typeof value === "string"));
  const projectIds = new Set(projects.map((project) => project?.id).filter((value) => typeof value === "string"));
  const locationIds = new Set(locations.map((location) => location?.id).filter((value) => typeof value === "string"));
  const perceivedRefs = observations.flatMap((observation) => strings(observation?.perceivedRefs, 32));
  const subjectRefs = knowledge.flatMap((node) => {
    const subject = shortText(node?.subject, 160);
    if (actorIds.has(subject)) return [`actor:${subject}`];
    if (factionIds.has(subject)) return [`faction:${subject}`];
    if (projectIds.has(subject)) return [`project:${subject}`];
    if (locationIds.has(subject)) return [`location:${subject}`];
    if (subject === "player" || subject === "organization") return [subject];
    if (TARGET_REF_PATTERN.test(subject)) return [subject];
    return [];
  });
  const ownedProjects = projects
    .filter((project) => project?.ownerId === entityId && project?.status === "active")
    .sort((left, right) => Number(right?.updatedWeek ?? 0) - Number(left?.updatedWeek ?? 0) || Number(right?.progress ?? 0) - Number(left?.progress ?? 0))
    .slice(0, 4);
  const allowedLocationIds = [...locationIds].filter((id) => id.length <= 256).sort().slice(0, 256);
  const allowedTargetRefs = [...new Set([
    principalRef,
    ...allowedLocationIds.map((id) => `location:${id}`),
    ...relationships.map((relationship) => relationship.targetRef),
    ...perceivedRefs,
    ...subjectRefs,
    ...ownedProjects.map((project) => `project:${project.id}`),
  ])].filter((ref) => {
    if (ref === "player" || ref === "organization") return true;
    if (ref.startsWith("actor:")) return actorIds.has(ref.slice("actor:".length));
    if (ref.startsWith("faction:")) return factionIds.has(ref.slice("faction:".length));
    if (ref.startsWith("project:")) return projectIds.has(ref.slice("project:".length));
    if (ref.startsWith("location:")) return locationIds.has(ref.slice("location:".length));
    return false;
  }).sort().slice(0, 512);
  const knownKnowledgeIds = strings(knowledge.map((node) => node?.id), 12);
  const entity = principalRef.startsWith("actor:")
    ? actors.find((actor) => actor?.id === entityId)
    : factions.find((faction) => faction?.id === entityId);
  const dynamicMemory = autonomousMemoryProjection(game.memory, principalRef, planningWeek, {
    objective: profile.currentObjective,
    nextAction: profile.nextAction,
    relationshipRefs: relationships.map((relationship) => relationship.targetRef),
  });
  const reflection = recordOf(profile.reflection);
  return {
    week: planningWeek,
    agent: {
      planningWeek,
      ref: principalRef,
      kind: principalRef.startsWith("actor:") ? "actor" : "faction",
      displayName: shortText(profile.displayName, 120),
      drives: strings([...(Array.isArray(profile.drives) ? profile.drives : []), ...(Array.isArray(profile.reflection?.driveSignals) ? profile.reflection.driveSignals : [])], 8),
      currentObjective: shortText(profile.currentObjective, 360),
      nextAction: shortText(profile.nextAction, 360),
      riskTolerance: Math.max(0, Math.min(100, Number(profile.riskTolerance) || 0)),
      planningHorizonWeeks: Math.max(1, Math.min(52, Number(profile.planningHorizonWeeks) || 1)),
      reflection: reflection ? {
        version: 1,
        createdWeek: Number(reflection.createdWeek) || 0,
        summary: shortText(reflection.summary, 360),
        conclusions: (Array.isArray(reflection.conclusions) ? reflection.conclusions : []).slice(0, 6).flatMap((item) => {
          const conclusion = recordOf(item);
          return conclusion ? [{ text: shortText(conclusion.text, 240), sourceRefs: strings(conclusion.sourceRefs, 12), sourceEventIds: strings(conclusion.sourceEventIds, 12) }] : [];
        }),
        sourceRefs: strings(reflection.sourceRefs, 24),
        sourceEventIds: strings(reflection.sourceEventIds, 24),
        recommendedObjective: shortText(reflection.recommendedObjective, 360),
        recommendedIntent: shortText(reflection.recommendedIntent, 360),
        recommendationSourceRefs: strings(reflection.recommendationSourceRefs, 16),
        recommendationSourceEventIds: strings(reflection.recommendationSourceEventIds, 16),
        requiredKnowledgeIds: strings(reflection.requiredKnowledgeIds, 16),
        driveSignals: strings(reflection.driveSignals, 8, 120),
      } : null,
      ...(principalRef.startsWith("actor:") ? { locationId: shortText(entity?.locationId, 80) || undefined } : { resources: Number(entity?.resources) || 0 }),
      knownKnowledgeIds,
      allowedTargetRefs,
      allowedLocationIds,
      relationships: relationships.slice(0, 32).map((relationship) => ({ targetRef: shortText(relationship.targetRef, 256), familiarity: Number(relationship.familiarity) || 0, tension: Number(relationship.tension) || 0, leverage: Number(relationship.leverage) || 0 })),
    },
    currentLocation: principalRef.startsWith("actor:") ? (() => {
      const location = locations.find((candidate) => candidate?.id === entity?.locationId);
      return location ? { id: shortText(location.id, 256), name: shortText(location.name, 160), risk: Number(location.risk) || 0, stability: Number(location.stability) || 0, publicMood: shortText(location.publicMood, 240), conditions: strings(location.conditions, 12, 160) } : null;
    })() : null,
    ownedProjects: ownedProjects.map((project) => ({ id: shortText(project.id, 256), title: shortText(project.title, 180), stage: shortText(project.stage, 120), progress: Number(project.progress) || 0, nextMilestone: shortText(project.nextMilestone, 300), blockers: strings(project.blockers, 8, 180) })),
    visibleEvents: events.slice(-8).map(({ id, week, title, detail, locationId, visibility }) => ({ id: shortText(id, 256), week: Number(week) || 0, title: shortText(title, 180), detail: shortText(detail, 600), locationId: shortText(locationId, 256) || undefined, visibility })),
    visibleObservations: observations.slice(-12).map(({ id, week, eventId, channel, text, visibility, perceivedRefs, acquisitionKind }) => ({ id: shortText(id, 256), week: Number(week) || 0, eventId: shortText(eventId, 256), channel: shortText(channel, 120), text: shortText(text, 480), visibility, perceivedRefs: strings(perceivedRefs, 24), acquisitionKind })),
    visibleKnowledge: knowledge.slice(-12).map(({ id, subject, statement, visibility, acquiredWeek }) => ({ id: shortText(id, 256), subject: shortText(subject, 256), statement: shortText(statement, 480), visibility, acquiredWeek: Number(acquiredWeek) || 0 })),
    dynamicMemory: dynamicMemory.text,
    memoryReferenceIds: dynamicMemory.referenceIds,
  };
}

function canonicalProposal(value, projection) {
  const root = recordOf(value);
  const proposal = recordOf(root?.proposal) ?? root;
  if (!proposal || proposal.agentRef !== projection.agent.ref || Number(proposal.planningWeek) !== projection.week) throw new Error("autonomous-proposal-authority-mismatch");
  const disposition = String(proposal.disposition ?? "");
  if (!DISPOSITIONS.has(disposition)) throw new Error("autonomous-proposal-disposition-invalid");
  const intent = shortText(proposal.intent, 360);
  const rationale = shortText(proposal.rationale, 480);
  if (!intent || !rationale) throw new Error("autonomous-proposal-content-invalid");
  const allowedKnowledgeIds = new Set(projection.agent.knownKnowledgeIds);
  const requiredKnowledgeIds = strings(proposal.requiredKnowledgeIds, 16);
  if (requiredKnowledgeIds.some((id) => !allowedKnowledgeIds.has(id))) throw new Error("autonomous-proposal-knowledge-not-authorized");
  const allowedTargetRefs = new Set(projection.agent.allowedTargetRefs);
  const targetRefs = strings(proposal.targetRefs, 12);
  if (targetRefs.some((ref) => !TARGET_REF_PATTERN.test(ref) || !allowedTargetRefs.has(ref))) throw new Error("autonomous-proposal-target-not-authorized");
  const locationId = shortText(proposal.locationId, 80);
  if (locationId && !projection.agent.allowedLocationIds.includes(locationId)) throw new Error("autonomous-proposal-location-not-authorized");
  const allowedMemoryIds = new Set(projection.memoryReferenceIds);
  const usedMemoryIds = strings(proposal.usedMemoryIds, 12);
  if (usedMemoryIds.some((id) => !allowedMemoryIds.has(id))) throw new Error("autonomous-proposal-memory-not-authorized");
  const conditionalOn = shortText(proposal.conditionalOn, 300);
  return {
    version: 1,
    planningWeek: projection.week,
    agentRef: projection.agent.ref,
    disposition,
    intent,
    rationale,
    ...(locationId ? { locationId } : {}),
    targetRefs,
    requiredKnowledgeIds,
    usedMemoryIds,
    planningSource: "model",
    ...(conditionalOn ? { conditionalOn } : {}),
  };
}

function parseModelJson(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("MODEL_EMPTY_RESPONSE");
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? content.trim();
  try { return JSON.parse(fenced); }
  catch { throw new Error("MODEL_RESPONSE_INVALID"); }
}

function deterministicFallback(projection) {
  return {
    version: 1,
    planningWeek: projection.week,
    agentRef: projection.agent.ref,
    disposition: projection.agent.nextAction ? "continue" : "wait",
    intent: projection.agent.nextAction || "本周没有足以改变既定方向的新状态，保持观察。",
    rationale: "主进程在限定重试后使用确定性降级，不制造未经授权的新行动。",
    targetRefs: [],
    requiredKnowledgeIds: [],
    usedMemoryIds: [],
    planningSource: "deterministic-fallback",
    planningIssue: "主进程自治规划在限定重试内未形成合法提案",
  };
}

async function requestAutonomousInference(task, dependencies = {}) {
  if (!task || typeof task !== "object" || Array.isArray(task) || task.task !== "autonomous-planning") throw new Error("invalid-autonomous-inference-task");
  if (Object.keys(task).some((key) => !["task", "config", "autonomousRequest"].includes(key))) throw new Error("invalid-autonomous-inference-task");
  const request = recordOf(task.autonomousRequest);
  if (!request || Object.keys(request).some((key) => !["principalRef", "planningWeek", "baseRevision", "attempt"].includes(key))) throw new Error("invalid-autonomous-inference-request");
  const attempt = Number(request.attempt);
  if (!Number.isInteger(attempt) || attempt < 0 || attempt > 1 || !Number.isInteger(request.baseRevision) || request.baseRevision < 0) throw new Error("invalid-autonomous-inference-request");
  if (typeof dependencies.callRag !== "function" || typeof dependencies.infer !== "function"
    || typeof dependencies.loadAuthorityGame !== "function" || typeof dependencies.readRecordedProposal !== "function"
    || typeof dependencies.recordProposal !== "function") throw new Error("autonomous-inference-dependency-unavailable");
  const game = dependencies.loadAuthorityGame(`world:${request.planningWeek}`, request.baseRevision);
  const derived = deriveAutonomousRagWorkerRequestForGame({ principalRef: request.principalRef, planningWeek: request.planningWeek }, game);
  const projection = autonomousProjection(game, derived.authority.principalRef, request.planningWeek);
  const turnId = `world:${request.planningWeek}`;
  const recorded = dependencies.readRecordedProposal(turnId, request.baseRevision, projection.agent.ref);
  if (recorded) return { content: JSON.stringify({ proposal: recorded }), usage: null };
  const { authority, ...workerRequest } = derived;
  try {
    const response = await dependencies.callRag("search", workerRequest);
    if (!response || response.available !== true || !Array.isArray(response.records)) throw new Error("RAG_GATEWAY_UNAVAILABLE");
    const evidence = exactPromptEvidence(response.records, derived.maxChars);
    const receipt = receiptFor(derived, evidence, response.indexVersion, {
      kind: derived.audience.kind === "faction-private" ? "faction" : "actor",
      principalRef: authority.principalRef,
      knownLoreIds: derived.audience.knownLoreIds,
      topicGrants: derived.audience.topicGrants,
    });
    const repair = attempt ? "\n上一次输出未通过结构校验。请依据同一份主进程投影完整重算，不得扩大主体权限。" : "";
    const user = `为这个主体独立形成同一周起点上的提案。返回：{"proposal":{"planningWeek":${projection.week},"agentRef":"${projection.agent.ref}","disposition":"act|continue|observe|hide|rest|wait","intent":"本周意图","rationale":"只能引用自身可见依据","locationId":"只能取自agent.allowedLocationIds或省略","targetRefs":["只能取自agent.allowedTargetRefs"],"requiredKnowledgeIds":["只能取自agent.knownKnowledgeIds"],"usedMemoryIds":["实际影响提案且只能取自memoryReferenceIds"],"conditionalOn":"仅限本周开始前已经存在的条件命令或省略"}}。结构化 targetRefs 与 locationId 必须逐字取自允许列表；未知目标只能保留在自然语言 intent 中。不要为了热闹强迫主体行动。\n${JSON.stringify({ projection, authorizedKnownLore: evidence.context })}${repair}`;
    if (Buffer.byteLength(user, "utf8") > 64 * 1024) throw new Error("autonomous-prompt-too-large");
    const result = await dependencies.infer({
      task: "autonomous-planning",
      config: task.config,
      system: AUTONOMOUS_SYSTEM,
      user,
      options: {
        json: true,
        maxTokens: 1_100,
        temperature: Math.max(0.55, Math.min(0.92, 0.55 + projection.agent.riskTolerance / 240)),
      },
    });
    let proposal = canonicalProposal(parseModelJson(result?.content), projection);
    const content = JSON.stringify({ proposal });
    assertNoVerbatimLoreLeak(content, evidence.records);
    proposal = dependencies.recordProposal(turnId, request.baseRevision, proposal);
    return {
      content: JSON.stringify({ proposal }),
      usage: result.usage,
      retrieval: {
        receipt,
        selectedCount: receipt.chunkIds.length,
        rejectedCount: Math.max(0, response.records.length - evidence.records.length),
      },
    };
  } catch (error) {
    if (attempt < 1) throw error;
    let proposal = deterministicFallback(projection);
    proposal = dependencies.recordProposal(turnId, request.baseRevision, proposal);
    return { content: JSON.stringify({ proposal }), usage: null };
  }
}

module.exports = {
  AUTONOMOUS_SYSTEM,
  autonomousProjection,
  canonicalProposal,
  requestAutonomousInference,
};
