// 结构化上下文包：证据、冲突、未知项与预算，而不是简单拼接 Top-K。
import type {
  ContextPackage,
  EvidenceItem,
  LoreChunk,
  RagQuery,
  RagResult,
} from "./types";

function conflictGroups(chunks: LoreChunk[]): ContextPackage["conflicts"] {
  const bySubject = new Map<string, { claims: string[]; layers: string[] }>();
  for (const chunk of chunks) {
    for (const relation of chunk.relations ?? []) {
      const subject = relation.subject;
      const existing = bySubject.get(subject) ?? { claims: [], layers: [] };
      existing.claims.push(relation.object);
      existing.layers.push(relation.layer ?? chunk.canonLayer);
      bySubject.set(subject, existing);
    }
    for (const entity of chunk.entities ?? []) {
      const existing = bySubject.get(entity.name) ?? { claims: [], layers: [] };
      existing.layers.push(chunk.canonLayer);
      bySubject.set(entity.name, existing);
    }
  }
  const conflicts: ContextPackage["conflicts"] = [];
  for (const [subject, group] of bySubject) {
    const uniqueLayers = [...new Set(group.layers)];
    if (uniqueLayers.length > 1) {
      conflicts.push({
        subject,
        claims: [...new Set(group.claims)].slice(0, 4),
        layers: uniqueLayers as ContextPackage["conflicts"][number]["layers"],
      });
    }
  }
  return conflicts.slice(0, 6);
}

export function buildContextPackage(
  result: RagResult,
  query: RagQuery
): ContextPackage {
  const evidence: EvidenceItem[] = result.chunks.map((chunk) => ({
    id: chunk.id,
    source: chunk.sourceId,
    grade: chunk.sourceGrade,
    layer: chunk.canonLayer,
    text: chunk.content.trim(),
    locator: `${chunk.sourcePath}${chunk.sourceLocator ? `#${chunk.sourceLocator}` : ""}`,
  }));
  const insufficient = result.chunks.length === 0;
  const horizon = query.filters?.horizon;
  const purpose =
    query.filters?.audience?.kind === "world"
      ? "world-simulation"
      : query.filters?.audience?.kind === "actor"
        ? "character-knowledge"
        : "player-knowledge";
  return {
    purpose,
    role: query.filters?.audience?.kind,
    authorizedFacts: [],
    evidence,
    conflicts: conflictGroups(result.chunks),
    unknowns: insufficient
      ? ["检索资料不足，无法确认该主题的可靠事实。"]
      : [],
    forbiddenInference: [
      "不得把资料不足的内容补写成确定事实",
      "不得把 fan-derived/community/disputed 内容当作原著真值",
      "不得把未来事件或未授权秘密写入当前角色认知",
      ...(horizon?.worldlineMode === "canon-diverged" || horizon?.worldlineMode === "post-canon"
        ? [
            "当前世界线已偏离原著：原著后续事件仅为历史背景或可能趋势，不得作为必然未来；当前游戏事实优先。",
          ]
        : []),
    ],
    budget: {
      used: result.trace.contextSize,
      max: query.maxChars ?? 6000,
    },
    insufficient,
  };
}

// 由最终授权记录重新生成上下文：保证 records 与 context 严格一致。
export function buildEvidenceContext(
  records: { sourceId: string; sourceGrade: string; canonLayer: string; title: string; content: string }[],
  maxChars = 12_000
): string {
  const lines: string[] = [];
  let used = 0;
  for (const record of records) {
    const citation = record.sourceId?.length
      ? `${record.sourceId}·${record.sourceGrade ?? "?"}`
      : `资料库·${record.sourceGrade ?? "?"}`;
    const line = `[${citation}] ${record.title}：${record.content.trim()}`;
    if (used + line.length > maxChars && lines.length) break;
    lines.push(line.slice(0, Math.max(0, maxChars - used)));
    used += line.length + 1;
  }
  return lines.join("\n");
}

export function renderContextPackage(
  pkg: ContextPackage,
  roleLabel?: string
): string {
  const lines: string[] = [];
  lines.push(`检索目的：${pkg.purpose}`);
  if (roleLabel) lines.push(`当前角色：${roleLabel}`);
  if (pkg.authorizedFacts.length) {
    lines.push("已授权事实：" + pkg.authorizedFacts.join("；"));
  }
  if (pkg.evidence.length) {
    lines.push(
      "证据切片：" +
        pkg.evidence
          .map(
            (item) =>
              `[${item.source}·${item.grade}·${item.layer}] ${item.text.slice(0, 220)}`
          )
          .join("\n")
    );
  } else {
    lines.push("证据切片：（无）");
  }
  if (pkg.conflicts.length) {
    lines.push(
      "冲突资料：" +
        pkg.conflicts
          .map(
            (item) =>
              `${item.subject}（${item.layers.join("/")}）：${item.claims.join("；")}`
          )
          .join("\n")
    );
  }
  if (pkg.unknowns.length) {
    lines.push("不确定项：" + pkg.unknowns.join("；"));
  }
  lines.push("禁止推断项：" + pkg.forbiddenInference.join("；"));
  lines.push(`预算：${pkg.budget.used}/${pkg.budget.max} 字符`);
  return lines.join("\n");
}
