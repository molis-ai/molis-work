/// <reference lib="dom" />
// The board's AI kit specimen (`primitives/catalog-capability-packs.ts`) made to feel real, on top of the list-and-detail wiring
// (`catalog-skill-packs.ts`, which chooses a pack): an entry inside a pack opens in the pack's place under the third-level trail,
// rising in as another entry does; the focus moves to its title; 回到「包」 shows the pack again with the focus on the row that
// opened the entry. Presentation only; nothing here is a product control.
import { installAnchoredMenu } from "./anchored-menu.js";

export function wireCatalogCapabilityPacks(): void {
  installAnchoredMenu();
  document.querySelectorAll<HTMLElement>(".mw-catalog [data-list-detail][data-sticky-detail]").forEach((root) => {
    let opener: HTMLElement | null = null;
    const panels = () => [...root.querySelectorAll<HTMLElement>("[data-list-panel]")];
    const show = (key: string | undefined) => panels().forEach((panel) => {
      const shown = panel.dataset.listPanel === key;
      panel.hidden = !shown;
      panel.classList.remove("is-entering");
      if (shown) { void panel.offsetWidth; panel.classList.add("is-entering"); }
    });
    root.addEventListener("click", (event) => {
      const origin = event.target as Element;
      const open = origin.closest<HTMLElement>("[data-list-open]");
      if (open) {
        opener = open;
        show(open.dataset.listOpen);
        panels().find((panel) => !panel.hidden)?.querySelector<HTMLElement>("h3")?.focus();
        return;
      }
      if (!origin.closest("[data-list-up]")) return;
      show(root.querySelector<HTMLElement>("[data-list-pick][aria-current='true']")?.dataset.listPick);
      if (opener?.isConnected) opener.focus();
      else panels().find((panel) => !panel.hidden)?.querySelector<HTMLElement>("h3")?.focus();
      opener = null;
    });
  });
}
