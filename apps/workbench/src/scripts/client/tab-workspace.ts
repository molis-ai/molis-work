import { SYSTEM_TABS_FACTORY, SCROLL_MEMORY_FACTORY } from "./system-tabs.js";
import { openPluginInSide, sideOpenedTabs } from "./plugin-place.js";
import { recordRows, searchRows } from "../../search-rows.js";
import { MW_PLUGINS } from "@molis-ai/molis-work-design-system";
import { pluginTabGlyphs } from "../../plugin-catalog.js";
import { createTabWorkspaceOps, isCurrentTabWorkspace, isLoosePluginTab, settlePluginTabs, withPluginGroups } from "../../tab-workspace-ops.js";
import { PLUGIN_TAB_GROUPS_FACTORY } from "./plugin-tab-groups.js";
import { OPENED_PLUGIN_RECORD_SCRIPT } from "./plugin-open-record.js";
import { TAB_DRAG_SLOT_FACTORY } from "./tab-drag-slot.js";
import { TAB_SASH_FACTORY } from "./tab-sash.js";
import { tabIdsAfterMove, TAB_REORDER_EASE, TAB_REORDER_MS } from "../../tab-reorder.js";
import { tabShareWidth, tabShareMin, tabScrollAllotment, TAB_SHARE_MAX, TAB_SHARE_MIN, TAB_SHARE_MIN_TOUCH } from "../../tab-strip-share.js";
import { clampSplitRatio, focusedPaneBoxAfterDrop, layoutPaneBoxes, snapSplitRatio, splitDropEdge, splitRatioRange, splitTreeFits, TAB_SASH_HALF, TAB_SASH_INSET, TAB_SPLIT_EDGE_X, TAB_SPLIT_EDGE_Y, TAB_SPLIT_RATIO } from "../../tab-split-drop.js";

/** Keep a popover inside the viewport. Tall menus scroll instead of clipping past the top.
 *  Stringified into the browser factory. Type annotations are erased before that string is sent. */
export function placeLayoutMenu(
  anchor: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
) {
  const availableHeight = Math.max(0, viewport.height - margin * 2);
  const maxHeight = menu.height > availableHeight ? availableHeight : null;
  const height = maxHeight == null ? menu.height : maxHeight;
  const width = menu.width;
  let top = anchor.bottom + 6;
  if (top + height > viewport.height - margin) {
    const above = anchor.top - 6 - height;
    top = above >= margin ? above : margin;
  }
  if (top < margin) top = margin;
  let left = anchor.right - width;
  const maxLeft = viewport.width - width - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;
  return { top, left, maxHeight };
}

