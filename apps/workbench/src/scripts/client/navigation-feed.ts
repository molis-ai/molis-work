/** AP3 Workbench client segment: navigation-feed. */
export const CLIENT_NAVIGATION_FEED_SCRIPT = `
    const renderWorkTabs = () => {
      immersiveNavigation?.sync();
      if (!workTabs) return;
      const byId = new Map(visibleGoals().map((item) => [item.goal.goal_id, item]));
      const fragment = document.createDocumentFragment();
      appendGoalWorkTabs(fragment, byId);
      if (activeDesktopSurface !== "goal" || decisionView || collectionView) {
        const surface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === activeDesktopSurface);
        if (surface) {
          const utility = document.createElement("div");
          utility.className = "desktop-work-tab is-selected is-utility";
          const label = document.createElement("span");
          label.id = "desktop-work-tab-utility";
          label.role = "tab";
          label.tabIndex = 0;
          label.dataset.utilityWorkTab = activeDesktopSurface;
          label.setAttribute("aria-selected", "true");
          label.setAttribute("aria-controls", "goal-document-pane");
          label.textContent = surface.dataset.workSurfaceLabel || activeDesktopSurface;
          utility.append(label);
          fragment.append(utility);
        }
      }
      workTabs.replaceChildren(fragment);
      const activeTab = workTabs.querySelector('[data-work-tab][aria-selected="true"]');
      const activeUtilityTab = workTabs.querySelector('[data-utility-work-tab][aria-selected="true"]');
      if (activeTab?.id) documentPane.setAttribute("aria-labelledby", activeTab.id);
      else if (activeUtilityTab?.id) documentPane.setAttribute("aria-labelledby", activeUtilityTab.id);
      else documentPane.removeAttribute("aria-labelledby");
      persistWorkTabs();
      ensureActiveWorkTabVisible();
    };

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
            workSurface: "goal",
          }));
        }
      } catch {}
      const available = new Set(visibleGoals().map((item) => item.goal.goal_id));
      if (!available.has(goalId)) goalId = state.active_goal_id || visibleGoals()[0]?.goal.goal_id || "";
      location.assign(globalThis.goalboardNavigationUrl(goalId ? route("/goals/" + encodeURIComponent(goalId)) : route("/")));
    };

    const setDesktopWorkSurface = (surface, persist = true, restoreScroll = true) => {
      if (!desktopWorkSurfaces.length) return false;
      const nextSurface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === surface);
      if (!nextSurface) {
        if (surface === "goal") restoreLastGoal(true);
        return false;
      }
      if (activeDesktopSurface && activeDesktopSurface !== surface) {
        desktopSurfaceScroll[activeDesktopSurface] = (activeDesktopSurface === "goal" ? documentPane : desktopWorkSurfaces.find(item => item.dataset.workSurface === activeDesktopSurface))?.scrollTop || 0;
        if (activeDesktopSurface === "goal") goalWorkspaceMode = workspace.dataset.workspaceMode || "focus";
      }
      activeDesktopSurface = surface;
      document.body.dataset.desktopSurface = surface;
      if (mobileTreeTab) mobileTreeTab.textContent = surface === "feed"
        ? (activeFeedPreset === "feed" ? "Feed" : "Inbox")
        : surface === "sources"
          ? L("来源")
          : surface === "sessions"
            ? "Sessions"
            : defaultMobileTreeLabel;
      if (mobileDocumentTab) mobileDocumentTab.textContent = surface === "feed" || surface === "sources" || surface === "sessions"
        ? L("详情")
        : defaultMobileDocumentLabel;
      desktopWorkSurfaces.forEach((candidate) => {
        candidate.hidden = candidate !== nextSurface;
      });
      document.querySelectorAll("[data-work-surface-open], [data-work-surface-link]").forEach((item) => {
        const active = (item.dataset.workSurfaceOpen || item.dataset.workSurfaceLink) === surface &&
          (surface !== "feed" || !item.dataset.feedPreset || item.dataset.feedPreset === activeFeedPreset);
        item.classList.toggle("is-current", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      setWorkspaceMode(surface === "goal" ? goalWorkspaceMode : "focus", false);
      renderWorkTabs();
      const label = nextSurface.dataset.workSurfaceLabel || surface;
      documentPane.setAttribute("aria-label", label);
      requestAnimationFrame(() => {
        const scrollPane = surface === "goal" ? documentPane : nextSurface;
        scrollPane.scrollTop = restoreScroll ? Number(desktopSurfaceScroll[surface] || 0) : 0;
      });
      pluginWorkbench?.open(surface);
      if (surface === "feed") void ensureFeedWorkbenchLoaded();
      if (surface === "sources" && selectedSource) selectSource(selectedSource, false);
      if (persist) queueSave();
      return true;
    };

    const currentModuleDirectory = () => activeDesktopSurface === "feed" || activeDesktopSurface === "sources" || activeDesktopSurface === "sessions" || activeDesktopSurface === "artifacts"
      ? activeDesktopSurface
      : "goals";

    const syncMobileNavigationChrome = () => {
      const view = workspace?.dataset.mobileView || "tree";
      const graphVisible = workspace?.dataset.workspaceMode === "graph" && view === "document";
      const directoryRootActive = view === "tree" && treePane?.dataset.desktopDirectory === "root" && !graphVisible;
      const treeTab = document.querySelector('[data-mobile-target="tree"]');
      treeTab?.setAttribute("aria-controls", graphVisible ? "goal-momentum-pane" : "goal-tree-pane");
      document.querySelectorAll(".mobile-switch [role='tab']").forEach((button) => {
        const target = button.dataset.mobileTarget;
        const active = button.hasAttribute("data-mobile-directory-root")
          ? directoryRootActive
          : target === "tree"
            ? graphVisible || (view === "tree" && !directoryRootActive)
            : target === "document"
              ? view === "document" && !graphVisible
              : target === view && !directoryRootActive;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    };

    const setDesktopDirectory = (directory, persist = true, focusTarget = true, origin = null) => {
      if (!desktopDirectoryPanels.length || !treePane?.dataset.desktopDirectory) return;
      const available = new Set(desktopDirectoryPanels.map((panel) => panel.dataset.directoryPanel));
      const next = available.has(directory) ? directory : "root";
      const current = treePane.dataset.desktopDirectory;
      if (current === "root" && next !== "root" && origin?.closest?.('[data-directory-panel="root"]')) {
        desktopDirectoryOrigin = origin;
      }
      treePane.dataset.desktopDirectory = next;
      desktopDirectoryPanels.forEach((panel) => { panel.hidden = panel.dataset.directoryPanel !== next; });
      syncMobileNavigationChrome();
      immersiveNavigation?.sync();
      if (focusTarget) {
        requestAnimationFrame(() => {
          const nextPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === next);
          const nextFocus = origin?.closest?.("[data-plugin-strip]")
            ? origin
            : next === "root" && desktopDirectoryOrigin?.isConnected
            ? desktopDirectoryOrigin
            : nextPanel?.querySelector('[data-directory-back], [data-directory-open], a[href], button:not([disabled])');
          nextFocus?.focus();
        });
      }
      if (persist) queueSave();
    };

    const setSourceDetailTab = (detail, tabName, focus = false) => {
      if (!detail) return;
      detail.querySelectorAll("[data-source-detail-tab]").forEach((tab) => {
        const active = tab.dataset.sourceDetailTab === tabName;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        if (active && focus) tab.focus();
      });
      detail.querySelectorAll("[data-source-detail-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.sourceDetailPanel !== tabName;
      });
    };

    const selectSource = (sourceId, moveToDetail = false) => {
      if (!sourceList || !sourceWorkbench) return false;
      const selectedRow = [...sourceList.querySelectorAll("[data-source-entry-id]")]
        .find((row) => row.dataset.sourceEntryId === sourceId && !row.hidden);
      if (!selectedRow) return false;
      selectedSource = sourceId;
      sourceList.querySelectorAll("[data-source-entry-id]").forEach((row) => {
        const active = row === selectedRow;
        row.classList.toggle("is-selected", active);
        row.setAttribute("aria-selected", String(active));
        row.tabIndex = active ? 0 : -1;
      });
      sourceWorkbench.querySelectorAll("[data-source-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.sourceDetail !== sourceId;
      });
      const selectedDetail = sourceWorkbench.querySelector('[data-source-detail="' + CSS.escape(sourceId) + '"]');
      if (selectedDetail) setSourceDetailTab(selectedDetail, "overview");
      if (moveToDetail && matchMedia("(max-width: 760px)").matches) setMobileView("document");
      queueSave();
      return true;
    };

    const filterSources = (preserveSelection = true) => {
      if (!sourceList) return;
      const query = String(sourceSearch?.value || "").trim().toLocaleLowerCase();
      const rows = [...sourceList.querySelectorAll("[data-source-entry-id]")];
      const visible = rows.filter((row) => {
        const kind = row.dataset.sourceKind;
        const status = row.dataset.sourceStatus;
        const matchesKind = activeSourceFilter === "all" ||
          (activeSourceFilter === "account" && (kind === "github" || kind === "gmail")) ||
          (activeSourceFilter === "public" && kind === "rss") ||
          (activeSourceFilter === "attention" && status === "attention");
        const matchesQuery = !query || String(row.dataset.sourceSearchValue || "").includes(query);
        row.hidden = !(matchesKind && matchesQuery);
        return !row.hidden;
      });
      if (sourceEmpty) sourceEmpty.hidden = visible.length > 0;
      const selectedStillVisible = visible.some((row) => row.dataset.sourceEntryId === selectedSource);
      if (!preserveSelection || !selectedStillVisible) {
        const next = visible[0];
        if (next) selectSource(next.dataset.sourceEntryId, false);
        else {
          sourceWorkbench?.querySelectorAll("[data-source-detail]").forEach((detail) => { detail.hidden = true; });
          const emptyDetail = sourceWorkbench?.querySelector("[data-source-detail-empty]");
          if (emptyDetail) emptyDetail.hidden = false;
        }
      }
      queueSave();
    };

    const showPrototypeStatus = (control, message) => {
      const detail = control.closest("[data-source-detail], [data-prototype-feed-detail]");
      const status = control.closest("[data-source-detail-panel]")?.querySelector("[data-source-action-status], [data-prototype-config-status], [data-prototype-schedule-status], [data-prototype-action-status]") ||
        detail?.querySelector("[data-source-action-status], [data-prototype-config-status], [data-prototype-schedule-status], [data-prototype-action-status]");
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
    };

    const setFeedDetailPlaceholder = (title, copy, retry = false) => {
      if (!feedDetailEmpty) return;
      const titleNode = feedDetailEmpty.querySelector("[data-feed-detail-empty-title]");
      const copyNode = feedDetailEmpty.querySelector("[data-feed-detail-empty-copy]");
      const retryButton = feedDetailEmpty.querySelector("[data-retry-feed-detail]");
      if (titleNode) titleNode.textContent = title;
      if (copyNode) copyNode.textContent = copy;
      if (retryButton) retryButton.hidden = !retry;
      feedDetailEmpty.hidden = false;
    };

    const ensureFeedWorkbenchLoaded = async () => {
      if (!feedWorkbench) return false;
      if (feedWorkbench.dataset.loaded === "true" && feedWorkbench.dataset.loadedPreset === activeFeedPreset) return true;
      if (feedWorkbenchRequest) {
        const pending = feedWorkbenchRequest;
        return pending.then(() => ensureFeedWorkbenchLoaded());
      }
      const requestedPreset = activeFeedPreset;
      setFeedDetailPlaceholder(L("正在打开 Item 工作区…"), L("先载入待判断事项，再读取当前选择的正文和资料。"));
      feedWorkbench.setAttribute("aria-busy", "true");
      feedWorkbenchRequest = (async () => {
        try {
          const response = await fetch(
            route("/api/feed/workbench?preset=" + encodeURIComponent(activeFeedPreset)),
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(L("无法打开 Item 工作区"));
          const template = document.createElement("template");
          template.innerHTML = (await response.text()).trim();
          if (requestedPreset !== activeFeedPreset) return false;
          feedWorkbench.querySelectorAll(".feed-detail--decision, .feed-detail--result")
            .forEach((detail) => detail.remove());
          for (const detail of [...template.content.querySelectorAll("[data-feed-detail]")]) {
            feedWorkbench.insertBefore(detail, feedDetailEmpty);
          }
          feedWorkbench.dataset.loaded = "true";
          feedWorkbench.dataset.loadedPreset = requestedPreset;
          filterFeedItems(true);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : L("无法打开 Item 工作区");
          setFeedDetailPlaceholder(message, L("目录仍然可用，点击重试即可。"), true);
          return false;
        } finally {
          feedWorkbench.removeAttribute("aria-busy");
          feedWorkbenchRequest = null;
        }
      })();
      return feedWorkbenchRequest;
    };

    const loadFeedItemDetail = async (row, entryId) => {
      if (!feedWorkbench || !row || row.dataset.feedEntryPersisted !== "true") return;
      const itemId = row.dataset.feedItemId || entryId;
      const existing = feedWorkbench.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
      if (existing) {
        existing.hidden = selectedFeedItem !== entryId;
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
        return;
      }
      feedDetailRequest?.abort();
      const controller = new AbortController();
      feedDetailRequest = controller;
      feedWorkbench.dataset.feedLoadingItem = entryId;
      setFeedDetailPlaceholder(L("正在载入 Item…"), L("只读取当前选择的正文和资料。"));
      try {
        const inboxEntryQuery = row.dataset.inboxEntryId
          ? "&entry=" + encodeURIComponent(row.dataset.inboxEntryId)
          : "";
        const response = await fetch(
          route("/api/feed/items/" + encodeURIComponent(itemId) + "/detail?preset=" + encodeURIComponent(activeFeedPreset) + inboxEntryQuery),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取这条 Item"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        const detail = template.content.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
        if (!detail) throw new Error(L("Item 详情响应不完整"));
        if (feedDetailRequest !== controller || !feedWorkbench.isConnected) return;
        feedWorkbench.insertBefore(detail, feedDetailEmpty);
        if (row.dataset.feedEntryRead === "read") {
          detail.dataset.feedDetailRead = "read";
          detail.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        }
        feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((candidate) => {
          candidate.hidden = candidate.dataset.feedDetail !== selectedFeedItem;
        });
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
      } catch (error) {
        if (isAbortError(error) || feedDetailRequest !== controller) return;
        if (selectedFeedItem !== entryId) return;
        const message = error instanceof Error ? error.message : L("无法读取这条 Item");
        setFeedDetailPlaceholder(message, L("这条 Item 仍然保留，点击重试即可。"), true);
      } finally {
        if (feedDetailRequest === controller) {
          feedDetailRequest = null;
          delete feedWorkbench.dataset.feedLoadingItem;
        }
      }
    };

    const selectFeedItem = (itemId, moveToDetail = false, recordRead = false) => {
      if (!feedList || !feedWorkbench) return false;
      const selectedRow = [...feedList.querySelectorAll("[data-feed-entry-id]")]
        .find((row) => row.dataset.feedEntryId === itemId && !row.hidden);
      if (!selectedRow) return false;
      selectedFeedItem = itemId;
      feedList.querySelectorAll("[data-feed-entry-id]").forEach((row) => {
        const active = row === selectedRow;
        row.classList.toggle("is-selected", active);
        row.setAttribute("aria-selected", String(active));
        row.tabIndex = active ? 0 : -1;
      });
      if (feedWorkbench.dataset.loaded !== "true" || feedWorkbench.dataset.loadedPreset !== activeFeedPreset) {
        if (recordRead) void markFeedItemRead(selectedRow, itemId);
        setFeedDetailPlaceholder(L("正在打开 Item 工作区…"), L("只读取当前选择的正文和资料。"));
        return true;
      }
      const existingDetail = feedWorkbench.querySelector('[data-feed-detail="' + CSS.escape(itemId) + '"]');
      feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.feedDetail !== itemId;
      });
      if (existingDetail) {
        feedDetailRequest?.abort();
        if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      } else if (selectedRow.dataset.feedEntryPersisted === "true") {
        void loadFeedItemDetail(selectedRow, itemId);
      } else {
        setFeedDetailPlaceholder(L("无法读取这条 Item"), L("刷新页面后再试。"), true);
      }
      if (moveToDetail && matchMedia("(max-width: 760px)").matches) setMobileView("document");
      if (recordRead) void markFeedItemRead(selectedRow, itemId);
      queueSave();
      return true;
    };

    const filterFeedItems = (preserveSelection = true) => {
      if (!feedList) return;
      const query = String(feedSearch?.value || "").trim().toLocaleLowerCase();
      const type = activeFeedPreset;
      const source = feedSourceFilter?.value || "all";
      const providerType = feedTypeFilter?.value || "all";
      const time = feedTimeFilter?.value || "all";
      const status = feedStatusFilter?.value || "active";
      const sort = feedSort?.value || "newest";
      const rows = [...feedList.querySelectorAll("[data-feed-entry-id]")];
      const presetRows = rows.filter((row) => row.dataset.feedEntryType === type);
      const visible = rows.filter((row) => {
        const matchesType = type === "all" || row.dataset.feedEntryType === type;
        const matchesSource = source === "all" || row.dataset.feedEntrySource === source;
        const matchesProvider = providerType === "all" || row.dataset.feedEntryProvider === providerType;
        const occurredAt = Date.parse(row.dataset.feedEntryTime || "");
        const age = Number.isFinite(occurredAt) ? Date.now() - occurredAt : Number.POSITIVE_INFINITY;
        const matchesTime = time === "all"
          || (time === "day" && age >= 0 && age <= 86_400_000)
          || (time === "week" && age >= 0 && age <= 7 * 86_400_000)
          || (time === "month" && age >= 0 && age <= 30 * 86_400_000);
        const matchesStatus = status === "all"
          ? true
          : status === "active"
            ? type === "inbox_message"
              ? row.dataset.feedEntryStatus === "inbox" || row.dataset.feedEntryStatus === "processing"
              : row.dataset.feedEntryStatus !== "archived"
            : row.dataset.feedEntryStatus === status;
        const matchesQuery = !query || String(row.dataset.feedEntrySearch || "").includes(query);
        row.hidden = !(matchesType && matchesSource && matchesProvider && matchesTime && matchesStatus && matchesQuery);
        return !row.hidden;
      });
      const compare = (left, right) => {
        const attentionDifference = activeFeedPreset === "inbox_message"
          ? Number(right.dataset.feedEntryAttentionRank || 0) - Number(left.dataset.feedEntryAttentionRank || 0)
          : 0;
        if (attentionDifference) return attentionDifference;
        if (sort === "oldest") return String(left.dataset.feedEntryTime || "").localeCompare(String(right.dataset.feedEntryTime || ""));
        if (sort === "source") return String(left.dataset.feedEntrySource || "").localeCompare(String(right.dataset.feedEntrySource || ""));
        if (sort === "title") return String(left.dataset.feedEntryTitle || "").localeCompare(String(right.dataset.feedEntryTitle || ""));
        return String(right.dataset.feedEntryTime || "").localeCompare(String(left.dataset.feedEntryTime || ""));
      };
      rows.sort(compare).forEach((row) => feedList.insertBefore(row, feedEmpty));
      const filteredEmpty = visible.length === 0 && presetRows.length > 0;
      if (feedEmpty) {
        const emptyTitle = feedEmpty.querySelector("[data-feed-empty-title]");
        const emptyCopy = feedEmpty.querySelector("[data-feed-empty-copy]");
        const clearFilters = feedEmpty.querySelector("[data-feed-clear-filters]");
        const manageSources = feedEmpty.querySelector("[data-feed-empty-sources]");
        if (emptyTitle) emptyTitle.textContent = filteredEmpty ? L("没有符合当前条件的 Item") : L("这里还没有 Item");
        if (emptyCopy) emptyCopy.textContent = filteredEmpty
          ? L("换一个关键词或清除筛选，原来的 Item 仍然保留。")
          : L("接入来源后，消息和 Feed 会出现在这里。");
        if (clearFilters) clearFilters.hidden = !filteredEmpty;
        if (manageSources) manageSources.hidden = filteredEmpty;
        feedEmpty.hidden = visible.length > 0;
      }
      const selectionVisible = visible.some((row) => row.dataset.feedEntryId === selectedFeedItem);
      if (visible.length) {
        if (!preserveSelection || !selectionVisible) selectedFeedItem = visible[0]?.dataset.feedEntryId || "";
        selectFeedItem(selectedFeedItem);
      } else {
        if (!preserveSelection) selectedFeedItem = "";
        rows.forEach((row) => {
          row.classList.remove("is-selected");
          row.setAttribute("aria-selected", "false");
          row.tabIndex = -1;
        });
        feedWorkbench?.querySelectorAll("[data-feed-detail]").forEach((detail) => { detail.hidden = true; });
        setFeedDetailPlaceholder(
          filteredEmpty ? L("没有符合当前条件的 Item") : L("这里还没有 Item"),
          filteredEmpty
            ? L("换一个关键词或清除筛选，原来的 Item 仍然保留。")
            : L("接入来源后，消息和 Feed 会出现在这里。"),
        );
      }
      queueSave();
    };

    const syncFeedFilterUi = () => {
      if (!feedFilterPanel) return;
      const values = {
        source: feedSourceFilter?.value || "all",
        type: feedTypeFilter?.value || "all",
        time: feedTimeFilter?.value || "all",
        status: feedStatusFilter?.value || "active",
        sort: feedSort?.value || "newest",
      };
      feedFilterPanel.querySelectorAll("[data-feed-filter-option]").forEach((option) => {
        const kind = option.dataset.feedFilterOption;
        const selected = values[kind] === option.dataset.feedFilterValue;
        option.setAttribute("aria-checked", String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
      const labels = [feedSourceFilter, feedTypeFilter, feedTimeFilter, feedStatusFilter, feedSort]
        .map((control) => control?.selectedOptions?.[0]?.textContent?.trim())
        .filter(Boolean);
      const summary = labels.join(" · ");
      if (feedFilterSummary) feedFilterSummary.textContent = summary;
      const activeCount = Number(values.source !== "all") + Number(values.type !== "all") + Number(values.time !== "all") + Number(values.status !== "active") + Number(values.sort !== "newest");
      if (feedFilterBadge) {
        feedFilterBadge.textContent = String(activeCount);
        feedFilterBadge.hidden = activeCount === 0;
      }
      if (feedFilterReset) feedFilterReset.disabled = activeCount === 0;
      feedFilterTrigger?.classList.toggle("is-active", activeCount > 0);
      const label = summary ? L("筛选与排序") + "：" + summary : L("筛选与排序");
      feedFilterTrigger?.setAttribute("aria-label", label);
      feedFilterTrigger?.setAttribute("title", label);
    };

    const setFeedFilterOpen = (open, focusFirst = false) => {
      if (!feedFilterPanel || !feedFilterTrigger) return;
      feedFilterPanel.hidden = !open;
      feedFilterTrigger.setAttribute("aria-expanded", String(open));
      if (open) setTreeFilterOpen(false);
      if (open && focusFirst) {
        requestAnimationFrame(() => {
          if (feedFilterPanel.hidden) return;
          const selectedSource = feedFilterPanel.querySelector('[data-feed-filter-option="source"][aria-checked="true"]');
          (selectedSource instanceof HTMLElement ? selectedSource : feedFilterPanel.querySelector("[data-feed-filter-option]"))?.focus?.({ preventScroll: true });
        });
      }
    };

    const rememberFeedPresetState = () => {
      feedPresetState[activeFeedPreset] = {
        selected: selectedFeedItem,
        query: String(feedSearch?.value || ""),
        source: feedSourceFilter?.value || "all",
        type: feedTypeFilter?.value || "all",
        time: feedTimeFilter?.value || "all",
        status: feedStatusFilter?.value || "active",
        sort: feedSort?.value || "newest",
      };
    };

    const restoreFeedPresetState = (preset) => {
      const saved = feedPresetState[preset] || defaultFeedPresetState();
      selectedFeedItem = String(saved.selected || "");
      if (feedSearch) feedSearch.value = String(saved.query || "");
      if (feedSourceFilter) {
        feedSourceFilter.value = saved.source || "all";
        if (!feedSourceFilter.value) feedSourceFilter.value = "all";
      }
      if (feedTypeFilter) {
        feedTypeFilter.value = saved.type || "all";
        if (!feedTypeFilter.value) feedTypeFilter.value = "all";
      }
      if (feedTimeFilter) {
        feedTimeFilter.value = saved.time || "all";
        if (!feedTimeFilter.value) feedTimeFilter.value = "all";
      }
      if (feedStatusFilter) {
        feedStatusFilter.value = saved.status || "active";
        if (!feedStatusFilter.value) feedStatusFilter.value = "active";
      }
      if (feedSort) {
        feedSort.value = saved.sort || "newest";
        if (!feedSort.value) feedSort.value = "newest";
      }
      syncFeedFilterUi();
    };

    const setFeedStatusOptionLabel = (value, label) => {
      if (feedStatusFilter) {
        const option = [...feedStatusFilter.options].find((candidate) => candidate.value === value);
        if (option) option.textContent = label;
      }
      feedFilterPanel?.querySelectorAll('[data-feed-filter-option="status"]').forEach((option) => {
        if (option.dataset.feedFilterValue !== value) return;
        const copy = option.querySelector("span");
        if (copy) copy.textContent = label;
      });
    };

    const setFeedPreset = (preset, restoreSavedState = true) => {
      const nextPreset = preset === "feed" ? "feed" : "inbox_message";
      if (nextPreset !== activeFeedPreset) rememberFeedPresetState();
      activeFeedPreset = nextPreset;
      if (restoreSavedState) restoreFeedPresetState(activeFeedPreset);
      if (feedDirectory) feedDirectory.dataset.feedPreset = activeFeedPreset;
      if (feedWorkbench) {
        feedWorkbench.dataset.feedPreset = activeFeedPreset;
        feedWorkbench.dataset.workSurfaceLabel = activeFeedPreset === "feed" ? "Feed" : "Inbox";
      }
      const heading = feedDirectory?.querySelector("[data-feed-directory-title]");
      if (heading) heading.textContent = activeFeedPreset === "feed" ? "Feed" : "Inbox";
      const semanticType = activeFeedPreset;
      if (activeDesktopSurface === "feed" && mobileTreeTab) mobileTreeTab.textContent = semanticType === "feed" ? "Feed" : "Inbox";
      const feedDirectoryCopy = feedDirectory?.querySelector("[data-feed-directory-copy]");
      if (feedDirectoryCopy) feedDirectoryCopy.textContent = semanticType === "feed"
        ? L("所有来源消息，完整保留")
        : L("只保留需要你介入的事情");
      setFeedStatusOptionLabel("active", semanticType === "inbox_message" ? L("待处理") : L("未忽略"));
      setFeedStatusOptionLabel("inbox", semanticType === "inbox_message" ? L("未开始") : L("待处理"));
      setFeedStatusOptionLabel("saved", semanticType === "inbox_message" ? L("已完成") : L("已保存"));
      setFeedStatusOptionLabel("archived", L("已忽略"));
      syncFeedFilterUi();
      filterFeedItems(true);
      if (activeDesktopSurface === "feed") {
        setDesktopWorkSurface("feed", false, false);
        renderWorkTabs();
      }
    };
`;
