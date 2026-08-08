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

const WEEK_VARIANTS = {
  2: {
    atmosphere: "清晨的雾比往常更浓，工厂烟囱排出的黑烟在街口凝成水珠，报童的喊声比平时更早。",
    signals: [
      { channel: "报纸", headline: "东区三家工厂同时停工", body: "三家工厂以锅炉检修为由停工，工人被挡在门外等待新的排班通知，门口聚集了打听消息的人。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅开始核对失踪人口", body: "辖区警察开始询问近期离开住所却没有向房东说明去向的住客，登记本新增三页。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "外港货船等待检查", body: "两班原定清晨入港的货船被要求停在外港，卸货时间没有得到解释。", reliability: "多源传闻", districtId: "dock" },
    ],
    moves: [
      { title: "撤换联络点", detail: "该势力撤掉一处已使用多周的联络点，并把文书分散交给三名信使。", visibility: "迹象" },
      { title: "交叉核对救济名册", detail: "该势力调取旧人口档案，与近期慈善救济名册进行交叉核对。", visibility: "获知" },
    ],
    canon: "在约定的钟楼下会见了旧识，谈话内容没有第三人在场。",
    events: [
      { id: "e-a", title: "工厂停工", detail: "东区三家工厂同时关闭侧门，工人被要求在家等待通知。", districtId: "east" },
      { id: "e-b", title: "人口登记", detail: "警察厅开始整理失踪人口登记，并约谈了几位房东。", districtId: "cherwood" },
      { id: "e-c", title: "外港滞留", detail: "两艘货船留在外港，船主收到口头通知等待检查。", districtId: "dock" },
    ],
    location: "街口出现更多巡警，摊贩开始提前收摊。",
    milestone: "取得下一项可核验结果",
  },
  3: {
    atmosphere: "午后的阳光被云层压得很低，码头方向传来断断续续的汽笛，交易所门前排起了长队。",
    signals: [
      { channel: "街谈", headline: "码头工人拒绝上工", body: "清晨换班时工人没有登上驳船，工头在岸边喊话，称工资结算出了差错。", reliability: "公开事实", districtId: "dock" },
      { channel: "行业消息", headline: "两家银行收紧贷款", body: "抵押借款的窗口排起长队，职员以“总行复核”为由要求补充账册。", reliability: "多源传闻", districtId: "hillston" },
      { channel: "私人来信", headline: "教会巡夜时间提前", body: "值夜者把巡巷时间提前到黄昏，慈善厨房门口贴出新的施粥安排。", reliability: "单一消息", districtId: "south" },
    ],
    moves: [
      { title: "收买码头工头", detail: "该势力通过中间人向码头工头许诺报酬，换取装卸排班与货单副本。", visibility: "迹象" },
      { title: "转移核心账册", detail: "该势力把一批账册从商行搬到私人宅邸，并销毁了部分目录页。", visibility: "迹象" },
    ],
    canon: "派人送出一封盖有私章的信，收信人没有回话，只在门缝留下半张报纸。",
    events: [
      { id: "e-a", title: "码头罢运", detail: "早班工人集体拒绝上船，港区装卸陷入停滞。", districtId: "dock" },
      { id: "e-b", title: "银行复核", detail: "两家银行开始要求贷款客户补充原始账册。", districtId: "hillston" },
      { id: "e-c", title: "巡夜提前", detail: "值夜者把慈善厨房一带的巡巷时间提前到黄昏。", districtId: "south" },
    ],
    location: "码头铁门落锁，交易所门口有人低声议论贷款利率。",
    milestone: "确认下一批货物的实际买主",
  },
  4: {
    atmosphere: "入夜后风从河面灌进来，煤气路灯忽明忽暗，几家印刷所的窗口亮到很晚。",
    signals: [
      { channel: "报纸", headline: "晚报开设失踪者专栏", body: "晚报第三版开始连载失踪工人名录，称愿意刊登家属来信，编辑部电话无人接听。", reliability: "公开事实", districtId: "west" },
      { channel: "行业消息", headline: "黑市药材价格翻倍", body: "几味用于仪式的药材在暗巷涨到原价两倍，货主拒绝说明来源。", reliability: "单一消息", districtId: "bridge" },
      { channel: "官方通告", headline: "煤气公司检修主干管", body: "煤气公司以例行检修名义封闭三条主干管，工人在夜间更换阀门。", reliability: "公开事实", districtId: "government" },
    ],
    moves: [
      { title: "销毁旧名单", detail: "该势力把一份旧名单分批丢进不同的锅炉，并清点了仍在外流传的副本。", visibility: "迹象" },
      { title: "建立码头新渠道", detail: "该势力在另一处泊位挂出新的卸货代理招牌，用假名登记。", visibility: "获知" },
    ],
    canon: "在印刷所附近出现，拿走一叠样报后没有停留，去向不明。",
    events: [
      { id: "e-a", title: "失踪专栏", detail: "晚报开始连载失踪工人名录，并征集家属来信。", districtId: "west" },
      { id: "e-b", title: "药材涨价", detail: "暗巷里几种仪式药材价格翻倍，货主拒绝说明来源。", districtId: "bridge" },
      { id: "e-c", title: "管道检修", detail: "煤气公司封闭三条主干管，夜间更换阀门。", districtId: "government" },
    ],
    location: "印刷所灯火通明，煤气路灯在风里忽明忽暗。",
    milestone: "定位下一批仪式材料的转运点",
  },
};

function worldEnvelope(game, chapter, tag) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations[0].id;
  const projectIds = game.worldKernel.projects.slice(0, 2).map((item) => item.id);
  const result = chapter.results[0];
  const variant = WEEK_VARIANTS[Number(tag)];
  return {
    worldSummary: {
      atmosphere: variant.atmosphere,
      changes: [variant.signals[0].headline, variant.signals[1].headline],
      undercurrents: ["两股势力开始交换消息", "港口出现新的货单流向"],
    },
    publicSignals: variant.signals.map((signal) => ({ ...signal })),
    actionReports: result ? [{
      actionId: result.id,
      fieldReport: `${variant.signals[0].headline}出现后，执行者按契约只核对公开记录，没有接触任何人。`,
      observableFacts: [variant.signals[0].body.slice(0, 40), variant.signals[1].body.slice(0, 40)],
      followUp: "核验最近一周的公开登记与报纸索引",
    }] : [],
    factionMoves: [
      { factionId: firstFaction.id, title: variant.moves[0].title, detail: variant.moves[0].detail, visibility: variant.moves[0].visibility, suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: variant.moves[1].title, detail: variant.moves[1].detail, visibility: variant.moves[1].visibility, suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [{ actorId: game.canonActors[0].id, lastMove: variant.canon, awareness: "未知" }],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: { departmentDevelopments: [], memberDevelopments: [], recruitDevelopments: [], governanceIssues: [], newRecruitableNpc: null },
    kernelDelta: {
      newActors: [], newFactions: [], newProjects: [],
      actorUpdates: [], factionUpdates: [],
      projectUpdates: projectIds.map((projectId, index) => ({ projectId, progressDelta: 2 + index, stage: "继续推进", nextMilestone: variant.milestone, blockers: [], status: "active" })),
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: variant.location }],
      events: variant.events.map((event) => ({ ...event, id: `event-${tag}-${event.id}`, locationId: event.districtId, actorIds: [], factionIds: event.id === "e-a" ? [firstFaction.id] : event.id === "e-b" ? [secondFaction.id] : [], causeIds: [], visibility: "world" })),
      observations: [], knowledge: [],
      canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

test("three consecutive weeks complete world and literary turns without retries", async () => {
  const { engine, model } = await loadGameModules();
  const { generateAiWorldDelta, generateLiteraryChapter, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  let fetchCount = 0;
  let agentCallCount = 0;
  let worldCallCount = 0;
  let literaryCallCount = 0;
  try {
    for (let week = 1; week <= 3; week += 1) {
      const tag = String(week + 1);
      const contract = localContract({ intent: `第${tag}周整理本周公开报纸资料，只做比对，不接触任何人。`, game, leaderId: "organization", districtId: "cherwood", abilityIds: [] });
      game = { ...game, schedule: [scheduleContract(game, contract)] };
      const resolved = resolveWeek(game);
      const envelope = worldEnvelope(resolved.state, resolved.chapter, tag);
      const chapterJson = JSON.stringify({ title: `第${tag}周·雾中纪实`, sections: [{ heading: "开端", paragraphs: [`第${tag}周，雨落在窗沿上。`, "负责人听完汇报后留在据点，没有外出。"], }] });
      globalThis.fetch = async (_url, init) => {
        fetchCount += 1;
        const body = JSON.parse(String(init?.body ?? "{}"));
        const user = body.messages?.at(-1)?.content ?? "";
        let content;
        if (user.includes("为这个主体独立形成同一周起点上的提案")) {
          agentCallCount += 1;
          const agentRef = user.match(/"ref":"([^"]+)"/)?.[1] ?? "actor:unknown";
          const planningWeek = Number(user.match(/"planningWeek":(\d+)/)?.[1] ?? week);
          content = JSON.stringify({ proposal: { planningWeek, agentRef, disposition: "wait", intent: "保持当前计划并观察公开变化。", rationale: "没有出现足以改变本周安排的新认知。", targetRefs: [], requiredKnowledgeIds: [] } });
        } else if (user.includes("worldSummary")) {
          worldCallCount += 1;
          content = JSON.stringify(envelope);
        } else {
          literaryCallCount += 1;
          content = chapterJson;
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
      };
      const simulated = await generateAiWorldDelta(
        { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
        resolved.state,
        resolved.chapter,
        () => {},
      );
      const enriched = simulated.chronicle.find((chapter) => chapter.id === resolved.chapter.id) ?? resolved.chapter;
      const literary = await generateLiteraryChapter(
        { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
        simulated,
        enriched,
        () => {},
      );
      game = { ...simulated, chronicle: simulated.chronicle.map((chapter) => chapter.id === literary.id ? literary : chapter) };
      assert.equal(literary.source, "ai");
    }
    assert.equal(game.week, 4);
    assert.equal(game.chronicle.length, 3);
    assert.equal(game.worldKernel.lastResolvedWeek, 3);
    assert.equal(game.worldSignals.length, 9);
    assert.equal(game.worldSnapshots.length, 3);
    assert.equal(worldCallCount, 3);
    assert.equal(literaryCallCount, 3);
    assert.ok(agentCallCount >= 3, "每周应为活跃 Agent 分别调用模型");
    assert.equal(fetchCount, agentCallCount + worldCallCount + literaryCallCount);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
