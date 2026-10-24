import { targetOf } from "./dom.js";
import type { WorkflowsPage } from "./page.js";
import { insertAt, moveTo } from "./save.js";

/** Dragging a plugin from the palette into the chain, or a station along it. */
export function wireDrag(page: WorkflowsPage) {
  const { root, view, pop } = page;
  const dropAt = (gap: number | null) => {
    if (page.dropGap === gap) return;
    for (const node of view.querySelectorAll("[data-wf-chain] .is-drop")) node.classList.remove("is-drop");
    page.dropGap = gap;
    if (gap !== null) view.querySelector(`[data-wf-chain] [data-wf-gap="${gap}"]`)?.classList.add("is-drop");
  };
  const gapAt = (event: DragEvent): number | null => {
    const el = targetOf(event);
    const gap = el?.closest<HTMLElement>("[data-wf-gap]");
    if (gap) return Number(gap.dataset.wfGap);
    const station = el?.closest<HTMLElement>("[data-wf-station]");
    if (station) { const box = station.getBoundingClientRect(); const index = Number(station.dataset.wfStation); return event.clientX < box.left + box.width / 2 ? index : index + 1; }
    let best: number | null = null, distance = Infinity;
    for (const node of view.querySelectorAll<HTMLElement>("[data-wf-chain] [data-wf-gap]")) {
      const box = node.getBoundingClientRect(), far = Math.abs(event.clientX - (box.left + box.width / 2));
      if (far < distance) { distance = far; best = Number(node.dataset.wfGap); }
    }
    return best;
  };
  const endDrag = () => {
    page.dragging = null; dropAt(null);
    page.dragFrom?.classList.remove("is-drag-source"); page.dragFrom = null;
    view.querySelector("[data-wf-chain]")?.classList.remove("is-dragging");
  };

  root.addEventListener("dragstart", (event) => {
    const el = targetOf(event);
    const chip = el?.closest<HTMLElement>("[data-wf-plugin]"), station = el?.closest<HTMLElement>("[data-wf-station]");
    if (chip) page.dragging = { plugin: chip.dataset.wfPlugin! };
    else if (station) page.dragging = { from: Number(station.dataset.wfStation) };
    else return;
    if (pop.matches(":popover-open")) pop.hidePopover();
    page.dragFrom = chip || station || null;
    event.dataTransfer!.effectAllowed = "move";
    event.dataTransfer!.setData("text/plain", chip ? chip.dataset.wfPlugin! : "station");
    requestAnimationFrame(() => { page.dragFrom?.classList.add("is-drag-source"); view.querySelector("[data-wf-chain]")?.classList.add("is-dragging"); });
  });
  root.addEventListener("dragend", endDrag);
  root.addEventListener("dragover", (event) => {
    const drag = page.dragging;
    if (!drag) return;
    if (!targetOf(event)?.closest("[data-wf-chain]")) { dropAt(null); return; }
    event.preventDefault();
    let gap = gapAt(event);
    if (gap !== null && "from" in drag && (gap === drag.from || gap === drag.from + 1)) gap = null;
    event.dataTransfer!.dropEffect = gap === null ? "none" : "move";
    dropAt(gap);
  });
  root.addEventListener("dragleave", (event) => {
    const chain = view.querySelector("[data-wf-chain]");
    if (chain && !chain.contains(event.relatedTarget as Node | null)) dropAt(null);
  });
  root.addEventListener("drop", (event) => {
    const drag = page.dragging;
    if (!drag) return;
    event.preventDefault();
    const gap = page.dropGap;
    endDrag();
    if (gap === null) return;
    if ("plugin" in drag) insertAt(page, gap, drag.plugin);
    else moveTo(page, drag.from, gap);
  });
}
