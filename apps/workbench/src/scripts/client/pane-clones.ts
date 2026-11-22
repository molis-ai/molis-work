/**
 * Single-document multi-pane surface cloning and template management (102-1).
 * Keeps live Layer 2 plugin iframes (`iframe[data-plugin-frame]`) attached to their owning `[data-tab-pane-body]`
 * without reparenting, while letting 2+ CSS Grid split panes host independent instances of framed plugins,
 * plugins that draw their own pages (their page client's paneRoot and paneTemplates), Home, and Artifacts in one top workbench document.
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
      if (surface.closest("[data-surface-host]")) return;
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
    // A plugin that draws its own page hands over the copies a pane starts from (page client paneTemplates).
    (pageClients?.() || []).forEach((page) => {
      const own = page.surface && page.paneTemplates?.();
      if (!own) return;
      Object.entries(own).forEach(([key, copy]) => {
        const id = "__page:" + page.surface + ":" + key;
        if (!copy || surfaceTemplates.has(id)) return;
        stripDuplicateIds(copy);
        copy.hidden = true;
        surfaceTemplates.set(id, copy);
      });
    });
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
    && !pageClient?.(plugin)?.paneRoot
    && (canonical?.hasAttribute("data-deferred-surface")
      || canonical?.dataset.pluginClient
      || canonical?.dataset.installedPlugin
      || canonical?.querySelector("iframe[data-plugin-frame]")
      || surfaceTemplates.has(plugin)),
  );
  const buildPaneSearch = (pane, tab, viewPlugin, isClone = false) => {
    const params = new URLSearchParams(isClone ? "" : location.search);
    params.set("workbenchPane", pane.id);
    params.set("panePlugin", tab?.plugin || viewPlugin || "home");
    if (tab?.kind === "item" && tab.itemId) params.set("paneItem", tab.itemId);
    else params.delete("paneItem");
    const view = readView(pane.id, tab?.id);
    if (view !== undefined) params.set("paneView", view);
    else params.delete("paneView");
    return "?" + params.toString();
  };
  const dropRemovedTemplates = (gone) => {
    if (!Array.isArray(gone) || !gone.length) return;
    const removed = new Set(gone);
    surfaceTemplates.forEach((tpl, id) => {
      if (removed.has(id) || [...removed].some((plugin) => id.startsWith("__page:" + plugin + ":")) || (tpl.dataset?.pluginClient && removed.has(tpl.dataset.pluginClient))) {
        surfaceTemplates.delete(id);
      }
    });
    panesEl.querySelectorAll("[data-work-surface][data-pane-clone]").forEach((el) => {
      const id = el.dataset.workSurface;
      if ((id && removed.has(id)) || (el.dataset.pluginClient && removed.has(el.dataset.pluginClient))) {
        disposeClone(el);
      }
    });
  };
  const promoteSurvivingClones = (removedCanonicalIds) => {
    const livePlugins = new Set();
    document.querySelectorAll("[data-work-surface]:not([data-pane-clone])").forEach((el) => {
      if (!el.closest("[data-surface-host]") && el.dataset.workSurface) livePlugins.add(el.dataset.workSurface);
    });
    panesEl.querySelectorAll("[data-work-surface][data-pane-clone]").forEach((el) => {
      const id = el.dataset.workSurface;
      if (id && !livePlugins.has(id) && !removedPlugin(id)) {
        el.removeAttribute("data-pane-clone");
        livePlugins.add(id);
      }
    });
    if (removedCanonicalIds?.size) {
      removedCanonicalIds.forEach((id) => {
        if (id.startsWith("__") || livePlugins.has(id) || removedPlugin(id)) return;
        const tpl = surfaceTemplates.get(id);
        if (!tpl) return;
        const restored = tpl.cloneNode(true);
        restored.hidden = true;
        pool.append(restored);
        livePlugins.add(id);
      });
    }
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
  const resolvePaneNode = (pane, body, tab, viewPlugin, frameKey, paneKey, claimed) => {
    if (tab?.kind === "system") return systemTabs.root(tab);
    const plugin = tab ? tab.plugin : viewPlugin;
    if (!plugin) return null;
    // A plugin that draws its own page names the page a pane shows for this tab and how a pane copies it (page client paneRoot).
    const own = pageClient?.(plugin)?.paneRoot?.(tab || null);
    if (own) {
      const children = body ? [...body.children] : [];
      const existing = children.find((el) => el.matches(own.matches) && el.dataset.paneTab === frameKey && !claimed.has(el))
        || (!own.perTab && state.panes.length < 2 ? children.find((el) => el.matches(own.matches) && !claimed.has(el)) : null);
      if (existing) return existing;
      const primary = own.primary || null;
      if (own.perTab) {
        // One page per tab: the page itself serves this pane unless another pane, or another tab here, holds it.
        const heldElsewhere = primary && primary.parentElement !== pool && primary.parentElement !== body && Boolean(primary.closest("[data-tab-pane]"));
        const heldByOtherTab = primary && primary.parentElement === body && primary.dataset.paneTab && primary.dataset.paneTab !== frameKey && pane.tabs.some((item) => item.id === primary.dataset.paneTab);
        if (primary && !claimed.has(primary) && (!heldElsewhere || state.panes.length < 2) && !heldByOtherTab) return primary;
      } else if (primary && !claimed.has(primary) && (primary.parentElement === pool || primary.parentElement === body || !primary.closest("[data-tab-pane]") || state.panes.length < 2)) return primary;
      const tpl = surfaceTemplates.get("__page:" + plugin + ":" + own.template);
      if (!tpl) return primary;
      const clone = tpl.cloneNode(true);
      clone.setAttribute("data-pane-clone", "true");
      clone.dataset.paneTab = frameKey || "";
      clone.dataset.paneKey = paneKey;
      Object.entries(own.mark || {}).forEach(([key, value]) => { clone.dataset[key] = value; });
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
