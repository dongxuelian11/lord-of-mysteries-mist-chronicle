/**
 * Deterministic, explainable Chinese intent contract parser.
 *
 * This module is deliberately independent from game-engine.ts during NLP-01.1.
 * It produces a conservative contract with field state and source-bound evidence;
 * it does not decide whether an action may execute.
 */

export const INTENT_CONTRACT_SCHEMA_VERSION = "intent-contract-v1" as const;
export const INTENT_CONTRACT_RULE_VERSION = "intent-rules-2026-08-24-v2" as const;

export type FieldState = "present" | "negated" | "ambiguous" | "absent";
export type IntentKind = "调查" | "交涉" | "研究" | "建设" | "招募" | "仪式" | "休整" | "自由行动";
export type ResourcePosture = "minimal" | "balanced" | "substantial" | "all-in";
export type AuthorizationScope = "strict" | "bounded" | "broad";
export type RiskLevel = "低" | "中" | "高" | "致命";

export interface EvidenceSpan {
  start: number;
  end: number;
  text: string;
  ruleId: string;
}

export interface ContractField<T> {
  state: FieldState;
  value?: T;
  normalizedValue?: T;
  evidence: EvidenceSpan[];
  ruleIds: string[];
  conflicts: string[];
}

export interface IntentClause {
  text: string;
  start: number;
  end: number;
  connector?: string;
}

export interface IntentContract {
  schemaVersion: typeof INTENT_CONTRACT_SCHEMA_VERSION;
  ruleVersion: typeof INTENT_CONTRACT_RULE_VERSION;
  rawText: string;
  clauses: IntentClause[];
  fields: {
    kind: ContractField<IntentKind>;
    target: ContractField<string>;
    resourcePosture: ContractField<ResourcePosture>;
    money: ContractField<number>;
    manpower: ContractField<number>;
    extraordinaryMaterials: ContractField<number>;
    authorizationScope: ContractField<AuthorizationScope>;
    redLines: ContractField<string[]>;
    retreatCondition: ContractField<string>;
  };
  resources: {
    posture: ResourcePosture;
    money?: number;
    manpower?: number;
    extraordinaryMaterials?: number;
  };
  authorization: {
    scope: AuthorizationScope;
    redLines: string[];
    mustEscalateWhen: string[];
    retreatCondition?: string;
  };
  risk: RiskLevel;
  needsClarification: boolean;
  ambiguities: string[];
  conflicts: string[];
}

type MatchRule = {
  id: string;
  pattern: RegExp;
  value: string;
};

const KIND_RULES: MatchRule[] = [
  { id: "kind.construction", pattern: /修建|建造|扩建|增设|改建|升级|改造|设立|布置/, value: "建设" },
  { id: "kind.ritual", pattern: /举行|净化|占卜|通灵|祈祷|召唤|祈求|灵视|祈告|布置[^，。；;\n]{0,12}仪式/, value: "仪式" },
  { id: "kind.recruitment", pattern: /招募|邀请|吸收|加入|入会|发展线人|面谈|约谈|临时合作|试用|录用|说服[^，。；;\n]{0,16}(?:加入|成为成员|成为线人)|与[^，。；;\n]{2,18}合作/, value: "招募" },
  { id: "kind.negotiation", pattern: /谈判|说服|交涉|拜访|联系|交易|举报|报告|汇报|提交|递交|求援|申请|请求|沟通|听取|交换/, value: "交涉" },
  { id: "kind.research", pattern: /研究|分析|鉴定|鉴别|解读|检验|化验/, value: "研究" },
  { id: "kind.investigation", pattern: /调查|追踪|查明|寻找|监视|观察|侦察|记录|潜入|打听|查看|跟踪|尾随|盯住|进入|查找|追查|审计|审阅|核验|确认|复核|核对|检查|查验|核实/, value: "调查" },
  { id: "kind.rest", pattern: /休息|休整|恢复|处理[^，。；;\n]{0,6}(?:冲突|暴露风险)|开会|召开|主持|训练|演练|复盘|培训|修复/, value: "休整" },
  { id: "kind.governance", pattern: /整理|整顿|核对|核验|复核|保存|封存|清点|评估|等待|检查|记录|处理|执行|落实|推进|安排|守护|保护|掩护|救助|营救|救出|疏散|撤离|撤退|撤出|撤回|中止|隐藏|隔离|保留/, value: "自由行动" },
];

