/** Pages workbench client: library, autosave, ProseMirror host. */
export const PAGES_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-pages=workbench]");
  if (!workbench) return;
  const rowsEl = workbench.querySelector("[data-pages-rows]");
  const empty = workbench.querySelector("[data-pages-empty]");
  const searchEmpty = workbench.querySelector("[data-pages-search-empty]");
  const searchInput = workbench.querySelector("[data-pages-search]");
  const workspace = workbench.querySelector("[data-pages-stage-workspace]");
  const titleEl = workbench.querySelector("[data-pages-editor-title]");
  const statusEl = workbench.querySelector("[data-pages-editor-status]");
  const titleInput = workbench.querySelector("[data-pages-title]");
  const folderSelect = workbench.querySelector("[data-pages-folder]");
  const goalSelect = workbench.querySelector("[data-pages-goal]");
  const starEditor = workbench.querySelector("[data-pages-star-editor]");
  const editorHost = workbench.querySelector("[data-pages-editor]");
  const note = workbench.querySelector("[data-pages-note]");
  const confirmDialog = workbench.querySelector("[data-pages-confirm]");
  const nameDialog = workbench.querySelector("[data-pages-name]");
  const templateDialog = workbench.querySelector("[data-pages-template-dialog]");
  const Editor = window.MolisWorkPagesEditor;
  const CARET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"></path></svg>';
  let records = [];
  let folders = [];
  let selected = null;
  let editor = null;
  let saveTimer = 0;
  let filling = false;
  let query = "";
  let templateFolderId = "";
  let goals = [];

  const projectId = () => (typeof host.projectId === "function" ? host.projectId() : host.projectId) || "";
  const routePrefix = () => document.body.dataset.routePrefix || "";
  const route = (path) => routePrefix() + path;
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
    const response = await fetch(route(withProject(path)), {
      method,
      headers: headers(),
      body: payloadBody === undefined || method === "GET" ? undefined : JSON.stringify(payloadBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || L("文档请求失败"));
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
  const askName = (message, initial) => new Promise((resolve) => {
    if (!nameDialog) { resolve(null); return; }
    const input = nameDialog.querySelector("[data-name-input]");
    nameDialog.querySelector("[data-name-label]").textContent = message;
    input.value = initial || "";
    nameDialog.returnValue = "cancel";
    const onClose = () => {
      nameDialog.removeEventListener("close", onClose);
      resolve(nameDialog.returnValue === "ok" ? input.value : null);
    };
    nameDialog.addEventListener("close", onClose);
    nameDialog.showModal();
    input.focus();
    input.select();
  });
  const formatTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" });
  };
  const visibleRecords = () => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => String(record.title || "").toLowerCase().includes(needle));
  };
  const fillGoalSelect = () => {
    if (!goalSelect) return;
    const current = selected?.goal_id || "";
    goalSelect.replaceChildren();
    const none = document.createElement("option");
    none.value = "";
    none.textContent = L("不挂 Goal");
    goalSelect.append(none);
    goals.forEach((goal) => {
      const option = document.createElement("option");
      option.value = goal.id;
      option.textContent = goal.title;
      goalSelect.append(option);
    });
    goalSelect.value = goals.some((goal) => goal.id === current) ? current : "";
  };
  const loadGoals = async () => {
    try {
      const response = await fetch(route("/api/board"), { headers: headers() });
      const payload = await response.json().catch(() => ({}));
      goals = (payload.goals || []).map((item) => ({
        id: item.goal?.goal_id || item.goal_id || "",
        title: item.goal?.title || item.title || "",
      })).filter((item) => item.id);
    } catch {
      goals = [];
    }
    fillGoalSelect();
  };
  const fillFolderSelect = () => {
    if (!folderSelect) return;
    const current = selected?.folder_id || "";
    folderSelect.replaceChildren();
    const none = document.createElement("option");
    none.value = "";
    none.textContent = L("未分类");
    folderSelect.append(none);
    folders.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.title;
      folderSelect.append(option);
    });
    folderSelect.value = folders.some((folder) => folder.id === current) ? current : "";
  };
  const syncEditorChrome = () => {
    if (!selected) return;
    if (starEditor) {
      starEditor.classList.toggle("is-on", Boolean(selected.starred));
      starEditor.textContent = selected.starred ? L("取消收藏") : L("收藏");
      starEditor.setAttribute("aria-label", selected.starred ? L("取消收藏") : L("收藏"));
    }
    fillFolderSelect();
    fillGoalSelect();
  };
  const markSelected = (id) => {
    rowsEl.querySelectorAll("[data-page-id]").forEach((row) => {
      const on = row.dataset.pageId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const renderRow = (record) => {
    const item = document.createElement("article");
    item.className = "feed-stage-item pages-doc-row";
    const star = document.createElement("button");
    star.type = "button";
    star.className = "pages-star" + (record.starred ? " is-on" : "");
    star.dataset.pagesStar = record.id;
    star.setAttribute("aria-label", record.starred ? L("取消收藏") : L("收藏"));
    star.textContent = "★";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "feed-stage-entry directory-list-row" + (selected?.id === record.id ? " is-selected" : "");
    row.dataset.pageId = record.id;
    row.setAttribute("aria-selected", String(selected?.id === record.id));
    const leading = document.createElement("span");
    leading.className = "feed-stage-leading";
    const title = document.createElement("strong");
    title.title = record.title;
    title.textContent = record.title;
    leading.append(title);
    const kind = document.createElement("span");
    kind.className = "mw-status plugin-stage-kind";
    kind.dataset.kind = "page";
    kind.textContent = L("文档");
    const folder = folders.find((item) => item.id === record.folder_id);
    const fact = document.createElement("span");
    fact.className = "plugin-stage-fact";
    fact.textContent = folder ? folder.title : L("未分类");
    const meta = document.createElement("span");
    meta.className = "plugin-stage-meta";
    meta.textContent = formatTime(record.updated_at);
    const status = document.createElement("span");
    status.className = "feed-entry-status";
    row.append(leading, kind, fact, meta, status);
    item.append(row, star);
    return item;
  };
  const renderFold = (key, label, items, actions) => {
    const fold = document.createElement("details");
    fold.className = "goal-collection-fold";
    fold.open = true;
    fold.dataset.folderId = key;
    const summary = document.createElement("summary");
    const caret = document.createElement("span");
    caret.className = "goal-collection-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.innerHTML = CARET;
    const strong = document.createElement("strong");
    strong.textContent = label;
    const small = document.createElement("small");
    small.textContent = String(items.length);
    summary.append(caret, strong, small);
    if (actions) summary.append(actions);
    fold.append(summary);
    if (!items.length) {
      const vacant = document.createElement("p");
      vacant.className = "goal-collection-empty";
      vacant.textContent = L("还没有文档");
      fold.append(vacant);
    } else items.forEach((record) => fold.append(renderRow(record)));
    return fold;
  };
  const folderActions = (folder) => {
    const wrap = document.createElement("span");
    wrap.className = "pages-folder-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.dataset.pagesFolderNew = folder.id;
    add.setAttribute("aria-label", L("在此新建"));
    add.textContent = "+";
    const rename = document.createElement("button");
    rename.type = "button";
    rename.dataset.pagesFolderRename = folder.id;
    rename.setAttribute("aria-label", L("重命名文件夹"));
    rename.textContent = "✎";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.pagesFolderDelete = folder.id;
    remove.setAttribute("aria-label", L("删除文件夹"));
    remove.textContent = "×";
    wrap.append(add, rename, remove);
    return wrap;
  };
  const renderList = () => {
    const shown = visibleRecords();
    const searching = Boolean(query.trim());
    empty.hidden = records.length > 0 || searching || folders.length > 0;
    searchEmpty.hidden = !(searching && shown.length === 0);
    const open = new Set([...rowsEl.querySelectorAll("details[data-folder-id][open]")].map((node) => node.dataset.folderId));
    rowsEl.replaceChildren();
    const grouped = folders.length > 0 || records.some((record) => record.starred);
    if (searching || !grouped) {
      shown.forEach((record) => rowsEl.append(renderRow(record)));
      return;
    }
    const starred = shown.filter((record) => record.starred);
    if (starred.length) rowsEl.append(renderFold("starred", L("收藏"), starred));
    folders.forEach((folder) => {
      const items = shown.filter((record) => record.folder_id === folder.id);
      const fold = renderFold(folder.id, folder.title, items, folderActions(folder));
      if (open.size) fold.open = open.has(folder.id);
      rowsEl.append(fold);
    });
    const unfiled = shown.filter((record) => !record.folder_id);
    if (unfiled.length) rowsEl.append(renderFold("", L("未分类"), unfiled));
  };
  const remember = (record, redraw) => {
    selected = record;
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    renderList();
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存");
    markSelected(record.id);
    syncEditorChrome();
    if (redraw) fillEditor(record);
  };
  const ensureEditor = (body) => {
    if (!Editor || !editorHost) throw new Error(L("编辑器内核未加载"));
    if (editor) {
      Editor.setDoc(editor, body);
      return;
    }
    editor = Editor.mount(editorHost, {
      doc: body,
      onChange: () => { if (!filling) queueSave(); },
      translate: L,
      pages: () => records.map((item) => ({ id: item.id, title: item.title })),
      onOpenPage: (id) => {
        const record = records.find((item) => item.id === id);
        if (record) fillEditor(record);
      },
      runAi: async (input) => {
        if (!selected) throw new Error(L("文档请求失败"));
        return request("POST", "/api/pages/" + encodeURIComponent(selected.id) + "/ai", input);
      },
      onCreateFromAi: async (input) => {
        const content = String(input.text || "").split(/\\n{2,}/).map((part) => (
          part.trim()
            ? { type: "paragraph", content: [{ type: "text", text: part.trim() }] }
            : { type: "paragraph" }
        ));
        await createPage({ title: input.title, body: { type: "doc", content } });
      },
    });
  };
  const fillEditor = (record) => {
    clearTimeout(saveTimer);
    filling = true;
    selected = record;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存");
    titleInput.value = record.title;
    try {
      ensureEditor(record.body || (Editor && Editor.emptyDoc()));
    } finally {
      filling = false;
    }
    markSelected(record.id);
    syncEditorChrome();
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    document.querySelectorAll(".pages-format-bar").forEach((bar) => { bar.hidden = true; });
  };
  const loadList = async () => {
    const payload = await request("GET", "/api/pages");
    records = payload.documents || [];
    folders = payload.folders || [];
    renderList();
    if (selected) {
      const next = records.find((item) => item.id === selected.id);
      if (next) remember(next, false);
      else closeEditor();
    } else fillFolderSelect();
  };
  const save = async () => {
    if (!selected) return selected;
    const body = editor && Editor ? Editor.getDoc(editor) : selected.body;
    const payload = await request("POST", "/api/pages/" + encodeURIComponent(selected.id), {
      title: titleInput.value,
      body,
    });
    remember(payload.document, false);
    if (document.activeElement !== titleInput) titleInput.value = payload.document.title;
    return selected;
  };
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };
  const exportHtml = () => {
    if (!selected || !Editor) return;
    const body = editor ? Editor.getDoc(editor) : selected.body;
    const html = "<!doctype html><html lang=\\"zh-CN\\"><head><meta charset=\\"utf-8\\"><title>"
      + escapeHtml(selected.title) + "</title></head><body><h1>"
      + escapeHtml(selected.title) + "</h1>" + Editor.toHTML(body) + "</body></html>";
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (selected.title || "page") + ".html";
    link.click();
    URL.revokeObjectURL(url);
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const openCreated = (record) => {
    remember(record, false);
    fillEditor(record);
  };
  const createPage = async (body) => {
    const payload = await request("POST", "/api/pages", body || {});
    openCreated(payload.document);
  };
  const toggleStar = async (id) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    const payload = await request("POST", "/api/pages/" + encodeURIComponent(id), { starred: !record.starred });
    if (selected?.id === id) remember(payload.document, false);
    else {
      const index = records.findIndex((item) => item.id === id);
      if (index >= 0) records[index] = payload.document;
      renderList();
    }
  };

  titleInput.addEventListener("input", () => {
    if (titleEl) titleEl.textContent = titleInput.value || L("文档");
    queueSave();
  });
  searchInput?.addEventListener("input", () => {
    query = searchInput.value || "";
    renderList();
  });
  folderSelect?.addEventListener("change", () => {
    if (!selected) return;
    void request("POST", "/api/pages/" + encodeURIComponent(selected.id), { folder_id: folderSelect.value })
      .then((payload) => remember(payload.document, false))
      .catch((error) => showNote(error.message || L("保存失败"), true));
  });
  goalSelect?.addEventListener("change", () => {
    if (!selected) return;
    void request("POST", "/api/pages/" + encodeURIComponent(selected.id), { goal_id: goalSelect.value })
      .then((payload) => remember(payload.document, false))
      .catch((error) => showNote(error.message || L("保存失败"), true));
  });
  workbench.addEventListener("click", async (event) => {
    try {
      const star = event.target.closest("[data-pages-star]");
      if (star) {
        event.preventDefault();
        event.stopPropagation();
        await toggleStar(star.dataset.pagesStar);
        return;
      }
      const folderNew = event.target.closest("[data-pages-folder-new]");
      if (folderNew) {
        event.preventDefault();
        event.stopPropagation();
        await createPage({ folder_id: folderNew.dataset.pagesFolderNew });
        return;
      }
      const folderRename = event.target.closest("[data-pages-folder-rename]");
      if (folderRename) {
        event.preventDefault();
        event.stopPropagation();
        const folder = folders.find((item) => item.id === folderRename.dataset.pagesFolderRename);
        if (!folder) return;
        const title = await askName(L("文件夹名称"), folder.title);
        if (title == null) return;
        const payload = await request("POST", "/api/pages/folders/" + encodeURIComponent(folder.id), { title });
        folders = folders.map((item) => item.id === payload.folder.id ? payload.folder : item);
        renderList();
        fillFolderSelect();
        return;
      }
      const folderDelete = event.target.closest("[data-pages-folder-delete]");
      if (folderDelete) {
        event.preventDefault();
        event.stopPropagation();
        const ok = await ask(L("要删除这个文件夹吗？里面的文档会回到未分类。"), L("删除"));
        if (!ok) return;
        const id = folderDelete.dataset.pagesFolderDelete;
        await request("POST", "/api/pages/folders/" + encodeURIComponent(id) + "/delete", {});
        folders = folders.filter((item) => item.id !== id);
        records = records.map((item) => item.folder_id === id ? { ...item, folder_id: "" } : item);
        if (selected?.folder_id === id) selected = { ...selected, folder_id: "" };
        renderList();
        fillFolderSelect();
        return;
      }
      const template = event.target.closest("[data-pages-template]");
      if (template) {
        templateDialog?.close();
        await createPage({ template_id: template.dataset.pagesTemplate, folder_id: templateFolderId || undefined });
        templateFolderId = "";
        return;
      }
      if (event.target.closest("[data-pages-templates]")) {
        templateFolderId = "";
        templateDialog?.showModal();
        return;
      }
      if (event.target.closest("[data-pages-new-folder]")) {
        const title = await askName(L("文件夹名称"), "");
        if (title == null) return;
        const payload = await request("POST", "/api/pages/folders", { title });
        folders = [...folders, payload.folder].sort((a, b) => a.title.localeCompare(b.title, "zh"));
        renderList();
        fillFolderSelect();
        return;
      }
      if (event.target.closest("[data-pages-new]")) {
        await createPage({});
        return;
      }
      const row = event.target.closest("[data-page-id]");
      if (row) {
        const record = records.find((item) => item.id === row.dataset.pageId);
        if (record) fillEditor(record);
        return;
      }
      if (event.target.closest("[data-pages-star-editor]") && selected) {
        await toggleStar(selected.id);
        return;
      }
      if (event.target.closest("[data-pages-back]")) {
        await save().catch((error) => showNote(error.message || L("保存失败"), true));
        closeEditor();
        return;
      }
      if (event.target.closest("[data-pages-extract]") && selected) {
        await save().catch((error) => showNote(error.message || L("保存失败"), true));
        const payload = await request("POST", "/api/pages/" + encodeURIComponent(selected.id) + "/extract", {});
        await loadList();
        remember(payload.document, true);
        return;
      }
      if (event.target.closest("[data-pages-promote]") && selected) {
        await save().catch((error) => showNote(error.message || L("保存失败"), true));
        const response = await fetch(route(withProject("/api/pages/" + encodeURIComponent(selected.id) + "/promote")), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ project_id: projectId(), goal_id: goalSelect ? goalSelect.value : selected.goal_id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload.document) remember(payload.document, false);
        if (!response.ok) throw new Error(payload.error || L("文档请求失败"));
        showNote(L("已保存"), false);
        return;
      }
      if (event.target.closest("[data-pages-export]") && selected) {
        exportHtml();
        return;
      }
      if (event.target.closest("[data-pages-delete]") && selected) {
        const ok = await ask(L("要删除这篇文档吗？删除后无法恢复。"), L("删除"));
        if (!ok) return;
        const id = selected.id;
        await request("POST", "/api/pages/" + encodeURIComponent(id) + "/delete", {});
        records = records.filter((item) => item.id !== id);
        closeEditor();
        renderList();
      }
    } catch (error) {
      showNote(error.message || L("文档请求失败"), true);
    }
  });
  void loadList().catch((error) => showNote(error.message || L("文档请求失败"), true));
  void loadGoals();
}`;
