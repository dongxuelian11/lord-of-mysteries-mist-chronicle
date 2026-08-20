import { callModel, type AiConfig } from "./ai-client.ts";
import { actionTextBoundaryIssue } from "./action-boundaries.ts";
import { attachFallbackParagraphSources, buildLiteraryCausalPack, normalizeParagraphSources, type LiteraryCausalPack } from "./chronicle-causality.ts";
import { PATHWAYS, type ChronicleChapter, type ChronicleSection, type GameState } from "./game-model.ts";
import { memoryPromptBlockWithIds, narratorAudience, submitMemoryDelivery } from "./memory/index.ts";
import { extractJson } from "./model-output.ts";

type ValidatedSection = { heading: string; paragraphs: string[]; rawParagraphSources?: unknown };
type ValidatedChapter = { title: string; sections: ValidatedSection[] };

function validateChapter(value: Record<string, unknown>): ValidatedChapter {
  const title = typeof value.title === "string" ? value.title : "本周纪事";
  const sections = Array.isArray(value.sections) ? value.sections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const candidate = section as { heading?: unknown; paragraphs?: unknown; paragraphSources?: unknown };
    const paragraphs = Array.isArray(candidate.paragraphs) ? candidate.paragraphs.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
    return typeof candidate.heading === "string" && paragraphs.length ? [{ heading: candidate.heading, paragraphs, rawParagraphSources: candidate.paragraphSources }] : [];
  }) : [];
  if (sections.length < 1) throw new Error("文学章节没有形成正文");
  return { title, sections };
}

