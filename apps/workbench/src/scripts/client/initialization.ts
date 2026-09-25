import { CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT } from "./coding-companions.js";
import { GIT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-git";
import { CODING_CLIENT_FACTORY_SCRIPT, CODING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { FILES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-files";
import { icon } from "@molis-ai/molis-work-design-system";
import { AGENT_REVIEW_CLIENT_FACTORY_SCRIPT } from "./agent-review.js";
import { PROJECT_HOME_FACTORY_SCRIPT } from "./project-home.js";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "./plugin-workbench.js";
import { CHARACTERS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-characters";
import { IMMERSIVE_NAVIGATION_FACTORY_SCRIPT } from "./immersive-navigation.js";
import { GLOBAL_SEARCH_FACTORY_SCRIPT } from "./global-search.js";
import { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "./settings-directory.js";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "../connectors-settings.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "./assistant-island.js";
import { pluginWorkbenchClientBootstrap } from "../../plugin-workbench.js";
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
      openTabItem: (plugin, id, title, mode) => tabWorkspace?.openItem(plugin, id, title, undefined, mode),
      saveUiState, setMobileView,
    });
    globalSearchPalette = (${GLOBAL_SEARCH_FACTORY_SCRIPT})({
      translate: L,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setWorkSurface: (...args) => setDesktopWorkSurface(...args),
      selectGoal: (...args) => selectGoal(...args),
      setMobileView: (...args) => setMobileView(...args),
      noteSearchActivity: (...args) => noteSearchActivity(...args),
      openTabItem: (plugin, id, title, mode) => tabWorkspace?.openItem(plugin, id, title, undefined, mode),
      expandDirectory: (id) => setPluginSectionExpanded(id === "sources" ? "feed" : id, true, true),
    });
    projectHome = (${PROJECT_HOME_FACTORY_SCRIPT})({
      getState: () => state, translate: L, route,
      feedApi,
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      openPlugin: (plugin) => tabWorkspace?.openPlugin(plugin),
      openFeedSource: (sourceId) => {
        setDesktopDirectory("feed", true, false);
        tabWorkspace?.openPlugin("feed");
        setFeedTask(sourceId);
        setMobileView("document");
      },
    });
    const companionRequest = async (plugin, path, method = "GET", body) => {
        const response = await fetch(route('/api/plugins/io.molis.work.' + plugin + path), {method,cache:'no-store',
          ...(method==='GET'?{}:{headers:molisWorkControlHeaders(),body:JSON.stringify(body ?? {})})});
        const result = await response.json();
        if(!response.ok)throw new Error(result.error || '无法读取文件工作区');
        return result;
      };
    const codingRoot = document.querySelector("[data-coding-workbench]");
    const openCompanionResult = (name) => {
      if(codingRoot){codingRoot.dataset.codingDetail="true";codingRoot.dataset.codingResults="true";}
      codingRoot?.querySelector('[data-coding-tools]')?.setAttribute('data-companion-open','true');
      for(const kind of ['files','git']) { const panel=codingRoot?.querySelector('[data-'+kind+'-results]'); if(panel)panel.hidden=kind!==name; }
    };
    const closeCompanionResult = () => {
      codingRoot?.querySelector('[data-coding-tools]')?.removeAttribute('data-companion-open');
      if(codingRoot){codingRoot.dataset.codingResults='false';if(!codingRoot.querySelector('[data-coding-session][aria-current="true"]'))codingRoot.dataset.codingDetail='false';}
    };
    const gitBrowser = codingRoot ? (${GIT_CLIENT_FACTORY_SCRIPT})({root:codingRoot,request:companionRequest,openResult:()=>openCompanionResult('git'),closeResult:closeCompanionResult,
      showReviews: (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})({route,headers:()=>molisWorkControlHeaders(),onDecision:outcome=>gitBrowser?.afterDecision(outcome)})}) : null;
    const filesBrowser = codingRoot ? (${FILES_CLIENT_FACTORY_SCRIPT})({root:codingRoot,
      icons: ${JSON.stringify({ folder: icon("folder"), file: icon("file") })},
      request: companionRequest,
      onWorkspaceSelected: () => { void gitBrowser?.refresh(); },
      openResult: () => openCompanionResult('files'),
      closeResult: closeCompanionResult,
    }) : null;
    (${CODING_CLIENT_FACTORY_SCRIPT})({
      revealTask: () => { if(matchMedia("(max-width: 600px)").matches) immersiveNavigation?.hideDirectory(); closeCompanionResult(); },
      onDirectoryFace: face => { const handled=filesBrowser?.show(face) ?? false; gitBrowser?.show(face); return handled; },
      showReviews: (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})({route,headers:()=>molisWorkControlHeaders()}),
      addWorkspace: async (workspace_path) => {
        const response = await fetch(route("/api/workspaces"), { method:"POST", headers:molisWorkControlHeaders(), body:JSON.stringify({workspace_path,user_confirmed:true}) });
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "无法关联工作区");
        return result.workspace;
      },
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
    });
    (${CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT})({
      request: companionRequest, route, icons: ${JSON.stringify({ folder: icon("folder"), file: icon("file") })},
      openPlugin: plugin => tabWorkspace?.openPlugin(plugin),
      reviewFactory: ${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT},
      headers: () => molisWorkControlHeaders(),
    });
    (${CHARACTERS_CLIENT_FACTORY_SCRIPT})();
    ${pluginWorkbenchClientBootstrap()}
    ${CODING_SETTINGS_CLIENT_SCRIPT}
    (${ASSISTANT_ISLAND_FACTORY_SCRIPT})({ translate: L, showToast, feedApi,
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      refresh: async () => { await refreshFeedStage(); await refreshInboxStage(); },
      preparePages: draft => {
        composeDraft = { ...draft, request_id: "" };
        tabWorkspace?.openPlugin("inbox");
        showInboxComposer();
      },
    });
    ${CONNECTORS_SETTINGS_CLIENT_SCRIPT}
    requestAnimationFrame(() => {
      const entryId = new URL(location.href).searchParams.get("inbox_entry");
      if (!entryId) return;
      const row = inboxList?.querySelector('[data-inbox-entry-id="' + CSS.escape(entryId) + '"]');
      if (row) tabWorkspace?.openItem("inbox", entryId, row.querySelector("strong")?.textContent);
      else showToast(L("原 Inbox 材料在当前项目中不可用"));
    });
    const settingsDirectory = (${SETTINGS_DIRECTORY_FACTORY_SCRIPT})({
      translate: L,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setExclusive: (surface) => tabWorkspace?.setExclusive(surface),
      hideDirectory: () => immersiveNavigation?.hideDirectory(),
      projectId: state.project?.project_id || "",
    });
    bindGoalCreateEvents();
    addEventListener("popstate", (event) => {
      if (localPathname() === "/" && !decisionView && !collectionView) {
        setDesktopDirectory("root", false, false);
        if (!openWorkbenchSurface("home")) setDesktopWorkSurface("home");
      } else handleGoalPopState(event);
    });
    addEventListener("hashchange", handleGoalHashChange);
    addEventListener("pagehide", saveUiState);
    addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (globalSearchPalette?.handleKeyboard(event)) return;
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
      setWorkspaceMode("graph", false);
      bindGoalEventDocument();
      openEventReaderFromHash();
      const initialFactor = goalFactorFromHash();
      if (initialFactor) setGoalFactor(initialFactor, false);
      if (feedDirectory) setFeedPreset("feed", false);
      if (desktopDirectoryPanels.length) {
        setDesktopDirectory(treePane?.dataset.desktopDirectory || "root", false, false);
      }
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(activeDesktopSurface, false, false);
    }
    immersiveNavigation?.sync();
    const directGoalRequested = /^\\/(?:archive\\/|trash\\/)?goals\\/[^\\/]+\\/?$/.test(localPathname());
    const restoredNavigation = restoredUi && ["reload", "back_forward"].includes(
      performance.getEntriesByType("navigation")[0]?.type,
    );
    tabWorkspace?.restore(directGoalRequested && !restoredNavigation ? selected : "");
    const restoredExclusive = tabWorkspace?.state?.()?.exclusive;
    const settingsKind = restoredExclusive === "settings" || restoredExclusive === "project-settings"
      ? restoredExclusive
      : treePane?.dataset.desktopDirectory === "settings" || treePane?.dataset.desktopDirectory === "project-settings"
        ? treePane.dataset.desktopDirectory
        : "";
    if (settingsKind) {
      setDesktopDirectory(settingsKind, false, false);
      tabWorkspace?.setExclusive(settingsKind);
      if (settingsKind === "project-settings") void settingsDirectory?.loadProjectSection?.(settingsDirectory?.getProjectActive?.() || "general");
      else void settingsDirectory?.loadSection?.(settingsDirectory?.getActive?.() || "appearance");
    }
    if (!tabWorkspace && !directGoalRequested && !restoredNavigation && !decisionView && !collectionView) {
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
      applySelection(selected, false);
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
      try {
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
      } catch {}
    }
    immersiveNavigation?.sync();
    frameContainer?.restore();
    tabWorkspace?.apply();
    if (directGoalRequested && selected && !restoredNavigation && tabWorkspace) {
      tabWorkspace.openItem("goals", selected);
    } else if (tabWorkspace && !directGoalRequested && !decisionView && !collectionView) {
      const navigationType = performance.getEntriesByType("navigation")[0]?.type;
      if (navigationType !== "reload" && navigationType !== "back_forward" && !tabWorkspace.isEmbedded?.()) tabWorkspace.landAtProjectRoot();
    }
    if (restoredUi) {
      try {
        const restored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (Array.isArray(restored?.statuses) && restored.statuses.length) {
          setSelectedStatuses(restored.statuses);
          filterTree("");
        }
      } catch {}
    }
    if (!(directGoalRequested && !restoredNavigation) && matchMedia("(max-width: 760px)").matches && (restoredMobileView === "tree" || restoredMobileView === "document" || restoredMobileView === "tui")) {
      setMobileView(restoredMobileView);
    }
    updateRelationPreviews();
    updateAllRelationFormPreviews();
    setInterval(refreshBoard, 4000);
  })();
`;
