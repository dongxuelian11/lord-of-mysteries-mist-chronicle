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
  const [engine, envelope] = await Promise.all([read("app/game-engine.ts"), read("app/world-envelope.ts")]);
  assert.match(envelope, /function worldEnvelopeIssue/);
  assert.match(envelope, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(envelope, /正在进行一次结构修复/);
  assert.match(envelope, /结构修复后仍未达到世界回合最低要求/);
  assert.match(engine, /requestWorldEnvelope\(worldConfig/);
  assert.match(envelope, /无玩家命令的一周不应生成行动报告/);
  assert.match(envelope, /本次禁止复写的近期公开文本/);
  assert.match(envelope, /至少两条公开消息应来自近期消息未覆盖的事件结果或社会侧面/);
});

test("world envelopes reject mechanical weekly repetition and repair raw control characters", async () => {
  const [envelope, modelOutput, adjudicatorPrompt] = await Promise.all([read("app/world-envelope.ts"), read("app/model-output.ts"), read("app/world-adjudicator-prompt.ts")]);
  assert.match(modelOutput, /function textSimilarity/);
  assert.match(envelope, /async function repairPublicSignals/);
  assert.match(envelope, /世界事实已经完成裁决并被冻结/);
  assert.match(envelope, /唯一输出权限是 publicSignals/);
  assert.match(envelope, /两次公开消息局部重写后仍未通过校验/);
  assert.match(envelope, /全部公开消息都与最近四周高度复写/);
  assert.match(envelope, /repeatedSignals\.length === validSignals\.length/);
  assert.match(envelope, /本周发生的势力行动全部只是复述上一周/);
  assert.match(adjudicatorPrompt, /不得为了热闹制造事件/);
  assert.match(modelOutput, /character\.charCodeAt\(0\) < 32/);
  assert.match(modelOutput, /JSON\.parse\(repaired\)/);
});

test("non-investigation orders keep their own semantics instead of becoming clue hunts", async () => {
  const [engine, adjudicatorPrompt] = await Promise.all([read("app/game-engine.ts"), read("app/world-adjudicator-prompt.ts")]);
  for (const domain of ["finance", "training", "security", "recruitment", "cover", "diplomacy"]) {
    assert.match(engine, new RegExp(`domain === "${domain}"`));
  }
  assert.match(engine, /function seeksEvidence\(contract/);
  assert.doesNotMatch(engine, /function discoverEvidence/);
  assert.match(engine, /const actionEvidenceIds = seeksEvidence\(result\.contract\)/);
  assert.match(engine, /findings: observableFacts\.length \? observableFacts : result\.findings/);
  assert.match(adjudicatorPrompt, /非调查行动不得凭空发现档案补录、马车路线、宴会名单/);
});

test("recruitment governance is not mistaken for recruiting a workflow as a person", async () => {
  const engine = await read("app/game-engine.ts");
  assert.match(engine, /function isInternalGovernanceIntent/);
  assert.match(engine, /const affirmativeIntent = intent\.replace/);
  assert.match(engine, /governanceIntent \? "自由行动"/);
  assert.match(engine, /if \(contract\.kind === "招募" \|\| isRecruitmentIntent\(text\)\) return "recruitment"/);
  assert.match(engine, /档案保密\|名单泄露\|保密流程/);
});

test("no-order literary chapters cannot make the player investigate off-screen", async () => {
  const [engine, literary] = await Promise.all([read("app/game-engine.ts"), read("app/literary-generation-service.ts")]);
  assert.match(engine, /export \{ generateLiteraryChapter \}/);
  assert.match(literary, /function literaryAgencyIssue/);
  assert.match(literary, /本周没有任何玩家决议/);
  assert.match(literary, /连续性编辑正在局部纠正越界段落/);
  assert.match(literary, /两次局部连续性修复后仍未通过/);
  assert.match(literary, /一次只能改写一个越界段落/);
  assert.match(literary, /const externalPlace =/);
  assert.match(literary, /const sceneAction =/);
  assert.match(literary, /放进了外部地点的亲历场景/);
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
  assert.match(engine, /不加干预/);
  assert.match(engine, /results\.length[\s\S]*组织本周没有发出正式行动命令/);
  assert.match(app, /readerChapterCommitted/);
  assert.match(app, /本周尚未结算 · 可原样重试/);
  assert.match(app, /readerChapterCommitted && aiReady/);
  assert.match(app, /安全重写文学章节/);
});
