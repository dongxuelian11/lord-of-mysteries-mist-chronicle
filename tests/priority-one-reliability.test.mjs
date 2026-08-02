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
  assert.match(engine, /本次禁止复写的近期公开文本/);
  assert.match(engine, /至少两条公开消息应来自近期消息未覆盖的事件结果或社会侧面/);
});

test("world envelopes reject mechanical weekly repetition and repair raw control characters", async () => {
  const engine = await read("app/game-engine.ts");
  assert.match(engine, /function textSimilarity/);
  assert.match(engine, /公开消息与最近四周高度复写/);
  assert.match(engine, /势力行动只是复述上一周/);
  assert.match(engine, /character\.charCodeAt\(0\) < 32/);
  assert.match(engine, /JSON\.parse\(repaired\)/);
});

test("non-investigation orders keep their own semantics instead of becoming clue hunts", async () => {
  const engine = await read("app/game-engine.ts");
  for (const domain of ["finance", "training", "security", "recruitment", "cover", "diplomacy"]) {
    assert.match(engine, new RegExp(`domain === "${domain}"`));
  }
  assert.match(engine, /function seeksEvidence\(contract/);
  assert.match(engine, /\? discoverEvidence/);
  assert.match(engine, /if \(!report \|\| !seeksEvidence\(result\.contract\)\) return result/);
  assert.match(engine, /非调查行动不得凭空发现档案补录、马车路线、晚宴名单/);
});

test("no-order literary chapters cannot make the player investigate off-screen", async () => {
  const engine = await read("app/game-engine.ts");
  assert.match(engine, /function literaryAgencyIssue/);
  assert.match(engine, /本周没有任何玩家决议/);
  assert.match(engine, /连续性编辑正在纠正玩家行动越权/);
  assert.match(engine, /一次连续性修复后仍未通过/);
});

test("negated artifact mentions do not silently replace the chosen pathway ability", async () => {
  const ability = await read("app/ability-system.ts");
  assert.match(ability, /artifactMentionNegated/);
  assert.match(ability, /explicitlyUsesArtifact/);
  assert.match(ability, /!artifactMentionNegated && explicitlyUsesArtifact/);
});

test("weekly prose distinguishes internal governance, issued orders, and uncommitted retries", async () => {
  const engine = await read("app/game-engine.ts");
  const app = await read("app/complete-game.tsx");
  assert.match(engine, /handledInsideBase/);
  assert.match(engine, /你在据点内亲自主持了这项工作/);
  assert.match(engine, /组织执行了本周决议；它没有直接推进当前危机/);
  assert.match(engine, /results\.length[\s\S]*组织本周没有发出正式行动命令/);
  assert.match(app, /readerChapterCommitted/);
  assert.match(app, /本周尚未结算 · 可原样重试/);
  assert.match(app, /activeReaderChapter\.source !== "ai" && readerChapterCommitted && aiReady/);
});
