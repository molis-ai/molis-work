/** Lingguang workbench client: capture, list, edit, discard, contextual conversation. */
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
  const saveStatus = workbench.querySelector('[data-lingguang-save-status]');
  const saveRetry = workbench.querySelector('[data-lingguang-save-retry]');
  const showSave = (text, failed = false) => {
    saveStatus.textContent = L(text);
    saveStatus.dataset.failed = String(failed);
    saveRetry.hidden = !failed;
  };
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
  let saveQueue = Promise.resolve();
  let sending = false;
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

  const headers = () => typeof molisWorkControlHeaders === "function"
    ? molisWorkControlHeaders()
    : { "content-type": "application/json" };
  const request = async (method, path, body) => {
    const response = await fetch(host.route(path), {
      method,
      headers: headers(),
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
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
    showSave("已保存");
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
    clearTimeout(saveTimer);
    if (!selected || conversation) return null;
    const record = selected;
    const title = titleInput.value;
    const body = bodyInput.value;
    const pending = saveQueue.then(async () => {
      const current = records.find((item) => item.id === record.id) || record;
      if (current.title === title && current.body === body) return current;
      if (selected?.id === record.id) showSave('保存中…');
      const payload = await request("POST", "/api/plugins/lingguang/" + encodeURIComponent(record.id), {
        title, body, expected_updated_at: current.updated_at,
      });
      remember(payload.spark);
      if (selected?.id === record.id) {
        if (titleInput.value === title && document.activeElement !== titleInput) titleInput.value = payload.spark.title;
        if (bodyInput.value === body && document.activeElement !== bodyInput) bodyInput.value = payload.spark.body || "";
      }
      if (selected?.id === record.id && titleInput.value === title && bodyInput.value === body) {
        showSave('已保存');
        showNote('', false);
      }
      return payload.spark;
    }).catch(error => {
      if (selected?.id === record.id) showSave('保存失败', true);
      throw error;
    });
    saveQueue = pending.catch(() => {});
    return pending;
  };
  const queueSave = () => {
    showSave("尚未保存");
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
      head.textContent = message.role === "assistant" ? L("灵光") : message.role === "stub" ? L("本地记录") : L("记下");
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
    await save();
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
    const text = items.map((item) => item.title + (item.body ? "\\n" + item.body : "")).join("\\n\\n");
    try {
      await navigator.clipboard.writeText(text);
      showNote(L("已复制内容"), false);
    } catch {
      showNote(L("复制失败"), true);
    }
  };

  workbench.addEventListener("click", async (event) => {
    try {
      if (event.target.closest("[data-lingguang-save-retry]")) { await save(); return; }
      if (event.target.closest("[data-lingguang-capture]")) {
        await save();
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
        await save();
        await copyDispatch();
        return;
      }
      if (event.target.closest("[data-lingguang-back]")) {
        await save();
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
        if (selected && selected.id !== id) await save();
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
    if (!conversation || sending) return;
    const conversationId = conversation.id;
    const body = chatInput.value;
    sending = true;
    const submit = chatForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    showNote("", false);
    try {
      const payload = await request("POST", "/api/plugins/lingguang/conversations/" + encodeURIComponent(conversationId) + "/messages", { body });
      if (conversation?.id !== conversationId) return;
      conversation = payload.conversation;
      renderContext(payload.sparks || []);
      renderMessages(payload.messages || []);
      if (chatInput.value === body) chatInput.value = "";
    } catch (error) {
      if (conversation?.id === conversationId) showNote(error.message || L("灵光请求失败"), true);
    } finally {
      sending = false;
      if (submit) submit.disabled = false;
    }
  });
  chatForm.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });
  // A tab or a workflow step can ask for one spark; it opens as soon as the list knows it.
  const paneParams = new URLSearchParams(location.search);
  let wantedId = paneParams.get("panePlugin") === "lingguang" ? paneParams.get("paneItem") : null;
  const openWanted = async () => {
    const record = wantedId && records.find((item) => item.id === wantedId);
    if (!record) return;
    wantedId = null;
    if (selected?.id === record.id) return;
    if (selected) await save();
    selectedIds = new Set([record.id]);
    fillEditor(record);
    renderList();
  };
  workbench.addEventListener("molis-work:select-item", (event) => {
    wantedId = event.detail?.itemId || null;
    if (!wantedId) return;
    if (records.some((item) => item.id === wantedId)) void openWanted().catch((error) => showNote(error.message, true));
    else void loadList().then(openWanted).catch((error) => showNote(error.message, true));
  });
  void loadList().then(openWanted).catch((error) => showNote(error.message, true));
}
`;
