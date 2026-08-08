import assert from "node:assert/strict";
import test from "node:test";

import { LORE_RECORDS } from "../app/generated-lore-compendium.ts";
import { createInitialBacklundMap, recalculateBacklundControl } from "../app/organization-management.ts";

const hasFullLore = LORE_RECORDS.length > 0;

test("Backlund has a stable 10 district, 50 block, 150 strategic-point topology", () => {
  const map = createInitialBacklundMap();
  const blocks = map.districts.flatMap((district) => district.blocks);
  const points = blocks.flatMap((block) => block.strategicPoints);
  assert.equal(map.districts.length, 10);
  assert.equal(blocks.length, 50);
  assert.equal(points.length, 150);
  assert.equal(new Set(blocks.map((block) => block.id)).size, 50);
  assert.equal(new Set(points.map((point) => point.id)).size, 150);
  assert.equal(new Set(points.map((point) => point.name)).size, 150);
});

test("every strategic point cites real lore evidence and no generated local placeholder", { skip: hasFullLore ? false : "公共构建使用空壳知识库，完整知识一致性由 Release CI 校验" }, () => {
  const loreIds = new Set(LORE_RECORDS.map((record) => record.id));
  const points = createInitialBacklundMap().districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints));
  for (const point of points) {
    assert.ok(point.loreEvidenceIds.length >= 2, point.name);
    assert.ok(point.loreEvidenceIds.every((id) => loreIds.has(id)), `${point.name}: ${point.loreEvidenceIds.join(",")}`);
    assert.ok(["verified", "requires-runtime-verification"].includes(point.loreStatus));
    assert.doesNotMatch(point.name, /许可与档案渠道|采购与资金渠道|居民与雇工网络|报讯与监听网/);
  }
});

test("control remains dynamic when a rival counteracts an established player position", () => {
  const map = createInitialBacklundMap();
  const point = map.districts[0].blocks[0].strategicPoints[0];
  const playerEstablished = recalculateBacklundControl({
    ...map,
    districts: map.districts.map((district, districtIndex) => districtIndex ? district : ({
      ...district,
      blocks: district.blocks.map((block, blockIndex) => blockIndex ? block : ({
        ...block,
        strategicPoints: block.strategicPoints.map((entry, pointIndex) => pointIndex ? entry : ({ ...entry, influenceByFaction: { player: 72, "night-church": 18, police: 10 } })),
      })),
    })),
  }, 2);
  const before = playerEstablished.districts[0].blocks[0].strategicPoints[0];
  assert.equal(before.controllerId, "player");
  const countered = recalculateBacklundControl({
    ...playerEstablished,
    districts: playerEstablished.districts.map((district, districtIndex) => districtIndex ? district : ({
      ...district,
      blocks: district.blocks.map((block, blockIndex) => blockIndex ? block : ({
        ...block,
        strategicPoints: block.strategicPoints.map((entry) => entry.id !== point.id ? entry : ({ ...entry, influenceByFaction: { player: 43, "night-church": 47, police: 10 } })),
      })),
    })),
  }, 3);
  const after = countered.districts[0].blocks[0].strategicPoints[0];
  assert.equal(after.controllerId, undefined);
  assert.equal(after.contested, true);
  assert.ok(countered.districts[0].blocks[0].control < playerEstablished.districts[0].blocks[0].control);
});
