import { AiConfig, callModel } from "./ai-client";
import {
  Ability, AbilityContext, AbilityScene, AbilityUseRecord, GameState, HiddenWorldFact, PATHWAYS,
} from "./game-model";
import { LORE_RECORDS } from "./generated-lore-compendium";
import { retrieveLoreContext } from "./lore-knowledge";

type AbilityDraft = Omit<AbilityUseRecord, "id" | "week" | "abilityId" | "abilityName" | "context" | "intent" | "cost"> & {
  lockedFact?: string;
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return Math.abs(result);
}

export function abilityForFreeIntent(game: GameState, intent: string): Ability {
  const normalized = intent.trim();
  const wantsSpirit = /(?:进入|踏入|前往|穿行|穿梭|漫游).{0,8}灵界|灵界.{0,8}(?:进入|穿行|穿梭|漫游)/.test(normalized);
  const wantsDream = /(?:进入|潜入|行走|穿行).{0,8}(?:梦境|梦中)|(?:梦境|梦中).{0,8}(?:进入|潜入|行走|穿行)/.test(normalized);
  if (wantsSpirit) {
    if (game.pathwayId !== "apprentice" || game.currentSequence > 5) throw new Error("你的当前途径与序列不具备直接进入灵界的能力。可以另行寻找仪式、入口、封印物或具备灵界穿梭能力的协助者，但系统不会擅自替你选择。 ");
    return { id: "direct-spirit-entry", name: "灵界穿梭", verb: "主动进入灵界", description: "以自身旅行家能力直接进入灵界，并以玩家指定的现实锚点、目标与退出条件行动。", cost: 4, risk: "持续停留会消耗灵性；错误锚点、危险存在与方向失真可能切断归途。", ruleTags: ["spirit", "direct-entry"] };
  }
  if (wantsDream) {
    if (game.pathwayId !== "spectator" || game.currentSequence > 5) throw new Error("你的当前途径与序列不具备直接进入梦境的能力。可以寻找梦境媒介、仪式、封印物或梦境行者协助，但系统不会擅自替你选择。 ");
    return { id: "direct-dream-entry", name: "梦境行走", verb: "主动进入梦境", description: "以自身梦境行者能力进入指定梦境；梦主、锚点、目的和退出条件完全由玩家意图约束。", cost: 3, risk: "梦主防御、共享潜意识与错误记忆会持续侵蚀场景稳定。", ruleTags: ["dream", "direct-entry"] };
  }
  const artifact = game.inventory.find((item) => item.category === "封印物" && (normalized.includes(item.name) || normalized.includes(item.id) || (/封印物|挂坠/.test(normalized) && game.inventory.filter((entry) => entry.category === "封印物").length === 1)));
  if (artifact) return { id: `artifact-${artifact.id}`, name: artifact.name, verb: "按玩家描述使用封印物", description: `封印物位于${artifact.location}，由${artifact.keeper}保管。真实能力、激活条件与负面效果由规则固定；玩家可以自由指定使用方式。`, cost: 1, risk: artifact.risk, ruleTags: ["artifact", artifact.id] };
  const abilities = PATHWAYS[game.pathwayId].startingAbilities;
  if (/观察|感知|看|辨认|灵视/.test(normalized)) return abilities.find((item) => /观察|感知|灵视/.test(`${item.name}${item.verb}`)) ?? abilities[0];
  if (/占卜|启示|预兆/.test(normalized)) return abilities.find((item) => /占卜/.test(`${item.name}${item.verb}`)) ?? abilities[0];
  if (/交谈|引导|询问|情绪/.test(normalized)) return abilities.find((item) => /交谈|情绪|心理/.test(`${item.name}${item.verb}`)) ?? abilities[0];
  return abilities.find((item) => !item.passive) ?? abilities[0];
}

function targetDetail(game: GameState, context: AbilityContext) {
  const member = game.members.find((item) => item.id === context.targetId);
  if (member?.id === "mara") return "她汇报撤离路线时没有迟疑；提及失踪工人家属后，右手拇指反复摩擦杯沿。";
  if (member?.id === "cedric") return "他的语速始终稳定，但你的视线移向账本第三页时，他停止了敲击桌面的动作。";
  if (member?.id === "ines") return "她谈到匿名信时看向你的眼睛，提到前主编时视线却短暂落向没有封口的信封。";
  if (member?.id === "rowan") return "他说到封印安全时呼吸平稳；挂坠的名字出现后，他下意识把左手藏进袖口。";
  if (context.kind === "district") return `${context.label}的公开秩序之下存在一处节奏不协调的活动点：人员停留时间与附近机构的正常作息不符。`;
  if (context.kind === "organization") return `${context.label}留下的日常痕迹并不均匀；最常被使用的位置，反而刚刚经过一次刻意清理。`;
  return `${context.label}周围出现了一个可以继续验证的细节，它与现有记录并不完全一致。`;
}

