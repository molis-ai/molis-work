import type { EditorView, NodeView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { hoverKey, hoveredGroup } from "./editor-block-selection.js";
import { blockSpanToRow, focusBelowContent, replaceSelectedBlock, replaceSpan, toggleTaskChecked, toggleTaskGroup, tripleClickSelection } from "./commands.js";
import { linkClickOpens, safePagesHref } from "./link.js";
import { handleDragOver, writeSpanClipboard } from "./editor-paste.js";
import { pagesSchema } from "./schema.js";
import type { PagesEditorMountOptions, Translate } from "./editor-types.js";
import { codeNodeView, bookmarkNodeView, imageNodeView } from "./editor-node-media.js";
import { columnNodeView, cellNodeView, taskNodeView, toggleNodeView, calloutNodeView, mentionNodeView, calendarNodeView, tocNodeView } from "./editor-node-layout.js";
import { cardNodeView } from "./editor-node-cards.js";

type Make = (node: Node, view: EditorView, getPos: () => number | undefined) => NodeView;

/** How each block type of the document is drawn; a callout asks `openCalloutStyle` for its icon and tone form. */
export function pagesNodeViews(options: PagesEditorMountOptions, openCalloutStyle: (view: EditorView, pos: number, anchor: HTMLElement) => void) {
  const { translate } = options;
  const withTranslate = (make: (...args: [...Parameters<Make>, Translate | undefined]) => NodeView): Make => (node, current, getPos) => make(node, current, getPos, translate);
  const card = (kind: "ref" | "task" | "event"): Make => (node, current, getPos) => cardNodeView(kind, node, current, getPos, options);
  const cell = withTranslate(cellNodeView);
  return {
    column: withTranslate(columnNodeView),
    image: withTranslate(imageNodeView),
    bookmark: withTranslate(bookmarkNodeView),
    table_cell: cell,
    table_header: cell,
    task_item: taskNodeView,
    toggle: toggleNodeView,
    callout: (node: Node, current: EditorView, getPos: () => number | undefined) => calloutNodeView(node, getPos, translate,
      (pos, anchor) => openCalloutStyle(current, pos, anchor)),
    page_mention: (node: Node) => mentionNodeView(node, options),
    page_ref: card("ref"),
    task_card: card("task"),
    event_card: card("event"),
    calendar: calendarNodeView,
    toc: tocNodeView,
    code_block: withTranslate(codeNodeView),
  };
}

export function handlePagesTextInput(current: EditorView, _from: number, _to: number, text: string): boolean {
  if (text === " ") {
    const group = hoveredGroup(current);
    const flipped = group ? toggleTaskGroup(current.state, group.anchor, group.head) : null;
    if (flipped) {
      current.dispatch(flipped);
      return true;
    }
    if (current.state.selection instanceof NodeSelection
      && current.state.selection.node.type === pagesSchema.nodes.task_item
      && toggleTaskChecked(current.state, current.dispatch.bind(current))) return true;
  }
  const hover = hoverKey.getState(current.state);
  if (hover && hover.anchor >= 0 && hover.head >= 0 && hover.anchor !== hover.head) {
    const tr = replaceSpan(current.state, hover.anchor, hover.head, text);
    if (tr) current.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
    return true;
  }
  if (!(current.state.selection instanceof NodeSelection)) return false;
  const tr = replaceSelectedBlock(current.state, text);
  if (tr) current.dispatch(tr.scrollIntoView());
  return true;
}

export function handlePagesTripleClick(current: EditorView, pos: number): boolean {
  const target = tripleClickSelection(current.state.doc, pos);
  if (!target) return false;
  const tr = current.state.tr;
  if (target.atom) {
    try { tr.setSelection(NodeSelection.create(tr.doc, target.from)); }
    catch { return false; }
  } else {
    tr.setSelection(TextSelection.create(tr.doc, target.from, target.to));
  }
  current.dispatch(tr);
  return true;
}

export function handlePagesClick(_current: EditorView, _pos: number, event: MouseEvent): boolean {
  const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const href = safePagesHref(anchor.getAttribute("href"));
  const bookmark = anchor.closest("[data-pages-bookmark], .pages-bookmark");
  if (bookmark && !linkClickOpens(event)) {
    event.preventDefault();
    return false;
  }
  if (!href || !linkClickOpens(event)) return false;
  event.preventDefault();
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

/** The DOM events the editor takes over; its own `blur` is added by the caller, which owns the previews. */
export const pagesDomEvents = {
  mousedown(current: EditorView, event: MouseEvent): boolean {
    if (event.shiftKey && event.button === 0 && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const target = event.target instanceof Element ? event.target : null;
      const inChrome = target?.closest("[data-pages-grip], [data-pages-plus], [data-pages-gap], .pages-block-menu, .pages-provisional");
      const hover = hoverKey.getState(current.state);
      const anchor = hover && hover.anchor >= 0 ? hover.anchor : -1;
      if (!inChrome && anchor >= 0 && target && current.dom.contains(target)) {
        const point = current.posAtCoords({ left: event.clientX, top: event.clientY });
        const span = point ? blockSpanToRow(current.state.doc, anchor, point.pos) : null;
        if (span) {
          event.preventDefault();
          const tr = current.state.tr.setMeta(hoverKey, { span, pos: span.head });
          try { tr.setSelection(NodeSelection.create(tr.doc, span.head)); } catch { /* the caret stays */ }
          current.dispatch(tr);
        } else if (point) {
          event.preventDefault();
        }
        if (span || point) return true;
      }
    }
    if (event.button !== 0 || event.target !== current.dom) return false;
    const end = current.coordsAtPos(current.state.doc.content.size);
    if (event.clientY <= end.bottom + 8) return false;
    const tr = focusBelowContent(current.state);
    if (tr) current.dispatch(tr);
    current.focus();
    event.preventDefault();
    return true;
  },
  copy(current: EditorView, event: ClipboardEvent): boolean {
    return writeSpanClipboard(current, event, false);
  },
  cut(current: EditorView, event: ClipboardEvent): boolean {
    return writeSpanClipboard(current, event, true);
  },
  dragover: handleDragOver,
};
