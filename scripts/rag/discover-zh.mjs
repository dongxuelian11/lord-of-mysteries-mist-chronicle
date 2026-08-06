import { execFileSync } from "node:child_process";

const gh = "C:\\Program Files\\GitHub CLI\\gh.exe";

function apiTree(repo, branch) {
  const out = execFileSync(
    gh,
    ["api", `repos/${repo}/git/trees/${branch}?recursive=1`, "--jq", ".tree[].path"],
    { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 }
  );
  return out.split(/\r?\n/).filter(Boolean);
}

for (const [repo, branch] of [["wxnacy/book", "master"], ["j-iNFINITE/vdisk", "master"]]) {
  console.log("=====", repo, "=====");
  try {
    const paths = apiTree(repo, branch);
    const matches = paths.filter((p) =>
      /诡秘|LOTM|Lord[-_. ]of[-_. ]Mysteries|Lord_of_Mysteries/i.test(p)
    );
    console.log("matches:", matches.length);
    for (const p of matches.slice(0, 60)) console.log(" ", p);
  } catch (error) {
    console.log("ERROR", String(error.message || error).slice(0, 400));
  }
}
