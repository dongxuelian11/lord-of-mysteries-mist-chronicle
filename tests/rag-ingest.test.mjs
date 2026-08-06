import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { parseFile } from "../scripts/rag/parsers/index.mjs";
import { chunkDoc } from "../scripts/rag/chunkers/index.mjs";
import { deduplicateDocs, normalizeDoc } from "../scripts/rag/normalize/index.mjs";
import { buildAliasMap, buildInverted } from "../scripts/rag/lib/index-builder.mjs";
import { cloneOrUpdate } from "../scripts/rag/parsers/git.mjs";
import {
  addToNearDuplicateIndex,
  nearDuplicateCheck,
  tokenize,
} from "../scripts/rag/lib/text.mjs";

test("解析：Markdown 按一级标题拆分为多文档", async () => {
  const docs = await parseFile(
    path.join("tests", "fixtures", "rag", "sources", "characters.md"),
    { repo: "t", commit: "c", language: "zh-CN", canonLayer: "canon", sourceGrade: "C", type: "wiki" }
  );
  assert.ok(docs.length >= 3);
  assert.ok(docs.some((doc) => doc.title === "克莱恩·莫雷蒂的多重身份"));
});

test("解析：JSON 记录元数据透传（可见性/剧透/时间线）", async () => {
  const docs = await parseFile(
    path.join("tests", "fixtures", "rag", "sources", "future.json"),
    { repo: "t", commit: "c", language: "zh-CN", canonLayer: "canon", sourceGrade: "C", type: "structured" }
  );
  assert.equal(docs[0].spoilerScope, "volume2");
  assert.equal(docs[0].timeline.volume, 2);
  assert.equal(docs[0].visibility, "restricted");
});

test("切片：小说按章节切分并串联前后指针", () => {
  const doc = {
    id: "doc-novel",
    title: "第一卷 灰雾",
    content: "第一章 开端\n\n第一段文字。\n\n第二章 转折\n\n第二段文字。",
    type: "novel",
    path: "novel.txt",
    repo: "t",
    commit: "c",
    language: "zh-CN",
    canonLayer: "canon",
    sourceGrade: "C",
  };
  const chunks = chunkDoc(doc, "novel");
  assert.ok(chunks.length >= 2);
  assert.ok(chunks[0].nextChunkId === chunks[1].id);
  assert.ok(chunks[1].previousChunkId === chunks[0].id);
});

test("去重：精确重复与近重复都被折叠", () => {
  const base = { repo: "t", commit: "c", language: "zh-CN", canonLayer: "canon", sourceGrade: "C", type: "structured" };
  const docs = [
    normalizeDoc({ ...base, path: "a.md", title: "甲", content: "塔罗会每周四在灰雾之上聚会。" }, 0),
    normalizeDoc({ ...base, path: "b.md", title: "乙", content: "塔罗会每周四在灰雾之上聚会。" }, 1),
    normalizeDoc({ ...base, path: "c.md", title: "丙", content: "塔罗会每周四在灰雾之上聚会，成员轮流汇报。" }, 2),
  ];
  const unique = deduplicateDocs(docs);
  assert.equal(unique.length, 2);
  const index = new Map();
  addToNearDuplicateIndex(index, docs[0].content, docs[0]);
  assert.ok(nearDuplicateCheck("塔罗会每周四在灰雾之上聚会。", index));
});

test("索引：倒排索引与别名表可构建且可检索", () => {
  const chunks = [
    {
      id: "c1", documentId: "d1", title: "占卜家途径", content: "序列9是占卜家。",
      sourceId: "s1", sourceType: "structured", sourceRepo: "r", sourceCommit: "c",
      sourcePath: "p", sourceLocator: "", language: "zh-CN", canonLayer: "canon",
      sourceGrade: "C", visibility: "public", spoilerScope: "all", topics: ["pathways"],
      entities: [], aliases: ["愚者途径"], relations: [], contentHash: "h1", updatedAt: "t",
    },
  ];
  const inverted = buildInverted(chunks);
  assert.ok(inverted["占卜"]);
  assert.ok(inverted["序列"]);
  const aliasMap = buildAliasMap(chunks);
  assert.equal(aliasMap["愚者途径"].canonical, "占卜家途径");
});

test("Git 源：本地仓库 clone/update 并记录 commit SHA", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-git-"));
  try {
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    const git = (args, cwd = repo) =>
      spawnSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "t@t"]);
    git(["config", "user.name", "t"]);
    fs.writeFileSync(path.join(repo, "a.md"), "# 初始内容\n\n第一段。");
    git(["add", "."]);
    git(["commit", "-m", "init"]);
    const firstCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();

    const cache = path.join(tmp, "cache");
    const first = cloneOrUpdate(
      { id: "local-src", url: `file:///${repo.replace(/\\/g, "/")}` },
      cache
    );
    assert.equal(first.commit, firstCommit);
    assert.ok(fs.existsSync(path.join(cache, "local-src", "a.md")));

    fs.writeFileSync(path.join(repo, "a.md"), "# 更新内容\n\n第二段。");
    git(["add", "."]);
    git(["commit", "-m", "update"]);
    const secondCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
    const second = cloneOrUpdate(
      { id: "local-src", url: `file:///${repo.replace(/\\/g, "/")}` },
      cache
    );
    assert.equal(second.commit, secondCommit);
    assert.match(
      fs.readFileSync(path.join(cache, "local-src", "a.md"), "utf8"),
      /更新内容/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("分词：中英混合与中文双字词", () => {
  const terms = tokenize("Klein 的占卜家序列9");
  assert.ok(terms.includes("klein"));
  assert.ok(terms.includes("占卜"));
  assert.ok(terms.includes("序列"));
});
