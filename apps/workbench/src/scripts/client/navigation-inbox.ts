/** AP3 Workbench client segment: navigation-inbox. */
export const CLIENT_NAVIGATION_INBOX_SCRIPT = `
    const inboxDirectory = document.querySelector("[data-inbox-directory]");
    const inboxList = document.querySelector("[data-inbox-list]");
    const inboxWorkbench = document.querySelector("[data-inbox-workbench]");

    // Internal source links stay in the workbench; editor links otherwise open a browser window.
    document.addEventListener("click", event => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      const url = new URL(anchor.getAttribute("href"), location.href);
      const entryId = url.searchParams.get("inbox_entry");
      if (!entryId || url.origin !== location.origin || url.pathname !== route("/")) return;
      event.preventDefault(); event.stopPropagation();
      const row = inboxList?.querySelector('[data-inbox-entry-id="' + CSS.escape(entryId) + '"]');
      if (row) tabWorkspace?.openItem("inbox", entryId, row.querySelector("strong")?.textContent);
      else showToast(L("原 Inbox 材料在当前项目中不可用"));
    }, true);

    const expandInboxStage = (expanded) => {
      const shell = document.querySelector("[data-inbox-stage-shell]");
      const workspace = document.querySelector("[data-inbox-stage-workspace]");
      if (!shell) return;
      shell.dataset.expanded = expanded ? "true" : "false";
      if (workspace) workspace.hidden = !expanded;
    };

    const collapseInboxStage = () => {
      expandInboxStage(false);
      inboxList?.querySelectorAll("[data-inbox-row]").forEach((row) => {
        row.classList.remove("is-selected");
        row.setAttribute("aria-selected", "false");
      });
      inboxWorkbench?.querySelectorAll("[data-inbox-detail]").forEach((detail) => { detail.hidden = true; });
      const empty = inboxWorkbench?.querySelector("[data-inbox-detail-empty]");
      if (empty) empty.hidden = true;
      syncInboxRowTab();
    };

    const inboxRowVisible = (row) => !row.hidden && !row.closest("[data-inbox-item-wrap]")?.hidden;

    const syncInboxRowTab = () => {
      inboxList?.querySelectorAll("[data-inbox-row]").forEach((row) => {
        const group = row.closest("details");
        const visible = inboxRowVisible(row) && (!group || group.open);
        row.tabIndex = visible ? 0 : -1;
      });
    };
    syncInboxRowTab();

    const selectInboxEntry = (entryId, persist = true) => {
      if (!entryId) {
        collapseInboxStage();
        if (persist) queueSave();
        return;
      }
      const rows = [...(inboxList?.querySelectorAll("[data-inbox-row]") || [])];
      rows.forEach((row) => {
        const selected = row.dataset.inboxEntryId === entryId && inboxRowVisible(row);
        row.classList.toggle("is-selected", selected);
        row.setAttribute("aria-selected", String(selected));
      });
      inboxWorkbench?.querySelectorAll("[data-inbox-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.inboxDetail !== entryId;
      });
      const empty = inboxWorkbench?.querySelector("[data-inbox-detail-empty]");
      if (empty) empty.hidden = true;
      expandInboxStage(true);
      syncInboxRowTab();
      void loadInboxEntryResults(entryId);
      if (persist) queueSave();
    };

    const setInboxFilter = (filter, persist = true) => {
      if (!inboxDirectory) return;
      const next = filter === "history" ? "history" : "active";
      inboxDirectory.dataset.inboxCurrentFilter = next;
      const fold = inboxList?.querySelector('[data-inbox-stage-group="' + next + '"]');
      if (fold) fold.open = true;
      if (persist) queueSave();
    };

    let inboxStageRefreshSeq = 0;
    const refreshInboxStage = async () => {
      const seq = ++inboxStageRefreshSeq;
      const list = document.querySelector("[data-inbox-list]") || inboxList;
      const workspace = document.querySelector("[data-inbox-stage-workspace]");
      const empty = workspace?.querySelector("[data-inbox-detail-empty]");
      try {
        const scrollTop = list?.scrollTop || 0;
        const selectedId = list?.querySelector("[data-inbox-row].is-selected")?.dataset.inboxEntryId || "";
        const filter = inboxDirectory?.dataset.inboxCurrentFilter || "active";
        const response = await fetch(route("/api/inbox/workbench"), { cache: "no-store" });
        if (!response.ok) throw new Error(L("无法更新 Inbox 列表"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        if (seq !== inboxStageRefreshSeq) return false;
        const nextList = template.content.querySelector("[data-inbox-list]");
        const nextWorkspace = template.content.querySelector("[data-inbox-stage-workspace]");
        const nextEmpty = nextWorkspace?.querySelector("[data-inbox-detail-empty]");
        if (!list || !workspace || !empty || !nextList || !nextWorkspace || !nextEmpty) {
          throw new Error(L("无法更新 Inbox 列表"));
        }
        list.replaceChildren(...nextList.childNodes);
        workspace.querySelectorAll("[data-inbox-detail]").forEach((detail) => detail.remove());
        [...nextWorkspace.querySelectorAll("[data-inbox-detail]")].forEach((detail) => {
          workspace.insertBefore(detail, empty);
        });
        empty.innerHTML = nextEmpty.innerHTML;
        empty.hidden = nextEmpty.hidden;
        setInboxFilter(filter, false);
        if (selectedId && list.querySelector('[data-inbox-entry-id="' + CSS.escape(selectedId) + '"]')) {
          selectInboxEntry(selectedId, false);
        } else {
          collapseInboxStage();
        }
        list.scrollTop = scrollTop;
        return true;
      } catch {
        if (seq === inboxStageRefreshSeq) location.reload();
        return false;
      }
    };

    const composeDialog = inboxWorkbench?.querySelector("[data-inbox-compose]");
    const composeForm = composeDialog?.querySelector("form");
    const composeStorageKey = "molis-inbox-compose:" + route("/");
    let composeDraft = { entry_ids: [], title: "", instructions: "", request_id: "" };
    try { composeDraft = { ...composeDraft, ...JSON.parse(sessionStorage.getItem(composeStorageKey) || "{}") }; } catch {}
    let composeBusy = false;
    const rememberCompose = () => {
      if (!composeForm) return;
      const next = { entry_ids: [...composeForm.querySelectorAll('input[name="entry_id"]:checked')].map(input => input.value).sort(),
        title: composeForm.elements.title.value, instructions: composeForm.elements.instructions.value };
      if (JSON.stringify(next) !== JSON.stringify({ entry_ids: composeDraft.entry_ids, title: composeDraft.title, instructions: composeDraft.instructions })) {
        composeDraft = { ...next, request_id: "" };
      }
      try { sessionStorage.setItem(composeStorageKey, JSON.stringify(composeDraft)); } catch {}
    };
    const openComposedPage = (id, title) => { composeDialog?.close(); tabWorkspace?.openItem("pages", id, title); };
    const loadInboxEntryResults = async entryId => {
      const section = inboxWorkbench?.querySelector('[data-inbox-entry-results="' + CSS.escape(entryId) + '"]');
      if (!section) return;
      try {
        const payload = await feedApi("/api/inbox/pages", "GET");
        if (!section.isConnected) return;
        section.replaceChildren();
        const results = (payload.results || []).filter(result => result.entry_ids.includes(entryId));
        if (!results.length) return;
        const heading = document.createElement("h3"); heading.textContent = L("处理结果"); section.append(heading);
        for (const result of results) {
          const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary";
          button.textContent = result.title + " · " + L(result.document_id ? "在 Pages 打开" : "恢复处理");
          button.onclick = () => {
            if (result.document_id) openComposedPage(result.document_id, result.title);
            else if (!composeBusy) { composeDraft = { entry_ids: result.entry_ids, title: result.title, instructions: result.instructions, request_id: result.request_id }; showInboxComposer(); }
          };
          section.append(button);
        }
      } catch (error) { section.textContent = L("处理结果暂时无法读取，请重新打开事项。") + " " + error.message; }
    };
    const refreshComposeResults = async () => {
      const results = composeDialog?.querySelector("[data-inbox-compose-results]");
      if (!results) return;
      const payload = await feedApi("/api/inbox/pages", "GET");
      results.replaceChildren();
      for (const result of (payload.results || []).slice(0, 12)) {
        const row = document.createElement("div"); row.className = "inbox-compose-result";
        row.dataset.inboxComposeRequest = result.request_id;
        const text = document.createElement("span");
        text.textContent = result.title + " · " + L(result.status === "completed" ? "已生成" : result.status === "failed" ? "生成失败，可重试" : "正在处理") + (result.error ? " · " + result.error : "");
        row.append(text);
        const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary";
        if (result.document_id) {
          button.textContent = L("在 Pages 打开"); button.onclick = () => openComposedPage(result.document_id, result.title);
        } else {
          button.textContent = L("恢复处理"); button.disabled = composeBusy;
          button.onclick = () => {
            composeDraft = { entry_ids: result.entry_ids.slice().sort(), title: result.title, instructions: result.instructions, request_id: result.request_id };
            showInboxComposer();
          };
        }
        row.append(button);
        for (const entryId of result.entry_ids || []) {
          const source = inboxList?.querySelector('[data-inbox-entry-id="' + CSS.escape(entryId) + '"]');
          if (!source) continue;
          const back = document.createElement("button"); back.type = "button"; back.className = "mw-btn mw-btn--ghost";
          back.textContent = L("返回材料") + "：" + (source.querySelector("strong")?.textContent || "");
          back.onclick = () => { composeDialog.close(); tabWorkspace?.openItem("inbox", entryId); };
          row.append(back);
        }
        results.append(row);
      }
    };
    const showInboxComposer = (entryId) => {
      if (!composeForm || !composeDialog) return;
      if (entryId && !composeBusy && !composeDraft.entry_ids.includes(entryId)) {
        composeDraft.entry_ids.push(entryId); composeDraft.entry_ids.sort(); composeDraft.request_id = "";
      }
      const materials = composeForm.querySelector("[data-inbox-compose-materials]");
      materials.querySelectorAll("label, p").forEach(el => el.remove());
      const rows = [...(inboxList?.querySelectorAll('[data-inbox-row][data-inbox-subject-type="feed_item"]') || [])];
      rows.forEach(row => {
        const label = document.createElement("label"); const input = document.createElement("input");
        input.type = "checkbox"; input.name = "entry_id"; input.value = row.dataset.inboxEntryId;
        input.checked = composeDraft.entry_ids.includes(input.value); input.disabled = composeBusy;
        const title = document.createElement("span"); title.textContent = row.querySelector("strong")?.textContent || input.value;
        label.append(input, title); materials.append(label);
      });
      if (!rows.length) { const empty = document.createElement("p"); empty.textContent = L("先从 Feed 将需要整理的消息放入 Inbox。"); materials.append(empty); }
      composeForm.elements.title.value = composeDraft.title;
      composeForm.elements.instructions.value = composeDraft.instructions;
      if (!composeBusy) composeForm.querySelector("[data-inbox-compose-status]").textContent = "";
      rememberCompose();
      if (!composeDialog.open) composeDialog.showModal();
      void refreshComposeResults().catch(error => { composeForm.querySelector("[data-inbox-compose-status]").textContent = error.message; });
    };
    document.addEventListener("click", async event => {
      if (event.target.closest?.("[data-inbox-functions]")) { tabWorkspace?.openPlugin("functions"); return; }
      const evaluate = event.target.closest?.("[data-inbox-evaluate]");
      if (evaluate) {
        event.preventDefault(); evaluate.disabled = true;
        const status = evaluate.closest("[data-inbox-detail]")?.querySelector("[data-inbox-action-status]") || inboxList?.querySelector("[data-inbox-evaluate-status]");
        if (status) { status.hidden = false; status.textContent = L("正在判断下一步，原事项保持不变…"); }
        try {
          const ids = evaluate.dataset.inboxEvaluate ? [evaluate.dataset.inboxEvaluate]
            : [...inboxList.querySelectorAll('[data-inbox-row][data-inbox-status="open"], [data-inbox-row][data-inbox-status="in_progress"]')].slice(0, 20).map(row => row.dataset.inboxEntryId);
          const result = await feedApi("/api/inbox/judgment/evaluate", "POST", { entry_ids: ids });
          await refreshInboxStage();
          const nextStatus = inboxList?.querySelector("[data-inbox-evaluate-status]");
          if (nextStatus) { nextStatus.closest("details").open = true; nextStatus.textContent = (result.judgments || []).some(j => j.outcome === "needs_review")
            ? L("部分判断需要人工复核，可查看事项后重试。") : L("建议已更新，请查看事项并选择下一步。"); }
        } catch (error) { if (status) status.textContent = error.message; }
        finally { evaluate.disabled = false; }
        return;
      }
      const open = event.target.closest?.("[data-inbox-compose-open]");
      if (open) {
        event.preventDefault();
        if (composeBusy) { showInboxComposer(); return; }
        const mode = open.dataset.inboxComposeMode;
        if (mode && open.dataset.inboxComposeOpen) {
          composeDraft = { entry_ids: [open.dataset.inboxComposeOpen], request_id: "",
            title: mode === "verify" ? L("待核查清单") : L("材料整理"),
            instructions: mode === "verify"
              ? L("按材料列出待核查问题、已有依据、缺失证据与可执行的核查步骤。每项标明来源，不宣称已完成核查。只输出核查清单，保持原事项待处理。")
              : L("围绕所选材料整理一份简洁的综合工作稿，区分事实、作者自述、推断和待核查。每个主要结论标明材料编号，不把多条材料的差异抹平成共识。正文不重复标题。") };
        }
        showInboxComposer(open.dataset.inboxComposeOpen);
      }
      if (event.target.closest?.("[data-inbox-compose-close]")) { rememberCompose(); composeDialog?.close(); }
    });
    composeForm?.addEventListener("input", rememberCompose);
    composeDialog?.addEventListener("cancel", rememberCompose);
    composeForm?.addEventListener("submit", async event => {
      event.preventDefault(); if (composeBusy) return; rememberCompose();
      const status = composeForm.querySelector("[data-inbox-compose-status]");
      if (!composeDraft.entry_ids.length) { status.textContent = L("请至少选择一条材料"); return; }
      composeDraft.request_id ||= "pages-" + crypto.randomUUID();
      try { sessionStorage.setItem(composeStorageKey, JSON.stringify(composeDraft)); } catch {}
      composeBusy = true;
      composeForm.querySelectorAll("input, textarea, button[type=submit]").forEach(el => { el.disabled = true; });
      composeDialog.querySelectorAll("[data-inbox-compose-results] button").forEach(el => { el.disabled = true; });
      const runningResult = composeDialog.querySelector('[data-inbox-compose-request="' + CSS.escape(composeDraft.request_id) + '"] span');
      if (runningResult) runningResult.textContent = composeDraft.title + " · " + L("正在处理");
      status.textContent = L("正在整理材料，完成后可在 Pages 中继续编辑…");
      try {
        const result = await feedApi("/api/inbox/pages", "POST", composeDraft);
        status.textContent = L("文稿已保存到 Pages；原事项仍待你确认处理结果。");
        await refreshComposeResults();
        if (composeDialog.open) openComposedPage(result.document.id, result.document.title);
      } catch (error) { status.textContent = error.message; }
      finally {
        composeBusy = false;
        composeForm.querySelectorAll("input, textarea, button[type=submit]").forEach(el => { el.disabled = false; });
        void refreshComposeResults().catch(() => {});
      }
    });
`;
