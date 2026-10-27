import { searchRows } from "../../search-rows.js";
import { PLUGIN_TAB_GROUPS_FACTORY } from "./plugin-tab-groups.js";
import { OPENED_PLUGIN_RECORD_SCRIPT } from "./plugin-open-record.js";

/** Split panes, history and the place a pane stands on in TAB_WORKSPACE_FACTORY_SCRIPT (a part, joined in place). */
export const TAB_WORKSPACE_LAYOUT_PART = `
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
    } catch { /* nothing saved, or storage is blocked: the panes start with an empty way back */ }
  }
  const persistHistory = () => { // A closed pane's way back goes with it (VUX-36): the map holds only the panes that are open.
    for (const paneId of tabHistory.keys()) if (!state.panes.some((pane) => pane.id === paneId)) tabHistory.delete(paneId); if (embedded) return;
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(Object.fromEntries(tabHistory))); } catch { /* storage full or blocked: the way back then lives in memory only */ }
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
  // Each plugin's group colour is the hue its Manifest declares, which the Host writes into the page's plugin directory.
  const DIRECTORY_HUES = Object.fromEntries(JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]").filter((entry) => entry.hue).map((entry) => [entry.id, entry.hue]));
  const pluginGroups = (${PLUGIN_TAB_GROUPS_FACTORY})({ getState: () => state, ops, apply: () => apply(), persist, L, rows: RECORD_ROWS.concat(SEARCH_ROWS), embedded, notify: notifyParent, editable: (node) => editable(node), appendTab, hues: DIRECTORY_HUES });
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
  };`;
