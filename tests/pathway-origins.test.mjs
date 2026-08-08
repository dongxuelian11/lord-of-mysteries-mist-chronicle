import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LORE_RECORDS } from "../app/generated-lore-compendium.ts";
import { buildOpeningCandidatePool } from "../app/opening-candidates.ts";
import { PATHWAY_ORIGINS, validateDynamicPathwayOrigin } from "../app/pathway-origins.ts";
import { STANDARD_PATHWAY_IDS } from "../app/pathway-catalog.ts";

test("all 22 pathways have two fixed knowledge-backed causal origins", () => {
  const loreIds = new Set(LORE_RECORDS.map((record) => record.id));
  assert.equal(Object.keys(PATHWAY_ORIGINS).length, 22);
  for (const [index, pathwayId] of STANDARD_PATHWAY_IDS.entries()) {
    const origins = PATHWAY_ORIGINS[pathwayId];
    assert.equal(origins.length, 2, pathwayId);
    for (const origin of origins) {
      assert.equal(origin.pathwayId, pathwayId);
      assert.equal(origin.kind, "fixed");
      assert.equal(origin.traits.length, 2);
      assert.deepEqual(origin.traits.map((trait) => trait.kind), ["advantage", "burden"]);
      assert.ok(origin.firstCrisis.length >= 12);
      assert.ok(origin.contact.length >= 8);
      assert.ok(origin.enemy.length >= 8);
      assert.ok(origin.resources.manpower >= 12);
      assert.ok(origin.loreEvidenceIds.every((id) => loreIds.has(id)), `${pathwayId}: ${origin.loreEvidenceIds.join(",")}`);
      assert.ok(origin.loreEvidenceIds.includes(`lotm-04-${String(index + 2).padStart(3, "0")}`));
    }
  }
});

test("Door and Mystery openings encode high-sequence pollution instead of a free sequence switch", async () => {
  assert.equal(PATHWAY_ORIGINS.apprentice[0].difficulty.pollution, 5);
  assert.equal(PATHWAY_ORIGINS.apprentice[0].difficulty.pursuit, 5);
  assert.ok(PATHWAY_ORIGINS.apprentice.some((origin) => origin.startingSequence === 8));
  assert.match(PATHWAY_ORIGINS.apprentice.map((origin) => origin.traits[1].description).join(" "), /满月|高位污染/);
  assert.equal(PATHWAY_ORIGINS.mystery[0].difficulty.pollution, 5);
  assert.match(PATHWAY_ORIGINS.mystery.map((origin) => origin.traits[1].description).join(" "), /隐匿贤者|知识污染|主动灌输/);
  const source = await readFile(new URL("../app/opening-prologue.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setStartingSequence|开局层次|正常开局/);
  assert.match(source, /玩家不直接选择序列/);
});

test("sequence 7 fixed origins are rare and carry concrete long-term burdens", () => {
  const sequenceSeven = Object.values(PATHWAY_ORIGINS).flat().filter((origin) => origin.startingSequence === 7);
  assert.ok(sequenceSeven.length > 0);
  assert.ok(sequenceSeven.length <= 3);
  for (const origin of sequenceSeven) {
    assert.ok(origin.exposure >= 20);
    assert.ok((origin.traits[1].effects.exposure ?? 0) >= 18);
    assert.ok((origin.traits[1].effects.instability ?? 0) >= 8);
    assert.ok(origin.hostility.some((entry) => entry.delta >= 20));
  }
});

test("dynamic origins require pathway evidence and a real sequence 7 burden", () => {
  const base = {
    title: "停职军官的另一份档案",
    summary: "一份经司法体系确认的连续晋升记录让角色以中序列开始，但官方持续追踪其去向。",
    startingSequence: 7,
    source: "司法体系内连续晋升并有完整监督记录",
    contact: "仍保留原始案卷的前同僚",
    enemy: "负责回收失联人员的官方调查组",
    firstCrisis: "一份不应存在的旧供词开始在警察厅内部流传。",
    districtId: "government",
    blockNumber: 6,
    locationLabel: "司法街区",
    resources: { manpower: 22, money: 360, extraordinaryMaterials: 4 },
    exposure: 24,
    reputation: 7,
    hostileFactionId: "police",
    hostilityDelta: 25,
    hostilityCause: "中序列人员脱离官方控制",
    advantageName: "正式裁决训练",
    advantage: "内部纪律与俘虏管理拥有优势。",
    advantageTriggers: ["纪律", "俘虏"],
    burdenName: "国家资产",
    burden: "官方会持续监控与回收角色。",
    burdenTriggers: ["官方", "公开能力"],
    loreEvidenceIds: ["lotm-04-018", "lotm-03-007", "lotm-11-004"],
  };
  assert.throws(() => validateDynamicPathwayOrigin(base, "justiciar"), /特殊负担/);
  const valid = validateDynamicPathwayOrigin({ ...base, specialBurden: "官方把角色视为必须回收的危险国家资产，公开使用能力将立即升级追捕与政治压力。" }, "justiciar");
  assert.equal(valid.startingSequence, 7);
  assert.equal(valid.kind, "dynamic");
  assert.throws(() => validateDynamicPathwayOrigin({ ...base, specialBurden: "这是一个足够具体且会长期持续产生追捕与政治债务的严重负担。", loreEvidenceIds: ["lotm-03-007"] }, "justiciar"), /知识库账本/);
});

test("candidate pool remains eight named beyonders and reacts to the selected origin", () => {
  const common = { playerPathwayId: "apprentice", identityId: "investigator", experienceId: "mutual-aid" };
  const first = buildOpeningCandidatePool({ ...common, originScenarioId: "apprentice-origin-1", originStartingSequence: 8 });
  const second = buildOpeningCandidatePool({ ...common, originScenarioId: "apprentice-origin-2", originStartingSequence: 9 });
  assert.equal(first.length, 8);
  assert.equal(new Set(first.map((member) => member.id)).size, 8);
  assert.ok(first.every((member) => member.pathway && member.sequence));
  assert.notDeepEqual(first.map((member) => member.pathway), second.map((member) => member.pathway));
});

