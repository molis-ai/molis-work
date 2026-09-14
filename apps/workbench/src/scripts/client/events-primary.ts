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
    treeResizer?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (document.body.classList.contains("immersive-workbench") ? matchMedia("(max-width: 600px)").matches : matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui")) return;
      resizeStartX = event.clientX;
      resizeStartWidth = treePane.getBoundingClientRect().width;
      treeResizer.classList.add("is-dragging");
      treeResizer.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    treeResizer?.addEventListener("pointermove", (event) => {
      if (!treeResizer.hasPointerCapture(event.pointerId)) return;
      setTreeWidth(resizeStartWidth + event.clientX - resizeStartX);
    });
    const finishTreeResize = (event) => {
      if (treeResizer?.hasPointerCapture(event.pointerId)) treeResizer.releasePointerCapture(event.pointerId);
      treeResizer?.classList.remove("is-dragging");
      saveUiState();
    };
    treeResizer?.addEventListener("pointerup", finishTreeResize);
    treeResizer?.addEventListener("pointercancel", finishTreeResize);
    treeResizer?.addEventListener("dblclick", () => setTreeWidth(innerWidth <= 1050 ? 236 : 264));
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
      const visible = [...feedList.querySelectorAll("[data-feed-entry-id]:not([hidden])")];
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
          source: feedSourceFilter,
          type: feedTypeFilter,
          time: feedTimeFilter,
          status: feedStatusFilter,
          sort: feedSort,
        }[feedFilterOption.dataset.feedFilterOption];
        if (control) control.value = feedFilterOption.dataset.feedFilterValue || "";
        syncFeedFilterUi();
        filterFeedItems();
        return;
      }
      if (target.closest("[data-feed-filter-reset]")) {
        if (feedSourceFilter) feedSourceFilter.value = "all";
        if (feedTypeFilter) feedTypeFilter.value = "all";
        if (feedTimeFilter) feedTimeFilter.value = "all";
        if (feedStatusFilter) feedStatusFilter.value = "active";
        if (feedSort) feedSort.value = "newest";
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
      const sourceConfigSave = target.closest("[data-source-config-save]");
      if (sourceConfigSave) {
        const detail = sourceConfigSave.closest("[data-source-detail]");
        const sourceId = sourceConfigSave.dataset.sourceId;
        const readField = (name) => detail?.querySelector('[data-source-config-field="' + name + '"]')?.value || "";
        sourceConfigSave.disabled = true;
        showPrototypeStatus(sourceConfigSave, L("正在保存来源配置…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "PATCH", {
            name: readField("name"),
            description: readField("description"),
            scope: readField("scope"),
            feed_url: readField("feed_url") || undefined,
          });
          showPrototypeStatus(sourceConfigSave, L("来源配置已保存。地址与秘密凭据没有改变。"));
          globalThis.setTimeout(() => location.reload(), 450);
        } catch (error) {
          showPrototypeStatus(sourceConfigSave, error.message || L("来源配置保存失败，请检查后重试。"));
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
          globalThis.setTimeout(() => location.reload(), 450);
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
          globalThis.setTimeout(() => location.reload(), 550);
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
          ? L("确认删除这个来源及其本地消息、资料、Inbox 引用和运行记录？此操作无法从 GoalBoard 恢复。")
          : L("确认删除这个来源并停止拉取？已有消息和运行历史会保留。 ");
        if (!globalThis.confirm(warning)) return;
        sourceDelete.disabled = true;
        showPrototypeStatus(sourceDelete, L("正在删除来源…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "DELETE", { history_decision: historyDecision });
          showPrototypeStatus(sourceDelete, historyDecision === "delete_local_history" ? L("来源与本地历史已删除。") : L("来源已删除，历史已保留。"));
          globalThis.setTimeout(() => location.reload(), 550);
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
        if (rowState) {
          rowState.textContent = L("正在拉取");
          rowState.dataset.sourceStatus = "syncing";
        }
        if (row) row.dataset.sourceStatus = "syncing";
        globalThis.setTimeout(() => {
          prototypeSourceSync.disabled = false;
          prototypeSourceSync.removeAttribute("aria-busy");
          prototypeSourceSync.innerHTML = original;
          if (health) health.textContent = L("运行正常");
          if (rowState) {
            rowState.textContent = L("运行正常");
            rowState.dataset.sourceStatus = "active";
          }
          if (row) row.dataset.sourceStatus = "active";
          showPrototypeStatus(prototypeSourceSync, L("模拟拉取完成：新增 3，去重 8；没有访问真实外部服务。"));
        }, 850);
        return;
      }
      const openPrototypeSource = target.closest("[data-open-prototype-source]");
      if (openPrototypeSource) {
        setDesktopDirectory("sources", true, false, openPrototypeSource);
        setDesktopWorkSurface("sources", true, false);
        const requestedSource = openPrototypeSource.dataset.openPrototypeSource;
        const fallbackSource = sourceList?.querySelector('[data-source-kind="' + CSS.escape(openPrototypeSource.dataset.openSourceKind || "") + '"]')?.dataset.sourceEntryId;
        selectSource(sourceList?.querySelector('[data-source-entry-id="' + CSS.escape(requestedSource) + '"]') ? requestedSource : fallbackSource, true);
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
          if (row.dataset.feedEntryType === activeFeedPreset) row.hidden = true;
        });
        feedWorkbench?.querySelectorAll("[data-feed-detail]").forEach((detail) => { detail.hidden = true; });
        if (feedEmpty) {
          feedEmpty.dataset.prototypeEmptyPreview = "true";
          feedEmpty.hidden = false;
          const title = feedEmpty.querySelector("[data-feed-empty-title]");
          const copy = feedEmpty.querySelector("[data-feed-empty-copy]");
          const restore = feedEmpty.querySelector("[data-prototype-feed-restore]");
          const clear = feedEmpty.querySelector("[data-feed-clear-filters]");
          const sources = feedEmpty.querySelector("[data-feed-empty-sources]");
          if (title) title.textContent = activeFeedPreset === "inbox_message" ? L("Inbox 已经处理完") : L("暂时没有新消息");
          if (copy) copy.textContent = activeFeedPreset === "inbox_message"
            ? L("需要你介入的事情都已退出默认列表；原对象和历史仍可追溯。")
            : L("来源仍按计划拉取；新消息到达后会先进入 Feed。");
          if (restore) restore.hidden = false;
          if (clear) clear.hidden = true;
          if (sources) sources.hidden = true;
        }
        setFeedDetailPlaceholder(activeFeedPreset === "inbox_message" ? L("Inbox 已处理完") : L("Feed 暂无新消息"), L("这是页面内空状态预览，不会修改真实 Item。"));
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
      if (target.closest("[data-feed-sources-open]")) {
        feedSourcesDialog?.showModal();
        setFeedSourceFeedback("");
        return;
      }
      if (target.closest("[data-feed-sources-close]")) {
        feedSourcesDialog?.close();
        return;
      }
      const sourceRegister = target.closest("[data-feed-source-register]");
      if (sourceRegister) {
        const kind = sourceRegister.dataset.feedSourceRegister;
        const value = kind === "rss"
          ? feedSourcesDialog?.querySelector("[data-feed-rss-definition]")?.value
          : feedSourcesDialog?.querySelector('[data-feed-source-value="' + kind + '"]')?.value;
        const body = kind === "rss" ? { kind, definition_id: value }
          : kind === "web_query" ? { kind, query: value }
          : kind === "youtube_channel" ? { kind, channel_id: value }
          : { kind, feed_url: value };
        sourceRegister.disabled = true;
        setFeedSourceFeedback(L("正在添加来源…"));
        try {
          await feedApi("/api/feed/sources", "POST", body);
          saveUiState();
          location.reload();
        } catch (error) {
          setFeedSourceFeedback(error.message || L("添加来源失败"), true);
          sourceRegister.disabled = false;
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
          location.reload();
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
          location.reload();
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
          location.reload();
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
          location.reload();
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
            location.reload();
          } else {
            if (status) status.textContent = result.message || L("GitHub 仍在等待授权。完成后再次检查。");
            button.disabled = false;
          }
        } catch (error) {
          setFeedSourceFeedback(error.message || L("GitHub 授权检查失败"), true);
          button.disabled = false;
        }
`;
