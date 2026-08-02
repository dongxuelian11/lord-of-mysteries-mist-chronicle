import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop UI enforces a readable type floor instead of preserving micro text", async () => {
  const css = await read("app/complete-game.css");
  assert.match(css, /Desktop readability contract/);
  assert.match(css, /@media\(min-width:761px\)\{[\s\S]*?\.complete-game-shell p,[\s\S]*?font-size:14px/);
  assert.match(css, /\.complete-game-shell small,[\s\S]*?font-size:12px/);
  assert.match(css, /\.complete-game-shell button,[\s\S]*?font-size:13px/);
  assert.match(css, /\.character-dialogue p span,[^}]*font-size:14px/);
});

test("world state commits before literary prose and a failed chapter can be retried alone", async () => {
  const app = await read("app/complete-game.tsx");
  const worldCommit = app.indexOf("setGame(simulatedState)");
  const literaryCall = app.indexOf("generateLiteraryChapter(aiConfig, simulatedState");
  assert.ok(worldCommit > 0 && literaryCall > worldCommit, "world state must commit before literary generation starts");
  assert.match(app, /世界事实与本周结算已经安全保存，可稍后只重试文学章节/);
  assert.match(app, /async function retryLiteraryChapter/);
  assert.match(app, /只补写文学章节/);
  assert.match(app, /世界事实没有回滚，也不会重复结算/);
});

test("malformed world envelopes receive one bounded structural retry", async () => {
  const engine = await read("app/game-engine.ts");
  assert.match(engine, /function worldEnvelopeIssue/);
  assert.match(engine, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(engine, /正在进行一次结构修复/);
  assert.match(engine, /结构修复后仍未达到世界回合最低要求/);
  assert.match(engine, /requestWorldEnvelope\(worldConfig/);
  assert.match(engine, /无玩家命令的一周不应生成行动报告/);
});
