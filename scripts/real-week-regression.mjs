// 真机长线回归：用真实 DeepSeek API 连续跑 N 周，记录每阶段耗时。
// 用法:
//   $env:DEEPSEEK_API_KEY="sk-..." ; node scripts/real-week-regression.mjs [周数]
// 默认 3 周，最多 20 周；模型/端点可通过环境变量覆盖：
//   DEEPSEEK_ENDPOINT=https://api.deepseek.com
//   DEEPSEEK_MODEL=deepseek-v4-flash
import { createServer } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsHybridRetriever } from "./rag/lib/search.mjs";

const argumentsList = process.argv.slice(2);
const weeks = Math.max(1, Math.min(20, Number(argumentsList.find((item) => /^\d+$/.test(item)) || 3)));
const resume = argumentsList.includes("--resume");
const requirePrivateKnowledge = argumentsList.includes("--require-private-knowledge");
const checkpointPath = join(tmpdir(), "mist-chronicle-real-week-regression.json");
const apiKey = process.env.DEEPSEEK_API_KEY || "";
if (!apiKey) {
  console.error("缺少 DEEPSEEK_API_KEY 环境变量");
  process.exit(1);
}

globalThis.window = globalThis;

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

function mergeCounts(entries, field) {
  return entries.reduce((totals, entry) => {
    for (const [key, value] of Object.entries(entry[field] ?? {})) {
      totals[key] = (totals[key] ?? 0) + Number(value || 0);
    }
    return totals;
  }, {});
}

const ragIndexDir = process.env.RAG_INDEX_DIR || join(process.env.APPDATA || "", "mist-chronicle-prototype", "rag", "index");
const ragMetrics = [];
let ragChunkCount = 0;
if (existsSync(join(ragIndexDir, "index.meta.json"))) {
  const meta = JSON.parse(readFileSync(join(ragIndexDir, "index.meta.json"), "utf8"));
  const chunks = JSON.parse(readFileSync(join(ragIndexDir, "chunks.json"), "utf8"));
  const inverted = JSON.parse(readFileSync(join(ragIndexDir, "inverted.json"), "utf8"));
  const aliasMap = existsSync(join(ragIndexDir, "alias-map.json")) ? JSON.parse(readFileSync(join(ragIndexDir, "alias-map.json"), "utf8")) : {};
  const retriever = new JsHybridRetriever({ chunks, inverted, aliasMap });
  ragChunkCount = Number(meta.chunks) || chunks.length;
  globalThis.window.mistRag = {
    async search(request) {
      const result = retriever.searchSync({
        text: request.query,
        filters: {
          audience: request.audience,
          maxSpoilerScope: request.maxSpoilerScope,
          week: request.week,
          gameDate: request.gameDate,
          allowedVolumes: request.allowedVolumes,
          horizon: request.horizon,
        },
        limit: request.limit,
        maxChars: request.maxChars,
      });
      const known = new Set(request.audience.knownLoreIds ?? []);
      const topicGrants = new Set(request.audience.topicGrants ?? []);
      const nonPublic = result.chunks.filter((chunk) => chunk.visibility !== "public");
      const isAuthorizedNonPublic = (chunk) => {
        if (request.audience.kind === "world" || request.audience.kind === "world-simulation-internal") return true;
        if ([chunk.id, chunk.documentId, chunk.title, chunk.sourceLocator].some((value) => value && known.has(value))) return true;
        return chunk.visibility === "restricted" && (chunk.topics ?? []).some((topic) => topicGrants.has(topic));
      };
      ragMetrics.push({
        audience: request.audience.kind,
        selected: result.chunks.length,
        nonPublic: nonPublic.length,
        unauthorizedNonPublic: nonPublic.filter((chunk) => !isAuthorizedNonPublic(chunk)).length,
        latencyMs: result.trace.latencyMs,
      });
      return { available: true, records: result.chunks, context: result.context };
    },
    async listChunkIds() { return retriever.allChunkIds(); },
    async status() { return { available: true, chunks: ragChunkCount }; },
  };
}

