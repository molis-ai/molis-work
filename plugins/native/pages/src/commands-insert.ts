// Insert slash choices, pasted gap content, and media at the current row.
import { Fragment, Node } from "prosemirror-model";
import { pagesSchema } from "./schema.js";
import { Command, EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { bookmarkLabel, imageAlt, safePagesBookmarkTitle, safePagesHref, safePagesImageCaption, safePagesImageSrc, safePagesImageWidth } from "./link.js";
import { blocksFromMarkdown } from "./paste-markdown.js";
import { LIST_PARENT, blockPos, caretAt, rowUnderSelection, slashSession } from "./commands-selection.js";
import { replaceEnclosingRow } from "./commands-blocks.js";


function insertNodeAfter(doc: Node, rowPos: number, node: Node): { from: number; to: number; nodes: Node[] } | null {
  const row = doc.nodeAt(rowPos);
  if (!row) return null;
  const $pos = doc.resolve(rowPos);
  const parent = $pos.parent;
  const index = $pos.index();
  if (parent.canReplace(index + 1, index + 1, Fragment.from(node))) {
    const at = rowPos + row.nodeSize;
    return { from: at, to: at, nodes: [node] };
  }
  if (!LIST_PARENT.has(parent.type.name) || $pos.depth < 1) return null;
  const before: Node[] = [];
  const after: Node[] = [];
  parent.forEach((child, _offset, childIndex) => {
    if (childIndex <= index) before.push(child);
    else after.push(child);
  });
  const pieces: Node[] = [];
  if (before.length) pieces.push(parent.type.create(parent.attrs, before));
  pieces.push(node);
  if (after.length) pieces.push(parent.type.create(parent.attrs, after));
  const listPos = $pos.before();
  const grand = doc.resolve(listPos);
  if (!grand.parent.canReplace(grand.index(), grand.index() + 1, Fragment.from(pieces))) return null;
  return { from: listPos, to: listPos + parent.nodeSize, nodes: pieces };
}

function slashHostOffset(row: Node): number | null {
  if (row.isTextblock && !row.type.spec.code) return 0;
  const first = row.firstChild;
  const named = row.type.name === "list_item" || row.type.name === "task_item"
    || row.type.name === "callout" || row.type.name === "blockquote" || row.type.name === "toggle";
  if (named && first?.isTextblock && !first.type.spec.code) return 1;
  return null;
}

function slashBlockFor(parentName: string): Node {
  const paragraph = pagesSchema.nodes.paragraph.create(null, pagesSchema.text("/"));
  if (parentName === "bullet_list" || parentName === "ordered_list") {
    return pagesSchema.nodes.list_item.create(null, paragraph);
  }
  if (parentName === "task_list") {
    return pagesSchema.nodes.task_item.create({ checked: false }, paragraph);
  }
  return paragraph;
}

function caretAfterSlash(node: Node): number {
  return node.isTextblock ? 2 : 3;
}

/**
 * The block handle's plus. An empty text row receives `/` in place so the slash
 * menu opens there. A row that already has words gets a new sibling below it.
 */

export function insertSlashBelow(state: EditorState, rowPos: number, where: "auto" | "after" = "auto") {
  if (rowPos < 0 || rowPos > state.doc.content.size) return null;
  const row = state.doc.nodeAt(rowPos);
  if (!row) return null;
  if (where === "auto") {
    const host = slashHostOffset(row);
    if (host != null && row.textContent === "") {
      const at = rowPos + host + 1;
      const tr = state.tr.insertText("/", at);
      return tr.setSelection(TextSelection.create(tr.doc, at + 1));
    }
  }
  const parentName = state.doc.resolve(rowPos).parent.type.name;
  const block = slashBlockFor(parentName);
  const plan = insertNodeAfter(state.doc, rowPos, block);
  if (!plan) return null;
  const tr = state.tr.replaceWith(plan.from, plan.to, plan.nodes);
  const origin = plan.nodes[0] === block ? plan.from : plan.from + plan.nodes[0].nodeSize;
  return tr.setSelection(TextSelection.create(tr.doc, origin + caretAfterSlash(block)));
}

/**
 * The gap line stays blank until there is real input. Empty or whitespace-only
 * text inserts nothing. A lone URL becomes a bookmark; other text becomes blocks.
 */
export function commitGap(state: EditorState, afterIndex: number, raw: string) {
  if (afterIndex < 0 || afterIndex >= state.doc.childCount) return null;
  if (!raw.trim()) return null;
  const at = blockPos(state.doc, afterIndex) + state.doc.child(afterIndex).nodeSize;
  const trimmed = raw.trim();
  const image = safePagesImageSrc(trimmed);
  const href = !image && /^\S+$/u.test(trimmed) ? safePagesHref(trimmed) : "";
  const blocks = image
    ? [pagesSchema.nodes.image.create({ src: image, alt: image.startsWith("data:") ? "图片" : imageAlt(image) })]
    : href
      ? [pagesSchema.nodes.bookmark.create({ href, title: bookmarkLabel(href) })]
      : blocksFromMarkdown(raw) ?? [pagesSchema.nodes.paragraph.create(null, [pagesSchema.text(raw)])];
  const tr = state.tr.insert(at, blocks);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + blocks[0].nodeSize, tr.doc.content.size)), -1));
}

