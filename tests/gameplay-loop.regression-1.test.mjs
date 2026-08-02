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

test("offline council replies cite state, responsibility and a concrete next step", async () => {
  const source = await read("app/council-system.ts");
  assert.match(source, /function topicEvidence/);
  assert.match(source, /createLocalCouncilReplies/);
  assert.match(source, /第\$\{fact\.week\}周·\$\{fact\.source\}/);
  assert.match(source, /topic\.includes\(fact\.subject\) \? 120 : 0/);
  assert.match(source, /explicitSubjects\.includes\(item\.fact\.subject\)/);
  assert.match(source, /const evidenceText = evidence\[index\]/);
  assert.match(source, /topic\.includes\(item\.shortName\)/);
  assert.match(source, /已确认\|联系\|来源/);
  assert.match(source, /封印物\|挂坠\|异常/);
  assert.match(source, /停止条件|撤离方向|交叉验证/);
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

test("weekly prose normalizes punctuation and carries consequences into the next council", async () => {
  const source = await read("app/game-engine.ts");
  assert.match(source, /function cleanNarrative/);
  assert.match(source, /heading: "下一次集会之前"/);
  assert.match(source, /还剩\$\{pressure\.deadline\}周/);
});
