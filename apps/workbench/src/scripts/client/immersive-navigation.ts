import { OWN_DIRECTORY_SURFACES, pluginSurfaceAliases } from "../../plugin-catalog.js";
import { readClientPluginTitles } from "../../plugin-directory.js";

/** Coordinates application chrome; content and Runtime behavior stay with their Plugin owners. */
export const IMMERSIVE_NAVIGATION_FACTORY_SCRIPT = `(host) => {
  const OWN_DIRECTORY_SURFACES = ${JSON.stringify([...OWN_DIRECTORY_SURFACES])};
  const SURFACE_ALIASES = ${JSON.stringify(pluginSurfaceAliases())};
  const canonicalSurface = (surface) => (Object.hasOwn(SURFACE_ALIASES, surface) ? SURFACE_ALIASES[surface] : surface);
  const readTitles = ${readClientPluginTitles.toString()};
  const { workspace, treePane, getSurface, translate: readText, setDirectoryCollapsed, setMobileView, saveUiState } = host;
  if (!document.body.classList.contains("immersive-workbench")) return null;
    const pluginRail = document.querySelector("[data-plugin-strip]");
    const strip = pluginRail;
    const heading = document.querySelector("[data-plugin-heading]");
  const stage = document.querySelector("[data-plugin-stage]");
  const header = document.querySelector(".immersive-titlebar");
  const scrim = document.querySelector("[data-directory-dismiss]");
  const directoryFilterMenus = () => [];
  const narrow = () => matchMedia("(max-width: 600px)").matches;
  const currentPlugin = () => {
    if (treePane?.dataset.desktopDirectory === "settings") return "settings";
    if (treePane?.dataset.desktopDirectory === "project-settings") return "project-settings";
    const surface = getSurface();
    const canonical = canonicalSurface(surface);
    if (["home", "market"].includes(canonical) || host.pageSurfaces?.().includes(canonical)) return canonical;
    if (canonical === "settings") return "settings";
    if (canonical === "project-settings") return "project-settings";
    if (OWN_DIRECTORY_SURFACES.includes(surface)) return canonical;
    return [...(pluginRail?.querySelectorAll("[data-plugin-id]") || [])].some(button => button.dataset.pluginId === canonical) ? canonical : "";
  };
  const syncPresence = () => {
    const drawerOpen = narrow() && workspace.dataset.mobileView === "tree";
    workspace.classList.toggle("is-directory-drawer-open", drawerOpen);
    scrim.hidden = !drawerOpen;
    // The plugin list lives in the bar's switcher now, not in the drawer: it stays reachable at every width.
    pluginRail?.removeAttribute("inert");
    treePane.toggleAttribute("inert", narrow() && !drawerOpen);
    stage.toggleAttribute("inert", drawerOpen);
    header.removeAttribute("inert");
    host.pagePresence?.();
  };
  const retitle = () => {
    const surface = getSurface(), titles = readTitles(document), label = Object.hasOwn(titles, surface) ? titles[surface] : undefined;
    const labels = { sources: "Feed", home: document.body.dataset.projectId === "personal" ? globalThis.t.text("workbench.immersive-navigation.personal-home") : globalThis.t.text("workbench.immersive-navigation.project-home"),
      market: globalThis.t.text("workbench.immersive-navigation.plugin-market"), "project-settings": globalThis.t.text("workbench.immersive-navigation.project-settings") };
    const title = document.querySelector("[data-immersive-plugin-title]");
    if (title) { title.hidden = true; title.textContent = label || labels[surface] || surface; }
  };
  document.addEventListener("molis-work:language-changed", retitle);
  const sync = () => {
    const plugin = currentPlugin();
    if (heading) heading.hidden = false;
    strip?.querySelectorAll("[data-plugin-id]").forEach(button => {
      const active = button.dataset.pluginId === plugin;
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    // The bar's menus hold entries too (settings under the project, the market in the Dock menu), as does the foot's account bar
    // (设置); they show where you are.
    document.querySelectorAll("[data-assistant-island] [data-plugin-id], [data-dock] :is([data-personal-menu], [data-global-menu]) [data-plugin-id], [data-bar-account] [data-plugin-id]").forEach(button => {
      const active = button.dataset.pluginId === plugin;
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const projectGear = document.querySelector(".navigator-project-settings");
    if (projectGear) {
      if (plugin === "project-settings") {
        projectGear.setAttribute("aria-current", "page");
        projectGear.setAttribute("aria-label", globalThis.t.text("workbench.immersive-navigation.current-project-settings"));
      } else {
        projectGear.removeAttribute("aria-current");
        projectGear.setAttribute("aria-label", globalThis.t.text("workbench.immersive-navigation.open-current-project-settings"));
      }
    }
    // The first place's 项目设置 is the same entry where the right end has no project (POLISH-05 as rewritten): current while it shows.
    document.querySelectorAll("[data-top-corner-list] [data-directory-open=project-settings]").forEach(row => {
      if (plugin === "project-settings") row.setAttribute("aria-current", "page"); else row.removeAttribute("aria-current");
    });
    retitle();
    document.querySelector("[data-directory-show]")?.setAttribute("aria-expanded", String(!narrow() && !workspace.classList.contains("is-directory-collapsed")));
    syncPresence();
  };
  const showDirectory = () => {
    setDirectoryCollapsed(false);
    if (narrow()) setMobileView("tree");
    sync();
    saveUiState?.();
    requestAnimationFrame(() => {
      (document.querySelector("[data-directory-toggle]") || pluginRail?.querySelector("[data-plugin-id]"))?.focus();
    });
  };
  const hideDirectory = () => {
    if (narrow()) setMobileView("document");
    sync();
    document.querySelector("[data-directory-show]")?.focus();
  };
  document.querySelector("[data-directory-show]")?.addEventListener("click", showDirectory);
  scrim?.addEventListener("click", hideDirectory);
  document.addEventListener("click", (event) => {
    directoryFilterMenus().forEach((menu) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
  });
  document.addEventListener("click", event => {
    if (event.target.closest("[data-inbox-row]")) {
      if (narrow()) setMobileView("document");
      sync();
    }
  });
  // The plugin list is one Tab stop: the current plugin is tabbable, arrows move between plugins. Each plugin's two buttons
  // (open it beside, add or remove it) are shown while its entry has focus: → reaches them, ← comes back, and ↑ ↓ then
  // walk the buttons of the same kind down the list.
  const railItems = pluginRail?.querySelector(".plugin-rail-items");
  if (railItems) {
    const ENTRY = ".plugin-rail-item, [data-rail-tools-toggle]";
    const OPS = ".plugin-rail-ops > button";
    const usable = (nodes) => [...nodes].filter((button) => button.getClientRects().length && !button.disabled);
    const railButtons = () => usable(railItems.querySelectorAll(ENTRY));
    const syncRailTabStop = () => {
      const buttons = railButtons();
      const current = buttons.find((button) => button.classList.contains("is-current") || button.getAttribute("aria-current") === "page") || buttons[0];
      buttons.forEach((button) => { button.tabIndex = button === current ? 0 : -1; });
      railItems.querySelectorAll(OPS).forEach((button) => { button.tabIndex = -1; });
    };
    railItems.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const op = event.target.closest(OPS);
      const entry = op ? null : event.target.closest(ENTRY);
      const tile = (op || entry)?.closest(".plugin-rail-tile");
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (!tile) return;
        const stops = [tile.querySelector(":scope > .plugin-rail-item"), ...usable(tile.querySelectorAll(OPS))].filter(Boolean);
        const next = stops[stops.indexOf(op || entry) + (event.key === "ArrowRight" ? 1 : -1)];
        if (!next) return;
        event.preventDefault();
        // The entry a person comes back to is the one the list rests on.
        if (next.matches(ENTRY)) railButtons().forEach((button) => { button.tabIndex = button === next ? 0 : -1; });
        next.focus();
        return;
      }
      const buttons = op ? usable(railItems.querySelectorAll(OPS)).filter((button) => button.className.split(" ").some((name) => ["rail-beside", "plugin-toggle"].includes(name) && op.classList.contains(name))) : railButtons();
      const index = buttons.indexOf(op || entry);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1)
        : buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
      if (!op) buttons.forEach((button) => { button.tabIndex = button === next ? 0 : -1; });
      next.focus();
    });
    railItems.addEventListener("focusout", (event) => { if (!railItems.contains(event.relatedTarget)) syncRailTabStop(); });
    new MutationObserver(syncRailTabStop).observe(railItems, { subtree: true, attributes: true, attributeFilter: ["class", "aria-current", "hidden", "disabled"] });
    syncRailTabStop();
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
      const openMenu = directoryFilterMenus().find((menu) => menu.open);
      if (openMenu) { event.preventDefault(); openMenu.open = false; openMenu.querySelector("summary")?.focus(); return; }
      if (workspace.classList.contains("is-directory-drawer-open")) { event.preventDefault(); hideDirectory(); }
    }
    if (event.key === "Tab" && workspace.classList.contains("is-directory-drawer-open")) {
      const railControls = pluginRail ? [...pluginRail.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')] : [];
      const treeControls = [...treePane.querySelectorAll('button:not([disabled]), a[href], input, summary, [tabindex="0"]')];
      const controls = [...railControls, ...treeControls].filter(el => el.getClientRects().length && !el.closest("[hidden], [inert]"));
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) { event.preventDefault(); next?.focus(); }
    }
  });
  document.addEventListener("molis-work:record-panel-presence", syncPresence);
  window.addEventListener("resize", sync);
  return { sync, syncPresence, hideDirectory, showDirectory };
}`;
