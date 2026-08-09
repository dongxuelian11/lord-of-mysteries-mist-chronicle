import { createServer } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { JsHybridRetriever } from "./rag/lib/search.mjs";

const apiKey = process.env.DEEPSEEK_API_KEY || "";
if (!apiKey) {
  console.error("缺少 DEEPSEEK_API_KEY 环境变量");
  process.exit(1);
}

globalThis.window = globalThis;
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
      const authorized = (chunk) => {
        if (request.audience.kind === "world" || request.audience.kind === "world-simulation-internal") return true;
        if ([chunk.id, chunk.documentId, chunk.title, chunk.sourceLocator].some((value) => value && known.has(value))) return true;
        return chunk.visibility === "restricted" && (chunk.topics ?? []).some((topic) => topicGrants.has(topic));
      };
      ragMetrics.push({
        audience: request.audience.kind,
        unauthorizedNonPublic: nonPublic.filter((chunk) => !authorized(chunk)).length,
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
  try {
    const response = await nativeFetch(url, init);
    modelMetrics.push({ responseHeaderLatencyMs: Math.round(performance.now() - startedAt), ok: response.ok, status: response.status });
    return response;
  } catch (error) {
    modelMetrics.push({ responseHeaderLatencyMs: Math.round(performance.now() - startedAt), ok: false, status: 0 });
    throw error;
  }
};

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const [model, planningService, lore] = await Promise.all([
    server.ssrLoadModule("/app/game-model.ts"),
    server.ssrLoadModule("/app/agent-planning-service.ts"),
    server.ssrLoadModule("/app/generated-lore-compendium.ts"),
  ]);
  const config = {
    provider: "compatible",
    endpoint: process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com",
    apiKey,
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    quality: "balanced",
    timeoutMs: 170_000,
  };
  const baseGame = model.createInitialGame("spectator");
  const chapter = { id: "materiality-probe", week: baseGame.week, date: baseGame.date, title: "Materiality probe", summary: "", source: "rules", results: [], sections: [] };
  const cycles = [];
  let primedWorldAgents = baseGame.worldAgents;

  for (let cycle = 1; cycle <= 5; cycle += 1) {
    const cycleGame = { ...baseGame, worldAgents: primedWorldAgents };
    const modelStart = modelMetrics.length;
    const ragStart = ragMetrics.length;
    const startedAt = performance.now();
    const result = await planningService.planAutonomousAgentsForWeek({
      config,
      game: cycleGame,
      chapter,
      loreRecords: lore.LORE_RECORDS,
      horizon: baseGame.worldKernel.canon.knowledgeHorizon,
    });
    const planningSources = result.proposals.reduce((counts, proposal) => {
      counts[proposal.planningSource] = (counts[proposal.planningSource] ?? 0) + 1;
      return counts;
    }, { model: 0, "materiality-skip": 0, "deterministic-fallback": 0 });
    cycles.push({
      cycle,
      elapsedMs: Math.round(performance.now() - startedAt),
      acceptedProposals: result.proposals.length,
      planningSources,
      modelCalls: modelMetrics.length - modelStart,
      ragCalls: ragMetrics.length - ragStart,
    });
    if (cycle === 1) {
      const signatures = new Map(result.decisionFrames.map((frame) => [frame.ref, frame.planningSignature]));
      primedWorldAgents = {
        ...result.autonomousState,
        profiles: result.autonomousState.profiles.map((profile) => ({
          ...profile,
          lastPlanningSignature: signatures.get(profile.ref) ?? profile.lastPlanningSignature,
        })),
      };
    }
    planningService.releaseAutonomousPlanningCache(cycleGame);
  }

  const acceptedProposals = cycles.reduce((sum, cycle) => sum + cycle.acceptedProposals, 0);
  const modelProposals = cycles.reduce((sum, cycle) => sum + cycle.planningSources.model, 0);
  const materialitySkips = cycles.reduce((sum, cycle) => sum + cycle.planningSources["materiality-skip"], 0);
  const deterministicFallbacks = cycles.reduce((sum, cycle) => sum + cycle.planningSources["deterministic-fallback"], 0);
  const evidence = {
    cycles: cycles.length,
    ragChunkCount,
    acceptedProposals,
    modelProposals,
    materialitySkips,
    deterministicFallbacks,
    avoidedModelCalls: materialitySkips,
    skipRate: acceptedProposals ? materialitySkips / acceptedProposals : 0,
    actualModelCalls: modelMetrics.length,
    actualRagCalls: ragMetrics.length,
    unauthorizedNonPublic: ragMetrics.reduce((sum, metric) => sum + metric.unauthorizedNonPublic, 0),
  };
  console.log(JSON.stringify({ cycles, evidence }, null, 2));

  const failures = [];
  if (ragChunkCount <= 0) failures.push("runtime RAG index was not loaded");
  if (cycles[0].planningSources.model <= 0 || cycles[0].modelCalls <= 0) failures.push("the priming cycle did not use the real model");
  if (cycles.slice(1).some((cycle) => cycle.planningSources["materiality-skip"] !== cycle.acceptedProposals)) failures.push("an unchanged repeated cycle did not reuse every proposal");
  if (cycles.slice(1).some((cycle) => cycle.modelCalls !== 0 || cycle.ragCalls !== 0)) failures.push("an unchanged repeated cycle still called the model or RAG");
  if (evidence.unauthorizedNonPublic > 0) failures.push("unauthorized non-public RAG chunks were returned");
  if (modelMetrics.some((metric) => !metric.ok)) failures.push("at least one model HTTP request failed");
  if (failures.length) {
    console.error(`REAL_MATERIALITY_EVIDENCE_FAILED: ${failures.join("; ")}`);
    process.exitCode = 1;
  }
} finally {
  await server.close();
}

