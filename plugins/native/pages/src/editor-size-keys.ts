// The keyboard's way to size what a pointer sizes by its handle (specs/visual-ui-experience VUX-06, VUX-23): with the caret
// in it, Mod-Alt-Shift-← and → narrow and widen a selected image, else the table column or layout column the caret is in,
// the innermost first. The same commands as the handles; the handles name these keys (`aria-keyshortcuts`). The new width is
// read out once through the page's status region (`window.molisAnnounce`), at a limit too.
import { NodeSelection, type Command, type Transaction } from "prosemirror-state";
import { nudgeColumnShare } from "./commands-containers.js";
import { setImageWidth } from "./commands-insert.js";
import { setColumnWidth } from "./table-edit.js";
import { pagesSchema, safePagesColumnShare, safePagesColumnWidth } from "./schema.js";
import { safePagesImageWidth } from "./link.js";

const STEP = 32;
const box = (el: unknown) => (el instanceof Element ? el.getBoundingClientRect().width : 0);

/** One press: 32 px for an image or a table column, a twentieth of the pair for a layout column. Says the new width. */
const sizeHere = (dir: number, t: (text: string) => string): Command => (state, _dispatch, view) => {
  if (!view) return false;
  const { selection: sel } = state, $ = sel.$from, n = pagesSchema.nodes;
  const done = (tr: Transaction | null, said: () => string) => { if (tr) view.dispatch(tr); window.molisAnnounce?.(said()); return true; };
  if (sel instanceof NodeSelection && sel.node.type === n.image) {
    const frame = view.nodeDOM(sel.from) as Element | null, line = box(frame?.parentElement);
    const raw = (safePagesImageWidth(sel.node.attrs.width) || box(frame?.querySelector("img") ?? frame)) + dir * STEP;
    // As with the handle, an image that reaches the line goes back to filling it.
    return done(setImageWidth(state, sel.from, line && raw >= line - 24 ? 0 : raw), () => {
      const width = safePagesImageWidth(view.state.doc.nodeAt(sel.from)?.attrs.width);
      return width ? t("宽度 {n} 像素").replace("{n}", String(width)) : t("占满一行");
    });
  }
  let d = $.depth;
  while (d > 0 && ![n.table_cell, n.table_header, n.column].includes($.node(d).type)) d--;
  if (!d) return false;
  if ($.node(d).type !== n.column) {
    const width = safePagesColumnWidth($.node(d).attrs.colwidth) || box(view.nodeDOM($.before(d)));
    return done(setColumnWidth(state, $.before(d - 2), $.index(d - 1), width + dir * STEP),
      () => t("列宽 {n} 像素").replace("{n}", String(safePagesColumnWidth(view.state.selection.$from.node(d).attrs.colwidth) || Math.round(width))));
  }
  // A column moves its right edge; the last one moves its left edge, the other way.
  const list = $.node(d - 1), i = $.index(d - 1), pair = Math.min(i, list.childCount - 2), share = (k: number, of = list) => safePagesColumnShare(of.child(k).attrs.width);
  return done(nudgeColumnShare(state, $.before(d - 1), pair, (pair === i ? dir : -dir) * (share(pair) + share(pair + 1)) / 20), () => {
    const now = view.state.selection.$from.node(d - 1);
    let total = 0; now.forEach((column) => { total += safePagesColumnShare(column.attrs.width); });
    return t("栏宽 {n}%").replace("{n}", String(Math.round(share(i, now) / total * 100)));
  });
};

export const sizeKeys = (translate?: (text: string) => string): Record<string, Command> => {
  const t = translate ?? ((text: string) => text);
  return { "Mod-Alt-Shift-ArrowLeft": sizeHere(-1, t), "Mod-Alt-Shift-ArrowRight": sizeHere(1, t) };
};

/** The keys as `aria-keyshortcuts` names them on this platform, for the handles. */
export const SIZE_KEYS = ["Left", "Right"].map((side) => `${typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control"}+Alt+Shift+Arrow${side}`).join(" ");
