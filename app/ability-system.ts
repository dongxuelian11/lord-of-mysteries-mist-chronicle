import { AiConfig, callModel } from "./ai-client";
import {
  Ability, AbilityContext, AbilityScene, AbilityUseRecord, GameState, HiddenWorldFact, PATHWAYS,
} from "./game-model";
import { retrieveLoreContextAsync } from "./rag/client";
import {
  memoryPromptBlockWithIds,
  submitMemoryDelivery,
  playerAudience,
} from "./memory/index";
import {
  abilityDefinitionById,
  parseAbilityIntent,
  resolveAbility,
  validateContract,
  deterministicNarrative,
  validateNarrative,
  DEFAULT_EXTRAORDINARY_STATE,
  type ExtraordinaryState,
} from "./abilities/index";
import {
  applyFateBundle,
  deterministicFateNarrative,
  resolveFateAberration,
  validateFateContract,
  validateFateNarrative,
} from "./fate/index";
import {
  applyControlBundle,
  createInitialControlState,
  deterministicControlNarrative,
  evaluateControlContract,
  validateControlContract,
  validateControlNarrative,
} from "./loss-of-control/index";
import { abilitiesFor, abilityRuleSummary, freeTravelAbility } from "./pathway-abilities";
import { evaluateImmediateActing } from "./progression-system";
import { projectWorldForAudience } from "./world-kernel.ts";
import { stableEntityId } from "./stable-id.ts";

type AbilityDraft = Omit<AbilityUseRecord, "id" | "week" | "abilityId" | "abilityName" | "context" | "intent" | "cost"> & {
  lockedFact?: string;
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return Math.abs(result);
}

function consecutiveBacklashes(journal: AbilityUseRecord[]): number {
  let count = 0;
  for (const record of journal) {
    if (record.interpretation === "backlash") count += 1;
    else break;
  }
  return count;
}

const COMMON_ABILITY_TOKENS = new Set(["感知", "观察", "影响", "防护", "移动", "战斗", "仪式", "伪装", "制作", "攻击", "防御", "追踪", "调查", "进入", "使用", "能力", "手段", "自身", "目标", "区域", "现场"]);

function intentGrams(text: string, min = 2, max = 4) {
  const chars = [...text.toLowerCase()];
  const grams = new Set<string>();
  for (let size = min; size <= max; size += 1) {
    for (let index = 0; index + size <= chars.length; index += 1) grams.add(chars.slice(index, index + size).join(""));
  }
  return grams;
}

function abilityNameTokens(name: string) {
  const chars = [...name.toLowerCase()];
  const tokens = new Set<string>();
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index + size <= chars.length; index += 1) tokens.add(chars.slice(index, index + size).join(""));
  }
  return [...tokens].filter((token) => !COMMON_ABILITY_TOKENS.has(token));
}

