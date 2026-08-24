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
  const durableCommit = app.indexOf("await persistActiveGameAsync(simulatedState)");
  const worldCommit = app.indexOf("setGame(simulatedState)");
  const literaryCall = app.indexOf("generateLiteraryChapter(aiConfig, simulatedState");
  assert.ok(durableCommit > 0 && worldCommit > durableCommit && literaryCall > worldCommit, "durable acknowledgement must precede UI advance and literary generation");
  assert.match(app, /世界事实与本周结算已经安全保存，可稍后只重试文学章节/);
  assert.match(app, /async function retryLiteraryChapter/);
  assert.match(app, /只补写文学章节/);
  assert.match(app, /世界事实没有回滚，也不会重复结算/);
});

test("finale rule and world outcomes receive durable acknowledgement before becoming visible", async () => {
  const app = await read("app/complete-game.tsx");
  const start = app.indexOf("async function resolveFinaleStage()");
  const end = app.indexOf("function applyManagementChange", start);
  const finale = app.slice(start, end);
  const ruleCommit = finale.indexOf("await persistActiveGameAsync(pendingState)");
  const ruleVisible = finale.indexOf("setGame(pendingState)");
  const worldCommit = finale.indexOf("await persistActiveGameAsync(simulated)");
  const worldVisible = finale.indexOf("setGame(simulated)");
  const literaryCall = finale.indexOf("generateLiteraryChapter(aiConfig, simulated");
  assert.ok(ruleCommit > 0 && ruleVisible > ruleCommit, "finale rule resolution and its pending world-turn identity must be durable before they advance the UI");
  assert.ok(worldCommit > ruleVisible && worldVisible > worldCommit, "finale world resolution must be durable before it advances the UI");
  assert.ok(literaryCall > worldVisible, "finale literary generation must begin only after the durable world result is visible");
});

test("malformed world envelopes receive one bounded structural retry", async () => {
  const [engine, worldTurn, envelope] = await Promise.all([read("app/game-engine.ts"), read("app/game-engine/world-turn-orchestrator.ts"), read("app/world-envelope.ts")]);
  const worldRules = `${engine}\n${worldTurn}`;
  assert.match(envelope, /function worldEnvelopeIssue/);
  assert.match(envelope, /while \(durableAttempt < 2 && preModelFailures < 2\)/);
  assert.match(envelope, /worldAttemptStarted/);
  assert.match(envelope, /正在进行一次结构修复/);
  assert.match(envelope, /结构修复后仍未达到世界回合最低要求/);
  assert.match(worldRules, /requestWorldEnvelope\(worldConfig/);
  assert.match(envelope, /无玩家命令的一周不应生成行动报告/);
  assert.match(envelope, /本次禁止复写的近期公开文本/);
  assert.match(envelope, /公开消息可以是0至4条/);
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
  const [engine, resolution, worldTurn, adjudicatorPrompt] = await Promise.all([read("app/game-engine.ts"), read("app/game-engine/week-resolution.ts"), read("app/game-engine/world-turn-orchestrator.ts"), read("app/world-adjudicator-prompt.ts")]);
  const rules = `${engine}\n${resolution}\n${worldTurn}`;
  for (const domain of ["finance", "training", "security", "recruitment", "cover", "diplomacy"]) {
    assert.match(rules, new RegExp(`domain === "${domain}"`));
  }
  assert.match(rules, /function seeksEvidence\(contract/);
  assert.doesNotMatch(rules, /function discoverEvidence/);
  assert.match(rules, /const actionEvidenceIds = seeksEvidence\(result\.contract\)/);
  assert.match(rules, /findings: observableFacts\.length \? observableFacts : result\.findings/);
  assert.match(adjudicatorPrompt, /非调查行动不得凭空发现档案补录、马车路线、宴会名单/);
});

test("recruitment governance is not mistaken for recruiting a workflow as a person", async () => {
  const [engine, resolution, contracts] = await Promise.all([read("app/game-engine.ts"), read("app/game-engine/week-resolution.ts"), read("app/game-engine/action-contracts.ts")]);
  const rules = `${engine}\n${resolution}`;
  assert.match(contracts, /function isInternalGovernanceIntent/);
  assert.match(contracts, /const affirmativeIntent = intent\.replace/);
  assert.match(contracts, /governanceIntent \? "自由行动"/);
  assert.match(rules, /if \(contract\.kind === "招募" \|\| isRecruitmentIntent\(text\)\) return "recruitment"/);
  assert.match(rules + contracts, /档案保密\|名单泄露\|保密流程/);
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
  const [engine, resolution] = await Promise.all([read("app/game-engine.ts"), read("app/game-engine/week-resolution.ts")]);
  const rules = `${engine}\n${resolution}`;
  const app = await read("app/complete-game.tsx");
  assert.match(rules, /handledInsideBase/);
  assert.match(rules, /你在据点内亲自主持了这项工作/);
  assert.match(rules, /组织执行了本周决议；它没有直接推进当前危机/);
  assert.match(rules, /不加干预/);
  assert.match(rules, /results\.length[\s\S]*组织本周没有发出正式行动命令/);
  assert.match(app, /readerChapterCommitted/);
  assert.match(app, /本周尚未结算 · 可原样重试/);
  assert.match(app, /readerChapterCommitted && aiReady/);
  assert.match(app, /安全重写文学章节/);
});
