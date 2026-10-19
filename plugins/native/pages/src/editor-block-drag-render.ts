import type { EditorView } from "prosemirror-view";
import type { DragPreview } from "./drag-preview.js";
import { dragRows, dropLevelRange, previewCopySpan, previewSpan, spanRoots, type DragRow } from "./reorder.js";
import { rowGapAt } from "./floating.js";

export type Drag = {
  pointerId: number;
  from: number;
  anchor: number;
  head: number;
  gap: number;
  level: number;
  requestedLevel: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  active: boolean;
  alt: boolean;
  previewCopy: boolean;
} | null;

export function createDragRendering(view: EditorView, ghost: HTMLElement,
  readDrag: () => Drag, readMotion: () => DragPreview | null) {
  const workspace = view.dom.closest<HTMLElement>(".pages-workspace");
  const INDENT = 24;
  let dragFrame = 0;
  const rowBox = (rowPos: number) => {
    const el = view.nodeDOM(rowPos);
    return readMotion()?.sourceBox(rowPos) ?? (el instanceof HTMLElement ? el.getBoundingClientRect() : null);
  };
  const gapAt = (clientY: number, rows: readonly DragRow[]) => rowGapAt(clientY, rows.map(row => {
    const rect = rowBox(row.pos);
    return { top: rect?.top ?? 0, bottom: rect ? rect.top + rect.height : 0, indent: row.indent };
  }));
  const levelAt = (clientX: number, rows: readonly DragRow[], gap: number) => {
    const prev = gap > 0 ? rows[gap - 1] : undefined;
    const range = dropLevelRange(rows, gap);
    const left = prev ? rowBox(prev.pos)?.left : undefined;
    const baseLeft = left ?? (view.dom.getBoundingClientRect().left
      + (Number.parseFloat(getComputedStyle(view.dom).paddingLeft) || 52));
    const raw = (prev?.indent ?? 0) + Math.round((clientX - baseLeft) / INDENT);
    return Math.max(range.min, Math.min(range.max, raw));
  };
  const renderDrag = () => {
    const drag = readDrag(), motion = readMotion();
    dragFrame = 0;
    if (!drag?.active || !motion) return;
    if (workspace) {
      const rect = workspace.getBoundingClientRect();
      const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
      const edge = Math.min(48, (bottom - top) / 6);
      const velocity = drag.y < top + edge ? -Math.min(12, (top + edge - drag.y) / 4)
        : drag.y > bottom - edge ? Math.min(12, (drag.y - bottom + edge) / 4) : 0;
      const previous = workspace.scrollTop;
      if (velocity) workspace.scrollTop += velocity;
      if (workspace.scrollTop !== previous) scheduleDrag();
    }
    ghost.style.transform = `translate(${Math.round(drag.x + drag.offsetX)}px, ${Math.round(drag.y + drag.offsetY - 4)}px)`;
    const rows = dragRows(motion.layoutSource);
    const gap = gapAt(drag.y, rows);
    const level = levelAt(drag.x + drag.offsetX, rows, gap);
    if (gap === drag.gap && level === drag.requestedLevel && drag.alt === drag.previewCopy) return;
    const preview = drag.alt
      ? previewCopySpan(motion.layoutSource, drag.anchor, drag.head, gap, level)
      : previewSpan(motion.layoutSource, drag.anchor, drag.head, gap, level);
    drag.gap = gap;
    drag.requestedLevel = level;
    drag.previewCopy = drag.alt;
    drag.level = preview?.level ?? level;
    ghost.classList.toggle("is-copy", drag.alt);
    motion.update(preview?.doc ?? motion.layoutSource);
    const slot = motion.slot();
    if (slot) ghost.style.width = Math.round(slot.width) + "px";
  };
  const scheduleDrag = () => {
    if (!dragFrame) dragFrame = requestAnimationFrame(renderDrag);
  };
  return {
    schedule: scheduleDrag,
    flush(commit: boolean) {
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        if (commit) renderDrag();
      }
      // Rendering may schedule another frame while scrolling.
      if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    },
  };
}

export function showDragGhost(view: EditorView, ghost: HTMLElement, anchor: number, head: number) {
  const roots = spanRoots(view.state.doc, anchor, head);
  const sources = roots.map(root => view.nodeDOM(root.pos)).filter((node): node is HTMLElement => node instanceof HTMLElement);
  const boxes = sources.map(node => node.getBoundingClientRect());
  const left = Math.min(...boxes.map(box => box.left));
  const rect = { left, top: Math.min(...boxes.map(box => box.top)), width: Math.max(...boxes.map(box => box.right)) - left };
  const clone = document.createElement("div");
  clone.className = "ProseMirror";
  for (const [index, source] of sources.entries()) {
    const gap = index > 0 ? sources[index - 1].nextElementSibling : null;
    if (gap?.classList.contains("pages-insert-line")) clone.append(gap.cloneNode(true));
    const copy = source.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("script, .pages-insert-line").forEach(node => node.remove());
    copy.classList.remove("is-block-selected", "is-block-hover", "ProseMirror-selectednode", "is-dragging");
    clone.append(copy);
  }
  ghost.replaceChildren(clone);
  const count = roots.length;
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "pages-drag-count";
    badge.textContent = String(count);
    ghost.append(badge);
  }
  ghost.style.width = Math.round(rect.width) + "px";
  ghost.hidden = false;
  return rect;
}