const TARGET_VERBS = /调查|追踪|查明|寻找|监视|观察|侦察|记录|潜入|打听|查看|跟踪|尾随|盯住|进入|查找|追查|审计|核验|确认|鉴别|鉴定|解读|分析|研究|复核|核对|谈判|说服|交涉|拜访|联系|交易|举报|报告|汇报|提交|递交|求援|申请|请求|合作|招募|邀请|吸收|面谈|约谈|临时合作|试用|修建|建造|扩建|增设|改建|升级|改造|设立|布置|举行|安排|组织|占卜|通灵|祈祷|召唤|祈求|灵视|休息|休整|恢复|处理|开会|训练|演练|复盘|培训|整理|整顿|保存|封存|清点|评估|等待|检查|执行|落实|推进|守护|保护|掩护|救助|营救|救出|疏散|撤离|撤退|撤出|撤回|中止|修复|隐藏|召开|主持|审阅|确认|鉴别|鉴定|解读|求助/;

const NEGATION = /(?:不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪|不投入|不调用|不带|不支付|不签署|不改变|不修改|不访问|不能|无需|无须|不必|别|请勿|莫|不想|不愿|暂不|暂时不|尚未|不再|不准备|不打算|无意|没打算|不是不|并非不)/;
const POSITIVE_NEGATION = /(?:不是不要|并非不要|不是不|并非不)/;
// Action negation is deliberately broader than the red-line vocabulary. User
// commands commonly use colloquial forms (别/请勿/暂时不/不想/未), and an
// unrecognised negative must never be treated as permission to execute the
// matched verb. `未` is only accepted as a suffix immediately before the verb
// so phrases such as “未经批准不得...” still resolve through “不得”.
const ACTION_NEGATION_SUFFIX = /(?:不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪|不投入|不调用|不带|不支付|不签署|不改变|不修改|不访问|不能|无需|无须|不必|别|请勿|莫|不想|不愿|暂不|暂时不|尚未|未|不再|不准备|不打算|无意|没打算)\s*$/;
const ACTION_NEGATION_PREFIX = /^(?:不要|不得|禁止|避免|不主动|不私自|不接触|不盘问|不询问|不使用|不用|不触碰|不进入|不调查|不追踪|不投入|不调用|不带|不支付|不签署|不改变|不修改|不访问|不能|无需|无须|不必|别|请勿|莫|不想|不愿|暂不|暂时不|尚未|未|不再|不准备|不打算|无意|没打算)/;

function field<T>(state: FieldState = "absent", value?: T): ContractField<T> {
  return { state, ...(value === undefined ? {} : { value, normalizedValue: value }), evidence: [], ruleIds: [], conflicts: [] };
}

function addEvidence<T>(target: ContractField<T>, source: string, start: number, end: number, ruleId: string) {
  const boundedStart = Math.max(0, Math.min(source.length, start));
  const boundedEnd = Math.max(boundedStart, Math.min(source.length, end));
  const text = source.slice(boundedStart, boundedEnd);
  if (!text || target.evidence.some((item) => item.start === boundedStart && item.end === boundedEnd && item.ruleId === ruleId)) return;
  target.evidence.push({ start: boundedStart, end: boundedEnd, text, ruleId });
  if (!target.ruleIds.includes(ruleId)) target.ruleIds.push(ruleId);
}

function addConflict<T>(target: ContractField<T>, message: string) {
  if (!target.conflicts.includes(message)) target.conflicts.push(message);
}

function clausesOf(text: string): IntentClause[] {
  const clauses: IntentClause[] = [];
  const pattern = /[^，。；;，,\n]+/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leftTrim = raw.length - raw.trimStart().length;
    const rightTrim = raw.trimEnd().length;
    clauses.push({ text: trimmed, start: start + leftTrim, end: start + rightTrim });
  }
  return clauses;
}

