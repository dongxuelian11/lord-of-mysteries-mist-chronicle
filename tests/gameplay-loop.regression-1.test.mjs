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
  assert.match(consoleSource, /props\.onSelect\("free-intent"\)/);
  assert.match(consoleSource, /ability-command-tags/);
  assert.match(consoleSource, /不需要先选择能力/);
  assert.match(consoleSource, /ability-inline-feedback" role="alert"/);
  assert.match(consoleSource, /aria-label="关闭即时能力反馈"/);
  assert.match(gameSource, /setAbilityError\(error instanceof Error/);
});

test("NPC speech is AI generated and a quiet week uses independent planning plus a fixed newspaper", async () => {
  const [game, engine, agentPlanning, council, adjudicatorPrompt, authority, outputAdapter] = await Promise.all([
    read("app/complete-game.tsx"),
    read("app/game-engine.ts"),
    read("app/agent-planning-service.ts"),
    read("app/council-ai.ts"),
    read("app/world-adjudicator-prompt.ts"),
    read("app/world-authority.ts"),
    read("app/world-output-adapter.ts"),
  ]);
  assert.match(game, /自由人物对话需要先连接AI模型/);
  assert.match(game, /本周尚未走完，你可以检查连接后从同一局面继续，已经发生的事不会被重掷/);
  assert.match(game, /连接人物与叙事模型后，成员才能回应自由决议/);
  assert.doesNotMatch(game, /我分四层讲|亲历、下属报告、个人推断与未知分别说清/);
  assert.match(engine, /playerIssuedNoOrders/);
  assert.match(authority, /entityState: "adjudicatorWorld"/);
  assert.doesNotMatch(engine, /factions: game\.factions\.map\(\(item\) => \(\{ id: item\.id/);
  assert.doesNotMatch(engine, /canonActors: game\.canonActors\.map\(\(item\) => \(\{ id: item\.id/);
  assert.match(engine, /Legacy UI collections are compatibility projections only/);
  assert.match(engine, /adaptWorldAdjudication/);
  assert.doesNotMatch(engine, /function parseWorldKernelDelta/);
  assert.match(outputAdapter, /function parseWorldKernelDelta/);
  assert.match(outputAdapter, /export function adaptWorldAdjudication/);
  assert.match(engine, /planAutonomousAgentsForWeek/);
  assert.match(agentPlanning, /planActiveAgentsIndependently/);
  assert.match(adjudicatorPrompt, /允许真正安静的一周/);
  assert.match(adjudicatorPrompt, /固定报纸必须给出 2 至 4 条/);
  assert.doesNotMatch(engine, /世界模型没有让足够的独立势力采取行动/);
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

test("Backlund map exposes district, block and strategic-point control", async () => {
  const [source, mapData] = await Promise.all([read("app/backlund-control-map.tsx"), read("app/backlund-map-data.ts")]);
  assert.match(source, /projectFactionInfluenceForPlayer/);
  assert.match(source, /已定位情报/);
  assert.match(source, /onFormDirection/);
  assert.match(source, /point\.controllerId/);
  assert.match(mapData, /BACKLUND_AUTHORED_DISTRICTS/);
  assert.match(mapData, /AuthoredStrategicPointSeed/);
});

test("Backlund control map keeps its three-pane desktop workspace bounded", async () => {
  const [source, component] = await Promise.all([read("app/management-refactor.css"), read("app/weekly-council.tsx")]);
  assert.match(source, /\.backlund-control-map\{display:grid;grid-template-columns:230px minmax\(360px,1fr\) 330px;[^}]*overflow:hidden/);
  assert.match(source, /\.control-districts,\.control-point-dossier\{min-height:0;overflow:auto/);
  assert.match(source, /\.control-blocks\{min-height:0;overflow:auto/);
  assert.match(component, /aria-label="贝克兰德城市地图"/);
  assert.match(component, /BacklundControlMap/);
});

test("weekly prose normalizes punctuation and carries consequences into the next council", async () => {
  const [source, reader, saves, session] = await Promise.all([read("app/game-engine.ts"), read("app/complete-game.tsx"), read("app/save-system.ts"), read("app/game-session-controller.ts")]);
  assert.match(source, /function cleanNarrative/);
  assert.match(source, /replace\(\/\^若\(\?:继续\(\?:搁置\|放任\)\|不加干预\)/);
  assert.match(source, /heading: "下一次集会之前"/);
  assert.match(source, /还剩\$\{pressure\.deadline\}周/);
  assert.doesNotMatch(reader, /function normalizeNarrativeGame/);
  assert.match(reader, /loadGameSession/);
  assert.match(session, /migrateStoredGame\(JSON\.parse\(/);
  assert.match(saves, /export function normalizeStoredGame/);
  assert.match(saves, /section\.paragraphs \?\? \[\]/);
  assert.match(saves, /map\(cleanStoredNarrative\)/);
});
