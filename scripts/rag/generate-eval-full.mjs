// 从夹具语料确定性生成 100+ 条完整评测用例，写入 tests/fixtures/rag/eval-cases-full.json。
import fs from "node:fs";
import path from "node:path";
import { loadFixtureDocs } from "./eval.mjs";
import { closeRuntimeServer } from "./lib/load-runtime.mjs";
import { root } from "./lib/paths.mjs";

function firstAlias(chunk) {
  return chunk.aliases?.[0] ?? chunk.title;
}

function caseFor(chunk, overrides = {}) {
  const alias = overrides.queryAlias ?? firstAlias(chunk);
  const expectedTitles = overrides.expectedTitles ?? [chunk.title];
  const forbiddenTitles = (overrides.disallowedTitles ?? []).filter(
    (title) => !expectedTitles.includes(title)
  );
  return {
    query: overrides.query ?? `${alias} 是什么`,
    requestScope: overrides.scope ?? "player-known",
    requiredEntities: overrides.entities ?? (chunk.entities ?? []).map((e) => e.name),
    expectedSourceIds: overrides.expectedSources ?? [chunk.sourceId],
    expectedSourceTypes: overrides.expectedTypes ?? [chunk.sourceType],
    expectedTitles,
    forbiddenLayers: overrides.forbiddenLayers ?? [],
    expectedCanonLayer: overrides.canonLayer ?? chunk.canonLayer,
    spoilerBoundary:
      overrides.spoiler ??
      (chunk.spoilerScope === "all" ? "volume1" : chunk.spoilerScope ?? "volume1"),
    minRank: overrides.minRank ?? 5,
    expectUnknown: overrides.expectUnknown ?? false,
    knownLoreIds: overrides.knownLoreIds ?? [],
    topicGrants: overrides.topicGrants ?? [],
    week: overrides.week,
    allowedVolumes: overrides.allowedVolumes,
    disallowedTitles: forbiddenTitles,
    category: overrides.category ?? "general",
  };
}

