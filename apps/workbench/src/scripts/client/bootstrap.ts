import { GOALS_WORK_TABS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
/** AP3 Workbench client segment: bootstrap. */
export const CLIENT_BOOTSTRAP_SCRIPT = `  (() => {
    let state = JSON.parse(document.querySelector("#molis-work-data").textContent);
    const workspace = document.querySelector("[data-workspace]");
    const documentPane = document.querySelector("[data-document-pane]");
    const treePane = document.querySelector("#goal-tree-pane");
    const treeResizer = document.querySelector("[data-tree-resizer]");
    const tuiResizer = document.querySelector("[data-tui-resizer]");
    const tuiPane = document.querySelector("[data-tui-pane]");
    const treeScroll = document.querySelector("[data-tree-scroll]");
    const globalSearch = document.querySelector("[data-global-search]");
    const treeSearch = globalSearch;
    const treeFilter = document.querySelector("[data-tree-filter]");
    const treeFilterTrigger = document.querySelector("[data-tree-filter-trigger]");
    const desktopDirectoryPanels = [...document.querySelectorAll("[data-directory-panel]")];
    const desktopWorkSurfaces = [...document.querySelectorAll("[data-work-surface]")];
    const projectMenus = [...document.querySelectorAll("[data-project-menu]")];
    const workTabs = document.querySelector("[data-work-tabs]");
    const feedDirectory = document.querySelector("[data-feed-directory]");
    const feedWorkbench = document.querySelector("[data-feed-workbench]");
    const feedList = document.querySelector("[data-feed-list]");
    const feedSearch = document.querySelector("[data-feed-search]");
    const feedFilterTrigger = document.querySelector("[data-feed-filter-trigger]");
    const feedFilterPanel = document.querySelector("[data-feed-filter-panel]");
    const feedFilterBadge = document.querySelector("[data-feed-filter-badge]");
    const feedFilterSummary = document.querySelector("[data-feed-filter-summary]");
    const feedFilterReset = document.querySelector("[data-feed-filter-reset]");
    const feedSourceFilter = document.querySelector("[data-feed-source-filter]");
    const feedTypeFilter = document.querySelector("[data-feed-type-filter]");
    const feedTimeFilter = document.querySelector("[data-feed-time-filter]");
    const feedStatusFilter = document.querySelector("[data-feed-status-filter]");
    const feedSort = document.querySelector("[data-feed-sort]");
    const feedResultCount = document.querySelector("[data-feed-result-count]");
    const feedEmpty = document.querySelector("[data-feed-empty]");
    const feedDetailEmpty = document.querySelector("[data-feed-detail-empty]");
    const sourceDirectory = document.querySelector("[data-source-directory]");
    const sourceWorkbench = document.querySelector("[data-source-workbench]");
    const sourceList = document.querySelector("[data-source-list]");
    const sourceSearch = document.querySelector("[data-source-search]");
    const sourceResultCount = document.querySelector("[data-source-result-count]");
    const sourceEmpty = document.querySelector("[data-source-empty]");
    const feedSourcesDialog = document.querySelector("[data-feed-sources-dialog]");
    const feedSourceError = feedSourcesDialog?.querySelector("[data-feed-source-error]");
    const feedSourceProgress = feedSourcesDialog?.querySelector("[data-feed-source-progress]");
    const relayImportDialog = document.querySelector("[data-relay-import-dialog]");
    const mobileTreeTab = document.querySelector('[data-mobile-target="tree"]');
    const mobileDocumentTab = document.querySelector('[data-mobile-target="document"]');
    const mobileDirectoryTab = document.querySelector("[data-mobile-directory-root]");
    const defaultMobileTreeLabel = mobileTreeTab?.textContent || L("目标");
    const defaultMobileDocumentLabel = mobileDocumentTab?.textContent || L("聚焦");
    const dialog = document.querySelector("[data-create-dialog]");
    const form = document.querySelector("[data-create-form]");
    const toast = document.querySelector("[data-toast]");
    const archiveView = document.body.dataset.boardView === "archive";
    const trashView = document.body.dataset.boardView === "trash";
    const decisionView = document.body.dataset.boardView === "decisions";
    const collectionView = archiveView || trashView;
    const documentCollection = trashView ? "trash" : archiveView ? "archive" : "current";
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname) => routePrefix + pathname;
    const feedApi = async (pathname, method, body) => {
      const response = await fetch(route(pathname), {
        method,
        headers: molisWorkControlHeaders(),
        body: body == null ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("来源操作失败"));
      return result;
    };
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
        await feedApi("/api/feed/items/" + encodeURIComponent(itemId) + "/read", "POST", {});
        row.dataset.feedEntryRead = "read";
        if (detail) detail.dataset.feedDetailRead = "read";
        row.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        detail?.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        if (status?.dataset.feedReadError === "true") {
          status.hidden = true;
          delete status.dataset.feedReadError;
        }
      } catch {
        if (status) {
          status.textContent = L("已打开，但未能保存已读状态；重新选择该 Item 即可重试");
          status.dataset.feedReadError = "true";
          status.hidden = false;
        }
      } finally {
        delete row.dataset.feedReadPending;
      }
    };
    const setFeedSourceFeedback = (message, error = false) => {
      if (feedSourceError) feedSourceError.hidden = !error;
      if (feedSourceProgress) feedSourceProgress.hidden = error || !message;
      if (error && feedSourceError) feedSourceError.textContent = message;
      if (!error && feedSourceProgress) feedSourceProgress.textContent = message;
    };
    if (new URLSearchParams(location.search).get("feed-auth") === "gmail") {
      queueMicrotask(() => {
        feedSourcesDialog?.showModal();
        setFeedSourceFeedback(L("Gmail 授权完成，账号已成为独立来源。"));
      });
    }
    const localPathname = () => routePrefix && location.pathname.startsWith(routePrefix)
      ? location.pathname.slice(routePrefix.length) || "/"
      : location.pathname;
    const decisionFeedEntryFromHash = () => {
      const prefix = "#decision-goal-";
      if (!decisionView || !location.hash.startsWith(prefix)) return "";
      return "decision:" + decodeURIComponent(location.hash.slice(prefix.length));
    };
    const visibleGoals = (source = state) => trashView ? source.trashed_goals : archiveView ? source.archived_goals : source.goals;
    const goalUiStorageKey = "molis-work-ui:" + (state.project?.project_id || state.snapshot.board.board_id);
    const currentGoalUiStorageKey = goalUiStorageKey + ":current";
    const storageKey = decisionView
      ? goalUiStorageKey + ":inbox"
      : trashView
        ? goalUiStorageKey + ":trash"
        : archiveView
          ? goalUiStorageKey + ":archive"
          : currentGoalUiStorageKey;
    const goalMoveReceiptKey = "molis-work-goal-move-receipt:" + (state.project?.project_id || state.snapshot.board.board_id);
    const workTabsStorageKey = "molis-work-work-tabs:" + (state.project?.project_id || state.snapshot.board.board_id);
    const desktopNavigationStateVersion = 4;
    let immersiveNavigation = null;
    let frameContainer = null;
    let projectHome = null;
    let pluginWorkbench = null;
    let desktopDirectoryOrigin = null;
    let activeDesktopSurface = document.body.dataset.desktopSurface || (decisionView ? "inbox" : "goal");
    let activeFeedPreset = feedDirectory?.dataset.feedPreset || "feed";
    let selectedFeedItem = feedList?.querySelector("[data-feed-entry-id].is-selected")?.dataset.feedEntryId || "";
    let selectedSource = sourceList?.querySelector("[data-source-entry-id].is-selected")?.dataset.sourceEntryId || "";
    let activeSourceFilter = "all";
    const defaultFeedPresetState = () => ({
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
    let goalWorkspaceMode = "focus";
    let selected = decisionView ? "" : document.querySelector("[data-goal-view]:not([hidden])")?.dataset.goalView || (collectionView ? "" : state.active_goal_id || visibleGoals()[0]?.goal.goal_id) || "";
    if (!decisionView) {
      const initialHistoryState = history.state && typeof history.state === "object" ? history.state : {};
      history.replaceState({ ...initialHistoryState, goalId: selected }, "", location.href);
    }
    let toastTimer;
    let syncing = false;
    let saveTimer;
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let quickRecordRequest = null;
    let feedWorkbenchRequest = null;
    let feedDetailRequest = null;
    let searchBusyUntil = 0;
    let deferredRefreshTimer;
    let navigatorView = "list";
    let desktopCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;
    const { appendGoalWorkTabs, persistWorkTabs, ensureWorkTab,
      handleGoalWorkTabClick, handleGoalWorkTabKeyboard } = (${GOALS_WORK_TABS_CLIENT_FACTORY_SCRIPT})({
        workTabs, decisionView, collectionView, visibleGoals,
        getSelected: () => selected, getActiveSurface: () => activeDesktopSurface,
        readStoredTabs: () => JSON.parse(localStorage.getItem(workTabsStorageKey) || localStorage.getItem("goalboard-work-tabs:" + (state.project?.project_id || state.snapshot.board.board_id)) || "[]"),
        writeStoredTabs: (tabs) => localStorage.setItem(workTabsStorageKey, JSON.stringify(tabs)),
        renderWorkTabs: () => renderWorkTabs(), selectGoal: (...args) => selectGoal(...args),
        setDesktopDirectory: (...args) => setDesktopDirectory(...args),
        setDesktopWorkSurface: (...args) => setDesktopWorkSurface(...args),
        showToast: (...args) => showToast(...args), translate: L,
      });

`;
