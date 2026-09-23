import { Node } from "prosemirror-model";
import { pagesSchema } from "./schema.js";

const LISTS = new Set(["bullet_list", "ordered_list", "task_list"]);
const ITEMS = new Set(["list_item", "task_item"]);
const WRAPPERS = new Set(["callout", "toggle", "blockquote"]);
const TARGETS = new Set(["paragraph", "heading1", "heading2", "heading3", "code_block", ...LISTS, ...WRAPPERS]);

function children(node: Node): Node[] {
  const result: Node[] = [];
  node.forEach((child) => result.push(child));
  return result;
}

function sameKind(id: string, node: Node): boolean {
  if (id.startsWith("heading")) return node.type.name === "heading" && node.attrs.level === Number(id.at(-1));
  return node.type.name === id;
}

/** A type change carries notes; a change to the same type keeps every attribute. */
function withNote(node: Node, note: unknown): Node | null {
  if (!note || node.attrs.note === note) return node;
  if (!("note" in node.attrs)) return null;
  const combined = node.attrs.note ? `${String(note)}\n${String(node.attrs.note)}` : String(note);
  return node.type.create({ ...node.attrs, note: combined }, node.content, node.marks);
}

function textBlock(id: string, source: Node): Node {
  if (sameKind(id, source)) return source;
  const type = id === "paragraph" ? pagesSchema.nodes.paragraph : pagesSchema.nodes.heading;
  return type.create({ note: source.attrs.note || "", ...(id === "paragraph" ? {} : { level: Number(id.at(-1)) }) }, source.content);
}

/** Unwrap only the selected container. Descendant blocks keep their own structure. */
function bodyBlocks(source: Node): Node[] | null {
  const name = source.type.name;
  if (source.isTextblock) return [source];
  if (ITEMS.has(name) || WRAPPERS.has(name)) return children(source);
  if (LISTS.has(name)) return children(source).flatMap(children);
  if (name === "horizontal_rule") return [pagesSchema.nodes.paragraph.create({ note: source.attrs.note || "" })];
  return null;
}

function listItems(source: Node, target: "bullet_list" | "ordered_list" | "task_list"): Node[] | null {
  const type = target === "task_list" ? pagesSchema.nodes.task_item : pagesSchema.nodes.list_item;
  const make = (blocks: Node[], original?: Node): Node => {
    const first = blocks[0];
    const content = first?.isTextblock
      ? [textBlock("paragraph", first), ...blocks.slice(1)]
      : [pagesSchema.nodes.paragraph.create(), ...blocks];
    if (original?.type === type) return original;
    return type.create(target === "task_list" ? { checked: original?.attrs.checked ?? false } : null, content);
  };
  if (LISTS.has(source.type.name)) return children(source).map((item) => make(children(item), item));
  if (ITEMS.has(source.type.name)) return [make(children(source), source)];
  const blocks = bodyBlocks(source);
  if (!blocks) return null;
  const groups: Node[][] = [];
  for (const block of blocks) {
    if (block.isTextblock || groups.length === 0) groups.push([block]);
    else groups[groups.length - 1].push(block);
  }
  return groups.map((group) => make(group));
}

/** Code deliberately removes text styling, but never discards non-text content. */
function codeText(source: Node): string | null {
  let safe = true;
  source.descendants((node) => {
    if (node.isInline && !node.isText && node.type.name !== "hard_break") safe = false;
    if (node.isBlock && !node.isTextblock && !LISTS.has(node.type.name) && !ITEMS.has(node.type.name) && !WRAPPERS.has(node.type.name)) safe = false;
    if (node.isAtom && node.isBlock) safe = false;
  });
  if (!safe) return null;
  return source.textBetween(0, source.content.size, "\n", "\n");
}

/**
 * Pure conversion probe used by commands and menus. Unsupported source/target
 * structures return null. Nested blocks are carried intact, never reduced to text.
 */
export function convertedNodes(id: string, sources: readonly Node[]): Node[] | null {
  if (!TARGETS.has(id) || !sources.length) return null;
  if (sources.every((source) => sameKind(id, source))) return [...sources];
  const bodies = sources.map(bodyBlocks);
  if (bodies.some((body) => body == null)) return null;
  const blocks = bodies.flatMap((body) => body!);
  const note = sources.filter((source) => !source.isTextblock).map((source) => String(source.attrs.note || "")).filter(Boolean).join("\n");
  if (id === "code_block") {
    const parts = sources.map(codeText);
    if (parts.some((part) => part == null)) return null;
    const text = parts.join("\n");
    const notes: string[] = [];
    for (const source of sources) {
      if (source.attrs.note) notes.push(String(source.attrs.note));
      source.descendants((node) => { if (node.attrs.note) notes.push(String(node.attrs.note)); });
    }
    return [pagesSchema.nodes.code_block.create({ note: notes.join("\n") }, text ? pagesSchema.text(text) : null)];
  }
  if (LISTS.has(id)) {
    const items = sources.flatMap((source) => listItems(source, id as "bullet_list" | "ordered_list" | "task_list")!);
    return [pagesSchema.nodes[id].create({ note }, items)];
  }
  if (WRAPPERS.has(id)) {
    const content = [...blocks];
    if (id === "toggle" && content[0]?.type !== pagesSchema.nodes.paragraph) {
      if (content[0]?.isTextblock) content[0] = textBlock("paragraph", content[0]);
      else content.unshift(pagesSchema.nodes.paragraph.create());
    }
    return [pagesSchema.nodes[id].create({ note }, content)];
  }
  const result: Node[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    const converted = bodies[index]!.map((block) => block.isTextblock ? textBlock(id, block) : block);
    if (converted.length) {
      const first = withNote(converted[0], sources[index].attrs.note);
      if (!first) return null;
      converted[0] = first;
    }
    result.push(...converted);
  }
  return result;
}

export function convertedBlocks(id: string, source: Node): Node[] | null {
  return convertedNodes(id, [source]);
}
