// JSON / JSONL 解析：数组或对象的每个条目独立成文档，保留结构化字段。
function recordToDoc(record, index, file, baseMeta) {
  const title =
    record?.title ?? record?.name ?? record?.id ?? `${file}#${index + 1}`;
  const content =
    typeof record === "string"
      ? record
      : JSON.stringify(record, null, 2);
  return {
    ...baseMeta,
    path: file,
    title: String(title),
    type: baseMeta.type ?? "structured",
    content,
    ...(record && typeof record === "object"
      ? {
          visibility: record.visibility,
          spoilerScope: record.spoilerScope,
          timeline: record.timeline,
          topics: record.topics,
          aliases: record.aliases,
          entities: record.entities,
          relations: record.relations,
          canonLayer: record.canonLayer,
          sourceGrade: record.sourceGrade,
          language: record.language,
        }
      : {}),
    record: typeof record === "object" && record ? record : undefined,
  };
}

export function parseJson(content, file, baseMeta) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data : [data];
  return items
    .map((record, index) => recordToDoc(record, index, file, baseMeta))
    .filter((doc) => doc.content.trim().length > 0);
}

export function parseJsonl(content, file, baseMeta) {
  const docs = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  lines.forEach((line, index) => {
    try {
      const record = JSON.parse(line);
      const doc = recordToDoc(record, index, file, baseMeta);
      if (doc.content.trim().length) docs.push(doc);
    } catch {
      // 跳过无法解析的行
    }
  });
  return docs;
}
