import { PANE_MESSAGES_SCRIPT } from "./pane-messages.js";

/**
 * AP3 Workbench client segment: bootstrap.
 *
 * Notes on the script below. They are kept here rather than inside it because the script is served as it stands: a
 * comment inside it is bytes the browser downloads and never runs.
 *
 * - `paneMessages`: the one split-pane message check (S-30, `pane-messages.ts`), handed to the factories that listen for
 *   pane messages (the tab workspace, the context actions) so the page carries it once.
 * - `settingsReturn`: this window's return trips (settings-return.ts), set up before anything mounts a frame; it reads the tab
 *   workspace only when asked, so it does not wait for it.
 */
export const CLIENT_BOOTSTRAP_SCRIPT = `  (() => {
    const q = (selector) => document.querySelector(selector);
    const goalData = q("#molis-work-data");
    let state = goalData ? JSON.parse(goalData.textContent) : { project: { project_id: document.body.dataset.projectId } };
    const workspace = q("[data-workspace]");
    const documentPane = q("[data-document-pane]");
    const treePane = q("#goal-tree-pane");
    const treeResizer = q("[data-tree-resizer]");
    const tuiResizer = q("[data-tui-resizer]");
    const tuiPane = q("[data-tui-pane]");
    const treeScroll = q("[data-tree-scroll]");
    const globalSearch = q("[data-global-search]");
    const treeFilter = q("[data-tree-filter]");
    const treeFilterTrigger = q("[data-tree-filter-trigger]");
    const desktopDirectoryPanels = [...document.querySelectorAll("[data-directory-panel]")];
    const desktopWorkSurfaces = [...document.querySelectorAll("[data-work-surface]")];
    const projectMenus = [...document.querySelectorAll("[data-project-menu]")];
    const dialog = q("[data-create-dialog]");
    const form = q("[data-create-form]");
    const toast = q("[data-toast]");
    const archiveView = document.body.dataset.boardView === "archive";
    const trashView = document.body.dataset.boardView === "trash";
    const collectionView = archiveView || trashView;
    const documentCollection = trashView ? "trash" : archiveView ? "archive" : "current";
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname) => routePrefix + pathname;
    const api = (pathname,method,body,msg="来源操作失败") => molisWorkRequest(route(pathname), {method,body:body==null?undefined:body,fallback:L(msg)});
    const localPathname = () => routePrefix && location.pathname.startsWith(routePrefix)
      ? location.pathname.slice(routePrefix.length) || "/"
      : location.pathname;
    const visibleGoals = (source = state) => source === state && !goalData ? [] : trashView ? source.trashed_goals : archiveView ? source.archived_goals : source.goals;
    const goalUiStorageKey = "molis-work-ui:" + (state.project?.project_id || state.snapshot.board.project_id);
    const currentGoalUiStorageKey = goalUiStorageKey + ":current";
    const storageKey = trashView
      ? goalUiStorageKey + ":trash"
      : archiveView
        ? goalUiStorageKey + ":archive"
        : currentGoalUiStorageKey;
    const goalMoveReceiptKey = "molis-work-goal-move-receipt:" + (state.project?.project_id || state.snapshot.board.project_id);
    const desktopNavigationStateVersion = 4;
    let immersiveNavigation = null;
    let frameContainer = null;
    let tabWorkspace = null;
    const paneMessages = ${PANE_MESSAGES_SCRIPT};
    const settingsReturn = molisWorkSettingsReturn({ translate: (...args) => L(...args), projectId: state.project?.project_id || "", prefix: routePrefix,
      tabWorkspace: () => tabWorkspace, showToast: (...args) => showToast(...args), setDirectory: (...args) => setDesktopDirectory(...args) });
    let projectHome = null;
    let pluginWorkbench = null;
    let globalSearchPalette = null;
    let desktopDirectoryOrigin = null;
    let activeDesktopSurface = document.body.dataset.desktopSurface || "goals";
    let desktopSurfaceScroll = {};
    let goalWorkspaceMode = "graph";
    let selected = q("[data-goal-view]:not([hidden])")?.dataset.goalView || (collectionView ? "" : state.active_goal_id) || "";
    const initialHistoryState = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...initialHistoryState, goalId: selected }, "", location.href);
    let syncing = false;
    let deferredClients = null;
    let boardLifetime = null;
    let boardVisibleSignal = null;
    let saveTimer;
    let saveUiState = () => {};
    const queueSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveUiState(), 120);
    };
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let searchBusyUntil = 0;
    let deferredRefreshTimer;
    let stageListGestureTimer;
    let navigatorView = "list";
    let desktopCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;

`;
