// 中文《诡秘之主》正文解析：卷/章识别、目录跳过、广告水印与“加料”检测。

export function cnToNumber(value) {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (!/^[零一二三四五六七八九十百千两]+$/.test(text)) return null;
  const DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const UNITS = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  for (const char of text) {
    if (char === "零") continue;
    if (UNITS[char]) {
      current = (current === 0 ? 1 : current) * UNITS[char];
    } else {
      total += current;
      current = DIGITS[char];
    }
  }
  total += current;
  return total || null;
}

export const AD_PATTERNS = [
  /顶点小说|天才一秒记住|笔趣阁|请收藏本站|最新网址|手机阅读|下载.*APP|加入书签|首发|无弹窗|高速首发|爱尚小说网|追书神器|起点中文网用户|记得收藏|方便下次阅读/i,
  /^第\s*\d+\s*章.*(?:错乱|不完整)/i,
];

export const MODIFIED_PATTERNS = [
  /加料|修改版|改写版|结局已改|同人续写|魔改/i,
];

export const AUTHOR_NOTE_PATTERNS = [
  /^作者的话[:：]?/,
  /^PS[:：]?/,
  /^后记/,
  /^尾声/,
];

const VOLUME_RE = /^\s*第\s*([一二三四五六七八九十百\d]+)\s*[部卷]\s*(.*)$/;
const CHAPTER_RE = /^\s*第\s*([一二三四五六七八九十百\d]+)\s*章\s*(.*)$/;
const SPECIAL_RE = /^\s*(序章|楔子|尾声|后记|番外(?:[一二三四五六七八九十\d]*)\s*(.*)?)$/;

export function detectEncoding(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf-8-bom";
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  const utf8 = Buffer.from(sample.toString("utf8")).toString("utf8");
  const loss = utf8.split("").filter((char) => char === "\uFFFD").length;
  return loss / Math.max(1, utf8.length) < 0.01 ? "utf-8" : "gb18030";
}

export function parseZhTxt(buffer) {
  const encoding = detectEncoding(buffer);
  const text = new TextDecoder(encoding === "gb18030" ? "gb18030" : "utf-8").decode(buffer);
  const lines = text.split(/\r\n|\r|\n/);
  const chapters = [];
  let current = null;
  let volumeNumber = 0;
  let volumeTitle = "";
  let started = false;
  let adCount = 0;
  let modifiedFlags = new Set();
  let authorNoteCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const volumeMatch = line.match(VOLUME_RE);
    if (volumeMatch && line.length <= 40) {
      volumeNumber = cnToNumber(volumeMatch[1]) ?? volumeNumber;
      volumeTitle = volumeMatch[2].trim() || `第${volumeMatch[1]}部`;
      continue;
    }
    const chapterMatch = line.match(CHAPTER_RE);
    if (chapterMatch && line.length <= 40) {
      started = true;
      const chapterNumber = cnToNumber(chapterMatch[1]);
      const chapterTitle = chapterMatch[2].trim();
      current = {
        work: "诡秘之主",
        volumeNumber,
        volumeTitle,
        chapterNumber,
        chapterTitle: chapterTitle || `第${chapterMatch[1]}章`,
        content: [],
        isSpecial: false,
        authorNote: false,
      };
      chapters.push(current);
      continue;
    }
    const specialMatch = line.match(SPECIAL_RE);
    if (specialMatch && !started && line.length <= 30) {
      started = true;
      current = {
        work: "诡秘之主",
        volumeNumber,
        volumeTitle,
        chapterNumber: 0,
        chapterTitle: line,
        content: [],
        isSpecial: true,
        authorNote: false,
      };
      chapters.push(current);
      continue;
    }
    if (!started) continue; // 目录/简介等前置内容
    if (!current) continue;
    if (AUTHOR_NOTE_PATTERNS.some((pattern) => pattern.test(line))) {
      current.authorNote = true;
      authorNoteCount += 1;
    }
    if (AD_PATTERNS.some((pattern) => pattern.test(line))) {
      adCount += 1;
      continue;
    }
    for (const pattern of MODIFIED_PATTERNS) {
      if (pattern.test(line)) modifiedFlags.add(pattern.source);
    }
    current.content.push(rawLine);
  }
  const parsed = chapters
    .filter((chapter) => chapter.content.join("").trim().length > 0)
    .map((chapter) => ({
      ...chapter,
      content: chapter.content.join("\n").trim(),
    }));
  return {
    work: "诡秘之主",
    encoding,
    totalChars: text.length,
    chapterCount: parsed.length,
    volumeCount: new Set(parsed.map((chapter) => chapter.volumeNumber)).size,
    adCount,
    authorNoteCount,
    modifiedFlags: [...modifiedFlags],
    chapters: parsed,
  };
}

export function chapterNumberFromTitle(title) {
  const match = String(title ?? "").match(/第\s*([一二三四五六七八九十百\d]+)\s*章\s*(.*)$/);
  if (!match) return { number: null, title: String(title ?? "") };
  return { number: cnToNumber(match[1]), title: match[2].trim() };
}
