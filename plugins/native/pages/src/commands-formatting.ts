// Inline marks, comments, links, and block appearance.
import { Command, EditorState, Transaction } from "prosemirror-state";
import { spanRoots } from "./reorder.js";
import { pagesSchema } from "./schema.js";
import { Node, ResolvedPos } from "prosemirror-model";
import { safePagesTone } from "./tone.js";
import { safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
import { safePagesHref } from "./link.js";
import { blockPos, spanIsGroup } from "./commands-selection.js";


/** Strip inline marks from every block in a multi-block selection. A single block stays with `clearInlineMarks`. */
export function clearSpanMarks(state: EditorState, anchor: number, head: number): Transaction | null {
  if (!spanIsGroup(state.doc, anchor, head)) return null;
  const roots = spanRoots(state.doc, anchor, head);
  const types = INLINE_MARKS.map((name) => pagesSchema.marks[name]);
  let found = false;
  const tr = state.tr;
  for (const root of roots) {
    const node = state.doc.nodeAt(root.pos);
    if (!node) continue;
    const from = root.pos;
    const to = root.pos + node.nodeSize;
    state.doc.nodesBetween(from, to, (child) => {
      if (child.isText && types.some((type) => type.isInSet(child.marks))) found = true;
    });
    types.forEach((type) => tr.removeMark(from, to, type));
  }
  return found ? tr : null;
}

/** Comment range under the caret, or the current selection when it is not inside one yet. */
export function commentAt(doc: Node, selection: { from: number; to: number; $from: ResolvedPos }):
  { from: number; to: number; text: string; id: string } | null {
  const mark = pagesSchema.marks.comment;
  const { from, to, $from } = selection;
  const found = $from.marks().find((item) => item.type === mark);
  if (found) {
    let start = from;
    let end = to;
    doc.nodesBetween(Math.max(0, from - 1), Math.min(doc.content.size, to + 1), (node, pos) => {
      if (!node.isText || !found.isInSet(node.marks)) return;
      start = Math.min(start, pos);
      end = Math.max(end, pos + node.nodeSize);
    });
    return { from: start, to: end, text: String(found.attrs.text || ""), id: String(found.attrs.id || "") };
  }
  if (from === to) return null;
  return { from, to, text: "", id: "" };
}

/** Add, replace, or clear a comment on [from, to). Blank text removes it. The words stay. */
export function setComment(from: number, to: number, text: string, id = ""): Command {
  return (state, dispatch) => {
    if (from >= to) return false;
    if (!dispatch) return true;
    const mark = pagesSchema.marks.comment;
    const tr = state.tr.removeMark(from, to, mark);
    const body = text.trim();
    if (body) tr.addMark(from, to, mark.create({ id, text: body }));
    dispatch(tr);
    return true;
  };
}

/** Link range under the selection: the selected text, or the whole link the caret sits in. */
export function linkAt(_doc: Node, selection: { from: number; to: number; empty: boolean; $from: ResolvedPos }):
  { from: number; to: number; href: string } | null {
  const mark = pagesSchema.marks.link;
  const { from, to, empty, $from } = selection;
  const found = $from.marks().find((item) => item.type === mark)
    ?? $from.nodeAfter?.marks.find((item) => item.type === mark);
  if (found) {
    if (!empty) return { from, to, href: String(found.attrs.href || "") };
    const siblings: { node: Node; offset: number }[] = [];
    $from.parent.forEach((node, offset) => siblings.push({ node, offset }));
    const hit = siblings.findIndex(({ node, offset }) => found.isInSet(node.marks)
      && offset <= $from.parentOffset && offset + node.nodeSize >= $from.parentOffset);
    if (hit < 0) return null;
    let start = hit;
    let end = hit;
    while (start > 0 && found.isInSet(siblings[start - 1].node.marks)) start -= 1;
    while (end + 1 < siblings.length && found.isInSet(siblings[end + 1].node.marks)) end += 1;
    return {
      from: $from.start() + siblings[start].offset,
      to: $from.start() + siblings[end].offset + siblings[end].node.nodeSize,
      href: String(found.attrs.href || ""),
    };
  }
  if (empty) return null;
  return { from, to, href: "" };
}

const INLINE_MARKS = ["strong", "em", "underline", "strike", "code", "font_color", "highlight", "link", "comment"] as const;

/** Drop inline styles on the selection. With only a caret, the next characters are plain. */
export const clearInlineMarks: Command = (state, dispatch) => {
  const types = INLINE_MARKS.map((name) => pagesSchema.marks[name]);
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const stored = state.storedMarks ?? $from.marks();
    const active = types.filter((type) => type.isInSet(stored));
    if (!active.length) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    active.forEach((type) => tr.removeStoredMark(type));
    dispatch(tr);
    return true;
  }
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && types.some((type) => type.isInSet(node.marks))) found = true;
  });
  if (!found) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  types.forEach((type) => tr.removeMark(from, to, type));
  dispatch(tr);
  return true;
};

