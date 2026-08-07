// 代表能力注册表：从项目已冻结的 pathway-abilities 目录映射为规则定义。
import type { Ability } from "../game-model.ts";
import { PATHWAY_ABILITIES } from "../pathway-abilities.ts";
import { FAMILY_BASE_POWER, internalRank } from "./config.ts";
import type { AbilityDefinition, AbilityFamily } from "./types.ts";

const MODE_FAMILY: Record<string, AbilityFamily> = {
  感知: "perception",
  影响: "mental",
  移动: "mobility",
  防护: "protection",
  战斗: "physical",
  仪式: "ritual",
  制作: "creation",
  伪装: "concealment",
};

const PRIMITIVE_BY_TAG: Record<string, string> = {
  reveal: "REVEAL",
  occult: "INFER",
  covert: "CONCEAL",
  social: "INFLUENCE",
  force: "DAMAGE",
  access: "MOVE",
  defense: "PROTECT",
  track: "TRACE",
  reality: "TRANSFORM",
};

const SELECTED_IDS = [
  "spirit-vision",
  "divination",
  "danger-sense",
  "flame-jump",
  "damage-transfer",
  "paper-substitute",
  "faceless-shape",
  "spirit-thread-sight",
  "marionette-touch",
  "empathy-probe",
  "surface-thought",
  "deep-hypnosis",
  "dream-entry",
  "short-teleport",
  "spirit-travel",
  "prediction-resistance",
  "track",
  "fire-shaping",
  "reaping-strike",
  "identify",
  "ritual-design",
];

// 高风险能力的显式反噬/污染风险（游戏化参数，来源已冻结的游戏设计）
const RISK_OVERRIDES: Record<string, { type: "backlash" | "corruption" | "exposure"; severity: number }[]> = {
  "marionette-touch": [
    { type: "backlash", severity: 3 },
    { type: "corruption", severity: 2 },
  ],
  "deep-hypnosis": [
    { type: "backlash", severity: 3 },
    { type: "corruption", severity: 1 },
  ],
  "spirit-travel": [{ type: "backlash", severity: 3 }],
  "damage-transfer": [{ type: "backlash", severity: 2 }],
  "divination": [{ type: "corruption", severity: 1 }],
  "fire-shaping": [{ type: "backlash", severity: 2 }],
  "reaping-strike": [{ type: "backlash", severity: 3 }],
};

export function abilityDefinitions(): AbilityDefinition[] {
  const byId = new Map<string, Ability>();
  for (const list of Object.values(PATHWAY_ABILITIES)) {
    for (const ability of list) byId.set(ability.id, ability);
  }
  const definitions: AbilityDefinition[] = [];
  for (const id of SELECTED_IDS) {
    const ability = byId.get(id);
    if (!ability) continue;
    const family = MODE_FAMILY[ability.mode ?? "感知"] ?? "perception";
    const primitives = (ability.ruleTags ?? []).map((tag) => PRIMITIVE_BY_TAG[tag]).filter(Boolean);
    const effects = (primitives.length ? primitives : ["REVEAL"]).map((primitive, index) => ({
      primitive: primitive as AbilityDefinition["effects"][number]["primitive"],
      power: Math.max(2, FAMILY_BASE_POWER[family] - index * 2),
      durationWeeks: ability.duration === "持续被动" ? undefined : 1,
    }));
    definitions.push({
      id: ability.id,
      name: ability.name,
      pathwayId: (Object.entries(PATHWAY_ABILITIES).find(([, list]) => list.includes(ability))?.[0] ?? "seer") as string,
      sequence: ability.unlockRank ?? 9,
      internalRank: internalRank(ability.unlockRank ?? 9),
      family,
      tags: [...(ability.ruleTags ?? []), ability.mode ?? "perception"],
      activation: {
        action: ability.passive ? "maintained" : "instant",
        duration: ability.duration,
        concentrationCost: ability.passive ? 0 : 1,
      },
      requirements: (ability.requirements ?? []).map((detail) => ({ kind: "requirement", detail })),
      targeting: {
        types: ["character", "location", "object", "self", "scene", "organization"],
        minTargets: 1,
        maxTargets: ability.mode === "感知" ? 3 : 1,
        range: ability.scope,
        requiresMedium: /媒介|纸人|火焰|锚点/.test(ability.description),
        requiresMaterial: /材料|纸牌|薄片|武器/.test(ability.description),
        requiresKnowledge: /真名|身份信息|已观察|已有秘偶|已有有效记录/.test(ability.description),
        requiresPreparation: /准备|预设|记录槽/.test(ability.description),
      },
      effects,
      costs: [
        { kind: "activation", resource: "spirituality", amount: Math.max(0, ability.cost) },
        { kind: "attempt", resource: "spirituality", amount: 1 },
      ],
      risks: [
        { type: "exposure", severity: /暴露|痕迹|注视|反制/.test(ability.risk) ? 3 : 1 },
        { type: "backlash", severity: /反噬|反冲|侵蚀|失控/.test(ability.risk) ? 3 : 0 },
        { type: "corruption", severity: /污染|失控|人格偏移/.test(ability.risk) ? 3 : 0 },
        ...(RISK_OVERRIDES[id] ?? []),
      ],
      counters: [
        {
          id: `counter-${ability.id}-resistance`,
          trigger: "target has relevant resistance",
          priority: 10,
          actor: "target",
          affects: effects.map((effect) => effect.primitive),
          automatic: true,
        },
      ],
      canonConstraints: [
        ...(ability.constraints ?? []).map((constraint) => ({
          constraint,
          source: "game-original:pathway-abilities",
        })),
        {
          constraint: "效果只覆盖能力定义范围内的可观察结果，不越权生成未知事实",
          source: "game-original:pathway-abilities",
        },
      ],
      gameParameters: {
        basePower: FAMILY_BASE_POWER[family],
        mediumRequired: /媒介|纸人|火焰|锚点/.test(ability.description),
        materialRequired: /材料|纸牌|薄片|武器/.test(ability.description),
        knowledgeRequired: /真名|身份信息|已观察|已有秘偶|已有有效记录/.test(ability.description),
        preparationRequired: /准备|预设|记录槽/.test(ability.description),
        concentrationCost: ability.passive ? 0 : 1,
        note: "数值为游戏化结算参数，非原著数值",
      },
      sourceIds: ["game-original:pathway-abilities"],
    });
  }
  return definitions;
}

export function abilityDefinitionById(id: string): AbilityDefinition | undefined {
  return abilityDefinitions().find((definition) => definition.id === id);
}

export function abilityDefinitionsForPathway(pathwayId: string, sequence: number): AbilityDefinition[] {
  return abilityDefinitions().filter(
    (definition) => definition.pathwayId === pathwayId && definition.sequence >= sequence
  );
}
