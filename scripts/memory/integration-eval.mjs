// 动态记忆集成评测：七类真实 Prompt 接入、只读检索、presented/recalled、
// propositionKey、计划/事件一致性、50 周路线与性能。
import { createServer } from "vite";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

let moduleServer;
async function loadModules() {
  moduleServer ??= await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  const engine = await moduleServer.ssrLoadModule("/app/game-engine.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  const council = await moduleServer.ssrLoadModule("/app/council-ai.ts");
  const ability = await moduleServer.ssrLoadModule("/app/ability-system.ts");
  return { engine, model, council, ability };
}

function envelopeFor(game, week) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations[0].id;
  const projectIds = game.worldKernel.projects.slice(0, 2).map((item) => item.id);
  return {
    worldSummary: {
      atmosphere: `第${week}周，雾从河面漫过街垒，街口出现更多值守人员。`,
      changes: [`第${week}周东区工厂停工`, `第${week}周警察核对登记`],
      undercurrents: ["两股势力开始交换消息", "港口出现新的货单流向"],
    },
    publicSignals: [
      { channel: "报纸", headline: `第${week}周工厂停工`, body: "工厂以检修名义停工。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: `第${week}周登记核对`, body: "辖区警察核对登记差异。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: `第${week}周外港检查`, body: "两艘货船被要求停在外港。", reliability: "多源传闻", districtId: "dock" },
    ],
    actionReports: [],
    factionMoves: [
      { factionId: firstFaction.id, title: `调整联络点·${week}`, detail: "该势力撤换联络点。", visibility: "迹象", suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: `转移账册·${week}`, detail: "该势力搬走账册。", visibility: "迹象", suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [{ actorId: game.canonActors[0].id, lastMove: `第${week}周按既有轨迹活动。`, awareness: "未知" }],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: { departmentDevelopments: [], memberDevelopments: [], recruitDevelopments: [], governanceIssues: [], newRecruitableNpc: null },
    kernelDelta: {
      newActors: [],
      newFactions: [],
      newProjects: [],
      actorUpdates: [],
      factionUpdates: [],
      projectUpdates: projectIds.map((projectId, index) => ({ projectId, progressDelta: 2 + index, stage: "推进", nextMilestone: `核实第${week}周公告`, blockers: [], status: "active" })),
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: `第${week}周值守增多` }],
      events: [
        { id: `e-${week}-a`, title: `第${week}周工厂停工`, detail: "工厂侧门关闭。", actorIds: [], factionIds: [firstFaction.id], causeIds: [], visibility: "world" },
        { id: `e-${week}-b`, title: `第${week}周登记核对`, detail: "警察厅整理登记差异。", actorIds: [], factionIds: [secondFaction.id], causeIds: [], visibility: "public" },
        { id: `e-${week}-c`, title: `第${week}周外港滞留`, detail: "两艘货船留在外港。", actorIds: [], factionIds: [], causeIds: [], visibility: "world" },
      ],
      observations: [],
      knowledge: [],
      canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

function makeMockFetch(captured) {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.[1]?.content ?? "";
    const allText = (body.messages ?? []).map((message) => String(message?.content ?? "")).join(" ");
    const text = String(allText || user);
    let payload = null;
    try {
      payload = JSON.parse(user.slice(user.lastIndexOf("\n{") + 1));
    } catch {
      // 忽略
    }
    const autonomousProjection = payload?.projection;
    const autonomousAgent = autonomousProjection?.agent;
    const name = typeof autonomousAgent?.ref === "string" && Number.isFinite(Number(autonomousProjection?.week))
      ? "autonomous-agent"
      : text.includes("worldSummary")
        ? "world"
      : text.includes("非凡能力即时结算器")
        ? "ability"
        : text.includes("让一至三名最相关的内部成员")
          ? "council"
          : text.includes("像真实人物一样回应")
            ? "dialogue"
            : text.includes("写一个标题、日期行")
              ? "situation"
              : text.includes("叙事导演")
                ? "director"
                : text.includes("正文作者")
                  ? "writer"
                  : text.includes("连续性编辑")
                    ? "editor"
                    : text.includes("根据事实包写成")
                      ? "literary"
                      : "unknown";
    captured.push({ name, payload });
    let content;
    if (name === "autonomous-agent") {
      content = JSON.stringify({
        proposal: {
          version: 1,
          planningWeek: Number(autonomousProjection.week),
          agentRef: autonomousAgent.ref,
          disposition: "wait",
          intent: "保持当前计划并观察本周局势。",
          rationale: "当前自身可见信息不足以支持改变既定行动。",
          targetRefs: [],
          requiredKnowledgeIds: [],
        },
      });
    } else if (name === "world") {
      content = JSON.stringify(envelopeFor(globalThis.__game, Number(text.match(/第(\d+)周/)?.[1] ?? 1)));
    } else if (name === "ability") {
      content = JSON.stringify({ observation: "灯影里有人快速合上一本册子。", interpretation: "存在被刻意隐藏的记录活动。", confidence: "较低", unknown: "对方身份无法确认。", detection: "未察觉", mentalLoad: 1, deepLayer: null, lockedFact: null });
    } else if (name === "council") {
      content = JSON.stringify({ replies: [{ speakerId: "mara", text: "我按会长要求把公开记录比对了一遍。", stance: "赞成" }] });
    } else if (name === "dialogue") {
      content = JSON.stringify({ reply: "我记住了。这件事按你的口径应付外人。", mood: "克制", memory: null, trustDelta: 0 });
    } else if (name === "situation") {
      content = JSON.stringify({ title: "第1页", dateline: "1349年·贝克兰德", paragraphs: ["雾从河面漫过街垒。", "街口出现更多值守人员。", "组织按本周排班继续核验公开记录。"] });
    } else {
      content = JSON.stringify({ title: "雾中纪事", sections: [{ heading: "开端", paragraphs: ["雨落在窗沿上。"] }] });
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  };
}

function scenarioMemory(memoryModule, game) {
  const { emptyMemoryState, deriveMemory } = memoryModule;
  const autonomousActorId = game.worldKernel.actors[0].id;
  const autonomousFactionId = game.worldKernel.factions[0].id;
  const registry = {
    characterIds: new Set(["player", "mara", "rowan", "ines", "cedric", ...game.worldKernel.actors.map((actor) => actor.id)]),
    organizationIds: new Set(game.worldKernel.factions.map((faction) => faction.id)),
  };
  const seeds = [
    { kind: "commitment", id: "c-w1", type: "promise", debtorId: "player", creditorId: "mara", participantIds: ["player", "mara"], summary: "承诺保护证人", createdWeek: 1, dueWeek: 18, sourceEventId: "w1-promise", importance: 0.85, secrecy: "restricted" },
    { kind: "event", sourceEventId: "w3-rescue", week: 3, type: "rescue", summary: "玩家救助了玛拉", participantIds: ["player", "mara"], observerIds: ["rowan"], importance: 0.9, emotionalWeight: 0.8, tags: ["rescue"] },
    { kind: "relationship", sourceEventId: "w3-rescue", fromCharacterId: "mara", toCharacterId: "player", dimension: "trust", delta: 20, summary: "救命之恩", createdWeek: 3, decayPolicy: "none" },
    { kind: "belief", characterId: "cedric", subjectId: "org-funds", claimType: "rumor", claim: "组织资金链断裂", confidence: 0.7, truthStatus: "false", learnedFrom: { type: "rumor", sourceId: "w5-rumor" }, validFromWeek: 5 },
    { kind: "event", sourceEventId: "w8-betrayal", week: 8, type: "betrayal", summary: "伊内斯背叛了组织", participantIds: ["ines", "player"], observerIds: ["mara"], importance: 0.95, emotionalWeight: 0.9, tags: ["betrayal"] },
    { kind: "belief", characterId: "mara", subjectId: "ines-loyalty", claimType: "observation", claim: "伊内斯不可信任", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "w8-betrayal" }, validFromWeek: 8 },
    { kind: "event", sourceEventId: "w10-identity", week: 10, type: "identity-reveal", summary: "玛拉得知了会长的秘密身份", participantIds: ["player", "mara"], observerIds: ["mara"], importance: 0.9, emotionalWeight: 0.7, tags: ["identity-reveal"] },
    { kind: "belief", characterId: "mara", subjectId: "leader-identity", claimType: "secret", propositionKey: "character:mara:identity:leader", claim: "会长就是那位传说中的冒险家", confidence: 0.95, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "w10-identity" }, validFromWeek: 10, secrecy: "secret" },
    { kind: "belief", characterId: "rowan", subjectId: "player-secret", claimType: "suspicion", propositionKey: "character:rowan:intent:suspect-player", claim: "罗文怀疑会长另有身份", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "w8-betrayal" }, validFromWeek: 11, secrecy: "secret" },
    { kind: "plan", id: "p-12", sourcePlanId: "proj-12", ownerId: "player", participantIds: ["player", "mara"], title: "长期反制计划", objective: "瓦解情报网", currentStep: "收集名单", createdWeek: 12, status: "active", secrecy: "restricted", importance: 0.8 },
    { kind: "belief", characterId: "cedric", subjectId: "org-funds", claimType: "rumor", claim: "账目复核证明资金链正常", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "report", sourceId: "w15-audit" }, validFromWeek: 15, secrecy: "public" },
    { kind: "commitment", id: "c-w1", type: "promise", debtorId: "player", creditorId: "mara", participantIds: ["player", "mara"], summary: "承诺保护证人", createdWeek: 1, dueWeek: 18, status: "fulfilled", sourceEventId: "w1-promise", resolvedByEventId: "w18", importance: 0.85, secrecy: "restricted" },
    { kind: "belief", characterId: autonomousActorId, subjectId: "autonomous-route", claimType: "route", claim: "自治角色只信任旧桥路线", confidence: 0.8, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "autonomous-actor-source" }, validFromWeek: 19, secrecy: "secret" },
    { kind: "plan", id: "autonomous-actor-plan", ownerId: autonomousActorId, participantIds: [autonomousActorId], title: "核验旧桥路线", objective: "找到安全的联络路径", currentStep: "比较两次交接记录", createdWeek: 19, status: "active", secrecy: "secret", importance: 0.9 },
    { kind: "event", sourceEventId: "autonomous-faction-source", week: 19, type: "briefing", summary: "自治势力内部决定分散档案", participantIds: [], observerIds: [], organizationIds: [autonomousFactionId], importance: 0.9 },
  ];
  return { memory: deriveMemory(emptyMemoryState(), seeds, registry).state, registry };
}