/** Paint or clear a writing tone over the current selection; an empty or unknown tone clears it. */
/** True when every selected character already carries this mark. */
export function markCovers(doc: Node, from: number, to: number, markName: string): boolean {
  const markType = pagesSchema.marks[markName];
  if (!markType || from >= to) return false;
  let text = false;
  let open = false;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText || !node.text) return;
    text = true;
    if (!markType.isInSet(node.marks)) open = true;
  });
  return text && !open;
}

/** Bold, italic, underline, strike, or code. A partial selection gets the mark; a full one loses it. */
export function toggleInlineMark(markName: string): Command {
  const markType = pagesSchema.marks[markName];
  return (state, dispatch) => {
    if (!markType) return false;
    const { from, to, empty, $from } = state.selection;
    if (empty) {
      if (!$from.parent.type.allowsMarkType(markType)) return false;
      if (!dispatch) return true;
      const stored = markType.isInSet(state.storedMarks ?? $from.marks());
      dispatch(stored ? state.tr.removeStoredMark(markType) : state.tr.addStoredMark(markType.create()));
      return true;
    }
    if (!dispatch) return true;
    const tr = state.tr;
    if (markCovers(state.doc, from, to, markName)) tr.removeMark(from, to, markType);
    else tr.addMark(from, to, markType.create());
    dispatch(tr);
    return true;
  };
}

/** Bold or another inline mark across a multi-block selection. A partial group gets the mark; a full one loses it. */
export function toggleSpanMark(state: EditorState, anchor: number, head: number, markName: string): Transaction | null {
  const markType = pagesSchema.marks[markName];
  if (!markType || !spanIsGroup(state.doc, anchor, head)) return null;
  const roots = spanRoots(state.doc, anchor, head);
  const last = roots[roots.length - 1];
  const lastNode = last ? state.doc.nodeAt(last.pos) : null;
  if (!roots[0] || !last || !lastNode) return null;
  const from = roots[0].pos;
  const to = last.pos + lastNode.nodeSize;
  const tr = state.tr;
  if (markCovers(state.doc, from, to, markName)) tr.removeMark(from, to, markType);
  else tr.addMark(from, to, markType.create());
  return tr;
}

/** True when every selected character already has this exact tone. */
export function toneCovers(doc: Node, from: number, to: number, kind: "font_color" | "highlight", tone: string): boolean {
  const safe = safePagesTone(tone);
  const markType = pagesSchema.marks[kind];
  if (!safe || from >= to) return false;
  let text = false;
  let open = false;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText || !node.text) return;
    text = true;
    const found = markType.isInSet(node.marks);
    if (!found || found.attrs.tone !== safe) open = true;
  });
  return text && !open;
}

