import { SYSTEM_TABS_FACTORY, SCROLL_MEMORY_FACTORY } from "./system-tabs.js";
import { sideOpenedTabs } from "./plugin-place.js";
import { SIDE_PANE_FACTORY } from "../../side-panel.js";
import { recordRows, searchRows } from "../../search-rows.js";
import { pluginTabGlyphs } from "../../plugin-catalog.js";
import { createTabWorkspaceOps, isLoosePluginTab, settlePluginTabs, withLayout, withPluginGroups, withSidePane } from "../../tab-workspace-ops.js";
import { PLUGIN_TAB_GROUPS_FACTORY } from "./plugin-tab-groups.js";
import { OPENED_PLUGIN_RECORD_SCRIPT } from "./plugin-open-record.js";
import { TAB_DRAG_SLOT_FACTORY } from "./tab-drag-slot.js";
import { TAB_SASH_FACTORY } from "./tab-sash.js";
import { TAB_REORDER_EASE, TAB_REORDER_MS } from "../../tab-reorder.js";
import { TAB_SHARE_MAX, TAB_SHARE_MIN, TAB_SHARE_MIN_TOUCH } from "../../tab-strip-share.js";
import { TAB_SASH_HALF, TAB_SASH_INSET, TAB_SPLIT_EDGE_X, TAB_SPLIT_EDGE_Y, TAB_SPLIT_RATIO } from "../../tab-split-drop.js";
import { TAB_WORKSPACE_PANES_PART } from "./tab-workspace-panes.js";
import { TAB_WORKSPACE_STRIP_PART } from "./tab-workspace-strip.js";
import { TAB_WORKSPACE_PLACES_PART } from "./tab-workspace-places.js";
import { TAB_WORKSPACE_PLUGINS_PART } from "./tab-workspace-plugins.js";
import { TAB_WORKSPACE_MENUS_PART } from "./tab-workspace-menus.js";
import { TAB_WORKSPACE_DRAG_PART } from "./tab-workspace-drag.js";

export { placeLayoutMenu } from "./tab-workspace-menus.js";

