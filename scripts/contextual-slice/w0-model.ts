/** W0-only view models. These are not ItemIntake/ItemAttach or input-receipt contracts. */
import type { ContextualCandidate, ContextualLayoutPlan, SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";

export type CreateTarget = "todo" | "pages" | "shelf";
export interface Material { id: string; title: string; text: string; kind: "note" | "quote" | "checklist" }
export interface Hand { id: string; title: string; text: string; place: "main" | "side"; focus?: SurfaceFocus }
export interface Landing {
  documentId: string; version: number; revision: number; from: number; to: number; label: string;
}
export interface Placement { hand: Hand; landing: Landing; text: string }
export interface Choice { key: string; title: string; kind: "place" | "create" | "fragment"; target?: CreateTarget; fragment?: ContextualCandidate }
export interface Choices { primary: Choice[]; more: Choice[] }
export interface Draft { title: string; text: string; instruction: string }
export interface CreatedItem { id: string; target: CreateTarget; title: string; text: string; documentId?: string; materialId?: string }

export const MATERIALS: readonly Material[] = [
  { id: "interview", title: "用户访谈 · 第一个项目", kind: "quote", text: "8 位受访者停在了导入数据这一步。他们需要的不是更长的试用，而是第一次就能跑通的示例。\n来源：9 月用户访谈，12 位受访者。" },
  { id: "next-week", title: "下周要验证的事", kind: "checklist", text: "下周三前，用 5 位新用户验证三步创建流程；记录完成时间、导入失败原因和需要帮助的地方。" },
  { id: "observation", title: "把下一步放在内容旁边", kind: "note", text: "读到一段有用的材料时，希望不用离开手上的内容，就能把它放进正在写的文稿。" },
];

/** AC-P01 / AC-P04: click, drop and the Assistant preview consume exactly this list. */
export function choicesFor(hand: Hand, landing: Landing | null, plan?: ContextualLayoutPlan): Choices {
  const creates: Choice[] = [
    { key: "sample:create:todo", title: "记成待办", kind: "create", target: "todo" },
    { key: "sample:create:pages", title: "新建文稿", kind: "create", target: "pages" },
  ];
  const fragments = (plan?.candidates ?? []).filter(item => item.available && item.source.provider_id === "io.molis.work.pages")
    .map(fragment => ({ key: fragment.key, title: fragment.title, kind: "fragment" as const, fragment }));
  if (hand.place === "side") return {
    primary: [...(landing ? [{ key: "sample:place", title: landing.from === landing.to ? "插入到光标处" : "替换左侧选区", kind: "place" as const }] : []), ...creates],
    more: [],
  };
  const lead = plan?.primary.map(key => fragments.find(item => item.key === key)).find(item => item !== undefined) ?? fragments[0];
  return { primary: [...(lead ? [lead] : []), ...creates], more: fragments.filter(item => item !== lead) };
}

export function visibleChoices(choices: Choices, narrow: boolean): Choices {
  const primary = choices.primary.slice(0, narrow ? 2 : 3);
  return { primary, more: [...choices.primary.slice(primary.length).filter(item => item.kind !== "create"), ...choices.more] };
}

export function freezePlacement(hand: Hand, landing: Landing, text = hand.text): Placement {
  return { hand: structuredClone(hand), landing: { ...landing }, text };
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

export const TARGET_LABEL: Record<CreateTarget, string> = { todo: "待办", pages: "Pages", shelf: "Shelf" };