export async function generateEvalCases() {
  const chunks = await loadFixtureDocs(path.join(root, "tests", "fixtures", "rag"));
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const cases = [];
  const add = (item) => cases.push(item);
  const titles = (list) => list.map((id) => byId.get(id)?.title).filter(Boolean);
  const forbiddenForPlayer = chunks
    .filter(
      (chunk) =>
        chunk.visibility === "secret" ||
        chunk.visibility === "cosmic" ||
        chunk.spoilerScope === "volume2"
    )
    .map((chunk) => chunk.id);
  const positive = (chunk) =>
    chunk.visibility !== "secret" && chunk.visibility !== "cosmic";

  // 1) 别名与多身份（≥20）
  const identityChunks = chunks.filter((chunk) =>
    /角色|身份|克莱恩|阿蒙|奥黛丽|阿尔杰|伦纳德|罗塞尔|埃姆林|休|帕列斯|格尔曼|夏洛克|周明瑞|道恩|梅林/.test(
      `${chunk.title}${chunk.topics?.join(" ")}`
    )
  );
  for (const chunk of identityChunks.slice(0, 21)) {
    if (!positive(chunk)) continue;
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 是谁`,
        category: "alias-identity",
        knownLoreIds: [chunk.title],
        topicGrants: ["characters", "identities"],
        disallowedTitles: titles(forbiddenForPlayer),
      })
    );
  }

  // 2) 途径、序列、魔药与能力（≥15）
  const pathwayChunks = chunks.filter((chunk) =>
    /途径|序列|魔药|能力/.test(`${chunk.title}${chunk.topics?.join(" ")}`)
  );
  for (const chunk of pathwayChunks.slice(0, 16)) {
    if (!positive(chunk)) continue;
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 的序列或能力是什么`,
        scope: "player-known",
        category: "pathway",
        topicGrants: ["pathways", "sequences", "abilities", "advancement"],
        disallowedTitles: titles(forbiddenForPlayer),
      })
    );
  }

  // 3) 组织关系（≥10）
  const orgChunks = chunks.filter((chunk) =>
    /组织|教会|协会|家族|机构|塔罗会|值夜者|学派|之心|代罚|炼金|十字/.test(
      `${chunk.title}${chunk.topics?.join(" ")}`
    )
  );
  for (const chunk of orgChunks.slice(0, 10)) {
    if (!positive(chunk)) continue;
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 是什么组织，成员或立场如何`,
        category: "organization",
        knownLoreIds: [chunk.title],
        topicGrants: ["organizations"],
        disallowedTitles: titles(forbiddenForPlayer),
      })
    );
  }

  // 4) 地点（≥10）
  const locationChunks = chunks.filter(
    (chunk) =>
      chunk.topics?.includes("locations") ||
      /区|王国|大陆|贝克兰德|廷根|首都/.test(chunk.title)
  );
  for (const chunk of locationChunks.slice(0, 10)) {
    if (!positive(chunk)) continue;
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 在哪里`,
        category: "location",
        disallowedTitles: titles(forbiddenForPlayer),
      })
    );
  }

  // 5) 封印物与物品（≥10）
  const artifactChunks = chunks.filter(
    (chunk) =>
      chunk.topics?.includes("sealed-artifacts") ||
      chunk.topics?.includes("items") ||
      /封印物|0-|1-|2-/.test(chunk.title)
  );
  for (const chunk of artifactChunks.slice(0, 8)) {
    if (!positive(chunk)) continue;
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 是什么封印物`,
        category: "artifact",
        topicGrants: ["sealed-artifacts", "items"],
        disallowedTitles: titles(forbiddenForPlayer),
      })
    );
  }

  // 6) 时间线与卷范围（≥10）
  const timelineChunks = chunks.filter(
    (chunk) => chunk.topics?.includes("timeline") || chunk.timeline?.volume
  );
  for (const chunk of timelineChunks.slice(0, 8)) {
    if (!positive(chunk)) continue;
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 发生在什么时候`,
        category: "timeline",
        spoiler: chunk.timeline?.volume === 2 ? "volume2" : "volume1",
        allowedVolumes: chunk.timeline?.volume ? [chunk.timeline.volume] : undefined,
        week: chunk.timeline?.week,
        knownLoreIds: chunk.visibility === "restricted" ? [chunk.title] : [],
        disallowedTitles: titles(
          forbiddenForPlayer.filter(
            (id) =>
              byId.get(id)?.visibility === "secret" ||
              byId.get(id)?.visibility === "cosmic"
          )
        ),
      })
    );
  }
  add(
    caseFor(timelineChunks.find((c) => c.title.includes("1349")) ?? timelineChunks[0], {
      query: "1350年贝克兰德发生了什么",
      category: "timeline",
      spoiler: "volume1",
      week: 52,
      allowedVolumes: [1],
      expectedTitles: ["1350年塔罗会的扩张"],
      disallowedTitles: ["第二部：新的时代", "第五纪末期的动荡"],
    })
  );
  add(
    caseFor(timelineChunks.find((c) => c.title.includes("第二部")) ?? timelineChunks[0], {
      query: "第二部开始后的非凡者格局",
      category: "timeline",
      scope: "player-known",
      spoiler: "none",
      week: 1,
      allowedVolumes: [1],
      expectedTitles: [],
      expectUnknown: true,
      disallowedTitles: ["第二部：新的时代", "第五纪末期的动荡"],
    })
  );
  add(
    caseFor(timelineChunks[0], {
      query: "第四纪是什么时代",
      category: "timeline",
      expectedTitles: ["第四纪与第五纪"],
    })
  );

  // 7) canon/community/fan 冲突（≥10）
  const conflictPairs = [
    ["克莱恩与灰雾的关系（canon）", "克莱恩与灰雾的关系（fan-derived）"],
    ["阿蒙与克莱恩的关系（canon）", "阿蒙与克莱恩的关系（fan-derived）"],
    ["塔罗会成员名单（canon）", "塔罗会成员名单（community）"],
  ];
  for (const pair of conflictPairs) {
    add({
      query: `关于${pair[0].split("（")[0]}，原著和社区/同人的说法有什么不同`,
      requestScope: "player-known",
      requiredEntities: [pair[0].split("（")[0]],
      expectedSourceIds: conflictChunks(chunks, pair).map((c) => c.sourceId),
      expectedSourceTypes: ["structured"],
      expectedTitles: pair,
      forbiddenLayers: [],
      expectedCanonLayer: "canon",
      spoilerBoundary: "all",
      minRank: 10,
      expectUnknown: false,
      knownLoreIds: [],
      topicGrants: [],
      disallowedTitles: titles(forbiddenForPlayer),
      category: "conflict",
    });
  }
  // 冲突补充（凑满 10）：对同一主题不同分层各生成一问
  const conflictChunksList = chunks.filter((c) =>
    /关系（canon）|关系（fan-derived）|名单（canon）|名单（community）/.test(c.title)
  );
  for (const chunk of conflictChunksList.slice(0, 7)) {
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 的说法属于哪一层设定`,
        category: "conflict",
      })
    );
  }

  // 8) 角色权限与秘密泄漏（≥10）
  const secretChunks = chunks.filter(
    (chunk) => chunk.visibility === "secret" || chunk.visibility === "cosmic"
  );
  for (const chunk of secretChunks.slice(0, 8)) {
    add(
      caseFor(chunk, {
        query: chunk.title,
        scope: "player-known",
        expectedTitles: [],
        expectUnknown: true,
        disallowedTitles: [chunk.title],
        category: "permission",
      })
    );
  }
  for (const chunk of secretChunks.slice(0, 3)) {
    add(
      caseFor(chunk, {
        query: `${firstAlias(chunk)} 的详情`,
        scope: "actor-private",
        knownLoreIds: [chunk.title],
        expectedTitles: [chunk.title],
        disallowedTitles: titles(forbiddenForPlayer.filter((id) => byId.get(id)?.title !== chunk.title)),
        category: "permission-granted",
      })
    );
  }

  // 9) 无答案或错误前提（≥5）
  const noAnswerQueries = [
    "深渊魔物克苏鲁的信徒仪式",
    "克苏鲁与旧日支配者的盟约条款",
    "以太坊上的智能合约交易所",
    "量子计算机的纠错算法",
    "火星殖民计划的推进时间表",
  ];
  for (const query of noAnswerQueries) {
    add({
      query,
      requestScope: "player-known",
      requiredEntities: [],
      expectedSourceIds: [],
      expectedSourceTypes: [],
      expectedTitles: [],
      forbiddenLayers: [],
      expectedCanonLayer: "canon",
      spoilerBoundary: "all",
      minRank: 0,
      expectUnknown: true,
      knownLoreIds: [],
      topicGrants: [],
      disallowedTitles: [],
      category: "no-answer",
    });
  }

  // 10) 对抗性泄漏（≥10）
  add({
    query: "阿蒙的常见描述",
    requestScope: "player-known",
    requiredEntities: ["阿蒙"],
    expectedSourceIds: ["adv-pair"],
    expectedSourceTypes: ["structured"],
    expectedTitles: ["阿蒙的常见描述（公开）"],
    forbiddenLayers: ["secret"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 5,
    expectUnknown: false,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: ["阿蒙的常见描述（secret）"],
    category: "adversarial-similar",
  });
  add({
    query: "格尔曼·斯帕罗的真实身份是什么",
    requestScope: "player-known",
    requiredEntities: ["格尔曼"],
    expectedSourceIds: [],
    expectedSourceTypes: [],
    expectedTitles: [],
    forbiddenLayers: ["secret"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 0,
    expectUnknown: true,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: ["格尔曼·斯帕罗的真实身份", "秘密：格尔曼就是克莱恩"],
    category: "adversarial-alias-secret",
  });
  add({
    query: "格尔曼·斯帕罗的真实身份是什么",
    requestScope: "actor-private",
    requiredEntities: ["格尔曼"],
    expectedSourceIds: ["characters-extra", "secrets-extra"],
    expectedSourceTypes: ["structured"],
    expectedTitles: ["格尔曼·斯帕罗的真实身份", "秘密：格尔曼就是克莱恩"],
    forbiddenLayers: [],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 10,
    expectUnknown: false,
    knownLoreIds: ["格尔曼·斯帕罗的真实身份", "秘密：格尔曼就是克莱恩"],
    topicGrants: [],
    disallowedTitles: ["宇宙级秘密：最初造物主"],
    category: "adversarial-alias-granted",
  });
  add({
    query: "1350年后贝克兰德的隐秘格局",
    requestScope: "player-known",
    requiredEntities: ["贝克兰德"],
    expectedSourceIds: ["timeline-extra"],
    expectedSourceTypes: ["structured"],
    expectedTitles: ["1350年塔罗会的扩张"],
    forbiddenLayers: ["volume2"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 5,
    expectUnknown: false,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: ["第二部：新的时代", "第五纪末期的动荡"],
    category: "adversarial-future-similar",
  });
  add({
    query: "源堡的由来",
    requestScope: "player-facing-narrator",
    requiredEntities: ["源堡"],
    expectedSourceIds: [],
    expectedSourceTypes: [],
    expectedTitles: [],
    forbiddenLayers: ["secret"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "none",
    minRank: 0,
    expectUnknown: true,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: ["秘密：源堡的由来", "源堡的青铜大门", "宇宙级秘密：源质真相"],
    category: "adversarial-narrator",
  });
  add({
    query: "塔罗会的成员都有谁",
    requestScope: "actor-private",
    requiredEntities: ["塔罗会"],
    expectedSourceIds: ["organizations", "organizations-extra"],
    expectedSourceTypes: ["wiki", "structured"],
    expectedTitles: ["塔罗会", "奥黛丽·霍尔"],
    forbiddenLayers: ["secret", "cosmic"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 10,
    expectUnknown: false,
    knownLoreIds: [],
    topicGrants: ["organizations"],
    disallowedTitles: ["愚者教会", "宇宙级秘密：最初造物主"],
    category: "adversarial-org-secret",
  });
  add({
    query: "最初造物主与源质",
    requestScope: "world-simulation-internal",
    requiredEntities: ["源质"],
    expectedSourceIds: ["secrets-extra", "secret"],
    expectedSourceTypes: ["structured"],
    expectedTitles: ["宇宙级秘密：最初造物主", "宇宙级秘密：源质真相"],
    forbiddenLayers: [],
    expectedCanonLayer: "canon",
    spoilerBoundary: "all",
    minRank: 5,
    expectUnknown: false,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: [],
    category: "world-simulation-only",
  });
  add({
    query: "最初造物主与源质",
    requestScope: "player-known",
    requiredEntities: ["源质"],
    expectedSourceIds: [],
    expectedSourceTypes: [],
    expectedTitles: [],
    forbiddenLayers: ["cosmic"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "all",
    minRank: 0,
    expectUnknown: true,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: ["宇宙级秘密：最初造物主", "宇宙级秘密：源质真相"],
    category: "adversarial-world-to-player",
  });
  add({
    query: "帕列斯·索罗亚斯德是谁",
    requestScope: "player-known",
    requiredEntities: ["帕列斯"],
    expectedSourceIds: [],
    expectedSourceTypes: [],
    expectedTitles: [],
    forbiddenLayers: ["secret"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 0,
    expectUnknown: true,
    knownLoreIds: [],
    topicGrants: [],
    disallowedTitles: ["帕列斯·索罗亚斯德"],
    category: "adversarial-secret-title",
  });
  add({
    query: "帕列斯·索罗亚斯德是谁",
    requestScope: "actor-private",
    requiredEntities: ["帕列斯"],
    expectedSourceIds: ["characters-extra"],
    expectedSourceTypes: ["structured"],
    expectedTitles: ["帕列斯·索罗亚斯德"],
    forbiddenLayers: ["cosmic"],
    expectedCanonLayer: "canon",
    spoilerBoundary: "volume1",
    minRank: 5,
    expectUnknown: false,
    knownLoreIds: ["帕列斯·索罗亚斯德"],
    topicGrants: [],
    disallowedTitles: ["宇宙级秘密：最初造物主"],
    category: "adversarial-secret-title-granted",
  });

  // 补充手写用例，确保总数 >= 100
  const explicitCases = [
    { query: "周明瑞穿越前是谁", scope: "player-known", expectedTitles: ["克莱恩·莫雷蒂的多重身份"], expectedSources: ["characters"], category: "alias-identity", grants: ["characters"] },
    { query: "格尔曼·斯帕罗是谁", scope: "player-known", expectedTitles: ["克莱恩·莫雷蒂的多重身份"], expectedSources: ["characters"], category: "alias-identity", grants: ["characters"] },
    { query: "夏洛克·莫里亚蒂是谁", scope: "player-known", expectedTitles: ["克莱恩·莫雷蒂的多重身份", "1349年克莱恩抵达贝克兰德"], expectedSources: ["characters", "timeline-extra"], category: "alias-identity", grants: ["characters"] },
    { query: "道恩·唐泰斯是谁", scope: "player-known", expectedTitles: ["克莱恩·莫雷蒂的多重身份"], expectedSources: ["characters"], category: "alias-identity", grants: ["characters"] },
    { query: "愚者先生是谁", scope: "player-known", expectedTitles: ["塔罗会", "克莱恩·莫雷蒂的多重身份"], expectedSources: ["organizations", "characters"], category: "alias-identity", grants: ["characters", "organizations"] },
    { query: "小丑是什么序列", scope: "player-known", expectedTitles: ["占卜家序列8小丑"], expectedSources: ["pathways-extra"], category: "pathway", grants: ["pathways", "sequences"] },
    { query: "无面人的能力是什么", scope: "player-known", expectedTitles: ["占卜家序列6无面人"], expectedSources: ["pathways-extra"], category: "pathway", grants: ["pathways", "sequences"] },
    { query: "戏法大师属于哪条途径", scope: "player-known", expectedTitles: ["学徒序列8戏法大师"], expectedSources: ["pathways-extra"], category: "pathway", grants: ["pathways", "sequences"] },
    { query: "鲁恩王国的首都在哪里", scope: "player-known", expectedTitles: ["鲁恩王国", "贝克兰德"], expectedSources: ["locations"], category: "location", grants: [] },
    { query: "廷根市在哪个国家", scope: "player-known", expectedTitles: ["廷根市", "鲁恩王国"], expectedSources: ["locations"], category: "location", grants: [] },
    { query: "命运之笔的封印物编号", scope: "player-known", expectedTitles: ["封印物0-08"], expectedSources: ["artifacts"], category: "artifact", grants: ["sealed-artifacts"] },
    { query: "0—12 有什么代价", scope: "player-known", expectedTitles: ["封印物0-12"], expectedSources: ["artifacts-extra"], category: "artifact", grants: ["sealed-artifacts"] },
    { query: "罗塞尔留下了什么", scope: "player-known", expectedTitles: ["罗塞尔日记", "罗塞尔·古斯塔夫"], expectedSources: ["artifacts", "characters-extra"], category: "artifact", grants: [] },
    { query: "第五纪是什么时期", scope: "player-known", expectedTitles: ["第四纪与第五纪"], expectedSources: ["timeline"], category: "timeline", grants: [] },
    { query: "1349年贝克兰德有什么变化", scope: "player-known", expectedTitles: ["1349年的贝克兰德", "1349年克莱恩抵达贝克兰德"], expectedSources: ["timeline", "timeline-extra"], category: "timeline", grants: [] },
    { query: "机械之心与蒸汽教会有何关系", scope: "player-known", expectedTitles: ["机械之心", "蒸汽与机械之神教会"], expectedSources: ["organizations-extra", "organizations"], category: "organization", grants: ["organizations"] },
    { query: "源堡的由来", scope: "actor-private", expectedTitles: ["秘密：源堡的由来"], expectedSources: ["secret"], category: "permission-granted", grants: [], known: ["秘密：源堡的由来"], spoiler: "volume1" },
  ];
  for (const item of explicitCases) {
    add({
      query: item.query,
      requestScope: item.scope,
      requiredEntities: [],
      expectedSourceIds: item.expectedSources,
      expectedSourceTypes: [],
      expectedTitles: item.expectedTitles,
      forbiddenLayers: ["secret", "cosmic"],
      expectedCanonLayer: "canon",
      spoilerBoundary: item.spoiler ?? "volume1",
      minRank: 10,
      expectUnknown: false,
      knownLoreIds: item.known ?? [],
      topicGrants: item.grants ?? [],
      disallowedTitles: titles(
        forbiddenForPlayer.filter(
          (id) =>
            byId.get(id)?.visibility === "secret" ||
            byId.get(id)?.visibility === "cosmic"
        )
      ).filter((title) => !item.expectedTitles.includes(title)),
      category: item.category,
    });
  }

  const output = path.join(root, "tests", "fixtures", "rag", "eval-cases-full.json");
  fs.writeFileSync(output, JSON.stringify(cases, null, 2));
  await closeRuntimeServer();
  return cases.length;
}

function conflictChunks(chunks, pair) {
  return chunks.filter((chunk) => pair.includes(chunk.title));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const count = await generateEvalCases();
  console.log(`[rag:eval:gen] 已生成 ${count} 条用例 -> tests/fixtures/rag/eval-cases-full.json`);
}
