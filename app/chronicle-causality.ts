import type { ActionCausalReceipts, ChronicleChapter, GameState } from "./game-model.ts";
import type { PersistentWorldEvent, WorldObservation } from "./world-kernel.ts";

export type LiteraryReceiptCategory = keyof ActionCausalReceipts;

export type LiteraryReceipt = ActionCausalReceipts[LiteraryReceiptCategory][number] & {
  category: LiteraryReceiptCategory;
};

export type LiteraryEventSource = Pick<PersistentWorldEvent, "id" | "week" | "title" | "detail" | "locationId" | "actorIds" | "factionIds" | "causeIds" | "visibility" | "witnessRefs" | "sourceProposalIds">;

export type ParagraphCausalSource = {
  receiptIds: string[];
  eventIds: string[];
};

export type LiteraryCausalPack = {
  receipts: LiteraryReceipt[];
  events: LiteraryEventSource[];
  summary: string;
  allowedReceiptIds: string[];
  allowedEventIds: string[];
};

const RECEIPT_CATEGORIES: LiteraryReceiptCategory[] = ["people", "resources", "locations", "knowledge", "relationships", "futureCauses"];

function uniqueStrings(values: unknown[], limit = 24) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))].slice(0, limit);
}

function playerCanSeeEvent(event: PersistentWorldEvent, observations: WorldObservation[]) {
  if (event.visibility === "public" || event.visibility === "player") return true;
  if (event.witnessRefs?.some((ref) => ["player", "organization", "actor:player"].includes(ref))) return true;
  return observations.some((observation) => observation.eventId === event.id
    && (observation.visibility === "public" || observation.visibility === "player")
    && observation.holderRefs?.some((ref) => ["player", "organization", "actor:player"].includes(ref)));
}

function refLabel(game: GameState, ref: string) {
  if (ref === "player") return "你";
  if (ref === "organization") return "组织";
  if (ref.startsWith("actor:")) {
    const id = ref.slice("actor:".length);
    return game.members.find((member) => member.id === id)?.name
      ?? game.worldKernel.actors.find((actor) => actor.id === id)?.name
      ?? "相关人物";
  }
  if (ref.startsWith("faction:")) return game.factions.find((faction) => faction.id === ref.slice("faction:".length))?.name ?? "相关势力";
  if (ref.startsWith("location:")) return game.worldKernel.locations.find((location) => location.id === ref.slice("location:".length))?.name ?? "相关地点";
  return ref;
}

function compactSummary(values: string[], fallback: string, limit = 3) {
  const compact = uniqueStrings(values, limit).map((value) => value.slice(0, 150));
  return compact.length ? compact.join("；") : fallback;
}

export function buildLiteraryCausalPack(game: GameState, chapter: ChronicleChapter): LiteraryCausalPack {
  const kernelEvents = game.worldKernel.events.filter((event) => event.week === chapter.week && playerCanSeeEvent(event, game.worldKernel.observations));
  const visibleEventIds = new Set(kernelEvents.map((event) => event.id));
  const receipts = chapter.results.flatMap((result) => RECEIPT_CATEGORIES.flatMap((category) => (result.causalReceipts?.[category] ?? []).flatMap((receipt) => {
    const sourceEventIds = receipt.sourceEventIds.filter((id) => visibleEventIds.has(id));
    if (receipt.sourceEventIds.length > 0 && sourceEventIds.length === 0) return [];
    return [{ ...receipt, category, sourceEventIds }];
  }))).filter((receipt) => receipt.summary.trim().length > 0);
  const receiptEventIds = new Set(receipts.flatMap((receipt) => receipt.sourceEventIds));
  const relatedEvents = kernelEvents.filter((event) => receiptEventIds.has(event.id) || event.visibility === "public" || event.visibility === "player").slice(0, 18);
  const eventSources = relatedEvents.map(({ id, week, title, detail, locationId, actorIds, factionIds, causeIds, visibility, witnessRefs, sourceProposalIds }) => ({ id, week, title, detail, locationId, actorIds, factionIds, causeIds, visibility, witnessRefs, sourceProposalIds }));
  const changes = receipts.filter((receipt) => ["people", "resources", "locations", "knowledge"].includes(receipt.category)).map((receipt) => receipt.summary);
  const knowers = [...new Set(eventSources.flatMap((event) => [...(event.witnessRefs ?? []), ...game.worldKernel.observations.filter((observation) => observation.eventId === event.id).flatMap((observation) => observation.holderRefs ?? [])]).map((ref) => refLabel(game, ref)))];
  const relationships = receipts.filter((receipt) => receipt.category === "relationships").map((receipt) => receipt.summary);
  const futureCauses = receipts.filter((receipt) => receipt.category === "futureCauses").map((receipt) => receipt.summary);
  const summary = [
    `发生变化：${compactSummary(changes, "规则结果没有记录新的可见变化")}`,
    `谁知道：${compactSummary(knowers, "知情范围仍限于现有记录")}`,
    `关系改变：${compactSummary(relationships, "没有形成新的可确认关系变化")}`,
    `后续因果：${compactSummary(futureCauses, "暂未留下明确的后续因果线")}`,
  ].join("。 ");
  return {
    receipts: receipts.slice(0, 36),
    events: eventSources,
    summary,
    allowedReceiptIds: receipts.map((receipt) => receipt.id),
    allowedEventIds: eventSources.map((event) => event.id),
  };
}

