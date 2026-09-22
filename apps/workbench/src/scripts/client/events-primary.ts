/** AP3 Workbench client segment: events-primary. */
export const CLIENT_EVENTS_PRIMARY_SCRIPT = `        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-risk-error], [data-impact-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
      if (handleTreeStatusChange(changed)) return;
      handleGoalRelationChange(changed);
    });
    document.addEventListener("input", (event) => {
      const changed = event.target instanceof Element ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-risk-create-form], [data-risk-edit-form], [data-impact-create-form], [data-impact-edit-form], [data-policy-form]");
      if (changedFactorForm) {
        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-risk-error], [data-impact-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
    });
    const treeResizeBlocked = () => document.body.classList.contains("immersive-workbench")
      ? matchMedia("(max-width: 600px)").matches
      : matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui");
    const beginTreeResize = (clientX) => {
      resizeStartX = clientX;
      resizeStartWidth = treePane.getBoundingClientRect().width;
      treeResizer.classList.add("is-dragging");
    };
    const stopTreeResize = () => {
      treeResizer?.classList.remove("is-dragging");
      saveUiState();
    };
    treeResizer?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || treeResizeBlocked()) return;
      beginTreeResize(event.clientX);
      const pointerId = event.pointerId;
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        setTreeWidth(resizeStartWidth + moveEvent.clientX - resizeStartX);
      };
      const end = (endEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        stopTreeResize();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    });
    treeResizer?.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || treeResizeBlocked()) return;
      if (!treeResizer.classList.contains("is-dragging")) beginTreeResize(event.clientX);
      const move = (moveEvent) => setTreeWidth(resizeStartWidth + moveEvent.clientX - resizeStartX);
      const end = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", end);
        if (treeResizer.classList.contains("is-dragging")) stopTreeResize();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", end);
    });
    treeResizer?.addEventListener("dblclick", () => setTreeWidth(innerWidth <= 1050 ? 220 : 240));
    treeResizer?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setTreeWidth(treePane.getBoundingClientRect().width + (event.key === "ArrowRight" ? 16 : -16));
    });
    if (tuiResizer && tuiPane) {
      tuiResizer.addEventListener("pointerdown", (event) => {
        resizeStartX = event.clientX;
        resizeStartWidth = tuiPane.getBoundingClientRect().width;
        tuiResizer.classList.add("is-dragging");
        tuiResizer.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      tuiResizer.addEventListener("pointermove", (event) => {
        if (!tuiResizer.hasPointerCapture(event.pointerId)) return;
        setTuiWidth(resizeStartWidth - (event.clientX - resizeStartX));
      });
      const finishTuiResize = (event) => {
        if (tuiResizer.hasPointerCapture(event.pointerId)) tuiResizer.releasePointerCapture(event.pointerId);
        tuiResizer.classList.remove("is-dragging");
        saveUiState();
      };
      tuiResizer.addEventListener("pointerup", finishTuiResize);
      tuiResizer.addEventListener("pointercancel", finishTuiResize);
      tuiResizer.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setTuiWidth(tuiPane.getBoundingClientRect().width + (event.key === "ArrowLeft" ? 16 : -16));
      });
    }

    bindTreeFilterTrigger();
    feedFilterTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFeedFilterOpen(feedFilterPanel?.hidden !== false, true);
    });
    feedSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterFeedItems();
    });
    sourceSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterSources();
    });
    [feedSourceFilter, feedTypeFilter, feedTimeFilter, feedStatusFilter, feedSort].forEach((control) => {
      control?.addEventListener("change", () => {
        syncFeedFilterUi();
        filterFeedItems();
      });
    });
    document.addEventListener("change", (event) => {
      if (!event.target.matches?.("[data-source-schedule-mode]")) return;
      const detail = event.target.closest("[data-feed-task-config]");
      if (!detail) return;
      const interval = event.target.value === "interval";
      detail.querySelectorAll("[data-source-schedule-interval], [data-source-schedule-enabled]").forEach(input => {
        input.closest("label").hidden = !interval;
        input.disabled = !interval;
      });
      if (interval) detail.querySelector("[data-source-schedule-enabled]").checked = true;
    });
    feedFilterPanel?.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-feed-filter-option]");
      if (!current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const group = [...current.parentElement.querySelectorAll("[data-feed-filter-option]")];
      const currentIndex = group.indexOf(current);
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? group.length - 1
          : (currentIndex + direction + group.length) % group.length;
      event.preventDefault();
      group[nextIndex]?.click();
      group[nextIndex]?.focus();
    });
    feedList?.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-feed-entry-id]");
      if (!current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const visible = [...feedList.querySelectorAll("[data-feed-entry-id]")].filter((row) => feedEntryVisible(row));
      const currentIndex = visible.indexOf(current);
      const next = event.key === "Home" ? visible[0]
        : event.key === "End" ? visible.at(-1)
        : visible[currentIndex + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      selectFeedItem(next.dataset.feedEntryId, false, true);
      next.focus();
    });
    sourceList?.addEventListener("keydown", (event) => {
      const current = event.target.closest?.("[data-source-entry-id]");
      if (!current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = [...sourceList.querySelectorAll("[data-source-entry-id]")].filter((row) => !row.hidden);
      const index = rows.indexOf(current);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      const next = rows[nextIndex];
      if (next) {
        selectSource(next.dataset.sourceEntryId, false);
        next.focus();
      }
    });

    document.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const humanReviewJump = target.closest("[data-human-review-jump]");
      if (humanReviewJump) {
        const reviewForm = humanReviewJump.closest(".human-review-list")?.querySelector("[data-human-review-form]");
        reviewForm?.scrollIntoView({ block: "start" });
        requestAnimationFrame(() => reviewForm?.querySelector('[name="verdict"]')?.focus({ preventScroll: true }));
        return;
      }
      const activeProjectMenu = target.closest("[data-project-menu]");
      projectMenus.forEach((menu) => {
        if (menu.open && menu !== activeProjectMenu) menu.open = false;
      });
      if (!feedFilterPanel?.hidden && !target.closest("[data-feed-filter-panel], [data-feed-filter-trigger]")) setFeedFilterOpen(false);
      const feedFilterOption = target.closest("[data-feed-filter-option]");
      if (feedFilterOption) {
        const control = {
          source: document.querySelector("[data-feed-source-filter]"),
          type: document.querySelector("[data-feed-type-filter]"),
          time: document.querySelector("[data-feed-time-filter]"),
          status: document.querySelector("[data-feed-status-filter]"),
          sort: document.querySelector("[data-feed-sort]"),
        }[feedFilterOption.dataset.feedFilterOption];
        if (control) control.value = feedFilterOption.dataset.feedFilterValue || "";
        syncFeedFilterUi();
        filterFeedItems();
        return;
      }
      if (target.closest("[data-feed-filter-reset]")) {
        const source = document.querySelector("[data-feed-source-filter]");
        const type = document.querySelector("[data-feed-type-filter]");
        const time = document.querySelector("[data-feed-time-filter]");
        const status = document.querySelector("[data-feed-status-filter]");
        const sort = document.querySelector("[data-feed-sort]");
        if (source) source.value = "all";
        if (type) type.value = "all";
        if (time) time.value = "all";
        if (status) status.value = "active";
        if (sort) sort.value = "newest";
        syncFeedFilterUi();
        filterFeedItems(false);
        return;
      }
      const sourceFilter = target.closest("[data-source-filter]");
      if (sourceFilter) {
        activeSourceFilter = sourceFilter.dataset.sourceFilter || "all";
        sourceDirectory?.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button === sourceFilter;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(false);
        return;
      }
      if (target.closest("[data-source-filter-reset]")) {
        activeSourceFilter = "all";
        if (sourceSearch) sourceSearch.value = "";
        sourceDirectory?.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button.dataset.sourceFilter === "all";
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(false);
        return;
      }
      const sourceEntry = target.closest("[data-source-entry-id]");
      if (sourceEntry) {
        selectSource(sourceEntry.dataset.sourceEntryId, true);
        return;
      }
      const sourceDetailTab = target.closest("[data-source-detail-tab]");
      if (sourceDetailTab) {
        setSourceDetailTab(sourceDetailTab.closest("[data-source-detail]"), sourceDetailTab.dataset.sourceDetailTab || "overview");
        queueSave();
        return;
      }
      const policyCancel = target.closest("[data-policy-cancel]");
      if (policyCancel) {
        const form = policyCancel.closest("form");
        form?.querySelectorAll("[aria-invalid]").forEach(field => field.removeAttribute("aria-invalid"));
        const error = form?.querySelector("[data-policy-error]");
        if (error) error.hidden = true;
        return;
      }
      const planReset = target.closest("[data-source-schedule-reset]");
      if (planReset) {
        const region = planReset.closest("[data-feed-plan-region]");
        resetFeedFields(region);
        const manual = region?.querySelector("[data-source-schedule-mode]")?.value === "manual";
        for (const selector of ["[data-source-schedule-interval]", "[data-source-schedule-enabled]"]) {
          const label = region?.querySelector(selector)?.closest("label");
          if (label) label.hidden = manual;
        }
        const status = region?.closest("[data-source-detail]")?.querySelector("[data-source-action-status]");
        if (status) status.hidden = true;
        return;
      }
      const sourceConfigSave = target.closest("[data-source-config-save]");
      if (sourceConfigSave) {
        const detail = sourceConfigSave.closest("[data-source-detail]") || feedSourcesDialog?.querySelector("[data-feed-task-config]:not([hidden])");
        const sourceId = sourceConfigSave.dataset.sourceId;
        const readField = (name) => detail?.querySelector('[data-source-config-field="' + name + '"]')?.value || "";
        if ([...detail.querySelectorAll('[data-source-config-field]')].some(input => !input.reportValidity())) return;
        sourceConfigSave.disabled = true;
        showPrototypeStatus(detail, L("正在保存来源配置…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "PATCH", {
            name: readField("name"),
            description: readField("description"),
            scope: detail.querySelector('[data-source-config-field="scope"]') ? readField("scope") : undefined,
            feed_url: readField("feed_url") || undefined,
          });
          showPrototypeStatus(detail, L("任务配置已保存。"));
          await refreshFeedStage();
          sourceConfigSave.disabled = false;
        } catch (error) {
          showPrototypeStatus(detail, error.message || L("来源配置保存失败，请检查后重试。"));
          sourceConfigSave.disabled = false;
        }
        return;
      }
      const sourceScheduleSave = target.closest("[data-source-schedule-save]");
      if (sourceScheduleSave) {
        const detail = sourceScheduleSave.closest("[data-source-detail]");
        const sourceId = sourceScheduleSave.dataset.sourceId;
        const mode = detail?.querySelector("[data-source-schedule-mode]")?.value || "manual";
        const enabled = Boolean(detail?.querySelector("[data-source-schedule-enabled]")?.checked);
        const intervalMinutes = Number(detail?.querySelector("[data-source-schedule-interval]")?.value || 60);
        sourceScheduleSave.disabled = true;
        showPrototypeStatus(sourceScheduleSave, L("正在保存拉取计划…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/schedule", "PUT", mode === "manual"
            ? { mode: "manual" }
            : { mode: "interval", enabled, interval_minutes: intervalMinutes });
          showPrototypeStatus(sourceScheduleSave, mode === "manual"
            ? L("已改为仅手动拉取。")
            : enabled ? L("定时拉取已保存；本地服务会在到期后执行。") : L("定时拉取已暂停。"));
          detail.querySelectorAll("[data-source-schedule-mode], [data-source-schedule-interval], [data-source-schedule-enabled]").forEach(field => {
            if (field.tagName === "SELECT") [...field.options].forEach(option => option.defaultSelected = option.selected);
            else if (field.type === "checkbox") field.defaultChecked = field.checked;
            else field.defaultValue = field.value;
          });
          sourceScheduleSave.disabled = false;
        } catch (error) {
          showPrototypeStatus(sourceScheduleSave, error.message || L("拉取计划保存失败，请检查后重试。"));
          sourceScheduleSave.disabled = false;
        }
        return;
      }
      const sourceScheduleEnabled = target.closest("[data-source-schedule-enabled]");
      if (sourceScheduleEnabled) {
        const label = sourceScheduleEnabled.closest("label")?.querySelector("span");
        if (label) label.textContent = sourceScheduleEnabled.checked ? L("已开启") : L("已暂停");
        return;
      }
      const sourceRuntimeAction = target.closest("[data-source-runtime-action]");
      if (sourceRuntimeAction) {
        const sourceId = sourceRuntimeAction.dataset.sourceId;
        const action = sourceRuntimeAction.dataset.sourceRuntimeAction;
        sourceRuntimeAction.disabled = true;
        showPrototypeStatus(sourceRuntimeAction, action === "sync" ? L("正在拉取；失败不会被写成成功…") : L("正在更新来源状态…"));
        try {
          const body = action === "sync"
            ? { idempotency_key: globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-source-sync") }
            : {};
          const result = await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/" + action, "POST", body);
          const message = action === "sync"
            ? result.run?.error_code
              ? L("拉取失败：{code}。已保留上次成功内容，可按来源提示重试。", { code: result.run.error_code })
              : result.run?.receipt?.rss_http?.not_modified
                ? L("拉取完成：源站未修改，没有新增 Item。")
                : L("拉取完成：新增 {created}，去重 {deduped}", { created: result.created || 0, deduped: result.deduped || 0 })
            : action === "pause" ? L("来源已暂停；消息与历史仍保留。")
              : action === "resume" ? L("来源已恢复。") : L("账号已断开，后续不会再拉取。")
          showPrototypeStatus(sourceRuntimeAction, message);
          await refreshFeedStage();
          sourceRuntimeAction.disabled = false;
        } catch (error) {
          showPrototypeStatus(sourceRuntimeAction, error.message || L("来源操作失败，请按提示处理后重试。"));
          sourceRuntimeAction.disabled = false;
        }
        return;
      }
      const sourceDelete = target.closest("[data-source-delete]");
      if (sourceDelete) {
        const sourceId = sourceDelete.dataset.sourceId;
        const historyDecision = sourceDelete.dataset.sourceDelete;
        const warning = historyDecision === "delete_local_history"
          ? L("确认删除这个来源及其本地消息、资料、Inbox 引用和运行记录？此操作无法从 Molis Work 恢复。")
          : L("确认删除这个来源并停止拉取？已有消息和运行历史会保留。 ");
        if (!globalThis.confirm(warning)) return;
        sourceDelete.disabled = true;
        showPrototypeStatus(sourceDelete, L("正在删除来源…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "DELETE", { history_decision: historyDecision });
          showPrototypeStatus(sourceDelete, historyDecision === "delete_local_history" ? L("来源与本地历史已删除。") : L("来源已删除，历史已保留。"));
          feedSourcesDialog?.close();
          await refreshFeedStage();
        } catch (error) {
          showPrototypeStatus(sourceDelete, error.message || L("删除来源失败，请重试。"));
          sourceDelete.disabled = false;
        }
        return;
      }
      const prototypeConfigSave = target.closest("[data-prototype-config-save]");
      if (prototypeConfigSave) {
        showPrototypeStatus(prototypeConfigSave, L("演示配置已保存到当前页面；刷新后恢复，不会写入真实来源。"));
        return;
      }
      const prototypeScheduleSave = target.closest("[data-prototype-schedule-save]");
      if (prototypeScheduleSave) {
        const sheet = prototypeScheduleSave.closest(".source-schedule-sheet");
        const enabled = sheet?.querySelector("[data-prototype-schedule-enabled]")?.checked;
        const frequency = sheet?.querySelector("[data-prototype-schedule-frequency]")?.value || L("当前频率");
        showPrototypeStatus(prototypeScheduleSave, enabled
          ? L("模拟计划已保存：{frequency}。浏览器关闭后不会继续运行。", { frequency })
          : L("模拟计划已暂停。真实后台调度未启动。"));
        return;
      }
      const prototypeScheduleEnabled = target.closest("[data-prototype-schedule-enabled]");
      if (prototypeScheduleEnabled) {
        const label = prototypeScheduleEnabled.closest("label")?.querySelector("span");
        if (label) label.textContent = prototypeScheduleEnabled.checked ? L("已开启") : L("已暂停");
        return;
      }
      const prototypeSourceSync = target.closest("[data-prototype-source-sync]");
      if (prototypeSourceSync) {
        const sourceId = prototypeSourceSync.dataset.prototypeSourceSync;
        const detail = prototypeSourceSync.closest("[data-source-detail]");
        const health = detail?.querySelector("[data-source-health-label]");
        const row = sourceList?.querySelector('[data-source-entry-id="' + CSS.escape(sourceId) + '"]');
        const rowState = row?.querySelector(".source-list-state");
        const original = prototypeSourceSync.innerHTML;
        prototypeSourceSync.disabled = true;
        prototypeSourceSync.setAttribute("aria-busy", "true");
        prototypeSourceSync.innerHTML = L("模拟拉取中…");
        if (health) health.textContent = L("正在拉取");
        if (rowState) rowState.textContent = L("正在拉取");
        if (row) row.dataset.sourceStatus = "syncing";
        globalThis.setTimeout(() => {
          prototypeSourceSync.disabled = false;
          prototypeSourceSync.removeAttribute("aria-busy");
          prototypeSourceSync.innerHTML = original;
          if (health) health.textContent = L("运行正常");
          if (rowState) rowState.textContent = L("运行正常");
          if (row) row.dataset.sourceStatus = "active";
          showPrototypeStatus(prototypeSourceSync, L("模拟拉取完成：新增 3，去重 8；没有访问真实外部服务。"));
        }, 850);
        return;
      }
      const openPrototypeSource = target.closest("[data-open-prototype-source]");
      if (openPrototypeSource) {
        const requestedSource = openPrototypeSource.dataset.openPrototypeSource;
        const fallbackSource = document.querySelector('[data-feed-task="' + CSS.escape(requestedSource) + '"]')
          ? requestedSource
          : document.querySelector('[data-source-kind="' + CSS.escape(openPrototypeSource.dataset.openSourceKind || "") + '"]')?.dataset.feedTask || document.querySelector('[data-source-kind="' + CSS.escape(openPrototypeSource.dataset.openSourceKind || "") + '"]')?.dataset.sourceEntryId;
        setDesktopDirectory("feed", true, false, openPrototypeSource);
        if (!openDirectorySurface("feed", undefined, undefined, event)) setDesktopWorkSurface("feed", true, false);
        setFeedTask(fallbackSource || requestedSource || "all");
        return;
      }
      const prototypeFeedAction = target.closest("[data-prototype-feed-action]");
      if (prototypeFeedAction) {
        const detail = prototypeFeedAction.closest("[data-prototype-feed-detail]");
        const destination = detail?.querySelector("[data-prototype-destination]");
        const action = prototypeFeedAction.dataset.prototypeFeedAction;
        const labels = {
          inbox: [L("已进入 Inbox"), L("Inbox 只保存需处理引用；原消息仍在 Feed")],
          save: [L("已保存为资料"), L("当前页面演示状态，不写入数据库")],
          promote: [L("已准备升格 Goal"), L("正式 Goal 创建留给后续功能")],
          ignore: [L("已忽略"), L("消息仍可从 Feed 历史追溯")],
        }[action] || [L("演示状态已更新"), L("没有发生真实写入")];
        if (destination) {
          const strong = destination.querySelector("strong");
          const small = destination.querySelector("small");
          if (strong) strong.textContent = labels[0];
          if (small) small.textContent = labels[1];
          destination.dataset.destinationState = action;
        }
        showPrototypeStatus(prototypeFeedAction, labels[0] + "。" + labels[1] + "。");
        if (action === "ignore") {
          const wrap = prototypeFeedAction.closest("[data-feed-item-wrap]");
          const row = wrap?.querySelector("[data-feed-entry-id]") || prototypeFeedAction.closest("[data-feed-entry-id]");
          if (row) row.dataset.feedEntryStatus = "archived";
          filterFeedItems(false);
        }
        if (action === "inbox") {
          prototypeFeedAction.disabled = true;
          prototypeFeedAction.textContent = L("已加入 Inbox");
        }
        return;
      }
      const prototypeInboxComplete = target.closest("[data-prototype-inbox-complete]");
      if (prototypeInboxComplete) {
        const itemId = prototypeInboxComplete.dataset.prototypeItemId;
        const row = feedList?.querySelector('[data-feed-entry-id="' + CSS.escape(itemId) + '"]');
        if (row) row.dataset.feedEntryStatus = "archived";
        const detail = prototypeInboxComplete.closest("[data-prototype-feed-detail]");
        if (detail) detail.hidden = true;
        setFeedDetailPlaceholder(L("这件事已处理完成"), L("它已退出默认 Inbox；原 Feed Item、来源或 Goal 仍可追溯。"));
        filterFeedItems(false);
        showToast(L("已完成 · 仅本页演示"));
        return;
      }
      const prototypeInboxDefer = target.closest("[data-prototype-inbox-defer]");
      if (prototypeInboxDefer) {
        showPrototypeStatus(prototypeInboxDefer, L("仍保留在 Inbox；稍后处理不会改变进入原因。"));
        return;
      }
      if (target.closest("[data-prototype-feed-empty-state]")) {
        feedList?.querySelectorAll("[data-feed-entry-id]").forEach((row) => {
          if (row.dataset.feedEntryType === activeFeedPreset) {
            const wrap = row.closest("[data-feed-item-wrap]") || row;
            wrap.hidden = true;
          }
        });
        feedWorkbench?.querySelectorAll("[data-feed-detail]").forEach((detail) => { detail.hidden = true; });
        if (feedEmpty) {
          feedEmpty.dataset.prototypeEmptyPreview = "true";
          feedEmpty.hidden = false;
          const title = feedEmpty.querySelector("[data-feed-empty-title]");
          const restore = feedEmpty.querySelector("[data-prototype-feed-restore]");
          const clear = feedEmpty.querySelector("[data-feed-clear-filters]");
          const sources = feedEmpty.querySelector("[data-feed-empty-sources]");
          if (title) title.textContent = L("暂时没有新消息");
          if (restore) restore.hidden = false;
          if (clear) clear.hidden = true;
          if (sources) sources.hidden = true;
        }
        if (feedResultCount) feedResultCount.textContent = L("0 个 Item");
        setFeedDetailPlaceholder(L("Feed 暂无新消息"), "");
        return;
      }
      if (target.closest("[data-prototype-feed-restore]")) {
        if (feedEmpty) delete feedEmpty.dataset.prototypeEmptyPreview;
        const restore = feedEmpty?.querySelector("[data-prototype-feed-restore]");
        const sources = feedEmpty?.querySelector("[data-feed-empty-sources]");
        if (restore) restore.hidden = true;
        if (sources) sources.hidden = false;
        filterFeedItems(false);
        return;
      }
      const feedChoice = target.closest("[data-feed-choose-kind], [data-feed-connect-kind]");
      if (feedChoice) { showFeedSetup("setup", feedChoice.dataset.feedChooseKind || feedChoice.dataset.feedConnectKind); return; }
      const feedConfig = target.closest("[data-feed-task-config-open]");
      if (feedConfig) {
        event.stopPropagation();
        showFeedSetup("config", feedConfig.dataset.feedTaskConfigOpen);
        return;
      }
      if (target.closest("[data-feed-sources-open], [data-feed-setup-back]")) { showFeedSetup(); return; }
      if (target.closest("[data-feed-sources-close]")) {
        const config = feedSourcesDialog?.querySelector("[data-feed-task-config]:not([hidden])");
        if (config) resetFeedFields(config);
        feedSourcesDialog?.close(); return;
      }
      const sourceRegister = target.closest("[data-feed-source-register]");
      if (sourceRegister) {
        const form = sourceRegister.form || sourceRegister.closest("[data-feed-add-form]");
        const scope = form || feedSourcesDialog;
        const kind = sourceRegister.dataset.feedSourceRegister;
        const value = kind === "rss"
          ? scope?.querySelector("[data-feed-rss-definition]")?.value
          : scope?.querySelector('[data-feed-source-value="' + kind + '"]')?.value;
        const name = form?.querySelector("[data-feed-add-name]")?.value?.trim();
        const body = kind === "rss" ? { kind, definition_id: value }
          : kind === "web_query" ? { kind, query: value }
          : kind === "youtube_channel" ? { kind, channel_id: value }
          : { kind, feed_url: value };
        if (name) body.name = name;
        if (form && !form.reportValidity()) return;
        sourceRegister.disabled = true;
        const inlineError = form?.querySelector("[data-feed-add-error]");
        if (inlineError) {
          inlineError.hidden = true;
          inlineError.textContent = "";
        }
        setFeedSourceFeedback(L("正在添加来源…"));
        let phase = "source";
        try {
          let sourceId = form?.dataset.createdSourceId;
          if (!sourceId) {
            const result = await feedApi("/api/feed/sources", "POST", body);
            sourceId = result.source.source_id;
            if (form) form.dataset.createdSourceId = sourceId;
          }
          const minutes = Number(form?.querySelector("[data-feed-create-frequency]")?.value || 0);
          phase = "schedule";
          if (minutes) await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/schedule", "PUT", { mode: "interval", enabled: true, interval_minutes: minutes });
          phase = "out-rule";
          await saveFeedAddOutRule(form, sourceId);
          selectedFeedTask = sourceId;
          document.dispatchEvent(new CustomEvent("workbench-feed-task", { detail: { taskId: sourceId } }));
          saveUiState();
          setFeedAddOpen(false);
          await refreshFeedStage();
        } catch (error) {
          const retryCopy = phase === "out-rule"
            ? L("任务已创建，捕捉规则未保存。请重试，不会重复创建任务。")
            : form?.dataset.createdSourceId
              ? L("任务已创建，拉取计划未保存。请重试，不会重复创建任务。")
              : "";
          const message = retryCopy
            ? retryCopy + " " + error.message
            : error.message || L("添加来源失败");
          if (form?.dataset.createdSourceId) {
            form.querySelectorAll("input, [data-feed-rss-definition]").forEach(input => input.disabled = true);
            feedSourcesDialog.querySelector("[data-feed-setup-back]").hidden = true;
            sourceRegister.textContent = phase === "out-rule" ? L("重试保存捕捉规则") : L("重试保存计划");
            form.querySelectorAll("[data-feed-add-out-rule-name], [data-feed-add-out-rule-contains]").forEach(input => input.disabled = false);
          }
          if (inlineError) {
            inlineError.textContent = message;
            inlineError.hidden = false;
          }
          setFeedSourceFeedback(message, true);
          sourceRegister.disabled = false;
        }
        return;
      }
      const createOutRule = target.closest("[data-feed-out-rule-create]");
      if (createOutRule) {
        const section = createOutRule.closest("[data-feed-out-rules]");
        const sourceId = section?.dataset.feedOutRules;
        const name = section?.querySelector("[data-feed-out-rule-name]")?.value?.trim();
        const contains = section?.querySelector("[data-feed-out-rule-contains]")?.value?.trim();
        const functionKey = section?.querySelector("[data-feed-out-rule-function-key]")?.value?.trim();
        if (!sourceId) return;
        if (!name && !contains) {
          setFeedSourceFeedback(L("请填写规则名称或包含关键字"), true);
          return;
        }
        createOutRule.disabled = true;
        setFeedSourceFeedback(L("正在添加捕捉规则…"));
        try {
          await feedApi("/api/feed/out-rules", "POST", { name: name || contains, contains, source_id: sourceId, ...(functionKey ? { function_key: functionKey } : {}) });
          saveUiState();
          await refreshFeedStage();
          createOutRule.disabled = false;
        } catch (error) {
          setFeedSourceFeedback(error.message || L("添加捕捉规则失败"), true);
          createOutRule.disabled = false;
        }
        return;
      }
      const toggleOutRule = target.closest("[data-feed-out-rule-toggle]");
      if (toggleOutRule) {
        const ruleId = toggleOutRule.dataset.feedOutRuleToggle;
        const enabled = toggleOutRule.dataset.enabled !== "true";
        toggleOutRule.disabled = true;
        setFeedSourceFeedback(L("正在更新捕捉规则…"));
        try {
          await feedApi("/api/feed/out-rules/" + encodeURIComponent(ruleId), "PATCH", { enabled });
          saveUiState();
          await refreshFeedStage();
          toggleOutRule.disabled = false;
        } catch (error) {
          setFeedSourceFeedback(error.message || L("更新捕捉规则失败"), true);
          toggleOutRule.disabled = false;
        }
        return;
      }
      const deleteOutRule = target.closest("[data-feed-out-rule-delete]");
      if (deleteOutRule) {
        const ruleId = deleteOutRule.dataset.feedOutRuleDelete;
        deleteOutRule.disabled = true;
        setFeedSourceFeedback(L("正在删除捕捉规则…"));
        try {
          await feedApi("/api/feed/out-rules/" + encodeURIComponent(ruleId), "DELETE");
          saveUiState();
          await refreshFeedStage();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("删除捕捉规则失败"), true);
          deleteOutRule.disabled = false;
        }
        return;
      }
      const sourceToggle = target.closest("[data-feed-source-toggle]");
      if (sourceToggle) {
        const sourceId = sourceToggle.dataset.feedSourceToggle;
        const action = sourceToggle.dataset.feedSourceEnabled === "true" ? "pause" : "resume";
        sourceToggle.disabled = true;
        setFeedSourceFeedback(action === "pause" ? L("正在暂停来源…") : L("正在恢复来源…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/" + action, "POST", {});
          saveUiState();
          await refreshFeedStage();
          sourceToggle.disabled = false;
        } catch (error) {
          setFeedSourceFeedback(error.message || L("来源状态更新失败"), true);
          sourceToggle.disabled = false;
        }
        return;
      }
      const sourceSync = target.closest("[data-feed-source-sync]");
      if (sourceSync) {
        const sourceId = sourceSync.dataset.feedSourceSync;
        sourceSync.disabled = true;
        setFeedSourceFeedback(L("正在同步来源；失败时不会写成成功…"));
        try {
          const operationKey = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-feed-sync");
          const result = await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/sync", "POST", { idempotency_key: operationKey });
          setFeedSourceFeedback(result.run?.error_code
            ? L("同步失败：{code}。已保留上次成功内容，可按来源提示重试。", { code: result.run.error_code })
            : result.run?.receipt?.rss_http?.not_modified
              ? L("同步完成：源站未修改，没有新增 Item。")
              : L("同步完成：新增 {created}，去重 {deduped}", { created: result.created || 0, deduped: result.deduped || 0 }));
          saveUiState();
          await refreshFeedStage();
          sourceSync.disabled = false;
        } catch (error) {
          setFeedSourceFeedback(error.message || L("来源同步失败"), true);
          sourceSync.disabled = false;
        }
        return;
      }
      const connectorBind = target.closest("[data-feed-connector-bind]");
      if (connectorBind) {
        const kind = connectorBind.dataset.feedConnectorBind;
        const input = feedSourcesDialog?.querySelector('[data-feed-connector-token="' + kind + '"]');
        connectorBind.disabled = true;
        try {
          await feedApi("/api/feed/connectors/" + kind + "/token", "POST", { token: input?.value || "" });
          if (input) input.value = "";
          saveUiState();
          await refreshFeedStage();
          connectorBind.disabled = false;
        } catch (error) {
          setFeedSourceFeedback(error.message || L("账号连接失败"), true);
          connectorBind.disabled = false;
        }
        return;
      }
      const connectorUnbind = target.closest("[data-feed-connector-unbind]");
      if (connectorUnbind) {
        const kind = connectorUnbind.dataset.feedConnectorUnbind;
        connectorUnbind.disabled = true;
        try {
          await feedApi("/api/feed/connectors/" + kind + "/token", "DELETE");
          saveUiState();
          await refreshFeedStage();
          connectorUnbind.disabled = false;
        } catch (error) {
          setFeedSourceFeedback(error.message || L("断开账号失败"), true);
          connectorUnbind.disabled = false;
        }
        return;
      }
      if (target.closest("[data-feed-github-device-start]")) {
        const button = target.closest("[data-feed-github-device-start]");
        const clientId = feedSourcesDialog?.querySelector("[data-feed-github-client-id]")?.value || "";
        const status = feedSourcesDialog?.querySelector("[data-feed-github-device-status]");
        const poll = feedSourcesDialog?.querySelector("[data-feed-github-device-poll]");
        button.disabled = true;
        try {
          const result = await feedApi("/api/feed/connectors/github/device/start", "POST", { client_id: clientId });
          if (status) {
            status.textContent = L("授权码：{code}。已打开 GitHub，完成后回来检查状态。", { code: result.user_code });
            status.dataset.deviceCode = result.device_code;
            status.hidden = false;
          }
          if (poll) poll.hidden = false;
          globalThis.open(result.verification_uri, "_blank", "noopener,noreferrer");
        } catch (error) {
          setFeedSourceFeedback(error.message || L("GitHub 授权启动失败"), true);
          button.disabled = false;
        }
        return;
      }
      if (target.closest("[data-feed-github-device-poll]")) {
        const button = target.closest("[data-feed-github-device-poll]");
        const status = feedSourcesDialog?.querySelector("[data-feed-github-device-status]");
        const clientId = feedSourcesDialog?.querySelector("[data-feed-github-client-id]")?.value || "";
        button.disabled = true;
        try {
          const result = await feedApi("/api/feed/connectors/github/device/poll", "POST", { device_code: status?.dataset.deviceCode || "", client_id: clientId });
          if (result.status === "authorized") {
            saveUiState();
            await refreshFeedStage();
            button.disabled = false;
          } else {
            if (status) status.textContent = result.message || L("GitHub 仍在等待授权。完成后再次检查。");
            button.disabled = false;
          }
        } catch (error) {
          setFeedSourceFeedback(error.message || L("GitHub 授权检查失败"), true);
          button.disabled = false;
        }
`;
