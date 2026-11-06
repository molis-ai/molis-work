/**
 * The service row that opens in place (`renderConnectionItem` in apps/workbench/src/service-connection-parts.ts): a press on the
 * toggle, or anywhere on the row that is not one of the row's own controls, opens or closes the part under it. One delegated
 * listener on `root`; a page that draws the rows bundles this and calls it once.
 */
export function mountConnectionItems(root: Document | HTMLElement = document): void {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest<HTMLElement>("[data-connection-item]");
    if (!target || !item) return;
    const own = target.closest("[data-connection-toggle]");
    const row = target.closest(".settings-connection-row");
    if (!own && (!row || row.parentElement !== item || target.closest("a, button, input, select, textarea, summary, label"))) return;
    const open = item.dataset.open !== "true";
    item.dataset.open = String(open);
    item.querySelector("[data-connection-toggle]")?.setAttribute("aria-expanded", String(open));
  });
}