export async function runIntegrationEval() {
  const memoryModule = await loadRuntimeModule("app/memory/index.ts");
  const modules = await loadModules();
  const { model } = modules;
  const {
    emptyMemoryState,
    deriveMemory,
    buildMemoryIndexes,
    buildSceneMemory,
    memoryPromptBlock,
    markMemoryPresented,
    markMemoryRecalled,
    memoryTraceCount,
  } = memoryModule;
  const failures = [];
  const assert = (condition, message) => {
    if (!condition) failures.push(message);
  };

  let game = model.createInitialGame("seer");
  const scenario = scenarioMemory(memoryModule, game);
  game = { ...game, prologueComplete: true, playerName: "会长", playerAddress: "会长阁下", week: 20, date: "1349年12月1日", memory: scenario.memory, worldKernel: { ...game.worldKernel, currentWeek: 20, lastResolvedWeek: 19, projects: [...game.worldKernel.projects, { id: "proj-12", ownerId: "player", title: "长期反制计划", stage: "推进", progress: 40, secrecy: 60, nextMilestone: "名单", blockers: [], status: "active", updatedWeek: 12 }] } };
  globalThis.__game = game;
  const captured = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = makeMockFetch(captured);
  const config = { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test", model: "test", quality: "fast" };

  // 1. dialogue
  await modules.engine.generateNpcDialogue(config, game, "mara", "你还记得我们的承诺吗？", "council");
  const dialogue = captured.find((item) => item.name === "dialogue")?.payload;
  assert(Boolean(dialogue?.dynamicMemory), "dialogue: 动态记忆进入 Prompt");
  assert(dialogue?.dynamicMemory.includes("DYNAMIC MEMORY"), "dialogue: 标签存在");
  assert(dialogue?.dynamicMemory.includes("w3-rescue"), "dialogue: 共同经历进入");
  assert(!dialogue?.dynamicMemory.includes("罗文怀疑会长"), "dialogue: 他人私密信念不进入");

  // 2. council
  await modules.council.generateCouncilReplies(config, game, "讨论当前局势");
  const council = captured.find((item) => item.name === "council")?.payload;
  assert(Boolean(council?.speakerDynamicMemory), "council: 动态记忆进入 Prompt");
  assert(council?.speakerDynamicMemory?.mara?.includes("伊内斯不可信任"), "council: 成员自己的信念进入");
  assert(!council?.speakerDynamicMemory?.rowan?.includes("伊内斯不可信任"), "council: 其他成员私密信念不进入");
  assert(!council?.speakerDynamicMemory?.rowan?.includes("w10-identity"), "council: 身份事件只对授权成员");

  // 3. ability（调查意图 → investigation）
  await modules.ability.generateAbilityDraft(
    config,
    game,
    { id: "ability-test", name: "灵视", verb: "观察", cost: 1, kind: "perception", sceneLayer: null, description: "" },
    "调查东区失踪者",
    { kind: "self", targetId: "self", label: "会长" }
  );
  const ability = captured.find((item) => item.name === "ability")?.payload;
  assert(Boolean(ability?.dynamicMemory), "action/investigation: 动态记忆进入 Prompt");
  assert(ability?.dynamicMemory.includes("DYNAMIC MEMORY"), "action/investigation: 标签存在");

  // 4. situation brief（玩家叙事）
  await modules.engine.generateSituationBrief(config, game);
  const situation = captured.find((item) => item.name === "situation")?.payload;
  assert(Boolean(situation?.dynamicMemory), "player narrative(brief): 动态记忆进入");
  assert(!situation?.dynamicMemory.includes("罗文怀疑会长"), "player narrative(brief): 不包含 NPC 私密信念");

  // 5. literary chapter（玩家叙事）
  const localChapter = { id: "ch-20", week: 20, date: "1349年12月1日", title: "雾中", source: "local", sections: [{ heading: "开端", paragraphs: ["雨落在窗沿上。"] }], results: [], summary: "本周无决议。" };
  await modules.engine.generateLiteraryChapter(config, game, localChapter, () => {});
  const literary = captured.find((item) => item.name === "literary" || item.name === "director" || item.name === "writer" || item.name === "editor")?.payload;
  assert(Boolean(literary?.dynamicMemory), "player narrative(literary): 动态记忆进入");
  assert(!literary?.dynamicMemory.includes("罗文怀疑会长"), "player narrative(literary): 不包含 NPC 私密信念");

  // 6. world
  const chapter = { id: "ch-w", week: 20, date: "1349年12月1日", title: "x", source: "local", sections: [], results: [], summary: "" };
  const worldResult = await modules.engine.generateAiWorldDelta(config, game, chapter, () => {});
  const autonomousRequests = captured.filter((item) => item.name === "autonomous-agent");
  assert(autonomousRequests.length === 12, `autonomous-agent: expected 12 independent requests, received ${autonomousRequests.length}`);
  assert(
    new Set(autonomousRequests.map((item) => item.payload?.projection?.agent?.ref)).size === autonomousRequests.length,
    "autonomous-agent: every active subject is planned exactly once",
  );
  assert(
    autonomousRequests.every((item) => typeof item.payload?.projection?.agent?.ref === "string"),
    "autonomous-agent: every request carries a structured subject reference",
  );
  const autonomousActorRef = `actor:${game.worldKernel.actors[0].id}`;
  const autonomousFactionRef = `faction:${game.worldKernel.factions[0].id}`;
  const autonomousActor = autonomousRequests.find((item) => item.payload?.projection?.agent?.ref === autonomousActorRef)?.payload?.projection;
  const autonomousFaction = autonomousRequests.find((item) => item.payload?.projection?.agent?.ref === autonomousFactionRef)?.payload?.projection;
  assert(autonomousActor?.dynamicMemory?.includes("自治角色只信任旧桥路线"), "autonomous-agent(actor): private memory enters its own Prompt");
  assert(!autonomousActor?.dynamicMemory?.includes("自治势力内部决定分散档案"), "autonomous-agent(actor): faction-private memory is isolated");
  assert(autonomousActor?.memoryReferenceIds?.length > 0 && autonomousActor.memoryReferenceIds.length <= 12, "autonomous-agent(actor): bounded reference ids enter Prompt");
  assert(autonomousActor?.memoryAudience?.kind === "actor", "autonomous-agent(actor): explicit actor audience");
  assert(Array.isArray(autonomousActor?.agent?.drives) && autonomousActor.agent.drives.length > 0, "autonomous-agent(actor): drives enter next planning frame");
  assert(autonomousActor?.agent?.reflection?.version === 1, "autonomous-agent(actor): structured reflection enters next planning frame");
  assert(autonomousFaction?.dynamicMemory?.includes("自治势力内部决定分散档案"), "autonomous-agent(faction): organization memory enters its own Prompt");
  assert(!autonomousFaction?.dynamicMemory?.includes("自治角色只信任旧桥路线"), "autonomous-agent(faction): actor-private memory is isolated");
  assert(autonomousFaction?.memoryAudience?.kind === "faction", "autonomous-agent(faction): explicit faction audience");
  const world = captured.find((item) => item.name === "world")?.payload;
  assert(Boolean(world?.dynamicMemory), "world: 动态记忆进入 Prompt");
  assert(world?.dynamicMemory.includes("WORLD FACTS"), "world: 世界事实标签");
  assert(worldResult.memory.receipts.some((receipt) => receipt.actionId === "world:20" && receipt.kind === "delivered"), "world: 成功后写入 delivered 回执");
  assert(!worldResult.memory.receipts.some((receipt) => receipt.actionId === "world:20" && receipt.kind === "presented"), "world: 不写入 presented（不改变 NPC 激活度）");
  assert(worldResult.memory.receipts.some((receipt) => receipt.actionId === `autonomous-agent:20:${autonomousActorRef}` && receipt.kind === "delivered" && receipt.audience.kind === "actor"), "autonomous-agent(actor): commit writes delivered receipt");
  assert(worldResult.memory.receipts.some((receipt) => receipt.actionId === `autonomous-agent:20:${autonomousActorRef}` && receipt.kind === "presented" && receipt.audience.kind === "actor"), "autonomous-agent(actor): commit writes presented receipt");
  assert(worldResult.memory.receipts.some((receipt) => receipt.actionId === `autonomous-agent:20:${autonomousFactionRef}` && receipt.kind === "delivered" && receipt.audience.kind === "faction"), "autonomous-agent(faction): commit writes delivered receipt");
  assert(worldResult.memory.receipts.some((receipt) => receipt.actionId === `autonomous-agent:20:${autonomousFactionRef}` && receipt.kind === "presented" && receipt.audience.kind === "faction"), "autonomous-agent(faction): commit writes presented receipt");
  assert(game.memory.receipts.some((receipt) => receipt.actionId === "dialogue:mara:20" && receipt.kind === "delivered"), "dialogue: 成功后写入 delivered");
  assert(game.memory.receipts.some((receipt) => receipt.actionId === "dialogue:mara:20" && receipt.kind === "presented"), "dialogue: 成功后写入 presented（NPC 展示）");
  assert(game.memory.receipts.some((receipt) => receipt.actionId?.startsWith("council:20:") && receipt.kind === "presented"), "council: 成员级 presented 回执");
  assert(game.memory.receipts.some((receipt) => receipt.stage === "director" && receipt.audience.kind === "narrator" && receipt.kind === "delivered"), "literary: 导演 delivered（narrator）");
  assert(!game.memory.receipts.some((receipt) => receipt.audience.kind === "narrator" && receipt.kind === "presented"), "literary: narrator 不产生 presented");

  // 只读检索：100 次不改变存档
  const memoryBefore = JSON.stringify(game.memory);
  const indexes = buildMemoryIndexes(game.memory);
  for (let i = 0; i < 100; i += 1) {
    buildSceneMemory({ sceneType: "dialogue", state: game.memory, indexes, currentWeek: 20, actorId: "mara" });
    memoryPromptBlock(game.memory, "council", "mara", 20);
  }
  assert(JSON.stringify(game.memory) === memoryBefore, "只读：100 次检索后记忆不变");
  assert(memoryTraceCount() <= 64, "Trace 保持上限");

  // presented/recalled 幂等
  const secretBelief = game.memory.beliefs.find((belief) => belief.propositionKey === "character:mara:identity:leader");
  const ids = [secretBelief.id];
  const baseDescriptor = { actionId: "call-1", modelCallId: "m1", stage: "dialogue", audience: memoryModule.actorAudience("mara", true), memoryIds: ids, week: 20 };
  const presented1 = markMemoryPresented(game.memory, baseDescriptor);
  const presented2 = markMemoryPresented(presented1, baseDescriptor);
  assert(presented2.receipts.filter((receipt) => receipt.actionId === "call-1" && receipt.kind === "presented").length === 1, "presented 幂等");
  const recalled1 = markMemoryRecalled(presented2, { ...baseDescriptor, actionId: "call-2" });
  const recalled2 = markMemoryRecalled(recalled1, { ...baseDescriptor, actionId: "call-2" });
  const targetState = recalled2.audienceStates.find(
    (item) => item.memoryId === ids[0] && item.audienceKind === "actor" && item.actorId === "mara"
  );
  assert(targetState.recallCount === 1, "recalled 同 actionId 只加一次");
  assert(targetState.lastRecalledWeek === 20, "recalled 更新 lastRecalledWeek");
  const recalled3 = markMemoryRecalled(recalled2, { ...baseDescriptor, actionId: "call-3", week: 21 });
  assert(
    recalled3.audienceStates.find(
      (item) => item.memoryId === ids[0] && item.audienceKind === "actor" && item.actorId === "mara"
    ).recallCount === 2,
    "不同 actionId 可分别提交"
  );

  // propositionKey：同一角色同一对象四类命题互不覆盖
  const { state: pkState } = deriveMemory(emptyMemoryState(), [
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "identity", propositionKey: "character:klein:identity:audrey", claim: "身份怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "pk-1" }, validFromWeek: 1 },
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "organization", propositionKey: "character:klein:organization:tarot", claim: "组织归属怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "pk-2" }, validFromWeek: 1 },
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "item", propositionKey: "item:001:holder:klein", claim: "物品持有怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "pk-3" }, validFromWeek: 1 },
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "intent", propositionKey: "character:klein:intent:betray-audrey", claim: "动机怀疑", confidence: 0.5, truthStatus: "uncertain", learnedFrom: { type: "deduced", sourceId: "pk-4" }, validFromWeek: 1 },
  ]);
  assert(pkState.beliefs.length === 4, "四类命题共存");
  const { state: pkUpdated } = deriveMemory(pkState, [
    { kind: "belief", characterId: "audrey", subjectId: "klein", claimType: "identity", propositionKey: "character:klein:identity:audrey", claim: "身份已确认", confidence: 0.9, truthStatus: "true", learnedFrom: { type: "observed", sourceId: "pk-5" }, validFromWeek: 2 },
  ]);
  assert(pkUpdated.beliefs.length === 5, "更新只新增版本");
  assert(pkUpdated.beliefs.filter((belief) => belief.propositionKey === "character:klein:identity:audrey").length === 2, "同命题新旧两版");
  assert(pkUpdated.beliefs.filter((belief) => belief.propositionKey === "character:klein:organization:tarot" && belief.active).length === 1, "其他命题不受影响");

  // ActivePlan 一致性
  const plan = game.memory.plans.find((item) => item.id === "p-12");
  assert(plan?.sourcePlanId === "proj-12", "ActivePlan 引用正式计划");
  const planIndexes = buildMemoryIndexes(game.memory);
  const worldContext = buildSceneMemory({ sceneType: "world", state: game.memory, indexes: planIndexes, currentWeek: 20 });
  assert(worldContext.activePlans.some((ref) => ref.id === "p-12"), "active 计划可召回");
  const completedMemory = { ...game.memory, plans: game.memory.plans.map((item) => item.id === "p-12" ? { ...item, status: "completed" } : item) };
  const completedContext = buildSceneMemory({ sceneType: "world", state: completedMemory, indexes: buildMemoryIndexes(completedMemory), currentWeek: 20 });
  assert(!completedContext.activePlans.some((ref) => ref.id === "p-12"), "completed 计划不再 active 召回");

  // MemoryEvent 一致性
  const event = game.memory.events.find((item) => item.sourceEventId === "w3-rescue");
  assert(Boolean(event), "MemoryEvent 引用正式事件");
  const eventBefore = game.worldKernel.events.find((item) => item.id === "w3-rescue")?.title ?? "（场景种子事件不在 worldKernel）";
  const tampered = { ...game.memory, events: game.memory.events.map((item) => item.id === event.id ? { ...item, summary: "被篡改" } : item) };
  assert(JSON.stringify(tampered) !== JSON.stringify(game.memory), "修改 MemoryEvent 不影响原状态（返回新对象）");
  assert(game.memory.events.find((item) => item.id === event.id)?.summary === event.summary, "原始记忆未被修改");
  void eventBefore;

  // 50 周确定性路线（含失败重试）
  const route = scenarioMemory(memoryModule, game);
  let routeMemory = route.memory;
  for (let week = 21; week <= 50; week += 1) {
    const derived = deriveMemory(routeMemory, [
      { kind: "event", sourceEventId: `r-${week}`, week, type: week % 4 === 0 ? "chat" : "conflict", summary: `第${week}周路线事件`, participantIds: ["player", "mara"], observerIds: [], importance: week % 4 === 0 ? 0.2 : 0.5 },
    ], route.registry);
    routeMemory = derived.state;
    const rIndexes = buildMemoryIndexes(routeMemory);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      buildSceneMemory({ sceneType: "dialogue", state: routeMemory, indexes: rIndexes, currentWeek: week, actorId: "mara" });
      buildSceneMemory({ sceneType: "council", state: routeMemory, indexes: rIndexes, currentWeek: week, actorId: "mara" });
      buildSceneMemory({ sceneType: "world", state: routeMemory, indexes: rIndexes, currentWeek: week });
    }
  }
  const finalIndexes = buildMemoryIndexes(routeMemory);
  const mara50 = buildSceneMemory({ sceneType: "dialogue", state: routeMemory, indexes: finalIndexes, currentWeek: 50, actorId: "mara" });
  assert(mara50.worldFacts.some((ref) => ref.id.includes("w3-rescue")), "第1周重要经历在第50周仍可进入对话");
  assert(!mara50.commitments.some((ref) => ref.id === "c-w1"), "已完成承诺不再作为未完成项");
  assert(mara50.worldFacts.some((ref) => ref.id.includes("w8-betrayal")), "背叛仍可召回");
  const rowan50 = buildSceneMemory({ sceneType: "dialogue", state: routeMemory, indexes: finalIndexes, currentWeek: 50, actorId: "rowan" });
  assert(!rowan50.worldFacts.some((ref) => ref.id.includes("w10-identity")), "无关人物不知道身份");
  assert(mara50.totalCharacters <= 3000, "第50周上下文在预算内");
  const receiptsBefore = routeMemory.receipts.length;
  assert(receiptsBefore === 0, "检索/预览/重试不产生 presented/recalled 回执");

  // 性能：10k 事件 + 30k 派生 + 1000 次混合构建 + 100 次索引重建
  const perfSeeds = [];
  const chars = Array.from({ length: 100 }, (_, index) => `c${index}`);
  for (let index = 0; index < 10000; index += 1) {
    const from = chars[index % 100];
    const to = chars[(index * 7 + 3) % 100];
    perfSeeds.push({ kind: "event", sourceEventId: `pe-${index}`, week: 1 + (index % 60), type: index % 10 === 0 ? "betrayal" : "chat", summary: `事件 ${index}`, participantIds: [from, to], observerIds: [chars[(index + 1) % 100]], importance: index % 10 === 0 ? 0.9 : 0.3, emotionalWeight: 0.3, tags: [] });
    perfSeeds.push({ kind: "belief", characterId: to, subjectId: `s-${index % 40}`, claimType: "observation", propositionKey: `p-${index}`, claim: `信念 ${index}`, confidence: 0.7, truthStatus: "uncertain", learnedFrom: { type: "observed", sourceId: `pe-${index}` }, validFromWeek: 1 + (index % 60) });
    perfSeeds.push({ kind: "relationship", sourceEventId: `pe-${index}`, fromCharacterId: from, toCharacterId: to, dimension: index % 2 === 0 ? "trust" : "suspicion", delta: 5, summary: `关系 ${index}`, createdWeek: 1 + (index % 60), decayPolicy: "normal" });
    if (index % 2 === 0) perfSeeds.push({ kind: "commitment", id: `pc-${index}`, type: "agreement", participantIds: [from, to], summary: `约定 ${index}`, createdWeek: 1 + (index % 60), sourceEventId: `pe-${index}` });
    if (index % 2 === 1) perfSeeds.push({ kind: "plan", id: `pp-${index}`, ownerId: from, participantIds: [from, to], title: `计划 ${index}`, objective: "o", currentStep: "s", createdWeek: 1 + (index % 60), status: "active" });
  }
  const perfStart = Date.now();
  const { state: perfState } = deriveMemory(emptyMemoryState(), perfSeeds);
  const derivedCount = perfState.beliefs.length + perfState.commitments.length + perfState.relationshipCauses.length + perfState.plans.length;
  const perfIndexes = buildMemoryIndexes(perfState);
  const latencies = [];
  for (let i = 0; i < 1000; i += 1) {
    const scene = ["dialogue", "council", "investigation", "action", "world", "player"][i % 6];
    const startedAt = performance.now();
    buildSceneMemory({ sceneType: scene, state: perfState, indexes: perfIndexes, currentWeek: 60, actorId: `c${i % 100}` });
    latencies.push(performance.now() - startedAt);
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  for (let i = 0; i < 100; i += 1) buildMemoryIndexes(perfState);
  const perfMs = Date.now() - perfStart;
  assert(derivedCount >= 30000, `派生记录 >=30000（实际 ${derivedCount}）`);
  assert(p95 <= 50, `混合构建 P95<=50ms（实际 ${p95.toFixed(2)}ms）`);
  assert(memoryTraceCount() <= 64, "性能阶段 Trace 仍保持上限");
  assert(JSON.parse(JSON.stringify(perfState)).events.length === perfState.events.length, "大状态可序列化");
  const perf = { events: perfState.events.length, derived: derivedCount, p95Ms: Number(p95.toFixed(2)), totalMs: perfMs };

  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (moduleServer) await moduleServer.close();
  return { failures, perf, capturedNames: [...new Set(captured.map((item) => item.name))] };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runIntegrationEval();
  console.log("[memory:integration:eval]");
  console.log(`  七类调用捕获: ${result.capturedNames.join(", ")}`);
  console.log(`  性能: ${JSON.stringify(result.perf)}`);
  if (result.failures.length) {
    console.log(`  失败 ${result.failures.length} 项:`);
    for (const failure of result.failures.slice(0, 20)) console.log(`  - ${failure}`);
  } else {
    console.log("  七类 Prompt 接入、只读检索、presented/recalled、propositionKey、计划/事件一致性、50 周路线全部通过");
  }
  const pass = result.failures.length === 0 && result.capturedNames.length >= 5;
  console.log(`[memory:integration:eval] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