export function abilityForFreeIntent(game: GameState, intent: string): Ability {
  const normalized = intent.trim();
  const wantsSpirit = /(?:进入|踏入|前往|穿行|穿梭|漫游).{0,8}灵界|灵界.{0,8}(?:进入|穿行|穿梭|漫游)/.test(normalized);
  const wantsDream = /(?:进入|潜入|行走|穿行).{0,8}(?:梦境|梦中)|(?:梦境|梦中).{0,8}(?:进入|潜入|行走|穿行)/.test(normalized);
  if (wantsSpirit) {
    return freeTravelAbility(game.pathwayId, game.currentSequence, "spirit");
  }
  if (wantsDream) {
    return freeTravelAbility(game.pathwayId, game.currentSequence, "dream");
  }
  const artifactMentionNegated = /(?:不|不得|不要|避免|拒绝|无需|不借助|不触碰|不使用)[^，。；]{0,18}(?:封印物|挂坠)|(?:封印物|挂坠)[^，。；]{0,12}(?:不用|不触碰|不使用)/.test(normalized);
  const explicitlyUsesArtifact = /(?:使用|发动|启用|借助|触碰|解封|打开|激活)[^，。；]{0,18}(?:封印物|挂坠)|(?:封印物|挂坠)[^，。；]{0,12}(?:使用|发动|启用|解封|激活)/.test(normalized);
  const artifact = !artifactMentionNegated && explicitlyUsesArtifact
    ? game.inventory.find((item) => item.category === "封印物" && (normalized.includes(item.name) || normalized.includes(item.id) || game.inventory.filter((entry) => entry.category === "封印物").length === 1))
    : undefined;
  if (artifact) return { id: `artifact-${artifact.id}`, name: artifact.name, verb: "按玩家描述使用封印物", description: `封印物位于${artifact.location}，由${artifact.keeper}保管。真实能力、激活条件与负面效果由规则固定；玩家可以自由指定使用方式。`, cost: 1, risk: artifact.risk, ruleTags: ["artifact", artifact.id] };
  const abilities = abilitiesFor(game.pathwayId, game.currentSequence);
  const normalizedLower = normalized.toLowerCase();
  const grams = intentGrams(normalized);

  // 1) 显式指名：意图里出现能力名或其特征片段（如“占卜”“灵视”“门径”）时直接采用
  const explicit = abilities.filter((ability) => {
    const name = ability.name.toLowerCase();
    if (normalizedLower.includes(name)) return true;
    return abilityNameTokens(name).some((token) => normalizedLower.includes(token));
  });
  if (explicit.length === 1) return explicit[0];
  if (explicit.length > 1) {
    return explicit.sort((left, right) =>
      Number(left.passive) - Number(right.passive) || (left.cost ?? 0) - (right.cost ?? 0),
    )[0];
  }

  // 2) 通用评分：中文意图按 2-4 字片段匹配能力语料，避免整句被当成一个词
  const purposePatterns: [RegExp, string][] = [
    [/观察|感知|辨认|灵视|调查|查看|审视/, "感知"],
    [/影响|暗示|催眠|挑衅|操纵|煽动|引导/, "影响"],
    [/进入|移动|撤退|传送|穿越|抵达|穿梭/, "移动"],
    [/攻击|战斗|破坏|拦截|压制|猎杀/, "战斗"],
  ];
  const purposeMode = purposePatterns.find(([pattern]) => pattern.test(normalized))?.[1];
  const scored = abilities.map((ability, index) => {
    const corpus = `${ability.name} ${ability.verb} ${ability.description} ${(ability.ruleTags ?? []).join(" ")} ${ability.mode ?? ""} ${(ability.constraints ?? []).join(" ")}`.toLowerCase();
    let gramScore = 0;
    for (const gram of grams) {
      if (corpus.includes(gram)) gramScore += gram.length;
    }
    const purposeBonus = purposeMode && ability.mode === purposeMode ? 8 : 0;
    return { ability, index, score: gramScore + purposeBonus, purposeBonus, passive: Boolean(ability.passive), cost: ability.passive ? 0 : (ability.cost ?? 0) };
  });
  scored.sort((left, right) =>
    right.score - left.score ||
    right.purposeBonus - left.purposeBonus ||
    Number(left.passive) - Number(right.passive) ||
    left.cost - right.cost ||
    left.index - right.index,
  );
  return scored[0]?.ability ?? abilities.find((item) => !item.passive) ?? abilities[0];
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("能力反馈没有返回可解析结构");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

export async function generateAbilityDraft(config: AiConfig, game: GameState, ability: Ability, intent: string, context: AbilityContext): Promise<AbilityDraft> {
  const { LORE_RECORDS } = await import("./generated-lore-compendium");
  const relevantHidden = game.hiddenWorldFacts.filter((item) => item.subjectKey === context.targetId || item.subjectKey === context.label).slice(-3);
  const knownLoreIds = [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes("player") || node.holderRefs?.includes("player")).flatMap((node) => node.loreRecordIds ?? []))];
  const horizon = game.worldKernel?.canon?.knowledgeHorizon ?? {
    work: "LOTM" as const,
    maxVolume: 1,
    maxAbsoluteChapter: 195,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned" as const,
  };
  const lore = await retrieveLoreContextAsync(LORE_RECORDS, { query: `${intent} ${context.label} ${ability.name}`, audience: { kind: "player-known", principalRef: "player", purpose: "player-ability", knownLoreIds, topicGrants: ["pathways", "beyonder-system"] }, limit: 10, maxChars: 4200, week: game.week, gameDate: game.date, horizon });
  const abilityMemoryView = memoryPromptBlockWithIds(
    game.memory,
    /调查|查证|线索|勘察|追踪/.test(intent) ? "investigation" : "action",
    "player",
    game.week
  );
  const playerWorldView = projectWorldForAudience(game.worldKernel, { kind: "player", holderId: "player" });
  const payload = {
    pathway: PATHWAYS[game.pathwayId].name,
    sequence: game.currentSequence,
    ability,
    abilityRules: abilityRuleSummary(ability),
    intent,
    context,
    knownFacts: game.facts.slice(-14),
    authorizedLore: lore.context,
    dynamicMemory: abilityMemoryView.text,
    authorizedWorldKnowledge: playerWorldView.knowledge.slice(-12),
    lockedHiddenFacts: relevantHidden,
    recentUses: game.abilityJournal.slice(-6),
  };
  const raw = extractJson(await callModel(config, `你是非凡能力即时结算器。最高优先级是严格服从玩家写明的目的、手段、排除条件与停止条件。绝不把“主动进入灵界”改写成触碰吊坠、占卜或调查某个事件；绝不擅自添加玩家未选择的封印物、仪式、协助者或媒介。若规则允许直接进入梦境或灵界，就必须进入连续场景；若不允许，应由规则层拒绝而不是替换手段。能力必须立刻产生具体、可追问的信息，但不能直接泄露核心幕后真相，不能把心理推断冒充事实，不能替玩家行动，也不能宣布玩家死亡。已锁定隐藏事实不可改写。只返回JSON。`, `玩家原始意图是不可改写的行动契约：${intent}\n选定手段：${ability.name}（${ability.verb}）\n结算这一次使用。直接观察必须是感官可得的具体细节；专业判断要说明可信度；未知项要说明遮蔽来自哪里；察觉反馈必须明确。返回{"observation":"100至220字的即时小说式感知","interpretation":"专业判断","confidence":"较低|中等|较高|确认","unknown":"仍无法确认的部分","detection":"对方或环境是否察觉","mentalLoad":1到6,"deepLayer":"dream|spirit|null","lockedFact":"可选，只允许局部原创事实"}。\n${JSON.stringify(payload)}`, { task: "ability-draft", json: true, maxTokens: 1500, temperature: .62 }));
  if (typeof raw.observation !== "string" || typeof raw.interpretation !== "string" || typeof raw.unknown !== "string" || typeof raw.detection !== "string" || !["较低", "中等", "较高", "确认"].includes(String(raw.confidence)) || !Number.isFinite(Number(raw.mentalLoad))) throw new Error("模型没有返回完整的能力结算；本次使用未扣除灵性，也没有写入替代反馈");
  game.memory = submitMemoryDelivery(game.memory, {
    actionId: `ability:${game.week}`,
    modelCallId: `ability:${game.week}:${ability.id}:${intent.slice(0, 40)}`,
    stage: "ability",
    audience: playerAudience(false),
    memoryIds: abilityMemoryView.ids,
    week: game.week,
  });
  const requestedLayer = ability.sceneLayer ?? (/进入.{0,6}梦境|梦境.{0,6}进入/.test(intent) ? "dream" as const : /进入.{0,6}灵界|灵界.{0,6}进入/.test(intent) ? "spirit" as const : undefined);
  return {
    observation: raw.observation.slice(0, 800),
    interpretation: raw.interpretation.slice(0, 500),
    confidence: raw.confidence as AbilityDraft["confidence"],
    unknown: raw.unknown.slice(0, 400),
    detection: raw.detection.slice(0, 300),
    mentalLoad: Math.max(1, Math.min(6, Number(raw.mentalLoad))),
    deepLayer: requestedLayer,
    lockedFact: typeof raw.lockedFact === "string" && raw.lockedFact.trim() ? raw.lockedFact.trim().slice(0, 300) : undefined,
  };
}

