import { LOTM_PATHWAYS } from "./generated-lore-compendium.ts";
import { PATHWAY_HIGH_GROUPS, PATHWAY_OPENING_DOSSIERS, STANDARD_PATHWAY_IDS, type StandardPathwayId } from "./pathway-catalog.ts";

export type SequenceTier = "低序列" | "中序列" | "圣者" | "天使" | "大天使" | "真神";

export type PathwaySequenceLedgerEntry = {
  id: string;
  pathwayId: StandardPathwayId;
  pathwayName: string;
  sequence: number;
  name: string;
  tier: SequenceTier;
  sefirot: string;
  aboveSequence: string;
  themes: string[];
  operationalEnvelope: string[];
  organizationEffect: string;
  actingReminder: string;
  lossOfControlRisk: string;
  loreEvidenceIds: string[];
};

export type PathwayLedgerDossier = {
  pathwayId: StandardPathwayId;
  pathwayName: string;
  sefirot: string;
  aboveSequence: string;
  representatives: string[];
  themes: string[];
  sequenceEvidenceId: string;
  sequences: PathwaySequenceLedgerEntry[];
};

type LorePathwayRecord = {
  group: string;
  above: string;
  entry: string;
  theme: string;
  representatives: string;
  sequence_9_to_0: string[];
};

function lorePathwayRecord(value: unknown): LorePathwayRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.group !== "string"
    || typeof record.above !== "string"
    || typeof record.entry !== "string"
    || typeof record.theme !== "string"
    || typeof record.representatives !== "string"
    || !Array.isArray(record.sequence_9_to_0)
    || record.sequence_9_to_0.length !== 10
    || !record.sequence_9_to_0.every((item) => typeof item === "string")
  ) return undefined;
  return record as unknown as LorePathwayRecord;
}

function tierFor(sequence: number): SequenceTier {
  if (sequence >= 8) return "低序列";
  if (sequence >= 5) return "中序列";
  if (sequence >= 3) return "圣者";
  if (sequence === 2) return "天使";
  if (sequence === 1) return "大天使";
  return "真神";
}

function organizationEffect(sequence: number, themes: string[]) {
  const domain = themes.slice(0, 3).join("、");
  if (sequence >= 8) return `作为基层非凡专员，为一个部门提供${domain}方向的稳定增益。`;
  if (sequence >= 5) return `可独立带领小队并负责${domain}相关的区域任务，但仍需明确撤退与复核。`;
  if (sequence >= 3) return `可成为跨部门支点，改变一座城市内${domain}相关行动的成本、风险与控制力。`;
  if (sequence === 2) return `可统筹跨城战线并投射${domain}层面的天使影响；任何出手都会引发高位回应。`;
  if (sequence === 1) return `可成为国家级或教会级组织核心，以${domain}权柄重塑长期战略，同时显著提高聚合与敌意。`;
  return `成为该途径权柄顶点，能够建立神国与回应祈祷；组织经营转为锚、教义、全球阵营与神战治理。`;
}

function operationalEnvelope(name: string, sequence: number, themes: string[]) {
  const domain = themes.length ? themes : ["该途径核心象征"];
  const scale = sequence >= 8 ? "个人与小队" : sequence >= 5 ? "小队与据点" : sequence >= 3 ? "区域与城市" : sequence === 2 ? "跨城与国家" : sequence === 1 ? "国家与神国边界" : "全球、星界与神国";
  const abstraction = sequence >= 5 ? "以技能、体魄、仪式或特殊形态发挥作用" : sequence >= 3 ? "开始把能力提升为领域、象征与规则影响" : "以权柄和象征干涉现实，但不能抹除已经结算的世界事实";
  return [
    `${name}的能力边界限定在${domain.slice(0, 3).join("、")}等知识库确认主题。`,
    `默认作用尺度：${scale}；${abstraction}。`,
    "具体配方、仪式、克制关系与单项能力只有在对应知识记录进入角色权限后才可使用。",
  ];
}

