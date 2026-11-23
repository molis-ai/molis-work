import { directoryWidth } from "../../directory-width.js";

/** AP3 Workbench client segment: documents-state. Deep links, the directory and terminal widths, and the saved UI state, with each page client's own part asked by hook (specs/page-client-lifecycle). */
export const CLIENT_DOCUMENTS_STATE_SCRIPT = `    const isAbortError = (error) => error instanceof DOMException && error.name === "AbortError";

    const revealDeepLinkTarget = (target) => {
      let disclosure = target?.matches?.("details") ? target : target?.closest?.("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest?.("details");
      }
      pages.forEach((page) => page.reveal?.(target));
      return target;
    };

    const revealDeepLinkFromId = async (targetId, behavior = "auto") => {
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return null;
      revealDeepLinkTarget(target);
      requestAnimationFrame(() => target.scrollIntoView({ behavior, block: "start" }));
      return target;
    };

    const setTuiWidth = (value, persist = true) => {
      if (!tuiResizer || !workspace.classList.contains("is-desktop-tui")) return;
      const width = Math.round(Math.min(720, Math.max(280, Number(value) || 480)));
      workspace.style.setProperty("--tui-width", width + "px");
      tuiResizer.setAttribute("aria-valuenow", String(width));
      if (persist) queueSave();
    };

    const setTreeWidth = (value, persist = true) => {
      const immersive = document.body.classList.contains("immersive-workbench");
      if (immersive ? matchMedia("(max-width: 600px)").matches : matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui")) return;
      if (!treeResizer) return;
      const { minimum, maximum, width } = (${directoryWidth.toString()})(value, innerWidth, immersive);
      workspace.style.setProperty("--tree-width", width + "px");
      treeResizer.setAttribute("aria-valuemin", String(minimum));
      treeResizer.setAttribute("aria-valuemax", String(maximum));
      treeResizer.setAttribute("aria-valuenow", String(width));
      pages.forEach((page) => page.layout?.());
      if (persist) queueSave();
    };

    const setDirectoryCollapsed = (collapsed, persist = true) => {
      const immersiveDesktop = document.body.classList.contains("immersive-workbench") && !matchMedia("(max-width: 600px)").matches;
      const nextCollapsed = immersiveDesktop ? false : Boolean(collapsed);
      if (nextCollapsed && !workspace.classList.contains("is-directory-collapsed")) {
        const currentWidth = Math.round(treePane?.getBoundingClientRect().width || 0);
        if (currentWidth > 44) workspace.style.setProperty("--tree-width", currentWidth + "px");
      }
      workspace.classList.toggle("is-directory-collapsed", nextCollapsed);
      document.querySelectorAll("[data-directory-toggle]").forEach((button) => {
        button.setAttribute("aria-expanded", String(!nextCollapsed));
        button.setAttribute("aria-label", nextCollapsed ? globalThis.t.text("workbench.documents-state.expand-directory") : globalThis.t.text("workbench.documents-state.collapse-directory"));
        button.setAttribute("title", nextCollapsed ? globalThis.t.text("workbench.documents-state.expand-directory") : globalThis.t.text("workbench.documents-state.collapse-directory"));
      });
      treeResizer?.setAttribute("aria-hidden", String(nextCollapsed));
      immersiveNavigation?.sync();
      pages.forEach((page) => page.layout?.());
      if (persist) queueSave();
    };

    const readUiState = () => {
      return ({
      ...Object.assign({}, ...pages.map((page) => page.readUiState?.() || {})),
      disclosures: [...document.querySelectorAll("[data-persist-open][open]")].map((item) => item.dataset.persistOpen),
      workSurface: activeDesktopSurface,
      surfaceScroll: { ...desktopSurfaceScroll, [activeDesktopSurface]: scrollPaneOf(activeDesktopSurface)?.scrollTop || 0 },
      treeWidth: parseFloat(workspace.style.getPropertyValue("--tree-width")) || (treePane.getBoundingClientRect().width > 44 ? treePane.getBoundingClientRect().width : 240),
      tuiWidth: workspace.classList.contains("is-tui-collapsed")
        ? parseFloat(workspace.style.getPropertyValue("--tui-width")) || undefined
        : tuiPane?.getBoundingClientRect().width,
      mobileView: workspace.dataset.mobileView || "tree",
      navigatorView,
      navigationVersion: desktopNavigationStateVersion,
      directory: treePane?.dataset.desktopDirectory || "root",
      directoryCollapsed: workspace.classList.contains("is-directory-collapsed"),
      });
    };

    const restoreDisclosures = (root, keys) => {
      const open = new Set(keys || []);
      root?.querySelectorAll("[data-persist-open]").forEach(item => { item.open = open.has(item.dataset.persistOpen); });
    };

    const applyUiState = (ui) => {
      desktopSurfaceScroll = ui?.surfaceScroll && typeof ui.surfaceScroll === "object" ? { ...ui.surfaceScroll } : {};
      pages.forEach((page) => page.applyUiState?.(ui, "start", desktopSurfaceScroll));
      const requestedDesktopSurface = ui?.workSurface ? canonicalSurface(ui.workSurface) : "home";
      let nextDesktopSurface = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === requestedDesktopSurface)
        ? requestedDesktopSurface
        : "home";
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
      if (ui?.tuiWidth) setTuiWidth(ui.tuiWidth, false);
      setDirectoryCollapsed(ui?.directoryCollapsed === true, false);
      if (desktopDirectoryPanels.length) {
        const restoredDirectoryRaw = ui?.navigationVersion === desktopNavigationStateVersion
          ? ui?.directory || "root"
          : "root";
        const restoredDirectory = directoryPanelFor(restoredDirectoryRaw);
        setDesktopDirectory(restoredDirectory, false, false);
      }
      pages.forEach((page) => page.applyUiState?.(ui, "tree", desktopSurfaceScroll));
      restoreDisclosures(document, ui?.disclosures);
      pages.forEach((page) => page.applyUiState?.(ui, "filters", desktopSurfaceScroll));
      setWorkspaceMode(ui?.workspaceMode || "graph", false, true);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(nextDesktopSurface, false, false, "restore");
      pages.forEach((page) => page.applyUiState?.(ui, "surface", desktopSurfaceScroll));
      const restoredMobileView = ui?.mobileView === "tui" || ui?.mobileView === "document" || ui?.mobileView === "tree"
        ? ui.mobileView
        : "tree";
      if (matchMedia("(max-width: 760px)").matches) {
        if (restoredMobileView === "tui") setWorkspaceMode("runtime", false, true);
        else if (restoredMobileView === "document" && workspace.dataset.workspaceMode !== "graph") setWorkspaceMode("focus", false, true);
`;
