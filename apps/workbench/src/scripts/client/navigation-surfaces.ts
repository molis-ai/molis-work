import { OWN_DIRECTORY_SURFACES, pluginSurfaceAliases } from "../../plugin-catalog.js";

/** AP3 Workbench client segment: navigation-surfaces. The shell owns directory and work-surface switching (07-1 口径 11: the name
 * no longer says Feed, which left with FI-6). Plugin business clients live in their registered bundles. */
export const CLIENT_NAVIGATION_SURFACES_SCRIPT = `
    const OWN_DIRECTORY_SURFACES = ${JSON.stringify([...OWN_DIRECTORY_SURFACES])};
    const SURFACE_ALIASES = ${JSON.stringify(pluginSurfaceAliases())};
    const canonicalSurface = (surface) => (Object.hasOwn(SURFACE_ALIASES, surface) ? SURFACE_ALIASES[surface] : surface);
    const directoryPanelFor = (directory) => directory;

    const scrollPaneOf = (surface) => pageFor(surface)?.scrollPane?.() || desktopWorkSurfaces.find(item => item.dataset.workSurface === surface);

    const setDesktopWorkSurface = (surface, persist = true, restoreScroll = true, intent = "open") => {
      if (!desktopWorkSurfaces.length) return false;
      const nextSurface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === surface);
      if (!nextSurface) {
        pageFor(surface)?.open?.();
        return false;
      }
      const surfaceChanged = activeDesktopSurface !== surface;
      // Passive restore must not retry the current failed client.
      if (intent !== "restore" || surfaceChanged || nextSurface.dataset.uiClientState !== "failed") void deferredClients?.prepare(nextSurface);
      if (activeDesktopSurface && surfaceChanged) {
        desktopSurfaceScroll[activeDesktopSurface] = scrollPaneOf(activeDesktopSurface)?.scrollTop || 0;
        pageFor(activeDesktopSurface)?.hidden?.();
      }
      activeDesktopSurface = surface;
      document.body.dataset.desktopSurface = surface;
      if (!tabWorkspace) {
        desktopWorkSurfaces.forEach((candidate) => {
          if (candidate.closest("[data-surface-host]")) return;
          candidate.hidden = candidate !== nextSurface;
        });
      }
      document.querySelectorAll("[data-work-surface-open], [data-work-surface-link]").forEach((item) => {
        const active = (item.dataset.workSurfaceOpen || item.dataset.workSurfaceLink) === surface;
        item.classList.toggle("is-current", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      if (surfaceChanged) setWorkspaceMode(pageFor(surface)?.workspaceMode?.() || "focus", false, true);
      immersiveNavigation?.sync();
      const label = nextSurface.dataset.workSurfaceLabel || surface;
      pages.forEach((page) => page.scrollPane?.()?.setAttribute("aria-label", label));
      requestAnimationFrame(() => {
        const scrollPane = pageFor(surface)?.scrollPane?.() || nextSurface;
        scrollPane.scrollTop = restoreScroll ? Number(desktopSurfaceScroll[surface] || 0) : 0;
        if (surfaceChanged && activeDesktopSurface === surface) pageFor(surface)?.shown?.();
      });
      pluginWorkbench?.open(surface);
      pages.forEach((page) => page.surfaceSet?.());
      if (persist) queueSave();
      return true;
    };

    const directoryTabMode = () => "commit";
    let lastDirectoryOpen = { key: "", at: 0 };
    const openWorkbenchSurface = (surface, itemId, title, mode = "commit") => {
      if (!tabWorkspace) return false;
      if (surface === "market") {
        tabWorkspace.setExclusive(surface);
        return true;
      }
      if (Object.hasOwn(SURFACE_ALIASES, surface)) {
        tabWorkspace.openPlugin(SURFACE_ALIASES[surface], mode);
        return true;
      }
      if (itemId) tabWorkspace.openItem(surface, itemId, title, undefined, mode);
      else tabWorkspace.openPlugin(surface, mode);
      return true;
    };
    const openDirectorySurface = (surface, itemId, title, clickEvent) => {
      const plugin = surface;
      const key = itemId ? plugin + ":item:" + itemId : plugin + ":view";
      const detail = Number(clickEvent?.detail || 0);
      if (detail > 1 && lastDirectoryOpen.key === key) return true;
      lastDirectoryOpen = { key, at: Date.now() };
      return openWorkbenchSurface(surface, itemId, title, directoryTabMode());
    };

    /* Opening a plugin's place from any entry (the switcher, the Dock, a strip's plugin tab, ?openSurface=) is this one call, so
       no entry presses another's button (specs/product-flow-governance §4.6.2, 口径 8). The origin is the switcher's entry for it,
       when there is one: its place in the directory decides whether the directory column opens. */
    const openSurfaceEntry = (surface, origin = null, clickEvent) => {
      const available = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface);
      if (!available && pageFor(surface)?.open) {
        saveUiState();
        pageFor(surface).open();
        return;
      }
      const directory = pageFor(surface) || OWN_DIRECTORY_SURFACES.includes(surface) ? surface : "root";
      const nextDirectory = directory !== "root" && document.querySelector('[data-directory-panel="' + directory + '"]')
        ? directory
        : "root";
      setDesktopDirectory(nextDirectory, true, true, origin);
      const pluginId = origin?.dataset.pluginId;
      if (pluginId && pluginId !== "home" && pluginId !== "market" && nextDirectory !== "root") setDirectoryCollapsed?.(false, false);
      if (!openDirectorySurface(surface, undefined, undefined, clickEvent)) setDesktopWorkSurface(surface, true, true);
      if (surface === "home" && uiScope === "current" && localPathname() !== "/") {
        history.pushState({ workSurface: "home" }, "", route("/"));
      }
      if (matchMedia("(max-width: 760px)").matches) setMobileView(nextDirectory === "root" || surface === "home" || surface === "market" ? "document" : "tree");
    };

    const listPluginSections = () => [...new Set([...pages.map((page) => page.surface), ...OWN_DIRECTORY_SURFACES.filter((id) => !Object.hasOwn(SURFACE_ALIASES, id))])];

    const syncPluginDirectory = (directory) => {
      const empty = directory === "root";
      workspace.classList.toggle("is-plugin-directory-empty", empty);
      const currentSection = canonicalSurface(directory);
      document.querySelectorAll("[data-plugin-section]").forEach((section) => {
        const show = !empty && section.dataset.pluginSection === currentSection;
        section.hidden = !show;
        if (show) {
          section.classList.add("is-expanded");
          section.dataset.pluginExpanded = "true";
        }
      });
    };

    const setPluginSectionExpanded = (id) => {
      const sectionId = canonicalSurface(id);
      if (!listPluginSections().includes(sectionId)) return;
      setDirectoryCollapsed?.(false, false);
      setDesktopDirectory(sectionId, true, false);
    };

    const setDesktopDirectory = (directory, persist = true, focusTarget = true, origin = null) => {
      if (!desktopDirectoryPanels.length || !treePane?.dataset.desktopDirectory) return;
      directory = directoryPanelFor(directory);
      const available = new Set(desktopDirectoryPanels.map((panel) => panel.dataset.directoryPanel));
      const next = available.has(directory) || directory === "root" ? directory : "root";
      const current = treePane.dataset.desktopDirectory;
      if (current === "root" && next !== "root" && origin?.closest?.('[data-directory-panel="root"]')) {
        desktopDirectoryOrigin = origin;
      }
      treePane.dataset.desktopDirectory = next;
      for (const [alias, owner] of Object.entries(SURFACE_ALIASES)) {
        const ownerPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === owner);
        const aliasPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === alias);
        if (ownerPanel) ownerPanel.hidden = next === alias;
        if (aliasPanel) aliasPanel.hidden = next !== alias;
      }
      syncPluginDirectory(next);
      if (next === "settings" || next === "project-settings" || (persist && origin?.closest?.("[data-plugin-strip]") && next !== "root")) {
        setDirectoryCollapsed?.(false, false);
        const storedWidth = parseFloat(workspace.style.getPropertyValue("--tree-width")) || 0;
        if (storedWidth > 0 && storedWidth < 200) workspace.style.setProperty("--tree-width", "240px");
      }
      immersiveNavigation?.sync();
      if (focusTarget) {
        requestAnimationFrame(() => {
          const nextFocus = origin?.closest?.("[data-plugin-strip]")
            ? origin
            : next === "root" && desktopDirectoryOrigin?.isConnected
            ? desktopDirectoryOrigin
            : origin;
          nextFocus?.focus?.();
        });
      }
      if (persist) queueSave();
    };

`;
