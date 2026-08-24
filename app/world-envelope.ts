import type { ActionResult, ChronicleChapter, GameState } from "./game-model";
import { callModel, userFacingModelError, type AiConfig, type ModelCallOptions } from "./ai-client";
import { actionTextBoundaryIssue } from "./action-boundaries";
import { extractJson, textSimilarity } from "./model-output";
import type { RuntimeTraceContext } from "./runtime-trace.ts";

const REPEATED_PUBLIC_SIGNALS_ISSUE = "全部公开消息都与最近四周高度复写";

function publicSignalsIssue(value: Record<string, unknown>, game: GameState) {
  const validSignals = Array.isArray(value.publicSignals) ? value.publicSignals.filter((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).headline === "string" && typeof (item as Record<string, unknown>).body === "string") : [];
  if (validSignals.length < 2) return "固定报纸与公开消息少于2条";
  const recentSignals = (game.worldSignals ?? []).filter((signal) => signal.week >= game.week - 4).slice(0, 24);
  const repeatedSignals = validSignals.filter((item) => {
    const signal = item as Record<string, unknown>;
    const candidate = `${String(signal.headline ?? "")} ${String(signal.body ?? "")}`;
    return recentSignals.some((previous) => textSimilarity(candidate, `${previous.headline} ${previous.body}`) >= .78);
  });
  if (repeatedSignals.length === validSignals.length) return REPEATED_PUBLIC_SIGNALS_ISSUE;
  return null;
}

export function worldEnvelopeIssue(value: Record<string, unknown>, game: GameState, playerIssuedNoOrders: boolean, expectedActionIds: string[]) {
  const signalIssue = publicSignalsIssue(value, game);
  if (signalIssue) return signalIssue;
  const validMoves = Array.isArray(value.factionMoves) ? value.factionMoves.filter((item) => item && typeof item === "object" && game.factions.some((faction) => faction.id === (item as Record<string, unknown>).factionId) && typeof (item as Record<string, unknown>).title === "string" && typeof (item as Record<string, unknown>).detail === "string") : [];
  const kernel = value.kernelDelta && typeof value.kernelDelta === "object" && !Array.isArray(value.kernelDelta) ? value.kernelDelta as Record<string, unknown> : null;
  if (!kernel) return "缺少持续世界状态增量kernelDelta";
  if (playerIssuedNoOrders && Array.isArray(value.actionReports) && value.actionReports.length) return "无玩家命令的一周不应生成行动报告";
  if (!playerIssuedNoOrders) {
    const reports = Array.isArray(value.actionReports) ? value.actionReports.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
    const missing = expectedActionIds.filter((id) => !reports.some((report) => report.actionId === id && typeof report.fieldReport === "string" && Array.isArray(report.observableFacts) && report.observableFacts.filter((fact) => typeof fact === "string" && fact.trim()).length >= 2));
    if (missing.length) return `行动报告缺少可核验的现场事实：${missing.join("、")}`;
  }
  const genuinelyAdvancedMoves = validMoves.filter((item) => {
    const move = item as Record<string, unknown>;
    const prior = game.factions.find((faction) => faction.id === move.factionId)?.lastMove ?? "";
    return !prior || textSimilarity(`${String(move.title ?? "")} ${String(move.detail ?? "")}`, prior) < .8;
  });
  if (validMoves.length && !genuinelyAdvancedMoves.length) return "本周发生的势力行动全部只是复述上一周";
  return null;
}

