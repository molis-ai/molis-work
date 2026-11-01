/** Plugin pages and the records on them: which surface a plugin shows, opening a plugin, a record or an item (here or beside), and closing an item. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_PLUGINS_PART = `  // A plugin whose page lives in settings (it marks the page it renders here) is not a place a pane can show.
  const settingsPageOf = (plugin) => plugin && !embedded && !Object.hasOwn(PLUGIN_TAB_ICON, plugin) && document.querySelector('[data-settings-page="' + CSS.escape(plugin) + '"]') ? plugin : "";
  const removeSettingsPages = () => {
    for (const pane of state.panes || []) {
      if (settingsPageOf(pane.viewPlugin)) { pane.viewPlugin = null; if (!pane.activeTabId) pane.activeTabId = pane.tabs.find((tab) => tab.kind === "home")?.id || null; }
      pane.tabs = (pane.tabs || []).filter((tab) => !settingsPageOf(tab.plugin));
      if (pane.activeTabId && !pane.tabs.some((tab) => tab.id === pane.activeTabId)) pane.activeTabId = pane.tabs[0]?.id || null;
    }
    ops.ensureHome(state);
  };
  const directoryOf = (plugin) => {
      if (plugin === "home" || plugin === "market") return "root"; const directory = plugin;
      return document.querySelector('[data-directory-panel="' + directory + '"]') ? directory : "root";
    };
  const supportsGoalFrames = () => document.body.dataset.boardView === "current";
  const findTopLevelSurface = (plugin) => plugin === "goals"
    ? document.querySelector("[data-goal-canvas-shell]") || document.querySelector('[data-document-pane]')
    : [...document.querySelectorAll('[data-work-surface="' + plugin + '"]')]
      .find((node) => !node.closest("[data-goal-canvas-shell]")) || null;
  const topLevelSurface = plugin => { const surface = findTopLevelSurface(plugin); host.prepareSurface?.(surface); return surface; };
  const titleForItem = (plugin, itemId, fallback) => {
    if (plugin === "goals") return visibleGoals()?.find((item) => item.goal.goal_id === itemId)?.goal.title || fallback || itemId;
    const row = ((spec) => spec && [...document.querySelectorAll(spec[1])].find((el) => el.dataset[spec[2]] === itemId))(RECORD_ROWS.find(([id]) => id === plugin));
    return row?.getAttribute("data-frame-asset-title") || row?.querySelector("strong")?.textContent?.trim() || fallback || itemId;
  };
  const selectItem = (surface, itemId) => {
    if (!surface) return;
    const last = lastSelection.get(surface), now = Date.now();
    if (last && last.itemId === itemId && now - last.at < 250 && (itemId || surface.getAttribute("data-expanded") !== "true")) return;
    lastSelection.set(surface, { itemId, at: now });
    surface.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId } }));
  };
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
    if (plugin === "feed") setFeedTask?.(readView(ops.focused(state).id) ?? "all", false, "restore");
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
  const openItem = (plugin, itemId, title, view) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin, itemId, title: titleForItem(plugin, itemId, title), view }); return; }
    if (openInSide(plugin, itemId, title)) return;
    const tab = ops.openItem(state, plugin, itemId, titleForItem(plugin, itemId, title));
    if (view !== undefined) ops.writeView(state, ops.focused(state).id, plugin === "goals" && view === "frame" ? undefined : view, tab.id);
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
    writeView(ops.focused(state).id, "work", tab.id);
    if (embedded) notifyParent("workbench-pane-view", { view: "work" });
  };
  const addFeedTask = () => {
    openPlugin("feed");
    setFeedAddOpen?.(true);
    setMobileView("document");
  };`;
