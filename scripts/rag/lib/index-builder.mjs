// 索引构建（与 app/rag/lexical-retriever.ts 的算法保持一致）。
export function tokenizeTerms(value) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = normalized.split(/\s+/).filter((item) => item.length > 1);
  const han = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams = [];
  for (let i = 0; i < han.length - 1; i += 1) {
    bigrams.push(`${han[i]}${han[i + 1]}`);
  }
  return [...new Set([...words, ...bigrams])];
}

export function buildInverted(chunks) {
  const inverted = {};
  const fields = (chunk) => [
    tokenizeTerms(chunk.content),
    tokenizeTerms(chunk.title),
    tokenizeTerms((chunk.aliases ?? []).join(" ")),
    tokenizeTerms((chunk.entities ?? []).map((e) => `${e.name} ${(e.aliases ?? []).join(" ")}`).join(" ")),
    tokenizeTerms((chunk.topics ?? []).join(" ")),
  ];
  chunks.forEach((chunk, chunkIndex) => {
    const fieldTerms = fields(chunk);
    const all = new Map();
    const add = (term, fieldIndex) => {
      if (!term) return;
      const entry = all.get(term) ?? { tf: 0, fields: 0 };
      entry.tf += 1;
      entry.fields |= 1 << fieldIndex;
      all.set(term, entry);
    };
    for (let f = 0; f < fieldTerms.length; f += 1) {
      for (const term of fieldTerms[f]) add(term, f);
    }
    for (const term of tokenizeTerms(chunk.content)) {
      const entry = all.get(term) ?? { tf: 0, fields: 0 };
      entry.tf += 1;
      entry.fields |= 1;
      all.set(term, entry);
    }
    for (const [term, value] of all) {
      const entry = inverted[term] ?? { df: 0, p: [] };
      entry.df += 1;
      entry.p.push({ chunkIndex, tf: value.tf, fields: value.fields });
      inverted[term] = entry;
    }
  });
  return inverted;
}

export function buildAliasMap(chunks) {
  const aliasMap = {};
  for (const chunk of chunks) {
    for (const alias of chunk.aliases ?? []) {
      if (!aliasMap[alias.toLowerCase()]) {
        aliasMap[alias.toLowerCase()] = { canonical: chunk.title, type: "concept" };
      }
    }
    for (const entity of chunk.entities ?? []) {
      if (!aliasMap[entity.name.toLowerCase()]) {
        aliasMap[entity.name.toLowerCase()] = {
          canonical: entity.name,
          type: entity.type,
        };
      }
      for (const alias of entity.aliases ?? []) {
        if (!aliasMap[alias.toLowerCase()]) {
          aliasMap[alias.toLowerCase()] = { canonical: entity.name, type: entity.type };
        }
      }
    }
  }
  return aliasMap;
}