async function repairPublicSignals(config: AiConfig, value: Record<string, unknown>, game: GameState, onStage: (value: string) => void, onToken?: (text: string) => void, trace?: RuntimeTraceContext): Promise<Record<string, unknown>> {
  const recentSignalExcerpts = (game.worldSignals ?? [])
    .filter((signal) => signal.week >= game.week - 4)
    .slice(0, 16)
    .map((signal) => `- ${signal.channel}｜${signal.headline}：${signal.body.slice(0, 180)}`)
    .join("\n");
  const stableFacts = {
    worldSummary: value.worldSummary,
    actionReports: value.actionReports,
    factionMoves: value.factionMoves,
    canonMoves: value.canonMoves,
    emergentPressure: value.emergentPressure,
    emergentLead: value.emergentLead,
    organizationDelta: value.organizationDelta,
    kernelDelta: value.kernelDelta && typeof value.kernelDelta === "object" && !Array.isArray(value.kernelDelta) ? {
      events: (value.kernelDelta as Record<string, unknown>).events,
      projectUpdates: (value.kernelDelta as Record<string, unknown>).projectUpdates,
      locationUpdates: (value.kernelDelta as Record<string, unknown>).locationUpdates,
    } : null,
  };
  let lastIssue = REPEATED_PUBLIC_SIGNALS_ISSUE;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    onStage(attempt ? `公开消息仍不合格（${lastIssue}），正在进行第二次局部重写` : "本周世界事实已经裁定，正在单独重写重复的报纸与公开消息");
    const prompt = `本周世界事实已经完成裁决并被冻结。你只能重写 publicSignals，绝对不得新增、删除或改变任何事件、角色行动、势力行动、组织结算或持续项目。\n\n冻结事实：\n${JSON.stringify(stableFacts)}\n\n本次禁止复写的最近四周公开文本：\n${recentSignalExcerpts || "（没有近期公开文本）"}\n\n只返回严格 JSON：{"publicSignals":[...]}，数组必须有2至4条。每条包含 channel、headline、body、reliability，可选 districtId、cityId、relatedFactionId。channel 只能是“报纸、街谈、官方通告、行业消息、神秘征兆、私人来信”，至少一条来自报纸、官方通告或行业消息；reliability 只能是“公开事实、多源传闻、单一消息、异常感知”。\n每条都必须是冻结事实的公开可见侧面；允许安静周刊登天气、物价、交通、治安告示或行业通知，但不得借此虚构新的世界事件。不能只替换同义词，主题、受影响人群或可观察后果必须与禁用文本有实质区别。${attempt ? `\n上次局部重写仍失败：${lastIssue}。本次请更换报道角度与公开信息主题。` : ""}`;
    try {
      const repaired = extractJson(await callModel(config, "你是《灰雾纪事》的公开消息编辑。世界事实是只读输入；你的唯一输出权限是 publicSignals。", prompt, { task: "world-repair", json: true, maxTokens: 2200, temperature: attempt ? .68 : .55, stream: true, onToken, trace: trace ? { ...trace, traceId: `${trace.traceId ?? "world"}:public-repair:${attempt}`, repairCount: (trace.repairCount ?? 0) + attempt + 1 } : undefined }));
      const candidate: Record<string, unknown> = { ...value, publicSignals: repaired.publicSignals };
      const issue = publicSignalsIssue(candidate, game);
      if (!issue) return candidate;
      lastIssue = issue;
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : "公开消息局部重写无法解析";
    }
  }
  throw new Error(`${lastIssue}；两次公开消息局部重写后仍未通过校验`);
}

