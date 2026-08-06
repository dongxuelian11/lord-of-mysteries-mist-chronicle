// TXT / Markdown 解析：保留标题层级与章节，交由 chunker 继续切分。
export function parseText(content, file, baseMeta) {
  let cleaned = content.replace(/\r\n/g, "\n");
  // 剥离 EPUB/网页导出常见的 YAML frontmatter（--- ... ---）
  const frontmatter = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (frontmatter) cleaned = cleaned.slice(frontmatter[0].length);
  const extension = file.toLowerCase().endsWith(".md") ? "md" : "txt";
  if (extension === "md") {
    const sections = cleaned.split(/^(#{1,2})\s+(.+)$/m);
    const docs = [];
    for (let i = 1; i < sections.length; i += 3) {
      const title = sections[i + 1].trim();
      const body = (sections[i + 2] ?? "").trim();
      if (body) {
        docs.push({
          ...baseMeta,
          path: file,
          title,
          type: baseMeta.type ?? "wiki",
          content: body,
        });
      }
    }
    if (docs.length) return docs;
  }
  return [
    {
      ...baseMeta,
      path: file,
      type: extension === "md" ? "wiki" : baseMeta.type ?? "novel",
      content: cleaned,
    },
  ];
}
