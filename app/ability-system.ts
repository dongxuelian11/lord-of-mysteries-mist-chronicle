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
import { abilitiesFor, abilityRuleSummary, freeTravelAbility } from "./pathway-abilities";
import { evaluateImmediateActing } from "./progression-system";

type AbilityDraft = Omit<AbilityUseRecord, "id" | "week" | "abilityId" | "abilityName" | "context" | "intent" | "cost"> & {
  lockedFact?: string;
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return Math.abs(result);
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
  const knownLoreIds = [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes("player")).flatMap((node) => node.loreRecordIds ?? []))];
  const horizon = game.worldKernel?.canon?.knowledgeHorizon ?? {
    work: "LOTM" as const,
    maxVolume: 1,
    maxAbsoluteChapter: 195,
    allowedEventIds: [],
    revealedIdentityIds: ["周明瑞", "夏洛克·莫里亚蒂"],
    worldlineMode: "canon-aligned" as const,
  };
  const lore = await retrieveLoreContextAsync(LORE_RECORDS, { query: `${intent} ${context.label} ${ability.name}`, audience: { kind: "player-known", knownLoreIds, topicGrants: ["pathways", "beyonder-system"] }, limit: 10, maxChars: 4200, week: game.week, gameDate: game.date, horizon });
  const abilityMemoryView = memoryPromptBlockWithIds(
    game.memory,
    /调查|查证|线索|勘察|追踪/.test(intent) ? "investigation" : "action",
    "player",
    game.week
  );
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
    authorizedWorldKnowledge: (game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes("player")).slice(-12),
    lockedHiddenFacts: relevantHidden,
    recentUses: game.abilityJournal.slice(-6),
  };
  const raw = extractJson(await callModel(config, `你是非凡能力即时结算器。最高优先级是严格服从玩家写明的目的、手段、排除条件与停止条件。绝不把“主动进入灵界”改写成触碰吊坠、占卜或调查某个事件；绝不擅自添加玩家未选择的封印物、仪式、协助者或媒介。若规则允许直接进入梦境或灵界，就必须进入连续场景；若不允许，应由规则层拒绝而不是替换手段。能力必须立刻产生具体、可追问的信息，但不能直接泄露核心幕后真相，不能把心理推断冒充事实，不能替玩家行动，也不能宣布玩家死亡。已锁定隐藏事实不可改写。只返回JSON。`, `玩家原始意图是不可改写的行动契约：${intent}\n选定手段：${ability.name}（${ability.verb}）\n结算这一次使用。直接观察必须是感官可得的具体细节；专业判断要说明可信度；未知项要说明遮蔽来自哪里；察觉反馈必须明确。返回{"observation":"100至220字的即时小说式感知","interpretation":"专业判断","confidence":"较低|中等|较高|确认","unknown":"仍无法确认的部分","detection":"对方或环境是否察觉","mentalLoad":1到6,"deepLayer":"dream|spirit|null","lockedFact":"可选，只允许局部原创事实"}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 1500, temperature: .62 }));
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
  const focusCost = ability.passive ? 1 : ability.cost;
  const overdraw = Math.max(0, focusCost - game.spirituality);
  const record: AbilityUseRecord = {
    id: `ability-use-${Date.now()}`,
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
    id: `hidden-ai-${Date.now()}`,
    subjectKey: context.targetId ?? context.label,
    statement: result.lockedFact,
    origin: "ai-locked",
    createdWeek: game.week,
  } : null;
  const scene: AbilityScene | null = result.deepLayer ? {
    id: `ability-scene-${Date.now()}`,
    layer: result.deepLayer,
    title: result.deepLayer === "dream" ? `梦境行走 · ${intent.slice(0, 24)}` : `灵界穿梭 · ${intent.slice(0, 24)}`,
    context: { ...context, kind: result.deepLayer },
    stability: Math.max(35, 88 - result.mentalLoad * 5),
    turns: [{ id: `scene-turn-${Date.now()}`, playerIntent: intent, response: result.observation, stabilityChange: -result.mentalLoad * 2 }],
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

export async function generateSceneResponse(config: AiConfig, game: GameState, intent: string) {
  const scene = game.activeAbilityScene;
  if (!scene) throw new Error("当前没有可以继续的深层场景");
  const sceneMemoryView = memoryPromptBlockWithIds(
    game.memory,
    /调查|查证|线索|勘察|追踪/.test(intent) ? "investigation" : "action",
    "player",
    game.week
  );
  const response = await callModel(config, `你是${scene.layer === "dream" ? "梦境" : "灵界"}短篇自由探索场景的即时叙事器。玩家每次自由描述动作，你必须返回具体环境变化、可观察信息和风险迹象。不能替玩家选择，不能宣布玩家死亡，不能泄露未被能力触及的核心真相。已发生内容和锁定隐藏事实不可改写。`, `场景：${JSON.stringify(scene)}\n锁定事实：${JSON.stringify(game.hiddenWorldFacts.slice(-12))}\n玩家继续：${intent}\n用120至260字回应，只写当前场景反馈。`, { maxTokens: 900, temperature: .74 });
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
  const turn = { id: `scene-turn-${Date.now()}`, playerIntent: intent, response, stabilityChange: -loss };
  return {
    ...game,
    spirituality: Math.max(0, game.spirituality - 2),
    mentalLoad: Math.min(100, game.mentalLoad + 3),
    activeAbilityScene: { ...scene, stability: Math.max(0, scene.stability - loss), turns: [...scene.turns, turn] },
  };
}
