// 游戏内真实验证：用真实知识库（fake bridge = JsHybridRetriever）驱动游戏引擎，
// 跑 10×对话/议会/能力/调查/世界推进 + 秘密身份/未来诱导/同人冲突场景。
import { createServer } from "vite";
import path from "node:path";
import { buildInverted } from "./lib/index-builder.mjs";
import { JsHybridRetriever } from "./lib/search.mjs";
import { loadChunks, reportDir } from "./lib/registry.mjs";
import { ensureDirs, writeJson } from "./lib/paths.mjs";

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
    atmosphere: "清晨的雾比往常更浓，工厂烟囱排出的黑烟在街口凝成水珠，报童的喊声比平时更急。",
    signals: [
      { channel: "报纸", headline: "东区三家工厂同时停工", body: "三家工厂以锅炉检修为由停工，工人被挡在门外等待新的排班通知，门口聚集了打听消息的人。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅开始核对失踪人口", body: "辖区警察开始询问近期离开住所却没有向房东说明去向的住户，登记簿新增三项。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "外港货船等待检查", body: "两班原定清晨入港的货船被要求停在外港，卸货时间没有得到解释。", reliability: "多源传闻", districtId: "dock" },
    ],
    events: [
      { id: "e-a", title: "工厂停工", detail: "东区三家工厂同时关闭侧门，工人被要求在家等待通知。", districtId: "east" },
      { id: "e-b", title: "人口登记", detail: "警察厅开始整理失踪人口登记，并约谈了几位房东。", districtId: "cherwood" },
      { id: "e-c", title: "外港滞留", detail: "两艘货船留在外港，船主收到口头通知等待检查。", districtId: "dock" },
    ],
  },
  {
    moves: [
      { title: "收买码头工头", detail: "该势力通过中间人向码头工头许诺报酬，换取卸货排班与货单副本。", visibility: "迹象" },
      { title: "转移核心账册", detail: "该势力把一批账册从商行搬到私人宅邸，并销毁了部分目录页。", visibility: "迹象" },
    ],
    atmosphere: "午后的阳光被云层压得很低，码头方向传来断断续续的汽笛，交易所门前排起了长队。",
    signals: [
      { channel: "街谈", headline: "码头工人拒绝上工", body: "清晨换班时工人没有登上驳船，工头在岸边喊话，称工资结算出了差错。", reliability: "公开事实", districtId: "dock" },
      { channel: "行业消息", headline: "两家银行收紧贷款", body: "抵押贷款的窗口排起长队，职员以总行复核为由要求补充账册。", reliability: "多源传闻", districtId: "hillston" },
      { channel: "私人来信", headline: "教会巡夜时间提前", body: "值夜者把巡街时间提前到黄昏，慈善厨房门口贴出新的施粥安排。", reliability: "单一消息", districtId: "south" },
    ],
    events: [
      { id: "e-a", title: "码头罢运", detail: "早班工人集体拒绝上船，港区卸货陷入停滞。", districtId: "dock" },
      { id: "e-b", title: "银行复核", detail: "两家银行开始要求贷款客户补充原始账册。", districtId: "hillston" },
      { id: "e-c", title: "巡夜提前", detail: "值夜者把慈善厨房一带的巡街时间提前到黄昏。", districtId: "south" },
    ],
  },
  {
    moves: [
      { title: "收编报馆线人", detail: "该势力通过旧关系在报馆安插一名线人，负责抄录第三版排印记录。", visibility: "获知" },
      { title: "转移当票凭证", detail: "该势力把一批当票凭证从桥区运往码头仓库，并更换了封存蜡印。", visibility: "迹象" },
    ],
    atmosphere: "入夜后风从河面灌进来，煤气路灯忽明忽暗，几家印刷所的窗口亮到很晚。",
    signals: [
      { channel: "报纸", headline: "晚报开设失踪者专版", body: "晚报第三版开始连载失踪工人名册，称愿意刊登家属来信，编辑部电话无人接听。", reliability: "公开事实", districtId: "west" },
      { channel: "行业消息", headline: "黑市药材价格翻倍", body: "几味用于仪式的药材在暗巷涨到原价两倍，货主拒绝说明来源。", reliability: "单一消息", districtId: "bridge" },
      { channel: "官方通告", headline: "煤气公司检修主干管", body: "煤气公司以例行检修名义封闭三条主干管，工人在夜间更换阀门。", reliability: "公开事实", districtId: "government" },
    ],
    events: [
      { id: "e-a", title: "失踪专栏", detail: "晚报开始连载失踪工人名册，并征集家属来信。", districtId: "west" },
      { id: "e-b", title: "药材涨价", detail: "暗巷里几种仪式药材价格翻倍，货主拒绝说明来源。", districtId: "bridge" },
      { id: "e-c", title: "管道检修", detail: "煤气公司封闭三条主干管，夜间更换阀门。", districtId: "government" },
    ],
  },
  {
    moves: [
      { title: "安插教堂耳目", detail: "该势力在慈善厨房安排一名杂工，记录进出人员的面孔。", visibility: "迹象" },
      { title: "调取金库排班", detail: "该势力通过银行职员获取金库换班表，标注了交接窗口。", visibility: "获知" },
    ],
    atmosphere: "冬日的黄昏来得早，教堂钟声比平时晚了半刻，长椅上坐着几个低头的人。",
    signals: [
      { channel: "报纸", headline: "教堂募捐账目被质疑", body: "南区慈善厨房的募捐账目被匿名信质疑，教会宣布将公开复核。", reliability: "公开事实", districtId: "south" },
      { channel: "官方通告", headline: "银行金库临时封库", body: "希尔斯顿一家银行宣布金库临时封库，取款需提前三日预约。", reliability: "公开事实", districtId: "hillston" },
      { channel: "行业消息", headline: "旧书商大量收书", body: "桥区旧书商开始大量收购宗教与历史类旧书，出价高于市价。", reliability: "多源传闻", districtId: "bridge" },
    ],
    events: [
      { id: "e-a", title: "账目质疑", detail: "慈善厨房募捐账目被匿名信质疑，教会宣布公开复核。", districtId: "south" },
      { id: "e-b", title: "金库封库", detail: "银行宣布金库临时封库，取款需预约。", districtId: "hillston" },
      { id: "e-c", title: "旧书收购", detail: "旧书商大量收购宗教与历史类旧书，出价高于市价。", districtId: "bridge" },
    ],
  },
];

