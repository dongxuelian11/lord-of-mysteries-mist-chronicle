import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { closeRuntimeServer, loadRuntimeModule } from "../scripts/rag/lib/load-runtime.mjs";

test.after(() => closeRuntimeServer());

function worldEnvelope(game, chapter) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations.some((location) => location.id === "east")
    ? "east"
    : game.worldKernel.locations[0].id;
  const firstProposalId = `proposal:agent:${chapter.week}:faction:${firstFaction.id}`;
  const secondProposalId = `proposal:agent:${chapter.week}:faction:${secondFaction.id}`;
  return {
    worldSummary: {
      atmosphere: "清晨的报童比往常更早穿过街口，几处工厂同时收紧门禁，而警察厅开始逐户核对近期失踪人口。",
      changes: ["工厂收紧门禁", "警察厅核对失踪人口", "码头货运延迟"],
      undercurrents: ["两个互不相识的办事人正在追查同一本名册"],
    },
    publicSignals: [
      { channel: "报纸", headline: "东区工厂临时停工", body: "三家工厂以锅炉检修为由临时停工，工人被要求在门外等待新的排班通知。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅核对失踪人口", body: "辖区警察开始询问近期离开住所却没有向房东说明去向的住客。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "码头货运延迟", body: "两班原定清晨入港的货船被要求停在外港，卸货时间没有得到解释。", reliability: "多源传闻", districtId: "dock" },
    ],
    actionReports: [],
    factionMoves: [
      { factionId: firstFaction.id, title: "转移联络点", detail: "该势力撤掉一处已使用多周的联络点，并把文书分散交给三名信使。", visibility: "迹象", suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: "核对旧档案", detail: "该势力调取旧人口档案，与近期慈善救济名册进行交叉核对。", visibility: "获知", suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: { departmentDevelopments: [], memberDevelopments: [], recruitDevelopments: [], governanceIssues: [], newRecruitableNpc: null },
    kernelDelta: {
      newActors: [], newFactions: [], newProjects: [], actorUpdates: [],
      factionUpdates: [{ factionId: firstFaction.id, posture: "以内核状态为唯一权威", resourcesDelta: 0, suspicionDelta: 4, lastAction: "内核记录的实际行动", sourceProposalIds: [firstProposalId] }],
      projectUpdates: [{ projectId: game.worldKernel.projects[0].id, progressDelta: 2, stage: "继续推进", nextMilestone: "取得下一项可核验结果", blockers: [], status: "active", sourceProposalIds: [firstProposalId] }],
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: "街口出现更多巡警", sourceProposalIds: [firstProposalId] }],
      events: [
        { id: `event-${chapter.week}-a`, title: "临时停工", detail: "东区三家工厂同时关闭侧门。", locationId: "east", actorIds: [], factionIds: [firstFaction.id], causeIds: [], visibility: "world", sourceProposalIds: [firstProposalId] },
        { id: `event-${chapter.week}-b`, title: "人口核对", detail: "警察厅开始整理失踪人口登记。", locationId: "cherwood", actorIds: [], factionIds: [secondFaction.id], causeIds: [], visibility: "public", sourceProposalIds: [secondProposalId] },
        { id: `event-${chapter.week}-c`, title: "外港等待", detail: "两艘货船被留在外港等待检查。", locationId: "dock", actorIds: [], factionIds: [], causeIds: [], visibility: "public", sourceProposalIds: [firstProposalId] },
      ],
      observations: [], knowledge: [], canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

function bindPublicSignalsForFixture(envelope) {
  const kernel = envelope.kernelDelta;
  kernel.observations = Array.isArray(kernel.observations) ? kernel.observations : [];
  kernel.mutationClaims = Array.isArray(kernel.mutationClaims) ? kernel.mutationClaims : [];
  for (const [index, signal] of envelope.publicSignals.entries()) {
    const event = kernel.events[index % kernel.events.length];
    const proposalId = event.sourceProposalIds?.[0];
    signal.sourceProposalId ??= proposalId;
    signal.sourceEventId ??= event.id;
    signal.sourceObservation ??= signal.body;
    if (event.locationId) signal.districtId = event.locationId;
    kernel.observations.push({ eventId: event.id, channel: signal.channel, text: signal.body, visibility: "public", holderIds: [], perceivedRefs: [], acquisitionKind: "propagation" });
  }
  return envelope;
}

function worldModelFetch(envelope) {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = body.messages?.at(-1)?.content ?? "";
    if (user.includes("为这个主体独立形成同一周起点上的提案")) {
      const agentRef = user.match(/"ref":"([^"]+)"/)?.[1] ?? "actor:unknown";
      const planningWeek = Number(user.match(/"planningWeek":(\d+)/)?.[1] ?? 1);
      const payloadStart = user.lastIndexOf("\n{");
      const payload = payloadStart >= 0 ? JSON.parse(user.slice(payloadStart + 1)) : {};
      const allowedLocations = (payload.projection?.agent?.allowedTargetRefs ?? payload.projection?.allowedTargetRefs ?? [])
        .filter((ref) => typeof ref === "string" && ref.startsWith("location:"));
      const proposal = {
        planningWeek,
        agentRef,
        disposition: "act",
        intent: "推进既定安排并处理本周可见地点中的具体事务。",
        rationale: "本测试世界增量包含地点事件，因此提案必须先明确授权这些地点。",
        targetRefs: allowedLocations,
        requiredKnowledgeIds: [],
        usedMemoryIds: payload.projection?.memoryReferenceIds?.slice(0, 1) ?? [],
      };
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ proposal }) } }] }) };
    }
    bindPublicSignalsForFixture(envelope);
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) } }] }) };
  };
}