export async function requestWorldEnvelope(config: AiConfig, system: string, prompt: string, game: GameState, playerIssuedNoOrders: boolean, expectedActionIds: string[], onStage: (value: string) => void, onToken?: (text: string) => void, trace?: RuntimeTraceContext, worldRequest?: { payload: unknown; turnId: string; baseRevision: number; maxChars?: number }, onRetrieval?: ModelCallOptions["onRetrieval"]) {
  let lastIssue = "世界模型没有返回可解析结构";
  const recentSignalExcerpts = (game.worldSignals ?? []).filter((signal) => signal.week >= game.week - 4).slice(0, 12).map((signal) => `- ${signal.channel}｜${signal.headline}：${signal.body.slice(0, 180)}`).join("\n");
  let preparedWorldRequest: { ticket: string; payloadHash: string } | undefined;
  let durableAttempt = 0;
  if (worldRequest) {
    if (typeof window === "undefined" || typeof window.mistInference?.prepareWorld !== "function") throw new Error("WORLD_INFERENCE_PREPARE_UNAVAILABLE");
    const prepared = await window.mistInference.prepareWorld(worldRequest);
    if (!prepared.ok || typeof prepared.ticket !== "string" || !prepared.ticket || typeof prepared.payloadHash !== "string" || !/^[0-9a-f]{64}$/.test(prepared.payloadHash) || !Number.isInteger(prepared.attempt) || Number(prepared.attempt) < 0 || Number(prepared.attempt) > 1) throw new Error(userFacingModelError(prepared.error ?? "WORLD_INFERENCE_PREPARE_FAILED"));
    preparedWorldRequest = { ticket: prepared.ticket, payloadHash: prepared.payloadHash };
    durableAttempt = Number(prepared.attempt);
  }
  let preModelFailures = 0;
  while (durableAttempt < 2 && preModelFailures < 2) {
    const attempt = durableAttempt;
    const repair = attempt ? `\n\n上一次输出未通过结构校验：${lastIssue}。不要解释错误，不要沿用损坏JSON；请根据同一事实与持续状态重新推演一次，并返回完整、严格、可解析的JSON。若错误涉及重复，以下是本次禁止复写的近期公开文本：\n${recentSignalExcerpts || "（没有近期公开文本）"}\n持续事件必须推进到新的参与者反应、地点变化、制度后果或可观察代价；仅改写措辞仍视为失败。至少两条公开消息应来自近期消息未覆盖的事件结果或社会侧面，但仍须由本周世界状态因果支持。` : "";
    let modelAttemptSpent = false;
    try {
      const raw = await callModel(config, system, `${prompt}${repair}`, { task: "world-adjudication", json: true, maxTokens: 8200, temperature: attempt ? .58 : .72, stream: true, onToken, trace: trace ? { ...trace, traceId: `${trace.traceId ?? "world"}:attempt:${attempt}`, repairCount: (trace.repairCount ?? 0) + attempt } : undefined, worldRequest: preparedWorldRequest ? { ticket: preparedWorldRequest.ticket, attempt } : undefined, onRetrieval: preparedWorldRequest ? (retrieval) => {
        if (retrieval.authority.payloadHash !== preparedWorldRequest.payloadHash) throw new Error("WORLD_INFERENCE_PAYLOAD_DIGEST_MISMATCH");
        onRetrieval?.(retrieval);
      } : onRetrieval });
      modelAttemptSpent = true;
      durableAttempt += 1;
      const value = extractJson(raw);
      const issue = worldEnvelopeIssue(value, game, playerIssuedNoOrders, expectedActionIds);
      if (!issue) return value;
      if (issue === REPEATED_PUBLIC_SIGNALS_ISSUE) {
        const repaired = await repairPublicSignals(config, value, game, onStage, onToken, trace);
        const repairedIssue = worldEnvelopeIssue(repaired, game, playerIssuedNoOrders, expectedActionIds);
        if (!repairedIssue) return repaired;
        lastIssue = repairedIssue;
        continue;
      }
      lastIssue = issue;
    } catch (error) {
      if (!modelAttemptSpent) {
        const worldError = error instanceof Error ? error as Error & { worldAttemptStarted?: boolean; worldAttemptStatusUnknown?: boolean } : null;
        if (preparedWorldRequest && worldError?.worldAttemptStatusUnknown === true) {
          try {
            if (typeof window.mistInference?.statusWorld !== "function") throw new Error("WORLD_INFERENCE_STATUS_UNAVAILABLE");
            const status = await window.mistInference.statusWorld({ ticket: preparedWorldRequest.ticket });
            if (!status.ok || status.ticket !== preparedWorldRequest.ticket || status.payloadHash !== preparedWorldRequest.payloadHash || !Number.isInteger(status.attempt) || Number(status.attempt) < attempt || Number(status.attempt) > 2) {
              throw new Error(status.error ?? "WORLD_INFERENCE_STATUS_INVALID");
            }
            const synchronizedAttempt = Number(status.attempt);
            if (synchronizedAttempt === attempt) preModelFailures += 1;
            durableAttempt = synchronizedAttempt;
          } catch (statusError) {
            lastIssue = statusError instanceof Error ? userFacingModelError(statusError.message) : "世界模型尝试状态无法确认";
            preModelFailures = 2;
            continue;
          }
        } else {
          const attemptStarted = !preparedWorldRequest || worldError?.worldAttemptStarted === true;
          if (attemptStarted) durableAttempt += 1;
          else preModelFailures += 1;
        }
      }
      lastIssue = error instanceof Error ? userFacingModelError(error.message) : "世界模型输出无法解析";
    }
    if (durableAttempt < 2 && preModelFailures < 2) onStage(`世界推演结果不完整（${lastIssue}），正在进行一次结构修复`);
  }
  throw new Error(`${lastIssue}；结构修复后仍未达到世界回合最低要求`);
}

