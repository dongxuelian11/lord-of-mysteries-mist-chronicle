import assert from "node:assert/strict";
import test from "node:test";

import { filterLoreForAudience, retrieveLoreContext } from "../app/lore-knowledge.ts";

const records = [
  { id: "public-city", title: "贝克兰德公开地理", content: "报纸和地图可查的城市信息", visibility: "public", topics: ["geography"] },
  { id: "restricted-pathway", title: "非凡途径常识", content: "非凡者圈子里的基础知识", visibility: "restricted", topics: ["pathways"] },
  { id: "secret-cosmos", title: "世界底层真相", content: "只供全知世界推演使用的秘密", visibility: "cosmic", topics: ["cosmology"] },
];

test("world truth stays unavailable to player-facing contexts even when it matches the query", () => {
  const visible = filterLoreForAudience(records, { kind: "player", knownLoreIds: [], topicGrants: [] });
  assert.deepEqual(visible.map((item) => item.id), ["public-city"]);

  const omniscient = filterLoreForAudience(records, { kind: "world", knownLoreIds: [], topicGrants: [] });
  assert.deepEqual(omniscient.map((item) => item.id), ["public-city", "restricted-pathway", "secret-cosmos"]);
});

test("retrieval ranks relevant authorized lore and returns compact cited context", () => {
  const result = retrieveLoreContext([
    ...records,
    { id: "public-church", title: "贝克兰德教会", content: "教会在北区设有公开教堂和档案入口", visibility: "public", topics: ["factions", "geography"], sourceIds: ["S01"], sourceGrade: "A" },
  ], {
    query: "贝克兰德北区的教会档案",
    audience: { kind: "actor", knownLoreIds: [], topicGrants: ["pathways"] },
    limit: 2,
    maxChars: 240,
  });

  assert.equal(result.records[0].id, "public-church");
  assert.doesNotMatch(result.context, /世界底层真相/);
  assert.match(result.context, /\[S01·A\]/);
});
