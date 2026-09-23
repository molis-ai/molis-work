import { Fragment, Mark, Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { bookmarkLabel, imageAlt, safePagesBookmarkTitle, safePagesHref, safePagesImageSrc } from "./link.js";
import { pagesSchema } from "./schema.js";
import { safePagesTone } from "./tone.js";

/** A tag from pasted HTML, without the browser document. */
export interface PasteLeaf {
  tag: string;
  href?: string;
  src?: string;
  /** This item is a to-do, not a plain list row. */
  task?: boolean;
  checked?: boolean;
  /** The list element itself is a to-do list. */
  tasks?: boolean;
  /** Design-system tone id for the text colour, already checked. */
  ink?: string;
  /** Design-system tone id for the background. A plain `mark` with no id becomes yellow. */
  wash?: string;
  /** This anchor is a bookmark card, not an inline link. */
  bookmark?: boolean;
  alt?: string;
  children: Array<PasteLeaf | string>;
}

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "pre", "hr", "table", "section", "article", "header",
  "figure", "tr", "thead", "tbody",
]);

function isBlock(node: PasteLeaf | string): node is PasteLeaf {
  return typeof node !== "string" && BLOCK_TAGS.has(node.tag);
}

function textOf(nodes: Array<PasteLeaf | string>): string {
  return nodes.map((node) => (typeof node === "string" ? node : textOf(node.children))).join("");
}

function withMark(marks: readonly Mark[], mark: Mark): Mark[] {
  return marks.some((item) => item.type === mark.type) ? [...marks] : [...marks, mark];
}

function marksFor(node: PasteLeaf, marks: readonly Mark[]): Mark[] {
  let next = [...marks];
  if (node.tag === "strong" || node.tag === "b") next = withMark(next, pagesSchema.marks.strong.create());
  else if (node.tag === "em" || node.tag === "i") next = withMark(next, pagesSchema.marks.em.create());
  else if (node.tag === "s" || node.tag === "strike" || node.tag === "del") next = withMark(next, pagesSchema.marks.strike.create());
  else if (node.tag === "code") next = withMark(next, pagesSchema.marks.code.create());
  else if (node.tag === "u") next = withMark(next, pagesSchema.marks.underline.create());
  else if (node.tag === "a") {
    const href = safePagesHref(node.href);
    if (href) next = withMark(next, pagesSchema.marks.link.create({ href }));
  }
  const ink = safePagesTone(node.ink);
  if (ink) next = withMark(next, pagesSchema.marks.font_color.create({ tone: ink }));
  const wash = safePagesTone(node.wash) || (node.tag === "mark" ? "yellow" : "");
  if (wash) next = withMark(next, pagesSchema.marks.highlight.create({ tone: wash }));
  return next;
}

function inlineNodes(nodes: Array<PasteLeaf | string>, marks: readonly Mark[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      const value = node.replaceAll("\u00a0", " ");
      if (value) out.push(marks.length ? pagesSchema.text(value, marks) : pagesSchema.text(value));
      continue;
    }
    if (node.tag === "script" || node.tag === "style") continue;
    if (node.tag === "br") {
      out.push(pagesSchema.nodes.hard_break.create());
      continue;
    }
    out.push(...inlineNodes(node.children, marksFor(node, marks)));
  }
  return out;
}

function paragraphFrom(nodes: Array<PasteLeaf | string>): Node | null {
  const content = inlineNodes(nodes, []);
  if (!content.some((node) => node.type === pagesSchema.nodes.hard_break || Boolean(node.text?.trim()))) return null;
  return pagesSchema.nodes.paragraph.create(null, content);
}

function itemFrom(node: PasteLeaf, task: boolean): Node {
  const inner = blocksFromPaste(node.children) ?? [];
  const blocks = inner[0]?.type === pagesSchema.nodes.paragraph ? inner : [pagesSchema.nodes.paragraph.create(), ...inner];
  const content = blocks.length ? blocks : [pagesSchema.nodes.paragraph.create()];
  if (task) return pagesSchema.nodes.task_item.create({ checked: Boolean(node.checked) }, content);
  return pagesSchema.nodes.list_item.create(null, content);
}

function cellFrom(node: PasteLeaf, header: boolean): Node {
  const blocks = blocksFromPaste(node.children) ?? [];
  const paragraphs = blocks.every((block) => block.type === pagesSchema.nodes.paragraph) && blocks.length
    ? blocks
    : [paragraphFrom(node.children) ?? pagesSchema.nodes.paragraph.create()];
  const type = header ? pagesSchema.nodes.table_header : pagesSchema.nodes.table_cell;
  return type.create(null, paragraphs);
}

function tableFrom(node: PasteLeaf): Node | null {
  const matrix: Node[][] = [];
  const collect = (el: PasteLeaf) => {
    if (el.tag !== "tr") {
      el.children.forEach((child) => {
        if (typeof child !== "string") collect(child);
      });
      return;
    }
    const cells: Node[] = [];
    el.children.forEach((child) => {
      if (typeof child !== "string" && (child.tag === "td" || child.tag === "th")) cells.push(cellFrom(child, child.tag === "th"));
    });
    if (cells.length) matrix.push(cells);
  };
  collect(node);
  if (!matrix.length) return null;
  const width = Math.max(...matrix.map((row) => row.length));
  const rows = matrix.map((cells) => {
    while (cells.length < width) cells.push(pagesSchema.nodes.table_cell.create(null, pagesSchema.nodes.paragraph.create()));
    return pagesSchema.nodes.table_row.create(null, cells);
  });
  return pagesSchema.nodes.table.create(null, rows);
}

