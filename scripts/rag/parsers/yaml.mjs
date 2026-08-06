import { load } from "js-yaml";

export function parseYaml(content, file, baseMeta) {
  let data;
  try {
    data = load(content);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data : data && typeof data === "object" ? Object.entries(data).map(([title, value]) => ({ title, value })) : [];
  return items
    .map((record, index) => {
      const title = record?.title ?? record?.name ?? `${file}#${index + 1}`;
      const content =
        typeof record === "string"
          ? record
          : typeof record?.value === "string"
            ? record.value
            : JSON.stringify(record?.value ?? record, null, 2);
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
            }
          : {}),
      };
    })
    .filter((doc) => doc.content.trim().length > 0);
}
