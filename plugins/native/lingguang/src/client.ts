/**
 * Lingguang workbench client: capture, list, edit, discard, contextual conversation.
 *
 * Leaving a blank spark (W2-18 decision 6): `fresh` holds the sparks 「记下」 made blank, with the title the Host gave them. When the
 * person leaves one (back to the list, another spark, another new one) it is read once more from the Host, and if that copy still
 * has no body and the given title or none, it is thrown away with lingguang.discard, without asking. The Host's copy decides, so
 * words that arrived from elsewhere in the meantime keep it; a spark that went into a brainstorm is in use and stays. A failed
 * read or discard changes nothing.
 *
 * Leaving also means the surface going away. When the workbench hides this page (another plugin, Home, Settings) the open blank
 * spark is saved, the editor closed and the spark taken back the same way, so what comes back is the list. When the page itself
 * is going away (reload, window closed) there is no time to read the Host's copy: the copy this page last saw decides, and the
 * call is sent with keepalive. A tab or window that is only hidden is not leaving. The scope's cleanups run in the same order
 * when the page goes away; `alive` tells the two apart, so the call is made once.
 */
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
  const todoButton = workbench.querySelector("[data-lingguang-todo]");
  // "转为待办" is composed by the workbench from what the button carries, so it always carries what is on screen.
  const syncTodo = () => {
    if (!todoButton || !selected) return;
    todoButton.dataset.makeTodoId = selected.id;
    todoButton.dataset.makeTodoTitle = titleInput.value.trim() || bodyInput.value.trim().split(/\\r?\\n/)[0].slice(0, 80);
    todoButton.dataset.makeTodoExcerpt = bodyInput.value.slice(0, 2000);
  };
  const saveRetry = workbench.querySelector('[data-lingguang-save-retry]');
  /** The spark on screen, for the placement bar and the Assistant. */
  const publishContext = (unsaved) => {
    const context = { plugin_id: "io.molis.work.lingguang", surface_title: L("灵光") };
    if (selected) {
      context.object = { kind: "lingguang_spark", id: selected.id, version: selected.updated_at + ":" + (selected.status || "inbox"), title: titleInput.value || selected.title };
      if (unsaved) context.unsaved = true;
    }
    workbench.setAttribute("data-assistant-context", JSON.stringify(context));
  };
  const showSave = (text, failed = false) => {
    saveStatus.textContent = L(text);
    saveStatus.dataset.failed = String(failed);
    saveRetry.hidden = !failed;
    publishContext(failed || text !== "已保存");
  };
  const placed = (detail) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };
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
  const request = async (method, path, body, keepalive) => {
    const response = await fetch(host.route(path), {
      method,
      headers: headers(),
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
      keepalive,
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
  const readingDialog = workbench.querySelector("[data-lingguang-reading]");
  const linkDialog = workbench.querySelector("[data-lingguang-link]");
  const fileInput = workbench.querySelector("[data-lingguang-file]");
  const READING_STAGES = { extracting: "正在读取内容", fetching: "正在读取网页", downloading: "正在下载转写模型", model_download: "正在下载转写模型", transcribing: "正在转写音频", loading: "正在加载模型", ocr: "正在识别文字", frames: "正在读取视频画面", frame_ocr: "正在读取视频画面" };
  /** Read a file or a page with its progress shown; closing the dialog stops it. The reading, or null when stopped. */
  const readMaterial = async (path, payload) => {
    const controller = new AbortController();
    const stage = readingDialog.querySelector("[data-lingguang-reading-text]"), bar = readingDialog.querySelector("[data-lingguang-reading-progress]");
    stage.textContent = L("正在读取…"); bar.value = 0;
    const onClose = () => controller.abort();
    readingDialog.addEventListener("close", onClose);
    readingDialog.showModal();
    let result = null, failure = null;
    try {
      const response = await fetch(host.route(path) + "?stream=1", { method: "POST", headers: headers(), body: JSON.stringify(payload), signal: controller.signal });
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "";
      const consume = (line) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "progress") { stage.textContent = L(READING_STAGES[event.stage] || "正在读取…"); if (typeof event.progress === "number") bar.value = Math.max(0, Math.min(1, event.progress)); }
        else if (event.type === "result") result = event.result;
        else if (event.type === "error") { const error = new Error(event.error || L("读取失败")); error.code = event.code; error.details = event.details; throw error; }
      };
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\\n"); buffer = lines.pop(); lines.forEach(consume);
      }
      buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
      if (!result) throw new Error(L("读取没有返回结果"));
    } catch (error) { failure = error; }
    finally { readingDialog.removeEventListener("close", onClose); if (readingDialog.open) readingDialog.close(); }
    if (failure) {
      if (failure.name === "AbortError") { showNote(L("已停止读取")); return null; }
      // Transcription needs a local speech model: downloaded only on the person's yes, then the reading starts again.
      if (failure.code === "jelly.material.model_required") {
        const size = failure.details && failure.details.approximate_bytes;
        const ok = await ask(L("转写需要下载本机语音模型") + (size ? "（" + Math.round(size / 1024 / 1024) + " MB）" : "") + L("，只在这台机器上用。现在下载并继续？"), L("下载并继续"));
        return ok ? readMaterial(path, { ...payload, allow_model_download: true }) : null;
      }
      throw failure;
    }
    return result;
  };
  const askLink = () => new Promise((resolve) => {
    const input = linkDialog.querySelector("[data-lingguang-link-input]");
    input.value = ""; linkDialog.returnValue = "cancel";
    const onClose = () => { linkDialog.removeEventListener("close", onClose); const value = input.value.trim(); resolve(linkDialog.returnValue === "ok" && value ? value : null); };
    linkDialog.addEventListener("close", onClose);
    linkDialog.showModal(); input.focus();
  });
  linkDialog?.querySelector("[data-lingguang-link-cancel]")?.addEventListener("click", () => linkDialog.close("cancel"));
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
  const fresh = new Map();
  const dropBlank = async (id, unloading) => {
    const given = fresh.get(id);
    if (given === undefined) return;
    fresh.delete(id);
    try {
      const { spark } = unloading ? { spark: records.find((item) => item.id === id) } : await request("GET", "/api/plugins/lingguang/" + encodeURIComponent(id));
      if ((spark.body || "").trim() || (spark.title.trim() && spark.title !== given)) return;
      await request("POST", "/api/plugins/lingguang/discard", { ids: [id] }, unloading);
      records = records.filter((item) => item.id !== id);
      renderList();
    } catch { /* stays as it was */ }
  };
  const leaveBlank = async (unloading) => {
    const id = selected?.id;
    if (!id || !fresh.has(id) || bodyInput.value.trim() || (titleInput.value.trim() && titleInput.value !== fresh.get(id))) return;
    if (!unloading) {
      await save();
      if (selected?.id !== id) return;
      closeWorkspace();
    }
    await dropBlank(id, unloading);
  };
  const fillEditor = (record) => {
    const left = selected && selected.id !== record.id ? selected.id : "";
    selected = record;
    conversation = null;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    showChat(false);
    titleEl.textContent = record.title;
    showSave("已保存");
    titleInput.value = record.title;
    bodyInput.value = record.body || "";
    syncTodo();
    markSelected(record.id);
    void dropBlank(left);
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
    publishContext(false);
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
    // Where the spark went (a document, a Goal, a todo) is filled in after paint from the placement ledger.
    const fate = document.createElement("span");
    fate.className = "mw-status mw-status--plain mw-status--done feed-entry-status";
    fate.dataset.lingguangFate = record.id;
    fate.textContent = fates.get(record.id) || "";
    fate.hidden = !fate.textContent;
    row.append(
      leading,
      snippet,
      fate,
      textCell("plugin-stage-meta", whenOf(record.created_at)),
    );
    item.append(row);
    return item;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const fates = new Map();
  const fateLabel = (description) => {
    const derived = (description.associations || []).filter((item) => item.type === "derived_into");
    if (!derived.length) return "";
    const target = derived[derived.length - 1].target || {};
    if (target.kind === "goal") return L("已建 Goal");
    const kind = target.kind === "object" ? String(target.object?.kind || "") : "";
    if (kind.includes("todo")) return L("已转为待办");
    if (kind.includes("page") || kind.includes("document")) return L("已转成文档");
    if (kind.includes("jelly")) return L("已转成 Jelly 笔记");
    return L("已转出");
  };
  const annotateFates = async (items) => {
    const pending = items.filter((record) => !fates.has(record.id)).slice(0, 30);
    await Promise.all(pending.map(async (record) => {
      try { fates.set(record.id, fateLabel(await request("POST", "/api/placement/describe", { object: { kind: "lingguang_spark", id: record.id, project_id: record.project_id } }))); }
      catch { fates.set(record.id, ""); }
    }));
    rowsEl.querySelectorAll("[data-lingguang-fate]").forEach((cell) => {
      const label = fates.get(cell.dataset.lingguangFate) || "";
      cell.textContent = label;
      cell.hidden = !label;
    });
  };
  const paintList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => rowsEl.append(renderRow(record)));
    void annotateFates(records);
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
  let loadingFor = null;
  const loadList = async () => {
    const seq = ++listSeq;
    loadingFor = wantedId;
    const payload = await request("GET", "/api/plugins/lingguang").finally(() => { if (seq === listSeq) loadingFor = null; });
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
    // Whichever load fills the list settles a spark asked for by link (an overtaken load leaves it to the newer one).
    if (wantedId && records.some((item) => item.id === wantedId)) void openWanted().catch((error) => showNote(error.message, true));
    else if (wantedId && wantedByLink) {
      // A link from elsewhere (a todo's source, an old tab) can name one that was discarded: say so instead of opening nothing.
      wantedId = null; wantedByLink = false;
      showNote(L("这条灵光已丢掉或不存在"), true);
    }
  };
  const discardIds = async (ids) => {
    if (!ids.length) return;
    const many = ids.length > 1;
    if (!await ask(many ? L("丢掉这几条？它们会离开灵光池。") : L("丢掉这条？它会离开灵光池。"), L("丢掉"))) return;
    await request("POST", "/api/plugins/lingguang/discard", { ids });
    await loadList();
  };
  let shownMessages = [];
  const renderMessages = (messages) => {
    shownMessages = messages || [];
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
  /*
   * Handing this spark to the Assistant: the spark itself and only the last few brainstorm lines, named as such —
   * never the whole conversation. Submitting the form is the person's asking; “只带过去” leaves Send to them.
   */
  const askForm = workbench.querySelector("[data-lingguang-ask]");
  const askInput = workbench.querySelector("[data-lingguang-ask-input]");
  const handOver = (purpose, text) => {
    if (!selected) return;
    const recent = shownMessages.filter((message) => message.role !== "stub").slice(-6);
    const materials = [{ title: L("灵光") + "「" + (selected.title || L("灵光")) + "」", text: (selected.title || "") + (selected.body ? "\\n" + selected.body : "") }];
    if (recent.length) materials.push({ title: L("头脑风暴 · 最近") + " " + recent.length + " " + L("句"), text: recent.map((message) => (message.role === "assistant" ? L("灵光") : L("我")) + "：" + message.body).join("\\n") });
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
      message_id: crypto.randomUUID(), purpose, source: { surface: "lingguang", title: L("灵光") },
      object: { kind: "lingguang_spark", id: selected.id, title: selected.title || L("灵光"), version: selected.updated_at + ":" + (selected.status || "inbox") },
      text, materials,
    } }));
    askForm.hidden = true;
    workbench.querySelector("[data-lingguang-ask-toggle]")?.setAttribute("aria-expanded", "false");
    askInput.value = "";
  };
  askForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(askInput.value || "").trim();
    if (!text) { askInput.focus(); return; }
    await save();
    handOver("delegate", text);
  });
  askForm?.addEventListener("keydown", (event) => { if (event.key === "Escape") { askForm.hidden = true; workbench.querySelector("[data-lingguang-ask-toggle]")?.focus(); } });
  const openBrainstorm = async () => {
    const ids = selectedIds.size ? [...selectedIds] : (selected ? [selected.id] : []);
    if (!ids.length) throw new Error(L("先选至少一条"));
    await save();
    ids.forEach((id) => fresh.delete(id));
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

  // Moved or copied from the placement bar: this list changed; a spark moved away is no longer here to edit.
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = event.detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("lingguang_spark")) return;
    if (detail.mode === "move" && detail.from && selected && selected.id === detail.from.id) closeWorkspace();
    fates.clear();
    void loadList().catch((error) => showNote(error.message, true));
  });
  /** A reading becomes one spark, its origin and anything it could not read said in it. */
  const keepReading = async (reading, fallbackTitle, origin) => {
    const body = [reading.text, origin, reading.partial && reading.issues && reading.issues.length ? L("说明：") + reading.issues.join("；") : ""].filter(Boolean).join("\\n\\n");
    const payload = await request("POST", "/api/plugins/lingguang", { title: (reading.title || fallbackTitle).slice(0, 80), body });
    selectedIds = new Set([payload.spark.id]);
    await loadList();
    fillEditor(payload.spark);
    placed({ verb: "created", title: payload.spark.title, object: { kind: "lingguang_spark", id: payload.spark.id } });
    if (reading.partial) showNote(L("只读到了部分内容，请核对原文"));
  };
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    void (async () => {
      if (file.size > 25 * 1024 * 1024) throw new Error(L("文件不能超过 25 MB"));
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
      const reading = await readMaterial("/api/plugins/lingguang/material", { file_name: file.name, data_base64: btoa(binary) });
      if (reading) await keepReading(reading, file.name.replace(/\\.[^.]+$/, ""), L("文件：") + file.name);
    })().catch((error) => showNote(error.message, true));
  });
  workbench.addEventListener("click", async (event) => {
    try {
      if (event.target.closest("[data-lingguang-save-retry]")) { await save(); return; }
      if (event.target.closest("[data-lingguang-capture]")) {
        await save();
        const payload = await request("POST", "/api/plugins/lingguang", {});
        fresh.set(payload.spark.id, payload.spark.title);
        selectedIds = new Set([payload.spark.id]);
        await loadList();
        fillEditor(payload.spark);
        titleInput.focus();
        titleInput.select();
        placed({ verb: "created", title: payload.spark.title, object: { kind: "lingguang_spark", id: payload.spark.id } });
        return;
      }
      if (event.target.closest("[data-lingguang-to-doc], [data-lingguang-to-goal], [data-lingguang-to-jelly]") && selected) {
        await save();
        const goal = Boolean(event.target.closest("[data-lingguang-to-goal]")), jelly = Boolean(event.target.closest("[data-lingguang-to-jelly]"));
        fates.delete(selected.id);
        window.dispatchEvent(new CustomEvent("molis:placement-convert", { detail: { source: { kind: "lingguang_spark", id: selected.id },
          ...(goal ? { goal: true } : { station: jelly ? "jelly" : "pages" }),
          note: goal ? L("这条灵光是它的来源；灵光本身留着，想好了可以丢掉") : jelly ? L("笔记里记着它来自这条灵光；灵光本身留着，想好了可以丢掉")
            : L("文档里记着它来自这条灵光；灵光本身留着，想好了可以丢掉") } }));
        return;
      }
      if (event.target.closest("[data-lingguang-import-file]")) { await save(); fileInput.click(); return; }
      if (event.target.closest("[data-lingguang-read-link]")) {
        await save();
        const url = await askLink();
        if (!url) return;
        const reading = await readMaterial("/api/plugins/lingguang/source", { url });
        if (reading) await keepReading(reading, url, L("来源：") + url);
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
      if (event.target.closest("[data-lingguang-ask-toggle]")) {
        const open = askForm.hidden;
        askForm.hidden = !open;
        workbench.querySelector("[data-lingguang-ask-toggle]")?.setAttribute("aria-expanded", String(open));
        if (open) askInput.focus();
        return;
      }
      if (event.target.closest("[data-lingguang-ask-bring]")) {
        await save();
        handOver("suggest", "");
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
        const left = selected?.id;
        closeWorkspace();
        await dropBlank(left);
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
    if (event.target.closest("[data-lingguang-title], [data-lingguang-body]")) { syncTodo(); queueSave(); }
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
  let wantedByLink = false;
  const openWanted = async () => {
    const record = wantedId && records.find((item) => item.id === wantedId);
    if (!record) return;
    wantedId = null; wantedByLink = false;
    if (selected?.id === record.id) return;
    if (selected) await save();
    selectedIds = new Set([record.id]);
    fillEditor(record);
    renderList();
  };
  workbench.addEventListener("molis-work:select-item", (event) => {
    // The plugin shown without an item (the workbench also says so while a page loads): nothing new to open, and a
    // spark asked for by link that is still loading is not cancelled by it.
    const itemId = event.detail?.itemId || null;
    if (!itemId) return;
    wantedId = itemId;
    wantedByLink = true;
    if (records.some((item) => item.id === wantedId)) void openWanted().catch((error) => showNote(error.message, true));
    // The workbench may name the same spark several times while the page settles: one load for it is enough.
    else if (loadingFor !== itemId) void loadList().catch((error) => { listFailed(error); throw error; }).then(openWanted).catch((error) => showNote(error.message, true));
  });
  // A list that cannot be read says so where the list is, with a way to try again (the note lives in the editor).
  const listFailed = (error) => {
    if (empty) empty.hidden = true;
    const box = document.createElement("div");
    box.className = "mw-empty mw-empty--error";
    box.setAttribute("role", "alert");
    box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
    box.querySelector("strong").textContent = L("列表暂时读不到");
    box.querySelector("p").textContent = error?.message || L("请稍后重试");
    const retry = box.querySelector("button");
    retry.textContent = L("重试");
    retry.addEventListener("click", () => { retry.disabled = true; void loadList().then(() => box.remove(), (next) => { retry.disabled = false; box.querySelector("p").textContent = next?.message || L("请稍后重试"); }); });
    rowsEl.replaceChildren(box);
  };
  const lifetime = host.mountPluginClient?.(workbench);
  lifetime?.whenVisible(() => () => { if (lifetime.alive && !document.hidden) void leaveBlank().catch(() => {}); });
  lifetime?.own(() => { void leaveBlank(true); });
  void loadList().catch((error) => { listFailed(error); throw error; }).then(openWanted).catch((error) => showNote(error.message, true));
}
`;
