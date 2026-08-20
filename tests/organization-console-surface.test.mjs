import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("organization ledger keeps the default surface at resources, leaders, exceptions, and qualitative capacity", async () => {
  const source = await readFile(new URL("../app/organization-management-console.tsx", import.meta.url), "utf8");
  assert.match(source, /三项基础资源/);
  assert.match(source, /四名负责人/);
  assert.match(source, /ledger-causal-row/);
  assert.match(source, /组织声望/);
  assert.match(source, /暴露边界/);
  assert.match(source, /外部压力/);
  assert.match(source, /控制网络/);
  assert.match(source, /function pressureLabel/);
  assert.match(source, /function controlLabel/);
  assert.doesNotMatch(source, /最高敌意 \{mostHostile\?\.hostility/);
  assert.doesNotMatch(source, /控制网络<\/header><p>\{bestDistrict\?\.name \?\? "贝克兰德"\} \{bestDistrict\?\.control/);
});

test("promotion, assets, and ready-member actions are explicit on-demand disclosures", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/organization-management-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/management-console.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /<details className="ledger-detail ledger-promotion-detail">/);
  assert.match(source, /需要时处理：提拔普通人为非凡者/);
  assert.match(source, /<details className="ledger-detail ledger-assets-detail">/);
  assert.match(source, /按需展开：配方、封印物与分部/);
  assert.match(source, /<details className="ledger-ready">/);
  assert.doesNotMatch(source, /ledger-promotion-detail" open/);
  assert.doesNotMatch(source, /ledger-assets-detail" open/);
  assert.match(css, /\.ledger-detail>summary/);
  assert.match(css, /\.ledger-detail\[open\]>summary/);
});
