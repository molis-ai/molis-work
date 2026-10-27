import { isCurrentTabWorkspace } from "../../tab-workspace-ops.js";
import { clampSplitRatio, focusedPaneBoxAfterDrop, layoutPaneBoxes, snapSplitRatio, splitDropEdge, splitRatioRange, splitTreeFits } from "../../tab-split-drop.js";

/** Panes of the work area: reconciling the panes with the state, mounting a tab's content, the split tree and its geometry, and saving the state and telling the parent page. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_PANES_PART = `  const isCurrent = (${isCurrentTabWorkspace.toString()});
  const clampSplitRatio = ${clampSplitRatio.toString()};
  const splitDropEdge = ${splitDropEdge.toString()};
  const splitRatioRange = ${splitRatioRange.toString()}, splitTreeFits = ${splitTreeFits.toString()}, snapSplitRatio = ${snapSplitRatio.toString()};
  const layoutPaneBoxes = ${layoutPaneBoxes.toString()};
  const focusedPaneBoxAfterDrop = ${focusedPaneBoxAfterDrop.toString()};
  const notifyParent = (type, payload = {}) => { if (embedded) parent.postMessage({ type, paneId: paneParams.get("workbenchPane"), ...payload }, location.origin); };
  const narrow = () => matchMedia("(max-width: 760px)").matches || root.hasAttribute("data-split-narrow");
  const paneById = (id) => state.panes.find((pane) => pane.id === id);
  const persist = () => { if (embedded) return; try { localStorage.setItem(storageKey, JSON.stringify(state)); unsaved = false; } catch { if (!unsaved) showToast?.(L("这个布局没能保存到本机，刷新后会回到上次保存的样子"), true); unsaved = true; } };
  const rootForTab = (tab) => tab?.kind === "system" ? systemTabs.root(tab) : supportsGoalFrames() && tab?.plugin === "goals" && tab.kind === "item" && tab.goalView !== "work"
    ? document.querySelector("[data-goal-frame-surface]") : tab ? topLevelSurface(tab.plugin) : null;
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
  const landAtProjectRoot = () => {
    if (pluginRequestedOnLoad) return;
    ops.landAtProjectRoot(state);
    apply();
    persist();
  };`;
