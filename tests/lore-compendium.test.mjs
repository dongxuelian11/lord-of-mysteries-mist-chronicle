import assert from "node:assert/strict";
import test from "node:test";

import { LORE_COMPENDIUM_META, LORE_RECORDS, LOTM_PATHWAYS, LOTM_SOURCES } from "../app/generated-lore-compendium.ts";
import { retrieveLoreContext } from "../app/lore-knowledge.ts";

test("the supplied compendium is imported as cited, permissioned lore records", () => {
  assert.equal(LORE_COMPENDIUM_META.version, "2026-08-02");
  assert.ok(LORE_RECORDS.length >= 60, `expected a useful lore corpus, received ${LORE_RECORDS.length}`);
  assert.equal(LOTM_PATHWAYS.length, 22);
  assert.ok(LOTM_SOURCES.some((source) => source.id === "S01" && source.grade === "A"));
  assert.ok(LORE_RECORDS.some((record) => record.visibility === "public"));
  assert.ok(LORE_RECORDS.some((record) => record.visibility === "cosmic"));
});

test("player retrieval from the real corpus cannot surface cosmic spoilers", () => {
  const result = retrieveLoreContext(LORE_RECORDS, {
    query: "世界底层真相 旧日地球 穿越者",
    audience: { kind: "player", knownLoreIds: [], topicGrants: [] },
    limit: 8,
  });
  assert.ok(result.records.every((record) => record.visibility === "public"));
});
