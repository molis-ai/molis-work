/** W0-only view models. These are not ItemIntake/ItemAttach or input-receipt contracts. */
import type { ContextualCandidate, ContextualLayoutPlan, SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";

export type CreateTarget = "todo" | "pages" | "shelf" | "goal" | "spark";
/** What the thing in hand is. The right panel's sample sources each give one kind; `selection` is a left-side selection. */
export type HandKind = "quote" | "checklist" | "note" | "spark" | "file" | "web" | "message" | "selection";
export type HandPlace = "main" | "side" | "assistant";
export type LandingPosition = "cursor" | "selection" | "end";
export type PlaceFormat = "text" | "quote";
export interface Material { id: string; title: string; text: string; kind: "note" | "quote" | "checklist" }
export interface Hand { id: string; title: string; text: string; place: HandPlace; kind: HandKind; source: string; focus?: SurfaceFocus }
export interface Landing {
  documentId: string; version: number; revision: number; from: number; to: number;
  position: LandingPosition; label: string; detail: string;
}
export interface Placement { hand: Hand; landing: Landing; text: string; format: PlaceFormat }
export interface Choice {
  key: string; title: string; kind: "place" | "create" | "fragment";
  target?: CreateTarget; format?: PlaceFormat; fragment?: ContextualCandidate;
}
export interface Choices { primary: Choice[]; more: Choice[] }
export interface Draft { title: string; text: string; instruction: string }
export interface CreatedItem { id: string; target: CreateTarget; title: string; text: string; documentId?: string; materialId?: string }

/** Object kinds the hand would carry in the product. `browser_page` and `discussion_message` follow the repository's owner_thing
 * style (decided 2026-10-12; `web.page` / `im.message` were rejected, context-program §14). */
export const OBJECT_KIND: Record<HandKind, string> = {
  quote: "shelf_item", checklist: "shelf_item", note: "shelf_item", spark: "lingguang_spark", file: "workspace_file",
  web: "browser_page", message: "discussion_message", selection: "pages_document",
};

export const MATERIALS: readonly Material[] = [
  { id: "interview", title: "用户访谈 · 第一个项目", kind: "quote", text: "8 位受访者停在了导入数据这一步。他们需要的不是更长的试用，而是第一次就能跑通的示例。\n来源：9 月用户访谈，12 位受访者。" },
  { id: "next-week", title: "下周要验证的事", kind: "checklist", text: "下周三前，用 5 位新用户验证三步创建流程；记录完成时间、导入失败原因和需要帮助的地方。" },
  { id: "observation", title: "把下一步放在内容旁边", kind: "note", text: "读到一段有用的材料时，希望不用离开手上的内容，就能把它放进正在写的文稿。" },
];

const CREATE: Record<CreateTarget, Choice> = {
  todo: { key: "sample:create:todo", title: "记成待办", kind: "create", target: "todo" },
  shelf: { key: "sample:create:shelf", title: "收进 Shelf", kind: "create", target: "shelf" },
  pages: { key: "sample:create:pages", title: "新建文稿", kind: "create", target: "pages" },
  goal: { key: "sample:create:goal", title: "提成 Goal 提案", kind: "create", target: "goal" },
  spark: { key: "sample:create:spark", title: "记下灵光", kind: "create", target: "spark" },
};
/** Rules stand-in for the destination judgment: the most fitting place first. Shelf's own material never offers Shelf. */
const CREATE_ORDER: Record<HandKind, readonly CreateTarget[]> = {
  checklist: ["todo", "goal", "pages"], quote: ["pages", "todo"], note: ["pages", "goal", "todo"], message: ["todo", "shelf", "pages"],
  spark: ["pages", "goal", "shelf"], file: ["shelf", "todo", "pages"], web: ["shelf", "todo", "pages"], selection: ["todo", "shelf", "pages", "goal"],
};
const QUOTE_FIRST: readonly HandKind[] = ["quote", "web", "message"];

function placeChoices(hand: Hand, landing: Landing | null): Choice[] {
  if (!landing || hand.place === "main") return [];
  const plain: Choice = landing.position === "selection"
    ? { key: "sample:place:replace", title: "替换选中的文字", kind: "place", format: "text" }
    : { key: "sample:place:insert", title: landing.position === "end" ? "放到文末" : "插入到光标处", kind: "place", format: "text" };
  const quote: Choice = { key: "sample:place:quote", title: "作为引用插入", kind: "place", format: "quote" };
  // Words from someone else (an interview, a web page, a message) keep their source as a quote, even over a selection.
  return QUOTE_FIRST.includes(hand.kind) ? [quote, plain] : [plain, quote];
}

/** AC-P01 / AC-P04: click, drop and the Assistant card consume exactly this list.
 * Places and creations are destinations: they only ever sit in the recommended slots, never in More (context-program §3.3).
 * The slots alternate families (best place, best creation, …) so a narrow bar still offers both kinds of next step. */
export function choicesFor(hand: Hand, landing: Landing | null, plan?: ContextualLayoutPlan): Choices {
  const creates = CREATE_ORDER[hand.kind].map(target => CREATE[target]);
  if (hand.place !== "main") {
    const places = placeChoices(hand, landing), primary: Choice[] = [];
    for (let index = 0; index < Math.max(places.length, creates.length); index += 1) {
      if (places[index]) primary.push(places[index]!);
      if (creates[index]) primary.push(creates[index]!);
    }
    return { primary, more: [] };
  }
  const fragments = (plan?.candidates ?? []).filter(item => item.available && item.source.provider_id === "io.molis.work.pages")
    .map(fragment => ({ key: fragment.key, title: fragment.title, kind: "fragment" as const, fragment }));
  const lead = plan?.primary.map(key => fragments.find(item => item.key === key)).find(item => item !== undefined) ?? fragments[0];
  return { primary: [...(lead ? [lead] : []), ...creates], more: fragments.filter(item => item !== lead) };
}

export function visibleChoices(choices: Choices, narrow: boolean): Choices {
  const primary = choices.primary.slice(0, narrow ? 2 : 3);
  return { primary, more: [...choices.primary.slice(primary.length).filter(item => item.kind === "fragment"), ...choices.more] };
}

/** The text a placement writes. A quote carries where it came from, so the reader of the document can tell. */
export function placementText(hand: Hand, format: PlaceFormat): string {
  return format === "quote" ? `${hand.text}\n—— ${hand.source} · ${hand.title}` : hand.text;
}

export function freezePlacement(hand: Hand, landing: Landing, format: PlaceFormat = "text", text = placementText(hand, format)): Placement {
  return { hand: structuredClone(hand), landing: { ...landing }, text, format };
}

/** AC-P03 / AC-S05: any edit invalidates a placement, including edits outside the selected range. */
export function placementProblem(placement: Placement, current: Pick<Landing, "documentId" | "version" | "revision">): string | null {
  const at = placement.landing;
  if (at.documentId !== current.documentId) return "你已切换文档。请重新选择落点。";
  if (at.version !== current.version || at.revision !== current.revision) return "文档已经改变，这份预览不会写入。请重新选择落点。";
  return null;
}

/** Deliberately deterministic. The UI always labels this as a sample draft, never model understanding. */
export function sampleDraft(target: CreateTarget, instruction: string, material = ""): Draft {
  const text = material.trim() || instruction.trim();
  const title = (instruction.trim() || text).split(/[。\n]/u)[0]?.slice(0, 60) || (target === "pages" ? "新的文稿" : "新的材料");
  return { title, text, instruction };
}

export const TARGET_LABEL: Record<CreateTarget, string> = { todo: "待办", pages: "Pages", shelf: "Shelf", goal: "Goal 提案", spark: "灵光" };
/** Whether the destination declares an undo (direct, with 撤销 · 改放到) or proposes and needs a prefilled card (quick-create §8 问 3). */
export const DIRECT: Record<CreateTarget, boolean> = { todo: true, shelf: true, pages: true, goal: false, spark: true };
/** 改放到 ▾ lists the same judgment's destinations, best first, then the rest (quick-create §5 ②). */
export function destinationsFor(hand: Pick<Hand, "kind"> | undefined): CreateTarget[] {
  const ranked = hand ? [...CREATE_ORDER[hand.kind]] : [];
  return [...ranked, ...(["todo", "pages", "shelf", "goal"] as const).filter(target => !ranked.includes(target))];
}
