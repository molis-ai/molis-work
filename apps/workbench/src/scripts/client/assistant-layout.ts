/** How the panel is laid out: the side pane beside the conversation or as a drawer over it, and the room it takes. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place.
 * It also marks the root (data-side-shared) while the side browser and this panel are both drawn and share the width (side-panel.ts), watching
 * only those few nodes' attributes, so no style rule re-checks the whole page with :has() (VUX-36). In the shipped script `sideP` is the side
 * panel, `sideB` its browser pane, `o` the observer and `n` each watched node (short, since every byte ships on each page). It relies on the
 * side panel, its browser pane, the Dock bar and this panel being drawn by the server and never replaced at run time: a replaced node would
 * no longer be watched.
 */
export const ASSISTANT_LAYOUT_PART = String.raw`  // A narrow panel shows the side pane as a drawer over the conversation; a wide one beside it, as the person left it.
  const SIDE_KEY = "molis.assistant.side";
  const wide = window.matchMedia ? window.matchMedia("(min-width: 1240px)") : { matches: true, addEventListener() {} };
  let drawerOpen = false;
  // The platform side panel takes the window's right edge (body[data-side-open], --side-panel-width): what is left decides.
  const sideWidth = () => document.body.dataset.sideOpen === "true" ? parseFloat(getComputedStyle(document.body).getPropertyValue("--side-panel-width")) || 0 : 0;
  const sideInset = () => parseFloat(getComputedStyle(document.body).getPropertyValue("--sheet-inset")) || 14;
  const spacious = () => wide.matches && window.innerWidth - sideWidth() >= 1240;
  const sideOpen = () => spacious() ? store.get(SIDE_KEY) !== "closed" : drawerOpen;
  const paintLayout = () => {
    if (!panel) return;
    panel.dataset.layout = spacious() ? "split" : "drawer";
    panel.dataset.side = sideOpen() ? "open" : "closed";
    sideToggle?.setAttribute("aria-expanded", String(sideOpen()));
    island.toggleAttribute("data-side-shown", !panel.hidden && sideOpen());
    paintStrip(); syncComposer();
    const anchor = !panel.hidden && sideWidth() ? panel.offsetParent : null;
    if (anchor) panel.style.setProperty("--assistant-room", Math.round(window.innerWidth - sideWidth() - sideInset() - 4 - anchor.getBoundingClientRect().right) + "px");
    else panel.style.removeProperty("--assistant-room");
  };
  sideToggle?.addEventListener("click", () => {
    if (spacious()) store.set(SIDE_KEY, sideOpen() ? "closed" : null); else drawerOpen = !drawerOpen;
    paintLayout();
    if (sideOpen()) side?.querySelector("button, select, summary")?.focus();
  });
  wide.addEventListener?.("change", () => { drawerOpen = false; paintLayout(); });
  island.querySelector(".assistant-main")?.addEventListener("pointerdown", () => { if (!spacious() && drawerOpen) { drawerOpen = false; paintLayout(); } });
  let spaciousBefore = spacious();
  const sideChanged = () => { const now = spacious(); if (now !== spaciousBefore) { spaciousBefore = now; drawerOpen = false; } paintLayout(); };
  if ("MutationObserver" in window) new MutationObserver(sideChanged).observe(document.body, { attributes: true, attributeFilter: ["data-side-open", "style"] });
  window.addEventListener("resize", () => { if (sideWidth()) sideChanged(); });
  const sideP = document.querySelector("[data-side-panel]"), sideB = sideP?.querySelector(":scope>[data-side-browser]"), root = document.body;
  const markShared = () => root.toggleAttribute("data-side-shared", root.dataset.sideOpen == "true" && !root.hasAttribute("data-side-solo") && !!sideB
    && !sideP.hidden && !sideP.inert && !sideB.hidden && !island.parentElement.hasAttribute("data-dock-hidden") && !!panel && !panel.hidden);
  if ("MutationObserver" in window) { const o = new MutationObserver(markShared); for (const n of [root, sideP, sideB, island.parentElement, panel]) if (n) o.observe(n, { attributes: true, attributeFilter: ["data-side-open", "data-side-solo", "hidden", "inert", "data-dock-hidden"] }); }
  markShared();`;
