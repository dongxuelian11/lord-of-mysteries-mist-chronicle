import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { parseEpub } from "../scripts/rag/parsers/epub.mjs";
import { parsePdf } from "../scripts/rag/parsers/pdf.mjs";

const baseMeta = {
  repo: "media-fixture",
  commit: "test",
  language: "zh-CN",
  canonLayer: "canon",
  sourceGrade: "C",
  type: "novel",
};

async function buildEpub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.folder("META-INF").file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  const chapters = [
    { id: "ch1", title: "第一章 雾中的钟声", body: "<h1>第一章 雾中的钟声</h1><p>清晨的贝克兰德被浓雾笼罩，钟声从远处传来。</p><p>克莱恩在窗边整理今天的报纸。</p>" },
    { id: "ch2", title: "第二章 旧书店", body: "<h1>第二章 旧书店</h1><p>他在桥区的一家旧书店里找到了一本没有署名的日记。</p><p>店主告诫他不要翻阅最后几页。</p>" },
  ];
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试中文小说</dc:title></metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`;
  zip.folder("OEBPS").file("content.opf", opf);
  for (const chapter of chapters) {
    zip.folder("OEBPS").file(`${chapter.id}.xhtml`, `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter.title}</title></head><body>${chapter.body}</body></html>`);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

test("EPUB 实测：中文标题、段落顺序与章节边界", async () => {
  const buffer = await buildEpub();
  const docs = await parseEpub(buffer, "fixtures/sample.epub", baseMeta);
  assert.equal(docs.length, 2, "应解析出两个章节文档");
  assert.match(docs[0].content, /第一章 雾中的钟声/);
  assert.match(docs[0].content, /克莱恩在窗边整理今天的报纸/);
  assert.match(docs[1].content, /第二章 旧书店/);
  assert.match(docs[1].content, /店主告诫他不要翻阅最后几页/);
  // 中文顺序与章节边界：第一章不含第二章内容，反之亦然
  assert.ok(docs[0].content.includes("第一章"));
  assert.ok(docs[1].content.includes("第二章"));
  assert.ok(!docs[0].content.includes("第二章"));
  assert.ok(!docs[1].content.includes("第一章"));
  assert.ok(!docs[0].content.includes("旧书店的店主"));
  assert.match(docs[0].path, /fixtures\/sample\.epub#.*ch1\.xhtml/);
});

test("PDF 实测：中文标题、段落、目录与分页（Playwright 可用时）", async () => {
  let chromium;
  try {
    const playwrightIndex = path.join(
      "C:\\Users\\Administrator\\AppData\\Local\\Temp\\gmzz-qa-playwright",
      "node_modules",
      "playwright",
      "index.mjs"
    );
    ({ chromium } = await import(pathToFileURL(playwrightIndex).href));
  } catch {
    console.log("[rag-media] Playwright 不可用，PDF 实测跳过");
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-pdf-"));
  const pdfPath = path.join(tmp, "sample.pdf");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{font-family:sans-serif}</style></head><body>
      <h1>灰雾纪事·测试卷</h1>
      <nav><p>目录</p><p>第一章 雾中的钟声</p><p>第二章 旧书店</p></nav>
      <h2>第一章 雾中的钟声</h2>
      <p>清晨的贝克兰德被浓雾笼罩，钟声从远处传来，克莱恩在窗边整理今天的报纸。</p>
      <p style="page-break-before:always">第二章 旧书店</p>
      <p>他在桥区的一家旧书店里找到了一本没有署名的日记，店主告诫他不要翻阅最后几页。</p>
    </body></html>`);
    await page.pdf({ path: pdfPath, format: "A4" });
    const buffer = fs.readFileSync(pdfPath);
    const parsed = await parsePdf(buffer, "fixtures/sample.pdf", baseMeta);
    assert.ok(Array.isArray(parsed) && !parsed.some((item) => item?.error), "PDF 应被解析");
    const text = parsed.map((item) => item.content).join("\n");
    assert.match(text, /灰雾纪事·测试卷/);
    assert.match(text, /第一章 雾中的钟声/);
    assert.match(text, /第二章 旧书店/);
    assert.ok(text.indexOf("第一章") < text.indexOf("第二章"), "中文章节顺序应保持");
    assert.match(text, /日记/);
    assert.match(parsed[0].path, /fixtures\/sample\.pdf/);
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
