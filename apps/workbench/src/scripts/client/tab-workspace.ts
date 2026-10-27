import { SYSTEM_TABS_FACTORY, SCROLL_MEMORY_FACTORY } from "./system-tabs.js";
import { openPluginInSide, sideOpenedTabs } from "./plugin-place.js";
import { recordRows } from "../../search-rows.js";
import { pluginTabGlyphs } from "../../plugin-catalog.js";
import { createTabWorkspaceOps, isCurrentTabWorkspace, isLoosePluginTab, settlePluginTabs, withPluginGroups } from "../../tab-workspace-ops.js";
import { tabIdsAfterMove, TAB_REORDER_EASE, TAB_REORDER_MS } from "../../tab-reorder.js";
import { tabShareWidth, tabShareMin, tabScrollAllotment, TAB_SHARE_MAX, TAB_SHARE_MIN, TAB_SHARE_MIN_TOUCH } from "../../tab-strip-share.js";
import { clampSplitRatio, focusedPaneBoxAfterDrop, layoutPaneBoxes, snapSplitRatio, splitDropEdge, splitRatioRange, splitTreeFits, TAB_SASH_HALF, TAB_SASH_INSET, TAB_SPLIT_EDGE_X, TAB_SPLIT_EDGE_Y, TAB_SPLIT_RATIO } from "../../tab-split-drop.js";
import { TAB_WORKSPACE_LAYOUT_PART } from "./tab-workspace-layout.js";
import { TAB_WORKSPACE_MENUS_PART } from "./tab-workspace-menus.js";

