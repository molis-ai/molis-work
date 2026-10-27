/** Feed stage of the navigation segment: list, detail, filters, presets and adoption (a part of CLIENT_NAVIGATION_FEED_SCRIPT, joined in place). */
export const NAVIGATION_FEED_STAGE_PART = `
    let feedStageRefreshSeq = 0;
    const refreshFeedStage = async () => {
      const seq = ++feedStageRefreshSeq;
      const list = document.querySelector("[data-feed-list]") || feedList;
      const workspace = document.querySelector("[data-feed-stage-workspace]");
      const empty = workspace?.querySelector("[data-feed-detail-empty]") || feedDetailEmpty;
      try {
        const scrollTop = list?.scrollTop || 0;
        const selectedId = selectedFeedItem;
        const html = await molisWorkRequest(route("/api/feed/workbench?preset=" + encodeURIComponent(activeFeedPreset)), {as:"text",fallback:FL("无法更新 Feed 列表" )});
        const template = document.createElement("template");
        template.innerHTML = html.trim();
        if (seq !== feedStageRefreshSeq) return false;
        const nextList = template.content.querySelector("[data-feed-list]");
        const nextWorkspace = template.content.querySelector("[data-feed-stage-workspace]");
        if (!list || !workspace || !empty || !nextList || !nextWorkspace) throw new Error(FL("无法更新 Feed 列表"));
        list.replaceChildren(...nextList.childNodes);
        const rail = feedWorkbench?.querySelector("[data-feed-source-rail]");
        const nextRail = template.content.querySelector("[data-feed-source-rail]");
        if (rail && nextRail) rail.replaceChildren(...nextRail.childNodes);
        const configs = feedSourcesDialog?.querySelector("[data-feed-task-configs]");
        const nextConfigs = template.content.querySelector("[data-feed-task-configs]");
        if (configs && nextConfigs) {
          const visibleId = configs.querySelector("[data-feed-task-config]:not([hidden])")?.dataset.feedTaskConfig;
          const openSections = [...configs.querySelectorAll('details[open]')].map(detail => [detail.closest('[data-feed-task-config]')?.dataset.feedTaskConfig, detail.querySelector('summary')?.textContent]);
          const drafts = [...configs.querySelectorAll('input, textarea, select')].filter(field => field.tagName === 'SELECT' ? [...field.options].some(option => option.selected !== option.defaultSelected) : field.type === 'checkbox' ? field.checked !== field.defaultChecked : field.value !== field.defaultValue).map(field => ({ id: field.closest('[data-feed-task-config]')?.dataset.feedTaskConfig, attr: [...field.attributes].find(attr => attr.name.startsWith('data-'))?.name, attrValue: [...field.attributes].find(attr => attr.name.startsWith('data-'))?.value || '', value: field.value, checked: field.checked }));
          for (const old of configs.querySelectorAll('[data-feed-task-config]')) {
            const replacement = nextConfigs.querySelector('[data-feed-task-config="' + CSS.escape(old.dataset.feedTaskConfig) + '"] [data-feed-rule-composer]');
            const composer = old.querySelector('[data-feed-rule-composer]');
            if (replacement && composer) { replacement.closest("[data-feed-out-rules]").dataset.ruleMode = composer.closest("[data-feed-out-rules]").dataset.ruleMode || "keyword"; replacement.replaceWith(composer); }
          }
          configs.replaceChildren(...nextConfigs.childNodes);
          configs.querySelectorAll('[data-feed-task-config]').forEach(config => {
            config.hidden = config.dataset.feedTaskConfig !== visibleId;
            config.querySelectorAll('details').forEach(detail => { detail.open = openSections.some(([id, label]) => id === config.dataset.feedTaskConfig && label === detail.querySelector('summary')?.textContent); });
          });
          for (const draft of drafts) {
            const field = configs.querySelector('[data-feed-task-config="' + CSS.escape(draft.id) + '"] [' + draft.attr + '="' + CSS.escape(draft.attrValue) + '"]');
            if (field) { field.value = draft.value; if (field.type === "checkbox") field.checked = draft.checked; }
          }
        }
        workspace.querySelectorAll("[data-feed-entry-detail], [data-feed-detail]").forEach((node) => {
          if (node !== empty) node.remove();
        });
        [...nextWorkspace.querySelectorAll("[data-feed-entry-detail]")].forEach((node) => {
          workspace.insertBefore(node, empty);
        });
        if (feedWorkbench) Object.assign(feedWorkbench.dataset, { loaded: "true", loadedPreset: activeFeedPreset });
        setFeedTask(selectedFeedTask, false);
        feedSourcesDialog?.querySelectorAll("[data-feed-config-section]").forEach(section => section.hidden = section.dataset.feedConfigSection !== feedConfigView);
        if (feedSourcesDialog?.hidden === false) {
          if (feedConfigView === "rules") hydrateFeedRuleDrafts();
          else if (feedConfigView === "settings") void loadFeedConnections(feedSourcesDialog.querySelector('[data-feed-task-config]:not([hidden])'));
        }
        if (selectedId) selectFeedItem(selectedId, false, false, false);
        list.scrollTop = scrollTop;
        return true;
      } catch(error) {
        if(seq===feedStageRefreshSeq)showToast(error,true);
        return false;
      }
    };

    const loadFeedItemDetail = async (row, entryId) => {
      if (!feedWorkbench || !row || row.dataset.feedEntryPersisted !== "true") return;
      const pane = document.querySelector('[data-feed-entry-detail="' + CSS.escape(entryId) + '"]');
      const slot = pane?.querySelector("[data-feed-item-slot]") || pane;
      const itemId = row.dataset.feedItemId || entryId;
      const existing = (slot || feedWorkbench).querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
      if (existing) {
        existing.hidden = selectedFeedItem !== entryId;
        if (slot) {
          if (existing.parentElement !== slot) slot.append(existing);
          slot.hidden = selectedFeedItem !== entryId;
        }
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
        return;
      }
      feedDetailRequest?.abort();
      const controller = new AbortController();
      feedDetailRequest = controller;
      feedWorkbench.dataset.feedLoadingItem = entryId;
      if (slot) {
        slot.hidden = false;
        if (!slot.querySelector("[data-feed-detail]")) {
          if (slot.contains(document.activeElement)) row.focus({ preventScroll: true });
          const loading = document.createElement("p");
          loading.className = "feed-stage-loading mw-loading";
          loading.textContent = FL("正在载入 Item…");
          slot.replaceChildren(loading);
        }
        if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      } else {
        setFeedDetailPlaceholder(FL("正在载入 Item…"), "");
      }
      try {
        const inboxEntryQuery = row.dataset.inboxEntryId
          ? "&entry=" + encodeURIComponent(row.dataset.inboxEntryId)
          : "";
        const html = await molisWorkRequest(route("/api/feed/items/" + encodeURIComponent(itemId) + "/detail?preset=" + encodeURIComponent(activeFeedPreset) + inboxEntryQuery), {as:"text",signal:controller.signal,fallback:FL("无法读取这条 Item")});
        const template = document.createElement("template");
        template.innerHTML = html.trim();
        const detail = template.content.querySelector('[data-feed-detail="' + CSS.escape(entryId) + '"]');
        if (!detail) throw new Error(FL("Item 详情响应不完整"));
        if (feedDetailRequest !== controller || !feedWorkbench.isConnected) return;
        detail.hidden = selectedFeedItem !== entryId;
        if (row.dataset.feedEntryRead === "read") {
          detail.dataset.feedDetailRead = "read";
          detail.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = FL("已读"); label.dataset.mwState = "read"; });
        }
        if (slot) {
          slot.replaceChildren(detail);
          slot.hidden = selectedFeedItem !== entryId;
        } else {
          feedWorkbench.insertBefore(detail, feedDetailEmpty);
        }
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
        // The detail carries the item's revision; name it now that it is known.
        if (selectedFeedItem === entryId) publishFeedContext(row);
      } catch (error) {
        if (isAbortError(error) || feedDetailRequest !== controller) return;
        if (selectedFeedItem !== entryId) return;
        const message=molisWorkRequest.text(error,FL("无法读取这条 Item"));
        // The placeholder under the reader bar says what failed and holds the one retry.
        if (slot) { slot.replaceChildren(); slot.hidden = true; }
        setFeedDetailPlaceholder(message, FL("这条 Item 仍然保留，点击重试即可。"), true);
        const title=feedDetailEmpty?.querySelector("[data-feed-detail-empty-title]");if(title)molisWorkRequest.show(title,error);
      } finally {
        if (feedDetailRequest === controller) {
          feedDetailRequest = null;
          delete feedWorkbench.dataset.feedLoadingItem;
        }
      }
    };

    /* The message on screen, for the Assistant and the placement bar: the same feed_item id that search and feed.subject.read use.
       Demo rows (not persisted) name no object, since nothing can be read back for them. */
    const publishFeedContext = (row) => {
      const shell = document.querySelector("[data-feed-stage-shell]");
      if (!shell) return;
      const context = { plugin_id: "io.molis.work.feed", surface_title: "Feed" };
      const itemId = row && row.dataset.feedEntryPersisted === "true" ? (row.dataset.feedItemId || row.dataset.feedEntryId) : "";
      if (itemId) {
        context.object = { kind: "feed_item", id: itemId, title: row.dataset.feedEntryTitle || "" };
        const revision = Number(document.querySelector('[data-feed-detail="' + CSS.escape(row.dataset.feedEntryId || "") + '"] [data-feed-revision]')?.dataset.feedRevision);
        if (Number.isFinite(revision) && revision > 0) context.object.version = revision;
      }
      const next = JSON.stringify(context);
      if (shell.getAttribute("data-assistant-context") !== next) shell.setAttribute("data-assistant-context", next);
    };
    // Before anything is opened, the surface still says which plugin it is.
    if (!document.querySelector("[data-feed-stage-shell]")?.hasAttribute("data-assistant-context")) publishFeedContext(null);

    const expandFeedStage = (expanded) => {
      const shell = document.querySelector("[data-feed-stage-shell]");
      const workspace = document.querySelector("[data-feed-stage-workspace]");
      if (!shell) return;
      shell.dataset.expanded = expanded ? "true" : "false";
      if (workspace) workspace.hidden = !expanded;
    };

    const collapseFeedStage = () => {
      expandFeedStage(false);
      selectedFeedItem = "";
      feedList?.querySelectorAll("[data-feed-entry-id]").forEach((row) => {
        collapseFeedItemDetail(row);
      });
      document.querySelectorAll("[data-feed-entry-detail]").forEach((pane) => { pane.hidden = true; });
      if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      publishFeedContext(null);
    };

    const collapseFeedItemDetail = (row) => {
      const wrap = row?.closest?.("[data-feed-item-wrap]") || row;
      wrap?.classList.remove("is-open");
      row?.classList.remove("is-selected", "is-open");
      row?.setAttribute("aria-selected", "false");
      row?.setAttribute("aria-expanded", "false");
      if (row) row.tabIndex = 0;
    };

    const selectFeedItem = (itemId, moveToDetail = false, recordRead = false, allowToggle = false) => {
      if (!feedList || !feedWorkbench) return false;
      const selectedRow = [...feedList.querySelectorAll("[data-feed-entry-id]")]
        .find((row) => row.dataset.feedEntryId === itemId && feedEntryVisible(row));
      if (!selectedRow) return false;
      const alreadyOpen = selectedFeedItem === itemId && document.querySelector("[data-feed-stage-shell]")?.dataset.expanded === "true";
      if (allowToggle && alreadyOpen) {
        collapseFeedStage();
        queueSave();
        return true;
      }
      selectedFeedItem = itemId;
      feedList.querySelectorAll("[data-feed-entry-id]").forEach((row) => {
        const active = row === selectedRow;
        row.classList.toggle("is-selected", active);
        row.classList.toggle("is-open", active);
        row.setAttribute("aria-selected", String(active));
        row.setAttribute("aria-expanded", String(active));
        row.tabIndex = active ? 0 : -1;
        if (!active) collapseFeedItemDetail(row);
      });
      selectedRow.classList.add("is-open");
      expandFeedStage(true);
      publishFeedContext(selectedRow);
      document.querySelectorAll("[data-feed-entry-detail]").forEach((pane) => {
        pane.hidden = pane.dataset.feedEntryDetail !== itemId;
      });
      const slot = document.querySelector('[data-feed-entry-detail="' + CSS.escape(itemId) + '"] [data-feed-item-slot]');
      if (feedWorkbench.dataset.loaded !== "true" || feedWorkbench.dataset.loadedPreset !== activeFeedPreset) {
        if (recordRead) void markFeedItemRead(selectedRow, itemId);
        setFeedDetailPlaceholder(FL("正在打开 Item 工作区…"), "");
        return true;
      }
      const existingDetail = (slot || feedWorkbench).querySelector('[data-feed-detail="' + CSS.escape(itemId) + '"]');
      if (existingDetail) {
        existingDetail.hidden = false;
        feedDetailRequest?.abort();
        if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      } else if (selectedRow.dataset.feedEntryPersisted === "true") {
        void loadFeedItemDetail(selectedRow, itemId);
      } else {
        setFeedDetailPlaceholder(FL("无法读取这条 Item"), FL("刷新页面后再试。"), true);
      }
      if (moveToDetail && matchMedia("(max-width: 760px)").matches) setMobileView("document");
      if (recordRead) void markFeedItemRead(selectedRow, itemId);
      queueSave();
      return true;
    };

    const filterFeedItems = (preserveSelection = true, persist = true) => {
      const list = document.querySelector("[data-feed-stage-shell] [data-feed-list]") || document.querySelector("[data-feed-list]") || feedList;
      if (!list) return;
      const query = String((document.querySelector("[data-feed-stage-shell] [data-feed-search]") || document.querySelector("[data-feed-search]") || feedSearch)?.value || "").trim().toLocaleLowerCase();
      const type = activeFeedPreset;
      const source = (document.querySelector("[data-feed-stage-shell] [data-feed-source-filter]") || document.querySelector("[data-feed-source-filter]"))?.value || "all";
      const providerType = (document.querySelector("[data-feed-stage-shell] [data-feed-type-filter]") || document.querySelector("[data-feed-type-filter]"))?.value || "all";
      const time = (document.querySelector("[data-feed-stage-shell] [data-feed-time-filter]") || document.querySelector("[data-feed-time-filter]"))?.value || "all";
      const status = (document.querySelector("[data-feed-stage-shell] [data-feed-status-filter]") || document.querySelector("[data-feed-status-filter]"))?.value || "active";
      const sort = document.querySelector("[data-feed-sort]")?.value || "newest";
      const rows = [...list.querySelectorAll("[data-feed-entry-id]")];
      const presetRows = rows.filter((row) => row.dataset.feedEntryType === type);
      const matchesRow = (row) => {
        const matchesType = type === "all" || row.dataset.feedEntryType === type;
        const matchesSource = (selectedFeedTask === "all" || (row.dataset.feedEntryTask || row.dataset.feedEntrySourceId) === selectedFeedTask) && (source === "all" || row.dataset.feedEntrySource === source);
        const matchesQuick = feedQuickFilter === "unread" ? row.dataset.feedEntryRead !== "read" : feedQuickFilter === "saved" ? row.dataset.feedEntryStatus === "saved" : true;
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
            ? row.dataset.feedEntryStatus !== "archived"
            : row.dataset.feedEntryStatus === status;
        const matchesQuery = !query || String(row.dataset.feedEntrySearch || "").includes(query);
        return matchesType && matchesSource && matchesProvider && matchesTime && matchesStatus && matchesQuery && matchesQuick;
      };
      const compare = (left, right) => {
        if (sort === "oldest") return String(left.dataset.feedEntryTime || "").localeCompare(String(right.dataset.feedEntryTime || ""));
        if (sort === "source") return String(left.dataset.feedEntrySource || "").localeCompare(String(right.dataset.feedEntrySource || ""));
        if (sort === "title") return String(left.dataset.feedEntryTitle || "").localeCompare(String(right.dataset.feedEntryTitle || ""));
        return String(right.dataset.feedEntryTime || "").localeCompare(String(left.dataset.feedEntryTime || ""));
      };
      const visible = [];
      const body = list.querySelector("[data-feed-rows]") || list;
      const listEmpty = list.querySelector("[data-feed-empty]");
      for (const row of rows) {
        const wrap = row.closest("[data-feed-item-wrap]") || row;
        const match = matchesRow(row);
        wrap.hidden = !match;
        if (match) visible.push(row);
      }
      rows.sort(compare).forEach((row) => {
        const wrap = row.closest("[data-feed-item-wrap]") || row;
        if (body === list && listEmpty) body.insertBefore(wrap, listEmpty); else body.append(wrap);
      });
      if (feedResultCount) feedResultCount.textContent = FL("{count} 条消息", { count: visible.length });
      const taskRows = presetRows.filter((row) => selectedFeedTask === "all" || (row.dataset.feedEntryTask || row.dataset.feedEntrySourceId) === selectedFeedTask);
      const filteredEmpty = visible.length === 0 && taskRows.length > 0;
      const hasSources = Boolean(document.querySelector("[data-feed-source-rail] [data-feed-task]:not([data-feed-task='all'])"));
      const otherFilters = source !== "all" || providerType !== "all" || time !== "all" || query || (status !== "active" && status !== "all");
      const liveEmpty = list.querySelector("[data-feed-empty]") || feedEmpty;
      if (liveEmpty) {
        const emptyTitle = liveEmpty.querySelector("[data-feed-empty-title]");
        const clearFilters = liveEmpty.querySelector("[data-feed-clear-filters]");
        const addTask = liveEmpty.querySelector("[data-feed-add-toggle]");
        if (emptyTitle) emptyTitle.textContent = filteredEmpty
          ? (!otherFilters && feedQuickFilter === "unread" ? FL("未读内容已经读完了") : !otherFilters && feedQuickFilter === "saved" ? FL("还没有保存的资料") : FL("没有符合当前条件的消息"))
          : selectedFeedTask !== "all"
            ? FL("这个来源还没有消息，拉取后会出现在这里")
            : hasSources
              ? FL("还没有消息，拉取后会出现在这里")
              : FL("添加一个来源，开始收集消息");
        if (clearFilters) clearFilters.hidden = !filteredEmpty;
        if (addTask) addTask.hidden = filteredEmpty || hasSources;
        liveEmpty.hidden = visible.length > 0;
      }
      const selectionVisible = visible.some((row) => row.dataset.feedEntryId === selectedFeedItem);
      if (!preserveSelection || !selectionVisible) {
        if (selectedFeedItem) collapseFeedStage();
        selectedFeedItem = "";
      }
      const keyboardEntry = visible.find(row => row.dataset.feedEntryId === selectedFeedItem) || visible[0];
      rows.forEach(row => row.tabIndex = row === keyboardEntry ? 0 : -1);
      if (persist) queueSave();
    };

    const syncFeedFilterUi = () => {
      const panel = document.querySelector("[data-feed-filter-panel]") || feedFilterPanel;
      if (!panel) return;
      const values = {
        source: document.querySelector("[data-feed-source-filter]")?.value || "all",
        type: document.querySelector("[data-feed-type-filter]")?.value || "all",
        time: document.querySelector("[data-feed-time-filter]")?.value || "all",
        status: document.querySelector("[data-feed-status-filter]")?.value || "active",
        sort: document.querySelector("[data-feed-sort]")?.value || "newest",
      };
      panel.querySelectorAll("[data-feed-filter-option]").forEach((option) => {
        const kind = option.dataset.feedFilterOption;
        const selected = values[kind] === option.dataset.feedFilterValue;
        option.setAttribute("aria-checked", String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
      const labels = [feedSourceFilter, feedTypeFilter, feedTimeFilter, feedStatusFilter, feedSort]
        .map((control) => control?.selectedOptions?.[0]?.textContent?.trim())
        .filter(Boolean);
      const summary = labels.join(" · ");
      const activeCount = Number(values.source !== "all") + Number(values.type !== "all") + Number(values.time !== "all") + Number(values.status !== "active") + Number(values.sort !== "newest");
      if (feedFilterBadge) {
        feedFilterBadge.textContent = String(activeCount);
        feedFilterBadge.hidden = activeCount === 0;
      }
      if (feedFilterReset) feedFilterReset.disabled = activeCount === 0;
      feedFilterTrigger?.classList.toggle("is-active", activeCount > 0);
      const label = summary ? FL("筛选与排序") + "：" + summary : FL("筛选与排序");
      feedFilterTrigger?.setAttribute("aria-label", label);
      feedFilterTrigger?.setAttribute("title", label);
    };

    document.addEventListener("change", (event) => {
      const target = event.target?.nodeType === 1 ? event.target : null;
      if (!target?.matches("[data-feed-source-filter], [data-feed-type-filter], [data-feed-time-filter], [data-feed-status-filter], [data-feed-sort]")) return;
      syncFeedFilterUi();
      filterFeedItems();
    }, true);
    document.addEventListener("input", (event) => {
      const target = event.target?.nodeType === 1 ? event.target : null;
      if (!target?.closest("[data-feed-search]")) return;
      noteSearchActivity();
      filterFeedItems();
    });

    const setFeedFilterOpen = (open, focusFirst = false) => {
      if (!feedFilterPanel || !feedFilterTrigger) return;
      feedFilterPanel.hidden = !open;
      feedFilterTrigger.setAttribute("aria-expanded", String(open));
      if (open) setTreeFilterOpen(false);
      if (open && focusFirst) {
        requestAnimationFrame(() => {
          if (feedFilterPanel.hidden) return;
          const selectedSource = feedFilterPanel.querySelector('[data-feed-filter-option="source"][aria-checked="true"]');
          (selectedSource?.nodeType === 1 ? selectedSource : feedFilterPanel.querySelector("[data-feed-filter-option]"))?.focus?.({ preventScroll: true });
        });
      }
    };

    const syncFeedQuickFilter = () => {
      document.querySelectorAll("[data-feed-quick]").forEach((button) => {
        const current = button.dataset.feedQuick === feedQuickFilter;
        button.classList.toggle("is-current", current);
        button.setAttribute("aria-pressed", String(current));
      });
    };
    document.addEventListener("click", (event) => {
      const button = event.target?.nodeType === 1 ? event.target.closest("[data-feed-quick]") : null;
      if (!button) return;
      feedQuickFilter = ["unread", "saved"].includes(button.dataset.feedQuick) ? button.dataset.feedQuick : "all";
      syncFeedQuickFilter();
      filterFeedItems();
    });
    // The reading bar draws its rule only once the page has scrolled under it.
    document.addEventListener("scroll", (event) => {
      const page = event.target?.nodeType === 1 && event.target.matches(".feed-stage-item-detail") ? event.target : null;
      if (page) page.toggleAttribute("data-scrolled", page.scrollTop > 4);
    }, true);
    // The source menu is a disclosure; its summary keeps the older rail-toggle hook and says whether it is open.
    document.addEventListener("toggle", (event) => {
      const menu = event.target?.nodeType === 1 && event.target.matches("[data-feed-source-menu]") ? event.target : null;
      if (!menu) return;
      if (feedWorkbench) feedWorkbench.dataset.railOpen = String(menu.open);
      menu.querySelector("[data-feed-rail-toggle]")?.setAttribute("aria-expanded", String(menu.open));
    }, true);

    const rememberFeedPresetState = () => {
      feedPresetState[activeFeedPreset] = {
        quick: feedQuickFilter,
        selected: selectedFeedItem,
        task: selectedFeedTask || "all",
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
      selectedFeedTask = String(saved.task || "all");
      feedQuickFilter = ["unread", "saved"].includes(saved.quick) ? saved.quick : "all";
      syncFeedQuickFilter();
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

    const openRequestedFeedRule = () => {
      const id = new URL(location.href).searchParams.get("feedRule");
      if (!id) return;
      const row = document.querySelector('[data-feed-out-rule-row="' + CSS.escape(id) + '"]');
      const sourceId = row?.closest("[data-feed-out-rules]")?.dataset.feedOutRules;
      if (!sourceId) { showToast(FL("原捕捉规则不存在，可能已经删除。")); return; }
      tabWorkspace?.openPlugin("feed");
      setFeedTask(sourceId);
      showFeedView("rules");
      requestAnimationFrame(() => row.scrollIntoView({ block: "nearest", behavior: "instant" }));
    };

    const setFeedPreset = (preset, restoreSavedState = true) => {
      const nextPreset = "feed";
      if (nextPreset !== activeFeedPreset) rememberFeedPresetState();
      activeFeedPreset = nextPreset;
      if (restoreSavedState) restoreFeedPresetState(activeFeedPreset);
      if (feedDirectory) feedDirectory.dataset.feedPreset = activeFeedPreset;
      if (feedWorkbench) {
        feedWorkbench.dataset.feedPreset = activeFeedPreset;
        feedWorkbench.dataset.workSurfaceLabel = "Feed";
      }
      setFeedStatusOptionLabel("active", FL("未忽略"));
      setFeedStatusOptionLabel("inbox", FL("待处理"));
      setFeedStatusOptionLabel("saved", FL("已保存"));
      setFeedStatusOptionLabel("archived", FL("已忽略"));
      syncFeedFilterUi();
      setFeedTask(selectedFeedTask || "all", false);
      if (activeDesktopSurface === "feed") {
        setDesktopWorkSurface("feed", false, false);
        immersiveNavigation?.sync();
      }
    };

    // Feed comes into the project, or goes (the membership script has already brought or taken away its section of the
    // directory, with the source directory in it). Its pages are in the page either way and fill when the project has Feed — the
    // sources as a list, as pages and in the setup panel — so they are filled the way the server renders them now; a container
    // keeps its identity, so what is bound to it stays bound, and only its contents change. Then the nodes wired at load are found
    // again, the source directory is bound, and what depends on them is put the way the page puts it at load.
    const FEED_FILLED_REGIONS = ["[data-feed-source-header]", "[data-feed-list]", "[data-feed-sources-dialog]", "[data-source-workbench]"];
    const adoptFeed = (next) => {
      for (const selector of FEED_FILLED_REGIONS) {
        const mine = document.querySelector(selector), theirs = next.querySelector(selector);
        if (mine && theirs) mine.replaceChildren(...[...theirs.childNodes].map((node) => document.importNode(node, true)));
      }
      findFeedNodes();
      desktopDirectoryPanels.splice(0, desktopDirectoryPanels.length, ...document.querySelectorAll("[data-directory-panel]"));
      bindSourceDirectory();
      activeSourceFilter = "all";
      selectedSource = sourceList?.querySelector("[data-source-entry-id].is-selected")?.dataset.sourceEntryId || "";
      selectedFeedItem = feedList?.querySelector("[data-feed-entry-id].is-selected")?.dataset.feedEntryId || "";
      if (sourceDirectory) {
        filterSources(true);
        if (selectedSource) selectSource(selectedSource, false);
      }
      if (feedDirectory) setFeedPreset("feed", false);
      setDesktopDirectory(treePane?.dataset.desktopDirectory || "root", false, false);
    };
    document.addEventListener("molis-work:plugins-changed", (event) => {
      const { came = [], gone = [], next } = event.detail || {};
      if (!next || ![...came, ...gone].includes("feed")) return;
      // If Feed could not be brought in line the membership script is told, and loads the page again.
      try { adoptFeed(next); } catch (error) { event.detail.failed = true; console.error(error); }
    });
`;
