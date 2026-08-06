// 查询分析：标准化、别名展开、实体识别、意图与时间范围识别。
import { ERA_KEYWORDS, VOLUME_KEYWORDS } from "./alias-data";
import type { AliasIndex } from "./alias-index";
import type { DetectedEntity } from "./types";

export type AnalyzedQuery = {
  original: string;
  normalized: string;
  expanded: string;
  terms: string[];
  entities: DetectedEntity[];
  volume?: number;
  era?: string;
  year?: string;
};

export type QueryIntent =
  | "identity"
  | "experience"
  | "relationship"
  | "pathway"
  | "organization"
  | "location"
  | "artifact"
  | "timeline"
  | "world-truth"
  | "general";

const INTENT_RULES: { intent: QueryIntent; patterns: RegExp[] }[] = [
  { intent: "identity", patterns: [/身份|真名|别名|化身|马甲|是谁|周明瑞|格尔曼|夏洛克|道恩|梅林|愚者先生/i] },
  { intent: "experience", patterns: [/经历|生平|过往|故事|做过什么|遭遇/i] },
  { intent: "relationship", patterns: [/关系|认识|朋友|恋人|老师|学生|导师|成员|结盟/i] },
  { intent: "pathway", patterns: [/途径|序列|魔药|晋升|扮演|能力|非凡者|仪式/i] },
  { intent: "organization", patterns: [/组织|教会|协会|家族|机构|塔罗会|值夜者|学派/i] },
  { intent: "location", patterns: [/地点|城市|首都|位于|在哪里|地区|王国|大陆/i] },
  { intent: "artifact", patterns: [/封印物|物品|道具|编号|0-0|2-0|日记/i] },
  { intent: "timeline", patterns: [/时间线|历史|纪年|哪一年|第[一二三四五]部|第四纪|第五纪/i] },
  { intent: "world-truth", patterns: [/真相|幕后|宇宙|源质|真值|世界真值/i] },
];

const ENTITY_INTENTS: QueryIntent[] = [
  "identity",
  "relationship",
  "organization",
  "location",
  "artifact",
  "pathway",
];

export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = normalized.split(/\s+/).filter((item) => item.length > 1);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams: string[] = [];
  for (let i = 0; i < chinese.length - 1; i += 1) {
    bigrams.push(`${chinese[i]}${chinese[i + 1]}`);
  }
  return [...new Set([...words, ...bigrams])];
}

