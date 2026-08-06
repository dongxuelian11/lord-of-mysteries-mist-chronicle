import JSZip from "jszip";
import path from "node:path";
import { parseHtml } from "./html.mjs";

async function spineOrder(zip) {
  const opfEntry = Object.keys(zip.files).find(
    (name) => name.endsWith(".opf") && !name.startsWith("__MACOSX")
  );
  if (!opfEntry) return [];
  const opf = await zip.file(opfEntry).async("string");
  const manifest = new Map();
  const itemMatches = opf.matchAll(/<item\b[^>]*>/gi);
  for (const match of itemMatches) {
    const tag = match[0];
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const href = tag.match(/\bhref="([^"]+)"/)?.[1];
    if (id && href) manifest.set(id, href);
  }
  const spine = [];
  const spineMatches = opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi);
  const opfDir = path.posix.dirname(opfEntry);
  for (const match of spineMatches) {
    const id = match[1];
    if (/(^|[-_])(toc|nav|catalog|page)([-_]|$)/i.test(id)) continue;
    const href = manifest.get(id);
    if (href) spine.push(path.posix.join(opfDir, href).replace(/\\/g, "/"));
  }
  return spine;
}

export async function parseEpub(buffer, file, baseMeta) {
  const zip = await JSZip.loadAsync(buffer);
  const order = await spineOrder(zip);
  const docs = [];
  for (const href of order) {
    const clean = decodeURIComponent(href.split("#")[0]);
    const entry = zip.file(clean);
    if (!entry) continue;
    const content = await entry.async("string");
    const parsed = parseHtml(content, `${file}#${clean}`, baseMeta);
    if (parsed.length) docs.push(parsed[0]);
  }
  return docs;
}
