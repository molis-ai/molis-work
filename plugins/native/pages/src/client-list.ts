import { PAGES_BLANK_CLIENT_SCRIPT } from "./blank-client.js";

/** Part of the Pages workbench client (client.ts): the directory list: rows, folds, folder actions and its paint. A source slice of one function body, joined in order. */
export const PAGES_CLIENT_LIST = `  const fixedCell = (record) => {
    if (!record.publication_pending && !(record.artifact_version > 0)) return null;
    const node = make("span", "mw-status mw-status--plain feed-entry-status " + (record.publication_pending ? "mw-status--attention" : "mw-status--done"));
    node.dataset.mwState = record.publication_pending ? "unsaved" : "saved"; node.textContent = record.publication_pending ? L("固定版本未存完") : L("固定版本") + " v" + record.artifact_version;
    return node;
  };
  const renderRow = (record) => {
    const item = make("article", "feed-stage-item pages-doc-row creative-artifact-row");
    item.setAttribute("role", "none");
    item.draggable = folders.length > 0;
    item.dataset.pageId = record.id;
    const row = document.createElement("button");
    row.type = "button";
    row.draggable = folders.length > 0;
    row.className = "feed-stage-entry directory-list-row" + (sel?.id === record.id ? " is-selected" : "");
    row.dataset.pageId = record.id;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(chosen(record.id)));
    if (picked.has(record.id)) item.classList.add("is-picked");
    const leading = make("span", "feed-stage-leading");
    const mark = make("span", "pages-doc-mark");
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = ICON("note");
    const title = document.createElement("strong");
    title.title = record.title;
    title.textContent = record.title;
    leading.append(mark, title);
    const meta = make("span", "plugin-stage-meta");
    meta.textContent = formatTime(record.updated_at);
    row.append(leading, meta);
    const fixed = fixedCell(record);
    if (fixed) row.append(fixed);
    const actions = make("span", "pages-row-actions");
    if (folders.length) {
      const move = document.createElement("button");
      move.type = "button";
      move.className = "pages-row-act";
      move.dataset.pagesMove = record.id;
      move.setAttribute("aria-label", L("移到文件夹"));
      move.setAttribute("title", L("移到文件夹"));
      move.setAttribute("aria-haspopup", "true");
      move.setAttribute("aria-expanded", "false");
      move.innerHTML = ICON("folder");
      actions.append(move);
    }
    const star = document.createElement("button");
    star.type = "button";
    star.className = "pages-row-act pages-star" + (record.starred ? " is-on" : "");
    star.dataset.pagesStar = record.id;
    star.setAttribute("aria-label", record.starred ? L("取消收藏") : L("收藏"));
    star.innerHTML = ICON("star");
    actions.append(star);
    item.append(row, actions);
    return item;
  };
  const renderFold = (key, label, items, actions) => {
    const fold = make("details", "goal-collection-fold");
    fold.open = true;
    fold.dataset.folderId = key;
    const summary = document.createElement("summary");
    const caret = make("span", "goal-collection-caret");
    caret.setAttribute("aria-hidden", "true");
    caret.innerHTML = ICON("chevron-down");
    const strong = document.createElement("strong");
    strong.textContent = label;
    const small = document.createElement("small");
    small.textContent = String(items.length);
    summary.append(caret, strong, small);
    if (actions) summary.append(actions);
    if (key !== "starred") fold.dataset.pagesDrop = "folder";
    fold.append(summary);
    if (!items.length) {
      const vacant = make("p", "goal-collection-empty");
      vacant.textContent = L("还没有文档");
      fold.append(vacant);
    } else items.forEach((record) => fold.append(renderRow(record)));
    return fold;
  };
  const folderActions = (folder) => {
    const wrap = make("span", "pages-folder-actions");
    const add = document.createElement("button");
    add.type = "button";
    add.dataset.pagesFolderNew = folder.id;
    add.setAttribute("aria-label", L("在此新建"));
    add.innerHTML = ICON("plus");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.dataset.pagesFolderRename = folder.id;
    rename.setAttribute("aria-label", L("重命名文件夹"));
    rename.innerHTML = ICON("edit");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.pagesFolderDelete = folder.id;
    remove.setAttribute("aria-label", L("删除文件夹"));
    remove.innerHTML = ICON("x");
    wrap.append(add, rename, remove);
    return wrap;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const paintList = () => {
    closeMove();
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
    sel = record;
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    renderList();
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存"); statusEl.dataset.mwState = "saved";
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
      onComment: (markId) => { void commentOpen(markId); },
      onChange: () => { if (!filling) queueSave(); },
      onFocus: (focus) => { focusNow = focus; reportFocus(); },
      onTools: () => { publishTools(); landing.report(); },
      onScreen: reportFocus,
      openPanel: (panel) => (focusShown || !panel.node) && sendPanel(panel),
      translate: L,
      pages: () => records.map((item) => ({ id: item.id, title: item.title })),
      onOpenPage: (id) => {
        const record = records.find((item) => item.id === id);
        if (record) void openDocument(record).catch((error) => showNote(error.message || L("保存失败"), true));
      },
      runAi: async (input) => {
        if (!sel) throw new Error(L("文档请求失败"));
        const id = sel.id;
        const revision = editRev;
        if (saveTimer || dirty) await persist();
        if (!sel || sel.id !== id || editRev !== revision) throw new Error(L("文档已改变，请重新生成"));
        const result = await request("POST", pageUrl(id, "/ai"), { ...input, expected_version: sel.version });
        if (!sel || sel.id !== id || editRev !== revision) throw new Error(L("文档已改变，请重新生成"));
        return result;
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
  const draftOf = () => {
    if (!sel || unshowable) return null;
    return {
      id: sel.id,
      title: titleInput.value,
      body: editor && Editor ? Editor.getDoc(editor) : sel.body,
      version: editRev,
      server_version: sel.version,
    };
  };
  const storeDocument = (document) => {
    const index = records.findIndex((item) => item.id === document.id);
    if (index >= 0) records[index] = document;
    else records.unshift(document);
    renderList();
  };
  const adoptSaved = (draft, document) => {
    storeDocument(document);
    if (!sel || sel.id !== draft.id) return document;
    if (editRev !== draft.version || saveTimer) {
      sel = {
        ...sel,
        goal_id: document.goal_id,
        artifact_id: document.artifact_id,
        artifact_version: document.artifact_version,
        publication_pending: document.publication_pending,
        version: document.version,
        updated_at: document.updated_at,
      };
      return document;
    }
    sel = document;
    titleEl.textContent = document.title;
    statusEl.textContent = L("已保存"); statusEl.dataset.mwState = "saved";
    markSelected(document.id);
    syncEditorChrome();
    if (document.activeElement !== titleInput) titleInput.value = document.title;
    return document;
  };
  const enqueueSave = (draft, patch) => {
    const run = saveQueue.then(async () => {
      const payload = await request("POST", pageUrl(draft.id), {
        ...(patch || { title: draft.title, body: draft.body }),
        expected_version: sel && sel.id === draft.id ? sel.version : draft.server_version,
      });
      if (!payload.document || payload.document.id !== draft.id) throw new Error(L("文档请求失败"));
      if (!patch) savedByPerson(payload.document);
      return adoptSaved(draft, payload.document);
    });
    saveQueue = run.then(() => undefined, () => undefined);
    return run;
  };
  ${PAGES_BLANK_CLIENT_SCRIPT}
  const fillEditor = (record) => {
    editorEpoch += 1; const switching = Boolean(sel && record && sel.id !== record.id);
    const leaving = switching ? draftOf() : null;
    const left = switching ? blankLeaving() : null;
    const pending = Boolean(switching && (saveTimer || dirty));
    clearTimeout(saveTimer);
    saveTimer = 0;
    filling = true;
    sel = record;
    bench.setAttribute("data-expanded", "true");
    workspace.hidden = false; delete workspace.dataset.missing;
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存"); statusEl.dataset.mwState = "saved";
    titleInput.value = record.title;
    // A body this editor cannot show (written elsewhere in another structure) is not shown as an empty page: the next
    // keystroke would save that empty page over it. It stays read-only and unsaved until it is replaced or undone.
    unshowable = Boolean(record.body && Editor && Editor.canShow && !Editor.canShow(record.body));
    try {
      ensureEditor(unshowable ? Editor.emptyDoc() : record.body || (Editor && Editor.emptyDoc()));
    } finally {
      filling = false;
    }
    if (editor && editor.view) editor.view.setProps({ editable: () => !unshowable });
    titleInput.disabled = unshowable;
    markSelected(record.id);
    syncEditorChrome();
    showNote("", false);
    if (pending && leaving) {
      void enqueueSave(leaving).catch((error) => showNote(error.message || L("保存失败"), true));
    }
    void dropBlank(left);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    sel = null; editorEpoch += 1;
    syncEditorChrome();
    bench.setAttribute("data-expanded", "false");
    workspace.hidden = true; delete workspace.dataset.missing;
    closeMore();
    closeCreate();
    closeMove();
    els(".pages-slash, .pages-pop, .pages-block-handle, .pages-block-menu, .pages-block-ghost, .pages-drop-line").forEach((node) => { node.hidden = true; });
    sendPanel({ node: null });
  };`;
