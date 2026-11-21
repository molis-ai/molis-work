/**
 * Single-document multi-pane surface cloning and template management (102-1).
 * Keeps live Layer 2 plugin iframes (`iframe[data-plugin-frame]`) attached to their owning `[data-tab-pane-body]`
 * without reparenting, while letting 2+ CSS Grid split panes host independent instances of framed plugins,
 * Goals (board/frame/work), Home, and Artifacts in one top workbench document.
 * Joined inside TAB_WORKSPACE_FACTORY_SCRIPT.
 */
export const TAB_WORKSPACE_CLONES_PART = `  const surfaceTemplates = new Map();
  const mountedHomeClones = new WeakMap();
  const artifactCloneRequests = new WeakMap();
  const RUNTIME_SURFACE_ATTRS = ["data-ui-client-state", "data-plugin-page", "data-expanded", "data-assistant-context", "data-preview-tab", "data-preview-view", "data-pane-tab", "data-pane-key", "data-pane-search", "data-pane-clone", "data-shown-at", "aria-busy"];
  const stripDuplicateIds = (rootNode) => {
    if (rootNode.id) rootNode.removeAttribute("id");
    rootNode.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  };
  const makeFramedTemplate = (surface) => {
    const clone = surface.cloneNode(false);
    stripDuplicateIds(clone);
    RUNTIME_SURFACE_ATTRS.forEach((attr) => clone.removeAttribute(attr));
    clone.hidden = true;
    clone.inert = false;
    clone.setAttribute("data-deferred-surface", "");
    surface.querySelectorAll(":scope > script[data-plugin-document], :scope > template[data-deferred-content]").forEach((child) => {
      clone.append(child.cloneNode(true));
    });
    return clone;
  };
  const disposeClone = (node) => {
    if (!node) return;
    mountedHomeClones.get(node)?.dispose?.();
    mountedHomeClones.delete(node);
    artifactCloneRequests.get(node)?.abort();
    artifactCloneRequests.delete(node);
    node.remove();
  };
  const captureSurfaceTemplates = () => {
    document.querySelectorAll("[data-work-surface]:not([data-pane-clone])").forEach((surface) => {
      if (surface.closest("[data-goal-canvas-shell]")) return;
      const id = surface.dataset.workSurface;
      if (!id || surfaceTemplates.has(id)) return;
      if (surface.hasAttribute("data-deferred-surface") || surface.dataset.pluginClient || surface.dataset.installedPlugin || surface.querySelector("iframe[data-plugin-frame]")) {
        surfaceTemplates.set(id, makeFramedTemplate(surface));
      } else if (id === "home" || id === "artifacts" || id === "materials") {
        const copy = surface.cloneNode(true);
        stripDuplicateIds(copy);
        if (id === "home") {
          copy.querySelectorAll("[data-home-groups], [data-home-status], [data-home-lead], [data-home-lead-bar]").forEach((el) => el.replaceChildren());
        }
        copy.hidden = true;
        surfaceTemplates.set(id, copy);
      }
    });
    const goalFrame = document.querySelector("[data-goal-frame-surface]:not([data-pane-clone])");
    if (goalFrame && !surfaceTemplates.has("__goal-frame__")) {
      const copy = goalFrame.cloneNode(true);
      copy.querySelector("[data-frame-picker]")?.remove();
      stripDuplicateIds(copy);
      copy.hidden = true;
      surfaceTemplates.set("__goal-frame__", copy);
    }
    const goalShell = document.querySelector("[data-goal-canvas-shell]:not([data-pane-clone])");
    if (goalShell && !surfaceTemplates.has("__goal-shell__")) {
      const copy = goalShell.cloneNode(true);
      stripDuplicateIds(copy);
      copy.hidden = true;
      surfaceTemplates.set("__goal-shell__", copy);
    }
  };
  captureSurfaceTemplates();
  document.addEventListener("molis-work:language-changed", () => {
    surfaceTemplates.clear();
    captureSurfaceTemplates();
  });
  const isFramedSurface = (plugin, canonical) => Boolean(
    plugin
    && plugin !== "home"
    && plugin !== "artifacts"
    && plugin !== "materials"
    && plugin !== "goals"
    && (canonical?.hasAttribute("data-deferred-surface")
      || canonical?.dataset.pluginClient
      || canonical?.dataset.installedPlugin
      || canonical?.querySelector("iframe[data-plugin-frame]")
      || surfaceTemplates.has(plugin)),
  );
  const buildPaneSearch = (pane, tab, viewPlugin) => {
    const params = new URLSearchParams();
    params.set("workbenchPane", pane.id);
    params.set("panePlugin", tab?.plugin || viewPlugin || "home");
    if (tab?.kind === "item" && tab.itemId) params.set("paneItem", tab.itemId);
    const view = readView(pane.id, tab?.id);
    if (view !== undefined) params.set("paneView", view);
    return "?" + params.toString();
  };
  const promoteSurvivingClones = () => {
    const livePlugins = new Set();
    document.querySelectorAll("[data-work-surface]:not([data-pane-clone])").forEach((el) => {
      if (!el.closest("[data-goal-canvas-shell]") && el.dataset.workSurface) livePlugins.add(el.dataset.workSurface);
    });
    panesEl.querySelectorAll("[data-work-surface][data-pane-clone]").forEach((el) => {
      const id = el.dataset.workSurface;
      if (id && !livePlugins.has(id)) {
        el.removeAttribute("data-pane-clone");
        livePlugins.add(id);
      }
    });
    surfaceTemplates.forEach((tpl, id) => {
      if (id.startsWith("__") || livePlugins.has(id)) return;
      const restored = tpl.cloneNode(true);
      restored.hidden = true;
      pool.append(restored);
      livePlugins.add(id);
    });
  };
  const prunePaneClones = () => {
    const hiddenClones = [];
    panesEl.querySelectorAll("[data-tab-pane]").forEach((section) => {
      const pane = paneById(section.dataset.tabPane);
      const activeKey = pane ? paneFrameKey(pane) : null;
      const activeTab = pane ? pane.tabs.find((item) => item.id === pane.activeTabId) : null;
      const activePaneKey = pane ? (activeTab ? ops.tabKey(activeTab) : "plugin:" + (pane.viewPlugin || "home")) : null;
      const body = section.querySelector("[data-tab-pane-body]");
      if (!pane || !body) return;
      [...body.children].forEach((node) => {
        if (!node.hasAttribute("data-pane-clone")) return;
        const tabKey = node.dataset.paneTab;
        const isViewClone = tabKey === pane.id + ":view";
        const isActive = Boolean(tabKey && tabKey === activeKey && (!isViewClone || node.dataset.paneKey === activePaneKey));
        const kept = isActive || Boolean(tabKey && (pane.tabs.some((item) => item.id === tabKey) || isViewClone));
        if (!kept) {
          disposeClone(node);
          return;
        }
        if (!isActive) hiddenClones.push(node);
      });
    });
    hiddenClones
      .sort((a, b) => Number(b.dataset.shownAt || 0) - Number(a.dataset.shownAt || 0))
      .slice(KEPT_PANE_FRAMES)
      .forEach((node) => disposeClone(node));
  };
  const loadArtifactClone = async (surface, itemId) => {
    const routeFn = typeof host.route === "function" ? host.route : (p) => p;
    const base = routeFn("/artifacts");
    const raw = itemId || base;
    const path = !raw.startsWith(base) && raw.startsWith("/artifacts") ? routeFn(raw) : raw;
    const detail = surface.querySelector("[data-artifact-detail]");
    const directory = surface.querySelector("[data-artifact-directory]");
    if (!detail || !directory) return;
    if (detail.dataset.artifactFragmentPath === path) return;
    artifactCloneRequests.get(surface)?.abort();
    const controller = new AbortController();
    artifactCloneRequests.set(surface, controller);
    try {
      const html = await molisWorkRequest(path, {
        as: "text",
        accept: [404],
        headers: { "x-molis-work-fragment": "artifact-workbench" },
        signal: controller.signal,
      });
      if (artifactCloneRequests.get(surface) !== controller || !surface.isConnected) return;
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      const nextDir = tpl.content.querySelector("[data-artifact-directory]");
      const nextDetail = tpl.content.querySelector("[data-artifact-detail]");
      if (nextDir) directory.replaceChildren(...nextDir.childNodes);
      if (nextDetail) detail.replaceChildren(...nextDetail.childNodes);
      detail.dataset.artifactFragmentPath = path;
      const selected = Boolean(detail.querySelector("[data-artifact-id]"));
      const shellNode = surface.querySelector("[data-artifact-stage-shell]") || surface;
      shellNode.setAttribute("data-expanded", String(selected));
      if (detail.parentElement) detail.parentElement.hidden = !selected;
    } catch { /* Ignore aborted or unreachable artifact fragment load in secondary pane. */ }
  };
  const prepareGoalWorkClone = (shellNode, goalId) => {
    shellNode.dataset.expanded = "true";
    shellNode.querySelectorAll(":scope > [data-goal-stage-list], :scope > [data-goal-momentum], :scope > [data-goal-kanban], :scope > [data-goal-stage-chrome]").forEach((child) => {
      child.hidden = true;
    });
    const work = shellNode.querySelector("[data-goal-node-workspace]");
    const docPane = shellNode.querySelector("[data-document-pane]");
    if (work) {
      work.hidden = false;
      if (!work.dataset.detailsOpen) work.dataset.detailsOpen = "true";
      const item = visibleGoals()?.find((entry) => entry.goal.goal_id === goalId);
      const titleEl = work.querySelector("[data-workspace-goal-title]");
      if (titleEl) titleEl.textContent = item?.goal.title || goalId;
      const statusEl = work.querySelector("[data-workspace-goal-status]");
      const srcStatus = document.querySelector('[data-goal-id="' + CSS.escape(goalId) + '"] .goal-status');
      if (statusEl && srcStatus) {
        statusEl.className = srcStatus.className;
        statusEl.innerHTML = srcStatus.innerHTML;
      }
      const toggle = work.querySelector("[data-goal-details-toggle]");
      if (toggle) toggle.setAttribute("aria-expanded", String(work.dataset.detailsOpen === "true"));
    }
    if (docPane) {
      docPane.hidden = work ? work.dataset.detailsOpen !== "true" : false;
      docPane.dataset.paneGoalId = goalId;
      docPane.setAttribute("data-pane-clone", "true");
      const currentView = docPane.querySelector("[data-goal-view]")?.dataset.goalView;
      if (currentView !== goalId && docPane.dataset.loadingGoalId !== goalId && typeof host.loadGoalDocumentInto === "function") {
        docPane.dataset.loadingGoalId = goalId;
        void host.loadGoalDocumentInto(docPane, goalId).finally(() => {
          if (docPane.dataset.loadingGoalId === goalId) delete docPane.dataset.loadingGoalId;
        });
      }
    }
  };
  const prepareGoalCanvasClone = (shellNode) => {
    shellNode.dataset.expanded = "false";
    shellNode.dataset.boardView = "list";
    const work = shellNode.querySelector("[data-goal-node-workspace]");
    if (work) work.hidden = true;
    const primaryList = document.querySelector("[data-goal-canvas-shell]:not([data-pane-clone]) [data-goal-stage-list]");
    const cloneList = shellNode.querySelector("[data-goal-stage-list]");
    if (primaryList && cloneList) {
      cloneList.hidden = false;
      cloneList.innerHTML = primaryList.innerHTML;
    }
    shellNode.querySelectorAll(":scope > [data-goal-momentum], :scope > [data-goal-kanban], :scope > [data-goal-stage-chrome]").forEach((child) => {
      child.hidden = true;
    });
  };
  const resolvePaneNode = (pane, body, tab, viewPlugin, frameKey, paneKey, claimed) => {
    if (tab?.kind === "system") return systemTabs.root(tab);
    const plugin = tab ? tab.plugin : viewPlugin;
    if (!plugin) return null;
    const isGoalFrame = plugin === "goals" && supportsGoalFrames() && tab?.kind === "item" && tab.view !== "work";
    const isGoalWork = plugin === "goals" && tab?.kind === "item" && (!supportsGoalFrames() || tab.view === "work");
    if (isGoalFrame) {
      const existing = body && (
        [...body.children].find((el) => el.matches("[data-goal-frame-surface]") && el.dataset.paneTab === frameKey && !claimed.has(el))
        || (state.panes.length < 2 ? [...body.children].find((el) => el.matches("[data-goal-frame-surface]") && !claimed.has(el)) : null)
      );
      if (existing) return existing;
      const primary = document.querySelector("[data-goal-frame-surface]:not([data-pane-clone])");
      if (primary && !claimed.has(primary) && (primary.parentElement === pool || primary.parentElement === body || !primary.closest("[data-tab-pane]") || state.panes.length < 2)) return primary;
      const tpl = surfaceTemplates.get("__goal-frame__");
      if (!tpl) return primary;
      const clone = tpl.cloneNode(true);
      clone.setAttribute("data-pane-clone", "true");
      clone.dataset.paneTab = frameKey || "";
      clone.dataset.paneKey = paneKey;
      return clone;
    }
    if (plugin === "goals") {
      const existing = body && [...body.children].find((el) => el.matches("[data-goal-canvas-shell]") && el.dataset.paneTab === frameKey && !claimed.has(el));
      if (existing) return existing;
      const primary = document.querySelector("[data-goal-canvas-shell]:not([data-pane-clone])") || document.querySelector("[data-document-pane]:not([data-pane-clone])");
      const primaryHeldElsewhere = primary && primary.parentElement !== pool && primary.parentElement !== body && Boolean(primary.closest("[data-tab-pane]"));
      const primaryHeldByOtherTab = primary && primary.parentElement === body && primary.dataset.paneTab && primary.dataset.paneTab !== frameKey && pane.tabs.some((item) => item.id === primary.dataset.paneTab);
      if (primary && !claimed.has(primary) && (!primaryHeldElsewhere || state.panes.length < 2) && !primaryHeldByOtherTab) return primary;
      const tpl = surfaceTemplates.get("__goal-shell__");
      if (!tpl) return primary;
      const clone = tpl.cloneNode(true);
      clone.setAttribute("data-pane-clone", "true");
      clone.dataset.paneTab = frameKey || "";
      clone.dataset.paneKey = paneKey;
      if (isGoalWork) clone.dataset.goalWorkClone = "true";
      return clone;
    }
    const canonical = findTopLevelSurface(plugin);
    if (isFramedSurface(plugin, canonical)) {
      const existing = body && (
        [...body.children].find((el) => el.dataset.workSurface === plugin && el.dataset.paneTab === frameKey && !claimed.has(el))
        || (state.panes.length < 2 ? [...body.children].find((el) => el.dataset.workSurface === plugin && !claimed.has(el)) : null)
      );
      if (existing) return existing;
      const canonicalHasLiveFrame = Boolean(canonical?.querySelector("iframe[data-plugin-frame]"));
      const canonicalInOtherPane = Boolean(canonical && canonical.parentElement !== pool && canonical.parentElement !== body && canonical.closest("[data-tab-pane]"));
      const canonicalInThisPaneOtherTab = Boolean(canonical && canonical.parentElement === body && canonical.dataset.paneTab && canonical.dataset.paneTab !== frameKey
        && (pane.tabs.some((item) => item.id === canonical.dataset.paneTab) || canonical.dataset.paneTab === pane.id + ":view"));
      if (canonical && !claimed.has(canonical) && (!canonicalHasLiveFrame || canonical.parentElement === body) && !canonicalInOtherPane && !canonicalInThisPaneOtherTab) {
        return canonical;
      }
      const tpl = surfaceTemplates.get(plugin) || (canonical ? makeFramedTemplate(canonical) : null);
      if (!tpl) return canonical;
      const clone = tpl.cloneNode(true);
      clone.setAttribute("data-pane-clone", "true");
      clone.dataset.paneTab = frameKey || "";
      clone.dataset.paneKey = paneKey;
      return clone;
    }
    const existing = body && [...body.children].find((el) => el.dataset.workSurface === plugin && !claimed.has(el));
    if (existing) return existing;
    if (canonical && !claimed.has(canonical) && (canonical.parentElement === pool || canonical.parentElement === body || !canonical.closest("[data-tab-pane]") || state.panes.length < 2)) {
      return canonical;
    }
    const tpl = surfaceTemplates.get(plugin);
    if (!tpl) return canonical;
    const clone = tpl.cloneNode(true);
    clone.setAttribute("data-pane-clone", "true");
    clone.dataset.paneTab = frameKey || "";
    clone.dataset.paneKey = paneKey;
    return clone;
  };`;