const nativeFetch = globalThis.fetch.bind(globalThis);
const modelMetrics = [];
globalThis.fetch = async (url, init) => {
  const startedAt = performance.now();
  let kind = "other";
  let promptChars = 0;
  let maxTokens = 0;
  let worldPayloadChars = {};
  try {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const messages = body.messages ?? [];
    const prompt = messages.map((message) => String(message.content ?? "")).join("\n");
    promptChars = prompt.length;
    maxTokens = Number(body.max_tokens) || 0;
    if (prompt.includes("kernelDelta") && prompt.includes("organizationDelta")) {
      kind = "world";
      const userPrompt = String(messages.at(-1)?.content ?? "");
      const marker = "本周有界裁决投影：\n";
      const markerIndex = userPrompt.lastIndexOf(marker);
      if (markerIndex >= 0) {
        const payload = JSON.parse(userPrompt.slice(markerIndex + marker.length));
        worldPayloadChars = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, JSON.stringify(value).length]));
      }
    }
    else if (prompt.includes('"planningWeek"') && prompt.includes('"agentRef"')) kind = "autonomous-agent";
    else if (prompt.includes('"sections"') || prompt.includes("文学")) kind = "literary";
  } catch {
    // Metrics must never interfere with the request.
  }
  try {
    const response = await nativeFetch(url, init);
    modelMetrics.push({ kind, promptChars, maxTokens, worldPayloadChars, responseHeaderLatencyMs: Math.round(performance.now() - startedAt), status: response.status, ok: response.ok });
    return response;
  } catch (error) {
    modelMetrics.push({ kind, promptChars, maxTokens, worldPayloadChars, responseHeaderLatencyMs: Math.round(performance.now() - startedAt), status: 0, ok: false });
    throw error;
  }
};

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
const engine = await server.ssrLoadModule("/app/game-engine.ts");
const model = await server.ssrLoadModule("/app/game-model.ts");

const config = {
  provider: "compatible",
  endpoint: process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com",
  apiKey,
  model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  quality: "balanced",
  timeoutMs: 170_000,
  ...(requirePrivateKnowledge ? {
    worldBible: "Authority regression scenario: use the real autonomous proposal and private context of the existing persistent actor with id \"klein\". Resolve one event that is causally supported by that proposal, then persist exactly one fact that Klein actually witnesses or investigates as private actor knowledge. kernelDelta must contain the matching event with actorIds [\"klein\"], one actors-visible observation with holderIds [\"klein\"] and acquisitionKind \"witness\" or \"investigation\", and one actors-visible knowledge entry with holderIds [\"klein\"] and the same sourceEventId. Do not disclose it to the player, another actor, a faction, or the public. Do not invent a fact outside the authorized proposal, world state, or authorized lore.",
  } : {}),
};

const checkpoint = resume && existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, "utf8")) : null;
let game = checkpoint?.game ?? model.createInitialGame("spectator");
const report = Array.isArray(checkpoint?.report) ? checkpoint.report : [];
const WEEKLY_ORDERS = [
  null,
  "整理本周公开报纸与失踪记录，只做比对，不接触任何人。",
  "与内务负责人核对基层人力、金钱和非凡材料，只处理需要议会决定的异常。",
  "根据贝克兰德地图已有情报，选择一个争夺中的战略点进行低暴露侦察。",
  "暂不下达新命令，让各负责人依照既有职责运转并报告异常。",
  "评估现有成员的职责与负担，必要时提出换任建议，但不强制调整。",
];

