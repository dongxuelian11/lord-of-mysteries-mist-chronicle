import { DISTRICTS, PATHWAYS, type ActionContract, type GameState, type RiskLevel } from "../game-model";
import { callModel as invokeModel, type AiConfig } from "../ai-client";
import { stableEntityId } from "../stable-id.ts";
import { extractJson, textSimilarity } from "../model-output.ts";
import { projectWorldForAudience } from "../world-kernel";
import { parseIntentContract } from "../nlp/intent-contract.ts";

function canonicalIdentityText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

const ACTION_NEGATION = /(?:不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪|不投入|不调用|不带|不支付|不签署|不改变|不修改|不访问|不能|无需|无须|不必|别|请勿|莫|不想|不愿|暂不|暂时不|尚未|未|不再|不准备|不打算|无意|没打算)/;

function isExplicitConstruction(intent: string) {
  const positive = /(?:^|[，。；、\s])(?:修建|建造|扩建|增设|改建|升级|布置|设立)(?:一座|一处|一间|新的|现有)?[^，。；]{0,24}(?:据点|房间|设施|实验室|仓库|安全屋|工坊|档案室|仪式室)|(?:改造|升级)(?:现有|组织的|我们的)?[^，。；]{0,18}(?:据点|房间|设施|工坊|档案室|仪式室)/;
  return positive.test(intent) && !/(?:不要|不得|避免|无需|不打算|别|请勿|暂不|暂时不|不想|不愿)[^，。；]{0,8}(?:修建|建造|扩建|改造|升级|设立)/.test(intent);
}

function isInternalGovernanceIntent(intent: string) {
  const governanceObject = /(?:招募|人事|成员|组织|内部|外围联络点)[^，。；]{0,18}(?:档案|名单|流程|制度|权限|保密|分级|核验|审阅|出入记录|内部整顿)|(?:档案|名单)[^，。；]{0,14}(?:保密|分级|核验|权限|泄露)|内部整顿/;
  const explicitExternalRecruit = /(?:招募|邀请|吸收|说服|发展)[^，。；]{0,18}(?:加入|入会|成为成员|成为线人|候选人|求职者|申请人)|(?:接触|面谈|约谈)[^，。；]{0,16}(?:候选人|求职者|申请人)/;
  const affirmativeIntent = intent.replace(/(?:不主动|不私自|不要|不得|禁止|避免|不|别|请勿|暂不|暂时不|不想|不愿)[^。；]{0,40}(?:候选人|求职者|申请人|加入组织|成为成员|成为线人)/g, "");
  return governanceObject.test(intent) && !explicitExternalRecruit.test(affirmativeIntent);
}

export function isRecruitmentIntent(intent: string) {
  if (isInternalGovernanceIntent(intent)) return false;
  return /求职申请|候选人|面谈|临时合作|试用|发展线人|(?:招募|邀请|吸收|说服)[^，。；]{0,18}(?:加入|入会|成员|线人|候选人|人选)/.test(intent);
}