/** Cross-plugin tabs and split panes. Goals canvas/kanban/Frame chrome stays in frame-container. */
export const TAB_WORKSPACE_FACTORY_SCRIPT = `(host) => {
  const { showToast, showGoalFrame, setFeedAddOpen, setFeedTask, translate: L, getSurface, setWorkSurface, setDirectory, setWorkspaceMode, setMobileView,
    applySelection, loadGoalDocument, getDocumentGoalId, selectFeedItem, selectInboxEntry, getProjectId, visibleGoals, showCanvas, restoreBoard, releaseFrame } = host;
  const root = document.querySelector("[data-tab-workspace]");
  const panesEl = document.querySelector("[data-tab-panes]");
  const pool = document.querySelector("[data-surface-pool]");
  if (!root || !panesEl || !pool) return { pluginTitle: (plugin) => plugin, apply() {}, openPlugin() {}, openPluginRecord() {}, openItem() {}, openBeside() {}, setExclusive() {}, restore() {}, isExclusive() { return false; },
    leavePlugin() { return false; }, closeCover() { return false; }, openCover() {}, registerCover() {}, noteCover() {}, coverPlace() { return ""; }, goHistory() { return false; }, shownPlugin() { return null; }, exclusive() { return null; } };
  const PLUGIN_COLOR = ${JSON.stringify(Object.fromEntries(MW_PLUGINS.map((plugin) => [plugin.id, `var(--plugin-${plugin.id})`])))};
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
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      const plugins = { ...PLUGIN_TAB_ICON };
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
    if (requestedPlugin && Object.hasOwn(PLUGIN_TAB_ICON, requestedPlugin) && requestedItem) {
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
      const offered = document.querySelector('[data-global-menu] [data-plugin-id="' + CSS.escape(requestedPlugin) + '"], [data-plugin-strip] [data-plugin-id="' + CSS.escape(requestedPlugin) + '"]');
      if (offered) {
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
    if (requestedGoalId) {
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
    button.style.setProperty("--plugin-color", PLUGIN_COLOR[tab.plugin] || "var(--muted)");
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
  ];
  const findSplit = (node, id) => !node || node.paneId ? null : node.id === id ? node : findSplit(node.children[0], id) || findSplit(node.children[1], id);
  // Position leaves without reparenting their iframes: dragging a divider or adding a
  // neighbour must preserve unsaved editor state and active Runtime connections.
  const syncSplitSizes = (node, box = { x: 0, y: 0, w: 100, h: 100 }) => {
    if (!node) return;
    if (node.paneId) {
      const pane = panesEl.querySelector('[data-tab-pane="' + node.paneId + '"]');
      if (pane) {
        pane.style.left = "calc(" + box.x + "% + " + (box.x ? TAB_SASH_INSET : 0) + "px)";
        pane.style.top = "calc(" + box.y + "% + " + (box.y ? TAB_SASH_INSET : 0) + "px)";
        pane.style.width = "calc(" + box.w + "% - " + ((box.x ? TAB_SASH_INSET : 0) + (box.x + box.w < 99.99 ? TAB_SASH_INSET : 0)) + "px)";
        pane.style.height = "calc(" + box.h + "% - " + ((box.y ? TAB_SASH_INSET : 0) + (box.y + box.h < 99.99 ? TAB_SASH_INSET : 0)) + "px)";
        const stripHeight = pane.querySelector("[data-tab-strip]")?.hidden ? 0 : (matchMedia("(max-width: 760px), (pointer: coarse)").matches ? 44 : 32);
        panesEl.querySelectorAll('iframe[data-pane-owner="' + node.paneId + '"]').forEach((frame) => {
          const topInset = (box.y ? TAB_SASH_INSET : 0) + stripHeight;
          frame.style.left = pane.style.left; frame.style.width = pane.style.width;
          frame.style.top = "calc(" + box.y + "% + " + topInset + "px)";
          frame.style.height = "calc(" + box.h + "% - " + (topInset + (box.y + box.h < 99.99 ? TAB_SASH_INSET : 0)) + "px)";
          frame.classList.toggle("is-focused", node.paneId === state.focusedPaneId);
          frame.style.setProperty("--pane-strip-height", stripHeight + "px");
        });
      }
      return;
    }
    const stage = panesEl.getBoundingClientRect(), length = (node.direction === "row" ? stage.width * box.w : stage.height * box.h) / 100, bounds = splitRatioRange(node, length) || [0.15, 0.85];
    const ratio = Math.min(bounds[1], Math.max(bounds[0], clampSplitRatio(node.ratio))), split = panesEl.querySelector('[data-split-id="' + node.id + '"]');
    if (split) {
      Object.assign(split.style, { left: box.x + "%", top: box.y + "%", width: box.w + "%", height: box.h + "%" });
      const sash = split.firstElementChild;
      sash.style.left = node.direction === "row" ? "calc(" + ratio * 100 + "% - " + TAB_SASH_HALF + "px)" : "0";
      sash.style.top = node.direction === "column" ? "calc(" + ratio * 100 + "% - " + TAB_SASH_HALF + "px)" : "0";
      sash.setAttribute("aria-valuenow", String(Math.round(ratio * 100))); sash.setAttribute("aria-valuemin", String(Math.round(bounds[0] * 100))); sash.setAttribute("aria-valuemax", String(Math.round(bounds[1] * 100)));
    }
    if (node.direction === "row") {
      syncSplitSizes(node.children[0], { ...box, w: box.w * ratio });
      syncSplitSizes(node.children[1], { ...box, x: box.x + box.w * ratio, w: box.w * (1 - ratio) });
    } else {
      syncSplitSizes(node.children[0], { ...box, h: box.h * ratio });
      syncSplitSizes(node.children[1], { ...box, y: box.y + box.h * ratio, h: box.h * (1 - ratio) });
    }
  };
  // Splits that cannot all keep their panes' minimum size at this stage size take the narrow layout (VUX-24), not a squeeze.
  const layoutSplits = () => { syncSplitSizes(state.layout.tree); const stage = panesEl.getBoundingClientRect(); if (stage.width && stage.height) root.toggleAttribute("data-split-narrow", !splitTreeFits(state.layout.tree, stage.width, stage.height)); };
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
  const paneHistory = (paneId) => {
    let entry = tabHistory.get(paneId);
    if (!entry) { entry = { stack: [], index: -1 }; tabHistory.set(paneId, entry); }
    return entry;
  };
  // A plugin's page is a place, and so is a record opened on it ("plugin:<id>|<record>"): Back from a note is its list.
  const placeId = (pane) => pane?.activeTabId || (pane?.viewPlugin ? "plugin:" + pane.viewPlugin + (openRecords[pane.viewPlugin] ? "|" + openRecords[pane.viewPlugin] : "") : null);
  // Where inside a cover the person is (a settings category, the page it loaded), so Back walks those too.
  let coverPlace = "";
  const historyId = (pane) => state.exclusive ? "cover:" + state.exclusive + (coverPlace ? "|" + coverPlace : "") : placeId(pane);
  const coverOf = (id) => String(id).startsWith("cover:") ? String(id).slice("cover:".length).split("|")[0] : "";
  const keptPlace = (pane, id) => String(id).startsWith("plugin:") ? pane.tabs.some((tab) => tab.kind === "plugin" && tab.plugin === pluginOfPlace(pane, id)) : String(id).startsWith("cover:") || pane.tabs.some((tab) => tab.id === id);
  const pluginOfPlace = (pane, id) => String(id).startsWith("plugin:") ? String(id).slice("plugin:".length).split("|")[0]
    : String(id).startsWith("cover:") ? null : pane.tabs.find((tab) => tab.id === id)?.plugin || null;
  const pruneHistory = (pane) => {
    const entry = paneHistory(pane.id);
    const next = [];
    let index = -1;
    for (let i = 0; i < entry.stack.length; i++) {
      const id = entry.stack[i];
      if (!keptPlace(pane, id) || next[next.length - 1] === id) continue;
      next.push(id);
      if (i <= entry.index) index = next.length - 1;
    }
    entry.stack = next;
    entry.index = index;
  };
  const rememberTab = (pane) => {
    const id = historyId(pane);
    if (!id) return;
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    if (entry.stack[entry.index] === id) return;
    if (historyLock) {
      // A step through history already moved the index; settle on the matching entry nearest to it.
      let found = -1;
      entry.stack.forEach((candidate, index) => { if (candidate === id && (found < 0 || Math.abs(index - entry.index) < Math.abs(found - entry.index))) found = index; });
      if (found >= 0) { entry.index = found; return; }
    }
    entry.stack = entry.stack.slice(0, Math.max(entry.index, -1) + 1);
    if (entry.stack.at(-1) !== id) entry.stack.push(id);
    if (entry.stack.length > HISTORY_LIMIT) entry.stack.splice(0, entry.stack.length - HISTORY_LIMIT);
    entry.index = entry.stack.length - 1;
  };
  const syncHistoryButtons = () => {
    const back = document.querySelector("[data-workspace-history=back]");
    const forward = document.querySelector("[data-workspace-history=forward]");
    if (!back || !forward) return;
    const pane = ops.focused(state);
    if (!pane) { back.disabled = true; forward.disabled = true; return; }
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    // A cover can always be stepped out of, even when nothing was visited before it.
    back.disabled = entry.index <= 0 && !state.exclusive;
    forward.disabled = entry.index < 0 || entry.index >= entry.stack.length - 1;
  };
  /* Covers (settings, project settings, market, capabilities) are opened by their owners, who register how;
     history and the bar reopen them the same way. */
  const coverOpeners = new Map();
  const registerCover = (kind, open) => { if (kind && typeof open === "function") coverOpeners.set(kind, open); };
  const openCover = (kind, place = "") => {
    const open = coverOpeners.get(kind);
    if (open) { open(place); return; }
    setDirectory(kind === "settings" || kind === "project-settings" ? kind : "root", false, false);
    setExclusive(kind);
  };
  // A cover's own directory (settings categories) gives the column back to what the pane shows.
  const leaveCoverDirectory = () => {
    const directory = document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory;
    if (directory === "settings" || directory === "project-settings") setDirectory("root", true, false);
  };
  const visitPlace = (pane, id) => {
    historyLock = true;
    try {
      if (String(id).startsWith("cover:")) {
        const [kind, ...rest] = String(id).slice("cover:".length).split("|");
        coverPlace = rest.join("|");
        openCover(kind, coverPlace);
        return;
      }
      if (state.exclusive) { ops.setExclusive(state, null); leaveCoverDirectory(); }
      state.focusedPaneId = pane.id;
      if (String(id).startsWith("plugin:")) {
        const [plugin, ...rest] = String(id).slice("plugin:".length).split("|");
        const record = rest.join("|");
        const shown = openRecords[plugin] || "";
        const firstShow = !surfaceShows.has(plugin);
        // Say what the page will show before showing it, so history settles on this entry and not its neighbour.
        if (record) openRecords[plugin] = record; else delete openRecords[plugin];
        saveRecords();
        pane.viewPlugin = plugin;
        pane.activeTabId = null;
        apply();
        persist();
        // A page shown for the first time reopens its record on its own; otherwise put the page where the entry says.
        if (!firstShow) {
          const open = topLevelSurface(plugin)?.dataset.expanded === "true";
          if (record && (shown !== record || !open)) jumpToRecord(plugin, record, true);
          else if (!record && open) { applyPluginDefault(plugin); surfaceShows.set(plugin, "page"); }
        }
      } else activate(pane.id, id);
    } finally {
      historyLock = false;
      persistHistory();
    }
  };
  const goHistory = (delta) => {
    const pane = ops.focused(state);
    if (!pane) return false;
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    const i = entry.index + delta;
    if (i < 0 || i >= entry.stack.length) {
      // Back out of a cover that was restored with nothing before it.
      if (delta < 0 && state.exclusive) return closeCover();
      return false;
    }
    entry.index = i;
    visitPlace(pane, entry.stack[i]);
    return true;
  };
  /** Close the cover over the panes; they show exactly what they showed. Counts as a step back when it is one. */
  const closeCover = () => {
    if (!state.exclusive || embedded) return false;
    const pane = ops.focused(state);
    const entry = pane ? paneHistory(pane.id) : null;
    const stepBack = Boolean(entry && coverOf(entry.stack[entry.index]) === state.exclusive && entry.index > 0 && entry.stack[entry.index - 1] === placeId(pane));
    if (stepBack) entry.index -= 1;
    historyLock = stepBack;
    try {
      ops.setExclusive(state, null);
      leaveCoverDirectory();
      apply();
      persist();
    } finally {
      historyLock = false;
      persistHistory();
    }
    return true;
  };
  /**
   * The bar's second press: a pane showing this plugin (its page or one of its tabs) goes back to where it was
   * before the plugin — the latest earlier place in its history that belongs to something else — or to the
   * project's home when there is none. Covers in between are skipped: they lay over the pane, not in it.
   */
  const leavePlugin = (plugin) => {
    if (embedded || state.exclusive || !plugin || plugin === "home") return false;
    const pane = ops.focused(state);
    if (!pane || ops.shownPlugin(pane) !== plugin) return false;
    pruneHistory(pane);
    const entry = paneHistory(pane.id);
    for (let i = entry.index - 1; i >= 0; i -= 1) {
      const owner = pluginOfPlace(pane, entry.stack[i]);
      if (!owner || owner === plugin) continue;
      entry.index = i;
      visitPlace(pane, entry.stack[i]);
      return true;
    }
    ops.openPlugin(state, "home");
    apply();
    persist();
    return true;
  };
  /** Closing the tab being looked at returns to where the pane was before it, when that place is still there. */
  const closeTabBack = (paneId, tabId) => {
    const pane = paneById(paneId);
    const plugin = pane?.tabs.find((tab) => tab.id === tabId && tab.kind === "plugin")?.plugin || "";
    let back = null;
    if (pane && (pane.activeTabId === tabId || plugin && ops.shownPlugin(pane) === plugin && !pane.activeTabId) && !state.exclusive) {
      pruneHistory(pane);
      const entry = paneHistory(pane.id);
      for (let i = entry.index - 1; i >= 0; i -= 1) {
        const id = entry.stack[i];
        if (id === tabId || String(id).startsWith("cover:") || plugin && pluginOfPlace(pane, id) === plugin) continue;
        if (String(id).startsWith("plugin:") || pane.tabs.some((tab) => tab.id === id)) { back = { index: i, id }; break; }
      }
    }
    if (plugin) pluginGroups.close(paneId, plugin); else ops.closeTab(state, paneId, tabId);
    const after = paneById(paneId);
    if (back && after && keptPlace(after, back.id) && !String(back.id).startsWith("cover:")) {
      paneHistory(after.id).index = back.index;
      historyLock = true;
      try {
        if (String(back.id).startsWith("plugin:")) { after.viewPlugin = pluginOfPlace(after, back.id); after.activeTabId = null; }
        else ops.activate(state, after.id, back.id);
        apply();
        persist();
      } finally {
        historyLock = false;
        persistHistory();
      }
      return;
    }
    apply();
    persist();
  };
  const KEPT_PANE_FRAMES = 4;
  const paneFrameKey = (pane) => {
    const tab = pane.tabs.find((item) => item.id === pane.activeTabId);
    if (tab) return tab.kind === "system" ? null : tab.id;
    return pane.viewPlugin ? pane.id + ":view" : null;
  };
  const apply = () => {
    if (applying) { applyQueued = true; return; }
    applying = true;
    const keepFrame = false;
    try {
    if (state.exclusive) {
      root.dataset.exclusive = state.exclusive;
      if (!embedded) document.title = coverLabel(state.exclusive) + " · Molis Work";
      if (titlebarStrip) {
        // The strip stays readable under a cover: it names the cover and keeps the way back.
        const chromeTabs = !embedded && state.panes.length < 2;
        titlebarStrip.hidden = !chromeTabs;
        const coveredPane = ops.focused(state);
        if (chromeTabs && coveredPane) { titlebarStrip.dataset.chromePane = coveredPane.id; renderStrip(coveredPane, titlebarStrip); }
      }
      const node = [...document.querySelectorAll('[data-work-surface="' + state.exclusive + '"]')]
        .find((candidate) => !candidate.closest("[data-goal-canvas-shell]"));
      if (exclusiveEl) {
        exclusiveEl.hidden = false;
        [...exclusiveEl.children].forEach((child) => { if (child !== node) pool.append(child); });
        if (node) {
          exclusiveEl.append(node);
          node.hidden = false;
        }
      }
      ops.normalizeLayout(state);
      root.toggleAttribute("data-split", state.panes.length > 1);
      state.panes.forEach((pane) => {
        if (panesEl.querySelector('[data-tab-pane="' + pane.id + '"]')) return;
        const section = document.createElement("section");
        section.className = "tab-pane";
        section.dataset.tabPane = pane.id;
        section.innerHTML = paneMarkup();
        panesEl.append(section);
      });
      setWorkSurface(state.exclusive, false, false);
      return;
    }
    root.removeAttribute("data-exclusive");
    if (exclusiveEl) {
      exclusiveEl.hidden = true;
      [...exclusiveEl.children].forEach((child) => pool.append(child));
    }
    // However the cover went away (a tab, the Dock, history), its category column goes with it.
    leaveCoverDirectory();
    ops.normalizeLayout(state);
    root.toggleAttribute("data-split", state.panes.length > 1);
    const chromeTabs = !embedded && state.panes.length < 2;
    if (titlebarStrip) {
      titlebarStrip.hidden = !chromeTabs;
      if (!chromeTabs) {
        titlebarStrip.replaceChildren();
        delete titlebarStrip.dataset.chromePane;
      }
    }
    const focusedTab = ops.activeTab(state);
    const focusedView = ops.focused(state)?.viewPlugin;
    if (focusedTab && focusedTab.kind !== "system") {
      const surface = pluginSurface(focusedTab.plugin);
      if (getSurface() !== surface) setWorkSurface(surface, false, false);
      if (!["settings", "project-settings"].includes(document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory)) {
        setDirectory(directoryOf(focusedTab.plugin), false, false);
      }
      if (focusedTab.plugin === "feed") setFeedTask?.(focusedTab.feedTask || "all", false);
      if (focusedTab.plugin === "goals" && focusedTab.kind === "item" && !embedded && (state.panes.length > 1 || panesEl.querySelector('iframe[data-pane-tab="' + focusedTab.id + '"]'))) applySelection?.(focusedTab.itemId);
      document.title = tabLabel(focusedTab) + " · Molis Work";
    } else if (focusedView) {
      const surface = pluginSurface(focusedView);
      if (getSurface() !== surface) setWorkSurface(surface, false, false);
      if (!["settings", "project-settings"].includes(document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory)) {
        setDirectory(directoryOf(focusedView), false, false);
      }
      document.title = ops.pluginTitle(focusedView) + " · Molis Work";
    }
    // Surfaces stay where they are while they keep showing: moving a node out and back drops its scroll and focus.
    // Hidden isolated pages stay attached: reparenting an iframe reloads its browsing context.
    const mountedNow = new Set();

    panesEl.querySelectorAll("[data-tab-pane]").forEach((node) => {
      if (!state.panes.some((pane) => pane.id === node.dataset.tabPane)) node.remove();
    });
    // A tab switched away from keeps its frame hidden, like a single pane keeps its DOM, so returning to it does not
    // reload the page and lose what was open in it. Only the most recently shown hidden frames are kept.
    const hiddenFrames = [];
    panesEl.querySelectorAll("iframe[data-pane-tab]").forEach((frame) => {
      const key = frame.dataset.paneTab;
      const owner = state.panes.find((pane) => paneFrameKey(pane) === key || pane.tabs.some((tab) => tab.id === key));
      if (!owner) { frame.remove(); return; }
      frame.hidden = true; frame.dataset.paneOwner = owner.id;
      if (paneFrameKey(owner) !== key) hiddenFrames.push(frame);
    });
    hiddenFrames.sort((a, b) => Number(b.dataset.shownAt || 0) - Number(a.dataset.shownAt || 0)).slice(KEPT_PANE_FRAMES).forEach((frame) => frame.remove());
    const orderedPanes = [...state.panes].sort((a, b) => (a.id === state.focusedPaneId ? -1 : b.id === state.focusedPaneId ? 1 : 0));
    orderedPanes.forEach((pane) => {
      let section = panesEl.querySelector('[data-tab-pane="' + pane.id + '"]');
      if (!section) {
        section = document.createElement("section");
        section.className = "tab-pane";
        section.dataset.tabPane = pane.id;
        section.innerHTML = paneMarkup();
        panesEl.append(section);
      }
      section.classList.toggle("is-focused", pane.id === state.focusedPaneId);

      const closePane = section.querySelector("[data-tab-pane-close]");
      if (closePane) closePane.hidden = state.panes.length < 2;
      const inStrip = section.querySelector("[data-tab-strip]");
      const useTitlebar = chromeTabs && titlebarStrip && pane.id === state.focusedPaneId;
      if (useTitlebar) {
        titlebarStrip.dataset.chromePane = pane.id;
        renderStrip(pane, titlebarStrip);
        if (inStrip) {
          inStrip.hidden = true;
          inStrip.replaceChildren();
        }
      } else if (inStrip) {
        inStrip.hidden = false;
        renderStrip(pane, inStrip);
      }
      const tab = pane.tabs.find((item) => item.id === pane.activeTabId);
      const viewPlugin = tab ? null : pane.viewPlugin;
      const frameKey = paneFrameKey(pane);
      const paneKey = tab ? ops.tabKey(tab) : (viewPlugin ? "plugin:" + viewPlugin : "");
      const cachedFrame = frameKey && panesEl.querySelector('iframe[data-pane-tab="' + frameKey + '"]');
      if (cachedFrame && cachedFrame.dataset.paneKey !== paneKey) { cachedFrame.remove(); }
      const liveFrame = frameKey && panesEl.querySelector('iframe[data-pane-tab="' + frameKey + '"]');
      if (!embedded && frameKey && (state.panes.length > 1 || liveFrame)) {
        let frame = liveFrame;
        if (!frame) {
          frame = document.createElement("iframe"); frame.className = "tab-content-frame"; frame.dataset.paneTab = frameKey;
          frame.title = tab?.title || ops.pluginTitle(tab?.plugin || viewPlugin);
          const url = new URL(location.href); url.hash = "";
          url.pathname = location.pathname.startsWith("/projects/") ? "/projects/" + encodeURIComponent(getProjectId()) + "/" : "/";
          url.searchParams.set("workbenchPane", pane.id); url.searchParams.set("panePlugin", tab?.plugin || viewPlugin);
          url.searchParams.set("paneTitle", tab?.title || "");
          if (tab?.kind === "item") url.searchParams.set("paneItem", tab.itemId); else url.searchParams.delete("paneItem");
          if (tab?.feedTask) url.searchParams.set("paneFeedTask", tab.feedTask);
          if (tab?.goalView === "work") url.searchParams.set("paneGoalView", "work");
          frame.src = url.href; panesEl.append(frame);
        }
        frame.dataset.paneKey = paneKey; frame.dataset.shownAt = String(Date.now());
        frame.dataset.paneOwner = pane.id; frame.hidden = false;
      } else {
        const node = tab ? rootForTab(tab) : (viewPlugin ? topLevelSurface(viewPlugin) : null);
        if (node) {
          const returning = node.parentElement === pool;
          mount(pane, node);
          mountedNow.add(node);
          if (tab) {
            applyTabContent(tab, keepFrame);
            if (returning && surfaceShows.get(tab.plugin) === "tab:" + tab.id) restoreScroll(node);
            surfaceShows.set(tab.plugin, "tab:" + tab.id);
          } else {
            // A plugin page keeps what was open in it. It goes back to its list only after showing one of its tabs,
            // whose item is not the page's, or when asked to (the plugin tab, the plugin's own back).
            const shown = surfaceShows.get(viewPlugin);
            surfaceShows.set(viewPlugin, "page");
            if (shown === "page") { if (returning) restoreScroll(node); }
            else {
              applyPluginDefault(viewPlugin);
              // First showing since the page loaded: reopen what was open before the reload.
              // A walk through history decides the record itself; otherwise returning from a tab shows the list.
              if (shown === undefined) reopenRecord(viewPlugin); else if (!historyLock) forgetRecord(viewPlugin);
            }
          }
        }
      }
    });
    collectMounted().forEach((node) => {
      if (mountedNow.has(node) || node.parentElement === pool) return;
      rememberScroll(node);
      if (node.querySelector("iframe[data-plugin-frame]")) node.hidden = true; else pool.append(node);
    });
    const treeSignature = JSON.stringify(state.layout.tree, (key, value) => key === "ratio" ? undefined : value);
    if (panesEl.dataset.treeSignature !== treeSignature) {
      panesEl.querySelectorAll("[data-split-id]").forEach((node) => node.remove());
      const renderSashes = (tree) => {
        if (tree.paneId) return;
        const split = document.createElement("div"); split.className = "tab-split"; split.dataset.splitId = tree.id; split.dataset.direction = tree.direction;
        const sash = document.createElement("div"); sash.className = "tab-sash"; sash.dataset.tabSash = tree.id; sash.role = "separator"; sash.tabIndex = 0;
        sash.setAttribute("aria-label", L("调整分屏大小")); sash.setAttribute("aria-orientation", tree.direction === "row" ? "vertical" : "horizontal");
        const handle = document.createElement("span"); handle.className = "tab-sash-handle"; handle.setAttribute("aria-hidden", "true");
        handle.innerHTML = '<svg aria-hidden="true"><use href="#icon-grip"></use></svg>';
        sash.append(handle);
        split.append(sash); panesEl.append(split); tree.children.forEach(renderSashes);
      };
      renderSashes(state.layout.tree); panesEl.dataset.treeSignature = treeSignature;
    }
    layoutSplits();
    if (embedded) setMobileView("document");
    } finally {
      applying = false;
      rememberTab(ops.focused(state));
      announcePlace(); systemTabs.sync();
      persistHistory();
      syncHistoryButtons();
      markCoverOpeners();
      if (applyQueued) {
        applyQueued = false;
        apply();
      }
    }
  };
  const activate = (paneId, tabId) => {
    if (tabId) ops.activate(state, paneId, tabId);
    else {
      if (!paneById(paneId)) return;
      state.focusedPaneId = paneId;
    }
    apply();
    persist();
  };
  const landAtProjectRoot = () => {
    if (pluginRequestedOnLoad) return;
    ops.landAtProjectRoot(state);
    apply();
    persist();
  };
  const focusActiveTab = () => {
    const selected = (titlebarStrip && !titlebarStrip.hidden ? titlebarStrip : panesEl.querySelector('[data-tab-pane="' + state.focusedPaneId + '"] [data-tab-strip]'))?.querySelector('.tab-item-trigger[aria-selected="true"]');
    selected?.focus({ preventScroll: true });
    scrollTabIntoStrip(selected?.closest("[data-tab-id]"));
  };
  const handleStripKey = (paneId, event) => {
    if (!paneId || event.target.closest("[data-tab-close], [data-tab-group-toggle], [data-tab-pane-close]")) return;
    const tab = event.target.closest("[data-tab-id]");
    if (!tab) return;
    const strip = tab.closest(".tab-strip");
    const tabs = [...strip.querySelectorAll('[data-tab-id]')].filter((node) => node.getClientRects().length);
    const index = tabs.indexOf(tab);
    let target = null;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); openTabMenu(paneId, tab, tab.dataset.tabId); return;
    }
    if (event.key === "ArrowRight") target = tabs[(index + 1) % tabs.length];
    if (event.key === "ArrowLeft") target = tabs[(index - 1 + tabs.length) % tabs.length];
    if (event.key === "Home") target = tabs[0];
    if (event.key === "End") target = tabs[tabs.length - 1];
    if (event.key === "Enter" || event.key === " ") target = tab;
    if (event.key === "Delete") {
      event.preventDefault();
      closeTabBack(paneId, tab.dataset.tabId);
      focusActiveTab();
    } else if (target) {
      event.preventDefault();
      activate(paneId, target.dataset.tabId);
      focusActiveTab();
    }
  };
  const openSettingsPage = (plugin) => document.dispatchEvent(new CustomEvent("molis-work:open-settings-section", { detail: { section: plugin } }));
  const openPlugin = (plugin) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin }); return; }
    if (openInSide(plugin)) return;
    if (settingsPageOf(plugin)) { openSettingsPage(plugin); return; }
    state.focusedPaneId = ops.focused(state).id;
    ops.openPlugin(state, plugin);
    apply();
    persist();
  };
  // Search keeps owner-specific save/select behavior, including inside a split pane.
  const SEARCH_ROWS = ${JSON.stringify(searchRows())};
  const pluginGroups = (${PLUGIN_TAB_GROUPS_FACTORY})({ getState: () => state, ops, apply: () => apply(), persist, L, rows: RECORD_ROWS.concat(SEARCH_ROWS), embedded, notify: notifyParent, editable: (node) => editable(node), appendTab });
  let cancelRecordJump = null;
  const openPluginRecord = (plugin, itemId) => {
    // A plugin with no search rows is still opened, and asked for the record by id below (the side panel's files).
    const spec = SEARCH_ROWS.find(([id]) => id === plugin) || [plugin, '[data-record-row-none]', 'none'];
    if (typeof itemId !== 'string' || !itemId) return;
    if (embedded) { notifyParent('workbench-pane-open', { plugin, recordId: itemId }); return; }
    if (openInSide(plugin, itemId)) return;
    cancelRecordJump?.();
    if (settingsPageOf(plugin)) {
      // The record sits on the plugin's settings page: open it there once it is listed.
      const page = document.querySelector('[data-settings-page="' + CSS.escape(plugin) + '"]');
      openSettingsPage(plugin);
      let tries = 0;
      const pick = () => {
        const row = [...page.querySelectorAll(spec[1])].find((el) => el.dataset[spec[2]] === itemId);
        if (row) { row.click(); row.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return; }
        if ((tries += 1) < 50 && state.exclusive === "settings") setTimeout(pick, 100);
      };
      setTimeout(pick, 0);
      return;
    }
    openPlugin(plugin);
    jumpToRecord(plugin, itemId, false);
  };
  // After a reload the plugin's page reopens the record that was open in it, quietly: a record that is gone is forgotten.
  const reopenRecord = (plugin) => {
    const itemId = openRecords[plugin];
    if (!itemId || embedded || plugin === "feed" || state.panes.length > 1) return;
    if (topLevelSurface(plugin)?.dataset.expanded === "true") return;
    setTimeout(() => jumpToRecord(plugin, itemId, true), 0);
  };
  // Wait for the plugin to list the record, then choose it the way a person would.
  const jumpToRecord = (plugin, itemId, quiet) => {
    const spec = SEARCH_ROWS.find(([id]) => id === plugin);
    if (!spec) return;
    cancelRecordJump?.();
    const pane = ops.focused(state), key = paneFrameKey(pane);
    const frame = key && panesEl.querySelector('iframe[data-pane-tab="' + CSS.escape(key) + '"]');
    const current = () => !state.exclusive && ops.focused(state) === pane && pane.viewPlugin === plugin && !pane.activeTabId && (!frame || (frame.isConnected && !frame.hidden && frame.dataset.paneOwner === pane.id));
    let observer = null, timer = null, asked = null, done = false, clicks = 0, lastClick = 0;
    const finish = () => { done = true; observer?.disconnect(); clearTimeout(timer); clearTimeout(asked); frame?.removeEventListener('load', watch); if (cancelRecordJump === finish) cancelRecordJump = null; };
    const surfaceIn = (doc) => doc?.querySelector('[data-work-surface="' + plugin + '"]') || null;
    // The plugin says it has the record open (its current object), however it got there; on a quiet reopen the workbench's own name counts only while the page is open.
    const showsIt = (doc) => {
      const node = surfaceIn(doc);
      const holder = node && (node.hasAttribute('data-assistant-context') ? node : node.querySelector('[data-assistant-context]'));
      try { const context = JSON.parse(holder?.getAttribute('data-assistant-context') || '{}'); return Boolean(context.object && context.object.id === itemId && (context.named_by !== 'workbench' || !quiet || node.getAttribute('data-expanded') !== 'false')); } catch { return false; }
    };
    const check = () => {
      if (done) return;
      if (!current()) { finish(); return; }
      const doc = frame ? frame.contentDocument : document;
      if (!doc || (frame && !doc.body?.hasAttribute('data-pane-embedded'))) return;
      if (showsIt(doc)) { finish(); return; }
      const row = [...doc.querySelectorAll(spec[1])].find(el => el.dataset[spec[2]] === itemId);
      if (!row) return;
      // A row the server drew can be there before the plugin has read its records, and a click then does nothing.
      // A plugin that says its page is still closed gets the click again once it is ready; others get one click.
      const shell = row.closest('[data-work-surface]');
      const stillClosed = () => shell?.getAttribute('data-expanded') === 'false';
      if (clicks && !stillClosed()) { finish(); return; }
      if (clicks >= 3 || Date.now() - lastClick < 400) return;
      clicks += 1; lastClick = Date.now();
      row.click(); row.scrollIntoView({block:'nearest', behavior:'instant'});
      if (!shell?.hasAttribute('data-expanded')) { finish(); return; }
      setTimeout(check, 450);
    };
    const watch = () => {
      observer?.disconnect();
      const doc = frame ? frame.contentDocument : document;
      if (doc?.documentElement) { observer = new MutationObserver(check); observer.observe(doc.documentElement, {childList:true, subtree:true}); }
      check();
    };
    cancelRecordJump = finish;
    // Not among the rows shown now (another view or filter): a plugin that opens records by id is asked directly.
    asked = setTimeout(() => { if (!done && current()) surfaceIn(frame ? frame.contentDocument : document)?.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId, quiet } })); }, 1500);
    timer = setTimeout(() => {
      const stillCurrent = current(); const opened = showsIt(frame ? frame.contentDocument : document); finish();
      if (opened) return;
      if (quiet) { if (openRecords[plugin] === itemId) forgetRecord(plugin); } // quiet: no error, and only the record it looked for is forgotten
      else if (stillCurrent) showToast?.(L('未能打开这条内容，请重试或从列表中选择。'), true);
    }, quiet ? 8000 : 10000);
    frame?.addEventListener('load', watch); watch();
  };
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
  const openItem = (plugin, itemId, title, goalView) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin, itemId, title: titleForItem(plugin, itemId, title), goalView }); return; }
    if (openInSide(plugin, itemId, title)) return;
    const tab = ops.openItem(state, plugin, itemId, titleForItem(plugin, itemId, title));
    if (plugin === "goals" && goalView === "frame") {
      delete tab.goalView;
      panesEl.querySelector('iframe[data-pane-tab="' + tab.id + '"]')?.contentWindow?.postMessage({type:"workbench-goal-view", view:"frame"}, location.origin);
    }
    apply();
    persist();
  };
  // An item (or a plugin's own view) in the pane beside this one; a narrow window has no room, so it opens in place.
  const openBeside = (plugin, itemId, title) => {
    if (embedded) { notifyParent("workbench-pane-open-beside", { plugin, itemId: itemId || null, title: itemId ? titleForItem(plugin, itemId, title) : null }); return; }
    if (openInSide(plugin, itemId, title)) return;
    if (narrow()) { if (itemId) openItem(plugin, itemId, title); else openPlugin(plugin); return; }
    ops.openBeside(state, plugin, itemId || null, itemId ? titleForItem(plugin, itemId, title) : undefined);
    apply();
    persist();
  };
  // An object that moved to another place no longer opens here: its tabs close (the move card offers the new place).
  const closeItem = (plugin, itemId) => {
    let closed = false;
    state.panes.forEach((pane) => pane.tabs.filter((tab) => tab.plugin === plugin && tab.kind === "item" && tab.itemId === itemId).map((tab) => tab.id)
      .forEach((id) => { ops.closeTab(state, pane.id, id); closed = true; }));
    // Nor does its plugin's page reopen it after a reload.
    if (openRecords[plugin] === itemId) forgetRecord(plugin);
    if (closed) { apply(); persist(); }
  };
  const openGoalWork = () => {
    const tab = ops.activeTab(state);
    if (tab?.plugin !== "goals" || tab.kind !== "item") return;
    tab.goalView = "work"; apply(); persist();
    if (embedded) notifyParent("workbench-pane-goal-view", { view: "work", goalId: tab.itemId, title: tab.title });
  };
  const addFeedTask = () => {
    openPlugin("feed");
    setFeedAddOpen?.(true);
    setMobileView("document");
  };
  /* Whoever reads the page's situation (selection, context) learns when the place changes, in the same words history
     uses: "plugin:<id>", a tab id, or "cover:<kind>[|<page>]". */
  let announcedPlace = { paneId: "", place: "" };
  const announcePlace = () => {
    if (embedded) return;
    const pane = ops.focused(state);
    const next = { paneId: pane?.id || "", place: pane ? historyId(pane) || "" : "" };
    if (next.paneId === announcedPlace.paneId && next.place === announcedPlace.place) return;
    const previous = announcedPlace;
    announcedPlace = next;
    document.dispatchEvent(new CustomEvent("molis-work:place-changed", { detail: { ...next, previous } }));
  };
  /** The page itself moved (a record opened or closed on it): one step of history, outside any history walk. */
  const notePlace = () => {
    const pane = ops.focused(state);
    if (embedded || !pane || state.exclusive || historyLock || applying) return;
    rememberTab(pane);
    persistHistory();
    syncHistoryButtons();
    announcePlace();
  };
  /** A cover says where inside it the person went; the first place replaces the bare entry the cover opened with. */
  const noteCover = (kind, place) => {
    if (embedded || state.exclusive !== kind || coverPlace === (place || "")) return;
    coverPlace = place || "";
    if (historyLock) return;
    const pane = ops.focused(state);
    if (!pane) return;
    const entry = paneHistory(pane.id);
    if (entry.stack[entry.index] === "cover:" + kind) entry.stack[entry.index] = historyId(pane);
    else rememberTab(pane);
    persistHistory();
    syncHistoryButtons();
    announcePlace();
  };
  /** Where inside a cover restored by a reload the person was (its history entry), so it reopens there, not on its first page. */
  const historyCoverPlace = (kind) => {
    const pane = ops.focused(state);
    const entry = pane ? tabHistory.get(pane.id) : null;
    const id = String(entry?.stack[entry.index] ?? "");
    return coverOf(id) === kind ? id.split("|").slice(1).join("|") : "";
  };
  const restoredCoverPlace = (kind) => state.exclusive === kind ? coverPlace : "";
  const setExclusive = (surface) => {
    if (surface !== state.exclusive && !historyLock) coverPlace = "";
    ops.setExclusive(state, surface);
    apply();
    persist();
  };
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
  // One item of the tab menu, for a tab's menu and a group's alike; a tab's puts focus back on the active tab.
  const menuItem = (paneId, refocus) => (label, icon, key, action) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "mw-menu__item"; button.setAttribute("role", "menuitem"); button.dataset.tabMenuAction = key;
    button.innerHTML = '<svg aria-hidden="true"><use href="#icon-' + icon + '"></use></svg><span></span>';
    button.querySelector("span").textContent = label;
    button.addEventListener("click", () => { tabMenu.hidePopover(); state.focusedPaneId = paneId; action(); apply(); persist(); if (refocus) focusActiveTab(); });
    tabMenu.append(button);
  };
  const openTabMenu = (paneId, anchor, tabId = null) => {
    const pane = paneById(paneId); if (!pane) return;
    const tab = pane.tabs.find(candidate => candidate.id === (tabId || pane.activeTabId));
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L(tabId ? "标签操作" : "打开插件"));
    const add = menuItem(paneId, true);
    if (!tabId) {
      const mounted = ["home", ...new Set([...document.querySelectorAll('[data-plugin-strip] [data-plugin-id], [data-assistant-island] [data-plugin-id], [data-dock] [data-plugin-id]')].map((el) => el.dataset.pluginId).filter((id) => id && id !== "home" && id !== "market"))];
      mounted.forEach(plugin => {
        add(L(ops.pluginTitle(plugin)), tabIcon(plugin), "open-" + plugin, () => ops.openPlugin(state, plugin));
      });
      if (tab) tabMenu.append(document.createElement("hr"));
    }
    if (tab) {
      const heading = document.createElement("strong"); heading.textContent = tabLabel(tab); heading.title = tabLabel(tab); tabMenu.append(heading);
      pluginGroups.menu(paneId, tab, add);
      add(L(tab.pinned ? "取消固定标签" : "固定标签"), "lock", "pin", () => ops.togglePinned(state, paneId, tab.id));
      if (!tab.pinned) {
        add(L("添加到新分组"), "frame", "new-group", () => ops.addTabToNewGroup(state, paneId, tab.id));
        (pane.groups || []).filter((group) => group.id !== tab.groupId).forEach((group) => {
          add(L("添加到分组") + (group.title ? " · " + group.title : ""), "frame", "join-" + group.id, () => ops.addTabToGroup(state, paneId, tab.id, group.id));
        });
        if (tab.groupId) add(L("从分组移除"), "x", "ungroup-tab", () => ops.removeTabFromGroup(state, paneId, tab.id));
      }
      add(L(tab.kind === "plugin" ? "关闭标签组" : "关闭标签"), "x", "close", () => closeTabBack(paneId, tab.id));
    }
    if (layoutMenu.matches(":popover-open")) layoutMenu.hidePopover();
    const rect = anchor.getBoundingClientRect(); tabMenu.showPopover();
    tabMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - tabMenu.offsetWidth - 8)) + "px";
    tabMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tabMenu.offsetHeight - 8)) + "px";
    tabMenu.querySelector("button, input")?.focus();
  };
  const openGroupMenu = (paneId, groupId, anchor) => {
    const pane = paneById(paneId); if (!pane) return;
    const group = pane.groups.find((candidate) => candidate.id === groupId); if (!group) return;
    tabMenuAnchor = anchor; tabMenu.replaceChildren();
    tabMenu.setAttribute("aria-label", L("分组操作"));
    const heading = document.createElement("strong"); heading.textContent = group.title || L("分组"); tabMenu.append(heading);
    const name = document.createElement("input");
    name.type = "text"; name.value = group.title || ""; name.placeholder = L("分组名称");
    name.addEventListener("change", () => { ops.setGroupTitle(state, paneId, groupId, name.value.trim()); persist(); });
    name.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); tabMenu.hidePopover(); apply(); persist(); } });
    tabMenu.append(name);
    const colors = document.createElement("div"); colors.className = "workspace-tab-menu-colors";
    ops.GROUP_COLORS.forEach((color) => {
      const swatch = document.createElement("button"); swatch.type = "button"; swatch.setAttribute("role", "menuitem");
      swatch.dataset.tabMenuAction = "color-" + color; swatch.title = L({grey:"灰色",blue:"蓝色",red:"红色",yellow:"黄色",green:"绿色",pink:"粉色",purple:"紫色",cyan:"青色"}[color]);
      swatch.style.setProperty("--group-color", GROUP_COLOR[color]);
      if (group.color === color) swatch.setAttribute("aria-current", "true");
      swatch.addEventListener("click", () => { tabMenu.hidePopover(); ops.setGroupColor(state, paneId, groupId, color); apply(); persist(); });
      colors.append(swatch);
    });
    tabMenu.append(colors);
    const add = menuItem(paneId, false);
    add(L("取消分组"), "x", "ungroup", () => ops.ungroup(state, paneId, groupId));
    add(L("关闭分组"), "x", "close-group", () => ops.closeGroup(state, paneId, groupId));
    if (layoutMenu.matches(":popover-open")) layoutMenu.hidePopover();
    const rect = anchor.getBoundingClientRect(); tabMenu.showPopover();
    tabMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - tabMenu.offsetWidth - 8)) + "px";
    tabMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tabMenu.offsetHeight - 8)) + "px";
    name.focus();
  };
  const placeLayoutMenu = ${placeLayoutMenu.toString()};
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
  const openLayoutMenu = (paneId, trigger) => {
    if (tabMenu.matches(":popover-open")) tabMenu.hidePopover();
    layoutPane = paneId;
    layoutMenu.replaceChildren();
    const heading = document.createElement("strong"); heading.textContent = L("布局与分屏"); layoutMenu.append(heading);
    const add = (label, key, value, selected = false) => {
      const button = document.createElement("button"); button.type = "button"; button.dataset[key] = value;
      button.innerHTML = '<svg aria-hidden="true"><use href="#icon-panel"></use></svg><span></span>';
      button.querySelector("span").textContent = label;
      if (selected) { button.setAttribute("aria-current", "true"); const mark = document.createElement("span"); mark.textContent = "✓"; button.append(mark); }
      layoutMenu.append(button); return button;
    };
    [["right","向右分屏"],["bottom","向下分屏"],["left","向左分屏"],["top","向上分屏"]].forEach(([edge,label]) => { add(L(label),"layoutSplit",edge).disabled = narrow(); });
    layoutMenu.append(document.createElement("hr"));
    add(L("均分所有窗口"),"layoutAction","equal").disabled = state.panes.length < 2;
    add(L("关闭当前窗口"),"layoutAction","close").disabled = state.panes.length < 2;
    if (state.panes.length > 1) { layoutMenu.append(document.createElement("hr")); state.panes.forEach((pane,index) => add(String(index+1)+" · "+(pane.tabs.find(t=>t.id===pane.activeTabId)?.title || (pane.viewPlugin ? ops.pluginTitle(pane.viewPlugin) : L("项目首页"))),"focusPane",pane.id,pane.id===state.focusedPaneId)); }
    const rect = trigger.getBoundingClientRect();
    layoutMenu.style.maxHeight = "";
    layoutMenu.style.overflowY = "";
    layoutMenu.showPopover();
    const placed = placeLayoutMenu(rect, { width: layoutMenu.offsetWidth, height: layoutMenu.offsetHeight }, { width: innerWidth, height: innerHeight });
    if (placed.maxHeight != null) {
      layoutMenu.style.maxHeight = placed.maxHeight + "px";
      layoutMenu.style.overflowY = "auto";
    }
    layoutMenu.style.top = placed.top + "px";
    layoutMenu.style.left = placed.left + "px";
    layoutMenu.querySelector("button:not(:disabled)")?.focus();
  };
  layoutMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.layoutSplit) ops.splitPane(state, layoutPane, button.dataset.layoutSplit, "copy");
    else if (button.dataset.layoutAction === "close") ops.closePane(state, layoutPane);
    else if (button.dataset.layoutAction === "equal") { const equal = node => { if (node?.children) { node.ratio=.5; node.children.forEach(equal); } }; equal(state.layout.tree); }
    else if (button.dataset.focusPane) state.focusedPaneId = button.dataset.focusPane;
    layoutMenu.hidePopover(); apply(); persist(); focusActiveTab();
  });
  const handleStripClick = (paneId, event) => {
    const focusPane = event.target.closest("[data-focus-pane]");
    if (focusPane) { activate(focusPane.dataset.focusPane); return true; }
    if (!paneId) return;
    const add = event.target.closest("[data-tab-add]");
    if (add) { openTabMenu(paneId, add); return true; }
    const split = event.target.closest("[data-tab-split]");
    if (split) {
      openLayoutMenu(paneId, split); return true;
    }
    if (event.target.closest("[data-cover-close]")) {
      event.preventDefault();
      closeCover();
      focusActiveTab();
      return true;
    }
    const close = event.target.closest("[data-tab-close]");
    if (close) {
      event.preventDefault();
      closeTabBack(paneId, close.dataset.tabClose);
      focusActiveTab();
      return true;
    }
    const toggle = event.target.closest("[data-tab-group-toggle]");
    if (toggle) {
      const strip = toggle.closest(".tab-strip");
      ops.toggleGroup(state, paneId, toggle.dataset.tabGroupToggle);
      apply();
      persist();
      const label = strip?.querySelector('[data-tab-group-toggle="' + CSS.escape(toggle.dataset.tabGroupToggle) + '"]');
      label?.focus({ preventScroll: true });
      return true;
    }
    const pluginTab = event.target.closest('[data-tab-kind="plugin"]');
    if (pluginTab) {
      const pane = paneById(paneId);
      if (!pane) return true;
      // Already on the plugin's page: its tab goes back to the page's list.
      if (ops.shownPlugin(pane) === pluginTab.dataset.plugin && !pane.activeTabId && state.focusedPaneId === paneId && !state.exclusive) { resetPluginPage(pane.viewPlugin); return true; }
      state.focusedPaneId = paneId;
      const railButton = document.querySelector('[data-dock] [data-plugin-id="' + CSS.escape(pluginTab.dataset.plugin) + '"]');
      if (railButton && ops.shownPlugin(pane) !== pluginTab.dataset.plugin) railButton.click();
      else activate(paneId, pluginTab.dataset.tabId);
      focusActiveTab();
      return true;
    }
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      const pane = paneById(paneId);
      const alreadyActive = pane?.activeTabId === tab.dataset.tabId && state.focusedPaneId === paneId;
      if (!alreadyActive || state.exclusive) {
        activate(paneId, tab.dataset.tabId);
      }
      focusActiveTab();
      return true;
    }
    return false;
  };
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
  const editable = (node) => node?.nodeType === 1 && Boolean(node.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, [data-tui-pane]'));
  const historyStep = (event) => {
    if (event.defaultPrevented || event.repeat) return 0;
    if (MAC && event.metaKey && !event.altKey && !event.ctrlKey && (event.key === "[" || event.key === "]")) return event.key === "[" ? -1 : 1;
    if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !editable(event.target)) return event.key === "ArrowLeft" ? -1 : 1;
    return 0;
  };
  const stepHistory = (delta) => { if (embedded) notifyParent("workbench-pane-history", { delta }); else goHistory(delta); };
  document.addEventListener("keydown", (event) => {
    const delta = historyStep(event);
    if (!delta || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    stepHistory(delta);
  });
  // The side buttons would otherwise take the browser away from the workbench.
  const sideButton = (event) => event.button === 3 || event.button === 4;
  window.addEventListener("mousedown", (event) => { if (sideButton(event)) event.preventDefault(); });
  window.addEventListener("mouseup", (event) => {
    if (!sideButton(event)) return;
    event.preventDefault();
    stepHistory(event.button === 3 ? -1 : 1);
  });
  /* Esc steps out of a cover, unless something smaller is open in it (a field being typed in, a menu, a dialog, a
     page's own editor marked data-cover-layer) or a save is under way: those take the Esc first. */
  let escapeHadLayer = false;
  const openLayer = () => Boolean(document.querySelector("dialog[open], :popover-open, details[open][data-layer-open], details[open][data-project-menu], details[open][data-global-menu], [data-plugin-picker-popover]:not([hidden]), [data-dock-overflow]:not([hidden]), [data-assistant-panel]:not([hidden]), [data-cover-layer]:not([hidden]), form[aria-busy=true]"));
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
  const stripFor = (paneId) => {
    if (titlebarStrip && !titlebarStrip.hidden && titlebarStrip.dataset.chromePane === paneId) return titlebarStrip;
    return panesEl.querySelector('[data-tab-pane="' + paneId + '"] [data-tab-strip]');
  };
  const dragSlot = (${TAB_DRAG_SLOT_FACTORY})({ ms: TAB_REORDER_MS, ease: TAB_REORDER_EASE });
  const removeReorderSlot = () => {
    reorderKey = "";
    dragSlot.clear();
  };
  const hideDropPreview = () => {
    delete panesEl.dataset.splitDropPreview;
    panesEl.style.removeProperty("--split-preview-left");
    panesEl.style.removeProperty("--split-preview-top");
    panesEl.style.removeProperty("--split-preview-width");
    panesEl.style.removeProperty("--split-preview-height");
    document.querySelectorAll("[data-drop-preview]").forEach((node) => node.removeAttribute("data-drop-preview"));
    removeReorderSlot();
    document.querySelectorAll(".is-tab-drag-source").forEach((node) => node.classList.remove("is-tab-drag-source"));
    document.body.style.removeProperty("--tab-reorder-width");
  };
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
  const paintTabReorder = (target, copy) => {
    if (!target?.paneId || !dragTab) { removeReorderSlot(); return; }
    const preview = tabIdsAfterMove(state, ops, dragTab.paneId, dragTab.tabId, target.paneId, target.beforeId, copy);
    const destStrip = stripFor(preview.paneId);
    const tabEl = document.querySelector('.tab-item[data-tab-id="' + dragTab.tabId + '"]');
    const sourceEl = dragTab.members ? tabEl?.closest("[data-plugin-group]") : tabEl;
    if (!destStrip || !sourceEl) { removeReorderSlot(); return; }
    const key = [preview.paneId, preview.ids.join(","), preview.movingId, copy ? "copy" : "move"].join("|");
    if (key === reorderKey) return;
    if (!copy && !sourceEl.classList.contains("is-tab-drag-source")) dragSlot.vacate(sourceEl);
    sourceEl.classList.toggle("is-tab-drag-source", !copy);
    document.body.style.setProperty("--tab-reorder-width", dragTab.width + "px");
    const previous = document.querySelector("[data-tab-reorder-slot]:not([data-tab-slot-leaving])");
    const slot = document.createElement("span");
    slot.dataset.tabReorderSlot = "";
    slot.setAttribute("aria-hidden", "true");
    slot.style.setProperty("--plugin-color", sourceEl.closest(".tab-group")?.style.getPropertyValue("--group-color") || sourceEl.style.getPropertyValue("--plugin-color") || "var(--muted)");
    if (dragTab.members) { slot.classList.add("is-group"); slot.style.width = dragTab.width + "px"; }
    const ids = preview.ids, at = ids.indexOf(preview.movingId);
    // A plugin tab copied where its plugin already has one only shows that plugin there: nothing lands on the strip.
    if (at < 0) { removeReorderSlot(); return; }
    let next = at + 1;
    while (dragTab.members && dragTab.members.includes(ids[next])) next += 1;
    // A plugin's tab lands in its plugin's group, so the slot sits after its neighbour there; a whole group or a tab
    // from outside lands between groups, never inside one.
    const moving = state.panes.flatMap((pane) => pane.tabs).find((tab) => tab.id === dragTab.tabId);
    const loose = !dragTab.members && ops.isLoose(moving);
    const before = loose && ids[at - 1] && destStrip.querySelector('[data-plugin-group="' + moving.plugin + '"] .tab-item[data-tab-id="' + ids[at - 1] + '"]:not(.is-tab-drag-source)');
    let after = !before && ids[next] && destStrip.querySelector('.tab-item[data-tab-id="' + ids[next] + '"]:not(.is-tab-drag-source)');
    if (after && !loose && after.closest("[data-plugin-group]")) after = after.closest("[data-plugin-group]");
    const pad = destStrip.querySelector("[data-tab-scroll-pad]");
    if (before) before.after(slot);
    else if (after) after.before(slot);
    else if (pad) pad.before(slot);
    else (destStrip.querySelector("[data-tab-scroll]") || destStrip).append(slot);
    reorderKey = key;
    dragSlot.close(previous);
    shareTabStrip(destStrip.querySelector("[data-tab-scroll]"));
    dragSlot.open(slot);
  };
  const paintDropPreview = (target, copy) => {
    if (target?.edge) {
      removeReorderSlot();
      paintResultPreview(target, copy);
      return;
    }
    delete panesEl.dataset.splitDropPreview;
    paintTabReorder(target, copy);
  };
  const isCopyDrop = (event) => Boolean(event.altKey || document.body.dataset.tabDragCopy === "1");
  const finishDrag = () => {
    dragTab = null;
    root.classList.remove("is-tab-dragging");
    document.body.classList.remove("is-tab-dragging");
    hideDropPreview();
    delete document.body.dataset.tabDragCopy;
  };
  const dropTarget = (event, surface) => {
    const section = event.target.closest("[data-tab-pane]");
    const paneId = section?.dataset.tabPane || surface.dataset.chromePane;
    let tab = event.target.closest("[data-tab-id]");
    let edge = event.target.closest("[data-tab-edge]")?.dataset.tabEdge || null;
    if (section && !event.target.closest(".tab-strip") && !narrow()) {
      const body = section.querySelector("[data-tab-pane-body]");
      const rect = (body || section).getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = (event.clientY - rect.top) / Math.max(1, rect.height);
      edge ||= splitDropEdge(x, y);
    }
    if (tab && dragTab && tab.dataset.tabId === dragTab.tabId) tab = null;
    let beforeId = tab?.dataset.tabId;
    if (tab && event.clientX > tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2) {
      const pane = paneById(paneId);
      beforeId = pane?.tabs[pane.tabs.findIndex((item) => item.id === beforeId) + 1]?.id;
    }
    const overStrip = event.target.closest("[data-tab-strip], [data-titlebar-tabs]");
    if (overStrip && dragTab) {
      if (tab) dragTab.hoverBeforeId = beforeId;
      else beforeId = dragTab.hoverBeforeId;
    }
    if (dragTab?.members && tab) {
      // A whole group lands before or after another group, by which half of that group the pointer is over.
      const wrap = tab.closest(".tab-group"), box = (wrap || tab).getBoundingClientRect(), pane = paneById(paneId);
      const ids = wrap ? [...wrap.querySelectorAll(".tab-item[data-tab-id]")].map((node) => node.dataset.tabId) : [tab.dataset.tabId];
      beforeId = event.clientX < box.left + box.width / 2 ? ids[0] : pane?.tabs[pane.tabs.findIndex((item) => item.id === ids.at(-1)) + 1]?.id;
      dragTab.hoverBeforeId = beforeId;
    }
    const groupWrap = !dragTab?.members && event.target.closest("[data-tab-group]");
    const groupId = groupWrap && !groupWrap.hasAttribute("data-pinned-group") ? groupWrap.dataset.tabGroup : null;
    if (groupId && !tab) {
      const pane = paneById(paneId);
      const members = pane?.tabs.filter((item) => item.groupId === groupId) || [];
      const last = members.at(-1);
      const lastIndex = pane?.tabs.findIndex((item) => item.id === last?.id);
      beforeId = lastIndex >= 0 ? pane.tabs[lastIndex + 1]?.id : beforeId;
    }
    return { paneId, edge, beforeId, section, groupId };
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
      if (event.data.type === "workbench-feed-task") setFeedTask?.(event.data.taskId, false);
      if (event.data.type !== "workbench-goal-view") return;
      const tab = ops.activeTab(state);
      if (tab?.plugin === "goals" && tab.kind === "item") {
        if (event.data.view === "work") tab.goalView = "work"; else delete tab.goalView;
      }
      apply();
      return;
    }
    const frame = panes.from(event);
    if (frame && event.data.type === "workbench-open-settings") {
      document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: event.data.href || "" } }));
      return;
    }
    if (!["workbench-pane-focus", "workbench-pane-open", "workbench-pane-open-beside", "workbench-pane-goal-view", "workbench-pane-history"].includes(event.data?.type)) return;
    const pane = paneById(frame?.dataset.paneOwner);
    if (!pane) return;
    if (event.data.type === "workbench-pane-history") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
      if (event.data.delta === -1 || event.data.delta === 1) goHistory(event.data.delta);
    } else if (event.data.type === "workbench-pane-goal-view") {
      const tab = pane.tabs.find(tab => tab.id === frame.dataset.paneTab);
      if (tab?.plugin === "goals" && tab.kind === "item") {
        if (event.data.view === "work") tab.goalView = "work"; else delete tab.goalView;
        persist(); apply();
      }
    } else if (event.data.type === "workbench-pane-focus") {
      if (state.focusedPaneId !== pane.id) { state.focusedPaneId = pane.id; apply(); persist(); }
    } else if (event.data.type === "workbench-pane-open-beside") {
      state.focusedPaneId = pane.id;
      openBeside(event.data.plugin, event.data.itemId, event.data.title);
    } else {
      state.focusedPaneId = pane.id;
      if (event.data.background === true && event.data.itemId) pluginGroups.openBehind(event.data.plugin, event.data.itemId, event.data.title);
      else if (typeof event.data.recordId === "string") openPluginRecord(event.data.plugin, event.data.recordId);
      else if (event.data.itemId) openItem(event.data.plugin, event.data.itemId, event.data.title, event.data.goalView); else openPlugin(event.data.plugin);
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
      if (tab?.plugin === "goals" && tab.kind === "item") { delete tab.goalView; apply(); persist(); if (embedded) notifyParent("workbench-pane-goal-view", {view:"frame"}); }
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
    if (existing) { if (tab.goalView === "work") existing.goalView = "work"; activate(pane.id, existing.id); return; }
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
    if (embedded) return;
    const tab = ops.activeTab(state);
    if (tab?.plugin !== "feed") return;
    tab.feedTask = event.detail.taskId;
    const frame = panesEl.querySelector('iframe[data-pane-tab="' + tab.id + '"]');
    frame?.contentWindow?.postMessage({ type: "workbench-feed-task", taskId: tab.feedTask }, location.origin);
    persist();
  });
  if (embedded && paneParams.has("paneFeedTask")) requestAnimationFrame(() => setFeedTask?.(paneParams.get("paneFeedTask"), false));
  return { apply, openPlugin, openPluginRecord, openItem, openBeside, openBehind: pluginGroups.openBehind, openGoalWork, closeItem, addFeedTask, setExclusive, restore, landAtProjectRoot,
    pluginTitle: ops.pluginTitle, leavePlugin, closeCover, openCover, registerCover, noteCover, coverPlace: restoredCoverPlace, goHistory,
    shownPlugin: () => state.exclusive ? null : ops.shownPlugin(ops.focused(state)),
    exclusive: () => state.exclusive, isExclusive: () => Boolean(state.exclusive), isEmbedded: () => embedded, state: () => state };
}`;