function splitParagraph(text: string, max: number) {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (current.length >= max && /[。！？；]/.test(current)) {
      const cut = Math.max(current.lastIndexOf("。"), current.lastIndexOf("！"), current.lastIndexOf("？"), current.lastIndexOf("；"));
      if (cut >= Math.floor(max * 0.5)) {
        parts.push(current.slice(0, cut + 1));
        current = current.slice(cut + 1);
      }
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function splitLongParagraphs(chapter: ValidatedChapter, causalPack: LiteraryCausalPack): { title: string; sections: ChronicleSection[] } {
  const max = 180;
  return {
    ...chapter,
    sections: chapter.sections.map((section) => {
      const rawSources = normalizeParagraphSources(section.rawParagraphSources, section.paragraphs.length, causalPack);
      const paragraphs: string[] = [];
      const paragraphSources: ChronicleSection["paragraphSources"] = [];
      section.paragraphs.forEach((paragraph, paragraphIndex) => {
        const parts = splitParagraph(paragraph, max);
        const proposedSource = rawSources[paragraphIndex];
        const source = proposedSource?.receiptIds.length || proposedSource?.eventIds.length
          ? proposedSource
          : attachFallbackParagraphSources(paragraph, causalPack);
        for (const part of parts) {
          paragraphs.push(part);
          paragraphSources.push(source);
        }
      });
      return { heading: section.heading, paragraphs, paragraphSources };
    }),
  };
}

function finalizeLiteraryChapter(local: ChronicleChapter, candidate: ValidatedChapter, causalPack: LiteraryCausalPack): ChronicleChapter {
  const lockedResults = JSON.stringify(local.results);
  const candidateResults = (candidate as ValidatedChapter & { results?: ChronicleChapter["results"] }).results;
  if (candidateResults && JSON.stringify(candidateResults) !== lockedResults) throw new Error("文学重写试图改变已锁定的规则结果");
  const generated = splitLongParagraphs(candidate, causalPack);
  return { ...local, ...generated, source: "ai", results: local.results };
}

function literaryAgencyIssue(chapter: ReturnType<typeof validateChapter>, game: GameState, local: ChronicleChapter) {
  const prose = chapter.sections.flatMap((section) => section.paragraphs).join("\n");
  for (const result of local.results) {
    const issue = actionTextBoundaryIssue(prose, game, result.contract);
    if (issue) return `${result.title}：${issue}`;
  }
  if (local.results.length || local.title.startsWith("终局") || local.title.startsWith("重大事件")) return null;
  const identities = [game.playerName, game.playerName.split("·").at(-1), ...game.members.map((member) => member.name)]
    .filter(Boolean)
    .map((value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!identities.length) return null;
  const actor = `(?:${identities.join("|")})`;
  const unauthorized = "(?:离开(?:了)?据点|决定去|前往|走进|来到.{0,12}(?:档案室|黑市|码头|东区|桥区|皇后区)|打听|调查|询问|拜访|跟踪|追踪|潜入|亲自查看|现场核验|设法.{0,12}(?:取得|抄到|获得))";
  const paragraphs = chapter.sections.flatMap((section) => section.paragraphs);
  if (paragraphs.some((paragraph) => new RegExp(`${actor}[\\s\\S]{0,180}${unauthorized}`).test(paragraph) || new RegExp(`${unauthorized}[\\s\\S]{0,80}${actor}`).test(paragraph))) {
    return "本周没有玩家决议，正文却让玩家或组织成员执行了外出、调查、接触或取证行动";
  }
  const externalPlace = /码头区|桥区|皇后区|东区|黑市|酒馆|老宅|面粉厂|厂区|河堤|市场|巷口|栅栏|仓库|警察厅/;
  const sceneAction = /坐在|站在|走到|沿着|离开|返回|回到|钻进|靠近|认出|记住|跟上|拿出|等候|尾随|守在|绕到/;
  const actorExpression = new RegExp(actor);
  if (paragraphs.some((paragraph) => actorExpression.test(paragraph) && externalPlace.test(paragraph) && sceneAction.test(paragraph))) {
    return "本周没有玩家决议，正文却把玩家或组织成员放进了外部地点的亲历场景";
  }
  return null;
}

async function enforceLiteraryAgency(config: AiConfig, system: string, factPack: Record<string, unknown>, game: GameState, local: ChronicleChapter, candidate: ReturnType<typeof validateChapter>, onStage: (value: string) => void, onToken?: (text: string) => void) {
  let repaired = candidate;
  let issue = literaryAgencyIssue(repaired, game, local);
  if (!issue) return repaired;
  for (let pass = 0; pass < 2; pass += 1) {
    const targets: { sectionIndex: number; paragraphIndex: number; issue: string }[] = [];
    repaired.sections.forEach((section, sectionIndex) => section.paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphChapter = { title: repaired.title, sections: [{ heading: section.heading, paragraphs: [paragraph] }] };
      const paragraphIssue = literaryAgencyIssue(paragraphChapter, game, local);
      if (paragraphIssue) targets.push({ sectionIndex, paragraphIndex, issue: paragraphIssue });
    }));
    if (!targets.length) break;
    onStage(`连续性编辑正在局部纠正越界段落（${pass + 1}/2）`);
    const sections = repaired.sections.map((section) => ({ ...section, paragraphs: [...section.paragraphs] }));
    for (const target of targets) {
      const original = sections[target.sectionIndex].paragraphs[target.paragraphIndex];
      const raw = extractJson(await callModel(
        config,
        `${system}\n你是玩家主权连续性编辑。世界事实只读；你一次只能改写一个越界段落。`,
        `这一个段落违反了玩家行动边界：${target.issue}。只重写这一段，不要重写章节，不得新增行动、线索、人物、地点或世界事实。\n本周已结算行动：${JSON.stringify(local.results.map((result) => ({ title: result.title, outcome: result.outcome, findings: result.findings, consequence: result.consequence, contract: { rawIntent: result.contract.rawIntent, approach: result.contract.approach, desiredOutcome: result.contract.desiredOutcome, redLines: result.contract.redLines, retreat: result.contract.retreat } })))}\n本周公开消息：${JSON.stringify(factPack.publicSignals ?? [])}\n原段落：${JSON.stringify(original)}\n\n只返回严格 JSON：{"paragraph":"改写后的单个自然段"}。保留原段落的文风和已锁定结果，但绝不扩大行动范围。若行动只允许整理、汇总、比对公开来源，成员必须始终留在组织据点，只能阅读已经持有的公开材料；不要在输出中复述、讨论或引用禁区行为。`,
        { json: true, maxTokens: 1200, temperature: pass ? .12 : .2, stream: true, onToken },
      ));
      if (typeof raw.paragraph !== "string" || !raw.paragraph.trim()) throw new Error("文学连续性编辑没有返回可用的局部段落");
      sections[target.sectionIndex].paragraphs[target.paragraphIndex] = raw.paragraph.trim().slice(0, 1200);
    }
    repaired = { ...repaired, sections };
    issue = literaryAgencyIssue(repaired, game, local);
    if (!issue) return repaired;
  }
  throw new Error(`${issue}；两次局部连续性修复后仍未通过`);
}

export async function generateLiteraryChapter(config: AiConfig, game: GameState, local: ChronicleChapter, onStage: (value: string) => void, onToken?: (text: string) => void): Promise<ChronicleChapter> {
  const literaryMemoryView = memoryPromptBlockWithIds(game.memory, "player", "player", local.week);
  const causalPack = buildLiteraryCausalPack(game, local);
  const playerLedResult = local.results.find((result) => result.contract.executionMode === "player-led" || result.contract.leaderId === "player");
  const factPack = {
    week: local.week,
    date: local.date,
    organization: { name: game.organizationName, charter: game.charter },
    player: { name: game.playerName, address: game.playerAddress, nameExposure: game.nameExposure, pathway: PATHWAYS[game.pathwayId].name, sequence: game.currentSequence },
    results: local.results.map((result) => ({ title: result.title, outcome: result.outcome, findings: result.findings, consequence: result.consequence, abilityEffects: result.abilityEffects, reasons: result.reasons, futureChanges: result.futureChanges, contract: result.contract })),
    causality: {
      summary: causalPack.summary,
      receipts: causalPack.receipts,
      visibleWorldEvents: causalPack.events,
      paragraphSourceContract: "每个段落可声明 paragraphSources；receiptIds/eventIds 只能来自本事实包，不能自行创造或引用隐藏事件。",
    },
    activePressure: game.missions.filter((mission) => mission.state === "active"),
    discoveredEvidence: game.evidenceNodes.filter((item) => item.discovered),
    availableOpportunities: game.opportunities.filter((item) => item.state === "available"),
    worldState: (() => { const snapshot = game.worldSnapshots?.find((item) => item.week === local.week); return snapshot ? { week: snapshot.week, date: snapshot.date, publicAtmosphere: snapshot.atmosphere } : null; })(),
    publicSignals: game.worldSignals?.filter((signal) => signal.week === local.week).slice(0, 8).map((signal) => ({ ...signal, relatedFactionId: undefined })) ?? [],
    playerWorldKnowledge: game.worldKernel.knowledge.filter((node) => node.visibility === "public" || node.holderIds.includes("player") || node.holderRefs?.includes("player")).slice(-16),
    dynamicMemory: literaryMemoryView.text,
    finale: game.ending.campaign ? { stage: game.ending.campaign.stage, doctrine: game.ending.campaign.doctrine, reports: game.ending.campaign.reports.slice(0, 2), aftermath: game.ending.campaign.aftermath } : null,
    campaignWorld: { currentStageId: game.campaignWorld.currentStageId, cities: game.campaignWorld.cities.map((city) => ({ id: city.id, name: city.name, status: city.status, control: city.playerControl, intelligence: city.intelligence, pressure: city.localPressure })), postDeity: game.campaignWorld.postDeity },
    highSequenceAssets: { characteristics: game.highSequenceLedger.characteristics.filter((item) => item.holderRef === "player"), uniquenesses: game.highSequenceLedger.uniquenesses.filter((item) => item.holderRef === "player"), sefirot: game.highSequenceLedger.sefirot.filter((item) => item.holderRef === "player") },
    localReference: local.sections,
    participationDirective: playerLedResult
      ? `本周玩家亲自参与“${playerLedResult.title}”。把它写成玩家有限视角下的连续现场场景：动作、感官、他人反应与已锁定结果依次发生，不要把关键过程改写成下属报告或事后摘要；不得替玩家增加契约外选择。`
      : "本周行动均为委派执行。玩家留在组织中枢，只能通过下属回报、来信、账册和议会陈述获知行动，不得写成玩家亲历现场。",
    agencyBoundary: local.title.startsWith("终局") || local.title.startsWith("重大事件")
      ? "这是已经由重大事件规则结算的阶段。只能叙述finale.reports和aftermath里锁定的行动与代价，不得新增行动、幸存、死亡或胜利。"
      : local.results.length
      ? "玩家与组织成员只能执行results.contract中明确结算的行动，不得扩写契约之外的外出、接触、调查或取证。"
      : "本周没有任何玩家决议。玩家与组织成员不得离开据点、调查、接触、追踪、取证、获得新文件或自行决定下一步；只能阅读publicSignals、维持据点日常与观察城市公开变化。",
    forbidden: ["改变行动成败", "新增未经结算的线索", "泄露幕后真相", "替玩家决定内心信念", "擅自判定玩家死亡", "让无决议玩家或成员自行外出调查"],
  };
  const submitLiterary = (stage: string) => {
    game.memory = submitMemoryDelivery(game.memory, {
      actionId: `literary:${local.week}`,
      modelCallId: `literary:${local.week}:${stage}`,
      stage,
      audience: narratorAudience(),
      memoryIds: literaryMemoryView.ids,
      week: local.week,
    });
  };
  const system = "你为原创维多利亚神秘主义互动小说《灰雾纪事》工作。使用严格的第三人称有限视角和克制的神秘悬疑文风，不复制任何现有小说句子。严格遵守participationDirective：玩家亲自参与时写连续现场，委派执行时只能写玩家收到的回报。不要套用固定的周报结构、固定开场、固定收尾、信息分类标题或‘首先/其次/最后’式模板；根据这一周真正发生的事情自行决定场景、节奏、详略和分节数量。即使玩家没有发布命令，也要以事实包里的报纸、街谈、来信、亲历场景和可感知异常写出世界继续运行的实感。事实包故意排除了全知世界层：不得补写任何未被玩家观察到的势力行动、幕后身份、秘密工程目的或原著真相；publicAtmosphere只能用于天气与公共气氛，不能从中推导幕后主体。只能表达事实包，不能新增事实。每个段落都要尽量在 paragraphSources 中标注它实际扩写的 receiptIds/eventIds；只能使用事实包允许的 ID，无法对应时留空数组。只返回JSON。";
  if ((config.quality ?? "balanced") === "balanced") {
    onStage("小说引擎正在把规则结果写成章节");
    const written = extractJson(await callModel(config, system, `根据事实包写成600至1400字的完整章节。分节数量由内容决定，允许一段连续场景，也允许多地点交错；不要为了凑结构重复信息。正文必须自然分段，每段控制在180字以内，段落之间用空行节奏区分。返回JSON：{"title":"章名","sections":[{"heading":"自然分节名","paragraphs":["完整段落"],"paragraphSources":[{"receiptIds":["事实包中的收据ID"],"eventIds":["事实包中的事件ID"]}]}]}。paragraphSources 必须与 paragraphs 一一对应，不得改变成败或新增线索。\n事实：${JSON.stringify(factPack)}`, { json: true, maxTokens: 6200, temperature: .86, stream: true, onToken }));
    submitLiterary("writer");
    const chapter = await enforceLiteraryAgency(config, system, factPack, game, local, validateChapter(written), onStage, onToken);
    return finalizeLiteraryChapter(local, { ...local, ...chapter }, causalPack);
  }
  onStage("叙事导演正在安排重点场景");
  const director = extractJson(await callModel(config, `${system}\n你是叙事导演。`, `根据事实的戏剧重量制定600至1500字章节提纲，自行决定视角锚点、场景数量和结尾位置，不使用固定周报结构。返回JSON。\n${JSON.stringify(factPack)}`, { json: true, maxTokens: 2600, temperature: .62, stream: true, onToken }));
  submitLiterary("director");
  onStage("正文作者正在写作");
  const writer = extractJson(await callModel(config, `${system}\n你是正文作者。`, `按提纲完成正文，分节数量服从故事而不是模板。正文必须自然分段，每段控制在180字以内，避免整页无断落的长块文字。返回{"title":"章名","sections":[{"heading":"分节","paragraphs":["完整段落"],"paragraphSources":[{"receiptIds":[],"eventIds":[]}]}]}，paragraphSources 与 paragraphs 一一对应。\n提纲：${JSON.stringify(director)}\n事实：${JSON.stringify(factPack)}`, { json: true, maxTokens: 6800, temperature: .9, stream: true, onToken }));
  submitLiterary("writer");
  onStage("连续性编辑正在校对世界事实");
  const edited = extractJson(await callModel(config, `${system}\n你是连续性编辑，只能压缩、校正视角和人物语气。`, `校订并返回同样JSON。不得改变以下初稿所引用的事实；保留或收紧 paragraphSources，不得添加事实包之外的来源。\n事实：${JSON.stringify(factPack)}\n初稿：${JSON.stringify(writer)}`, { json: true, maxTokens: 6200, temperature: .35, stream: true, onToken }));
  submitLiterary("editor");
  const chapter = await enforceLiteraryAgency(config, system, factPack, game, local, validateChapter(edited), onStage, onToken);
  return finalizeLiteraryChapter(local, { ...local, ...chapter }, causalPack);
}
