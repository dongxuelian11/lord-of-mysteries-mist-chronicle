import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the complete free-intent game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>灰雾纪事/);
  assert.match(html, /跳到主要内容/);
  assert.match(html, /你想让组织做什么/);
  assert.match(html, /生成行动契约/);
  assert.match(html, /当前主要压力/);
  assert.match(html, /本周日程/);
  assert.match(html, /游戏主导航/);
  assert.match(html, /调查/);
  assert.match(html, /晋升/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("implements the complete simulation systems and accessible Apple-style UI", async () => {
  const [app, engine, finale, finaleView, model, board, operations, css, finaleCss, layout] = await Promise.all([
    readFile(new URL("../app/complete-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/finale-system.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/great-smog-finale.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/investigation-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/organization-operations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/complete-game.css", import.meta.url), "utf8"),
    readFile(new URL("../app/finale-campaign.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /localStorage/);
  assert.match(app, /生成行动契约/);
  assert.match(app, /行动、证据与规则附录/);
  assert.match(app, /主据点/);
  assert.match(app, /部门授权/);
  assert.match(app, /晋升材料/);
  assert.match(app, /普通交谈不消耗行动/);
  assert.match(app, /sendChat/);
  assert.match(app, /character-dialogue/);
  assert.match(app, /重新阅读完整章节/);
  assert.match(app, /每周小说总结都会永久保存/);
  assert.match(app, /mist-chronicle-complete-v8/);
  assert.match(app, /LEGACY_SAVE_KEYS/);
  assert.match(app, /旧历史分支/);
  assert.match(app, /InvestigationBoard/);
  assert.match(app, /aria-label="游戏主导航"/);
  assert.match(engine, /interpretIntentWithAi/);
  assert.match(engine, /scheduleContract/);
  assert.match(engine, /resolveWeek/);
  assert.match(engine, /generateLiteraryChapter/);
  assert.doesNotMatch(engine, /chronicle: \[chapter, \.\.\.game\.chronicle\]\.slice/);
  assert.match(engine, /advanceSequence/);
  assert.match(engine, /discoverEvidence/);
  assert.match(engine, /refreshOpportunities/);
  assert.match(engine, /factionTurn/);
  assert.match(engine, /timelineAfterWeek/);
  assert.match(engine, /organizationConditions/);
  assert.match(engine, /abilityTagsFromText/);
  assert.match(engine, /resolveFatalSituation/);
  assert.match(engine, /resolveFinale/);
  assert.match(engine, /generateAiWorldDelta/);
  assert.match(engine, /connectEvidence/);
  assert.match(engine, /transformOrganization/);
  assert.match(engine, /buildPivots/);
  assert.match(engine, /createFinaleCampaign/);
  assert.match(finale, /resolveFinalePhase/);
  assert.match(finale, /名单与暗流/);
  assert.match(finale, /核心仪式之夜/);
  assert.match(finale, /player-link/);
  assert.match(finale, /canonContributors/);
  assert.match(finaleView, /本阶段并发危机/);
  assert.match(finaleView, /城市中的其他行动者/);
  assert.match(finaleView, /此前阶段战报/);
  assert.match(finaleView, /不会被叙事直接判死/);
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
  assert.match(board, /由证据开放的可能性/);
  assert.match(board, /世界没有等待你/);
  assert.match(board, /建立玩家假设连接/);
  assert.match(board, /原著人物的自主轨迹/);
  assert.match(operations, /成员留下的理由/);
  assert.match(operations, /下周基础结余/);
  assert.match(css, /cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /character-dialogue/);
  assert.match(css, /Legibility pass/);
  assert.match(css, /latest-chronicle/);
  assert.match(css, /investigation-grid/);
  assert.match(css, /organization-operations/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(finaleCss, /smog-crises/);
  assert.match(finaleCss, /prefers-reduced-motion:reduce/);
  assert.match(layout, /complete-game\.css/);
  assert.match(layout, /finale-campaign\.css/);
});
