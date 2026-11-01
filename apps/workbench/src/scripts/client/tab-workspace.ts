import { SYSTEM_TABS_FACTORY, SCROLL_MEMORY_FACTORY } from "./system-tabs.js";
import { openPluginInSide, sideOpenedTabs } from "./plugin-place.js";
import { recordRows, searchRows } from "../../search-rows.js";
import { pluginTabGlyphs } from "../../plugin-catalog.js";
import { createTabWorkspaceOps, isLoosePluginTab, settlePluginTabs, withPluginGroups } from "../../tab-workspace-ops.js";
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
  const { showToast, showGoalFrame, setFeedAddOpen, setFeedTask, translate: L, getSurface, setWorkSurface, setDirectory, setWorkspaceMode, setMobileView,
    applySelection, loadGoalDocument, getDocumentGoalId, selectFeedItem, selectInboxEntry, getProjectId, visibleGoals, showCanvas, restoreBoard, releaseFrame } = host;
  const root = document.querySelector("[data-tab-workspace]");
  const panesEl = document.querySelector("[data-tab-panes]");
  const pool = document.querySelector("[data-surface-pool]");
  if (!root || !panesEl || !pool) return { pluginTitle: (plugin) => plugin, apply() {}, openPlugin() {}, openPluginRecord() {}, openItem() {}, openBeside() {}, setExclusive() {}, restore() {}, isExclusive() { return false; },
    leavePlugin() { return false; }, closeCover() { return false; }, openCover() {}, registerCover() {}, noteCover() {}, coverPlace() { return ""; }, goHistory() { return false; }, shownPlugin() { return null; }, exclusive() { return null; } };
  const PLUGIN_TAB_ICON = ${JSON.stringify(pluginTabGlyphs())}, RECORD_ROWS = ${JSON.stringify(recordRows())};
  const openInSide = (${openPluginInSide}).bind(null, ${sideOpenedTabs()});
  const PLUGIN_TAB_TITLES = { home: "项目首页", market: L("插件市场"), ...globalThis.MOLIS_WORK_PLUGIN_TITLES };
  // Plugins installed at run time (built in the studio) name their own stage.
  document.querySelectorAll("[data-work-surface][data-installed-plugin]").forEach((surface) => { PLUGIN_TAB_TITLES[surface.dataset.workSurface] = surface.dataset.workSurfaceLabel; PLUGIN_TAB_ICON[surface.dataset.workSurface] = "package"; });
  const GROUP_COLOR = { grey: "var(--hue-gray)", blue: "var(--hue-blue)", red: "var(--hue-red)", yellow: "var(--hue-yellow)", green: "var(--hue-green)", pink: "var(--hue-pink)", purple: "var(--hue-purple)", cyan: "var(--hue-cyan)" };
  const ops = (${withPluginGroups.toString()})((${createTabWorkspaceOps.toString()})(PLUGIN_TAB_TITLES), ${settlePluginTabs.toString()}, ${isLoosePluginTab.toString()});
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
  let state = ops.create();
  let unsaved = false; // a layout this device would not keep is said once, and again only after it saved since
  const restore = (requestedGoalId = "", resetLayout = false) => {
    if (embedded) {
      state = ops.create();
      const pane = ops.focused(state);
      const plugin = paneParams.get("panePlugin") || "home";
      if (paneParams.has("paneItem")) {
        pane.tabs = [];
        pane.activeTabId = null;
        pane.groups = [];
        ops.openItem(state, plugin, paneParams.get("paneItem"), paneParams.get("paneTitle"));
      } else if (plugin === "home") {
        ops.openPlugin(state, "home");
      } else {
        pane.tabs = [];
        pane.activeTabId = null;
        pane.groups = [];
        ops.openPlugin(state, plugin);
      }
      if (paneParams.has("paneView")) ops.writeView(state, pane.id, paneParams.get("paneView"));
      apply();
      return;
    }
    const offeredPlugin = (plugin) => Boolean(document.querySelector('[data-global-menu] [data-plugin-id="' + CSS.escape(plugin) + '"], [data-plugin-strip] [data-plugin-id="' + CSS.escape(plugin) + '"]')); // a link opens only a plugin this project offers: its menu or strip lists the plugins it has on (Goals included, RAC-400)
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      const plugins = { ...PLUGIN_TAB_ICON }; if (!offeredPlugin("goals")) delete plugins.goals; // a layout saved with Goals starts fresh in a project without it, as for any plugin gone
      document.querySelectorAll("[data-settings-page]").forEach(node => { plugins[node.dataset.settingsPage] = true; });
      if (!resetLayout && isCurrent(stored, plugins)) {
        state = ops.ensureHome(stored);
      } else if (stored || resetLayout) {
        state = ops.create();
        tabHistory.clear(); sessionStorage.removeItem(HISTORY_KEY);
      }
    } catch {}
    if (state.exclusive) coverPlace = historyCoverPlace(state.exclusive);
    const dropParams = (...names) => { const url = new URL(location.href); names.forEach(name => url.searchParams.delete(name)); history.replaceState(history.state, "", url); };
    let requestedPlugin = paneParams.get("openPlugin"), requestedItem = paneParams.get("openItem");
    // A side-panel plugin takes the link there (plugin-place).
    if (requestedPlugin && openInSide(requestedPlugin, requestedItem || paneParams.get("openRecord"), paneParams.get("openTitle"))) { dropParams("openPlugin", "openItem", "openTitle", "openRecord"); requestedPlugin = null; }
    if (requestedPlugin && Object.hasOwn(PLUGIN_TAB_ICON, requestedPlugin) && requestedItem && offeredPlugin(requestedPlugin)) {
      ops.setExclusive(state, null);
      const opened = ops.openItem(state, requestedPlugin, requestedItem, paneParams.get("openTitle") || undefined);
      if (opened && paneParams.has("openView")) ops.writeView(state, ops.focused(state).id, paneParams.get("openView"), opened.id);
      dropParams("openPlugin", "openItem", "openTitle", "openView");
    }
    // A record in a plugin whose objects open from its own list (Forms, Dataset, PPT…): jump to it once the list is up.
    const requestedRecord = paneParams.get("openRecord");
    // Only the plugin asked for: open its page, if this project offers it (its menu lists the plugins it has on).
    if (requestedPlugin && !requestedItem && !requestedRecord && Object.hasOwn(PLUGIN_TAB_ICON, requestedPlugin)) {
      if (offeredPlugin(requestedPlugin)) {
        ops.setExclusive(state, null);
        state.focusedPaneId = ops.focused(state).id;
        const opened = ops.openPlugin(state, requestedPlugin);
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
    for (const paneId of tabHistory.keys()) if (!state.panes.some((pane) => pane.id === paneId)) tabHistory.delete(paneId); if (embedded) return;
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
  // Each plugin's group colour is the hue its Manifest declares, which the Host writes into the page's plugin directory.
  const DIRECTORY_HUES = Object.fromEntries(JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]").filter((entry) => entry.hue).map((entry) => [entry.id, entry.hue]));
  const pluginGroups = (${PLUGIN_TAB_GROUPS_FACTORY})({ getState: () => state, ops, apply: () => apply(), persist, L, rows: RECORD_ROWS.concat(SEARCH_ROWS), embedded, notify: notifyParent, editable: (node) => editable(node), appendTab, hues: DIRECTORY_HUES });
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
  const layoutMenu = document.createElement("div");
  layoutMenu.className = "workspace-layout-menu mw-menu"; layoutMenu.setAttribute("popover", "auto"); layoutMenu.dataset.workspaceLayout = "";
  layoutMenu.setAttribute("aria-label", L("布局与分屏")); document.body.append(layoutMenu);
  layoutMenu.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...layoutMenu.querySelectorAll("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: "nearest" });
  });
  let layoutPane = null;
  layoutMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.layoutSplit) ops.splitPane(state, layoutPane, button.dataset.layoutSplit, "copy");
    else if (button.dataset.layoutAction === "close") ops.closePane(state, layoutPane);
    else if (button.dataset.layoutAction === "equal") { const equal = node => { if (node?.children) { node.ratio=.5; node.children.forEach(equal); } }; equal(state.layout.tree); }
    else if (button.dataset.focusPane) state.focusedPaneId = button.dataset.focusPane;
    layoutMenu.hidePopover(); apply(); persist(); focusActiveTab();
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
      if (event.data.type !== "workbench-view") return;
      if (ops.writeView(state, state.panes[0]?.id, event.data.view)) apply();
      return;
    }
    const frame = panes.from(event);
    if (frame && event.data.type === "workbench-open-settings") {
      document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: event.data.href || "" } }));
      return;
    }
    if (!["workbench-pane-focus", "workbench-pane-open", "workbench-pane-open-beside", "workbench-pane-view", "workbench-pane-history"].includes(event.data?.type)) return;
    const pane = paneById(frame?.dataset.paneOwner);
    if (!pane) return;
    if (event.data.type === "workbench-pane-history") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
      if (event.data.delta === -1 || event.data.delta === 1) goHistory(event.data.delta);
    } else if (event.data.type === "workbench-pane-view") {
      const tab = pane.tabs.find(tab => tab.id === frame.dataset.paneTab)
        || (frame.dataset.paneTab === pane.id + ":view" && pane.tabs.find(tab => tab.kind === "plugin" && "plugin:" + tab.plugin === frame.dataset.paneKey));
      if (tab) writeView(pane.id, event.data.view, tab.id);
    } else if (event.data.type === "workbench-pane-focus") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
    } else if (event.data.type === "workbench-pane-open-beside") {
      state.focusedPaneId = pane.id;
      openBeside(event.data.plugin, event.data.itemId, event.data.title);
    } else {
      state.focusedPaneId = pane.id;
      if (event.data.background === true && event.data.itemId) pluginGroups.openBehind(event.data.plugin, event.data.itemId, event.data.title);
      else if (typeof event.data.recordId === "string") openPluginRecord(event.data.plugin, event.data.recordId);
      else if (event.data.itemId) openItem(event.data.plugin, event.data.itemId, event.data.title, event.data.view); else openPlugin(event.data.plugin);
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
  document.addEventListener("workbench-feed-task", (event) => {
    if (typeof event.detail?.taskId !== "string") return;
    const paneId = embedded ? state.panes[0]?.id : findTopLevelSurface("feed")?.closest("[data-tab-pane]")?.dataset.tabPane;
    if (paneId && writeView(paneId, event.detail.taskId) && embedded) notifyParent("workbench-pane-view", { view: event.detail.taskId });
  });
  return { apply, readView, writeView, openPlugin, openPluginRecord, openItem, openBeside, openBehind: pluginGroups.openBehind, openGoalWork, closeItem, addFeedTask, setExclusive, restore, landAtProjectRoot,
    pluginTitle: ops.pluginTitle, leavePlugin, closeCover, openCover, registerCover, noteCover, coverPlace: restoredCoverPlace, goHistory,
    shownPlugin: () => state.exclusive ? null : ops.shownPlugin(ops.focused(state)),
    exclusive: () => state.exclusive, isExclusive: () => Boolean(state.exclusive), isEmbedded: () => embedded, state: () => state };
}`;