/** Cross-plugin tabs and split panes. Goals canvas/kanban/Frame chrome stays in frame-container. */
export const TAB_WORKSPACE_FACTORY_SCRIPT = `(host) => {
  const { showToast, showGoalFrame, translate: L, getSurface, setWorkSurface, setDirectory, setWorkspaceMode, setMobileView,
    applySelection, loadGoalDocument, getDocumentGoalId, getProjectId, visibleGoals, showCanvas, restoreBoard, releaseFrame } = host;
  const root = document.querySelector("[data-tab-workspace]");
  const panesEl = document.querySelector("[data-tab-panes]");
  const pool = document.querySelector("[data-surface-pool]");
  if (!root || !panesEl || !pool) return { pluginTitle: (plugin) => plugin, apply() {}, openPlugin() {}, openPluginRecord() {}, openItem() {}, openBeside() {}, setExclusive() {}, restore() {}, isExclusive() { return false; },
    leavePlugin() { return false; }, closeCover() { return false; }, openCover() {}, registerCover() {}, noteCover() {}, coverPlace() { return ""; }, goHistory() { return false; }, shownPlugin() { return null; }, exclusive() { return null; } };
  const PLUGIN_TAB_ICON = ${JSON.stringify(pluginTabGlyphs())}, RECORD_ROWS = ${JSON.stringify(recordRows())};
  // A plugin whose only place is a side view (plugin-place) opens there: the right side is a pane of this workspace, so it is
  // the side's own open (recall or open, never a second copy), not an event sent before the workspace knows.
  const SIDE_OPENED = ${sideOpenedTabs()};
  const openInSide = (plugin, item, title) => {
    const key = Object.hasOwn(SIDE_OPENED, plugin) && SIDE_OPENED[plugin];
    if (key) sidePane?.open(key, item ? { item, title } : null);
    return Boolean(key);
  };
  const PLUGIN_TAB_TITLES = { home: "项目首页", market: L("插件市场"), ...globalThis.MOLIS_WORK_PLUGIN_TITLES };
  // Plugins installed at run time (built in the studio) name their own stage.
  document.querySelectorAll("[data-work-surface]").forEach((surface) => { const id = surface.dataset.workSurface; if (surface.dataset.workSurfaceLabel) PLUGIN_TAB_TITLES[id] = surface.dataset.workSurfaceLabel; if (!PLUGIN_TAB_ICON[id]) PLUGIN_TAB_ICON[id] = surface.dataset.installedPluginIcon || PLUGIN_TAB_ICON[surface.dataset.pluginClient] || "package"; });
  const GROUP_COLOR = { grey: "var(--hue-gray)", blue: "var(--hue-blue)", red: "var(--hue-red)", yellow: "var(--hue-yellow)", green: "var(--hue-green)", pink: "var(--hue-pink)", purple: "var(--hue-purple)", cyan: "var(--hue-cyan)" };
  const ops = (${withLayout.toString()})((${withSidePane.toString()})((${withPluginGroups.toString()})((${createTabWorkspaceOps.toString()})(PLUGIN_TAB_TITLES), ${settlePluginTabs.toString()}, ${isLoosePluginTab.toString()})));
${TAB_WORKSPACE_PANES_PART}
${TAB_WORKSPACE_STRIP_PART}
${TAB_WORKSPACE_PLACES_PART}
${TAB_WORKSPACE_PLUGINS_PART}
${TAB_WORKSPACE_MENUS_PART}
${TAB_WORKSPACE_DRAG_PART}
  const TAB_SPLIT_EDGE_X = ${TAB_SPLIT_EDGE_X};
  const TAB_SPLIT_EDGE_Y = ${TAB_SPLIT_EDGE_Y};
  const TAB_SPLIT_RATIO = ${TAB_SPLIT_RATIO};
  const TAB_SASH_INSET = ${TAB_SASH_INSET};
  const TAB_SASH_HALF = ${TAB_SASH_HALF};
  const TAB_REORDER_MS = ${TAB_REORDER_MS};
  const TAB_REORDER_EASE = ${JSON.stringify(TAB_REORDER_EASE)};
  const TAB_SHARE_MAX = ${TAB_SHARE_MAX};
  const TAB_SHARE_MIN = ${TAB_SHARE_MIN};
  const TAB_SHARE_MIN_TOUCH = ${TAB_SHARE_MIN_TOUCH};
  const storageKey = "molis-work-tab-workspace:" + (getProjectId() || "board");
  const paneParams = new URLSearchParams(location.search), personal = getProjectId() === "personal";
  // A link that asked for a plugin page (onboarding sends the person to Todo) is honored over "entering starts at home".
  let pluginRequestedOnLoad = false;
  const embedded = window.parent !== window && paneParams.has("workbenchPane");
  if (embedded) document.body.dataset.paneEmbedded = "true";
  const panes = host.paneMessages;
  if (embedded) {
    document.addEventListener("pointerdown", () => notifyParent("workbench-pane-focus"), true);
    document.addEventListener("focusin", () => notifyParent("workbench-pane-focus"));
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const path = new URL(link.href, location.origin).pathname;
      if (!path.includes("/settings")) return;
      event.preventDefault();
      notifyParent("workbench-open-settings", { href: link.href });
    });
  }
  const offeredPlugin = (plugin) => Boolean(document.querySelector('[data-global-menu] [data-plugin-id="' + CSS.escape(plugin) + '"], [data-plugin-strip] [data-plugin-id="' + CSS.escape(plugin) + '"]')); // a link opens only a plugin this project offers: its menu or strip lists the plugins it has on (Goals included, RAC-400)
  // A plugin taken out of the project keeps its tabs where they were, greyed and marked, with nothing else moving; added back,
  // they work again (design README, shared part 7). A Host surface is never one: it has its own stage or settings page.
  const removedPlugin = (plugin) => Boolean(plugin) && plugin !== "home" && plugin !== "market" && !offeredPlugin(plugin)
    && !document.querySelector('[data-work-surface="' + CSS.escape(plugin) + '"], [data-settings-page="' + CSS.escape(plugin) + '"]');
  /** What a pane shows for a tab of a plugin no longer in the project: what happened, and that adding it back brings it back. */
  const showRemoved = (pane, plugin) => {
    const body = panesEl.querySelector('[data-tab-pane="' + pane.id + '"] [data-tab-pane-body]');
    let stage = body?.querySelector(":scope > [data-tab-removed-stage]");
    if (!plugin || !body) { stage?.remove(); return; }
    if (!stage) { stage = document.createElement("div"); stage.className = "mw-empty tab-removed-stage"; stage.setAttribute("role", "status"); body.append(stage); }
    if (stage.dataset.tabRemovedStage === plugin) return;
    stage.dataset.tabRemovedStage = plugin;
    const title = document.createElement("h2"), note = document.createElement("p");
    title.textContent = L("{plugin} 已从这个项目移除", { plugin: L(ops.pluginTitle(plugin)) });
    note.textContent = L("标签和内容都还在；把它加回这个项目，就能接着用。");
    stage.replaceChildren(title, note);
  };
  let state = ops.create(), column = "main";
  let unsaved = false; // a layout this device would not keep is said once, and again only after it saved since
  const restore = (requestedGoalId = "", resetLayout = false) => {
    if (embedded) {
      state = ops.create();
      const pane = ops.focused(state);
      const plugin = paneParams.get("panePlugin") || "home";
      if (paneParams.has("paneItem")) ops.openItem(state, plugin, paneParams.get("paneItem"), paneParams.get("paneTitle"));
      else ops.openPlugin(state, plugin);
      if (paneParams.has("paneView")) ops.writeView(state, pane.id, paneParams.get("paneView"));
      apply();
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      // Only a layout of another shape starts fresh (口径 4). One naming a plugin this project no longer offers, or one Home no
      // longer has at all, is read as it is: that plugin's tabs stay, marked removed (removedPlugin), until added back or closed.
      if (!resetLayout && isCurrent(stored)) {
        state = ops.normalizeLayout(stored);
      } else if (stored || resetLayout) {
        state = ops.create();
        tabHistory.clear(); sessionStorage.removeItem(HISTORY_KEY);
      }
    } catch {}
    sidePane?.restore();
    // The right side kept alone (独看) has the focus it had.
    if (ops.soloSide(state)) column = "side";
    if (state.exclusive) coverPlace = historyCoverPlace(state.exclusive);
    const dropParams = (...names) => { const url = new URL(location.href); names.forEach(name => url.searchParams.delete(name)); history.replaceState(history.state, "", url); };
    let requestedPlugin = paneParams.get("openPlugin"), requestedItem = paneParams.get("openItem");
    // A side-panel plugin takes the link there (plugin-place).
    if (requestedPlugin && openInSide(requestedPlugin, requestedItem || paneParams.get("openRecord"), paneParams.get("openTitle"))) { dropParams("openPlugin", "openItem", "openTitle", "openRecord"); requestedPlugin = null; }
    if (requestedPlugin && Object.hasOwn(PLUGIN_TAB_ICON, requestedPlugin) && requestedItem && offeredPlugin(requestedPlugin)) {
      ops.setExclusive(state, null);
      const opened = !recall(requestedPlugin, requestedItem) && ops.openItem(state, requestedPlugin, requestedItem, paneParams.get("openTitle") || undefined);
      if (opened && paneParams.has("openView")) ops.writeView(state, ops.focused(state).id, paneParams.get("openView"), opened.id);
      dropParams("openPlugin", "openItem", "openTitle", "openView");
    }
    // A record in a plugin whose objects open from its own list (Forms, Dataset, PPT…): jump to it once the list is up.
    const requestedRecord = paneParams.get("openRecord");
    // Only the plugin asked for: open its page, if this project offers it (its menu lists the plugins it has on).
    if (requestedPlugin && !requestedItem && !requestedRecord && Object.hasOwn(PLUGIN_TAB_ICON, requestedPlugin)) {
      if (offeredPlugin(requestedPlugin)) {
        ops.setExclusive(state, null);
        const opened = !recall(requestedPlugin) && ops.openPlugin(state, requestedPlugin);
        if (opened && paneParams.has("openView")) ops.writeView(state, ops.focused(state).id, paneParams.get("openView"), opened.id);
        pluginRequestedOnLoad = true;
      }
      dropParams("openPlugin", "openView");
    }
    if (requestedPlugin && requestedRecord) {
      dropParams("openPlugin", "openRecord");
      requestAnimationFrame(() => openPluginRecord(requestedPlugin, requestedRecord));
    }
    // Resolve an explicit Goal link before applying saved tabs; applying the old
    // active item first can enqueue a stale document read over the requested Goal.
    if (requestedGoalId && offeredPlugin("goals")) {
      ops.setExclusive(state, null);
      ops.openItem(state, "goals", requestedGoalId, titleForItem("goals", requestedGoalId));
      setDirectory("goals", false, false);
    }
    removeSettingsPages();
    apply();
    persist();
  };
  const systemTabs = (${SYSTEM_TABS_FACTORY})({getState:()=>state,ops,apply:()=>apply(),persist,close:(pane,id)=>closeTabBack(pane,id),embedded});
  let loadingGoalId = null;
  const collapsePluginStage = (plugin) => {
    const surface = topLevelSurface(plugin);
    if (!surface) return;
    surface.setAttribute("data-expanded", "false");
    const workspace = surface.querySelector(".plugin-stage-workspace, [data-artifact-stage-workspace], [data-schedule-stage-workspace]");
    if (workspace) workspace.hidden = true;
    surface.querySelectorAll(".is-selected").forEach((row) => {
      row.classList.remove("is-selected");
      if (row.hasAttribute("aria-selected")) row.setAttribute("aria-selected", "false");
    });
    // The open object left the screen without the plugin knowing: stop naming it to the Assistant and the placement bar.
    [surface, ...surface.querySelectorAll("[data-assistant-context]")].forEach((node) => {
      if (!node.hasAttribute("data-assistant-context")) return;
      try {
        const context = JSON.parse(node.getAttribute("data-assistant-context") || "{}");
        if (!context.object) return;
        delete context.object;
        delete context.unsaved;
        node.setAttribute("data-assistant-context", JSON.stringify(context));
      } catch {}
    });
  };
  // A page load or a burst of state changes renders several times in a row, each naming the same object: the plugin
  // hears it once. Only an identical, immediately repeated request is dropped; "no item" to a page showing one never is.
  const lastSelection = new WeakMap();
  // Collapses the shell makes itself (showing a page for the first time, returning from a tab, the plugin tab) are
  // not the person closing a record: the record watcher below lets them pass, and the callers keep history themselves.
  const shellCollapse = new Set();
  /* The record opened on a plugin's own page (a note, a document, a form) is remembered per plugin on this device,
     so a reload reopens it. Going back to the list forgets it. Feed keeps its own reading state. */
  const RECORDS_KEY = "molis-work-plugin-records:" + (getProjectId() || "board");
  let openRecords = {};
  if (!embedded) {
    try {
      const saved = JSON.parse(localStorage.getItem(RECORDS_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) openRecords = Object.fromEntries(Object.entries(saved).filter(([, id]) => typeof id === "string" && id));
    } catch {}
  }
  const saveRecords = () => { if (!embedded) try { localStorage.setItem(RECORDS_KEY, JSON.stringify(openRecords)); } catch {} };
  /* What each plugin's surface last showed: its own page ("page") or one of its tabs ("tab:<id>"). Returning to the
     same thing keeps it as it was, down to where it was scrolled. */
  const surfaceShows = new Map();
  const {rememberScroll,restoreScroll} = (${SCROLL_MEMORY_FACTORY})();
  /* The entries that open a cover, wherever the bar keeps them. Pressed again while their cover is up, they close it. */
  const COVER_OPENERS = {
    settings: '[data-directory-open="settings"]',
    "project-settings": '[data-directory-open="project-settings"]',
    market: ':is([data-dock], [data-global-menu]) [data-plugin-id="market"]',
  };
  const tabShareObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const node = entry.target;
      shareTabStrip(node.matches("[data-tab-scroll]") ? node : node.querySelector("[data-tab-scroll]"));
    }
  });
  const titlebarStrip = document.querySelector("[data-titlebar-tabs]");
  if (titlebarStrip) new ResizeObserver(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.tab-strip:not([hidden]) [data-tab-id][aria-current]').forEach((tab) => {
        if (tab.getClientRects().length) scrollTabIntoStrip(tab);
      });
    });
  }).observe(titlebarStrip);
  const exclusiveEl = document.querySelector("[data-tab-exclusive]");
  let applying = false;
  let applyQueued = false;
  let historyLock = false;
  /* Where each pane has been: plugin pages ("plugin:<id>"), tabs (their id) and the covers opened over it
     ("cover:<kind>"). Kept for this browser session, so a reload keeps the way back. */
  const HISTORY_KEY = "molis-work-tab-history:" + (getProjectId() || "board");
  const HISTORY_LIMIT = 60;
  const tabHistory = new Map();
  if (!embedded) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "null");
      if (saved && typeof saved === "object") for (const [paneId, entry] of Object.entries(saved)) {
        const stack = Array.isArray(entry?.stack) ? entry.stack.filter((id) => typeof id === "string").slice(-HISTORY_LIMIT) : [];
        if (stack.length) tabHistory.set(paneId, { stack, index: Math.max(-1, Math.min(Number(entry.index) || 0, stack.length - 1)) });
      }
    } catch {}
  }
  const persistHistory = () => { // A closed pane's way back goes with it (VUX-36): the map holds only the panes that are open.
    for (const paneId of tabHistory.keys()) if (paneId !== "side" && !state.panes.some((pane) => pane.id === paneId)) tabHistory.delete(paneId); if (embedded) return;
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(Object.fromEntries(tabHistory))); } catch {}
  };
  // Where inside a cover the person is (a settings category, the page it loaded), so Back walks those too.
  let coverPlace = "";
  /* Covers (settings, project settings, market, capabilities) are opened by their owners, who register how;
     history and the bar reopen them the same way. */
  const coverOpeners = new Map();
  const KEPT_PANE_FRAMES = 4;
  // Search keeps owner-specific save/select behavior, including inside a split pane.
  const SEARCH_ROWS = ${JSON.stringify(searchRows())};
  // The Host's plugin directory on the page: each plugin's group colour (the hue its Manifest declares) and what ＋ lists (口径 8).
  // A plugin added or taken out in place brings the next page, and its directory, with it.
  const readDirectory = (doc) => JSON.parse(doc?.querySelector("script[data-plugin-directory]")?.textContent || "[]");
  let directory = readDirectory(document);
  const DIRECTORY_HUES = Object.fromEntries(directory.filter((entry) => entry.hue).map((entry) => [entry.id, entry.hue]));
  const pluginGroups = (${PLUGIN_TAB_GROUPS_FACTORY})({ getState: () => state, ops, apply: () => apply(), persist, L, rows: RECORD_ROWS.concat(SEARCH_ROWS), embedded, notify: notifyParent, editable: (node) => editable(node), appendTab, removed: removedPlugin, hues: DIRECTORY_HUES });
  // The right side, drawn from state.side; a tab closed there joins the closed groups, so ⌘⇧T reopens whichever closed last.
  // A main tab moved there shows in the workbench's own pane page, as a split pane does (07-S2).
  const paneUrl = (paneId, plugin, item, title, view) => {
    const url = new URL(location.href); url.hash = ""; url.search = "";
    url.pathname = location.pathname.startsWith("/projects/") ? "/projects/" + encodeURIComponent(getProjectId()) + "/" : "/";
    url.searchParams.set("workbenchPane", paneId); url.searchParams.set("panePlugin", plugin); url.searchParams.set("paneTitle", title || "");
    if (item) url.searchParams.set("paneItem", item);
    if (view !== undefined) url.searchParams.set("paneView", view);
    return url.href;
  };
  const sidePane = embedded ? null : (${SIDE_PANE_FACTORY})({ ops, getState: () => state, save: persist, remember: pluginGroups.keep, undoChip: pluginGroups.undoChip, menu: (tab, entries) => openSideTabMenu(tab, entries), removed: removedPlugin, L,
    paneSrc: (tab) => paneUrl("side", tab.plugin, tab.item, tab.title, tab.view), glyph: iconMarkup, toMain: (id) => moveToMain(id) });
  // A plugin taken out or added back in place: its tabs are drawn again, marked removed or working (removedPlugin).
  document.addEventListener("molis-work:plugins-changed", (event) => { if (event.detail?.next) directory = readDirectory(event.detail.next); apply(); });
  let cancelRecordJump = null;
  // Remember the record chosen on a plugin's own page (not inside one of its tabs).
  document.addEventListener("click", (event) => {
    if (embedded) return;
    const target = event.target?.nodeType === 1 ? event.target : null;
    const surface = target?.closest("[data-work-surface]");
    if (!surface) return;
    const plugin = ops.pluginOfSurface(surface.dataset.workSurface);
    const spec = plugin !== "feed" && SEARCH_ROWS.find(([id]) => id === plugin);
    const row = spec ? target.closest(spec[1]) : null;
    const itemId = row && surface.contains(row) ? row.dataset[spec[2]] : "";
    const pane = ops.focused(state);
    if (!itemId || !pane || state.exclusive || pane.activeTabId || pane.viewPlugin !== plugin || openRecords[plugin] === itemId) return;
    if (event.isTrusted) cancelRecordJump?.();
    openRecords[plugin] = itemId;
    saveRecords();
    notePlace();
  }, true);
  // A plugin closing its own detail (its back chevron) is back at the list: nothing to reopen.
  if (!embedded) new MutationObserver((records) => {
    for (const record of records) {
      const surface = record.target;
      if (surface?.nodeType !== 1 || !surface.matches("[data-work-surface]")) continue;
      const plugin = ops.pluginOfSurface(surface.dataset.workSurface);
      if (surface.getAttribute("data-expanded") === "true") {
        // A record opened without its row being clicked (a note just created): the row the plugin marks as chosen names it.
        const spec = plugin !== "feed" && SEARCH_ROWS.find(([id]) => id === plugin);
        if (spec) setTimeout(() => {
          const pane = ops.focused(state);
          if (!pane || state.exclusive || pane.activeTabId || pane.viewPlugin !== plugin || historyLock) return;
          const itemId = (${OPENED_PLUGIN_RECORD_SCRIPT})(surface, spec[1], spec[2]);
          if (!itemId || openRecords[plugin] === itemId) return;
          openRecords[plugin] = itemId;
          saveRecords();
          notePlace();
        }, 0);
        continue;
      }
      if (surface.getAttribute("data-expanded") !== "false" || shellCollapse.has(plugin)) continue;
      if (forgetRecord(plugin)) notePlace();
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-expanded", "data-assistant-context"] });
  /* Whoever reads the page's situation (selection, context) learns when the place changes, in the same words history
     uses: "plugin:<id>", a tab id, or "cover:<kind>[|<page>]". */
  let announcedPlace = { paneId: "", place: "" };
  const tabMenu = document.createElement("div");
  tabMenu.className = "workspace-layout-menu workspace-tab-menu mw-menu mw-menu--context";
  // Contextmenu fires on mouse-down on macOS; auto popovers dismiss on its mouse-up.
  tabMenu.setAttribute("popover", "manual"); tabMenu.setAttribute("role", "menu");
  tabMenu.dataset.workspaceTabMenu = ""; document.body.append(tabMenu);
  document.addEventListener("pointerdown", event => {
    if (tabMenu.matches(":popover-open") && !tabMenu.contains(event.target)) tabMenu.hidePopover();
  });
  document.addEventListener("focusin", event => {
    if (tabMenu.matches(":popover-open") && !tabMenu.contains(event.target)) tabMenu.hidePopover();
  });
  let tabMenuAnchor = null;
  tabMenu.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); tabMenu.hidePopover();
      (tabMenuAnchor?.querySelector(".tab-item-trigger") || tabMenuAnchor)?.focus({preventScroll:true}); return;
    }
    // Arrows, Home and End move through its items by the shared roving focus (design-system browser/roving-focus.ts).
  });
  // The titlebar's layout button, drawn by the shell (immersive-shell.ts) after the right side's glyphs.
  document.addEventListener("click", (event) => { const button = !embedded && event.target?.closest?.("[data-layout-open]"); if (button) openLayoutMenu(button); });
  /* Which column the person is in, the focused main pane or the right side (§4.6 口径 1: one focus over both): the layout menu
     acts on it and the titlebar's arrows walk its way back. It follows where they press or move the focus, a frame included. */
  const columnOf = (node) => node?.closest?.("[data-side-panel], [data-side-tabs]") ? "side" : node?.closest?.("[data-tab-panes], [data-titlebar-tabs]") ? "main" : "";
  const followColumn = (node) => { const next = columnOf(node); if (next && next !== column) { column = next; syncHistoryButtons(); } };
  if (!embedded) {
    document.addEventListener("pointerdown", (event) => followColumn(event.target), true);
    document.addEventListener("focusin", (event) => followColumn(event.target));
    window.addEventListener("blur", () => setTimeout(() => followColumn(document.activeElement)));
  }
  /* The right side's way back (07-S1, kept under "side" with the panes' history): the tabs it showed, in turn. A step back shows
     the one before; a collapse or 独看 ending redraws what depends on the side. */
  document.addEventListener("molis:side-shown", (event) => {
    if (embedded) return;
    if (state.solo) apply();
    if (!event.detail?.open) { if (column === "side") column = "main"; syncHistoryButtons(); return; }
    if (event.detail.tab) { rememberPlace("side", event.detail.tab, sideKept); persistHistory(); syncHistoryButtons(); }
  });
  // ⌘⇧↵ / Ctrl+Shift+Enter shows only the focused pane, and brings the rest back (口径 2); a pane page hands it up.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.shiftKey || event.altKey || !(MAC ? event.metaKey : event.ctrlKey) || editable(event.target)) return;
    event.preventDefault();
    if (embedded) { notifyParent("workbench-pane-solo"); return; }
    toggleSolo(); apply(); persist();
  });
  panesEl.addEventListener("click", (event) => {
    const pane = event.target.closest("[data-tab-pane]");
    if (!pane) return;
    const closePane = event.target.closest("[data-tab-pane-close]");
    if (closePane) {
      event.preventDefault();
      ops.closePane(state, pane.dataset.tabPane);
      apply();
      persist();
      return;
    }
    const edge = event.target.closest("[data-tab-edge]");
    if (edge) {
      if (narrow()) return;
      ops.splitPane(state, pane.dataset.tabPane, edge.dataset.tabEdge, "copy");
      apply();
      persist();
      return;
    }
    if (handleStripClick(pane.dataset.tabPane, event)) return;
    // Content clicks in the focused pane must not remount its document and lose focus.
    if (state.focusedPaneId !== pane.dataset.tabPane) activate(pane.dataset.tabPane, pane.querySelector("[data-tab-id][aria-current]")?.dataset.tabId);
  });
  if (titlebarStrip) {
    titlebarStrip.addEventListener("click", (event) => handleStripClick(titlebarStrip.dataset.chromePane, event));
    titlebarStrip.addEventListener("keydown", (event) => handleStripKey(titlebarStrip.dataset.chromePane, event));
  }
  document.querySelector(".workspace-history")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-workspace-history]");
    if (!button || button.disabled) return;
    if (button.dataset.workspaceHistory === "back") goHistory(-1);
    if (button.dataset.workspaceHistory === "forward") goHistory(1);
  });
  /* The way back from the keyboard and the mouse: ⌘[ / ⌘] (Alt+← / Alt+→ elsewhere) and the side buttons walk the
     same history as the titlebar arrows. A pane in a frame hands the step to the window. */
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  document.addEventListener("keydown", (event) => {
    const delta = historyStep(event);
    if (!delta || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    stepHistory(delta);
  });
  window.addEventListener("mousedown", (event) => { if (sideButton(event)) event.preventDefault(); });
  window.addEventListener("mouseup", (event) => {
    if (!sideButton(event)) return;
    event.preventDefault();
    stepHistory(event.button === 3 ? -1 : 1);
  });
  /* Esc steps out of a cover, unless something smaller is open in it (a field being typed in, a menu, a dialog, a
     page's own editor marked data-cover-layer) or a save is under way: those take the Esc first. */
  let escapeHadLayer = false;
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") escapeHadLayer = openLayer(); }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || embedded || !state.exclusive || escapeHadLayer || event.defaultPrevented || editable(event.target)) return;
    event.preventDefault();
    closeCover();
  });
  /* The entry that opened a cover closes it when chosen again, and the menu it sits in closes with it. */
  window.addEventListener("click", (event) => {
    if (embedded || !state.exclusive || event.target?.nodeType !== 1) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const kind = coverKindOf(event.target);
    if (!kind || kind !== state.exclusive) return;
    event.preventDefault();
    event.stopPropagation();
    event.target.closest("details[open]")?.removeAttribute("open");
    closeCover();
  }, true);
  panesEl.addEventListener("keydown", (event) => { if (!event.target.closest("[data-tab-sash]")) handleStripKey(event.target.closest("[data-tab-pane]")?.dataset.tabPane, event); });
  (${TAB_SASH_FACTORY})({ panes: panesEl, root, find: (id) => findSplit(state.layout.tree, id), sync: layoutSplits, persist, range: splitRatioRange, snap: snapSplitRatio, defaultRatio: TAB_SPLIT_RATIO });
  let dragTab = null;
  let reorderKey = "";
  const dragSlot = (${TAB_DRAG_SLOT_FACTORY})({ ms: TAB_REORDER_MS, ease: TAB_REORDER_EASE });
  const paintResultPreview = (target, copy) => {
    if (!target?.paneId || !dragTab) { delete panesEl.dataset.splitDropPreview; return; }
    let box = null;
    try {
      box = focusedPaneBoxAfterDrop(state, ops, target, copy, dragTab.paneId, dragTab.tabId);
    } catch {}
    if (!box) box = layoutPaneBoxes(state.layout.tree).find((item) => item.paneId === target.paneId);
    if (!box) { delete panesEl.dataset.splitDropPreview; return; }
    const stage = panesEl.getBoundingClientRect();
    panesEl.style.setProperty("--split-preview-left", (stage.left + stage.width * box.x / 100 + 4) + "px");
    panesEl.style.setProperty("--split-preview-top", (stage.top + stage.height * box.y / 100 + 4) + "px");
    panesEl.style.setProperty("--split-preview-width", Math.max(0, stage.width * box.w / 100 - 8) + "px");
    panesEl.style.setProperty("--split-preview-height", Math.max(0, stage.height * box.h / 100 - 8) + "px");
    // Recreate ::after so inherited custom properties recompute; changing only the vars leaves the old used size.
    delete panesEl.dataset.splitDropPreview;
    void panesEl.offsetWidth;
    panesEl.dataset.splitDropPreview = "1";
  };
  [panesEl, titlebarStrip].filter(Boolean).forEach((surface) => {
    surface.addEventListener("contextmenu", (event) => {
      const paneId = event.target.closest("[data-tab-pane]")?.dataset.tabPane || surface.dataset.chromePane;
      const groupLabel = event.target.closest("[data-tab-group-toggle]");
      if (groupLabel) {
        event.preventDefault(); openGroupMenu(paneId, groupLabel.dataset.tabGroupToggle, groupLabel); return;
      }
      const tab = event.target.closest("[data-tab-id]"); if (!tab) return;
      event.preventDefault(); openTabMenu(paneId, tab, tab.dataset.tabId);
    });
    surface.addEventListener("dragstart", (event) => {
      const tab = event.target.closest("[data-tab-id]"); if (!tab) return;
      // A plugin's tab carries its whole group.
      const group = tab.dataset.tabKind === "plugin" ? tab.closest("[data-plugin-group]") : null, source = group || tab;
      const paneId = tab.closest("[data-tab-pane]")?.dataset.tabPane || surface.dataset.chromePane || state.focusedPaneId;
      const members = group ? [...group.querySelectorAll(".tab-item[data-tab-id]")].map((node) => node.dataset.tabId) : null;
      const pane = paneById(paneId), last = pane ? pane.tabs.findIndex((item) => item.id === (members?.at(-1) || tab.dataset.tabId)) : -1;
      const box = source.getBoundingClientRect();
      // The first preview is the place the drag started from, so nothing moves until the pointer does.
      dragTab = { paneId, tabId: tab.dataset.tabId, width: Math.round(box.width) || 172, members, hoverBeforeId: pane?.tabs[last + 1]?.id, homeBeforeId: pane?.tabs[last + 1]?.id };
      if (event.dataTransfer.effectAllowed !== "copy") event.dataTransfer.effectAllowed = "copyMove"; event.dataTransfer.setData("text/plain", tab.title);
      const ghost = document.createElement("nav");
      ghost.className = "tab-strip"; ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = "position:absolute;top:-1000px;left:0;width:auto;height:auto;margin:0;padding:0;border:0;background:transparent;";
      const copyNode = source.cloneNode(true);
      copyNode.style.width = dragTab.width + "px"; copyNode.style.margin = "0";
      ghost.append(copyNode);
      document.body.append(ghost);
      try { event.dataTransfer.setDragImage(ghost, Math.max(0, Math.min(event.clientX - box.left, dragTab.width)), Math.max(0, Math.min(event.clientY - box.top, box.height))); } catch {}
      requestAnimationFrame(() => ghost.remove());
      root.classList.add("is-tab-dragging"); window.addEventListener("pointermove", () => { if (dragTab) finishDrag(); }, { once: true, capture: true }); // a tab redrawn mid-drag takes its dragend with it; no pointer moves come during a drag
      document.body.classList.add("is-tab-dragging");
      document.body.style.setProperty("--tab-reorder-width", dragTab.width + "px");
    });
    surface.addEventListener("dragend", finishDrag); surface.addEventListener("dragleave", (event) => { if (dragTab && !event.relatedTarget?.closest?.("[data-tab-panes], [data-titlebar-tabs]")) { root.querySelectorAll("[data-drop-preview]").forEach((node) => node.removeAttribute("data-drop-preview")); paintDropPreview({ paneId: dragTab.paneId, beforeId: dragTab.homeBeforeId }, false); } }); // off every tab surface a drop does nothing, so the preview is the tab back where it was
    surface.addEventListener("dragover", (event) => {
      if (!dragTab) return; event.preventDefault();
      const copy = isCopyDrop(event);
      if (event.dataTransfer) event.dataTransfer.dropEffect = copy ? "copy" : "move";
      const target = dropTarget(event, surface);
      root.querySelectorAll("[data-drop-preview]").forEach((node) => node.removeAttribute("data-drop-preview"));
      if (target.section) target.section.dataset.dropPreview = target.edge || "center";
      paintDropPreview(target, copy);
    });
    surface.addEventListener("drop", (event) => {
      if (!dragTab) return; event.preventDefault();
      const target = dropTarget(event, surface);
      const copy = isCopyDrop(event);
      if (target.paneId) {
        if (target.edge) ops.splitPane(state, target.paneId, target.edge, copy ? "copy" : "move", dragTab.paneId, dragTab.tabId);
        else {
          ops.moveTab(state, dragTab.paneId, dragTab.tabId, target.paneId, target.beforeId, copy);
          if (target.groupId && !dragTab.members) ops.addTabToGroup(state, target.paneId, ops.activeTab(state)?.id, target.groupId);
        }
      }
      finishDrag(); apply(); persist();
    });
  });
  window.addEventListener("message", (event) => {
    if (embedded) {
      if (!panes.fromParent(event)) return;
      if (event.data.type === "workbench-view-invalidate") { const surface = topLevelSurface(ops.shownPlugin(ops.focused(state))); if (surface) invalidateView(surface, false); return; }
      // The parent's ask for one record of a plugin here (its jump to a record), after this page's own start; its shape is
      // checked with its source (S-30), and one that fails is dropped below.
      const ask = panes.recordAsk(event);
      if (ask) { document.querySelector('[data-work-surface="' + CSS.escape(ask.plugin) + '"]')?.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: ask.itemId, quiet: ask.quiet } })); return; }
      if (event.data.type !== "workbench-view") return;
      if (ops.writeView(state, state.panes[0]?.id, event.data.view)) apply();
      if (event.data.intent === "open" || event.data.intent === "select") { const tab = ops.activeTab(state); if (tab) projectOwnSurface(ops.focused(state), tab.plugin, { id: event.data.view, surface: event.data.surface, panel: event.data.panel, intent: event.data.intent }, tab); }
      return;
    }
    const frame = panes.from(event);
    if (frame && event.data.type === "workbench-open-settings") {
      // A return trip's source is the pane this frame is (specs/draft-and-return §2.3, returnRelay in return-trips.ts), never the one it names.
      const paneId = frame.dataset.paneOwner || "";
      const surface = paneById(paneId)?.tabs.find(tab => tab.id === frame.dataset.paneTab)?.plugin || (frame.dataset.paneKey?.startsWith("plugin:") ? frame.dataset.paneKey.slice(7) : "");
      document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: molisWorkSettingsReturn.relay(event.data, paneId, surface) }));
      return;
    }
    if (!["workbench-pane-invalidate", "workbench-pane-focus", "workbench-pane-open", "workbench-pane-open-beside", "workbench-pane-view", "workbench-pane-history", "workbench-pane-solo"].includes(event.data?.type)) return;
    // A main tab moved to the right side (07-S2): its page keeps the tab's view, and what it opens opens in the main area.
    if (frame?.dataset.paneOwner === "side") {
      const tab = state.side.tabs.find((candidate) => candidate.kind === "pane" && frame.closest("[data-side-body]")?.dataset.sideBody === candidate.itemId);
      if (event.data.type === "workbench-pane-focus") column = "side";
      else if (event.data.type === "workbench-pane-view" && tab) { if (event.data.view === undefined) delete tab.view; else tab.view = event.data.view; persist(); }
      else if (event.data.type === "workbench-pane-open" && event.data.itemId) openItem(event.data.plugin, event.data.itemId, event.data.title, event.data.view);
      else if (event.data.type === "workbench-pane-open") openPlugin(event.data.plugin);
      // ⌘⇧↵ in the side's pane page: the side is the focused column, so it goes alone (or comes back).
      else if (event.data.type === "workbench-pane-solo") { column = "side"; toggleSolo(); apply(); persist(); }
      return;
    }
    const pane = paneById(frame?.dataset.paneOwner);
    if (!pane) return;
    if (event.data.type === "workbench-pane-invalidate") {
      const tab = pane.tabs.find(tab => tab.id === frame.dataset.paneTab);
      const plugin = tab?.plugin || (frame.dataset.paneKey?.startsWith("plugin:") ? frame.dataset.paneKey.slice(7) : "");
      const surface = topLevelSurface(plugin); if (surface) invalidateView(surface);
    } else if (event.data.type === "workbench-pane-history") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
      if (event.data.delta === -1 || event.data.delta === 1) goHistory(event.data.delta);
    } else if (event.data.type === "workbench-pane-view") {
      const tab = pane.tabs.find(tab => tab.id === frame.dataset.paneTab)
        || (frame.dataset.paneTab === pane.id + ":view" && pane.tabs.find(tab => tab.kind === "plugin" && "plugin:" + tab.plugin === frame.dataset.paneKey));
      if (tab) writeView(pane.id, event.data.view, tab.id);
    } else if (event.data.type === "workbench-pane-solo") {
      state.focusedPaneId = pane.id; toggleSolo(); apply(); persist();
    } else if (event.data.type === "workbench-pane-focus") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
    } else if (event.data.type === "workbench-pane-open-beside") {
      state.focusedPaneId = pane.id;
      openBeside(event.data.plugin, event.data.itemId, event.data.title);
    } else {
      state.focusedPaneId = pane.id;
      if (event.data.background === true && event.data.itemId) pluginGroups.openBehind(event.data.plugin, event.data.itemId, event.data.title);
      else if (typeof event.data.recordId === "string") openPluginRecord(event.data.plugin, event.data.recordId);
      else if (event.data.itemId) openItem(event.data.plugin, event.data.itemId, event.data.title, event.data.view); else { openPlugin(event.data.plugin); if (Object.hasOwn(event.data, "view")) selectPluginView(pane, event.data.plugin, { id: event.data.view, panel: event.data.panel, surface: event.data.surface, intent: event.data.viewIntent || "open" }); }
    }
  });
  document.addEventListener("click", (event) => {
    const sourceItem = event.target.closest("[data-workbench-item-plugin][data-workbench-item-id]");
    if (sourceItem) {
      event.preventDefault();
      const plugin = sourceItem.dataset.workbenchItemPlugin, itemId = sourceItem.dataset.workbenchItemId;
      if (!Object.hasOwn(PLUGIN_TAB_ICON, plugin) || !itemId) return;
      const title = sourceItem.dataset.workbenchItemTitle;
      if (embedded) notifyParent("workbench-pane-open", { plugin, itemId, title });
      else openItem(plugin, itemId, title);
      return;
    }
    if (event.target.closest("[data-goal-collapse]")) {
      const tab = ops.activeTab(state);
      if (tab?.plugin === "goals" && tab.kind === "item") { writeView(ops.focused(state).id, undefined, tab.id); if (embedded) notifyParent("workbench-pane-view", { view: undefined }); }
    }
  });
  // Choosing another Goal inside a Goal tab (its workspace directory, a relation link) takes the tab with it, so its
  // label and restore target match what it shows; a Goal that already has its own tab is opened there instead.
  document.addEventListener("molis-work:goal-changed", (event) => {
    const goalId = event.detail?.goalId;
    if (embedded || applying || !goalId) return;
    const pane = ops.focused(state), tab = ops.activeTab(state);
    if (!pane || tab?.plugin !== "goals" || tab.kind !== "item" || tab.itemId === goalId) return;
    const existing = pane.tabs.find((item) => item.plugin === "goals" && item.kind === "item" && item.itemId === goalId);
    if (existing) { if (tab.view === "work") existing.view = "work"; activate(pane.id, existing.id); return; }
    tab.itemId = goalId;
    if (event.detail.goalTitle) tab.title = event.detail.goalTitle;
    // The selection that fired this is already loading the Goal's document; redraw the tab without a second load,
    // which would race the one whose late response must not win.
    const loading = loadingGoalId;
    loadingGoalId = goalId;
    apply(); persist();
    if (loadingGoalId === goalId) loadingGoalId = loading;
  });
  document.addEventListener("workbench-open-group", event => {
    if (typeof event.detail?.surface !== "string" || typeof event.detail.id !== "string") return;
    openPlugin(event.detail.surface, event.detail.id);
  });
  return { apply, readView, writeView, openView, invalidateView, openPlugin, openPluginRecord, openItem, openBeside, openBehind: pluginGroups.openBehind, openGoalWork, closeItem, setExclusive, restore, landAtProjectRoot,
    pluginTitle: ops.pluginTitle, leavePlugin, closeCover, openCover, registerCover, noteCover, coverPlace: restoredCoverPlace, goHistory,
    shownPlugin: () => state.exclusive ? null : ops.shownPlugin(ops.focused(state)),
    exclusive: () => state.exclusive, isExclusive: () => Boolean(state.exclusive), isEmbedded: () => embedded, state: () => state };
}`;
