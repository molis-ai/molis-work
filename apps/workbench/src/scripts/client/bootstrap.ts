import { PANE_MESSAGES_SCRIPT } from "./pane-messages.js";

/**
 * AP3 Workbench client segment: bootstrap.
 *
 * Notes on the script below. They are kept here rather than inside it because the script is served as it stands: a
 * comment inside it is bytes the browser downloads and never runs.
 *
 * - `paneMessages`: the one split-pane message check (S-30, `pane-messages.ts`), handed to the factories that listen for
 *   pane messages (the tab workspace, the context actions) so the page carries it once.
 * - `feedDirectory … feedSourceProgress`: Feed's pages and its source directory are wired from these variables. The
 *   pages are in the page whether or not the project has Feed (they fill when it does) and the source directory only
 *   while it does, so they are found again when Feed comes or goes (adoptFeed); what was bound to a container stays
 *   bound, its contents are what change.
 */
export const CLIENT_BOOTSTRAP_SCRIPT = `  (() => {
    const q = (selector) => document.querySelector(selector);
    let state = JSON.parse(q("#molis-work-data").textContent);
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
    let feedDirectory, feedWorkbench, feedList, feedSearch, feedFilterTrigger, feedFilterPanel, feedFilterBadge, feedFilterReset,
      feedSourceFilter, feedTypeFilter, feedTimeFilter, feedStatusFilter, feedSort, feedResultCount, feedEmpty, feedDetailEmpty,
      sourceDirectory, sourceWorkbench, sourceList, sourceResultCount, sourceEmpty, feedSourcesDialog, feedSourceError, feedSourceProgress;
    const findFeedNodes = () => {
      feedDirectory = q("[data-feed-directory]");
      feedWorkbench = q("[data-feed-workbench]");
      feedList = q("[data-feed-list]");
      feedSearch = q("[data-feed-search]");
      feedFilterTrigger = q("[data-feed-filter-trigger]");
      feedFilterPanel = q("[data-feed-filter-panel]");
      feedFilterBadge = q("[data-feed-filter-badge]");
      feedFilterReset = q("[data-feed-filter-reset]");
      feedSourceFilter = q("[data-feed-source-filter]");
      feedTypeFilter = q("[data-feed-type-filter]");
      feedTimeFilter = q("[data-feed-time-filter]");
      feedStatusFilter = q("[data-feed-status-filter]");
      feedSort = q("[data-feed-sort]");
      feedResultCount = q("[data-feed-result-count]");
      feedEmpty = q("[data-feed-empty]");
      feedDetailEmpty = q("[data-feed-detail-empty]");
      sourceDirectory = q("[data-source-directory]");
      sourceWorkbench = q("[data-source-workbench]");
      sourceList = q("[data-source-list]");
      sourceResultCount = q("[data-source-result-count]");
      sourceEmpty = q("[data-source-empty]");
      feedSourcesDialog = q("[data-feed-sources-dialog]");
      feedSourceError = feedSourcesDialog?.querySelector("[data-feed-source-error]");
      feedSourceProgress = feedSourcesDialog?.querySelector("[data-feed-source-progress]");
    };
    findFeedNodes();
    const dialog = q("[data-create-dialog]");
    const form = q("[data-create-form]");
    const toast = q("[data-toast]");
    const archiveView = document.body.dataset.boardView === "archive";
    const trashView = document.body.dataset.boardView === "trash";
    const collectionView = archiveView || trashView;
    const documentCollection = trashView ? "trash" : archiveView ? "archive" : "current";
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname) => routePrefix + pathname;
    const feedApi = "/api/plugins/io.molis.work.feed";
    const api = (pathname,method,body,msg="来源操作失败") => molisWorkRequest(route(pathname), {method,body:body==null?undefined:body,fallback:L(msg)});
    const markFeedItemRead = async (row, entryId) => {
      if (
        !row || row.dataset.feedEntryType !== "feed" ||
        row.dataset.feedEntryPersisted !== "true" ||
        row.dataset.feedEntryRead === "read" ||
        row.dataset.feedReadPending === "true"
      ) return;
      const itemId = row.dataset.feedItemId || entryId;
      row.dataset.feedReadPending = "true";
      const detail = feedWorkbench?.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
      const status = detail?.querySelector("[data-feed-action-status]");
      try {
        await api(feedApi + "/items/" + encodeURIComponent(itemId) + "/read", "POST", {});
        row.dataset.feedEntryRead = "read";
        if (detail) detail.dataset.feedDetailRead = "read";
        row.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        const readMark = row.querySelector(".feed-entry-status:has([data-feed-read-state])");
        if (readMark) {
          const ring = readMark.querySelector("[data-mw-state]"); if (ring) ring.dataset.mwState = "read";
          readMark.classList.remove("mw-status--attention");
          readMark.classList.add("mw-status--quiet");
        }
        detail?.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); label.dataset.mwState = "read"; });
        if (status?.dataset.feedReadError === "true") {
          status.hidden = true;
          delete status.dataset.feedReadError;
        }
      } catch(error) {
        if (status) {
          molisWorkRequest.show(status,error);status.prepend(document.createTextNode(L("已打开，但未能保存已读状态；重新选择该 Item 即可重试")+" "));
          status.dataset.feedReadError = "true";
          status.hidden = false;
        }
      } finally {
        delete row.dataset.feedReadPending;
      }
    };
    const setFeedSourceFeedback = (message, error = false) => {
      if (message && feedSourcesDialog?.hidden) showToast(message,error);
      if (feedSourceError) feedSourceError.hidden = !error;
      if (feedSourceProgress) feedSourceProgress.hidden = error || !message;
      if(error && feedSourceError){if(typeof message==="string")feedSourceError.textContent=message;else molisWorkRequest.show(feedSourceError,message);}
      if (!error && feedSourceProgress) feedSourceProgress.textContent = message;
    };
    if (new URLSearchParams(location.search).get("feed-auth") === "gmail") {
      queueMicrotask(() => {
        showFeedSetup("setup", "gmail");
        setFeedSourceFeedback(L("Gmail 授权完成，账号已成为独立来源。"));
      });
    }
    const localPathname = () => routePrefix && location.pathname.startsWith(routePrefix)
      ? location.pathname.slice(routePrefix.length) || "/"
      : location.pathname;
    const visibleGoals = (source = state) => trashView ? source.trashed_goals : archiveView ? source.archived_goals : source.goals;
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
    let projectHome = null;
    let pluginWorkbench = null;
    let globalSearchPalette = null;
    let desktopDirectoryOrigin = null;
    let activeDesktopSurface = document.body.dataset.desktopSurface || "goals";
    let activeFeedPreset = feedDirectory?.dataset.feedPreset || "feed";
    let selectedFeedItem = feedList?.querySelector("[data-feed-entry-id].is-selected")?.dataset.feedEntryId || "";
    let selectedSource = sourceList?.querySelector("[data-source-entry-id].is-selected")?.dataset.sourceEntryId || "";
    let activeSourceFilter = "all";
    let selectedFeedTask = "all";
    let feedQuickFilter = "all";
    const defaultFeedPresetState = () => ({
      quick: "all",
      selected: "",
      query: "",
      source: "all",
      type: "all",
      time: "all",
      status: "active",
      sort: "newest",
    });
    let feedPresetState = {
      feed: defaultFeedPresetState(),
    };
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
    let feedWorkbenchRequest = null;
    let feedDetailRequest = null;
    let searchBusyUntil = 0;
    let deferredRefreshTimer;
    let stageListGestureTimer;
    let navigatorView = "list";
    let desktopCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;

`;