function inferKind(intent: string): ActionContract["kind"] {
  if (isExplicitConstruction(intent)) return "建设";
  if (isInternalGovernanceIntent(intent)) return "自由行动";
  const primaryClause = intent.split(/[，。；]/).map((part) => part.trim()).find((part) => part && !/^(?:不要|不得|避免|不惊动|不接触|不伤害|禁止|别|请勿|莫|暂不|暂时不|不想|不愿|尚未|未)/.test(part)) ?? intent;
  const candidates: Array<[ActionContract["kind"], RegExp]> = [
    ["调查", /调查|追踪|查明|寻找|监视|观察|侦察|记录|潜入|打听/],
    ["交涉", /谈判|说服|交涉|拜访|联系|交易|举报/],
    ["研究", /研究|配方|材料|样本|档案|分析|鉴定/],
    ["仪式", /仪式|占卜|通灵|祈祷|召唤/],
    ["招募", /邀请|吸收|加入组织|发展线人|求职申请|候选人|面谈|临时合作|试用|招募.{0,12}(?:成员|人选|候选人|加入)/],
    ["休整", /休息|休整|恢复|处理冲突|开会|训练|演练|复盘|培训|练习/],
  ];
  const firstAction = candidates.map(([kind, pattern]) => ({ kind, index: primaryClause.search(pattern) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index)[0];
  if (firstAction) return firstAction.kind;
  return "自由行动";
}

function inferRisk(intent: string, districtId: string, abilityCount: number): RiskLevel {
  const danger = DISTRICTS.find((district) => district.id === districtId)?.danger ?? 50;
  let score = danger + abilityCount * 3;
  if (/王室|教会总部|真神|天使|直接袭击|献祭|强行|高位/.test(intent)) score += 35;
  if (/秘密|撤退|远距离|只观察|不接触/.test(intent)) score -= 10;
  return score >= 95 ? "致命" : score >= 70 ? "高" : score >= 42 ? "中" : "低";
}

function targetFrom(intent: string) {
  const quoted = intent.match(/[“"]([^”"]{2,32})[”"]/)?.[1];
  if (quoted) return quoted;
  const normalized = intent.replace(/[、,]/g, "，").replace(/\s+/g, " ").trim();
  if (isInternalGovernanceIntent(normalized)) {
    const governanceTarget = normalized.match(/(?:统筹|整理|整顿|核验|复核)([^，。；]{2,32})/)?.[1];
    if (governanceTarget) return governanceTarget.replace(/^(?:一下|有关|关于|针对)/, "").slice(0, 28);
  }
  const match = normalized.match(/(?:调查|查明|寻找|追踪|观察|侦察|记录|接触|约谈|研究|鉴定|审计|整理|筛选|训练|演练|检查|监视|潜入|打听|修建|建造|扩建|增设|改造|升级|招募|邀请|说服|联系|提醒)([^，。；]{1,40})/);
  const candidate = (match?.[1] ?? normalized).split(/(?:以便|确保|同时|并且|并|但|不要|不得|避免|不惊动|不接触|不伤害|撤退|撤离|中止)/)[0]
    .replace(/^(?:一下|有关|关于|针对|一个|一间|一处|新的)/, "").replace(/(?:的情况|的线索|的问题)$/, "").trim();
  return candidate.slice(0, 28) || "未命名目标";
}

function inferMethodTags(intent: string) {
  const tags: string[] = [];
  const rules: [RegExp, string][] = [
    [/账目|采购|档案|记录|报纸|名单/, "document"], [/跟踪|追踪|尾随|路线|马车/, "track"],
    [/潜入|开锁|暗门|进入|撤离/, "access"], [/交谈|说服|询问|谈判|证人/, "social"],
    [/灵视|占卜|仪式|鉴定|污染|非凡/, "occult"], [/建设|改造|设施|据点/, "build"],
    [/求援|教会|报告|提交证据/, "official"], [/救助|保护|疏散|治疗/, "protect"],
  ];
  for (const [pattern, tag] of rules) if (pattern.test(intent)) tags.push(tag);
  return tags.length ? tags : ["open"];
}

const AUTHORIZATION_SCOPES: ActionContract["authorization"]["scope"][] = ["strict", "bounded", "broad"];

function uniqueDirectiveText(values: unknown[], maximum = 12) {
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, maximum);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

function explicitDirectiveAmount(intent: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = intent.match(pattern);
    const captured = match?.slice(1).find((value) => value !== undefined);
    if (captured !== undefined) return Number(captured);
  }
  return undefined;
}

function inferResourceCommitment(intent: string, game: GameState, kind: ActionContract["kind"], baselineMoney: number): ActionContract["resourceCommitment"] {
  const startsWithActionNegation = new RegExp(`^\\s*${ACTION_NEGATION.source}`).test(intent);
  const posture: ActionContract["resourceCommitment"]["posture"] = /倾尽|全部资源|所有可用资源|全力投入|不惜代价|孤注一掷/.test(intent)
    ? "all-in"
    : /大量|重兵|重点投入|充分投入|充足|足够|优先保障|不计成本|强力增援|增派|加大投入/.test(intent)
      ? "substantial"
      : /最低限度|最小投入|少量|小额|试探|低调|节省|只派|不惊动/.test(intent) || startsWithActionNegation
        ? "minimal"
        : "balanced";
  const factor = posture === "minimal" ? .55 : posture === "substantial" ? 1.65 : posture === "all-in" ? 2.5 : 1;
  const baseManpower = kind === "建设" ? 4 : kind === "招募" ? 2 : kind === "休整" ? 0 : kind === "研究" || kind === "仪式" ? 1 : 2;
  const baseMaterials = kind === "仪式" || /封印|污染|神秘材料|非凡材料/.test(intent) ? 1 : 0;
  const available = game.management?.resources ?? { money: game.money, manpower: 0, extraordinaryMaterials: 0 };
  const explicitMoney = explicitDirectiveAmount(intent, [
    /[£￡]\s*(\d{1,4})/,
    /(?:预算|经费|资金|投入|花费|拨款)[^\d]{0,8}(\d{1,4})\s*(?:镑|金镑)?/,
    /(\d{1,4})\s*(?:镑|金镑)(?:预算|经费|资金)?/,
  ]);
  const explicitManpower = explicitDirectiveAmount(intent, [
    /(?:人力|基层人手|支援人手|外勤人手)[^\d]{0,8}(\d{1,3})/,
    /(\d{1,3})\s*(?:名|人)(?:基层人手|人力|外勤|支援人员|普通成员)/,
  ]);
  const explicitMaterials = explicitDirectiveAmount(intent, [
    /(?:非凡材料|神秘材料|材料)[^\d]{0,8}(\d{1,3})/,
    /(\d{1,3})\s*(?:份|件|单位)?(?:非凡材料|神秘材料)/,
  ]);
  const inferredMoney = posture === "all-in"
    ? Math.max(baselineMoney, Math.min(240, available.money))
    : Math.round(baselineMoney * factor);
  const inferredManpower = posture === "all-in" ? available.manpower : Math.round(baseManpower * factor);
  const inferredMaterials = posture === "all-in" ? available.extraordinaryMaterials : Math.round(baseMaterials * factor);
  return {
    posture,
    money: boundedInteger(explicitMoney, inferredMoney, 0, 240),
    manpower: /不投入人力|不调用人力|不带人手/.test(intent) ? 0 : boundedInteger(explicitManpower, inferredManpower, 0, available.manpower),
    extraordinaryMaterials: /不投入(?:任何)?(?:非凡|神秘)?材料|不用(?:任何)?(?:非凡|神秘)?材料/.test(intent) ? 0 : boundedInteger(explicitMaterials, inferredMaterials, 0, available.extraordinaryMaterials),
  };
}

function inferAuthorization(intent: string) {
  const scope: ActionContract["authorization"]["scope"] = /逐项请示|遇事请示|先请示后行动|每一步.*请示|未经(?:我|议长|首领)?批准不得|没有(?:我|议长|首领)?的?批准不得|只允许|严格按照|不得自行|任何变化.*请示/.test(intent)
    ? "strict"
    : /全权|自行决定|无需请示|无须请示|不必请示|临机决断|便宜行事|放手去做|广泛授权/.test(intent)
      ? "broad"
      : "bounded";
  const clauses = intent.split(/[。；;，,\n]/).map((part) => part.trim()).filter(Boolean);
  const majorClauses = intent.split(/[。；;\n]/).map((part) => part.trim()).filter(Boolean);
  const explicitRedLines = clauses.filter((part) => /不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪|别|请勿|莫|暂不|暂时不|不想|不愿|只做内部|只(?:整理|汇总|比对|核对)/.test(part));
  const redLines = uniqueDirectiveText([
    ...explicitRedLines,
    "不伤害无关者",
    "不把未经验证的假设当作公开指控",
  ]);
  const explicitEscalation = majorClauses.filter((part) => /请示|上报|汇报|报告|批准|同意/.test(part) && !/无需|无须|不必|不用/.test(part));
  const defaultEscalation = scope === "strict"
    ? ["改变目标、手段、执行者或资源投入前必须请示", "接触未授权对象或触及任何红线前必须请示"]
    : scope === "broad"
      ? ["触及任何红线、改变核心目标或出现撤退条件时必须请示"]
      : ["需要突破红线、扩大资源投入或改变核心目标时必须请示", "出现超出队伍层次的威胁、身份暴露或撤退条件时必须请示"];
  const explicitRetreat = clauses.find((part) => /撤退|撤离|中止|求援/.test(part)) ?? majorClauses.find((part) => /撤退|撤离|中止|求援/.test(part));
  return {
    scope,
    redLines,
    mustEscalateWhen: uniqueDirectiveText([...explicitEscalation, ...defaultEscalation]),
    retreatCondition: explicitRetreat || "身份暴露、撤离路线中断或出现超出队伍层次的威胁时立即中止并求援。",
  } satisfies ActionContract["authorization"];
}

function directiveReferences(game: GameState, intent: string) {
  const issue = game.organizationIssues
    .map((item) => ({ item, score: intent.includes(item.id) || intent.includes(item.title) || intent.includes(item.sourceId) ? 1 : textSimilarity(intent, item.title + item.summary) }))
    .sort((left, right) => right.score - left.score)[0];
  const strategy = game.playerIntents
    .filter((item) => item.state === "active")
    .map((item) => ({ item, score: intent.includes(item.id) || intent.includes(item.text) ? 1 : textSimilarity(intent, item.text) }))
    .sort((left, right) => right.score - left.score)[0];
  const playerWorldView = projectWorldForAudience(game.worldKernel, { kind: "player", holderId: "player" });
  const visibleKnowledge = playerWorldView.knowledge;
  const requiredKnowledge = visibleKnowledge.filter((node) => intent.includes(node.id) || intent.includes(node.subject) || textSimilarity(intent, node.subject + node.statement) >= .28);
  const visibleEvents = playerWorldView.events;
  const requiredKnowledgeIds = new Set(requiredKnowledge.map((node) => node.id));
  const sourceEventIds = new Set(game.worldKernel.knowledge
    .filter((node) => requiredKnowledgeIds.has(node.id) && node.sourceEventId)
    .map((node) => node.sourceEventId!));
  const causeEvents = visibleEvents.filter((event) => sourceEventIds.has(event.id) || intent.includes(event.id) || intent.includes(event.title) || textSimilarity(intent, event.title + event.detail) >= .28);
  return {
    requiredKnowledgeIds: requiredKnowledge.map((node) => node.id).slice(0, 12),
    sourceIssueId: issue?.score >= .28 ? issue.item.id : undefined,
    strategyIntentId: strategy?.score >= .28 ? strategy.item.id : undefined,
    causeEventIds: causeEvents.map((event) => event.id).slice(0, 12),
  };
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mergeAuthorization(local: ActionContract["authorization"], proposedValue: unknown): ActionContract["authorization"] {
  const proposed = recordValue(proposedValue);
  if (!proposed) return local;
  const proposedScope = AUTHORIZATION_SCOPES.includes(String(proposed.scope) as ActionContract["authorization"]["scope"])
    ? String(proposed.scope) as ActionContract["authorization"]["scope"]
    : local.scope;
  const scopeRank = (scope: ActionContract["authorization"]["scope"]) => AUTHORIZATION_SCOPES.indexOf(scope);
  const scope = scopeRank(proposedScope) <= scopeRank(local.scope) ? proposedScope : local.scope;
  const proposedRedLines = Array.isArray(proposed.redLines) ? proposed.redLines : typeof proposed.redLines === "string" ? proposed.redLines.split(/[；;]/) : [];
  const proposedEscalation = Array.isArray(proposed.mustEscalateWhen) ? proposed.mustEscalateWhen : typeof proposed.mustEscalateWhen === "string" ? proposed.mustEscalateWhen.split(/[；;]/) : [];
  const proposedRetreat = typeof proposed.retreatCondition === "string" ? proposed.retreatCondition.trim() : "";
  return {
    scope,
    redLines: uniqueDirectiveText([...local.redLines, ...proposedRedLines]),
    mustEscalateWhen: uniqueDirectiveText([...local.mustEscalateWhen, ...proposedEscalation]),
    retreatCondition: uniqueDirectiveText([local.retreatCondition, proposedRetreat], 4).join("；"),
  };
}

function normalizeResourceCommitment(local: ActionContract["resourceCommitment"], proposedValue: unknown, legacyBudget: unknown, intent: string, game: GameState): ActionContract["resourceCommitment"] {
  if (/(?:预算|经费|资金|投入|拨款|人力|人手|非凡材料|神秘材料|全部资源|倾尽|全力|不惜代价|最小投入|最低限度|少量|大量|重兵)/.test(intent) || /[£￡]\s*\d|\d+\s*(?:镑|金镑)/.test(intent)) return local;
  const proposed = recordValue(proposedValue);
  const posture = proposed && ["minimal", "balanced", "substantial", "all-in"].includes(String(proposed.posture))
    ? String(proposed.posture) as ActionContract["resourceCommitment"]["posture"]
    : local.posture;
  const available = game.management?.resources ?? { money: game.money, manpower: 0, extraordinaryMaterials: 0 };
  return {
    posture,
    money: boundedInteger(proposed?.money ?? legacyBudget, local.money, 0, 240),
    manpower: boundedInteger(proposed?.manpower, local.manpower, 0, available.manpower),
    extraordinaryMaterials: boundedInteger(proposed?.extraordinaryMaterials, local.extraordinaryMaterials, 0, available.extraordinaryMaterials),
  };
}

export function localContract(args: {
  intent: string;
  game: GameState;
  leaderId: string;
  districtId: string;
  abilityIds: string[];
}): ActionContract {
  const parsedIntent = parseIntentContract(args.intent);
  const kind = parsedIntent.fields.kind.state === "present" && parsedIntent.fields.kind.normalizedValue
    ? parsedIntent.fields.kind.normalizedValue
    : parsedIntent.fields.kind.state === "ambiguous" || parsedIntent.fields.kind.state === "negated"
      ? "自由行动"
      : inferKind(args.intent);
  const target = parsedIntent.fields.target.state === "present" && parsedIntent.fields.target.normalizedValue
    ? parsedIntent.fields.target.normalizedValue
    : parsedIntent.fields.target.state === "ambiguous"
      ? "待确认目标"
      : targetFrom(args.intent);
  const district = DISTRICTS.find((item) => item.id === args.districtId) ?? DISTRICTS[0];
  const routingIntent = args.intent.replace(new RegExp(`${ACTION_NEGATION.source}[^，。；]*`, "g"), "");
  const namedMember = args.leaderId === "organization"
    ? [...args.game.members].sort((left, right) => right.name.length - left.name.length).find((member) => args.intent.includes(member.name) || (member.name.includes("·") && args.intent.includes(member.name.split("·")[0])))
    : undefined;
  const automaticMember = args.leaderId === "organization"
    ? namedMember ?? (/灵视|占卜|仪式|污染|封印|尸体|灵体/.test(routingIntent) ? args.game.members.find((item) => item.id === "rowan")
      : /账目|采购|建设|设施|证件|预算|合法/.test(routingIntent) ? args.game.members.find((item) => item.id === "cedric")
        : /报纸|贵族|消息|交涉|询问|线人/.test(routingIntent) ? args.game.members.find((item) => item.id === "ines")
          : args.game.members.find((item) => item.id === "mara"))
    : undefined;
  const effectiveLeaderId = automaticMember?.id ?? args.leaderId;
  const leader = effectiveLeaderId === "player" ? { name: args.game.playerName || "组织负责人", specialty: PATHWAYS[args.game.pathwayId].name } : automaticMember ?? args.game.members.find((item) => item.id === effectiveLeaderId);
  const matchedOpportunity = args.game.opportunities.find((item) => item.state === "available" && (args.intent.includes(item.title.replace(/^(安全|追查|追踪|进入|向)/, "")) || item.suggestedIntent === args.intent));
  const days = kind === "建设" ? 5 : kind === "研究" ? 3 : kind === "休整" ? 2 : /长期|全面|深入/.test(args.intent) ? 4 : 2;
  const baselineBudget = kind === "建设" ? 90 : kind === "交涉" ? 35 : kind === "研究" || kind === "仪式" ? 28 : 18;
  const localResourceCommitment = inferResourceCommitment(args.intent, args.game, kind, baselineBudget);
  const availableResources = args.game.management?.resources ?? { money: args.game.money, manpower: 0, extraordinaryMaterials: 0 };
  const resourceCommitment: ActionContract["resourceCommitment"] = {
    posture: parsedIntent.fields.resourcePosture.state === "present" || parsedIntent.fields.resourcePosture.state === "negated"
      ? parsedIntent.resources.posture
      : localResourceCommitment.posture,
    money: parsedIntent.fields.money.state === "present" || parsedIntent.fields.money.state === "negated"
      ? boundedInteger(parsedIntent.fields.money.value, 0, 0, 240)
      : localResourceCommitment.money,
    manpower: parsedIntent.fields.manpower.state === "present" || parsedIntent.fields.manpower.state === "negated"
      ? boundedInteger(parsedIntent.fields.manpower.value, 0, 0, availableResources.manpower)
      : localResourceCommitment.manpower,
    extraordinaryMaterials: parsedIntent.fields.extraordinaryMaterials.state === "present" || parsedIntent.fields.extraordinaryMaterials.state === "negated"
      ? boundedInteger(parsedIntent.fields.extraordinaryMaterials.value, 0, 0, availableResources.extraordinaryMaterials)
      : localResourceCommitment.extraordinaryMaterials,
  };
  const legacyAuthorization = inferAuthorization(args.intent);
  const authorization: ActionContract["authorization"] = {
    ...legacyAuthorization,
    scope: parsedIntent.fields.authorizationScope.state === "present"
      ? parsedIntent.authorization.scope
      : parsedIntent.fields.authorizationScope.state === "ambiguous"
        ? "strict"
        : legacyAuthorization.scope,
    redLines: uniqueDirectiveText([
      ...legacyAuthorization.redLines,
      ...(parsedIntent.fields.redLines.state === "present" ? parsedIntent.fields.redLines.value ?? [] : []),
    ]),
    retreatCondition: parsedIntent.fields.retreatCondition.state === "present" && parsedIntent.fields.retreatCondition.normalizedValue
      ? parsedIntent.fields.retreatCondition.normalizedValue
      : legacyAuthorization.retreatCondition,
  };
  const references = directiveReferences(args.game, args.intent);
  return {
    id: stableEntityId("action-draft", args.game.saveId ?? "legacy-save", args.game.week, { intent: canonicalIdentityText(args.intent), leaderId: effectiveLeaderId, districtId: district.id, abilityIds: [...new Set(args.abilityIds)].sort() }),
    rawIntent: args.intent.trim(),
    title: kind + " · " + target,
    kind,
    target,
    desiredOutcome: args.intent.trim(),
    approach: (args.leaderId === "organization" ? "组织按决议自行分工，由" : "") + (leader?.name ?? "执行者") + "利用" + (leader?.specialty ?? "现有关系") + "，从当前可接触的证据层开始；具体人员与路线由组织在不偏离目标、方法和底线的前提下调整。",
    leaderId: effectiveLeaderId,
    memberIds: [effectiveLeaderId],
    executionMode: effectiveLeaderId === "player" ? "player-led" : "delegated",
    districtId: district.id,
    abilityIds: args.abilityIds,
    facilityId: /封存|切断联系|危险物/.test(args.intent) ? "vault" : kind === "研究" ? "archive" : kind === "仪式" ? "ritual" : kind === "建设" ? "workshop" : kind === "休整" ? "quarters" : undefined,
    days,
    budget: resourceCommitment.money,
    resourceCommitment,
    authorization,
    requiredKnowledgeIds: references.requiredKnowledgeIds,
    sourceIssueId: references.sourceIssueId,
    strategyIntentId: references.strategyIntentId,
    causeEventIds: references.causeEventIds,
    risk: inferRisk(args.intent, district.id, args.abilityIds.length),
    knownFacts: "组织只确认目前账本中与“" + target + "”直接相关的记录；" + district.name + "的公开背景可以作为起点。",
    hypothesis: "玩家怀疑“" + target + "”值得投入资源，但假设本身不视为事实。",
    unknowns: "目标真实身份、幕后关系、非凡层次与是否存在反调查手段仍未知。",
    redLines: authorization.redLines.join("；"),
    retreat: authorization.retreatCondition,
    focus: true,
    opportunityId: matchedOpportunity?.id,
    methodTags: inferMethodTags(args.intent),
  };
}

export async function interpretIntentWithAi(config: AiConfig, args: Parameters<typeof localContract>[0]) {
  const fallback = localContract(args);
  const playerWorldView = projectWorldForAudience(args.game.worldKernel, { kind: "player", holderId: "player" });
  const safeState = {
    week: args.game.week,
    pathway: PATHWAYS[args.game.pathwayId].name,
    sequence: args.game.currentSequence,
    knownFacts: args.game.facts.slice(-16),
    activePressure: args.game.missions.filter((mission) => mission.state === "active"),
    evidence: args.game.evidenceNodes.filter((item) => item.discovered),
    availableOpportunities: args.game.opportunities.filter((item) => item.state === "available"),
    organizationIssues: args.game.organizationIssues.filter((item) => item.state === "待裁决" || item.state === "已逾期").map(({ id, title, summary, sourceId }) => ({ id, title, summary, sourceId })),
    strategicIntents: args.game.playerIntents.filter((item) => item.state === "active"),
    authorizedKnowledge: playerWorldView.knowledge.slice(-16),
    visibleCauseEvents: playerWorldView.events.slice(-16),
    district: DISTRICTS.find((district) => district.id === args.districtId),
    members: args.game.members.map(({ id, name, role, specialty, loyalty, fatigue }) => ({ id, name, role, specialty, loyalty, fatigue })),
  };
  const raw = await invokeModel(config,
    "你是《灰雾纪事》的首领指令解析器。只整理玩家意图，不决定成败，不新增幕后真相，不把玩家原著知识视为角色知识。不得删除或放宽本地保守解释中的任何红线、必须请示条件、撤退条件或授权限制。返回严格JSON。",
    "将自由意图整理为首领指令。缺失信息使用保守推断，只有重大歧义才在unknowns中指出。返回字段：title,kind,target,desiredOutcome,approach,days,risk,knownFacts,hypothesis,unknowns；resourceCommitment:{posture:minimal|balanced|substantial|all-in,money,manpower,extraordinaryMaterials}；authorization:{scope:strict|bounded|broad,redLines:[],mustEscalateWhen:[],retreatCondition}；requiredKnowledgeIds:[]；可选sourceIssueId、strategyIntentId；causeEventIds:[]。兼容字段budget必须等于resourceCommitment.money，redLines必须是authorization.redLines用分号连接，retreat必须等于authorization.retreatCondition。kind只能是调查/交涉/研究/建设/招募/仪式/休整/自由行动，risk只能是低/中/高/致命。所有引用id只能逐字取自本地状态；不得扩大本地授权，不得移除本地红线或请示条件。\n玩家意图：" + args.intent + "\n本地状态：" + JSON.stringify(safeState) + "\n本地保守解释：" + JSON.stringify(fallback), { task: "intent-parser", json: true, maxTokens: 2300, temperature: .25 });
  const value = extractJson(raw);
  const kindOptions = ["调查", "交涉", "研究", "建设", "招募", "仪式", "休整", "自由行动"];
  const riskOptions = ["低", "中", "高", "致命"];
  const proposedKind = kindOptions.includes(String(value.kind)) ? value.kind as ActionContract["kind"] : fallback.kind;
  const explicitKind = inferKind(args.intent);
  const governanceIntent = isInternalGovernanceIntent(args.intent);
  const safeKind = governanceIntent ? "自由行动" : proposedKind === "建设" && !isExplicitConstruction(args.intent)
    ? fallback.kind
    : explicitKind !== "自由行动" && proposedKind !== explicitKind ? explicitKind : proposedKind;
  const safeTarget = governanceIntent ? fallback.target : typeof value.target === "string" ? targetFrom((fallback.kind === "调查" ? "调查" : "接触") + value.target) : fallback.target;
  const proposedAuthorization = recordValue(value.authorization) ?? {};
  const legacyProposedRedLines = typeof value.redLines === "string" ? value.redLines.trim().replace(/^红线[：:]\s*/, "") : "";
  const authorization = mergeAuthorization(fallback.authorization, {
    ...proposedAuthorization,
    redLines: uniqueDirectiveText([
      ...(Array.isArray(proposedAuthorization.redLines) ? proposedAuthorization.redLines : typeof proposedAuthorization.redLines === "string" ? proposedAuthorization.redLines.split(/[；;]/) : []),
      ...legacyProposedRedLines.split(/[；;]/),
    ]),
    retreatCondition: typeof proposedAuthorization.retreatCondition === "string" ? proposedAuthorization.retreatCondition : value.retreat,
  });
  const resourceCommitment = normalizeResourceCommitment(fallback.resourceCommitment, value.resourceCommitment, value.budget, args.intent, args.game);
  const allowedKnowledgeIds = new Set(playerWorldView.knowledge.map((node) => node.id));
  const allowedEventIds = new Set(playerWorldView.events.map((event) => event.id));
  const proposedKnowledgeIds = Array.isArray(value.requiredKnowledgeIds) ? value.requiredKnowledgeIds.filter((id): id is string => typeof id === "string" && allowedKnowledgeIds.has(id)) : [];
  const proposedCauseEventIds = Array.isArray(value.causeEventIds) ? value.causeEventIds.filter((id): id is string => typeof id === "string" && allowedEventIds.has(id)) : [];
  const proposedIssueId = typeof value.sourceIssueId === "string" && args.game.organizationIssues.some((issue) => issue.id === value.sourceIssueId) ? value.sourceIssueId : undefined;
  const proposedStrategyId = typeof value.strategyIntentId === "string" && args.game.playerIntents.some((intent) => intent.id === value.strategyIntentId && intent.state === "active") ? value.strategyIntentId : undefined;
  return {
    ...fallback,
    title: safeKind + " · " + safeTarget,
    kind: safeKind,
    target: safeTarget,
    facilityId: safeKind === "建设" ? fallback.facilityId : safeKind === "研究" ? "archive" : safeKind === "仪式" ? "ritual" : safeKind === "休整" ? "quarters" : /封存|切断联系|危险物/.test(args.intent) ? "vault" : undefined,
    desiredOutcome: typeof value.desiredOutcome === "string" ? value.desiredOutcome : fallback.desiredOutcome,
    approach: typeof value.approach === "string" ? value.approach : fallback.approach,
    days: Math.min(6, Math.max(1, Number(value.days) || fallback.days)),
    budget: resourceCommitment.money,
    resourceCommitment,
    authorization,
    requiredKnowledgeIds: uniqueDirectiveText([...fallback.requiredKnowledgeIds, ...proposedKnowledgeIds]),
    sourceIssueId: fallback.sourceIssueId ?? proposedIssueId,
    strategyIntentId: fallback.strategyIntentId ?? proposedStrategyId,
    causeEventIds: uniqueDirectiveText([...fallback.causeEventIds, ...proposedCauseEventIds]),
    risk: riskOptions.includes(String(value.risk)) ? value.risk as RiskLevel : fallback.risk,
    knownFacts: typeof value.knownFacts === "string" ? value.knownFacts : fallback.knownFacts,
    hypothesis: typeof value.hypothesis === "string" ? value.hypothesis : fallback.hypothesis,
    unknowns: typeof value.unknowns === "string" ? value.unknowns : fallback.unknowns,
    redLines: authorization.redLines.join("；"),
    retreat: authorization.retreatCondition,
  };
}