function matchNegated(source: string, index: number, length: number) {
  const boundary = Math.max(
    source.lastIndexOf("，", index - 1),
    source.lastIndexOf("。", index - 1),
    source.lastIndexOf("；", index - 1),
    source.lastIndexOf(";", index - 1),
    source.lastIndexOf(",", index - 1),
    source.lastIndexOf("\n", index - 1),
  );
  const windowStart = Math.max(boundary + 1, index - 18);
  const prefix = source.slice(windowStart, index);
  if (POSITIVE_NEGATION.test(prefix)) return false;
  const normalizedPrefix = prefix.replace(/[，。；;,\s]+$/g, "");
  return ACTION_NEGATION_SUFFIX.test(normalizedPrefix) || (length > 0 && /(?:不要|不得|禁止|避免|别|请勿|莫|暂不|暂时不)[^，。；;]{0,10}$/.test(prefix));
}

function matchAllRules<T extends string>(source: string, rules: MatchRule[], target: ContractField<T>) {
  const positives: Array<{ rule: MatchRule; index: number; length: number }> = [];
  const negatives: Array<{ rule: MatchRule; index: number; length: number }> = [];
  for (const rule of rules) {
    for (const match of source.matchAll(new RegExp(rule.pattern.source, `${rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`}`))) {
      const index = match.index ?? 0;
      const item = { rule, index, length: match[0].length };
      (matchNegated(source, index, match[0].length) ? negatives : positives).push(item);
    }
  }
  if (positives.length) {
    const distinct = [...new Set(positives.map((item) => item.rule.value))];
    target.state = distinct.length > 1 ? "ambiguous" : "present";
    target.value = distinct[0] as T;
    target.normalizedValue = distinct[0] as T;
    for (const item of positives) addEvidence(target, source, item.index, item.index + item.length, item.rule.id);
    if (distinct.length > 1) addConflict(target, `多个候选值冲突：${distinct.join("、")}`);
  } else if (negatives.length) {
    target.state = "negated";
    for (const item of negatives) addEvidence(target, source, item.index, item.index + item.length, `${item.rule.id}.negated`);
  }
  return { positives, negatives };
}

function cleanTarget(candidate: string) {
  return candidate
    .replace(/^[\s“”‘’"'：:、，,的之与和及]/g, "")
    .replace(/(?:的情况|的线索|的问题)$/, "")
    .replace(/[“”‘’"']/g, "")
    .replace(/^(?:一下|有关|关于|针对|一个|一间|一处|新的)/, "")
    .split(/(?:投入|预算|少量|重点|全部资源|全力投入|不惜代价|不计成本|争取|成为|给(?:议会|教会|官方)|临时合作|超出|发现|遇到|出现|任何变化|未经批准|不得自行|先请示|先上报|先报告|核对|整理|只(?:允许|做|谈|提交|查阅|处理|记录|更换|负责|交换|接受|讨论|陈述|维持|保留|增加|练习|用于))/)[0]
    .trim()
    .slice(0, 40);
}

function targetAlternatives(raw: string) {
  if (!/(?:或者|或)/.test(raw)) return [];
  return raw.split(/(?:或者|或)/).map((part) => cleanTarget(part)).filter(Boolean);
}

function inferTarget(source: string, target: ContractField<string>) {
  const quote = /[“‘"]([^”’"]{2,36})[”’"]/.exec(source);
  if (quote && quote.index !== undefined) {
    const afterQuoteStart = quote.index + quote[0].length;
    const afterQuote = source.slice(afterQuoteStart).match(/^(?:的[^，。；;,\n]{1,18}|名单|档案|权限|隐蔽性|主持者|记录|来历)/)?.[0] ?? "";
    const descriptor = /^(?:的来历|的联络地点|的公开行程|的损坏)$/.test(afterQuote) ? "" : afterQuote;
    const quoted = cleanTarget(`${quote[1]}${descriptor}`);
    if (quoted) {
      target.state = "present";
      target.value = quoted;
      target.normalizedValue = quoted;
      addEvidence(target, source, quote.index + 1, quote.index + 1 + quote[1].length, "target.quoted");
      return;
    }
  }
  const pronoun = /(?:他|她|它|那里|这里|此处|该处|这个|那个|对方|其)(?:的|上|中|处|人|东西|信息|权限|内容)?/.exec(source);
  const matches: Array<{ value: string; index: number; length: number; alternatives?: string[] }> = [];
  // Chinese often puts the object before the action (向教会报告、在安全屋举行、从现场撤退).
  const prepositionPatterns = [
    /(?:向|与|和|同)([^，。；;,\n]{2,28}?)(?=祈祷|祈求|报告|汇报|求援|申请|请求|谈判|交涉|拜访|联系|交易|合作|招募|邀请|吸收|说服)/g,
    /(?:在|从|自)([^，。；;,\n]{2,28}?)(?=举行|进行|休息|休整|撤退|撤离|撤出|撤回|中止)/g,
  ];
  const postActionMatches: Array<{ value: string; index: number; length: number; alternatives?: string[] }> = [];
  for (const match of source.matchAll(new RegExp(`(?:${TARGET_VERBS.source})([^，。；;,\\n]{1,40})`, "g"))) {
    const index = match.index ?? 0;
    const raw = match[1] ?? "";
    const candidate = cleanTarget(raw.split(/(?:以便|确保|同时|并且|并|但|不要|不得|避免|不惊动|不接触|不伤害|先|只|改为)/)[0]);
    if (!candidate) continue;
    const valueStart = index + match[0].indexOf(match[1]);
    const alternatives = targetAlternatives(raw);
    postActionMatches.push({ value: alternatives[0] ?? candidate, index: valueStart, length: (alternatives[0] ?? candidate).length, ...(alternatives.length > 1 ? { alternatives } : {}) });
  }
  for (const pattern of prepositionPatterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[1] ?? "";
      const candidate = cleanTarget(raw);
      if (candidate) {
        const hasNamedAudience = /(?:区|教会|圣堂|议会|工会|煤行|商会)$/.test(candidate);
        if (postActionMatches.length && /(?:报告|汇报|提交|递交|核验|确认|查明|调查|研究|分析|鉴定|鉴别|复核|核对|检查|查找|寻找|观察|监视|追踪|审计)/.test(source.slice(match.index ?? 0)) && !hasNamedAudience) continue;
        const index = (match.index ?? 0) + match[0].indexOf(match[1]);
        const alternatives = targetAlternatives(raw);
        const value = alternatives[0] ?? candidate;
        matches.push({ value, index, length: value.length, ...(alternatives.length > 1 ? { alternatives } : {}) });
      }
    }
  }
  matches.push(...postActionMatches);
  if (matches.length) {
    const first = matches[0];
    if (/^(?:他|她|它|那里|这里|此处|该处|这个|那个|对方|其)/.test(first.value)) {
      target.state = "ambiguous";
      addEvidence(target, source, first.index, first.index + first.length, "target.pronoun");
      addConflict(target, "目标使用未解析代词或指示词");
      return;
    }
    // Later clauses frequently contain method/retreat objects (例如“练习撤退路线”);
    // the first actionable object is the conservative target. Ambiguity is raised
    // separately for unresolved pronouns and explicit conflicting connectors.
    target.state = "present";
    target.value = first.value;
    target.normalizedValue = first.value;
    addEvidence(target, source, first.index, first.index + first.length, "target.verb-object");
    if (first.alternatives && first.alternatives.length > 1) {
      target.state = "ambiguous";
      addConflict(target, `同一意图包含并列目标：${first.alternatives.join("、")}`);
    }
    const sameClauseCandidates = matches.filter((item) => item.index < first.index + first.length + 32 && item.index >= first.index);
    if (sameClauseCandidates.length > 1 && /(?:并|或者|或|同时)/.test(source.slice(first.index, sameClauseCandidates[sameClauseCandidates.length - 1].index + sameClauseCandidates[sameClauseCandidates.length - 1].length))) {
      target.state = "ambiguous";
      addConflict(target, `同一意图包含并列目标：${[...new Set(sameClauseCandidates.map((item) => item.value))].join("、")}`);
    }
    return;
  }
  if (pronoun) {
    target.state = "ambiguous";
    addEvidence(target, source, pronoun.index, pronoun.index + pronoun[0].length, "target.pronoun");
    addConflict(target, "目标使用未解析代词或指示词");
  }
}

function inferKind(source: string, target: ContractField<IntentKind>) {
  const positives: Array<{ kind: IntentKind; index: number; length: number; ruleId: string }> = [];
  const negatives: Array<{ kind: IntentKind; index: number; length: number; ruleId: string }> = [];
  for (const rule of KIND_RULES) {
    for (const match of source.matchAll(new RegExp(rule.pattern.source, "g"))) {
      const index = match.index ?? 0;
      const item = { kind: rule.value as IntentKind, index, length: match[0].length, ruleId: rule.id };
      (matchNegated(source, index, match[0].length) ? negatives : positives).push(item);
    }
  }
  const deduped = positives
    .filter((item, index) => positives.findIndex((candidate) => candidate.index === item.index && candidate.length === item.length) === index)
    .sort((left, right) => left.index - right.index);
  // Governance verbs are a conservative fallback only when no more specific verb survives negation.
  const chosen = deduped;
  const uniqueChosen = [...new Set(chosen.map((item) => item.kind))];
  if (chosen.length) {
    const first = chosen[0];
    target.state = "present";
    target.value = first.kind;
    target.normalizedValue = first.kind;
    addEvidence(target, source, first.index, first.index + first.length, first.ruleId);
    const sameClause = chosen.filter((item) => item.index >= first.index && item.index < first.index + first.length + 24);
    if (sameClause.length > 1 && /(?:并|或者|或|同时)/.test(source.slice(first.index, sameClause[sameClause.length - 1].index + sameClause[sameClause.length - 1].length))) {
      target.state = "ambiguous";
      addConflict(target, `同一分句包含并列行动：${[...new Set(sameClause.map((item) => item.kind))].join("、")}`);
    }
    if (uniqueChosen.length > 1 && sameClause.length <= 1) target.conflicts = [];
  } else if (negatives.length) {
    target.state = "negated";
    for (const item of negatives) addEvidence(target, source, item.index, item.index + item.length, `${item.ruleId}.negated`);
  }
  if (/核验|核对|确认|查明/.test(source) && /(?:样本|配方|药剂|仪式|梦境|符号|封印物|含义|主持者)/.test(source) && !/成员名单|权限|账目|档案/.test(source)) {
    target.state = "present";
    target.value = "研究";
    target.normalizedValue = "研究";
  }
  if (!/^(?:进入|潜入|调查|追踪|观察|监视)/.test(source) && /(?:核验|核对|复核|整理).*(?:权限|名单|账目|内部|流程)/.test(source)) {
    target.state = "present";
    target.value = "自由行动";
    target.normalizedValue = "自由行动";
  }
  if (/^\s*(?:不要|不得|禁止|避免)/.test(source) && /(?:不要|不得|禁止|避免)[^，。；;,\n]{0,18}(?:调查|追踪|监视|潜入|招募|面谈|仪式|修建|升级|休息|恢复|救助|疏散|核验|核对|复核|审阅|检查|确认)/.test(source) && /(?:核对|核验|复核|整理|封存|等待|保存|执行|检查|评估|记录)/.test(source)) {
    target.state = "present";
    target.value = "自由行动";
    target.normalizedValue = "自由行动";
  }
  if (/布置[^，。；;\n]{0,12}仪式/.test(source)) {
    target.state = "present";
    target.value = "仪式";
    target.normalizedValue = "仪式";
  }
  // A positive replacement after a negated clause wins; a pure negation remains unresolved.
  if (!chosen.length && deduped.length === 0 && negatives.length === 0) {
    target.state = "absent";
  }
}

function inferResource(source: string, fields: IntentContract["fields"]) {
  const postureRules: MatchRule[] = [
    { id: "resource.all-in", pattern: /倾尽|全部资源|所有可用资源|全力投入|不惜代价|孤注一掷|不计成本/, value: "all-in" },
    { id: "resource.substantial", pattern: /大量|重兵|重点投入|充分投入|充足|足够|优先保障|强力增援|增派|加大投入/, value: "substantial" },
    { id: "resource.minimal", pattern: /最低限度|最小投入|少量|小额|试探|低调|节省|只派|不惊动|不投入|不调用|不带人手|不使用任何材料|不消耗资源|只观察|只整理|等待消息|低调进行/, value: "minimal" },
  ];
  matchAllRules(source, postureRules, fields.resourcePosture);
  const amount = (fieldTarget: ContractField<number>, rules: Array<{ id: string; pattern: RegExp }>, negativeRules: Array<{ id: string; pattern: RegExp }>) => {
    for (const rule of negativeRules) {
      const match = rule.pattern.exec(source);
      if (match && match.index !== undefined) {
        fieldTarget.state = "negated";
        fieldTarget.value = 0;
        fieldTarget.normalizedValue = 0;
        addEvidence(fieldTarget, source, match.index, match.index + match[0].length, rule.id);
        return;
      }
    }
    for (const rule of rules) {
      const match = rule.pattern.exec(source);
      if (!match || match.index === undefined) continue;
      const number = Number(match[1]);
      if (!Number.isFinite(number)) continue;
      fieldTarget.state = "present";
      fieldTarget.value = Math.max(0, Math.min(240, Math.round(number)));
      fieldTarget.normalizedValue = fieldTarget.value;
      addEvidence(fieldTarget, source, match.index, match.index + match[0].length, rule.id);
      return;
    }
  };
  amount(fields.money, [
    { id: "resource.money.pound", pattern: /[£￡]\s*(\d{1,4})/ },
    { id: "resource.money.label", pattern: /(?:预算|经费|资金|投入|花费|拨款)[^\d]{0,10}(\d{1,4})\s*(?:镑|金镑)?/ },
    { id: "resource.money.suffix", pattern: /(\d{1,4})\s*(?:镑|金镑)/ },
  ], []);
  amount(fields.manpower, [
    { id: "resource.manpower.label", pattern: /(?:人力|基层人手|支援人手|外勤人手)[^\d]{0,10}(\d{1,3})/ },
    { id: "resource.manpower.suffix", pattern: /(\d{1,3})\s*(?:名|人)(?:基层人手|人力|外勤|支援人员|普通成员|人手)?/ },
  ], [
    { id: "resource.manpower.negated", pattern: /不投入(?:任何)?人力|不调用(?:任何)?人力|不带(?:任何)?人手|不使用任何人手/ },
  ]);
  amount(fields.extraordinaryMaterials, [
    { id: "resource.material.label", pattern: /(?:非凡材料|神秘材料|材料)[^\d]{0,10}(\d{1,3})/ },
    { id: "resource.material.suffix", pattern: /(\d{1,3})\s*(?:份|件|单位)?(?:非凡材料|神秘材料|材料)/ },
  ], [
    { id: "resource.material.negated", pattern: /不投入(?:任何)?(?:非凡|神秘)?材料|不用(?:任何)?(?:非凡|神秘)?材料|不使用任何材料/ },
  ]);
  const amountFields = [fields.money, fields.manpower, fields.extraordinaryMaterials];
  const hasPositiveAmount = amountFields.some((item) => item.state === "present");
  const hasNegatedAmount = amountFields.some((item) => item.state === "negated");
  const startsWithNegatedAction = ACTION_NEGATION_PREFIX.test(source.trim());
  if (fields.resourcePosture.state === "negated" || (!hasPositiveAmount && (hasNegatedAmount || startsWithNegatedAction))) {
    // An explicit refusal to spend/use resources is a conservative minimal
    // posture, but the field remains negated so it cannot be mistaken for a
    // positive authorization.
    fields.resourcePosture.state = "negated";
    fields.resourcePosture.normalizedValue = "minimal";
    const evidence = amountFields.flatMap((item) => item.evidence)[0];
    if (evidence) addEvidence(fields.resourcePosture, source, evidence.start, evidence.end, "resource.negated-implies-minimal");
  } else if (fields.resourcePosture.state === "absent" && hasPositiveAmount) {
    fields.resourcePosture.state = "present";
    fields.resourcePosture.value = "balanced";
    fields.resourcePosture.normalizedValue = "balanced";
    const evidence = amountFields.flatMap((item) => item.evidence)[0];
    if (evidence) addEvidence(fields.resourcePosture, source, evidence.start, evidence.end, "resource.amount-implies-balanced");
  }
}

function inferAuthorization(source: string, fields: IntentContract["fields"]) {
  const strictRules: MatchRule[] = [
    { id: "auth.strict.request-each", pattern: /逐项请示|遇事请示|先请示后行动|每一步(?:都)?(?:必须)?请示|任何变化.*请示/, value: "strict" },
    { id: "auth.strict.approval", pattern: /未经(?:我|议长|首领)?批准不得|没有(?:我|议长|首领)?的?批准不得|必须批准|先请示|严格按照|只允许|不得自行/, value: "strict" },
  ];
  const broadRules: MatchRule[] = [
    { id: "auth.broad.full", pattern: /全权|自行决定|无需请示|无须请示|不必请示|临机决断|便宜行事|放手去做|广泛授权/, value: "broad" },
  ];
  const strict = matchAllRules(source, strictRules, fields.authorizationScope);
  const broad = matchAllRules(source, broadRules, fields.authorizationScope);
  if (strict.positives.length && broad.positives.length) {
    fields.authorizationScope.state = "ambiguous";
    addConflict(fields.authorizationScope, "同时出现严格请示与全权授权");
  } else if (!strict.positives.length && !broad.positives.length && (strict.negatives.length || broad.negatives.length)) {
    fields.authorizationScope.state = "negated";
  }
  if (!strict.positives.length && !broad.positives.length && /(?:不得|禁止|未经批准|必须批准|逐项|每一步|严格按照|不能(?:给予|承诺|公开)|不(?:接触|支付|签署|访问|公开|泄露|触碰|改变|进入|安排|处理|调用|使用|把|消耗|带|承诺)|只(?:允许|做|谈|提交|查阅|处理|记录|更换|负责|交换|接受|讨论|陈述|维持|保留|增加|练习|用于))/.test(source)) {
    fields.authorizationScope.state = "present";
    fields.authorizationScope.value = "strict";
    fields.authorizationScope.normalizedValue = "strict";
    const match = /(?:不得|禁止|未经批准|必须批准|逐项|每一步|严格按照|不能(?:给予|承诺|公开)|不(?:接触|支付|签署|访问|公开|泄露|触碰|改变|进入|安排|处理|调用|使用|把|消耗|带|承诺)|只(?:允许|做|谈|提交|查阅|处理|记录|更换|负责|交换|接受|讨论|陈述|维持|保留|增加|练习|用于))[^，。；;,\n]{0,24}/.exec(source);
    if (match && match.index !== undefined) addEvidence(fields.authorizationScope, source, match.index, match.index + match[0].length, "auth.strict.red-line");
  }
  const redLines: string[] = [];
  const redLineField = fields.redLines;
  for (const clause of clausesOf(source)) {
    if (!NEGATION.test(clause.text) || POSITIVE_NEGATION.test(clause.text)) continue;
    redLines.push(clause.text);
    addEvidence(redLineField, source, clause.start, clause.end, "auth.red-line.clause");
  }
  if (redLines.length) {
    redLineField.state = "present";
    redLineField.value = [...new Set(redLines)];
    redLineField.normalizedValue = redLineField.value;
  }
  const retreat = /[^，。；;\n]{0,42}(?:撤退|撤离|中止|停止|求援|暂停|撤回)[^，。；;\n]{0,42}/.exec(source);
  if (retreat && retreat.index !== undefined) {
    const value = retreat[0].trim();
    fields.retreatCondition.state = "present";
    fields.retreatCondition.value = value;
    fields.retreatCondition.normalizedValue = value;
    addEvidence(fields.retreatCondition, source, retreat.index, retreat.index + retreat[0].length, "auth.retreat.condition");
  }
}

function inferRisk(source: string, fields: IntentContract["fields"]): RiskLevel {
  if (/高位|天使|真神|献祭|召唤|通灵|封印物|污染|灵体/.test(source)) return "致命";
  if (/教会总部|王室|袭击|强行|不惜代价|全部资源|全力投入|潜入|仪式|封印|追击/.test(source)) return "高";
  if (fields.kind.value === "休整" || fields.kind.value === "自由行动" && /整理|核验|复核|等待|记录/.test(source)) return "低";
  return "中";
}

export function parseIntentContract(rawText: string): IntentContract {
  // Keep the exact trimmed input as the evidence coordinate space. Normalizing
  // before matching would shift offsets/text for full-width or compatibility
  // characters and make a returned span unverifiable against rawText.
  const source = typeof rawText === "string" ? rawText.trim() : "";
  const fields: IntentContract["fields"] = {
    kind: field<IntentKind>(),
    target: field<string>(),
    resourcePosture: field<ResourcePosture>(),
    money: field<number>(),
    manpower: field<number>(),
    extraordinaryMaterials: field<number>(),
    authorizationScope: field<AuthorizationScope>(),
    redLines: field<string[]>(),
    retreatCondition: field<string>(),
  };
  const clauses = clausesOf(source);
  inferKind(source, fields.kind);
  inferTarget(source, fields.target);
  inferResource(source, fields);
  inferAuthorization(source, fields);
  const conflicts = [...new Set(Object.values(fields).flatMap((item) => item.conflicts))];
  const ambiguities: string[] = [];
  if (fields.target.state === "ambiguous") ambiguities.push("target");
  if (fields.kind.state === "ambiguous") ambiguities.push("kind");
  if (fields.authorizationScope.state === "ambiguous") ambiguities.push("authorization");
  const pronounPattern = /(?:他|她|它|那里|这里|此处|该处|这个|那个|对方)/;
  const negatedPronounIndex = clauses.find((clause) => /^(?:不要|不得|禁止|避免)/.test(clause.text) && pronounPattern.test(clause.text))?.start;
  const negatedPronoun = (negatedPronounIndex !== undefined && (fields.target.evidence.length === 0 || fields.target.evidence[0].start > negatedPronounIndex))
    || (/(?:不是不要|并非不要)/.test(source) && pronounPattern.test(source));
  if (negatedPronoun) {
    ambiguities.push("target-negated-pronoun");
    if (fields.target.state === "present") fields.target.state = "ambiguous";
    addConflict(fields.target, "否定分句包含未解析目标代词");
  }
  const highImpact = /修建|建造|扩建|改造|升级|仪式|占卜|召唤|通灵|献祭|不惜代价|全部资源|封印物|污染|高位/.test(source);
  const needsClarification = fields.target.state === "ambiguous" || (highImpact && fields.target.state !== "present") || fields.kind.state === "ambiguous" || fields.authorizationScope.state === "ambiguous" || conflicts.length > 0;
  const posture = fields.resourcePosture.normalizedValue ?? "balanced";
  return {
    schemaVersion: INTENT_CONTRACT_SCHEMA_VERSION,
    ruleVersion: INTENT_CONTRACT_RULE_VERSION,
    rawText: source,
    clauses,
    fields,
    resources: {
      posture,
      ...(fields.money.value === undefined ? {} : { money: fields.money.value }),
      ...(fields.manpower.value === undefined ? {} : { manpower: fields.manpower.value }),
      ...(fields.extraordinaryMaterials.value === undefined ? {} : { extraordinaryMaterials: fields.extraordinaryMaterials.value }),
    },
    authorization: {
      scope: fields.authorizationScope.normalizedValue ?? "bounded",
      redLines: fields.redLines.value ?? [],
      mustEscalateWhen: fields.authorizationScope.normalizedValue === "strict" ? ["改变目标、手段、执行者或资源投入前必须请示"] : [],
      ...(fields.retreatCondition.value === undefined ? {} : { retreatCondition: fields.retreatCondition.value }),
    },
    risk: inferRisk(source, fields),
    needsClarification,
    ambiguities,
    conflicts,
  };
}

/**
 * The model may propose a candidate, but this validator always recomputes the
 * authoritative contract from raw Chinese input. Candidate fields are advisory
 * only and cannot widen authorization, resources, or target references.
 */
export function validateIntentContract(rawText: string, candidate?: unknown) {
  // Keep the candidate parameter for the model-facing API, but never trust it
  // as an authority source; the raw text is always recomputed locally.
  void candidate;
  return parseIntentContract(rawText);
}
