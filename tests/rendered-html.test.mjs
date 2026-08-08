import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

async function requestWorker(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(request, { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server always renders the title screen before a save or new game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>灰雾纪事/);
  assert.match(html, /命运已在落槌前投下阴影/);
  assert.match(html, /尚无可读取存档/);
  assert.match(html, /开始新游戏/);
  assert.match(html, /模型与世界资料/);
  assert.match(html, /每次打开都从标题页进入/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("DeepSeek relay validates requests without exposing an open proxy", async () => {
  const response = await requestWorker(new Request("http://localhost/api/ai/deepseek", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /DeepSeek API Key/);
});

test("implements the complete simulation systems and accessible Apple-style UI", async () => {
  const [app, title, council, prologue, abilitySystem, abilityConsole, engine, worldEnvelope, aiClient, aiSettings, aiRoute, finale, finaleView, model, managementConsole, css, councilCss, v10Css, v11Css, finaleCss, apiCss, layout] = await Promise.all([
    readFile(new URL("../app/complete-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/title-screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/weekly-council.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/opening-prologue.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ability-system.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ability-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/world-envelope.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ai-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ai-settings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/deepseek/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/finale-system.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/great-smog-finale.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/organization-management-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/complete-game.css", import.meta.url), "utf8"),
    readFile(new URL("../app/weekly-council.css", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-v10.css", import.meta.url), "utf8"),
    readFile(new URL("../app/experience-v11.css", import.meta.url), "utf8"),
    readFile(new URL("../app/finale-campaign.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api-settings.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const controlMap = await readFile(new URL("../app/backlund-control-map.tsx", import.meta.url), "utf8");
  assert.match(app, /localStorage/);
  assert.match(app, /议桌对发言的规则化理解/);
  assert.match(app, /行动、证据与规则附录/);
  assert.match(managementConsole, /组织经营账簿/);
  assert.match(managementConsole, /日常执行由四名负责人自行处理/);
  assert.match(app, /晋升材料/);
  assert.match(app, /能力规则预览/);
  assert.match(app, /权柄前提/);
  assert.match(app, /直接交谈，不消耗行动/);
  assert.match(app, /sendChat/);
  assert.match(app, /character-dialogue/);
  assert.match(council, /重读小说章节/);
  assert.match(app, /每周小说总结都会永久保存/);
  assert.match(app, /mist-chronicle-complete-v13/);
  assert.match(app, /LEGACY_SAVE_KEYS/);
  assert.match(app, /旧历史分支/);
  assert.doesNotMatch(app, /InvestigationBoard/);
  assert.match(council, /BacklundControlMap/);
  assert.match(app, /aria-label="游戏主导航"/);
  assert.match(app, /按我的方式形成决议/);
  assert.match(app, /self-action-console/);
  assert.match(app, /nameExposure/);
  assert.match(app, /resolveImmediateAbility/);
  assert.match(app, /TitleScreen/);
  assert.match(app, /SituationOpening/);
  assert.match(app, /本周没有完成世界推演，你可以检查接口后从已锁定事实继续/);
  assert.match(engine, /interpretIntentWithAi/);
  assert.match(engine, /scheduleContract/);
  assert.match(engine, /resolveWeek/);
  assert.match(engine, /generateLiteraryChapter/);
  assert.doesNotMatch(engine, /chronicle: \[chapter, \.\.\.game\.chronicle\]\.slice/);
  assert.match(engine, /advanceSequence/);
  assert.match(engine, /actionEvidenceIds/);
  assert.match(worldEnvelope, /行动报告缺少可核验的现场事实/);
  assert.match(engine, /refreshOpportunities/);
  assert.match(engine, /applyWorldTurn/);
  assert.match(engine, /timelineAfterWeek/);
  assert.match(engine, /organizationConditions/);
  assert.match(engine, /abilitiesFor/);
  assert.match(engine, /resolveFatalSituation/);
  assert.match(engine, /resolveFinale/);
  assert.match(engine, /generateAiWorldDelta/);
  assert.match(engine, /generateNpcDialogue/);
  assert.match(engine, /generateSituationBrief/);
  assert.match(engine, /playerIssuedNoOrders/);
  assert.match(engine, /publicSignals/);
  assert.match(engine, /worldSnapshots/);
  assert.match(engine, /adjudicatorWorld/);
  assert.match(engine, /autonomousAgentProposals/);
  assert.match(engine, /planActiveAgentsIndependently/);
  assert.doesNotMatch(engine, /persistentWorld: \{ \.\.\.game\.worldKernel/);
  assert.match(engine, /kernelDelta/);
  assert.match(engine, /authorizedLore/);
  assert.match(engine, /actionReports/);
  assert.match(engine, /现场述职/);
  assert.match(engine, /emergentLead/);
  assert.match(engine, /ai-emergent/);
  assert.match(engine, /connectEvidence/);
  assert.match(engine, /transformOrganization/);
  assert.match(engine, /buildPivots/);
  assert.match(engine, /createFinaleCampaign/);
  assert.match(finale, /resolveFinalePhase/);
  assert.match(finale, /crisisCandidates/);
  assert.match(finale, /buildStageCrises/);
  assert.match(finale, /aftermathLedger/);
  assert.match(app, /refreshFinaleFronts/);
  assert.match(app, /generateAiWorldDelta\(aiConfig, next, localChapter/);
  assert.doesNotMatch(finale, /const STAGES/);
  assert.match(finaleView, /本阶段并发危机/);
  assert.match(finaleView, /城市中的其他行动者/);
  assert.match(finaleView, /此前阶段战报/);
  assert.match(finaleView, /不会被叙事直接判死/);
  assert.match(aiClient, /deepseek-v4-flash/);
  assert.match(aiClient, /response_format/);
  assert.match(aiClient, /testModelConnection/);
  assert.match(aiClient, /请求过于频繁或账户额度不足/);
  assert.match(aiSettings, /DeepSeek V4 Flash/);
  assert.match(aiSettings, /测试真实连接/);
  assert.match(aiSettings, /小说生成模式/);
  assert.match(aiSettings, /专用世界推演模型/);
  assert.match(aiSettings, /设定知识库已启用/);
  assert.match(aiSettings, /世界推演补充资料/);
  assert.match(aiSettings, /AI 世界推演已暂停/);
  assert.match(aiSettings, /游戏不会用本地事件表冒充人物回应或世界变化/);
  assert.doesNotMatch(aiSettings, /当前使用离线规则/);
  assert.match(aiRoute, /api\.deepseek\.com\/chat\/completions/);
  assert.match(aiRoute, /ALLOWED_MODELS/);
  assert.match(aiRoute, /Cache-Control/);
  assert.match(model, /sequence[s]?:/i);
  assert.match(model, /const RANK_EIGHT_RECIPES/);
  assert.match(model, /INITIAL_FACILITIES/);
  assert.match(model, /PressureMission/);
  assert.match(model, /EvidenceNode/);
  assert.match(model, /FactionState/);
  assert.match(model, /TimelineEvent/);
  assert.match(model, /INITIAL_OPPORTUNITIES/);
  assert.match(model, /FIXED_RECRUIT_POOL/);
  assert.match(model, /ADVANCEMENT_RITUALS/);
  assert.match(model, /FatalSituation/);
  assert.match(model, /EndingState/);
  assert.match(model, /background:/);
  assert.match(model, /core:/);
  assert.match(model, /voice:/);
  assert.match(model, /arc:/);
  assert.match(model, /DialogueThread/);
  assert.match(model, /CouncilRecord/);
  assert.match(model, /WorldSignal/);
  assert.match(model, /WorldSnapshot/);
  assert.match(model, /worldKernel/);
  assert.match(council, /最高议会/);
  assert.match(council, /正式参席/);
  assert.match(council, /进入负责人的治理对话/);
  assert.match(council, /外部人士不得进入会议/);
  assert.match(council, /闭会并进入推演/);
  assert.match(council, /BacklundControlMap/);
  assert.match(council, /governance-owners/);
  assert.match(council, /八项职责索引/);
  assert.match(council, /同一负责人只出现一次/);
  assert.doesNotMatch(council, /member-agendas/);
  assert.match(council, /区域 → 区块 → 战略点/);
  assert.match(controlMap, /projectFactionInfluenceForPlayer/);
  assert.match(controlMap, /已定位情报/);
  assert.match(controlMap, /onFormDirection/);
  assert.match(app, /key={`\$\{game\.week\}:\$\{councilDecisionSignal\}`}/);
  assert.doesNotMatch(engine, /visibleFactionMoves:/);
  assert.match(engine, /事实包故意排除了全知世界层/);
  assert.match(engine, /changes: publicSignals/);
  assert.match(council, /自由讨论/);
  assert.match(council, /一键整理意见/);
  assert.match(council, /独立世界推演/);
  assert.match(council, /送上议桌的报纸与传闻/);
  assert.match(title, /命运已在落槌前投下阴影/);
  assert.match(title, /开始新游戏/);
  assert.match(title, /世界推演模型正在重写这一页/);
  assert.doesNotMatch(app, /我分四层讲|亲历、下属报告、个人推断与未知分别说清/);
  assert.doesNotMatch(council, /把亲历、下属报告、个人推断与未知分别说清/);
  assert.match(prologue, /在第一场密议前，确定组织从哪里开始/);
  assert.match(prologue, /姓名或长期化名/);
  assert.match(prologue, /推门入席/);
  assert.match(prologue, /选择这条途径如何落到你身上/);
  assert.match(prologue, /getPathwayOrigins/);
  assert.match(prologue, /玩家不直接选择序列/);
  assert.match(council, /组织奠基/);
  assert.match(council, /foundationSteps/);
  assert.match(abilitySystem, /generateAbilityDraft/);
  assert.match(abilitySystem, /resolveImmediateAbility/);
  assert.match(abilitySystem, /continueAbilityScene/);
  assert.match(abilitySystem, /lockedHiddenFacts/);
  assert.match(abilityConsole, /自由输入 · 规则判定 · AI反馈/);
  assert.match(abilityConsole, /提交自由能力命令/);
  assert.match(abilityConsole, /DREAM LAYER/);
  assert.match(abilityConsole, /SPIRIT WORLD/);
  assert.match(abilityConsole, /点击插入自由命令/);
  assert.match(abilitySystem, /abilityForFreeIntent/);
  assert.match(abilitySystem, /绝不把“主动进入灵界”改写成触碰吊坠/);
  assert.match(abilityConsole, /失控风险始终存在/);
  assert.match(abilityConsole, /不会偷换行动/);
  assert.match(managementConsole, /组织经营账簿/);
  assert.match(managementConsole, /声望/);
  assert.match(managementConsole, /暴露/);
  assert.match(managementConsole, /敌意/);
  assert.match(managementConsole, /控制/);
  assert.match(css, /cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /character-dialogue/);
  assert.match(css, /Legibility pass/);
  assert.match(css, /latest-chronicle/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /title-fog\{[^}]*pointer-events:none/);
  assert.match(css, /title-settings-backdrop\{z-index:180\}/);
  assert.match(councilCss, /council-room/);
  assert.match(councilCss, /council-table/);
  assert.match(councilCss, /living-dialogue/);
  assert.match(councilCss, /prefers-reduced-motion:reduce/);
  assert.match(v10Css, /prologue-modal/);
  assert.match(v10Css, /council-intelligence/);
  assert.match(v10Css, /font:16px\/1\.82/);
  assert.match(v11Css, /global-ability-trigger/);
  assert.match(v11Css, /ability-scene-backdrop/);
  assert.match(v11Css, /prefers-reduced-motion:reduce/);
  assert.match(finaleCss, /smog-crises/);
  assert.match(finaleCss, /prefers-reduced-motion:reduce/);
  assert.match(apiCss, /provider-choice/);
  assert.match(apiCss, /prefers-reduced-motion:reduce/);
  assert.match(layout, /complete-game\.css/);
  assert.match(layout, /finale-campaign\.css/);
  assert.match(layout, /api-settings\.css/);
  assert.match(layout, /weekly-council\.css/);
  assert.match(layout, /experience-v10\.css/);
  assert.match(layout, /experience-v11\.css/);
});