function lossRisk(sequence: number, themes: string[]) {
  const focus = themes.slice(-2).join("、") || "该途径象征";
  if (sequence >= 8) return `把职业表象误当成真实自我，会让${focus}倾向侵蚀判断。`;
  if (sequence >= 5) return `能力形态与人格开始互相塑造；连续越界使用${focus}相关力量会提高失控和暴露。`;
  if (sequence >= 3) return `神性、残留意志与聚合定律开始成为主要风险，必须维持关系、身份和日常锚点。`;
  return `每次权柄级行动都会增加聚合、敌对高位注视与锚点反向塑造，错误容纳顺序可能导致旧日意志复苏。`;
}

function buildDossiers(): Record<StandardPathwayId, PathwayLedgerDossier> {
  const dossiers = {} as Record<StandardPathwayId, PathwayLedgerDossier>;
  STANDARD_PATHWAY_IDS.forEach((pathwayId, index) => {
    const opening = PATHWAY_OPENING_DOSSIERS[pathwayId];
    const highGroup = PATHWAY_HIGH_GROUPS[pathwayId];
    const lore = lorePathwayRecord(LOTM_PATHWAYS[index]);
    const pathwayName = lore?.entry ?? opening.name;
    const sefirot = lore?.group ?? highGroup.sefirot;
    const aboveSequence = lore?.above ?? highGroup.aboveSequence;
    const sequenceNames = lore?.sequence_9_to_0 ?? [...opening.sequences];
    const themeText = lore?.theme ?? `${opening.managementContribution}、${opening.personalStyle}`;
    const themes = themeText.split(/[、，。；]/).map((item: string) => item.trim()).filter(Boolean);
    const evidenceId = `lotm-04-${String(index + 2).padStart(3, "0")}`;
    const sequences = sequenceNames.map((name: string, offset: number) => {
      const sequence = 9 - offset;
      return {
        id: `${pathwayId}:sequence:${sequence}`,
        pathwayId,
        pathwayName,
        sequence,
        name,
        tier: tierFor(sequence),
        sefirot,
        aboveSequence,
        themes,
        operationalEnvelope: operationalEnvelope(name, sequence, themes),
        organizationEffect: organizationEffect(sequence, themes),
        actingReminder: `理解“${name}”的象征并形成可复核守则；始终记住自己只是在扮演。`,
        lossOfControlRisk: lossRisk(sequence, themes),
        loreEvidenceIds: [evidenceId, "lotm-03-001", "lotm-03-006", "lotm-03-007"],
      } satisfies PathwaySequenceLedgerEntry;
    });
    dossiers[pathwayId] = {
      pathwayId,
      pathwayName,
      sefirot,
      aboveSequence,
      representatives: lore?.representatives.split(/[、，]/).map((item: string) => item.trim()).filter(Boolean) ?? [],
      themes,
      sequenceEvidenceId: evidenceId,
      sequences,
    };
  });
  return dossiers;
}

export const PATHWAY_SEQUENCE_LEDGER = buildDossiers();

export function sequenceLedgerFor(pathwayId: StandardPathwayId, sequence: number) {
  return PATHWAY_SEQUENCE_LEDGER[pathwayId].sequences.find((entry) => entry.sequence === sequence);
}

export function validatePathwaySequenceLedger() {
  const issues: string[] = [];
  for (const pathwayId of STANDARD_PATHWAY_IDS) {
    const dossier = PATHWAY_SEQUENCE_LEDGER[pathwayId];
    if (!dossier || dossier.sequences.length !== 10) issues.push(`${pathwayId}: sequence-count`);
    for (let sequence = 9; sequence >= 0; sequence -= 1) {
      const entry = dossier?.sequences.find((item) => item.sequence === sequence);
      if (!entry) issues.push(`${pathwayId}:${sequence}: missing`);
      else if (!entry.name || entry.operationalEnvelope.length < 3 || !entry.loreEvidenceIds.length) issues.push(`${pathwayId}:${sequence}: incomplete`);
    }
  }
  return { ok: issues.length === 0, issues, pathwayCount: STANDARD_PATHWAY_IDS.length, sequenceCount: STANDARD_PATHWAY_IDS.length * 10 };
}
