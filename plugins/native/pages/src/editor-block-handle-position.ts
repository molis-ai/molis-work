import type { EditorView } from "prosemirror-view";
import { pinAt } from "@molis-ai/molis-work-plugin-sdk/browser";

export function createHandlePosition(view: EditorView, handle: HTMLElement) {
  let pos = -1;
  let gripFollowsCaret = false;
  const hideHandle = () => {
    handle.hidden = true;
  };
  const placeHandle = (rowPos: number, force = false, followingCaret = false) => {
    const node = rowPos >= 0 ? view.state.doc.nodeAt(rowPos) : null;
    const dom = node ? view.nodeDOM(rowPos) : null;
    if (!node || !(dom instanceof HTMLElement)) {
      hideHandle();
      return;
    }
    const rect = dom.getBoundingClientRect();
    const pm = view.dom.getBoundingClientRect();
    const gutter = Number.parseFloat(getComputedStyle(view.dom).paddingLeft) || 76;
    const contentLeft = pm.left + gutter;
    const handleWidth = handle.offsetWidth || 44;
    const gap = dom.closest(".pages-column") || window.innerWidth <= 760 ? 4 : 14;
    const indent = Math.max(0, rect.left - contentLeft);
    const minLeft = pm.left + 6;
    const maxLeft = rect.left - handleWidth - gap;
    const top = Math.round(rect.top + 2);
    const left = Math.round(Math.min(minLeft + indent, maxLeft));
    if (!force && pos === rowPos && handle.dataset.at === left + "," + top && !handle.hidden && handle.classList.contains("is-caret") === followingCaret) return;
    gripFollowsCaret = followingCaret;
    handle.classList.toggle("has-note", Boolean(node.attrs.note));
    handle.classList.toggle("is-caret", followingCaret);
    handle.hidden = false;
    pinAt(handle, left, top);
    handle.dataset.at = left + "," + top;
    pos = rowPos;
  };
  return {
    get pos() { return pos; },
    hide: hideHandle,
    place: placeHandle,
    follow() { if (!handle.hidden) placeHandle(pos, true, gripFollowsCaret); },
  };
}
