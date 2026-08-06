import fs from "node:fs";
import path from "node:path";

function patternToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\*\*/g, "\u0002")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0001/g, "(?:.*/)?")
    .replace(/\u0002/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchPath(relativePath, patterns) {
  if (!patterns || !patterns.length) return false;
  const normalized = relativePath.replace(/\\/g, "/");
  return patterns.some((pattern) => patternToRegExp(pattern).test(normalized));
}

export function walkFiles(dir, include, exclude = []) {
  const results = [];
  const visit = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const relative = path.relative(dir, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (relative === ".git" || relative.startsWith(".git/")) continue;
        if (exclude.some((pattern) => patternToRegExp(pattern).test(`${relative}/`))) continue;
        visit(full);
      } else if (entry.isFile()) {
        if (!matchPath(relative, include)) continue;
        if (matchPath(relative, exclude)) continue;
        results.push(full);
      }
    }
  };
  visit(dir);
  return results.sort();
}
