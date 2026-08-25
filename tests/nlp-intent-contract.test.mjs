import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { loadRuntimeModule, closeRuntimeServer } from "../scripts/rag/lib/load-runtime.mjs";

const fixturePath = new URL("./fixtures/nlp/intent-contract-cases.json", import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

after(() => closeRuntimeServer());

test("NLP gold fixture has the required hand-reviewed coverage before production migration", async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.schemaVersion, "intent-contract-gold-v1");
  assert.ok(Array.isArray(fixture.cases));
  assert.ok(fixture.cases.length >= 160, `expected >=160 cases, got ${fixture.cases.length}`);
  assert.ok(new Set(fixture.cases.map((item) => item.intentClass)).size >= 40);
  assert.ok(fixture.cases.filter((item) => item.tags?.includes("negation")).length >= 30);
  assert.ok(fixture.cases.filter((item) => item.tags?.includes("resource-boundary")).length >= 30);
  assert.ok(fixture.cases.filter((item) => item.tags?.includes("authorization")).length >= 20);
  assert.ok(fixture.cases.filter((item) => item.tags?.includes("target-pronoun")).length >= 20);
  assert.ok(fixture.cases.filter((item) => item.tags?.includes("synonym-order")).length >= 20);
  for (const item of fixture.cases) {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.text, "string");
    assert.equal(typeof item.intentClass, "string");
    assert.ok(item.expected && typeof item.expected === "object");
    assert.ok(["低", "中", "高", "致命"].includes(item.expected.risk));
    assert.equal(typeof item.expected.needsClarification, "boolean");
    assert.ok(item.evidence && typeof item.evidence === "object");
    for (const [field, spans] of Object.entries(item.evidence)) {
      assert.ok(Array.isArray(spans), `${item.id}.${field} evidence must be an array`);
      for (const span of spans) {
        assert.equal(typeof span, "string");
        assert.ok(item.text.includes(span), `${item.id} evidence span not found: ${span}`);
      }
    }
  }
});

test("intent contract parser preserves field state and evidence spans", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  assert.equal(typeof parser.parseIntentContract, "function");
  for (const item of fixture.cases) {
    const result = parser.parseIntentContract(item.text);
    assert.equal(result.schemaVersion, "intent-contract-v1");
    assert.ok(Array.isArray(result.clauses));
    assert.ok(Array.isArray(result.conflicts));
    assert.ok(Array.isArray(result.ambiguities));
    for (const field of ["kind", "target", "resourcePosture", "authorizationScope"]) {
      assert.ok(["present", "negated", "ambiguous", "absent"].includes(result.fields[field].state), `${item.id}.${field} state`);
      for (const span of result.fields[field].evidence) {
        assert.equal(item.text.slice(span.start, span.end), span.text, `${item.id}.${field} span must be source-bound`);
        assert.ok(span.ruleId, `${item.id}.${field} span must carry ruleId`);
      }
    }
  }
});

test("intent evidence stays bound to the trimmed original text", async () => {
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const input = "  调查‘Ａ区仓库’，低调进行。  ";
  const result = parser.parseIntentContract(input);
  assert.equal(result.rawText, input.trim());
  for (const field of Object.values(result.fields)) {
    for (const span of field.evidence) {
      assert.equal(result.rawText.slice(span.start, span.end), span.text);
    }
  }
});

test("critical gold cases do not over-grant authorization or resources", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const critical = fixture.cases.filter((item) => item.tags?.includes("critical"));
  assert.ok(critical.length >= 40);
  let overGrant = 0;
  let missedAmbiguity = 0;
  for (const item of critical) {
    const result = parser.parseIntentContract(item.text);
    if (item.expected.authorizationScope !== "broad" && result.authorization.scope === "broad") overGrant += 1;
    if (item.expected.needsClarification && !result.needsClarification) missedAmbiguity += 1;
  }
  assert.equal(overGrant, 0, `critical authorization over-grants: ${overGrant}`);
  assert.equal(missedAmbiguity, 0, `critical ambiguity misses: ${missedAmbiguity}`);
});

test("negated resource directions remain minimal without becoming positive authorization", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  for (const item of fixture.cases.filter((entry) => entry.tags?.includes("negation") && entry.expected.posture === "minimal")) {
    const result = parser.parseIntentContract(item.text);
    assert.equal(result.resources.posture, "minimal", `${item.id} negated posture`);
    assert.notEqual(result.resources.posture, "all-in", `${item.id} must not over-grant resources`);
  }
});

test("NLP-01.3 production façade delegates only action kind", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  for (const item of fixture.cases) {
    const parsed = parser.parseIntentContract(item.text);
    if (parsed.fields.kind.state !== "present") continue;
    const contract = engine.localContract({ intent: item.text, game, leaderId: "organization", districtId: "east", abilityIds: [] });
    assert.equal(contract.kind, parsed.fields.kind.normalizedValue, `${item.id} kind delegation`);
  }
});

test("NLP-01.4 target migration characterization is explicit", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  for (const item of fixture.cases) {
    const parsed = parser.parseIntentContract(item.text);
    if (parsed.fields.target.state !== "present") continue;
    const contract = engine.localContract({ intent: item.text, game, leaderId: "organization", districtId: "east", abilityIds: [] });
    assert.equal(contract.target, parsed.fields.target.normalizedValue, `${item.id} target delegation`);
  }
});

