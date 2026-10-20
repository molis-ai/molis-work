// The keyboard's way to size what a pointer sizes by its handle (specs/visual-ui-experience VUX-06, VUX-23): with the caret
// in it, Mod-Alt-Shift-← and → narrow and widen a selected image, else the table column or layout column the caret is in,
// the innermost first. The same commands as the handles; the handles name these keys (`aria-keyshortcuts`).
import { NodeSelection, type Command } from "prosemirror-state";
import { nudgeColumnShare } from "./commands-containers.js";
import { setImageWidth } from "./commands-insert.js";
import { setColumnWidth } from "./table-edit.js";
import { pagesSchema, safePagesColumnShare, safePagesColumnWidth } from "./schema.js";
import { safePagesImageWidth } from "./link.js";

const STEP = 32;
const box = (el: unknown) => (el instanceof Element ? el.getBoundingClientRect().width : 0);

/** One press: 32 px for an image or a table column, a twentieth of the pair for a layout column. */
const sizeHere = (dir: number): Command => (state, _dispatch, view) => {
  if (!view) return false;
  const { selection: sel } = state, $ = sel.$from, n = pagesSchema.nodes;
  let tr = null;
  if (sel instanceof NodeSelection && sel.node.type === n.image) {
    const frame = view.nodeDOM(sel.from) as Element | null;
    const raw = (safePagesImageWidth(sel.node.attrs.width) || box(frame?.querySelector("img") ?? frame)) + dir * STEP;
    // As with the handle, an image that reaches the line goes back to filling it.
    const line = box(frame?.parentElement);
    tr = setImageWidth(state, sel.from, line && raw >= line - 24 ? 0 : raw);
  } else {
    let d = $.depth;
    while (d > 0 && ![n.table_cell, n.table_header, n.column].includes($.node(d).type)) d--;
    if (!d) return false;
    if ($.node(d).type === n.column) {
      // A column moves its right edge; the last one moves its left edge, the other way.
      const list = $.node(d - 1), i = $.index(d - 1), pair = Math.min(i, list.childCount - 2);
      const sum = safePagesColumnShare(list.child(pair).attrs.width) + safePagesColumnShare(list.child(pair + 1).attrs.width);
      tr = nudgeColumnShare(state, $.before(d - 1), pair, (pair === i ? dir : -dir) * sum / 20);
    } else {
      const width = safePagesColumnWidth($.node(d).attrs.colwidth) || box(view.nodeDOM($.before(d)));
      tr = setColumnWidth(state, $.before(d - 2), $.index(d - 1), width + dir * STEP);
    }
  }
  if (tr) view.dispatch(tr);
  return true;
};

export const sizeKeys = (): Record<string, Command> => ({ "Mod-Alt-Shift-ArrowLeft": sizeHere(-1), "Mod-Alt-Shift-ArrowRight": sizeHere(1) });

/** The keys as `aria-keyshortcuts` names them on this platform, for the handles. */
export const SIZE_KEYS = ["Left", "Right"].map((side) => `${typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control"}+Alt+Shift+Arrow${side}`).join(" ");
