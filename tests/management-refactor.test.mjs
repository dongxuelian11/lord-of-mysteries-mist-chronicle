import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame, PATHWAYS } from "../app/game-model.ts";
import { buildOpeningCandidatePool } from "../app/opening-candidates.ts";
import { PATHWAY_ORIGINS } from "../app/pathway-origins.ts";
import {
  allocateManpower,
  advanceManagedBeyonder,
  advanceOrganizationManagementWeek,
  applyFactionCounteraction,
  applyPlayerControlAction,
  attachIntelligenceToBacklundMap,
  createInitialOrganizationManagement,
  deriveGovernanceContributions,
  deriveExposure,
  deriveFactionHostility,
  commandBranchResponse,
  configureSealedArtifact,
  duplicateVerifiedFormula,
  establishBranch,
  exchangeFormulaCopy,
  hostilityTier,
  migrateOrganizationManagementState,
  promoteCandidate,
  researchFormula,
  startCandidateScreening,
  strategicPointController,
  updateBranchAssignment,
} from "../app/organization-management.ts";
import { createSaveEnvelope, parseSaveEnvelope } from "../app/save-system.ts";

function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

test("all 22 standard pathways have a complete sequence index and opening dossier", () => {
  assert.equal(Object.keys(PATHWAYS).length, 22);
  for (const pathway of Object.values(PATHWAYS)) {
    assert.deepEqual(pathway.sequences.map((sequence) => sequence.rank), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    assert.ok(pathway.startingAbilities.length >= 2, pathway.id);
    assert.ok(pathway.startingAbilities.every((ability) => ability.risk.length > 0), pathway.id);
  }
});

test("opening generates eight named Beyonder candidates and never more than one special sequence 7", () => {
  const ordinary = buildOpeningCandidatePool({ playerPathwayId: "apprentice", originScenarioId: "apprentice-origin-2", originStartingSequence: 9, identityId: "doctor", experienceId: "mutual-aid" });
  const experienced = buildOpeningCandidatePool({ playerPathwayId: "twilight-giant", originScenarioId: "twilight-giant-origin-2", originStartingSequence: 7, identityId: "doctor", experienceId: "south-war" });
  assert.equal(ordinary.length, 8);
  assert.ok(ordinary.every((candidate) => candidate.pathway && candidate.sequence >= 8));
  assert.equal(ordinary.filter((candidate) => candidate.sequence === 7).length, 0);
  assert.equal(experienced.filter((candidate) => candidate.sequence === 7).length, 1);
  assert.ok(experienced.every((candidate) => candidate.core.includes("来源特质") && candidate.core.includes("经历特质") && candidate.core.includes("困境特质")));
});

test("the opening exposes two causal knowledge-backed origins for every pathway", () => {
  assert.equal(Object.keys(PATHWAY_ORIGINS).length, 22);
  assert.ok(Object.values(PATHWAY_ORIGINS).every((origins) => origins.length === 2));
  assert.ok(Object.values(PATHWAY_ORIGINS).flat().every((origin) => origin.traits.length === 2 && origin.firstCrisis && origin.loreEvidenceIds.length > 0));
});

test("Backlund starts with district, block and strategic point hierarchy", () => {
  const management = createInitialOrganizationManagement();
  assert.equal(management.map.districts.length, 10);
  assert.ok(management.map.districts.every((district) => district.blocks.length === 5));
  assert.ok(management.map.districts.every((district) => district.blocks.every((block) => block.strategicPoints.length === 3)));
  assert.ok(management.map.districts.every((district) => Number.isFinite(district.control)));
  const points = management.map.districts.flatMap((district) => district.blocks.flatMap((block) => block.strategicPoints));
  assert.ok(points.every((point) => !/公开节点|地下节点|流通节点/.test(point.name)));
  assert.ok(points.filter((point) => point.loreStatus === "verified").length >= 20);
  assert.ok(points.every((point) => point.loreEvidenceIds.some((id) => id.startsWith("lotm-"))));
  assert.ok(points.every((point) => Object.keys(point.influenceByFaction).every((id) => !["official", "local", "hidden"].includes(id))));
});

test("legacy placeholder factions migrate to the eight real Backlund factions", () => {
  const legacy = createInitialOrganizationManagement();
  legacy.version = 1;
  legacy.map.districts[0].blocks[0].strategicPoints[0].influenceByFaction = { player: 22, official: 34, local: 24, hidden: 20 };
  legacy.factionHostility = [{ factionId: "official", grievance: 10, interestConflict: 10, ideologyConflict: 10, perceivedThreat: 10, leverageAgainstPlayer: 0, hostility: 10, responseStyle: "legacy", lastCauseRefs: [] }];
  const migrated = migrateOrganizationManagementState(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.factionHostility.length, 8);
  assert.ok(migrated.factionHostility.every((item) => !["official", "local", "hidden"].includes(item.factionId)));
  assert.equal(migrated.map.districts[0].blocks[0].strategicPoints[0].influenceByFaction.player, 22);
});

test("public intelligence is attached to a district block and strategic point on the map", () => {
  const management = createInitialOrganizationManagement();
  const district = management.map.districts[0];
  const mapped = attachIntelligenceToBacklundMap(management.map, [{ id: "newspaper-1", districtId: district.id, text: "一条来自公开报纸的区域消息" }]);
  assert.ok(mapped.districts[0].blocks.some((block) => block.strategicPoints.some((point) => point.intelligenceIds.includes("newspaper-1"))));
});

test("strategic point control requires sixty percent and a lead, then remains reversible", () => {
  assert.equal(strategicPointController({ player: 59, rival: 30, local: 11 }), undefined);
  assert.equal(strategicPointController({ player: 60, rival: 56 }), undefined);
  assert.equal(strategicPointController({ player: 65, rival: 30, local: 5 }), "player");

  const management = createInitialOrganizationManagement();
  const district = management.map.districts[0];
  const block = district.blocks[0];
  const point = block.strategicPoints[0];
  point.influenceByFaction = { player: 70, official: 20, local: 10 };
  const attacked = applyFactionCounteraction(management.map, {
    districtId: district.id,
    blockId: block.id,
    pointId: point.id,
    factionId: "official",
    pressure: 25,
    week: 2,
  });
  const changed = attacked.districts[0].blocks[0].strategicPoints[0];
  assert.ok(changed.influenceByFaction.player < 60);
  assert.notEqual(changed.controllerId, "player");
});

test("a successful regional deployment raises influence at a concrete strategic point", () => {
  const management = createInitialOrganizationManagement();
  const district = management.map.districts[0];
  const before = district.blocks.flatMap((block) => block.strategicPoints).reduce((sum, point) => sum + point.influenceByFaction.player, 0);
  const applied = applyPlayerControlAction(management.map, { actionId: "deploy-1", districtId: district.id, outcome: "成功", summary: "建立公开档案关系", methodTags: ["document", "official"], capacity: 10, week: 2 });
  const after = applied.map.districts[0].blocks.flatMap((block) => block.strategicPoints).reduce((sum, point) => sum + point.influenceByFaction.player, 0);
  assert.ok(applied.target);
  assert.ok(after > before);
  assert.equal(applied.map.lastRecalculatedWeek, 2);
});

test("manpower is a bounded macro resource and promotion consumes variable costs", () => {
  const initial = createInitialOrganizationManagement();
  assert.throws(() => allocateManpower(initial, { headquarters: 20, intelligence: 10, resources: 0, security: 0, branches: 0 }), /人力不足/);
  const prepared = {
    ...initial,
    candidates: [{ id: "candidate", name: "候选人", background: "", aptitude: "", sourceTrait: "", experienceTrait: "", predicamentTrait: "", screenedWeek: 1, status: "selected" }],
    formulas: [{ id: "formula", pathwayId: "seer", sequence: 9, name: "序列9配方", status: "verified", reliability: 100, sourceRefs: ["source"], loreEvidenceIds: ["kb:evidence"] }],
  };
  const promoted = promoteCandidate(prepared, "candidate", "formula", { money: 73, extraordinaryMaterials: 4 });
  assert.equal(promoted.resources.manpower, initial.resources.manpower - 1);
  assert.equal(promoted.resources.money, initial.resources.money - 73);
  assert.equal(promoted.resources.extraordinaryMaterials, initial.resources.extraordinaryMaterials - 4);
  assert.equal(promoted.candidates[0].status, "promoted");
  assert.equal(promoted.beyonderDevelopment[0].status, "adapting");
  assert.equal(promoted.beyonderDevelopment[0].memberId, "promoted-candidate");
});

test("formula research requires resources and knowledge evidence before promotion-grade verification", () => {
  const initial = createInitialOrganizationManagement();
  const lead = { id: "lead", pathwayId: "seer", sequence: 9, name: "占卜家配方档案", status: "verifying", reliability: 80, researchProgress: 90, sourceRefs: [], loreEvidenceIds: [] };
  const blocked = researchFormula({ ...initial, formulas: [lead] }, "lead", { money: 25, extraordinaryMaterials: 1 });
  assert.equal(blocked.formulas[0].status, "verifying");
  assert.equal(blocked.formulas[0].researchProgress, 99);
  const verified = researchFormula({ ...initial, formulas: [{ ...lead, loreEvidenceIds: ["lotm-pathway-seer-9"] }] }, "lead", { money: 25, extraordinaryMaterials: 1 });
  assert.equal(verified.formulas[0].status, "verified");
  const copied = duplicateVerifiedFormula(verified, "lead");
  const exchanged = exchangeFormulaCopy(copied, "lead");
  assert.equal(exchanged.formulas[0].duplicateCopies, 0);
  assert.ok(exchanged.resources.money > copied.resources.money);
});

test("sealed artifacts require containment upkeep and become unstable when funding is absent", () => {
  const initial = createInitialOrganizationManagement();
  const artifact = { id: "sealed", name: "测试封印物", effectSummary: "提供情报", dangerSummary: "失控后制造噪声", containmentCost: 2, locationId: "vault", loreEvidenceIds: ["lotm-sealed"], weeklyMoneyCost: 8, weeklyMaterialCost: 1, benefit: { intelligence: 3 }, risk: 30, status: "unidentified" };
  const contained = configureSealedArtifact({ ...initial, sealedArtifacts: [artifact] }, "sealed", { contained: true, custodianId: "member" });
  assert.equal(contained.sealedArtifacts[0].status, "assigned");
  const starved = advanceOrganizationManagementWeek({ ...contained, resources: { ...contained.resources, money: 0, extraordinaryMaterials: 0 } }, { week: 2, legacyMoney: 0, actionSummaries: [] });
  assert.equal(starved.state.sealedArtifacts[0].status, "unstable");
  assert.ok(starved.events.some((event) => event.includes("维持费用不足")));
});

test("promoted members digest under supervision and advancement requires a verified next formula with variable costs", () => {
  const initial = createInitialOrganizationManagement();
  const ready = {
    ...initial,
    resources: { ...initial.resources, money: 1000, extraordinaryMaterials: 20 },
    formulas: [{ id: "next", pathwayId: "seer", sequence: 8, name: "序列8配方", status: "verified", reliability: 100, sourceRefs: ["source"], loreEvidenceIds: ["kb:seq8"] }],
    beyonderDevelopment: [{ memberId: "member", pathwayId: "seer", sequence: 9, formulaId: "old", digestion: 100, instability: 20, supervision: 80, status: "ready", lastUpdateWeek: 2, log: [] }],
  };
  const advanced = advanceManagedBeyonder(ready, "member", "next", 3);
  assert.equal(advanced.beyonderDevelopment[0].sequence, 8);
  assert.equal(advanced.beyonderDevelopment[0].status, "adapting");
  assert.equal(advanced.beyonderDevelopment[0].digestion, 0);
  assert.ok(advanced.resources.money < ready.resources.money);
  assert.ok(advanced.resources.extraordinaryMaterials < ready.resources.extraordinaryMaterials);
  assert.throws(() => advanceManagedBeyonder({ ...ready, formulas: [{ ...ready.formulas[0], loreEvidenceIds: [] }] }, "member", "next", 3), /知识库证据/);
});

test("exposure and faction hostility are derived from causes instead of dead counters", () => {
  const exposure = deriveExposure([
    { id: "w", kind: "witness", summary: "目击", severity: 12, locationId: "east", detectableByFactionIds: ["official"], createdWeek: 1 },
    { id: "r", kind: "record", summary: "记录", severity: 9, locationId: "government", detectableByFactionIds: ["official"], createdWeek: 1, expiresWeek: 1 },
  ], 2);
  assert.equal(exposure, 12);
  const low = deriveFactionHostility({ factionId: "official", grievance: 10, interestConflict: 10, ideologyConflict: 10, perceivedThreat: 10, leverageAgainstPlayer: 0, responseStyle: "audit", lastCauseRefs: [] });
  const high = deriveFactionHostility({ ...low, grievance: 80, perceivedThreat: 90 });
  assert.ok(high.hostility > low.hostility);
  assert.equal(hostilityTier(20), "watching");
  assert.equal(hostilityTier(40), "obstructing");
  assert.equal(hostilityTier(60), "striking");
  assert.equal(hostilityTier(80), "eradication");
});

test("weekly management advances rival pressure even without a player order", () => {
  const initial = createInitialOrganizationManagement();
  const before = JSON.stringify(initial.map);
  const advanced = advanceOrganizationManagementWeek(initial, { week: 2, legacyMoney: 420, actionSummaries: [] });
  assert.notEqual(JSON.stringify(advanced.state.map), before);
  assert.ok(advanced.events.some((event) => event.includes("不会令城市停止博弈")));
  assert.equal(advanced.state.map.lastRecalculatedWeek, 2);
  assert.equal(advanced.state.lastConsequenceReport?.week, 2);
  assert.ok(advanced.state.lastConsequenceReport?.effects.every((effect) => effect.length > 0));
});

test("reputation, exposure, and hostility thresholds produce non-cosmetic weekly consequences", () => {
  const initial = createInitialOrganizationManagement();
  const exposed = {
    ...initial,
    reputation: { ...initial.reputation, score: 58, tier: "renowned" },
    exposureEvidence: [{ id: "e1", kind: "public-rumor", summary: "公开传闻", severity: 24, locationId: "backlund", detectableByFactionIds: ["official"], createdWeek: 1 }, { id: "e2", kind: "record", summary: "追查记录", severity: 24, locationId: "backlund", detectableByFactionIds: ["official"], createdWeek: 1 }],
    exposure: 48,
    factionHostility: initial.factionHostility.map((relation, index) => index ? relation : { ...relation, hostility: 82, grievance: 90, perceivedThreat: 90 }),
  };
  const advanced = advanceOrganizationManagementWeek(exposed, { week: 2, legacyMoney: 420, actionSummaries: [] });
  const report = advanced.state.lastConsequenceReport;
  assert.equal(report?.recruitmentBonus, 2);
  assert.equal(report?.exposurePenalty, 4);
  assert.equal(report?.counteractionTier, "eradication");
  assert.ok(report?.effects.some((effect) => effect.includes("威胁判断")));
  assert.ok(advanced.state.resources.money < 420 + 20, "exposure scrutiny should consume part of renowned reputation income");
});

test("an office incumbent loses most governance contribution while away on a formal action", () => {
  const management = createInitialOrganizationManagement();
  management.offices[0].incumbentId = "member-a";
  const members = [{ id: "member-a", name: "甲", pathway: "占卜家", sequence: 8, specialty: "人事管理与沟通", fatigue: 0, status: "可安排" }];
  const present = deriveGovernanceContributions(management, members);
  const away = deriveGovernanceContributions(management, members, ["member-a"]);
  assert.equal(present[0].availability, "present");
  assert.equal(away[0].availability, "away");
  assert.ok(away[0].effective < present[0].effective / 2);
});

test("weekly governance report creates concrete resource and control effects", () => {
  const management = createInitialOrganizationManagement();
  management.offices = management.offices.map((office, index) => ({ ...office, incumbentId: `member-${index}` }));
  const governanceMembers = management.offices.map((office, index) => ({ id: `member-${index}`, name: office.name, pathway: "非凡途径", sequence: 8, specialty: office.responsibility, fatigue: 0, status: "可安排" }));
  const advanced = advanceOrganizationManagementWeek(management, { week: 2, legacyMoney: 420, actionSummaries: [], governanceMembers });
  assert.equal(advanced.state.lastGovernanceReport?.week, 2);
  assert.ok(advanced.state.lastGovernanceReport?.offices.every((office) => office.effective > 0));
  assert.ok(advanced.state.resources.money > 420);
  assert.ok(advanced.events.some((event) => event.includes("四项治理本周实际贡献")));
});

test("candidate screening returns named files immediately in the current turn", () => {
  const initial = createInitialOrganizationManagement();
  const screening = startCandidateScreening(initial, { week: 1, manpower: 4, moneyCost: 35 });
  assert.equal(screening.resources.manpower, initial.resources.manpower);
  assert.equal(screening.resources.money, initial.resources.money - 35);
  assert.equal(screening.screeningProjects[0].status, "completed");
  assert.equal(screening.screeningProjects[0].dueWeek, 1);
  assert.equal(screening.candidates.length, 2);
  assert.ok(screening.candidates.every((candidate) => candidate.name && candidate.predicamentTrait));
  assert.throws(() => startCandidateScreening(screening, { week: 1, manpower: 3, moneyCost: 20 }), /本回合已经提交/);
});

test("a branch requires block control, a supervisor, money, and allocated branch manpower", () => {
  const initial = createInitialOrganizationManagement();
  const district = initial.map.districts[0];
  const block = district.blocks[0];
  assert.throws(() => establishBranch(initial, { districtId: district.id, blockId: block.id, supervisorId: "member", stationedManpower: 4, policy: "intelligence" }), /控制力/);
  const controlled = {
    ...initial,
    manpowerAllocation: { ...initial.manpowerAllocation, headquarters: 6, branches: 4 },
    map: { ...initial.map, districts: initial.map.districts.map((item) => item.id !== district.id ? item : { ...item, blocks: item.blocks.map((entry) => entry.id === block.id ? { ...entry, control: 64 } : entry) }) },
  };
  const established = establishBranch(controlled, { districtId: district.id, blockId: block.id, supervisorId: "member", stationedManpower: 4, policy: "intelligence" });
  assert.equal(established.branches[0].status, "forming");
  assert.ok(established.resources.money < controlled.resources.money);
});

test("branch commands support reassignment, evacuation, and next-week release", () => {
  const initial = createInitialOrganizationManagement();
  const district = initial.map.districts[0];
  const block = district.blocks[0];
  const controlled = {
    ...initial,
    manpowerAllocation: { ...initial.manpowerAllocation, headquarters: 6, branches: 4 },
    map: { ...initial.map, districts: initial.map.districts.map((item) => item.id !== district.id ? item : { ...item, blocks: item.blocks.map((entry) => entry.id === block.id ? { ...entry, control: 64 } : entry) }) },
  };
  const established = establishBranch(controlled, { districtId: district.id, blockId: block.id, supervisorId: "member-a", stationedManpower: 4, policy: "intelligence" });
  const reassigned = updateBranchAssignment(established, established.branches[0].id, { supervisorId: "member-b", policy: "money" });
  assert.equal(reassigned.branches[0].supervisorId, "member-b");
  assert.equal(reassigned.branches[0].policy, "money");
  const evacuating = commandBranchResponse(reassigned, reassigned.branches[0].id, "evacuate", 2);
  assert.equal(evacuating.branches[0].status, "evacuating");
  const advanced = advanceOrganizationManagementWeek(evacuating, { week: 3, legacyMoney: evacuating.resources.money, actionSummaries: [] });
  assert.equal(advanced.state.branches[0].status, "lost");
  assert.ok(advanced.events.some((event) => event.includes("完成撤离")));
});

test("schema 15 saves migrate into schema 21 management, ledger, autonomous-agent, faction-strategy, participation, and campaign state", () => {
  const game = createInitialGame("seer");
  const envelope = createSaveEnvelope(game);
  const legacyGame = { ...envelope.game, prologueComplete: true };
  delete legacyGame.management;
  delete legacyGame.worldLedger;
  delete legacyGame.worldAgents;
  delete legacyGame.factionStrategy;
  legacyGame.version = 15;
  const legacy = { ...envelope, schemaVersion: 15, game: legacyGame, checksum: stableHash(JSON.stringify(legacyGame)) };
  const migrated = parseSaveEnvelope(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, 21);
  assert.equal(migrated.game.version, 21);
  assert.equal(migrated.game.worldLedger.version, 2);
  assert.ok(migrated.game.worldAgents.profiles.length > 0);
  assert.ok(migrated.game.factionStrategy.profiles.length > 0);
  assert.equal(migrated.game.management.resources.manpower, 24);
});