export { placeLayoutMenu } from "./tab-layout-menu.js";

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
  const isCurrent = (${isCurrentTabWorkspace.toString()});
  const TAB_SPLIT_EDGE_X = ${TAB_SPLIT_EDGE_X};
  const TAB_SPLIT_EDGE_Y = ${TAB_SPLIT_EDGE_Y};
  const TAB_SPLIT_RATIO = ${TAB_SPLIT_RATIO};
  const TAB_SASH_INSET = ${TAB_SASH_INSET};
  const TAB_SASH_HALF = ${TAB_SASH_HALF};
  const clampSplitRatio = ${clampSplitRatio.toString()};
  const splitDropEdge = ${splitDropEdge.toString()};
  const splitRatioRange = ${splitRatioRange.toString()}, splitTreeFits = ${splitTreeFits.toString()}, snapSplitRatio = ${snapSplitRatio.toString()};
  const layoutPaneBoxes = ${layoutPaneBoxes.toString()};
  const focusedPaneBoxAfterDrop = ${focusedPaneBoxAfterDrop.toString()};
  const tabIdsAfterMove = ${tabIdsAfterMove.toString()};
  const TAB_REORDER_MS = ${TAB_REORDER_MS};
  const TAB_REORDER_EASE = ${JSON.stringify(TAB_REORDER_EASE)};
  const tabShareWidth = ${tabShareWidth.toString()};
  const tabShareMin = ${tabShareMin.toString()};
  const tabScrollAllotment = ${tabScrollAllotment.toString()};
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
  const notifyParent = (type, payload = {}) => { if (embedded) parent.postMessage({ type, paneId: paneParams.get("workbenchPane"), ...payload }, location.origin); };
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
  const narrow = () => matchMedia("(max-width: 760px)").matches || root.hasAttribute("data-split-narrow");
  let state = ops.create();
  const paneById = (id) => state.panes.find((pane) => pane.id === id);
  let unsaved = false; // a layout this device would not keep is said once, and again only after it saved since
  const persist = () => { if (embedded) return; try { localStorage.setItem(storageKey, JSON.stringify(state)); unsaved = false; } catch { if (!unsaved) showToast?.(L("这个布局没能保存到本机，刷新后会回到上次保存的样子"), true); unsaved = true; } };
  const restore = (requestedGoalId = "") => {
    if (embedded) {
      state = ops.create();
      const pane = ops.focused(state);
      const plugin = paneParams.get("panePlugin") || "home";
      if (paneParams.has("paneItem")) {
        pane.tabs = [];
        pane.activeTabId = null;
        pane.groups = [];
        const tab = ops.openItem(state, plugin, paneParams.get("paneItem"), paneParams.get("paneTitle"));
        if (plugin === "goals" && paneParams.get("paneGoalView") === "work") tab.goalView = "work";
      } else if (plugin === "home") {
        ops.openPlugin(state, "home");
      } else {
        pane.tabs = [];
        pane.activeTabId = null;
        pane.groups = [];
        ops.openPlugin(state, plugin);
      }
      apply();
      return;
    }
    const offeredPlugin = (plugin) => Boolean(document.querySelector('[data-global-menu] [data-plugin-id="' + CSS.escape(plugin) + '"], [data-plugin-strip] [data-plugin-id="' + CSS.escape(plugin) + '"]')); // a link opens only a plugin this project offers: its menu or strip lists the plugins it has on (Goals included, RAC-400)
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      const plugins = { ...PLUGIN_TAB_ICON }; if (!offeredPlugin("goals")) delete plugins.goals; // a layout saved with Goals starts fresh in a project without it, as for any plugin gone
      document.querySelectorAll("[data-settings-page]").forEach(node => { plugins[node.dataset.settingsPage] = true; });
      if (isCurrent(stored, plugins)) {
        state = ops.ensureHome(stored);
        persist();
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
      // A Goal opened for its materials lands on its work view rather than the Frame canvas.
      if (requestedPlugin === "goals" && paneParams.get("openGoalView") === "work" && opened) opened.goalView = "work";
      dropParams("openPlugin", "openItem", "openTitle", "openGoalView");
    }
    // A record in a plugin whose objects open from its own list (Forms, Dataset, PPT…): jump to it once the list is up.
    const requestedRecord = paneParams.get("openRecord");
    // Only the plugin asked for: open its page, if this project offers it (its menu lists the plugins it has on).
    if (requestedPlugin && !requestedItem && !requestedRecord && Object.hasOwn(PLUGIN_TAB_ICON, requestedPlugin)) {
      if (offeredPlugin(requestedPlugin)) {
        ops.setExclusive(state, null);
        state.focusedPaneId = ops.focused(state).id;
        ops.openPlugin(state, requestedPlugin);
        pluginRequestedOnLoad = true;
      }
      dropParams("openPlugin");
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
  // A plugin whose page lives in settings (it marks the page it renders here) is not a place a pane can show.
  const settingsPageOf = (plugin) => plugin && !embedded && !Object.hasOwn(PLUGIN_TAB_ICON, plugin) && document.querySelector('[data-settings-page="' + CSS.escape(plugin) + '"]') ? plugin : "";
  const removeSettingsPages = () => {
    for (const pane of state.panes || []) {
      if (settingsPageOf(pane.viewPlugin)) { pane.viewPlugin = null; if (!pane.activeTabId) pane.activeTabId = pane.tabs.find((tab) => tab.kind === "home")?.id || null; }
      pane.tabs = (pane.tabs || []).filter((tab) => !settingsPageOf(tab.plugin));
      if (pane.activeTabId && !pane.tabs.some((tab) => tab.id === pane.activeTabId)) pane.activeTabId = pane.tabs[0]?.id || null;
    }
    ops.ensureHome(state);
  };
  const pluginSurface = (plugin) => plugin === "goals" ? "goal" : plugin === "home" ? "home" : plugin;
  const directoryOf = (plugin) => {
      if (plugin === "home" || plugin === "market") return "root"; const directory = plugin === "goals" ? "goals" : plugin;
      return document.querySelector('[data-directory-panel="' + directory + '"]') ? directory : "root";
    };
  const supportsGoalFrames = () => document.body.dataset.boardView === "current";
  const findTopLevelSurface = (plugin) => plugin === "goals"
    ? document.querySelector("[data-goal-canvas-shell]") || document.querySelector('[data-document-pane]')
    : [...document.querySelectorAll('[data-work-surface="' + pluginSurface(plugin) + '"]')]
      .find((node) => !node.closest("[data-goal-canvas-shell]")) || null;
  const topLevelSurface = plugin => { const surface = findTopLevelSurface(plugin); host.prepareSurface?.(surface); return surface; };
  const systemTabs = (${SYSTEM_TABS_FACTORY})({getState:()=>state,ops,apply:()=>apply(),persist,close:(pane,id)=>closeTabBack(pane,id),embedded});
  const rootForTab = (tab) => tab?.kind === "system" ? systemTabs.root(tab) : supportsGoalFrames() && tab?.plugin === "goals" && tab.kind === "item" && tab.goalView !== "work"
    ? document.querySelector("[data-goal-frame-surface]") : tab ? topLevelSurface(tab.plugin) : null;
  const titleForItem = (plugin, itemId, fallback) => {
    if (plugin === "goals") return visibleGoals()?.find((item) => item.goal.goal_id === itemId)?.goal.title || fallback || itemId;
    const row = ((spec) => spec && [...document.querySelectorAll(spec[1])].find((el) => el.dataset[spec[2]] === itemId))(RECORD_ROWS.find(([id]) => id === plugin));
    return row?.getAttribute("data-frame-asset-title") || row?.querySelector("strong")?.textContent?.trim() || fallback || itemId;
  };
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
  const selectItem = (surface, itemId) => {
    if (!surface) return;
    const last = lastSelection.get(surface), now = Date.now();
    if (last && last.itemId === itemId && now - last.at < 250 && (itemId || surface.getAttribute("data-expanded") !== "true")) return;
    lastSelection.set(surface, { itemId, at: now });
    surface.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId } }));
  };
  // Collapses the shell makes itself (showing a page for the first time, returning from a tab, the plugin tab) are
  // not the person closing a record: the record watcher below lets them pass, and the callers keep history themselves.
  const shellCollapse = new Set();
  const applyPluginDefault = (plugin) => {
    if (!plugin) return;
    shellCollapse.add(plugin);
    queueMicrotask(() => shellCollapse.delete(plugin));
    selectItem(topLevelSurface(plugin), null);
    if (plugin === "goals") {
      document.querySelector("[data-goal-collapse]")?.setAttribute("aria-label", L("收起 Goal，返回关系画布"));
      (restoreBoard || showCanvas)?.();
      return;
    }
    collapsePluginStage(plugin);
    if (plugin === "feed") setFeedTask?.(topLevelSurface(plugin)?.dataset.selectedSource || "all", false);
  };
  // Goals are drawn by the workbench itself: name the open Goal on its frame and document, as every plugin names its
  // object, so the Assistant and the context actions know it — and a passage selected in it belongs to that Goal.
  const declareGoal = (goalId, fallback) => {
    const title = goalId ? titleForItem("goals", goalId, fallback) : "";
    document.querySelectorAll("[data-goal-frame-surface], [data-document-pane]").forEach((node) => {
      if (goalId) node.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: "io.molis.work.goals", surface_title: "Goals",
        object: { kind: "goal", id: goalId, ...(title ? { title } : {}) }, goal: { id: goalId, title: title || "" } }));
      else node.removeAttribute("data-assistant-context");
    });
  };
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
  const forgetRecord = (plugin) => {
    if (!plugin || !openRecords[plugin]) return false;
    delete openRecords[plugin];
    saveRecords();
    return true;
  };
  const resetPluginPage = (plugin) => {
    if (!plugin) return;
    // A reopen still waiting for the list must not undo the person's choice of the list.
    cancelRecordJump?.();
    const had = forgetRecord(plugin);
    applyPluginDefault(plugin);
    surfaceShows.set(plugin, "page");
    if (had) notePlace();
  };
  const applyTabContent = (tab, keepFrame) => {
    if (!tab || tab.kind === "system") return;
    declareGoal(tab.plugin === "goals" && tab.kind === "item" ? tab.itemId : null, tab.title);
    selectItem(topLevelSurface(tab.plugin), tab.kind === "item" ? tab.itemId : null);
    if (tab.plugin === "goals" && tab.kind === "item" && tab.itemId) {
      if (supportsGoalFrames() && tab.goalView !== "work") { applySelection?.(tab.itemId); showGoalFrame?.(tab.itemId); return; }
      releaseFrame?.();
      applySelection?.(tab.itemId);
      if ((getDocumentGoalId() !== tab.itemId || loadingGoalId) && loadingGoalId !== tab.itemId) {
        const goalId = tab.itemId;
        loadingGoalId = goalId;
        void loadGoalDocument(goalId).then((loaded) => {
          if (loaded) document.dispatchEvent(new CustomEvent("molis-work:goal-document-loaded", { detail: { goalId } }));
        }).finally(() => { if (loadingGoalId === goalId) loadingGoalId = null; });
      }
      setWorkspaceMode("focus", false, true);
      const collapse = document.querySelector("[data-goal-collapse]");
      collapse?.setAttribute("aria-label", L("返回 Goal 画布"));
      collapse?.setAttribute("title", L("返回 Goal 画布"));
      return;
    }
    if (tab.plugin === "goals") {
      document.querySelector("[data-goal-collapse]")?.setAttribute("aria-label", L("收起 Goal，返回关系画布"));
      if (keepFrame) {
        setWorkSurface("goal");
        setWorkspaceMode("graph", false, true);
        return;
      }
      (restoreBoard || showCanvas)?.();
      return;
    }
    if (tab.plugin === "feed" && tab.feedTask) setFeedTask?.(tab.feedTask, false);
    if (tab.plugin === "feed" && tab.kind === "item" && tab.itemId) selectFeedItem?.(tab.itemId, false, true, false);
    if (tab.plugin === "inbox" && tab.kind === "item" && tab.itemId) selectInboxEntry?.(tab.itemId, false);
  };
  const mount = (pane, node) => {
    const body = panesEl.querySelector('[data-tab-pane="' + pane.id + '"] [data-tab-pane-body]');
    if (!body || !node) return;
    if (node.parentElement !== body) body.append(node);
    node.hidden = false;
  };
  /* What each plugin's surface last showed: its own page ("page") or one of its tabs ("tab:<id>"). Returning to the
     same thing keeps it as it was, down to where it was scrolled. */
  const surfaceShows = new Map();
  const {rememberScroll,restoreScroll} = (${SCROLL_MEMORY_FACTORY})();
  const paneMarkup = () => '<nav class="tab-strip" data-tab-strip></nav><div class="tab-pane-body" data-tab-pane-body></div><button type="button" class="tab-pane-close" data-tab-pane-close aria-label="' + L("关闭分栏") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button><div class="tab-drop-edges" data-tab-edges><button type="button" data-tab-edge="left" aria-label="' + L("拆到左侧") + '"></button><button type="button" data-tab-edge="right" aria-label="' + L("拆到右侧") + '"></button><button type="button" data-tab-edge="top" aria-label="' + L("拆到上方") + '"></button><button type="button" data-tab-edge="bottom" aria-label="' + L("拆到下方") + '"></button></div>';
  const tabLabel = (tab) => tab.plugin === "home" ? (personal ? L("个人首页") : L("项目首页"))
    : tab.kind === "plugin" ? L(ops.pluginTitle(tab.plugin)) : tab.title;
  const tabIcon = (plugin) => PLUGIN_TAB_ICON[plugin] || "frame";
  const iconMarkup = (plugin) => '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-' + tabIcon(plugin) + '"></use></svg>';
  /* The entries that open a cover, wherever the bar keeps them. Pressed again while their cover is up, they close it. */
  const COVER_OPENERS = {
    settings: '[data-directory-open="settings"]',
    "project-settings": '[data-directory-open="project-settings"]',
    market: ':is([data-dock], [data-global-menu]) [data-plugin-id="market"]',
  };
  const coverLabel = (kind) => kind === "market" ? L("插件市场") : kind === "project-settings" ? L("项目设置") : kind === "settings" ? L("设置") : ops.pluginTitle(kind);
  // The glyph comes from the entry that opened the cover.
  const coverGlyph = (kind) => document.querySelector((COVER_OPENERS[kind] || '[data-plugin-id="' + CSS.escape(kind) + '"]') + " svg")?.cloneNode(true) || null;
  const coverKindOf = (element) => Object.keys(COVER_OPENERS).find((kind) => element.closest(COVER_OPENERS[kind])) || null;
  const markCoverOpeners = () => {
    if (embedded) return;
    for (const [kind, selector] of Object.entries(COVER_OPENERS)) {
      document.querySelectorAll(selector).forEach((opener) => {
        if (state.exclusive === kind) opener.setAttribute("aria-current", "page");
        else if (opener.getAttribute("aria-current") === "page" && !opener.matches("[data-work-surface-open]")) opener.removeAttribute("aria-current");
      });
    }
  };
  const appendTab = (parent, pane, tab) => {
    if (personal && tab.kind === "home") return; const selected = tab.id === pane.activeTabId || pluginGroups.shows(pane, tab), label = tabLabel(tab);
    const button = document.createElement("div");
    button.className = "tab-item" + (selected ? " is-active" : "");
    button.dataset.tabId = tab.id;
    button.dataset.plugin = tab.plugin;
    if (tab.itemId) button.dataset.itemId = tab.itemId;
    button.dataset.tabKind = tab.kind;
    if (tab.pinned) button.dataset.pinned = "true";
    button.style.setProperty("--plugin-color", "var(--ink-soft)");
    button.draggable = true;
    button.title = label;
    if (selected) button.setAttribute("aria-current", "page");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.role = "tab";
    trigger.className = "tab-item-trigger";
    trigger.tabIndex = selected ? 0 : -1;
    trigger.ariaLabel = label;
    trigger.setAttribute("aria-selected", String(selected));
    const name = document.createElement("span");
    name.textContent = label;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-item-close";
    close.dataset.tabClose = tab.id;
    // A plugin tab closes its whole group.
    const closeWords = L(tab.kind === "plugin" ? "关闭标签组" : "关闭标签");
    close.ariaLabel = closeWords;
    close.title = closeWords + "·" + label;
    close.tabIndex = selected ? 0 : -1;
    close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    trigger.innerHTML = tab.kind === "system" ? '<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg>' : iconMarkup(tab.plugin);
    name.className = "tab-item-name";
    trigger.append(name);
    button.append(trigger);
    if (!tab.pinned) { button.append(close); trigger.setAttribute("aria-keyshortcuts", "Delete"); } // a tab not chosen keeps its close out of the tab order; Delete is its key
    parent.append(button);
  };
  const tabHugWidth = (node) => {
    if (node.hasAttribute("data-tab-reorder-slot")) {
      const fromVar = Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--tab-reorder-width"));
      return Math.min(TAB_SHARE_MAX, fromVar || node.getBoundingClientRect().width || TAB_SHARE_MIN);
    }
    const cs = getComputedStyle(node);
    const trigger = node.querySelector(".tab-item-trigger");
    const name = node.querySelector(".tab-item-name");
    const icon = node.querySelector(".tab-item-icon");
    const close = node.querySelector(".tab-item-close");
    const gap = trigger ? Number.parseFloat(getComputedStyle(trigger).gap) || 0 : 0;
    const itemGap = close ? Number.parseFloat(cs.columnGap) || Number.parseFloat(cs.gap) || 0 : 0;
    const inner = (icon ? icon.getBoundingClientRect().width : 0) + gap + (name ? name.scrollWidth : 0) + itemGap + (close ? close.getBoundingClientRect().width : 0);
    const chrome = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight) + Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.borderRightWidth);
    return Math.min(TAB_SHARE_MAX, Math.ceil(chrome + inner));
  };
  const shareTabStrip = (scroll) => {
    if (!scroll) return;
    const strip = scroll.parentElement;
    if (!strip || strip.clientWidth < 1) return;
    // Scroll padding aligns a clipped active tab; it is not reserved content
    // for the next layout. Reusing it can alternate between sharing and hug.
    const scrollPad = scroll.querySelector("[data-tab-scroll-pad]");
    if (scrollPad) scrollPad.style.width = "0px";
    // Home and plugin tabs keep their names; the item tabs share what is left.
    const flexTabs = [...scroll.querySelectorAll('.tab-item:not([data-pinned]):not([data-tab-kind="home"]):not([data-tab-kind="plugin"])')].filter((tab) => !tab.closest('.tab-group[data-collapsed="true"], .is-tab-drag-source'));
    const slot = scroll.querySelector("[data-tab-reorder-slot]:not([data-tab-slot-leaving], .is-group)");
    const flexNodes = slot ? flexTabs.concat(slot) : flexTabs;
    const clearShare = () => {
      scroll.style.removeProperty("--tab-share-width");
      scroll.style.removeProperty("width");
    };
    if (!flexNodes.length) {
      clearShare();
      return;
    }
    const flexSet = new Set(flexNodes);
    const gapOf = (el) => Number.parseFloat(getComputedStyle(el).gap) || 0;
    let reserved = 0;
    // A closing slot and the dragged tab's old place are on their way to nothing; they take no room.
    const gone = (el) => el.hasAttribute?.("data-tab-slot-leaving") || el.classList?.contains("is-tab-drag-source");
    const scrollKids = [...scroll.children].filter((child) => !gone(child));
    reserved += gapOf(scroll) * Math.max(0, scrollKids.length - 1);
    for (const child of scrollKids) {
      if (flexSet.has(child)) continue;
      if (child.classList?.contains("tab-group")) {
        const label = child.querySelector(":scope > .tab-group-label");
        if (label) reserved += label.getBoundingClientRect().width;
        reserved += (Number.parseFloat(getComputedStyle(child).paddingLeft) || 0) + (Number.parseFloat(getComputedStyle(child).paddingRight) || 0);
        const pages = child.querySelector(".tab-group-pages") || child;
        const kids = [...pages.children].filter((el) => (el.classList.contains("tab-item") || el.hasAttribute("data-tab-reorder-slot")) && !gone(el));
        reserved += gapOf(pages) * Math.max(0, kids.length - 1);
        for (const kid of kids) {
          if (!flexSet.has(kid)) reserved += kid.getBoundingClientRect().width;
        }
        continue;
      }
      reserved += child.getBoundingClientRect().width;
    }
    let siblingChrome = 0;
    const stripKids = [...strip.children];
    for (const child of stripKids) {
      if (child === scroll) continue;
      if (child.classList.contains("tab-strip-spacer")) {
        siblingChrome += Number.parseFloat(getComputedStyle(child).minWidth) || 0;
        continue;
      }
      siblingChrome += child.getBoundingClientRect().width;
    }
    const stripStyle = getComputedStyle(strip);
    const innerWidth = strip.clientWidth - (Number.parseFloat(stripStyle.paddingLeft) || 0) - (Number.parseFloat(stripStyle.paddingRight) || 0);
    const allotted = tabScrollAllotment(innerWidth, siblingChrome, gapOf(strip), stripKids.length);
    const share = tabShareWidth(allotted - reserved, flexNodes.map(tabHugWidth), tabShareMin(window.matchMedia("(max-width: 760px), (pointer: coarse)").matches));
    if (share == null) {
      if (!(scroll.style.getPropertyValue("--tab-share-width") || scroll.style.width)) return;
      clearShare();
      return;
    }
    const next = share + "px";
    const nextWidth = allotted + "px";
    if (scroll.style.getPropertyValue("--tab-share-width") === next && scroll.style.width === nextWidth) return;
    scroll.style.setProperty("--tab-share-width", next);
    scroll.style.width = nextWidth;
  };
  const tabShareObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const node = entry.target;
      shareTabStrip(node.matches("[data-tab-scroll]") ? node : node.querySelector("[data-tab-scroll]"));
    }
  });
  const scrollTabIntoStrip = (tab) => {
    const scroller = tab?.closest("[data-tab-scroll]") || tab?.closest(".tab-strip")?.querySelector("[data-tab-scroll]");
    if (!tab || !scroller) return;
    const pad = scroller.querySelector("[data-tab-scroll-pad]");
    if (pad) pad.style.width = "0px";
    const railBox = () => scroller.getBoundingClientRect();
    if (tab.getBoundingClientRect().width < 1 || railBox().width < 1) return;
    const alignActive = () => {
      const rail = railBox();
      const box = tab.getBoundingClientRect();
      if (box.left < rail.left + 28) scroller.scrollLeft -= rail.left + 28 - box.left;
      else if (box.right > rail.right - 28) scroller.scrollLeft += box.right - rail.right + 28;
    };
    alignActive();
    for (let step = 0; step < 4; step += 1) {
      const rail = railBox();
      const hanging = [...scroller.querySelectorAll(".tab-item")].find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 1 && rect.left < rail.left - 1 && rect.right > rail.left + 1;
      });
      if (!hanging) return;
      if (hanging === tab) {
        scroller.scrollLeft -= rail.left - hanging.getBoundingClientRect().left;
        return;
      }
      const hang = hanging.getBoundingClientRect();
      const reveal = rail.left - hang.left;
      if (tab.getBoundingClientRect().right + reveal <= rail.right + 1) scroller.scrollLeft -= reveal;
      else {
        const sliver = Math.max(1, hang.right - rail.left);
        const before = scroller.scrollLeft;
        scroller.scrollLeft += sliver;
        if (pad && scroller.scrollLeft < before + sliver - 1) {
          pad.style.width = (Number.parseFloat(pad.style.width) || 0) + sliver + "px";
          scroller.scrollLeft += sliver;
        }
      }
      alignActive();
    }
  };
  const renderStrip = (pane, strip) => {
    if (!strip) return;
    const scrollLeft = strip.querySelector("[data-tab-scroll]")?.scrollLeft || 0;
    const previousActive = strip.querySelector('[data-tab-id][aria-current]')?.dataset.tabId;
    strip.setAttribute("role", "tablist");
    strip.setAttribute("aria-label", L("工作区标签"));
    const fragment = document.createDocumentFragment();
    const scrollArea = document.createElement("div"); scrollArea.className = "tab-scroll"; scrollArea.dataset.tabScroll = scrollArea.dataset.overflowFade = "";
    fragment.append(scrollArea);
    for (let index = 0; index < pane.tabs.length;) {
      const tab = pane.tabs[index];
      if (tab.pinned) {
        const wrap = document.createElement("div");
        wrap.className = "tab-group";
        wrap.dataset.pinnedGroup = "true";
        const pages = document.createElement("div"); pages.className = "tab-group-pages";
        while (index < pane.tabs.length && pane.tabs[index].pinned) { appendTab(pages, pane, pane.tabs[index]); index += 1; }
        wrap.append(pages); scrollArea.append(wrap); continue;
      }
      if (tab.groupId) {
        const group = (pane.groups || []).find((candidate) => candidate.id === tab.groupId);
        const wrap = document.createElement("div");
        wrap.className = "tab-group";
        wrap.dataset.tabGroup = tab.groupId;
        wrap.dataset.active = String(pane.tabs.some((candidate) => candidate.groupId === tab.groupId && candidate.id === pane.activeTabId));
        wrap.style.setProperty("--group-color", GROUP_COLOR[group?.color] || GROUP_COLOR.grey);
        if (group?.collapsed) wrap.dataset.collapsed = "true";
        const label = document.createElement("button");
        label.type = "button";
        label.className = "tab-group-label";
        label.dataset.tabGroupToggle = tab.groupId;
        const groupName = document.createElement("span"); groupName.className = "tab-group-name"; groupName.textContent = group?.title || ""; label.append(groupName);
        const title = (group?.collapsed ? L("展开标签组") : L("收起标签组")) + (group?.title ? " · " + group.title : "");
        label.title = title; label.setAttribute("aria-label", title); label.setAttribute("aria-expanded", String(!group?.collapsed));
        wrap.append(label);
        const pages = document.createElement("div"); pages.className = "tab-group-pages";
        while (index < pane.tabs.length && pane.tabs[index].groupId === tab.groupId) { appendTab(pages, pane, pane.tabs[index]); index += 1; }
        wrap.append(pages); scrollArea.append(wrap); continue;
      }
      const after = pluginGroups.render(scrollArea, pane, index);
      if (after > index) { index = after; continue; }
      appendTab(scrollArea, pane, tab);
      index += 1;
    }
    if (state.exclusive && !embedded && (strip.hasAttribute("data-titlebar-tabs") || pane.id === state.focusedPaneId)) {
      // Market and settings cover the panes; say so where the tabs are, with the way out beside the name.
      const cover = document.createElement("span");
      cover.className = "tab-view-chip is-exclusive"; cover.setAttribute("aria-current", "page");
      cover.dataset.coverChip = state.exclusive;
      const glyph = coverGlyph(state.exclusive);
      if (glyph) cover.append(glyph);
      const label = document.createElement("span");
      label.textContent = coverLabel(state.exclusive);
      cover.append(label);
      const close = document.createElement("button");
      close.type = "button"; close.className = "tab-view-chip-close"; close.dataset.coverClose = "";
      close.title = L("关闭") + " · " + coverLabel(state.exclusive) + " (Esc)";
      close.setAttribute("aria-label", L("关闭") + " " + coverLabel(state.exclusive));
      close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      cover.append(close);
      const divider = document.createElement("span"); divider.className = "tab-view-divider"; divider.setAttribute("aria-hidden", "true");
      fragment.prepend(cover, divider);
    }
    const pad = document.createElement("span");
    pad.dataset.tabScrollPad = "";
    pad.setAttribute("aria-hidden", "true");
    scrollArea.append(pad);
    const undo = pluginGroups.undoChip(pane);
    if (undo) fragment.append(undo);
    if (!pane.tabs.length) {
      const empty = document.createElement("p");
      empty.className = "tab-pane-empty-hint";
      empty.textContent = L("从下方切换插件，或把标签拖进来。");
      scrollArea.append(empty);
    }
    if (!embedded) {
      if (strip.hasAttribute("data-titlebar-tabs")) {
        const spacer = document.createElement("div");
        spacer.className = "tab-strip-spacer";
        spacer.setAttribute("aria-hidden", "true");
        if (document.documentElement.dataset.nativeDesktop === "true" || document.body.dataset.nativeDesktop === "true") {
          spacer.dataset.tauriDragRegion = "";
        }
        fragment.append(spacer);
      }
      const add = document.createElement("button"); add.type = "button"; add.className = "tab-add-button"; add.dataset.tabAdd = pane.id;
      add.setAttribute("aria-label", L("打开插件")); add.title = L("打开插件"); add.setAttribute("aria-haspopup", "menu");
      add.innerHTML = '<svg aria-hidden="true"><use href="#icon-plus"></use></svg>'; fragment.append(add);
      const split = document.createElement("button");
      split.type = "button"; split.className = "tab-split-button"; split.dataset.tabSplit = pane.id;
      split.title = L("布局与分屏"); split.setAttribute("aria-label", split.title);
      split.innerHTML = '<svg aria-hidden="true"><use href="#icon-grid"></use></svg>';
      fragment.append(split);
    }
    strip.replaceChildren(fragment);
    scrollArea.scrollLeft = scrollLeft;
    shareTabStrip(scrollArea);
    tabShareObserver.observe(strip);
    if (previousActive !== pane.activeTabId) requestAnimationFrame(() => {
      scrollTabIntoStrip(strip.querySelector('[data-tab-id][aria-current]'));
    });
  };
  const titlebarStrip = document.querySelector("[data-titlebar-tabs]");
  if (titlebarStrip) new ResizeObserver(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.tab-strip:not([hidden]) [data-tab-id][aria-current]').forEach((tab) => {
        if (tab.getClientRects().length) scrollTabIntoStrip(tab);
      });
    });
  }).observe(titlebarStrip);
  const exclusiveEl = document.querySelector("[data-tab-exclusive]");
  const collectMounted = () => [
    ...pool.querySelectorAll(":scope > [data-work-surface], :scope > [data-goal-canvas-shell], :scope > [data-goal-frame-surface], :scope > [data-document-pane]"),
    ...panesEl.querySelectorAll("[data-tab-pane-body] > [data-work-surface], [data-tab-pane-body] > [data-goal-canvas-shell], [data-tab-pane-body] > [data-goal-frame-surface], [data-tab-pane-body] > [data-document-pane]"),
    ...document.querySelectorAll("[data-system-tab]"),
    ...(exclusiveEl ? [...exclusiveEl.children] : []),
  ];${TAB_WORKSPACE_LAYOUT_PART}${TAB_WORKSPACE_MENUS_PART}`;
