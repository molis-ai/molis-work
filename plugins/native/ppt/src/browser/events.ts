import { messageOf } from "./dom.js";
import type { PptPage } from "./types.js";

interface PlacementChange { mode?: string; from?: { kind?: string; id?: string }; to?: { kind?: string } }

/** What the rest of the workbench says to this page: a deck moved or copied from the placement bar, a model becoming ready, the tab closing. */
export function installEvents(page: PptPage): void {
  const { s } = page;
  const reload = () => void page.loadList().catch((error: unknown) => page.showNote(messageOf(error), true));
  // Moved or copied from the placement bar: this list changed; a deck moved away is no longer here to edit.
  window.addEventListener("molis:placement-changed", (event) => {
    const detail: PlacementChange = (event as CustomEvent<PlacementChange | null>).detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("presentation")) return;
    if (detail.mode === "move" && detail.from && s.selected && s.selected.id === detail.from.id) page.closeEditor();
    reload();
  });
  document.addEventListener("molis-work:model-ready", reload);
  window.addEventListener("beforeunload", (event) => {
    if (s.selected && (s.saveError || s.editRev > s.savedRev)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