test("NLP-01.5 resource migration characterization is explicit", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  for (const item of fixture.cases) {
    const parsed = parser.parseIntentContract(item.text);
    const contract = engine.localContract({ intent: item.text, game, leaderId: "organization", districtId: "east", abilityIds: [] });
    if (parsed.fields.resourcePosture.state === "present" || parsed.fields.resourcePosture.state === "negated") {
      assert.equal(contract.resourceCommitment.posture, parsed.resources.posture, `${item.id} posture delegation`);
    }
    if (parsed.fields.money.state === "present" || parsed.fields.money.state === "negated") {
      assert.equal(contract.resourceCommitment.money, parsed.resources.money ?? 0, `${item.id} money delegation`);
    }
    if (parsed.fields.manpower.state === "negated") assert.equal(contract.resourceCommitment.manpower, 0, `${item.id} manpower zero delegation`);
    if (parsed.fields.extraordinaryMaterials.state === "negated") assert.equal(contract.resourceCommitment.extraordinaryMaterials, 0, `${item.id} material zero delegation`);
  }
});

test("NLP-01.6 authorization scope migration characterization is explicit", async () => {
  const fixture = await loadFixture();
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  for (const item of fixture.cases) {
    const parsed = parser.parseIntentContract(item.text);
    const contract = engine.localContract({ intent: item.text, game, leaderId: "organization", districtId: "east", abilityIds: [] });
    if (parsed.fields.authorizationScope.state === "present") {
      assert.equal(contract.authorization.scope, parsed.authorization.scope, `${item.id} authorization scope delegation`);
    }
    if (parsed.fields.authorizationScope.state === "ambiguous") {
      assert.notEqual(contract.authorization.scope, "broad", `${item.id} ambiguous scope must not broaden`);
    }
  }
});

test("NLP-01.7 red-line migration preserves defaults and adds parser evidence", async () => {
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  const intent = "调查东区仓库，不能公开未经核验的原文，不把未经验证的传闻公开指控；发现身份暴露立即撤退。";
  const parsed = parser.parseIntentContract(intent);
  const contract = engine.localContract({ intent, game, leaderId: "organization", districtId: "east", abilityIds: [] });
  assert.ok(contract.authorization.redLines.some((item) => item.includes("不伤害无关者")));
  assert.ok(contract.authorization.redLines.some((item) => item.includes("不把未经验证的假设当作公开指控")));
  assert.ok(parsed.fields.redLines.value?.some((item) => item.includes("不能公开未经核验的原文")));
  assert.ok(contract.authorization.redLines.some((item) => item.includes("不能公开未经核验的原文")));
});

test("NLP-01.8 retreat migration uses explicit parser evidence and keeps fallback", async () => {
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  const explicit = "调查东区仓库，出现身份暴露就暂停行动。";
  const parsed = parser.parseIntentContract(explicit);
  assert.equal(parsed.fields.retreatCondition.state, "present");
  const contract = engine.localContract({ intent: explicit, game, leaderId: "organization", districtId: "east", abilityIds: [] });
  assert.match(contract.authorization.retreatCondition, /暂停行动/);

  const fallbackIntent = "调查东区仓库，保持低调并记录线索。";
  const fallbackParsed = parser.parseIntentContract(fallbackIntent);
  assert.equal(fallbackParsed.fields.retreatCondition.state, "absent");
  const fallback = engine.localContract({ intent: fallbackIntent, game, leaderId: "organization", districtId: "east", abilityIds: [] });
  assert.match(fallback.authorization.retreatCondition, /身份暴露|撤离路线/);
});

test("NLP-01.9 colloquial negation and alternative targets fail closed", async () => {
  const parser = await loadRuntimeModule("app/nlp/intent-contract.ts");
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const game = model.createInitialGame("seer");
  const negated = ["别调查红房子。", "请勿进入地下室。", "不想调查红房子。"];
  for (const text of negated) {
    const parsed = parser.parseIntentContract(text);
    assert.equal(parsed.fields.kind.state, "negated", `${text} must preserve action negation`);
    assert.equal(parsed.fields.target.state, "present", `${text} target remains source-bound`);
    const contract = engine.localContract({ intent: text, game, leaderId: "organization", districtId: "east", abilityIds: [] });
    assert.equal(contract.kind, "自由行动", `${text} must not become an executable risky verb`);
    assert.equal(contract.resourceCommitment.posture, "minimal", `${text} must not infer a broad resource posture`);
  }
  const alternative = parser.parseIntentContract("调查红房子或者蓝桥。");
  assert.equal(alternative.fields.target.state, "ambiguous");
  assert.equal(alternative.needsClarification, true);
  assert.equal(parser.parseIntentContract("向红房子或者蓝桥报告。").fields.target.state, "ambiguous");
  const alternativeContract = engine.localContract({ intent: "调查红房子或者蓝桥。", game, leaderId: "organization", districtId: "east", abilityIds: [] });
  assert.equal(alternativeContract.target, "待确认目标");
});
