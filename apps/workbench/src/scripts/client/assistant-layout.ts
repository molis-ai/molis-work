/** How the conversation is laid out: the information column beside the conversation column, or over it at a phone's width. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place.
 * It also marks the root (data-side-shared) while the side browser and this panel are both drawn and share the width (side-panel.ts), watching
 * only those few nodes' attributes, so no style rule re-checks the whole page with :has() (VUX-36). In the shipped script `sideP` is the side
 * panel, `sideB` its browser pane, `o` the observer and `n` each watched node (short, since every byte ships on each page). It relies on the
 * side panel, its browser pane, the Dock bar and this panel being drawn by the server and never replaced at run time: a replaced node would
 * no longer be watched.
 */
export const ASSISTANT_LAYOUT_PART = String.raw`  // From 541px up the information column stands beside the conversation column (over the card stack from 960px, inside the
  // conversation's own width below it); at a phone's width it lies over the conversation when asked for (§4「底栏第十三版」第 6 条).
  const wide = window.matchMedia ? window.matchMedia("(min-width: 541px)") : { matches: true, addEventListener() {} };
  let drawerOpen = false;
  const spacious = () => wide.matches;
  const sideOpen = () => spacious() || drawerOpen;
  const paintLayout = () => {
    if (!panel) return;
    panel.dataset.layout = spacious() ? "split" : "drawer";
    panel.dataset.side = sideOpen() ? "open" : "closed";
    sideToggle?.setAttribute("aria-expanded", String(sideOpen()));
    island.toggleAttribute("data-side-shown", !panel.hidden && sideOpen());
    paintStrip(); syncComposer();
  };
  sideToggle?.addEventListener("click", () => {
    drawerOpen = !drawerOpen;
    paintLayout();
    if (sideOpen()) side?.querySelector("[role=tab][aria-selected=true], button")?.focus();
  });
  wide.addEventListener?.("change", () => { drawerOpen = false; paintLayout(); });
  island.querySelector(".assistant-main")?.addEventListener("pointerdown", (event) => { if (!spacious() && drawerOpen && !sideToggle?.contains(event.target)) { drawerOpen = false; paintLayout(); } });
  const sideP = document.querySelector("[data-side-panel]"), sideB = sideP?.querySelector(":scope>[data-side-browser]"), root = document.body;
  const markShared = () => root.toggleAttribute("data-side-shared", root.dataset.sideOpen == "true" && !root.hasAttribute("data-side-solo") && !!sideB
    && !sideP.hidden && !sideP.inert && !sideB.hidden && !island.closest(".workbench-bar").hasAttribute("data-dock-hidden") && !!panel && !panel.hidden);
  if ("MutationObserver" in window) { const o = new MutationObserver(markShared); for (const n of [root, sideP, sideB, island.closest(".workbench-bar"), panel]) if (n) o.observe(n, { attributes: true, attributeFilter: ["data-side-open", "data-side-solo", "hidden", "inert", "data-dock-hidden"] }); }
  markShared();`;
