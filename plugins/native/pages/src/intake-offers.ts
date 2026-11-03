import type { FragmentActionOffer, FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * 「存为文档」 for what the person has in hand (context-program §21.10): the whole input of `pages.create` from a passage, with no
 * model. The title is the heading the passage is under, else its own first line; the text is the passage as it was selected, and the
 * last line says where it came from. A blank selection, one word and whole objects give nothing: there is no document in them.
 */
export const PAGES_DOCUMENT_INTAKE = "document";

const TITLE_MAX = 80;
const SOURCE_MAX = 80;
/** Cut to `max` whole characters (the length Pages checks a title by), the last of them 「…」; an emoji is one character and is never cut in half. */
const clip = (text: string, max: number) => {
  const characters = [...text];
  return characters.length <= max ? text : characters.slice(0, max - 1).join("") + "…";
};
/** A list marker, quote mark or heading hash is not part of a title (“1.”, “-”, “##”); a number that is content (“2026 年”) stays. */
const MARKER = /^\s*(?:#{1,6}\s+|[-*•>]\s+|\d{1,2}[.、)）]\s*)/u;
const firstLine = (text: string) => text.split(/\r?\n/u).map(line => line.replace(MARKER, "").trim()).find(Boolean) ?? "";

export function preparePagesIntakeOffers(input: FragmentOffersInput): FragmentActionOffer[] {
  const { fragment, request_id } = input;
  if (fragment.granularity === "word" || fragment.granularity === "object" || fragment.granularity === "objects") return [];
  const parts = fragment.targets.map(target => ({ role: target.role, text: target.text.trim(), truncated: target.truncated === true })).filter(part => part.text);
  if (!parts.length) return [];
  const nearest = (fragment.heading_path ?? []).map(heading => heading.trim()).filter(Boolean).at(-1) ?? "";
  const title = clip((parts[0]!.role === "heading" ? firstLine(parts[0]!.text) : nearest) || firstLine(parts[0]!.text), TITLE_MAX);
  const source = fragment.object.title?.trim();
  const markdown = [...parts.map(part => part.role === "heading" ? `## ${part.text}` : part.text), ...(source ? [`摘自『${clip(source, SOURCE_MAX)}』`] : [])].join("\n\n");
  const cut = parts.some(part => part.truncated) ? "（选中的内容太长，只存了前面的部分）" : "";
  return [{ offer_id: PAGES_DOCUMENT_INTAKE, title: "存为文档", action: { capability_id: "pages.create", version: 2 },
    input: { ...(title ? { title } : {}), markdown, request_id: request_id.slice(0, 160) },
    summary: `${title ? `存为文档：「${title}」` : "存为文档"}${cut}`, editable: ["title", "markdown"] }];
}
