// 命运失控机制审计：模板质量、反无聊、确定性、幂等与边界。
import fs from "node:fs";
import { loadRuntimeModule } from "../rag/lib/load-runtime.mjs";

export async function runFateAudit() {
  const fate = await loadRuntimeModule("app/fate/index.ts");
  const abilities = await loadRuntimeModule("app/abilities/index.ts");
  const findings = [];
  const templates = fate.fateTemplates();
  findings.push(...fate.auditFateTemplates(templates));
  findings.push(...fate.fateBoundsAudit());

  // 兜底模板完整性
  for (const twist of ["pure", "cursed-boon", "fortunate-disaster", "full-disaster"]) {
    const fallback = fate.safeFallbackFor(twist);
    if (!fallback || !fallback.id.startsWith("fate-safe-fallback-")) findings.push(`fallback-missing:${twist}`);
  }

  // 不可复现随机：规则引擎源码不得使用 Math.random()
  const files = fs.readdirSync("app/fate").filter((name) => name.endsWith(".ts"));
  for (const file of files) {
    const source = fs.readFileSync(`app/fate/${file}`, "utf8");
    if (/Math\.random\(/.test(source)) findings.push(`math-random:${file}`);
  }

  // 命运种子独立：与能力种子不同、绑定 resolutionId 与算法版本。
  const definitions = abilities.abilityDefinitions();
  const actor = {
    ...abilities.DEFAULT_EXTRAORDINARY_STATE,
    pathwayId: "seer",
    sequence: 9,
    internalRank: 1,
    spirituality: 18,
  };
  const intent = {
    actionId: "audit-fate",
    actorId: "player",
    objective: "观察目标",
    requestedAbilityIds: ["spirit-vision"],
    targetRefs: [],
    method: "观察",
    preparationRefs: ["sight-confirmed"],
    mediumRefs: [],
    materialRefs: [],
    acceptableRisks: [],
    retreatConditions: [],
  };
  const contract = abilities.resolveAbility({
    definition: definitions.find((item) => item.id === "spirit-vision"),
    actorState: actor,
    targetStates: [{ id: "t", ...actor }],
    intent,
    seed: "seed-audit-1",
    environmentRefs: [],
    activeCounterIds: [],
    environmentProtection: 0,
    targetInjured: false,
    mastery: 1,
  });
  const fateContract = fate.resolveFateAberration({
    definition: definitions.find((item) => item.id === "spirit-vision"),
    actorState: actor,
    targetStates: [{ id: "t", ...actor }],
    intent,
    abilityContract: contract,
    game: { week: 1, saveId: "audit-save", worldKernel: {}, fate: undefined },
  });
  if (fateContract.deterministicSeed === contract.deterministicSeed) findings.push("seed-not-independent");
  if (!fateContract.deterministicSeed.includes(contract.resolutionId)) findings.push("seed-not-bound-to-resolution-id");
  if (!fateContract.deterministicSeed.includes("fate-aberration-v1")) findings.push("seed-missing-version");
  if (fate.validateFateContract(fateContract).length) findings.push("sample-contract-invalid");

  // 模板执行失败不得重新抽取：兜底 id 必须确定性稳定。
  const first = fate.safeFallbackFor("full-disaster").id;
  const second = fate.safeFallbackFor("full-disaster").id;
  if (first !== second) findings.push("fallback-non-deterministic");

  return { findings, count: templates.length };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runFateAudit();
  console.log("[fate:audit]");
  console.log(`  手工模板=${result.count}`);
  if (result.findings.length) {
    console.log(`  发现：${result.findings.slice(0, 20).join("; ")}`);
  } else {
    console.log("  模板数量/覆盖/反无聊/兜底/种子独立/幂等边界全部通过");
  }
  const pass = result.findings.length === 0 && result.count >= 36;
  console.log(`[fate:audit] RESULT=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}
