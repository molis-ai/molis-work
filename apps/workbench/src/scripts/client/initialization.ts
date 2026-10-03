import { CODING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT } from "./deferred-plugin-client.js";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { PROJECT_HOME_FACTORY_SCRIPT } from "./project-home.js";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "./plugin-workbench.js";
import { PLUGIN_MEMBERSHIP_FACTORY_SCRIPT } from "./plugin-membership.js";
import { IMMERSIVE_NAVIGATION_FACTORY_SCRIPT } from "./immersive-navigation.js";
import { NAVIGATION_PRESENTATION_SCRIPT, DOCK_SCRIPT } from "./navigation-presentation.js";
import { GLOBAL_SEARCH_FACTORY_SCRIPT, SEARCH_ITEM_TAB_SURFACES } from "./global-search.js";
import { BACKGROUND_TASKS_FACTORY_SCRIPT } from "./background-tasks.js";
import { PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT } from "./plugin-notifications.js";
import { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "./settings-directory.js";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "../connectors-settings.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "./assistant-island.js";
import { PLACEMENT_FACTORY_SCRIPT } from "./placement.js";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT } from "./context-actions.js";
import { SIDE_FILES_FACTORY_SCRIPT } from "../../side-panel-files.js";
import { pluginWorkbenchClientBootstrap } from "../../plugin-workbench.js";
/** AP3 Workbench client segment: initialization. */
export const CLIENT_INITIALIZATION_SCRIPT = `    });
    const mountPluginClient = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    boardLifetime = mountPluginClient(document.body);

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
    // Adding a plugin to the project or taking it away changes the page in place (the switcher's buttons and the market's both).
    const pluginMembership = (${PLUGIN_MEMBERSHIP_FACTORY_SCRIPT})({
      route, translate: L, projectId: state.project?.project_id, saveUiState, showToast,
      leavePlugin: (plugin) => tabWorkspace?.leavePlugin?.(plugin) === true,
      trackSurface: (node) => { if (!desktopWorkSurfaces.includes(node)) desktopWorkSurfaces.push(node); },
      untrackSurface: (node) => { const at = desktopWorkSurfaces.indexOf(node); if (at >= 0) desktopWorkSurfaces.splice(at, 1); },
      // A plugin's section of the directory came or went: the page's list of panels is what is there now, and where the directory
      // stands is checked against it (a directory that went falls back to the root).
      directoryChanged: () => {
        desktopDirectoryPanels.splice(0, desktopDirectoryPanels.length, ...document.querySelectorAll("[data-directory-panel]"));
        setDesktopDirectory(treePane?.dataset.desktopDirectory || "root", false, false);
      },
      leaveSettingsSection: (section) => settingsDirectory?.leave?.(section),
    });
    pluginWorkbench = (${PLUGIN_WORKBENCH_FACTORY_SCRIPT})({
      mountPluginClient, membership: pluginMembership,
      route, translate: L, projectId: state.project?.project_id,
      setSurface: surface => { setDesktopDirectory("artifacts", false, false); setDesktopWorkSurface(surface); },
      openTabItem: (plugin, id, title, mode) => tabWorkspace?.openItem(plugin, id, title, undefined, mode),
      saveUiState, setMobileView,
      openPlugin: (plugin) => tabWorkspace?.openPlugin(plugin),
    });
    // "转为待办" in other plugins shows only where Todo is on this page.
    document.body.toggleAttribute("data-todo-available", Boolean(document.querySelector('[data-work-surface="todo"]')));
    (${NAVIGATION_PRESENTATION_SCRIPT})(L);
    (${DOCK_SCRIPT})(L, state.project?.project_id, {
      membership: pluginMembership,
      setExclusive: (surface) => tabWorkspace?.setExclusive(surface),
      setDirectory: (...args) => setDesktopDirectory(...args),
      leavePlugin: (plugin) => tabWorkspace?.leavePlugin?.(plugin) === true,
      shownPlugin: () => tabWorkspace?.shownPlugin?.() || null,
      registerCover: (kind, open) => tabWorkspace?.registerCover?.(kind, open),
    });
    (${BACKGROUND_TASKS_FACTORY_SCRIPT})({ translate: L, projectId: state.project?.project_id,
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title) });
    (${PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT})({ translate: L, route, projectId: state.project?.project_id });
    // The side panel's file tab opens a file in its plugin the way system search does (specs/archive/side-panel P3).
    // A surface that opens its items as tabs (the 成果库 opens a version) gets the item; the rest choose the record in their list.
    (${SIDE_FILES_FACTORY_SCRIPT})({ translate: L, route, openRecord: (plugin, id, title) => ${JSON.stringify([...SEARCH_ITEM_TAB_SURFACES])}.includes(plugin) ? tabWorkspace?.openItem(plugin, id, title) : tabWorkspace?.openPluginRecord(plugin, id) });
    globalSearchPalette = (${GLOBAL_SEARCH_FACTORY_SCRIPT})({
      translate: L,
      route, headers: () => molisWorkControlHeaders(), projectId: state.project?.project_id || document.body.dataset.projectId || "",
      openPluginRecord: (plugin, id) => tabWorkspace?.openPluginRecord(plugin, id),
      openPlugin: (plugin) => tabWorkspace?.openPlugin(plugin),
      askAssistant: (words) => {
        const input = document.querySelector("[data-assistant-input]");
        const composer = document.querySelector("[data-assistant-composer]");
        if (!input || !composer) return;
        input.value = words; input.dispatchEvent(new Event("input", { bubbles: true }));
        composer.requestSubmit();
      },
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
      messageApi: async (pathname, method, body) => {
        const response = await fetch(route(pathname), { method, headers: molisWorkControlHeaders(), body: body == null ? undefined : JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok && !(response.status === 409 && result.state === 'failed')) throw new Error(result.error || L('消息请求失败，请核对原请求'));
        return result;
      },
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      openPlugin: (plugin) => tabWorkspace?.openPlugin(plugin),
      openTarget: (target) => {
        if (target.kind === 'item') tabWorkspace?.openItem(target.surface, target.id, target.title);
        else {
          tabWorkspace?.openPlugin(target.surface);
          if (target.kind === 'group') document.dispatchEvent(new CustomEvent('workbench-open-group', { detail: { surface: target.surface, id: target.id } }));
        }
        setMobileView("document");
      },
    });
    deferredClients = (${DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT})({
      mountPluginClient, scope: boardLifetime, translate: L, projectId: () => state.project?.project_id || document.body.dataset.projectId || "",
      projectTitle: () => state.project?.display_name || "", feedApi, route, headers: () => molisWorkControlHeaders(),
      openItem: (...args) => tabWorkspace?.openItem(...args), openBeside: (...args) => tabWorkspace?.openBeside(...args),
      openPlugin: (...args) => tabWorkspace?.openPlugin(...args), hideDirectory: () => immersiveNavigation?.hideDirectory(), showToast,
    });
    ${pluginWorkbenchClientBootstrap(undefined, true)}
    ${CODING_SETTINGS_CLIENT_SCRIPT}
    (${ASSISTANT_ISLAND_FACTORY_SCRIPT})({ translate: L, showToast, route, headers: () => molisWorkControlHeaders(),
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      project: { id: state.project?.project_id || state.snapshot.board.board_id, title: state.project?.display_name || state.snapshot.board.title || "" },
    });
    (${CONTEXT_ACTIONS_FACTORY_SCRIPT})({ translate: L, route, headers: () => molisWorkControlHeaders(),
      openSearch: (query) => globalSearchPalette?.open(document.activeElement, query) });
    globalThis.molisPlacement = (${PLACEMENT_FACTORY_SCRIPT})({ translate: L, route, headers: () => molisWorkControlHeaders(),
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title), openPluginRecord: (plugin, id) => tabWorkspace?.openPluginRecord(plugin, id),
      openGoalWork: () => tabWorkspace?.openGoalWork(), closeItem: (plugin, id) => tabWorkspace?.closeItem(plugin, id), projectTitle: state.project?.display_name || "" });
    ${CONNECTORS_SETTINGS_CLIENT_SCRIPT}
    requestAnimationFrame(() => {
      const entryId = new URL(location.href).searchParams.get("inbox_entry");
      if (!entryId) return;
      const row = inboxList?.querySelector('[data-inbox-entry-id="' + CSS.escape(entryId) + '"]');
      if (row) tabWorkspace?.openItem("inbox", entryId, row.querySelector("strong")?.textContent);
      else showToast(L("原 Inbox 材料在当前项目中不可用"), true);
    });
    const settingsDirectory = (${SETTINGS_DIRECTORY_FACTORY_SCRIPT})({
      translate: L,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setExclusive: (surface) => tabWorkspace?.setExclusive(surface),
      closeCover: () => tabWorkspace?.closeCover?.(),
      openCover: (kind) => tabWorkspace?.openCover?.(kind),
      noteCover: (kind, place) => tabWorkspace?.noteCover?.(kind, place),
      registerCover: (kind, open) => tabWorkspace?.registerCover?.(kind, open),
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
      // A reload stays on the category (and the page inside it) the person was on: "<section>" or "<section> <address>".
      const [section, ...address] = (tabWorkspace?.coverPlace?.(settingsKind) || "").split(" ");
      const fetchPath = address.join(" ") || undefined;
      setDesktopDirectory(settingsKind, false, false);
      tabWorkspace?.setExclusive(settingsKind);
      if (settingsKind === "project-settings") void settingsDirectory?.loadProjectSection?.(section || settingsDirectory?.getProjectActive?.() || "general", fetchPath);
      else void settingsDirectory?.loadSection?.(section || settingsDirectory?.getActive?.() || "appearance", fetchPath);
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
    openRequestedFeedRule();
    // An address the project does not have opens here (the server sends it with ?missing=): say so, then forget it.
    // A plugin the studio just installed opens once its entry is on the page (?openSurface=app-…), then the address forgets it.
    const askedSurface = new URLSearchParams(location.search).get("openSurface");
    if (askedSurface && /^app-[a-f0-9-]{36}$/.test(askedSurface)) {
      const cleaned = new URL(location.href); cleaned.searchParams.delete("openSurface"); history.replaceState(history.state, "", cleaned);
      setTimeout(() => [...document.querySelectorAll("[data-work-surface-open]")].find((el) => el.dataset.workSurfaceOpen === askedSurface)?.click(), 0);
    }
    const missingPage = new URLSearchParams(location.search).get("missing");
    if (missingPage) {
      showToast(L("找不到这个页面：{path}").replace("{path}", missingPage), true);
      const cleaned = new URL(location.href); cleaned.searchParams.delete("missing");
      history.replaceState(history.state, "", cleaned);
    }
    // A project reference (a file in the project that evidence points to) opens in an overlay here, never a new tab.
    const referenceDialog = document.querySelector("[data-project-reference-dialog]");
    referenceDialog?.addEventListener("click", (event) => { if (event.target?.closest?.("[data-dialog-close]")) referenceDialog.close(); });
    document.addEventListener("click", async (event) => {
      const link = event.target?.closest?.("a[data-project-reference]");
      if (!link || !referenceDialog || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const href = link.getAttribute("href") || "";
      const url = href.startsWith("/api/") ? route(href) : href;
      const body = referenceDialog.querySelector("[data-project-reference-body]");
      referenceDialog.querySelector("#project-reference-title").textContent = link.textContent.trim() || L("项目内引用");
      referenceDialog.querySelector("[data-project-reference-download]").href = url;
      body.textContent = L("正在读取…");
      if (!referenceDialog.open) referenceDialog.showModal();
      try {
        const response = await fetch(url, { cache: "no-store" });
        const text = await response.text();
        if (!response.ok) { let reason = text; try { reason = JSON.parse(text).error || text; } catch {} throw new Error(reason); }
        body.textContent = text;
      } catch (error) { body.textContent = error?.message || L("项目内引用无法打开"); }
    });
    updateRelationPreviews();
    updateAllRelationFormPreviews();
    boardLifetime.poll(async signal => {
      boardVisibleSignal = signal;
      await refreshBoard(false, signal);
    }, 4000);
    boardLifetime.own(() => clearTimeout(deferredRefreshTimer));
  })();
`;