function normalizeVolatileState(value) {
  const normalized = structuredClone(value);
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "createdAt" && typeof child === "string") node[key] = "<volatile-created-at>";
      else visit(child);
    }
  };
  visit(normalized);
  return normalized;
}

async function loadWorldTurnModules() {
  const engine = await loadRuntimeModule("app/game-engine.ts");
  const model = await loadRuntimeModule("app/game-model.ts");
  const worldTurn = await loadRuntimeModule("app/game-engine/world-turn-orchestrator.ts");
  return { engine, model, worldTurn };
}

test("world turn orchestration owns the implementation and the game-engine facade re-exports it", async () => {
  const facade = await readFile("app/game-engine.ts", "utf8");
  const extracted = await readFile("app/game-engine/world-turn-orchestrator.ts", "utf8");
  assert.match(extracted, /export async function generateAiWorldDelta/);
  assert.match(facade, /export \{ generateAiWorldDelta \} from "\.\/game-engine\/world-turn-orchestrator\.ts"/);
  assert.doesNotMatch(facade, /export async function generateAiWorldDelta/);
  assert.doesNotMatch(extracted, /from ["']\.\.\/game-engine(?:\.ts)?["']/);
});

test("world turn keeps Main/world commit and ledger boundaries equivalent through the extracted owner", async () => {
  const { engine, model, worldTurn } = await loadWorldTurnModules();
  const game = model.createInitialGame("spectator");
  const resolved = engine.resolveWeek(game);
  const firstEnvelope = worldEnvelope(resolved.state, resolved.chapter);
  const secondEnvelope = worldEnvelope(resolved.state, resolved.chapter);
  const config = { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = worldModelFetch(firstEnvelope);
  try {
    const facadeResult = await engine.generateAiWorldDelta(config, resolved.state, resolved.chapter, () => {});
    globalThis.fetch = worldModelFetch(secondEnvelope);
    const extractedResult = await worldTurn.generateAiWorldDelta(config, structuredClone(resolved.state), structuredClone(resolved.chapter), () => {});
    assert.deepEqual(normalizeVolatileState(extractedResult), normalizeVolatileState(facadeResult));
    assert.equal(facadeResult.worldSnapshots[0].week, resolved.chapter.week);
    assert.ok(facadeResult.worldLedger.events.some((event) => event.kind === "week-committed"));
    assert.equal(facadeResult.worldLedger.events.filter((event) => event.kind === "week-committed").at(-1)?.week, facadeResult.week);
    assert.equal(facadeResult.worldAgents.lastPlannedWeek, resolved.chapter.week);
    assert.equal(facadeResult.factionStrategy.lastResolvedWeek, resolved.chapter.week);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("world turn preserves fail-closed provider errors before durable commit", async () => {
  const { engine, model, worldTurn } = await loadWorldTurnModules();
  const game = model.createInitialGame("spectator");
  const resolved = engine.resolveWeek(game);
  const config = { provider: "unsupported-provider", endpoint: "http://127.0.0.1:1", apiKey: "test-key", model: "test-model" };
  const beforeKernel = structuredClone(resolved.state.worldKernel);
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  try {
    await assert.rejects(() => engine.generateAiWorldDelta(config, resolved.state, resolved.chapter, () => {}), /provider|PROVIDER|端点|浏览器|模型|支持/i);
    assert.deepEqual(resolved.state.worldKernel, beforeKernel);
    await assert.rejects(() => worldTurn.generateAiWorldDelta(config, structuredClone(resolved.state), structuredClone(resolved.chapter), () => {}), /provider|PROVIDER|端点|浏览器|模型|支持/i);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