export function expandAliases(query: string, index: AliasIndex): string {
  const pieces: string[] = [];
  const relatedTerms: string[] = [];
  const englishTerms: string[] = [];
  let rest = query;
  while (rest.length) {
    let matched = false;
    for (let length = Math.min(rest.length, 12); length >= 2; length -= 1) {
      const slice = rest.slice(0, length);
      const entry = index.byAlias.get(slice.toLowerCase());
      if (entry) {
        pieces.push(entry.canonical);
        // 相关实体只用于召回辅助，最多收 4 个，避免压过查询本身。
        for (const related of entry.related) {
          if (relatedTerms.length >= 4) break;
          relatedTerms.push(related);
        }
        for (const english of entry.englishNames ?? []) {
          if (englishTerms.length >= 4) break;
          englishTerms.push(english);
        }
        rest = rest.slice(length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      pieces.push(rest[0]);
      rest = rest.slice(1);
    }
  }
  const conceptTerms: string[] = [];
  for (const term of tokenize(normalizeQuery(query))) {
    const translation = CONCEPT_TRANSLATIONS[term];
    if (translation && !conceptTerms.includes(translation)) {
      conceptTerms.push(translation);
    }
  }
  return [...pieces, ...relatedTerms, ...englishTerms, ...conceptTerms.slice(0, 8)].join(" ");
}

const CONCEPT_TRANSLATIONS: Record<string, string> = {
  占卜: "divination",
  占卜家: "Seer",
  魔药: "potion",
  扮演: "acting",
  晋升: "advancement",
  仪式: "ritual",
  教会: "church",
  组织: "organization",
  首都: "capital",
  王国: "kingdom",
  序列: "sequence",
  能力: "ability",
  身份: "identity",
  真实身份: "true identity",
  塔罗: "tarot",
  灰雾: "gray fog",
  源堡: "Sefirah Castle",
  封印物: "sealed artifact",
  失控: "corruption",
  尊名: "honorific name",
  灵性: "spirituality",
  学徒: "Apprentice",
  魔术师: "Magician",
  读心者: "Reader",
  催眠师: "Hypnotist",
  无面人: "Faceless",
  小丑: "Clown",
  黑夜: "Evernight",
  风暴: "Storm",
  蒸汽: "Steam",
  月亮: "Moon",
  正义: "Justice",
  愚者: "Fool",
  世界: "World",
  贝克兰德: "Backlund",
  廷根: "Tingen",
  鲁恩: "Loen",
  东区: "East Borough",
  码头: "Dock",
  值夜者: "Nighthawks",
  塔罗会: "Tarot Club",
  日记: "diary",
  罗塞尔: "Roselle",
  阿蒙: "Amon",
  克莱恩: "Klein",
  奥黛丽: "Audrey",
  阿尔杰: "Alger",
  伦纳德: "Leonard",
  埃姆林: "Emlyn",
  休: "Xio",
  帕列斯: "Pallez",
  第四纪: "Fourth Epoch",
  第五纪: "Fifth Epoch",
  序列9: "Sequence 9",
  序列8: "Sequence 8",
  序列7: "Sequence 7",
  序列6: "Sequence 6",
  序列5: "Sequence 5",
  序列4: "Sequence 4",
  序列3: "Sequence 3",
  序列2: "Sequence 2",
  序列1: "Sequence 1",
  序列0: "Sequence 0",
};

export function detectEntities(query: string, index: AliasIndex): DetectedEntity[] {
  const found = new Map<string, DetectedEntity>();
  let rest = query;
  while (rest.length) {
    let matched = false;
    for (let length = Math.min(rest.length, 12); length >= 2; length -= 1) {
      const slice = rest.slice(0, length);
      const entry = index.byAlias.get(slice.toLowerCase());
      if (entry && !found.has(entry.canonical.toLowerCase())) {
        found.set(entry.canonical.toLowerCase(), {
          type: entry.type,
          name: slice,
          canonical: entry.canonical,
        });
        rest = rest.slice(length);
        matched = true;
        break;
      }
    }
    if (!matched) rest = rest.slice(1);
  }
  return [...found.values()];
}

export function detectIntent(query: string, entities: DetectedEntity[]): {
  volume?: number;
  era?: string;
} {
  const result: { volume?: number; era?: string } = {};
  for (const rule of VOLUME_KEYWORDS) {
    if (rule.pattern.test(query)) {
      result.volume = rule.volume;
      break;
    }
  }
  for (const rule of ERA_KEYWORDS) {
    if (rule.pattern.test(query)) {
      result.era = rule.era;
      break;
    }
  }
  for (const entity of entities) {
    if (entity.type === "era" && !result.era) result.era = entity.canonical;
  }
  return result;
}

export function analyzeQuery(query: string, index: AliasIndex): AnalyzedQuery {
  const normalized = normalizeQuery(query);
  const yearMatch = normalized.match(/\b(1[3-5]\d{2})\b/);
  const entities = detectEntities(normalized, index);
  const expanded = expandAliases(normalized, index);
  const intent = detectIntent(`${normalized} ${expanded}`, entities);
  return {
    original: query,
    normalized,
    expanded,
    terms: tokenize(`${normalized} ${expanded}`),
    entities,
    ...intent,
    year: yearMatch?.[1],
  };
}

export function detectQueryIntent(query: string): QueryIntent {
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(query))) {
      return rule.intent;
    }
  }
  return "general";
}

export function isEntityIntent(intent: QueryIntent): boolean {
  return ENTITY_INTENTS.includes(intent);
}
