import { ResolvedPos } from "prosemirror-model";
import { pagesSchema } from "./schema.js";

/** What an empty block should whisper, decided by the block itself and by what holds it. */
export function blockPlaceholder($pos: ResolvedPos): string {
  const s = pagesSchema;
  const node = $pos.parent;
  if (!node.isTextblock || node.content.size > 0) return "";
  if (node.type === s.nodes.heading) return "标题 " + String(node.attrs.level);
  if (node.type !== s.nodes.paragraph) return "";
  const holder = $pos.depth > 0 ? $pos.node($pos.depth - 1) : null;
  if (holder?.type === s.nodes.list_item) return "列表项";
  if (holder?.type === s.nodes.task_item) return "待办事项";
  if (holder?.type === s.nodes.callout) return "想强调的话";
  if (holder?.type === s.nodes.blockquote) return "引用";
  if (holder?.type === s.nodes.toggle) return "折叠起来的内容";
  if (holder?.type === s.nodes.column) return "这一栏";
  // Table cells stay bare; a hint in every cell reads as noise rather than help.
  if (holder?.type === s.nodes.table_cell || holder?.type === s.nodes.table_header) return "";
  return "输入 / 插入块，或直接写";
}
