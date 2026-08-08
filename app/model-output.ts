export function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的JSON");
  const candidate = fenced.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch (error) {
    // Models occasionally emit literal newlines or tabs inside JSON strings.
    // Escaping only control characters while a string is open keeps the
    // structure intact without retrying an otherwise valid model response.
    let repaired = "";
    let inString = false;
    let escaped = false;
    for (const character of candidate) {
      if (escaped) { repaired += character; escaped = false; continue; }
      if (character === "\\" && inString) { repaired += character; escaped = true; continue; }
      if (character === '"') { repaired += character; inString = !inString; continue; }
      if (inString && character.charCodeAt(0) < 32) {
        repaired += character === "\n" ? "\\n" : character === "\r" ? "\\r" : character === "\t" ? "\\t" : " ";
        continue;
      }
      repaired += character;
    }
    try { return JSON.parse(repaired) as Record<string, unknown>; }
    catch { throw error; }
  }
}

export function textSimilarity(left: string, right: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[\d\s\p{P}\p{S}]/gu, "");
  const grams = (value: string) => {
    const clean = normalize(value);
    const output = new Set<string>();
    for (let index = 0; index <= clean.length - 3; index += 1) output.add(clean.slice(index, index + 3));
    return output;
  };
  const a = grams(left);
  const b = grams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}
