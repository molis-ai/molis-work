/** Places and the way back: each pane's history, covers over the panes, leaving a plugin, closing a tab back, announcing the place, and stepping back from the keyboard and mouse. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_PLACES_PART = `  const coverLabel = (kind) => kind === "market" ? L("插件市场") : kind === "project-settings" ? L("项目设置") : kind === "settings" ? L("设置") : ops.pluginTitle(kind);
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
  const paneHistory = (paneId) => {
    let entry = tabHistory.get(paneId);
    if (!entry) { entry = { stack: [], index: -1 }; tabHistory.set(paneId, entry); }
    return entry;
  };
  // A plugin's page is a place, and so is a record opened on it ("plugin:<id>|<record>"): Back from a note is its list.
  const placeId = (pane) => pane?.activeTabId || (pane?.viewPlugin ? "plugin:" + pane.viewPlugin + (openRecords[pane.viewPlugin] ? "|" + openRecords[pane.viewPlugin] : "") : null);
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
  const editable = (node) => node?.nodeType === 1 && Boolean(node.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, [data-tui-pane]'));
  const historyStep = (event) => {
    if (event.defaultPrevented || event.repeat) return 0;
    if (MAC && event.metaKey && !event.altKey && !event.ctrlKey && (event.key === "[" || event.key === "]")) return event.key === "[" ? -1 : 1;
    if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !editable(event.target)) return event.key === "ArrowLeft" ? -1 : 1;
    return 0;
  };
  const stepHistory = (delta) => { if (embedded) notifyParent("workbench-pane-history", { delta }); else goHistory(delta); };
  // The side buttons would otherwise take the browser away from the workbench.
  const sideButton = (event) => event.button === 3 || event.button === 4;
  const openLayer = () => [...document.querySelectorAll("dialog[open], :popover-open, details[open][data-layer-open], details[open][data-project-menu], details[open][data-global-menu], [data-plugin-picker-popover]:not([hidden]), [data-dock-overflow]:not([hidden]), [data-assistant-panel]:not([hidden]), [data-cover-layer]:not([hidden]), form[aria-busy=true]")].some((node) => !node.closest("[hidden], [inert]") && node.getClientRects().length && getComputedStyle(node).visibility === "visible");`;
