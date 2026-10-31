/** Sources panel of the navigation segment: source selection, filters, connections and the add-source dialog (a part of CLIENT_NAVIGATION_FEED_SCRIPT, joined in place).
 * A source's account is the person's binding on the platform (connectors.plugin_slot.read@2 / bind@2), made through the Host's record-slot path:
 * the page names the plugin, the slot and the record, never an installation (T-121). Changing a chosen account is disconnecting first; an account
 * source is made empty and then given its account there. */
export const NAVIGATION_FEED_SOURCES_PART = `
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
      const rows = [...sourceList.querySelectorAll("[data-source-entry-id]")];
      const visible = rows.filter((row) => {
        const kind = row.dataset.sourceKind;
        const status = row.dataset.sourceStatus;
        const matchesKind = activeSourceFilter === "all" ||
          (activeSourceFilter === "account" && (kind === "github" || kind === "gmail" || kind === "connector")) ||
          (activeSourceFilter === "public" && kind === "rss") ||
          (activeSourceFilter === "attention" && status === "attention");
        row.hidden = !matchesKind;
        return !row.hidden;
      });
      if (sourceResultCount) sourceResultCount.textContent = FL("{count} 个来源", { count: visible.length });
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

    const showSourceStatus = (control, message) => {
      const status = control.closest("[data-source-detail-panel]")?.querySelector("[data-source-action-status]") ||
        control.closest("[data-source-detail]")?.querySelector("[data-source-action-status]");
      if (!status) return;
      if(typeof message==="string")status.textContent=message;else molisWorkRequest.show(status,message);
      status.hidden = false;
    };

    const feedEntryVisible = (row) => {
      const wrap = row?.closest?.("[data-feed-item-wrap]");
      return Boolean(row) && !row.hidden && !wrap?.hidden;
    };

    const resetFeedFields = (root) => {
      root?.querySelectorAll("input, textarea, select").forEach(field => {
        if (field.tagName === "SELECT") {
          if (field.multiple) [...field.options].forEach(option => option.selected = option.defaultSelected);
          else field.selectedIndex = Math.max(0, [...field.options].findLastIndex(option => option.defaultSelected));
        }
        else if (field.type === "checkbox") field.checked = field.defaultChecked;
        else field.value = field.defaultValue;
      });
      root?.querySelectorAll("[data-source-action-status]").forEach(status => status.hidden = true);
    };
    const resetFeedAddDraft = () => {
      const draft = feedSourcesDialog.querySelector("[data-feed-add-form]");
      draft.reset();
      delete draft.dataset.createdSourceId;
      delete draft.dataset.createdOutRuleId;
      draft.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = false; });
      draft.querySelectorAll("details").forEach(section => { section.open = false; });
      draft.querySelector("[data-feed-add-error]").hidden = true;
      const create = feedSourcesDialog.querySelector("[data-feed-source-register]");
      create.disabled = false;
      create.textContent = FL("创建任务");
      feedSourcesDialog.querySelector("[data-feed-setup-back]").hidden = false;
    };
    const feedRecordSlotPath = (query) => "/api/settings/connectors/plugin-slots/record?" + new URLSearchParams({ project: document.body.dataset.projectId || "", ...query });
    const loadFeedConnections = async (detail) => {
      const region = detail?.querySelector("[data-plugin-record-slot]");
      if (!region || region.dataset.loading === "true") return;
      const select = region.querySelector("[data-plugin-record-slot-account]");
      const status = region.querySelector('[data-feed-connection-status]');
      const slot = JSON.parse(region.dataset.pluginRecordSlot);
      region.dataset.loading = "true"; select.disabled = true;
      try {
        const fallback = FL("无法读取账号连接，请重试。"), { service_id: _service, ...query } = slot;
        const [result, bound] = await Promise.all([
          molisWorkRequest("/api/settings/connectors/connections?service_id=" + encodeURIComponent(slot.service_id), {fallback}),
          molisWorkRequest(feedRecordSlotPath(query), {fallback})]);
        if(!region.isConnected)return;
        const chosen = bound.connection?.connection_id || "";
        const accounts = result.connections.filter(connection => !connection.project_id);
        const options = accounts.map(connection => {
          const option = document.createElement("option");
          option.value = connection.connection_id;
          const state = connection.state === "connected" ? FL("可用") : connection.state === "reauth_required" ? FL("需要重新授权") : FL("已断开");
          option.textContent = (connection.account_label || connection.display_name) + " · " + connection.auth_method + " · " + state;
          option.defaultSelected = connection.connection_id === chosen;
          option.disabled = connection.state !== "connected" && connection.connection_id !== chosen;
          return option;
        });
        if (!options.some(option => option.value === chosen)) {
          const placeholder = document.createElement("option"); placeholder.value = chosen; placeholder.defaultSelected = true;
          placeholder.textContent = chosen ? FL("原连接已不可用，请重新选择或前往 Connectors") : FL("请选择账号连接");
          placeholder.disabled = true; options.unshift(placeholder);
        }
        select.replaceChildren(...options); select.value = chosen;
        select.disabled = Boolean(chosen) || !accounts.length;
        status.textContent = FL(chosen ? "这个来源已经选好账号。要换账号，先断开来源。" : accounts.length ? "为这个来源选一个账号，选好就保存。" : "还没有账号连接，请先在 Connectors 添加。");
      } catch (error) { molisWorkRequest.show(status,error,FL("无法读取账号连接，请重试。")); }
      finally { delete region.dataset.loading; }
    };
    document.addEventListener("change", async event => {
      const select = event.target.closest?.("[data-plugin-record-slot-account]");
      if (!select?.value) return;
      const region = select.closest("[data-plugin-record-slot]"), status = region.querySelector("[data-feed-connection-status]");
      const slot = JSON.parse(region.dataset.pluginRecordSlot);
      select.disabled = true;
      try {
        await molisWorkRequest(feedRecordSlotPath({}), {method:"POST", body:{ ...slot, connection_id: select.value }, fallback:FL("无法保存账号，请重试。")});
        status.textContent = FL("账号已保存。");
        if (await refreshFeedStage()) { setFeedTask(slot.record_key); showFeedView("settings"); }
      } catch (error) { select.disabled = false; molisWorkRequest.show(status,error,FL("无法保存账号，请重试。")); }
    });
    document.addEventListener("submit", async event => {
      const form = event.target.closest?.("[data-feed-add-account]");
      if (!form) return;
      event.preventDefault();
      if (form.getAttribute("aria-busy") === "true") return;
      form.setAttribute("aria-busy", "true");
      try {
        const result = await api(feedApi + "/sources/accounts", "POST", { service: form.dataset.feedAddAccount, name: form.querySelector("[data-feed-account-name]").value }, "无法创建来源，请重试。");
        setFeedAddOpen(false);
        if (await refreshFeedStage()) { setFeedTask(result.source.source_id); showFeedView("settings"); }
      } catch (error) { setFeedSourceFeedback(molisWorkRequest.text(error,FL("无法创建来源，请重试。")), true); }
      finally { form.removeAttribute("aria-busy"); }
    });

    const showFeedSetup = (stage = "choose", value = "") => {
      if (feedSourcesDialog?.getAttribute("aria-busy") === "true") return;
      if (!feedSourcesDialog) return;
      if (stage === "config" && !feedSourcesDialog.querySelector('[data-feed-task-config="' + CSS.escape(value) + '"]')) {
        showToast(FL("这个任务已不可用，请刷新后查看。"), true); return;
      }
      const draft = feedSourcesDialog.querySelector("[data-feed-add-form]");
      if (stage === "choose" && draft?.dataset.createdSourceId) { stage = "setup"; value = feedSourcesDialog.querySelector("[data-feed-source-register]").dataset.feedSourceRegister; }
      const setup = stage === "setup";
      const configSave = feedSourcesDialog.querySelector("[data-feed-config-submit]");
      configSave.hidden = stage !== "config" || feedConfigView === "rules";
      configSave.dataset.sourceId = value;
      configSave.disabled = false;

      const headings = { research_library: "共享研究库", custom_rss: "RSS / Atom", rss: "目录订阅", web_query: "网页搜索", youtube_channel: "YouTube", github: "GitHub", gmail: "Gmail" };
      const title = stage === "config" ? (feedConfigView === "rules" ? "捕捉规则" : "来源设置") : setup ? headings[value] : "添加来源";
      feedSourcesDialog.querySelector("h2").textContent = FL(title);
      feedSourcesDialog.querySelector('footer [data-feed-sources-close]').textContent = FL(stage === "config" && feedConfigView === "rules" ? "返回消息" : "取消");
      const description = feedSourcesDialog.querySelector("[data-feed-setup-description]");
      description.textContent = FL(stage === "choose" ? "选择你想关注的内容来源。" : setup ? "添加后可设置拉取计划与捕捉规则。" : feedConfigView === "rules" ? "在这里写规则、预览，再决定哪些消息进入 Inbox。" : "管理来源内容、拉取频率和连接状态。");
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
      hydrateFeedRuleDrafts();
      if (stage === "config" && feedConfigView === "settings") void loadFeedConnections(feedSourcesDialog.querySelector('[data-feed-task-config]:not([hidden])'));
      feedSourcesDialog.hidden = false;
      feedWorkbench.dataset.feedView = stage === "config" ? feedConfigView : "add";
      feedWorkbench.dataset.railOpen = "false";
      feedSourcesDialog.querySelectorAll("[data-feed-config-section]").forEach(section => section.hidden = section.dataset.feedConfigSection !== feedConfigView);
      document.querySelectorAll("button[data-feed-view]").forEach(button => { if (button.dataset.feedView === feedWorkbench.dataset.feedView) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
      (feedSourcesDialog.querySelector('[data-feed-source-setup]:not([hidden]) [data-feed-setup-kind]:not([hidden]) input') || feedSourcesDialog.querySelector('section:not([hidden]) button'))?.focus();
    };
    let feedConfigView = "settings";
    const setFeedAddOpen = (open) => {
      if (open) showFeedSetup();
      else {
        if (feedSourcesDialog) feedSourcesDialog.hidden = true;
        if (feedWorkbench) feedWorkbench.dataset.feedView = "messages";
        document.querySelectorAll("button[data-feed-view]").forEach(button => { if (button.dataset.feedView === "messages") button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
      }
    };
    const showFeedView = (view) => {
      if (view === "messages") { setFeedAddOpen(false); return; }
      feedConfigView = view;
      showFeedSetup("config", selectedFeedTask);
    };
    const setFeedTask = (taskId, persist = true) => {
      const available = document.querySelector('[data-feed-source-rail] [data-feed-task="' + CSS.escape(taskId || "") + '"]');
      const next = available ? taskId : "all";
      const changed = selectedFeedTask !== next;
      selectedFeedTask = next;
      document.querySelectorAll("[data-feed-source-rail] [data-feed-task]").forEach(button => {
        const selected = button.dataset.feedTask === next;
        button.classList.toggle("is-selected", selected);
        if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      });
      const title = document.querySelector("[data-feed-task-title]");
      const summary = document.querySelector("[data-feed-task-summary]");
      if (title) title.textContent = available?.querySelector("strong")?.textContent || FL("全部消息");
      if (summary) summary.textContent = available?.dataset.feedSourceSummary || FL("所有来源的最新内容");
      const isSource = next !== "all" && next !== "other";
      document.querySelectorAll('button[data-feed-view]:not([data-feed-view="messages"])').forEach(button => button.hidden = !isSource);
      const sync = document.querySelector("[data-feed-current-sync]");
      if (sync) { sync.hidden = !isSource; sync.dataset.feedSourceSync = next; sync.disabled = available?.dataset.feedSourceCanSync !== "true" || available?.dataset.feedSourceState === "syncing"; }
      if (feedWorkbench) { feedWorkbench.dataset.selectedSource = next; feedWorkbench.dataset.railOpen = "false"; feedWorkbench.querySelector("[data-feed-rail-toggle]")?.setAttribute("aria-expanded", "false"); feedWorkbench.querySelector("[data-feed-source-menu]")?.removeAttribute("open"); }
      document.querySelectorAll(".feed-source-tabs").forEach((tabs) => { tabs.hidden = !isSource; });
      if (changed) { collapseFeedStage(); setFeedAddOpen(false); }
      filterFeedItems(true, false);
      rememberFeedPresetState();
      if (persist) { document.dispatchEvent(new CustomEvent("workbench-feed-task", { detail: { taskId: next } })); queueSave(); }
      return true;
    };

    document.addEventListener('workbench-open-group', event => {
      if (event.detail?.surface === 'feed' && typeof event.detail.id === 'string') setFeedTask(event.detail.id);
    });

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
      setFeedDetailPlaceholder(FL("正在打开 Item 工作区…"), "");
      feedWorkbench.setAttribute("aria-busy", "true");
      feedWorkbenchRequest = (async () => {
        try {
          const html = await molisWorkRequest(route("/api/stage/feed"), {as:"text",fallback:FL("无法打开 Item 工作区" )});
          const template = document.createElement("template");
          template.innerHTML = html.trim();
          if (requestedPreset !== activeFeedPreset) return false;
          for (const detail of [...template.content.querySelectorAll("[data-feed-detail]")]) {
            feedWorkbench.insertBefore(detail, feedDetailEmpty);
          }
          feedWorkbench.dataset.loaded = "true";
          feedWorkbench.dataset.loadedPreset = requestedPreset;
          filterFeedItems(true);
          return true;
        } catch (error) {
          setFeedDetailPlaceholder(molisWorkRequest.text(error,FL("无法打开 Item 工作区")),FL("目录仍然可用，点击重试即可。"),true);
          const title=feedDetailEmpty?.querySelector("[data-feed-detail-empty-title]");if(title)molisWorkRequest.show(title,error);
          return false;
        } finally {
          feedWorkbench.removeAttribute("aria-busy");
          feedWorkbenchRequest = null;
        }
      })();
      return feedWorkbenchRequest;
    };
`;