export function resolveImmediateAbility(game: GameState, ability: Ability, intent: string, context: AbilityContext, result: AbilityDraft) {
  const definition = abilityDefinitionById(ability.id);
  if (definition) {
    return resolveImmediateAbilityWithEngine(game, ability, intent, context, result, definition);
  }
  const focusCost = ability.passive ? 1 : ability.cost;
  const overdraw = Math.max(0, focusCost - game.spirituality);
  // 遗留回退路径也必须是确定性的：ID 由周次/能力/意图/台账位置派生，而非时钟。
  const journalCount = game.abilityJournal?.length ?? 0;
  const identityParts = [game.saveId ?? "legacy-save", game.week, ability.id, journalCount, intent, context] as const;
  const record: AbilityUseRecord = {
    id: stableEntityId("ability-use", ...identityParts),
    week: game.week,
    abilityId: ability.id,
    abilityName: ability.name,
    context,
    intent,
    observation: result.observation,
    interpretation: result.interpretation,
    confidence: result.confidence,
    unknown: result.unknown,
    detection: result.detection,
    cost: focusCost,
    mentalLoad: result.mentalLoad + overdraw * 2,
    deepLayer: result.deepLayer,
  };
  const hiddenFact: HiddenWorldFact | null = result.lockedFact && !game.hiddenWorldFacts.some((item) => item.subjectKey === (context.targetId ?? context.label) && item.statement === result.lockedFact) ? {
    id: stableEntityId("hidden-ai", ...identityParts, result.lockedFact),
    subjectKey: context.targetId ?? context.label,
    statement: result.lockedFact,
    origin: "ai-locked",
    createdWeek: game.week,
  } : null;
  const scene: AbilityScene | null = result.deepLayer ? {
    id: stableEntityId("ability-scene", ...identityParts, result.deepLayer),
    layer: result.deepLayer,
    title: result.deepLayer === "dream" ? `梦境行走 · ${intent.slice(0, 24)}` : `灵界穿梭 · ${intent.slice(0, 24)}`,
    context: { ...context, kind: result.deepLayer },
    stability: Math.max(35, 88 - result.mentalLoad * 5),
    turns: [{ id: stableEntityId("scene-turn", ...identityParts, 0), playerIntent: intent, response: result.observation, stabilityChange: -result.mentalLoad * 2 }],
  } : null;
  const actingMark = evaluateImmediateActing(game, ability, intent, record);
  return {
    record,
    state: {
      ...game,
      spirituality: Math.max(0, game.spirituality - focusCost),
      mentalLoad: Math.min(100, game.mentalLoad + record.mentalLoad),
      instability: Math.min(100, game.instability + overdraw * 3),
      playerCondition: overdraw ? { ...game.playerCondition, pollution: Math.min(100, game.playerCondition.pollution + overdraw) } : game.playerCondition,
      abilityJournal: [record, ...game.abilityJournal].slice(0, 120),
      digestion: Math.min(100, game.digestion + (actingMark?.gain ?? 0)),
      actingMarks: actingMark ? [...game.actingMarks, actingMark].slice(-80) : game.actingMarks,
      hiddenWorldFacts: hiddenFact ? [...game.hiddenWorldFacts, hiddenFact] : game.hiddenWorldFacts,
      activeAbilityScene: scene,
      worldKernel: { ...game.worldKernel, knowledge: [...game.worldKernel.knowledge, { id: `knowledge-${record.id}`, subject: context.label, statement: record.interpretation, truth: result.confidence === "确认" ? "confirmed" as const : "likely" as const, visibility: "player" as const, holderIds: ["player"], loreRecordIds: [], acquiredWeek: game.week }].slice(-400) },
      facts: [...game.facts, { id: `fact-${record.id}`, subject: context.label, statement: `${ability.name}得到的个人判断：${record.interpretation}`, certainty: "线索" as const, source: `${PATHWAYS[game.pathwayId].name}·${ability.name}`, week: game.week }].slice(-100),
    },
  };
}

