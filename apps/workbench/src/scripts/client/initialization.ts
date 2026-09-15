import { PROJECT_HOME_FACTORY_SCRIPT } from "./project-home.js";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "./plugin-workbench.js";
import { IMMERSIVE_NAVIGATION_FACTORY_SCRIPT } from "./immersive-navigation.js";
import { GLOBAL_SEARCH_FACTORY_SCRIPT } from "./global-search.js";
/** AP3 Workbench client segment: initialization. */
export const CLIENT_INITIALIZATION_SCRIPT = `    });

    immersiveNavigation = (${IMMERSIVE_NAVIGATION_FACTORY_SCRIPT})({
      workspace, treePane, documentPane, getSelected: () => selected, getState: () => state,
      getSurface: () => activeDesktopSurface, translate: L,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setWorkSurface: (...args) => setDesktopWorkSurface(...args),
      setDirectoryCollapsed: (...args) => setDirectoryCollapsed(...args),
      setWorkspaceMode: (...args) => setWorkspaceMode(...args),
      setMobileView: (...args) => setMobileView(...args), queueSave: () => queueSave(),
      saveUiState: () => saveUiState(),
    });
    pluginWorkbench = (${PLUGIN_WORKBENCH_FACTORY_SCRIPT})({
      route, translate: L, projectId: state.project?.project_id,
      setSurface: surface => { setDesktopDirectory("artifacts", false, false); setDesktopWorkSurface(surface); },
      openTabItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      saveUiState, setMobileView,
    });
    globalSearchPalette = (${GLOBAL_SEARCH_FACTORY_SCRIPT})({
      translate: L,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setWorkSurface: (...args) => setDesktopWorkSurface(...args),
      selectGoal: (...args) => selectGoal(...args),
      setMobileView: (...args) => setMobileView(...args),
      noteSearchActivity: (...args) => noteSearchActivity(...args),
      openTabItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
    });
    projectHome = (${PROJECT_HOME_FACTORY_SCRIPT})({ getState: () => state, translate: L });
    bindGoalCreateEvents();
    addEventListener("popstate", (event) => {
      if (projectSettingsStage?.parse(localPathname())) return;
      if (localPathname() === "/" && !decisionView && !collectionView) {
        setDesktopDirectory("root", false, false);
        if (!openWorkbenchSurface("home")) setDesktopWorkSurface("home");
      } else handleGoalPopState(event);
    });
    addEventListener("hashchange", handleGoalHashChange);
    addEventListener("pagehide", saveUiState);
    addEventListener("keydown", (event) => {
      if (globalSearchPalette?.handleKeyboard(event)) return;
      if (handleGoalWorkTabKeyboard(event)) return;
      const currentFocusSection = event.target?.closest?.("[data-focus-section-trigger]:not([data-goal-factor-tab])");
      if (currentFocusSection && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const triggers = [...currentFocusSection.closest("[data-focus-section-deck]").querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card] > [data-focus-section-trigger]")];
        const currentIndex = triggers.indexOf(currentFocusSection);
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? triggers.length - 1
            : (currentIndex + direction + triggers.length) % triggers.length;
        event.preventDefault();
        const nextTrigger = triggers[nextIndex];
        activateFocusSection(nextTrigger);
        nextTrigger.focus();
        return;
      }
      if (handleGoalFactorKeyboard(event)) return;
      if (handleMobileSwitchKeyboard(event)) return;
      if (handleTreeKeyboard(event)) return;
      if (event.key === "Escape" && !feedFilterPanel?.hidden) {
        event.preventDefault();
        setFeedFilterOpen(false);
        feedFilterTrigger?.focus();
        return;
      }
      handleGoalDialogEscape(event);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshBoard();
    });
    addEventListener("resize", () => {
      const nextCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;
      if (nextCompanionActive && !desktopCompanionActive) {
        const mode = workspace.dataset.workspaceMode;
        if (mode === "runtime") setMobileView("tui");
        else if (mode === "graph") setMobileView("document");
        else if (selected) setMobileView("document");
      }
      desktopCompanionActive = nextCompanionActive;
      applyMobilePanePresence();
      setTreeWidth(parseFloat(workspace.style.getPropertyValue("--tree-width")) || treePane.getBoundingClientRect().width, false);
      scheduleGoalGraphLayout();
    });

    if (decisionView && location.hash.startsWith("#decision-goal-")) {
      const goalId = decodeURIComponent(location.hash.slice("#decision-goal-".length));
      if (goalId) location.replace(route("/goals/" + encodeURIComponent(goalId)));
    }
    setTreeWidth(treePane.getBoundingClientRect().width, false);
    if (tuiPane) setTuiWidth(tuiPane.getBoundingClientRect().width, false);
    let restoredUi = false;
    let restoredMobileView = "";
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(storageKey) ||
        (!decisionView && !collectionView ? sessionStorage.getItem(goalUiStorageKey) : null) ||
        "null",
      );
      if (stored) {
        applyUiState(stored);
        restoredUi = true;
        restoredMobileView = stored.mobileView === "tui" || stored.mobileView === "document" || stored.mobileView === "tree"
          ? stored.mobileView
          : "";
        sessionStorage.setItem(storageKey, JSON.stringify(stored));
      }
    } catch {}
    if (!restoredUi) {
      setWorkspaceMode("focus", false);
      bindGoalEventDocument();
      openEventReaderFromHash();
      const initialFactor = goalFactorFromHash();
      if (initialFactor) setGoalFactor(initialFactor, false);
      if (feedDirectory) setFeedPreset("feed", false);
      if (desktopDirectoryPanels.length) {
        setDesktopDirectory(decisionView ? "inbox" : treePane?.dataset.desktopDirectory || "root", false, false);
      }
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(activeDesktopSurface, false, false);
    }
    immersiveNavigation?.sync();
    const directGoalRequested = /^\\/(?:archive\\/|trash\\/)?goals\\/[^\\/]+\\/?$/.test(localPathname());
    const restoredNavigation = restoredUi && ["reload", "back_forward"].includes(
      performance.getEntriesByType("navigation")[0]?.type,
    );
    if (tabWorkspace) {
      if (directGoalRequested && selected && !restoredNavigation) {
        tabWorkspace.openItem("goals", selected);
      }
    } else if (!directGoalRequested && !restoredNavigation && !decisionView && !collectionView) {
      goalWorkspaceMode = "graph";
      setDesktopDirectory("root", false, false);
      setDesktopWorkSurface("home", false, false);
      saveUiState();
    }
    if (!tabWorkspace && directGoalRequested && selected && !restoredNavigation) {
      goalWorkspaceMode = "focus";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("focus", false);
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      saveUiState();
    }
    if (directGoalRequested && selected && !restoredNavigation && tabWorkspace) {
      setDesktopDirectory("goals", false, false);
      setWorkspaceMode("focus", false);
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      saveUiState();
    }
    const feedStartRequested = new URLSearchParams(location.search).get("feed-start") === "1";
    const onboardingRuntimeRequested = new URLSearchParams(location.search).get("onboarding-runtime") === "1";
    if (onboardingRuntimeRequested && selected && tuiPane) {
      goalWorkspaceMode = "runtime";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("runtime", false);
      setMobileView("tui");
      saveUiState();
    }
    if (feedStartRequested && selected && tuiPane) {
      goalWorkspaceMode = "runtime";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("runtime", false);
      setMobileView("tui");
      saveUiState();
    }
    const initialHashTargetId = decodeURIComponent(location.hash.slice(1));
    if (!restoredUi && initialHashTargetId) void revealDeepLinkFromId(initialHashTargetId);
    try {
      const goalMoveReceipt = JSON.parse(sessionStorage.getItem(goalMoveReceiptKey) || "null");
      sessionStorage.removeItem(goalMoveReceiptKey);
      if (goalMoveReceipt?.message) showToast(goalMoveReceipt.message);
    } catch {
      sessionStorage.removeItem(goalMoveReceiptKey);
    }
    try {
      const storedDecisionReceipt = JSON.parse(sessionStorage.getItem("molis-work-decision-receipt") || "null");
      sessionStorage.removeItem("molis-work-decision-receipt");
      if (storedDecisionReceipt?.message) {
        showDecisionReceipt(storedDecisionReceipt.message, storedDecisionReceipt.context);
      }
    } catch {
      sessionStorage.removeItem("molis-work-decision-receipt");
    }
    if (selected && tuiPane) {
      tuiPane.setAttribute("data-goal-id", selected);
      const selectedItem = visibleGoals().find((entry) => entry.goal.goal_id === selected);
      document.dispatchEvent(new CustomEvent("molis-work:goal-changed", { detail: {
        goalId: selected,
        goalTitle: selectedItem?.goal.title || selected,
        status: selectedItem?.status || "",
        statusLabel: selectedItem?.status_label || "",
        statusMeaning: selectedItem?.status_meaning || "",
        statusIconMarkup: selectedItem?.status_icon || "",
        parentReadOnly: Boolean(selectedItem?.is_compound_parent),
        children: selectedItem?.children || [],
      } }));
    }
    if (selected) ensureWorkTab(selected);
    else renderWorkTabs();
    frameContainer?.restore();
    tabWorkspace?.apply();
    projectSettingsStage?.syncFromLocation();
    if (matchMedia("(max-width: 760px)").matches && (restoredMobileView === "tree" || restoredMobileView === "document" || restoredMobileView === "tui")) {
      setMobileView(restoredMobileView);
    }
    updateRelationPreviews();
    updateAllRelationFormPreviews();
    setInterval(refreshBoard, 4000);
  })();
`;
