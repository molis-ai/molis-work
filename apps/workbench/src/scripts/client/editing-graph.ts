import { GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT, GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import { GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import { FRAME_CONTAINER_FACTORY_SCRIPT } from "./frame-container.js";
import { TAB_WORKSPACE_FACTORY_SCRIPT } from "./tab-workspace.js";
import { GOALS_RELATION_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import { GOALS_POLICY_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
/** AP3 Workbench client segment: editing-graph. */
export const CLIENT_EDITING_GRAPH_SCRIPT = `
    const { updateRelationPreviews, updateAllRelationFormPreviews, handleGoalRelationChange,
      handleGoalRelationDisclosureClick, handleGoalRelationSubmit } = (${GOALS_RELATION_CLIENT_FACTORY_SCRIPT})({
        form, currentLocale: () => document.documentElement.lang, route, controlHeaders: molisWorkControlHeaders, translate: L,
        refreshBoard: (...args) => refreshBoard(...args),
        requireFormFacts: (...args) => requireFormFacts(...args),
        requireDecisionText: (...args) => requireDecisionText(...args),
        showFactorReceipt: (...args) => showFactorReceipt(...args),
        humanDecisionError: (...args) => humanDecisionError(...args),
      });
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
      const label = invalid.closest("label")?.querySelector(":scope > span")?.textContent?.trim() || L("必填信息");
      errorBox.textContent = L("请先补充：{label}", { label });
      errorBox.hidden = false;
      requestAnimationFrame(() => invalid.focus());
      return true;
    };

    const showToast = (message, error = false) => {
      toast.textContent = message;
      toast.classList.toggle("is-error", error);
      toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
    };

    const { handleGoalPolicySubmit } = (${GOALS_POLICY_CLIENT_FACTORY_SCRIPT})({
      route, controlHeaders: molisWorkControlHeaders, translate: L, requireFormFacts, showToast,
      refreshBoard: (...args) => refreshBoard(...args),
      showFactorReceipt: (...args) => showFactorReceipt(...args),
      humanDecisionError: (...args) => humanDecisionError(...args),
    });

    const goalPageBase = () => route(trashView ? "/trash/goals/" : archiveView ? "/archive/goals/" : "/goals/");
    const goalPageUrl = (goalId) => goalPageBase() + encodeURIComponent(goalId) + (document.body.dataset.nativeDesktop === "true" ? "?desktop=1" : "");

    const { readCreateDraft, refreshCreateChoices, handleGoalDialogClick, handleGoalTrashSubmit,
      bindGoalCreateEvents, handleGoalDialogEscape } = (${GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT})({
        dialog, form, route, controlHeaders: molisWorkControlHeaders,
        refreshBoard: (...args) => refreshBoard(...args), updateRelationPreviews,
        currentLocale: () => document.documentElement.lang, translate: L,
        clearCollectionUiState: () => sessionStorage.removeItem(storageKey),
        clearCurrentGoalUiState: () => sessionStorage.removeItem(currentGoalUiStorageKey),
        navigate: (url) => location.assign(globalThis.molisWorkNavigationUrl(url)),
      });
    const { handleGoalLifecycleClick } = (${GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT})({
      route, controlHeaders: molisWorkControlHeaders, refreshBoard: (...args) => refreshBoard(...args),
      showToast, navigate: (url) => location.assign(globalThis.molisWorkNavigationUrl(url)),
    });
    const applyMobilePanePresence = () => {
      if (immersiveNavigation) { immersiveNavigation.syncPresence(); return; }
      const graph = workspace.querySelector("[data-goal-momentum]");
      const narrow = matchMedia("(max-width: 760px)").matches;
      const view = workspace.dataset.mobileView || "tree";
      const mode = workspace.dataset.workspaceMode;
      const canvas = workspace.querySelector('[data-goal-canvas-shell][data-goal-active="true"]');
      if (canvas) {
        treePane.toggleAttribute("inert", narrow && view !== "tree");
        canvas.toggleAttribute("inert", narrow && view === "tree");
        documentPane.removeAttribute("inert");
        tuiPane?.toggleAttribute("inert", Boolean(documentPane.querySelector(".goal-event-document.is-editing-goal")));
        graph?.toggleAttribute("inert", canvas.dataset.expanded === "true");
        return;
      }
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
      const switchRoot = document.querySelector(".mobile-switch");
      const selectedTab = switchRoot?.querySelector("[aria-selected='true']");
      if (selectedTab instanceof HTMLElement) selectedTab.focus();
      else if (visiblePane instanceof HTMLElement) visiblePane.focus({ preventScroll: true });
    };

    const setMobileView = (view) => {
      workspace.dataset.mobileView = view;
      document.querySelector(".topbar")?.setAttribute("data-mobile-surface", view);
      syncMobileNavigationChrome();
      applyMobilePanePresence();
    };

    const handleMobileSwitchKeyboard = (event) => {
      const switchRoot = event.target?.closest?.(".mobile-switch");
      if (!switchRoot || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
      const tabs = [...switchRoot.querySelectorAll("[role='tab']")];
      const current = event.target?.closest?.("[role='tab']");
      const index = tabs.indexOf(current);
      if (index < 0) return false;
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + ((event.key === "ArrowRight" || event.key === "ArrowDown") ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      const next = tabs[nextIndex];
      next?.focus();
      next?.click();
      return true;
    };

    const { graphElement, loadGoalGraph, syncGoalWorkspace, updateGraphVisibility, readMomentumState,
      restoreMomentumState, rememberMomentumGoal, scheduleGoalGraphLayout, restoreGoalGraphViewport,
      locateGraphNode, handleMomentumNavigationClick, handleMomentumSelectionClick, handleMomentumZoomClick } =
      (${GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT})({
        workspace, treeSearch, documentCollection, route, translate: L,
        projectId: state.project?.project_id || state.snapshot.board.board_id,
        selectGoal: (...args) => selectGoal(...args),
        openFrame: (id) => frameContainer?.openFrame(id),
        applySelection: (id) => applySelection(id, false),
        isFrameTabActive: () => frameContainer?.isFrameTabActive() === true,
        isKanbanTabActive: () => frameContainer?.isKanbanTabActive() === true,
        getSelected: () => selected, getSelectedStatuses: () => getSelectedStatuses(),
        queueSave: () => queueSave(), setWorkspaceMode: (...args) => setWorkspaceMode(...args),
        setNavigatorView: (...args) => setNavigatorView(...args),
      });
    const setWorkspaceMode = (view, persist = true, preserveMobile = false) => {
      const graph = graphElement();
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
      const canvasActive = Boolean(workspace.querySelector("[data-goal-canvas-shell]")) && activeDesktopSurface === "goal";
      if (canvasActive) {
        documentPane.hidden = false;
        if (tuiPane) tuiPane.hidden = false;
        syncGoalWorkspace(nextMode, true);
        graphElement()?.removeAttribute("hidden");
        immersiveNavigation?.syncGoalMode(nextMode);
        document.querySelectorAll("button[data-navigator-view]").forEach((button) => {
          const active = button.dataset.navigatorView === navigatorView;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-selected", String(active));
        });
        if (matchMedia("(max-width: 760px)").matches) {
          if (!preserveMobile) setMobileView("document");
        } else applyMobilePanePresence();
        if (persist) queueSave();
        return;
      }
      syncGoalWorkspace(nextMode, false);
      documentPane.hidden = nextMode !== "focus";
      if (tuiPane) tuiPane.hidden = nextMode !== "runtime";
      document.querySelectorAll("button[data-navigator-view]").forEach((button) => {
        const active = button.dataset.navigatorView === navigatorView;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("button[data-workbench-view]").forEach((button) => {
        const active = button.dataset.workbenchView === nextMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      if (graph && !workspace.querySelector("[data-goal-canvas-shell]")) graph.hidden = nextMode !== "graph";
      if (nextMode === "graph" && !workspace.querySelector("[data-goal-canvas-shell]")) {
        if (graph?.dataset.loaded === "true") updateGraphVisibility();
        else void loadGoalGraph();
      }
      if (matchMedia("(max-width: 760px)").matches) {
        if (!preserveMobile) setMobileView(nextMode === "runtime" ? "tui" : "document");
      } else applyMobilePanePresence();
      if (persist) queueSave();
    };

    const setNavigatorView = (view, persist = true) => {
      setWorkspaceMode(view === "graph" ? "graph" : "focus", persist);
    };

    frameContainer = (${FRAME_CONTAINER_FACTORY_SCRIPT})({
      translate: L, showToast,
      visibleGoals: () => visibleGoals(),
      getSurface: () => activeDesktopSurface,
      setWorkSurface: (...args) => setDesktopWorkSurface(...args),
      setDirectory: (...args) => setDesktopDirectory(...args),
      setWorkspaceMode: (...args) => setWorkspaceMode(...args),
      setMobileView: (...args) => setMobileView(...args),
      applySelection: (goalId) => applySelection(goalId, false),
      locateGraphNode: (id) => locateGraphNode(id),
      getProjectId: () => state.project?.project_id || state.snapshot.board.board_id,
      route,
      openGoalTab: (id) => tabWorkspace?.openItem("goals", id, undefined, "frame"),
      openGoalWork: () => tabWorkspace?.openGoalWork(),
      activateGoalsMother: () => {
        const current = tabWorkspace?.state?.();
        const pane = current?.panes?.find((item) => item.id === current.focusedPaneId);
        const tab = pane?.tabs?.find((item) => item.id === pane.activeTabId);
        if (!tab && pane?.viewPlugin === "goals") return;
        if (tab?.plugin === "goals" && tab.kind === "mother") return;
        tabWorkspace?.openPlugin("goals");
      },
    });
    try {
      tabWorkspace = (${TAB_WORKSPACE_FACTORY_SCRIPT})({
        setFeedTask, setFeedAddOpen, showToast,
        showGoalFrame: (id) => frameContainer?.showGoalFrame(id),
        translate: L,
        getSurface: () => activeDesktopSurface,
        setWorkSurface: (...args) => setDesktopWorkSurface(...args),
        setDirectory: (...args) => setDesktopDirectory(...args),
        setWorkspaceMode: (...args) => setWorkspaceMode(...args),
        setMobileView: (...args) => setMobileView(...args),
        applySelection: (goalId) => applySelection(goalId, false),
        loadGoalDocument: (goalId) => loadGoalDocument(goalId),
        getDocumentGoalId: () => documentPane.querySelector("[data-goal-view]")?.dataset.goalView,
        locateGraphNode: (id) => locateGraphNode(id),
        selectFeedItem: (...args) => selectFeedItem(...args),
        selectInboxEntry: (...args) => selectInboxEntry(...args),
        getProjectId: () => state.project?.project_id || state.snapshot.board.board_id,
        visibleGoals: () => visibleGoals(),
        showCanvas: () => frameContainer?.showCanvas(),
        restoreBoard: () => frameContainer?.restoreBoard(),
        releaseFrame: () => frameContainer?.releaseFrame(),
        isFrameTabActive: () => frameContainer?.isFrameTabActive() === true,
      });
    } catch (error) {
      console.warn("Molis Work tab workspace failed to start", error);
    }
    document.addEventListener("click", (event) => {
      if (frameContainer?.isFrameTabActive()) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const select = target?.closest("[data-operation-select]");
      const directory = select?.closest("[data-operation-directory]");
      if (!select || !directory) return;
      openDirectorySurface(directory.dataset.operationDirectory, select.dataset.operationSelect, select.getAttribute("data-frame-asset-title"), event);
    }, true);

`;
