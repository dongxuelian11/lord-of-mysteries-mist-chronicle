// ASS 字幕解析：提取 Dialogue 行的正文，保留事件序号作为定位符。
export function parseAss(content, file, baseMeta) {
  const lines = [];
  let eventIndex = 0;
  for (const raw of content.split(/\r?\n/)) {
    if (!raw.startsWith("Dialogue:")) continue;
    const fields = raw.split(",");
    if (fields.length < 10) continue;
    // ASS 格式：Dialogue: layer,start,end,style,name,ml1,ml2,effect,text
    const text = fields.slice(9).join(",").trim().replace(/\{[^}]*\}/g, "");
    if (!text) continue;
    eventIndex += 1;
    lines.push(`[${eventIndex}] ${text}`);
  }
  if (!lines.length) return [];
  return [
    {
      ...baseMeta,
      path: file,
      title: (baseMeta.title ?? file).replace(/\\/g, "/").split("/").pop() ?? file,
      type: baseMeta.type ?? "subtitle",
      content: lines.join("\n"),
      locator: `events=${lines.length}`,
    },
  ];
}
