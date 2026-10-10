/** AP3 Workbench client segment: events-primary. */
export const CLIENT_EVENTS_PRIMARY_SCRIPT = `        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-risk-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
      if (handleTreeStatusChange(changed)) return;
      handleGoalRelationChange(changed);
    });
    document.addEventListener("input", (event) => {
      const changed = event.target?.nodeType === 1 ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-risk-create-form], [data-risk-edit-form], [data-policy-form]");
      if (changedFactorForm) {
        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-risk-error], [data-policy-error]");
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
    // The source directory is in the page only while the project has Feed: its search and its list are bound when it is there,
    // at load or when Feed comes (adoptFeed), and only once.
    const bindSourceDirectory = () => {
      if (sourceSearch && !sourceSearch.dataset.bound) {
        sourceSearch.dataset.bound = "true";
        sourceSearch.addEventListener("input", () => {
          noteSearchActivity();
          filterSources();
        });
      }
      const list = sourceList;
      if (list && !list.dataset.bound) {
        list.dataset.bound = "true";
        list.addEventListener("keydown", (event) => {
          const current = event.target.closest?.("[data-source-entry-id]");
          if (!current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const rows = [...list.querySelectorAll("[data-source-entry-id]")].filter((row) => !row.hidden);
          const index = rows.indexOf(current);
          const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
          event.preventDefault();
          const next = rows[nextIndex];
          if (next) {
            selectSource(next.dataset.sourceEntryId, false);
            next.focus();
          }
        });
      }
    };
    bindSourceDirectory();

    const closeGoalOverlay = () => {
      const shell = document.querySelector("[data-goal-canvas-shell]");
      if (!shell) return;
      shell.removeAttribute("data-goal-planning");
      shell.removeAttribute("data-goal-rules");
      shell.querySelectorAll("[data-open-work-planning], [data-open-work-rules]").forEach((row) => {
        row.classList.remove("is-selected");
        row.setAttribute("aria-pressed", "false");
        row.removeAttribute("aria-current");
      });
    };
    // Loading and failure read like every other list: the shared loading line, then the reason and Retry in place.
    const settingsLoadingLine = () => {
      const line = document.createElement("p");
      line.className = "mw-loading";
      line.setAttribute("role", "status");
      line.textContent = L("正在加载设置");
      return line;
    };
    const settingsLoadFailed = (message, retry) => {
      const box = document.createElement("div");
      box.className = "mw-empty mw-empty--error";
      box.setAttribute("role", "alert");
      box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
      box.querySelector("strong").textContent = L("无法加载设置");
      box.querySelector("p").textContent = message && message !== L("无法加载设置") ? message : L("请稍后重试");
      const button = box.querySelector("button");
      button.textContent = L("重试");
      button.addEventListener("click", () => { button.disabled = true; void retry(); });
      return box;
    };
    const fillGoalOverlay = async (pane, path, bind) => {
      pane.replaceChildren(settingsLoadingLine());
      const response = await fetch(path, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(L("无法加载设置"));
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const content = parsed.querySelector(".work-planning, .planning-detail, .planning-edit, .project-rules-document, .settings-document") || parsed.querySelector(".settings-content") || parsed.body;
      const node = content.classList?.contains("settings-content") ? (content.firstElementChild || content) : content;
      pane.replaceChildren(document.importNode(node, true));
      bind?.(pane);
    };
    const openGoalWorkPlanning = async (pathname) => {
      const shell = document.querySelector("[data-goal-canvas-shell]");
      const pane = shell?.querySelector("[data-goal-work-planning]");
      if (!shell || !pane) return;
      if (!pathname && shell.dataset.goalPlanning === "open") {
        closeGoalOverlay();
        return;
      }
      closeGoalOverlay();
      shell.dataset.boardView = "list";
      shell.dataset.goalPlanning = "open";
      shell.querySelector("[data-open-work-planning]")?.setAttribute("aria-pressed", "true");
      const prefix = document.body.dataset.routePrefix || "";
      const path = pathname || (prefix + "/settings/planning?embed=1");
      const run = async () => {
        try {
          await fillGoalOverlay(pane, path, (root) => {
            globalThis.molisWorkBindPlanningSettings?.(root);
            globalThis.molisWorkBindPlanningAdoption?.(root);
          });
        } catch (error) {
          pane.replaceChildren(settingsLoadFailed(error?.message, run));
        }
      };
      await run();
    };
    const openGoalWorkRules = async () => {
      const shell = document.querySelector("[data-goal-canvas-shell]");
      const pane = shell?.querySelector("[data-goal-work-rules]");
      if (!shell || !pane) return;
      if (shell.dataset.goalRules === "open") {
        closeGoalOverlay();
        return;
      }
      closeGoalOverlay();
      shell.dataset.boardView = "list";
      shell.dataset.goalRules = "open";
      shell.querySelector("[data-open-work-rules]")?.setAttribute("aria-pressed", "true");
      const prefix = document.body.dataset.routePrefix || "";
      const run = async () => {
        try {
          await fillGoalOverlay(pane, prefix + "/settings/rules?embed=1", (root) => {
            globalThis.molisWorkBindProjectRules?.(root);
          });
        } catch (error) {
          pane.replaceChildren(settingsLoadFailed(error?.message, run));
        }
      };
      await run();
    };
    globalThis.molisWorkOpenGoalWorkPlanning = () => openGoalWorkPlanning();
    globalThis.molisWorkOpenGoalWorkRules = () => openGoalWorkRules();
    document.addEventListener("molis-work:goal-changed", closeGoalOverlay);

    document.addEventListener("click", async (event) => {
      const target = event.target?.nodeType === 1 ? event.target : null;
      if (!target) return;
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
        if (sourceConfigSave.disabled) return;
        const detail = sourceConfigSave.closest("[data-source-detail]") || feedSourcesDialog?.querySelector("[data-feed-task-config]:not([hidden])");
        if (!detail) return;
        const sourceId = sourceConfigSave.dataset.sourceId;
        const readField = (name) => detail?.querySelector('[data-source-config-field="' + name + '"]')?.value || "";
        if ([...detail.querySelectorAll('[data-source-config-field]')].some(input => !input.reportValidity())) return;
        sourceConfigSave.disabled = true;
        const modal = sourceConfigSave.matches("[data-feed-config-submit]") ? feedSourcesDialog : null;
        modal?.setAttribute("aria-busy", "true");
        modal?.querySelectorAll("[data-feed-sources-close], [data-feed-setup-back]").forEach(button => { button.disabled = true; });
        detail.inert = true;
        showSourceStatus(detail, L("正在保存来源配置…"));
        try {
          const saved = await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "PATCH", {
            name: readField("name") === detail.querySelector('[data-source-config-field="name"]')?.defaultValue ? undefined : readField("name"),
            description: readField("description"),
            scope: detail.querySelector('[data-source-config-field="scope"]') ? readField("scope") : undefined,
            feed_url: readField("feed_url") || undefined,
            connection_id: (() => {
              const field = detail.querySelector('[data-source-config-field="connection_id"]');
              return field && !field.disabled && field.value && field.value !== [...field.options].find(option => option.defaultSelected)?.value ? field.value : undefined;
            })(),
          });
          detail.querySelectorAll("[data-source-config-field]").forEach(field => {
            if (field.tagName === "SELECT") [...field.options].forEach(option => option.defaultSelected = option.selected);
            else field.defaultValue = field.value;
          });
          showSourceStatus(detail, L("来源资料已保存。"));
          if (await refreshFeedStage()) {
            if (saved.source?.source_id && saved.source.source_id !== sourceId) {
              modal?.removeAttribute("aria-busy");
              setFeedTask(saved.source.source_id);
              showFeedView("settings");
            }
            showToast(L("来源资料已保存。"));
          }
        } catch (error) {
          showSourceStatus(detail, error.message || L("来源配置保存失败，请检查后重试。"));
        } finally {
          modal?.removeAttribute("aria-busy");
          modal?.querySelectorAll("[data-feed-sources-close], [data-feed-setup-back]").forEach(button => { button.disabled = false; });
          detail.inert = false;
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
        showSourceStatus(sourceScheduleSave, L("正在保存拉取计划…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/schedule", "PUT", mode === "manual"
            ? { mode: "manual" }
            : { mode: "interval", enabled, interval_minutes: intervalMinutes });
          showSourceStatus(sourceScheduleSave, mode === "manual"
            ? L("已改为仅手动拉取。")
            : enabled ? L("定时拉取已保存；本地服务会在到期后执行。") : L("定时拉取已暂停。"));
          detail.querySelectorAll("[data-source-schedule-mode], [data-source-schedule-interval], [data-source-schedule-enabled]").forEach(field => {
            if (field.tagName === "SELECT") [...field.options].forEach(option => option.defaultSelected = option.selected);
            else if (field.type === "checkbox") field.defaultChecked = field.checked;
            else field.defaultValue = field.value;
          });
          sourceScheduleSave.disabled = false;
        } catch (error) {
          showSourceStatus(sourceScheduleSave, error.message || L("拉取计划保存失败，请检查后重试。"));
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
        showSourceStatus(sourceRuntimeAction, action === "sync" ? L("正在拉取；失败不会被写成成功…") : L("正在更新来源状态…"));
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
          showSourceStatus(sourceRuntimeAction, message);
          await refreshFeedStage();
          sourceRuntimeAction.disabled = false;
        } catch (error) {
          showSourceStatus(sourceRuntimeAction, error.message || L("来源操作失败，请按提示处理后重试。"));
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
        showSourceStatus(sourceDelete, L("正在删除来源…"));
        try {
          await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId), "DELETE", { history_decision: historyDecision });
          showSourceStatus(sourceDelete, historyDecision === "delete_local_history" ? L("来源与本地历史已删除。") : L("来源已删除，历史已保留。"));
          setFeedAddOpen(false);
          await refreshFeedStage();
        } catch (error) {
          showSourceStatus(sourceDelete, error.message || L("删除来源失败，请重试。"));
          sourceDelete.disabled = false;
        }
        return;
      }
      const feedView = target.closest("button[data-feed-view]");
      if (feedView) { showFeedView(feedView.dataset.feedView); return; }
      if (await handleFeedRuleAction(target)) return;
      const feedChoice = target.closest("[data-feed-choose-kind], [data-feed-connect-kind]");
      if (feedChoice) { showFeedSetup("setup", feedChoice.dataset.feedChooseKind || feedChoice.dataset.feedConnectKind); return; }
      const feedConfig = target.closest("[data-feed-task-config-open]");
      if (feedConfig) {
        event.stopPropagation();
        setFeedTask(feedConfig.dataset.feedTaskConfigOpen);
        showFeedView("settings");
        return;
      }
      if (target.closest("[data-feed-sources-open], [data-feed-setup-back]")) { showFeedSetup(); return; }
      if (target.closest("[data-feed-sources-close]")) {
        if (feedSourcesDialog?.getAttribute("aria-busy") === "true" || feedSourcesDialog?.querySelector('[data-feed-add-form][aria-busy="true"]')) return;
        const config = feedSourcesDialog?.querySelector("[data-feed-task-config]:not([hidden])");
        if (config && feedConfigView === "settings") config.querySelectorAll('[data-feed-config-section="settings"]').forEach(resetFeedFields);
        setFeedAddOpen(false); return;
      }
      const sourceRegister = target.closest("[data-feed-source-register]");
      if (sourceRegister) {
        if (sourceRegister.disabled) return;
        const form = sourceRegister.form || sourceRegister.closest("[data-feed-add-form]");
        const scope = form || feedSourcesDialog;
        const kind = sourceRegister.dataset.feedSourceRegister;
        const value = kind === "rss"
          ? scope?.querySelector("[data-feed-rss-definition]")?.value
          : scope?.querySelector('[data-feed-source-value="' + kind + '"]')?.value;
        const name = form?.querySelector("[data-feed-add-name]")?.value?.trim();
        const body = kind === "rss" ? { kind, definition_id: value }
          : kind === "research_library" ? { kind, repository: value, research_source: scope?.querySelector("[data-feed-research-source]")?.value }
          : kind === "web_query" ? { kind, query: value }
          : kind === "youtube_channel" ? { kind, channel_id: value }
          : { kind, feed_url: value };
        if (name) body.name = name;
        if (form && !form.reportValidity()) return;
        sourceRegister.disabled = true;
        form?.setAttribute("aria-busy", "true");
        if (form) form.inert = true;
        feedSourcesDialog?.querySelectorAll("[data-feed-sources-close], [data-feed-setup-back]").forEach(button => { button.disabled = true; });
        const inlineError = form?.querySelector("[data-feed-add-error]");
        if (inlineError) {
          inlineError.hidden = true;
          inlineError.textContent = "";
        }
        setFeedSourceFeedback(L("正在添加来源…"));
        try {
          let sourceId = form?.dataset.createdSourceId;
          if (!sourceId) {
            const result = await feedApi("/api/feed/sources", "POST", body);
            sourceId = result.source.source_id;
            if (form) form.dataset.createdSourceId = sourceId;
          }
          const minutes = Number(form?.querySelector("[data-feed-create-frequency]")?.value || 0);
          if (minutes) await feedApi("/api/feed/sources/" + encodeURIComponent(sourceId) + "/schedule", "PUT", { mode: "interval", enabled: true, interval_minutes: minutes });
          selectedFeedTask = sourceId;
          document.dispatchEvent(new CustomEvent("workbench-feed-task", { detail: { taskId: sourceId } }));
          saveUiState();
          resetFeedAddDraft();
          setFeedAddOpen(false);
          if (await refreshFeedStage()) setFeedTask(sourceId);
        } catch (error) {
          const retryCopy = form?.dataset.createdSourceId
              ? L("任务已创建，拉取计划未保存。请重试，不会重复创建任务。")
              : "";
          const message = retryCopy
            ? retryCopy + " " + error.message
            : error.message || L("添加来源失败");
          if (form?.dataset.createdSourceId) {
            form.querySelectorAll("input, [data-feed-rss-definition]").forEach(input => input.disabled = true);
            feedSourcesDialog.querySelector("[data-feed-setup-back]").hidden = true;
            // The source exists; only its schedule is left to save (capture rules are set up later, in the source).
            sourceRegister.textContent = L("重试保存计划");
          }
          if (inlineError) {
            inlineError.textContent = message;
            inlineError.hidden = false;
          }
          setFeedSourceFeedback(message, true);
          sourceRegister.disabled = false;
        } finally {
          form?.removeAttribute("aria-busy");
          if (form) form.inert = false;
          feedSourcesDialog?.querySelectorAll("[data-feed-sources-close], [data-feed-setup-back]").forEach(button => { button.disabled = false; });
        }
        return;
      }
      const evaluateRules = target.closest("[data-feed-out-rules-evaluate]");
      if (evaluateRules) {
        evaluateRules.disabled = true;
        setFeedSourceFeedback(L("正在按当前规则处理最近的消息…"));
        try {
          const snapshot = await feedApi("/api/feed", "GET");
          const items = (snapshot.feed_items || snapshot.feed?.feed_items || []).filter(item => item.source_id === evaluateRules.dataset.feedOutRulesEvaluate).slice(0, 20);
          if (!items.length) throw new Error(L("请先拉取来源内容"));
          await feedApi("/api/feed/out-rules/evaluate", "POST", { item_ids: items.map(item => item.item_id) });
          await refreshFeedStage(); await refreshInboxStage();
          setFeedSourceFeedback(L("规则处理完成；请在 Inbox 查看筛选结果与待复核项。"));
        } catch (error) { setFeedSourceFeedback(error.message, true); }
        finally { evaluateRules.disabled = false; }
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
          setFeedSourceFeedback("");
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
`;