/** Apply a text or background tone. The same tone on the whole selection clears it; a partial tone is filled in. */
export function setTone(kind: "font_color" | "highlight", tone: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    const mark = pagesSchema.marks[kind];
    const safe = safePagesTone(tone);
    if (empty) {
      if (!dispatch) return true;
      const stored = mark.isInSet(state.storedMarks ?? state.selection.$from.marks());
      if (!safe || stored?.attrs.tone === safe) dispatch(state.tr.removeStoredMark(mark));
      else dispatch(state.tr.addStoredMark(mark.create({ tone: safe })));
      return true;
    }
    if (!dispatch) return true;
    const covered = Boolean(safe) && toneCovers(state.doc, from, to, kind, safe);
    const tr = state.tr.removeMark(from, to, mark);
    if (safe && !covered) tr.addMark(from, to, mark.create({ tone: safe }));
    dispatch(tr);
    return true;
  };
}

/** Paint the blocks at `positions`. One list item stays one item; siblings are left alone. */
export function setRowsTone(
  state: EditorState,
  positions: readonly number[],
  kind: "font_color" | "highlight",
  tone: string,
) {
  const unique = [...new Set(positions)].filter((pos) => {
    if (pos < 0 || pos > state.doc.content.size) return false;
    return Boolean(state.doc.nodeAt(pos)?.isBlock);
  });
  if (!unique.length) return null;
  const mark = pagesSchema.marks[kind];
  const safe = safePagesTone(tone);
  const tr = state.tr;
  for (const pos of unique) {
    const node = state.doc.nodeAt(pos);
    if (!node) continue;
    tr.removeMark(pos, pos + node.nodeSize, mark);
    if (safe) tr.addMark(pos, pos + node.nodeSize, mark.create({ tone: safe }));
  }
  return tr;
}

/** Paint a whole top-level block, the way the block menu's colour entry does. */
export function setBlockTone(index: number, kind: "font_color" | "highlight", tone: string): Command {
  return (state, dispatch) => {
    const doc = state.doc;
    if (index < 0 || index >= doc.childCount) return false;
    if (!dispatch) return true;
    const from = blockPos(doc, index);
    const to = from + doc.child(index).nodeSize;
    const mark = pagesSchema.marks[kind];
    const safe = safePagesTone(tone);
    const tr = state.tr.removeMark(from, to, mark);
    if (safe) tr.addMark(from, to, mark.create({ tone: safe }));
    dispatch(tr);
    return true;
  };
}

/** Restyle one callout. Leaving `icon` unset keeps it automatic, so it follows the tone. */
export function setCalloutStyle(pos: number, patch: { tone?: string; icon?: string }): Command {
  return (state, dispatch) => {
    const node = pos >= 0 && pos < state.doc.content.size ? state.doc.nodeAt(pos) : null;
    if (node?.type !== pagesSchema.nodes.callout) return false;
    if (!dispatch) return true;
    const tone = patch.tone === undefined ? node.attrs.tone : safePagesCalloutTone(patch.tone);
    const icon = patch.icon === undefined ? node.attrs.icon : safePagesCalloutIcon(patch.icon);
    dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, tone, icon }));
    return true;
  };
}

/** Tone currently covering the selection, or "" when the range is mixed or plain. */
export function toneAt(state: EditorState, kind: "font_color" | "highlight"): string {
  const mark = pagesSchema.marks[kind];
  const { from, to, empty, $from } = state.selection;
  if (empty) return safePagesTone(mark.isInSet(state.storedMarks ?? $from.marks())?.attrs.tone);
  let found: string | null = null;
  let mixed = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const tone = safePagesTone(mark.isInSet(node.marks)?.attrs.tone);
    if (found === null) found = tone;
    else if (found !== tone) mixed = true;
  });
  return mixed ? "" : found ?? "";
}

/** Replace any link mark on [from, to) with `href`; an unsafe or empty href just removes it. */
export function setLink(from: number, to: number, href: string): Command {
  return (state, dispatch) => {
    if (from >= to) return false;
    if (!dispatch) return true;
    const mark = pagesSchema.marks.link;
    const safe = safePagesHref(href);
    const tr = state.tr.removeMark(from, to, mark);
    if (safe) tr.addMark(from, to, mark.create({ href: safe }));
    dispatch(tr);
    return true;
  };
}