/** Set an image's pixel width. Zero restores the full line. Other blocks are left alone. */
export function setImageWidth(state: EditorState, pos: number, width: number) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.image) return null;
  const next = safePagesImageWidth(width);
  if (next === safePagesImageWidth(node.attrs.width)) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: next });
}

/** Set the one-line caption under an image. The address, alt text, and width stay. */
export function setImageCaption(state: EditorState, pos: number, caption: string) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.image) return null;
  const next = safePagesImageCaption(caption);
  if (next === safePagesImageCaption(node.attrs.caption)) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption: next });
}

/** Rename a bookmark. The address stays. An empty name falls back to the site label when rendered. */
export function setBookmarkTitle(state: EditorState, pos: number, title: string) {
  const node = pos >= 0 && pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null;
  if (node?.type !== pagesSchema.nodes.bookmark) return null;
  const next = safePagesBookmarkTitle(title);
  if (next === safePagesBookmarkTitle(node.attrs.title)) return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: next });
}

/** Put a checked image where the caret is. An empty paragraph is replaced; otherwise the image follows that row. */
export function insertImage(state: EditorState, src: string, alt = "") {
  const safe = safePagesImageSrc(src);
  if (!safe) return null;
  const image = pagesSchema.nodes.image.create({
    src: safe,
    alt: alt || (safe.startsWith("data:") ? "图片" : imageAlt(safe)),
  });
  const { $from } = state.selection;
  if ($from.parent.type === pagesSchema.nodes.paragraph && $from.parent.content.size === 0 && $from.depth >= 1) {
    const at = $from.before();
    const $at = state.doc.resolve(at);
    if ($at.parent.canReplace($at.index(), $at.index() + 1, Fragment.from(image))) {
      const tr = state.tr.replaceWith(at, $from.after(), image);
      return tr.setSelection(NodeSelection.create(tr.doc, at));
    }
  }
  const rowPos = rowUnderSelection(state);
  if (rowPos < 0) return null;
  const plan = insertNodeAfter(state.doc, rowPos, image);
  if (!plan) return null;
  const tr = state.tr.replaceWith(plan.from, plan.to, plan.nodes);
  const origin = plan.nodes[0] === image ? plan.from : plan.from + plan.nodes[0].nodeSize;
  return tr.setSelection(NodeSelection.create(tr.doc, origin));
}

/** Turn the slash token into `node`. A partial line keeps the words in front of `/`. */
export function applySlash(state: EditorState, node: Node) {
  const session = slashSession(state);
  if (!session) return null;
  if (session.replacesRow) return replaceEnclosingRow(state, node);
  const tr = state.tr.delete(session.from, session.to);
  const rowPos = tr.mapping.map(session.rowPos);
  const plan = insertNodeAfter(tr.doc, rowPos, node);
  if (!plan) return null;
  tr.replaceWith(plan.from, plan.to, plan.nodes);
  const cursor = plan.nodes[0] === node ? plan.from : plan.from + plan.nodes[0].nodeSize;
  return tr.setSelection(caretAt(tr, cursor + 1));
}

/** Shift-Enter keeps the block and inserts a line break. Inside code it inserts a newline. */
export const insertHardBreak: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return false;
  if (!dispatch) return true;
  if ($from.parent.type.spec.code) {
    dispatch(state.tr.insertText("\n").scrollIntoView());
    return true;
  }
  dispatch(state.tr.replaceSelectionWith(pagesSchema.nodes.hard_break.create()).scrollIntoView());
  return true;
};
