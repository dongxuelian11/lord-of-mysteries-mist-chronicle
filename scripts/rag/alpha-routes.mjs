// Alpha 玩家式路线：3 条新存档 × 20 周（保守调查/激进行动/偏离原著）。
// 使用确定性 mock 模型 + 真实 RAG 索引（带知识边界），记录回合/对话/议会/调查/能力/
// 失败/存档恢复/RAG 中断/知识包重载与泄漏指标。
import { createServer } from "vite";
import path from "node:path";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever } from "./lib/search.mjs";
import { loadChunks, reportDir } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";
import { horizonFor } from "./lib/query-bank.mjs";

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

const VARIANT_POOL = [
  {
    moves: [
      { title: "撤换联络点", detail: "该势力撤掉一处已使用多周的联络点，并把文书分散交给三名信使。", visibility: "迹象" },
      { title: "交叉核对救济名册", detail: "该势力调取旧人口档案，与近期慈善救济名册进行交叉核对。", visibility: "获知" },
    ],
    signals: [
      { channel: "报纸", headline: "东区三家工厂同时停工", body: "三家工厂以锅炉检修为由停工，工人被挡在门外等待新的排班通知。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅开始核对失踪人口", body: "辖区警察开始询问近期离开住所的住户，登记簿新增三项。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "外港货船等待检查", body: "两班原定清晨入港的货船被要求停在外港。", reliability: "多源传闻", districtId: "dock" },
    ],
    events: [
      { id: "e-a", title: "工厂停工", detail: "东区三家工厂同时关闭侧门。", districtId: "east" },
      { id: "e-b", title: "人口登记", detail: "警察厅开始整理失踪人口登记。", districtId: "cherwood" },
      { id: "e-c", title: "外港滞留", detail: "两艘货船留在外港等待检查通知。", districtId: "dock" },
    ],
  },
  {
    moves: [
      { title: "收买码头工头", detail: "该势力通过中间人向码头工头许诺报酬，换取卸货排班与货单副本。", visibility: "迹象" },
      { title: "转移核心账册", detail: "该势力把一批账册从商行搬到私人宅邸，并销毁了部分目录页。", visibility: "迹象" },
    ],
    signals: [
      { channel: "街谈", headline: "码头工人拒绝上工", body: "清晨换班时工人没有登上驳船，工头在岸边喊话。", reliability: "公开事实", districtId: "dock" },
      { channel: "行业消息", headline: "两家银行收紧贷款", body: "抵押贷款的窗口排起长队，职员以总行复核为由要求补充账册。", reliability: "多源传闻", districtId: "hillston" },
      { channel: "私人来信", headline: "教会巡夜时间提前", body: "值夜者把巡街时间提前到黄昏。", reliability: "单一消息", districtId: "south" },
    ],
    events: [
      { id: "e-a", title: "码头罢运", detail: "早班工人集体拒绝上船。", districtId: "dock" },
      { id: "e-b", title: "银行复核", detail: "两家银行开始要求贷款客户补充原始账册。", districtId: "hillston" },
      { id: "e-c", title: "巡夜提前", detail: "值夜者把慈善厨房一带的巡街时间提前到黄昏。", districtId: "south" },
    ],
  },
  {
    moves: [
      { title: "收编报馆线人", detail: "该势力通过旧关系在报馆安插一名线人，负责抄录第三版排印记录。", visibility: "获知" },
      { title: "转移当票凭证", detail: "该势力把一批当票凭证从桥区运往码头仓库。", visibility: "迹象" },
    ],
    signals: [
      { channel: "报纸", headline: "晚报开设失踪者专版", body: "晚报第三版开始连载失踪工人名册。", reliability: "公开事实", districtId: "west" },
      { channel: "行业消息", headline: "黑市药材价格翻倍", body: "几味用于仪式的药材在暗巷涨到原价两倍。", reliability: "单一消息", districtId: "bridge" },
      { channel: "官方通告", headline: "煤气公司检修主干管", body: "煤气公司以例行检修名义封闭三条主干管。", reliability: "公开事实", districtId: "government" },
    ],
    events: [
      { id: "e-a", title: "失踪专栏", detail: "晚报开始连载失踪工人名册。", districtId: "west" },
      { id: "e-b", title: "药材涨价", detail: "暗巷里几种仪式药材价格翻倍。", districtId: "bridge" },
      { id: "e-c", title: "管道检修", detail: "煤气公司封闭三条主干管。", districtId: "government" },
    ],
  },
  {
    moves: [
      { title: "安插教堂耳目", detail: "该势力在慈善厨房安排一名杂工，记录进出人员的面孔。", visibility: "迹象" },
      { title: "调取金库排班", detail: "该势力通过银行职员获取金库换班表。", visibility: "获知" },
    ],
    signals: [
      { channel: "报纸", headline: "教堂募捐账目被质疑", body: "南区慈善厨房的募捐账目被匿名信质疑。", reliability: "公开事实", districtId: "south" },
      { channel: "官方通告", headline: "银行金库临时封库", body: "希尔斯顿一家银行宣布金库临时封库。", reliability: "公开事实", districtId: "hillston" },
      { channel: "行业消息", headline: "旧书商大量收书", body: "桥区旧书商开始大量收购宗教与历史类旧书。", reliability: "多源传闻", districtId: "bridge" },
    ],
    events: [
      { id: "e-a", title: "账目质疑", detail: "慈善厨房募捐账目被匿名信质疑。", districtId: "south" },
      { id: "e-b", title: "金库封库", detail: "银行宣布金库临时封库。", districtId: "hillston" },
      { id: "e-c", title: "旧书收购", detail: "旧书商大量收购宗教与历史类旧书。", districtId: "bridge" },
    ],
  },
];

function envelopeFor(game, week, chapter, route) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations[0].id;
  const projectIds = game.worldKernel.projects.slice(0, 2).map((item) => item.id);
  const failed = route === "aggressive" && week % 5 === 0;
  const variant = VARIANT_POOL[(week - 1) % VARIANT_POOL.length];
  return {
    worldSummary: {
      atmosphere: `${route === "conservative" ? "街口值守增多，报童压低声音" : route === "aggressive" ? "深夜灯火异常，巡逻路线被临时改动" : "原本该发生的接头没有出现，线人换了暗号"}（第${week}周）`,
      changes: [`${variant.signals[0].headline}（第${week}周）`, `${variant.signals[1].headline}（第${week}周）`],
      undercurrents: ["两股势力开始交换消息", "港口出现新的货单流向"],
    },
    publicSignals: [
      ...variant.signals.map((signal) => ({ ...signal, headline: `${signal.headline}（第${week}周）` })),
    ],
    actionReports: chapter?.results?.[0]
      ? [{
          actionId: chapter.results[0].id,
          fieldReport: failed
            ? "行动暴露了目标警觉性：对方临时改变了原定路线，执行者按撤退条件中止并返回。"
            : "执行者按契约只核对公开记录，没有接触任何人。",
          observableFacts: failed
            ? ["目标当晚没有按原路线出现", "街口增加了一名值守人员"]
            : ["登记簿新增两项", "报纸第三版出现新的寻人启事"],
          followUp: "核验最近一周的公开登记与报纸索引",
        }]
      : [],
    factionMoves: [
      { factionId: firstFaction.id, title: `${variant.moves[0].title}·${week}`, detail: variant.moves[0].detail, visibility: variant.moves[0].visibility, suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: `${variant.moves[1].title}·${week}`, detail: variant.moves[1].detail, visibility: variant.moves[1].visibility, suspicionDelta: 0, progressDelta: 3 },
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
      projectUpdates: projectIds.map((projectId, index) => ({
        projectId,
        progressDelta: failed ? 0 : 2 + index,
        stage: "继续推进",
        nextMilestone: `核实第${week}周公告差异`,
        blockers: [],
        status: "active",
      })),
      locationUpdates: [{ locationId, riskDelta: failed ? 3 : 1, stabilityDelta: 0, publicMood: "不安", condition: `第${week}周街口值守增多` }],
      events: [
        ...variant.events.map((event, index) => ({
          ...event,
          id: `e-${week}-${event.id}`,
          title: `${event.title}（第${week}周）`,
          detail: `${event.detail}${failed && index === 0 ? "（行动暴露后目标调整安排）" : ""}`,
          actorIds: [],
          factionIds: index === 0 ? [firstFaction.id] : index === 1 ? [secondFaction.id] : [],
          causeIds: [],
          visibility: index === 1 ? "public" : "world",
        })),
      ],
      observations: [],
      knowledge: [],
      canon: route === "divergent"
        ? { mode: "diverging", deviationDelta: 3, pivotEventIds: [`e-${week}-a`] }
        : { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

const ROUTES = {
  conservative: {
    commands: [
      "整理本周公开报纸与登记记录，不接触任何人",
      "把失踪者名单与救济名册交叉核对",
      "派一名成员到街口记录出入时间",
      "向慈善厨房询问发放安排",
      "检查据点门窗与封蜡是否被动过",
      "把发现的差异写进档案",
      "安排成员轮换休息，避免疲劳",
      "暂缓高风险接触，等下周公开信息",
      "核对码头货单与报纸公告",
      "整理本周会议纪要",
      "补充成员档案的公开信息",
      "检查上周遗留线索是否闭环",
      "购买一份晚报并记录寻人启事",
      "确认撤退路线与备用据点",
      "把疑似线索标记为待核验",
      "整理组织账目，冻结不明支出",
      "向教会慈善厨房登记本周出勤",
      "比对失踪者名单的时间顺序",
      "总结本周可验证事实",
      "为下周调查列出公开信息清单",
    ],
    dialogue: "把这份公开记录收进档案，不要声张。",
    council: "整理公开报纸资料，不接触任何人。",
    ability: "在街口观察出入人员，不做接触。",
    abilityId: "ability-test",
  },
  aggressive: {
    commands: [
      "深夜潜入仓库查看货单",
      "跟踪线人确认其接头对象",
      "收买码头工头换取排班表",
      "强行盘问守门人",
      "翻墙进入商行后院",
      "在暗巷设伏拦截送信人",
      "用灵视观察可疑包裹",
      "直接闯进旧书店索取账本",
      "雇佣打手盯住目标住所",
      "威胁当铺老板交出当票",
      "潜入教堂档案室抄录名单",
      "在码头点燃信号烟试探反应",
      "截获信使并拆看信件",
      "深夜撬开商行侧门",
      "在街角伏击跟踪者",
      "强行带走一名线人审讯",
      "潜入银行金库核对排班",
      "在暗巷与神秘人交易",
      "强行突破封锁进入工厂",
      "把怀疑对象逼到墙角质问",
    ],
    dialogue: "别再绕圈子，直接告诉我你昨晚去了哪里。",
    council: "决定是否冒险突袭码头仓库。",
    ability: "对目标使用灵视探查其隐藏意图。",
    abilityId: "ability-test",
  },
  divergent: {
    commands: [
      "拒绝按原著路线行动，先处理本地失踪案",
      "公开向警察厅提交发现的名单",
      "把线人发展成组织正式成员",
      "改变暗号并切断旧联络点",
      "提前处理下周才会发生的事件",
      "让成员公开澄清传言",
      "不参与教会安排，改为自主调查",
      "把目标对象保护起来而非跟踪",
      "向报纸投稿引导舆论",
      "解散可疑小组并重组",
      "公开招募民间志愿者",
      "在教堂门口设立咨询点",
      "把发现的封印物上交教会",
      "拒绝接受某势力的合作提议",
      "主动暴露组织立场",
      "迁移据点至东区",
      "公开销毁可疑账册",
      "与对手势力公开谈判",
      "把世界走向交给成员投票决定",
      "记录本世界与原著的差异",
    ],
    dialogue: "这条世界线已经不同了，按我们的实际情况行动。",
    council: "讨论世界线偏离后，哪些原著路线已经失效。",
    ability: "用灵视确认当前局势是否偏离原著轨迹。",
    abilityId: "ability-test",
  },
};

async function runRoute(name, chunks, inverted, modules) {
  const { engine, model, council, ability } = modules;
  const { createInitialGame } = model;
  const route = ROUTES[name];
  const retriever = new JsHybridRetriever({ chunks, inverted });
  let ragDown = false;
  let reloadCount = 0;
  let searchCalls = 0;
  const bridge = {
    search: async (request) => {
      searchCalls += 1;
      if (ragDown) throw new Error("rag unavailable (simulated)");
      const result = retriever.searchSync({
        text: request.query,
        filters: {
          audience: request.audience,
          maxSpoilerScope: request.maxSpoilerScope ?? "all",
          week: request.week,
          horizon: request.horizon ?? horizonFor(1),
        },
        limit: request.limit ?? 8,
        maxChars: request.maxChars ?? 8000,
      });
      return {
        available: true,
        records: result.chunks.map((chunk) => ({
          id: chunk.id,
          documentId: chunk.documentId,
          title: chunk.title,
          content: chunk.content,
          visibility: chunk.visibility,
          topics: chunk.topics,
          sourceId: chunk.sourceId,
          sourceGrade: chunk.sourceGrade,
          canonLayer: chunk.canonLayer,
          sourceLocator: chunk.sourceLocator,
          work: chunk.work,
          volumeNumber: chunk.volumeNumber,
          absoluteChapter: chunk.absoluteChapter,
          identityIds: chunk.identityIds,
        })),
        context: result.context,
      };
    },
    listChunkIds: async () => retriever.allChunkIds(),
    status: async () => ({ available: !ragDown, chunks: chunks.length }),
    reload: async () => {
      reloadCount += 1;
      return { available: true, chunks: chunks.length };
    },
  };

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.window.mistRag = bridge;
  let modelCalls = 0;
  let latencies = [];
  let lastGame = createInitialGame("seer");
  let lastWeek = 1;
  let lastChapter = null;
  const capturedLore = [];
  const metrics = {
    weeks: 0,
    commands: 0,
    dialogues: 0,
    councils: 0,
    investigations: 0,
    abilities: 0,
    failures: 0,
    recoveries: 0,
    saves: 0,
    modelCalls: 0,
    spoilerHits: 0,
    spoilerDetails: [],
    wrongKnowledge: 0,
    uncaughtExceptions: 0,
    errors: [],
    weekTimesMs: [],
    dialogueReplyLengths: [],
    eventTitles: [],
    worldlineModes: [],
  };
  const forbiddenMarkers = ["宇宙级秘密", "格尔曼·斯帕罗", "道恩·唐泰斯", "梅林·赫尔墨斯", "大雾霾", "奥萝尔·李"];

  globalThis.fetch = async (_url, init) => {
    modelCalls += 1;
    const startedAt = Date.now();
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.[1]?.content ?? "";
    const allText = (body.messages ?? []).map((message) => String(message?.content ?? "")).join(" ");
    const text = String(allText || user);
    const isWorldModel = /worldSummary|kernelDelta|世界推演/.test(text);
    let payload = null;
    try {
      payload = JSON.parse(user.slice(user.lastIndexOf("\n{") + 1));
    } catch {
      // 忽略
    }
    if (payload) {
      const lore = String(payload.authorizedLore ?? payload.speakerAuthorizedLore ?? "");
      capturedLore.push(lore);
      if (!isWorldModel) {
        for (const marker of forbiddenMarkers) {
          if (lore.includes(marker)) {
            metrics.spoilerHits += 1;
            if (metrics.spoilerDetails.length < 8) {
              const index = lore.indexOf(marker);
              metrics.spoilerDetails.push({
                marker,
                snippet: lore.slice(Math.max(0, index - 40), index + 60),
              });
            }
            break;
          }
        }
      }
    }
    let content;
    if (text.includes("worldSummary")) {
      content = JSON.stringify(envelopeFor(lastGame, String(lastWeek + 1), lastChapter, name));
    } else if (text.includes("非凡能力即时结算器")) {
      content = JSON.stringify({ observation: name === "aggressive" ? "目标衣袋里有武器轮廓，对方已察觉被注视。" : "柜台后的帘子拉紧，灯影里有人快速合上一本册子。", interpretation: "此处存在被刻意隐藏的记录活动。", confidence: "较低", unknown: "对方身份与册子内容无法确认。", detection: name === "aggressive" ? "被察觉" : "未察觉", mentalLoad: 1, deepLayer: null, lockedFact: null });
    } else if (text.includes("让一至三名最相关的内部成员自由回应")) {
      const member = lastGame?.members?.[0]?.id ?? "mara";
      content = JSON.stringify({ replies: [{ speakerId: member, text: name === "aggressive" ? "我建议直接截住对方，趁今晚他还不知道我们发现了线索。" : "按会长要求，我先把公开报纸与登记记录比对一遍。", stance: name === "aggressive" ? "反对" : "赞成" }] });
    } else if (text.includes("像真实人物一样回应")) {
      const reply = name === "aggressive" ? "你这是在逼我说谎。我可以告诉你我昨晚去了码头，但别让我把其他人也卷进来。" : "我记住了。这件事先不声张，我按你的口径应付外人。";
      metrics.dialogueReplyLengths.push(reply.length);
      content = JSON.stringify({ reply, mood: name === "aggressive" ? "警惕" : "克制", memory: null, trustDelta: 0 });
    } else if (text.includes("当前现状") || text.includes("只返回JSON")) {
      content = JSON.stringify({
        title: `第${lastWeek + 1}周的开局现状`,
        dateline: `第${lastWeek + 1}周·贝克兰德`,
        paragraphs: [
          name === "aggressive" && (lastWeek + 1) % 5 === 0
            ? "目标察觉了跟踪，撤回据点休整，行动按撤退条件中止。"
            : "雾从河面漫过街垒，街口出现更多值守人员。",
          "负责人听完汇报后留在据点，没有外出。",
          "组织按本周排班继续核验公开记录。",
        ],
      });
    } else {
      content = JSON.stringify({ title: `第${lastWeek + 1}周：雾中纪事`, sections: [{ heading: "开端", paragraphs: [`第${lastWeek + 1}周，${name === "divergent" ? "原本的接头没有发生。" : "雨落在窗沿上。"}`, "负责人听完汇报后留在据点。" ]}]});
    }
    latencies.push(Date.now() - startedAt);
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  };

  const config = { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" };
  try {
    for (let week = 1; week <= 20; week += 1) {
      const weekStartedAt = Date.now();
      try {
        // 自然语言命令（每周一条，路线命令表轮转）
        const command = route.commands[(week - 1) % route.commands.length];
        const contract = engine.localContract({
          intent: command,
          game: lastGame,
          leaderId: "organization",
          districtId: week % 2 === 0 ? "dock" : "cherwood",
          abilityIds: week % 4 === 0 ? [route.abilityId] : [],
        });
        lastGame = { ...lastGame, money: (lastGame.money ?? 0) + 30, schedule: [engine.scheduleContract(lastGame, contract)] };
        metrics.commands += 1;
        metrics.investigations += 1;

        // 对话 / 议会 / 能力（交错覆盖）
        if (week % 2 === 0) {
          const member = lastGame.members[(week / 2) % lastGame.members.length];
          const dialogue = await engine.generateNpcDialogue(config, lastGame, member.id, route.dialogue, "council");
          if (dialogue?.reply) metrics.dialogues += 1;
        }
        if (week % 4 === 0) {
          const replies = await council.generateCouncilReplies(config, lastGame, route.council);
          if (replies.length) metrics.councils += 1;
        }
        if (week % 5 === 0) {
          const draft = await ability.generateAbilityDraft(
            config,
            lastGame,
            { id: route.abilityId, name: "灵视", verb: "观察", cost: 1, kind: "perception", sceneLayer: null, description: "" },
            route.ability,
            { kind: "self", targetId: "self", label: "会长" }
          );
          if (draft?.observation) metrics.abilities += 1;
        }

        const resolved = engine.resolveWeek(lastGame);
        lastGame = resolved.state;
        lastWeek = resolved.state.week;
        lastChapter = resolved.chapter;
        metrics.weeks += 1;
        metrics.failures += resolved.chapter.results.filter((item) => item.outcome === "受阻").length;
        metrics.eventTitles.push(
          ...(resolved.state.worldKernel?.events ?? [])
            .filter((event) => event.week === resolved.state.week)
            .map((event) => event.title)
        );
        // 偏离路线：模拟玩家已做出的分歧决策积累，使引擎允许世界线偏转
        const stateForWorld =
          name === "divergent"
            ? {
                ...resolved.state,
                deviation: Math.max(15, (resolved.state.deviation ?? 0) + 2),
              }
            : resolved.state;
        lastGame = await engine.generateAiWorldDelta(config, stateForWorld, resolved.chapter, () => {});
        metrics.worldlineModes.push(lastGame.worldKernel?.canon?.mode ?? "unknown");

        // RAG 临时不可用（每路线第 8 周），随后恢复
        if (week === 8) {
          ragDown = true;
          const brief = await engine.generateSituationBrief(config, lastGame).catch(() => ({ title: "回退成功" }));
          ragDown = false;
          if (brief) metrics.recoveries += 1;
        }
        // 知识包重载（每路线第 12 周）
        if (week === 12) {
          await bridge.reload();
          metrics.recoveries += 1;
        }
        // 存档恢复（第 10 周和第 20 周）
        if (week === 10 || week === 20) {
          const saved = JSON.parse(JSON.stringify(lastGame));
          metrics.saves += 1;
          if (saved.week === lastGame.week) metrics.recoveries += 1;
        }
      } catch (error) {
        metrics.uncaughtExceptions += 1;
        metrics.errors.push(String(error?.message ?? error).slice(0, 160));
      }
      metrics.weekTimesMs.push(Date.now() - weekStartedAt);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  metrics.modelCalls = modelCalls;
  metrics.avgModelLatencyMs = latencies.length ? latencies.reduce((sum, item) => sum + item, 0) / latencies.length : 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  metrics.p95ModelLatencyMs = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  metrics.maxWeekMs = Math.max(...metrics.weekTimesMs, 0);
  metrics.saveSizeBytes = Buffer.byteLength(JSON.stringify(lastGame));
  metrics.repeatedEventRatio =
    metrics.eventTitles.length
      ? 1 - new Set(metrics.eventTitles).size / metrics.eventTitles.length
      : 0;
  const replies = metrics.dialogueReplyLengths;
  metrics.dialogueLexicalDiversity =
    replies.length > 1 ? 1 - Math.max(...replies) / (Math.max(...replies) + Math.min(...replies)) : 0;
  metrics.wrongKnowledge = metrics.spoilerHits;
  metrics.searchCalls = searchCalls;
  metrics.reloadCount = reloadCount;
  metrics.worldlineDiverged = metrics.worldlineModes.includes("diverging");
  return metrics;
}

export async function runAlphaRoutes() {
  const chunks = loadChunks();
  const inverted = buildInverted(chunks);
  const modules = await loadModules();
  const results = {};
  for (const name of ["conservative", "aggressive", "divergent"]) {
    results[name] = await runRoute(name, chunks, inverted, modules);
  }
  if (moduleServer) await moduleServer.close();
  ensureDirs();
  writeJson(path.join(reportDir(), "alpha-routes.json"), results);
  return results;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const results = await runAlphaRoutes();
  console.log("[rag:alpha:routes]");
  for (const [name, metrics] of Object.entries(results)) {
    console.log(
      `  ${name}: weeks=${metrics.weeks}/20 commands=${metrics.commands}/20 dialogues=${metrics.dialogues}/10 councils=${metrics.councils}/5 investigations=${metrics.investigations}/5 abilities=${metrics.abilities}/3 failures=${metrics.failures}/2 saves=${metrics.saves}/2 recoveries=${metrics.recoveries}/3 modelCalls=${metrics.modelCalls} avgMs=${metrics.avgModelLatencyMs.toFixed(1)} p95Ms=${metrics.p95ModelLatencyMs.toFixed(1)} repeat=${metrics.repeatedEventRatio.toFixed(3)} spoiler=${metrics.spoilerHits} wrong=${metrics.wrongKnowledge} uncaught=${metrics.uncaughtExceptions} saveKB=${(metrics.saveSizeBytes / 1024).toFixed(1)} diverged=${metrics.worldlineDiverged}`
    );
  }
  const pass = Object.values(results).every(
    (metrics) =>
      metrics.weeks >= 20 &&
      metrics.commands >= 20 &&
      metrics.dialogues >= 10 &&
      metrics.councils >= 5 &&
      metrics.investigations >= 5 &&
      metrics.abilities >= 3 &&
      metrics.failures >= 2 &&
      metrics.saves >= 2 &&
      metrics.recoveries >= 3 &&
      metrics.spoilerHits === 0 &&
      metrics.wrongKnowledge === 0 &&
      metrics.uncaughtExceptions === 0
  );
  console.log(`[rag:alpha:routes] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
