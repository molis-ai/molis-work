import { SURFACE_HOME_ORDER_LIMIT } from "@molis-ai/molis-work-contracts/services/surface-composition";

/** Plugin pages and the records on them: which surface a plugin shows, opening a plugin, a record or an item (here or beside), and closing an item. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_PLUGINS_PART = `  // A plugin whose page lives in settings (it marks the page it renders here) is not a place a pane can show.
  const settingsPageOf = (plugin) => plugin && !embedded && !Object.hasOwn(PLUGIN_TAB_ICON, plugin) && document.querySelector('[data-settings-page="' + CSS.escape(plugin) + '"]') ? plugin : "";
  const removeSettingsPages = () => {
    for (const pane of state.panes || []) {
      if (settingsPageOf(pane.viewPlugin)) pane.viewPlugin = null;
      pane.tabs = (pane.tabs || []).filter((tab) => !settingsPageOf(tab.plugin));
      if (pane.activeTabId && !pane.tabs.some((tab) => tab.id === pane.activeTabId)) pane.activeTabId = pane.tabs[0]?.id || null;
    }
    ops.normalizeLayout(state);
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
  const topLevelSurface = plugin => { const surface = findTopLevelSurface(plugin); host.prepareSurface?.(surface, "restore"); return surface; };
  const titleForItem = (plugin, itemId, fallback) => {
    if (plugin === "goals") return visibleGoals()?.find((item) => item.goal.goal_id === itemId)?.goal.title || fallback || itemId;
    const row = ((spec) => spec && [...document.querySelectorAll(spec[1])].find((el) => el.dataset[spec[2]] === itemId))(RECORD_ROWS.find(([id]) => id === plugin));
    return row?.getAttribute("data-frame-asset-title") || row?.querySelector("strong")?.textContent?.trim() || fallback || itemId;
  };
  const selectItem = (surface, itemId, view, intent = "restore", panel) => {
    if (!surface) return;
    const last = lastSelection.get(surface), now = Date.now();
    if (last && last.itemId === itemId && last.view === view && intent === "restore" && now - last.at < 250 && (itemId || surface.getAttribute("data-expanded") !== "true")) return;
    const preview = surface.querySelector(':scope > [data-own-surface-preview]:not([hidden])');
    if (preview && intent === "restore" && surface.dataset.previewView === (view || "")) {
      const pane = paneById(surface.closest('[data-tab-pane]')?.dataset.tabPane) || (embedded ? state.panes[0] : null);
      const tab = pane && (pane.tabs.find(tab => tab.id === pane.activeTabId) || pane.tabs.find(tab => tab.kind === "plugin" && tab.plugin === pane.viewPlugin));
      if (tab?.id === surface.dataset.previewTab) { preview.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { view, intent } })); return; }
    }
    if (preview) { preview.hidden = true; delete surface.dataset.previewTab; delete surface.dataset.previewView; const frame = surface.querySelector(':scope > iframe[data-plugin-frame]'); if (frame) frame.hidden = false; }
    lastSelection.set(surface, { itemId, view, at: now });
    surface.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId, view, intent, panel } }));
  };
  const applyPluginDefault = (plugin) => {
    if (!plugin) return;
    shellCollapse.add(plugin);
    queueMicrotask(() => shellCollapse.delete(plugin));
    selectItem(topLevelSurface(plugin), null, readView(ops.focused(state).id));
    if (plugin === "goals") {
      document.querySelector("[data-goal-collapse]")?.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-plugins.collapse-goal-return-canvas"));
      (restoreBoard || showCanvas)?.();
      return;
    }
    collapsePluginStage(plugin);
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
  /* What is already open opens where it is (recall, PFG-24; §4.6.2 口径 8): every way of opening (the Dock, ＋, the switcher, a
     link) ends here. Another pane holding it takes the focus, or the right side shows it, and the person hears where it went.
     Answers true when the right side took it, so the caller opens nothing more. */
  const recall = (plugin, itemId) => {
    const at = ops.locate(state, plugin, itemId);
    if (!at || at.paneId === ops.focused(state).id) return false;
    showToast?.(globalThis.t.text(at.side ? "workbench.tab-workspace-plugins.already-open-right-went-there" : "workbench.tab-workspace-plugins.already-open-another-pane-went-there"));
    if (at.side) { column = "side"; sidePane?.open(at.side); return true; }
    state.focusedPaneId = at.paneId; column = "main";
    return false;
  };
  /* A main tab moved to the right side and back (§4.6.2 S2): the tab keeps its record and view; its document is the pane page
     there and the pane's own surface here, so the plugin's drafts bring back what it held. */
  const moveToSide = (paneId, tabId) => {
    const moved = ops.moveToSide(state, paneId, tabId);
    if (!moved) return;
    apply(); persist(); column = "side";
    sidePane?.restore(); sidePane?.open(moved.itemId);
  };
  const moveToMain = (tabId) => {
    if (!ops.moveToMain(state, tabId)) return;
    column = "main"; sidePane?.restore(); apply(); persist(); focusActiveTab();
  };
  const openSettingsPage = (plugin) => document.dispatchEvent(new CustomEvent("molis-work:open-settings-section", { detail: { section: plugin } }));
  const openPlugin = (plugin, view, panel) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin, ...(typeof view === "string" ? { view, panel, viewIntent: "open" } : {}) }); return; }
    if (openInSide(plugin)) return;
    if (settingsPageOf(plugin)) { openSettingsPage(plugin); return; }
    if (recall(plugin)) return;
    // What opens in the main area takes the focus there (and ends the right side's 独看).
    state.focusedPaneId = ops.focused(state).id; column = "main";
    ops.openPlugin(state, plugin);
    const pane = ops.focused(state);
    apply();
    persist();
    host.prepareSurface?.(findTopLevelSurface(plugin), "open");
    if (typeof view === "string") selectPluginView(pane, plugin, { id: view, panel, intent: "open" });
    setMobileView("document");
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
    let observer = null, timer = null, asked = null, due = false, done = false, clicks = 0, lastClick = 0;
    const finish = () => { done = true; observer?.disconnect(); clearTimeout(timer); clearTimeout(asked); frame?.removeEventListener('load', loaded); if (cancelRecordJump === finish) cancelRecordJump = null; };
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
    // A pane page still starting puts its plugin back on its list when this page hands it its view on load (a message),
    // which undid an ask sent before it: the pane is asked once it has loaded, by a message that queues behind that hand-off.
    const ask = () => {
      if (done || !current()) return;
      if (!frame) { surfaceIn(document)?.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId, quiet } })); return; }
      const doc = frame.contentDocument;
      if (doc?.readyState === 'complete' && doc.body?.hasAttribute('data-pane-embedded')) frame.contentWindow?.postMessage({ type: 'workbench-select-item', plugin, itemId, quiet }, location.origin);
    };
    // A pane page that loads after the ask is due (or loads again) is asked then; this listener runs after the hand-off's.
    const loaded = () => { watch(); if (due) ask(); };
    asked = setTimeout(() => { due = true; ask(); }, 1500);
    timer = setTimeout(() => {
      const stillCurrent = current(); const opened = showsIt(frame ? frame.contentDocument : document); finish();
      if (opened) return;
      if (quiet) { if (openRecords[plugin] === itemId) forgetRecord(plugin); } // quiet: no error, and only the record it looked for is forgotten
      else if (stillCurrent) showToast?.(globalThis.t.text("workbench.tab-workspace-plugins.could-not-open-item-try-again-select-list"), true);
    }, quiet ? 8000 : 10000);
    frame?.addEventListener('load', loaded); watch();
  };
  const openItem = (plugin, itemId, title, view) => {
    if (embedded) { notifyParent("workbench-pane-open", { plugin, itemId, title: titleForItem(plugin, itemId, title), view }); return; }
    if (openInSide(plugin, itemId, title) || recall(plugin, itemId)) return;
    column = "main";
    const tab = ops.openItem(state, plugin, itemId, titleForItem(plugin, itemId, title));
    if (view !== undefined) ops.writeView(state, ops.focused(state).id, plugin === "goals" && view === "frame" ? undefined : view, tab.id);
    apply();
    persist();
    host.prepareSurface?.(findTopLevelSurface(plugin), "open");
    setMobileView("document");
  };
  // An item (or a plugin's own view) in the pane beside this one; a narrow window has no room, so it opens in place.
  const openBeside = (plugin, itemId, title) => {
    if (embedded) { notifyParent("workbench-pane-open-beside", { plugin, itemId: itemId || null, title: itemId ? titleForItem(plugin, itemId, title) : null }); return; }
    if (openInSide(plugin, itemId, title)) return;
    if (narrow()) { if (itemId) openItem(plugin, itemId, title); else openPlugin(plugin); return; }
    column = "main";
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
  // The mount names its owner and surface. Layout remains the only owner of pane/tab selection.
  const ownSurfaces = (origin) => origin.dataset.pluginOwner && origin.dataset.pluginContribution
    ? [...document.querySelectorAll('[data-plugin-owner][data-plugin-contribution]')].filter(node => node.dataset.pluginOwner === origin.dataset.pluginOwner && node.dataset.pluginContribution === origin.dataset.pluginContribution) : [];
  const invalidateLocal = () => { host.refreshHome?.(); return [...document.querySelectorAll('[data-plugin-contribution][data-ui-client-state="ready"]')].forEach(node => node.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { invalidate: true } }))); };
  const invalidateView = (origin, relay = true) => {
    if (!origin?.isConnected) return;
    invalidateLocal(origin);
    if (!relay) return;
    if (embedded) { notifyParent("workbench-pane-invalidate"); return; }
    panesEl.querySelectorAll('iframe[data-pane-tab]').forEach(frame => {
      frame.contentWindow?.postMessage({ type: "workbench-view-invalidate" }, location.origin);
    });
  };
  const projectOwnSurface = (pane, plugin, selection, tab) => {
    const base = topLevelSurface(plugin); if (!base) return false;
    const candidates = ownSurfaces(base).filter(node => node.dataset.pluginSurface === (selection.surface || base.dataset.pluginSurface)
      && node.dataset.pluginSlot === "workbench.main" && (!node.closest('[data-tab-pane]') || node.closest('[data-tab-pane]').dataset.tabPane === pane.id));
    if (candidates.length !== 1) return false;
    const target = candidates[0];
    base.querySelectorAll(':scope > [data-own-surface-preview]').forEach(node => { node.hidden = node !== target; });
    const frame = base.querySelector(':scope > iframe[data-plugin-frame]');
    if (target !== base) {
      if (target.parentElement !== base) base.append(target);
      target.dataset.ownSurfacePreview = "true"; target.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1"; target.hidden = false;
      base.dataset.previewTab = tab.id; base.dataset.previewView = selection.id || ""; if (frame) frame.hidden = true;
      host.prepareSurface?.(target, selection.intent === "restore" ? "restore" : "open");
    } else { delete base.dataset.previewTab; delete base.dataset.previewView; if (frame) frame.hidden = false; }
    target.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { ...(target === base ? { itemId: tab.kind === "item" ? tab.itemId : null } : {}), view: selection.id, panel: selection.panel, intent: selection.intent || "open" } }));
    return true;
  };
  const selectPluginView = (pane, plugin, selection) => {
    const tab = pane.tabs.find(tab => tab.id === pane.activeTabId) || pane.tabs.find(tab => tab.kind === "plugin" && tab.plugin === plugin);
    if (!tab || tab.plugin !== plugin) return false;
    // An in-place preview changes this tab's view, without reopening its directory or restoring its main page.
    if (selection.intent === "select") { if (!ops.writeView(state, pane.id, selection.id, tab.id)) return false; persist(); }
    else if (!writeView(pane.id, selection.id, tab.id)) return false;
    const frame = panesEl.querySelector('iframe[data-pane-tab="' + CSS.escape(paneFrameKey(pane)) + '"]');
    if (frame) {
      const project = () => { if (frame.isConnected && paneById(pane.id) === pane && (pane.tabs.find(item => item.id === pane.activeTabId) || pane.tabs.find(item => item.kind === "plugin" && item.plugin === pane.viewPlugin)) === tab) frame.contentWindow?.postMessage({ type: "workbench-view", view: selection.id, surface: selection.surface, panel: selection.panel, intent: selection.intent || "open" }, location.origin); };
      if (frame.contentDocument?.body?.hasAttribute("data-pane-embedded")) project(); else frame.addEventListener("load", project, { once: true });
    } else return projectOwnSurface(pane, plugin, selection, tab);
    return true;
  };
  const homeOrder = () => [...new Set([...(embedded ? parent.document : document).querySelectorAll(":is([data-dock-pins], [data-bar-own]) [data-dock-pin]:not(.is-leaving)")]
    .map(node => directory.find(entry => entry.id === node.dataset.dockPin)?.plugin_id).filter(Boolean))].slice(0, ${SURFACE_HOME_ORDER_LIMIT});
  // An installed package's stage mounts its own opaque frame from its page source only once it is opened. The homepage's reply is bound to that
  // exact page (the installation it names), and a panel or record reaches the frame through the stage, as the carrier page gives it, once mounted.
  const signedHomeWaits = new WeakMap();
  const signedHomeStage = (mount, owner, href) => mount?.dataset.installedPlugin === owner && mount.dataset.pluginPageSource
    && new URL(href, location.origin).origin === location.origin && new URL(mount.dataset.pluginPageSource, location.origin).href === href ? mount : null;
  const signedHomeSelection = (stage, href, selection) => {
    signedHomeWaits.get(stage)?.();
    const detail = typeof selection.panel === "string" ? { panel: selection.panel } : typeof selection.itemId === "string" ? { itemId: selection.itemId } : null;
    if (!detail) return;
    const current = () => stage.isConnected && !stage.closest("[hidden]") && !!stage.dataset.pluginPageSource
      && new URL(stage.dataset.pluginPageSource, location.origin).href === href;
    // What opens takes the focus there. A frame mounted earlier is not focused by its mount, and focus reaches its isolated document
    // asynchronously, so the panel is asked for a frame after the focus moved; otherwise its dialog opens without holding the focus.
    const send = () => {
      if (!current()) return;
      [...stage.querySelectorAll("iframe[data-plugin-frame]")].find(frame => frame.dataset.pluginFrame === stage.dataset.workSurface)?.focus({ preventScroll: true });
      requestAnimationFrame(() => { if (current()) stage.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { ...detail, intent: "open" } })); });
    };
    if (stage.dataset.uiClientState === "ready") { send(); return; }
    const watch = new MutationObserver(() => {
      const mounted = stage.dataset.uiClientState;
      if (mounted === "ready") { stop(); send(); } else if (mounted === "failed" || !stage.isConnected) stop();
    });
    const stop = () => { watch.disconnect(); if (signedHomeWaits.get(stage) === stop) signedHomeWaits.delete(stage); };
    signedHomeWaits.set(stage, stop);
    watch.observe(stage, { attributes: true, attributeFilter: ["data-ui-client-state"] });
  };
  const selectSignedHomeTarget = (pane, plugin, owner, href, selection) => {
    const paneFrame = panesEl.querySelector('iframe[data-pane-tab="' + CSS.escape(paneFrameKey(pane)) + '"]');
    if (!paneFrame) { const stage = signedHomeStage(findTopLevelSurface(plugin), owner, href); if (stage) signedHomeSelection(stage, href, selection); return; }
    const select = () => {
      if (!paneFrame.isConnected || paneFrame.hidden || ops.focused(state) !== pane || ops.shownPlugin(pane) !== plugin) return;
      paneFrame.contentWindow?.postMessage({ type: "workbench-view", signedHomeTarget: { plugin, owner, href, selection } }, location.origin);
    };
    if (paneFrame.contentDocument?.body?.hasAttribute("data-pane-embedded")) select(); else paneFrame.addEventListener("load", select, { once: true });
  };
  // Only the shell calls this with the protected homepage's reply. It binds the reply back to this pane and its actual mount.
  const openHomeNavigation = (result, pane, home = true) => {
    if (!result || !pane || state.exclusive || pane !== ops.focused(state) || home && ops.shownPlugin(pane) !== "home") return false;
    if (embedded) { notifyParent(home ? "workbench-home-navigation" : "workbench-position-navigation", { result }); return true; }
    if (home && result.kind === "settings" && result.section === "plugins") { openSettingsPage(result.section); return true; }
    if (result.kind !== "stage" || !result.selection || !result.installation || typeof result.shell_key !== "string"
      || typeof result.owner_plugin_id !== "string") return false;
    const plugin = result.shell_key, mount = findTopLevelSurface(plugin), selection = result.selection;
    if (!mount || removedPlugin(plugin)) return false;
    state.focusedPaneId = pane.id;
    if (result.frame_path) {
      if (typeof result.frame_path !== "string") return false;
      const url = new URL(result.frame_path, location.origin);
      if (!signedHomeStage(mount, result.owner_plugin_id, url.href)) return false;
      openPlugin(plugin);
      if (selection.panel || result.item_id) selectSignedHomeTarget(ops.focused(state), plugin, result.owner_plugin_id, url.href,
        selection.panel ? { panel: selection.panel } : { itemId: result.item_id });
      return true;
    }
    if (typeof result.producer !== "string") return false;
    const proof = JSON.parse(result.producer), installation = result.installation;
    if (!Array.isArray(proof) || [installation.scope, installation.install_id, installation.installation_generation, installation.version,
      installation.manifest_digest].some((value, index) => value !== proof[index])) return false;
    const mounted = [mount, ...mount.querySelectorAll("[data-plugin-producer]")].find(node => node.dataset.pluginOwner === result.owner_plugin_id
      && node.dataset.pluginProducer === result.producer && node.dataset.pluginSlot === "workbench.main");
    if (!mounted) return false;
    const subview = selection.surface !== mounted.dataset.pluginSurface;
    if (subview && !ownSurfaces(mounted).some(node => node.dataset.pluginSurface === selection.surface && node.dataset.pluginSlot === "workbench.main")) return false;
    if (result.item_id && !subview) { openItem(plugin, result.item_id, result.title); return true; }
    openPlugin(plugin);
    if (!selection.panel && !subview) return true;
    return selectPluginView(ops.focused(state), plugin, { ...selection, ...(subview ? { id: result.item_id } : {}) });
  };
  const homeNavigationFrom = (source) => {
    const pane = paneById(source.closest("[data-tab-pane]")?.dataset.tabPane);
    return result => source.isConnected && !source.closest("[hidden]") && source.closest("[data-tab-pane]")?.dataset.tabPane === pane?.id
      && openHomeNavigation(result, pane);
  };
  const positionNavigationFrom = (source) => {
    const holder = source.ownerDocument.defaultView?.frameElement, node = holder || source;
    const pane = paneById(node.closest("[data-tab-pane]")?.dataset.tabPane) || ops.focused(state), tab = pane?.activeTabId;
    return result => source.isConnected && node.isConnected && !source.closest("[hidden]") && !node.closest("[hidden]")
      && pane?.activeTabId === tab && openHomeNavigation(result, pane, false);
  };
  const openView = (origin, selection) => {
    if (!origin?.isConnected || origin.closest('[hidden]')) return false;
    const targets = ownSurfaces(origin).filter(node => node.dataset.pluginSurface === selection.surface && node.dataset.pluginSlot === "workbench.main");
    if (!targets.length) return false;
    const pane = embedded ? state.panes[0] : paneById(origin.closest('[data-tab-pane]')?.dataset.tabPane) || ops.focused(state);
    if (!pane) return false;
    const plugin = origin.dataset.pluginClient;
    const active = pane.tabs.find(tab => tab.id === pane.activeTabId);
    if (selection.intent === "select" && ops.shownPlugin(pane) !== plugin) return false;
    const navigate = ops.shownPlugin(pane) !== plugin || selection.intent !== "select" && active?.kind === "item";
    if (embedded && navigate) { notifyParent("workbench-pane-open", { plugin, view: selection.id, panel: selection.panel, surface: selection.surface, viewIntent: selection.intent || "open" }); return true; }
    // A selection already in this owner's page keeps its actual pane, even if focus moved meanwhile.
    if (navigate) { state.focusedPaneId = pane.id; ops.openPlugin(state, plugin); }
    const result = selectPluginView(pane, plugin, selection);
    if (result && embedded) notifyParent("workbench-pane-view", { view: selection.id });
    return result;
  };`;
