import assert from "node:assert/strict";
import test, { after } from "node:test";
import { runEval } from "../scripts/rag/eval.mjs";
import { closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

after(() => closeRuntimeServer());

test("RAG V2 固定夹具评测：泄漏为 0 且确定性通过", async () => {
  const first = await runEval();
  assert.equal(first.new.leakageRate, 0, "unauthorized leakage 必须为 0");
  assert.ok(first.caseCount >= 10, `至少 10 个评测用例，实际 ${first.caseCount}`);
  assert.ok(
    first.new.recall10 >= 0.7,
    `新检索 Recall@10 应 >= 0.7，实际 ${first.new.recall10}`
  );
  assert.ok(
    first.new.sourceHit >= 0.8,
    `expected-source hit rate 应 >= 0.8，实际 ${first.new.sourceHit}`
  );
  assert.ok(first.new.avgLatencyMs < 50, "同步检索延迟应低于 50ms");
  // 无 embedding 配置时自动降级为 lexical-only
  assert.ok(
    first.cases.every((item) => item.new.fallbackMode === "lexical-only"),
    "未配置 embedding 时全部用例应处于 lexical-only 模式"
  );
  // 确定性：跑两次结果一致
  const second = await runEval();
  assert.deepEqual({ ...first.new, avgLatencyMs: 0 }, { ...second.new, avgLatencyMs: 0 });
  assert.deepEqual({ ...first.old, avgLatencyMs: 0 }, { ...second.old, avgLatencyMs: 0 });
});

test("RAG V2 旧基线对比存在且新检索在关键维度不劣化", async () => {
  const result = await runEval();
  assert.ok(
    result.new.recall10 >= result.old.recall10 - 0.1,
    `新检索 Recall@10 不应明显劣于旧基线（新=${result.new.recall10} 旧=${result.old.recall10}）`
  );
  assert.ok(
    result.new.leakageRate <= result.old.leakageRate,
    "新检索泄漏率不得高于旧基线"
  );
});
