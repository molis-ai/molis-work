/** Lingguang workbench client: capture, stream, edit, discard, local brainstorm. */
export const LINGGUANG_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-lingguang=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-lingguang=directory]");
  const rowsEl = workbench.querySelector("[data-lingguang-rows]");
  const empty = workbench.querySelector("[data-lingguang-empty]");
  const countEl = workbench.querySelector("[data-lingguang-count]");
  const workspace = workbench.querySelector("[data-lingguang-stage-workspace]");
  const captureTitle = workbench.querySelector("[data-lingguang-capture-title]");
  const captureBody = workbench.querySelector("[data-lingguang-capture-body]");
  const composer = workbench.querySelector("[data-lingguang-composer]");
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
  let expandedId = null;
  let conversation = null;
  let saveTimer = 0;

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
    return line && line !== record.title ? line : "";
  };
  const selectedRecords = () => records.filter((item) => selectedIds.has(item.id));
  const syncSelectionBar = () => {
    const count = selectedIds.size;
    selectionBar.hidden = count === 0;
    selectedCountEl.textContent = count ? L("已选") + " " + count : "";
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
    expandedId = record.id;
    const row = rowsEl.querySelector('[data-lingguang-id="' + record.id + '"]');
    if (!row) return;
    const titleInput = row.querySelector("[data-lingguang-title]");
    const bodyInput = row.querySelector("[data-lingguang-body]");
    if (titleInput) titleInput.value = record.title;
    if (bodyInput) bodyInput.value = record.body || "";
  };
  const renderRow = (record) => {
    const expanded = record.id === expandedId;
    const row = document.createElement("article");
    row.className = "lingguang-row" + (expanded ? " is-expanded" : "");
    row.dataset.lingguangId = record.id;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "lingguang-row__check";
    check.dataset.lingguangCheck = "true";
    check.checked = selectedIds.has(record.id);
    const main = document.createElement("div");
    main.className = "lingguang-row__main";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "lingguang-row__open";
    open.dataset.lingguangOpen = "true";
    const title = document.createElement("strong");
    title.dataset.lingguangPreview = "true";
    title.textContent = record.title;
    const snippet = document.createElement("small");
    snippet.dataset.lingguangSnippet = "true";
    snippet.textContent = previewOf(record);
    open.append(title, snippet);
    main.append(open);
    if (expanded) {
      const editor = document.createElement("div");
      editor.className = "lingguang-editor";
      const titleField = document.createElement("label");
      titleField.className = "lingguang-field";
      titleField.append(L("标题"));
      const titleInput = document.createElement("input");
      titleInput.className = "mw-input";
      titleInput.dataset.lingguangTitle = "true";
      titleInput.autocomplete = "off";
      titleInput.value = record.title;
      titleField.append(titleInput);
      const bodyField = document.createElement("label");
      bodyField.className = "lingguang-field";
      bodyField.append(L("正文"));
      const bodyInput = document.createElement("textarea");
      bodyInput.className = "mw-textarea";
      bodyInput.dataset.lingguangBody = "true";
      bodyInput.rows = 4;
      bodyInput.value = record.body || "";
      bodyField.append(bodyInput);
      editor.append(titleField, bodyField);
      main.append(editor);
    }
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "mw-btn mw-btn--ghost";
    discard.dataset.lingguangDiscardOne = "true";
    discard.textContent = L("丢掉");
    row.append(check, main, discard);
    return row;
  };
  const renderList = () => {
    empty.hidden = records.length > 0;
    countEl.textContent = records.length + " " + L("条");
    rowsEl.replaceChildren();
    records.forEach((record) => rowsEl.append(renderRow(record)));
    syncSelectionBar();
  };
  const remember = (record) => {
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    patchPreview(record);
    countEl.textContent = records.length + " " + L("条");
    empty.hidden = records.length > 0;
  };
  const save = async () => {
    if (!expandedId) return null;
    const row = rowsEl.querySelector('[data-lingguang-id="' + expandedId + '"]');
    if (!row) return null;
    const titleInput = row.querySelector("[data-lingguang-title]");
    const bodyInput = row.querySelector("[data-lingguang-body]");
    const payload = await request("POST", "/api/lingguang/" + encodeURIComponent(expandedId), {
      title: titleInput?.value || "",
      body: bodyInput?.value || "",
    });
    remember(payload.spark);
    return payload.spark;
  };
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };
  const loadList = async () => {
    const payload = await request("GET", "/api/lingguang");
    records = payload.sparks || [];
    selectedIds = new Set([...selectedIds].filter((id) => records.some((item) => item.id === id)));
    if (expandedId && !records.some((item) => item.id === expandedId)) expandedId = null;
    renderList();
  };
  const discardIds = async (ids) => {
    if (!ids.length) return;
    const many = ids.length > 1;
    if (!await ask(many ? L("丢掉这几条？它们会离开灵光池。") : L("丢掉这条？它会离开灵光池。"), L("丢掉"))) return;
    await request("POST", "/api/lingguang/discard", { ids });
    records = records.filter((item) => !ids.includes(item.id));
    ids.forEach((id) => selectedIds.delete(id));
    if (ids.includes(expandedId)) expandedId = null;
    renderList();
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
    const ids = [...selectedIds];
    if (!ids.length) throw new Error(L("先选至少一条"));
    await save().catch(() => {});
    const payload = await request("POST", "/api/lingguang/conversations", { spark_ids: ids });
    conversation = payload.conversation;
    renderContext(payload.sparks || []);
    renderMessages(payload.messages || []);
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    chatInput.value = "";
    chatInput.focus();
  };
  const closeBrainstorm = () => {
    conversation = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
  };
  const copyDispatch = async () => {
    const items = selectedRecords();
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

  list.addEventListener("click", async (event) => {
    try {
      const check = event.target.closest("[data-lingguang-check]");
      if (check) {
        const id = check.closest("[data-lingguang-id]").dataset.lingguangId;
        if (check.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        syncSelectionBar();
        return;
      }
      if (event.target.closest("[data-lingguang-clear-selection]")) {
        selectedIds.clear();
        rowsEl.querySelectorAll("[data-lingguang-check]").forEach((check) => { check.checked = false; });
        syncSelectionBar();
        return;
      }
      const discardOne = event.target.closest("[data-lingguang-discard-one]");
      if (discardOne) {
        await discardIds([discardOne.closest("[data-lingguang-id]").dataset.lingguangId]);
        return;
      }
      if (event.target.closest("[data-lingguang-discard]")) {
        await discardIds([...selectedIds]);
        return;
      }
      if (event.target.closest("[data-lingguang-brainstorm]")) {
        await openBrainstorm();
        return;
      }
      if (event.target.closest("[data-lingguang-dispatch]")) {
        await copyDispatch();
        return;
      }
      const open = event.target.closest("[data-lingguang-open]");
      if (open) {
        const id = open.closest("[data-lingguang-id]").dataset.lingguangId;
        if (expandedId) await save().catch((error) => showNote(error.message, true));
        expandedId = expandedId === id ? null : id;
        renderList();
        if (expandedId) fillEditor(records.find((item) => item.id === expandedId));
      }
    } catch (error) {
      showNote(error.message || L("灵光请求失败"), true);
    }
  });
  list.addEventListener("input", (event) => {
    if (event.target.closest("[data-lingguang-title], [data-lingguang-body]")) queueSave();
  });
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = await request("POST", "/api/lingguang", {
        title: captureTitle.value,
        body: captureBody.value,
      });
      captureTitle.value = "";
      captureBody.value = "";
      records.unshift(payload.spark);
      renderList();
      showNote("", false);
    } catch (error) {
      showNote(error.message || L("灵光请求失败"), true);
    }
  });
  workbench.addEventListener("click", (event) => {
    if (event.target.closest("[data-lingguang-back]")) closeBrainstorm();
  });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!conversation) return;
    try {
      const payload = await request("POST", "/api/lingguang/conversations/" + encodeURIComponent(conversation.id) + "/messages", {
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
  void loadList().catch((error) => showNote(error.message, true));
}
`;
