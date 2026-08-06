import crypto from "node:crypto";

export function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export function stableId(prefix, value, index = 0) {
  return `${prefix}-${sha1(value).slice(0, 16)}-${index}`;
}

export function tokenize(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const words = normalized.split(/\s+/).filter((item) => item.length > 1);
  const han = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams = [];
  for (let i = 0; i < han.length - 1; i += 1) {
    bigrams.push(`${han[i]}${han[i + 1]}`);
  }
  return [...new Set([...words, ...bigrams])];
}

const NOISE_PATTERNS = [
  /^\s*(目录|章节列表|返回目录|本章未完|待续|未完待续)\s*$/gim,
  /\[\d+\]/g,
  /(更多精彩小说，尽在.*?小说网)/g,
  /^[\s\d\p{P}\p{S}]{0,20}$/gmu,
  /!\[[^\]]*\]\([^)]*\)/g,
  /\s*\{[^}]*\}$/gm,
];

export function cleanText(value) {
  let output = value.replace(/\r\n/g, "\n");
  for (const pattern of NOISE_PATTERNS) {
    output = output.replace(pattern, "");
  }
  output = output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return output;
}

export function shingles(value, size = 4) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  const result = new Set();
  for (let i = 0; i <= normalized.length - size; i += 1) {
    result.add(normalized.slice(i, i + size));
  }
  return result;
}

export function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const MINHASH_SEEDS = [7, 31, 101, 211, 419, 823, 1621, 3217, 6421, 12821];

function fnv1a(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function minHash(content, seedCount = MINHASH_SEEDS.length) {
  const normalized = content.replace(/\s+/g, "").toLowerCase();
  const grams = [];
  for (let i = 0; i <= normalized.length - 4; i += 1) {
    grams.push(normalized.slice(i, i + 4));
  }
  const hashes = [];
  for (let s = 0; s < seedCount; s += 1) {
    const seed = MINHASH_SEEDS[s % MINHASH_SEEDS.length];
    let minimum = Infinity;
    for (const gram of grams) {
      const value = fnv1a(`${seed}:${gram}`);
      if (value < minimum) minimum = value;
    }
    hashes.push(minimum === Infinity ? 0 : minimum);
  }
  return hashes;
}

export function minHashBandKey(hashes, bandSize = 5, bandIndex = 0) {
  const start = bandIndex * bandSize;
  return hashes.slice(start, start + bandSize).join("-");
}

export function nearDuplicateCheck(
  content,
  index,
  threshold = 0.88,
  bandSize = 5,
  bandCount = 2
) {
  const hashes = minHash(content);
  for (let band = 0; band < bandCount; band += 1) {
    const key = minHashBandKey(hashes, bandSize, band);
    const candidates = index.get(key);
    if (!candidates) continue;
    const current = shingles(content);
    for (const candidate of candidates) {
      if (jaccard(current, candidate.shingles) >= threshold) return true;
    }
  }
  return false;
}

export function addToNearDuplicateIndex(index, content, entry) {
  const hashes = minHash(content);
  for (let band = 0; band < 2; band += 1) {
    const key = minHashBandKey(hashes, 5, band);
    const bucket = index.get(key) ?? [];
    bucket.push({ shingles: shingles(content), entry });
    index.set(key, bucket);
  }
}
