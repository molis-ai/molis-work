import { OWN_DIRECTORY_SURFACES } from "../../plugin-catalog.js";

/** AP3 Workbench client segment: navigation-surfaces. The shell owns directory and work-surface switching (07-1 口径 11: the name
 * no longer says Feed, which left with FI-6). Plugin business clients live in their registered bundles. */
export const CLIENT_NAVIGATION_SURFACES_SCRIPT = `
    const OWN_DIRECTORY_SURFACES = ${JSON.stringify([...OWN_DIRECTORY_SURFACES])};
    const directoryPanelFor = (directory) => directory;

    const restoreLastGoal = (openGoalsDirectory = false) => {
      let goalId = "";
      try {
        const goalUi = JSON.parse(sessionStorage.getItem(currentGoalUiStorageKey) || sessionStorage.getItem(goalUiStorageKey) || "null");
        goalId = String(goalUi?.selected || "");
        if (openGoalsDirectory) {
          const nextGoalUi = goalUi && typeof goalUi === "object" ? goalUi : {};
          sessionStorage.setItem(currentGoalUiStorageKey, JSON.stringify({
            ...nextGoalUi,
            navigationVersion: desktopNavigationStateVersion,
            directory: "goals",
            workSurface: "goals",
          }));
        }
      } catch {}
      const available = new Set(visibleGoals().map((item) => item.goal.goal_id));
      if (!available.has(goalId)) goalId = state.active_goal_id || "";
      location.assign(globalThis.molisWorkNavigationUrl(goalId ? route("/goals/" + encodeURIComponent(goalId)) : route("/")));
    };

    const setDesktopWorkSurface = (surface, persist = true, restoreScroll = true, intent = "open") => {
      if (!desktopWorkSurfaces.length) return false;
      const nextSurface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === surface);
      if (!nextSurface) {
        if (surface === "goals" && goalData) restoreLastGoal(true);
        return false;
      }
      const surfaceChanged = activeDesktopSurface !== surface;
      // Passive restore must not retry the current failed client.
      if (intent !== "restore" || surfaceChanged || nextSurface.dataset.uiClientState !== "failed") void deferredClients?.prepare(nextSurface);
      if (activeDesktopSurface && surfaceChanged) {
        desktopSurfaceScroll[activeDesktopSurface] = (activeDesktopSurface === "goals" ? documentPane : desktopWorkSurfaces.find(item => item.dataset.workSurface === activeDesktopSurface))?.scrollTop || 0;
        if (activeDesktopSurface === "goals") goalWorkspaceMode = workspace.dataset.workspaceMode || "graph";
      }
      activeDesktopSurface = surface;
      document.body.dataset.desktopSurface = surface;
      if (!tabWorkspace) {
        desktopWorkSurfaces.forEach((candidate) => {
          if (candidate.closest("[data-goal-canvas-shell]")) return;
          candidate.hidden = candidate !== nextSurface;
        });
      }
      document.querySelectorAll("[data-work-surface-open], [data-work-surface-link]").forEach((item) => {
        const active = (item.dataset.workSurfaceOpen || item.dataset.workSurfaceLink) === surface;
        item.classList.toggle("is-current", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      if (surfaceChanged) setWorkspaceMode(surface === "goals" ? goalWorkspaceMode : "focus", false, true);
      immersiveNavigation?.sync();
      const label = nextSurface.dataset.workSurfaceLabel || surface;
      if (goalData) documentPane.setAttribute("aria-label", label);
      requestAnimationFrame(() => {
        const scrollPane = surface === "goals" ? documentPane : nextSurface;
        scrollPane.scrollTop = restoreScroll ? Number(desktopSurfaceScroll[surface] || 0) : 0; if (surfaceChanged && surface === "goals" && activeDesktopSurface === "goals" && !archiveView && !trashView && !visibleGoals().length && !document.querySelector("dialog[open]")) openCreate();
      });
      pluginWorkbench?.open(surface);
      frameContainer?.sync();
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
      if (surface === "sources") {
        tabWorkspace.openPlugin("feed", mode);
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
      if (surface === "goals" && !available) {
        saveUiState();
        restoreLastGoal(true);
        return;
      }
      const directory = surface === "goals" || OWN_DIRECTORY_SURFACES.includes(surface) ? surface : "root";
      const nextDirectory = directory !== "root" && document.querySelector('[data-directory-panel="' + directory + '"]')
        ? directory
        : "root";
      setDesktopDirectory(nextDirectory, true, true, origin);
      const pluginId = origin?.dataset.pluginId;
      if (pluginId && pluginId !== "home" && pluginId !== "market" && nextDirectory !== "root") setDirectoryCollapsed?.(false, false);
      if (!openDirectorySurface(surface, undefined, undefined, clickEvent)) setDesktopWorkSurface(surface, true, true);
      if (surface === "home" && !collectionView && localPathname() !== "/") {
        history.pushState({ workSurface: "home" }, "", route("/"));
      }
      if (matchMedia("(max-width: 760px)").matches) setMobileView(nextDirectory === "root" || surface === "home" || surface === "market" ? "document" : "tree");
    };

    const LIST_PLUGIN_SECTIONS = ["goals", ...OWN_DIRECTORY_SURFACES.filter((id) => id !== "sources")];

    const syncPluginDirectory = (directory) => {
      const empty = directory === "root";
      workspace.classList.toggle("is-plugin-directory-empty", empty);
      const currentSection = directory === "sources" ? "feed" : directory;
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
      const sectionId = id === "sources" ? "feed" : id;
      if (!LIST_PLUGIN_SECTIONS.includes(sectionId)) return;
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
      const feedPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === "feed");
      const sourcesPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === "sources");
      if (feedPanel) feedPanel.hidden = next === "sources";
      if (sourcesPanel) sourcesPanel.hidden = next !== "sources";
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
