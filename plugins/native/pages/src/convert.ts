import { Fragment, Node } from "prosemirror-model";
import { pagesSchema } from "./schema.js";

/** Inline runs a block carries, one per line a conversion should produce. */
function blockLines(node: Node): Fragment[] {
  const s = pagesSchema;
  if (node.isTextblock) return [node.content];
  if (node.type === s.nodes.list_item || node.type === s.nodes.task_item) {
    const first = node.firstChild;
    return [first?.isTextblock ? first.content : Fragment.empty];
  }
  const lines: Fragment[] = [];
  if (node.type === s.nodes.bullet_list || node.type === s.nodes.ordered_list || node.type === s.nodes.task_list) {
    node.forEach((item) => {
      const first = item.firstChild;
      if (first?.isTextblock) lines.push(first.content);
    });
  } else if (node.type === s.nodes.callout || node.type === s.nodes.toggle || node.type === s.nodes.blockquote) {
    node.forEach((child) => {
      if (child.isTextblock) lines.push(child.content);
    });
  }
  return lines.length ? lines : [Fragment.empty];
}

const CARRY = new Set([
  "paragraph", "heading", "code_block",
  "list_item", "task_item",
  "bullet_list", "ordered_list", "task_list",
  "callout", "toggle", "blockquote",
]);

function blocksFromLines(id: string, lines: Fragment[], plain: string): Node[] | null {
  const s = pagesSchema;
  const para = (content: Fragment) => s.nodes.paragraph.create(null, content);
  if (id === "paragraph") return lines.map(para);
  if (id === "heading1" || id === "heading2" || id === "heading3") {
    const level = Number(id.slice(-1));
    return lines.map((content) => s.nodes.heading.create({ level }, content));
  }
  if (id === "bullet_list") {
    return [s.nodes.bullet_list.create(null, lines.map((content) => s.nodes.list_item.create(null, para(content))))];
  }
  if (id === "ordered_list") {
    return [s.nodes.ordered_list.create({ order: 1 }, lines.map((content) => s.nodes.list_item.create(null, para(content))))];
  }
  if (id === "task_list") {
    return [s.nodes.task_list.create(null, lines.map((content) => s.nodes.task_item.create({ checked: false }, para(content))))];
  }
  if (id === "callout") return [s.nodes.callout.create({ tone: "info" }, lines.map(para))];
  if (id === "blockquote") return [s.nodes.blockquote.create(null, lines.map(para))];
  if (id === "toggle") return [s.nodes.toggle.create({ open: true }, lines.map(para))];
  if (id === "code_block") {
    return [plain ? s.nodes.code_block.create(null, s.text(plain)) : s.nodes.code_block.create()];
  }
  return null;
}

/** Rebuild `source` as block type `id`, carrying its text across. Null when the id is not convertible. */
export function convertedBlocks(id: string, source: Node): Node[] | null {
  return blocksFromLines(id, blockLines(source), source.textContent);
}

/**
 * Rebuild several sibling blocks as one conversion. A list or callout absorbs
 * every line; headings stay one block per line. A table in the group refuses.
 */
export function convertedNodes(id: string, sources: readonly Node[]): Node[] | null {
  if (!sources.length) return null;
  if (sources.length === 1) return convertedBlocks(id, sources[0]);
  if (sources.some((node) => !CARRY.has(node.type.name))) return null;
  const lines = sources.flatMap((node) => blockLines(node));
  const plain = sources.map((node) => node.textContent).filter((part) => part.length > 0).join("\n");
  return blocksFromLines(id, lines, plain);
}
