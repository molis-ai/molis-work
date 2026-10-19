import { hoverKey, EMPTY_HOVER } from "./editor-block-selection.js";
import { NodeSelection, Plugin, TextSelection, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { deleteSpan, duplicateSpan, replaceSpan, hoverPosAfter, blockSpanStep, blockSpanFromSelection, blockSpanFromRange, blockMenuShortcut, blockMenuTarget } from "./commands.js";
import { slashKey, mentionKey } from "./editor-insert-menu.js";
import { dragRows, spanRows } from "./reorder.js";
import type { Translate } from "./editor-types.js";
import { createBlockHandle } from "./editor-block-handle.js";

export function hoverHandlePlugin(translate: Translate | undefined, onNote: (index: number) => void) {
  return new Plugin({
    key: hoverKey,
    state: {
      init: () => EMPTY_HOVER,
      apply(tr, value) {
        const meta = tr.getMeta(hoverKey) as {
          pos?: number;
          dragging?: boolean;
          span?: {
            anchor: number;
            head: number;
          } | null;
          openMenu?: boolean;
        } | undefined;
        let next = value;
        if (meta) {
          next = {
            ...value,
            pos: hoverPosAfter(value.pos, false, typeof meta.pos === "number" ? meta.pos : undefined),
            dragging: typeof meta.dragging === "boolean" ? meta.dragging : value.dragging,
            anchor: meta.span === undefined ? value.anchor : meta.span === null ? -1 : meta.span.anchor,
            head: meta.span === undefined ? value.head : meta.span === null ? -1 : meta.span.head,
          };
        } else if (tr.selectionSet && tr.selection instanceof TextSelection) {
          const span = blockSpanFromRange(tr.doc, tr.selection.from, tr.selection.to);
          next = {
            ...next,
            pos: hoverPosAfter(value.pos, true, undefined),
            anchor: span?.anchor ?? -1,
            head: span?.head ?? -1,
          };
        } else if (tr.selectionSet && tr.selection instanceof NodeSelection) {
          const at = tr.selection.from;
          const pos = hoverPosAfter(value.pos, true, undefined);
          if (dragRows(tr.doc).some((row) => row.pos === at))
            next = { ...next, pos, anchor: at, head: at };
          else
            next = { ...next, pos };
        } else if (tr.docChanged) {
          const anchor = next.anchor >= 0 ? tr.mapping.map(next.anchor) : -1;
          const head = next.head >= 0 ? tr.mapping.map(next.head) : -1;
          next = { ...next, pos: next.pos >= 0 ? tr.mapping.map(next.pos) : -1, anchor, head };
        }
        if (next.pos >= 0 && !tr.doc.nodeAt(next.pos))
          next = { ...next, pos: -1 };
        if (next.anchor >= 0 && (!tr.doc.nodeAt(next.anchor) || !tr.doc.nodeAt(next.head))) {
          next = { ...next, anchor: -1, head: -1 };
        }
        if (meta?.openMenu)
          next = { ...next, menuTick: value.menuTick + 1 };
        else
          next = { ...next, menuTick: value.menuTick };
        return next;
      },
    },
    props: {
      handleKeyDown(view, event) {
        const { state } = view;
        if (blockMenuShortcut(event.key, event.metaKey || event.ctrlKey, event.altKey, event.shiftKey)
          && !slashKey.getState(state)?.open
          && !mentionKey.getState(state)?.open) {
          event.preventDefault();
          const at = blockMenuTarget(state.doc, state.selection.from);
          if (at != null)
            view.dispatch(state.tr.setMeta(hoverKey, { openMenu: true, pos: at }));
          return true;
        }
        const hover = hoverKey.getState(state);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          const spanned = Boolean(hover && hover.anchor >= 0 && hover.head >= 0);
          const step = spanned
            ? blockSpanStep(state.doc, hover!.anchor, hover!.head, direction, event.shiftKey)
            : event.shiftKey
              ? blockSpanFromSelection(state.doc, state.selection.from, state.selection.to, direction)
              : null;
          if (!step)
            return false;
          event.preventDefault();
          const tr = state.tr.setMeta(hoverKey, { span: { anchor: step.anchor, head: step.head } });
          try {
            tr.setSelection(NodeSelection.create(tr.doc, step.head));
          } catch { /* atom-only nodes */ }
          view.dispatch(tr.scrollIntoView());
          return true;
        }
        if (!hover || hover.anchor < 0 || hover.head < 0)
          return false;
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          deleteSpan(hover.anchor, hover.head)(state, (tr) => {
            view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }));
          });
          return true;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
          event.preventDefault();
          duplicateSpan(hover.anchor, hover.head)(state, (tr) => {
            view.dispatch(tr.setMeta(hoverKey, { span: null }));
          });
          return true;
        }
        const printable = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
        if (printable && hover.anchor !== hover.head) {
          event.preventDefault();
          const tr = replaceSpan(state, hover.anchor, hover.head, event.key);
          if (tr)
            view.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
          return true;
        }
        return false;
      },
      decorations: blockDecorations,
    },
    view: view => createBlockHandle(view, translate, onNote),
  });
}

function blockDecorations(state: EditorState) {
  const hover = hoverKey.getState(state);
  if (!hover) return DecorationSet.empty;
  const marked = new Map<number, Set<string>>();
  const mark = (at: number, className: string) => {
    if (!state.doc.nodeAt(at)) return;
    marked.set(at, (marked.get(at) ?? new Set<string>()).add(className));
  };
  if (hover.anchor >= 0 && hover.head >= 0) {
    for (const row of spanRows(state.doc, hover.anchor, hover.head)) {
      mark(row.pos, "is-block-selected");
      if (hover.dragging) mark(row.pos, "is-dragging");
    }
  }
  if (hover.pos >= 0) {
    mark(hover.pos, "is-block-hover");
    if (hover.dragging && hover.anchor < 0) mark(hover.pos, "is-dragging");
  }
  const decorations = [...marked].map(([at, classes]) =>
    Decoration.node(at, at + state.doc.nodeAt(at)!.nodeSize, { class: [...classes].join(" ") }));
  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}