export function normalizeParagraphSources(value: unknown, paragraphCount: number, pack: LiteraryCausalPack): ParagraphCausalSource[] {
  const sourceList = Array.isArray(value) ? value : [];
  return Array.from({ length: paragraphCount }, (_, index) => {
    const raw = sourceList[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { receiptIds: [], eventIds: [] };
    const record = raw as Record<string, unknown>;
    return {
      receiptIds: uniqueStrings(Array.isArray(record.receiptIds) ? record.receiptIds : [], 6).filter((id) => pack.allowedReceiptIds.includes(id)),
      eventIds: uniqueStrings(Array.isArray(record.eventIds) ? record.eventIds : [], 6).filter((id) => pack.allowedEventIds.includes(id)),
    };
  });
}

export function attachFallbackParagraphSources(paragraph: string, pack: LiteraryCausalPack): ParagraphCausalSource {
  const normalized = paragraph.trim();
  const receipt = pack.receipts.find((candidate) => normalized.includes(candidate.summary.slice(0, 12)));
  const event = pack.events.find((candidate) => normalized.includes(candidate.title.slice(0, 10)));
  return {
    receiptIds: receipt ? [receipt.id] : [],
    eventIds: event ? [event.id] : [],
  };
}

export function chronicleSummaryFromCausality(game: GameState, chapter: ChronicleChapter) {
  return buildLiteraryCausalPack(game, chapter).summary;
}

export function advancementRetrospective(game: GameState, nextRank: number): ChronicleChapter {
  const sequenceName = game.pathwayId && game.currentSequence > 0
    ? `${game.currentSequence}至${nextRank}序列的晋升`
    : `序列${nextRank}晋升`;
  const remembered = game.chronicle.slice(0, 6).flatMap((chapter) => chapter.results.flatMap((result) => [
    ...(result.causalReceipts?.knowledge ?? []),
    ...(result.causalReceipts?.relationships ?? []),
    ...(result.causalReceipts?.futureCauses ?? []),
  ]).map((receipt) => receipt.summary)).slice(0, 8);
  const paragraphs = [
    `晋升不是一张凭空出现的许可。${sequenceName}之前留下的每一次核验、妥协与撤退，都在今天成为必须承担的前置条件。`,
    remembered.length ? `阶段回望只保留已经写入纪事的回声：${remembered.slice(0, 4).join("；")}。` : "阶段回望没有替组织补写缺失的经历；能够确认的只有已经保存的纪事与晋升记录。",
    `新的序列改变了你能够承担的尺度，也改变了世界回应你的方式。接下来的因果仍从此刻向前生长，已经发生的历史不会因为晋升被重写。`,
  ];
  return {
    id: `chapter:advancement:${game.week}:${nextRank}`,
    week: game.week,
    date: game.date,
    title: `阶段回望 · 序列${nextRank}`,
    source: "local",
    sections: [{ heading: "晋升之后", paragraphs }],
    results: [],
    summary: `阶段回望：序列${nextRank}已经确认；${paragraphs[1]}`,
  };
}
