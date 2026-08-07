// 反无聊审计与系统完整性检查。
import { RECENT_TEMPLATE_LIMIT, SEVERITY4_COOLDOWN_WEEKS, PENDING_DELAYED_LIMIT } from "./config.ts";
import type { FateAberrationTemplate, FateTwistEffectKind } from "./types.ts";

const VALID_ABSURD_KINDS: FateTwistEffectKind[] = [
  "misplaced-target",
  "misplaced-identity",
  "misplaced-audience",
  "misplaced-time",
  "misplaced-location",
  "authority-misplacement",
  "new-debt",
  "long-term-belief",
  "organization-relation",
  "new-plan",
  "worldline-shift",
  "absurd-opportunity",
  "mystic-signature",
  "misplaced-item",
  "misinterpreted-answer",
  "resource-phenomenon",
];

export function auditFateTemplates(templates: FateAberrationTemplate[]): string[] {
  const findings: string[] = [];
  const ids = new Set<string>();
  const severityCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const twistCounts: Record<string, number> = {};
  const familyCoverage = new Set<string>();
  for (const template of templates) {
    if (ids.has(template.id)) findings.push(`duplicate-template:${template.id}`);
    ids.add(template.id);
    if (template.absurdityScore < 3) findings.push(`low-absurdity:${template.id}`);
    if (template.longTermConsequenceScore < 2) findings.push(`low-long-term:${template.id}`);
    if (template.recoverabilityScore < 2) findings.push(`low-recoverability:${template.id}`);
    if (!template.recoveryHooks.length) findings.push(`missing-recovery-hook:${template.id}`);
    if (!template.worldEventProposals.length) findings.push(`missing-world-event:${template.id}`);
    if (!template.immediateEffects.length) findings.push(`missing-immediate-effects:${template.id}`);
    if (!template.immediateEffects.some((item) => VALID_ABSURD_KINDS.includes(item.kind))) {
      findings.push(`fake-absurdity:${template.id}`);
    }
    if (template.severity === 4 && !template.prerequisites.length) findings.push(`severity4-without-prerequisites:${template.id}`);
    template.families.forEach((family) => familyCoverage.add(family));
    severityCounts[template.severity] = (severityCounts[template.severity] ?? 0) + 1;
    twistCounts[template.twist] = (twistCounts[template.twist] ?? 0) + 1;
  }
  if (templates.length < 36) findings.push(`fewer-than-36:${templates.length}`);
  if (severityCounts[1] < 10) findings.push(`severity1-under-10:${severityCounts[1]}`);
  if (severityCounts[2] < 12) findings.push(`severity2-under-12:${severityCounts[2]}`);
  if (severityCounts[3] < 10) findings.push(`severity3-under-10:${severityCounts[3]}`);
  if (severityCounts[4] < 4) findings.push(`severity4-under-4:${severityCounts[4]}`);
  for (const twist of ["pure", "cursed-boon", "fortunate-disaster", "full-disaster"]) {
    if ((twistCounts[twist] ?? 0) < 9) findings.push(`${twist}-under-9:${twistCounts[twist] ?? 0}`);
  }
  const requiredFamilies = ["perception", "divination", "concealment", "mental", "mobility", "control", "protection", "ritual"];
  for (const family of requiredFamilies) {
    if (!familyCoverage.has(family)) findings.push(`missing-family:${family}`);
  }
  return findings;
}

export function fateBoundsAudit(): string[] {
  const findings: string[] = [];
  if (RECENT_TEMPLATE_LIMIT < 1) findings.push("recent-template-limit-invalid");
  if (SEVERITY4_COOLDOWN_WEEKS < 20) findings.push("severity4-cooldown-too-short");
  if (PENDING_DELAYED_LIMIT < 1) findings.push("pending-delayed-limit-invalid");
  return findings;
}
