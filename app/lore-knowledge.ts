export type LoreVisibility = "public" | "restricted" | "secret" | "cosmic";
export type LoreAudienceKind = "world" | "player" | "actor";

export type LoreRecord = {
  id: string;
  title: string;
  content: string;
  visibility: LoreVisibility;
  topics: string[];
  sourceIds?: string[];
  sourceGrade?: "A" | "B" | "C" | "D";
  canon?: "canon" | "derived" | "game-original" | "disputed";
};

export type LoreAudience = {
  kind: LoreAudienceKind;
  knownLoreIds: string[];
  topicGrants: string[];
};

export function filterLoreForAudience(records: LoreRecord[], audience: LoreAudience) {
  if (audience.kind === "world") return records;
  const known = new Set(audience.knownLoreIds);
  const topics = new Set(audience.topicGrants);
  return records.filter((record) => {
    if (record.visibility === "public") return true;
    if (known.has(record.id)) return true;
    return record.visibility === "restricted" && record.topics.some((topic) => topics.has(topic));
  });
}

function searchTokens(value: string) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = normalized.split(/\s+/).filter((item) => item.length > 1);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams = chinese.slice(0, -1).map((char, index) => `${char}${chinese[index + 1]}`);
  return [...new Set([...words, ...bigrams])];
}

function loreScore(record: LoreRecord, query: string) {
  const tokens = searchTokens(query);
  const title = record.title.toLowerCase();
  const content = record.content.toLowerCase();
  const topics = record.topics.join(" ").toLowerCase();
  return tokens.reduce((score, token) => score + (title.includes(token) ? 8 : 0) + (topics.includes(token) ? 4 : 0) + (content.includes(token) ? 1 : 0), 0);
}

export function retrieveLoreContext(records: LoreRecord[], request: {
  query: string;
  audience: LoreAudience;
  limit?: number;
  maxChars?: number;
}) {
  const limit = Math.max(1, Math.min(24, request.limit ?? 8));
  const maxChars = Math.max(120, Math.min(24_000, request.maxChars ?? 6_000));
  const visible = filterLoreForAudience(records, request.audience)
    .map((record) => ({ record, score: loreScore(record, request.query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id))
    .slice(0, limit)
    .map((item) => item.record);
  const selected: LoreRecord[] = [];
  const lines: string[] = [];
  let used = 0;
  for (const record of visible) {
    const citation = record.sourceIds?.length ? `${record.sourceIds.join("/")}·${record.sourceGrade ?? "?"}` : `资料库·${record.sourceGrade ?? "?"}`;
    const line = `[${citation}] ${record.title}：${record.content.trim()}`;
    if (used + line.length > maxChars && lines.length) break;
    selected.push(record);
    lines.push(line.slice(0, Math.max(0, maxChars - used)));
    used += line.length + 1;
  }
  return { records: selected, context: lines.join("\n") };
}