function extraordinaryStateFromGame(game: GameState): ExtraordinaryState {
  return {
    ...DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: game.pathwayId,
    sequence: game.currentSequence,
    internalRank: 10 - game.currentSequence,
    spirituality: game.spirituality,
    maxSpirituality: game.spiritualityMax,
    stability: game.stability,
    physicalCondition: game.playerCondition?.health ?? 100,
    mentalCondition: Math.max(0, 100 - game.mentalLoad),
  };
}

function resolveImmediateAbilityWithEngine(
  game: GameState,
  ability: Ability,
  intent: string,
  context: AbilityContext,
  result: AbilityDraft,
  definition: import("./abilities/index.ts").AbilityDefinition
) {
  const parsed = parseAbilityIntent(
    intent,
    [definition],
    "player",
    stableEntityId("ability-action", game.saveId ?? "legacy-save", game.week, intent, context)
  );
  const actorState = extraordinaryStateFromGame(game);
  const seed = `${game.week}|${parsed.actionId}|${definition.id}|player`;
  const contract = resolveAbility({
    definition,
    actorState,
    targetStates: [{ id: context.targetId ?? "self", ...actorState }],
    intent: parsed,
    seed,
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  const contractErrors = validateContract(contract);
  if (contractErrors.length) throw new Error(`能力合同校验失败：${contractErrors.join("; ")}`);
  const fateContract = resolveFateAberration({
    definition,
    actorState,
    targetStates: [{ id: context.targetId ?? "self", ...actorState }],
    intent: parsed,
    abilityContract: contract,
    game: {
      week: game.week,
      saveId: game.saveId,
      worldKernel: game.worldKernel,
      fate: game.fate,
    },
  });
  const fateErrors = validateFateContract(fateContract);
  if (fateErrors.length) throw new Error(`命运合同校验失败：${fateErrors.join("; ")}`);
  const modelText = `${result.observation ?? ""} ${result.interpretation ?? ""}`;
  // 原子性：失控合同先于任何变更生成并校验；全部校验通过后才应用三合同。
  const controlContract = evaluateControlContract({
    resolutionId: contract.resolutionId,
    actorId: "player",
    saveId: game.saveId ?? "default-save",
    riskInput: {
      pollution: game.playerCondition?.pollution ?? 0,
      mentalLoad: game.mentalLoad,
      spirituality: game.spirituality,
      consecutiveBacklashes: consecutiveBacklashes(game.abilityJournal ?? []),
      forcedCast:
        parsed.acceptableRisks.includes("forced") ||
        contract.legality.reasons.includes("INSUFFICIENT_SPIRITUALITY"),
      overreach: contract.legality.reasons.includes("RANK_GATE_BLOCKED"),
      ritualFailure:
        (definition.family === "ritual" || definition.activation.action === "ritual") &&
        (contract.result === "failure" || contract.result === "fail-with-progress"),
      backlash: contract.result === "backlash",
      fateSeverity: fateContract.severity,
      restRelief: 0,
      companionRelief: 0,
      protectionRelief: 0,
    },
    controlState: game.control ?? createInitialControlState(),
    fateContract,
    eligibleIndex: (game.abilityJournal?.length ?? 0) + 1,
  });
  const controlErrors = validateControlContract(controlContract);
  if (controlErrors.length) throw new Error(`失控合同校验失败：${controlErrors.join("; ")}`);
  const bundle = applyFateBundle(game, contract, fateContract, ability.name);
  const nextGame = bundle.game;
  const applied = bundle;
  const controlApplied = applied.applied
    ? {
        contract: controlContract,
        ...applyControlBundle(nextGame, contract, fateContract, controlContract, ability.name),
      }
    : undefined;
  const finalGame = controlApplied?.game ?? nextGame;
  const narrativeCheck = validateNarrative(contract, modelText);
  const fateNarrativeCheck = validateFateNarrative(contract, fateContract, modelText);
  const controlNarrativeCheck = controlApplied
    ? validateControlNarrative(controlApplied.contract, modelText)
    : { violations: [] as string[] };
  const narrative =
    narrativeCheck.violations.length || fateNarrativeCheck.violations.length || controlNarrativeCheck.violations.length
      ? [
          deterministicNarrative(contract, ability.name),
          deterministicFateNarrative(fateContract, ability.name),
          controlApplied && controlApplied.contract.triggered
            ? deterministicControlNarrative(controlApplied.contract, ability.name)
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : (result.observation || deterministicNarrative(contract, ability.name)) +
        (fateContract.triggered ? `\n${deterministicFateNarrative(fateContract, ability.name)}` : "") +
        (controlApplied && controlApplied.contract.triggered
          ? `\n${deterministicControlNarrative(controlApplied.contract, ability.name)}`
          : "");
  const focusCost = applied.applied
    ? contract.committedCosts
        .filter((cost) => cost.resource === "spirituality")
        .reduce((sum, cost) => sum + cost.amount, 0)
    : ability.cost;
  const overdraw = Math.max(0, focusCost - game.spirituality);
  const record: AbilityUseRecord = {
    id: `ability-use-${contract.resolutionId}`,
    week: game.week,
    abilityId: ability.id,
    abilityName: ability.name,
    context,
    intent,
    observation: narrative.slice(0, 800),
    interpretation: contract.result,
    confidence:
      contract.result === "critical-success" || contract.result === "success"
        ? ("确认" as const)
        : contract.result === "partial-success"
          ? ("中等" as const)
          : ("较低" as const),
    unknown: contract.blockedEffects.length ? "效果被反制或位阶阻断" : "仍有未确认部分",
    detection: contract.tracesLeft.length ? "可能被察觉" : "未察觉",
    cost: focusCost,
    mentalLoad: contract.result === "backlash" ? 6 : 1 + overdraw * 2,
    deepLayer: result.deepLayer,
    fateSummary: fateContract.triggered
      ? `命运异常：${fateContract.templateTitle ?? fateContract.templateId}（${fateContract.severity}级）`
      : undefined,
    fateSeverity: fateContract.severity,
    controlSummary: controlApplied?.contract.triggered
      ? `失控：${controlApplied.contract.stageAfter}`
      : undefined,
    controlStage: controlApplied?.contract.stageAfter,
  };
  const hiddenFact: HiddenWorldFact | null =
    result.lockedFact && !game.hiddenWorldFacts.some((item) => item.subjectKey === (context.targetId ?? context.label) && item.statement === result.lockedFact)
      ? {
          id: `hidden-ai-${contract.resolutionId}`,
          subjectKey: context.targetId ?? context.label,
          statement: result.lockedFact,
          origin: "ai-locked",
          createdWeek: game.week,
        }
      : null;
  const scene: AbilityScene | null = result.deepLayer
    ? {
        id: `ability-scene-${contract.resolutionId}`,
        layer: result.deepLayer,
        title: result.deepLayer === "dream" ? `梦境行走 · ${intent.slice(0, 24)}` : `灵界穿梭 · ${intent.slice(0, 24)}`,
        context: { ...context, kind: result.deepLayer },
        stability: Math.max(35, 88 - record.mentalLoad * 5),
        turns: [{ id: `scene-turn-${contract.resolutionId}`, playerIntent: intent, response: narrative, stabilityChange: -record.mentalLoad * 2 }],
      }
    : null;
  const actingMark = evaluateImmediateActing(finalGame, ability, intent, record);
  return {
    record,
    state: {
      ...finalGame,
      mentalLoad: Math.min(100, finalGame.mentalLoad + record.mentalLoad),
      instability: Math.min(100, finalGame.instability + overdraw * 3),
      playerCondition: overdraw
        ? { ...finalGame.playerCondition, pollution: Math.min(100, finalGame.playerCondition.pollution + overdraw) }
        : finalGame.playerCondition,
      abilityJournal: [record, ...finalGame.abilityJournal].slice(0, 120),
      digestion: Math.min(100, finalGame.digestion + (actingMark?.gain ?? 0)),
      actingMarks: actingMark ? [...finalGame.actingMarks, actingMark].slice(-80) : finalGame.actingMarks,
      hiddenWorldFacts: hiddenFact ? [...finalGame.hiddenWorldFacts, hiddenFact] : finalGame.hiddenWorldFacts,
      activeAbilityScene: scene,
      worldKernel: {
        ...finalGame.worldKernel,
        knowledge: [
          ...finalGame.worldKernel.knowledge,
          {
            id: `knowledge-${record.id}`,
            subject: context.label,
            statement: `${contract.result}${fateContract.triggered ? `；命运异常：${fateContract.templateId}` : ""}${controlApplied?.contract.triggered ? `；失控：${controlApplied.contract.stageAfter}` : ""}`,
            truth: record.confidence === "确认" ? ("confirmed" as const) : ("likely" as const),
            visibility: "player" as const,
            holderIds: ["player"],
            loreRecordIds: [],
            acquiredWeek: game.week,
          },
        ].slice(-400),
      },
      facts: [
        ...finalGame.facts,
        {
          id: `fact-${record.id}`,
          subject: context.label,
          statement: `${ability.name}结算：${contract.result}`,
          certainty: "线索" as const,
          source: `${PATHWAYS[game.pathwayId].name}·${ability.name}`,
          week: game.week,
        },
      ].slice(-100),
    },
  };
}

export async function generateSceneResponse(config: AiConfig, game: GameState, intent: string) {
  const scene = game.activeAbilityScene;
  if (!scene) throw new Error("当前没有可以继续的深层场景");
  const sceneMemoryView = memoryPromptBlockWithIds(
    game.memory,
    /调查|查证|线索|勘察|追踪/.test(intent) ? "investigation" : "action",
    "player",
    game.week
  );
  const response = await callModel(config, `你是${scene.layer === "dream" ? "梦境" : "灵界"}短篇自由探索场景的即时叙事器。玩家每次自由描述动作，你必须返回具体环境变化、可观察信息和风险迹象。不能替玩家选择，不能宣布玩家死亡，不能泄露未被能力触及的核心真相。已发生内容和锁定隐藏事实不可改写。`, `场景：${JSON.stringify(scene)}\n锁定事实：${JSON.stringify(game.hiddenWorldFacts.slice(-12))}\n玩家继续：${intent}\n用120至260字回应，只写当前场景反馈。`, { task: "ability-scene", maxTokens: 900, temperature: .74 });
  game.memory = submitMemoryDelivery(game.memory, {
    actionId: `scene:${game.week}`,
    modelCallId: `scene:${game.week}:${scene.id}:${intent.slice(0, 40)}`,
    stage: "scene",
    audience: playerAudience(false),
    memoryIds: sceneMemoryView.ids,
    week: game.week,
  });
  return response.slice(0, 1200);
}

export function continueAbilityScene(game: GameState, intent: string, generatedResponse?: string) {
  const scene = game.activeAbilityScene;
  if (!scene) return game;
  const loss = 7 + hash(`${scene.id}:${intent}:${scene.turns.length}`) % 8;
  const response = generatedResponse ?? (scene.layer === "dream"
    ? `梦境没有按照字面回答。你写下的意图让远处一扇门改变了颜色，门后的脚步声却停在第三步；这说明梦境主人正在回避一个已经意识到的记忆节点。`
    : `灵界中的颜色沿你的意图重新排列。一条原本与现实街道重合的航路向侧方弯折，并在远处被灰白雾气截断；那不是自然地形，而像持续存在的遮蔽。`);
  const turn = { id: `scene-turn-${scene.id}-${scene.turns.length}`, playerIntent: intent, response, stabilityChange: -loss };
  return {
    ...game,
    spirituality: Math.max(0, game.spirituality - 2),
    mentalLoad: Math.min(100, game.mentalLoad + 3),
    activeAbilityScene: { ...scene, stability: Math.max(0, scene.stability - loss), turns: [...scene.turns, turn] },
  };
}
