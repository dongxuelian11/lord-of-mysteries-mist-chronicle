export async function parsePdf(buffer, file, baseMeta) {
  let PDFParse;
  try {
    ({ PDFParse } = await import("pdf-parse"));
  } catch {
    return {
      error: "PDF_PARSER_MISSING",
      message: "pdf-parse 未安装，跳过 PDF 解析",
    };
  }
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return [
      {
        ...baseMeta,
        path: file,
        type: baseMeta.type ?? "reference",
        content: result?.text ?? "",
      },
    ];
  } catch (error) {
    return { error: "PDF_PARSE_FAILED", message: String(error?.message ?? error) };
  }
}
