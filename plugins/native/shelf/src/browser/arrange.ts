import { renderBar } from "./bar.js";
import { closest, messageOf } from "./dom.js";
import { saveSettings } from "./composer.js";
import { actionOrder } from "./model.js";
import type { ShelfPage } from "./types.js";

/** Slides the neighbours into place after one moved, unless the person asked for less motion. */
function slide(nodes: HTMLElement[], before: Map<HTMLElement, number>): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const node of nodes) {
    const dx = (before.get(node) ?? 0) - node.getBoundingClientRect().left;
    if (dx) node.animate([{ transform: "translateX(" + dx + "px)" }, { transform: "translateX(0)" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
  }
}

function dragStart(page: ShelfPage, event: Event): void {
  const wrap = closest(event, "[data-shelf-act-slot]");
  const transfer = (event as DragEvent).dataTransfer;
  if (!page.arranging || !wrap || !transfer) return;
  event.stopPropagation();
  page.dragSlot = wrap.dataset.shelfActSlot || "";
  page.dragOrder = [...actionOrder(page)];
  wrap.dataset.dragging = "1";
  transfer.effectAllowed = "move";
  transfer.setData("application/x-shelf-action", page.dragSlot);
}

function dragOver(page: ShelfPage, event: Event): void {
  const transfer = (event as DragEvent).dataTransfer;
  if (!page.arranging || !page.dragSlot || !page.dragOrder || !transfer) return;
  event.preventDefault();
  event.stopPropagation();
  transfer.dropEffect = "move";
  const target = closest(event, "[data-shelf-act-slot]");
  const dragged = page.bar.querySelector<HTMLElement>('[data-dragging="1"]');
  if (!target || !dragged || target === dragged) return;
  const from = page.dragOrder.indexOf(page.dragSlot);
  const to = page.dragOrder.indexOf(target.dataset.shelfActSlot ?? "");
  if (from < 0 || to < 0 || from === to) return;
  const nodes = [...page.bar.querySelectorAll<HTMLElement>("[data-shelf-act-slot]")];
  const before = new Map(nodes.map((node) => [node, node.getBoundingClientRect().left]));
  page.dragOrder.splice(to, 0, ...page.dragOrder.splice(from, 1));
  target.parentNode?.insertBefore(dragged, from < to ? target.nextSibling : target);
  slide(nodes, before);
}

async function drop(page: ShelfPage, event: Event): Promise<void> {
  if (!page.arranging || !page.dragSlot || !page.dragOrder) return;
  event.preventDefault();
  event.stopPropagation();
  const order = page.dragOrder;
  page.dragSlot = "";
  page.dragOrder = null;
  try {
    await saveSettings(page, { action_order: order });
  } catch (error) {
    if (!page.lifetime.alive) return;
    page.stickyHint = messageOf(error);
  }
  renderBar(page, page.lastBarKind);
}

/** Dragging the bar's actions into a new order while arranging. */
export function installArrange(page: ShelfPage): void {
  const { lifetime, bar } = page;
  lifetime.listen(bar, "dragstart", (event) => dragStart(page, event));
  lifetime.listen(bar, "dragover", (event) => dragOver(page, event));
  lifetime.listen(bar, "drop", (event) => drop(page, event));
  lifetime.listen(bar, "dragend", () => {
    if (!page.dragSlot) return;
    page.dragSlot = "";
    page.dragOrder = null;
    renderBar(page, page.lastBarKind);
  });
}
