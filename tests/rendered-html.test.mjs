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
  assert.match(html, /晋升/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("implements the complete simulation systems and accessible Apple-style UI", async () => {
  const [app, engine, model, css, layout] = await Promise.all([
    readFile(new URL("../app/complete-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/complete-game.css", import.meta.url), "utf8"),
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
  assert.match(app, /aria-label="游戏主导航"/);
  assert.match(engine, /interpretIntentWithAi/);
  assert.match(engine, /scheduleContract/);
  assert.match(engine, /resolveWeek/);
  assert.match(engine, /generateLiteraryChapter/);
  assert.match(engine, /advanceSequence/);
  assert.match(model, /sequence[s]?:/i);
  assert.match(model, /const RANK_EIGHT_RECIPES/);
  assert.match(model, /INITIAL_FACILITIES/);
  assert.match(model, /PressureMission/);
  assert.match(model, /background:/);
  assert.match(model, /core:/);
  assert.match(model, /voice:/);
  assert.match(model, /arc:/);
  assert.match(css, /cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /character-dialogue/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(layout, /complete-game\.css/);
});
