import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the playable game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>灰雾纪事/);
  assert.match(html, /跳到主要内容/);
  assert.match(html, /局势/);
  assert.match(html, /贝克兰德/);
  assert.match(html, /贝克兰德十城区交互地图/);
  assert.match(html, /北区/);
  assert.match(html, /码头区/);
  assert.match(html, /安排本周行动/);
  assert.match(html, /预估成功/);
  assert.match(html, /当前状况/);
  assert.match(html, /本局主目标/);
  assert.match(html, /行动建议/);
  assert.match(html, /区域背景/);
  assert.match(html, /途径主动能力/);
  assert.match(html, /结束本周/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps interaction, persistence, and accessibility in the product source", async () => {
  const [page, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage/);
  assert.match(page, /newGameStep/);
  assert.match(page, /TurnReport/);
  assert.match(page, /新证据已归档/);
  assert.match(page, /revealedClues/);
  assert.match(page, /prepareSuggestedAction/);
  assert.match(page, /spirituality/);
  assert.match(page, /useAbility/);
  assert.match(page, /abilityResolutionText/);
  assert.match(page, /showDistrictDetail/);
  assert.match(page, /showOrderComposer/);
  assert.match(page, /区域线索/);
  assert.match(page, /buildNarrativeResult/);
  assert.match(page, /INCIDENT_VOICES/);
  assert.match(page, /未受干预的暗流/);
  assert.match(page, /你下达的指令/);
  assert.match(page, /aria-label="主要页面"/);
  assert.match(page, /Ctrl|ctrlKey/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /city-map-v1\.png/);
  assert.match(css, /\.turn-report-modal/);
  assert.match(css, /\.mission-control/);
  assert.match(css, /\.ability-control/);
  assert.match(css, /\.district-background/);
  assert.match(css, /\.map-first-grid/);
  assert.match(css, /\.district-drawer/);
  assert.match(css, /\.order-sheet/);
  assert.match(css, /\.narrative-chapter/);
  assert.match(css, /\.chapter-prose/);
  assert.match(css, /\.world-movements/);
  assert.match(layout, /灰雾纪事/);
  assert.match(packageJson, /lucide-react/);
});
