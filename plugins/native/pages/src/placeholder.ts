import { ResolvedPos } from "prosemirror-model";
import { pagesSchema } from "./schema.js";

/** What an empty block should whisper, decided by the block itself and by what holds it. */
export function blockPlaceholder($pos: ResolvedPos): string {
  const s = pagesSchema;
  const node = $pos.parent;
  if (!node.isTextblock || node.content.size > 0) return "";
  if (node.type === s.nodes.code_block) return "pages.editor.code";
  if (node.type === s.nodes.heading) return ["pages.editor.heading-1", "pages.editor.heading-2", "pages.editor.heading-3"][Number(node.attrs.level) - 1] ?? "";
  if (node.type !== s.nodes.paragraph) return "";
  const holder = $pos.depth > 0 ? $pos.node($pos.depth - 1) : null;
  if (holder?.type === s.nodes.list_item) return "pages.editor.list-item";
  if (holder?.type === s.nodes.task_item) return "pages.editor.to-do";
  if (holder?.type === s.nodes.callout) return "pages.editor.something-worth-calling-out";
  if (holder?.type === s.nodes.blockquote) return "pages.editor.quote";
  if (holder?.type === s.nodes.toggle) return "pages.editor.hidden-inside-the-toggle";
  if (holder?.type === s.nodes.column) return "pages.editor.this-column";
  // Table cells stay bare; a hint in every cell reads as noise rather than help.
  if (holder?.type === s.nodes.table_cell || holder?.type === s.nodes.table_header) return "";
  return "pages.editor.type-to-insert-a-block-or-just-write";
}
