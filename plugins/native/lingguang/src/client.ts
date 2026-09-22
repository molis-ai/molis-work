/** Lingguang workbench client: capture, list, edit, discard, local brainstorm. */
export const LINGGUANG_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-lingguang=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-lingguang=directory]");
  const rowsEl = workbench.querySelector("[data-lingguang-rows]");
  const empty = workbench.querySelector("[data-lingguang-empty]");
  const workspace = workbench.querySelector("[data-lingguang-stage-workspace]");
  const titleEl = workbench.querySelector("[data-lingguang-editor-title]");
  const titleInput = workbench.querySelector("[data-lingguang-title]");
  const bodyInput = workbench.querySelector("[data-lingguang-body]");
  const editorPane = workbench.querySelector("[data-lingguang-pane=editor]");
  const chatPane = workbench.querySelector("[data-lingguang-pane=chat]");
  const selectionBar = workbench.querySelector("[data-lingguang-selection]");
  const selectedCountEl = workbench.querySelector("[data-lingguang-selected-count]");
  const note = workbench.querySelector("[data-lingguang-note]");
  const confirmDialog = workbench.querySelector("[data-lingguang-confirm]");
  const dispatchDialog = workbench.querySelector("[data-lingguang-dispatch]");
  const contextEl = workbench.querySelector("[data-lingguang-context]");
  const messagesEl = workbench.querySelector("[data-lingguang-messages]");
  const chatForm = workbench.querySelector("[data-lingguang-chat]");
  const chatInput = workbench.querySelector("[data-lingguang-chat-input]");
  let records = [];
  let selectedIds = new Set();
  let selected = null;
  let conversation = null;
  let saveTimer = 0;
  let listSeq = 0;
  const keepListScroll = (paint) => {
    const top = list?.scrollTop || 0;
    paint();
    if (list) list.scrollTop = top;
  };
  const kindChip = (kind, label) => {
    const node = document.createElement("span");
    node.className = "mw-status plugin-stage-kind";
    node.dataset.kind = kind;
    node.textContent = label;
    return node;
  };
  const textCell = (className, text) => {
    const node = document.createElement("span");
    node.className = className;
    node.title = text;
    node.textContent = text;
    return node;
  };

  const projectId = () => (typeof host.projectId === "function" ? host.projectId() : host.projectId) || "";
  const headers = () => typeof molisWorkControlHeaders === "function"
    ? molisWorkControlHeaders()
    : { "content-type": "application/json" };
  const withProject = (path) => {
    const id = projectId();
    if (!id) throw new Error(L("缺少项目"));
    return path + (path.includes("?") ? "&" : "?") + "project_id=" + encodeURIComponent(id);
  };
  const request = async (method, path, body) => {
    const payloadBody = body === undefined ? undefined : { ...body, project_id: projectId() };
    const response = await fetch(withProject(path), {
      method,
      headers: headers(),
      body: payloadBody === undefined || method === "GET" ? undefined : JSON.stringify(payloadBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || L("灵光请求失败"));
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
    note.hidden = !text;
    note.textContent = text || "";
    note.classList.toggle("is-error", Boolean(isError && text));
  };
  const ask = (message, okLabel) => new Promise((resolve) => {
    if (!confirmDialog) { resolve(false); return; }
    confirmDialog.querySelector("[data-confirm-text]").textContent = message;
    confirmDialog.querySelector("[data-confirm-ok]").textContent = okLabel;
    confirmDialog.returnValue = "cancel";
    const onClose = () => {
      confirmDialog.removeEventListener("close", onClose);
      resolve(confirmDialog.returnValue === "ok");
    };
    confirmDialog.addEventListener("close", onClose);
    confirmDialog.showModal();
  });
  const previewOf = (record) => {
    const line = (record.body || "").trim().split(/\\r?\\n/)[0] || "";
    return line && line !== record.title ? line : L("还没有正文");
  };
  const whenOf = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return (date.getMonth() + 1) + "/" + date.getDate();
  };
  const selectedRecords = () => records.filter((item) => selectedIds.has(item.id));
  const syncSelectionBar = () => {
    const count = selectedIds.size;
    selectionBar.hidden = count < 2;
    selectedCountEl.textContent = count >= 2 ? L("已选") + " " + count : "";
  };
  const showChat = (on) => {
    editorPane.hidden = on;
    chatPane.hidden = !on;
  };
  const patchPreview = (record) => {
    const row = rowsEl.querySelector('[data-lingguang-id="' + record.id + '"]');
    if (!row) return;
    const title = row.querySelector("[data-lingguang-preview]");
    if (title) title.textContent = record.title;
    const preview = row.querySelector("[data-lingguang-snippet]");
    if (preview) preview.textContent = previewOf(record);
  };
  const fillEditor = (record) => {
    selected = record;
    conversation = null;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    showChat(false);
    titleEl.textContent = record.title;
    titleInput.value = record.title;
    bodyInput.value = record.body || "";
    markSelected(record.id);
  };
  const closeWorkspace = () => {
    clearTimeout(saveTimer);
    selected = null;
    conversation = null;
    selectedIds = new Set();
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    showChat(false);
    markSelected("");
    syncSelectionBar();
  };
  const markSelected = (id) => {
    rowsEl.querySelectorAll("[data-lingguang-id]").forEach((row) => {
      const on = selectedIds.has(row.dataset.lingguangId) || row.dataset.lingguangId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const renderRow = (record) => {
    const item = document.createElement("article");
    item.className = "feed-stage-item";
    const row = document.createElement("button");
    row.type = "button";
    const on = selectedIds.has(record.id) || selected?.id === record.id;
    row.className = "feed-stage-entry directory-list-row" + (on ? " is-selected" : "");
    row.dataset.lingguangId = record.id;
    row.setAttribute("aria-selected", String(on));
    const leading = document.createElement("span");
    leading.className = "feed-stage-leading";
    const title = document.createElement("strong");
    title.dataset.lingguangPreview = "true";
    title.title = record.title;
    title.textContent = record.title;
    leading.append(title);
    const snippet = textCell("plugin-stage-fact", previewOf(record));
    snippet.dataset.lingguangSnippet = "true";
    row.append(
      leading,
      kindChip("lingguang", L("灵光")),
      snippet,
      textCell("plugin-stage-meta", whenOf(record.created_at)),
    );
    item.append(row);
    return item;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const paintList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => rowsEl.append(renderRow(record)));
    syncSelectionBar();
  };
  const remember = (record) => {
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    if (selected?.id === record.id) {
      selected = record;
      titleEl.textContent = record.title;
    }
    renderList();
    patchPreview(record);
  };
  const save = async () => {
    if (!selected) return null;
    const payload = await request("POST", "/api/plugins/lingguang/" + encodeURIComponent(selected.id), {
      title: titleInput.value,
      body: bodyInput.value,
    });
    remember(payload.spark);
    if (document.activeElement !== titleInput) titleInput.value = payload.spark.title;
    if (document.activeElement !== bodyInput) bodyInput.value = payload.spark.body || "";
    return payload.spark;
  };
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };
  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/lingguang");
    if (seq !== listSeq) return;
    records = payload.sparks || [];
    selectedIds = new Set([...selectedIds].filter((id) => records.some((item) => item.id === id)));
    if (selected && !records.some((item) => item.id === selected.id)) closeWorkspace();
    renderList();
    if (selected) {
      const next = records.find((item) => item.id === selected.id);
      if (next) {
        selected = next;
        markSelected(next.id);
      }
    }
  };
  const discardIds = async (ids) => {
    if (!ids.length) return;
    const many = ids.length > 1;
    if (!await ask(many ? L("丢掉这几条？它们会离开灵光池。") : L("丢掉这条？它会离开灵光池。"), L("丢掉"))) return;
    await request("POST", "/api/plugins/lingguang/discard", { ids });
    await loadList();
  };
  const renderMessages = (messages) => {
    messagesEl.replaceChildren();
    (messages || []).forEach((message) => {
      const card = document.createElement("article");
      card.className = "lingguang-message";
      const head = document.createElement("strong");
      head.textContent = message.role === "stub" ? L("灵光") : L("记下");
      const body = document.createElement("p");
      body.textContent = message.body;
      card.append(head, body);
      messagesEl.append(card);
    });
  };
  const renderContext = (sparks) => {
    contextEl.replaceChildren();
    (sparks || []).forEach((spark) => {
      const card = document.createElement("article");
      const title = document.createElement("strong");
      title.textContent = spark.title;
      const body = document.createElement("p");
      body.textContent = spark.body || "";
      card.append(title, body);
      contextEl.append(card);
    });
  };
  const openBrainstorm = async () => {
    const ids = selectedIds.size ? [...selectedIds] : (selected ? [selected.id] : []);
    if (!ids.length) throw new Error(L("先选至少一条"));
    await save().catch(() => {});
    const payload = await request("POST", "/api/plugins/lingguang/conversations", { spark_ids: ids });
    conversation = payload.conversation;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    showChat(true);
    titleEl.textContent = L("头脑风暴");
    renderContext(payload.sparks || []);
    renderMessages(payload.messages || []);
    chatInput.value = "";
    chatInput.focus();
  };
  const copyDispatch = async () => {
    const items = selectedRecords().length ? selectedRecords() : (selected ? [selected] : []);
    if (!items.length) throw new Error(L("先选至少一条"));
    if (!dispatchDialog) return;
    dispatchDialog.returnValue = "cancel";
    const ok = await new Promise((resolve) => {
      const onClose = () => {
        dispatchDialog.removeEventListener("close", onClose);
        resolve(dispatchDialog.returnValue === "ok");
      };
      dispatchDialog.addEventListener("close", onClose);
      dispatchDialog.showModal();
    });
    if (!ok) return;
    const text = items.map((item) => item.title + (item.body ? "\\n" + item.body : "")).join("\\n\\n");
    try {
      await navigator.clipboard.writeText(text);
      showNote(L("已复制，没有写入其他系统。"), false);
    } catch {
      showNote(L("复制失败"), true);
    }
  };

  workbench.addEventListener("click", async (event) => {
    try {
      if (event.target.closest("[data-lingguang-capture]")) {
        const payload = await request("POST", "/api/plugins/lingguang", {});
        selectedIds = new Set([payload.spark.id]);
        await loadList();
        fillEditor(payload.spark);
        titleInput.focus();
        titleInput.select();
        return;
      }
      if (event.target.closest("[data-lingguang-clear-selection]")) {
        selectedIds = selected ? new Set([selected.id]) : new Set();
        renderList();
        return;
      }
      if (event.target.closest("[data-lingguang-discard-current]")) {
        if (selected) await discardIds([selected.id]);
        return;
      }
      if (event.target.closest("[data-lingguang-discard]")) {
        await discardIds(selectedIds.size ? [...selectedIds] : (selected ? [selected.id] : []));
        return;
      }
      if (event.target.closest("[data-lingguang-brainstorm], [data-lingguang-brainstorm-current]")) {
        await openBrainstorm();
        return;
      }
      if (event.target.closest("[data-lingguang-dispatch], [data-lingguang-dispatch-current]")) {
        await copyDispatch();
        return;
      }
      if (event.target.closest("[data-lingguang-back]")) {
        await save().catch((error) => showNote(error.message, true));
        closeWorkspace();
        await loadList();
        return;
      }
      const row = event.target.closest("[data-lingguang-id]");
      if (row && list.contains(row)) {
        const id = row.dataset.lingguangId;
        if (event.metaKey || event.ctrlKey) {
          if (selectedIds.has(id)) selectedIds.delete(id);
          else selectedIds.add(id);
          row.classList.toggle("is-selected", selectedIds.has(id));
          row.setAttribute("aria-selected", String(selectedIds.has(id)));
          syncSelectionBar();
          return;
        }
        if (selected && selected.id !== id) await save().catch((error) => showNote(error.message, true));
        const record = records.find((item) => item.id === id);
        if (!record) return;
        selectedIds = new Set([id]);
        fillEditor(record);
        renderList();
      }
    } catch (error) {
      showNote(error.message || L("灵光请求失败"), true);
    }
  });
  workspace.addEventListener("input", (event) => {
    if (event.target.closest("[data-lingguang-title], [data-lingguang-body]")) queueSave();
  });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!conversation) return;
    try {
      const payload = await request("POST", "/api/plugins/lingguang/conversations/" + encodeURIComponent(conversation.id) + "/messages", {
        body: chatInput.value,
      });
      conversation = payload.conversation;
      renderContext(payload.sparks || []);
      renderMessages(payload.messages || []);
      chatInput.value = "";
    } catch (error) {
      showNote(error.message || L("灵光请求失败"), true);
    }
  });
  chatForm.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
