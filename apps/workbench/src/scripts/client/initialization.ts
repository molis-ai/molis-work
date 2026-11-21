import { HOME_OFFERS_FACTORY_SCRIPT } from "./home-offers.js";
import { DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT } from "./deferred-plugin-client.js";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { PLUGIN_WORKBENCH_FACTORY_SCRIPT } from "./plugin-workbench.js";
import { PLUGIN_MEMBERSHIP_FACTORY_SCRIPT } from "./plugin-membership.js";
import { IMMERSIVE_NAVIGATION_FACTORY_SCRIPT } from "./immersive-navigation.js";
import { NAVIGATION_PRESENTATION_SCRIPT, DOCK_SCRIPT } from "./navigation-presentation.js";
import { GLOBAL_SEARCH_FACTORY_SCRIPT } from "./global-search.js";
import { WORK_RECORDS_FACTORY_SCRIPT } from "./work-records.js";
import { ATTENTION_FACTORY_SCRIPT } from "./attention.js";
import { PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT } from "./plugin-notifications.js";
import { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "./settings-directory.js";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "../connectors-settings.js";
import { SYNC_SETTINGS_CLIENT_SCRIPT } from '../../settings-sync.js';
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "./assistant-island.js";
import { FILE_PREVIEW_CLIENT_SCRIPT, INPUT_RECEIPTS_CLIENT_SCRIPT, INTERACTION_CLIENT_SCRIPT_TYPED_DATES } from "@molis-ai/molis-work-design-system";
import { PLACEMENT_FACTORY_SCRIPT } from "./placement.js";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT } from "./context-actions.js";
import { SIDE_FILES_FACTORY_SCRIPT } from "../../side-panel-files.js";
import { MATERIALS_STAGE_FACTORY_SCRIPT } from "../../materials-stage.js";
import { MATERIALS_READER_CLIENT_SCRIPT } from "../../materials-reader-client.js";
import { pluginWorkbenchClientBootstrap } from "../../plugin-workbench.js";
/**
 * AP3 Workbench client segment: initialization.
 *
 * `itemTabs` are the surfaces whose tab opens one object by id: the platform's Artifacts, and each plugin the page's directory
 * (`script[data-plugin-directory]`, written by the Host from the Manifests its Runtimes run) says has a view that accepts objects
 * (W5-06 余项 2). The script keeps no list by plugin.
 */