export async function repairActionReports(config: AiConfig, game: GameState, chapter: ChronicleChapter, violations: { result: ActionResult; issue: string }[], original: unknown[], frozenWorldFacts: Record<string, unknown>, onToken?: (text: string) => void) {
  const originalById = new Map<string, unknown>();
  for (const item of original) if (item && typeof item === "object" && !Array.isArray(item)) {
    const value = item as Record<string, unknown>;
    if (typeof value.actionId === "string") originalById.set(value.actionId, value);
  }
  const repaired = [...original];
  const system = "你是《灰雾纪事》行动报告的约束编辑。世界裁决事实只读；玩家命令、红线与撤退条件是最高优先级。你一次只能修复一份 actionReport。";
  for (const violation of violations) {
    const originalReport = originalById.get(violation.result.id);
    const originalValue = originalReport && typeof originalReport === "object" && !Array.isArray(originalReport) ? originalReport as Record<string, unknown> : {};
    const fragments = [...(typeof originalValue.fieldReport === "string" ? originalValue.fieldReport.split(/[。！？；\n]/) : []), ...(Array.isArray(originalValue.observableFacts) ? originalValue.observableFacts.map(String) : [])]
      .map((item) => item.trim()).filter((item) => item && !actionTextBoundaryIssue(item, game, violation.result.contract)).slice(0, 6);
    let lastIssue = violation.issue;
    let replacement: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = `这份行动报告必须在不重算世界、不改变行动成败的前提下重写。\n行动：${JSON.stringify({ actionId: violation.result.id, title: violation.result.title, outcome: violation.result.outcome, consequence: violation.result.consequence, intent: violation.result.contract.rawIntent, desiredOutcome: violation.result.contract.desiredOutcome, redLines: violation.result.contract.redLines, retreat: violation.result.contract.retreat })}\n冻结的本周世界事实：${JSON.stringify(frozenWorldFacts)}\n原报告中已通过边界检查、可以保留的片段：${JSON.stringify(fragments)}\n\n只返回严格 JSON：{"actionReport":{"actionId":"${violation.result.id}","fieldReport":"...","observableFacts":["...","..."],"followUp":"..."}}。observableFacts 必须恰好2至4条，且是可核验观察。资料不足时应如实写明比对范围和未发现匹配项，不能虚构接触对象或内部文件。fieldReport、observableFacts、followUp 都必须服从红线；不要在输出中复述、讨论或引用被禁止的行为词。可以写“执行者全程留在组织据点，仅比对已经持有的公开材料”。${attempt ? `\n上次局部重写未通过：${lastIssue}。请改用完全不同且更保守的句式。` : ""}`;
      try {
        const raw = extractJson(await callModel(config, system, prompt, { task: "world-repair", json: true, maxTokens: 1400, temperature: attempt ? .22 : .3, stream: true, onToken }));
        const candidate = raw.actionReport && typeof raw.actionReport === "object" && !Array.isArray(raw.actionReport) ? raw.actionReport as Record<string, unknown> : null;
        const facts = candidate && Array.isArray(candidate.observableFacts) ? candidate.observableFacts.map(String).map((item) => item.trim()).filter(Boolean) : [];
        if (!candidate || candidate.actionId !== violation.result.id || typeof candidate.fieldReport !== "string" || typeof candidate.followUp !== "string" || facts.length < 2 || facts.length > 4) { lastIssue = "缺少完整且可核验的行动报告字段"; continue; }
        const boundaryIssue = actionTextBoundaryIssue([candidate.fieldReport, ...facts, candidate.followUp].join("\n"), game, violation.result.contract);
        if (boundaryIssue) { lastIssue = boundaryIssue; continue; }
        replacement = { ...candidate, observableFacts: facts };
        break;
      } catch (error) {
        lastIssue = error instanceof Error ? error.message : "行动报告局部重写无法解析";
      }
    }
    if (!replacement) throw new Error(`世界模型对“${violation.result.title}”的现场报告${lastIssue}；两次局部修复后仍未通过`);
    const index = repaired.findIndex((item) => item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).actionId === violation.result.id);
    if (index >= 0) repaired[index] = replacement;
    else repaired.push(replacement);
  }
  return repaired;
}