try {
  for (let week = Math.max(1, Number(game.week) || 1); week <= weeks; week += 1) {
    const modelMetricStart = modelMetrics.length;
    const ragMetricStart = ragMetrics.length;
    const order = requirePrivateKnowledge ? null : WEEKLY_ORDERS[(week - 1) % WEEKLY_ORDERS.length];
    if (order) {
      const contract = engine.localContract({
        intent: `第${week}周：${order}`,
        game,
        leaderId: "organization",
        districtId: "cherwood",
        abilityIds: [],
      });
      game = { ...game, schedule: [engine.scheduleContract(game, contract)] };
    } else {
      game = { ...game, schedule: [] };
    }
    const resolved = engine.resolveWeek(game);

    let worldOutputChars = 0;
    let worldAttemptCount = 0;
    let simulated;
    const worldStart = performance.now();
    while (!simulated && worldAttemptCount < 3) {
      worldAttemptCount += 1;
      try {
        simulated = await engine.generateAiWorldDelta(config, resolved.state, resolved.chapter, () => {}, (token) => { worldOutputChars += token.length; });
      } catch (error) {
        if (worldAttemptCount >= 3) throw error;
        console.warn(`week ${week}: rejected world attempt ${worldAttemptCount}; retrying the uncommitted week`);
      }
    }
    const worldMs = Math.round(performance.now() - worldStart);

    const enriched = simulated.chronicle.find((item) => item.id === resolved.chapter.id) ?? resolved.chapter;
    let literaryOutputChars = 0;
    const literaryStart = performance.now();
    const literary = await engine.generateLiteraryChapter(config, simulated, enriched, () => {}, (token) => { literaryOutputChars += token.length; });
    const literaryMs = Math.round(performance.now() - literaryStart);

    game = { ...simulated, chronicle: simulated.chronicle.map((item) => item.id === literary.id ? literary : item) };
    const paragraphs = literary.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
    const weeklyModelMetrics = modelMetrics.slice(modelMetricStart);
    const weeklyRagMetrics = ragMetrics.slice(ragMetricStart);
    const proposalEvents = simulated.worldLedger.events.filter((event) => event.week === literary.week && event.kind === "action-proposed" && String(event.id).startsWith("autonomous-proposal:"));
    const planningSources = proposalEvents.reduce((counts, event) => {
      const source = String(event.payload.planningSource ?? "unknown");
      counts[source] = (counts[source] ?? 0) + 1;
      return counts;
    }, { model: 0, "materiality-skip": 0, "deterministic-fallback": 0 });
    const factionProposals = proposalEvents.filter((event) => String(event.payload.agentRef ?? "").startsWith("faction:"));
    const privateKnowledge = simulated.worldKernel.knowledge.filter((node) => node.acquiredWeek === literary.week && (node.visibility === "actors" || node.visibility === "player") && (node.holderRefs ?? []).length > 0);
    const grantsByKnowledge = new Map();
    for (const grant of simulated.worldKernel.knowledgeGrants.filter((grant) => grant.week === literary.week)) {
      if (!grantsByKnowledge.has(grant.knowledgeId)) grantsByKnowledge.set(grant.knowledgeId, new Set());
      grantsByKnowledge.get(grant.knowledgeId).add(grant.holderRef);
    }
    const knowledgeGrantCoverage = privateKnowledge.every((node) => (node.holderRefs ?? []).every((holderRef) => grantsByKnowledge.get(node.id)?.has(holderRef)));
    const privateKnowledgeHolders = privateKnowledge.reduce((sum, node) => sum + (node.holderRefs ?? []).length, 0);
    const knowledgeGrantChains = privateKnowledge.reduce((sum, node) => sum + (node.holderRefs ?? []).filter((holderRef) => {
      const grant = simulated.worldKernel.knowledgeGrants.find((candidate) => candidate.week === literary.week && candidate.knowledgeId === node.id && candidate.holderRef === holderRef);
      if (!grant || grant.sourceEventId !== node.sourceEventId) return false;
      const observation = simulated.worldKernel.observations.find((candidate) => candidate.id === grant.sourceObservationId && candidate.eventId === grant.sourceEventId);
      const event = simulated.worldKernel.events.find((candidate) => candidate.id === grant.sourceEventId);
      return Boolean(observation && event && observation.acquisitionKind === grant.kind && (observation.holderRefs ?? []).includes(holderRef));
    }).length, 0);
    const factionRecallReceipts = simulated.memory.receipts.filter((receipt) => receipt.week === literary.week && receipt.kind === "recalled" && receipt.audience.kind === "faction").length;
    const modelCalls = weeklyModelMetrics.reduce((counts, metric) => {
      counts[metric.kind] = (counts[metric.kind] ?? 0) + 1;
      return counts;
    }, {});
    const modelPromptChars = weeklyModelMetrics.reduce((counts, metric) => {
      counts[metric.kind] = (counts[metric.kind] ?? 0) + metric.promptChars;
      return counts;
    }, {});
    const worldPayloadChars = weeklyModelMetrics.filter((metric) => metric.kind === "world").reduce((counts, metric) => {
      for (const [key, value] of Object.entries(metric.worldPayloadChars ?? {})) counts[key] = (counts[key] ?? 0) + Number(value || 0);
      return counts;
    }, {});
    const ragCalls = weeklyRagMetrics.reduce((counts, metric) => {
      counts[metric.audience] = (counts[metric.audience] ?? 0) + 1;
      return counts;
    }, {});
    const entry = {
      week: literary.week,
      worldAttemptCount,
      worldRejectedAttempts: worldAttemptCount - 1,
      worldMs,
      literaryMs,
      totalMs: worldMs + literaryMs,
      signals: simulated.worldSignals.length,
      snapshots: simulated.worldSnapshots.length,
      chapterTitle: literary.title,
      sections: literary.sections.length,
      paragraphs,
      modelCalls,
      modelPromptChars,
      modelOutputChars: { world: worldOutputChars, literary: literaryOutputChars },
      worldPayloadChars,
      modelResponseHeaderLatencyMs: weeklyModelMetrics.reduce((sum, metric) => sum + metric.responseHeaderLatencyMs, 0),
      acceptedProposals: proposalEvents.length,
      planningSources,
      factionProposals: factionProposals.length,
      factionRecallReceipts,
      ragCalls,
      ragLatencyMs: weeklyRagMetrics.reduce((sum, metric) => sum + metric.latencyMs, 0),
      ragUnauthorizedNonPublic: weeklyRagMetrics.reduce((sum, metric) => sum + metric.unauthorizedNonPublic, 0),
      privateKnowledge: privateKnowledge.length,
      privateKnowledgeHolders,
      knowledgeGrantChains,
      knowledgeGrantCoverage,
      order: order ?? "安静周：没有新命令",
    };
    report.push(entry);
    writeFileSync(checkpointPath, JSON.stringify({ game, report }), "utf8");
    console.log(`week ${entry.week}: world=${worldMs}ms literary=${literaryMs}ms total=${entry.totalMs}ms signals=${entry.signals} sections=${entry.sections} paragraphs=${paragraphs} title=${entry.chapterTitle} order=${entry.order}`);
  }
  const evidence = {
    weeks: report.length,
    ragIndexDir,
    ragChunkCount,
    latencyMs: {
      worldTotal: report.reduce((sum, entry) => sum + entry.worldMs, 0),
      worldP50: percentile(report.map((entry) => entry.worldMs), 50),
      worldP95: percentile(report.map((entry) => entry.worldMs), 95),
      literaryTotal: report.reduce((sum, entry) => sum + entry.literaryMs, 0),
      literaryP50: percentile(report.map((entry) => entry.literaryMs), 50),
      literaryP95: percentile(report.map((entry) => entry.literaryMs), 95),
      total: report.reduce((sum, entry) => sum + entry.totalMs, 0),
      totalP50: percentile(report.map((entry) => entry.totalMs), 50),
      totalP95: percentile(report.map((entry) => entry.totalMs), 95),
    },
    modelCalls: mergeCounts(report, "modelCalls"),
    modelPromptChars: mergeCounts(report, "modelPromptChars"),
    modelOutputChars: mergeCounts(report, "modelOutputChars"),
    worldPayloadChars: mergeCounts(report, "worldPayloadChars"),
    acceptedProposals: report.reduce((sum, entry) => sum + entry.acceptedProposals, 0),
    worldRejectedAttempts: report.reduce((sum, entry) => sum + entry.worldRejectedAttempts, 0),
    planningSources: mergeCounts(report, "planningSources"),
    factionProposals: report.reduce((sum, entry) => sum + entry.factionProposals, 0),
    factionRecallReceipts: report.reduce((sum, entry) => sum + entry.factionRecallReceipts, 0),
    ragCalls: mergeCounts(report, "ragCalls"),
    ragUnauthorizedNonPublic: report.reduce((sum, entry) => sum + entry.ragUnauthorizedNonPublic, 0),
    privateKnowledge: report.reduce((sum, entry) => sum + entry.privateKnowledge, 0),
    privateKnowledgeHolders: report.reduce((sum, entry) => sum + entry.privateKnowledgeHolders, 0),
    knowledgeGrantChains: report.reduce((sum, entry) => sum + entry.knowledgeGrantChains, 0),
    knowledgeGrantCoverage: report.every((entry) => entry.knowledgeGrantCoverage),
  };
  console.log(JSON.stringify({ report, evidence }, null, 2));

  const failures = [];
  if (ragChunkCount <= 0) failures.push("runtime RAG index was not loaded");
  if (evidence.ragUnauthorizedNonPublic > 0) failures.push(`${evidence.ragUnauthorizedNonPublic} unauthorized non-public RAG chunks were returned`);
  if (!evidence.knowledgeGrantCoverage) failures.push("at least one private knowledge holder lacks a matching KnowledgeGrant");
  if (evidence.knowledgeGrantChains !== evidence.privateKnowledgeHolders) failures.push("at least one private knowledge holder lacks a complete event/observation/grant chain");
  if (requirePrivateKnowledge && (evidence.privateKnowledge <= 0 || evidence.privateKnowledgeHolders <= 0 || evidence.knowledgeGrantChains <= 0)) failures.push("the required private-knowledge acquisition scenario produced no complete holder grant chain");
  if (Object.values(evidence.planningSources).reduce((sum, count) => sum + count, 0) !== evidence.acceptedProposals) failures.push("accepted proposal totals do not match planning-source totals");
  if (evidence.factionProposals <= 0) failures.push("no faction autonomous proposal was committed");
  if ((evidence.ragCalls["faction-private"] ?? 0) <= 0) failures.push("no faction-private RAG query was observed");
  if (modelMetrics.some((metric) => !metric.ok)) failures.push("at least one model HTTP request failed");
  if (failures.length) {
    console.error(`REAL_WEEK_EVIDENCE_FAILED: ${failures.join("; ")}`);
    process.exitCode = 1;
  }
} finally {
  await server.close();
}
