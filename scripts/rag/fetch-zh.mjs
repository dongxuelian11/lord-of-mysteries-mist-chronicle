import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const gh = process.env.GH_CLI_PATH || "gh";

const targetDir = path.join("private", "rag", "sources", "canon-zh", "lotm");
fs.mkdirSync(targetDir, { recursive: true });

const sources = [
  {
    id: "wxnacy-epub",
    repo: "wxnacy/book",
    path: "book/诡秘之主/诡秘之主.epub",
    file: "诡秘之主.epub",
  },
  {
    id: "vdisk-txt",
    repo: "j-iNFINITE/vdisk",
    path: "《诡秘之主》（精校版全本）作者：爱潜水的乌贼.txt",
    file: "诡秘之主-精校版全本.txt",
  },
];

let token = "";
try {
  token = execFileSync(
    gh,
    ["auth", "token"],
    { encoding: "utf8", windowsHide: true }
  ).trim();
} catch {
  token = "";
}

for (const source of sources) {
  const target = path.join(targetDir, source.file);
  try {
    const encodedPath = source.path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const response = await fetch(
      `https://api.github.com/repos/${source.repo}/contents/${encodedPath}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github.raw",
          "user-agent": "gmzz-rag",
        },
      }
    );
    if (!response.ok) {
      console.log(`${source.id}: HTTP ${response.status} ${response.statusText}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(target, buffer);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    console.log(
      `${source.id}: OK bytes=${buffer.length} sha256=${hash} -> ${target}`
    );
  } catch {
    console.log(`${source.id}: fetch ERROR, retry via gh api`);
    try {
      const encodedPath = source.path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const buffer = execFileSync(
        gh,
        [
          "api",
          `repos/${source.repo}/contents/${encodedPath}`,
          "-H",
          "Accept: application/vnd.github.raw",
        ],
        { windowsHide: true, timeout: 600000, encoding: null, maxBuffer: 512 * 1024 * 1024 }
      );
      fs.writeFileSync(target, buffer);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      console.log(
        `${source.id}: OK(bytes=${buffer.length}, sha256=${hash}) -> ${target}`
      );
    } catch (secondError) {
      console.log(
        `${source.id}: gh api ERROR ${String(secondError.message || secondError).slice(0, 300)}`
      );
    }
  }
}
