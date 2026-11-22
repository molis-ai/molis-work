import { isCurrentTabWorkspace } from "../../tab-workspace-ops.js";
import { clampSplitRatio, focusedPaneBoxAfterDrop, layoutPaneBoxes, snapSplitRatio, splitDropEdge, splitRatioRange, splitTreeFits } from "../../tab-split-drop.js";
import { TAB_WORKSPACE_CLONES_PART } from "./pane-clones.js";

/** Panes of the work area: reconciling the panes with the state, mounting a tab's content, single-document CSS Grid split geometry, and saving the state. A part of TAB_WORKSPACE_FACTORY_SCRIPT, joined in place. */
export const TAB_WORKSPACE_PANES_PART = `  const isCurrent = (${isCurrentTabWorkspace.toString()});
  const clampSplitRatio = ${clampSplitRatio.toString()};
  const splitDropEdge = ${splitDropEdge.toString()};
  const splitRatioRange = ${splitRatioRange.toString()}, splitTreeFits = ${splitTreeFits.toString()}, snapSplitRatio = ${snapSplitRatio.toString()};
  const layoutPaneBoxes = ${layoutPaneBoxes.toString()};
  const focusedPaneBoxAfterDrop = ${focusedPaneBoxAfterDrop.toString()};
  const notifyParent = (type, payload = {}) => { if (embedded) parent.postMessage({ type, paneId: paneParams.get("workbenchPane"), ...payload }, location.origin); };
  const narrow = () => matchMedia("(max-width: 760px)").matches || root.hasAttribute("data-split-narrow");
  const paneById = (id) => state.panes.find((pane) => pane.id === id);
  const persist = () => { if (embedded) return; try { localStorage.setItem(storageKey, JSON.stringify(state)); unsaved = false; } catch { if (!unsaved) showToast?.(globalThis.t.text("workbench.tab-workspace-panes.layout-could-not-be-saved-device-after-reload"), true); unsaved = true; } };
  const readView = (paneId, tabId) => ops.readView(state, paneId, tabId);
  const writeView = (paneId, view, tabId) => {
    if (!ops.writeView(state, paneId, view, tabId)) return false;
    apply();
    persist();
    return true;
  };
  const rootForTab = (tab) => tab?.kind === "system" ? systemTabs.root(tab) : supportsGoalFrames() && tab?.plugin === "goals" && tab.kind === "item" && tab.view !== "work"
    ? document.querySelector("[data-goal-frame-surface]:not([data-pane-clone])") : tab ? topLevelSurface(tab.plugin) : null;
${TAB_WORKSPACE_CLONES_PART}
  const applyTabContent = (pane, tab, node, keepFrame) => {
    if (!tab || tab.kind === "system" || !node) return;
    const isClone = node.hasAttribute("data-pane-clone");
    const isSplit = state.panes.length > 1;
    const isFocused = pane.id === state.focusedPaneId;
    if (tab.plugin === "goals" && tab.kind === "item" && tab.itemId) {
      if (supportsGoalFrames() && tab.view !== "work") {
        declareGoal(tab.itemId, tab.title, node);
        if (isFocused) applySelection?.(tab.itemId);
        if (showGoalFrame?.(tab.itemId, isClone || isSplit ? node : undefined) !== false) return;
      }
      if (isClone) {
        prepareGoalWorkClone(node, tab.itemId);
        declareGoal(tab.itemId, tab.title, node.querySelector("[data-document-pane]"));
        return;
      }
      releaseFrame?.();
      declareGoal(tab.itemId, tab.title, node.querySelector("[data-document-pane]"));
      applySelection?.(tab.itemId);
      const work = node.querySelector("[data-goal-node-workspace]");
      if (work) work.hidden = false;
      if ((getDocumentGoalId() !== tab.itemId || loadingGoalId) && loadingGoalId !== tab.itemId) {
        const goalId = tab.itemId;
        loadingGoalId = goalId;
        void loadGoalDocument(goalId).then((loaded) => {
          if (loaded) {
            document.dispatchEvent(new CustomEvent("molis-work:record-document-loaded", { detail: { recordId: goalId } }));
            const tui = document.querySelector("[data-tui-pane]");
            const pluginId = tui?.dataset.tuiPluginId || PLUGIN_MANIFEST_IDS.goals || "";
            const subjectKind = tui?.dataset.tuiSubjectKind || "goal";
            if (pluginId && subjectKind) document.dispatchEvent(new CustomEvent("molis-work:work-terminal-subject-ready", { detail: { pluginId, subjectKind, subjectId: goalId } }));
          }
        }).finally(() => { if (loadingGoalId === goalId) loadingGoalId = null; });
      }
      setWorkspaceMode("focus", false, true);
      node.hidden = false;
      if (work) work.hidden = false;
      const collapse = node.querySelector("[data-goal-collapse]");
      collapse?.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-panes.back-goal-canvas"));
      collapse?.setAttribute("title", globalThis.t.text("workbench.tab-workspace-panes.back-goal-canvas"));
      return;
    }
    if (tab.plugin === "goals") {
      if (isClone) {
        prepareGoalCanvasClone(node);
        return;
      }
      releaseFrame?.();
      const work = node.querySelector("[data-goal-node-workspace]");
      if (work) work.hidden = true;
      node.querySelector("[data-goal-collapse]")?.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-panes.collapse-goal-return-canvas"));
      if (keepFrame || isSplit) {
        node.dataset.expanded = "false";
        if (isFocused) {
          setWorkSurface("goals", false, false, "restore");
          setWorkspaceMode("graph", false, true);
        }
        node.hidden = false;
        return;
      }
      (restoreBoard || showCanvas)?.();
      return;
    }
    if (isFocused) declareGoal(null);
    if (isClone && tab.plugin === "artifacts") {
      void loadArtifactClone(node, tab.kind === "item" ? tab.itemId : null);
      return;
    }
    if (isFramedSurface(tab.plugin, node)) {
      node.dataset.paneSearch = buildPaneSearch(pane, tab, null, isClone);
      host.prepareSurface?.(node, "restore");
    }
    selectItem(node, tab.kind === "item" ? tab.itemId : null, readView(pane.id, tab.id));
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
  const gridStops = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const unique = [];
    for (const value of sorted) {
      if (!unique.length || Math.abs(value - unique[unique.length - 1]) > 0.001) unique.push(value);
    }
    return unique;
  };
  const gridStopIndex = (stops, value) => {
    let best = 0;
    let delta = Infinity;
    for (let i = 0; i < stops.length; i += 1) {
      const diff = Math.abs(stops[i] - value);
      if (diff < delta) {
        delta = diff;
        best = i;
      }
    }
    return best;
  };
  // Single-document CSS Grid projection: map the binary split tree onto flat grid tracks without reparenting panes or Layer 2 iframes.
  const collectSplitLeaves = (node, box, leaves, stage) => {
    if (!node) return;
    if (node.paneId) {
      leaves.push({ paneId: node.paneId, x0: box.x, x1: box.x + box.w, y0: box.y, y1: box.y + box.h });
      return;
    }
    const length = (node.direction === "row" ? stage.width * box.w : stage.height * box.h) / 100;
    const bounds = splitRatioRange(node, length) || [0.15, 0.85];
    const ratio = Math.min(bounds[1], Math.max(bounds[0], clampSplitRatio(node.ratio)));
    const split = panesEl.querySelector('[data-split-id="' + node.id + '"]');
    if (split) {
      Object.assign(split.style, { left: box.x + "%", top: box.y + "%", width: box.w + "%", height: box.h + "%" });
      const sash = split.firstElementChild;
      sash.style.left = node.direction === "row" ? "calc(" + ratio * 100 + "% - " + TAB_SASH_HALF + "px)" : "0";
      sash.style.top = node.direction === "column" ? "calc(" + ratio * 100 + "% - " + TAB_SASH_HALF + "px)" : "0";
      sash.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      sash.setAttribute("aria-valuemin", String(Math.round(bounds[0] * 100)));
      sash.setAttribute("aria-valuemax", String(Math.round(bounds[1] * 100)));
    }
    if (node.direction === "row") {
      collectSplitLeaves(node.children[0], { ...box, w: box.w * ratio }, leaves, stage);
      collectSplitLeaves(node.children[1], { ...box, x: box.x + box.w * ratio, w: box.w * (1 - ratio) }, leaves, stage);
    } else {
      collectSplitLeaves(node.children[0], { ...box, h: box.h * ratio }, leaves, stage);
      collectSplitLeaves(node.children[1], { ...box, y: box.y + box.h * ratio, h: box.h * (1 - ratio) }, leaves, stage);
    }
  };
  const syncSplitSizes = (node) => {
    const stage = panesEl.getBoundingClientRect();
    const leaves = [];
    collectSplitLeaves(node, { x: 0, y: 0, w: 100, h: 100 }, leaves, stage);
    if (!leaves.length) return;
    const xs = gridStops([0, 100, ...leaves.flatMap((leaf) => [leaf.x0, leaf.x1])]);
    const ys = gridStops([0, 100, ...leaves.flatMap((leaf) => [leaf.y0, leaf.y1])]);
    panesEl.style.gridTemplateColumns = xs.slice(1).map((v, i) => "minmax(0, " + Math.max(0.01, v - xs[i]).toFixed(4) + "fr)").join(" ");
    panesEl.style.gridTemplateRows = ys.slice(1).map((v, i) => "minmax(0, " + Math.max(0.01, v - ys[i]).toFixed(4) + "fr)").join(" ");
    for (const leaf of leaves) {
      const pane = panesEl.querySelector('[data-tab-pane="' + leaf.paneId + '"]');
      if (!pane) continue;
      pane.style.gridColumn = (gridStopIndex(xs, leaf.x0) + 1) + " / " + (gridStopIndex(xs, leaf.x1) + 1);
      pane.style.gridRow = (gridStopIndex(ys, leaf.y0) + 1) + " / " + (gridStopIndex(ys, leaf.y1) + 1);
      pane.style.marginLeft = leaf.x0 > 0.01 ? TAB_SASH_INSET + "px" : "0";
      pane.style.marginRight = leaf.x1 < 99.99 ? TAB_SASH_INSET + "px" : "0";
      pane.style.marginTop = leaf.y0 > 0.01 ? TAB_SASH_INSET + "px" : "0";
      pane.style.marginBottom = leaf.y1 < 99.99 ? TAB_SASH_INSET + "px" : "0";
    }
  };
  // Splits that cannot all keep their panes' minimum size at this stage size take the narrow layout (VUX-24), not a squeeze.
  // 独看 (口径 2) lays the focused pane over the whole stage; the others keep their places, hidden (data-solo).
  const layoutSplits = () => {
    syncSplitSizes(state.solo && !ops.soloSide(state) ? { paneId: state.solo.paneId } : state.layout.tree);
    const stage = panesEl.getBoundingClientRect();
    if (stage.width && stage.height) root.toggleAttribute("data-split-narrow", !state.solo && !splitTreeFits(state.layout.tree, stage.width, stage.height));
  };
  const paneFrameKey = (pane) => {
    const tab = pane.tabs.find((item) => item.id === pane.activeTabId);
    if (tab) return tab.kind === "system" ? null : tab.id;
    return pane.id + ":view";
  };
  const apply = () => {
    if (applying) { applyQueued = true; return; }
    applying = true;
    const keepFrame = false;
    try {
    if (state.exclusive) {
      root.dataset.exclusive = state.exclusive;
      if (!embedded) document.title = coverLabel(state.exclusive) + " · Molis Work";
      if (!embedded && titlebarStrip) {
        // Covers hide the pane strips. Their name and close button belong in the titlebar.
        const coveredPane = ops.focused(state);
        titlebarStrip.hidden = false;
        titlebarStrip.dataset.chromePane = coveredPane.id;
        renderStrip(coveredPane, titlebarStrip);
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
    const wasExclusive = root.hasAttribute("data-exclusive");
    root.removeAttribute("data-exclusive");
    if (exclusiveEl) {
      exclusiveEl.hidden = true;
      [...exclusiveEl.children].forEach((child) => pool.append(child));
    }
    // However the cover went away (a tab, the Dock, history), its category column goes with it.
    leaveCoverDirectory();
    ops.normalizeLayout(state);
    // 独看 ends once the focus goes to another column or the right side opens (or, alone itself, collapses); the side it
    // collapsed comes back. The right side alone covers the main stage from the body (the side panel is outside the stage).
    if (state.solo) { ops.settleSolo(state, column === "side"); if (!state.solo) sidePane?.restore(); }
    root.toggleAttribute("data-solo", Boolean(state.solo) && !ops.soloSide(state));
    if (!embedded) {
      document.body.toggleAttribute("data-side-solo", ops.soloSide(state));
      // The right side alone says so at the end of its own strip, with the way back (the main strips draw theirs in renderStrip).
      let chip = document.querySelector("[data-side-solo-chip]");
      if (!ops.soloSide(state)) chip?.remove();
      else if (!chip) { chip = stripButton("tab-solo-chip side-solo-chip", "maximize", globalThis.t.text("workbench.tab-workspace-panes.one-pane-show-all"), { sideSoloChip: "" }); chip.addEventListener("click", () => { toggleSolo(); apply(); persist(); }); document.querySelector("[data-side-tabs]")?.before(chip); }
    }
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
    // A pane with no tab chosen and no plugin page shows the project home (§4.6.1, 口径 3): it is a place, not a tab.
    const focusedView = ops.focused(state)?.viewPlugin || (focusedTab ? null : "home");
    if (focusedTab && focusedTab.kind !== "system") {
      const surface = focusedTab.plugin;
      if (getSurface() !== surface) setWorkSurface(surface, false, false, "restore");
      if (!["settings", "project-settings"].includes(document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory)) {
        setDirectory(directoryOf(focusedTab.plugin), false, false);
      }
      if (focusedTab.plugin === "goals" && focusedTab.kind === "item" && !embedded && state.panes.length > 1) applySelection?.(focusedTab.itemId);
      document.title = tabLabel(focusedTab) + " · Molis Work";
    } else if (focusedView) {
      const surface = focusedView;
      if (getSurface() !== surface) setWorkSurface(surface, false, false, "restore");
      if (!["settings", "project-settings"].includes(document.querySelector("#goal-tree-pane")?.dataset.desktopDirectory)) {
        setDirectory(directoryOf(focusedView), false, false);
      }
      document.title = (focusedView === "home" ? globalThis.t.text(personal ? "workbench.tab-workspace-panes.personal-home" : "workbench.tab-workspace-panes.project-home") : ops.pluginTitle(focusedView)) + " · Molis Work";
    }
    // Surfaces stay where they are while they keep showing: moving a node out and back drops its scroll and focus.
    // Hidden isolated pages stay attached: reparenting an iframe reloads its browsing context.
    const mountedNow = new Set();

    const removedCanonicalIds = new Set();
    panesEl.querySelectorAll("[data-tab-pane]").forEach((section) => {
      if (state.panes.some((pane) => pane.id === section.dataset.tabPane)) return;
      section.querySelectorAll(":scope > [data-tab-pane-body] > [data-pane-clone]").forEach((child) => disposeClone(child));
      section.querySelectorAll(":scope > [data-tab-pane-body] > :not([data-pane-clone])").forEach((child) => {
        if (child.matches('[data-work-surface="home"]')) {
          child.hidden = true;
          delete child.dataset.paneTab;
          delete child.dataset.paneKey;
          pool.append(child);
          return;
        }
        if (!child.querySelector(":scope > iframe[data-plugin-frame]")) {
          child.hidden = true;
          delete child.dataset.paneTab;
          delete child.dataset.paneKey;
          pool.append(child);
        } else if (child.dataset.workSurface) {
          removedCanonicalIds.add(child.dataset.workSurface);
        }
      });
      section.remove();
    });
    promoteSurvivingClones(removedCanonicalIds);
    prunePaneClones();
    // Create missing pane sections in state.panes order so DOM/Tab order stays stable across reloads,
    // then mount surfaces for already-populated panes first so splitting never steals a live surface.
    const populatedPanes = new Set(
      [...panesEl.querySelectorAll("[data-tab-pane]")]
        .filter((el) => el.querySelector("[data-tab-pane-body] > *"))
        .map((el) => el.dataset.tabPane),
    );
    state.panes.forEach((pane) => {
      if (panesEl.querySelector('[data-tab-pane="' + pane.id + '"]')) return;
      const section = document.createElement("section");
      section.className = "tab-pane";
      section.dataset.tabPane = pane.id;
      section.innerHTML = paneMarkup();
      panesEl.append(section);
    });
    const orderedPanes = [...state.panes].sort((a, b) => {
      const aExists = populatedPanes.has(a.id);
      const bExists = populatedPanes.has(b.id);
      if (aExists !== bExists) return aExists ? -1 : 1;
      return a.id === state.focusedPaneId ? -1 : b.id === state.focusedPaneId ? 1 : 0;
    });
    orderedPanes.forEach((pane) => {
      const section = panesEl.querySelector('[data-tab-pane="' + pane.id + '"]');
      if (!section) return;
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
      const viewPlugin = tab ? null : pane.viewPlugin || "home";
      const frameKey = paneFrameKey(pane);
      const paneKey = tab ? ops.tabKey(tab) : "plugin:" + viewPlugin;
      const body = section.querySelector("[data-tab-pane-body]");
      // A tab whose record is gone shows why and the way out instead of its plugin's page (design README, shared part 7).
      const gone = Boolean(tab) && goneRecord(tab);
      const node = gone ? null : resolvePaneNode(pane, body, tab, viewPlugin, frameKey, paneKey, mountedNow);
      const shownPlugin = tab ? (tab.kind === "system" ? "" : tab.plugin) : viewPlugin;
      showRemoved(pane, !node && !gone && shownPlugin && removedPlugin(shownPlugin) ? shownPlugin : null);
      showGone(pane, gone ? tab : null);
      if (node) {
        const returning = node.parentElement === pool;
        const wasMountedHere = node.parentElement === body && !node.hidden;
        const prevPaneKey = node.dataset.paneKey || "";
        const prevView = node.dataset.paneView || "";
        const nextView = readView(pane.id, tab?.id) || "";
        const unchanged = !wasExclusive && wasMountedHere && prevPaneKey === paneKey && prevView === nextView && !(tab?.kind === "item" && node.dataset.expanded === "false");
        mount(pane, node);
        if (frameKey) node.dataset.paneTab = frameKey;
        node.dataset.paneKey = paneKey;
        node.dataset.paneView = nextView;
        node.dataset.shownAt = String(Date.now());
        mountedNow.add(node);
        if (node.matches('[data-work-surface="home"][data-pane-clone]') && !mountedHomeClones.has(node)) {
          const handle = host.mountHomeClone?.(node);
          if (handle) mountedHomeClones.set(node, handle);
        }
        if (node.matches('[data-work-surface="materials"][data-pane-clone]') && !mountedMaterialsClones.has(node)) {
          const handle = host.mountMaterialsClone?.(node);
          if (handle) mountedMaterialsClones.set(node, handle);
        }
        if (tab) {
          if (!unchanged || tab.plugin === "goals") applyTabContent(pane, tab, node, keepFrame);
          else if (pane.id === state.focusedPaneId) declareGoal(null);
          if (returning && surfaceShows.get(tab.plugin) === "tab:" + tab.id) restoreScroll(node);
          if (pane.id === state.focusedPaneId) surfaceShows.set(tab.plugin, "tab:" + tab.id);
        } else if (viewPlugin === "home") {
          if (pane.id === state.focusedPaneId) declareGoal(null);
          if (returning) restoreScroll(node);
          mountedHomeClones.get(node)?.sync?.();
          if (!unchanged) selectItem(node, null, readView(pane.id));
        } else {
          const isClone = node.hasAttribute("data-pane-clone");
          if (isFramedSurface(viewPlugin, node)) {
            node.dataset.paneSearch = buildPaneSearch(pane, null, viewPlugin, isClone);
            host.prepareSurface?.(node, "restore");
          }
          if (isClone && viewPlugin === "goals") {
            prepareGoalCanvasClone(node);
          } else if (isClone && viewPlugin === "artifacts") {
            void loadArtifactClone(node, null);
          } else {
            // A plugin page keeps what was open in it. It goes back to its list only after showing one of its tabs,
            // whose item is not the page's, or when asked to (the plugin tab, the plugin's own back).
            const shown = surfaceShows.get(viewPlugin);
            if (pane.id === state.focusedPaneId) surfaceShows.set(viewPlugin, "page");
            if (shown === "page") { if (returning) restoreScroll(node); }
            else if (!isClone && !unchanged) {
              applyPluginDefault(viewPlugin, node);
              // First showing since the page loaded: reopen what was open before the reload.
              // A walk through history decides the record itself; otherwise returning from a tab shows the list.
              if (shown === undefined) reopenRecord(viewPlugin); else if (!historyLock) forgetRecord(viewPlugin);
            }
            if (!unchanged) selectItem(node, null, readView(pane.id));
          }
        }
      }
    });
    collectMounted().forEach((node) => {
      if (mountedNow.has(node) || node.parentElement === pool) return;
      rememberScroll(node);
      if (node.querySelector("iframe[data-plugin-frame]")) {
        node.hidden = true;
      } else if (node.hasAttribute("data-pane-clone")) {
        const ownerPane = paneById(node.closest("[data-tab-pane]")?.dataset.tabPane);
        if (state.panes.length < 2 || !ownerPane || node.dataset.paneTab === paneFrameKey(ownerPane)) {
          disposeClone(node);
        } else {
          node.hidden = true;
        }
      } else {
        node.hidden = true;
        delete node.dataset.paneTab;
        delete node.dataset.paneKey;
        pool.append(node);
      }
    });
    const treeSignature = JSON.stringify(state.layout.tree, (key, value) => key === "ratio" ? undefined : value);
    if (panesEl.dataset.treeSignature !== treeSignature) {
      panesEl.querySelectorAll("[data-split-id]").forEach((node) => node.remove());
      const renderSashes = (tree) => {
        if (tree.paneId) return;
        const split = document.createElement("div");
        split.className = "tab-split";
        split.dataset.splitId = tree.id;
        split.dataset.direction = tree.direction;
        const sash = document.createElement("div");
        sash.className = "tab-sash";
        sash.dataset.tabSash = tree.id;
        sash.role = "separator";
        sash.tabIndex = 0;
        sash.setAttribute("aria-label", globalThis.t.text("workbench.tab-workspace-panes.resize-split-panes"));
        sash.setAttribute("aria-orientation", tree.direction === "row" ? "vertical" : "horizontal");
        const handle = document.createElement("span");
        handle.className = "tab-sash-handle";
        handle.setAttribute("aria-hidden", "true");
        handle.innerHTML = '<svg aria-hidden="true"><use href="#icon-grip"></use></svg>';
        sash.append(handle);
        split.append(sash);
        panesEl.append(split);
        tree.children.forEach(renderSashes);
      };
      renderSashes(state.layout.tree);
      panesEl.dataset.treeSignature = treeSignature;
    }
    layoutSplits();
    if (embedded) setMobileView("document");
    } finally {
      applying = false;
      rememberTab(ops.focused(state));
      announcePlace();
      systemTabs.sync();
      if (!embedded) markFocus();
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