function blockFrom(node: PasteLeaf): Node[] {
  if (node.tag === "script" || node.tag === "style") return [];
  if (node.tag === "hr") return [pagesSchema.nodes.horizontal_rule.create()];
  if (node.tag === "img") {
    const src = safePagesImageSrc(node.src);
    if (!src) return [];
    return [pagesSchema.nodes.image.create({ src, alt: node.alt || imageAlt(src) })];
  }
  if (node.tag === "a" && node.bookmark) {
    const href = safePagesHref(node.href);
    if (!href) return [];
    const title = safePagesBookmarkTitle(textOf(node.children)) || bookmarkLabel(href);
    return [pagesSchema.nodes.bookmark.create({ href, title })];
  }
  if (node.tag === "pre") {
    const value = textOf(node.children).replace(/^\n/u, "").replace(/\n$/u, "");
    return [pagesSchema.nodes.code_block.create(null, value ? pagesSchema.text(value) : undefined)];
  }
  if (node.tag === "ul" || node.tag === "ol") {
    const task = node.tag === "ul" && (node.tasks || node.children.some((child) => typeof child !== "string" && child.task));
    const items = node.children.flatMap((child) => (typeof child !== "string" && child.tag === "li" ? [itemFrom(child, task)] : []));
    if (!items.length) return [];
    if (node.tag === "ol") return [pagesSchema.nodes.ordered_list.create({ order: 1 }, items)];
    if (task) return [pagesSchema.nodes.task_list.create(null, items)];
    return [pagesSchema.nodes.bullet_list.create(null, items)];
  }
  if (node.tag === "table") {
    const table = tableFrom(node);
    return table ? [table] : [];
  }
  if (node.tag === "blockquote") {
    const inner = blocksFromPaste(node.children) ?? [];
    return [pagesSchema.nodes.blockquote.create(null, inner.length ? inner : [pagesSchema.nodes.paragraph.create()])];
  }
  const level = /^h([1-6])$/u.exec(node.tag);
  if (level) {
    const content = inlineNodes(node.children, []);
    if (!content.length) return [];
    return [pagesSchema.nodes.heading.create({ level: Math.min(3, Number(level[1])) }, content)];
  }
  if (node.children.some(isBlock)) return blocksFromPaste(node.children) ?? [];
  const paragraph = paragraphFrom(node.children);
  return paragraph ? [paragraph] : [];
}

/** Turn a small HTML tree into blocks. Scripts and unsafe links are dropped. */
export function blocksFromPaste(nodes: Array<PasteLeaf | string>): Node[] | null {
  const blocks: Node[] = [];
  const bucket: Array<PasteLeaf | string> = [];
  const flush = () => {
    if (!bucket.length) return;
    const paragraph = paragraphFrom(bucket);
    bucket.length = 0;
    if (paragraph) blocks.push(paragraph);
  };
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    if (typeof node === "string") {
      if (node.trim()) bucket.push(node);
      index += 1;
      continue;
    }
    if (node.tag === "a" && node.bookmark) {
      flush();
      blocks.push(...blockFrom(node));
      index += 1;
      continue;
    }
    if (node.tag === "li") {
      flush();
      const items: PasteLeaf[] = [];
      while (index < nodes.length) {
        const current = nodes[index];
        if (typeof current === "string") {
          if (!current.trim()) {
            index += 1;
            continue;
          }
          break;
        }
        if (current.tag !== "li") break;
        items.push(current);
        index += 1;
      }
      const task = items.some((item) => item.task);
      const built = items.map((item) => itemFrom(item, task));
      blocks.push((task ? pagesSchema.nodes.task_list : pagesSchema.nodes.bullet_list).create(null, built));
      continue;
    }
    if (!isBlock(node)) {
      bucket.push(node);
      index += 1;
      continue;
    }
    flush();
    blocks.push(...blockFrom(node));
    index += 1;
  }
  flush();
  return blocks.length ? blocks : null;
}

/** Paste HTML blocks into an empty paragraph, or one paragraph's words into the current selection. */
export function pasteHtml(state: EditorState, nodes: Array<PasteLeaf | string>) {
  const blocks = blocksFromPaste(nodes);
  if (!blocks?.length) return null;
  const { $from, from, to, empty } = state.selection;
  if ($from.parent.type.spec.code) return null;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0 || $from.depth < 1) {
    if (blocks.length !== 1 || blocks[0].type !== pagesSchema.nodes.paragraph || !$from.sameParent(state.selection.$to) || !$from.parent.isTextblock) return null;
    const tr = state.tr.replaceWith(from, to, blocks[0].content);
    const end = Math.min(from + blocks[0].content.size, tr.doc.content.size);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(end), -1));
  }
  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (!container.canReplace(index, index + 1, Fragment.from(blocks))) return null;
  const tr = state.tr.replaceWith($from.before(), $from.after(), Fragment.from(blocks));
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min($from.before() + 1, tr.doc.content.size)), 1));
}
