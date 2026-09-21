import { OWN_DIRECTORY_SURFACES, pluginTabTitles } from "../../plugin-catalog.js";

/** AP3 Workbench client segment: navigation-feed. */
export const CLIENT_NAVIGATION_FEED_SCRIPT = `
    const OWN_DIRECTORY_SURFACES = ${JSON.stringify([...OWN_DIRECTORY_SURFACES])};
    const PLUGIN_TAB_TITLES = ${JSON.stringify({ goal: "Goals", sources: "Feed", ...pluginTabTitles() })};
    const directoryPanelFor = (directory) => directory;

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
      if (!available.has(goalId)) goalId = state.active_goal_id || "";
      location.assign(globalThis.molisWorkNavigationUrl(goalId ? route("/goals/" + encodeURIComponent(goalId)) : route("/")));
    };

    const syncMobilePluginLabels = (surface, directory) => {
      const plugin = OWN_DIRECTORY_SURFACES.includes(directory) ? directory : surface;
      if (mobileTreeTab) mobileTreeTab.textContent = directory === "sources"
        ? L("来源")
        : PLUGIN_TAB_TITLES[plugin] || defaultMobileTreeLabel;
      if (mobileDocumentTab) mobileDocumentTab.textContent = OWN_DIRECTORY_SURFACES.includes(plugin)
        ? L("详情")
        : defaultMobileDocumentLabel;
    };

    const setDesktopWorkSurface = (surface, persist = true, restoreScroll = true) => {
      if (!desktopWorkSurfaces.length) return false;
      if (surface === "sources") {
        setFeedTask(selectedSource || selectedFeedTask || "all", persist);
        surface = "feed";
      }
      const nextSurface = desktopWorkSurfaces.find((candidate) => candidate.dataset.workSurface === surface);
      if (!nextSurface) {
        if (surface === "goal") restoreLastGoal(true);
        return false;
      }
      const surfaceChanged = activeDesktopSurface !== surface;
      if (activeDesktopSurface && surfaceChanged) {
        desktopSurfaceScroll[activeDesktopSurface] = (activeDesktopSurface === "goal" ? documentPane : activeDesktopSurface === "feed" ? feedWorkbench?.querySelector(".feed-stage-tree") : desktopWorkSurfaces.find(item => item.dataset.workSurface === activeDesktopSurface))?.scrollTop || 0;
        if (activeDesktopSurface === "goal") goalWorkspaceMode = workspace.dataset.workspaceMode || "graph";
      }
      activeDesktopSurface = surface;
      document.body.dataset.desktopSurface = surface;
      syncMobilePluginLabels(surface, treePane?.dataset.desktopDirectory);
      if (!tabWorkspace) {
        desktopWorkSurfaces.forEach((candidate) => {
          if (candidate.closest("[data-goal-canvas-shell]")) return;
          candidate.hidden = candidate !== nextSurface;
        });
      }
      document.querySelectorAll("[data-work-surface-open], [data-work-surface-link]").forEach((item) => {
        const active = (item.dataset.workSurfaceOpen || item.dataset.workSurfaceLink) === surface &&
          (surface !== "feed" || !item.dataset.feedPreset || item.dataset.feedPreset === activeFeedPreset);
        item.classList.toggle("is-current", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      if (surfaceChanged) setWorkspaceMode(surface === "goal" ? goalWorkspaceMode : "focus", false, true);
      immersiveNavigation?.sync();
      const label = nextSurface.dataset.workSurfaceLabel || surface;
      documentPane.setAttribute("aria-label", label);
      requestAnimationFrame(() => {
        const scrollPane = surface === "goal" ? documentPane : surface === "feed" ? nextSurface.querySelector(".feed-stage-tree") || nextSurface : nextSurface;
        scrollPane.scrollTop = restoreScroll ? Number(desktopSurfaceScroll[surface] || 0) : 0;
      });
      pluginWorkbench?.open(surface);
      if (surface === "feed") {
        void ensureFeedWorkbenchLoaded();
        setFeedTask(selectedFeedTask || "all", false);
      }
      frameContainer?.sync();
      if (persist) queueSave();
      return true;
    };

    const pluginForSurface = (surface) => surface === "goal" ? "goals" : surface === "home" ? "home" : surface;
    const directoryTabMode = () => "commit";
    let lastDirectoryOpen = { key: "", at: 0 };
    const openWorkbenchSurface = (surface, itemId, title, mode = "commit") => {
      if (!tabWorkspace) return false;
      if (surface === "market") {
        tabWorkspace.setExclusive(surface);
        return true;
      }
      if (surface === "sources") {
        tabWorkspace.openPlugin("feed", mode);
        return true;
      }
      if (itemId) tabWorkspace.openItem(pluginForSurface(surface), itemId, title, undefined, mode);
      else tabWorkspace.openPlugin(pluginForSurface(surface), mode);
      return true;
    };
    const openDirectorySurface = (surface, itemId, title, clickEvent) => {
      const plugin = pluginForSurface(surface);
      const key = itemId ? plugin + ":item:" + itemId : plugin + ":view";
      const detail = Number(clickEvent?.detail || 0);
      if (detail > 1 && lastDirectoryOpen.key === key) return true;
      lastDirectoryOpen = { key, at: Date.now() };
      return openWorkbenchSurface(surface, itemId, title, directoryTabMode());
    };

    const currentModuleDirectory = () => activeDesktopSurface === "feed" || activeDesktopSurface === "sources" || activeDesktopSurface === "sessions" || activeDesktopSurface === "artifacts" || activeDesktopSurface === "inbox" || activeDesktopSurface === "shelf" || activeDesktopSurface === "functions" || activeDesktopSurface === "pages" || activeDesktopSurface === "form" || activeDesktopSurface === "dataset" || activeDesktopSurface === "ppt" || activeDesktopSurface === "lingguang"
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

    const LIST_PLUGIN_SECTIONS = [...document.querySelectorAll("[data-plugin-section]")].map(section => section.dataset.pluginSection);

    const syncPluginDirectory = (directory) => {
      const empty = directory === "root";
      workspace.classList.toggle("is-plugin-directory-empty", empty);
      const currentSection = directory === "sources" ? "feed" : directory;
      document.querySelectorAll("[data-plugin-section]").forEach((section) => {
        const show = !empty && section.dataset.pluginSection === currentSection;
        section.hidden = !show;
        if (show) {
          section.classList.add("is-expanded");
          section.dataset.pluginExpanded = "true";
        }
      });
    };

    const setPluginSectionExpanded = (id, expanded, persist = true) => {
      const sectionId = id === "sources" ? "feed" : id;
      if (!LIST_PLUGIN_SECTIONS.includes(sectionId) || !expanded) return;
      setDirectoryCollapsed?.(false, false);
      setDesktopDirectory(id === "sources" ? "sources" : sectionId, persist, false);
    };

    const setDesktopDirectory = (directory, persist = true, focusTarget = true, origin = null) => {
      if (!desktopDirectoryPanels.length || !treePane?.dataset.desktopDirectory) return;
      directory = directoryPanelFor(directory);
      const available = new Set(desktopDirectoryPanels.map((panel) => panel.dataset.directoryPanel));
      const next = available.has(directory) || directory === "root" ? directory : "root";
      const current = treePane.dataset.desktopDirectory;
      if (current === "root" && next !== "root" && origin?.closest?.('[data-directory-panel="root"]')) {
        desktopDirectoryOrigin = origin;
      }
      treePane.dataset.desktopDirectory = next;
      const feedPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === "feed");
      const sourcesPanel = desktopDirectoryPanels.find((panel) => panel.dataset.directoryPanel === "sources");
      if (feedPanel) feedPanel.hidden = next === "sources";
      if (sourcesPanel) sourcesPanel.hidden = next !== "sources";
      syncPluginDirectory(next);
      if (next === "settings" || next === "project-settings" || (persist && origin?.closest?.("[data-plugin-strip]") && next !== "root")) {
        setDirectoryCollapsed?.(false, false);
        const storedWidth = parseFloat(workspace.style.getPropertyValue("--tree-width")) || 0;
        if (storedWidth > 0 && storedWidth < 200) workspace.style.setProperty("--tree-width", "240px");
      }
      syncMobilePluginLabels(activeDesktopSurface, next);
      syncMobileNavigationChrome();
      immersiveNavigation?.sync();
      if (focusTarget) {
        requestAnimationFrame(() => {
          const nextFocus = origin?.closest?.("[data-plugin-strip]")
            ? origin
            : next === "root" && desktopDirectoryOrigin?.isConnected
            ? desktopDirectoryOrigin
            : origin;
          nextFocus?.focus?.();
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
        row.setAttribute("aria-expanded", String(active));
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
      if (sourceResultCount) sourceResultCount.textContent = L("{count} 个来源", { count: visible.length });
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

    const feedEntryVisible = (row) => {
      const wrap = row?.closest?.("[data-feed-item-wrap]");
      return Boolean(row) && !row.hidden && !wrap?.hidden;
    };

    const resetFeedFields = (root) => {
      root?.querySelectorAll("input, textarea, select").forEach(field => {
        if (field.tagName === "SELECT") [...field.options].forEach(option => option.selected = option.defaultSelected);
        else if (field.type === "checkbox") field.checked = field.defaultChecked;
        else field.value = field.defaultValue;
      });
      root?.querySelectorAll("[data-source-action-status]").forEach(status => status.hidden = true);
    };
    feedSourcesDialog?.addEventListener("close", () => {
      const config = feedSourcesDialog.querySelector("[data-feed-task-config]:not([hidden])");
      if (config) resetFeedFields(config);
    });
    const showFeedSetup = (stage = "choose", value = "") => {
      if (!feedSourcesDialog) return;
      if (stage === "config" && !feedSourcesDialog.querySelector('[data-feed-task-config="' + CSS.escape(value) + '"]')) {
        showToast(L("这个任务已不可用，请刷新后查看。")); return;
      }
      const draft = feedSourcesDialog.querySelector("[data-feed-add-form]");
      if (stage === "choose" && draft?.dataset.createdSourceId) { stage = "setup"; value = feedSourcesDialog.querySelector("[data-feed-source-register]").dataset.feedSourceRegister; }
      const setup = stage === "setup";
      const configSave = feedSourcesDialog.querySelector("[data-feed-config-submit]");
      configSave.hidden = stage !== "config";
      configSave.dataset.sourceId = value;
      configSave.disabled = feedSourcesDialog.querySelector('[data-feed-task-config="' + CSS.escape(value) + '"]')?.dataset.prototype === "true";

      const headings = { custom_rss: "RSS / Atom", rss: "目录订阅", web_query: "网页搜索", youtube_channel: "YouTube", github: "GitHub", gmail: "Gmail" };
      const title = stage === "config" ? "任务配置" : setup ? headings[value] : "添加任务";
      feedSourcesDialog.querySelector("h2").textContent = L(title);
      feedSourcesDialog.querySelector('footer [data-feed-sources-close]').textContent = L("取消");
      const description = feedSourcesDialog.querySelector("[data-feed-setup-description]");
      description.textContent = L(stage === "choose" ? "选一种来源。" : setup ? "填完后会出现在 Feed 目录。" : "范围、计划和捕捉规则。");
      for (const [selector, visible] of [["[data-feed-source-choices]", stage === "choose"], ["[data-feed-source-setup]", setup], ["[data-feed-task-configs]", stage === "config"]]) feedSourcesDialog.querySelector(selector).hidden = !visible;
      feedSourcesDialog.querySelectorAll("[data-feed-task-config]").forEach(panel => panel.hidden = panel.dataset.feedTaskConfig !== value);
      feedSourcesDialog.querySelectorAll("[data-feed-setup-kind]").forEach(panel => {
        panel.hidden = !setup || panel.dataset.feedSetupKind !== value;
        panel.querySelectorAll("input,select").forEach(input => input.disabled = panel.hidden || Boolean(draft?.dataset.createdSourceId));
      });
      feedSourcesDialog.querySelectorAll("[data-feed-footer-kind]").forEach(button => button.hidden = !setup || button.dataset.feedFooterKind !== value);
      const form = feedSourcesDialog.querySelector("[data-feed-add-form]");
      form.hidden = !setup || value === "github" || value === "gmail";
      const create = feedSourcesDialog.querySelector("[data-feed-source-register]");
      create.hidden = form.hidden;
      if (!form.hidden) create.dataset.feedSourceRegister = value;
      setFeedSourceFeedback("");
      if (!feedSourcesDialog.open) feedSourcesDialog.showModal();
      (feedSourcesDialog.querySelector('[data-feed-source-setup]:not([hidden]) [data-feed-setup-kind]:not([hidden]) input') || feedSourcesDialog.querySelector('section:not([hidden]) button'))?.focus();
    };
    const setFeedAddOpen = (open) => {
      if (open) showFeedSetup(); else feedSourcesDialog?.close();
    };
    const saveFeedAddOutRule = async (form, sourceId) => {
      if (!form || form.dataset.createdOutRuleId) return;
      const contains = String(form.querySelector("[data-feed-add-out-rule-contains]")?.value || "").trim();
      const name = String(form.querySelector("[data-feed-add-out-rule-name]")?.value || "").trim();
      const functionKey = String(form.querySelector("[data-feed-add-out-rule-function-key]")?.value || "").trim();
      if (!contains && !name) return;
      const result = await feedApi("/api/feed/out-rules", "POST", { name: name || contains, contains, source_id: sourceId, ...(functionKey ? { function_key: functionKey } : {}) });
      form.dataset.createdOutRuleId = result.rule.rule_id;
    };

    const setFeedTask = (taskId, persist = true) => {
      const available = document.querySelector('[data-feed-task="' + CSS.escape(taskId || "") + '"]');
      const next = available ? taskId : "all";
      selectedFeedTask = next;
      document.querySelectorAll("[data-feed-task]").forEach((task) => {
        const selected = task.dataset.feedTask === next;
        if (task.matches("details")) {
          const summary = task.querySelector(":scope > summary");
          if (selected) {
            task.open = true;
            summary?.setAttribute("aria-current", "page");
            task.scrollIntoView({ block: "nearest" });
          } else summary?.removeAttribute("aria-current");
          return;
        }
        const button = task.querySelector("[data-feed-task-toggle]");
        button?.classList.toggle("is-selected", selected);
        if (selected) button?.setAttribute("aria-current", "page"); else button?.removeAttribute("aria-current");
      });
      const title = document.querySelector("[data-feed-task-title]");
      if (title) title.textContent = available?.querySelector("strong")?.textContent || L("全部");
      if (persist) document.dispatchEvent(new CustomEvent("workbench-feed-task", { detail: { taskId: next } }));
      return true;
    };

    const setFeedDetailPlaceholder = (title, copy, retry = false) => {
      if (!feedDetailEmpty) return;
      const titleNode = feedDetailEmpty.querySelector("[data-feed-detail-empty-title]");
      const copyNode = feedDetailEmpty.querySelector("[data-feed-detail-empty-copy]");
      const retryButton = feedDetailEmpty.querySelector("[data-retry-feed-detail]");
      if (titleNode) titleNode.textContent = title;
      if (copyNode) {
        copyNode.textContent = copy || "";
        copyNode.hidden = !copy;
      }
      if (retryButton) retryButton.hidden = !retry;
      feedDetailEmpty.hidden = false;
    };

    const ensureFeedWorkbenchLoaded = async () => {
      if (!feedWorkbench) return false;
      if (feedWorkbench.dataset.feedStageDirectory === "true") {
        feedWorkbench.dataset.loaded = "true";
        feedWorkbench.dataset.loadedPreset = activeFeedPreset;
        return true;
      }
      if (feedWorkbench.dataset.loaded === "true" && feedWorkbench.dataset.loadedPreset === activeFeedPreset) return true;
      if (feedWorkbenchRequest) {
        const pending = feedWorkbenchRequest;
        return pending.then(() => ensureFeedWorkbenchLoaded());
      }
      const requestedPreset = activeFeedPreset;
      setFeedDetailPlaceholder(L("正在打开 Item 工作区…"), "");
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
          loading.className = "feed-stage-loading";
          loading.textContent = L("正在载入 Item…");
          slot.replaceChildren(loading);
        }
      } else {
        setFeedDetailPlaceholder(L("正在载入 Item…"), "");
      }
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
        detail.hidden = selectedFeedItem !== entryId;
        if (row.dataset.feedEntryRead === "read") {
          detail.dataset.feedDetailRead = "read";
          detail.querySelectorAll("[data-feed-read-state]").forEach((label) => { label.textContent = L("已读"); });
        }
        if (slot) {
          slot.replaceChildren(detail);
          slot.hidden = selectedFeedItem !== entryId;
        } else {
          feedWorkbench.insertBefore(detail, feedDetailEmpty);
        }
        if (selectedFeedItem === entryId && feedDetailEmpty) feedDetailEmpty.hidden = true;
      } catch (error) {
        if (isAbortError(error) || feedDetailRequest !== controller) return;
        if (selectedFeedItem !== entryId) return;
        const message = error instanceof Error ? error.message : L("无法读取这条 Item");
        if (slot) {
          const failed = document.createElement("p");
          failed.className = "feed-stage-loading";
          failed.textContent = message;
          const retry = document.createElement("button"); retry.type = "button"; retry.dataset.retryFeedDetail = ""; retry.textContent = L("重试");
          slot.replaceChildren(failed, retry);
          slot.hidden = false;
        }
        setFeedDetailPlaceholder(message, L("这条 Item 仍然保留，点击重试即可。"), true);
      } finally {
        if (feedDetailRequest === controller) {
          feedDetailRequest = null;
          delete feedWorkbench.dataset.feedLoadingItem;
        }
      }
    };

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
      document.querySelectorAll("[data-feed-entry-detail]").forEach((pane) => {
        pane.hidden = pane.dataset.feedEntryDetail !== itemId;
      });
      const slot = document.querySelector('[data-feed-entry-detail="' + CSS.escape(itemId) + '"] [data-feed-item-slot]');
      if (feedWorkbench.dataset.loaded !== "true" || feedWorkbench.dataset.loadedPreset !== activeFeedPreset) {
        if (recordRead) void markFeedItemRead(selectedRow, itemId);
        setFeedDetailPlaceholder(L("正在打开 Item 工作区…"), "");
        return true;
      }
      const existingDetail = (slot || feedWorkbench).querySelector('[data-feed-detail="' + CSS.escape(itemId) + '"]');
      if (existingDetail) {
        existingDetail.hidden = false;
        feedDetailRequest?.abort();
        if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      } else if (selectedRow.dataset.feedEntryPersisted === "true") {
        void loadFeedItemDetail(selectedRow, itemId);
      } else if (selectedRow.dataset.feedEntryPrototype === "true") {
        if (feedDetailEmpty) feedDetailEmpty.hidden = true;
      } else {
        setFeedDetailPlaceholder(L("无法读取这条 Item"), L("刷新页面后再试。"), true);
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
            ? row.dataset.feedEntryStatus !== "archived"
            : row.dataset.feedEntryStatus === status;
        const matchesQuery = !query || String(row.dataset.feedEntrySearch || "").includes(query);
        return matchesType && matchesSource && matchesProvider && matchesTime && matchesStatus && matchesQuery;
      };
      const compare = (left, right) => {
        if (sort === "oldest") return String(left.dataset.feedEntryTime || "").localeCompare(String(right.dataset.feedEntryTime || ""));
        if (sort === "source") return String(left.dataset.feedEntrySource || "").localeCompare(String(right.dataset.feedEntrySource || ""));
        if (sort === "title") return String(left.dataset.feedEntryTitle || "").localeCompare(String(right.dataset.feedEntryTitle || ""));
        return String(right.dataset.feedEntryTime || "").localeCompare(String(left.dataset.feedEntryTime || ""));
      };
      const visible = [];
      const groups = [...list.querySelectorAll("[data-feed-stage-group]")];
      for (const group of groups) {
        const groupRows = [...group.querySelectorAll("[data-feed-entry-id]")];
        const groupVisible = [];
        for (const row of groupRows) {
          const wrap = row.closest("[data-feed-item-wrap]") || row;
          const match = matchesRow(row);
          wrap.hidden = !match;
          if (match) groupVisible.push(row);
        }
        const filtersIdle = source === "all" && providerType === "all" && time === "all" && !query && (status === "active" || status === "all");
        const configured = group.dataset.feedStageGroup !== "other";
        group.hidden = groupVisible.length === 0 && !(configured && filtersIdle);
        const count = group.querySelector("[data-feed-stage-group-count]");
        if (count) count.textContent = String(groupVisible.length);
        const empty = group.querySelector("[data-feed-stage-group-empty]");
        if (empty) empty.hidden = groupVisible.length > 0;
        const body = group.querySelector(".feed-stage-group-body") || group;
        groupRows.sort(compare).forEach((row) => {
          const wrap = row.closest("[data-feed-item-wrap]") || row;
          body.insertBefore(wrap, empty);
        });
        visible.push(...groupVisible);
      }
      if (feedResultCount) feedResultCount.textContent = L("{count} 个 Item", { count: visible.length });
      const filteredEmpty = visible.length === 0 && presetRows.length > 0;
      const liveEmpty = list.querySelector("[data-feed-empty]") || feedEmpty;
      if (liveEmpty) {
        const emptyTitle = liveEmpty.querySelector("[data-feed-empty-title]");
        const clearFilters = liveEmpty.querySelector("[data-feed-clear-filters]");
        const addTask = liveEmpty.querySelector("[data-feed-add-toggle]");
        if (emptyTitle) emptyTitle.textContent = filteredEmpty
          ? L("没有符合当前条件的 Item")
          : groups.length
            ? L("这里还没有 Item")
            : L("还没有拉取任务");
        if (clearFilters) clearFilters.hidden = !filteredEmpty;
        if (addTask) addTask.hidden = filteredEmpty;
        liveEmpty.hidden = visible.length > 0 || groups.some((group) => !group.hidden);
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

    document.addEventListener("change", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.matches("[data-feed-source-filter], [data-feed-type-filter], [data-feed-time-filter], [data-feed-status-filter], [data-feed-sort]")) return;
      syncFeedFilterUi();
      filterFeedItems();
    }, true);
    document.addEventListener("input", (event) => {
      const target = event.target instanceof Element ? event.target : null;
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
          (selectedSource instanceof HTMLElement ? selectedSource : feedFilterPanel.querySelector("[data-feed-filter-option]"))?.focus?.({ preventScroll: true });
        });
      }
    };

    const rememberFeedPresetState = () => {
      feedPresetState[activeFeedPreset] = {
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
      const nextPreset = "feed";
      if (nextPreset !== activeFeedPreset) rememberFeedPresetState();
      activeFeedPreset = nextPreset;
      if (restoreSavedState) restoreFeedPresetState(activeFeedPreset);
      if (feedDirectory) feedDirectory.dataset.feedPreset = activeFeedPreset;
      if (feedWorkbench) {
        feedWorkbench.dataset.feedPreset = activeFeedPreset;
        feedWorkbench.dataset.workSurfaceLabel = "Feed";
      }
      const heading = feedDirectory?.querySelector("[data-feed-directory-title]");
      if (heading) heading.textContent = "Feed";
      if (activeDesktopSurface === "feed" && mobileTreeTab) mobileTreeTab.textContent = "Feed";
      const feedDirectoryCopy = feedDirectory?.querySelector("[data-feed-directory-copy]");
      if (feedDirectoryCopy) feedDirectoryCopy.textContent = L("所有来源消息，完整保留");
      setFeedStatusOptionLabel("active", L("未忽略"));
      setFeedStatusOptionLabel("inbox", L("待处理"));
      setFeedStatusOptionLabel("saved", L("已保存"));
      setFeedStatusOptionLabel("archived", L("已忽略"));
      syncFeedFilterUi();
      setFeedTask(selectedFeedTask || "all", false);
      if (activeDesktopSurface === "feed") {
        setDesktopWorkSurface("feed", false, false);
        immersiveNavigation?.sync();
      }
    };
`;
