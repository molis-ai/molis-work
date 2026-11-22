import { TAB_WORKSPACE_FACTORY_SCRIPT } from "./tab-workspace.js";
import { pluginPageClientScript } from "../../plugin-workbench.js";

/**
 * AP3 Workbench client segment: editing-graph. The shell's own form, toast, pane and workspace-mode helpers, then the page
 * clients of the plugins whose page the shell draws (specs/page-client-lifecycle) and the tab workspace.
 */
export const CLIENT_EDITING_GRAPH_SCRIPT = `
    const requireFormFacts = (form, errorBox) => {
      const invalid = [...form.querySelectorAll("[required]")].find((control) => {
        if (control.type === "checkbox" || control.type === "radio") return !control.checked;
        return !String(control.value || "").trim();
      });
      if (!invalid) return false;
      let disclosure = invalid.closest("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest("details");
      }
      form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
      invalid.setAttribute("aria-invalid", "true");
      const label = invalid.closest("label")?.querySelector(":scope > span")?.textContent?.trim() || globalThis.t.text("workbench.editing-graph.required-information");
      errorBox.textContent = globalThis.t.text("workbench.editing-graph.complete-field-first-label", { label });
      errorBox.hidden = false;
      requestAnimationFrame(() => invalid.focus());
      return true;
    };

    const showToast = (message, errorOrOpts = false, action = null) => {
      const opts = typeof errorOrOpts === "object" && errorOrOpts !== null ? errorOrOpts : { tone: errorOrOpts ? "error" : "default" };
      const resolvedAction = action || opts.action || null;
      if (typeof message === "string" && typeof window.molisToast === "function") {
        window.molisToast(message, {
          ...opts,
          ...(resolvedAction && resolvedAction.label && typeof resolvedAction.onClick === "function" ? { action: resolvedAction } : {}),
        });
        return;
      }
      const error = opts.tone === "error";
      const tiers = { short: 2600, normal: 4200, long: 7000 };
      const ms = typeof opts.duration === "number" && Number.isFinite(opts.duration)
        ? Math.min(30_000, Math.max(1200, opts.duration))
        : (opts.duration && tiers[opts.duration]) || (resolvedAction || error ? tiers.long : opts.tone === "warning" ? tiers.normal : tiers.short);
      molisWorkRequest.toast(toast, typeof message === "string" ? undefined : message, typeof message === "string" ? message : undefined, { ms });
      toast.dataset.mwState = error ? "failed" : opts.tone === "warning" ? "waiting" : "done";
      toast.classList.toggle("is-error", error);
      if (resolvedAction && resolvedAction.label && typeof resolvedAction.onClick === "function") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mw-toast__action";
        button.dataset.toastAction = "";
        button.textContent = resolvedAction.label;
        button.addEventListener("click", () => {
          toast.classList.remove("is-visible");
          toast.style.pointerEvents = "";
          resolvedAction.onClick();
        }, { once: true });
        toast.append(button);
        toast.style.pointerEvents = "auto";
      }
    };

    const applyMobilePanePresence = () => {
      if (immersiveNavigation) { immersiveNavigation.syncPresence(); return; }
      const narrow = matchMedia("(max-width: 760px)").matches;
      const view = workspace.dataset.mobileView || "tree";
      const mode = workspace.dataset.workspaceMode;
      if (pages.some((page) => page.presence?.({ narrow, view, mode }))) return;
      const own = pages.map((page) => page.panes?.() || {});
      const documentPane = own.map((panes) => panes.document).find(Boolean) || null;
      const graph = own.map((panes) => panes.graph).find(Boolean) || null;
      const visiblePane = !narrow
        ? null
        : mode === "graph" && view !== "tree"
          ? graph
          : view === "tui"
            ? tuiPane
            : view === "document"
              ? documentPane
              : treePane;
      const panes = [treePane, documentPane, tuiPane, graph].filter(Boolean);
      const active = document.activeElement;
      const shouldMoveFocus = Boolean(active && narrow && visiblePane && panes.some((pane) => pane !== visiblePane && pane.contains(active)));
      panes.forEach((pane) => {
        if (!narrow) {
          pane.removeAttribute("inert");
          return;
        }
        pane.toggleAttribute("inert", pane !== visiblePane);
      });
      if (!shouldMoveFocus || !visiblePane) return;
      if (visiblePane.nodeType === 1) visiblePane.focus({ preventScroll: true });
    };

    const setMobileView = (view) => {
      workspace.dataset.mobileView = view;
      applyMobilePanePresence();
    };

    const syncNavigatorButtons = () => {
      document.querySelectorAll("button[data-navigator-view]").forEach((button) => {
        const active = button.dataset.navigatorView === navigatorView;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
    };
    const setWorkspaceMode = (view, persist = true, preserveMobile = false) => {
      const graph = pages.map((page) => page.graph?.()).find(Boolean) || null;
      const nextMode = view === "graph" && graph
        ? "graph"
        : view === "runtime" && tuiPane
          ? "runtime"
          : "focus";
      navigatorView = nextMode === "graph" ? "graph" : "list";
      treePane.dataset.navigatorView = navigatorView;
      workspace.dataset.navigatorView = navigatorView;
      workspace.dataset.workspaceMode = nextMode;
      workspace.classList.toggle("is-graph-view", nextMode === "graph");
      if (pages.some((page) => page.mode?.(nextMode, { persist, preserveMobile, syncNavigator: syncNavigatorButtons }))) return;
      if (tuiPane) tuiPane.hidden = nextMode !== "runtime";
      syncNavigatorButtons();
      pages.forEach((page) => page.modeShown?.(nextMode));
      if (matchMedia("(max-width: 760px)").matches) {
        if (!preserveMobile) setMobileView(nextMode === "runtime" ? "tui" : "document");
      } else applyMobilePanePresence();
      if (persist) queueSave();
    };

    const pageHost = {
      workspace, directoryPane: treePane, terminalPane: tuiPane, route, translate: readText, showToast, requireFormFacts,
      isAbortError: (...args) => isAbortError(...args),
      lifetime: () => pageLifetime, getSurface: () => activeDesktopSurface,
      setWorkSurface: (...args) => setDesktopWorkSurface(...args), setDirectory: (...args) => setDesktopDirectory(...args),
      setDirectoryCollapsed: (...args) => setDirectoryCollapsed(...args),
      setWorkspaceMode, setMobileView, applyMobilePanePresence,
      tabs: () => tabWorkspace, immersive: () => immersiveNavigation, frameAssets: () => deferredClients.frameAssets(),
      revealDeepLinkTarget: (...args) => revealDeepLinkTarget(...args), revealDeepLinkFromId: (...args) => revealDeepLinkFromId(...args),
      queueSave, saveUiState: () => saveUiState(), readUiState: () => readUiState(), applyUiState: (ui) => applyUiState(ui),
      restoreDisclosures: (...args) => restoreDisclosures(...args),
      searchBusy: () => globalSearchPalette?.isBusy?.() || Date.now() < searchBusyUntil, searchQuietAt: () => searchBusyUntil,
      pageChanged: () => { projectHome?.sync(); projectPositions?.invalidate(); },
      localPathname, uiStorageKey, navigationVersion: desktopNavigationStateVersion,
      openEntryItem: (...args) => openDirectorySurface(...args), surfaceScroll: (surface) => desktopSurfaceScroll[surface],
    };
    for (const [plugin, factory] of ${pluginPageClientScript()}) {
      try {
        const page = factory(pageHost);
        if (page) pages.push(page);
      } catch (error) {
        console.warn("Molis Work page client failed to start", plugin, error);
      }
    }
    uiScope = pages.map((page) => page.uiScope?.()).find(Boolean) || "current";
    storageKey = uiStorageKey + ":" + uiScope;
    try {
      tabWorkspace = (${TAB_WORKSPACE_FACTORY_SCRIPT})({
        prepareSurface: (surface, intent) => deferredClients?.prepare(surface, intent),
        refreshHome: () => projectHome?.sync(),
        mountHomeClone: (surface) => globalThis.molisWorkHomeView?.mountHome({
          root: surface,
          read: (suffix, body, signal) => molisWorkRequest(route("/api/host/surface-home" + suffix), { method: "POST", body, signal }),
          navigationFrom: (source) => tabWorkspace?.homeNavigationFrom(source) ?? (() => false),
          market: () => tabWorkspace?.setExclusive("market"),
          picker: () => {
            const toggle = document.querySelector("[data-plugin-picker-toggle]");
            const popover = document.querySelector("[data-plugin-picker-popover]");
            if (toggle) { if (popover?.hidden !== false) toggle.click(); }
            else tabWorkspace?.setExclusive("market");
          },
          lead: { adopt: () => null, release: () => {} },
          offers: () => ({ refresh() {}, clear() {} }),
          projectKey: project.project_id || "",
          translate: readText,
          receipt: showToast,
          changed: () => { projectHome?.sync(); projectPositions?.invalidate(); },
          offerApi: (path, method, body, signal) => molisWorkRequest(route(path), { method, body, signal }),
          words: (text, signal) => globalThis.molisWorkSurfaceText?.install(route("/api/ui/locales"), text, signal) ?? Promise.resolve(),
        }),
        discussionObjects: frame => projectPositions?.discussion(frame, (path, body, signal) => molisWorkRequest(path, { body, signal })),
        showToast, paneMessages, route,
        translate: readText,
        getSurface: () => activeDesktopSurface,
        setWorkSurface: (...args) => setDesktopWorkSurface(...args),
        setDirectory: (...args) => setDesktopDirectory(...args),
        setWorkspaceMode: (...args) => setWorkspaceMode(...args),
        setMobileView: (...args) => setMobileView(...args),
        getProjectId: () => project.project_id,
        pageClient: (plugin) => pageFor(plugin),
        pageClients: () => pages,
        declareTab: (tab) => pages.forEach((page) => page.declare?.(tab)),
        openEntry: (plugin, origin) => openSurfaceEntry(plugin, origin),
      });
    } catch (error) {
      console.warn("Molis Work tab workspace failed to start", error);
    }
    /** The desktop shell's entries (Shelf's hotkey, the menu bar) name a plugin; the tab workspace decides where it opens. */
    globalThis.molisWorkOpenPlugin = tabWorkspace?.openPlugin;

`;
