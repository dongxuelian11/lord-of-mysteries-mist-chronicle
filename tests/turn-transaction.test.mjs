import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

let moduleServer;

async function loadGameModules() {
  moduleServer ??= await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  const engine = await moduleServer.ssrLoadModule("/app/game-engine.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  return { engine, model };
}

after(async () => { if (moduleServer) await moduleServer.close(); });

function worldEnvelope(game, chapter) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations[0].id;
  return {
    worldSummary: {
      atmosphere: "清晨的报童比往常更早穿过街口，几处工厂同时收紧门禁，而警察厅开始逐户核对近期失踪人口。",
      changes: ["工厂收紧门禁", "警察厅核对失踪人口", "码头货运延迟"],
      undercurrents: ["两个互不相识的办事人正在追查同一本名册"],
    },
    publicSignals: [
      { channel: "报纸", headline: "东区工厂临时停工", body: "三家工厂以锅炉检修为由临时停工，工人被要求在门外等待新的排班通知。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅核对失踪人口", body: "辖区警察开始询问近期离开住所却没有向房东说明去向的住客。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "码头货运延迟", body: "两班原定清晨入港的货船被要求停在外港，卸货时间没有得到解释。", reliability: "多源传闻", districtId: "dock" },
    ],
    actionReports: [],
    factionMoves: [
      { factionId: firstFaction.id, title: "转移联络点", detail: "该势力撤掉一处已使用多周的联络点，并把文书分散交给三名信使。", visibility: "迹象", suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: "核对旧档案", detail: "该势力调取旧人口档案，与近期慈善救济名册进行交叉核对。", visibility: "获知", suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: { departmentDevelopments: [], memberDevelopments: [], recruitDevelopments: [], governanceIssues: [], newRecruitableNpc: null },
    kernelDelta: {
      newActors: [], newFactions: [], newProjects: [], actorUpdates: [], factionUpdates: [],
      projectUpdates: [{ projectId: game.worldKernel.projects[0].id, progressDelta: 2, stage: "继续推进", nextMilestone: "取得下一项可核验结果", blockers: [], status: "active" }],
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: "街口出现更多巡警" }],
      events: [
        { id: `event-${chapter.week}-a`, title: "临时停工", detail: "东区三家工厂同时关闭侧门。", locationId: "east", actorIds: [], factionIds: [firstFaction.id], causeIds: [], visibility: "world" },
        { id: `event-${chapter.week}-b`, title: "人口核对", detail: "警察厅开始整理失踪人口登记。", locationId: "cherwood", actorIds: [], factionIds: [secondFaction.id], causeIds: [], visibility: "public" },
        { id: `event-${chapter.week}-c`, title: "外港等待", detail: "两艘货船被留在外港等待检查。", locationId: "dock", actorIds: [], factionIds: [], causeIds: [], visibility: "public" },
      ],
      observations: [], knowledge: [], canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

test("closing a council week commits an independently advanced world snapshot", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, resolveWeek } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const resolved = resolveWeek(game);
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }),
  });
  try {
    const committed = await generateAiWorldDelta(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      resolved.state,
      resolved.chapter,
      () => {},
    );
    assert.equal(committed.worldSnapshots[0].week, resolved.chapter.week);
    assert.equal(committed.worldSnapshots[0].eventIds.length, 3);
    assert.ok(committed.worldKernel.events.some((event) => event.title === "临时停工"));
    assert.equal(committed.worldSignals.length, 3);
    assert.ok(committed.worldLedger.events.some((event) => event.kind === "week-committed"));
    assert.equal(committed.worldLedger.snapshots.at(-1).week, committed.week);
    assert.equal(committed.worldAgents.lastPlannedWeek, resolved.chapter.week);
    assert.ok(committed.worldAgents.profiles.length >= committed.worldKernel.actors.length + committed.worldKernel.factions.length);
    assert.equal(committed.factionStrategy.lastResolvedWeek, resolved.chapter.week);
    assert.ok(committed.factionStrategy.outcomes.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("AI organization prose cannot double-apply rule-owned numeric consequences", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, resolveWeek } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const resolved = resolveWeek(game);
  const department = resolved.state.departments[0];
  const member = resolved.state.members[0];
  const candidate = resolved.state.recruitPool[0];
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.organizationDelta = {
    departmentDevelopments: [{ departmentId: department.id, report: "负责人发现本周交接记录出现两次迟到，但尚未越过授权边界。", cause: "本周部门运转", capacityDelta: -5, cohesionDelta: -4, exposureDelta: 5, backlogDelta: 8 }],
    memberDevelopments: [{ memberId: member.id, observation: "他在散会后独自核对了两遍门锁。", cause: "本周压力", pressureDelta: 7, trustDelta: -2 }],
    recruitDevelopments: [{ memberId: candidate.id, observation: "候选人推迟了下一次见面。", momentumDelta: -8, trustDelta: -2 }],
    governanceIssues: [], newRecruitableNpc: null,
  };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }) });
  try {
    const committed = await generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    assert.equal(committed.departments.find((item) => item.id === department.id).capacity, department.capacity);
    assert.equal(committed.departments.find((item) => item.id === department.id).backlog, department.backlog);
    assert.equal(committed.members.find((item) => item.id === member.id).personalPressure, member.personalPressure);
    assert.equal(committed.members.find((item) => item.id === member.id).trust, member.trust);
    assert.equal(committed.recruitPool.find((item) => item.id === candidate.id).relationshipMomentum, candidate.relationshipMomentum);
    assert.ok(committed.departmentReports.some((item) => item.headline.includes("交接记录")));
    assert.ok(committed.members.find((item) => item.id === member.id).personalEventSignals.includes("他在散会后独自核对了两遍门锁。"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("AI action reports replace provisional rule notes with world-specific observations", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const contract = localContract({ intent: "让外勤组在雨夜观察旧剧院侧门的出入规律，只记录可以复核的时间与衣着，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const result = resolved.chapter.results[0];
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.actionReports = [{
    actionId: result.id,
    fieldReport: "雨从九点后逐渐变密。执行者始终留在街对面的有轨马车候车棚，没有进入剧院。",
    observableFacts: ["九点十七分，一名戴灰呢帽的人从侧门离开。", "十点零四分，同一把缺少一根伞骨的黑伞再次出现在侧门。"],
    followUp: "可以核对附近车夫是否在相同时间搭载过持黑伞的乘客。",
  }];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }) });
  try {
    const committed = await generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {});
    const committedResult = committed.chronicle.find((chapter) => chapter.id === resolved.chapter.id).results[0];
    assert.deepEqual(committedResult.findings, envelope.actionReports[0].observableFacts);
    assert.match(committedResult.reasons.join(" "), /有轨马车候车棚/);
    assert.ok(committedResult.futureChanges.includes(envelope.actionReports[0].followUp));
    assert.ok(committed.evidenceNodes.some((node) => node.summary.includes("缺少一根伞骨")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("a named Beyonder and the player can each lead only one formal action per week", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, scheduleContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("seer");
  const first = localContract({ intent: "整理公开报纸", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  const occupied = { ...game, schedule: [scheduleContract(game, first)] };
  const second = localContract({ intent: "继续核对另一份报纸", game: occupied, leaderId: first.leaderId, districtId: "east", abilityIds: [] });
  assert.throws(() => scheduleContract(occupied, second), /每名具名非凡者每周只能承担一项正式行动/);

  const playerFirst = localContract({ intent: "我亲自查看街区", game, leaderId: "player", districtId: "cherwood", abilityIds: [] });
  const playerGame = { ...game, schedule: [scheduleContract(game, playerFirst)] };
  const playerSecond = localContract({ intent: "我亲自参加另一项行动", game: playerGame, leaderId: "player", districtId: "east", abilityIds: [] });
  assert.throws(() => scheduleContract(playerGame, playerSecond), /每名具名非凡者每周只能承担一项正式行动/);
  assert.equal(playerFirst.executionMode, "player-led");
});

test("a branch supervisor cannot also take a headquarters formal action", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, scheduleContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("seer");
  const supervisor = game.members.find((member) => member.pathway) ?? game.members[0];
  const withBranch = { ...game, management: { ...game.management, branches: [{ id: "branch", name: "测试分部", districtId: "cherwood", blockId: "block", supervisorId: supervisor.id, stationedManpower: 4, stationedBeyonderIds: [supervisor.id], policy: "intelligence", status: "active", controlSupport: 3, warningRefs: [] }] } };
  const contract = localContract({ intent: `让${supervisor.name}核对公开档案`, game: withBranch, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  assert.throws(() => scheduleContract(withBranch, contract), /正驻守“测试分部”/);
});

test("player scope and explicit bans survive contract parsing and reject narrative overreach", async () => {
  const { engine, model } = await loadGameModules();
  const { actionTextBoundaryIssue, localContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const contract = localContract({
    intent: "请情报负责人只整理本周报纸与公开失踪记录，比较来源矛盾，不接触任何人，也不使用黑玻璃挂坠。",
    game,
    leaderId: "organization",
    districtId: "cherwood",
    abilityIds: [],
  });
  assert.match(contract.redLines, /不接触任何人/);
  assert.match(contract.redLines, /不使用黑玻璃挂坠/);
  assert.equal(contract.leaderId, "ines");
  assert.match(actionTextBoundaryIssue("伊妮丝前往档案室询问书记员，并触碰黑玻璃挂坠。", game, contract), /越过/);
  assert.equal(actionTextBoundaryIssue("伊妮丝在事务所内比对两份公开报纸和警察厅通告。", game, contract), null);
});

test("negated compliant phrasing does not trigger red-line rejection", async () => {
  const { engine, model } = await loadGameModules();
  const { actionTextBoundaryIssue, localContract } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const contract = localContract({ intent: "只整理本周报纸与公开失踪记录，不接触任何人，也不使用黑玻璃挂坠。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  assert.equal(actionTextBoundaryIssue("伊妮丝没有接触任何人，没有使用黑玻璃挂坠，只留在事务所内比对公开报纸。", game, contract), null);
  assert.equal(actionTextBoundaryIssue("伊妮丝未进入任何档案室，只在门外记录了出入时间。", game, contract), null);
  assert.ok(actionTextBoundaryIssue("伊妮丝前往档案室询问书记员，并触碰黑玻璃挂坠。", game, contract));
});

test("a decision draft naming a member routes leadership to that member and dedupes red lines", async () => {
  const { engine, model } = await loadGameModules();
  const { interpretIntentWithAi } = engine;
  const { createInitialGame } = model;
  const game = createInitialGame("spectator");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "调查 · 公开报纸",
      kind: "调查",
      target: "公开报纸",
      desiredOutcome: "查明登记变化",
      approach: "只整理公开资料",
      days: 2,
      budget: 18,
      risk: "低",
      knownFacts: "",
      hypothesis: "",
      unknowns: "",
      redLines: "红线：不得接触任何人；不得接触任何人",
      retreat: "若被注意则立即中止",
    }) } }] }),
  });
  try {
    const contract = await interpretIntentWithAi(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      { intent: "让伊妮丝·科尔只整理公开报纸与失踪记录，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] },
    );
    assert.equal(contract.leaderId, "ines");
    const touched = contract.redLines.split(/[；;]/).filter((part) => part.includes("不得接触任何人"));
    assert.equal(touched.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("the world turn refuses an AI field report that crosses the player's red lines", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const contract = localContract({ intent: "请情报负责人只整理本周报纸与公开失踪记录，不接触任何人。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const envelope = worldEnvelope(resolved.state, resolved.chapter);
  envelope.actionReports = [{ actionId: resolved.chapter.results[0].id, fieldReport: "伊妮丝进入档案室询问书记员，并抄走了一份内部名册。", observableFacts: ["书记员确认三人参加过夜班。", "内部名册记录了一处夜班集合点。"], followUp: "继续盘问工头。" }];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }) });
  try {
    await assert.rejects(() => generateAiWorldDelta({ provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" }, resolved.state, resolved.chapter, () => {}), /越过/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("the local rules ledger does not invent narrative evidence before AI world adjudication", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("seer");
  const contract = localContract({ intent: "调查一名从未在预设案件中出现过的钟表匠，确认他每周三去了哪里。", game, leaderId: "organization", districtId: "west", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  const findings = resolved.chapter.results[0].findings;
  assert.ok(findings.every((item) => item.startsWith("[规则结算]")));
  assert.doesNotMatch(findings.join(" "), /固定停留点|人员或物流联系|改变说法|反调查开始|档案员核对了登记时间/);
});

test("an action advances only the pressure mission it actually addresses", async () => {
  const { engine, model } = await loadGameModules();
  const { localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("seer");
  game.missions.push({ id: "unrelated-gala", title: "迟到的宴会请柬", premise: "一张没有署名的宴会请柬被送到公开事务所。", deadline: 4, urgency: 40, progress: 11, consequence: "邀请人会转而接触其他组织。", hints: ["核对请柬火漆", "询问宴会承办人"], state: "active" });
  const openingMission = game.missions.find((item) => item.state === "active");
  const beforeFirst = openingMission.progress;
  const beforeUnrelated = game.missions.find((item) => item.id === "unrelated-gala").progress;
  const contract = localContract({ intent: "核对名单上的地址是否真实，只做公开登记比对，不进入室内。", game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
  game = { ...game, schedule: [scheduleContract(game, contract)] };
  const resolved = resolveWeek(game);
  assert.ok(resolved.state.missions.find((item) => item.id === openingMission.id).progress > beforeFirst);
  assert.equal(resolved.state.missions.find((item) => item.id === "unrelated-gala").progress, beforeUnrelated);
});