export const CLIENT_INITIALIZATION_SCRIPT = `    });
    const itemTabs = ["artifacts", "materials", ...JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]").filter(entry => entry.accepts_objects).map(entry => entry.id)];
    const mountPluginClient = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    boardLifetime = mountPluginClient(document.body);

    immersiveNavigation = (${IMMERSIVE_NAVIGATION_FACTORY_SCRIPT})({
      workspace, treePane, documentPane, getSelected: () => selected, getState: () => state,
      getSurface: () => activeDesktopSurface, translate: readText,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setWorkSurface: (...args) => setDesktopWorkSurface(...args),
      setDirectoryCollapsed: (...args) => setDirectoryCollapsed(...args),
      setWorkspaceMode: (...args) => setWorkspaceMode(...args),
      setMobileView: (...args) => setMobileView(...args), queueSave: () => queueSave(),
      saveUiState: () => saveUiState(),
    });
    // Adding a plugin to the project or taking it away changes the page in place (the switcher's buttons and the market's both).
    const pluginMembership = (${PLUGIN_MEMBERSHIP_FACTORY_SCRIPT})({
      route, translate: readText, projectId: state.project?.project_id, saveUiState, showToast,
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
      route, translate: readText, projectId: state.project?.project_id,
      setSurface: surface => { setDesktopDirectory("artifacts", false, false); setDesktopWorkSurface(surface); },
      openTabItem: (plugin, id, title, mode) => tabWorkspace?.openItem(plugin, id, title, undefined, mode),
      saveUiState, setMobileView,
      openPlugin: (plugin) => tabWorkspace?.openPlugin(plugin),
    });
    (${NAVIGATION_PRESENTATION_SCRIPT})(readText);
    (${DOCK_SCRIPT})(readText, state.project?.project_id, {
      membership: pluginMembership,
      setExclusive: (surface) => tabWorkspace?.setExclusive(surface),
      setDirectory: (...args) => setDesktopDirectory(...args),
      open: (plugin, origin) => openSurfaceEntry(plugin, origin),
      shownPlugin: () => tabWorkspace?.shownPlugin?.() || null,
      pagePlugin: () => tabWorkspace?.pagePlugin?.() || null,
      tabsReady: () => Boolean(tabWorkspace),
      startPage: () => tabWorkspace?.startPage, openBeside: (plugin) => tabWorkspace?.openBeside(plugin),
      registerCover: (kind, open) => tabWorkspace?.registerCover?.(kind, open),
    });
    // An object named by reference (an address written by objectLink, a result named on a card): its owner's reader says where it opens (the object-open action).
    const openObject = (subject) => molisWorkRequest(route("/api/mainline/open"), { body: { subject } }).then((found) => {
      const to = found && found.target;
      if (!to) { showToast(readText("workbench.initialization.object-has-no-page")); return false; }
      if (to.kind === "surface" || !to.id) openSurfaceEntry(to.surface); else tabWorkspace?.openItem(to.surface, to.id, to.title);
      return true;
    }).catch((error) => { showToast(error, true); return false; });
    { const asked = new URL(location.href), kind = asked.searchParams.get("openObject"), id = asked.searchParams.get("openItem");
      if (kind && id && !asked.searchParams.has("openPlugin")) { asked.searchParams.delete("openObject"); asked.searchParams.delete("openItem"); history.replaceState(history.state, "", asked); void openObject({ kind, id }); } }
    const workLine = document.body.hasAttribute('data-pane-embedded') ? null : globalThis.molisWorkBar?.({ route, openObject, openEvent: (event, quiet) => assistantIsland?.openEvent(event, quiet), toNow: (quiet) => assistantIsland?.toNow(quiet), parked: (subject) => assistantIsland?.parked(subject), dialog: (open) => assistantIsland?.dialog(open),
      subtasks: () => assistantIsland?.subtasks() || [], openSubtask: (key) => assistantIsland?.openSubtask(key), mainWaiting: () => assistantIsland?.mainWaiting() || null, openMain: () => assistantIsland?.openMain(), attention: () => assistantIsland?.attention() || [], openAttention: (from, only) => assistantIsland?.openAttention(from, only),
      placeName: () => state.project?.display_name || "",
      // What is in front in the focused pane: an object's tab, a surface's own page, or a system view; null under a cover.
      front: () => { const tabs = tabWorkspace?.state?.(), pane = tabs && !tabs.exclusive ? tabs.panes.find(entry => entry.id === tabs.focusedPaneId) || tabs.panes[0] : null;
        if (!pane) return null; const tab = pane.tabs.find(entry => entry.id === pane.activeTabId);
        return tab ? tab.kind === "system" ? { owner: tab.owner, id: tab.itemId } : { surface: tab.plugin, id: tab.itemId || "" } : { surface: pane.viewPlugin || "", id: "" }; },
      positions: () => projectPositions, positionRead: (path, body, signal) => molisWorkRequest(route(path), { body, signal }),
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title), openSurface: (plugin) => openSurfaceEntry(plugin) });
    (${ATTENTION_FACTORY_SCRIPT})({ translate: readText, route, projectId: state.project?.project_id,
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title) });
    (${PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT})({ projectId: state.project?.project_id });
    // The main area's reader of the project's folders, where the side panel's 「在主区打开」 shows a file. Both places share one
    // copy of the design system's file preview and of the reader.
    const materialsKit = (() => { ${FILE_PREVIEW_CLIENT_SCRIPT}
      ${MATERIALS_READER_CLIENT_SCRIPT}
      return { renderFilePreview, materialsReader }; })();
    // The materials picker (its own bundle) previews a file with the same reader.
    globalThis.molisWorkMaterials = materialsKit;
    (${MATERIALS_STAGE_FACTORY_SCRIPT})({ route, kit: materialsKit });
    // The side panel's file tab opens a file in its plugin the way system search does (specs/archive/side-panel P3): an
    // object's tab where the surface opens objects by id, else the record in the plugin's list.
    (${SIDE_FILES_FACTORY_SCRIPT})({ readText, route, kit: materialsKit, openRecord: (plugin, id, title) => itemTabs.includes(plugin)
      ? tabWorkspace?.openItem(plugin, id, title) : tabWorkspace?.openPluginRecord(plugin, id) });
    // The UI stages go to the work records from the top page only: a split pane's page is a view of the same workspace.
    const workRecords = document.body.hasAttribute("data-pane-embedded") ? null : (${WORK_RECORDS_FACTORY_SCRIPT})({ route, current: () => {
      const tabs = tabWorkspace?.state?.(), pane = tabs && !tabs.exclusive ? tabs.panes.find(entry => entry.id === tabs.focusedPaneId) || tabs.panes[0] : null;
      const tab = pane?.tabs.find(entry => entry.id === pane.activeTabId), surface = tab && (tab.plugin || (tab.owner && "system:" + tab.owner));
      return surface ? { surface, id: tab.itemId || tab.kind } : null;
    } });
    // The shell's own back step after a locate is the return stage (OCL-07); only the top page records, so only it answers.
    if (workRecords) globalThis.molisWorkHistoryStep = (delta) => { if (delta < 0) workRecords.returned(); };
    globalSearchPalette = (${GLOBAL_SEARCH_FACTORY_SCRIPT})({
      translate: readText, itemTabs, records: workRecords,
      route, projectId: state.project?.project_id || document.body.dataset.projectId || "",
      openPluginRecord: (plugin, id) => tabWorkspace?.openPluginRecord(plugin, id),
      openPlugin: (plugin) => tabWorkspace?.openPlugin(plugin),
      askAssistant: (words) => assistantIsland?.ask(words),
      setMobileView: (...args) => setMobileView(...args),
      noteSearchActivity: (...args) => noteSearchActivity(...args),
      openTabItem: (plugin, id, title, mode) => tabWorkspace?.openItem(plugin, id, title, undefined, mode),
      expandDirectory: (id) => setPluginSectionExpanded(id),
    });
    const positionOffers = (${HOME_OFFERS_FACTORY_SCRIPT});
    projectHome = globalThis.molisWorkHomeView?.mountHome({
      read: (suffix, body, signal) => molisWorkRequest(route("/api/host/surface-home" + suffix), { method: "POST", body, signal }),
      navigationFrom: (source) => tabWorkspace?.homeNavigationFrom(source) ?? (() => false),
      market: () => tabWorkspace?.setExclusive("market"),
      picker: () => {
        const toggle = document.querySelector("[data-plugin-picker-toggle]");
        const popover = document.querySelector("[data-plugin-picker-popover]");
        if (toggle) { if (popover?.hidden !== false) toggle.click(); }
        else tabWorkspace?.setExclusive("market");
      },
      lead: { adopt: (box, target) => tabWorkspace?.adoptHomeLead(box, target) ?? null, release: (node) => tabWorkspace?.releaseHomeLead(node) },
      offers: (offerHost) => positionOffers({ ...offerHost, records: workRecords }),
      projectKey: state.project?.project_id || "",
      translate: readText,
      receipt: showToast, changed: () => positionChanged(),
      offerApi: (path, method, body, signal) => molisWorkRequest(route(path), { method, body, signal }),
      words: (text, signal) => globalThis.molisWorkSurfaceText?.install(route("/api/ui/locales"), text, signal) ?? Promise.resolve(),
    });
    const positionChanged = () => {
      projectHome?.sync(); projectPositions?.invalidate();
      document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));
    };
    globalThis.molisWorkbenchPositionFrom = frame => {
      const owns = () => frame?.ownerDocument === document && frame.isConnected && frame.tagName === "IFRAME"
        && frame.parentElement?.dataset.installedPlugin;
      if (!owns()) return null;
      const shown = () => owns() && !frame.closest("[hidden]");
      return { navigationFrom() {
        const navigate = tabWorkspace?.positionNavigationFrom(frame);
        return result => Boolean(shown() && navigate?.(result));
      }, changed() { if (shown()) positionChanged(); } };
    };
    if (state.project) {
      projectPositions = globalThis.molisWorkHomeView?.createPositionViews({
        navigationFrom: source => tabWorkspace?.positionNavigationFrom(source) ?? (() => false),
        changed: positionChanged, receipt: showToast,
      });
      document.addEventListener("molis-work:plugins-changed", () => projectPositions?.invalidate());
      window.addEventListener("molis:assistant-effect", () => projectPositions?.invalidate());
    }
    const positionRead = (path, body, signal) => molisWorkRequest(route(path), { body, signal });
    // The question and action cards' shared client: one copy for the Assistant and every plugin that shows them (A1, A2).
    // A reference field searches this project through search.references (T2); a pick is <kind> <id> for the SDK's questionAnswer.
    // The receipt under a supplement, the same way: one copy for the Assistant and every plugin that takes supplements (receipts 3c).
    const interaction = (client => (root, host) => client(root, { references: (source, query) => molisWorkRequest(route("/api/search/references"), { body: { kinds: source.split(","), query, limit: 8 }, fallback: globalThis.t.text("workbench.initialization.search-not-available-right-now-try-again-later") }).then(found => ({ items: found.candidates.map(item => ({ value: item.kind + " " + item.id, label: item.label, meta: item.plugin_title })) })), ...host }))((${INTERACTION_CLIENT_SCRIPT_TYPED_DATES})), receipts = (${INPUT_RECEIPTS_CLIENT_SCRIPT})(readText);
    deferredClients = (${DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT})({
      paneMessages,
      openView: (root, selection) => tabWorkspace?.openView(root, selection),
      positionNavigationFrom: source => tabWorkspace?.positionNavigationFrom(source) ?? (() => false),
      positionChanged,
      invalidateView: root => tabWorkspace?.invalidateView(root),
      openBehind: (...args) => tabWorkspace?.openBehind(...args),
      mountPluginClient, interaction, receipts, scope: boardLifetime, translate: readText, projectId: () => state.project?.project_id || document.body.dataset.projectId || "",
      projectTitle: () => state.project?.display_name || "", api, route, headers: () => molisWorkControlHeaders(),
      openItem: (...args) => tabWorkspace?.openItem(...args), openBeside: (...args) => tabWorkspace?.openBeside(...args),
      openPlugin: (...args) => tabWorkspace?.openPlugin(...args), hideDirectory: () => immersiveNavigation?.hideDirectory(), showToast,
    });
    ${pluginWorkbenchClientBootstrap(undefined, true)}
    document.addEventListener("click", (event) => { const btn = event.target?.closest?.("[data-sessions-open-scope]"); if (btn) void deferredClients.loadBundle("sessions").then(() => globalThis.molisOpenSessionsScope?.(btn.dataset.sessionsOpenScope === "project_ai_read" ? "project_ai_read" : "tools", { overlay: !btn.closest('[data-work-surface="sessions"]') })); });
    assistantIsland = (${ASSISTANT_ISLAND_FACTORY_SCRIPT})({ translate: readText, showToast, route, headers: () => molisWorkControlHeaders(), interaction, receipts,
      positions: projectPositions, positionRead, lineFocus: (subject) => workLine?.focus(subject), lineEvent: (subject) => workLine?.event(subject) || null, lineEvents: workLine ? () => workLine.events() : undefined,
      linePlaced: (task) => workLine?.placed(task) || '', lineWaiting: () => workLine?.waiting() || [], lineWaitingGo: (key) => workLine?.goWaiting(key), linePlace: (subject) => workLine?.place(subject), lineCard: workLine ? (slot, card) => workLine.card(slot, card) : undefined,
      lineConversation: (now) => workLine?.conversation(now), lineAttention: () => workLine?.conversation({ unread: false }),
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title), pluginTitle: (plugin) => tabWorkspace?.pluginTitle(plugin),
      project: { id: state.project?.project_id || state.snapshot.board.project_id, title: state.project?.display_name || "" },
    });
    (${CONTEXT_ACTIONS_FACTORY_SCRIPT})({ translate: readText, showToast, route, headers: () => molisWorkControlHeaders(), paneMessages, records: workRecords,
      openSearch: (query) => globalSearchPalette?.open(document.activeElement, query) });
    globalThis.molisPlacement = (${PLACEMENT_FACTORY_SCRIPT})({ translate: readText, route, headers: () => molisWorkControlHeaders(), itemTabs,
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title), openPluginRecord: (plugin, id) => tabWorkspace?.openPluginRecord(plugin, id),
      openGoalWork: () => tabWorkspace?.openGoalWork(), closeItem: (plugin, id) => tabWorkspace?.closeItem(plugin, id), projectTitle: state.project?.display_name || "" });
    // The 「依据」 panel of a round's Skills (browser/skill-picks.ts): asked for by the Assistant's line and by Coding's through its frame.
    globalThis.molisWorkHomeView?.mountSkillPicks({ project: state.project?.project_id || null, card: (...args) => globalThis.molisPlacement.card(...args) });
    ${CONNECTORS_SETTINGS_CLIENT_SCRIPT}
    ${SYNC_SETTINGS_CLIENT_SCRIPT}
    const settingsDirectory = (${SETTINGS_DIRECTORY_FACTORY_SCRIPT})({
      translate: readText,
      setDirectory: (...args) => setDesktopDirectory(...args),
      setExclusive: (surface) => tabWorkspace?.setExclusive(surface),
      closeCover: () => tabWorkspace?.closeCover?.(),
      openCover: (kind) => tabWorkspace?.openCover?.(kind),
      noteCover: (kind, place, replace) => tabWorkspace?.noteCover?.(kind, place, replace),
      registerCover: (kind, open) => tabWorkspace?.registerCover?.(kind, open),
      hideDirectory: () => immersiveNavigation?.hideDirectory(),
      showToast,
      projectId: state.project?.project_id || "",
      returns: settingsReturn,
      coverKind: () => tabWorkspace?.exclusive?.() || null,
    });
    if (goalData) bindGoalCreateEvents();
    addEventListener("popstate", (event) => {
      if (localPathname() === "/" && !collectionView) {
        setDesktopDirectory("root", false, false);
        if (!openWorkbenchSurface("home")) setDesktopWorkSurface("home");
      } else if (goalData) handleGoalPopState(event);
    });
    if (goalData) addEventListener("hashchange", handleGoalHashChange);
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
      if (goalData && handleGoalFactorKeyboard(event)) return;
      if (goalData && handleTreeKeyboard(event)) return;
      if (goalData) handleGoalDialogEscape(event);
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

    setTreeWidth(treePane.getBoundingClientRect().width, false);
    if (tuiPane) setTuiWidth(tuiPane.getBoundingClientRect().width, false);
    let restoredUi = false;
    let restoredMobileView = "";
    let resetTabLayout = false;
    for (const key of [goalUiStorageKey, ...["current", "archive", "trash"].map(view => goalUiStorageKey + ":" + view)]) {
      try {
        const ui = JSON.parse(sessionStorage.getItem(key) || "null");
        if (ui && (Object.hasOwn(ui, "feedTask") || Object.hasOwn(ui, "goalView")
          || Object.values(ui.feedPresets || {}).some(preset => preset && Object.hasOwn(preset, "task")))) {
          sessionStorage.removeItem(key); resetTabLayout = true;
        }
      } catch { /* Unreadable caches are ignored by the existing restore below. */ }
    }
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(storageKey) ||
        (!collectionView ? sessionStorage.getItem(goalUiStorageKey) : null) ||
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
      if (goalData) {
        bindGoalEventDocument();
        openEventReaderFromHash();
        const initialFactor = goalFactorFromHash();
        if (initialFactor) setGoalFactor(initialFactor, false);
      }
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
    tabWorkspace?.restore(directGoalRequested && !restoredNavigation ? selected : "", resetTabLayout);
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
    if (!tabWorkspace && !directGoalRequested && !restoredNavigation && !collectionView) {
      goalWorkspaceMode = "graph";
      setDesktopDirectory("root", false, false);
      setDesktopWorkSurface("home", false, false);
      saveUiState();
    }
    if (!tabWorkspace && directGoalRequested && selected && !restoredNavigation) {
      goalWorkspaceMode = "focus";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goals", false, false);
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
        const goalsSurface = q('[data-work-surface="goals"]');
        const terminalPluginId = tuiPane.dataset.tuiPluginId || pluginManifestIds.goals || "";
        const terminalSubjectKind = tuiPane.dataset.tuiSubjectKind || "goal";
        const selectedItem = visibleGoals().find((entry) => entry.goal.goal_id === selected);
        if (terminalPluginId && terminalSubjectKind) {
          tuiPane.setAttribute("data-tui-plugin-id", terminalPluginId);
          tuiPane.setAttribute("data-tui-subject-kind", terminalSubjectKind);
          tuiPane.setAttribute("data-tui-subject-id", selected);
          document.dispatchEvent(new CustomEvent("molis-work:work-terminal-subject-changed", { detail: {
            pluginId: terminalPluginId,
            subjectKind: terminalSubjectKind,
            subjectId: selected,
            title: selectedItem?.goal.title || selected,
            status: selectedItem?.status || "",
            statusLabel: selectedItem?.status_label || "",
            statusMeaning: selectedItem?.status_meaning || "",
            statusIconMarkup: selectedItem?.status_icon || "",
            readOnly: selectedItem?.terminal_read_only || null,
          } }));
        }
        document.dispatchEvent(new CustomEvent("molis-work:record-selected", { detail: {
          plugin: goalsSurface?.dataset.workSurface || "goals",
          itemId: selected,
          title: selectedItem?.goal.title || selected,
        } }));
      } catch {}
    }
    immersiveNavigation?.sync();
    frameContainer?.restore();
    tabWorkspace?.apply();
    if (directGoalRequested && selected && !restoredNavigation && tabWorkspace) {
      tabWorkspace.openItem("goals", selected);
    } else if (tabWorkspace && !directGoalRequested && !collectionView) {
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
    // An address the project does not have opens here (the server sends it with ?missing=): say so, then forget it.
    // An installed plugin opens only if this workbench actually rendered its stage.
    const askedSurface = new URLSearchParams(location.search).get("openSurface");
    if (askedSurface && desktopWorkSurfaces.some(stage => stage.dataset.installedPlugin && stage.dataset.workSurface === askedSurface)) {
      const cleaned = new URL(location.href); cleaned.searchParams.delete("openSurface"); history.replaceState(history.state, "", cleaned);
      setTimeout(() => { const entry = [...document.querySelectorAll("[data-work-surface-open]")].find((el) => el.dataset.workSurfaceOpen === askedSurface); if (entry) openSurfaceEntry(askedSurface, entry); }, 0);
    }
    const missingPage = new URLSearchParams(location.search).get("missing");
    if (missingPage) {
      showToast(globalThis.t.text("workbench.initialization.page-does-not-exist-path", { path: missingPage }), true);
      const cleaned = new URL(location.href); cleaned.searchParams.delete("missing");
      history.replaceState(history.state, "", cleaned);
    }
    // A project reference (a file in the project that evidence points to) opens in an overlay here, never a new tab.
    const referenceDialog = document.querySelector("[data-project-reference-dialog]");
    let referenceRequest = null;
    referenceDialog?.addEventListener("close", () => { if (!referenceDialog.open) { referenceRequest?.abort(); referenceRequest = null; } });
    boardLifetime.own(() => referenceRequest?.abort());
    referenceDialog?.addEventListener("click", (event) => { if (event.target?.closest?.("[data-dialog-close]")) referenceDialog.close(); });
    document.addEventListener("click", async (event) => {
      const link = event.target?.closest?.("a[data-project-reference]");
      if (!link || !referenceDialog || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const href = link.getAttribute("href") || "";
      const url = href.startsWith("/api/") ? route(href) : href;
      referenceRequest?.abort();
      const request = new AbortController(); referenceRequest = request;
      const body = referenceDialog.querySelector("[data-project-reference-body]");
      referenceDialog.querySelector("#project-reference-title").textContent = link.textContent.trim() || globalThis.t.text("workbench.initialization.project-reference");
      referenceDialog.querySelector("[data-project-reference-download]").href = url;
      body.textContent = globalThis.t.text("workbench.initialization.loading");
      if (!referenceDialog.open) referenceDialog.showModal();
      try {
        const text=await molisWorkRequest(url,{as:"text",signal:request.signal,fallback:globalThis.t.text("workbench.initialization.project-reference-could-not-be-opened")});
        if (referenceRequest === request && referenceDialog.open) body.textContent = text;
      } catch (error) { if (referenceRequest === request && referenceDialog.open && !request.signal.aborted) molisWorkRequest.show(body,error,globalThis.t.text("workbench.initialization.project-reference-could-not-be-opened")); }
    });
    const restartWorkspace = document.querySelector("[data-tab-workspace]");
    document.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("button[data-project-plugin-restart]");
      const stage = button?.closest("[data-work-surface]"), parent = stage?.parentElement;
      const holder = parent?.matches("[data-tab-pane-body]") ? parent.parentElement?.parentElement : parent;
      const operation = button?.dataset.projectPluginRestart, pluginId = button?.dataset.restartPlugin;
      if (!button || button.disabled || !pluginId || !["restart", "release-quarantine"].includes(operation)
        || !stage?.matches('[data-project-plugin-unavailable="workbench"]') || button.parentElement !== stage.firstElementChild
        || parent?.closest("[data-work-surface]") || holder?.parentElement !== restartWorkspace
        || !holder?.matches("[data-surface-pool], [data-tab-panes], [data-tab-exclusive]")) return;
      button.disabled = true;
      try { await molisWorkRequest(route("/api/plugins/" + encodeURIComponent(pluginId) + "/" + operation), { body: {}, fallback: globalThis.t.text("workbench.initialization.couldn-t-change-plugin-state") }); location.reload(); }
      catch (error) { const note = button.nextElementSibling; if (error.status === 409 && typeof error.body?.state?.message === "string") error.message = error.body.state.message; molisWorkRequest.show(note, error); note.hidden = false; button.disabled = false; }
    });
    if (goalData) {
      updateRelationPreviews();
      updateAllRelationFormPreviews();
    }
    // Off the Goal stage, fold attention hints into the next board poll (W4-10).
    // Goals' snapshot cursor belongs to another journal; neither projection has acknowledged a platform cursor yet.
    boardLifetime.poll(async signal => {
      boardVisibleSignal = signal;
      if (!goalData) return;
      if (goalStageVisible()) await refreshBoard(false, signal);
      else if (observedBoardCursor !== undefined && observedBoardCursor !== goalData.boardCursor) await refreshBoard(false, signal, observedBoardCursor);
    }, 4000);
    boardLifetime.listen(document, "molis-work:attention", event => {
      const cursor = event.detail?.board_cursor;
      if (!goalData || typeof cursor !== "number") return;
      observedBoardCursor = Math.max(observedBoardCursor ?? cursor, cursor);
      if (goalStageVisible()) void refreshBoard(false, boardVisibleSignal, observedBoardCursor);
    });
    const refreshVisibleGoal = () => { if (goalData && goalStageVisible()) void refreshBoard(); };
    boardLifetime.listen(document, "molis-work:place-changed", () => requestAnimationFrame(refreshVisibleGoal));
    boardLifetime.listen(window, "resize", refreshVisibleGoal);
    boardLifetime.own(() => clearTimeout(deferredRefreshTimer));
  })();
`;
