import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("council masthead and long-form copy keep readable contrast and scale", async () => {
  const [council, complete, experience] = await Promise.all([read("app/weekly-council.css"), read("app/complete-game.css"), read("app/experience-v12.css")]);
  assert.match(council, /council-masthead h1\{[^}]*color:#f4ead7/);
  assert.match(council, /council-panel\{color:#2d2924/);
  assert.match(complete, /reader-page\{font:calc\(16px/);
  assert.match(experience, /topic-messages p\{[^}]*font-size:15px!important/);
});

test("free ability use defaults to player intent and reports rule rejection inline", async () => {
  const [consoleSource, gameSource] = await Promise.all([read("app/ability-console.tsx"), read("app/complete-game.tsx")]);
  assert.match(consoleSource, /!props\.selectedId \|\| props\.selectedId === "free-intent"/);
  assert.match(consoleSource, /ability-inline-feedback" role="alert"/);
  assert.match(consoleSource, /aria-label="关闭即时能力反馈"/);
  assert.match(gameSource, /setAbilityError\(error instanceof Error/);
});

test("NPC speech is AI generated and a quiet week still requires AI world simulation", async () => {
  const [game, engine, council] = await Promise.all([
    read("app/complete-game.tsx"),
    read("app/game-engine.ts"),
    read("app/council-ai.ts"),
  ]);
  assert.match(game, /自由人物对话需要先连接AI模型/);
  assert.match(game, /本周没有结算，你可以检查接口后原样重试/);
  assert.match(game, /本地规则不会伪造世界事件/);
  assert.doesNotMatch(game, /我分四层讲|亲历、下属报告、个人推断与未知分别说清/);
  assert.match(engine, /playerIssuedNoOrders/);
  assert.match(engine, /玩家无行动绝不等于世界无事件/);
  assert.match(engine, /世界模型没有生成足够的报纸、传闻或公开征兆/);
  assert.match(engine, /世界模型没有让足够的独立势力采取行动/);
  assert.match(council, /不得使用“亲历\/下属报告\/个人推断\/未知”四段式标签/);
  assert.doesNotMatch(council, /亲历、下属报告、个人推断与未知分别说清/);
});

test("investigation wording cannot silently create a facility", async () => {
  const source = await read("app/game-engine.ts");
  assert.match(source, /function isExplicitConstruction/);
  assert.match(source, /const primaryClause = intent\.split/);
  assert.match(source, /explicitKind !== "自由行动" && proposedKind !== explicitKind/);
  assert.match(source, /proposedKind === "建设" && !isExplicitConstruction/);
  assert.match(source, /facilityId: safeKind === "建设"/);
  assert.doesNotMatch(source, /if \(\/建\|修建\|改造\|据点/);
});

test("map locations expose distinct dossiers, routes and withdrawal conditions", async () => {
  const source = await read("app/city-map-workspace.tsx");
  assert.match(source, /const ROUTE_NOTES/);
  assert.match(source, /function publicLocationIntel/);
  assert.match(source, /<strong>撤离<\/strong>/);
  assert.match(source, /地点情报与区域推断已分开记录/);
});

test("city workspace responds to its own embedded width without horizontal layer scrolling", async () => {
  const [source, council, component] = await Promise.all([read("app/experience-v12.css"), read("app/weekly-council.css"), read("app/weekly-council.tsx")]);
  assert.match(council, /\.agenda-panel>\.city-workspace\{grid-column:1\/-1;inline-size:100%;margin-top:0\}/);
  assert.match(source, /\.city-workspace \{ container: city-map \/ inline-size;/);
  assert.match(source, /@container city-map \(max-width: 900px\) \{[\s\S]*?\.city-workspace-head \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(source, /@container city-map \(max-width: 560px\) \{[\s\S]*?\.map-query \{ grid-template-columns: auto minmax\(0, 1fr\);/);
  assert.match(source, /\.map-layers \{[^}]*flex-wrap: wrap;[^}]*overflow-x: clip;/);
  assert.match(source, /\.city-workspace-head h2 \{[^}]*color: #eadfca;[^}]*word-break: keep-all;/);
  assert.match(source, /\.district-workspace > header h3 \{[^}]*color: #eadfca;/);
  assert.match(source, /\.council-table\.refined \{[^}]*top: 50%;[^}]*left: 42%;[^}]*translate: -50% -50%;[^}]*transform: none;/);
  assert.match(source, /\.council-seat\.inner-seat \{[^}]*right: auto;[^}]*bottom: auto;/);
  assert.match(source, /@media \(max-width: 900px\) \{[\s\S]*?\.council-seat\.seat-6 \{ left: auto; top: auto; right: 3%; bottom: 29%; \}/);
  assert.match(component, /COUNCIL_STAGE_COPY/);
  assert.match(component, /className="council-session-state"/);
  assert.match(component, /className="supervisor-rail-label"/);
});

test("weekly prose normalizes punctuation and carries consequences into the next council", async () => {
  const [source, reader] = await Promise.all([read("app/game-engine.ts"), read("app/complete-game.tsx")]);
  assert.match(source, /function cleanNarrative/);
  assert.match(source, /replace\(\/\^若继续\(\?:搁置\|放任\)/);
  assert.match(source, /heading: "下一次集会之前"/);
  assert.match(source, /还剩\$\{pressure\.deadline\}周/);
  assert.match(reader, /function normalizeNarrativeGame/);
  assert.match(reader, /section\.paragraphs\.map\(displayNarrative\)/);
});