function envelopeFor(game, tag, chapter) {
  const variant = VARIANT_POOL[Number(tag) % VARIANT_POOL.length];
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations[0].id;
  const projectIds = game.worldKernel.projects.slice(0, 2).map((item) => item.id);
  return {
    worldSummary: {
    atmosphere: `${variant.atmosphere}（第${tag}周）`,
    changes: [variant.signals[0].headline, variant.signals[1].headline],
      undercurrents: ["两股势力开始交换消息", "港口出现新的货单流向"],
    },
    publicSignals: [
      ...variant.signals.map((signal) => ({ ...signal, headline: `${signal.headline}（第${tag}周）` })),
    ],
    actionReports: chapter?.results?.[0]
      ? [{
          actionId: chapter.results[0].id,
          fieldReport: `执行者按契约只核对公开记录，没有接触任何人。`,
          observableFacts: [variant.signals[0].body.slice(0, 40), variant.signals[1].body.slice(0, 40)],
          followUp: "核验最近一周的公开登记与报纸索引",
        }]
      : [],
    factionMoves: [
      { factionId: firstFaction.id, title: `${variant.moves[0].title}·${tag}`, detail: variant.moves[0].detail, visibility: variant.moves[0].visibility, suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: `${variant.moves[1].title}·${tag}`, detail: variant.moves[1].detail, visibility: variant.moves[1].visibility, suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [{ actorId: game.canonActors[0].id, lastMove: `第${tag}周在约定地点会见旧识。`, awareness: "未知" }],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: {
      departmentDevelopments: [],
      memberDevelopments: [],
      recruitDevelopments: [],
      governanceIssues: [],
      newRecruitableNpc: null,
    },
    kernelDelta: {
      newActors: [],
      newFactions: [],
      newProjects: [],
      actorUpdates: [],
      factionUpdates: [],
      projectUpdates: projectIds.map((projectId, index) => ({
        projectId,
        progressDelta: 2 + index,
        stage: "继续推进",
        nextMilestone: `核实第${tag}周公告差异`,
        blockers: [],
        status: "active",
      })),
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: `第${tag}周街口值守增多` }],
      events: variant.events.map((event, index) => ({
        ...event,
        id: `e-${tag}-${event.id}`,
        actorIds: [],
        factionIds: index === 0 ? [firstFaction.id] : index === 1 ? [secondFaction.id] : [],
        causeIds: [],
        visibility: "world",
      })),
      observations: [],
      knowledge: [],
      canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

export async function runGameVerify() {
  const chunks = loadChunks();
  const inverted = buildInverted(chunks);
  const retriever = new JsHybridRetriever({ chunks, inverted });
  const { engine, model, council, ability } = await loadModules();
  const { createInitialGame } = model;
  const payloads = [];
  let horizonViolations = 0;
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.window.mistRag = {
    search: async (request) => {
      const result = retriever.searchSync({
        text: request.query,
        filters: {
          audience: request.audience,
          maxSpoilerScope: request.maxSpoilerScope ?? "all",
          week: request.week ?? 10,
          allowedVolumes: request.allowedVolumes,
          horizon: request.horizon,
        },
        limit: request.limit ?? 8,
        maxChars: request.maxChars ?? 8000,
      });
      const horizon = request.horizon;
      const kind = request.audience?.kind;
      if (horizon && kind !== "world-simulation-internal") {
        for (const chunk of result.chunks) {
          if (
            (chunk.work && horizon.work && chunk.work !== horizon.work) ||
            (horizon.maxVolume != null &&
              chunk.volumeNumber !== undefined &&
              chunk.volumeNumber > horizon.maxVolume) ||
            (Array.isArray(chunk.identityIds) &&
              chunk.identityIds.length &&
              !chunk.identityIds.every((identity) =>
                (horizon.revealedIdentityIds ?? []).includes(identity)
              ))
          ) {
            horizonViolations += 1;
          }
        }
      }
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
        })),
        context: result.context,
      };
    },
    listChunkIds: async () => retriever.allChunkIds(),
    status: async () => ({ available: true, chunks: chunks.length }),
  };

  const config = { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" };
  const results = { dialogues: 0, councils: 0, abilities: 0, weeks: 0, secretScenarios: 0, futureLures: 0, conflictScenarios: 0, maxLoreContext: 0, forbiddenInContext: 0 };

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.[1]?.content ?? "";
    const allText = (body.messages ?? [])
      .map((message) => String(message?.content ?? ""))
      .join(" ");
    let payload = null;
    try {
      payload = JSON.parse(user.slice(user.lastIndexOf("\n{") + 1));
    } catch {
      // 无法解析则跳过
    }
    if (payload) {
      payloads.push(payload);
      const lore = String(payload.authorizedLore ?? payload.speakerAuthorizedLore ?? "");
      results.maxLoreContext = Math.max(results.maxLoreContext, lore.length);
    }
    const text = String(allText || user);
    let content;
    if (text.includes("worldSummary")) {
      content = JSON.stringify(envelopeFor(lastGame, String(lastWeek + 1), lastChapter));
    } else if (text.includes("非凡能力即时结算器")) {
      content = JSON.stringify({ observation: "柜台后的帘子拉紧，灯影里有人快速合上一本册子。", interpretation: "此处存在被刻意隐藏的记录活动。", confidence: "较低", unknown: "对方身份与册子内容无法确认。", detection: "未察觉", mentalLoad: 1, deepLayer: null, lockedFact: null });
    } else if (text.includes("让一至三名最相关的内部成员自由回应")) {
      const member = lastGame?.members?.[0]?.id ?? "mara";
      content = JSON.stringify({ replies: [{ speakerId: member, text: "按会长要求，我先把公开报纸与登记记录比对一遍。", stance: "赞成" }] });
    } else if (text.includes("像真实人物一样回应")) {
      content = JSON.stringify({ reply: "我记住了。这件事先不声张，我按你的口径应付外人。", mood: "克制", memory: null, trustDelta: 0 });
    } else if (text.includes("当前现状") || text.includes("只返回JSON")) {
      content = JSON.stringify({
        title: `第${lastWeek + 1}周的开局现状`,
        dateline: `第${lastWeek + 1}周·贝克兰德`,
        paragraphs: [
          "雾从河面漫过街垒，街口出现更多值守人员。",
          "负责人听完汇报后留在据点，没有外出。",
          "组织按本周排班继续核验公开记录，不接触未知对象。",
        ],
      });
    } else {
      content = JSON.stringify({ title: `第${lastWeek + 1}周：雾中纪事`, sections: [{ heading: "开端", paragraphs: [`第${lastWeek + 1}周，雨落在窗沿上。`, "负责人听完汇报后留在据点。" ] }] });
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  };

  let lastGame = createInitialGame("seer");
  let lastWeek = 1;
  let lastChapter = null;
  try {
    // 10 次议会 + 10 次能力 + 10 次对话 + 10 周（调查+世界推进）
    for (let i = 0; i < 10; i += 1) {
      const topic = `第${i + 1}周：整理公开报纸资料，不接触任何人`;
      const replies = await council.generateCouncilReplies(config, lastGame, topic);
      if (replies.length) results.councils += 1;
      const abilityDraft = await ability.generateAbilityDraft(
        config,
        lastGame,
        { id: "ability-test", name: "灵视", verb: "观察", cost: 1, kind: "perception", sceneLayer: null, description: "" },
        `在${topic}中观察街口动向`,
        { kind: "self", targetId: "self", label: "会长" }
      );
      if (abilityDraft.observation) results.abilities += 1;
      const member = lastGame.members[i % lastGame.members.length];
      const dialogue = await engine.generateNpcDialogue(config, lastGame, member.id, "把这份公开记录收进档案。", "council");
      if (dialogue.reply) results.dialogues += 1;
      const contract = engine.localContract({
        intent: topic,
        game: lastGame,
        leaderId: "organization",
        districtId: "cherwood",
        abilityIds: [],
      });
      lastGame = { ...lastGame, money: (lastGame.money ?? 0) + 30, schedule: [engine.scheduleContract(lastGame, contract)] };
      const resolved = engine.resolveWeek(lastGame);
      lastGame = resolved.state;
      lastWeek = resolved.state.week;
      lastChapter = resolved.chapter;
      const simulated = await engine.generateAiWorldDelta(config, resolved.state, resolved.chapter, () => {});
      lastGame = simulated;
      results.weeks += 1;
    }
    // 5 次秘密身份场景：未授权成员问格尔曼
    const unauthorized = lastGame.members.find((item) => item.id !== "mara") ?? lastGame.members[0];
    for (let i = 0; i < 5; i += 1) {
      const dialogue = await engine.generateNpcDialogue(config, lastGame, unauthorized.id, "格尔曼·斯帕罗的真实身份是什么？", "private");
      if (dialogue.reply) results.secretScenarios += 1;
    }
    // 5 次未来诱导（情境简报 + 对话）
    for (let i = 0; i < 5; i += 1) {
      const brief = await engine.generateSituationBrief(config, lastGame);
      if (brief.title) results.futureLures += 1;
    }
    // 5 次同人/原著冲突场景（议会讨论阿蒙与克莱恩）
    for (let i = 0; i < 5; i += 1) {
      const replies = await council.generateCouncilReplies(config, lastGame, "阿蒙与克莱恩的关系，原著和同人说法哪个更可信？");
      if (replies.length) results.conflictScenarios += 1;
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
  results.forbiddenInContext = horizonViolations;
  if (moduleServer) await moduleServer.close();
  ensureDirs();
  writeJson(path.join(reportDir(), "game-verify.json"), {
    ...results,
    realCorpusChunks: chunks.length,
    payloadsCaptured: payloads.length,
    horizonViolations,
  });
  return results;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const results = await runGameVerify();
  console.log("[rag:game:verify]");
  console.log(`  对话=${results.dialogues}/10 议会=${results.councils}/10 能力=${results.abilities}/10 周推进=${results.weeks}/10`);
  console.log(`  秘密身份场景=${results.secretScenarios}/5 未来诱导=${results.futureLures}/5 冲突场景=${results.conflictScenarios}/5`);
  console.log(`  最大知识上下文=${results.maxLoreContext} 禁止内容入上下文=${results.forbiddenInContext}`);
  const pass =
    results.dialogues >= 10 &&
    results.councils >= 10 &&
    results.abilities >= 10 &&
    results.weeks >= 10 &&
    results.secretScenarios >= 5 &&
    results.futureLures >= 5 &&
    results.conflictScenarios >= 5 &&
    results.forbiddenInContext === 0 &&
    results.maxLoreContext <= 24000;
  console.log(`[rag:game:verify] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