function localDraft(game: GameState, ability: Ability, intent: string, context: AbilityContext): AbilityDraft {
  const detail = targetDetail(game, context);
  const seed = hash(`${game.week}:${ability.id}:${context.targetId ?? context.label}:${intent}:${game.abilityJournal.length}`);
  const abilityText = `${ability.name}${ability.description}`;
  const deepLayer = ability.id === "direct-dream-entry" ? "dream" as const
    : ability.id === "direct-spirit-entry" ? "spirit" as const
      : /梦境|梦境行者|织梦/.test(abilityText) ? "dream" as const
        : /灵界|旅行家|漫游|星界/.test(abilityText) ? "spirit" as const : undefined;
  const path = game.pathwayId;
  const observation = ability.id === "direct-spirit-entry" ? `你没有借助吊坠、占卜或仪式。空间边界在自身能力下变薄，现实中的声音先被拉远，随后颜色与方向同时失去日常意义。你按照原意保留了返回锚点；灵界已经展开，下一步行动仍由你决定。`
    : ability.id === "direct-dream-entry" ? `你没有替梦主补写任何记忆。意识越过清醒与睡眠的边界后，梦境以自身逻辑展开；远处的门、光线与反复出现的声音构成了第一层锚点。你已进入其中，尚未选择接触任何节点。`
      : ability.id.startsWith("artifact-") ? `你严格按照自己描述的方式解除必要的一层封存，没有把封印物改作其他用途。${context.label}首先出现了一个可观察变化：${detail}`
        : path === "spectator" ? detail
    : path === "seer" ? `你收束呼吸后开启感知。${context.label}的灵性轮廓并非静止：靠近目标的一侧呈现断续的深蓝色，另有一缕灰白残留向外延伸。`
      : path === "apprentice" ? `空间直觉把${context.label}拆成了边界与通路。你确认一处正常视线不会注意到的薄弱连接，同时记住了返回原位的相对方向。`
        : path === "hunter" ? `你没有盯住目标本身，而是检查它必然改变的环境。${detail}`
          : `你辨认出${context.label}上的三个神秘学层次；最外层可以解释，中层有近期重复使用痕迹，内层符号被人为抹去了关键一笔。`;
  const interpretation = path === "spectator" ? "目标在控制语言，但身体反应说明某个具体名词触及了未被说出的私人压力；这更像隐瞒相关信息，而非证明其参与阴谋。"
    : path === "seer" ? "残留来自近期反复接触，不像一次偶然污染；延伸方向可以用于下一次追踪，但不足以确定幕后主体。"
      : path === "apprentice" ? "这条边界可以成为观察或撤离入口，但另一侧空间是否被非凡力量扭曲仍无法确认。"
        : path === "hunter" ? "目标正在维持一种人为规律。打破其中一个固定环节，可能迫使它暴露新的路线或联系人。"
          : "该结构由掌握基础神秘学的人布置，并且曾被第二个人修改；修改者更谨慎，也更了解污染隔离。";
  const intrusive = /引导|暗示|催眠|侵入|控制|通灵|进入/.test(`${ability.name}${intent}`);
  return {
    observation,
    interpretation,
    confidence: seed % 7 === 0 ? "中等" : "较高",
    unknown: deepLayer ? `更深层的${deepLayer === "dream" ? "梦境防御" : "灵界坐标"}仍未展开；继续会增加精神负荷。` : "目前无法区分主动伪装、外部干扰与单纯巧合，需要换一种能力或现实证据交叉验证。",
    detection: intrusive ? (seed % 4 === 0 ? "目标似乎察觉到一瞬间的不自然，警觉正在上升。" : "目标没有确认能力来源，但本能地收紧了防御。") : "未发现目标察觉。",
    mentalLoad: deepLayer ? 3 : intrusive ? 2 : 1,
    deepLayer,
  };
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("能力反馈没有返回可解析结构");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

export async function generateAbilityDraft(config: AiConfig, game: GameState, ability: Ability, intent: string, context: AbilityContext): Promise<AbilityDraft> {
  const fallback = localDraft(game, ability, intent, context);
  const relevantHidden = game.hiddenWorldFacts.filter((item) => item.subjectKey === context.targetId || item.subjectKey === context.label).slice(-3);
  const knownLoreIds = [...new Set((game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes("player")).flatMap((node) => node.loreRecordIds ?? []))];
  const lore = retrieveLoreContext(LORE_RECORDS, { query: `${intent} ${context.label} ${ability.name}`, audience: { kind: "player", knownLoreIds, topicGrants: ["pathways", "beyonder-system"] }, limit: 10, maxChars: 4200 });
  const payload = {
    pathway: PATHWAYS[game.pathwayId].name,
    sequence: game.currentSequence,
    ability,
    intent,
    context,
    knownFacts: game.facts.slice(-14),
    authorizedLore: lore.context,
    authorizedWorldKnowledge: (game.worldKernel?.knowledge ?? []).filter((node) => node.visibility === "public" || node.holderIds.includes("player")).slice(-12),
    lockedHiddenFacts: relevantHidden,
    recentUses: game.abilityJournal.slice(-6),
  };
  const raw = extractJson(await callModel(config, `你是非凡能力即时结算器。最高优先级是严格服从玩家写明的目的、手段、排除条件与停止条件。绝不把“主动进入灵界”改写成触碰吊坠、占卜或调查某个事件；绝不擅自添加玩家未选择的封印物、仪式、协助者或媒介。若规则允许直接进入梦境或灵界，就必须进入连续场景；若不允许，应由规则层拒绝而不是替换手段。能力必须立刻产生具体、可追问的信息，但不能直接泄露核心幕后真相，不能把心理推断冒充事实，不能替玩家行动，也不能宣布玩家死亡。已锁定隐藏事实不可改写。只返回JSON。`, `玩家原始意图是不可改写的行动契约：${intent}\n选定手段：${ability.name}（${ability.verb}）\n结算这一次使用。直接观察必须是感官可得的具体细节；专业判断要说明可信度；未知项要说明遮蔽来自哪里；察觉反馈必须明确。返回{"observation":"100至220字的即时小说式感知","interpretation":"专业判断","confidence":"较低|中等|较高|确认","unknown":"仍无法确认的部分","detection":"对方或环境是否察觉","mentalLoad":1到6,"deepLayer":"dream|spirit|null","lockedFact":"可选，只允许局部原创事实"}。\n${JSON.stringify(payload)}`, { json: true, maxTokens: 1500, temperature: .62 }));
  return {
    observation: typeof raw.observation === "string" ? raw.observation.slice(0, 800) : fallback.observation,
    interpretation: typeof raw.interpretation === "string" ? raw.interpretation.slice(0, 500) : fallback.interpretation,
    confidence: ["较低", "中等", "较高", "确认"].includes(String(raw.confidence)) ? raw.confidence as AbilityDraft["confidence"] : fallback.confidence,
    unknown: typeof raw.unknown === "string" ? raw.unknown.slice(0, 400) : fallback.unknown,
    detection: typeof raw.detection === "string" ? raw.detection.slice(0, 300) : fallback.detection,
    mentalLoad: Math.max(1, Math.min(6, Number(raw.mentalLoad) || fallback.mentalLoad)),
    deepLayer: fallback.deepLayer,
    lockedFact: typeof raw.lockedFact === "string" && raw.lockedFact.trim() ? raw.lockedFact.trim().slice(0, 300) : undefined,
  };
}

export function resolveImmediateAbility(game: GameState, ability: Ability, intent: string, context: AbilityContext, draft?: AbilityDraft) {
  const result = draft ?? localDraft(game, ability, intent, context);
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
  return {
    record,
    state: {
      ...game,
      spirituality: Math.max(0, game.spirituality - focusCost),
      mentalLoad: Math.min(100, game.mentalLoad + record.mentalLoad),
      instability: Math.min(100, game.instability + overdraw * 3),
      playerCondition: overdraw ? { ...game.playerCondition, pollution: Math.min(100, game.playerCondition.pollution + overdraw) } : game.playerCondition,
      abilityJournal: [record, ...game.abilityJournal].slice(0, 120),
      hiddenWorldFacts: hiddenFact ? [...game.hiddenWorldFacts, hiddenFact] : game.hiddenWorldFacts,
      activeAbilityScene: scene,
      worldKernel: { ...game.worldKernel, knowledge: [...game.worldKernel.knowledge, { id: `knowledge-${record.id}`, subject: context.label, statement: record.interpretation, truth: result.confidence === "确认" ? "confirmed" : "likely", visibility: "player", holderIds: ["player"], loreRecordIds: [], acquiredWeek: game.week }].slice(-400) },
      facts: [...game.facts, { id: `fact-${record.id}`, subject: context.label, statement: `${ability.name}得到的个人判断：${record.interpretation}`, certainty: "线索" as const, source: `${PATHWAYS[game.pathwayId].name}·${ability.name}`, week: game.week }].slice(-100),
    },
  };
}

export async function generateSceneResponse(config: AiConfig, game: GameState, intent: string) {
  const scene = game.activeAbilityScene;
  if (!scene) throw new Error("当前没有可以继续的深层场景");
  const response = await callModel(config, `你是${scene.layer === "dream" ? "梦境" : "灵界"}短篇自由探索场景的即时叙事器。玩家每次自由描述动作，你必须返回具体环境变化、可观察信息和风险迹象。不能替玩家选择，不能宣布玩家死亡，不能泄露未被能力触及的核心真相。已发生内容和锁定隐藏事实不可改写。`, `场景：${JSON.stringify(scene)}\n锁定事实：${JSON.stringify(game.hiddenWorldFacts.slice(-12))}\n玩家继续：${intent}\n用120至260字回应，只写当前场景反馈。`, { maxTokens: 900, temperature: .74 });
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
